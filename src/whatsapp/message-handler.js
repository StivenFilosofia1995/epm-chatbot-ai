/**
 * message-handler.js
 *
 * Procesa cada mensaje entrante de WhatsApp.
 * Integra la capa Baileys con el chat-agent.js del sistema UVA Medellín:
 *   1. Filtra mensajes irrelevantes (grupos, estados, propios)
 *   2. Verifica si el bot debe responder (o hay un humano atendiendo)
 *   3. Delega al chat-agent.js (barrio → UVA → programación → Claude)
 *   4. Envía la respuesta por WhatsApp y guarda el registro del contacto
 */

import { supabase } from '../services/supabase.js';
import { procesarMensaje } from '../agents/chat-agent.js';
import { botDebeResponder, inicializarChat } from './chat-control.js';
import { guardarMensajeEnviado } from './sent-message-cache.js';

/**
 * Procesa un mensaje entrante de WhatsApp.
 * @param {object} sock  — instancia de Baileys
 * @param {object} msg   — mensaje de Baileys
 */
export async function procesarMensajeWhatsApp(sock, msg) {
  const jid = msg.key.remoteJid;

  // Ignorar grupos, estados y mensajes propios
  if (jid.endsWith('@g.us'))       return;
  if (jid === 'status@broadcast') return;
  if (msg.key.fromMe)             return;

  const texto = extraerTexto(msg);
  if (!texto) return; // imagen, sticker, audio sin caption, etc.

  const telefono = jid.replace('@s.whatsapp.net', '');
  const wamid    = msg.key.id;
  const nombre   = msg.pushName || telefono;

  console.log(`[WA-MSG] 📩 ${nombre} (${telefono}): ${texto.slice(0, 80)}`);

  // 1. Inicializar registro de control si es chat nuevo
  await inicializarChat(jid);

  // 2. Guardar mensaje entrante
  await guardarMensaje({ jid, wamid, direccion: 'entrante', de: nombre, contenido: texto, enviado_por: 'humano' });

  // 3. Actualizar contacto
  await actualizarContacto(jid, nombre, telefono);

  // 4. ¿El bot debe responder?
  const debeResponder = await botDebeResponder(jid);
  if (!debeResponder) {
    console.log(`[WA-MSG] 🔇 Chat ${telefono} en modo humano — bot silenciado`);
    return;
  }

  // 5. Llamar al chat-agent.js (lógica UVA Medellín completa)
  //    Usamos el JID como sessionId para mantener historial por contacto
  let respuesta;
  try {
    const resultado = await procesarMensaje({ sessionId: jid, mensaje: texto });
    respuesta = resultado.respuesta;
  } catch (err) {
    console.error('[WA-MSG] Error en chat-agent:', err.message);
    respuesta = 'Tuve un problema técnico. Por favor intentá de nuevo en un momento. 🙏';
  }

  if (!respuesta) return;

  // 6. Enviar respuesta por WhatsApp
  // remoteJidAlt (Baileys v7): JID alterno basado en número de teléfono para
  // el mismo contacto @lid. Si existe, puede tener una sesión de cifrado ya
  // establecida (con el teléfono principal) que el JID @lid puro no tiene.
  const jidRespuesta = msg.key.remoteJidAlt || jid;
  const contenido = { text: respuesta };

  // Anti-baneo: WhatsApp penaliza patrones de respuesta instantánea/robótica
  // como señal de comportamiento de bot. Simular "escribiendo..." con una
  // pausa proporcional a la longitud de la respuesta imita el tiempo humano
  // real de redacción — no arregla la entrega a @lid, pero reduce el riesgo
  // de que la cuenta sea señalada por comportamiento automatizado.
  await _simularEscritura(sock, jidRespuesta, respuesta);

  const enviado = await sock.sendMessage(jidRespuesta, contenido);
  // Necesario para que Baileys pueda reenviar este mensaje si WhatsApp lo
  // solicita (ver sent-message-cache.js) — sin esto, el reintento normal del
  // protocolo Signal no tiene nada que reenviar y falla en silencio.
  guardarMensajeEnviado(enviado?.key?.id, contenido);
  console.log(`[WA-MSG] 🤖 Bot respondió a ${telefono} (via ${jidRespuesta}): ${respuesta.slice(0, 80)}...`);

  // 7. Guardar respuesta del bot
  await guardarMensaje({
    jid,
    wamid: `bot-${Date.now()}`,
    direccion: 'saliente',
    de: 'bot',
    contenido: respuesta,
    enviado_por: 'bot',
  });
}

// ─── Helpers privados ────────────────────────────────────────────────────────

/**
 * Simula tiempo de escritura humano antes de enviar: muestra "escribiendo..."
 * y espera una pausa proporcional a la longitud del texto (con variación
 * aleatoria), en vez de responder instantáneamente. Nunca debe bloquear el
 * envío real si algo falla (p. ej. el contacto no permite ver presencia).
 */
async function _simularEscritura(sock, jid, texto) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
  } catch { /* no crítico */ }

  const palabras = texto.split(/\s+/).filter(Boolean).length;
  const baseMs = 500 + palabras * 180; // ~0.18s por palabra + base de 0.5s
  const jitterMs = Math.random() * 900;
  const esperaMs = Math.min(baseMs + jitterMs, 9000); // tope de 9s
  await new Promise((resolve) => setTimeout(resolve, esperaMs));

  try {
    await sock.sendPresenceUpdate('paused', jid);
  } catch { /* no crítico */ }
}

function extraerTexto(msg) {
  const m = msg.message;
  if (!m) return null;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    null
  );
}

async function guardarMensaje({ jid, wamid, direccion, de, contenido, enviado_por }) {
  const { error } = await supabase
    .from('mensajes')
    .upsert(
      { jid, wamid, direccion, de, contenido, enviado_por },
      { onConflict: 'wamid', ignoreDuplicates: true }
    );
  if (error) console.error('[WA-DB] Error guardando mensaje:', error.message);
}

async function actualizarContacto(jid, nombre, telefono) {
  const { data } = await supabase
    .from('contactos')
    .select('total_mensajes')
    .eq('jid', jid)
    .single();

  await supabase.from('contactos').upsert({
    jid,
    nombre,
    telefono,
    ultimo_contacto: new Date().toISOString(),
    total_mensajes: (data?.total_mensajes || 0) + 1,
  }, { onConflict: 'jid' });
}
