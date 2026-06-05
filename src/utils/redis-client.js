/**
 * redis-client.js
 *
 * Cliente Redis singleton con graceful fallback:
 * - Si REDIS_URL está definida → conecta a Redis (Railway Redis o Upstash)
 * - Si no → devuelve null y el sistema usa caché en memoria (comportamiento anterior)
 */

import Redis from 'ioredis';

let redis = null;

const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    retryStrategy(times) {
      if (times > 5) return null; // deja de reintentar
      return Math.min(times * 500, 3000);
    },
    tls: REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });

  redis.on('connect', () => console.log('[Redis] ✓ Conectado'));
  redis.on('ready',   () => console.log('[Redis] ✓ Listo para comandos'));
  redis.on('error',   (err) => console.warn('[Redis] Error:', err.message));
  redis.on('close',   () => console.warn('[Redis] Conexión cerrada'));
} else {
  console.log('[Redis] REDIS_URL no configurada — usando caché en memoria');
}

export { redis };
export default redis;
