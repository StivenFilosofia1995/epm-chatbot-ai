/**
 * chat-agent.js
 * Agente conversacional con máquina de estados:
 *   'saludo' → captura nombre + barrio sin llamar a Groq (0 tokens)
 *   'activo' → responde con agenda Markdown compacta (tokens mínimos)
 *
 * Optimizaciones aplicadas:
 *  - Session cache Redis-style: sin DB en mensajes frecuentes
 *  - NER barrio en Python (difflib, stdlib): sin tokens Groq para detección
 *  - Agenda en Markdown compacto: ~70% menos tokens que JSON crudo
 *  - Historial guardado async: no bloquea la respuesta al usuario
 */

import { generarRespuesta } from '../services/groq.js';
import {
  getProgramacion,
  getProgramacionPorFecha,
  getProgramacionPorFechas,
  buscarActividadesPorTema,
  guardarMensaje,
  getHistorialSesion,
  limpiarHistorialSesion,
} from '../services/supabase.js';
import { extraerBarrioDeTexto } from './geo-agent.js';
import { BARRIOS_UVA, COMUNAS_UVA } from '../data/barrios-uva-map.js';
import { parsearAlcanceTemporal, hoyISO, formatearFechaEspanol, sumarDias, nombreDia } from '../utils/date-helper.js';
import { getSession, setSession } from '../utils/session-cache.js';
import { getAgendaMD, setAgendaMD } from '../utils/agenda-cache.js';
import { callPython } from '../utils/python-bridge.js';

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

/** Todos los recintos EPM con programación (UVAs + espacios complementarios) */
export const RECINTOS_EPM = Object.freeze([
  ...UVA_NOMBRES,
  'Biblioteca EPM',
  'Museo del Agua',
]);

const MUNICIPIOS_SIN_COBERTURA = Object.freeze([
  'envigado',
  'sabaneta',
  'la estrella',
  'caldas',
  'copacabana',
  'girardota',
  'barbosa',
  'rionegro',
  'marinilla',
  'guarne',
  'medellin centro',
  'laureles',
  'el estadio',
]);

function _esUVACanonica(nombre) {
  return typeof nombre === 'string' && UVA_NOMBRES.includes(nombre);
}

// Auto-trigger de scraping: sólo una vez cada 2 h para no saturar
let _ultimoScrapingTrigger = 0;
const SCRAPING_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const AUTO_SCRAPING_ENABLED = String(process.env.ENABLE_AUTO_SCRAPING || 'false').toLowerCase() === 'true';

