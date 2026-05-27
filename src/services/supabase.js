import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import ws from 'ws';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('[Supabase] Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: ws },
});

// ─── Helpers de programación ─────────────────────────────────────────────────

/**
 * Inserta múltiples registros de programación.
 * Elimina primero los registros existentes para los mismos UVAs y fechas
 * para evitar duplicados en re-ejecuciones manuales.
 * @param {Array} actividades
 */
export async function insertarProgramacion(actividades) {
  if (!actividades || actividades.length === 0) return [];

  // Filtrar actividades con fechas inválidas antes de tocar la DB
  const validas = actividades.filter((a) => {
    if (!a.fecha) return false;
    const d = new Date(a.fecha + 'T00:00:00');
    return !Number.isNaN(d.getTime());
  });
  if (validas.length < actividades.length) {
    console.warn(`[Supabase] Descartadas ${actividades.length - validas.length} actividades con fecha inválida`);
  }
  if (validas.length === 0) return [];

  // Obtener el rango de fechas del batch para borrar sólo lo relevante
  const fechas = [...new Set(validas.map((a) => a.fecha))];
  const uvas = [...new Set(validas.map((a) => a.uva_nombre).filter(Boolean))];

  if (fechas.length > 0 && uvas.length > 0) {
    const { error: delError } = await supabase
      .from('programacion_uva')
      .delete()
      .in('uva_nombre', uvas)
      .in('fecha', fechas);
    if (delError) {
      console.warn(`[Supabase] Advertencia al limpiar antes de insertar: ${delError.message}`);
    }
  }

  const { data, error } = await supabase.from('programacion_uva').insert(validas);

  if (error) throw new Error(`[Supabase] Error insertando programación: ${error.message}`);
  return data;
}

/**
 * Consulta programación por UVA y fecha.
 * Intenta match exacto primero; si no hay resultados, usa ILIKE con la
 * palabra distintiva de la UVA para tolerar variantes de OCR.
 * @param {string} uvaNombre
 * @param {string} fecha  — formato YYYY-MM-DD
 */
export async function getProgramacion(uvaNombre, fecha) {
  // 1. Match exacto (nombre canónico)
  const { data, error } = await supabase
    .from('programacion_uva')
    .select('*')
    .eq('uva_nombre', uvaNombre)
    .eq('fecha', fecha)
    .order('hora_inicio', { ascending: true });

  if (error) throw new Error(`[Supabase] Error consultando programación: ${error.message}`);
  if (data && data.length > 0) return data;

  // 2. Fallback: ILIKE con la palabra clave de la UVA (tolerante a OCR)
  // Extrae la parte después de "UVA " → "La Armonía" → busca "%Armonía%"
  const palabraClave = uvaNombre.replace(/^UVA\s+(?:La|El|Los|Las|De)?\s*/i, '').split(' ')[0];
  if (!palabraClave) return data;

  const { data: data2, error: err2 } = await supabase
    .from('programacion_uva')
    .select('*')
    .ilike('uva_nombre', `%${palabraClave}%`)
    .eq('fecha', fecha)
    .order('hora_inicio', { ascending: true });

  if (err2) return data; // si falla el fallback, retornar array vacío
  return data2 || [];
}

/**
 * Consulta toda la programación de una fecha (todas las UVAs).
 * @param {string} fecha  — formato YYYY-MM-DD
 */
export async function getProgramacionPorFecha(fecha) {
  const { data, error } = await supabase
    .from('programacion_uva')
    .select('*')
    .eq('fecha', fecha)
    .order('uva_nombre', { ascending: true })
    .order('hora_inicio', { ascending: true });

  if (error) throw new Error(`[Supabase] Error consultando programación por fecha: ${error.message}`);
  return data;
}

/**
 * Consulta programación para un conjunto de fechas (múltiples días).
 * @param {string[]} fechas  — array YYYY-MM-DD
 */
export async function getProgramacionPorFechas(fechas = []) {
  if (!Array.isArray(fechas) || fechas.length === 0) return [];

  const unicas = [...new Set(fechas.filter(Boolean))];
  const { data, error } = await supabase
    .from('programacion_uva')
    .select('*')
    .in('fecha', unicas)
    .order('fecha', { ascending: true })
    .order('uva_nombre', { ascending: true })
    .order('hora_inicio', { ascending: true });

  if (error) throw new Error(`[Supabase] Error consultando programación por fechas: ${error.message}`);
  return data || [];
}

/**
 * Búsqueda temática: busca actividades por palabras clave en TODAS las UVAs.
 * Útil para preguntas como "¿en qué UVA hay agroecología?" o "dónde hay danza?"
 * @param {string[]} keywords   — palabras clave (lowercase)
 * @param {string}   fechaDesde — YYYY-MM-DD
 * @param {string}   fechaHasta — YYYY-MM-DD
 * @param {string[]} [recintos] — lista de uva_nombre válidos (opcional, filtra la DB)
 * @returns {Promise<Array>}
 */
