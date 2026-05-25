#!/usr/bin/env node
import 'dotenv/config';
import { supabase, insertarProgramacion } from '../src/services/supabase.js';

const YEAR = 2026;
const MONTH = 5;

const RAW = String.raw`
## BIBLIOTECA EPM
(Carrera 54 No. 44-48, Plaza de Cisneros)

### Un refugio de historias
| Actividad | Día | Fechas | Horario | Lugar |
|---|---|---|---|---|
| Hora del cuento: ¿qué se esconde detrás de un secreto? | Jueves | 7, 14, 21 y 28 | 3:00–4:00 p.m. | Sala infantil |
| Club de lectura infantil | Sábados | 9 y 23 | 10:30 a.m.–12:00 m. | Sala infantil |
| Navegando entre letras: ¡pega, ríe y crea! | Sábados | 2, 9, 16, 23 y 30 | 1:00–3:00 p.m. | Sala infantil |

### Universo de lectores
| Actividad | Día | Fechas | Horario | Lugar |
|---|---|---|---|---|
| Palabras en movimiento, club de lectura y cine | Jueves | 7, 14, 21 y 28 | 3:00–5:00 p.m. | Cinemateca |
| Costurero literario | Viernes | 8, 15, 22 y 29 | 10:00 a.m.–12:00 m. | Sala lectura general |
| Costurero literario | Sábados | 2, 9, 16, 23 y 30 | 2:00–4:00 p.m. | Sala investigadores 4 |
| Club de prensa y opinión | Viernes | 8, 15, 22 y 29 | 10:30–11:30 a.m. | Galería de arte, 1er piso |

## UVA DE LA IMAGINACIÓN
(Cra. 40 #61-04, Villa Hermosa)

### Cursos
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Iniciación creativa | Sábados | 2, 9, 16, 23 y 30 | 10:00–11:00 a.m. | Grupo familiar |
| Biodiversidad en plastilina | Sábados | 2, 9, 16, 23 y 30 | 2:00–3:00 p.m. | Grupo familiar |
| Taller creativo para la familia | Domingos | 3, 10, 17, 24 y 31 | 2:00–3:00 p.m. | Grupo familiar |
| Agroecología | Miércoles | 6, 13, 20 y 27 | 2:00–3:30 p.m. | Adultos (27–59) |

## UVA DE LA ESPERANZA
(Cl. 96 #34-100, Manrique San Pablo)

### Semilleros
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Manos creativas | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Adultos (27–59) |
| Ciudadanos del mundo: personas con discapacidad | Viernes | 8, 15, 22 y 29 | 11:30 a.m.–12:30 m. | Jóvenes (14–26) |

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Mundo biodiverso | Sábados | 2, 9, 16, 23 y 30 | 2:00–5:00 p.m. | Niños y niñas (6–13) |
| Conmemoración aniversario Nº12 | Miércoles | 6, 13, 20 y 27 | 2:30–4:30 p.m. | Grupo familiar |

### Clubes
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Club de baile | Viernes | 10, 17 y 24 | 3:30–4:30 p.m. | Adultos (27–59) |
| Baile y diversión | Miércoles | 6, 13, 20 y 27 | 2:30–4:30 p.m. | Grupo familiar |
| Club de tejido: técnica mostacilla | Viernes | 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Huerta y herbario UVA | Jueves | 7, 14, 21 y 28 | 9:00–10:30 a.m. | Grupo familiar |

## UVA ILUSIÓN VERDE
(Cl. 3b Sur #29B-56, El Poblado)

### Club
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Arte para niños y niñas | Viernes | 8, 15, 22 y 29 | 10:00–11:00 a.m. | Niños (6–13) |

### Cursos
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Jardín y bienestar | Martes | 5, 12 y 26 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Educación financiera | Jueves | 7, 14, 21 y 28 | 2:00–4:00 p.m. | Adultos (27–59) |
| Pintura en cerámica: nivel 1 | Jueves | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| CreArte: técnica pastel | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Adultos (27–59) |
| Experiencias agroecológicas | Viernes | 15 y 22 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Jornada artística: muro UVA | Sábado | 9 | 10:00 a.m.–2:00 p.m. | Jóvenes (14–26) |
| Me llamo Tierra: tardes manuales el Tesoro | Sábados | 2, 9, 16, 23 y 30 | 3:00–5:00 p.m. | Grupo familiar |
| Cultura UVA: tenencia responsable de mascotas | Domingos | 3, 10, 24 y 31 | 11:00 a.m.–12:00 m. | Grupo familiar |
| Tardes creativas en la biblioteca | Sábado | 16 | 2:00–3:00 p.m. | Grupo familiar |
| Noches de UVA: especial de Madres | Viernes | 29 | 2:00–7:00 p.m. | Adultos (27–59) |
| Taller de flores en porcelanicrón | Martes | 5 | 2:00–4:00 p.m. | Adultos (27–59) |
| Finanzas personales | Sábado | 9 | 10:00 a.m.–2:00 p.m. | Jóvenes (14–26) |
| ¿Qué partes necesita un robot para cobrar vida? | Sábado | 2 | 10:00 a.m.–12:00 m. | Jóvenes (14–26) |
| Especial de madres: taller de duelo | Viernes | 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Promoción del civismo, seguridad y convivencia | Viernes | 8 | 2:00–4:00 p.m. | Adultos (27–59) |
| Alimentación saludable | Martes | 12 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Primeros auxilios psicológicos | Miércoles | 13 | 2:00–3:00 p.m. | Adultos (27–59) |

## UVA EL ENCANTO
(Cra. 76 #104D-01, barrio Santander)

### Cursos
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Creaciones sostenibles: decoración de fiestas y eventos | Martes | 5, 12 y 26 | 2:00–4:00 p.m. | Adultos (27–59) |
| Crochet: nivel avanzado | Viernes | 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Yoga básico | Miércoles | 6, 13, 20 y 27 | 8:30–10:30 a.m. | Adultos (27–59) |
| Yoga básico | Viernes | 8, 15, 22 y 29 | 8:30–10:30 a.m. | Adultos (27–59) |
| Dibujo para niñas y niños: nivel básico | Sábados | 2, 9, 16, 23 y 30 | 10:30 a.m.–12:00 m. | Niños (6–13) |
| Macramé: nivel básico | Jueves | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Macramé: nivel intermedio | Jueves | 7, 14, 21 y 28 | 2:00–4:00 p.m. | Adultos (27–59) |
| Mostacilla | Martes | 5, 12 y 26 | 10:00–11:30 a.m. | Adultos (27–59) |
| Velas artesanales | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Adultos (27–59) |
| Muñequería | Martes | 5, 12 y 26 | 2:00–4:00 p.m. | Adultos (27–59) |
| Muñequería | Viernes | 8, 15, 22 y 29 | 11:00 a.m.–12:30 m. | Adultos (27–59) |
| Danza urbana: niños y jóvenes | Sábados | 2, 9, 16, 23 y 30 | 2:00–4:00 p.m. | Niños (6–13) |
| Tejido Canvas | Miércoles | 6, 13, 20 y 27 | 10:00–11:30 a.m. | Adultos (27–59) |
| Bien-Estar | Domingos | 3, 10, 17, 24 y 31 | 10:00 a.m.–12:00 m. | Grupo familiar |
| Aromaterapia | Viernes | 8, 15, 22 y 29 | 10:00–11:00 a.m. | Adultos (27–59) |
| Biodiversidad arte y vida | Sábados | 2, 9, 16, 23 y 30 | 3:00–4:00 p.m. | Niños (6–13) |

## UVA DE LA LIBERTAD
(Cl. 57 #17B-50, barrio La Libertad)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Laboratorio creativo | Domingos | 3, 10, 17, 24 y 31 | 2:00–3:00 p.m. | Niños (6–13) |
| Yoga | Sábados | 2, 9, 16, 23 y 30 | 10:00–11:00 a.m. | Adultos (27–59) |
| Pintura | Sábados | 2, 9, 16, 23 y 30 | 1:00–2:00 p.m. | Niños (6–13) |
| Informática básica | Jueves | 7, 14, 21 y 28 | 2:00–4:00 p.m. | Adultos (27–59) |
| Plastilina | Sábados | 2, 9, 16, 23 y 30 | 2:00–3:00 p.m. | Niños (6–13) |
| Taller de fotografía con celulares | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Adultos (27–59) |

## UVA SAN FERNANDO
(Cra. 47 #85-256, Itagüí)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Actividad física | Martes | 5, 12, 19 y 26 | 10:00–11:00 a.m. | Adultos (27–59) |
| Actividad física | Viernes | 8, 15, 22 y 29 | 10:00–11:00 a.m. | Adultos (27–59) |
| Club de bienestar | Miércoles | 6, 13, 20 y 27 | 3:00–4:00 p.m. | Adultos (27–59) |
| Bordado | Miércoles | 6, 13, 20 y 27 | 1:30–3:00 p.m. | Adultos (27–59) |
| Sembrando vida | Miércoles | 6, 13, 20 y 27 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Plastilina | Sábados | 2, 9, 16, 23 y 30 | 3:00–4:00 p.m. | Niños (6–13) |
| Arte para mujeres: casa de la mujer Itagüí | Martes | 5, 12, 19 y 26 | 3:00–4:00 p.m. | Adultos (27–59) |
| Diversión en familia | Sábados | 2, 9, 16, 23 y 30 | 4:00–5:00 p.m. | Grupo familiar |
| Huerta | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Jóvenes (11–15) |
| Filigrana y mostacilla creativa | Jueves | 7, 14, 21 y 28 | 10:30 a.m.–12:00 m. | Adultos (27–59) |
| Eco-arte | Sábados | 2, 9, 16, 23 y 30 | 2:00–3:00 p.m. | Grupo familiar |

## UVA MIRADOR DE SAN CRISTÓBAL
(Cra. 131 #66-20, San Cristóbal)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Amigurumi: nivel avanzado | Sábados | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Adultos (27–59) |
| Amigurumi: nivel básico | Miércoles | 6, 13, 20 y 27 | 9:00–10:30 a.m. | Adultos (27–59) |
| Amigurumi: nivel básico | Sábados | 2, 9, 16, 23 y 30 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Bordado en tela | Viernes | 8, 15, 22 y 29 | 2:30–4:00 p.m. | Grupo familiar |
| Me Llamo Tierra: ludoteca | Sábados | 9 y 23 | 11:00 a.m.–12:00 m. | Adultos (27–59) |
| Biodiversidad | Sábados | 6, 13 y 27 | 2:00–4:00 p.m. | Niños (6–13) |
| Agrecología | Jueves | 7, 14, 21 y 28 | 10:00–11:00 a.m. | Adultos (27–59) |
| Origami | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Niños (7+ años) |

## UVA LOS GUAYACANES
(Cll. 65C #94-04, barrio Cucaracho)

### Cursos
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Crochet básico: mis primeras creaciones | Miércoles | 6, 13, 20 y 27 | 9:00–11:00 a.m. | Adultos (27–59) |
| Crochet intermedio: entre nudos | Jueves | 7, 14, 21 y 28 | 2:00–4:00 p.m. | Adultos (27–59) |
| Crochet: tejer para usar prendas | Sábados | 2, 9, 16, 23 y 30 | 9:30–11:30 a.m. | Adultos (27–59) |
| Macramé intermedio: hilos que conectan | Jueves | 7, 14, 21 y 28 | 9:00–11:00 a.m. | Adultos (27–59) |
| Agroecología básica | Jueves | 7, 14, 21 y 28 | 9:00–11:00 a.m. | Adultos (27–59) |
| Mundo en plastilina: ecosistema acuático | Sábados | 2, 9, 16, 23 y 30 | 1:00–2:00 p.m. | Grupo familiar |
| Alfabetización digital básica | Martes | 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| MostacillArte: mostacilla intermedio | Viernes | 8, 15, 22 y 29 | 3:00–4:30 p.m. | Adultos (27–59) |
| Entre letras y pinceles | Viernes | 2, 9, 16, 23 y 30 | 2:00–4:00 p.m. | Grupo familiar |

## UVA DE LOS SUEÑOS
(Cra. 28 #69-04, barrio Versalles 1)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Aniversario Nº12 | Sábado | 16 | 12:00–4:30 p.m. | Grupo familiar |
| Moldear y crear con plastilina | Sábados | 9 y 23 | 2:00–3:00 p.m. | Niños (6–13) |
| Tarde de pelis | Viernes | 29 | 2:00–3:00 p.m. | Grupo familiar |
| Sueños de mil colores | Sábados | 2, 16 y 30 | 2:00–3:00 p.m. | Niños (6–13) |
| Macramé básico | Miércoles | 6, 13, 20 y 27 | 2:00–3:00 p.m. | Adultos (27–59) |
| Lana y ganchillo | Jueves | 7, 14, 21 y 28 | 2:00–3:00 p.m. | Adultos (27–59) |
| Manos creativas | Martes | 5, 12, 19 y 26 | 2:00–3:00 p.m. | Adultos (27–59) |
| Amigurumis | Viernes | 8, 15, 22 y 29 | 2:00–3:00 p.m. | Adultos (27–59) |
| Huerta y jardinería | Martes | 5, 12, 19 y 26 | 9:00–10:00 a.m. | Adultos (27–59) |
| Alfabetización digital | Jueves | 7, 14, 21 y 28 | 9:00–10:00 a.m. | Adultos (27–59) |
| Danzas por el mundo | Sábados | 2, 9, 16, 23 y 30 | 2:00–3:00 p.m. | Adultos (27–59) |

## UVA NUEVO AMANECER
(Cll. 107B #23A-138, La Avanzada)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Laboratorios comunitarios | Jueves | 7, 14, 21 y 28 | 2:00–4:00 p.m. | General |
| Sanarte: muñequería | Miércoles | 6, 13, 20 y 27 | 1:30–3:00 p.m. | General |
| Dibujo | Domingos | 3, 10, 17, 24 y 31 | 1:00–2:00 p.m. | General |
| Bioplastilina | Sábados | 2, 9, 16, 23 y 30 | 11:00 a.m.–12:00 m. | General |
| Música | Sábados | 2, 9, 16, 23 y 30 | 2:00–4:00 p.m. | General |
| Dispositivos móviles | Martes | 5, 12 y 26 | 1:00–3:00 p.m. | Adultos (27–59) |
| Origami | Domingos | 3, 10, 17, 24 y 31 | 2:00–3:00 p.m. | General |
| Yoga | Sábados | 2, 9, 16, 23 y 30 | 2:00–3:00 p.m. | General |
| Expediciones por la UVA | Domingos | 3, 10, 17, 24 y 31 | 3:00–4:30 p.m. | General |

## UVA DE LA CORDIALIDAD
(Cra. 42B #110A-04, Santo Domingo Savio 1)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Arte y bienestar | Viernes | 1, 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Bisutería | Martes | 5, 12 y 26 | 2:00–4:00 p.m. | Adultos (27–59) |
| Muñecos de tela | Miércoles | 6, 13, 20 y 27 | 2:00–4:00 p.m. | Adultos (27–59) |
| Dispositivos móviles | Viernes | 8, 15, 22 y 29 | 10:30 a.m.–12:00 m. | General |
| Trámites a un clic | Miércoles | 6, 13, 20 y 27 | 10:30 a.m.–12:00 m. | Adultos (27–59) |
| Me llamo Tierra | Jueves | 7, 14, 21 y 28 | 2:00–3:00 p.m. y 3:00–4:00 p.m. | Adultos (27–59) |
| Yoga | Sábados | 2, 9, 16, 23 y 30 | 2:00–3:00 p.m. | General |
| Semillero ambiental | Sábados | 2, 9, 16, 23 y 30 | 10:30 a.m.–12:00 m. | Adultos (27–59) |

## UVA DE LA ALEGRÍA
(Cra. 41 #79-66, barrio Santa Inés)

### Talleres
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Biodiversidad en plastilina | Sábados | 2, 9, 16, 23 y 30 | 3:00–5:00 p.m. | Niños (6–13) |
| Pintura | Sábados | 2, 9, 16, 23 y 30 | 10:00 a.m.–12:00 m. | Niños (6–13) |

## UVA DE LA ARMONÍA
(Cra. 36 #84-98, Santa Inés)

### Cursos
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Agroecología | Viernes | 1, 8, 15, 22 y 29 | 10:00–11:30 a.m. | Niños (6–13) |
| Aventura digital | Viernes | 1, 8, 15, 22 y 29 | 2:30–4:00 p.m. | Niños (6–13) |
| Me llamo Tierra | Martes/Miérc/Sáb | Varios | Varios horarios | Niños (6–13) |
| Familias creativas | Jueves | 2, 9, 23 y 30 | 4:00–5:00 p.m. | Grupo familiar |
| Elaboración de velas | Martes | 5, 12, 19 y 26 | 2:00–4:00 p.m. | Adultos (27–59) |
| Peyote | Sábados | 9, 12, 23, 26 y 30 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Mostacilla | Jueves | 1, 8, 15, 22 y 29 | 2:00–3:00 p.m. | Adultos (27–59) |
| Crochet | Martes | 4, 11, 18 y 25 | 2:00–3:00 p.m. | Adultos (27–59) |
| Plastilina | Miércoles | 6, 13, 20 y 27 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Círculos comunitarios: crearte | Miércoles | 6, 13, 20 y 27 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| CreaTivos | Viernes | 6, 13, 20 y 27 | 3:30–4:30 p.m. | Niños (6–13) |
| EcoCuentos | Martes | 5, 12, 19 y 26 | 2:30–3:00 p.m. | Niños (6–13) |
| Viajeros | Viernes | 5, 12, 19 y 26 | 2:30–3:00 p.m. | Niños (6–13) |
| Arcilla | Jueves | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Canas al aire | Miércoles | 6, 13, 20 y 27 | 4:00–5:00 p.m. | Adultos (27–59) |
| Vida silvestre | Lunes | 4, 11, 18 y 25 | 10:00 a.m.–12:00 m. | Niños (6–13) |
| Danza folclórica | Sábados | 2, 9, 23 y 30 | 2:00–4:00 p.m. | Adultos mayores (+60) |
| Dispositivos móviles | Viernes | 1, 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Recorridos al museo: Central Hidroeléctrica Piedras Blancas | Todo el mes | Diario | 9:00–10:00 p.m. | General |

## UVA AGUAS CLARAS
(Diagonal 50A AV 20-251, Bello)

### Club
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Yoga básico | Sábados | 9, 12, 16, 23 y 30 | 8:30–10:30 a.m. | Adultos (27–59) |
| Yoga básico en silla | Viernes | 8, 15, 22 y 29 | 8:30–9:30 a.m. | Adultos (27–59) |
| Dispositivos móviles | Jueves | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos (27–59) |

### Cursos
| Actividad | Día | Fechas | Horario | Público |
|---|---|---|---|---|
| Competencias ciudadanas: redes sociales para adultos | Sábados | 2, 9, 16, 23 y 30 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Bordado fantasía | Jueves | 7, 14, 21 y 28 | 2:00–4:00 p.m. | Adultos (27–59) |
| Bordado ruso | Viernes | 8, 15, 22 y 29 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Bordado tradicional | Viernes | 8, 15, 22 y 29 | 3:00–4:00 p.m. | Adultos (27–59) |
| Técnica de macramé básico | Jueves/Viernes | 7,14,21,28 / 2,9,16,23,30 | 2:00–4:00 p.m. / 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Técnica de macramé intermedio | Viernes | 8, 15, 22 y 29 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Elaboración de manillas básicas | Jueves/Viernes | 7,14,21,28 / 8,15,22,29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Creaciones con materiales reutilizables | Jueves | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Técnica porcelanicrón | Viernes | 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Técnica mostacilla | Viernes | 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos (27–59) |
| Técnica peyote | Jueves | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos (27–59) |
| Alfabetización digital | Martes | 7, 14, 21 y 28 | 10:00 a.m.–12:00 m. | Adultos mayores (+60) |
| Agroecología UVA | Viernes | 8, 15, 22 y 29 | 8:30–10:30 a.m. y 2:00–4:00 p.m. | Adultos (27–59) |
| Salud mental: actividades lúdicas con adultos | Viernes | 8, 15, 22 y 29 | 2:00–4:00 p.m. | Adultos mayores (+60) |
| Giras en la PTAR | Según foro | — | — | General |
`;

