/**
 * scraper-agent.js
 * Agente 1 — Descarga el PDF de programación de EPM y lo procesa.
 * Retorna el buffer del PDF y lo almacena temporalmente.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import 'dotenv/config';
import { registrarScraping } from '../services/supabase.js';
import { scrapeIssuuConOCR } from './scraper-playwright.js';

const LOG_PREFIX = '[ScraperAgent]';
const MAX_REINTENTOS = 3;
const DELAY_REINTENTO_MS = 2000;

/**
 * Agente principal: obtiene el texto de programación desde el portal de EPM.
 * Flujo primario:  EPM page → Issuu URL → Playwright + OCR → texto
 * Flujo fallback:  Issuu URL → descarga directa PDF → buffer
 * @returns {Promise<{buffer: Buffer|null, url: string, contentType: string, textoOCR: string|null}>}
 */
export async function ejecutarScraper() {
  const url = process.env.EPM_PROGRAMACION_URL;
  if (!url) throw new Error(`${LOG_PREFIX} Falta la variable EPM_PROGRAMACION_URL`);

  log(`Iniciando ciclo NOW de scraping desde: ${url}`);

  // ─── Paso 1: Resolver URL Issuu ────────────────────────────────────────────
  let issuuDocUrl = null;
  try {
    issuuDocUrl = await encontrarIssuuEnPagina(url);
    if (issuuDocUrl) log(`Issuu embed encontrado en EPM: ${issuuDocUrl}`);
  } catch (err) {
    log(`Página EPM inaccesible: ${err.message}`);
  }
  if (!issuuDocUrl) {
    issuuDocUrl = construirUrlMensual();
    log(`Usando URL mensual: ${issuuDocUrl}`);
  }

  // ─── Paso 2 (PRIMARIO): Playwright + OCR ──────────────────────────────────
  try {
    log(`Iniciando extracción Playwright + OCR...`);
    const resultado = await scrapeIssuuConOCR(issuuDocUrl);

    await registrarScraping({
      url: issuuDocUrl,
      status: 'ocr_success',
      actividadesEncontradas: 0,
    });

    if (resultado.pdfBuffer) {
      // Issuu sirvió el PDF directamente al visor — usamos el pipeline normal
      log(`PDF interceptado por Playwright (${(resultado.pdfBuffer.length / 1024).toFixed(0)} KB)`);
      return {
        buffer: resultado.pdfBuffer,
        url: issuuDocUrl,
        contentType: 'application/pdf',
        textoOCR: null,
      };
    }

    log(`OCR exitoso: ${resultado.paginas} páginas, ${resultado.texto.length} caracteres`);
    return {
      buffer: null,
      url: issuuDocUrl,
      contentType: 'text/plain',
      textoOCR: resultado.texto,
    };
  } catch (err) {
    log(`Playwright/OCR falló: ${err.message}. Intentando descarga PDF...`);
  }

  // ─── Paso 3 (FALLBACK): Descarga directa PDF ──────────────────────────────
  try {
    const pdfBuffer = await descargarPDFdesdeIssuu(issuuDocUrl);
    log(`PDF descargado exitosamente (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

    await registrarScraping({
      url: issuuDocUrl,
      status: 'success',
      actividadesEncontradas: 0,
    });

    return {
      buffer: pdfBuffer,
      url: issuuDocUrl,
      contentType: 'application/pdf',
      textoOCR: null,
    };
  } catch (err) {
    const errorMsg = `Error en todos los métodos: ${err.message}`;
    log(`ERROR: ${errorMsg}`);
    await registrarScraping({ url: issuuDocUrl, status: 'error', actividadesEncontradas: 0, errorMsg });
    throw new Error(`${LOG_PREFIX} ${errorMsg}`);
  }
}

/**
 * Visita la página de EPM y busca un embed de Issuu (iframe o link).
 * También busca en el código fuente de la página.
 * @param {string} paginaUrl
 * @returns {Promise<string|null>}  URL del documento Issuu o null
 */
async function encontrarIssuuEnPagina(paginaUrl) {
  const response = await axios.get(paginaUrl, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UVABot/1.0)',
      'Accept': 'text/html,application/xhtml+xml,*/*',
    },
  });

  const $ = cheerio.load(response.data);

  // 1. Buscar iframes de Issuu (embed viewer)
  let issuuUrl = null;
  $('iframe').each((_, el) => {
    if (issuuUrl) return;
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const m = src.match(/issuu\.com\/([^/]+)\/docs\/([^/?&#]+)/);
    if (m) issuuUrl = `https://issuu.com/${m[1]}/docs/${m[2]}`;
  });
  if (issuuUrl) return issuuUrl;

  // 2. Buscar links directos a Issuu
  $('a[href*="issuu.com"]').each((_, el) => {
    if (issuuUrl) return;
    const href = $(el).attr('href') || '';
    const m = href.match(/issuu\.com\/([^/]+)\/docs\/([^/?&#]+)/);
    if (m) issuuUrl = `https://issuu.com/${m[1]}/docs/${m[2]}`;
  });
  if (issuuUrl) return issuuUrl;

  // 3. Buscar en el HTML fuente (JS embeds, data attributes, etc.)
  const rawHtml = response.data;
  const m = rawHtml.match(/issuu\.com\/([\w-]+)\/docs\/([\w-]+)/);
  if (m) return `https://issuu.com/${m[1]}/docs/${m[2]}`;

  return null;
}

/**
 * Construye la URL mensual de Issuu basada en el mes actual.
 * Patrón: https://issuu.com/bibliotecaepm1/docs/uva_programaci_n_{mes}
 * @returns {string}
 */
function construirUrlMensual() {
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  // EPM publica la programación del mes actual bajo el nombre del mes anterior.
  // Ej: programación de Mayo 2026 → URL "uva_programaci_n_abril"
  const mesAnterior = (new Date().getMonth() - 1 + 12) % 12;
  const mes = MESES[mesAnterior];
  return `https://issuu.com/bibliotecaepm1/docs/uva_programaci_n_${mes}`;
}

/**
 * Intenta descargar el PDF de un documento Issuu.
 * Prueba el endpoint /pdf y luego busca el link de descarga en la página.
 * @param {string} issuuDocUrl
 * @returns {Promise<Buffer>}
 */
async function descargarPDFdesdeIssuu(issuuDocUrl) {
  // Normalizar URL (quitar query params)
  const baseUrl = issuuDocUrl.replace(/[?#].*$/, '').replace(/\/$/, '');

  // Intento 1: endpoint /pdf directo (funciona si el publisher habilitó descargas)
  try {
    log(`Intentando descarga directa: ${baseUrl}/pdf`);
    const resp = await axios.get(`${baseUrl}/pdf`, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*',
        'Referer': 'https://issuu.com/',
      },
    });
    const ct = resp.headers['content-type'] || '';
    if (ct.includes('html')) {
      throw new Error('Issuu devolvió HTML en lugar del PDF (descarga deshabilitada)');
    }
    if (ct.includes('pdf') || resp.data.byteLength > 50_000) {
      return Buffer.from(resp.data);
    }
  } catch (e) {
    log(`Intento /pdf falló: ${e.message}`);
  }

  // Intento 2: buscar link de descarga en la página del documento Issuu
  try {
    log(`Buscando link de descarga en la página Issuu: ${baseUrl}`);
    const pageResp = await axios.get(baseUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    const $ = cheerio.load(pageResp.data);

    // Buscar link de descarga en la página
    let downloadUrl = null;
    $('a[href*=".pdf"], a[href*="download"]').each((_, el) => {
      if (downloadUrl) return;
      const href = $(el).attr('href') || '';
      if (href.includes('.pdf') || href.includes('download')) downloadUrl = href;
    });

    // Buscar en el JS de la página el CDN URL del PDF
    const rawHtml = pageResp.data;
    const cdnMatch = rawHtml.match(/https:\/\/[^"']+\.pdf[^"']*/);
    if (!downloadUrl && cdnMatch) downloadUrl = cdnMatch[0];

    if (downloadUrl) {
      log(`Link de descarga encontrado: ${downloadUrl}`);
      const pdfResp = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      return Buffer.from(pdfResp.data);
    }
  } catch (e) {
    log(`Búsqueda en página Issuu falló: ${e.message}`);
  }

  throw new Error(`No se pudo obtener el PDF desde Issuu (${baseUrl})`);
}

/**
 * Visita la página de EPM y extrae la URL del PDF de programación (legacy).
 * @param {string} paginaUrl
 * @returns {Promise<string>}
 */
async function obtenerURLDelPDF(paginaUrl) {
  const response = await axios.get(paginaUrl, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UVABot/1.0; +https://fundacionepm.org)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const $ = cheerio.load(response.data);
  let pdfUrl = null;

  // Buscar enlaces a PDF en la página
  $('a[href]').each((_, elem) => {
    const href = $(elem).attr('href') || '';
    if (href.toLowerCase().includes('.pdf') && !pdfUrl) {
      // Construir URL absoluta si es relativa
      if (href.startsWith('http')) {
        pdfUrl = href;
      } else if (href.startsWith('/')) {
        const baseUrl = new URL(paginaUrl);
        pdfUrl = `${baseUrl.origin}${href}`;
      } else {
        pdfUrl = new URL(href, paginaUrl).href;
      }
    }
  });

  if (!pdfUrl) {
    throw new Error('No se encontró ningún enlace a PDF en la página');
  }

  return pdfUrl;
}

/**
 * Descarga una URL como buffer con lógica de reintentos exponencial.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function descargarConReintentos(url) {
  let ultimoError = null;

  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    try {
      log(`Descargando... (intento ${intento}/${MAX_REINTENTOS})`);

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; UVABot/1.0)',
          'Accept': 'application/pdf,*/*',
        },
        maxContentLength: 50 * 1024 * 1024, // 50 MB máximo
      });

      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        log(`Advertencia: Content-Type inesperado: ${contentType}`);
      }

      return Buffer.from(response.data);
    } catch (err) {
      ultimoError = err;
      log(`Intento ${intento} falló: ${err.message}`);

      if (intento < MAX_REINTENTOS) {
        const delay = DELAY_REINTENTO_MS * intento; // backoff exponencial
        log(`Esperando ${delay}ms antes del siguiente intento...`);
        await sleep(delay);
      }
    }
  }

  throw ultimoError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(mensaje) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().replace('T', ' ').substring(0, 19)} ${mensaje}`);
}

export default { ejecutarScraper };
