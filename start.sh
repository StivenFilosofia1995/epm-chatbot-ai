#!/bin/sh
set -e

echo "[Startup] Iniciando FastAPI admin backend en puerto 8001..."
cd /app/admin/backend
uvicorn app.main:app --host 127.0.0.1 --port 8001 &

echo "[Startup] Esperando que FastAPI arranque..."
sleep 4

echo "[Startup] Iniciando bot Node.js en puerto ${PORT:-3000}..."
cd /app
exec node src/index.js
