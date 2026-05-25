/**
 * scheduler-agent.js — Sistema NOW
 * Cron jobs que mantienen la programación UVA siempre actualizada.
 *
 * Cron diario:   06:00 AM Colombia → verifica si hay datos hoy, si no scrapeó aún.
 * Cron mensual:  Día 1 de cada mes 07:00 AM Colombia → limpia mes anterior + scrapeó mes nuevo.
 */

import cron from 'node-cron';
import { ejecutarScraper } from './scraper-agent.js';
import { ejecutarParser } from './parser-agent.js';
import { getProgramacionPorFecha, limpiarProgramacionMesAnterior } from '../services/supabase.js';
import { callPython } from '../utils/python-bridge.js';
import { setAgendaMD, clearAgendaCache } from '../utils/agenda-cache.js';
import { hoyISO } from '../utils/date-helper.js';

const LOG_PREFIX = '[SchedulerAgent]';

// ─── Expresiones Cron (timezone: America/Bogota) ──────────────────────────────
// Diario: 06:00 AM Colombia = 11:00 UTC
const CRON_DIARIO = '0 0 11 * * *';
// Mensual: día 1 de cada mes 07:00 AM Colombia = 12:00 UTC
const CRON_MENSUAL = '0 0 12 1 * *';

let tareaActiva = null;
let tareaMensualActiva = null;
let ultimaEjecucion = null;
let estadoUltimaEjecucion = 'sin ejecutar';
let cicloEnEjecucion = false;
const SCHEDULER_ENABLED = String(process.env.ENABLE_SCHEDULER || 'false').toLowerCase() === 'true';

/**
 * Inicia el scheduler. Registra el cron job y lo activa.
 */
export function iniciarScheduler() {
  if (!SCHEDULER_ENABLED) {
    log('Scheduler desactivado por configuración (ENABLE_SCHEDULER=false).');
    return;
  }

  if (tareaActiva) {
    log('El scheduler ya está activo.');
    return;
  }

  log(`Iniciando NOW scheduler. Diario: ${CRON_DIARIO} | Mensual: ${CRON_MENSUAL}`);

  // ─── Cron diario: verifica y regenera caché de agenda ─────────────────────
  tareaActiva = cron.schedule(
    CRON_DIARIO,
    async () => {
      log('═══ NOW — Ejecución diaria ═══');
      await ejecutarCicloCompleto();
    },
    { scheduled: true, timezone: 'America/Bogota' }
  );

  // ─── Cron mensual: día 1 — limpia mes anterior + scrapeó nuevo ────────────
  tareaMensualActiva = cron.schedule(
    CRON_MENSUAL,
    async () => {
      log('═══ NOW — Renovación mensual ═══');
      await ejecutarCicloMensual();
    },
    { scheduled: true, timezone: 'America/Bogota' }
  );

  log('NOW Scheduler activo. Diario 06:00 AM | Mensual día 1 07:00 AM (Colombia).');
}

/**
 * Detiene el scheduler.
 */
export function detenerScheduler() {
  if (tareaActiva) {
    tareaActiva.stop();
    tareaActiva = null;
  }
  if (tareaMensualActiva) {
    tareaMensualActiva.stop();
    tareaMensualActiva = null;
  }
  log('NOW Scheduler detenido.');
}

/**
 * NOW — Ciclo mensual: limpia datos viejos y scrapeó el mes nuevo.
 * Se llama automáticamente el día 1 de cada mes, o manualmente.
 */
export async function ejecutarCicloMensual() {
  log('▶ Paso 1: Limpiando programación del mes anterior...');
  try {
    const eliminados = await limpiarProgramacionMesAnterior();
    log(`  ${eliminados} registros del mes anterior eliminados.`);
  } catch (err) {
    log(`  Advertencia: limpieza falló (${err.message}), continuando...`);
  }

  log('▶ Paso 2: Scraping + parser del mes nuevo...');
  return ejecutarCicloCompleto();
}

/**
 * Retorna el estado del scheduler.
 */
export function obtenerEstado() {
  return {
    activo: !!tareaActiva,
    ultimaEjecucion: ultimaEjecucion?.toISOString() || null,
    estadoUltima: estadoUltimaEjecucion,
    proximaEjecucion: calcularProximaEjecucion(),
  };
}

/**
 * Ejecuta el ciclo completo: scraper → parser.
 * Puede llamarse manualmente (endpoint /scrape) o por el cron.
 * @returns {Promise<{success: boolean, total: number, error?: string}>}
 */
