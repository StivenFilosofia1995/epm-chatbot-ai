/**
 * sent-message-cache.js
 *
 * Caché en memoria de mensajes salientes recientes, requerido por el
 * callback `getMessage` de Baileys.
 *
 * Cuando el destinatario no logra descifrar un mensaje en el primer intento
 * (muy común al establecer una sesión de cifrado nueva — el caso típico de
 * contactos @lid, ver bug conocido de Baileys:
 * github.com/WhiskeySockets/Baileys/issues/1767), WhatsApp le pide al
 * remitente que reenvíe ese mensaje. Baileys cumple esa solicitud llamando a
 * `getMessage(key)`. Sin un `getMessage` que devuelva el contenido original,
 * Baileys no tiene nada que reenviar, el reintento del protocolo nunca se
 * completa, y el destinatario queda con "Esperando este mensaje" para siempre
 * — aunque `sock.sendMessage()` no haya lanzado ningún error.
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutos — suficiente para el reintento automático del protocolo
const cache = new Map(); // id de mensaje -> { contenido, expira }

/** Guarda el contenido de un mensaje recién enviado, indexado por su id. */
export function guardarMensajeEnviado(id, contenido) {
  if (!id) return;
  cache.set(id, { contenido, expira: Date.now() + TTL_MS });
}

/** Usado como callback `getMessage` de Baileys. */
export function obtenerMensajeEnviado(id) {
  const entry = cache.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expira) {
    cache.delete(id);
    return undefined;
  }
  return entry.contenido;
}

// Limpieza periódica para no acumular memoria indefinidamente
setInterval(() => {
  const ahora = Date.now();
  for (const [id, entry] of cache) {
    if (ahora > entry.expira) cache.delete(id);
  }
}, 5 * 60 * 1000);
