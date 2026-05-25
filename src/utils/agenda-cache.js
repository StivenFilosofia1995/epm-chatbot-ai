/**
 * agenda-cache.js
 * Caché en memoria de agendas en formato Markdown, indexadas por UVA + fecha.
 *
 * Se llena automáticamente al terminar el scraping diario.
 * El chat-agent consulta aquí primero (O(1)) antes de ir a Supabase.
 * No tiene TTL: se invalida/regenera con cada scraping exitoso.
 */

/** @type {Map<string, string>} key: "UVA La Armonía::2026-05-20" */
const CACHE = new Map();

/**
 * @param {string} uvaNombre
 * @param {string} fecha  — YYYY-MM-DD
 * @returns {string|null}
 */
export function getAgendaMD(uvaNombre, fecha) {
  return CACHE.get(`${uvaNombre}::${fecha}`) || null;
}

/**
 * @param {string} uvaNombre
 * @param {string} fecha
 * @param {string} markdown
 */
export function setAgendaMD(uvaNombre, fecha, markdown) {
  CACHE.set(`${uvaNombre}::${fecha}`, markdown);
}

/** Limpia toda la caché (útil antes de regenerar tras un scraping). */
export function clearAgendaCache() {
  CACHE.clear();
}

export function estadoAgendaCache() {
  return { entradas: CACHE.size, fechas: [...new Set([...CACHE.keys()].map(k => k.split('::')[1]))] };
}
