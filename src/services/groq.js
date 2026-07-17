/**
 * groq.js — nombre legacy; implementación real en Anthropic SDK (Claude)
 *
 * Mantiene exactamente las mismas exportaciones del módulo legacy
 * para que chat-agent.js no requiera ningún cambio.
 *
 * Capa de compatibilidad:
 *   - llamadaConHerramientas() convierte mensajes/herramientas de formato
 *     OpenAI ↔ Anthropic automáticamente y devuelve respuesta estilo OpenAI.
 */

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
const LOG_PREFIX = '[Claude]';

// ─── Cliente perezoso ──────────────────────────────────────────────────────────
// IMPORTANTE: nunca lanzar en la carga del módulo. Si ANTHROPIC_API_KEY falta o es
// inválida, antes esto tumbaba TODO el proceso Node al iniciar (index.js importa
// chat-agent.js → groq.js), dejando el bot de WhatsApp totalmente sin responder
// aunque el resto del sistema (WhatsApp, DB, scheduler) funcionara bien.
// Ahora el error se difiere hasta el primer uso real y cada llamada lo captura.
let _client = null;

function _getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no está configurada. Configúrela en las variables de entorno del servicio.');
  }
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/** Diagnóstico rápido para /health — no expone la key, solo si existe. */
export function claudeConfigurado() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── Reintentos con backoff exponencial ────────────────────────────────────────
// Cubre rate limits (429), sobrecarga del servicio (529) y errores transitorios
// de red/servidor (500/502/503). Sin esto, un solo 429 hacía que el bot cayera
// en el mensaje de "no tengo datos" para esa consulta — con tráfico moderado el
// límite de tasa se alcanza fácilmente porque cada mensaje dispara 3-5 llamadas
// a Claude (clasificar intención, extraer nombre/barrio, tool-loop).
const REINTENTABLES = new Set([429, 500, 502, 503, 529]);
const MAX_REINTENTOS = 3;

async function _conReintento(fn, etiqueta) {
  let ultimoError;
  for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      const status = err?.status ?? err?.response?.status;

      if (status === 401 || status === 403) {
        console.error(`${LOG_PREFIX} ⛔ Autenticación rechazada (${status}). Verifique que ANTHROPIC_API_KEY sea válida y tenga crédito/cupo disponible.`);
        throw err;
      }

      if (!REINTENTABLES.has(status) || intento === MAX_REINTENTOS) {
        if (status === 429) {
          console.error(`${LOG_PREFIX} ⛔ Límite de tasa (429) alcanzado en "${etiqueta}" tras ${intento} reintentos. Revise el plan/uso en console.anthropic.com.`);
        } else if (status) {
          console.error(`${LOG_PREFIX} ⛔ Error ${status} en "${etiqueta}" tras ${intento} reintentos: ${err.message}`);
        } else {
          console.error(`${LOG_PREFIX} ⛔ Error de red en "${etiqueta}": ${err.message}`);
        }
        throw err;
      }

      const espera = Math.min(500 * 2 ** intento, 4000) + Math.floor(Math.random() * 250);
      console.warn(`${LOG_PREFIX} ⚠ ${status === 429 ? 'Límite de tasa (429)' : `Error ${status}`} en "${etiqueta}" — reintentando en ${espera}ms (intento ${intento + 1}/${MAX_REINTENTOS})...`);
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  throw ultimoError;
}

// ─── System prompt principal ───────────────────────────────────────────────────

