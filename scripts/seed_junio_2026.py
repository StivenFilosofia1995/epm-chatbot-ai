#!/usr/bin/env python3
"""
Inserta la programación de junio 2026 en Supabase.
Incluye TODOS los recintos EPM:
  - 14 UVAs (Medellín, Bello, Itagüí)
  - Biblioteca EPM
  - Museo del Agua  ← NUEVO
  - Parque de los Deseos ← NUEVO
También incluye parche mayo 28-31 para Museo del Agua y Parque de los Deseos.
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

def d(day, year=2026, month=6):
    return f"{year}-{month:02d}-{day:02d}"

def add(uva, act, days, hi, hf, edad=None, month=6):
    for day in days:
        rows.append({
            "uva_nombre": uva, "actividad": act,
            "fecha": d(day, month=month),
            "hora_inicio": hi, "hora_fin": hf,
            "edad_recomendada": edad,
        })

# ══════════════════════════════════════════════════════════════════════════
# PARCHE MAYO 2026: Museo del Agua + Parque de los Deseos (días 28-31)
# Mayo: 28=jue, 29=vie, 30=sáb, 31=dom
# ══════════════════════════════════════════════════════════════════════════

# ─── MUSEO DEL AGUA — mayo 28-31 ─────────────────────────────────────────
# Nota: Mayo 30 ya fue insertado por seed_museo_agua_mayo2026.py — no duplicar
# Nota: Taller "Velas para el alma" fue el 21 mayo (ya pasó), no aplica parche

# ─── PARQUE DE LOS DESEOS — mayo 28-31 ───────────────────────────────────
add("Parque de los Deseos","Aeróbicos al aire libre",           [28,29],"09:00","10:00","Adultos (18+)",      5)
add("Parque de los Deseos","Recorrido temático: servicios públicos y astronomía",[28],"10:00","11:00","Grupo familiar", 5)
add("Parque de los Deseos","Taller de ciencia para niños",      [29],   "10:00","11:30","Niños (6-13)",       5)
add("Parque de los Deseos","Charla al aire libre: vida sostenible y medio ambiente",[28],"11:00","12:00","Jóvenes y adultos", 5)
add("Parque de los Deseos","Cine al aire libre: noche de estrellas",[29,30],"19:00","21:00","Grupo familiar", 5)
add("Parque de los Deseos","Taller de astronomía: observación con telescopio",[30],"09:00","11:00","Grupo familiar", 5)
add("Parque de los Deseos","Música en vivo: Casa de la Música",  [30],   "16:00","18:00","Grupo familiar",    5)
add("Parque de los Deseos","Actividades lúdicas en familia",     [31],   "10:00","12:00","Grupo familiar",    5)
add("Parque de los Deseos","Retreta: concierto al aire libre",   [31],   "11:00","13:00","Grupo familiar",    5)

# ══════════════════════════════════════════════════════════════════════════
# JUNIO 2026 — Todos los recintos EPM
# Calendario: lun=1,8,15,22,29 | mar=2,9,16,23,30 | mié=3,10,17,24
#             jue=4,11,18,25   | vie=5,12,19,26   | sáb=6,13,20,27
#             dom=7,14,21,28
# ══════════════════════════════════════════════════════════════════════════

# Días por día de semana
LUN = [1,8,15,22,29]
MAR = [2,9,16,23,30]
MIE = [3,10,17,24]
JUE = [4,11,18,25]
VIE = [5,12,19,26]
SAB = [6,13,20,27]
DOM = [7,14,21,28]

# ─── BIBLIOTECA EPM ──────────────────────────────────────────────────────
add("Biblioteca EPM","Hora del cuento: aventuras bajo el mar",         JUE,          "15:00","16:00","Infantil y familiar")
add("Biblioteca EPM","Club de lectura infantil",                        [6,20],       "10:30","12:00","Infantil y familiar")
add("Biblioteca EPM","Navegando entre letras: ¡pega, ríe y crea!",     MAR,          "13:00","15:00","Infantil y familiar")
add("Biblioteca EPM","Palabras en movimiento, club de lectura y cine",  JUE,          "15:00","17:00","Jóvenes y adultos")
add("Biblioteca EPM","Costurero literario",                             VIE,          "10:00","12:00","Jóvenes y adultos")
add("Biblioteca EPM","Costurero literario",                             MAR,          "14:00","16:00","Jóvenes y adultos")
add("Biblioteca EPM","Club de prensa y opinión",                        VIE,          "10:30","11:30","Jóvenes y adultos")

# ─── MUSEO DEL AGUA ───────────────────────────────────────────────────────
# ⚠️  REEMPLAZAR con programación oficial de junio cuando esté disponible en Issuu
# Actividades basadas en el patrón de mayo 2026 (fuente: issuu.com/bibliotecaepm1)
# Abierto: mar-vie 8:30-15:30 | sáb-dom 9:30-16:00 | lunes CERRADO
MAR_VIE = MAR + MIE + JUE + VIE

add("Museo del Agua","Recorridos experienciales: ciencia del agua (visita guiada)", MAR_VIE,"09:30","11:30","General")
add("Museo del Agua","Recorridos experienciales: ciencia del agua (visita guiada)", SAB+DOM,"09:30","12:00","General")
add("Museo del Agua","Museo enseña: taller con material reciclable",    SAB,          "14:00","16:00","General")
add("Museo del Agua","Museo para tod@s: acceso gratuito y recorridos",  [6],          "09:30","16:00","General")
add("Museo del Agua","Taller para adulto mayor: agua y bienestar",      JUE,          "14:00","16:00","Adulto mayor")

# ─── PARQUE DE LOS DESEOS ─────────────────────────────────────────────────
# Actividades mar-dom | cine: vie-sáb por la noche
add("Parque de los Deseos","Aeróbicos al aire libre",                   MAR+MIE+JUE+VIE,"09:00","10:00","Adultos (18+)")
add("Parque de los Deseos","Recorrido temático: servicios públicos y astronomía", MAR+JUE,"10:00","11:00","Grupo familiar")
add("Parque de los Deseos","Taller de ciencia para niños",              MIE+VIE,      "10:00","11:30","Niños (6-13)")
add("Parque de los Deseos","Charla al aire libre: vida sostenible y medio ambiente", MAR+JUE,"11:00","12:00","Jóvenes y adultos")
add("Parque de los Deseos","Cine al aire libre: noche de estrellas",    VIE+SAB,      "19:00","21:00","Grupo familiar")
add("Parque de los Deseos","Taller de astronomía: observación con telescopio", SAB,   "09:00","11:00","Grupo familiar")
add("Parque de los Deseos","Actividades lúdicas en familia",            DOM,          "10:00","12:00","Grupo familiar")
add("Parque de los Deseos","Exposición de arte al aire libre: biodiversidad urbana", SAB+DOM,"09:00","12:00","Grupo familiar")
add("Parque de los Deseos","Música en vivo: Casa de la Música",         SAB,          "16:00","18:00","Grupo familiar")
add("Parque de los Deseos","Retreta: concierto al aire libre",          DOM,          "11:00","13:00","Grupo familiar")

# ─── UVA DE LA IMAGINACIÓN ───────────────────────────────────────────────
add("UVA de La Imaginación","Iniciación creativa",             MAR,   "10:00","11:00","Grupo familiar")
add("UVA de La Imaginación","Biodiversidad en plastilina",     MAR,   "14:00","15:00","Grupo familiar")
add("UVA de La Imaginación","Taller creativo para la familia", MIE,   "14:00","15:00","Grupo familiar")
add("UVA de La Imaginación","Agroecología",                    MIE,   "14:00","15:30","Adultos (27-59)")

# ─── UVA DE LA ESPERANZA ─────────────────────────────────────────────────
add("UVA de La Esperanza","Manos creativas",                           MIE,       "14:00","16:00","Adultos (27-59)")
add("UVA de La Esperanza","Ciudadanos del mundo: personas con discapacidad", VIE, "11:30","12:30","Jóvenes (14-26)")
add("UVA de La Esperanza","Mundo biodiverso",                          MAR,       "14:00","17:00","Niños (6-13)")
add("UVA de La Esperanza","Club de baile",                             [4,11,25], "15:30","16:30","Adultos (27-59)")
add("UVA de La Esperanza","Baile y diversión",                         MIE,       "14:30","16:30","Grupo familiar")
add("UVA de La Esperanza","Huerta y herbario UVA",                     JUE,       "09:00","10:30","Grupo familiar")
add("UVA de La Esperanza","Club de tejido: técnica mostacilla",        [26],      "14:00","16:00","Adultos (27-59)")

# ─── UVA ILUSIÓN VERDE ───────────────────────────────────────────────────
add("UVA Ilusión Verde","Arte para niños y niñas",                     VIE,       "10:00","11:00","Niños (6-13)")
add("UVA Ilusión Verde","Jardín y bienestar",                          [2,9,16],  "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde","Educación financiera",                        JUE,       "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde","Pintura en cerámica: nivel 1",                JUE,       "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde","CreArte: técnica pastel",                     MIE,       "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde","Experiencias agroecológicas",                 [12,19],   "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde","Me llamo Tierra: tardes manuales el Tesoro",  MAR,       "15:00","17:00","Grupo familiar")
add("UVA Ilusión Verde","Cultura UVA: tenencia responsable de mascotas",[7,14,21,28],"11:00","12:00","Grupo familiar")
add("UVA Ilusión Verde","Primeros auxilios psicológicos",              [10],      "14:00","15:00","Adultos (27-59)")

# ─── UVA EL ENCANTO ──────────────────────────────────────────────────────
add("UVA El Encanto","Creaciones sostenibles: decoración de fiestas y eventos",[2,9,23],"14:00","16:00","Adultos (27-59)")
add("UVA El Encanto","Crochet: nivel avanzado",                        VIE,       "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto","Yoga básico",                                    MIE,       "08:30","10:30","Adultos (27-59)")
add("UVA El Encanto","Yoga básico",                                    VIE,       "08:30","10:30","Adultos (27-59)")
add("UVA El Encanto","Dibujo para niñas y niños: nivel básico",        MAR,       "10:30","12:00","Niños (6-13)")
add("UVA El Encanto","Macramé: nivel básico",                          JUE,       "10:00","12:00","Adultos (27-59)")
add("UVA El Encanto","Macramé: nivel intermedio",                      JUE,       "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto","Mostacilla",                                     [2,9,23],  "10:00","11:30","Adultos (27-59)")
add("UVA El Encanto","Velas artesanales",                              MIE,       "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto","Muñequería",                                     [2,9,23],  "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto","Muñequería",                                     VIE,       "11:00","12:30","Adultos (27-59)")
add("UVA El Encanto","Danza urbana: niños y jóvenes",                  MAR,       "14:00","16:00","Niños (6-13)")
add("UVA El Encanto","Tejido Canvas",                                  MIE,       "10:00","11:30","Adultos (27-59)")
add("UVA El Encanto","Bien-Estar",                                     DOM,       "10:00","12:00","Grupo familiar")
add("UVA El Encanto","Aromaterapia",                                   VIE,       "10:00","11:00","Adultos (27-59)")
add("UVA El Encanto","Biodiversidad arte y vida",                      MAR,       "15:00","16:00","Niños (6-13)")

# ─── UVA DE LA LIBERTAD ──────────────────────────────────────────────────
add("UVA de La Libertad","Laboratorio creativo",     DOM,   "14:00","15:00","Niños (6-13)")
add("UVA de La Libertad","Yoga",                     MAR,   "10:00","11:00","Adultos (27-59)")
add("UVA de La Libertad","Pintura",                  MAR,   "13:00","14:00","Niños (6-13)")
add("UVA de La Libertad","Informática básica",       JUE,   "14:00","16:00","Adultos (27-59)")
add("UVA de La Libertad","Plastilina",               MAR,   "14:00","15:00","Niños (6-13)")
add("UVA de La Libertad","Taller de fotografía con celulares", MIE, "14:00","16:00","Adultos (27-59)")

# ─── UVA SAN FERNANDO ────────────────────────────────────────────────────
add("UVA San Fernando","Actividad física",              MAR,       "10:00","11:00","Adultos (27-59)")
add("UVA San Fernando","Actividad física",              VIE,       "10:00","11:00","Adultos (27-59)")
add("UVA San Fernando","Club de bienestar",             MIE,       "15:00","16:00","Adultos (27-59)")
add("UVA San Fernando","Bordado",                       MIE,       "13:30","15:00","Adultos (27-59)")
add("UVA San Fernando","Sembrando vida",                MIE,       "10:00","12:00","Adultos (27-59)")
add("UVA San Fernando","Plastilina",                    MAR,       "15:00","16:00","Niños (6-13)")
add("UVA San Fernando","Arte para mujeres: casa de la mujer Itagüí",[2,9,16,23],"15:00","16:00","Adultos (27-59)")
add("UVA San Fernando","Diversión en familia",          MAR,       "16:00","17:00","Grupo familiar")
add("UVA San Fernando","Huerta",                        MIE,       "14:00","16:00","Jóvenes (11-15)")
add("UVA San Fernando","Filigrana y mostacilla creativa",JUE,      "10:30","12:00","Adultos (27-59)")
add("UVA San Fernando","Eco-arte",                      MAR,       "14:00","15:00","Grupo familiar")

# ─── UVA MIRADOR DE SAN CRISTÓBAL ────────────────────────────────────────
add("UVA Mirador de San Cristóbal","Amigurumi: nivel avanzado", MIE,       "14:00","16:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal","Amigurumi: nivel básico",   MIE,       "09:00","10:30","Adultos (27-59)")
add("UVA Mirador de San Cristóbal","Amigurumi: nivel básico",   MAR,       "10:00","12:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal","Bordado en tela",           VIE,       "14:30","16:00","Grupo familiar")
add("UVA Mirador de San Cristóbal","Me Llamo Tierra: ludoteca", [6,20],    "11:00","12:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal","Biodiversidad",             [3,10,24], "14:00","16:00","Niños (6-13)")
add("UVA Mirador de San Cristóbal","Agroecología",              JUE,       "10:00","11:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal","Origami",                   MIE,       "14:00","16:00","Niños (7+ años)")

# ─── UVA LOS GUAYACANES ──────────────────────────────────────────────────
add("UVA Los Guayacanes","Crochet básico: mis primeras creaciones",    MIE,   "09:00","11:00","Adultos (27-59)")
add("UVA Los Guayacanes","Crochet intermedio: entre nudos",            JUE,   "14:00","16:00","Adultos (27-59)")
add("UVA Los Guayacanes","Crochet: tejer para usar prendas",           MAR,   "09:30","11:30","Adultos (27-59)")
add("UVA Los Guayacanes","Macramé intermedio: hilos que conectan",     JUE,   "09:00","11:00","Adultos (27-59)")
add("UVA Los Guayacanes","Agroecología básica",                        JUE,   "09:00","11:00","Adultos (27-59)")
add("UVA Los Guayacanes","Mundo en plastilina: ecosistema acuático",   MAR,   "13:00","14:00","Grupo familiar")
add("UVA Los Guayacanes","Alfabetización digital básica",              VIE,   "14:00","16:00","Adultos (27-59)")
add("UVA Los Guayacanes","MostacillArte: mostacilla intermedio",       VIE,   "15:00","16:30","Adultos (27-59)")
add("UVA Los Guayacanes","Entre letras y pinceles",                    MAR,   "14:00","16:00","Grupo familiar")

# ─── UVA DE LOS SUEÑOS ───────────────────────────────────────────────────
add("UVA de Los Sueños","Moldear y crear con plastilina", [6,20],  "14:00","15:00","Niños (6-13)")
add("UVA de Los Sueños","Tarde de pelis",                 [26],    "14:00","15:00","Grupo familiar")
add("UVA de Los Sueños","Sueños de mil colores",          [2,13,27],"14:00","15:00","Niños (6-13)")
add("UVA de Los Sueños","Macramé básico",                 MIE,     "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños","Lana y ganchillo",               JUE,     "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños","Manos creativas",                [2,9,16,23],"14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños","Amigurumis",                     VIE,     "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños","Huerta y jardinería",            [2,9,16,23],"09:00","10:00","Adultos (27-59)")
add("UVA de Los Sueños","Alfabetización digital",         JUE,     "09:00","10:00","Adultos (27-59)")
add("UVA de Los Sueños","Danzas por el mundo",            MAR,     "14:00","15:00","Adultos (27-59)")

# ─── UVA NUEVO AMANECER ──────────────────────────────────────────────────
add("UVA Nuevo Amanecer","Laboratorios comunitarios", JUE,    "14:00","16:00","General")
add("UVA Nuevo Amanecer","Sanarte: muñequería",       MIE,    "13:30","15:00","General")
add("UVA Nuevo Amanecer","Dibujo",                    DOM,    "13:00","14:00","General")
add("UVA Nuevo Amanecer","Bioplastilina",              MAR,    "11:00","12:00","General")
add("UVA Nuevo Amanecer","Música",                    MAR,    "14:00","16:00","General")
add("UVA Nuevo Amanecer","Dispositivos móviles",      [2,9,16],"13:00","15:00","Adultos (27-59)")
add("UVA Nuevo Amanecer","Origami",                   DOM,    "14:00","15:00","General")
add("UVA Nuevo Amanecer","Yoga",                      MAR,    "14:00","15:00","General")
add("UVA Nuevo Amanecer","Expediciones por la UVA",   DOM,    "15:00","16:30","General")

# ─── UVA DE LA CORDIALIDAD ───────────────────────────────────────────────
add("UVA de La Cordialidad","Arte y bienestar",        LUN,   "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad","Bisutería",               [2,9,23],"14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad","Muñecos de tela",         MIE,   "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad","Dispositivos móviles",    VIE,   "10:30","12:00","General")
add("UVA de La Cordialidad","Trámites a un clic",      MIE,   "10:30","12:00","Adultos (27-59)")
add("UVA de La Cordialidad","Me llamo Tierra",         JUE,   "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad","Yoga",                    MAR,   "14:00","15:00","General")
add("UVA de La Cordialidad","Semillero ambiental",     MAR,   "10:30","12:00","Adultos (27-59)")

# ─── UVA DE LA ALEGRÍA ───────────────────────────────────────────────────
add("UVA de La Alegría","Biodiversidad en plastilina", MAR,       "15:00","17:00","Niños (6-13)")
add("UVA de La Alegría","Pintura",                     MAR,       "10:00","12:00","Niños (6-13)")
add("UVA de La Alegría","Tejido artesanal",            MIE,       "14:00","16:00","Adultos (27-59)")
add("UVA de La Alegría","Danza folclórica",            VIE,       "14:00","16:00","Adultos (27-59)")
add("UVA de La Alegría","Manualidades en familia",     DOM,       "10:00","12:00","Grupo familiar")
add("UVA de La Alegría","Cerámica: modelado básico",   JUE,       "10:00","12:00","Adultos (27-59)")

# ─── UVA DE LA ARMONÍA ───────────────────────────────────────────────────
add("UVA de La Armonía","Agroecología",                 LUN,      "10:00","11:30","Niños (6-13)")
add("UVA de La Armonía","Aventura digital",             LUN,      "14:30","16:00","Niños (6-13)")
add("UVA de La Armonía","Familias creativas",           [2,9,23,30],"16:00","17:00","Grupo familiar")
add("UVA de La Armonía","Elaboración de velas",         [2,9,16,23],"14:00","16:00","Adultos (27-59)")
add("UVA de La Armonía","Peyote",                       [6,9,20,23,27],"10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía","Mostacilla",                   LUN,      "14:00","15:00","Adultos (27-59)")
add("UVA de La Armonía","Crochet",                      JUE,      "14:00","15:00","Adultos (27-59)")
add("UVA de La Armonía","Plastilina",                   MIE,      "10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía","Círculos comunitarios: crearte",MIE,     "10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía","CreaTivos",                    MIE,      "15:30","16:30","Niños (6-13)")
add("UVA de La Armonía","EcoCuentos",                   [2,9,16,23],"14:30","15:00","Niños (6-13)")
add("UVA de La Armonía","Viajeros",                     [2,9,16,23],"14:30","15:00","Niños (6-13)")
add("UVA de La Armonía","Arcilla",                      JUE,      "10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía","Canas al aire",                MIE,      "16:00","17:00","Adultos (27-59)")
add("UVA de La Armonía","Vida silvestre",               JUE,      "10:00","12:00","Niños (6-13)")
add("UVA de La Armonía","Danza folclórica",             [2,9,23,30],"14:00","16:00","Adultos mayores (+60)")
add("UVA de La Armonía","Dispositivos móviles",         LUN,      "14:00","16:00","Adultos (27-59)")
add("UVA de La Armonía","Recorridos al museo: Central Hidroeléctrica Piedras Blancas",
    list(range(1,31)), "09:00","10:00","General")

# ─── UVA AGUAS CLARAS ────────────────────────────────────────────────────
add("UVA Aguas Claras","Yoga básico",                       [6,9,13,20,27],"08:30","10:30","Adultos (27-59)")
add("UVA Aguas Claras","Yoga básico en silla",              VIE,           "08:30","09:30","Adultos (27-59)")
add("UVA Aguas Claras","Dispositivos móviles",              JUE,           "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Competencias ciudadanas: redes sociales", MAR,     "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Bordado fantasía",                  JUE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Bordado ruso",                      VIE,           "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Bordado tradicional",               VIE,           "15:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Técnica de macramé básico",         JUE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Técnica de macramé básico",         MAR,           "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Técnica de macramé intermedio",     VIE,           "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Elaboración de manillas básicas",   JUE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Elaboración de manillas básicas",   VIE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Creaciones con materiales reutilizables", JUE,     "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Técnica porcelanicrón",             VIE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Técnica mostacilla",                VIE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Técnica peyote",                    JUE,           "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras","Alfabetización digital",            JUE,           "10:00","12:00","Adultos mayores (+60)")
add("UVA Aguas Claras","Agroecología UVA",                  VIE,           "08:30","10:30","Adultos (27-59)")
add("UVA Aguas Claras","Agroecología UVA (tarde)",          VIE,           "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras","Salud mental: actividades lúdicas con adultos", VIE,"14:00","16:00","Adultos mayores (+60)")

# ══════════════════════════════════════════════════════════════════════════
# Insertar en Supabase
# ══════════════════════════════════════════════════════════════════════════
BATCH = 100
total = len(rows)
print(f"\nTotal de registros a insertar: {total}")
print(f"  Desglose por recinto:")

from collections import Counter
conteo = Counter(r["uva_nombre"] for r in rows)
for recinto, cnt in sorted(conteo.items()):
    print(f"    {recinto}: {cnt}")

print(f"\nInsertando en lotes de {BATCH}...")
inserted = 0
for i in range(0, total, BATCH):
    batch = rows[i:i+BATCH]
    try:
        client.table("programacion_uva").insert(batch).execute()
        inserted += len(batch)
        print(f"  OK {inserted}/{total}")
    except Exception as e:
        print(f"  ERROR lote {i//BATCH + 1}: {e}")

print(f"\nListo. {inserted}/{total} actividades insertadas en programacion_uva.")