const VENUE_MAP = {
  'BIBLIOTECA EPM': 'Biblioteca EPM',
  'UVA DE LA IMAGINACIÓN': 'UVA La Imaginación',
  'UVA DE LA ESPERANZA': 'UVA La Esperanza',
  'UVA ILUSIÓN VERDE': 'UVA Ilusión Verde',
  'UVA EL ENCANTO': 'UVA El Encanto',
  'UVA DE LA LIBERTAD': 'UVA de La Libertad',
  'UVA SAN FERNANDO': 'UVA La Alegría',
  'UVA MIRADOR DE SAN CRISTÓBAL': 'UVA Mirador de San Cristóbal',
  'UVA LOS GUAYACANES': 'UVA Los Guayacanes',
  'UVA DE LOS SUEÑOS': 'UVA Los Sueños',
  'UVA NUEVO AMANECER': 'UVA Nuevo Amanecer',
  'UVA DE LA CORDIALIDAD': 'UVA de La Cordialidad',
  'UVA DE LA ALEGRÍA': 'UVA La Alegría',
  'UVA DE LA ARMONÍA': 'UVA La Armonía',
  'UVA AGUAS CLARAS': 'UVA La Armonía',
};

function parseMarkdownTables(raw) {
  const lines = raw.split(/\r?\n/);
  const rows = [];
  let sede = null;
  let direccion = null;
  let categoria = null;
  let headers = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('## ')) {
      sede = line.replace(/^##\s+/, '').trim();
      direccion = null;
      categoria = null;
      headers = null;
      continue;
    }

    if (/^\(.+\)$/.test(line)) {
      direccion = line.replace(/^\(|\)$/g, '').trim();
      continue;
    }

    if (line.startsWith('### ')) {
      categoria = line.replace(/^###\s+/, '').trim();
      headers = null;
      continue;
    }

    if (line.startsWith('|') && line.includes('Actividad')) {
      headers = splitRow(line);
      i += 1; // skip separator row
      continue;
    }

    if (headers && line.startsWith('|')) {
      const values = splitRow(line);
      if (values.length === headers.length) {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = values[idx]; });
        rows.push({ sede, direccion, categoria, ...obj });
      }
    }
  }

  return rows;
}

