#!/bin/sh
set -e

# El panel admin (FastAPI) corre como proceso secundario en background — antes,
# si se caia por CUALQUIER razon (variable de entorno de Supabase invalida,
# excepcion no manejada, etc.) nada lo reiniciaba: quedaba muerto para siempre
# hasta el proximo redeploy, aunque el bot de WhatsApp (proceso principal)
# siguiera funcionando bien. Este loop lo reinicia solo si se cae.
echo "[Startup] Iniciando FastAPI admin backend en puerto 8001..."
(
  cd /app/admin/backend
  while true; do
    uvicorn app.main:app --host 127.0.0.1 --port 8001 || true
    echo "[Startup] ⚠ FastAPI (admin backend) se detuvo. Reintentando en 3s..."
    sleep 3
  done
) &

echo "[Startup] Esperando que FastAPI arranque..."
sleep 4

echo "[Startup] Iniciando bot Node.js en puerto ${PORT:-3000}..."
cd /app
exec node src/index.js
