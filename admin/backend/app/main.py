from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers.auth_router import router as auth_router
from .routers.logs_router import router as logs_router
from .routers.sessions_router import router as sessions_router
from .routers.programming_router import router as programming_router
from .routers.ops_router import router as ops_router


app = FastAPI(title='UVA Admin API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'uva-admin-api'}


app.include_router(auth_router, prefix='/api')
app.include_router(logs_router, prefix='/api')
app.include_router(sessions_router, prefix='/api')
app.include_router(programming_router, prefix='/api')
app.include_router(ops_router, prefix='/api')
