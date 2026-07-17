import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import LoginPanel from './components/LoginPanel.jsx';
import {
  login,
  getLogs,
  getSessions,
  resetSession,
  resetAll,
  getProgramming,
  upsertProgramming,
  replaceMonth,
  ingestProgrammingPdf,
  ingestProgrammingExcel,
  getProgrammingCoverage,
  getOpsStatus,
  getOpsQr,
  getInsights,
  disconnectWhatsApp,
} from './lib/api.js';

const TABS = ['insights', 'logs', 'sesiones', 'programacion'];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('logs');

  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [programming, setProgramming] = useState([]);
  const [opsStatus, setOpsStatus] = useState(null);
  const [opsQr, setOpsQr] = useState(null);
  const [opsQrImage, setOpsQrImage] = useState('');
  const [insights, setInsights] = useState(null);
  const [reiniciando, setReiniciando] = useState(false);
  const [coverage, setCoverage] = useState(null);

  const [fechaFiltro, setFechaFiltro] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [replaceMonthOnImport, setReplaceMonthOnImport] = useState(true);
  const [importingPdf, setImportingPdf] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [excelFile, setExcelFile] = useState(null);
  const [replaceMonthOnExcelImport, setReplaceMonthOnExcelImport] = useState(true);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelImportReport, setExcelImportReport] = useState(null);
  const [form, setForm] = useState({
    uva_nombre: '',
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    actividad: '',
    descripcion: '',
    edad_recomendada: '',
  });

  const isLogged = !!token;

  const doLogin = async (email, password) => {
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      localStorage.setItem('admin_token', data.access_token);
      setToken(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    if (!token) return;
    setError('');

    // allSettled: cada sección carga independientemente aunque otras fallen
    const [logsR, sessR, progR, statusR, qrR, insightR, coverageR] = await Promise.allSettled([
      getLogs(token, 'mensajes'),
      getSessions(token),
      getProgramming(token, fechaFiltro),
      getOpsStatus(token),
      getOpsQr(token),
      getInsights(token),
      getProgrammingCoverage(token),
    ]);

    if (logsR.status === 'fulfilled') setLogs(logsR.value.items || []);
    if (sessR.status === 'fulfilled') setSessions(sessR.value.items || []);
    if (progR.status === 'fulfilled') setProgramming(progR.value.items || []);
    if (statusR.status === 'fulfilled') setOpsStatus(statusR.value.bot || null);
    if (qrR.status === 'fulfilled') setOpsQr(qrR.value.qr || null);
    if (insightR.status === 'fulfilled') setInsights(insightR.value || null);
    if (coverageR.status === 'fulfilled') setCoverage(coverageR.value || null);

    // Mostrar los errores que ocurrieron (sin bloquear el resto)
    const errs = [logsR, sessR, progR, statusR, qrR, insightR, coverageR]
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message || 'Error desconocido');
    if (errs.length) setError(errs.join(' | '));
  };

  useEffect(() => {
    loadData();
  }, [token, fechaFiltro]);

  // Auto-refresh cada 12 s mientras esperamos QR (no conectado y sin sesión activa)
  useEffect(() => {
    if (!token) return;
    const noConectado = !opsStatus?.conectado;
    if (!noConectado) return;
    const interval = setInterval(() => {
      Promise.all([getOpsStatus(token), getOpsQr(token)]).then(([s, q]) => {
        setOpsStatus(s.bot || null);
        setOpsQr(q.qr || null);
      }).catch(() => {});
    }, 12000);
    return () => clearInterval(interval);
  }, [token, opsStatus?.conectado]);

  useEffect(() => {
    let cancelled = false;

    const buildQrImage = async () => {
      if (!opsQr?.qr || typeof opsQr.qr !== 'string') {
        setOpsQrImage('');
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(opsQr.qr, {
          width: 320,
          margin: 2,
          color: {
            dark: '#0b0f13',
            light: '#ffffff',
          },
        });
        if (!cancelled) setOpsQrImage(dataUrl);
      } catch {
        if (!cancelled) setOpsQrImage('');
      }
    };

    buildQrImage();

    return () => {
      cancelled = true;
    };
  }, [opsQr]);

  const logRows = useMemo(() => logs.slice(0, 100), [logs]);

  const handleDisconnectWhatsApp = async () => {
    if (!window.confirm('¿Desconectar WhatsApp y generar nuevo QR?')) return;
    setReiniciando(true);
    setError('');
    try {
      await disconnectWhatsApp(token);
      // Esperar 3s y refrescar para mostrar el nuevo QR
      setTimeout(async () => {
        await loadData();
        setReiniciando(false);
      }, 3000);
    } catch (err) {
      setError(err.message);
      setReiniciando(false);
    }
  };

  const saveProgram = async () => {
    try {
      await upsertProgramming(token, form);
      await loadData();
      setForm({
        uva_nombre: '',
        fecha: '',
        hora_inicio: '',
        hora_fin: '',
        actividad: '',
        descripcion: '',
        edad_recomendada: '',
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const uploadPdfProgramming = async () => {
    if (!pdfFile) {
      setError('Seleccione un PDF para importar programación.');
      return;
    }

    setError('');
    setImportReport(null);
    setImportingPdf(true);
    try {
      const report = await ingestProgrammingPdf(token, pdfFile, replaceMonthOnImport, 'spa');
      setImportReport(report);
      setPdfFile(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportingPdf(false);
    }
  };

  const uploadExcelProgramming = async () => {
    if (!excelFile) {
      setError('Seleccione un archivo Excel (.xlsx) para importar programación.');
      return;
    }

    setError('');
    setExcelImportReport(null);
    setImportingExcel(true);
    try {
      const report = await ingestProgrammingExcel(token, excelFile, replaceMonthOnExcelImport);
      setExcelImportReport(report);
      setExcelFile(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setImportingExcel(false);
    }
  };

  if (!isLogged) {
    return (
      <main className="page">
        <LoginPanel onLogin={doLogin} loading={loading} />
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <header className="topbar card">
        <div>
          <h1>Panel Operativo UVA</h1>
          <p className="muted">Monitoreo, sesiones y programación en tiempo real.</p>
          <span className="brand-chip">Fundación Grupo EPM</span>
        </div>
        <div className="actions">
          <button onClick={loadData}>Actualizar</button>
          <button className="danger" onClick={async () => { await resetAll(token); await loadData(); }}>Reset global</button>
          <button onClick={() => { localStorage.removeItem('admin_token'); setToken(''); }}>Salir</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}

      {coverage && coverage.advertencia && (
        <p className="error">
          ⚠️ {coverage.advertencia}
          {coverage.ultima_fecha && ` (última fecha cargada: ${coverage.ultima_fecha})`}
        </p>
      )}

      {tab === 'insights' && (
        <section className="card split">
          <div>
            <h2>Insights operativos</h2>
            <div className="metric-grid">
              <article className="metric">
                <h3>Contactos</h3>
                <strong>{insights?.totales?.contactos ?? '-'}</strong>
              </article>
              <article className="metric">
                <h3>Mensajes totales</h3>
                <strong>{insights?.totales?.mensajes ?? '-'}</strong>
              </article>
              <article className="metric">
                <h3>Mensajes 24h</h3>
                <strong>{insights?.actividad?.mensajes_24h ?? '-'}</strong>
              </article>
              <article className="metric">
                <h3>Mensajes 7 días</h3>
                <strong>{insights?.actividad?.mensajes_7d ?? '-'}</strong>
              </article>
              <article className="metric">
                <h3>Chats en modo humano</h3>
                <strong>{insights?.operacion?.chats_modo_humano ?? '-'}</strong>
              </article>
              <article className="metric">
                <h3>WhatsApp</h3>
                <strong>{opsStatus?.conectado ? 'Conectado' : 'Desconectado'}</strong>
              </article>
            </div>
          </div>

          <aside className="editor">
            <h3>Conexión WhatsApp</h3>

            {reiniciando && <p className="muted">⏳ Reiniciando sesión, espera...</p>}

            {!reiniciando && opsStatus?.conectado && (
              <>
                <p className="ok">✅ Sesión activa: {opsStatus?.numero || 'N/D'}</p>
                <button className="danger" onClick={handleDisconnectWhatsApp}>
                  Desconectar y generar nuevo QR
                </button>
              </>
            )}

            {!reiniciando && !opsStatus?.conectado && opsQr?.qr && (
              <>
                <p className="muted">📱 Escanea con WhatsApp Business → Dispositivos vinculados → Vincular dispositivo</p>
                {opsQrImage ? (
                  <img
                    className="qr-image"
                    src={opsQrImage}
                    alt="QR de inicio de sesion WhatsApp"
                    width={300}
                    height={300}
                    style={{ display: 'block', margin: '12px 0', borderRadius: 8 }}
                  />
                ) : (
                  <p className="muted">Generando imagen QR...</p>
                )}
                <p className="muted small">Generado: {opsQr?.generado_en || 'N/D'} — actualiza cada 12 s</p>
                <button onClick={loadData} style={{ marginTop: 8 }}>🔄 Refrescar QR ahora</button>
              </>
            )}

            {!reiniciando && !opsStatus?.conectado && !opsQr?.qr && (
              <>
                <p className="muted">No hay QR activo.</p>
                <button onClick={handleDisconnectWhatsApp}>
                  Generar nuevo QR
                </button>
                <button onClick={loadData} style={{ marginTop: 8 }}>🔄 Refrescar</button>
                {opsQr?.error && (
                  <p className="error" style={{ marginTop: 8 }}>
                    Error al consultar bot: {opsQr.error}
                  </p>
                )}
              </>
            )}
          </aside>
        </section>
      )}

      {tab === 'logs' && (
        <section className="card">
          <h2>Logs recientes</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>JID</th>
                  <th>Dirección</th>
                  <th>Contenido</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map((row) => (
                  <tr key={row.wamid || Math.random()}>
                    <td>{row.jid}</td>
                    <td>{row.direccion}</td>
                    <td>{row.contenido?.slice(0, 140)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'sesiones' && (
        <section className="card">
          <h2>Sesiones activas</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>JID</th>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Último contacto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.jid}>
                    <td>{s.jid}</td>
                    <td>{s.nombre}</td>
                    <td>{s.telefono}</td>
                    <td>{s.ultimo_contacto}</td>
                    <td>
                      <button onClick={async () => { await resetSession(token, s.jid); await loadData(); }}>
                        Reset sesión
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'programacion' && (
        <section className="card split">
          <div>
            <h2>Programación</h2>
            <label>
              <span>Filtrar por fecha</span>
              <input
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
              />
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>UVA</th>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {programming.slice(0, 300).map((p, i) => (
                    <tr key={`${p.uva_nombre}-${p.fecha}-${i}`}>
                      <td>{p.uva_nombre}</td>
                      <td>{p.fecha}</td>
                      <td>{p.hora_inicio} - {p.hora_fin}</td>
                      <td>{p.actividad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="editor">
            <h3>Cargar programación desde PDF</h3>
            <label htmlFor="programming-pdf-file">Archivo PDF</label>
            <input
              id="programming-pdf-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            />
            <label className="inline-check">
              <input
                type="checkbox"
                checked={replaceMonthOnImport}
                onChange={(e) => setReplaceMonthOnImport(e.target.checked)}
              />
              <span>Reemplazar mes detectado antes de importar</span>
            </label>
            <button onClick={uploadPdfProgramming} disabled={importingPdf}>
              {importingPdf ? 'Procesando PDF...' : 'Importar PDF (OCR + parser)'}
            </button>
            {importReport && (
              <div className="ok">
                <strong>Importación exitosa</strong>
                <p>
                  Insertados: {importReport.insertados} | Extractor: {importReport.extract_debug?.extractor || 'N/D'}
                </p>
              </div>
            )}

            <h3>Cargar programación desde Excel</h3>
            <p className="muted small">
              Recomendado para actualizar el mes: no depende de scraping ni OCR.
              Columnas esperadas en la primera fila: uva_nombre, fecha, hora_inicio, hora_fin, actividad, descripcion, edad_recomendada.
            </p>
            <label htmlFor="programming-excel-file">Archivo Excel (.xlsx)</label>
            <input
              id="programming-excel-file"
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
            />
            <label className="inline-check">
              <input
                type="checkbox"
                checked={replaceMonthOnExcelImport}
                onChange={(e) => setReplaceMonthOnExcelImport(e.target.checked)}
              />
              <span>Reemplazar mes detectado antes de importar</span>
            </label>
            <button onClick={uploadExcelProgramming} disabled={importingExcel}>
              {importingExcel ? 'Procesando Excel...' : 'Importar Excel'}
            </button>
            {excelImportReport && (
              <div className="ok">
                <strong>Importación exitosa</strong>
                <p>
                  Insertados: {excelImportReport.insertados} | Hojas leídas: {excelImportReport.parse_debug?.hojas_leidas ?? 'N/D'}
                  {excelImportReport.parse_debug?.filas_descartadas
                    ? ` | Filas descartadas: ${excelImportReport.parse_debug.filas_descartadas}`
                    : ''}
                </p>
              </div>
            )}

            <h3>Nueva actividad</h3>
            {Object.keys(form).map((k) => (
              <label key={k}>
                <span>{k}</span>
                <input value={form[k]} onChange={(e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))} />
              </label>
            ))}
            <button onClick={saveProgram}>Guardar actividad</button>
            <button
              className="danger"
              onClick={async () => {
                const today = new Date();
                await replaceMonth(token, today.getFullYear(), today.getMonth() + 1);
                await loadData();
              }}
            >
              Vaciar mes actual
            </button>
          </aside>
        </section>
      )}
    </main>
  );
}
