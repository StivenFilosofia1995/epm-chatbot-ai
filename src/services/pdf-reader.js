/**
 * pdf-reader.js
 * Servicio de lectura/OCR de PDFs de programación de UVAs EPM.
 * Estrategia:
 *   1. Intentar pdf-parse (rápido, funciona con PDFs de texto nativo).
 *   2. Fallback a tesseract.js si el PDF es escaneado/imagen.
 */

import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { limpiarTextoOCR } from '../utils/normalizer.js';

const LOG_PREFIX = '[PDFReader]';

/**
 * Lee un buffer de PDF y extrae el texto.
 * Intenta pdf-parse primero; si retorna texto vacío o muy corto, usa OCR.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{texto: string, metodo: string, paginas: number}>}
 */
export async function leerPDF(pdfBuffer) {
  console.log(`${LOG_PREFIX} ${timestamp()} Iniciando lectura de PDF (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

  // ─── Intento 1: pdf-parse (texto nativo) ──────────────────────────────
  try {
    const data = await pdfParse(pdfBuffer, {
      // Opciones para preservar mejor el layout del PDF
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });

    const textoLimpio = limpiarTextoOCR(data.text);

    // Si el texto extraído tiene contenido suficiente, lo usamos
    if (textoLimpio.length > 200) {
      console.log(`${LOG_PREFIX} ${timestamp()} pdf-parse exitoso: ${textoLimpio.length} caracteres, ${data.numpages} páginas`);
      return {
        texto: textoLimpio,
        metodo: 'pdf-parse',
        paginas: data.numpages,
      };
    }

    console.log(`${LOG_PREFIX} ${timestamp()} pdf-parse retornó texto insuficiente (${textoLimpio.length} chars). Intentando OCR...`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} ${timestamp()} pdf-parse falló: ${err.message}. Intentando OCR...`);
  }

  // ─── Intento 2: Tesseract OCR ──────────────────────────────────────────
  return await leerPDFConOCR(pdfBuffer);
}

/**
 * Aplica Tesseract OCR sobre el buffer del PDF.
 * Nota: Tesseract trabaja sobre imágenes; para PDFs de múltiples páginas
 * necesitaría una conversión intermedia. Aquí se hace OCR directo del buffer.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{texto: string, metodo: string, paginas: number}>}
 */
async function leerPDFConOCR(pdfBuffer) {
  console.log(`${LOG_PREFIX} ${timestamp()} Iniciando OCR con Tesseract.js...`);

  let worker = null;
  try {
    worker = await createWorker('spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\r${LOG_PREFIX} OCR progreso: ${(m.progress * 100).toFixed(0)}%`);
        }
      },
    });

    const { data } = await worker.recognize(pdfBuffer);
    process.stdout.write('\n');

    const textoLimpio = limpiarTextoOCR(data.text);
    console.log(`${LOG_PREFIX} ${timestamp()} OCR completado: ${textoLimpio.length} caracteres, confianza: ${data.confidence?.toFixed(1)}%`);

    return {
      texto: textoLimpio,
      metodo: 'tesseract-ocr',
      paginas: 1, // Tesseract procesa una "imagen"
    };
  } catch (err) {
    throw new Error(`${LOG_PREFIX} OCR falló: ${err.message}`);
  } finally {
    if (worker) await worker.terminate();
  }
}

// Mapa de keywords (sin tilde, minúsculas) → nombre canónico de UVA
const UVA_KEYWORD_MAP = [
  { kw: 'guayacanes',  canonical: 'UVA Los Guayacanes' },
  { kw: 'suenos',      canonical: 'UVA de Los Sueños' },
  { kw: 'suen',        canonical: 'UVA de Los Sueños' },
  { kw: 'armonia',     canonical: 'UVA de La Armonía' },
  { kw: 'esperanza',   canonical: 'UVA de La Esperanza' },
  { kw: 'imaginacion', canonical: 'UVA de La Imaginación' },
  { kw: 'libertad',    canonical: 'UVA de La Libertad' },
  { kw: 'ilusion verde', canonical: 'UVA Ilusión Verde' },
  { kw: 'ilusion',     canonical: 'UVA Ilusión Verde' },
  { kw: 'alegria',     canonical: 'UVA de La Alegría' },
  { kw: 'encanto',     canonical: 'UVA El Encanto' },
  { kw: 'mirador',     canonical: 'UVA Mirador de San Cristóbal' },
  { kw: 'aguas claras', canonical: 'UVA Aguas Claras' },
  { kw: 'san fernando', canonical: 'UVA San Fernando' },
];

const UVA_CANONICAS = new Set(UVA_KEYWORD_MAP.map((x) => x.canonical));

/** Normaliza un nombre de UVA extraído por OCR al nombre canónico oficial. */
function normalizarNombreUVA(rawName) {
  const sinTildes = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const { kw, canonical } of UVA_KEYWORD_MAP) {
    if (sinTildes.includes(kw)) return canonical;
  }
  // Fallback limpio (solo si queda algo razonable)
  const clean = rawName
    .replace(/programaci[oó]n\s*/gi, '')
    .replace(/\bUVA\b/g, '')
    .replace(/\bde\s+/gi, '')
    .trim();

  const candidato = ('UVA ' + clean.replace(/\s+/g, ' ')).trim();
  if (clean.length < 5) return null;
  if (/\bprogramaci[oó]n\b/i.test(candidato)) return null;
  if (!UVA_CANONICAS.has(candidato)) return candidato;
  return candidato;
}

/**
 * Divide el texto de un PDF en secciones por UVA.
 * Detecta encabezados de UVA y agrupa el contenido bajo cada una.
 * @param {string} texto  — texto limpio del PDF
 * @returns {Array<{uva: string, contenido: string}>}
 */
export function dividirPorUVA(texto) {
  // Patrón para detectar nombres de UVA (variantes comunes en el PDF)
  const patronUVA = /(?:^|\n)\s*(UVA\s+(?:La\s+|El\s+|Los\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+?)(?:\s*[-–—]|\s*\n)/gim;

  const secciones = [];
  let lastIndex = 0;
  let lastUVA = null;
  let match;

  while ((match = patronUVA.exec(texto)) !== null) {
    if (lastUVA !== null) {
      secciones.push({
        uva: normalizarNombreUVA(lastUVA.trim()),
        contenido: texto.slice(lastIndex, match.index).trim(),
      });
    }
    lastUVA = match[1];
    lastIndex = match.index + match[0].length;
  }

  // Capturar la última sección
  if (lastUVA) {
    secciones.push({
      uva: normalizarNombreUVA(lastUVA.trim()),
      contenido: texto.slice(lastIndex).trim(),
    });
  }

  // Si no se encontraron secciones por UVA, tratar todo como una sección genérica
  if (secciones.length === 0) {
    console.warn(`${LOG_PREFIX} ${timestamp()} No se detectaron secciones por UVA. Procesando como bloque único.`);
    secciones.push({ uva: 'General', contenido: texto });
  }

  console.log(`${LOG_PREFIX} ${timestamp()} ${secciones.length} secciones de UVA detectadas`);
  return secciones;
}

/**
 * Helper: timestamp legible para logs.
 */
function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export default { leerPDF, dividirPorUVA };
