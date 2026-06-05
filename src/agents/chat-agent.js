/**
 * chat-agent.js — arquitectura LLM-first
 *
 * El LLM (Claude) es el cerebro: clasifica intenciones, extrae entidades,
 * razona sobre el contexto y genera respuestas naturales.
 * Este archivo solo hace tres cosas:
 *   1. Gestionar la sesión (quién es el usuario, a qué UVA pertenece)
 *   2. Consultar la DB con los parámetros correctos
 *   3. Pasarle el contexto a Claude y devolver su respuesta
 */

import {
  generarRespuesta,
  extraerNombreConIA,
  extraerBarrioConIA,
  clasificarIntencion,
  expandirKeywordsConIA,
  llamadaConHerramientas,
  buildSystemPromptTools,
} from '../services/groq.js';

import {
  getProgramacion,
  getProgramacionPorFecha,
  getProgramacionPorFechas,
  buscarActividadesPorTema,
  guardarMensaje,
  getHistorialSesion,
  limpiarHistorialSesion,
} from '../services/supabase.js';

import { extraerBarrioDeTexto, resolverUVA } from './geo-agent.js';
import { BARRIOS_UVA, COMUNAS_UVA } from '../data/barrios-uva-map.js';
import { parsearAlcanceTemporal, hoyISO, formatearFechaEspanol, sumarDias, nombreDia } from '../utils/date-helper.js';
import { getSession, setSession } from '../utils/session-cache.js';
import { getAgendaMD, setAgendaMD } from '../utils/agenda-cache.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

export const UVA_NOMBRES = Object.freeze([
  'UVA de La Esperanza',
  'UVA Nuevo Amanecer',
  'UVA de La Cordialidad',
  'UVA de La Alegría',
  'UVA de La Armonía',
  'UVA de Los Sueños',
  'UVA Los Guayacanes',
  'UVA El Encanto',
  'UVA de La Imaginación',
  'UVA de La Libertad',
  'UVA Ilusión Verde',
  'UVA Mirador de San Cristóbal',
  'UVA Aguas Claras',
  'UVA San Fernando',
]);

export const ESPACIOS_COMPLEMENTARIOS = Object.freeze([
  'Biblioteca EPM',
  'Museo del Agua',
  'Parque de los Deseos',
]);

export const RECINTOS_EPM = Object.freeze([...UVA_NOMBRES, ...ESPACIOS_COMPLEMENTARIOS]);

const BARRIOS_FLAT = { ...BARRIOS_UVA, ...COMUNAS_UVA };
const LOG_PREFIX = '[ChatAgent]';
const EPM_LINK = process.env.EPM_PROGRAMACION_URL || 'https://www.grupo-epm.com/site/fundacionepm/programacion/';

// Auto-scraping
let _ultimoScrapingTrigger = 0;
const SCRAPING_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const AUTO_SCRAPING_ENABLED = String(process.env.ENABLE_AUTO_SCRAPING || 'false').toLowerCase() === 'true';