function buildSystemPrompt(nombreUsuario, uvaNombre) {
  const saludoNombre = nombreUsuario
    ? `El nombre del usuario es *${nombreUsuario}*. Úsalo para personalizar la conversación.`
    : '';
  const saludoUva = uvaNombre
    ? `El usuario pertenece a la *${uvaNombre}*. Cuando responda sobre programación, asume que es de esa UVA a menos que pida otra.`
    : '';

  return `Eres el asistente virtual de la Fundación EPM en Medellín. Ayudas a los ciudadanos
a encontrar actividades culturales, recreativas y formativas en las UVAs (Unidades de Vida
Articulada), el Museo del Agua, la Biblioteca EPM y el Parque de los Deseos.

${saludoNombre}
${saludoUva}

Tu personalidad:
- Amigable, cercano y claro 🌟
- Usas "usted" por defecto, tuteas solo si el usuario tutea
- Eres entusiasta con la cultura y el deporte
- Siempre mencionas el nombre completo de la UVA
- Usas emojis con moderación para hacer la conversación más viva

Horarios de actividades por UVA (primera y última actividad del día — Mayo 2026):
- UVA Aguas Claras         → 8:00 a.m. – 4:00 p.m.
- UVA El Encanto           → 8:30 a.m. – 4:00 p.m.
- UVA de La Armonía        → 9:00 a.m. – 5:00 p.m.
- UVA Ilusión Verde        → 9:00 a.m. – 7:00 p.m.
- UVA Los Guayacanes       → 9:00 a.m. – 4:30 p.m.
- UVA Mirador de San Cristóbal → 9:00 a.m. – 4:00 p.m.
- UVA de Los Sueños        → 9:00 a.m. – 4:30 p.m.
- UVA San Fernando         → 10:00 a.m. – 5:00 p.m.
- UVA de La Esperanza      → 9:00 a.m. – 5:00 p.m.
- UVA de La Libertad       → 10:00 a.m. – 4:00 p.m.
- UVA de La Imaginación    → 10:00 a.m. – 3:00 p.m.
- UVA Nuevo Amanecer       → 11:00 a.m. – 4:30 p.m.
- UVA de La Cordialidad    → 10:30 a.m. – 4:00 p.m.
- UVA de La Alegría        → 10:00 a.m. – 5:00 p.m.
- Biblioteca EPM           → 10:00 a.m. – 5:00 p.m.
- Museo del Agua EPM       → Mar–Vie: 8:30 a.m.–3:30 p.m. | Sáb, Dom y festivos: 9:30 a.m.–4:00 p.m. | Lunes: CERRADO
  📍 Carrera 57 #42-139, Parque de los Pies Descalzos, Medellín
- Parque de los Deseos     → Actividades según programación mensual (espacios al aire libre)
  📍 Calle 64b #52-60, frente a la Universidad de Antioquia, Medellín

Cuando el usuario pregunte por horarios de atención o a qué hora abre/cierra una UVA, usa los datos anteriores para la UVA específica y añade: "Recuerde que los horarios pueden variar según el día y la programación del mes. Para confirmar, puede llamar al 📞 (604) 448 69 60 o escribir a contactenos@fundacionepm.org.co"

Lo que puedes hacer:
- Informar sobre programación en las 14 UVAs, Museo del Agua, Biblioteca EPM y Parque de los Deseos
- Explicarle a qué UVA pertenece según su barrio o comuna
- Darle el horario completo del día solicitado y el rango de atención del espacio
- Sugerirle actividades según edad o interés si lo menciona

Lo que NO puedes hacer:
- **JAMÁS inventar actividades, horarios, nombres o fechas que no estén en el bloque [CONTEXTO DE PROGRAMACIÓN OFICIAL].** Si ese bloque no está presente o indica que no hay datos, dilo honestamente y proporciona el enlace oficial.
- Dar información de otras ciudades o equipamientos que no sean UVAs de Medellín
- Comprometer cupos, inscripciones o precios (redirigir a la UVA directamente)

⚠️ REGLA CRÍTICA: Si no recibes un [CONTEXTO DE PROGRAMACIÓN OFICIAL] con actividades reales, responde:
"No tengo la programación actual de [espacio]. Consulta la agenda oficial aquí: https://www.grupo-epm.com/site/fundacionepm/programacion/"

Mapa de UVAs y barrios (para responder preguntas de ubicación — NO inventes actividades):
- UVA de La Esperanza → Laureles, Estadio, Castilla, La América
- UVA Nuevo Amanecer → Popular, Santo Domingo, La Avanzada
- UVA de La Cordialidad → Santo Domingo Savio, La Quiebra
- UVA de La Alegría → Santa Cruz, Berlín, Palermo
- UVA de La Armonía → Aranjuez, Manrique, Villa del Socorro
- UVA de Los Sueños → Manrique central, Versalles
- UVA Los Guayacanes → Manrique oriental, Cucaracho, Aranjuez
- UVA El Encanto → Castilla, Doce de Octubre, Robledo
- UVA de La Imaginación → Buenos Aires, La Candelaria, Centro, Enciso, *Boston*
- UVA de La Libertad → Villatina, Sol de Oriente, El Pinal
- UVA Ilusión Verde → El Poblado, Los Naranjos, El Tesoro
- UVA Mirador de San Cristóbal → San Javier, Las Independencias, El Pesebre
- UVA Aguas Claras → Bello, Niquía, Acevedo
- UVA San Fernando → Itagüí, Guayabal, Belén Sur
- Museo del Agua EPM → Centro de Medellín, Parque de los Pies Descalzos (Carrera 57 #42-139)
- Biblioteca EPM → Centro de Medellín (junto al Parque de los Pies Descalzos)
- Parque de los Deseos → Frente a la Universidad de Antioquia, Barrio Jesús Nazareno (Calle 64b #52-60)

*Boston NO es una UVA*. Es un barrio dentro de la UVA de La Imaginación.

Cuando respondas con programación, respeta EXACTAMENTE esta estructura en 3 partes. NUNCA uses ## ni ### (WhatsApp no los renderiza):

PARTE 1 — Intro cálida (OBLIGATORIA): Una oración que mencione el nombre del usuario y el nombre completo de la UVA. Ej: "¡Con mucho gusto, [nombre]! Aquí está la programación de hoy en la *UVA de La Imaginación* 🎉"

PARTE 2 — Bloque de actividades (copiar del contexto, sin agregar ## ni backticks):
🍇 *UVA [NOMBRE]*
📅 [Día, fecha larga en español]
━━━━━━━━━━━━━━━
[emoji] [hora inicio]–[hora fin] — *[Nombre actividad]* (👥 [Edad si existe])
━━━━━━━━━━━━━━━
💬 _Para inscripciones y cupos, acérquese a la UVA en el horario del evento. ¡Allí le esperamos con gusto, [nombre]!_ 🌟

PARTE 3 — Pregunta de seguimiento (OBLIGATORIA siempre al final): Pregunta si desea consultar otro día de la semana o la programación de otra UVA. Ej: "¿Le gustaría ver la programación de otro día, o consultar qué tiene otra UVA? 😊"

Emojis por tipo de actividad:
💃 danza/baile | 🎵 música/canto | 🎨 arte/pintura | ⚽ deporte | 🎭 teatro
📚 lectura/literatura | 🧘 yoga/bienestar | 🍳 cocina | 🧒 infantil | 👴 adulto mayor
🌿 naturaleza/ecología | 💻 tecnología | ✨ otros

Si el usuario no menciona su barrio, pregúntale:
"¿En qué barrio o comuna de Medellín vive? 🏘️"`;
}