const LOG_PREFIX = '[ChatAgent]';
const BARRIOS_FLAT = { ...BARRIOS_UVA, ...COMUNAS_UVA };
const UVA_ALIASES = {

  // ── Comuna 1 — Popular ───────────────────────────────────────────
  'uva la esperanza':              'UVA de La Esperanza',
  'uva de la esperanza':           'UVA de La Esperanza',
  'la esperanza':                  'UVA de La Esperanza',
  'uva popular':                   'UVA de La Esperanza',
  'uva san pablo':                 'UVA de La Esperanza',
  'uva nuevo amanecer':            'UVA Nuevo Amanecer',
  'nuevo amanecer':                'UVA Nuevo Amanecer',
  'uva la avanzada':               'UVA Nuevo Amanecer',
  'uva la cordialidad':            'UVA de La Cordialidad',
  'uva de la cordialidad':         'UVA de La Cordialidad',
  'la cordialidad':                'UVA de La Cordialidad',
  'uva santo domingo':             'UVA de La Cordialidad',
  'uva santo domingo savio':       'UVA de La Cordialidad',

  // ── Comuna 2 — Santa Cruz ────────────────────────────────────────
  'uva la alegria':                'UVA de La Alegría',
  'uva de la alegria':             'UVA de La Alegría',
  'la alegria':                    'UVA de La Alegría',
  'uva santa cruz':                'UVA de La Alegría',
  'uva la armonia':                'UVA de La Armonía',
  'uva de la armonia':             'UVA de La Armonía',
  'la armonia':                    'UVA de La Armonía',
  'uva villa del socorro':         'UVA de La Armonía',

  // ── Comuna 3 — Manrique ──────────────────────────────────────────
  'uva los suenos':                'UVA de Los Sueños',
  'uva de los suenos':             'UVA de Los Sueños',
  'los suenos':                    'UVA de Los Sueños',
  'uva manrique':                  'UVA de Los Sueños',
  'uva versalles':                 'UVA de Los Sueños',
  'uva los guayacanes':            'UVA Los Guayacanes',
  'los guayacanes':                'UVA Los Guayacanes',
  'uva cucaracho':                 'UVA Los Guayacanes',
  'uva manrique oriental':         'UVA Los Guayacanes',

  // ── Comunas 5+6 — Castilla / Doce de Octubre ─────────────────────
  'uva el encanto':                'UVA El Encanto',
  'el encanto':                    'UVA El Encanto',
  'uva castilla':                  'UVA El Encanto',
  'uva doce de octubre':           'UVA El Encanto',
  'uva 12 de octubre':             'UVA El Encanto',
  'uva santander':                 'UVA El Encanto',
  'uva robledo':                   'UVA El Encanto',

  // ── Comuna 8 — Villa Hermosa ─────────────────────────────────────
  'uva la imaginacion':            'UVA de La Imaginación',
  'uva de la imaginacion':         'UVA de La Imaginación',
  'la imaginacion':                'UVA de La Imaginación',
  'uva villa hermosa':             'UVA de La Imaginación',
  'uva san miguel':                'UVA de La Imaginación',
  'uva boston':                    'UVA de La Imaginación',
  'uva la libertad':               'UVA de La Libertad',
  'uva de la libertad':            'UVA de La Libertad',
  'la libertad':                   'UVA de La Libertad',
  'uva el pinal':                  'UVA de La Libertad',
  'uva villatina':                 'UVA de La Libertad',
  'uva sol de oriente':            'UVA de La Libertad',

  // ── Comuna 14 — El Poblado ───────────────────────────────────────
  'uva ilusion verde':             'UVA Ilusión Verde',
  'uva ilusión verde':             'UVA Ilusión Verde',
  'ilusion verde':                 'UVA Ilusión Verde',
  'ilusión verde':                 'UVA Ilusión Verde',
  'uva el poblado':                'UVA Ilusión Verde',
  'uva los naranjos':              'UVA Ilusión Verde',
  'uva el tesoro':                 'UVA Ilusión Verde',
  'uva alejandria':                'UVA Ilusión Verde',
  'uva la ilusion':                'UVA Ilusión Verde',
  'la ilusion verde':              'UVA Ilusión Verde',
  'uva ilusion':                   'UVA Ilusión Verde',

  // ── Corregimiento San Cristóbal ──────────────────────────────────
  'uva mirador de san cristobal':  'UVA Mirador de San Cristóbal',
  'uva san cristobal':             'UVA Mirador de San Cristóbal',
  'mirador de san cristobal':      'UVA Mirador de San Cristóbal',
  'san cristobal':                 'UVA Mirador de San Cristóbal',
  'san javier':                    'UVA Mirador de San Cristóbal',
  'uva pajarito':                  'UVA Mirador de San Cristóbal',
  'el salado':                    'UVA Mirador de San Cristóbal',
  'veinte de julio':              'UVA Mirador de San Cristóbal',
  'nuevos conquistadores':        'UVA Mirador de San Cristóbal',
  'antonio nariño':               'UVA Mirador de San Cristóbal',
  'las independencias':           'UVA Mirador de San Cristóbal',
  'el corazon':                   'UVA Mirador de San Cristóbal',
  'belencito':                    'UVA Mirador de San Cristóbal',
  'betania':                      'UVA Mirador de San Cristóbal',

  // ── Bello ────────────────────────────────────────────────────────
  'uva aguas claras':              'UVA Aguas Claras',
  'aguas claras':                  'UVA Aguas Claras',
  'uva bello':                     'UVA Aguas Claras',
  'uva niquia':                    'UVA Aguas Claras',

  // ── Itagüí ───────────────────────────────────────────────────────
  'uva san fernando':              'UVA San Fernando',
  'san fernando':                  'UVA San Fernando',
  'uva itagui':                    'UVA San Fernando',
  'uva itagüi':                    'UVA San Fernando',

  // ── Espacios complementarios EPM ────────────────────────────────
  'biblioteca epm':                'Biblioteca EPM',
  'biblioteca':                    'Biblioteca EPM',
  'museo del agua':                'Museo del Agua',
  'museo agua':                    'Museo del Agua',
  'museo epm':                     'Museo del Agua',
  'pies descalzos':                'Museo del Agua',
};

// ─── Máquina de estados principal ────────────────────────────────────────────

/**
 * Procesa un mensaje y retorna la respuesta del asistente.
 * @param {{ sessionId: string, mensaje: string }} params
 * @returns {Promise<{ respuesta: string, uva: string|null, barrio: string|null, fecha: string }>}
 */
