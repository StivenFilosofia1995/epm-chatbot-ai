/**
 * chat-control.js
 *
 * Controla si un chat está siendo atendido por el BOT o por un HUMANO.
 * - Cuando un humano responde desde la API → el bot se silencia.
 * - Después de HUMAN_TAKEOVER_TIMEOUT_MINUTES sin actividad → vuelve el bot.
 */

import { supabase } from '../services/supabase.js';

const TIMEOUT_MINUTOS = parseInt(process.env.HUMAN_TAKEOVER_TIMEOUT_MINUTES || '30');

/**
 * Inicializa el registro de control si no existe (chat nuevo).
 * @param {string} jid
 */
export async function inicializarChat(jid) {
  const { data } = await supabase
    .from('chat_control')
    .select('jid')
    .eq('jid', jid)
    .single();

  if (!data) {
    await supabase
      .from('chat_control')
      .insert({ jid, modo: 'bot' });
  }
}

/**
 * Verifica si el bot debe responder este chat.
 * @param {string} jid
 * @returns {Promise<boolean>} true = bot responde | false = humano tiene el control
 */
export async function botDebeResponder(jid) {
  const { data } = await supabase
    .from('chat_control')
    .select('modo, ultimo_mensaje_humano')
    .eq('jid', jid)
    .single();

  // Chat nuevo → bot responde
  if (!data) return true;

  // Modo bot → responde
  if (data.modo === 'bot') return true;

  // Modo humano → verificar timeout
  if (data.ultimo_mensaje_humano) {
    const ultimoMensaje = new Date(data.ultimo_mensaje_humano);
    const minutosTranscurridos = (Date.now() - ultimoMensaje.getTime()) / 1000 / 60;

    if (minutosTranscurridos > TIMEOUT_MINUTOS) {
      await devolverAlBot(jid, 'timeout automático');
      return true;
    }
  }

  // Humano tiene el control
  return false;
}

/**
 * El humano toma control de un chat (silencia el bot).
 * @param {string} jid
 * @param {string} agente  — nombre del agente
 */
export async function tomarControlHumano(jid, agente = 'agente') {
  await supabase
    .from('chat_control')
    .upsert({
      jid,
      modo: 'humano',
      tomado_por: agente,
      tomado_at: new Date().toISOString(),
      ultimo_mensaje_humano: new Date().toISOString(),
    }, { onConflict: 'jid' });

  console.log(`[ChatControl] 👤 ${agente} tomó control de ${jid}`);
}

/**
 * Devuelve el chat al bot.
 * @param {string} jid
 * @param {string} razon
 */
export async function devolverAlBot(jid, razon = 'manual') {
  await supabase
    .from('chat_control')
    .upsert({
      jid,
      modo: 'bot',
      tomado_por: null,
      tomado_at: null,
      ultimo_mensaje_humano: null,
    }, { onConflict: 'jid' });

  console.log(`[ChatControl] 🤖 Bot recuperó control de ${jid} (${razon})`);
}

/**
 * Registra actividad humana en un chat (renueva el timeout).
 * @param {string} jid
 */
export async function registrarActividadHumana(jid) {
  await supabase
    .from('chat_control')
    .update({ ultimo_mensaje_humano: new Date().toISOString() })
    .eq('jid', jid);
}

/**
 * Retorna todos los chats que están en modo humano.
 * @returns {Promise<Array>}
 */
export async function obtenerChatsEnModoHumano() {
  const { data } = await supabase
    .from('chat_control')
    .select('jid, tomado_por, tomado_at, ultimo_mensaje_humano')
    .eq('modo', 'humano')
    .order('tomado_at', { ascending: false });

  return data || [];
}
