#!/usr/bin/env python3
"""
Inserta la programación de mayo 2026 en Supabase.
Uso: python scripts/seed_mayo_2026.py
"""
import os, sys
from pathlib import Path

# Cargar .env
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
    print("Instalando supabase-py..."); os.system(f"{sys.executable} -m pip install supabase"); from supabase import create_client

# ─── Credenciales (proyecto correcto: utghlkxjhplnpbhnukph) ──────────────────
SUPABASE_URL = "https://utghlkxjhplnpbhnukph.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY no encontrado en .env"); sys.exit(1)

client = create_client(SUPABASE_URL, SUPABASE_KEY)

YEAR, MONTH = 2026, 5
rows = []

def d(day): return f"{YEAR}-{MONTH:02d}-{day:02d}"

def add(uva, act, days, hi, hf, edad=None):
    for day in days:
        rows.append({"uva_nombre": uva, "actividad": act, "fecha": d(day),
                     "hora_inicio": hi, "hora_fin": hf, "edad_recomendada": edad})

# ─── BIBLIOTECA EPM ────────────────────────────────────────────────────────────
add("Biblioteca EPM", "Hora del cuento: ¿qué se esconde detrás de un secreto?", [7,14,21,28], "15:00","16:00","Infantil y familiar")
add("Biblioteca EPM", "Club de lectura infantil",                               [9,23],        "10:30","12:00","Infantil y familiar")
add("Biblioteca EPM", "Navegando entre letras: ¡pega, ríe y crea!",            [2,9,16,23,30],"13:00","15:00","Infantil y familiar")
add("Biblioteca EPM", "Palabras en movimiento, club de lectura y cine",         [7,14,21,28],  "15:00","17:00","Jóvenes y adultos")
add("Biblioteca EPM", "Costurero literario",                                     [8,15,22,29],  "10:00","12:00","Jóvenes y adultos")
add("Biblioteca EPM", "Costurero literario",                                     [2,9,16,23,30],"14:00","16:00","Jóvenes y adultos")
add("Biblioteca EPM", "Club de prensa y opinión",                               [8,15,22,29],  "10:30","11:30","Jóvenes y adultos")

# ─── UVA DE LA IMAGINACIÓN ────────────────────────────────────────────────────
add("UVA de La Imaginación", "Iniciación creativa",           [2,9,16,23,30], "10:00","11:00","Grupo familiar")
add("UVA de La Imaginación", "Biodiversidad en plastilina",   [2,9,16,23,30], "14:00","15:00","Grupo familiar")
add("UVA de La Imaginación", "Taller creativo para la familia",[3,10,17,24,31],"14:00","15:00","Grupo familiar")
add("UVA de La Imaginación", "Agroecología",                  [6,13,20,27],   "14:00","15:30","Adultos (27-59)")

# ─── UVA DE LA ESPERANZA ──────────────────────────────────────────────────────
add("UVA de La Esperanza", "Manos creativas",                                    [6,13,20,27],  "14:00","16:00","Adultos (27-59)")
add("UVA de La Esperanza", "Ciudadanos del mundo: personas con discapacidad",    [8,15,22,29],  "11:30","12:30","Jóvenes (14-26)")
add("UVA de La Esperanza", "Mundo biodiverso",                                   [2,9,16,23,30],"14:00","17:00","Niños (6-13)")
add("UVA de La Esperanza", "Conmemoración aniversario Nº12",                     [6,13,20,27],  "14:30","16:30","Grupo familiar")
add("UVA de La Esperanza", "Club de baile",                                      [10,17,24],    "15:30","16:30","Adultos (27-59)")
add("UVA de La Esperanza", "Baile y diversión",                                  [6,13,20,27],  "14:30","16:30","Grupo familiar")
add("UVA de La Esperanza", "Club de tejido: técnica mostacilla",                 [29],          "14:00","16:00","Adultos (27-59)")
add("UVA de La Esperanza", "Huerta y herbario UVA",                              [7,14,21,28],  "09:00","10:30","Grupo familiar")

