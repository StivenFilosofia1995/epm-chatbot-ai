/**
 * index.js
 * Servidor Express principal del sistema Agente UVA Medellín.
 * Expone los endpoints del chatbot y la API de programación.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { procesarMensaje } from './agents/chat-agent.js';
import { ejecutarCicloCompleto, iniciarScheduler, obtenerEstado } from './agents/scheduler-agent.js';
import { getProgramacionPorFecha, getProgramacion, getProgramacionPorFechas, insertarProgramacion } from './services/supabase.js';
import { ejecutarScraper } from './agents/scraper-agent.js';
import { extraerActividadesPlano } from './agents/parser-agent.js';
import { hoyISO, sumarDias } from './utils/date-helper.js';
import { iniciarWhatsApp, getSock, getLastQRInfo } from './whatsapp/whatsapp.js';
import { deleteSession } from './whatsapp/session-store.js';
import { deleteSession as deleteChatSession, limpiarCacheSesiones } from './utils/session-cache.js';
import { waRouter } from './whatsapp/api.js';
import { claudeConfigurado } from './services/groq.js';
import { supabaseConfigurado } from './services/supabase.js';

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const SCRAPER_ENABLED = String(process.env.ENABLE_SCRAPER || 'false').toLowerCase() === 'true';

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Logger de requests
app.use((req, res, next) => {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[Server] ${ts} ${req.method} ${req.path}`);
  next();
});

// CORS básico (ajustar en producción con dominios específicos)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Middleware de autenticación para endpoints protegidos ────────────────────
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.warn('[Server] ADVERTENCIA: ADMIN_API_KEY no está configurada.');
    return res.status(500).json({ error: 'Servidor mal configurado: falta ADMIN_API_KEY' });
  }

  if (!apiKey || apiKey !== adminKey) {
    return res.status(401).json({ error: 'No autorizado. Se requiere X-API-Key válida.' });
  }

  next();
}

// ─── Validación de input ──────────────────────────────────────────────────────
function validarMensajeChat(req, res, next) {
  const { mensaje, sessionId } = req.body;

  if (!mensaje || typeof mensaje !== 'string') {
    return res.status(400).json({ error: 'El campo "mensaje" es requerido y debe ser string.' });
  }

  if (mensaje.length > 1000) {
    return res.status(400).json({ error: 'El mensaje no puede superar los 1000 caracteres.' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'El campo "sessionId" es requerido.' });
  }

  // Sanitizar: solo permitir caracteres seguros en sessionId
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(sessionId)) {
    return res.status(400).json({ error: 'sessionId inválido. Use solo letras, números, guiones y guiones bajos (4-64 chars).' });
  }

  next();
}

// ═════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /
 * Landing operativo para evitar 404 en la raiz del servicio.
 */
app.get('/', (req, res) => {
  res.json({
    servicio: 'uva-bot-api',
    estado: 'ok',
    mensaje: 'Servicio desplegado correctamente en Railway.',
    health: '/health',
    endpoints: {
      chat: 'POST /chat',
      programacion: 'GET /programacion',
      scrape: 'POST /scrape',
      reconcile: 'POST /reconcile',
      wa_status: 'GET /wa/status',
      wa_qr: 'GET /wa/qr',
    },
    admin: '/admin',
  });
});

/**
 * GET /health
 * Health check para Railway y monitoreo externo.
 */
app.get('/health', (req, res) => {
  const scheduler = obtenerEstado();
  const sock = getSock();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: {
      activo: scheduler.activo,
      ultimaEjecucion: scheduler.ultimaEjecucion,
      estadoUltima: scheduler.estadoUltima,
    },
    integraciones: {
      // Si esto es false, el bot no puede generar NINGUNA respuesta con IA.
      anthropic_configurado: claudeConfigurado(),
      // Si esto es false, el bot no puede leer/guardar sesión, historial ni programación.
      supabase_configurado: supabaseConfigurado(),
      whatsapp_conectado: !!sock?.user,
    },
    version: '1.0.0',
  });
});

/**
 * POST /chat
 * Endpoint principal del chatbot.
 * Body: { sessionId: string, mensaje: string }
 * Response: { respuesta: string, uva: string|null, barrio: string|null, fecha: string }
 */
app.post('/chat', validarMensajeChat, async (req, res) => {
  const { sessionId, mensaje } = req.body;

  try {
    const resultado = await procesarMensaje({ sessionId, mensaje });
    res.json({
      ok: true,
      ...resultado,
    });
  } catch (err) {
    console.error('[Server] Error en /chat:', err.message);
    res.status(500).json({
      ok: false,
      error: 'Ocurrió un error procesando tu mensaje. Por favor intenta de nuevo.',
    });
  }
});

/**
 * GET /programacion
 * Consulta la programación de una UVA y fecha específica.
 * Query params:
 *   - uva: nombre de la UVA (opcional; si omitido, devuelve todas)
 *   - fecha: YYYY-MM-DD (opcional; default: hoy)
 */
