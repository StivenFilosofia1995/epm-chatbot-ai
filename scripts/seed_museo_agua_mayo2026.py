#!/usr/bin/env python3
"""
Inserta la programación REAL del Museo del Agua — mayo 2026.
Fuente: documento oficial Fundación EPM / Issuu (páginas 2-3 de 4 confirmadas).
"""
import os, sys
from pathlib import Path

env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            os.environ.setdefault(k.strip(), v.strip())

try:
    from supabase import create_client
except ImportError:
    print("Instalando supabase-py...")
    os.system(f"{sys.executable} -m pip install supabase")
    from supabase import create_client

SUPABASE_URL = "https://utghlkxjhplnpbhnukph.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY no encontrado en .env")
    sys.exit(1)

client = create_client(SUPABASE_URL, SUPABASE_KEY)

rows = []

def add(act, days, hi, hf, edad=None):
    for day in days:
        rows.append({
            "uva_nombre": "Museo del Agua",
            "actividad":  act,
            "fecha":      f"2026-05-{day:02d}",
            "hora_inicio": hi,
            "hora_fin":    hf,
            "edad_recomendada": edad,
        })

# ─── Programación oficial mayo 2026 ──────────────────────────────────────────
# Fuente: issuu.com/bibliotecaepm1 — páginas 2-3 de 4

# Museo enseña: Guardianes de Gaia — llaveros que fluyen con la vida
# "Luego de salir del recorrido los participantes elaborarán un llavero en
#  material reciclable con la imagen de Gaia"
add("Museo enseña: Guardianes de Gaia — llaveros que fluyen con la vida",
    [9, 23, 30], "14:00", "16:00", "General")

# Taller "Velas para el alma" – Una luz que nace del agua
# "Encuentro para personas mayores: conversar, recordar y reflexionar
#  sobre el valor del agua. Elaboran una vela artesanal como símbolo
#  de conciencia y compromiso con el cuidado del agua."
add('Taller "Velas para el alma" — Una luz que nace del agua',
    [21], "14:00", "16:00", "Adulto mayor")

# Museo para tod@s — acceso gratuito, recorridos para toda la comunidad
# "El conocimiento nos pertenece a todos. Ingreso gratuito para familias,
#  estudiantes, jóvenes y personas mayores. Ingresos cada 15 min,
#  grupos máx. 16 personas."
add("Museo para tod@s: acceso gratuito y recorridos en familia",
    [30], "09:30", "16:00", "Niños (8-12) / General")

# ─── Insertar ─────────────────────────────────────────────────────────────────
print(f"Insertando {len(rows)} actividades del Museo del Agua (mayo 2026)...")
for r in rows:
    print(f"  • {r['fecha']} {r['hora_inicio']}–{r['hora_fin']}  {r['actividad'][:60]}")

try:
    result = client.table("programacion_uva").insert(rows).execute()
    print(f"\n✅ {len(rows)} actividades insertadas correctamente.")
except Exception as e:
    print(f"\n✗ Error: {e}")
