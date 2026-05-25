/**
 * date-helper.js
 * Utilidades de fechas en español colombiano para el sistema UVA Medellín.
 */

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_ES_NORM = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Retorna la fecha de hoy en formato YYYY-MM-DD (zona horaria Colombia UTC-5).
 * @returns {string}
 */
export function hoyISO() {
  const now = new Date();
  // Ajuste a UTC-5 (Colombia)
  const colombiaOffset = -5 * 60;
  const localOffset = now.getTimezoneOffset();
  const diff = (localOffset - colombiaOffset) * 60 * 1000;
  const colombiaDate = new Date(now.getTime() - diff);

  return colombiaDate.toISOString().split('T')[0];
}

/**
 * Retorna la fecha de hoy como objeto Date ajustado a Colombia.
 * @returns {Date}
 */
export function hoyDate() {
  return new Date(hoyISO() + 'T00:00:00-05:00');
}

/**
 * Formatea una fecha YYYY-MM-DD como string en español.
 * Ejemplo: "2024-03-15" → "viernes 15 de marzo de 2024"
 * @param {string} fechaISO
 * @returns {string}
 */
export function formatearFechaEspanol(fechaISO) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  const fecha = new Date(year, month - 1, day);
  const diaSemana = DIAS_ES[fecha.getDay()];
  const mesNombre = MESES_ES[month - 1];

  return `${diaSemana} ${day} de ${mesNombre} de ${year}`;
}

/**
 * Parsea referencias temporales en español del mensaje del usuario.
 * Retorna fecha en formato YYYY-MM-DD o null si no hay referencia temporal.
 * @param {string} texto
 * @returns {string|null}
 */
export function parsearFechaDelMensaje(texto) {
  const textoLower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hoy = hoyISO();
  const [yearH, monthH, dayH] = hoy.split('-').map(Number);

  // Hoy
  if (/\bhoy\b/.test(textoLower)) {
    return hoy;
  }

  // Mañana
  if (/\bmanana\b/.test(textoLower)) {
    return sumarDias(hoy, 1);
  }

  // Pasado mañana
  if (/\bpasado\s+manana\b/.test(textoLower)) {
    return sumarDias(hoy, 2);
  }

  // Ayer
  if (/\bayer\b/.test(textoLower)) {
    return sumarDias(hoy, -1);
  }

  // Día de la semana: "el lunes", "este martes", "el próximo viernes"
  const matchDia = textoLower.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (matchDia) {
    const diaTarget = DIAS_ES_NORM.indexOf(matchDia[1]);
    if (diaTarget !== -1) {
      const fechaHoy = new Date(hoy);
      const diaHoy = fechaHoy.getDay();
      let diff = diaTarget - diaHoy;
      if (diff <= 0) diff += 7; // próxima ocurrencia
      return sumarDias(hoy, diff);
    }
  }

  // Fecha explícita: "15 de marzo", "el 3 de abril"
  const matchFechaExplicita = textoLower.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/
  );
  if (matchFechaExplicita) {
    const dia = parseInt(matchFechaExplicita[1], 10);
    const mes = MESES_ES.indexOf(matchFechaExplicita[2]) + 1;
    if (mes > 0 && dia >= 1 && dia <= 31) {
      const year = determinarAno(mes, dia, monthH, dayH, yearH);
      return `${year}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  // Formato numérico: "15/03", "15-03"
  const matchNumerico = textoLower.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
  if (matchNumerico) {
    const dia = parseInt(matchNumerico[1], 10);
    const mes = parseInt(matchNumerico[2], 10);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      const year = determinarAno(mes, dia, monthH, dayH, yearH);
      return `${year}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }

  return null; // Sin referencia temporal → usar hoy por defecto
}

/**
 * Detecta si el usuario pide una consulta por semana o por día.
 * Retorna el modo y el rango sugerido.
 * @param {string} texto
 * @returns {{modo: 'dia'|'semana', fechaInicio: string, fechaFin: string}}
 */
export function parsearAlcanceTemporal(texto) {
  const textoLower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hoy = hoyISO();
  const esProximaSemana = /\b(proxima|siguiente)\s+semana\b/.test(textoLower);

  if (/\b(esta|la)\s+semana\b/.test(textoLower) || /\bsemana\b/.test(textoLower)) {
    const fechaInicioBase = _inicioDeSemana(hoy);
    const fechaInicio = esProximaSemana ? sumarDias(fechaInicioBase, 7) : fechaInicioBase;
    return {
      modo: 'semana',
      fechaInicio,
      fechaFin: sumarDias(fechaInicio, 6),
    };
  }

  const fecha = parsearFechaDelMensaje(texto) || hoy;
  return { modo: 'dia', fechaInicio: fecha, fechaFin: fecha };
}

/**
 * Suma N días a una fecha ISO y retorna el resultado en ISO.
 * @param {string} fechaISO
 * @param {number} dias
 * @returns {string}
 */
export function sumarDias(fechaISO, dias) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  const fecha = new Date(year, month - 1, day);
  fecha.setDate(fecha.getDate() + dias);

  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retorna el nombre del día de la semana en español para una fecha ISO.
 * @param {string} fechaISO
 * @returns {string}
 */
export function nombreDia(fechaISO) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  const fecha = new Date(year, month - 1, day);
  return DIAS_ES[fecha.getDay()];
}

/**
 * Determina el año más probable para una fecha (mes/día) dado el contexto actual.
 * Si la fecha ya pasó este año, asume el próximo año.
 * @private
 */
function determinarAno(mes, dia, mesActual, diaActual, yearActual) {
  if (mes > mesActual) return yearActual;
  if (mes === mesActual && dia >= diaActual) return yearActual;
  return yearActual + 1;
}

function _inicioDeSemana(fechaISO) {
  const fecha = new Date(fechaISO + 'T00:00:00-05:00');
  const dia = fecha.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  fecha.setDate(fecha.getDate() + diff);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formatea un rango horario para mostrarlo al usuario.
 * @param {string|null} horaInicio — "HH:MM"
 * @param {string|null} horaFin — "HH:MM"
 * @returns {string}
 */
export function formatearHorario(horaInicio, horaFin) {
  if (!horaInicio) return 'Horario por confirmar';
  if (!horaFin) return horaInicio;
  return `${horaInicio} - ${horaFin}`;
}

export default { hoyISO, hoyDate, formatearFechaEspanol, parsearFechaDelMensaje, parsearAlcanceTemporal, sumarDias, nombreDia, formatearHorario };