# ─── UVA ILUSIÓN VERDE ────────────────────────────────────────────────────────
add("UVA Ilusión Verde", "Arte para niños y niñas",                          [8,15,22,29],  "10:00","11:00","Niños (6-13)")
add("UVA Ilusión Verde", "Jardín y bienestar",                               [5,12,26],     "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Educación financiera",                             [7,14,21,28],  "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Pintura en cerámica: nivel 1",                     [7,14,21,28],  "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde", "CreArte: técnica pastel",                          [6,13,20,27],  "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Experiencias agroecológicas",                      [15,22],       "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Jornada artística: muro UVA",                      [9],           "10:00","14:00","Jóvenes (14-26)")
add("UVA Ilusión Verde", "Me llamo Tierra: tardes manuales el Tesoro",       [2,9,16,23,30],"15:00","17:00","Grupo familiar")
add("UVA Ilusión Verde", "Cultura UVA: tenencia responsable de mascotas",    [3,10,24,31],  "11:00","12:00","Grupo familiar")
add("UVA Ilusión Verde", "Tardes creativas en la biblioteca",                [16],          "14:00","15:00","Grupo familiar")
add("UVA Ilusión Verde", "Noches de UVA: especial de Madres",               [29],          "14:00","19:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Taller de flores en porcelanicrón",                [5],           "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Finanzas personales",                              [9],           "10:00","14:00","Jóvenes (14-26)")
add("UVA Ilusión Verde", "¿Qué partes necesita un robot para cobrar vida?",  [2],           "10:00","12:00","Jóvenes (14-26)")
add("UVA Ilusión Verde", "Especial de madres: taller de duelo",             [29],          "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Promoción del civismo, seguridad y convivencia",   [8],           "14:00","16:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Alimentación saludable",                           [12],          "10:00","12:00","Adultos (27-59)")
add("UVA Ilusión Verde", "Primeros auxilios psicológicos",                   [13],          "14:00","15:00","Adultos (27-59)")

# ─── UVA EL ENCANTO ───────────────────────────────────────────────────────────
add("UVA El Encanto", "Creaciones sostenibles: decoración de fiestas y eventos",[5,12,26],     "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto", "Crochet: nivel avanzado",                                [8,15,22,29],  "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto", "Yoga básico",                                            [6,13,20,27],  "08:30","10:30","Adultos (27-59)")
add("UVA El Encanto", "Yoga básico",                                            [8,15,22,29],  "08:30","10:30","Adultos (27-59)")
add("UVA El Encanto", "Dibujo para niñas y niños: nivel básico",               [2,9,16,23,30],"10:30","12:00","Niños (6-13)")
add("UVA El Encanto", "Macramé: nivel básico",                                  [7,14,21,28],  "10:00","12:00","Adultos (27-59)")
add("UVA El Encanto", "Macramé: nivel intermedio",                              [7,14,21,28],  "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto", "Mostacilla",                                             [5,12,26],     "10:00","11:30","Adultos (27-59)")
add("UVA El Encanto", "Velas artesanales",                                      [6,13,20,27],  "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto", "Muñequería",                                             [5,12,26],     "14:00","16:00","Adultos (27-59)")
add("UVA El Encanto", "Muñequería",                                             [8,15,22,29],  "11:00","12:30","Adultos (27-59)")
add("UVA El Encanto", "Danza urbana: niños y jóvenes",                         [2,9,16,23,30],"14:00","16:00","Niños (6-13)")
add("UVA El Encanto", "Tejido Canvas",                                          [6,13,20,27],  "10:00","11:30","Adultos (27-59)")
add("UVA El Encanto", "Bien-Estar",                                             [3,10,17,24,31],"10:00","12:00","Grupo familiar")
add("UVA El Encanto", "Aromaterapia",                                           [8,15,22,29],  "10:00","11:00","Adultos (27-59)")
add("UVA El Encanto", "Biodiversidad arte y vida",                              [2,9,16,23,30],"15:00","16:00","Niños (6-13)")

# ─── UVA DE LA LIBERTAD ───────────────────────────────────────────────────────
add("UVA de La Libertad", "Laboratorio creativo",              [3,10,17,24,31],"14:00","15:00","Niños (6-13)")
add("UVA de La Libertad", "Yoga",                              [2,9,16,23,30], "10:00","11:00","Adultos (27-59)")
add("UVA de La Libertad", "Pintura",                           [2,9,16,23,30], "13:00","14:00","Niños (6-13)")
add("UVA de La Libertad", "Informática básica",                [7,14,21,28],   "14:00","16:00","Adultos (27-59)")
add("UVA de La Libertad", "Plastilina",                        [2,9,16,23,30], "14:00","15:00","Niños (6-13)")
add("UVA de La Libertad", "Taller de fotografía con celulares",[6,13,20,27],   "14:00","16:00","Adultos (27-59)")

