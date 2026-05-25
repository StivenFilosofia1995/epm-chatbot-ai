/**
 * normalizer.js
 * Funciones de normalización de texto para comparación de barrios,
 * UVAs y texto extraído del PDF.
 */

/**
 * Normaliza un string para comparación:
 * - Convierte a minúsculas
 * - Elimina tildes y diacríticos
 * - Colapsa espacios múltiples
 * - Elimina caracteres especiales (salvo letras, números y espacios)
 * @param {string} texto
 * @returns {string}
 */
export function normalizar(texto) {
  if (!texto || typeof texto !== 'string') return '';

  return texto
    .toLowerCase()
    .normalize('NFD')                            // descompone tildes
    .replace(/[\u0300-\u036f]/g, '')            // elimina diacríticos
    .replace(/[^a-z0-9\s]/g, ' ')              // reemplaza especiales con espacio
    .replace(/\s+/g, ' ')                        // colapsa espacios
    .trim();
}

/**
 * Normaliza el nombre de un barrio para búsqueda en el mapa.
 * Más permisivo que normalizar(): también elimina palabras comunes.
 * @param {string} barrio
 * @returns {string}
 */
export function normalizarBarrio(barrio) {
  const stopWords = ['barrio', 'sector', 'urbanizacion', 'conjunto', 'ciudadela', 'vereda'];

  let resultado = normalizar(barrio);

  // Eliminar stop words
  for (const word of stopWords) {
    resultado = resultado.replace(new RegExp(`\\b${word}\\b`, 'g'), '').trim();
  }

  return resultado.replace(/\s+/g, ' ').trim();
}

/**
 * Verifica si dos strings son equivalentes tras normalización.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sonEquivalentes(a, b) {
  return normalizar(a) === normalizar(b);
}

/**
 * Busca el primer match de un barrio dentro de un texto largo.
 * Retorna el barrio normalizado encontrado, o null.
 * @param {string} texto
 * @param {string[]} listaBarrios  — lista de barrios normalizados
 * @returns {string|null}
 */
export function encontrarBarrioEnTexto(texto, listaBarrios) {
  const textoNorm = normalizar(texto);

  // Ordenar por longitud descendente para preferir matches más específicos
  const ordenados = [...listaBarrios].sort((a, b) => b.length - a.length);

  for (const barrio of ordenados) {
    const barrioNorm = normalizar(barrio);
    // Buscar como palabra completa
    const regex = new RegExp(`\\b${barrioNorm.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(textoNorm)) {
      return barrioNorm;
    }
  }

  return null;
}

/**
 * Limpia el texto OCR: elimina caracteres de ruido comunes en PDFs escaneados.
 * @param {string} texto
 * @returns {string}
 */
export function limpiarTextoOCR(texto) {
  if (!texto) return '';

  return texto
    .replace(/\f/g, '\n')                         // form feed → salto de línea
    .replace(/\r\n/g, '\n')                        // CRLF → LF
    .replace(/\r/g, '\n')                          // CR → LF
    .replace(/[^\S\n]+/g, ' ')                     // espacios múltiples (no newlines)
    .replace(/\n{3,}/g, '\n\n')                    // máx 2 saltos de línea consecutivos
    .replace(/[|]{2,}/g, ' ')                      // separadores de tabla ││
    .replace(/_{3,}/g, ' ')                        // líneas de guión bajo
    .replace(/–{2,}/g, ' ')                        // guiones largos múltiples
    .trim();
}

/**
 * Extrae posibles horas en formato HH:MM de un texto.
 * @param {string} texto
 * @returns {string[]}
 */
export function extraerHoras(texto) {
  const regex = /\b([01]?\d|2[0-3]):[0-5]\d\b/g;
  return [...new Set(texto.match(regex) || [])];
}

/**
 * Capitaliza la primera letra de cada palabra (title case) para nombres de actividades.
 * @param {string} texto
 * @returns {string}
 */
export function titleCase(texto) {
  if (!texto) return '';
  const minusculas = ['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'a', 'con', 'para'];

  return texto
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i === 0 || !minusculas.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

export default { normalizar, normalizarBarrio, sonEquivalentes, encontrarBarrioEnTexto, limpiarTextoOCR, extraerHoras, titleCase };