// Alias de UVAs (normalizado sin tildes → nombre canónico)
const UVA_ALIASES = {
  'uva la esperanza': 'UVA de La Esperanza', 'uva de la esperanza': 'UVA de La Esperanza',
  'la esperanza': 'UVA de La Esperanza', 'uva nuevo amanecer': 'UVA Nuevo Amanecer',
  'nuevo amanecer': 'UVA Nuevo Amanecer', 'uva la cordialidad': 'UVA de La Cordialidad',
  'uva de la cordialidad': 'UVA de La Cordialidad', 'la cordialidad': 'UVA de La Cordialidad',
  'uva la alegria': 'UVA de La Alegría', 'uva de la alegria': 'UVA de La Alegría',
  'la alegria': 'UVA de La Alegría', 'uva la armonia': 'UVA de La Armonía',
  'uva de la armonia': 'UVA de La Armonía', 'la armonia': 'UVA de La Armonía',
  'uva los suenos': 'UVA de Los Sueños', 'uva de los suenos': 'UVA de Los Sueños',
  'los suenos': 'UVA de Los Sueños', 'uva los guayacanes': 'UVA Los Guayacanes',
  'los guayacanes': 'UVA Los Guayacanes', 'uva el encanto': 'UVA El Encanto',
  'el encanto': 'UVA El Encanto', 'uva la imaginacion': 'UVA de La Imaginación',
  'uva de la imaginacion': 'UVA de La Imaginación', 'la imaginacion': 'UVA de La Imaginación',
  'uva la libertad': 'UVA de La Libertad', 'uva de la libertad': 'UVA de La Libertad',
  'la libertad': 'UVA de La Libertad', 'uva ilusion verde': 'UVA Ilusión Verde',
  'ilusion verde': 'UVA Ilusión Verde', 'uva mirador de san cristobal': 'UVA Mirador de San Cristóbal',
  'uva san cristobal': 'UVA Mirador de San Cristóbal', 'san cristobal': 'UVA Mirador de San Cristóbal',
  'uva aguas claras': 'UVA Aguas Claras', 'aguas claras': 'UVA Aguas Claras',
  'uva san fernando': 'UVA San Fernando', 'san fernando': 'UVA San Fernando',
  'biblioteca epm': 'Biblioteca EPM', 'biblioteca': 'Biblioteca EPM',
  'museo del agua': 'Museo del Agua', 'museo agua': 'Museo del Agua',
  'museo epm': 'Museo del Agua', 'pies descalzos': 'Museo del Agua',
  'parque pies descalzos': 'Museo del Agua', 'parque descalzos': 'Museo del Agua',
  'parque de los deseos': 'Parque de los Deseos', 'parque deseos': 'Parque de los Deseos',
  'los deseos': 'Parque de los Deseos', 'deseos': 'Parque de los Deseos',
};

// ─── Helpers de sesión ────────────────────────────────────────────────────────

function _esRecintoEPMValido(nombre) {
  return typeof nombre === 'string' && RECINTOS_EPM.includes(nombre);
}

function _esUVAValida(nombre) {
  if (!nombre || typeof nombre !== 'string') return false;
  const n = nombre.trim();
  if (!n.startsWith('UVA ') && !ESPACIOS_COMPLEMENTARIOS.includes(n)) return false;
  if (/\bprogramaci[oó]n\b/i.test(n)) return false;
  return n.length >= 4;
}

function _resolverUVADesdeTexto(texto) {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (UVA_ALIASES[t]) return UVA_ALIASES[t];
  const geo = resolverUVA(t);
  return geo?.uva || null;
}

// ─── Procesador principal (LLM-first) ────────────────────────────────────────

/**
 * Procesa un mensaje y retorna la respuesta del asistente.
 */
