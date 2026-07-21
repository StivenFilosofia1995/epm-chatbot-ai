/**
 * session-store.js
 *
 * Almacena las credenciales de Baileys en Supabase.
 * - creds se guardan INMEDIATAMENTE cuando cambian (inicio de sesión, rotación de keys)
 * - keys se guardan con DEBOUNCE de 3s para no saturar Supabase con cada mensaje
 *
 * Esto permite que Railway reinicie el contenedor sin perder la sesión de WhatsApp.
 */

// Baileys v7: el paquete se renombró de @whiskeysockets/baileys a "baileys".
import { initAuthCreds, BufferJSON } from 'baileys';
import { supabase } from '../services/supabase.js';

const SESSION_ID = 'default';

export async function useSupabaseAuthState() {
  // ─── Cargar sesión existente desde Supabase ─────────────────────────────────
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('creds, keys')
    .eq('id', SESSION_ID)
    .single();

  let creds = data?.creds
    ? JSON.parse(JSON.stringify(data.creds), BufferJSON.reviver)
    : initAuthCreds();

  let keys = JSON.parse(JSON.stringify(data?.keys || {}), BufferJSON.reviver);

  // ─── Guardado en Supabase ────────────────────────────────────────────────────

  let saveTimer  = null;
  let guardando  = false;

  async function _flush() {
    if (guardando) return;
    guardando = true;
    try {
      await supabase
        .from('whatsapp_sessions')
        .upsert(
          {
            id: SESSION_ID,
            creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
            keys:  JSON.parse(JSON.stringify(keys,  BufferJSON.replacer)),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
    } catch (err) {
      console.error('[Session] Error guardando en Supabase:', err.message);
    } finally {
      guardando = false;
    }
  }

  // Guarda creds inmediatamente (cambio crítico: inicio de sesión, rotación de clave)
  const saveCreds = async () => {
    console.log('[Session] 🔐 Guardando credenciales...');
    clearTimeout(saveTimer);
    await _flush();
    console.log('[Session] ✓ Credenciales guardadas');
  };

  // Guarda keys con debounce de 3s (ocurre en cada mensaje — no hay que saturar Supabase)
  function _scheduleKeySave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => _flush().catch(() => {}), 3000);
  }

  // ─── State de Baileys ────────────────────────────────────────────────────────

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result = {};
        for (const id of ids) {
          const val = keys[`${type}-${id}`];
          if (val !== undefined && val !== null) result[id] = val;
        }
        return result;
      },
      set: async (data) => {
        for (const [type, typeData] of Object.entries(data)) {
          for (const [id, value] of Object.entries(typeData || {})) {
            const key = `${type}-${id}`;
            if (value !== undefined && value !== null) {
              keys[key] = value;
            } else {
              delete keys[key];
            }
          }
        }
        _scheduleKeySave(); // debounced — no bloquea ni satura Supabase
      },
    },
  };

  return { state, saveCreds };
}

/**
 * Elimina la sesión guardada (fuerza nuevo escaneo de QR).
 */
export async function deleteSession() {
  await supabase
    .from('whatsapp_sessions')
    .delete()
    .eq('id', SESSION_ID);
  console.log('[Session] Sesión eliminada. Próximo inicio pedirá QR.');
}
