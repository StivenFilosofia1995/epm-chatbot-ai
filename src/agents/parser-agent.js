/**
 * parser-agent.js
 * Agente 2 — Parsea el texto OCR del PDF de programación de UVAs.
 * Extrae actividades estructuradas y las guarda en Supabase.
 */

import { leerPDF, dividirPorUVA } from '../services/pdf-reader.js';
import { insertarProgramacion, registrarScraping } from '../services/supabase.js';
import { normalizar, titleCase } from '../utils/normalizer.js';
import { hoyISO } from '../utils/date-helper.js';
import { BARRIOS_UVA, COMUNAS_UVA } from '../data/barrios-uva-map.js';

const LOG_PREFIX = '[ParserAgent]';
const UVA_CANONICAS = new Set([
  'UVA La Esperanza',
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

const UVA_ALIAS_HEADER = [
  { re: /alegr/i, uva: 'UVA de La Alegría' },
  { re: /armon/i, uva: 'UVA de La Armonía' },
  { re: /guayac/i, uva: 'UVA Los Guayacanes' },
  { re: /sue[nñ]/i, uva: 'UVA de Los Sueños' },
  { re: /encanto/i, uva: 'UVA El Encanto' },
  { re: /imagin/i, uva: 'UVA La Imaginación' },
  { re: /libertad/i, uva: 'UVA de La Libertad' },
  { re: /ilusion verde|ilusi[oó]n verde|ilusion|la ilusion/i, uva: 'UVA Ilusión Verde' },
  { re: /esperan/i, uva: 'UVA de La Esperanza' },
  { re: /mirador|san cristobal/i, uva: 'UVA Mirador de San Cristóbal' },
  { re: /aguas claras|niquia|bello/i, uva: 'UVA Aguas Claras' },
  { re: /san fernando|itagui/i, uva: 'UVA San Fernando' },
];

// Expresiones regulares para parsear la programación
const REGEX_HORA = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const REGEX_FECHA = /\b(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s+)?(\d{4})?\b/gi;
const REGEX_RANGO_HORA = /\b([01]?\d|2[0-3]:[0-5]\d)\s*[-–a]\s*([01]?\d|2[0-3]:[0-5]\d)\b/g;
const REGEX_HORA_LINEA = /^((?:[01]?\d|2[0-3])(?::[0-5]\d)?)\s*[-–:]\s*(.+)$/;
const REGEX_HORA_RANGO_PREFIJO = /^((?:[01]?\d|2[0-3])(?::[0-5]\d)?)\s*[-–]\s*/;
const REGEX_HORA_TEXTO = /hora\s*[:.]?\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?)\s*([ap](?:\.?m\.?)?)?\s*(?:a|\-|–)\s*((?:[01]?\d|2[0-3])(?::[0-5]\d)?)\s*([ap](?:\.?m\.?)?)?/i;

const MESES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

/**
 * Agente principal: recibe el buffer del PDF, lo procesa y guarda en Supabase.
 * @param {Buffer} pdfBuffer
 * @param {string} pdfUrl — URL original del PDF (para el log)
 * @returns {Promise<{actividades: Array, total: number}>}
 */
export async function ejecutarParser(pdfBuffer, pdfUrl = '', textoOCR = null) {
  log('Iniciando parser de programación UVA...');

  const { actividades: todasActividades } = await extraerActividadesPlano(pdfBuffer, textoOCR);

  log(`Total actividades parseadas: ${todasActividades.length}`);

  // ─── Paso 4: Guardar en Supabase ─────────────────────────────────────────
  if (todasActividades.length > 0) {
    try {
      await insertarProgramacion(todasActividades);
      log(`${todasActividades.length} actividades guardadas en Supabase`);

      // Actualizar el log de scraping con el conteo
      await registrarScraping({
        url: pdfUrl,
        status: 'parsed',
        actividadesEncontradas: todasActividades.length,
      });
    } catch (err) {
      log(`ERROR guardando en Supabase: ${err.message}`);
      throw err;
    }
  } else {
    log('ADVERTENCIA: No se encontraron actividades para guardar');
  }

  return { actividades: todasActividades, total: todasActividades.length };
}

/**
 * Extrae actividades planas desde OCR/PDF sin guardar en la base de datos.
 * Útil para reconciliación: web real vs Supabase.
 */
export async function extraerActividadesPlano(pdfBuffer, textoOCR = null) {
  // Paso 1: Extraer texto
  let texto;
  let metodo;

  if (textoOCR) {
    texto = textoOCR;
    metodo = 'playwright-ocr';
    log(`Texto recibido por OCR (${metodo}): ${texto.length} caracteres`);
  } else {
    try {
      const resultado = await leerPDF(pdfBuffer);
      texto = resultado.texto;
      metodo = resultado.metodo;
      log(`Texto extraído (${metodo}): ${texto.length} caracteres`);
    } catch (err) {
      throw new Error(`${LOG_PREFIX} Error extrayendo texto del PDF: ${err.message}`);
    }
  }

  // Paso 2: Dividir por UVA
  const secciones = dividirPorUVA(texto);
  log(`Procesando ${secciones.length} secciones de UVA`);

  // Paso 3: Parsear secciones
  const todasActividades = [];
  for (const seccion of secciones) {
    const uvaCanonica = resolverUVACanonica(seccion.uva, seccion.contenido);
    if (!uvaCanonica) {
      log(`  Sección ignorada por UVA no canónica: ${seccion.uva || 'null'}`);
      continue;
    }

    try {
      const actividades = parsearSeccionUVA(uvaCanonica, seccion.contenido);
      log(`  ${uvaCanonica}: ${actividades.length} actividades encontradas`);
      todasActividades.push(...actividades);
    } catch (err) {
      log(`  ERROR parseando ${uvaCanonica}: ${err.message}`);
    }
  }

  const filtradas = filtrarMesDominante(todasActividades);
  if (filtradas.length !== todasActividades.length) {
    log(`Filtrado por mes dominante: ${todasActividades.length - filtradas.length} descartadas`);
  }

  log(`Total actividades parseadas: ${filtradas.length}`);
  return { actividades: filtradas, total: filtradas.length, metodo };
}

/**
 * Parsea el contenido de texto de una sección de UVA específica.
 * Identifica bloques de fecha y extrae las actividades de cada bloque.
 * @param {string} uvaNombre
 * @param {string} contenido
 * @returns {Array}
 */
function parsearSeccionUVA(uvaNombre, contenido) {
  const actividades = [];
  const lineas = contenido
    .split('\n')
    .map((l) => normalizarLineaOCR(l).trim())
    .filter(Boolean);

  let fechaActual = hoyISO(); // Fallback a hoy si no se detecta fecha
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];

    // ─── Detectar línea de fecha ─────────────────────────────────────────
    const fechaDetectada = detectarFecha(linea);
    if (fechaDetectada) {
      fechaActual = fechaDetectada;
      i++;
      continue;
    }

    // ─── Detectar línea con hora (inicio de actividad) ───────────────────
    const matchHora = REGEX_HORA_LINEA.exec(linea);
    if (matchHora) {
      const horaInicio = normalizarHora(matchHora[1]);
      let textoActividad = matchHora[2].trim();

      // Verificar si hay rango de hora (10:00 - 11:00)
      let horaFin = null;
      const matchRango = REGEX_HORA_RANGO_PREFIJO.exec(textoActividad);
      if (matchRango) {
        horaFin = normalizarHora(matchRango[1]);
        textoActividad = textoActividad.slice(matchRango[0].length).trim();
      }

      // Recopilar descripción de líneas siguientes (hasta la próxima hora o fecha)
      let descripcion = '';
      let j = i + 1;
      while (j < lineas.length && !detectarFecha(lineas[j]) && !REGEX_HORA_LINEA.exec(lineas[j])) {
        if (lineas[j].length > 3) {
          descripcion += (descripcion ? ' ' : '') + lineas[j];
        }
        j++;
      }

      // Extraer edad recomendada si aparece en la actividad o descripción
      const edadRec = extraerEdad(textoActividad + ' ' + descripcion);

      if (textoActividad.length > 2 && !esLineaRuido(textoActividad)) {
        actividades.push({
          uva_nombre: uvaNombre,
          fecha: fechaActual,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          actividad: titleCase(textoActividad.slice(0, 200)),
          descripcion: descripcion.slice(0, 500) || null,
          edad_recomendada: edadRec,
          raw_text: linea.slice(0, 300),
        });
      }

      i = j;
      continue;
    }

    const matchHoraTexto = REGEX_HORA_TEXTO.exec(linea);
    if (matchHoraTexto) {
      let actividad = i > 0 ? lineas[i - 1] : 'Actividad programada';
      if (!actividad || esLineaRuido(actividad) || esEncabezado(actividad)) {
        actividad = 'Actividad programada';
      }

      actividades.push({
        uva_nombre: uvaNombre,
        fecha: fechaActual,
        hora_inicio: normalizarHoraConMeridiano(matchHoraTexto[1], matchHoraTexto[2]),
        hora_fin: normalizarHoraConMeridiano(matchHoraTexto[3], matchHoraTexto[4]),
        actividad: titleCase(actividad.slice(0, 200)),
        descripcion: null,
        edad_recomendada: extraerEdad(linea),
        raw_text: linea.slice(0, 300),
      });

      i++;
      continue;
    }

    // ─── Detectar actividad sin hora (formato alternativo) ───────────────
    if (
      linea.length > 10
      && !linea.match(/^[-–=*•►▶]+$/)
      && !esEncabezado(linea)
      && !esLineaRuido(linea)
    ) {
      // Podría ser una actividad sin hora definida
      const edadRec = extraerEdad(linea);
      actividades.push({
        uva_nombre: uvaNombre,
        fecha: fechaActual,
        hora_inicio: null,
        hora_fin: null,
        actividad: titleCase(linea.slice(0, 200)),
        descripcion: null,
        edad_recomendada: edadRec,
        raw_text: linea.slice(0, 300),
      });
    }

    i++;
  }

  return actividades;
}

