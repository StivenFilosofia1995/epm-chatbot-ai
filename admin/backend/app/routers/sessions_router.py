from fastapi import APIRouter, Depends
from typing import Annotated
from ..deps import get_current_admin
from ..supabase_client import supabase
from ..schemas import SessionResetInput


router = APIRouter(prefix='/sessions', tags=['sessions'])


@router.get('')
def list_sessions(_admin: Annotated[str, Depends(get_current_admin)], limit: int = 100):
    contactos = (
        supabase
        .table('contactos')
        .select('jid,nombre,telefono,ultimo_contacto,total_mensajes')
        .order('ultimo_contacto', desc=True)
        .limit(limit)
        .execute()
    )
    return {'items': contactos.data or []}


@router.post('/reset')
def reset_session(data: SessionResetInput, _admin: Annotated[str, Depends(get_current_admin)]):
    sid = data.session_id

    supabase.table('conversaciones').delete().eq('session_id', sid).execute()
    supabase.table('memoria_agente').delete().eq('session_id', sid).execute()

    supabase.table('chat_control').upsert({
        'jid': sid,
        'modo': 'bot',
        'tomado_por': None,
        'tomado_at': None,
        'ultimo_mensaje_humano': None,
    }, on_conflict='jid').execute()

    return {'ok': True, 'session_id': sid}


@router.post('/reset-all')
def reset_all_sessions(_admin: Annotated[str, Depends(get_current_admin)]):
    supabase.table('conversaciones').delete().neq('session_id', '__no_op__').execute()
    supabase.table('memoria_agente').delete().neq('session_id', '__no_op__').execute()
    return {'ok': True}
