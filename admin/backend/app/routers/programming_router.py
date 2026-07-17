import io
from datetime import date, datetime, time as dt_time
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from typing import Annotated
from ..deps import get_current_admin
from ..supabase_client import supabase
from ..schemas import ScheduleItem, ReplaceMonthInput
from ..pdf_ingestion import extract_text_from_pdf_bytes, parse_programming_text


router = APIRouter(prefix='/programming', tags=['programming'])

# Encabezados aceptados en el Excel (case-insensitive, sin tildes) → columna real
_EXCEL_COLUMNAS = {
    'uva_nombre': ['uva_nombre', 'uva', 'nombre uva', 'espacio', 'recinto'],
    'fecha': ['fecha', 'dia', 'date'],
    'hora_inicio': ['hora_inicio', 'hora inicio', 'inicio', 'hora_de_inicio'],
    'hora_fin': ['hora_fin', 'hora fin', 'fin', 'hora_de_fin'],
    'actividad': ['actividad', 'nombre_actividad', 'titulo', 'evento'],
    'descripcion': ['descripcion', 'detalle', 'observaciones'],
    'edad_recomendada': ['edad_recomendada', 'edad', 'rango_edad', 'publico'],
}


def _sin_tildes(texto: str) -> str:
    import unicodedata
    texto = unicodedata.normalize('NFKD', texto)
    return ''.join(ch for ch in texto if not unicodedata.combining(ch))


def _mapear_encabezados(fila_encabezado: list) -> dict[str, int]:
    """Retorna {campo_interno: indice_columna} según los encabezados detectados."""
    normalizados = [
        _sin_tildes(str(c).strip().lower()) if c is not None else ''
        for c in fila_encabezado
    ]
    mapeo: dict[str, int] = {}
    for campo, alias in _EXCEL_COLUMNAS.items():
        for idx, encabezado in enumerate(normalizados):
            if encabezado in alias:
                mapeo[campo] = idx
                break
    return mapeo


def _valor_fecha(v) -> str | None:
    if v is None or v == '':
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d/%m/%y'):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _valor_hora(v) -> str | None:
    if v is None or v == '':
        return None
    if isinstance(v, dt_time):
        return v.strftime('%H:%M')
    if isinstance(v, datetime):
        return v.strftime('%H:%M')
    s = str(v).strip()
    s = s.replace('.', ':').replace('h', ':').rstrip(':')
    for fmt in ('%H:%M', '%H:%M:%S'):
        try:
            return datetime.strptime(s, fmt).strftime('%H:%M')
        except ValueError:
            continue
    return s or None


def parse_programming_excel(file_bytes: bytes) -> tuple[list[dict], dict]:
    """Parsea un .xlsx de programación mensual a la misma forma que usa Supabase.

    Espera una fila de encabezado con columnas reconocibles (ver _EXCEL_COLUMNAS)
    en cualquier orden. Las columnas 'uva_nombre', 'fecha' y 'actividad' son
    obligatorias por fila; el resto es opcional.
    """
    from openpyxl import load_workbook

    debug = {'hojas_leidas': 0, 'filas_totales': 0, 'filas_descartadas': 0, 'columnas_detectadas': {}}
    items: list[dict] = []

    wb = load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)

    for hoja in wb.worksheets:
        filas = hoja.iter_rows(values_only=True)
        try:
            encabezado = next(filas)
        except StopIteration:
            continue

        mapeo = _mapear_encabezados(list(encabezado))
        if 'uva_nombre' not in mapeo or 'fecha' not in mapeo or 'actividad' not in mapeo:
            continue  # hoja sin las columnas mínimas — se ignora (p.ej. una hoja de notas)

        debug['hojas_leidas'] += 1
        debug['columnas_detectadas'][hoja.title] = list(mapeo.keys())

        def _get(fila, campo):
            idx = mapeo.get(campo)
            return fila[idx] if idx is not None and idx < len(fila) else None

        for fila in filas:
            if fila is None or all(v is None or str(v).strip() == '' for v in fila):
                continue
            debug['filas_totales'] += 1

            uva_nombre = _get(fila, 'uva_nombre')
            fecha = _valor_fecha(_get(fila, 'fecha'))
            actividad = _get(fila, 'actividad')

            if not uva_nombre or not fecha or not actividad:
                debug['filas_descartadas'] += 1
                continue

            items.append({
                'uva_nombre': str(uva_nombre).strip(),
                'fecha': fecha,
                'hora_inicio': _valor_hora(_get(fila, 'hora_inicio')),
                'hora_fin': _valor_hora(_get(fila, 'hora_fin')),
                'actividad': str(actividad).strip()[:240],
                'descripcion': (str(_get(fila, 'descripcion')).strip() or None) if _get(fila, 'descripcion') else None,
                'edad_recomendada': (str(_get(fila, 'edad_recomendada')).strip() or None) if _get(fila, 'edad_recomendada') else None,
            })

    return items, debug


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


