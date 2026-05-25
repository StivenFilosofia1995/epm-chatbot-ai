/**
 * api.js  (capa WhatsApp)
 *
 * API REST para que el agente humano pueda:
 * - Ver todos los chats
 * - Tomar control de un chat (silencia el bot)
 * - Enviar mensajes como humano
 * - Devolver el chat al bot
 * - Ver historial de mensajes
 * - Consultar estado de la conexión WhatsApp
 */

import express from 'express';
import { getSock, getLastQRInfo } from './whatsapp.js';
import { supabase } from '../services/supabase.js';
import {
  tomarControlHumano,
  devolverAlBot,
  registrarActividadHumana,
  obtenerChatsEnModoHumano,
} from './chat-control.js';

export const waRouter = express.Router();

// Middleware: verificar ADMIN_API_KEY
const auth = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.apikey;
  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ error: 'ADMIN_API_KEY no configurada' });
  }
  if (key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'API key inválida' });
  }
  next();
};

// ─── GET /wa/chats ─── lista todos los contactos recientes ──────────────────
waRouter.get('/chats', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('contactos')
    .select(`
      jid, nombre, telefono, ultimo_contacto, total_mensajes,
      chat_control(modo, tomado_por, ultimo_mensaje_humano)
    `)
    .order('ultimo_contacto', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── GET /wa/chats/humano ─── chats en modo humano ───────────────────────────
waRouter.get('/chats/humano', auth, async (req, res) => {
  const chats = await obtenerChatsEnModoHumano();
  res.json(chats);
});

// ─── GET /wa/mensajes/:jid ─── historial de un chat ──────────────────────────
waRouter.get('/mensajes/:jid', auth, async (req, res) => {
  const { jid } = req.params;
  const limite = Math.min(Number.parseInt(req.query.limite || '50', 10), 200);

  const { data, error } = await supabase
    .from('mensajes')
    .select('*')
    .eq('jid', decodeURIComponent(jid))
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) return res.status(500).json({ error: error.message });
  const ordered = (data || []).toReversed();
  res.json(ordered);
});

// ─── POST /wa/tomar ─── humano toma control del chat ─────────────────────────
// Body: { jid, agente }
waRouter.post('/tomar', auth, async (req, res) => {
  const { jid, agente = 'agente' } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid requerido' });

  await tomarControlHumano(jid, agente);
  res.json({ ok: true, mensaje: `Control de ${jid} asignado a ${agente}` });
});

// ─── POST /wa/devolver ─── devolver chat al bot ───────────────────────────────
// Body: { jid }
waRouter.post('/devolver', auth, async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid requerido' });

  await devolverAlBot(jid, 'manual por agente');
  res.json({ ok: true, mensaje: `Bot recuperó control de ${jid}` });
});

// ─── POST /wa/enviar ─── enviar mensaje como humano ──────────────────────────
// Body: { jid, texto, agente }
waRouter.post('/enviar', auth, async (req, res) => {
  const { jid, texto, agente = 'agente' } = req.body;
  if (!jid || !texto) return res.status(400).json({ error: 'jid y texto requeridos' });

  // Limitar longitud del mensaje
  if (texto.length > 4096) return res.status(400).json({ error: 'Mensaje demasiado largo (máx 4096 chars)' });

  const sock = getSock();
  if (!sock) return res.status(503).json({ error: 'WhatsApp no conectado aún' });

  try {
    await sock.sendMessage(jid, { text: texto });
    await registrarActividadHumana(jid);

    await supabase.from('mensajes').insert({
      jid,
      wamid: `human-${Date.now()}`,
      direccion: 'saliente',
      de: agente,
      contenido: texto,
      enviado_por: 'humano',
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /wa/status ─── estado de la conexión WhatsApp ────────────────────────
waRouter.get('/status', auth, async (req, res) => {
  const sock = getSock();
  res.json({
    conectado: !!sock?.user,
    numero: sock?.user?.id?.split(':')[0] || null,
    timestamp: new Date().toISOString(),
  });
});

// ─── GET /wa/qr ─── QR actual para login en dashboard ───────────────────────
waRouter.get('/qr', auth, async (req, res) => {
  const sock = getSock();
  const qrInfo = getLastQRInfo();

  res.json({
    conectado: !!sock?.user,
    qr: qrInfo.qr,
    generado_en: qrInfo.generado_en,
    esperando_qr: qrInfo.esperando_qr,
  });
});