export async function procesarMensaje({ sessionId, mensaje }) {
  log(`Sesión ${sessionId} | "${mensaje.slice(0, 80)}"`);

  const session = await getSession(sessionId);
  if (!Array.isArray(session.historial)) session.historial = [];

  // Sanity check: recinto inválido en sesión (p.ej. tras un despliegue)
  if (session.uva && !_esRecintoEPMValido(session.uva)) {
    session.uva = null; session.barrio = null;
    setSession(sessionId, { uva: null, barrio: null });
    limpiarHistorialSesion(sessionId).catch(() => {});
  }

  // ── 1. Clasificar intención con Claude ────────────────────────────────────
  let intent = 'normal';
  let intentKeywords = [];
  try {
    const clf = await clasificarIntencion(mensaje);
    intent = clf.intent;
    intentKeywords = clf.keywords || [];
    log(`Intent: ${intent} | keywords: [${intentKeywords.join(', ')}]`);
  } catch (err) {
    log(`WARN: clasificarIntencion falló: ${err.message}`);
  }

  // ── 2. Reset ──────────────────────────────────────────────────────────────
  if (intent === 'reset') {
    Object.assign(session, { nombre: null, barrio: null, uva: null, historial: [] });
    setSession(sessionId, { nombre: null, barrio: null, uva: null, historial: [] });
    await limpiarHistorialSesion(sessionId).catch(() => {});
    const respuesta = await generarRespuesta([], mensaje,
      '[INSTRUCCIÓN: El usuario reinició la conversación. Salúdalo cálidamente, pregunta su nombre y en qué barrio, UVA o espacio EPM quiere consultar la programación.]',
      null, null);
    _guardarHistorialAsync(sessionId, mensaje, respuesta, null, null);
    return { respuesta, uva: null, barrio: null, fecha: hoyISO() };
  }

  // ── 3. Cambio de UVA ──────────────────────────────────────────────────────
  if (intent === 'cambio_uva') {
    session.barrio = null; session.uva = null; session.historial = [];
    setSession(sessionId, { barrio: null, uva: null, historial: [] });
    limpiarHistorialSesion(sessionId).catch(() => {});
    const respuesta = await generarRespuesta([], mensaje,
      '[INSTRUCCIÓN: El usuario quiere consultar otra UVA o espacio EPM. Pregúntale amablemente qué barrio, UVA o espacio desea consultar ahora.]',
      session.nombre, null);
    _guardarHistorialAsync(sessionId, mensaje, respuesta, null, null);
    return { respuesta, uva: null, barrio: null, fecha: hoyISO() };
  }

  // ── 4. Extraer nombre si no se conoce (Claude) ───────────────────────────
  if (!session.nombre) {
    const nombre = await extraerNombreConIA(mensaje).catch(() => null);
    if (nombre) { session.nombre = nombre; setSession(sessionId, { nombre }); log(`Nombre: ${nombre}`); }
  }

  // ── 5. Resolver UVA si no se conoce ──────────────────────────────────────
  if (!session.uva && intent !== 'tematica') {
    // Intento 1: detección rápida local
    let barrio = extraerBarrioDeTexto(mensaje);
    // Intento 2: UVA o alias directo en el mensaje
    if (!barrio) {
      const uvaDirect = _resolverUVADesdeTexto(mensaje);
      if (uvaDirect) { barrio = uvaDirect; }
    }
    // Intento 3: Claude extrae el barrio si los métodos locales fallan
    if (!barrio) {
      barrio = await extraerBarrioConIA(mensaje, Object.keys(BARRIOS_FLAT)).catch(() => null);
    }
    if (barrio) {
      const geo = _esRecintoEPMValido(barrio) ? { uva: barrio, barrioNormalizado: barrio } : resolverUVA(barrio);
      if (geo?.uva) {
        session.uva = geo.uva; session.barrio = geo.barrioNormalizado;
        setSession(sessionId, { uva: geo.uva, barrio: geo.barrioNormalizado });
        log(`UVA resuelta: ${geo.uva}`);
      }
    }
  }

  // ── 6. Claude con herramientas — consulta Supabase y genera respuesta ─────
  const historialDB = await getHistorialSesion(sessionId, 25).catch(() => []);
  const historial = [...session.historial, ...historialDB].slice(-25);

  let respuesta;
  try {
    respuesta = await _generarConHerramientas(mensaje, session, historial);
    log(`Tool call OK: "${respuesta.slice(0, 80)}..."`);
  } catch (err) {
    log(`Error _generarConHerramientas: ${err.message}`);
    respuesta = _sinDatos(session.uva || 'la UVA');
  }

  _guardarHistorialAsync(sessionId, mensaje, respuesta, session.barrio, session.uva);
  _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
  return { respuesta, uva: session.uva, barrio: session.barrio, fecha: hoyISO() };
}

// ─── Mapa de sinónimos temáticos ─────────────────────────────────────────────