// ─── Helpers: conversión OpenAI ↔ Anthropic para tool calling ─────────────────

/**
 * Convierte array de mensajes formato OpenAI → Anthropic.
 * Extrae el system message si es el primero.
 * Fusiona tool results consecutivos en un único mensaje user.
 */
function _convertirMensajes(messages) {
  let system = '';
  const converted = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n\n' : '') + (msg.content || '');
      continue;
    }

    // Tool result → user message con content array tool_result
    if (msg.role === 'tool') {
      const toolResult = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: String(msg.content ?? ''),
      };
      const last = converted[converted.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
        last.content.push(toolResult);
      } else {
        converted.push({ role: 'user', content: [toolResult] });
      }
      continue;
    }

    // Assistant con tool_calls → formato Anthropic tool_use
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      const content = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function.arguments ?? {}),
        });
      }
      converted.push({ role: 'assistant', content });
      continue;
    }

    converted.push({ role: msg.role, content: msg.content ?? '' });
  }

  // Anthropic exige que el primer mensaje sea 'user'
  let start = 0;
  while (start < converted.length && converted[start].role !== 'user') start++;

  return { system, messages: converted.slice(start) };
}

/**
 * Convierte herramientas de formato OpenAI → Anthropic.
 */
function _convertirHerramientas(tools) {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/**
 * Convierte respuesta Anthropic → formato OpenAI-compatible.
 */
function _convertirRespuesta(response) {
  const textBlock   = response.content.find(b => b.type === 'text');
  const toolBlocks  = response.content.filter(b => b.type === 'tool_use');

  if (response.stop_reason === 'tool_use' && toolBlocks.length) {
    return {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: textBlock?.text ?? null,
          tool_calls: toolBlocks.map(b => ({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input) },
          })),
        },
      }],
    };
  }

  return {
    choices: [{
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: textBlock?.text ?? '',
        tool_calls: [],
      },
    }],
  };
}

// ─── Funciones exportadas (misma API del módulo legacy) ─────────────────────

/**
 * Genera una respuesta conversacional usando Claude.
 */
