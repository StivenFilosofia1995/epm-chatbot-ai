const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

function headers(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Credenciales inválidas');
  return res.json();
}

export async function getLogs(token, type = 'mensajes') {
  const res = await fetch(`${API_BASE}/logs/${type}?limit=200`, { headers: headers(token) });
  if (!res.ok) throw new Error('No se pudieron cargar logs');
  return res.json();
}

export async function getSessions(token) {
  const res = await fetch(`${API_BASE}/sessions?limit=200`, { headers: headers(token) });
  if (!res.ok) throw new Error('No se pudieron cargar sesiones');
  return res.json();
}

export async function resetSession(token, sessionId) {
  const res = await fetch(`${API_BASE}/sessions/reset`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error('No se pudo resetear la sesión');
  return res.json();
}

export async function resetAll(token) {
  const res = await fetch(`${API_BASE}/sessions/reset-all`, {
    method: 'POST',
    headers: headers(token),
  });
  if (!res.ok) throw new Error('No se pudo resetear todo');
  return res.json();
}

export async function getProgramming(token, fecha = '') {
  const query = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
  const res = await fetch(`${API_BASE}/programming${query}`, { headers: headers(token) });
  if (!res.ok) throw new Error('No se pudo cargar programación');
  return res.json();
}

export async function upsertProgramming(token, payload) {
  const res = await fetch(`${API_BASE}/programming/upsert`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('No se pudo guardar actividad');
  return res.json();
}

export async function replaceMonth(token, year, month) {
  const res = await fetch(`${API_BASE}/programming/replace-month`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ year, month }),
  });
  if (!res.ok) throw new Error('No se pudo reemplazar el mes');
  return res.json();
}

export async function ingestProgrammingPdf(token, file, replaceMonth = false, ocrLang = 'spa') {
  const form = new FormData();
  form.append('file', file);
  form.append('replace_month', String(replaceMonth));
  form.append('ocr_lang', ocrLang);

  const res = await fetch(`${API_BASE}/programming/ingest-pdf`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'No se pudo procesar el PDF');
  return data;
}

export async function getOpsStatus(token) {
  const res = await fetch(`/api/wa/status`, { headers: headers(token) });
  if (!res.ok) throw new Error('No se pudo cargar estado operativo');
  return res.json();
}

export async function getOpsQr(token) {
  const res = await fetch(`/api/wa/qr`, { headers: headers(token) });
  if (!res.ok) throw new Error('No se pudo cargar QR');
  return res.json();
}

export async function getInsights(token) {
  const res = await fetch(`${API_BASE}/ops/insights`, { headers: headers(token) });
  if (!res.ok) throw new Error('No se pudieron cargar insights');
  return res.json();
}

export async function disconnectWhatsApp(token) {
  const res = await fetch(`/api/wa/reiniciar`, {
    method: 'POST',
    headers: headers(token),
  });
  if (!res.ok) throw new Error('No se pudo desconectar WhatsApp');
  return res.json();
}