app.get('/programacion', async (req, res) => {
  const uva = req.query.uva ? decodeURIComponent(req.query.uva) : null;
  const fecha = req.query.fecha || hoyISO();
  const vistaSemana = String(req.query.vista || req.query.semana || '').toLowerCase();
  const esSemana = vistaSemana === 'semana' || vistaSemana === 'true' || vistaSemana === '1';

  // Validar formato de fecha
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Use YYYY-MM-DD.' });
  }

  try {
    let actividades;
    if (esSemana) {
      const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(fecha, i));
      const todas = await getProgramacionPorFechas(fechas);
      actividades = uva ? todas.filter((a) => a.uva_nombre === uva) : todas;
    } else if (uva) {
      actividades = await getProgramacion(uva, fecha);
    } else {
      actividades = await getProgramacionPorFecha(fecha);
    }

    res.json({
      ok: true,
      fecha,
      vista: esSemana ? 'semana' : 'dia',
      hasta: esSemana ? sumarDias(fecha, 6) : fecha,
      uva: uva || 'todas',
      total: actividades.length,
      actividades,
    });
  } catch (err) {
    console.error('[Server] Error en /programacion:', err.message);
    res.status(500).json({ ok: false, error: 'Error consultando la programación.' });
  }
});

/**
 * POST /scrape
 * Trigger manual del scraper + parser. Protegido con API Key.
 * Header: X-API-Key: <ADMIN_API_KEY>
 */
app.post('/scrape', requireApiKey, async (req, res) => {
  if (!SCRAPER_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: 'Scraper desactivado por configuración (ENABLE_SCRAPER=false).',
    });
  }

  console.log('[Server] Trigger manual de scraping iniciado');

  // Responder inmediatamente y ejecutar en background
  res.json({
    ok: true,
    mensaje: 'Scraping iniciado en background. Puede consultar el estado en /health.',
    iniciado: new Date().toISOString(),
  });

  // Ejecutar en background (no await para no bloquear la respuesta)
  ejecutarCicloCompleto().then((resultado) => {
    console.log(`[Server] Scraping manual completado: ${JSON.stringify(resultado)}`);
  }).catch((err) => {
    console.error(`[Server] Scraping manual falló: ${err.message}`);
  });
});

/**
 * POST /reconcile
 * Compara Web/PDF real vs Supabase y opcionalmente sincroniza.
 * Header: X-API-Key: <ADMIN_API_KEY>
 * Body opcional: { apply: boolean }
 */
app.post('/reconcile', requireApiKey, async (req, res) => {
  if (!SCRAPER_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: 'Reconcile desactivado por configuración (ENABLE_SCRAPER=false).',
    });
  }

  const apply = !!req.body?.apply;

  try {
    const resultadoScraper = await ejecutarScraper();
    const { actividades: webActividades } = await extraerActividadesPlano(
      resultadoScraper.buffer,
      resultadoScraper.textoOCR || null,
    );

    const fechas = [...new Set(webActividades.map((a) => a.fecha).filter(Boolean))];
    const dbActividades = await getProgramacionPorFechas(fechas);

    const norm = (v) => (v || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
    const keyOf = (a) => [
      norm(a.uva_nombre),
      norm(a.fecha),
      norm(a.hora_inicio),
      norm(a.hora_fin),
      norm(a.actividad),
    ].join('|');

    const webMap = new Map(webActividades.map((a) => [keyOf(a), a]));
    const dbMap = new Map(dbActividades.map((a) => [keyOf(a), a]));

    const faltanEnDB = [];
    const sobranEnDB = [];

    for (const [k, a] of webMap) if (!dbMap.has(k)) faltanEnDB.push(a);
    for (const [k, a] of dbMap) if (!webMap.has(k)) sobranEnDB.push(a);

    let sincronizado = false;
    if (apply) {
      await insertarProgramacion(webActividades);
      sincronizado = true;
    }

    return res.json({
      ok: true,
      source: {
        url: resultadoScraper.url,
        tipo: resultadoScraper.textoOCR ? 'ocr' : 'pdf',
      },
      resumen: {
        webTotal: webActividades.length,
        dbTotal: dbActividades.length,
        faltanEnDB: faltanEnDB.length,
        sobranEnDB: sobranEnDB.length,
        fechas,
      },
      muestras: {
        faltanEnDB: faltanEnDB.slice(0, 10),
        sobranEnDB: sobranEnDB.slice(0, 10),
      },
      apply,
      sincronizado,
    });
  } catch (err) {
    console.error('[Server] Error en /reconcile:', err.message);
    return res.status(500).json({ ok: false, error: `Reconciliación falló: ${err.message}` });
  }
});

