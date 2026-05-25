# Admin Suite (FastAPI + React)

Este módulo agrega un dashboard administrativo independiente del bot principal.

## Estructura
- `backend/`: FastAPI + Supabase admin API
- `frontend/`: React + Vite dashboard

## Flujo recomendado de deploy en Railway
1. Crear servicio `uva-admin-api` apuntando a `admin/backend` (Root Directory).
2. Crear servicio `uva-admin-ui` apuntando a `admin/frontend` (Root Directory).
3. Configurar variables de entorno de ambos servicios.
4. Publicar primero backend, luego frontend.

## Importante
- La URL del servicio raiz del repositorio publica el bot Node (no el panel admin).
- Si abre esa URL, vera respuesta JSON del API del bot.
- El panel admin vive en la URL del servicio `uva-admin-ui`.

## Variables clave en Railway
- `uva-admin-api`
	- `SUPABASE_URL`
	- `SUPABASE_SERVICE_KEY`
	- `ADMIN_EMAIL`
	- `ADMIN_PASSWORD`
	- `JWT_SECRET`
	- `FRONTEND_ORIGIN` = URL publica de `uva-admin-ui`
	- `BOT_API_BASE_URL` = URL publica del bot + `/wa`
	- `BOT_ADMIN_API_KEY` = mismo valor `ADMIN_API_KEY` del bot
	- `TESSERACT_CMD` y `TESSERACT_TESSDATA_DIR` segun entorno
- `uva-admin-ui`
	- `VITE_API_BASE` = URL publica de `uva-admin-api` + `/api`

## Nota de seguridad
Nunca suba claves reales a GitHub. Use variables de Railway.
