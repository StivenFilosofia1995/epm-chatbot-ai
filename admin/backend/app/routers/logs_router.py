from fastapi import APIRouter, Depends, Query
from ..deps import get_current_admin
from ..supabase_client import supabase


router = APIRouter(prefix='/logs', tags=['logs'])


@router.get('/mensajes')
def get_mensajes(limit: int = Query(default=100, ge=1, le=500), _admin: str = Depends(get_current_admin)):
    result = (
        supabase
        .table('mensajes')
        .select('*')
        .order('created_at', desc=True)
        .limit(limit)
        .execute()
    )
    return {'items': result.data or []}


@router.get('/conversaciones')
def get_conversaciones(limit: int = Query(default=100, ge=1, le=500), _admin: str = Depends(get_current_admin)):
    result = (
        supabase
        .table('conversaciones')
        .select('*')
        .order('created_at', desc=True)
        .limit(limit)
        .execute()
    )
    return {'items': result.data or []}