// ─── JWT helper (verifica tokens del panel admin sin depender de FastAPI) ────
function verifyAdminJWT(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return false;
    const expected = createHmac('sha256', secret)
      .update(`${h}.${p}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (expected !== sig) return false;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch { return false; }
}

// ─── Rutas directas WA (usan JWT del panel, no pasan por FastAPI) ─────────────
// GET /api/wa/status
app.get('/api/wa/status', (req, res) => {
  if (!verifyAdminJWT(req.headers.authorization)) return res.status(401).json({ error: 'No autorizado' });
  const sock = getSock();
  res.json({ bot: { conectado: !!sock?.user, numero: sock?.user?.id?.split(':')[0] || null, timestamp: new Date().toISOString() } });
});

// GET /api/wa/qr
app.get('/api/wa/qr', (req, res) => {
  if (!verifyAdminJWT(req.headers.authorization)) return res.status(401).json({ error: 'No autorizado' });
  const sock = getSock();
  const info = getLastQRInfo();
  res.json({ qr: { conectado: !!sock?.user, qr: info.qr, generado_en: info.generado_en, esperando_qr: info.esperando_qr } });
});

// POST /api/wa/reiniciar
app.post('/api/wa/reiniciar', async (req, res) => {
  if (!verifyAdminJWT(req.headers.authorization)) return res.status(401).json({ error: 'No autorizado' });
  try {
    await deleteSession();
    setTimeout(iniciarWhatsApp, 1000);
    res.json({ ok: true, mensaje: 'Sesión eliminada. Generando nuevo QR en 1 segundo...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Rutas WhatsApp (panel de agentes humanos) ───────────────────────────────
app.use('/wa', waRouter);

// ─── Proxy /api → FastAPI admin backend (127.0.0.1:8001) ────────────────────

// Interceptores: limpiar caché en memoria antes de delegar al backend Python
app.post('/api/sessions/reset', (req, _res, next) => {
  const jid = req.body?.session_id;
  if (jid) deleteChatSession(jid);
  next();
});
app.post('/api/sessions/reset-all', (_req, _res, next) => {
  limpiarCacheSesiones();
  next();
});

const ADMIN_API_PORT = process.env.ADMIN_INTERNAL_PORT || '8001';
app.all('/api/*', async (req, res) => {
  const targetUrl = `http://127.0.0.1:${ADMIN_API_PORT}${req.originalUrl}`;
  console.log(`[Proxy] ${req.method} ${req.path} → ${targetUrl}`);
  try {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() !== 'host') headers[k] = v;
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    // 30s: algunas operaciones admin son lentas de por sí (borrado masivo en
    // reset-total, OCR de PDF, parseo de Excel). Con 10s, Node abortaba la
    // petición y devolvía este mismo 503 genérico aunque FastAPI estuviera
    // sano y simplemente aún trabajando — parecía "panel caído" sin estarlo.
    const fetchRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    res.status(fetchRes.status);
    fetchRes.headers.forEach((v, k) => {
      if (!['transfer-encoding', 'connection'].includes(k.toLowerCase())) res.setHeader(k, v);
    });
    const text = await fetchRes.text();
    res.send(text);
  } catch (err) {
    const esTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error(`[Proxy] Error ${esTimeout ? '(timeout tras 30s)' : ''}: ${err.message}`);
    if (!res.headersSent) {
      res.status(503).json({
        error: esTimeout
          ? 'La operación tardó demasiado (>30s) en el panel admin. Puede seguir en curso — verifique antes de reintentar.'
          : 'Panel admin no disponible.',
      });
    }
  }
});

// ─── Panel admin: archivos estáticos del build de React ─────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_DIST = path.join(__dirname, '../admin-frontend-dist');

try {
  const { existsSync } = await import('node:fs');
  if (existsSync(ADMIN_DIST)) {
    app.use('/admin', express.static(ADMIN_DIST));
    // SPA fallback: cualquier ruta /admin/* devuelve index.html
    app.get('/admin*', (_req, res) => {
      res.sendFile(path.join(ADMIN_DIST, 'index.html'));
    });
    console.log('[Server] Panel admin disponible en /admin');
  } else {
    console.log('[Server] admin-frontend-dist no encontrado. Panel admin desactivado.');
  }
} catch {}

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado.',
    endpoints: [
      'GET /', 'POST /chat', 'GET /programacion', 'POST /scrape', 'POST /reconcile', 'GET /health',
      'GET /wa/chats', 'GET /wa/chats/humano', 'GET /wa/mensajes/:jid',
      'POST /wa/tomar', 'POST /wa/devolver', 'POST /wa/enviar', 'GET /wa/status', 'GET /wa/qr',
    ],
  });
});

// ─── Error handler global ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ─── Inicio del servidor ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       🍇  Agente UVA Medellín v1.0.0         ║
║       Servidor corriendo en puerto ${String(PORT).padEnd(5)}    ║
╚══════════════════════════════════════════════╝
  `);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Chat endpoint: POST http://localhost:${PORT}/chat`);

  // Iniciar el scheduler de actualizaciones automáticas
  iniciarScheduler();

  // Iniciar la conexión a WhatsApp
  iniciarWhatsApp().catch((err) => {
    console.error('[FATAL] Error iniciando WhatsApp:', err.message);
    // No hacer process.exit para que el servidor HTTP siga funcionando
  });
});

export default app;
