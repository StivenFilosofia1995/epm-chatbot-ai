import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers.auth_router import router as auth_router
from .routers.logs_router import router as logs_router
from .routers.sessions_router import router as sessions_router
from .routers.programming_router import router as programming_router
from .routers.ops_router import router as ops_router


app = FastAPI(title='UVA Admin API', version='1.0.0')

# En produccion el frontend se sirve desde la misma URL → origen es el propio servicio
# En local el origen puede ser localhost:5173
origins = [settings.frontend_origin, 'http://localhost:5173', 'http://127.0.0.1:5173']

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'service': 'uva-admin-api',
        'admin_email_loaded': settings.admin_email,  # debug temporal
    }


app.include_router(auth_router, prefix='/api')
app.include_router(logs_router, prefix='/api')
app.include_router(sessions_router, prefix='/api')
app.include_router(programming_router, prefix='/api')
app.include_router(ops_router, prefix='/api')

# ─── Servir frontend React (solo si el build existe) ─────────────────────────
STATIC_DIR = Path(__file__).parent.parent / 'static'

if STATIC_DIR.exists():
    # Archivos del build de Vite (JS, CSS, etc.)
    app.mount('/assets', StaticFiles(directory=str(STATIC_DIR / 'assets')), name='assets')

    # SPA fallback: cualquier ruta que no sea /api ni /health → index.html
    @app.get('/{full_path:path}')
    def serve_spa(full_path: str):
        index = STATIC_DIR / 'index.html'
        if index.exists():
            return FileResponse(str(index))
        return {'error': 'Frontend no disponible'}
