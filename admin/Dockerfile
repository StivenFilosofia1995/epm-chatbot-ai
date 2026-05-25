# ─── Etapa 1: Build del frontend React ───────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./

# VITE_API_BASE=/api → el navegador llama /api en la misma URL del servicio
ENV VITE_API_BASE=/api
RUN npm run build

# ─── Etapa 2: Backend FastAPI con frontend incluido ───────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Dependencias Python
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Código del backend
COPY backend/ ./

# Build de React → carpeta static/ del backend
COPY --from=frontend-build /frontend/dist ./static

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
