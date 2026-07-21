# 📱 Agente Virtual UVA Medellín — Documentación Técnica Completa
**Proyecto:** Chatbot de WhatsApp para programación de UVAs — Fundación EPM  
**Versión:** 1.0.0  
**Fecha:** Mayo 2026  
**Plataforma de despliegue:** Railway (cloud)

---

## ¿Qué es este sistema?

Es un **chatbot de inteligencia artificial** conectado a WhatsApp que atiende a los ciudadanos de Medellín y les informa sobre la programación cultural, recreativa y formativa de las **14 UVAs (Unidades de Vida Articulada)** administradas por la Fundación EPM.

El ciudadano solo escribe su barrio o comuna y el bot le responde automáticamente con las actividades disponibles en su UVA más cercana.

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────┐
│                   RAILWAY (Cloud)                    │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │   Node.js 20     │    │    FastAPI (Python)    │  │
│  │   Express 4      │◄──►│    Puerto 8001         │  │
│  │   Puerto 3000    │    │    Panel Admin API     │  │
│  │                  │    └───────────────────────┘  │
│  │  • WhatsApp Bot  │                               │
│  │  • API REST      │    ┌───────────────────────┐  │
│  │  • Proxy /api/*  │    │   React 18 + Vite 5   │  │
│  │  • /admin panel  │◄───│   Panel Web Admin      │  │
│  └──────────────────┘    └───────────────────────┘  │
│           │                                         │
└───────────┼─────────────────────────────────────────┘
            │
    ┌───────▼──────────────────────────────┐
    │          Supabase (PostgreSQL)        │
    │  • programacion_uva (633 registros)  │
    │  • conversaciones                    │
    │  • mensajes                          │
    │  • contactos                         │
    │  • chat_control                      │
    │  • whatsapp_sessions                 │
    │  • memoria_agente                    │
    └──────────────────────────────────────┘
            │
    ┌───────────────────────┐
    │  Anthropic Claude API │
    │  (claude-3-5-haiku)   │
    └───────────────────────┘
```

> ⚠️ El archivo `src/services/groq.js` conserva ese nombre por compatibilidad histórica,
> pero desde la migración de Groq → Claude, la IA real es **Anthropic Claude** y la
> variable de entorno que hay que configurar es `ANTHROPIC_API_KEY` (no `GROQ_API_KEY`).

---

## 🤖 Cómo funciona el Bot (flujo completo)

### 1. El ciudadano escribe por WhatsApp

```
Ciudadano: "Hola, buenas tardes"
Bot: "¡Hola! Soy el asistente virtual de las UVAs de Medellín 🌟
     ¿Cuál es su nombre?"

Ciudadano: "Carlos"
Bot: "Mucho gusto, Carlos. ¿En qué barrio o comuna vive?"

Ciudadano: "Robledo"
Bot: "¡Perfecto! Su UVA más cercana es la UVA El Encanto 🎉
     ¿Quiere ver la programación de hoy?"
```

### 2. Máquina de estados del agente

El bot opera con **3 estados de conversación:**

| Estado | Descripción |
|--------|-------------|
| `saludo` | Captura nombre y barrio (sin consumir tokens de IA) |
| `activo` | Responde preguntas con programación real de la UVA |
| `resuelto` | Conversación completada |

### 3. Detección de barrio → UVA

El sistema mapea **más de 200 barrios y comunas** de Medellín a su UVA correspondiente:

| Barrios / Comunas | UVA asignada |
|---|---|
| Robledo, Castilla, Doce de Octubre | UVA El Encanto |
| El Poblado, Los Naranjos, El Tesoro | UVA Ilusión Verde |
| Popular, Santo Domingo, La Avanzada | UVA Nuevo Amanecer |
| Aranjuez, Manrique, Villa del Socorro | UVA de La Armonía |
| Buenos Aires, La Candelaria, Centro | UVA de La Imaginación |
| Villatina, Sol de Oriente, El Pinal | UVA de La Libertad |
| Santa Cruz, Berlín, Palermo | UVA de La Alegría |
| Santo Domingo Savio, La Quiebra | UVA de La Cordialidad |
| Manrique central, Versalles | UVA de Los Sueños |
| Manrique oriental, Aranjuez norte | UVA Los Guayacanes |
| San Javier, Las Independencias | UVA Mirador de San Cristóbal |
| (y más...) | (14 UVAs en total) |

### 4. Consulta de programación

Cuando el usuario pregunta por actividades, el bot:
1. Consulta la tabla `programacion_uva` en Supabase filtrada por UVA y fecha
2. Formatea la programación en Markdown compacto
3. Envía el contexto real a la IA (Anthropic Claude)
4. La IA genera una respuesta natural y personalizada

**La IA NUNCA inventa actividades.** Si no hay datos, responde honestamente y redirige al sitio oficial.

### 5. Handoff Bot → Humano

Si un agente humano necesita tomar control del chat:
- El bot se silencia automáticamente para ese contacto
- Después de **30 minutos sin actividad humana**, el bot retoma automáticamente
- Todo el historial queda registrado en Supabase

---

## 🗓️ Programación cargada (Mayo 2026)

**633 actividades** distribuidas en las 14 UVAs para el mes de Mayo 2026:

| UVA | Actividades |
|-----|-------------|
| Biblioteca EPM | ✅ |
| UVA de La Imaginación | ✅ |
| UVA de La Esperanza | ✅ |
| UVA Ilusión Verde | ✅ |
| UVA El Encanto | ✅ |
| UVA de La Libertad | ✅ |
| UVA San Fernando | ✅ |
| UVA Mirador de San Cristóbal | ✅ |
| UVA Los Guayacanes | ✅ |
| UVA de Los Sueños | ✅ |
| UVA Nuevo Amanecer | ✅ |
| UVA de La Cordialidad | ✅ |
| UVA de La Alegría | ✅ |
| UVA de La Armonía | ✅ |
| UVA Aguas Claras | ✅ |

Tipos de actividades: talleres de manualidades, clases de baile, yoga, aeróbicos, cineforos, lecturas en voz alta, actividades para niños, adulto mayor, teatro, música, y más.

---

## 🖥️ Panel de Administración

Accesible en `https://[dominio-railway]/admin`

### Funcionalidades del panel:

| Sección | Descripción |
|---------|-------------|
| **Dashboard** | Estadísticas generales: total conversaciones, mensajes hoy, contactos activos |
| **WhatsApp QR** | Escanear QR para conectar/reconectar el bot |
| **Estado del bot** | Ver si el bot está conectado, número de teléfono vinculado |
| **Reiniciar sesión** | Desconectar y generar nuevo QR sin acceso al servidor |
| **Logs de scraping** | Historial de actualizaciones de programación |
| **Sesiones activas** | Conversaciones en curso |

### Persistencia de sesión WhatsApp

La sesión de WhatsApp se guarda en **Supabase** (no en archivos del servidor). Esto significa que:
- Al redesplegar el servidor, el bot **no pierde la conexión**
- No hay que volver a escanear el QR en cada deploy
- La sesión sobrevive reinicios y actualizaciones

---

## 🔒 Seguridad

| Capa | Mecanismo |
|------|-----------|
| Panel admin | Login con email/contraseña + JWT |
| API interna | JWT firmado con `HMAC-SHA256` |
| Base de datos | Supabase Row Level Security (RLS) activado |
| Comunicación | HTTPS en todos los endpoints |
| WhatsApp | Protocolo Signal (cifrado E2E de WhatsApp) |

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Bot WhatsApp | Baileys (@whiskeysockets) | 6.7 |
| Servidor principal | Node.js + Express | 20 / 4.18 |
| IA conversacional | Anthropic Claude (claude-3-5-haiku) | Cloud API |
| Backend admin | FastAPI (Python) | 3.12 |
| Frontend admin | React + Vite | 18 / 5 |
| Base de datos | Supabase (PostgreSQL) | Cloud |
| Infraestructura | Railway | Cloud |
| Contenedor | Docker | python:3.12-slim + Node 20 |

---

## 📊 Base de Datos — Tablas principales

| Tabla | Propósito |
|-------|-----------|
| `programacion_uva` | 633 actividades de Mayo 2026 para las 14 UVAs |
| `conversaciones` | Historial de cada chat con el bot |
| `mensajes` | Registro completo de mensajes de WhatsApp |
| `contactos` | Directorio de ciudadanos que han interactuado |
| `chat_control` | Estado bot/humano por chat activo |
| `whatsapp_sessions` | Credenciales cifradas de la sesión WA |
| `memoria_agente` | Memoria del bot: barrio, nombre, preferencias por usuario |
| `scraping_log` | Log de actualizaciones de programación |

---

## 🚀 Despliegue

- **Plataforma:** Railway (Docker)
- **URL pública:** `https://epm-chatbot-ai-production.up.railway.app`
- **Panel admin:** `https://epm-chatbot-ai-production.up.railway.app/admin`
- **Healthcheck:** `/health` → `{"status":"ok"}`
- **Arranque:** `start.sh` inicia FastAPI primero, luego Node.js

---

## 📦 Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_KEY` | Clave anon/pública de Supabase |
| `SUPABASE_SERVICE_KEY` | Clave de servicio (acceso total) |
| `ANTHROPIC_API_KEY` | **API Key de Anthropic (Claude) para la IA — sin esto el bot no puede responder nada.** |
| `ANTHROPIC_MODEL` | (Opcional) Modelo a usar. Por defecto `claude-3-5-haiku-latest` |
| `JWT_SECRET` | Secreto para firmar tokens de admin |
| `ADMIN_EMAIL` | Email del administrador del panel |
| `ADMIN_PASSWORD` | Contraseña del administrador |
| `ADMIN_API_KEY` | Clave interna bot ↔ FastAPI |

> Si `ANTHROPIC_API_KEY` falta, expiró o se quedó sin cupo, revise `/health` — el campo
> `integraciones.anthropic_configurado` indica si la key está presente. Los logs del bot
> además marcan explícitamente `⛔ Límite de tasa (429)` o `⛔ Autenticación rechazada`
> cuando la IA falla, para distinguir "sin cupo/API key mala" de otros errores.

---

## 🔄 Actualizaciones de programación

**Vía recomendada — Panel admin (`/admin` → pestaña "Programación"):**
1. Tomar el Excel (.xlsx) mensual tal como lo envía EPM — una hoja por segmento
   (ej. "Programación infantil" / "Jóvenes y adultos"), con columnas `Título del
   curso, Descripción, Día(s), Fecha(s), Horario, Lugar, Público, Inscripción,
   Enlace de inscripción`. No requiere editarlo ni agregar columnas.
2. Subirlo en "Cargar programación desde Excel", indicando el espacio/UVA al
   que corresponde el archivo completo y el mes/año (el archivo no trae esa
   columna). Opcionalmente marcar "Reemplazar programación existente" para
   vaciar ese espacio+mes antes de insertar.
3. El parser entiende fechas múltiples/recurrentes en una celda (`"7, 14, 21 y
   28 de julio"`, `"Todos los martes de julio"`) y horarios en 12h (incluyendo
   `"12:00 m."` = mediodía), expandiendo cada fila a una fila por fecha real.
4. El bot refleja los cambios inmediatamente (sin necesidad de redesplegar)

También existe una vía para PDF (con OCR) en el mismo panel, útil si solo se cuenta con el volante oficial en PDF.

El panel muestra una advertencia si el mes actual no tiene programación cargada — esta es la causa más común de que el bot responda "no tengo programación" en vez de fallar por completo.

**Vía alternativa (scripts, uso interno):** editar y ejecutar un script de seed en `scripts/` (ej. `python scripts/seed_junio_2026.py`) — requiere acceso a variables de entorno de Supabase.

---

## 👨‍💻 Repositorio

`https://github.com/StivenFilosofia1995/epm-chatbot-ai`  
Rama: `main`
