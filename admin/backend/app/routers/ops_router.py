import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends
from typing import Annotated

from ..config import settings
from ..deps import get_current_admin
from ..supabase_client import supabase


router = APIRouter(prefix='/ops', tags=['ops'])


def _fetch_bot_json(path: str):
    if not settings.bot_admin_api_key:
        return {'ok': False, 'error': 'BOT_ADMIN_API_KEY no configurada'}

    url = f"{settings.bot_api_base_url.rstrip('/')}/{path.lstrip('/')}"
    req = Request(url, headers={'x-api-key': settings.bot_admin_api_key})

    try:
        with urlopen(req, timeout=8) as resp:
            payload = resp.read().decode('utf-8')
            return json.loads(payload)
    except Exception as exc:
        return {'ok': False, 'error': str(exc)}


def _post_bot(path: str):
    if not settings.bot_admin_api_key:
        return {'ok': False, 'error': 'BOT_ADMIN_API_KEY no configurada'}

    url = f"{settings.bot_api_base_url.rstrip('/')}/{path.lstrip('/')}"
    req = Request(
        url,
        data=b'{}',
        headers={'x-api-key': settings.bot_admin_api_key, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urlopen(req, timeout=12) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as exc:
        return {'ok': False, 'error': str(exc)}


def _count_rows(table: str, filters=None) -> int:
    q = supabase.table(table).select('*', count='exact', head=True)
    if filters:
        q = filters(q)
    res = q.execute()
    if getattr(res, 'count', None) is not None:
        return int(res.count)
    return len(res.data or [])


@router.get('/status')
def ops_status(_admin: Annotated[str, Depends(get_current_admin)]):
    bot = _fetch_bot_json('status')
    return {'bot': bot}


@router.get('/qr')
def ops_qr(_admin: Annotated[str, Depends(get_current_admin)]):
    qr = _fetch_bot_json('qr')
    return {'qr': qr}


@router.post('/disconnect')
def ops_disconnect(_admin: Annotated[str, Depends(get_current_admin)]):
    result = _post_bot('reiniciar')
    return result


# Tabla → columna a usar en el filtro "neq" para borrar todas las filas
# (Supabase no soporta un delete() sin filtro; neq con un valor imposible
# equivale a "todas las filas reales").
_TABLAS_RESET_TOTAL = {
    'mensajes': 'jid',
    'chat_control': 'jid',
    'contactos': 'jid',
    'conversaciones': 'session_id',
    'memoria_agente': 'session_id',
}


def _borrar_tabla(tabla: str, columna: str):
    try:
        res = supabase.table(tabla).delete().neq(columna, '__no_op__').execute()
        return tabla, len(res.data or [])
    except Exception as exc:
        return tabla, f'error: {exc}'


def _reset_total_en_segundo_plano():
    with ThreadPoolExecutor(max_workers=len(_TABLAS_RESET_TOTAL)) as pool:
        resultados = pool.map(lambda kv: _borrar_tabla(*kv), _TABLAS_RESET_TOTAL.items())
    borrados = dict(resultados)

    whatsapp = _post_bot('reiniciar')

    print(f'[ResetTotal] completado. borrados={borrados} whatsapp={whatsapp}')


@router.post('/reset-total')
def reset_total(_admin: Annotated[str, Depends(get_current_admin)]):
    """Borra TODO el historial (mensajes, contactos, conversaciones, memoria,
    control humano/bot) y fuerza un reinicio limpio de la sesión de WhatsApp
    (pide QR nuevo). Acción IRREVERSIBLE — pensada para empezar de cero cuando
    el estado quedó inconsistente. El botón del panel debe confirmar dos veces
    antes de llamar esto.

    Corre en SEGUNDO PLANO y responde de inmediato: hacerlo de forma síncrona
    (esperar a que terminen los borrados + el reinicio de WhatsApp antes de
    responder) se acercaba o superaba el timeout del proxy Node → FastAPI
    (probado hasta 30s sin ser suficiente), y el usuario veía "tardó
    demasiado" aunque todo terminara funcionando bien igual. El resultado
    real queda en los logs del servidor (buscar "[ResetTotal] completado").
    """
    threading.Thread(target=_reset_total_en_segundo_plano, daemon=True).start()

    return {
        'ok': True,
        'mensaje': 'Borrado iniciado en segundo plano (mensajes, contactos, conversaciones, '
                   'memoria y sesión de WhatsApp). Puede tardar unos segundos en completarse — '
                   'espere y refresque el panel.',
    }


@router.get('/insights')
def ops_insights(_admin: Annotated[str, Depends(get_current_admin)]):
    now = datetime.now(timezone.utc)
    since_24h = (now - timedelta(hours=24)).isoformat()
    since_7d  = (now - timedelta(days=7)).isoformat()

    # El bot guarda mensajes en 'conversaciones' (rol = 'user' | 'assistant')
    # y un registro por usuario en 'memoria_agente'
    total_contactos  = _count_rows('memoria_agente')
    total_mensajes   = _count_rows('conversaciones')
    mensajes_24h     = _count_rows('conversaciones', lambda q: q.gte('created_at', since_24h))
    mensajes_7d      = _count_rows('conversaciones', lambda q: q.gte('created_at', since_7d))
    conversaciones_24h = _count_rows(
        'conversaciones',
        lambda q: q.gte('created_at', since_24h).eq('rol', 'user'),
    )
    chats_humano = _count_rows('chat_control', lambda q: q.eq('modo', 'humano'))

    return {
        'totales': {
            'contactos': total_contactos,
            'mensajes': total_mensajes,
        },
        'actividad': {
            'mensajes_24h': mensajes_24h,
            'mensajes_7d': mensajes_7d,
            'conversaciones_24h': conversaciones_24h,
        },
        'operacion': {
            'chats_modo_humano': chats_humano,
            'actualizado_en': now.isoformat(),
        },
    }
