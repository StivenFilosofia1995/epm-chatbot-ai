#!/usr/bin/env python3
"""Reemplaza el bloque de no-results en _respuestaTematica para usar expandirKeywordsConIA."""

path = 'src/agents/chat-agent.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Buscar y reemplazar el bloque de no-results que tiene los dos intentos + mensaje final
old_block = (
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

new_block = (
    "  if (!resultados.length) {\n"
    "    // Groq expande keywords semánticamente (ej: 'robótica' → 'tecnologia','informatica',...)\n"
    "    let keywordsExpandidas = [];\n"
    "    try { keywordsExpandidas = await expandirKeywordsConIA(allKeywords); } catch {}\n"
    "    if (keywordsExpandidas.length) {\n"
    "      try {\n"
    "        resultados = await buscarActividadesPorTema(keywordsExpandidas, hoy, fin, [...RECINTOS_EPM]);\n"
    "      } catch {}\n"
    "    }\n"
    "  }\n"
    "\n"
    "  if (!resultados.length) {\n"
    "    const nombre = session?.nombre ? `, ${session.nombre}` : '';\n"
    "    const temaDisplay = (preKeywords && preKeywords.length ? preKeywords.join(' ') : allKeywords.slice(0, 2).join(' ')) || 'ese tema';\n"
    "    const ctxNoHay = `El usuario buscó actividades de \"${temaDisplay}\" en todas las UVAs, Museo del Agua, Biblioteca EPM y Parque de los Deseos para los próximos 3 meses y NO se encontró ninguna actividad relacionada en la base de datos. Informa esto honestamente y proporciona el link oficial: https://www.grupo-epm.com/site/fundacionepm/programacion/`;\n"
    "    return generarRespuesta(session?.historial || [], mensaje, ctxNoHay, session?.nombre || null, null);\n"
    "  }"
)

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    print('Fix no-results con Groq expansion: OK')
else:
    print('Block NOT FOUND, buscando...')
    idx = content.find('// Último intento: raíces de 4 letras')
    if idx >= 0:
        print(repr(content[idx-5:idx+300]))
    else:
        idx2 = content.find('raicesCortas')
        print(f'raicesCortas at: {idx2}', repr(content[idx2-10:idx2+200]) if idx2 >= 0 else 'not found')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Guardado.')