export async function procesarMensaje({ sessionId, mensaje }) {
  log(`Sesión ${sessionId} | "${mensaje.slice(0, 80)}"`);

  // ── 1. Sesión desde caché (0 DB si hay hit de los últimos 30 min) ────────
  const session = await getSession(sessionId);
  if (!Array.isArray(session.historial)) {
    session.historial = [];
  }

  if (session.uva && !_esUVACanonica(session.uva)) {
    log(`WARN: sesión tenía UVA inválida "${session.uva}" — reseteando`);
    session.uva = null;
    session.barrio = null;
    session.estado = 'saludo';
    session.historial = [];
    setSession(sessionId, { uva: null, barrio: null, estado: 'saludo' });
    limpiarHistorialSesion(sessionId).catch((err) => log(`WARN: no pude limpiar historial inválido: ${err.message}`));
  }

  if (_quiereReiniciar(mensaje)) {
    const nombrePrevio = session.nombre;
    session.nombre = null;
    session.barrio = null;
    session.uva = null;
    session.estado = 'saludo';
    session.historial = [];

    setSession(sessionId, {
      nombre: null,
      barrio: null,
      uva: null,
      estado: 'saludo',
      historial: [],
    });
    limpiarHistorialSesion(sessionId).catch((err) => log(`WARN: no pude limpiar historial al reiniciar: ${err.message}`));

    const respuesta = nombrePrevio
      ? `Listo ${nombrePrevio}, reiniciamos la conversación 😊\n\n¿Cuál es su nombre y en qué barrio o comuna de Medellín vive?`
      : 'Listo, reiniciamos la conversación 😊\n\n¿Cuál es su nombre y en qué barrio o comuna de Medellín vive?';

    _guardarHistorialAsync(sessionId, mensaje, respuesta, null, null);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: null, barrio: null, fecha: hoyISO() };
  }

  // Intento explícito: cambiar de UVA sin arrastrar agenda previa
  if (_quiereOtraUVA(mensaje)) {
    session.barrio = null;
    session.uva = null;
    session.estado = 'saludo';
    session.historial = [];
    setSession(sessionId, { barrio: null, uva: null, estado: 'saludo' });
    limpiarHistorialSesion(sessionId).catch((err) => log(`WARN: no pude limpiar historial al cambiar UVA: ${err.message}`));

    const respuesta = session.nombre
      ? `Listo ${session.nombre} 👍 ¿Qué barrio o comuna de Medellín desea consultar ahora?`
      : 'Listo 👍 ¿Qué barrio o comuna de Medellín desea consultar ahora?';

    _guardarHistorialAsync(sessionId, mensaje, respuesta, null, null);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: null, barrio: null, fecha: hoyISO() };
  }

  // Intento explícito: pedir enlace oficial (responder directo, sin Groq)
  if (_quiereLinkOficial(mensaje)) {
    const respuesta = `Claro. Este es el enlace oficial de programación UVA:\n${EPM_LINK}`;
    _guardarHistorialAsync(sessionId, mensaje, respuesta, session.barrio || null, session.uva || null);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: session.uva || null, barrio: session.barrio || null, fecha: hoyISO() };
  }

  // ── 2. Extraer info del mensaje actual (gratis — 0 tokens Groq) ──────────
  _extraerInfoGratis(mensaje, session, sessionId);

  if (session.coberturaSinUVA) {
    const municipio = session.coberturaSinUVA;
    const respuesta = `Lo siento, las UVAs de la Fundación EPM solo tienen cobertura en Medellín, Bello e Itagüí. ${municipio.charAt(0).toUpperCase() + municipio.slice(1)} no tiene UVA asignada aún. ¿Tiene algún familiar o conocido en esos municipios al que quiera consultar la programación? 😊`;
    session.coberturaSinUVA = null;
    setSession(sessionId, { coberturaSinUVA: null, estado: 'saludo' });
    _guardarHistorialAsync(sessionId, mensaje, respuesta, null, null);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: null, barrio: null, fecha: hoyISO() };
  }

  // ── 3b. BÚSQUEDA TEMÁTICA antes del saludo — funciona sin importar el estado ──
  if (_esBusquedaTematica(mensaje)) {
    const respuesta = await _respuestaTematica(mensaje, session);
    _guardarHistorialAsync(sessionId, mensaje, respuesta, session.barrio || null, null);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: null, barrio: session.barrio || null, fecha: hoyISO() };
  }

  // ── 3. ESTADO SALUDO: todavía no sabemos la UVA → preguntar (0 tokens) ──
  if (session.estado === 'saludo') {
    const respuesta = _mensajeSaludo(session.nombre);
    _guardarHistorialAsync(sessionId, mensaje, respuesta, null, null);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: null, barrio: null, fecha: hoyISO() };
  }

  if (_esMensajeCortoContinuacion(mensaje)) {
    const respuesta = _respuestaContinuacion(session);
    _guardarHistorialAsync(sessionId, mensaje, respuesta, session.barrio, session.uva);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: session.uva, barrio: session.barrio, fecha: hoyISO() };
  }

  // ── 4. ESTADO ACTIVO: tenemos UVA → flujo completo ───────────────────────
  const alcanceTemporal = parsearAlcanceTemporal(mensaje);
  const fechaSolicitada = alcanceTemporal.fechaInicio;

  // Detectar si el usuario pregunta por una UVA diferente a la suya (amigo, curiosidad)
  const uvaConsulta = _extraerUVAMensaje(mensaje) || session.uva;
  if (uvaConsulta === session.uva) {
    log(`UVA: ${uvaConsulta} | Fecha: ${fechaSolicitada}`);
  } else {
    log(`UVA consulta distinta: ${uvaConsulta} (sesión: ${session.uva})`);
  }

  // Historial + agenda en paralelo (ambas pueden tardar, las esperamos juntas)
  const [historialDB, contextoMD] = await Promise.all([
    getHistorialSesion(sessionId, 25).catch(() => []),
    _obtenerAgendaMD(uvaConsulta, alcanceTemporal),
  ]);

  const historial = [...session.historial, ...historialDB].slice(-25);

  if (_esRespuestaDirecta(contextoMD)) {
    const respuesta = contextoMD ?? _sinDatos(uvaConsulta);
    _guardarHistorialAsync(sessionId, mensaje, respuesta, session.barrio, uvaConsulta);
    _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);
    return { respuesta, uva: uvaConsulta, barrio: session.barrio, fecha: fechaSolicitada };
  }

  // ── 5. Groq como motor principal de respuesta ────────────────────────────
  let respuesta;
  try {
    respuesta = await generarRespuesta(historial, mensaje, contextoMD, session.nombre, uvaConsulta);
    log(`Groq OK: "${respuesta.slice(0, 80)}..."`);
  } catch (err) {
    log(`Error Groq: ${err.message}`);
    respuesta = contextoMD ?? _sinDatos(uvaConsulta);
  }

  // ── 6. Guardar historial async (no bloquea el return al usuario) ─────────
  _guardarHistorialAsync(sessionId, mensaje, respuesta, session.barrio, uvaConsulta);
  _actualizarVentanaContexto(sessionId, session, mensaje, respuesta);

  return { respuesta, uva: uvaConsulta, barrio: session.barrio, fecha: fechaSolicitada };
}

