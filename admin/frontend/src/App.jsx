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
  getOpsStatus,
  getOpsQr,
  getInsights,
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

  const [fechaFiltro, setFechaFiltro] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [replaceMonthOnImport, setReplaceMonthOnImport] = useState(true);
  const [importingPdf, setImportingPdf] = useState(false);
  const [importReport, setImportReport] = useState(null);
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
    try {
      const [l, s, p] = await Promise.all([
        getLogs(token, 'mensajes'),
        getSessions(token),
        getProgramming(token, fechaFiltro),
      ]);
      setLogs(l.items || []);
      setSessions(s.items || []);
      setProgramming(p.items || []);

      const [statusData, qrData, insightData] = await Promise.all([
        getOpsStatus(token),
        getOpsQr(token),
        getInsights(token),
      ]);
      setOpsStatus(statusData.bot || null);
      setOpsQr(qrData.qr || null);
      setInsights(insightData || null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, fechaFiltro]);

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
            <h3>Inicio de sesión WhatsApp (QR)</h3>
            {opsStatus?.conectado && <p className="ok">Sesión activa: {opsStatus?.numero || 'N/D'}</p>}
            {!opsStatus?.conectado && opsQr?.qr && (
              <>
                <p className="muted">Escanee este código en WhatsApp Business.</p>
                {opsQrImage ? (
                  <img
                    className="qr-image"
                    src={opsQrImage}
                    alt="QR de inicio de sesion WhatsApp"
                    width={320}
                    height={320}
                  />
                ) : (
                  <p className="muted">Generando imagen QR...</p>
                )}
                <p className="muted small">Generado: {opsQr?.generado_en || 'N/D'}</p>
              </>
            )}
            {!opsStatus?.conectado && opsQr?.error && (
              <p className="error">No se pudo consultar el QR del bot: {opsQr.error}</p>
            )}
            {!opsStatus?.conectado && !opsQr?.qr && (
              <p className="muted">Aún no hay QR disponible. Presione "Actualizar".</p>
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