export async function generarRespuesta(historial, mensajeUsuario, contextoUVA = null, nombreUsuario = null, uvaNombre = null) {
  const messages = [];

  for (const turno of historial.slice(-20)) {
    messages.push({ role: turno.rol, content: turno.mensaje || '' });
  }

  let mensajeFinal = mensajeUsuario;
  if (contextoUVA) {
    mensajeFinal = `${mensajeUsuario}\n\n[CONTEXTO DE PROGRAMACIÓN OFICIAL — usar para responder]:\n${contextoUVA}`;
  }
  messages.push({ role: 'user', content: mensajeFinal });

  const response = await _conReintento(() => _getClient().messages.create({
    model: MODEL,
    system: buildSystemPrompt(nombreUsuario, uvaNombre),
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  }), 'generarRespuesta');

  return response.content[0]?.text || 'Lo siento, no pude generar una respuesta en este momento.';
}

/**
 * Extrae el nombre propio del usuario de un mensaje si se presenta.
 */
export async function extraerNombreConIA(mensaje) {
  const response = await _conReintento(() => _getClient().messages.create({
    model: MODEL,
    system: 'Eres un extractor de nombres. Dado el mensaje de un usuario, responde ÚNICAMENTE con su nombre propio si se presentó (ej: "me llamo Carlos", "soy María", "mi nombre es Pedro"). Si no se presenta, responde exactamente: ninguno. Solo el nombre, sin puntuación ni texto extra.',
    messages: [{ role: 'user', content: mensaje }],
    max_tokens: 15,
    temperature: 0,
  }), 'extraerNombreConIA');
  const r = response.content[0]?.text?.trim();
  return r && r.toLowerCase() !== 'ninguno' && r.length < 30 ? r : null;
}

/**
 * Extrae el barrio o comuna de Medellín mencionado en un texto.
 */
export async function extraerBarrioConIA(texto, listaBarrios) {
  const muestra = listaBarrios.slice(0, 80).join(', ');
  const response = await _conReintento(() => _getClient().messages.create({
    model: MODEL,
    system: `Eres un extractor de entidades. Dado un mensaje de un ciudadano de Medellín,
extrae únicamente el nombre del barrio o comuna que menciona.
Responde SOLO con el nombre del barrio/comuna en minúsculas y sin tildes, o la palabra "ninguno" si no menciona ninguno.
Ejemplos de barrios: ${muestra}`,
    messages: [{ role: 'user', content: texto }],
    max_tokens: 20,
    temperature: 0,
  }), 'extraerBarrioConIA');
  const resultado = response.content[0]?.text?.trim().toLowerCase();
  return resultado === 'ninguno' || !resultado ? null : resultado;
}

/**
 * Expande keywords de búsqueda con sinónimos y términos relacionados.
 */
