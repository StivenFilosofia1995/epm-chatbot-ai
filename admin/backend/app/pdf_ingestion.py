import io
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import date

from .config import settings


DATE_PATTERN = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b")
TIME_RANGE_PATTERN = re.compile(
    r"\b([01]?\d|2[0-3])[:h.]?([0-5]\d)\s*(?:-|a|hasta)\s*([01]?\d|2[0-3])[:h.]?([0-5]\d)\b",
    re.IGNORECASE,
)


@dataclass
class ParseResult:
    items: list[dict]
    debug: dict


def _normalize(text: str) -> str:
    if not text:
        return ''
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', text).strip().lower()


def _to_iso_date(d: str, m: str, y: str) -> str | None:
    try:
        year = int(y)
        if year < 100:
            year += 2000
        return date(year, int(m), int(d)).isoformat()
    except ValueError:
        return None


def _fmt_time(h: str, m: str) -> str:
    return f"{int(h):02d}:{int(m):02d}"


def _detect_uva(normalized_line: str, uva_norm: dict[str, str], current_uva: str | None) -> str | None:
    for normalized_uva, original_uva in uva_norm.items():
        if normalized_uva and normalized_uva in normalized_line:
            return original_uva
    return current_uva


def _build_item(line: str, current_date: str, current_uva: str, time_match: re.Match) -> dict:
    h1, m1, h2, m2 = time_match.groups()
    hora_inicio = _fmt_time(h1, m1)
    hora_fin = _fmt_time(h2, m2)

    actividad = TIME_RANGE_PATTERN.sub('', line).strip(' -:;')
    if not actividad:
        actividad = 'Actividad por confirmar'

    return {
        'uva_nombre': current_uva,
        'fecha': current_date,
        'hora_inicio': hora_inicio,
        'hora_fin': hora_fin,
        'actividad': actividad[:240],
        'descripcion': line[:500],
        'edad_recomendada': None,
    }


def _update_current_date(line: str, current_date: str | None) -> str | None:
    date_match = DATE_PATTERN.search(line)
    if not date_match:
        return current_date
    return _to_iso_date(*date_match.groups()) or current_date


def _parse_line(
    line: str,
    current_date: str | None,
    current_uva: str | None,
    uva_norm: dict[str, str],
) -> tuple[str | None, str | None, dict | None, bool]:
    normalized = _normalize(line)
    next_date = _update_current_date(line, current_date)
    next_uva = _detect_uva(normalized, uva_norm, current_uva)

    time_match = TIME_RANGE_PATTERN.search(normalized)
    if not time_match:
        return next_date, next_uva, None, False

    if not next_date or not next_uva:
        return next_date, next_uva, None, True

    return next_date, next_uva, _build_item(line, next_date, next_uva, time_match), False


def _extract_with_pypdf(pdf_bytes: bytes) -> tuple[str, int]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    text_chunks: list[str] = []
    for page in reader.pages:
        text_chunks.append(page.extract_text() or '')
    return '\n'.join(text_chunks).strip(), len(reader.pages)


def _extract_with_ocr(pdf_bytes: bytes, ocr_lang: str) -> str:
    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image

    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
    tessdata_dir = os.path.abspath(settings.tesseract_tessdata_dir)
    if os.path.isdir(tessdata_dir):
        os.environ['TESSDATA_PREFIX'] = tessdata_dir

    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    ocr_chunks: list[str] = []

    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        ocr_chunks.append(pytesseract.image_to_string(image, lang=ocr_lang))

    return '\n'.join(ocr_chunks).strip()


def extract_text_from_pdf_bytes(pdf_bytes: bytes, ocr_lang: str = 'spa') -> tuple[str, dict]:
    debug = {
        'extractor': None,
        'pages': 0,
        'used_ocr': False,
        'warnings': [],
    }

    try:
        extracted, pages = _extract_with_pypdf(pdf_bytes)
        debug['pages'] = pages
        debug['extractor'] = 'pypdf'
        if len(extracted) > 120:
            return extracted, debug
        debug['warnings'].append('Texto embebido insuficiente, se intentara OCR.')
    except Exception as exc:
        debug['warnings'].append(f'Extraccion pypdf no disponible: {exc}')

    try:
        extracted = _extract_with_ocr(pdf_bytes, ocr_lang)
        debug['extractor'] = 'ocr'
        debug['used_ocr'] = True
        return extracted, debug
    except Exception as exc:
        debug['warnings'].append(
            'OCR no disponible. Instale PyMuPDF, Pillow y Tesseract para OCR de imagen. '
            f'Detalle: {exc}'
        )

    return '', debug


def parse_programming_text(raw_text: str, known_uvas: list[str]) -> ParseResult:
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    uva_norm = { _normalize(name): name for name in known_uvas if name }

    current_date: str | None = None
    current_uva: str | None = None
    items: list[dict] = []
    skipped = 0

    for line in lines:
        current_date, current_uva, parsed_item, was_skipped = _parse_line(
            line,
            current_date,
            current_uva,
            uva_norm,
        )
        if was_skipped:
            skipped += 1
        if parsed_item:
            items.append(parsed_item)

    return ParseResult(
        items=items,
        debug={
            'total_lineas': len(lines),
            'registros_detectados': len(items),
            'lineas_descartadas': skipped,
        },
    )