/**
 * Detecta si una línea contiene una fecha y la retorna en formato YYYY-MM-DD.
 * @param {string} linea
 * @returns {string|null}
 */
function detectarFecha(linea) {
  if (!linea) return null;

  const match = linea.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/i
  );

  if (match) {
    const diaNum = Number.parseInt(match[1], 10);
    if (diaNum < 1 || diaNum > 31) return null;
    const dia = String(diaNum).padStart(2, '0');
    const mes = MESES[match[2].toLowerCase()];
    const year = match[3] || new Date().getFullYear().toString();
    return `${year}-${mes}-${dia}`;
  }

  // Formato DD/MM o DD/MM/YYYY
  const matchNum = linea.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/);
  if (matchNum && !/\d{2}:\d{2}/.test(linea)) {
    const diaNum2 = Number.parseInt(matchNum[1], 10);
    const mesNum = Number.parseInt(matchNum[2], 10);
    if (diaNum2 < 1 || diaNum2 > 31 || mesNum < 1 || mesNum > 12) return null;
    const dia = String(diaNum2).padStart(2, '0');
    const mes = String(mesNum).padStart(2, '0');
    let year = matchNum[3] || new Date().getFullYear().toString();
    if (year.length === 2) year = '20' + year;
    return `${year}-${mes}-${dia}`;
  }

  return null;
}

