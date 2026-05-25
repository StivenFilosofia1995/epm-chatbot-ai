/**
 * generate-qr.js
 *
 * Ejecutar con: npm run qr
 *
 * Borra la sesión guardada en Supabase y reinicia para mostrar el QR de nuevo.
 * Útil cuando cambiaste de número o la sesión está corrupta.
 */

import 'dotenv/config';
import { deleteSession } from '../src/whatsapp/session-store.js';
import { iniciarWhatsApp } from '../src/whatsapp/whatsapp.js';

console.log('[QR] 🗑  Borrando sesión anterior...');
await deleteSession();
console.log('[QR] ✅ Sesión borrada. Iniciando para mostrar nuevo QR...\n');
await iniciarWhatsApp();
