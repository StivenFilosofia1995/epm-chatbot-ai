#!/usr/bin/env node
/**
 * import_csv.js — Importa programacion_uva_IMPORTAR.csv a Supabase
 *
 * Uso: node scripts/import_csv.js [ruta_al_csv]
 *
 * - Lee CSV UTF-8 (detecta y repara double-encoding Latin-1/UTF-8 automáticamente)
 * - Filtra filas con fecha vacía o inválida
 * - Inserta en lotes de 100 usando SUPABASE_SERVICE_KEY (desde .env, NUNCA hardcodeada)
 * - Verifica el conteo final con SELECT count(*)
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridos en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Encoding ─────────────────────────────────────────────────────────────────

function tieneDoubleEncoding(str) {
  if (typeof str !== 'string') return false;
  // "Ã©" = é, "Ã³" = ó, "Ã¡" = á, "Ã­" = í, "Ãº" = ú, "Ã±" = ñ
  return /Ã[\x80-\xFF]/.test(str);
}

function repararDoubleEncoding(str) {
  if (!str || typeof str !== 'string') return str;
  try {
    // Los bytes UTF-8 fueron leídos como Latin-1, esto los revierte
    return Buffer.from(str, 'latin1').toString('utf-8');
  } catch {
    return str;
  }
}

// ─── Parser CSV (maneja comillas dobles RFC 4180) ─────────────────────────────

function parsearLineaCSV(linea) {
  const campos = [];
  let i = 0;
  while (i < linea.length) {
    if (linea[i] === '"') {
      let campo = '';
      i++;
      while (i < linea.length) {
        if (linea[i] === '"' && linea[i + 1] === '"') { campo += '"'; i += 2; }
        else if (linea[i] === '"') { i++; break; }
        else { campo += linea[i]; i++; }
      }
      campos.push(campo);
      if (linea[i] === ',') i++;
    } else {
      let j = i;
      while (j < linea.length && linea[j] !== ',') j++;
      campos.push(linea.slice(i, j));
      i = j + 1;
    }
  }
  return campos;
}

function parsearCSV(contenido) {
  const lineas = contenido.split(/\r?\n/);
  if (lineas.length < 2) return { headers: [], filas: [] };

  const headers = parsearLineaCSV(lineas[0]).map(h => h.trim().replace(/^﻿/, '')); // quitar BOM
  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) continue;
    const valores = parsearLineaCSV(linea);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (valores[idx] ?? '').trim(); });
    filas.push(obj);
  }
  return { headers, filas };
}

// ─── Validación ───────────────────────────────────────────────────────────────

function esFechaValida(str) {
  if (!str || !str.trim()) return false;
  const s = str.trim();
  // Acepta YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime());
}

// ─── Normalización ────────────────────────────────────────────────────────────

function normalizarFila(row, reparar) {
  const fix = (s) => {
    const v = (s || '').trim();
    if (!v) return null;
    return reparar ? repararDoubleEncoding(v) : v;
  };
  return {
    uva_nombre:       fix(row.uva_nombre),
    fecha:            (row.fecha   || '').trim() || null,
    hora_inicio:      (row.hora_inicio || '').trim() || null,
    hora_fin:         (row.hora_fin    || '').trim() || null,
    actividad:        fix(row.actividad),
    descripcion:      fix(row.descripcion),
    edad_recomendada: fix(row.edad_recomendada),
    raw_text:         fix(row.raw_text),
    // Ignorar created_at del CSV — Supabase usa su propio timestamp
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const csvPath = process.argv[2] || 'programacion_uva_IMPORTAR.csv';
  const rutaAbsoluta = resolve(csvPath);

  console.log(`\n[Import] Leyendo: ${rutaAbsoluta}`);

  let contenido;
  try {
    contenido = readFileSync(rutaAbsoluta, 'utf-8');
  } catch {
    try {
      contenido = readFileSync(rutaAbsoluta, 'latin1');
      console.log('[Import] Archivo leído como Latin-1');
    } catch (err) {
      console.error(`ERROR al leer: ${err.message}`);
      process.exit(1);
    }
  }

  const { headers, filas } = parsearCSV(contenido);
  console.log(`[Import] Columnas: [${headers.join(', ')}]`);
  console.log(`[Import] Filas totales en CSV: ${filas.length}`);

  // Detectar double encoding en los primeros 20 registros
  const muestra = filas.slice(0, 20).map(f => f.actividad || '').join(' ');
  const reparar = tieneDoubleEncoding(muestra);
  if (reparar) console.log('[Import] ⚠ Double encoding detectado — aplicando corrección');

  // Filtrar y normalizar
  const validas = [];
  const rechazadas = [];
  for (const fila of filas) {
    const norm = normalizarFila(fila, reparar);
    if (!esFechaValida(norm.fecha)) {
      rechazadas.push({ razon: 'fecha inválida', valor: norm.fecha, actividad: norm.actividad });
      continue;
    }
    if (!norm.actividad || !norm.uva_nombre) {
      rechazadas.push({ razon: 'actividad/uva vacía', actividad: norm.actividad });
      continue;
    }
    validas.push(norm);
  }

  console.log(`[Import] Filas válidas:    ${validas.length}`);
  console.log(`[Import] Filas rechazadas: ${rechazadas.length}`);
  if (rechazadas.length > 0 && rechazadas.length <= 10) {
    for (const r of rechazadas.slice(0, 5)) {
      console.log(`  → ${r.razon}: fecha="${r.valor}" actividad="${r.actividad}"`);
    }
  }

  if (validas.length === 0) {
    console.error('\nERROR: No hay filas válidas para importar');
    process.exit(1);
  }

  // Conteo antes de insertar
  const { count: antes, error: errAntes } = await supabase
    .from('programacion_uva')
    .select('*', { count: 'exact', head: true });
  if (errAntes) console.warn(`[Import] Advertencia al contar: ${errAntes.message}`);
  console.log(`\n[Import] Registros actuales en DB: ${antes ?? '?'}`);

  // Insertar en lotes de 100
  const LOTE = 100;
  let insertados = 0;
  let errores = 0;

  console.log(`[Import] Insertando en lotes de ${LOTE}...\n`);
  for (let i = 0; i < validas.length; i += LOTE) {
    const lote = validas.slice(i, i + LOTE);
    const { error } = await supabase.from('programacion_uva').insert(lote);
    if (error) {
      console.error(`  ✗ Lote ${Math.floor(i / LOTE) + 1} ERROR: ${error.message}`);
      errores += lote.length;
    } else {
      insertados += lote.length;
      process.stdout.write(`  ✓ ${insertados}/${validas.length}\r`);
    }
  }
  process.stdout.write('\n');

  // Conteo final
  const { count: despues } = await supabase
    .from('programacion_uva')
    .select('*', { count: 'exact', head: true });

  console.log(`\n[Import] ─────────────────────────────────────`);
  console.log(`[Import] Insertados:    ${insertados}`);
  console.log(`[Import] Errores:       ${errores}`);
  console.log(`[Import] DB antes:      ${antes ?? '?'}`);
  console.log(`[Import] DB ahora:      ${despues ?? '?'} (+${(despues ?? 0) - (antes ?? 0)})`);

  if (insertados < validas.length) {
    console.warn(`\n⚠ Solo se insertaron ${insertados}/${validas.length} filas válidas.`);
  } else {
    console.log(`\n✅ Importación completada: ${insertados} filas insertadas.`);
  }

  process.exit(errores > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[Import] FATAL:', err.message);
  process.exit(1);
});
