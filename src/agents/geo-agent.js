/**
 * geo-agent.js
 * Agente 3 — Mapea barrios/comunas del usuario a su UVA correspondiente.
 * Normaliza nombres y resuelve variantes, apodos y errores tipográficos.
 */

import { BARRIOS_UVA, COMUNAS_UVA } from '../data/barrios-uva-map.js';
import { normalizar, normalizarBarrio, encontrarBarrioEnTexto } from '../utils/normalizer.js';

const LOG_PREFIX = '[GeoAgent]';
const LISTA_BARRIOS = Object.keys(BARRIOS_UVA);

/**
 * Resultado de resolución de UVA.
 * @typedef {Object} ResultadoUVA
 * @property {string|null} uva  — Nombre oficial de la UVA
 * @property {string|null} barrioNormalizado  — Barrio encontrado normalizado
 * @property {boolean} encontrado
 * @property {string} mensaje  — Mensaje para mostrar al usuario
 */

/**
 * Resuelve la UVA a partir del nombre del barrio o comuna.
 * @param {string} barrio  — Input del usuario (puede tener tildes, mayúsculas, errores)
 * @returns {ResultadoUVA}
 */
export function resolverUVA(barrio) {
  if (!barrio || typeof barrio !== 'string') {
    return { uva: null, barrioNormalizado: null, encontrado: false, mensaje: 'No se proporcionó barrio' };
  }

  const barrioNorm = normalizarBarrio(barrio);
  log(`Resolviendo UVA para barrio: "${barrio}" → normalizado: "${barrioNorm}"`);

  // ─── Búsqueda exacta en mapa de barrios ──────────────────────────────────
  if (BARRIOS_UVA[barrioNorm]) {
    const uva = BARRIOS_UVA[barrioNorm];
    log(`Match exacto encontrado: ${barrioNorm} → ${uva}`);
    return { uva, barrioNormalizado: barrioNorm, encontrado: true, mensaje: `Barrio "${titleCaseSimple(barrio)}" encontrado` };
  }

  // ─── Búsqueda en mapa de comunas ─────────────────────────────────────────
  if (COMUNAS_UVA[barrioNorm]) {
    const uva = COMUNAS_UVA[barrioNorm];
    log(`Match en comunas: ${barrioNorm} → ${uva}`);
    return { uva, barrioNormalizado: barrioNorm, encontrado: true, mensaje: `Comuna "${titleCaseSimple(barrio)}" encontrada` };
  }

  // ─── Búsqueda parcial (el barrio contiene o está contenido en alguna clave) ─
  const matchParcial = buscarMatchParcial(barrioNorm);
  if (matchParcial) {
    log(`Match parcial encontrado: ${barrioNorm} ≈ ${matchParcial.clave} → ${matchParcial.uva}`);
    return {
      uva: matchParcial.uva,
      barrioNormalizado: matchParcial.clave,
      encontrado: true,
      mensaje: `Barrio "${titleCaseSimple(barrio)}" resuelto (coincidencia parcial con "${matchParcial.clave}")`,
    };
  }

  // ─── Búsqueda por similitud (Levenshtein simple) ─────────────────────────
  const matchSimilar = buscarPorSimilitud(barrioNorm);
  if (matchSimilar && matchSimilar.distancia <= 3) {
    log(`Match por similitud: ${barrioNorm} ~ ${matchSimilar.clave} (dist=${matchSimilar.distancia}) → ${matchSimilar.uva}`);
    return {
      uva: matchSimilar.uva,
      barrioNormalizado: matchSimilar.clave,
      encontrado: true,
      mensaje: `Barrio "${titleCaseSimple(barrio)}" resuelto (¿quisiste decir "${matchSimilar.clave}"?)`,
    };
  }

  log(`Barrio no encontrado: "${barrioNorm}"`);
  return { uva: null, barrioNormalizado: barrioNorm, encontrado: false, mensaje: `Barrio "${titleCaseSimple(barrio)}" no encontrado` };
}

/**
 * Extrae el barrio mencionado en un texto libre del usuario (NER simple).
 * @param {string} texto
 * @returns {{barrio: string|null, uva: string|null, encontrado: boolean}}
 */
export function extraerBarrioDeTexto(texto) {
  if (!texto) return { barrio: null, uva: null, encontrado: false };

  // Buscar mención directa en el texto usando el mapa completo
  const barrioEncontrado = encontrarBarrioEnTexto(texto, LISTA_BARRIOS);

  if (barrioEncontrado) {
    const uva = BARRIOS_UVA[barrioEncontrado] || COMUNAS_UVA[barrioEncontrado] || null;
    log(`Barrio extraído del texto: "${barrioEncontrado}" → ${uva}`);
    return { barrio: barrioEncontrado, uva, encontrado: !!uva };
  }

  // Intentar con el texto completo normalizado
  const textoNorm = normalizar(texto);
  for (const [clave, uva] of Object.entries(COMUNAS_UVA)) {
    if (textoNorm.includes(clave)) {
      log(`Comuna extraída del texto: "${clave}" → ${uva}`);
      return { barrio: clave, uva, encontrado: true };
    }
  }

  return { barrio: null, uva: null, encontrado: false };
}

/**
 * Retorna la lista de todos los barrios disponibles (normalizada).
 * Útil para mostrar al usuario opciones disponibles.
 * @returns {string[]}
 */
export function listarBarriosDisponibles() {
  return LISTA_BARRIOS;
}

/**
 * Retorna los barrios/zonas asociados a una UVA específica.
 * @param {string} uvaNombre
 * @returns {string[]}
 */
export function obtenerBarriosPorUVA(uvaNombre) {
  return Object.entries(BARRIOS_UVA)
    .filter(([, uva]) => uva === uvaNombre)
    .map(([barrio]) => barrio);
}

// ─── Funciones privadas ──────────────────────────────────────────────────────

/**
 * Búsqueda parcial: el barrio buscado está contenido en una clave del mapa, o viceversa.
 */
function buscarMatchParcial(barrioNorm) {
  if (barrioNorm.length < 4) return null;

  let mejorMatch = null;
  let mejorLongitud = 0;

  for (const [clave, uva] of Object.entries(BARRIOS_UVA)) {
    if (clave.includes(barrioNorm) || barrioNorm.includes(clave)) {
      const longitud = Math.min(clave.length, barrioNorm.length);
      if (longitud > mejorLongitud) {
        mejorLongitud = longitud;
        mejorMatch = { clave, uva };
      }
    }
  }

  return mejorLongitud >= 4 ? mejorMatch : null;
}

/**
 * Distancia de Levenshtein simplificada (solo para strings cortos).
 */
function distanciaLevenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 4) return 999;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Busca el barrio más similar en el mapa por distancia de edición.
 */
function buscarPorSimilitud(barrioNorm) {
  if (barrioNorm.length < 4) return null;

  let mejorMatch = null;
  let menorDistancia = Infinity;

  for (const [clave, uva] of Object.entries(BARRIOS_UVA)) {
    const dist = distanciaLevenshtein(barrioNorm, clave);
    if (dist < menorDistancia) {
      menorDistancia = dist;
      mejorMatch = { clave, uva, distancia: dist };
    }
  }

  return mejorMatch;
}

function titleCaseSimple(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

function log(mensaje) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().replace('T', ' ').substring(0, 19)} ${mensaje}`);
}

export default { resolverUVA, extraerBarrioDeTexto, listarBarriosDisponibles, obtenerBarriosPorUVA };
