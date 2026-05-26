import json
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