function splitRow(line) {
  return line
    .split('|')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function expandDates(text) {
  const t = (text || '').toLowerCase();
  if (!t || t.includes('segun foro') || t === '—') return [];
  if (t.includes('todo el mes') || t.includes('diario')) {
    return Array.from({ length: 31 }, (_, i) => i + 1);
  }
  const nums = [...t.matchAll(/\b([0-2]?\d|3[01])\b/g)]
    .map((m) => Number.parseInt(m[1], 10))
    .filter((n) => n >= 1 && n <= 31);
  return [...new Set(nums)];
}

function parseTimeRanges(text) {
  const t = (text || '').toLowerCase();
  if (!t || t === '—' || t.includes('varios horarios')) return [{ hi: null, hf: null }];

  const ranges = [];
  const regex = /(\d{1,2}:\d{2})\s*(a\.m\.|p\.m\.|m\.)?\s*[\-–]\s*(\d{1,2}:\d{2})\s*(a\.m\.|p\.m\.|m\.)?/g;
  let m;
  while ((m = regex.exec(t)) !== null) {
    const merStart = m[2] || m[4] || '';
    const merEnd = m[4] || m[2] || '';
    const hi = normalizeHour(m[1], merStart);
    const hf = normalizeHour(m[3], merEnd);
    ranges.push({ hi, hf });
  }

  return ranges.length ? ranges : [{ hi: null, hf: null }];
}

function normalizeHour(hhmm, meridiem) {
  if (!hhmm) return null;
  let [h, m] = hhmm.split(':').map((x) => Number.parseInt(x, 10));
  const md = (meridiem || '').toLowerCase();
  if (md.startsWith('p') && h < 12) h += 12;
  if ((md.startsWith('a') || md.startsWith('m')) && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ymd(day) {
  return `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extraerEdad(text = '') {
  const t = text.toLowerCase();
  if (t.includes('grupo familiar') || t.includes('general')) return 'Todas las edades';
  if (t.includes('adultos mayores')) return 'Adultos mayores';
  const m = /(\d{1,2})\s*[–-]\s*(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2]} años`;
  if (t.includes('adultos')) return 'Adultos';
  if (t.includes('joven')) return 'Jóvenes';
  if (t.includes('niñ') || t.includes('nino')) return 'Niños';
  return null;
}

function toActivities(rows) {
  const out = [];
  for (const r of rows) {
    const uva = VENUE_MAP[r.sede] || r.sede || 'UVA Sin Clasificar';
    const actividad = (r['Actividad'] || '').trim();
    const fechas = expandDates(r['Fechas'] || '');
    const ranges = parseTimeRanges(r['Horario'] || '');
    const publico = r['Público'] || r['Publico'] || '';
    const lugar = r['Lugar'] || '';

    if (!actividad) continue;
    if (fechas.length === 0) {
      // Si no hay fecha interpretable, omitimos para evitar basura
      continue;
    }

    for (const d of fechas) {
      for (const rg of ranges) {
        out.push({
          uva_nombre: uva,
          fecha: ymd(d),
          hora_inicio: rg.hi,
          hora_fin: rg.hf,
          actividad: actividad.slice(0, 200),
          descripcion: [
            r.categoria ? `Categoría: ${r.categoria}` : null,
            publico ? `Público: ${publico}` : null,
            lugar ? `Lugar: ${lugar}` : null,
            r.direccion ? `Sede: ${r.direccion}` : null,
          ].filter(Boolean).join(' | ').slice(0, 500) || null,
          edad_recomendada: extraerEdad(publico),
          raw_text: `${r.sede} | ${actividad}`.slice(0, 300),
        });
      }
    }
  }

  return out;
}

async function clearMayData() {
  const from = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`;
  const to = `${YEAR}-${String(MONTH).padStart(2, '0')}-31`;
  const { error, count } = await supabase
    .from('programacion_uva')
    .delete({ count: 'exact' })
    .gte('fecha', from)
    .lte('fecha', to);

  if (error) throw new Error(`Error limpiando mayo: ${error.message}`);
  return count || 0;
}

async function main() {
  console.log('[Import] Parseando tablas de mayo 2026...');
  const rows = parseMarkdownTables(RAW);
  const acts = toActivities(rows);

  console.log(`[Import] Filas parseadas: ${rows.length}`);
  console.log(`[Import] Actividades expandidas: ${acts.length}`);

  const removed = await clearMayData();
  console.log(`[Import] Registros previos de mayo eliminados: ${removed}`);

  await insertarProgramacion(acts);
  console.log('[Import] Carga completada en Supabase.');

  const uvas = [...new Set(acts.map((a) => a.uva_nombre))].sort();
  console.log(`[Import] UVAs cargadas (${uvas.length}): ${uvas.join(', ')}`);
}

main().catch((err) => {
  console.error('[Import] ERROR:', err.message);
  process.exit(1);
});