# ─── UVA SAN FERNANDO ─────────────────────────────────────────────────────────
add("UVA San Fernando", "Actividad física",                          [5,12,19,26],  "10:00","11:00","Adultos (27-59)")
add("UVA San Fernando", "Actividad física",                          [8,15,22,29],  "10:00","11:00","Adultos (27-59)")
add("UVA San Fernando", "Club de bienestar",                         [6,13,20,27],  "15:00","16:00","Adultos (27-59)")
add("UVA San Fernando", "Bordado",                                   [6,13,20,27],  "13:30","15:00","Adultos (27-59)")
add("UVA San Fernando", "Sembrando vida",                            [6,13,20,27],  "10:00","12:00","Adultos (27-59)")
add("UVA San Fernando", "Plastilina",                                [2,9,16,23,30],"15:00","16:00","Niños (6-13)")
add("UVA San Fernando", "Arte para mujeres: casa de la mujer Itagüí",[5,12,19,26], "15:00","16:00","Adultos (27-59)")
add("UVA San Fernando", "Diversión en familia",                      [2,9,16,23,30],"16:00","17:00","Grupo familiar")
add("UVA San Fernando", "Huerta",                                    [6,13,20,27],  "14:00","16:00","Jóvenes (11-15)")
add("UVA San Fernando", "Filigrana y mostacilla creativa",           [7,14,21,28],  "10:30","12:00","Adultos (27-59)")
add("UVA San Fernando", "Eco-arte",                                  [2,9,16,23,30],"14:00","15:00","Grupo familiar")

# ─── UVA MIRADOR DE SAN CRISTÓBAL ────────────────────────────────────────────
add("UVA Mirador de San Cristóbal", "Amigurumi: nivel avanzado", [6,13,20,27],   "14:00","16:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal", "Amigurumi: nivel básico",   [6,13,20,27],   "09:00","10:30","Adultos (27-59)")
add("UVA Mirador de San Cristóbal", "Amigurumi: nivel básico",   [2,9,16,23,30], "10:00","12:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal", "Bordado en tela",           [8,15,22,29],   "14:30","16:00","Grupo familiar")
add("UVA Mirador de San Cristóbal", "Me Llamo Tierra: ludoteca", [9,23],         "11:00","12:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal", "Biodiversidad",             [6,13,27],      "14:00","16:00","Niños (6-13)")
add("UVA Mirador de San Cristóbal", "Agroecología",              [7,14,21,28],   "10:00","11:00","Adultos (27-59)")
add("UVA Mirador de San Cristóbal", "Origami",                   [6,13,20,27],   "14:00","16:00","Niños (7+ años)")

# ─── UVA LOS GUAYACANES ───────────────────────────────────────────────────────
add("UVA Los Guayacanes", "Crochet básico: mis primeras creaciones",    [6,13,20,27],  "09:00","11:00","Adultos (27-59)")
add("UVA Los Guayacanes", "Crochet intermedio: entre nudos",            [7,14,21,28],  "14:00","16:00","Adultos (27-59)")
add("UVA Los Guayacanes", "Crochet: tejer para usar prendas",           [2,9,16,23,30],"09:30","11:30","Adultos (27-59)")
add("UVA Los Guayacanes", "Macramé intermedio: hilos que conectan",     [7,14,21,28],  "09:00","11:00","Adultos (27-59)")
add("UVA Los Guayacanes", "Agroecología básica",                        [7,14,21,28],  "09:00","11:00","Adultos (27-59)")
add("UVA Los Guayacanes", "Mundo en plastilina: ecosistema acuático",   [2,9,16,23,30],"13:00","14:00","Grupo familiar")
add("UVA Los Guayacanes", "Alfabetización digital básica",              [8,15,22,29],  "14:00","16:00","Adultos (27-59)")
add("UVA Los Guayacanes", "MostacillArte: mostacilla intermedio",       [8,15,22,29],  "15:00","16:30","Adultos (27-59)")
add("UVA Los Guayacanes", "Entre letras y pinceles",                    [2,9,16,23,30],"14:00","16:00","Grupo familiar")