const SINONIMOS_TEMATICOS = {
  'robotica':        ['robot', 'robotica', 'electronica', 'automata', 'stem', 'led', 'circuito', 'mecanica', 'tecnologia'],
  'robot':           ['robot', 'robotica', 'electronica', 'automata', 'stem', 'circuito'],
  'tecnologia':      ['tecnologia', 'digital', 'computacion', 'informatica', 'dispositivos', 'celular', 'movil', 'programacion'],
  'informatica':     ['informatica', 'computacion', 'digital', 'programacion', 'tecnologia'],
  'digital':         ['digital', 'tecnologia', 'computacion', 'celular', 'dispositivos', 'movil'],
  'computacion':     ['computacion', 'informatica', 'digital', 'programacion'],
  'danza':           ['danza', 'baile', 'folclor', 'urbana', 'coreografia', 'movimiento'],
  'baile':           ['baile', 'danza', 'folclor', 'urbana', 'salsa', 'ritmo'],
  'yoga':            ['yoga', 'meditacion', 'bienestar', 'pilates', 'relajacion', 'bien-estar'],
  'bienestar':       ['bienestar', 'yoga', 'meditacion', 'salud', 'bien-estar'],
  'cocina':          ['cocina', 'gastronomia', 'culinaria', 'recetas', 'hornear', 'alimentacion', 'saludable'],
  'gastronomia':     ['gastronomia', 'cocina', 'culinaria', 'recetas', 'alimentacion'],
  'arte':            ['arte', 'pintura', 'dibujo', 'ceramica', 'creativo', 'crearte', 'plastica', 'artesanal'],
  'pintura':         ['pintura', 'dibujo', 'arte', 'acuarela', 'pastel', 'ceramica'],
  'manualidades':    ['manualidad', 'tejido', 'crochet', 'macrame', 'bordado', 'artesanal', 'mostacilla', 'bisuteria', 'peyote', 'amigurumi', 'muñequeria'],
  'tejido':          ['tejido', 'crochet', 'macrame', 'bordado', 'hilo', 'aguja', 'tejer', 'lana', 'ganchillo'],
  'crochet':         ['crochet', 'tejido', 'macrame', 'hilo', 'lana', 'amigurumi', 'ganchillo'],
  'macrame':         ['macrame', 'tejido', 'hilo', 'crochet', 'nudos'],
  'bordado':         ['bordado', 'tejido', 'hilo', 'tela', 'canvas'],
  'musica':          ['musica', 'canto', 'coro', 'guitarra', 'piano', 'banda', 'percusion', 'instrumento'],
  'teatro':          ['teatro', 'drama', 'actuacion', 'escena', 'dramatizacion'],
  'lectura':         ['lectura', 'libro', 'cuento', 'literatura', 'cuentos'],
  'agroecologia':    ['agroecologia', 'huerta', 'ecologia', 'biodiversidad', 'ambiente', 'sembrar', 'plantas', 'jardineria'],
  'huerta':          ['huerta', 'agroecologia', 'jardineria', 'sembrar', 'plantas', 'ecologia'],
  'ecologia':        ['ecologia', 'agroecologia', 'biodiversidad', 'ambiente', 'naturaleza'],
  'biodiversidad':   ['biodiversidad', 'ecologia', 'naturaleza', 'fauna', 'flora'],
  'deporte':         ['deporte', 'actividad fisica', 'atletismo', 'futbol', 'voleibol', 'aerobico'],
  'ceramica':        ['ceramica', 'arcilla', 'barro', 'modelado', 'alfareria', 'porcelanicron'],
  'arcilla':         ['arcilla', 'ceramica', 'barro', 'modelado', 'plastilina'],
  'plastilina':      ['plastilina', 'bioplastilina', 'arcilla', 'modelado'],
  'mostacilla':      ['mostacilla', 'bisuteria', 'manilla', 'peyote', 'tejido'],
  'bisuteria':       ['bisuteria', 'mostacilla', 'manilla', 'joyeria'],
  'origami':         ['origami', 'papiroflexia', 'papel'],
  'fotografia':      ['fotografia', 'foto', 'celular', 'imagen'],
  'astronomia':      ['astronomia', 'telescopio', 'estrellas', 'planetas', 'universo'],
  'natacion':        ['natacion', 'piscina', 'agua', 'nadar'],
  'amigurumi':       ['amigurumi', 'crochet', 'tejido', 'muñeco'],
  'muñequeria':      ['muñequeria', 'muñeco', 'tela', 'artesanal'],
};

const _norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function _expandirKeywords(keywords) {
  const expandido = new Set();
  for (const kw of keywords) {
    const n = _norm(kw);
    expandido.add(n);
    const syns = SINONIMOS_TEMATICOS[n];
    if (syns) syns.forEach(s => expandido.add(s));
    // Stem básico: primeras letras suficientes para ser selectivo
    if (n.length >= 6) expandido.add(n.slice(0, Math.max(5, n.length - 2)));
  }
  return [...expandido];
}

// ─── Tool Use: definición de herramientas y loop agentico ──────────────────

