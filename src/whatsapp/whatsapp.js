/**
 * whatsapp.js
 *
 * Núcleo de la conexión WhatsApp con Baileys.
 * - Muestra QR en terminal la primera vez
 * - Reconecta automáticamente si se cae
 * - Guarda sesión en Supabase (no necesita QR al reiniciar)
 */

import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { procesarMensajeWhatsApp } from './message-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FOLDER = path.join(__dirname, '../../auth_info');

const logger = pino({ level: 'silent' });

// Evitar que errores no capturados maten el proceso — mostrarlos en su lugar
process.on('unhandledRejection', (reason) => {
  console.error('[WA] ⚠ Error no capturado (promise):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[WA] ⚠ Error no capturado (excepción):', err.message);
});

let sock = null;
let intentosReconexion = 0;
const MAX_INTENTOS = 5;
let esperandoQR = false;   // true mientras se muestra el QR sin escanear
let qrEscaneado  = false;  // true cuando creds.update disparó durante el QR (QR sí fue escaneado)
let ultimoQR = null;
let ultimoQRTs = null;

/**
 * Retorna la instancia activa del socket de Baileys.
 * Usada por api.js para enviar mensajes.
 */
export function getSock() {
  return sock;
}

export function getLastQRInfo() {
  return {
    qr: ultimoQR,
    generado_en: ultimoQRTs,
    esperando_qr: esperandoQR,
  };
}

/**
 * Inicia la conexión a WhatsApp.
 */
export async function iniciarWhatsApp() {
  console.log('[WA] 🔌 Iniciando conexión a WhatsApp...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WA] Usando Baileys v${version.join('.')}`);

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
  });

  // ─── Evento: actualización de credenciales ──────────────────────────────
  sock.ev.on('creds.update', () => {
    if (esperandoQR) {
      qrEscaneado = true;
      console.log('[WA] 🔐 QR escaneado. Completando autenticación...');
    }
    saveCreds();
  });

  // ─── Evento: QR / conexión ──────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      esperandoQR = true;
      qrEscaneado  = false;
      ultimoQR = qr;
      ultimoQRTs = new Date().toISOString();
      console.log('\n[WA] 📱 Escanea este QR con WhatsApp Business:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n[WA] El QR expira en ~60 s. Si vence, se genera uno nuevo automáticamente.\n');
    }

    if (connection === 'open') {
      esperandoQR  = false;
      qrEscaneado  = false;
      ultimoQR = null;
      intentosReconexion = 0;
      console.log('[WA] ✅ Conectado a WhatsApp exitosamente!');
      console.log(`[WA] Número: ${sock.user?.id?.split(':')[0]}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      // QR fue escaneado → los archivos ya se guardaron (saveCreds es síncrono en archivos)
      // Simplemente reconectar: la nueva sesión cargará los archivos actualizados
      if (qrEscaneado) {
        esperandoQR = false;
        qrEscaneado  = false;
        console.log('[WA] 🔐 Pairing completo. Iniciando sesión autenticada...');
        setTimeout(iniciarWhatsApp, 1500);
        return;
      }

      // QR mostrado pero NO escaneado → expiró, generar nuevo QR
      if (esperandoQR) {
        esperandoQR = false;
        console.log('[WA] ⏱ QR expirado sin escanear. Generando nuevo QR...');
        setTimeout(iniciarWhatsApp, 2000);
        return;
      }

      // Sesión rechazada por WhatsApp → borrar archivos de sesión y pedir QR nuevo
      if (statusCode === DisconnectReason.loggedOut) {
        console.log('[WA] ⚠ Sesión cerrada. Generando nuevo QR...');
        intentosReconexion = 0;
        // Borrar archivos de auth para forzar nuevo QR
        const { rmSync } = await import('node:fs');
        try { rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch {}
        setTimeout(iniciarWhatsApp, 2000);
        return;
      }

      // Caída de conexión post-autenticación — reintentar con backoff
      if (intentosReconexion < MAX_INTENTOS) {
        intentosReconexion++;
        const espera = Math.min(1000 * Math.pow(2, intentosReconexion), 30000);
        console.log(`[WA] 🔄 Reconectando en ${espera / 1000}s (intento ${intentosReconexion}/${MAX_INTENTOS})...`);
        setTimeout(iniciarWhatsApp, espera);
      } else {
        console.error('[WA] ❌ Máximo de reintentos alcanzado. Reinicia el servidor manualmente.');
      }
    }
  });

  // ─── Evento: mensaje entrante ────────────────────────────────────────────
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
