#!/usr/bin/env node
import 'dotenv/config';
import { supabase } from '../src/services/supabase.js';

const from = '2026-05-01';
const to = '2026-05-31';

const { data, error } = await supabase
  .from('programacion_uva')
  .select('uva_nombre, fecha')
  .gte('fecha', from)
  .lte('fecha', to);

if (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
}

const byUva = {};
for (const row of data || []) {
  byUva[row.uva_nombre] = (byUva[row.uva_nombre] || 0) + 1;
}

console.log('TOTAL', data.length);
console.log('UVAS', Object.keys(byUva).length);
console.log(JSON.stringify(byUva, null, 2));
