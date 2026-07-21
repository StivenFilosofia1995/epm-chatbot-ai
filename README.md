# 🍇 Agente UVA Medellín

Sistema agéntico conversacional para que los ciudadanos de Medellín consulten la programación de su **UVA (Unidad de Vida Articulada)** más cercana, administradas por la **Fundación EPM**.

---

## ¿Qué hace?

| Agente | Función |
|---|---|
| **Scraper** | Descarga el PDF de programación desde el portal de EPM |
| **Parser** | Extrae y estructura las actividades por UVA y fecha |
| **Geo-mapper** | Mapea el barrio/comuna del usuario a su UVA correspondiente |
| **Chat** | Responde en lenguaje natural usando Anthropic Claude |
| **Scheduler** | Actualiza automáticamente la programación todos los días a las 6 AM |

---

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **PDF/OCR**: pdf-parse + tesseract.js (fallback)
- **Base de datos**: Supabase (PostgreSQL)
- **LLM**: Anthropic Claude — `claude-3-5-haiku-latest` (el archivo se llama `groq.js` por legado histórico, pero la IA real es Claude)
- **Scheduler**: node-cron
- **Deploy**: Railway

---

## Configuración local

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/uva-medellin-bot.git
cd uva-medellin-bot
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=tu-anon-key
ANTHROPIC_API_KEY=tu-anthropic-api-key
ANTHROPIC_MODEL=claude-3-5-haiku-latest
PORT=3000
ADMIN_API_KEY=clave-secreta-para-scrape-manual
EPM_PROGRAMACION_URL=https://www.grupo-epm.com/site/fundacionepm/programacion/
```

> ⚠️ **`ANTHROPIC_API_KEY` es obligatoria.** Si falta o es inválida, el bot no puede
> generar ninguna respuesta — verifíquelo en `GET /health` (`integraciones.anthropic_configurado`).

### 4. Crear tablas en Supabase

Ejecutar el archivo `schema.sql` en el SQL Editor de Supabase:

```bash
# Copiar el contenido de schema.sql en el SQL Editor de Supabase
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

El servidor inicia en `http://localhost:3000`.

---

## Endpoints

### `POST /chat`

Endpoint principal del chatbot.

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "user123", "mensaje": "¿Qué actividades hay hoy en Laureles?"}'
```

**Response:**
```json
{
  "ok": true,
  "respuesta": "🍇 UVA La Esperanza\n📅 martes 20 de mayo de 2025\n---\n⏰ 09:00 - 10:00 — Yoga para adultos...",
  "uva": "UVA La Esperanza",
  "barrio": "laureles",
  "fecha": "2025-05-20"
}
```

---

### `GET /programacion`

Consulta la programación directamente.

```bash
# Programación de hoy (todas las UVAs)
curl http://localhost:3000/programacion

# Programación de una UVA específica
curl "http://localhost:3000/programacion?uva=UVA%20La%20Esperanza&fecha=2025-05-20"
```

---

### `POST /scrape`

Trigger manual del scraper (requiere API Key).

```bash
curl -X POST http://localhost:3000/scrape \
  -H "X-API-Key: tu-admin-api-key"
