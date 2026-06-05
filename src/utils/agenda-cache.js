/**
 * agenda-cache.js
 *
 * Caché de agendas en Markdown con dos niveles:
 *   L1 — Map en memoria  (O(1), sin TTL — se limpia en cada scraping)
 *   L2 — Redis           (persiste entre reinicios, TTL 4 horas)
 *
 * Se llena automáticamente al terminar el scraping diario.
 * El chat-agent consulta aquí primero antes de ir a Supabase.
 */

import { redis } from './redis-client.js';

/** @type {Map<string, string>} key: "UVA La Armonía::2026-05-20" */
const MEMORY = new Map();

const TTL_SECONDS = 4 * 60 * 60; // 4 horas
const KEY_PREFIX  = 'agenda:';

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Busca la agenda en L1 → L2.
 * @param {string} uvaNombre
 * @param {string} fecha  — YYYY-MM-DD
 * @returns {Promise<string|null>}
 */
export async function getAgendaMD(uvaNombre, fecha) {
  const mapKey = `${uvaNombre}::${fecha}`;

  // L1: memoria
  const mem = MEMORY.get(mapKey);
  if (mem) return mem;

  // L2: Redis
  if (redis) {
    try {
      const raw = await redis.get(`${KEY_PREFIX}${mapKey}`);
      if (raw) {
        MEMORY.set(mapKey, raw); // promover a L1
        return raw;
      }
    } catch { /* silencioso */ }
  }

  return null;
}

/**
 * Guarda la agenda en L1 y L2.
 * @param {string} uvaNombre
 * @param {string} fecha
 * @param {string} markdown
 */
export async function setAgendaMD(uvaNombre, fecha, markdown) {
  const mapKey = `${uvaNombre}::${fecha}`;
  MEMORY.set(mapKey, markdown);

  if (redis) {
    redis.setex(`${KEY_PREFIX}${mapKey}`, TTL_SECONDS, markdown).catch(() => {});
  }
}

/** Limpia toda la caché en memoria (útil antes de regenerar tras un scraping). */
export function clearAgendaCache() {
  MEMORY.clear();
}

export function estadoAgendaCache() {
  return {
    entradas: MEMORY.size,
    fechas: [...new Set([...MEMORY.keys()].map(k => k.split('::')[1]))],
  };
}
