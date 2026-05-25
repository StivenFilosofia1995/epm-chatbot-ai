-- ============================================================
-- schema.sql — Agente UVA Medellín
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Programación parseada de las UVAs
CREATE TABLE IF NOT EXISTS programacion_uva (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  uva_nombre      TEXT        NOT NULL,
  fecha           DATE        NOT NULL,
  hora_inicio     TIME,
  hora_fin        TIME,
  actividad       TEXT        NOT NULL,
  descripcion     TEXT,
  edad_recomendada TEXT,
  raw_text        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Historial de conversaciones
CREATE TABLE IF NOT EXISTS conversaciones (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       TEXT        NOT NULL,
  rol              TEXT        NOT NULL CHECK (rol IN ('user', 'assistant')),
  mensaje          TEXT        NOT NULL,
  barrio_detectado TEXT,
  uva_asignada     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Log de scraping
CREATE TABLE IF NOT EXISTS scraping_log (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha_scraping        TIMESTAMPTZ DEFAULT NOW(),
  url                   TEXT,
  status                TEXT,
  actividades_encontradas INT,
  error                 TEXT
);

-- ─── Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_programacion_fecha
  ON programacion_uva(fecha);

CREATE INDEX IF NOT EXISTS idx_programacion_uva
  ON programacion_uva(uva_nombre);

CREATE INDEX IF NOT EXISTS idx_programacion_uva_fecha
  ON programacion_uva(uva_nombre, fecha);

CREATE INDEX IF NOT EXISTS idx_conversaciones_session
  ON conversaciones(session_id);

CREATE INDEX IF NOT EXISTS idx_conversaciones_created
  ON conversaciones(created_at DESC);

-- ─── RLS (Row Level Security) — Supabase ────────────────────────────────────
-- La API usa la anon key, así que habilitamos RLS con política permisiva.
-- En producción, restringir según necesidades de seguridad.

ALTER TABLE programacion_uva    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_log        ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública de la programación
CREATE POLICY "Lectura pública de programación"
  ON programacion_uva FOR SELECT
  USING (true);

-- Política: inserción desde service role (backend)
CREATE POLICY "Inserción de programación desde backend"
  ON programacion_uva FOR INSERT
  WITH CHECK (true);

-- Política: acceso completo a conversaciones desde backend
CREATE POLICY "Acceso completo a conversaciones"
  ON conversaciones FOR ALL
  USING (true)
  WITH CHECK (true);

-- Política: acceso completo a scraping_log desde backend
CREATE POLICY "Acceso completo a scraping_log"
  ON scraping_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TABLAS WHATSAPP BOT (Baileys + panel de agentes)
-- ============================================================

-- Sesión de WhatsApp (reemplaza auth_info_multi_file en disco)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id          TEXT        PRIMARY KEY,           -- ej: "default"
  creds       JSONB,                              -- credenciales de Baileys
  keys        JSONB,                              -- claves de cifrado de señal
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Control bot vs humano por chat
CREATE TABLE IF NOT EXISTS chat_control (
  jid                    TEXT        PRIMARY KEY,  -- ej: 573001234567@s.whatsapp.net
  modo                   TEXT        NOT NULL DEFAULT 'bot' CHECK (modo IN ('bot', 'humano')),
  tomado_por             TEXT,                     -- nombre del agente humano
  tomado_at              TIMESTAMPTZ,
  ultimo_mensaje_humano  TIMESTAMPTZ,              -- para timeout automático
  notas                  TEXT,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Historial completo de mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS mensajes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  jid         TEXT        NOT NULL,
  wamid       TEXT        UNIQUE,                  -- ID del mensaje en WhatsApp
  direccion   TEXT        NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  de          TEXT,
  contenido   TEXT,
  tipo        TEXT        DEFAULT 'text',
  enviado_por TEXT        DEFAULT 'bot' CHECK (enviado_por IN ('bot', 'humano')),
  leido       BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Contactos conocidos
CREATE TABLE IF NOT EXISTS contactos (
  jid              TEXT        PRIMARY KEY,
  nombre           TEXT,
  telefono         TEXT,
  etiquetas        TEXT[],
  primer_contacto  TIMESTAMPTZ DEFAULT NOW(),
  ultimo_contacto  TIMESTAMPTZ DEFAULT NOW(),
  total_mensajes   INT         DEFAULT 0,
  notas            TEXT
);

-- ─── Índices WhatsApp ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mensajes_jid     ON mensajes(jid);
CREATE INDEX IF NOT EXISTS idx_mensajes_created ON mensajes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_control_modo ON chat_control(modo);

-- ─── Trigger updated_at en chat_control ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_control_updated
  BEFORE UPDATE ON chat_control
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Realtime (para panel web en tiempo real) ──────────────────────────────
ALTER TABLE chat_control REPLICA IDENTITY FULL;
ALTER TABLE mensajes     REPLICA IDENTITY FULL;

-- ─── RLS para tablas de WhatsApp ───────────────────────────────────────────
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_control      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso completo a whatsapp_sessions"
  ON whatsapp_sessions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acceso completo a chat_control"
  ON chat_control FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acceso completo a mensajes"
  ON mensajes FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acceso completo a contactos"
  ON contactos FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- MEMORIA DEL AGENTE (bot + humano)
-- ============================================================
-- Almacena hechos clave recordados por sesión/contacto.
-- El bot la usa para no volver a preguntar barrio, nombre, etc.
-- El humano la usa para dejar notas persistentes sobre el contacto.

CREATE TABLE IF NOT EXISTS memoria_agente (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  TEXT        NOT NULL,               -- JID de WA o session_id del chat web
  tipo        TEXT        NOT NULL DEFAULT 'bot' CHECK (tipo IN ('bot', 'humano')),
  clave       TEXT        NOT NULL,               -- 'barrio', 'nombre', 'uva', 'nota', 'preferencia', ...
  valor       TEXT        NOT NULL,
  confianza   NUMERIC(3,2) DEFAULT 1.0,           -- 0.0–1.0, útil si la clave fue inferida por IA
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, tipo, clave)                -- una sola entrada por clave por sesión
);

CREATE INDEX IF NOT EXISTS idx_memoria_session ON memoria_agente(session_id);
CREATE INDEX IF NOT EXISTS idx_memoria_tipo    ON memoria_agente(tipo);

CREATE TRIGGER trg_memoria_updated
  BEFORE UPDATE ON memoria_agente
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE memoria_agente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso completo a memoria_agente"
  ON memoria_agente FOR ALL USING (true) WITH CHECK (true);
