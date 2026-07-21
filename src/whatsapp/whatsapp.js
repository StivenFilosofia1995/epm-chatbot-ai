/**
 * whatsapp.js
 *
 * Núcleo de la conexión WhatsApp con Baileys.
 * - Reconexión INFINITA con backoff exponencial (cap 60s) — nunca se rinde
 * - Guarda sesión en Supabase (no necesita QR al reiniciar)
 * - Watchdog cada 5 min: fuerza reconexión si el socket está muerto
 */

// De vuelta a v7: se confirmó que la falla de entrega NO era específica de
// la versión (v6 con sesión nueva tuvo el mismo problema) — es la sesión de
// cifrado que este dispositivo vinculado no logra establecer con contactos
// @lid. v7 es la única versión con las herramientas de mapeo LID/PN
// (sock.signalRepository.lidMapping, MessageKey.remoteJidAlt) relevantes
// para intentar resolver esto. makeWASocket ahora es exportación por defecto.
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

import { procesarMensajeWhatsApp } from './message-handler.js';
import { useSupabaseAuthState, deleteSession } from './session-store.js';
import { obtenerMensajeEnviado } from './sent-message-cache.js';

const logger = pino({ level: 'silent' });

// ─── Estado global ────────────────────────────────────────────────────────────

let sock            = null;
let reconectando    = false;   // guard: evita programar reconexiones duplicadas
let iniciando       = false;   // guard: evita que iniciarWhatsApp() corra dos veces en paralelo
let intentos        = 0;       // contador de reintentos consecutivos
let esperandoQR     = false;
let qrEscaneado     = false;
let ultimoQR        = null;
let ultimoQRTs      = null;

const BACKOFF_MAX_MS = 60_000; // máximo 60s entre reintentos

// ─── Handlers globales de errores no capturados ───────────────────────────────

process.on('unhandledRejection', (reason) => {
  console.error('[WA] ⚠ Promise no capturada:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[WA] ⚠ Excepción no capturada:', err.message);
  // No hacer process.exit — Railway ya monitorea el proceso
});

// ─── API pública ──────────────────────────────────────────────────────────────

export function getSock()        { return sock; }
export function getLastQRInfo()  { return { qr: ultimoQR, generado_en: ultimoQRTs, esperando_qr: esperandoQR }; }

// ─── Reconexión con backoff ───────────────────────────────────────────────────

function _programarReconexion(delayMs) {
  if (reconectando) return; // ya hay una en curso
  reconectando = true;
  intentos++;

  const espera = Math.min(Math.max(delayMs, 1000 * Math.pow(2, Math.min(intentos - 1, 6))), BACKOFF_MAX_MS);
  console.log(`[WA] 🔄 Reconectando en ${(espera / 1000).toFixed(0)}s (intento ${intentos})...`);

  setTimeout(async () => {
    reconectando = false;
    await iniciarWhatsApp();
  }, espera);
}

// ─── Watchdog: verifica cada 5 min que el socket siga vivo ───────────────────

setInterval(() => {
  const conectado = !!sock?.user;
  if (!conectado && !reconectando && !esperandoQR) {
    console.warn('[WA] 🐕 Watchdog: socket no conectado — forzando reconexión...');
    _programarReconexion(3000);
  }
}, 5 * 60 * 1000);

// ─── Cierre limpio del socket anterior ────────────────────────────────────────
// CRÍTICO: antes, cada reconexión creaba un socket nuevo SIN cerrar el anterior.
// El socket viejo quedaba "zombi" con sus propios listeners activos; si ese
// zombi también disparaba una reconexión, nacía otro socket más — y con varios
// sockets vivos autenticados con las MISMAS credenciales, WhatsApp los expulsa
// entre sí sin parar (código 440 / connectionReplaced) en bucle infinito, y
// cualquier mensaje que el bot alcance a generar puede fallar al enviarse
// porque su socket resultó ser el que quedó "afuera" en ese instante.
function _cerrarSocketAnterior(viejoSock) {
  if (!viejoSock) return;
  try { viejoSock.ev.removeAllListeners(); } catch { /* noop */ }
  try { viejoSock.end(new Error('Reemplazado por una nueva conexión')); } catch { /* noop */ }
}

// ─── Inicio de la conexión ────────────────────────────────────────────────────

