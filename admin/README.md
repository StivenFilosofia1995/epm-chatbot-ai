# Admin Suite (FastAPI + React)

Este módulo agrega un dashboard administrativo independiente del bot principal.

## Estructura
- `backend/`: FastAPI + Supabase admin API
- `frontend/`: React + Vite dashboard

## Flujo recomendado de deploy en Railway
1. Crear servicio `uva-admin-api` apuntando a `admin/backend`.
2. Crear servicio `uva-admin-ui` apuntando a `admin/frontend`.
3. Configurar variables de entorno de ambos servicios.
4. Publicar primero backend, luego frontend.

## Nota de seguridad
Nunca suba claves reales a GitHub. Use variables de Railway.
