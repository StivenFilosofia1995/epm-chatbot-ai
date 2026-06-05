/**
 * session-cache.js
 *
 * Caché de sesiones con tres niveles:
 *   L1 — Map en memoria    (más rápido, se pierde al reiniciar)
 *   L2 — Redis             (persiste entre reinicios, si REDIS_URL está configurado)
 *   L3 — Supabase          (fuente de verdad permanente)
 *
 * TTL: 30 min de inactividad → expira en Redis y en la limpieza del Map.
 */

import { redis } from './redis-client.js';
import { getMemoria, guardarMemoria } from '../services/supabase.js';

const TTL_MS      = 30 * 60 * 1000; // 30 minutos en ms
const TTL_SECONDS = 30 * 60;         // 30 minutos en segundos (para Redis)
const KEY_PREFIX  = 'session:';

/** @type {Map<string, SessionData>} */
const MEMORY = new Map();

/** @typedef {{ nombre: string|null, barrio: string|null, uva: string|null, estado: 'saludo'|'activo', historial: Array<{rol: 'user'|'assistant', mensaje: string}>, lastActivity: number }} SessionData */

function _vacia() {
  return { nombre: null, barrio: null, uva: null, estado: 'saludo', historial: [], lastActivity: Date.now() };
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

async function _rGet(sessionId) {
  if (!redis) return null;
  try {
    const raw = await redis.get(`${KEY_PREFIX}${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function _rSet(sessionId, data) {
  if (!redis) return;
  try {
    await redis.setex(`${KEY_PREFIX}${sessionId}`, TTL_SECONDS, JSON.stringify(data));
  } catch { /* silencioso */ }
}

async function _rDel(sessionId) {
  if (!redis) return;
  try { await redis.del(`${KEY_PREFIX}${sessionId}`); } catch { /* silencioso */ }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Obtiene la sesión del usuario.
 * L1 → L2 (Redis) → L3 (Supabase)
 */
export async function getSession(sessionId) {
  // L1: Map en memoria
  const mem = MEMORY.get(sessionId);
  if (mem) {
    if (Date.now() - mem.lastActivity > TTL_MS) {
      MEMORY.delete(sessionId);
    } else {
      mem.lastActivity = Date.now();
      return mem;
    }
  }

  // L2: Redis
  const cached = await _rGet(sessionId);
  if (cached) {
    cached.lastActivity = Date.now();
    if (!Array.isArray(cached.historial)) cached.historial = [];
    MEMORY.set(sessionId, cached);
    return cached;
  }

  // L3: Supabase
  try {
    const [nombre, barrio, uva] = await Promise.all([
      getMemoria(sessionId, 'nombre'),
      getMemoria(sessionId, 'barrio'),
      getMemoria(sessionId, 'uva'),
    ]);
    const estado = barrio && uva ? 'activo' : 'saludo';
    const session = { nombre, barrio, uva, estado, historial: [], lastActivity: Date.now() };
    MEMORY.set(sessionId, session);
    _rSet(sessionId, session).catch(() => {});
    return session;
  } catch {
    const session = _vacia();
    MEMORY.set(sessionId, session);
    return session;
  }
}

/**
 * Actualiza la sesión en L1 + L2 y persiste en L3 de forma asíncrona.
 */
export function setSession(sessionId, updates) {
  const current = MEMORY.get(sessionId) || _vacia();
  const next = { ...current, ...updates, lastActivity: Date.now() };
  MEMORY.set(sessionId, next);

  // L2 Redis — async fire-and-forget
  _rSet(sessionId, next).catch(() => {});

  // L3 Supabase — solo los campos persistentes
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
 * Elimina la sesión de todos los niveles de caché.
 */
export function deleteSession(sessionId) {
  MEMORY.delete(sessionId);
  _rDel(sessionId).catch(() => {});
}

/** Estadísticas del caché en memoria para monitoreo. */
export function estadoCache() {
  return { sesiones: MEMORY.size, ids: [...MEMORY.keys()] };
}

/** Limpia todas las sesiones del Map en memoria (no toca Redis ni Supabase). */
export function limpiarCacheSesiones() {
  MEMORY.clear();
}

// ─── Limpieza automática cada 5 minutos ──────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [id, entry] of MEMORY.entries()) {
    if (now - entry.lastActivity > TTL_MS) {
      MEMORY.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[SessionCache] 🧹 ${removed} sesiones expiradas. Activas: ${MEMORY.size}`);
  }
}, 5 * 60 * 1000);