const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'obtener_agenda',
      description: 'Obtiene la programación completa de una UVA o espacio EPM para una fecha. Úsala cuando el usuario pregunta qué hay en su UVA o en cualquier espacio EPM en una fecha.',
      parameters: {
        type: 'object',
        properties: {
          uva: { type: 'string', description: 'Nombre exacto del espacio. Ej: "UVA de La Armonía", "UVA El Encanto", "Museo del Agua", "Biblioteca EPM", "Parque de los Deseos"' },
          fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Usa la fecha de hoy si no se especifica.' },
        },
        required: ['uva', 'fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_actividades',
      description: 'Busca un tipo de actividad en TODAS las UVAs y espacios EPM. Úsala cuando el usuario pregunta por yoga, danza, robótica, cocina, u otro tema específico sin importar la UVA.',
      parameters: {
        type: 'object',
        properties: {
          keywords: { type: 'array', items: { type: 'string' }, description: 'Palabras clave del tema. Ej: ["yoga"], ["danza", "baile"], ["robotica", "robot"]' },
          fecha_desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
          fecha_hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD (máx 60 días)' },
        },
        required: ['keywords', 'fecha_desde', 'fecha_hasta'],
      },
    },
  },
];

async function _ejecutarHerramienta(nombre, args) {
  try {
    if (nombre === 'obtener_agenda') {
      try {
        const actividades = await getProgramacion(args.uva, args.fecha);
        if (!actividades?.length) {
          return `No hay actividades programadas en ${args.uva} para ${args.fecha}.`;
        }
        let datos = `DATOS REALES — ${args.uva} — ${args.fecha} (${actividades.length} actividades):\n`;
        for (const act of actividades) {
          const hi = (act.hora_inicio || '?').slice(0, 5);
          const hf = (act.hora_fin   || '?').slice(0, 5);
          datos += `- ${hi}–${hf}: ${act.actividad}`;
          if (act.edad_recomendada) datos += ` (Edad: ${act.edad_recomendada})`;
          datos += '\n';
        }
        return datos;
      } catch (err) {
        return `Error al consultar la agenda de ${args.uva}.`;
      }
    }
    if (nombre === 'buscar_actividades') {
      const kwExpanded = _expandirKeywords(args.keywords || []);
      log(`Keywords expandidas: [${kwExpanded.join(', ')}]`);
      const resultados = await buscarActividadesPorTema(kwExpanded, args.fecha_desde, args.fecha_hasta, [...RECINTOS_EPM])
        .catch(() => []);
      if (!resultados.length) return `No se encontraron actividades de ese tipo entre ${args.fecha_desde} y ${args.fecha_hasta}.`;
      return _formatearResultadosHerramienta(resultados);
    }
    return 'Herramienta no reconocida.';
  } catch (err) {
    log(`Error ejecutando herramienta ${nombre}: ${err.message}`);
    return 'Error al consultar los datos.';
  }
}

function _formatearResultadosHerramienta(resultados) {
  const _fechaCorta = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dSem = ['dom','lun','mar','mié','jue','vie','sáb'][dt.getDay()];
    const mNom = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1];
    return `${dSem} ${d} ${mNom}`;
  };
  const porUVA = new Map();
  for (const act of resultados) {
    if (!porUVA.has(act.uva_nombre)) porUVA.set(act.uva_nombre, new Map());
    const key = `${act.actividad}|||${act.hora_inicio}|||${act.hora_fin}`;
    const actMap = porUVA.get(act.uva_nombre);
    if (!actMap.has(key)) actMap.set(key, { ...act, fechas: [] });
    actMap.get(key).fechas.push(act.fecha);
  }
  let texto = '';
  for (const [uva, actMap] of porUVA) {
    texto += `\n${uva}:\n`;
    for (const act of actMap.values()) {
      const hi = (act.hora_inicio || '?').slice(0, 5);
      const hf = (act.hora_fin   || '?').slice(0, 5);
      texto += `  - ${act.actividad} | ${act.fechas.map(_fechaCorta).join(', ')} | ${hi}\u2013${hf}`;
      if (act.rango_edad) texto += ` | ${act.rango_edad}`;
      texto += '\n';
    }
  }
  return texto.trim();
}

