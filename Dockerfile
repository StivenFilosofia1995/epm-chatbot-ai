# ─── Etapa 1: Build del frontend React ───────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build
COPY admin/frontend/package*.json ./
RUN npm ci
COPY admin/frontend/ ./

# El frontend llama /api/* en la misma URL del servicio
# Node.js Express lo proxea internamente a FastAPI en 127.0.0.1:8001
ENV VITE_API_BASE=/api
RUN npm run build

# ─── Etapa 2: Imagen final Node.js + Python ───────────────────────────────────
FROM python:3.12-slim

# Instalar Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Dependencias Python (admin FastAPI) ─────────────────────────────────────
COPY admin/backend/requirements.txt /tmp/admin-requirements.txt
RUN pip install --no-cache-dir -r /tmp/admin-requirements.txt

# ── Dependencias Node.js (bot) ───────────────────────────────────────────────
COPY package*.json ./
RUN npm ci --omit=dev

# ── Código fuente completo ───────────────────────────────────────────────────
COPY . .

# ── Build del frontend ya compilado ─────────────────────────────────────────
COPY --from=frontend-build /build/dist ./admin-frontend-dist

# Permisos del script de arranque (strip CRLF en caso de checkout Windows)
RUN sed -i 's/\r//' start.sh && chmod +x start.sh

EXPOSE 3000

CMD ["sh", "start.sh"]
