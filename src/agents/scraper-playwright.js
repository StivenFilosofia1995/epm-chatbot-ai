/**
 * scraper-playwright.js — Sistema NOW v2
 *
 * Estrategia en cascada para obtener texto del visor Issuu:
 *
 *  1. Interceptar el PDF real que el visor Issuu descarga internamente (PDF.js).
 *     → Retorna el buffer → lo usa el pipeline existente de pdf-parse.
 *
 *  2. Si no se intercepta PDF, screenshot de cada <canvas> (página renderizada).
 *     → OCR con Tesseract.js en español.
 *
 *  3. Si no hay canvas, screenshot completo de cada "página" del flipbook.
 *     → OCR con Tesseract.js en español.
 */

import { chromium } from 'playwright';
import { createWorker } from 'tesseract.js';
import crypto from 'crypto';

const LOG_PREFIX = '[PlaywrightScraper]';
function log(msg) {
  console.log(`${LOG_PREFIX} ${new Date().toISOString().replace('T', ' ').slice(0, 19)} ${msg}`);
}

/**
 * Extrae el contenido de un documento Issuu.
 * @param {string} issuuUrl
 * @returns {Promise<{pdfBuffer: Buffer|null, texto: string|null, paginas: number}>}
 *   - pdfBuffer: PDF interceptado (usar con pdf-parse) — tiene prioridad
 *   - texto: texto OCR si no hubo PDF
 */
export async function scrapeIssuuConOCR(issuuUrl) {
  // URL limpia + modo pantalla completa de Issuu
  const baseUrl = issuuUrl.replace(/[?#].*$/, '');
  const docUrl = `${baseUrl}?ff=true`;

  let pdfBuffer = null;
  const canvasScreenshots = []; // Buffer JPEG/PNG de cada página

  log(`Lanzando Chromium (viewport 1600×1100, scale ×2)...`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      deviceScaleFactor: 2, // resolución ×2 → mejor OCR
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'es-CO',
    });
    const page = await context.newPage();

    // ── Estrategia 1: interceptar respuesta PDF ───────────────────────────
    page.on('response', (response) => {
      void capturarRespuestaPDF(response, () => pdfBuffer, (body, url) => {
        pdfBuffer = body;
        log(`PDF interceptado (${(body.length / 1024).toFixed(0)} KB) desde: ${url}`);
      });
    });

    // ── Navegar al documento ──────────────────────────────────────────────
    log(`Navegando a: ${docUrl}`);
    await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(4000);

    // Cerrar modales/overlays típicos de Issuu
    await cerrarOverlay(page);
    await page.waitForTimeout(500);

    // ── Estrategia 2: screenshots de <canvas> (PDF.js) ───────────────────
    log(`Navegando por páginas y capturando canvas...`);
    await capturarCanvasesDelDocumento(page, canvasScreenshots);

    // ── Estrategia 3: screenshot página completa si no hubo canvas ───────
    if (pdfBuffer == null && canvasScreenshots.length === 0) {
      await capturarPantallasCompletas(page, canvasScreenshots);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // ── Prioridad: retornar PDF si lo interceptamos ───────────────────────────
  if (pdfBuffer) {
    log(`Usando PDF interceptado (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);
    return { pdfBuffer: Buffer.from(pdfBuffer), texto: null, paginas: 0 };
  }

  if (canvasScreenshots.length === 0) {
    throw new Error(`${LOG_PREFIX} No se pudo capturar contenido del documento`);
  }

  // ── OCR de todos los screenshots ─────────────────────────────────────────
  log(`Iniciando OCR en ${canvasScreenshots.length} imágenes (español)...`);
  const texto = await _ocrBuffers(canvasScreenshots);
  log(`OCR completado: ${texto.length} caracteres de ${canvasScreenshots.length} páginas`);
  return { pdfBuffer: null, texto, paginas: canvasScreenshots.length };
}

// ─── OCR helper ──────────────────────────────────────────────────────────────

async function _ocrBuffers(buffers) {
  const worker = await createWorker('spa', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r${LOG_PREFIX} OCR: ${(m.progress * 100).toFixed(0)}%   `);
      }
    },
  });

  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });

  const textos = [];

  for (let i = 0; i < buffers.length; i++) {
    try {
      const { data } = await worker.recognize(buffers[i]);
      process.stdout.write('\n');
      const limpio = data.text.trim();
      if (limpio.length > 15) {
        textos.push(`\n--- Página ${i + 1} ---\n${limpio}`);
      }
    } catch (err) {
      process.stdout.write('\n');
      log(`Advertencia: OCR falló en página ${i + 1}: ${err.message}`);
    }
  }

  await worker.terminate();
  return textos.join('\n');
}

async function capturarRespuestaPDF(response, tienePDF, guardarPDF) {
  if (tienePDF()) return;

  const status = response.status();
  if (status !== 200 && status !== 206) return;

  const url = response.url();
  const ct = (response.headers()['content-type'] || '').toLowerCase();
  const esPDF = ct.includes('pdf') || ct.includes('octet-stream') || url.toLowerCase().includes('.pdf');
  if (!esPDF) return;

  const body = await response.body();
  if (body.length <= 10_000 || body[0] !== 0x25 || body[1] !== 0x50) return;

  guardarPDF(body, url);
}

async function cerrarOverlay(page) {
  try {
    await page.keyboard.press('Escape');
  } catch {
    return;
  }
}

async function capturarCanvasesDelDocumento(page, canvasScreenshots) {
  let paginasSinNuevoCanvas = 0;
  const canvasVistas = new Set();

  for (let intento = 0; intento < 70; intento++) {
    await page.waitForTimeout(700);

    const canvases = await page.locator('canvas').all();
    let nuevoEsteIntento = false;

    for (const canvas of canvases) {
      const buf = await capturarCanvas(canvas, canvasVistas);
      if (!buf) continue;

      canvasScreenshots.push(buf);
      nuevoEsteIntento = true;
    }

    if (!nuevoEsteIntento) {
      paginasSinNuevoCanvas++;
      if (paginasSinNuevoCanvas >= 6) break;
    } else {
      paginasSinNuevoCanvas = 0;
    }

    await page.keyboard.press('ArrowRight');
  }
}

async function capturarCanvas(canvas, canvasVistas) {
  const box = await canvas.boundingBox();
  if (!box || box.width < 200 || box.height < 200) return null;

  const key = `${Math.round(box.x)}_${Math.round(box.y)}_${Math.round(box.width)}`;
  if (canvasVistas.has(key)) return null;
  canvasVistas.add(key);

  const buf = await canvas.screenshot({ type: 'png' });
  log(`Canvas capturado: ${Math.round(box.width)}×${Math.round(box.height)} px`);
  return buf;
}

async function capturarPantallasCompletas(page, canvasScreenshots) {
  log(`Sin canvas. Tomando screenshots de página completa (dinámico, hasta 120)...`);
  let hashAnterior = null;
  let repetidas = 0;

  for (let i = 0; i < 120; i++) {
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const hash = crypto.createHash('sha1').update(buf).digest('hex');

    canvasScreenshots.push(buf);

    if (hashAnterior !== null && hash === hashAnterior) {
      repetidas++;
    } else {
      repetidas = 0;
    }

    if (repetidas >= 8) {
      log(`Fin de documento detectado por repetición visual en página ${i + 1}`);
      break;
    }

    hashAnterior = hash;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(850);
  }
}
