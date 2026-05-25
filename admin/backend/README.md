# UVA Admin Backend (FastAPI)

## Objetivo
API administrativa para operar el bot UVA: autenticación, logs, sesiones y programación.

## Endpoints principales
- `POST /api/auth/login`
- `GET /api/logs/mensajes`
- `GET /api/logs/conversaciones`
- `GET /api/sessions`
- `POST /api/sessions/reset`
- `POST /api/sessions/reset-all`
- `GET /api/programming`
- `POST /api/programming/upsert`
- `POST /api/programming/ingest-pdf` (adjunta PDF, extrae con texto/OCR y guarda)
- `POST /api/programming/replace-month`
- `DELETE /api/programming/by-month`
- `GET /api/ops/status` (estado de WhatsApp)
- `GET /api/ops/qr` (QR actual para login)
- `GET /api/ops/insights` (métricas operativas)

## Ejecución local
1. Copie `.env.example` a `.env`.
2. Instale dependencias.
3. Inicie el servidor.

```bash
cd admin/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Ingesta de PDF con OCR
- La API primero intenta extraer texto embebido (`pypdf`).
- Si el PDF viene como imagen, usa OCR de respaldo (`PyMuPDF` + `pytesseract`).
- Para OCR en Windows instale Tesseract OCR y agregue su binario al `PATH`.

## Variables mínimas
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`
- `BOT_API_BASE_URL`
- `BOT_ADMIN_API_KEY`