# ─── UVA DE LOS SUEÑOS ────────────────────────────────────────────────────────
add("UVA de Los Sueños", "Aniversario Nº12",               [16],         "12:00","16:30","Grupo familiar")
add("UVA de Los Sueños", "Moldear y crear con plastilina", [9,23],       "14:00","15:00","Niños (6-13)")
add("UVA de Los Sueños", "Tarde de pelis",                 [29],         "14:00","15:00","Grupo familiar")
add("UVA de Los Sueños", "Sueños de mil colores",          [2,16,30],    "14:00","15:00","Niños (6-13)")
add("UVA de Los Sueños", "Macramé básico",                 [6,13,20,27], "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños", "Lana y ganchillo",               [7,14,21,28], "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños", "Manos creativas",                [5,12,19,26], "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños", "Amigurumis",                     [8,15,22,29], "14:00","15:00","Adultos (27-59)")
add("UVA de Los Sueños", "Huerta y jardinería",            [5,12,19,26], "09:00","10:00","Adultos (27-59)")
add("UVA de Los Sueños", "Alfabetización digital",         [7,14,21,28], "09:00","10:00","Adultos (27-59)")
add("UVA de Los Sueños", "Danzas por el mundo",            [2,9,16,23,30],"14:00","15:00","Adultos (27-59)")

# ─── UVA NUEVO AMANECER ───────────────────────────────────────────────────────
add("UVA Nuevo Amanecer", "Laboratorios comunitarios", [7,14,21,28],   "14:00","16:00","General")
add("UVA Nuevo Amanecer", "Sanarte: muñequería",       [6,13,20,27],   "13:30","15:00","General")
add("UVA Nuevo Amanecer", "Dibujo",                    [3,10,17,24,31],"13:00","14:00","General")
add("UVA Nuevo Amanecer", "Bioplastilina",             [2,9,16,23,30], "11:00","12:00","General")
add("UVA Nuevo Amanecer", "Música",                    [2,9,16,23,30], "14:00","16:00","General")
add("UVA Nuevo Amanecer", "Dispositivos móviles",      [5,12,26],      "13:00","15:00","Adultos (27-59)")
add("UVA Nuevo Amanecer", "Origami",                   [3,10,17,24,31],"14:00","15:00","General")
add("UVA Nuevo Amanecer", "Yoga",                      [2,9,16,23,30], "14:00","15:00","General")
add("UVA Nuevo Amanecer", "Expediciones por la UVA",   [3,10,17,24,31],"15:00","16:30","General")

# ─── UVA DE LA CORDIALIDAD ────────────────────────────────────────────────────
add("UVA de La Cordialidad", "Arte y bienestar",        [1,8,15,22,29], "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad", "Bisutería",               [5,12,26],      "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad", "Muñecos de tela",         [6,13,20,27],   "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad", "Dispositivos móviles",    [8,15,22,29],   "10:30","12:00","General")
add("UVA de La Cordialidad", "Trámites a un clic",      [6,13,20,27],   "10:30","12:00","Adultos (27-59)")
add("UVA de La Cordialidad", "Me llamo Tierra",         [7,14,21,28],   "14:00","16:00","Adultos (27-59)")
add("UVA de La Cordialidad", "Yoga",                    [2,9,16,23,30], "14:00","15:00","General")
add("UVA de La Cordialidad", "Semillero ambiental",     [2,9,16,23,30], "10:30","12:00","Adultos (27-59)")

# ─── UVA DE LA ALEGRÍA ────────────────────────────────────────────────────────
add("UVA de La Alegría", "Biodiversidad en plastilina", [2,9,16,23,30], "15:00","17:00","Niños (6-13)")
add("UVA de La Alegría", "Pintura",                     [2,9,16,23,30], "10:00","12:00","Niños (6-13)")