async function _generarConHerramientas(mensaje, session, historial) {
  const hoy = hoyISO();
  const messages = [
    { role: 'system', content: buildSystemPromptTools(session.nombre, session.uva, hoy) },
    ...historial.map((t) => ({ role: t.rol, content: t.mensaje })),
    { role: 'user', content: mensaje },
  ];

  for (let iter = 0; iter < 4; iter++) {
    // Primera llamada: forzar uso de herramienta (tool_choice="any") para garantizar
    // que el modelo consulte la DB antes de responder, nunca dé respuesta sin datos reales.
    const forceTools = iter === 0;
    const response = await llamadaConHerramientas(messages, HERRAMIENTAS, forceTools);
    const choice = response.choices[0];

    if (choice.finish_reason !== 'tool_calls') {
      return choice.message.content || 'Lo siento, no pude generar una respuesta.';
    }

    messages.push(choice.message);

    for (const call of choice.message.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      log(`Tool: ${call.function.name}(${JSON.stringify(args)})`);
      const resultado = await _ejecutarHerramienta(call.function.name, args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: resultado });
    }
  }

  return 'Lo siento, no pude procesar tu consulta en este momento.';
}
// ─── Contexto temático (búsqueda transversal) ─────────────────────────────────

async function _contextoTematico(intentKeywords, mensaje) {
  const hoy = hoyISO();
  const fin = sumarDias(hoy, 90);

  // Primero intentar con expansión local de sinónimos (más rápido, sin API)
  const kwLocal = _expandirKeywords(intentKeywords);
  log(`Keywords expandidas (local): [${kwLocal.join(', ')}]`);
  let resultados = await buscarActividadesPorTema(kwLocal, hoy, fin, [...RECINTOS_EPM]).catch(() => []);

  if (!resultados.length) {
    // Fallback: expansión semántica con IA
    const expanded = await expandirKeywordsConIA(intentKeywords).catch(() => []);
    log(`Keywords expandidas (IA): [${expanded.join(', ')}]`);
    if (expanded.length) {
      const allKw = [...new Set([...kwLocal, ..._expandirKeywords(expanded)])];
      resultados = await buscarActividadesPorTema(allKw, hoy, fin, [...RECINTOS_EPM]).catch(() => []);
    }
  }

  if (!resultados.length) {
    const tema = intentKeywords.join(', ');
    return `[INSTRUCCIÓN: No se encontraron actividades de "${tema}" en ningún recinto EPM en los próximos 3 meses. Informa esto honestamente al usuario y proporciona el link oficial: ${EPM_LINK}]`;
  }

  // Agrupar por recinto y actividad
  const _fechaCorta = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dSem = ['dom','lun','mar','mié','jue','vie','sáb'][dt.getDay()];
    const mNom = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1];
    return `${dSem} ${d} ${mNom}`;
  };

  const porUVA = new Map();
  for (const act of resultados) {
    if (!porUVA.has(act.uva_nombre)) porUVA.set(act.uva_nombre, new Map());
    const key = `${act.actividad}|||${act.hora_inicio}|||${act.hora_fin}`;
    const actMap = porUVA.get(act.uva_nombre);
    if (!actMap.has(key)) actMap.set(key, { ...act, fechas: [] });
    actMap.get(key).fechas.push(act.fecha);
  }

  let ctx = 'BÚSQUEDA TRANSVERSAL — actividades encontradas en múltiples recintos EPM:\n\n';
  for (const [uva, actMap] of porUVA) {
    ctx += `${uva}:\n`;
    for (const act of actMap.values()) {
      const hi = (act.hora_inicio || '?').slice(0, 5);
      const hf = (act.hora_fin   || '?').slice(0, 5);
      ctx += `  - ${act.actividad} | ${act.fechas.map(_fechaCorta).join(', ')} | ${hi}–${hf}`;
      if (act.edad_recomendada) ctx += ` | ${act.edad_recomendada}`;
      ctx += '\n';
    }
    ctx += '\n';
  }
  return ctx;
}

// ─── Agenda Markdown: caché → Supabase ───────────────────────────────────────