export async function buscarActividadesPorTema(keywords, fechaDesde, fechaHasta, recintos = null) {
  if (!keywords?.length) return [];

  let query = supabase
    .from('programacion_uva')
    .select('uva_nombre,fecha,hora_inicio,hora_fin,actividad,descripcion,edad_recomendada')
    .gte('fecha', fechaDesde)
    .lte('fecha', fechaHasta);

  // Filtrar solo recintos EPM oficiales cuando se proporciona la lista
  if (Array.isArray(recintos) && recintos.length) {
    query = query.in('uva_nombre', recintos);
  }

  const { data, error } = await query
    .order('uva_nombre', { ascending: true })
    .order('fecha',      { ascending: true })
    .order('hora_inicio', { ascending: true });

  if (error || !data) return [];

  return data.filter((row) => {
    const texto = `${row.actividad || ''} ${row.descripcion || ''}`
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return keywords.some((kw) => texto.includes(kw));
  });
}

// ─── Helpers de conversaciones ───────────────────────────────────────────────

/**
 * Guarda un mensaje en el historial de conversación.
 * @param {Object} params
 */
export async function guardarMensaje({ sessionId, rol, mensaje, barrioDetectado, uvaAsignada }) {
  const { data, error } = await supabase
    .from('conversaciones')
    .insert({
      session_id: sessionId,
      rol,
      mensaje,
      barrio_detectado: barrioDetectado || null,
      uva_asignada: uvaAsignada || null,
    });

  if (error) throw new Error(`[Supabase] Error guardando mensaje: ${error.message}`);
  return data;
}

/**
 * Recupera el historial reciente de una sesión (últimos N mensajes).
 * @param {string} sessionId
 * @param {number} limite
 */
export async function getHistorialSesion(sessionId, limite = 10) {
  const { data, error } = await supabase
    .from('conversaciones')
    .select('rol, mensaje, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw new Error(`[Supabase] Error recuperando historial: ${error.message}`);
  return (data || []).reverse();
}

export async function limpiarHistorialSesion(sessionId) {
  const { error } = await supabase
    .from('conversaciones')
    .delete()
    .eq('session_id', sessionId);

  if (error) throw new Error(`[Supabase] Error limpiando historial: ${error.message}`);
}

export async function limpiarHistoricoCompletoChats() {
  const [historialResult, memoriaResult] = await Promise.all([
    supabase.from('conversaciones').delete().neq('session_id', '__no_op__'),
    supabase.from('memoria_agente').delete().neq('session_id', '__no_op__'),
  ]);

  if (historialResult.error) {
    throw new Error(`[Supabase] Error limpiando histórico de chats: ${historialResult.error.message}`);
  }
  if (memoriaResult.error) {
    throw new Error(`[Supabase] Error limpiando memoria persistida: ${memoriaResult.error.message}`);
  }
}

// ─── Helpers de memoria del agente ─────────────────────────────────────────────

/**
 * Recupera un valor de la memoria del agente para una sesión.
 * @param {string} sessionId
 * @param {string} clave  — ej: 'nombre', 'barrio', 'uva'
 * @returns {Promise<string|null>}
 */
export async function getMemoria(sessionId, clave) {
  const { data } = await supabase
    .from('memoria_agente')
    .select('valor')
    .eq('session_id', sessionId)
    .eq('clave', clave)
    .eq('tipo', 'bot')
    .maybeSingle();
  return data?.valor || null;
}

/**
 * Guarda o actualiza un valor en la memoria del agente.
 * @param {string} sessionId
 * @param {string} clave
 * @param {string} valor
 */
export async function guardarMemoria(sessionId, clave, valor) {
  if (valor == null) {
    const { error } = await supabase
      .from('memoria_agente')
      .delete()
      .eq('session_id', sessionId)
      .eq('tipo', 'bot')
      .eq('clave', clave);
    if (error) console.error(`[Supabase] Error limpiando memoria: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from('memoria_agente')
    .upsert(
      { session_id: sessionId, tipo: 'bot', clave, valor },
      { onConflict: 'session_id,tipo,clave' }
    );
  if (error) console.error(`[Supabase] Error guardando memoria: ${error.message}`);
}

// ─── Helpers de scraping log ─────────────────────────────────────────────────

/**
 * Registra el resultado de un scraping.
 * @param {Object} params
 */
export async function registrarScraping({ url, status, actividadesEncontradas, errorMsg }) {
  const { data, error } = await supabase
    .from('scraping_log')
    .insert({
      url,
      status,
      actividades_encontradas: actividadesEncontradas || 0,
      error: errorMsg || null,
    });

  if (error) console.error(`[Supabase] Error registrando scraping log: ${error.message}`);
  return data;
}

/**
 * Sistema NOW — Elimina toda programación de meses anteriores al actual.
 * Se llama al inicio de cada ciclo mensual para mantener la BD limpia.
 * @returns {Promise<number>} — registros eliminados
 */
export async function limpiarProgramacionMesAnterior() {
  // Primer día del mes actual en formato YYYY-MM-DD
  const ahora = new Date();
  const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const { error, count } = await supabase
    .from('programacion_uva')
    .delete({ count: 'exact' })
    .lt('fecha', primerDiaMes);

  if (error) {
    console.error(`[Supabase] Error limpiando programación: ${error.message}`);
    return 0;
  }

  console.log(
    `[Supabase] NOW cleanup: ${count ?? 0} registros anteriores a ${primerDiaMes} eliminados`
  );
  return count ?? 0;
}

export default supabase;