// ─── Extracción de nombre + barrio sin Groq ───────────────────────────────────

/**
 * Intenta extraer nombre y barrio del mensaje. Muta session y persiste en caché.
 * Orden: Python NER → JS geo-agent fallback (para barrio), regex (para nombre).
 */
function _extraerInfoGratis(mensaje, session, sessionId) {
  const cobertura = _detectarMunicipioSinCobertura(mensaje);
  if (cobertura) {
    session.estado = 'saludo';
    session.coberturaSinUVA = cobertura;
    setSession(sessionId, { estado: 'saludo', coberturaSinUVA: cobertura });
    return;
  }

  // Nombre por regex (no toca Groq)
  if (!session.nombre) {
    const nombre = _regexNombre(mensaje);
    if (nombre) {
      session.nombre = nombre;
      setSession(sessionId, { nombre });
      log(`Nombre (regex): ${nombre}`);
    }
  }

  // Barrio / UVA
  if (!session.uva) {
    // Intento 0: nombre directo de recinto (Biblioteca EPM, Museo del Agua, nombre de UVA)
    const directa = _extraerUVADirecta(mensaje);
    if (directa && _esUVACanonica(directa)) {
      session.uva = directa;
      session.barrio = directa;
      session.estado = 'activo';
      setSession(sessionId, { uva: directa, barrio: directa, estado: 'activo' });
      log(`Recinto directo (alias): ${directa}`);
      return;
    }

    // Intento 1: Python NER con difflib (más preciso, maneja variantes)
    const ner = _nerBarrioPython(mensaje);
    if (ner?.found && ner.score >= 0.75) {
      const uvaValidada = _esUVACanonica(ner.uva) ? ner.uva : null;
      if (uvaValidada) {
        session.barrio = ner.barrio;
        session.uva = uvaValidada;
        session.estado = 'activo';
        setSession(sessionId, {
          barrio: ner.barrio,
          uva: uvaValidada,
          estado: 'activo',
        });
        log(`Barrio (Python NER score=${ner.score}): ${ner.barrio} → ${uvaValidada}`);
      } else {
        log(`WARN: NER retornó UVA inválida "${ner.uva}" para barrio "${ner.barrio}" — ignorando`);
      }
    } else {
      // Intento 2: geo-agent JS (Levenshtein local, siempre disponible)
      const geo = extraerBarrioDeTexto(mensaje);
      if (geo.encontrado) {
        const uvaValidada = _esUVACanonica(geo.uva) ? geo.uva : null;
        if (uvaValidada) {
          session.barrio = geo.barrio;
          session.uva = uvaValidada;
          session.estado = 'activo';
          setSession(sessionId, {
            barrio: geo.barrio,
            uva: uvaValidada,
            estado: 'activo',
          });
          log(`Barrio (JS fallback): ${geo.barrio} → ${uvaValidada}`);
        } else {
          log(`WARN: geo-agent retornó UVA inválida "${geo.uva}" — ignorando`);
        }
      }
    }
  }
}