```

---

### `GET /health`

Health check para Railway. Incluye `integraciones.anthropic_configurado` y
`integraciones.whatsapp_conectado` para diagnóstico rápido si el bot deja de responder.

```bash
curl http://localhost:3000/health
```

---

## Actualizar la programación mensual

La forma recomendada es el **panel admin** (`/admin` → pestaña "Programación"):

- **Subir Excel (.xlsx)** — vía preferida, no depende de scraping ni OCR. Usa el
  formato real que envía EPM cada mes (una hoja por segmento, ej. "Programación
  infantil" / "Jóvenes y adultos"), con columnas en la primera fila (cualquier
  orden): `Título del curso, Descripción, Día(s), Fecha(s), Horario, Lugar,
  Público, Inscripción, Enlace de inscripción`. El archivo completo corresponde
  a UN espacio (no trae esa columna), así que el panel pide indicar el espacio
  y el mes/año al subirlo. Entiende fechas múltiples y recurrentes en una sola
  celda (`"7, 14, 21 y 28 de julio"`, `"Todos los martes de julio"`) y horarios
  en 12h (`"2:00 p.m. a 4:00 p.m."`, incluyendo `"12:00 m."` = mediodía). Puede
  marcar "Reemplazar programación existente" para vaciar ese espacio+mes antes
  de insertar.
- **Subir PDF** — usa OCR/parser automático, útil si solo se tiene el volante oficial.
- El panel muestra una advertencia si el mes actual no tiene programación cargada —
  esa es la causa más común de que el bot responda "no tengo programación" en vez de
  fallar por completo.

---

## Deploy en Railway

### Opción A: Desde GitHub (recomendado)

1. Sube el proyecto a GitHub
2. Ve a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Selecciona el repositorio
4. En **Variables**, añade todas las del `.env.example`
5. Railway detecta automáticamente `railway.json` y el `package.json`

Este despliegue corresponde al servicio del bot/API Node.
Si abres la URL raiz veras JSON de estado/endpoints del bot.

### Admin en el mismo repositorio (monorepo)

Para publicar el panel admin crea dos servicios adicionales:

1. Servicio `uva-admin-api`
   - Root Directory: `admin/backend`
   - Usa `admin/backend/railway.json`
   - Healthcheck: `/health`
2. Servicio `uva-admin-ui`
   - Root Directory: `admin/frontend`
   - Usa `admin/frontend/railway.json`
   - Start: `npm run start`

Variables minimas de enlace entre servicios:
- En `uva-admin-api`:
  - `FRONTEND_ORIGIN` = URL publica de `uva-admin-ui`
  - `BOT_API_BASE_URL` = URL publica del bot + `/wa`
  - `BOT_ADMIN_API_KEY` = mismo `ADMIN_API_KEY` del bot
- En `uva-admin-ui`:
  - `VITE_API_BASE` = URL publica de `uva-admin-api` + `/api`

### Opción B: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Variables de entorno en Railway

En el panel de Railway → tu proyecto → **Variables**:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_KEY` | anon/public key de Supabase |
| `ANTHROPIC_API_KEY` | API key de [console.anthropic.com](https://console.anthropic.com) — **obligatoria** |
| `ANTHROPIC_MODEL` | (Opcional) `claude-3-5-haiku-latest` por defecto |
| `ADMIN_API_KEY` | Clave aleatoria segura (usa `openssl rand -hex 32`) |
| `EPM_PROGRAMACION_URL` | URL de la página de programación EPM |

---

## Configurar Supabase

### Crear el proyecto

1. Ve a [supabase.com](https://supabase.com) → **New Project**
2. Guarda la **URL** y la **anon key**
3. En el **SQL Editor**, pega y ejecuta el contenido de `schema.sql`

### Tablas creadas

- `programacion_uva` — Actividades parseadas del PDF
- `conversaciones` — Historial de chats por sesión
- `scraping_log` — Log de cada scraping ejecutado

---

## Obtener API keys

### Anthropic Claude (LLM)
1. Ve a [console.anthropic.com](https://console.anthropic.com)
2. Crea una cuenta y carga crédito (no tiene tier gratuito perpetuo como Groq)
3. **API Keys** → **Create Key**
4. Revise su límite de tasa (rate limit) según el plan — cada mensaje del bot dispara
   varias llamadas a Claude (clasificar intención, extraer nombre/barrio, tool-loop),
   así que con tráfico moderado es fácil alcanzar el límite en un tier bajo. El bot
   reintenta automáticamente con backoff ante un 429, pero si el límite persiste
   verá `⛔ Límite de tasa (429)` en los logs — ahí toca subir de tier o esperar.

### Supabase
1. Ve a [supabase.com](https://supabase.com)
2. Crea un proyecto gratuito
3. **Settings** → **API** → copia `URL` y `anon key`
4. Límite free tier: **500MB storage, 2GB bandwidth/mes**

---

## Estructura del proyecto

```
uva-medellin-bot/
├── src/
│   ├── agents/
│   │   ├── scraper-agent.js    ← Descarga el PDF de EPM
│   │   ├── parser-agent.js     ← Parsea el PDF a JSON estructurado
│   │   ├── geo-agent.js        ← Mapea barrios → UVA
│   │   ├── chat-agent.js       ← Orquesta la conversación
│   │   └── scheduler-agent.js  ← Cron job de actualización diaria
│   ├── data/
│   │   └── barrios-uva-map.js  ← Mapa estático ~300 barrios
│   ├── services/
│   │   ├── supabase.js         ← Cliente y helpers de BD
│   │   ├── groq.js             ← Cliente Anthropic Claude + prompts (nombre legado)
│   │   └── pdf-reader.js       ← Extracción PDF/OCR
│   ├── utils/
│   │   ├── normalizer.js       ← Normalización de texto
│   │   └── date-helper.js      ← Fechas en español colombiano
│   └── index.js                ← Servidor Express
├── schema.sql                  ← DDL de Supabase
├── .env.example
├── package.json
├── railway.json
└── README.md
```

---

## Costos estimados

| Servicio | Límite free | Uso estimado |
|---|---|---|
| Railway Hobby | $5 crédito/mes | ~$2/mes |
| Supabase | 500MB, 2GB BW | < 50MB |
| Anthropic Claude | Según plan/crédito cargado | Varía con tráfico — no tiene tier gratuito perpetuo |
| **Total** | — | Monitorear uso en console.anthropic.com |

---

## Contribuir

1. Fork del repositorio
2. Crea una rama: `git checkout -b feat/mi-mejora`
3. Commit: `git commit -m "feat: descripción"`
4. Push: `git push origin feat/mi-mejora`
5. Abre un Pull Request

---

## Licencia

MIT — Fundación EPM / Medellín 🍇