/**
 * Normaliza una hora al formato HH:MM.
 * @param {string} hora
 * @returns {string}
 */
function normalizarHora(hora) {
  if (!hora) return null;
  const partes = hora.replace(/[.,]/, ':').split(':');
  const h = partes[0].padStart(2, '0');
  const m = (partes[1] || '00').padStart(2, '0');
  return `${h}:${m}`;
}

function normalizarHoraConMeridiano(hora, meridiano) {
  const base = normalizarHora(hora);
  if (!base) return null;
  if (!meridiano) return base;

  let [h, m] = base.split(':').map((x) => Number.parseInt(x, 10));
  const mer = meridiano.toLowerCase().replace(/\./g, '');
  if (mer.startsWith('p') && h < 12) h += 12;
  if (mer.startsWith('a') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Extrae edad recomendada de un texto si se menciona.
 * @param {string} texto
 * @returns {string|null}
 */
function extraerEdad(texto) {
  const match = texto.match(/\b(\d+)\s*(?:a|-)?\s*(\d+)?\s*años?\b/i);
  if (match) {
    return match[2] ? `${match[1]}-${match[2]} años` : `${match[1]}+ años`;
  }
  if (/\btodas?\s+las?\s+edades?\b/i.test(texto)) return 'Todas las edades';
  if (/\bninos?\b|\binfantil\b/i.test(texto)) return 'Niños';
  if (/\bjovenes?\b|\bjoven\b/i.test(texto)) return 'Jóvenes';
  if (/\badulto\b|\bmayores?\b/i.test(texto)) return 'Adultos';
  return null;
}

/**
 * Determina si una línea es un encabezado/título de sección (no una actividad).
 * @param {string} linea
 * @returns {boolean}
 */
function esEncabezado(linea) {
  const norm = normalizar(linea);
  const patronesEncabezado = [
    /^uva\s+/,
    /^programacion\b/,
    /^semana\b/,
    /^mes\s+de\b/,
    /^fundacion\s+epm/,
    /^\d{4}$/,           // Solo un año
    /^pagina\s+\d+/,
  ];
  return patronesEncabezado.some((p) => p.test(norm));
}

function resolverUVACanonica(uvaDetectada, contenido) {
  if (uvaDetectada && UVA_CANONICAS.has(uvaDetectada)) return uvaDetectada;

  const header = (uvaDetectada || '').trim();
  for (const { re, uva } of UVA_ALIAS_HEADER) {
    if (re.test(header)) return uva;
  }

  const contenidoNorm = normalizar((contenido || '').slice(0, 7000));
  const score = new Map();
  const dic = { ...BARRIOS_UVA, ...COMUNAS_UVA };

  for (const [clave, uva] of Object.entries(dic)) {
    if (!contenidoNorm.includes(clave)) continue;
    score.set(uva, (score.get(uva) || 0) + 1);
  }

  if (score.size === 0) return null;
  const mejor = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
  const [uvaGanadora, puntos] = mejor;
  if (puntos < 1) return null;
  return UVA_CANONICAS.has(uvaGanadora) ? uvaGanadora : null;
}

/**
 * Filtra ruido común de OCR: direcciones, coordenadas, textos sueltos y basura.
 */
function esLineaRuido(linea) {
  const t = (linea || '').trim();
  if (!t) return true;

  const norm = normalizar(t);
  const patronesRuido = [
    /\bdireccion\b/,
    /\bav\.?\b|\bavenida\b|\bcalle\b|\bcarrera\b|\bdiagonal\b|\btransversal\b/,
    /\bmedellin\b|\bantioquia\b|\bbello\b/,
    /^[\d\s\-.,/:]+$/,
    /^[a-z]{1,2}\b/,
  ];

  if (patronesRuido.some((p) => p.test(norm))) return true;
  if (t.length < 4) return true;

  // Muy pocos caracteres alfabéticos suele ser OCR roto
  const letras = (norm.match(/[a-z]/g) || []).length;
  if (letras < 3) return true;

  return false;
}

function normalizarLineaOCR(linea = '') {
  return linea
    .replace(/([\s:])O(?=\d)/g, '$10')
    .replace(/(?<=\d)O([\s:])/g, '0$1')
    .replace(/([\s:])[Il](?=\d)/g, '$11')
    .replace(/(?<=\d)[Il]([\s:])/g, '1$1')
    .replace(/\bp\.?\s*m\.?\b/gi, 'pm')
    .replace(/\ba\.?\s*m\.?\b/gi, 'am')
    .replace(/\s+/g, ' ');
}

function filtrarMesDominante(actividades) {
  if (!actividades?.length) return [];

  const conteo = new Map();
  for (const a of actividades) {
    if (!a.fecha || a.fecha.length < 7) continue;
    const mes = a.fecha.slice(0, 7);
    conteo.set(mes, (conteo.get(mes) || 0) + 1);
  }

  if (conteo.size === 0) return actividades;
  const [mesDominante] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
  return actividades.filter((a) => (a.fecha || '').startsWith(mesDominante));
}

function log(mensaje) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().replace('T', ' ').substring(0, 19)} ${mensaje}`);
}

export default { ejecutarParser };