async function _obtenerAgendaMD(uvaNombre, alcanceTemporal) {
  const esSemana = alcanceTemporal?.modo === 'semana';
  const fecha = alcanceTemporal?.fechaInicio || hoyISO();

  if (!_esRecintoEPMValido(uvaNombre)) {
    log(`ERROR: agenda solicitada para recinto inválido "${uvaNombre}"`);
    return _sinDatos(uvaNombre);
  }

  // 1. Caché en memoria
  const cached = getAgendaMD(uvaNombre, fecha);
  if (cached) { log('Agenda desde caché ✓'); return cached; }

  if (esSemana) {
    const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(fecha, i));
    const todas = await getProgramacionPorFechas(fechas).catch(() => []);
    const actUva = (todas || []).filter(a => a.uva_nombre === uvaNombre);
    if (actUva.length > 0) return _actividadesAMDSemana(uvaNombre, fechas, actUva);
    return `_No encontré programación para *${uvaNombre}* en la semana del ${formatearFechaEspanol(fecha)} al ${formatearFechaEspanol(sumarDias(fecha, 6))}.\n\n📎 Consulta la agenda oficial:\n${EPM_LINK}_`;
  }

  // 2. Supabase
  try {
    const actividades = await getProgramacion(uvaNombre, fecha);
    if (actividades?.length > 0) {
      const md = _actividadesAMD(uvaNombre, fecha, actividades);
      setAgendaMD(uvaNombre, fecha, md);
      log(`Agenda Supabase: ${actividades.length} actividades`);
      return md;
    }

    // Sin actividades hoy → buscar próximas
    const proximas = await _proximasActividadesUVA(uvaNombre, fecha, 4);
    if (proximas.length > 0) {
      const lista = proximas.map(a => {
        const hi = (a.hora_inicio || '?').slice(0, 5);
        const hf = (a.hora_fin   || '?').slice(0, 5);
        return `- ${formatearFechaEspanol(a.fecha)} ${hi}–${hf}: ${a.actividad}`;
      }).join('\n');
      return `_Hoy no hay actividades programadas en *${uvaNombre}* (${formatearFechaEspanol(fecha)}).\n\n📌 Próximas actividades:\n${lista}\n\n📎 Agenda oficial:\n${EPM_LINK}_`;
    }

    // Sin datos — sugerir otras UVAs con programación
    const delDia = await getProgramacionPorFecha(fecha).catch(() => []);
    const uvasDisponibles = [...new Set((delDia || []).map(a => a.uva_nombre).filter(_esUVAValida))];
    const sugerencia = uvasDisponibles.length > 0
      ? `\n\n_UVAs con programación hoy:_\n- ${uvasDisponibles.slice(0, 6).join('\n- ')}`
      : '';
    _dispararScrapingBackground(uvaNombre);
    return `_La programación de *${uvaNombre}* para hoy no está cargada aún.\n📎 Agenda oficial:\n${EPM_LINK}_${sugerencia}`;
  } catch (err) {
    log(`Error agenda: ${err.message}`);
    return `_No pude acceder a la programación ahora.\n📎 Consulte la agenda oficial:\n${EPM_LINK}_`;
  }
}

