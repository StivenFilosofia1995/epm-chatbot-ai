from datetime import date
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from typing import Annotated
from ..deps import get_current_admin
from ..supabase_client import supabase
from ..schemas import ScheduleItem, ReplaceMonthInput
from ..pdf_ingestion import extract_text_from_pdf_bytes, parse_programming_text


router = APIRouter(prefix='/programming', tags=['programming'])


def _known_uvas() -> list[str]:
    rows = (
        supabase
        .table('programacion_uva')
        .select('uva_nombre')
        .limit(5000)
        .execute()
    ).data or []
    found = {row.get('uva_nombre', '').strip() for row in rows if row.get('uva_nombre')}
    if not found:
        found = {
            'UVA de La Imaginacion',
            'UVA El Paraiso',
            'UVA Nuevo Occidente',
            'UVA Sol de Oriente',
            'UVA Mirador de Calasanz',
        }
    return sorted(found)


def _replace_month_if_requested(first_date: str | None):
    if not first_date:
        return
    year, month, _ = first_date.split('-')
    first_day = f'{int(year):04d}-{int(month):02d}-01'
    next_month = f'{int(year) + (1 if int(month) == 12 else 0):04d}-{(1 if int(month) == 12 else int(month) + 1):02d}-01'
    supabase.table('programacion_uva').delete().gte('fecha', first_day).lt('fecha', next_month).execute()


@router.get('')
def list_programming(
    _admin: Annotated[str, Depends(get_current_admin)],
    fecha: Annotated[str | None, Query()] = None,
    uva: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
):
    q = supabase.table('programacion_uva').select('*').order('fecha').order('hora_inicio').limit(limit)
    if fecha:
        q = q.eq('fecha', fecha)
    if uva:
        q = q.eq('uva_nombre', uva)
    result = q.execute()
    return {'items': result.data or []}


@router.post('/upsert')
def upsert_programming(item: ScheduleItem, _admin: Annotated[str, Depends(get_current_admin)]):
    payload = item.model_dump()
    supabase.table('programacion_uva').insert(payload).execute()
    return {'ok': True, 'item': payload}


@router.delete('/by-month')
def delete_month(year: int, month: int, _admin: Annotated[str, Depends(get_current_admin)]):
    first_day = f'{year:04d}-{month:02d}-01'
    next_month = f'{year + (1 if month == 12 else 0):04d}-{(1 if month == 12 else month + 1):02d}-01'
    supabase.table('programacion_uva').delete().gte('fecha', first_day).lt('fecha', next_month).execute()
    return {'ok': True, 'deleted_range': [first_day, next_month]}


@router.post('/replace-month')
def replace_month(data: ReplaceMonthInput, _admin: Annotated[str, Depends(get_current_admin)]):
    first_day = f'{data.year:04d}-{data.month:02d}-01'
    next_month = f'{data.year + (1 if data.month == 12 else 0):04d}-{(1 if data.month == 12 else data.month + 1):02d}-01'
    supabase.table('programacion_uva').delete().gte('fecha', first_day).lt('fecha', next_month).execute()
    return {'ok': True, 'month': data.month, 'year': data.year}


@router.post('/ingest-pdf')
async def ingest_pdf_programming(
    _admin: Annotated[str, Depends(get_current_admin)],
    file: UploadFile = File(...),
    replace_month: bool = Form(False),
    ocr_lang: str = Form('spa'),
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Solo se permiten archivos PDF')

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail='El PDF esta vacio')

    text, extract_debug = extract_text_from_pdf_bytes(pdf_bytes, ocr_lang=ocr_lang)
    if not text.strip():
        raise HTTPException(status_code=422, detail='No se pudo extraer texto util del PDF')

    parsed = parse_programming_text(text, _known_uvas())
    if not parsed.items:
        raise HTTPException(
            status_code=422,
            detail='No se detectaron actividades. Verifique formato del PDF o active OCR en el servidor.',
        )

    if replace_month:
        _replace_month_if_requested(parsed.items[0].get('fecha'))

    payload = [
        {
            'uva_nombre': item['uva_nombre'],
            'fecha': item['fecha'] or date.today().isoformat(),
            'hora_inicio': item.get('hora_inicio'),
            'hora_fin': item.get('hora_fin'),
            'actividad': item.get('actividad') or 'Actividad por confirmar',
            'descripcion': item.get('descripcion'),
            'edad_recomendada': item.get('edad_recomendada'),
        }
        for item in parsed.items
    ]

    supabase.table('programacion_uva').insert(payload).execute()

    return {
        'ok': True,
        'archivo': file.filename,
        'insertados': len(payload),
        'extract_debug': extract_debug,
        'parse_debug': parsed.debug,
    }
