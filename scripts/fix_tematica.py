#!/usr/bin/env python3
"""Arregla la firma y llamada de _respuestaTematica, y mejora el fallback de no-results."""

path = 'src/agents/chat-agent.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ─── Fix 1: Corregir la llamada — pasar mensaje como 1er arg, intentKeywords como 3ro ───
old_call = '_respuestaTematica(intentKeywords, session, mensaje)'
new_call = '_respuestaTematica(mensaje, session, intentKeywords.length ? intentKeywords : null)'

if old_call in content:
    content = content.replace(old_call, new_call, 1)
    print('Fix 1 (llamada): OK')
else:
    print('Fix 1: NOT FOUND')
    idx = content.find('_respuestaTematica(')
    print(repr(content[idx:idx+80]))

# ─── Fix 2: Actualizar firma de la función para aceptar preKeywords opcionales ──
old_sig = 'async function _respuestaTematica(mensaje, session) {\n  const keywords = mensaje\n    .toLowerCase()\n    .normalize(\'NFD\').replace(/[\\u0300-\\u036f]/g, \'\')\n    .replace(/[^a-z0-9\\s]/g, \' \')\n    .split(/\\s+/)\n    .filter((p) => p.length >= 3 && !_STOPWORDS_TEMA.has(p));'

new_sig = '''async function _respuestaTematica(mensaje, session, preKeywords = null) {
  let keywords;
  if (preKeywords && preKeywords.length) {
    // Keywords ya extraídas por clasificarIntencion (LLM) — limpiar tildes
    keywords = [...new Set(preKeywords.map(k =>
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    ))];
  } else {
    // Extraer keywords del mensaje en crudo
    keywords = mensaje
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !_STOPWORDS_TEMA.has(p));
  }'''

if old_sig in content:
    content = content.replace(old_sig, new_sig, 1)
    print('Fix 2 (firma función): OK')
else:
    print('Fix 2: NOT FOUND, buscando firma...')
    idx = content.find('async function _respuestaTematica(')
    print(repr(content[idx:idx+300]))

# ─── Fix 3: Mejorar no-results — buscar en 90 días y dar link oficial si sigue vacío ──
old_search = (
    "  const hoy = hoyISO();\n"
    "  const fin = sumarDias(hoy, 60);\n"
    "\n"
    "  let resultados = [];\n"
    "  try {\n"
    "    resultados = await buscarActividadesPorTema(allKeywords, hoy, fin, [...RECINTOS_EPM]);\n"
    "  } catch (err) {\n"
    "    log(`Error búsqueda temática: ${err.message}`);\n"
    "  }\n"
    "\n"
    "  if (!resultados.length) {\n"
    "    const nombre = session?.nombre ? `, ${session.nombre}` : '';\n"
    "    return `Lo siento${nombre}, no encontré actividades sobre ese tema en la programación actual de las UVAs.\\n\\n¿Quiere que le muestre qué hay disponible en su UVA? 😊`;\n"
    "  }"
)

new_search = (
    "  const hoy = hoyISO();\n"
    "  const fin = sumarDias(hoy, 90);\n"
    "\n"
    "  let resultados = [];\n"
    "  try {\n"
    "    resultados = await buscarActividadesPorTema(allKeywords, hoy, fin, [...RECINTOS_EPM]);\n"
    "  } catch (err) {\n"
    "    log(`Error búsqueda temática: ${err.message}`);\n"
    "  }\n"
    "\n"
    "  if (!resultados.length) {\n"
    "    // Último intento: raíces de 4 letras en 90 días\n"
    "    const raicesCortas = [...new Set(allKeywords.map(k => k.slice(0, 4)).filter(k => k.length >= 4))];\n"
    "    try {\n"
    "      resultados = await buscarActividadesPorTema(raicesCortas, hoy, fin, [...RECINTOS_EPM]);\n"
    "    } catch {}\n"
    "  }\n"
    "\n"
    "  if (!resultados.length) {\n"
    "    const nombre = session?.nombre ? `, ${session.nombre}` : '';\n"
    "    const temaDisplay = (preKeywords && preKeywords.length ? preKeywords.join(' ') : allKeywords.slice(0, 2).join(' ')) || 'ese tema';\n"
    "    return `Lo siento${nombre}, no encontré actividades de *\"${temaDisplay}\"* en los próximos 3 meses.\\n\\nConsulte la agenda oficial: https://www.grupo-epm.com/site/fundacionepm/programacion/\\n\\n¿Quiere que le muestre qué hay disponible en su UVA? 😊`;\n"
    "  }"
)

if old_search in content:
    content = content.replace(old_search, new_search, 1)
    print('Fix 3 (no-results fallback): OK')
else:
    print('Fix 3: NOT FOUND, buscando...')
    idx = content.find("  const hoy = hoyISO();\n  const fin = sumarDias")
    if idx >= 0:
        print(repr(content[idx:idx+400]))

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('\nGuardado.')