# ─── UVA DE LA ARMONÍA ────────────────────────────────────────────────────────
add("UVA de La Armonía", "Agroecología",                        [1,8,15,22,29], "10:00","11:30","Niños (6-13)")
add("UVA de La Armonía", "Aventura digital",                    [1,8,15,22,29], "14:30","16:00","Niños (6-13)")
add("UVA de La Armonía", "Familias creativas",                  [2,9,23,30],    "16:00","17:00","Grupo familiar")
add("UVA de La Armonía", "Elaboración de velas",                [5,12,19,26],   "14:00","16:00","Adultos (27-59)")
add("UVA de La Armonía", "Peyote",                              [9,12,23,26,30],"10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía", "Mostacilla",                          [1,8,15,22,29], "14:00","15:00","Adultos (27-59)")
add("UVA de La Armonía", "Crochet",                             [4,11,18,25],   "14:00","15:00","Adultos (27-59)")
add("UVA de La Armonía", "Plastilina",                          [6,13,20,27],   "10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía", "Círculos comunitarios: crearte",      [6,13,20,27],   "10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía", "CreaTivos",                           [6,13,20,27],   "15:30","16:30","Niños (6-13)")
add("UVA de La Armonía", "EcoCuentos",                          [5,12,19,26],   "14:30","15:00","Niños (6-13)")
add("UVA de La Armonía", "Viajeros",                            [5,12,19,26],   "14:30","15:00","Niños (6-13)")
add("UVA de La Armonía", "Arcilla",                             [7,14,21,28],   "10:00","12:00","Adultos (27-59)")
add("UVA de La Armonía", "Canas al aire",                       [6,13,20,27],   "16:00","17:00","Adultos (27-59)")
add("UVA de La Armonía", "Vida silvestre",                      [4,11,18,25],   "10:00","12:00","Niños (6-13)")
add("UVA de La Armonía", "Danza folclórica",                    [2,9,23,30],    "14:00","16:00","Adultos mayores (+60)")
add("UVA de La Armonía", "Dispositivos móviles",                [1,8,15,22,29], "14:00","16:00","Adultos (27-59)")
add("UVA de La Armonía", "Recorridos al museo: Central Hidroeléctrica Piedras Blancas",
    list(range(1,32)), "09:00","10:00","General")

# ─── UVA AGUAS CLARAS ─────────────────────────────────────────────────────────
add("UVA Aguas Claras", "Yoga básico",                                    [9,12,16,23,30],"08:30","10:30","Adultos (27-59)")
add("UVA Aguas Claras", "Yoga básico en silla",                           [8,15,22,29],  "08:30","09:30","Adultos (27-59)")
add("UVA Aguas Claras", "Dispositivos móviles",                           [7,14,21,28],  "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Competencias ciudadanas: redes sociales",        [2,9,16,23,30],"10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Bordado fantasía",                               [7,14,21,28],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Bordado ruso",                                   [8,15,22,29],  "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Bordado tradicional",                            [8,15,22,29],  "15:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Técnica de macramé básico",                      [7,14,21,28],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Técnica de macramé básico",                      [2,9,16,23,30],"10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Técnica de macramé intermedio",                  [8,15,22,29],  "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Elaboración de manillas básicas",                [7,14,21,28],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Elaboración de manillas básicas",                [8,15,22,29],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Creaciones con materiales reutilizables",        [7,14,21,28],  "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Técnica porcelanicrón",                          [8,15,22,29],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Técnica mostacilla",                             [8,15,22,29],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Técnica peyote",                                 [7,14,21,28],  "10:00","12:00","Adultos (27-59)")
add("UVA Aguas Claras", "Alfabetización digital",                         [7,14,21,28],  "10:00","12:00","Adultos mayores (+60)")
add("UVA Aguas Claras", "Agroecología UVA",                               [8,15,22,29],  "08:30","10:30","Adultos (27-59)")
add("UVA Aguas Claras", "Agroecología UVA (tarde)",                       [8,15,22,29],  "14:00","16:00","Adultos (27-59)")
add("UVA Aguas Claras", "Salud mental: actividades lúdicas con adultos",  [8,15,22,29],  "14:00","16:00","Adultos mayores (+60)")

# ─── Insertar en lotes de 100 ─────────────────────────────────────────────────
BATCH = 100
total = len(rows)
print(f"Insertando {total} registros en lotes de {BATCH}...")

inserted = 0
for i in range(0, total, BATCH):
    batch = rows[i:i+BATCH]
    try:
        result = client.table("programacion_uva").insert(batch).execute()
        inserted += len(batch)
        print(f"  ✓ {inserted}/{total}")
    except Exception as e:
        print(f"  ✗ Error en lote {i//BATCH + 1}: {e}")

print(f"\n✅ Listo. {inserted} actividades insertadas en programacion_uva.")