export async function ejecutarCicloCompleto() {
  if (cicloEnEjecucion) {
    log('Ciclo ya en ejecución. Se omite ejecución concurrente.');
    return { success: false, total: 0, error: 'ciclo en ejecución' };
  }

  cicloEnEjecucion = true;
  ultimaEjecucion = new Date();
  estadoUltimaEjecucion = 'en progreso';

  try {
    log('Paso 1/2: Ejecutando Scraper Agent (NOW)...');
    let pdfBuffer, pdfUrl, textoOCR;

    try {
      const resultadoScraper = await ejecutarScraper();
      pdfBuffer = resultadoScraper.buffer;
      pdfUrl = resultadoScraper.url;
      textoOCR = resultadoScraper.textoOCR || null;
      const metodo = textoOCR ? 'Playwright+OCR' : 'PDF directo';
      log(`Scraper completado (${metodo}): ${pdfUrl}`);
    } catch (err) {
      const errorMsg = `Scraper falló: ${err.message}`;
      log(`ERROR: ${errorMsg}`);
      estadoUltimaEjecucion = `error: ${errorMsg}`;
      return { success: false, total: 0, error: errorMsg };
    }

    log('Paso 2/2: Ejecutando Parser Agent (NOW)...');
    let totalActividades = 0;

    try {
      const resultadoParser = await ejecutarParser(pdfBuffer, pdfUrl, textoOCR);
      totalActividades = resultadoParser.total;
      log(`Parser completado. ${totalActividades} actividades guardadas en Supabase.`);
    } catch (err) {
      const errorMsg = `Parser falló: ${err.message}`;
      log(`ERROR: ${errorMsg}`);
      estadoUltimaEjecucion = `error: ${errorMsg}`;
      return { success: false, total: 0, error: errorMsg };
    }

    // Paso 3/3: Generar caché Markdown de la agenda del día
    log('Paso 3/3: Generando caché Markdown de la agenda...');
    try {
      const generadas = await _generarMarkdownAgenda();
      log(`Markdown generado para ${generadas} UVAs.`);
    } catch (err) {
      log(`Advertencia: markdown cache falló (no crítico): ${err.message}`);
    }

    estadoUltimaEjecucion = `exitoso (${totalActividades} actividades)`;
    log(`═══ Ciclo completado exitosamente. Total: ${totalActividades} actividades ═══`);

    return { success: true, total: totalActividades };
  } finally {
    cicloEnEjecucion = false;
  }
}

// ─── Helpers privados ───────────────────────────────────────────────────────

/**
 * Genera el Markdown de agenda para cada UVA del día y lo guarda en caché.
 * Se llama después de cada scraping exitoso.
 */
async function _generarMarkdownAgenda() {
  clearAgendaCache();
  const fecha = hoyISO();

  // Traer todas las actividades del día
  const actividades = await getProgramacionPorFecha(fecha).catch(() => []);
  if (!actividades?.length) return 0;

  // Agrupar por UVA
  const uvas = [...new Set(actividades.map(a => a.uva_nombre).filter(Boolean))];

  let generadas = 0;
  for (const uva of uvas) {
    const actsUva = actividades.filter(a => a.uva_nombre === uva);
    const md = callPython('agenda_to_markdown.py', { actividades: actsUva, uva, fecha });
    if (md) {
      setAgendaMD(uva, fecha, md);
      generadas++;
    }
  }
  return generadas;
}

function calcularProximaEjecucion() {
  const ahora = new Date();
  // Próximas 6:00 AM Colombia
  const proxima = new Date();
  proxima.setHours(6, 0, 0, 0);
  // Usar offset Colombia (-5h)
  // Si ya pasó las 6 AM hoy, calcular para mañana
  const offsetColombia = -5 * 60 * 60 * 1000;
  const ahoraColombia = new Date(ahora.getTime() + offsetColombia);
  const proximaHoy6AM = new Date(ahoraColombia);
  proximaHoy6AM.setUTCHours(11, 0, 0, 0); // 11 UTC = 6 AM Colombia

  if (proximaHoy6AM <= ahora) {
    proximaHoy6AM.setDate(proximaHoy6AM.getDate() + 1);
  }

  return proximaHoy6AM.toISOString();
}

function log(mensaje) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().replace('T', ' ').substring(0, 19)} ${mensaje}`);
}

export default { iniciarScheduler, detenerScheduler, obtenerEstado, ejecutarCicloCompleto };