function _detectarMunicipioSinCobertura(texto = '') {
  const t = (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t) return null;

  for (const municipio of MUNICIPIOS_SIN_COBERTURA) {
    if (t.includes(municipio)) return municipio;
  }

  return null;
}

// ─── Extraer UVA mencionada en el mensaje (para consultas sobre otros barrios) ──────
/**
 * Si el mensaje menciona explícitamente un barrio, retorna su UVA.
 * No muta la sesión — solo se usa para la consulta actual.
 * @param {string} texto
 * @returns {string|null}
 */
function _extraerUVAMensaje(texto) {
  const directa = _extraerUVADirecta(texto);
  if (directa) return directa;

  const ner = _nerBarrioPython(texto);
  if (ner?.found && ner.score >= 0.75) return ner.uva;
  const geo = extraerBarrioDeTexto(texto);
  return geo.encontrado ? geo.uva : null;
}

function _extraerUVADirecta(texto) {
  if (!texto) return null;
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [alias, canonica] of Object.entries(UVA_ALIASES)) {
    if (t.includes(alias)) return canonica;
  }

  return null;
}

function _quiereOtraUVA(texto = '') {
  const t = (texto || '').toLowerCase();
  if (!t) return false;
  if (/cambiar\s+uva|cambiar\s+de\s+uva/i.test(t)) return true;

  return [
    'otra uva',
    'consultar otra',
    'otra comuna',
    'otro barrio',
    'otra zona',
  ].some((k) => t.includes(k));
}

function _quiereReiniciar(texto = '') {
  const t = (texto || '').toLowerCase();
  return [
    'volvamos a empezar',
    'reiniciar',
    'reinicia',
    'reset',
    'borrar contexto',
    'olvida lo anterior',
  ].some((k) => t.includes(k));
}

function _esMensajeCortoContinuacion(texto = '') {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t) return false;
  if (t.length > 24) return false;

  return /^(ok|hola|buenas|esta bien|vale|listo|gracias|perfecto|de una|si|dale|que haces\s*\?)$/.test(t);
}

function _respuestaContinuacion(session) {
  const nombre = session?.nombre ? `${session.nombre}, ` : '';
  const uva = session?.uva || 'su UVA';
  return `Todo bien. ${nombre}Estoy para ayudarle con la programación de *${uva}* 😊\n\nSi quiere, le muestro lo de *hoy* o de una *fecha específica*.`;
}

function _actualizarVentanaContexto(sessionId, session, mensajeUsuario, mensajeBot) {
  const prev = Array.isArray(session.historial) ? session.historial : [];
  const next = [
    ...prev,
    { rol: 'user', mensaje: mensajeUsuario },
    { rol: 'assistant', mensaje: mensajeBot },
  ].slice(-12);

  session.historial = next;
  setSession(sessionId, { historial: next });
}

function _quiereLinkOficial(texto = '') {
  return /(link|enlace|url|pagina\s+oficial|sitio\s+oficial|web\s+oficial|grupo\s+epm|fundacion\s+epm)/i.test(texto);
}

// ─── NER barrio vía Python ────────────────────────────────────────────────────