export async function iniciarWhatsApp() {
  // Reentrancia: si ya hay una inicialización en curso (dos rutas de
  // reconexión disparándose casi al mismo tiempo), se ignora esta llamada
  // duplicada en vez de crear un segundo socket en paralelo.
  if (iniciando) {
    console.log('[WA] Ya hay una inicialización en curso — se omite llamada duplicada.');
    return sock;
  }
  iniciando = true;

  try {
    console.log('[WA] 🔌 Iniciando conexión a WhatsApp...');

    // Cerrar cualquier socket previo ANTES de crear el nuevo — nunca deben
    // quedar dos sockets vivos autenticados con la misma sesión.
    _cerrarSocketAnterior(sock);
    sock = null;

    const { state, saveCreds } = await useSupabaseAuthState();
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[WA] Baileys v${version.join('.')}`);

    const miSock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      browser: ['UVA Medellín Bot', 'Chrome', '1.0.0'],
      // true (antes false): sin esto, el bot nunca heredaba las sesiones de
      // cifrado que el teléfono principal ya tenía con contactos que le
      // escriben por primera vez al bot — posible causa de que el envío
      // fallara en silencio para contactos @lid.
      syncFullHistory: true,
      markOnlineOnConnect: false,
      // Keepalive: ping WhatsApp cada 25s para mantener la conexión activa
      keepAliveIntervalMs: 25_000,
      // CRÍTICO: sin esto, cuando WhatsApp pide reenviar un mensaje que el
      // destinatario no pudo descifrar (mecanismo normal del protocolo al
      // establecer sesión nueva — el caso típico de contactos @lid, ver
      // github.com/WhiskeySockets/Baileys/issues/1767), Baileys no tiene
      // nada que reenviar y el destinatario queda esperando ese mensaje
      // para siempre, sin que sendMessage() reporte ningún error.
      getMessage: async (key) => obtenerMensajeEnviado(key.id),
    });
    sock = miSock;

    // ─── creds.update ────────────────────────────────────────────────────────
    miSock.ev.on('creds.update', () => {
      if (sock !== miSock) return; // este socket ya fue reemplazado — ignorar
      if (esperandoQR) {
        qrEscaneado = true;
        console.log('[WA] 🔐 QR escaneado. Completando autenticación...');
      }
      saveCreds();
    });

    // ─── connection.update ───────────────────────────────────────────────────
    miSock.ev.on('connection.update', async (update) => {
      if (sock !== miSock) return; // evento tardío de un socket ya reemplazado
      const { connection, lastDisconnect, qr } = update;

      // QR nuevo disponible
      if (qr) {
        esperandoQR  = true;
        qrEscaneado  = false;
        ultimoQR     = qr;
        ultimoQRTs   = new Date().toISOString();
        console.log('\n[WA] 📱 Escanea este QR con WhatsApp Business:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n[WA] El QR expira en ~60 s. Si vence, se genera uno nuevo automáticamente.\n');
      }

      // Conexión exitosa
      if (connection === 'open') {
        esperandoQR = false;
        qrEscaneado = false;
        ultimoQR    = null;
        intentos    = 0; // resetear contador en conexión exitosa
        console.log('[WA] ✅ Conectado a WhatsApp!');
        console.log(`[WA] Número: ${miSock.user?.id?.split(':')[0]}`);
      }

      // Conexión cerrada
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[WA] 🔌 Conexión cerrada. Código: ${statusCode || 'desconocido'}`);

        // QR escaneado con éxito → reconectar para cargar la sesión nueva
        if (qrEscaneado) {
          esperandoQR = false;
          qrEscaneado = false;
          intentos    = 0;
          console.log('[WA] 🔐 Pairing completo. Cargando sesión autenticada...');
          setTimeout(iniciarWhatsApp, 1500);
          return;
        }

        // QR mostrado pero expiró sin escanear → generar nuevo QR
        if (esperandoQR) {
          esperandoQR = false;
          console.log('[WA] ⏱ QR expirado. Generando nuevo QR...');
          setTimeout(iniciarWhatsApp, 2000);
          return;
        }

        // Sesión revocada por WhatsApp → borrar y pedir nuevo QR
        if (
          statusCode === DisconnectReason.loggedOut ||
          statusCode === DisconnectReason.multideviceMismatch
        ) {
          console.log('[WA] ⚠ Sesión revocada. Eliminando sesión y generando nuevo QR...');
          intentos = 0;
          await deleteSession().catch(() => {});
          setTimeout(iniciarWhatsApp, 2000);
          return;
        }

        // Restart requerido por Baileys (sin borrar sesión)
        if (statusCode === DisconnectReason.restartRequired) {
          console.log('[WA] ♻ Restart requerido por Baileys...');
          intentos = 0;
          setTimeout(iniciarWhatsApp, 1000);
          return;
        }

        // Código 440 — otra sesión se conectó con las MISMAS credenciales y
        // WhatsApp expulsó esta. Si esto se repite en bucle tras el fix de
        // cierre limpio de sockets, hay realmente otro proceso/servicio usando
        // esta misma sesión (revisar Railway: réplicas, deploys duplicados, o
        // un entorno local corriendo a la vez).
        if (statusCode === DisconnectReason.connectionReplaced) {
          console.warn('[WA] ⚠ Código 440 (connectionReplaced): otra sesión activa se conectó con estas mismas credenciales.');
          _programarReconexion(5000);
          return;
        }

        // Cualquier otro cierre → reconexión automática con backoff infinito
        _programarReconexion(2000);
      }
    });

    // ─── Mensajes entrantes ──────────────────────────────────────────────────
    miSock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (sock !== miSock) return; // evento tardío de un socket ya reemplazado
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          await procesarMensajeWhatsApp(miSock, msg);
        } catch (err) {
          console.error('[WA] Error procesando mensaje:', err.message);
        }
      }
    });

    // ─── Diagnóstico: estado real de entrega de mensajes salientes ───────────
    // Sin esto no había forma de saber si WhatsApp reportaba un error real
    // (contacto @lid sin mapping, sesión de cifrado no establecida, etc.) —
    // sock.sendMessage() no lanza excepción aunque el mensaje nunca se entregue.
    // status: 0 error | 1 pendiente | 2 servidor recibió | 3 entregado | 4 leído
    miSock.ev.on('messages.update', (actualizaciones) => {
      if (sock !== miSock) return;
      // Sin filtrar nada — un filtro anterior asumía la forma exacta del
      // payload y podía estar ocultando datos reales si v7 cambió la forma.
      for (const item of actualizaciones) {
        console.log(`[WA-STATUS] ${JSON.stringify(item)}`);
      }
    });

    // Confirmaciones de entrega/lectura de mensajes propios (distinto del
    // estado general de arriba) — puede traer info que messages.update no trae.
    miSock.ev.on('message-receipt.update', (recibos) => {
      if (sock !== miSock) return;
      for (const item of recibos) {
        console.log(`[WA-RECEIPT] ${JSON.stringify(item)}`);
      }
    });

    return miSock;
  } finally {
    iniciando = false;
  }
}
