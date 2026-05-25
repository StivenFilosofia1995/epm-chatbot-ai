#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
"""
agenda_to_markdown.py — Convierte actividades de UVA a Markdown compacto para LLMs.

Entrada  stdin : JSON {"actividades": [...], "uva": "UVA La Armonía", "fecha": "2026-05-20"}
                 o directamente un array JSON de actividades.
Salida   stdout: Markdown compacto (mucho menos tokens que JSON)

Formato de salida:
  ## 🍇 UVA La Armonía
  ### 📅 2026-05-20
  - 💃 `09:00–10:30` **Danza folclórica** — Descripción _(👥 Todas las edades)_
  ...
  > 📞 Inscripciones: consulte directamente en la UVA.
"""

import sys
import json
from collections import defaultdict

EMOJIS = {
    'danza': '💃', 'baile': '💃', 'ballet': '💃', 'salsa': '💃', 'folclor': '💃', 'tango': '💃',
    'futbol': '⚽', 'deporte': '⚽', 'atletis': '⚽', 'natacion': '⚽', 'voleibol': '⚽',
    'basquet': '⚽', 'aerobic': '⚽', 'ciclismo': '⚽',
    'teatro': '🎭', 'actuacion': '🎭', 'drama': '🎭', 'performance': '🎭',
    'musica': '🎵', 'canto': '🎵', 'coro': '🎵', 'guitar': '🎵', 'piano': '🎵',
    'banda': '🎵', 'percusi': '🎵', 'ritmo': '🎵',
    'pintura': '🎨', 'dibujo': '🎨', 'arte': '🎨', 'manualidad': '🎨',
    'ceramica': '🎨', 'tejido': '🎨', 'bordado': '🎨',
    'yoga': '🧘', 'meditacion': '🧘', 'bienestar': '🧘', 'relajaci': '🧘', 'mindful': '🧘',
    'lectura': '📚', 'libro': '📚', 'cuento': '📚', 'literatura': '📚', 'narracion': '📚',
    'cocina': '🍳', 'gastronom': '🍳', 'receta': '🍳', 'aliment': '🍳',
    'infantil': '🧒', 'ninos': '🧒', 'ninas': '🧒', 'bebe': '🧒', 'jardin': '🧒',
    'adulto mayor': '👴', 'abuel': '👴', 'senior': '👴',
    'ecolog': '🌿', 'naturaleza': '🌿', 'huerta': '🌿', 'ambiental': '🌿',
    'tecno': '💻', 'computa': '💻', 'digital': '💻', 'programaci': '💻',
    'cine': '🎬', 'pelicula': '🎬', 'audiovisual': '🎬',
    'foto': '📷', 'imagen': '📷',
    'idioma': '🗣️', 'ingles': '🗣️', 'frances': '🗣️', 'lenguaje': '🗣️',
}


def emoji_actividad(nombre):
    n = nombre.lower()
    for clave, em in EMOJIS.items():
        if clave in n:
            return em
    return '✨'


def fmt_hora(h):
    """HH:MM:SS → HH:MM"""
    if not h:
        return '?'
    return str(h)[:5]


def actividades_a_markdown(actividades, uva_filtro=None, fecha_filtro=None):
    if uva_filtro:
        actividades = [a for a in actividades if (a.get('uva_nombre') or '').lower() == uva_filtro.lower()]
    if fecha_filtro:
        actividades = [a for a in actividades if a.get('fecha') == fecha_filtro]

    if not actividades:
        return '_Sin actividades registradas para esta fecha._'

    # Agrupar: uva → fecha → lista de actividades
    grupos = defaultdict(lambda: defaultdict(list))
    for a in actividades:
        grupos[a.get('uva_nombre', '?')][a.get('fecha', '?')].append(a)

    lines = []
    for uva in sorted(grupos):
        lines.append(f'## 🍇 {uva}')
        for fecha in sorted(grupos[uva]):
            lines.append(f'### 📅 {fecha}')
            actos = sorted(grupos[uva][fecha], key=lambda x: x.get('hora_inicio') or '')
            for a in actos:
                hi = fmt_hora(a.get('hora_inicio'))
                hf = fmt_hora(a.get('hora_fin'))
                nombre = a.get('actividad', '')
                em = emoji_actividad(nombre)
                horario = f'{hi}–{hf}' if hf and hf != '?' else hi
                line = f'- {em} `{horario}` **{nombre}**'
                if a.get('descripcion'):
                    line += f' — {a["descripcion"]}'
                if a.get('edad_recomendada'):
                    line += f' _(👥 {a["edad_recomendada"]})_'
                lines.append(line)
            lines.append('')

    lines.append('> 📞 Inscripciones: consulte directamente en la UVA.')
    return '\n'.join(lines)


if __name__ == '__main__':
    try:
        raw = json.loads(sys.stdin.read())
        if isinstance(raw, list):
            actividades, uva_f, fecha_f = raw, None, None
        else:
            actividades = raw.get('actividades', [])
            uva_f   = raw.get('uva')
            fecha_f = raw.get('fecha')
        print(actividades_a_markdown(actividades, uva_f, fecha_f))
    except Exception as e:
        sys.stderr.write(f'Error: {e}\n')
        print('_Error generando agenda._')
        sys.exit(1)