function _nerBarrioPython(texto) {
  const raw = callPython('ner_barrio.py', { text: texto, barrios: BARRIOS_FLAT });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Extracción de nombre por regex (0 tokens) ───────────────────────────────

function _regexNombre(texto) {
  // Patrón 1: "me llamo Juan", "mi nombre es María", "llámame Pedro"
  const m1 = texto.match(
    /(?:me llamo|mi nombre(?: es)?|ll[aá]mame)\s+([A-ZÀ-ɏ][a-zÀ-ɏ]{2,}(?:\s+[A-ZÀ-ɏ][a-zÀ-ɏ]+)?)/i,
  );
  if (m1) return m1[1].trim().replace(/\b\w/g, c => c.toUpperCase());

  // Patrón 2: "Stiven vivo en...", "Juan soy de..." — nombre propio antes de verbo
  const m2 = texto.match(
    /^([A-ZÀ-ɏ][a-zÀ-ɏ]{2,})\s+(?:vivo|vengo|estoy|soy de)\s/i,
  );
  if (m2) return m2[1].trim().replace(/\b\w/g, c => c.toUpperCase());

  // Patrón 3: multilínea — primera línea = nombre completo ("Stiven Arteaga\nSanto Domingo")
  const lineas = texto.trim().split(/\n+/);
  if (lineas.length >= 2) {
    const primera = lineas[0].trim();
    const mNombre = primera.match(/^([A-ZÀ-ɏ][a-zÀ-ɏ]{2,}(?:\s+[A-ZÀ-ɏ][a-zÀ-ɏ]+){0,2})$/);
    if (mNombre && !BARRIOS_FLAT[primera.toLowerCase()]) {
      return mNombre[1].replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return null;
}

// ─── Agenda Markdown: caché → Supabase → fallback texto ─────────────────────

const EPM_LINK = process.env.EPM_PROGRAMACION_URL || 'https://www.grupo-epm.com/site/fundacionepm/programacion/';

async function _obtenerAgendaMD(uvaNombre, alcanceTemporal) {
  const esSemana = alcanceTemporal?.modo === 'semana';
  const fecha = alcanceTemporal?.fechaInicio || hoyISO();

  if (!_esUVACanonica(uvaNombre)) {
    log(`ERROR: consulta de agenda con UVA inválida "${uvaNombre}"`);
    return _sinDatos(uvaNombre);
  }

  // 1. Caché en memoria (O(1), generada por Python tras scraping diario)
  const cached = getAgendaMD(uvaNombre, fecha);
  if (cached) {
    log('Agenda desde caché Markdown ✓');
    return cached;
  }

  if (esSemana) {
    const fechas = [];
    for (let i = 0; i < 7; i++) {
      fechas.push(sumarDias(fecha, i));
    }

    const actividadesSemana = await getProgramacionPorFechas(fechas).catch(() => []);
    const actividadesUva = (actividadesSemana || []).filter((a) => a.uva_nombre === uvaNombre);

    if (actividadesUva.length > 0) {
      return _actividadesAMDSemana(uvaNombre, fechas, actividadesUva);
    }

    return `_No encontré programación para *${uvaNombre}* en la semana del ${formatearFechaEspanol(fecha)} al ${formatearFechaEspanol(sumarDias(fecha, 6))}.

📎 Consulta la agenda oficial aquí:
${EPM_LINK}_`;
  }

  // 2. Consultar Supabase y convertir a Markdown en Node
  try {
    const actividades = await getProgramacion(uvaNombre, fecha);
    if (actividades?.length > 0) {
      const md = _actividadesAMD(uvaNombre, fecha, actividades);
      setAgendaMD(uvaNombre, fecha, md);
      log(`Agenda generada desde Supabase: ${actividades.length} actividades`);
      return md;
    }

    const proximas = await _proximasActividadesUVA(uvaNombre, fecha, 4);
    if (proximas.length > 0) {
      const proxLista = proximas
        .map((a) => {
          const hi = (a.hora_inicio || '?').slice(0, 5);
          const hf = (a.hora_fin || '?').slice(0, 5);
          return `- ${formatearFechaEspanol(a.fecha)} ${hi}–${hf}: ${a.actividad}`;
        })
        .join('\n');

      return `_Hoy no hay actividades programadas en *${uvaNombre}* (${formatearFechaEspanol(fecha)}).\n\n📌 Próximas actividades:\n${proxLista}\n\n📎 Agenda oficial:\n${EPM_LINK}_`;
    }

    // 3. Tabla vacía para esa UVA: informar y sugerir UVAs con agenda del día

    const delDia = await getProgramacionPorFecha(fecha).catch(() => []);
    const uvasDisponibles = [...new Set((delDia || []).map(a => a.uva_nombre).filter(_esUVAValida))];
    const sugerencia = uvasDisponibles.length > 0
      ? `\n\n_UVAs con programación cargada hoy:_\n- ${uvasDisponibles.slice(0, 6).join('\n- ')}`
      : '';

    return `_La programación de *${uvaNombre}* para hoy no está cargada aún en la base oficial.\n🛠️ Estamos usando carga manual para asegurar calidad de datos.\n📎 Agenda oficial:\n${EPM_LINK}_${sugerencia}`;
  } catch (err) {
    log(`Error consultando agenda: ${err.message}`);
    return `_No pude acceder a la programación en este momento.\n📎 Consulte la agenda oficial de las UVAs acá:\n${EPM_LINK}_`;
  }
}

async function _proximasActividadesUVA(uvaNombre, fechaDesde, limite = 4) {
  const base = new Date(`${fechaDesde}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];

  const fechas = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    fechas.push(d.toISOString().slice(0, 10));
  }

  const todas = await getProgramacionPorFechas(fechas).catch(() => []);
  return (todas || [])
    .filter((a) => a.uva_nombre === uvaNombre)
    .sort((a, b) => {
      const ak = `${a.fecha} ${a.hora_inicio || '99:99'}`;
      const bk = `${b.fecha} ${b.hora_inicio || '99:99'}`;
      return ak.localeCompare(bk);
    })
    .slice(0, limite);
}

function _esUVAValida(nombre) {
  if (!nombre || typeof nombre !== 'string') return false;
  const n = nombre.trim();
  if (!n.startsWith('UVA ')) return false;
  if (/\bprogramaci[oó]n\b/i.test(n)) return false;
  if (/\bUVA\s+ba\b/i.test(n)) return false;
  return n.length >= 8;
}

/** Retorna true cuando el contexto NO contiene datos reales (no llamar a Groq).
 * Los mensajes sin datos siempre empiezan con '_' (Markdown italic).
 * Los datos reales empiezan con '##' (Markdown heading).
 */
function _esRespuestaDirecta(ctx) {
  return ctx == null || ctx.startsWith('_');
}

/** Mensaje de fallback con el link EPM. */
function _sinDatos(uva) {
  const uvaStr = uva ? ` de *${uva}*` : '';
  return `No tengo la programación actual${uvaStr}. 📎 Consulte la agenda oficial acá:\n${EPM_LINK}`;
}

/** Lanza el scraping completo en background sin bloquear la respuesta. */
function _dispararScrapingBackground(uvaNombre) {
  if (!AUTO_SCRAPING_ENABLED) {
    log(`Auto-scraping desactivado. No se dispara scraping para ${uvaNombre}`);
    return;
  }

  const ahora = Date.now();
  if (ahora - _ultimoScrapingTrigger < SCRAPING_COOLDOWN_MS) {
    log(`Scraping ya disparado hace ${Math.round((ahora - _ultimoScrapingTrigger) / 60000)} min, omitiendo`);
    return;
  }
  _ultimoScrapingTrigger = ahora;
  log(`Disparando scraping en background (sin programación para ${uvaNombre})`);

  // Importación dinámica para evitar importación circular en arranque
  import('./scheduler-agent.js')
    .then(m => m.ejecutarCicloCompleto())
    .then(r => log(`Scraping background completado: ${r.total} actividades`))
    .catch(e => log(`Scraping background error: ${e.message}`));
}

// ─── Convertir actividades → Markdown compacto ───────────────────────────────

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

  const grupos = new Map();
  for (const fecha of fechas) {
    grupos.set(fecha, []);
  }
  for (const act of actividades) {
    if (!grupos.has(act.fecha)) continue;
    grupos.get(act.fecha).push(act);
  }

  for (const fecha of fechas) {
    const lista = grupos.get(fecha) || [];
    md += `\n📆 *${nombreDia(fecha)}*\n`;
    if (lista.length === 0) {
      md += `Sin programación cargada\n`;
      continue;
    }

    for (const act of lista) {
      const hi = (act.hora_inicio || '?').slice(0, 5);
      const hf = (act.hora_fin || '?').slice(0, 5);
      const em = _emoji(act.actividad);
      md += `${em} ${hi}–${hf} — *${act.actividad}*`;
      if (act.descripcion) md += ` — ${act.descripcion}`;
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
  if (/ecolog|natura|huerta/.test(a))                                return '🌿';
  if (/tecno|computa|digital/.test(a))                               return '💻';
  if (/cine|película/.test(a))                                       return '🎬';
  return '✨';
}

// ─── Mensaje de saludo estructurado (0 tokens Groq) ──────────────────────────

function _mensajeSaludo(nombre) {
  if (nombre) {
    return (
      `¡Hola ${nombre}! 😊 Para buscarle la programación de su UVA más cercana, ` +
      `¿en qué *barrio, zona o comuna* de Medellín vive? 🏙️`
    );
  }
  return (
    `¡Hola! 👋 Soy el asistente de las *UVAs de Medellín* — espacios culturales de la Fundación EPM.\n\n` +
    `Para ayudarle, cuénteme:\n` +
    `1️⃣ ¿Cuál es su nombre?\n` +
    `2️⃣ ¿En qué *barrio, zona o comuna* de Medellín vive? 🏙️\n\n` +
    `Con eso le encuentro su *UVA más cercana* y le comparto toda la programación 🍇`
  );
}

// ─── Fallback sin Groq (mantenido por si se llama desde otro lado) ────────────

function _fallback(uva, md) {
  if (md?.includes('**')) return `Acá la programación:\n\n${md}`;
  return _sinDatos(uva);
}

// ─── Búsqueda temática: "¿en qué UVA hay X?" / "busco X" / "quiero X" ───────

const PATRON_BUSQUEDA_TEMATICA = /(?:en\s+(?:cu[aá]l(?:es)?|qu[eé])\s+uva|qu[eé]\s+uvas?\s+(?:tiene[n]?|ofrece[n]?|hay|tienen)\s+|d[oó]nde\s+hay\s+|en\s+qu[eé]\s+lugar(?:es)?\s+hay\s+|cu[aá]les?\s+uvas?\s+(?:tienen?|hacen?|ofrecen?)\s+|busco\s+(?:clases?|talleres?|cursos?|actividades?|algo\s+de)\s+|quiero\s+(?:clases?|talleres?|cursos?|algo\s+de)\s+|hay\s+(?:clases?|talleres?|cursos?|actividades?)\s+de\s+|me\s+interes[ae]\s+|quisiera\s+(?:aprender|hacer|tomar))/i;

/**
 * Detecta si el mensaje es una búsqueda transversal de tema en todas las UVAs.
 */
function _esBusquedaTematica(texto = '') {
  return PATRON_BUSQUEDA_TEMATICA.test(texto);
}

/**
 * Responde a búsquedas temáticas buscando en todas las UVAs del mes actual.
 */
async function _respuestaTematica(mensaje, session) {
  // Extraer el tema del mensaje (lo que viene después del patrón)
  const tema = mensaje
    .replace(PATRON_BUSQUEDA_TEMATICA, '')
    .replace(/[?¿!¡.,]/g, '')
    .trim()
    .toLowerCase();

  if (!tema || tema.length < 3) {
    return '¿Sobre qué tipo de actividad quiere buscar? Cuénteme y busco en todas las UVAs 😊';
  }

  // Generar keywords: el tema completo + palabras individuales de ≥4 letras
  // + raíces cortas para cubrir variantes (ej: "robótica" → "robot")
  const palabras = tema
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .split(/\s+/).filter((p) => p.length >= 4);

  const raices = palabras.map((p) => p.slice(0, Math.max(4, p.length - 2)));
  const keywords = [...new Set([
    tema,
    tema.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),  // sin tildes
    ...palabras,
    ...raices,
  ])];

  // Buscar solo desde hoy en adelante (no mostrar eventos pasados)
  const hoy = hoyISO();
  const fin = sumarDias(hoy, 60);  // hasta 60 días adelante

  let resultados = [];
  try {
    resultados = await buscarActividadesPorTema(keywords, hoy, fin, [...RECINTOS_EPM]);
  } catch (err) {
    log(`Error búsqueda temática: ${err.message}`);
  }

  if (!resultados.length) {
    const nombre = session?.nombre ? `, ${session.nombre}` : '';
    return `Lo siento${nombre}, no encontré actividades relacionadas con *"${tema}"* en la programación actual de las UVAs.\n\n¿Quiere que le muestre qué hay disponible en su UVA? 😊`;
  }

  // Agrupar por UVA y tomar la próxima ocurrencia de cada una
  const porUVA = new Map();
  for (const act of resultados) {
    if (!porUVA.has(act.uva_nombre)) {
      porUVA.set(act.uva_nombre, act);
    }
  }

  const nombre = session?.nombre ? `¡Claro, ${session.nombre}! ` : '¡Claro! ';
  let respuesta = `${nombre}Encontré actividades relacionadas con *"${tema}"* en estas UVAs 🌟\n\n`;

  for (const [uva, act] of porUVA) {
    const hi = (act.hora_inicio || '?').slice(0, 5);
    const hf = (act.hora_fin   || '?').slice(0, 5);
    const fechaFmt = formatearFechaEspanol(act.fecha);
    const em = _emoji(act.actividad);
    respuesta += `${em} *${uva}*\n   └ ${act.actividad} · ${fechaFmt} ${hi}–${hf}\n`;
  }

  respuesta += `\n¿Le gustaría más info de alguna UVA en particular? 😊`;
  return respuesta;
}

// ─── Guardar historial async (no bloquea la respuesta) ───────────────────────

function _guardarHistorialAsync(sessionId, msgUsuario, msgBot, barrio, uva) {
  Promise.all([
    guardarMensaje({ sessionId, rol: 'user',      mensaje: msgUsuario, barrioDetectado: barrio, uvaAsignada: uva }),
    guardarMensaje({ sessionId, rol: 'assistant', mensaje: msgBot,     barrioDetectado: barrio, uvaAsignada: uva }),
  ]).catch(err => log(`Advertencia historial: ${err.message}`));
}

function log(msg) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${msg}`);
}

export default { procesarMensaje };

// ── FIN DEL ARCHIVO ───────────────────────────────────────────────────────────

