/**
 * whatsapp.js
 *
 * Núcleo de la conexión WhatsApp con Baileys.
 * - Reconexión INFINITA con backoff exponencial (cap 60s) — nunca se rinde
 * - Guarda sesión en Supabase (no necesita QR al reiniciar)
 * - Watchdog cada 5 min: fuerza reconexión si el socket está muerto
 */

import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

import { procesarMensajeWhatsApp } from './message-handler.js';
import { useSupabaseAuthState, deleteSession } from './session-store.js';

const logger = pino({ level: 'silent' });

// ─── Estado global ────────────────────────────────────────────────────────────

let sock            = null;
let reconectando    = false;   // guard: evita inicios simultáneos
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

// ─── Inicio de la conexión ────────────────────────────────────────────────────

export async function iniciarWhatsApp() {
  console.log('[WA] 🔌 Iniciando conexión a WhatsApp...');

  const { state, saveCreds } = await useSupabaseAuthState();
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WA] Baileys v${version.join('.')}`);

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ['UVA Medellín Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Keepalive: ping WhatsApp cada 25s para mantener la conexión activa
    keepAliveIntervalMs: 25_000,
  });

  // ─── creds.update ──────────────────────────────────────────────────────────
  sock.ev.on('creds.update', () => {
    if (esperandoQR) {
      qrEscaneado = true;
      console.log('[WA] 🔐 QR escaneado. Completando autenticación...');
    }
    saveCreds();
  });

  // ─── connection.update ─────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
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
      console.log(`[WA] Número: ${sock.user?.id?.split(':')[0]}`);
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

      // Cualquier otro cierre → reconexión automática con backoff infinito
      _programarReconexion(2000);
    }
  });

  // ─── Mensajes entrantes ────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await procesarMensajeWhatsApp(sock, msg);
      } catch (err) {
        console.error('[WA] Error procesando mensaje:', err.message);
      }
    }
  });

  return sock;
}
