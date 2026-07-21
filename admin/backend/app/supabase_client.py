from supabase import create_client, Client
from supabase.client import ClientOptions
from .config import settings

# Cliente perezoso: antes, create_client() se ejecutaba AL IMPORTAR este modulo,
# y si SUPABASE_URL/SUPABASE_SERVICE_KEY faltaban o eran invalidas, tumbaba
# TODO el proceso FastAPI (mismo bug ya corregido en el bot Node — src/services/supabase.js).
# Como el panel admin es un servicio aparte sin supervisor, eso lo dejaba
# muerto para siempre. Ahora el error real solo aparece en el primer uso real,
# dentro de un endpoint, que ya responde con un error HTTP normal.
_client: Client | None = None

# CRITICO: sin timeout explicito, una llamada a Supabase que se cuelga (mala
# conectividad, DNS, etc.) bloquea ese hilo PARA SIEMPRE. FastAPI corre TODOS
# los endpoints sync (`def`, no `async def`) en el mismo pool de hilos
# compartido — un solo hilo asi filtrado deja esa capacidad permanentemente
# ocupada, y endpoints totalmente distintos y rapidos (como reset-total)
# terminan esperando un hilo libre que nunca llega, pareciendo colgados
# aunque su propio codigo sea instantaneo.
_SUPABASE_TIMEOUT_SEGUNDOS = 15


def _get_client() -> Client:
    global _client
    if _client is not None:
        return _client
    if not settings.supabase_url or not settings.supabase_service_key:
        raise RuntimeError('SUPABASE_URL o SUPABASE_SERVICE_KEY no estan configuradas en el backend admin.')
    _client = create_client(
        settings.supabase_url,
        settings.supabase_service_key,
        options=ClientOptions(
            postgrest_client_timeout=_SUPABASE_TIMEOUT_SEGUNDOS,
            storage_client_timeout=_SUPABASE_TIMEOUT_SEGUNDOS,
        ),
    )
    return _client


class _SupabaseProxy:
    def __getattr__(self, nombre):
        return getattr(_get_client(), nombre)


supabase = _SupabaseProxy()