async function _proximasActividadesUVA(uvaNombre, fechaDesde, limite = 4) {
  const base = new Date(`${fechaDesde}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  const fechas = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i); return d.toISOString().slice(0, 10);
  });
  const todas = await getProgramacionPorFechas(fechas).catch(() => []);
  return (todas || [])
    .filter(a => a.uva_nombre === uvaNombre)
    .sort((a, b) => `${a.fecha} ${a.hora_inicio||'99:99'}`.localeCompare(`${b.fecha} ${b.hora_inicio||'99:99'}`))
    .slice(0, limite);
}

// ─── Formateo Markdown ────────────────────────────────────────────────────────

function _actividadesAMD(uvaNombre, fecha, actividades) {
  const fechaFmt = formatearFechaEspanol(fecha);
  let md = `🍇 *${uvaNombre}*\n📅 ${fechaFmt}\n`;
  for (const act of actividades) {
    const hi = (act.hora_inicio || '?').slice(0, 5);
    const hf = (act.hora_fin   || '?').slice(0, 5);
    const em = _emoji(act.actividad);
    md += `${em} ${hi}–${hf} — *${act.actividad}*`;
    if (act.descripcion)      md += ` — ${act.descripcion}`;
    if (act.edad_recomendada) md += ` (👥 ${act.edad_recomendada})`;
    md += '\n';
  }
  md += '\n[FIN_ACTIVIDADES]';
  return md;
}

function _actividadesAMDSemana(uvaNombre, fechas, actividades) {
  let md = `🍇 *${uvaNombre}*\n📅 Semana del ${formatearFechaEspanol(fechas[0])} al ${formatearFechaEspanol(fechas[6])}\n`;
  const grupos = new Map(fechas.map(f => [f, []]));
  for (const act of actividades) {
    if (grupos.has(act.fecha)) grupos.get(act.fecha).push(act);
  }
  for (const fecha of fechas) {
    const lista = grupos.get(fecha) || [];
    md += `\n📆 *${nombreDia(fecha)}*\n`;
    if (!lista.length) { md += `Sin programación cargada\n`; continue; }
    for (const act of lista) {
      const hi = (act.hora_inicio || '?').slice(0, 5);
      const hf = (act.hora_fin   || '?').slice(0, 5);
      md += `${_emoji(act.actividad)} ${hi}–${hf} — *${act.actividad}*`;
      if (act.descripcion)      md += ` — ${act.descripcion}`;
      if (act.edad_recomendada) md += ` (👥 ${act.edad_recomendada})`;
      md += '\n';
    }
  }
  md += '\n[FIN_ACTIVIDADES]';
  return md;
}

function _emoji(actividad = '') {
  const a = actividad.toLowerCase();
  if (/danza|baile|ballet|salsa|tango|folclor/.test(a))              return '💃';
  if (/fútbol|futbol|deporte|atletis|nataci|voleibol|aerobic/.test(a)) return '⚽';
  if (/teatro|actuaci|drama/.test(a))                                return '🎭';
  if (/música|musica|canto|coro|guitar|piano|banda|percusi/.test(a)) return '🎵';
  if (/pintura|dibujo|arte|manualidad|cerámica|ceramica/.test(a))    return '🎨';
  if (/yoga|meditaci|bienestar|relajaci/.test(a))                    return '🧘';
  if (/lectura|libro|cuento|literatura/.test(a))                     return '📚';
  if (/cocina|gastronom/.test(a))                                    return '🍳';
  if (/infantil|niños|niñas|bebé|jardín/.test(a))                    return '🧒';
  if (/adulto mayor|abuel/.test(a))                                  return '👴';
  if (/ecolog|natura|huerta|agroecol/.test(a))                       return '🌿';
  if (/tecno|computa|digital|informát|celular/.test(a))              return '💻';
  if (/cine|película/.test(a))                                       return '🎬';
  if (/parque|deseos|pies descalzos|astronom|telescopio/.test(a))    return '🌟';
  return '✨';
}

function _sinDatos(uva) {
  const uvaStr = uva ? ` de *${uva}*` : '';
  return `No tengo la programación actual${uvaStr}. 📎 Consulte la agenda oficial acá:\n${EPM_LINK}`;
}

// ─── Scraping background ──────────────────────────────────────────────────────

function _dispararScrapingBackground(uvaNombre) {
  if (!AUTO_SCRAPING_ENABLED) return;
  const ahora = Date.now();
  if (ahora - _ultimoScrapingTrigger < SCRAPING_COOLDOWN_MS) return;
  _ultimoScrapingTrigger = ahora;
  import('./scheduler-agent.js')
    .then(m => m.ejecutarCicloCompleto())
    .then(r => log(`Scraping completado: ${r.total} actividades`))
    .catch(e => log(`Scraping error: ${e.message}`));
}

// ─── Historial y sesión ───────────────────────────────────────────────────────

function _guardarHistorialAsync(sessionId, msgUsuario, msgBot, barrio, uva) {
  Promise.all([
    guardarMensaje({ sessionId, rol: 'user',      mensaje: msgUsuario, barrioDetectado: barrio, uvaAsignada: uva }),
    guardarMensaje({ sessionId, rol: 'assistant', mensaje: msgBot,     barrioDetectado: barrio, uvaAsignada: uva }),
  ]).catch(err => log(`Advertencia historial: ${err.message}`));
}

function _actualizarVentanaContexto(sessionId, session, mensajeUsuario, mensajeBot) {
  const prev = Array.isArray(session.historial) ? session.historial : [];
  const next = [...prev, { rol: 'user', mensaje: mensajeUsuario }, { rol: 'assistant', mensaje: mensajeBot }].slice(-12);
  session.historial = next;
  setSession(sessionId, { historial: next });
}

function log(msg) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${msg}`);
}

export default { procesarMensaje };