export async function expandirKeywordsConIA(keywords) {
  const tema = keywords.join(', ');
  const response = await _conReintento(() => _getClient().messages.create({
    model: MODEL,
    system: `Eres un asistente para un chatbot de actividades culturales en Medellín.
Dado un tema de búsqueda, genera palabras clave relacionadas en español que podrían aparecer en nombres de talleres, cursos o actividades culturales, recreativas o formativas.
Responde SOLO con un array JSON de strings en minúsculas y sin tildes. Máximo 10 palabras.
Ejemplos:
- "robotica" → ["robot","tecnologia","informatica","digital","programacion","stem","ciencia","computacion"]
- "danza" → ["baile","folclor","urbana","movimiento","ritmo","coreografia"]
- "cocina" → ["gastronomia","recetas","alimentacion","culinaria","hornear"]`,
    messages: [{ role: 'user', content: tema }],
    max_tokens: 100,
    temperature: 0.3,
  }), 'expandirKeywordsConIA');

  try {
    const raw = response.content[0]?.text?.trim();
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.map(k => String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      : [];
  } catch {
    return [];
  }
}

/**
 * Clasifica la intención del mensaje del usuario.
 */
export async function clasificarIntencion(mensaje) {
  const response = await _conReintento(() => _getClient().messages.create({
    model: MODEL,
    system: `Eres un clasificador de intenciones para un chatbot de WhatsApp sobre la Fundación EPM en Medellín (UVAs, Museo del Agua, Biblioteca EPM, Parque de los Deseos).

Clasifica el mensaje en UNA intención. Responde SOLO con JSON válido, sin texto extra.

Intenciones:
- "reset": quiere reiniciar/empezar de cero la conversación
- "enlace": pide el link/url/página oficial de programación
- "cambio_uva": quiere consultar otro barrio, UVA o zona diferente a la suya
- "tematica": busca un tipo de actividad en todas las UVAs (ej: robótica, danza, yoga, cocina)
- "continuacion": mensaje corto de confirmación sin pregunta real (ok, gracias, sí, listo, perfecto)
- "normal": cualquier otra cosa (saludo, consulta de agenda, pregunta por horarios, etc.)

Para "tematica": extrae las palabras clave del tema (solo sustantivos/verbos del tema, sin stopwords).

Formato: {"intent": "...", "keywords": [...]}`,
    messages: [{ role: 'user', content: mensaje }],
    max_tokens: 80,
    temperature: 0,
  }), 'clasificarIntencion');

  const raw = response.content[0]?.text?.trim();
  const parsed = JSON.parse(raw);
  return { intent: parsed.intent || 'normal', keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [] };
}

/**
 * System prompt para modo tool use — 6 reglas absolutas + few-shot.
 */
export function buildSystemPromptTools(nombreUsuario, uvaNombre, hoy) {
  const ctxNombre = nombreUsuario
    ? `Nombre del usuario: *${nombreUsuario}*. Personaliza la respuesta con su nombre.`
    : '';
  const ctxUva = uvaNombre
    ? `UVA del usuario: *${uvaNombre}*. Úsala por defecto en obtener_agenda si no indica otra.`
    : 'El usuario aún no ha indicado su UVA o barrio.';

  // Calcular día de la semana para HOY (ayuda al modelo a interpretar fechas relativas)
  const [y, m, d] = hoy.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hoyDia = diasSemana[dt.getDay()];
  const manana = new Date(y, m - 1, d + 1).toISOString().slice(0, 10);

  return `Eres Uvita, asistente virtual de la Fundación EPM en Medellín. Ayudas a ciudadanos a encontrar actividades en las 14 UVAs, la Biblioteca EPM, el Museo del Agua y el Parque de los Deseos.

${ctxNombre}
${ctxUva}
HOY: ${hoy} (${hoyDia}) | MAÑANA: ${manana}

╔══════════════════════════════════════════════════════╗
║                6 REGLAS ABSOLUTAS                    ║
╚══════════════════════════════════════════════════════╝

REGLA 1 — CONSULTA LA BASE DE DATOS ANTES DE RESPONDER CUALQUIER COSA
  • Si el usuario pregunta por un TEMA (robótica, danza, yoga, manualidades, cocina…)
    → llama INMEDIATAMENTE a buscar_actividades con ese tema.
    → NO preguntes "¿en qué UVA?" — buscar_actividades busca en TODAS las UVAs.
    → Usa un rango de 30 días si no especifica fecha.
  • Si el usuario pregunta por la agenda de su UVA o una UVA específica
    → llama a obtener_agenda con el nombre exacto de la UVA y la fecha.
  • NUNCA generes texto de respuesta sin haber llamado al menos UNA herramienta primero.

REGLA 2 — JAMÁS INVENTES DATOS
  Usa EXCLUSIVAMENTE lo que retornen las herramientas. Si no retornan resultados,
  dilo honestamente. El link oficial va SOLO al final como recurso alternativo.

REGLA 3 — EL LINK OFICIAL NO ES LA PRIMERA RESPUESTA
  https://www.grupo-epm.com/site/fundacionepm/programacion/
  Solo lo mencionas DESPUÉS de que las herramientas no encontraron nada.

REGLA 4 — EXPANSIÓN AUTOMÁTICA DE SINÓNIMOS
  Al buscar un tema, incluye variaciones en los keywords:
  • robótica/robot  → ["robot","robotica","electronica","automata","stem","circuito","led"]
  • manualidades    → ["manualidad","tejido","crochet","macrame","bordado","mostacilla","bisuteria","peyote","amigurumi"]
  • danza/baile     → ["danza","baile","folclor","urbana","coreografia"]
  • tecnología      → ["tecnologia","digital","computacion","informatica","dispositivos","celular"]
  • arte/pintura    → ["arte","pintura","dibujo","ceramica","creativo","crearte"]
  • naturaleza      → ["agroecologia","huerta","biodiversidad","ecologia","ambiente"]

REGLA 5 — INTERPRETA FECHAS RELATIVAS (referencia: HOY = ${hoy}, ${hoyDia})
  • "hoy"           → ${hoy}
  • "mañana"        → ${manana}
  • "el sábado" / "este sábado" → calcula el sábado más próximo desde ${hoy}
  • "la semana que viene" → 7 días desde el próximo lunes
  • Si el usuario dice "¿y para el sábado?" o "¿y el viernes?" en un contexto
    donde ya se habló de un TEMA → mantén ese tema del historial y cambia solo la fecha.

REGLA 6 — FORMATO WHATSAPP (sin ## ni ### — no los renderiza WhatsApp)
  Intro cálida (nombre del usuario + espacio EPM)
  Lista: emoji hora–hora — *Nombre actividad* (👥 edad si existe)
  Cierre: "Para inscripciones acérquese directamente al espacio en el horario del evento."
  Pregunta de seguimiento: ¿otro día o quiere consultar otra UVA?

════════════════════════════════════════════════════════
EJEMPLOS DE COMPORTAMIENTO CORRECTO
════════════════════════════════════════════════════════

[Usuario]: "¿qué hay de robótica?"
[CORRECTO ✓]: llamar buscar_actividades(
  keywords=["robot","robotica","electronica","automata","stem","led"],
  fecha_desde="${hoy}", fecha_hasta="+30 días"
)
[INCORRECTO ✗]: preguntar "¿en qué UVA?" — buscar_actividades ya revisa TODAS.
[INCORRECTO ✗]: responder con el link sin buscar primero.

[Usuario]: "¿y para el sábado?" (contexto anterior: robótica)
[CORRECTO ✓]: inferir tema=robótica del historial + nueva fecha=sábado próximo
  → llamar buscar_actividades(keywords=["robot","robotica","electronica","automata"],
    fecha_desde="SÁBADO", fecha_hasta="SÁBADO")
[INCORRECTO ✗]: olvidar el tema y pedir aclaración de nuevo.
[INCORRECTO ✗]: preguntar "¿cuál es su UVA favorita?"

[Usuario]: "¿qué hay en la UVA El Encanto hoy?"
[CORRECTO ✓]: llamar obtener_agenda(uva="UVA El Encanto", fecha="${hoy}")

════════════════════════════════════════════════════════
Emojis: 💃 danza/baile | 🎵 música/canto | 🎨 arte/cerámica | ⚽ deporte
        🎭 teatro | 📚 lectura | 🧘 yoga/bienestar | 🍳 cocina | 🧒 infantil
        👴 adulto mayor | 🌿 ecología/huerta | 💻 tecnología | 🤖 robótica/STEM | ✨ otros

⚠️ CRÍTICO: El usuario NO ve los resultados de las herramientas — solo lee lo que tú escribes.
Incluye TODAS las actividades que retornen las herramientas en tu respuesta.`;
}

/**
 * Llama a Claude con herramientas (function calling).
 * Acepta mensajes y herramientas en formato OpenAI y devuelve respuesta estilo OpenAI.
 *
 * @param {Array}   openaiMessages  — mensajes en formato OpenAI
 * @param {Array}   openaiTools     — herramientas en formato OpenAI
 * @param {boolean} [forceTools]    — si true, usa tool_choice="any" para forzar al modelo
 *                                    a llamar al menos una herramienta (útil en la primera
 *                                    iteración para garantizar consulta a la DB)
 */
export async function llamadaConHerramientas(openaiMessages, openaiTools, forceTools = false) {
  const { system, messages } = _convertirMensajes(openaiMessages);
  const tools = _convertirHerramientas(openaiTools);

  const response = await _conReintento(() => _getClient().messages.create({
    model: MODEL,
    system: system || undefined,
    messages,
    tools,
    // "any" = debe llamar AL MENOS una herramienta (evita respuesta sin datos reales)
    // "auto" = puede responder libremente tras haber obtenido datos de las herramientas
    tool_choice: forceTools ? { type: 'any' } : { type: 'auto' },
    temperature: 0.3,  // Baja temperatura para llamadas de herramientas más deterministas
    max_tokens: 1500,
  }), 'llamadaConHerramientas');

  return _convertirRespuesta(response);
}

export default { generarRespuesta, extraerNombreConIA, extraerBarrioConIA, expandirKeywordsConIA, clasificarIntencion, buildSystemPromptTools, llamadaConHerramientas, claudeConfigurado };
