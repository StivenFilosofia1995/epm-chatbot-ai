/**
 * session-cache.js
 * Caché en memoria estilo Redis para sesiones de usuario.
 *
 * Estructura por sesión:
 *   { nombre, barrio, uva, estado: 'saludo'|'activo', historial, lastActivity }
 *
 * TTL: 30 min de inactividad → expira y se recarga de Supabase en el siguiente mensaje.
 * Persistencia: cada write hace guardarMemoria() de forma async (fire-and-forget).
 * Cleanup:  cada 5 min elimina sesiones expiradas del Map.
 */

import { getMemoria, guardarMemoria } from '../services/supabase.js';

const TTL_MS = 30 * 60 * 1000; // 30 minutos

/** @type {Map<string, SessionData>} */
const CACHE = new Map();

/** @typedef {{ nombre: string|null, barrio: string|null, uva: string|null, estado: 'saludo'|'activo', historial: Array<{rol: 'user'|'assistant', mensaje: string}>, lastActivity: number }} SessionData */

function _vacia() {
  return { nombre: null, barrio: null, uva: null, estado: 'saludo', historial: [], lastActivity: Date.now() };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Obtiene la sesión del usuario.
 * Si no está en caché o expiró, la recarga desde Supabase memoria_agente.
 * @param {string} sessionId
 * @returns {Promise<SessionData>}
 */
export async function getSession(sessionId) {
  const entry = CACHE.get(sessionId);

  if (entry) {
    if (Date.now() - entry.lastActivity > TTL_MS) {
      CACHE.delete(sessionId);
    } else {
      entry.lastActivity = Date.now();
      return entry;
    }
  }

  // Cache miss → cargar de Supabase
  try {
    const [nombre, barrio, uva] = await Promise.all([
      getMemoria(sessionId, 'nombre'),
      getMemoria(sessionId, 'barrio'),
      getMemoria(sessionId, 'uva'),
    ]);
    const estado = barrio && uva ? 'activo' : 'saludo';
    const session = { nombre, barrio, uva, estado, historial: [], lastActivity: Date.now() };
    CACHE.set(sessionId, session);
    return session;
  } catch {
    const session = _vacia();
    CACHE.set(sessionId, session);
    return session;
  }
}

/**
 * Actualiza la sesión en caché y persiste en Supabase de forma asíncrona.
 * @param {string} sessionId
 * @param {Partial<SessionData>} updates
 */
export function setSession(sessionId, updates) {
  const current = CACHE.get(sessionId) || _vacia();
  const next = { ...current, ...updates, lastActivity: Date.now() };
  CACHE.set(sessionId, next);

  // Persistir async — no bloquea la respuesta al usuario
  if (Object.hasOwn(updates, 'nombre')) {
    guardarMemoria(sessionId, 'nombre', updates.nombre ?? null).catch(() => {});
  }
  if (Object.hasOwn(updates, 'barrio')) {
    guardarMemoria(sessionId, 'barrio', updates.barrio ?? null).catch(() => {});
  }
  if (Object.hasOwn(updates, 'uva')) {
    guardarMemoria(sessionId, 'uva', updates.uva ?? null).catch(() => {});
  }
}

/**
 * Elimina la sesión del caché (para resets manuales).
 * @param {string} sessionId
 */
export function deleteSession(sessionId) {
  CACHE.delete(sessionId);
}

/**
 * Estadísticas del caché para monitoreo.
 */
export function estadoCache() {
  return { sesiones: CACHE.size, ids: [...CACHE.keys()] };
}

/**
 * Limpia todas las sesiones cargadas en memoria.
 */
export function limpiarCacheSesiones() {
  CACHE.clear();
}

// ─── Limpieza automática cada 5 minutos ──────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [id, entry] of CACHE.entries()) {
    if (now - entry.lastActivity > TTL_MS) {
      CACHE.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[SessionCache] 🧹 ${removed} sesiones expiradas. Activas: ${CACHE.size}`);
  }
}, 5 * 60 * 1000);