@router.post('/ingest-excel')
async def ingest_excel_programming(
    _admin: Annotated[str, Depends(get_current_admin)],
    file: UploadFile = File(...),
    replace_month: bool = Form(False),
):
    """Carga la programación mensual desde un Excel (.xlsx).

    Columnas esperadas (en cualquier orden, con encabezado en la primera fila):
    uva_nombre, fecha, hora_inicio, hora_fin, actividad, descripcion, edad_recomendada.
    Es la vía recomendada para actualizar el mes: no depende de scraping ni OCR.
    """
    if not file.filename.lower().endswith(('.xlsx', '.xlsm')):
        raise HTTPException(status_code=400, detail='Solo se permiten archivos Excel (.xlsx)')

    excel_bytes = await file.read()
    if not excel_bytes:
        raise HTTPException(status_code=400, detail='El archivo esta vacio')

    try:
        items, parse_debug = parse_programming_excel(excel_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f'No se pudo leer el Excel: {exc}')

    if not items:
        raise HTTPException(
            status_code=422,
            detail='No se detectaron filas válidas. Verifique que la primera fila tenga los '
                   'encabezados uva_nombre, fecha, hora_inicio, hora_fin y actividad.',
        )

    if replace_month:
        fechas_validas = sorted(i['fecha'] for i in items if i.get('fecha'))
        if fechas_validas:
            _replace_month_if_requested(fechas_validas[0])

    supabase.table('programacion_uva').insert(items).execute()

    return {
        'ok': True,
        'archivo': file.filename,
        'insertados': len(items),
        'parse_debug': parse_debug,
    }


@router.get('/coverage')
def programming_coverage(_admin: Annotated[str, Depends(get_current_admin)]):
    """Resume qué tan al día está la programación cargada.

    Se usa en el panel para advertir cuando el mes actual no tiene datos —
    la causa más común de que el bot responda "no tengo programación" seguido.
    """
    rows = (
        supabase
        .table('programacion_uva')
        .select('fecha')
        .order('fecha')
        .limit(20000)
        .execute()
    ).data or []

    fechas = sorted({r['fecha'] for r in rows if r.get('fecha')})
    hoy = date.today().isoformat()
    mes_actual = hoy[:7]
    tiene_mes_actual = any(f.startswith(mes_actual) for f in fechas)

    return {
        'ok': True,
        'hoy': hoy,
        'primera_fecha': fechas[0] if fechas else None,
        'ultima_fecha': fechas[-1] if fechas else None,
        'total_fechas_distintas': len(fechas),
        'mes_actual_cubierto': tiene_mes_actual,
        'advertencia': None if tiene_mes_actual else (
            f'No hay programación cargada para el mes actual ({mes_actual}). '
            'El bot responderá "no tengo programación" a la mayoría de consultas '
            'hasta que se cargue el Excel o PDF de este mes.'
        ),
    }
