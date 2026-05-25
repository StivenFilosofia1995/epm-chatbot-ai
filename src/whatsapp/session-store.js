/**
 * session-store.js
 *
 * Reemplaza el auth_info_multi_file de Baileys por almacenamiento en Supabase.
 * Permite que Railway reinicie el contenedor sin perder la sesión de WhatsApp.
 */

import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { supabase } from '../services/supabase.js';

const SESSION_ID = 'default';

/**
 * Carga o crea el estado de autenticación de Baileys desde Supabase.
 */
export async function useSupabaseAuthState() {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('creds, keys')
    .eq('id', SESSION_ID)
    .single();

  // Si no hay sesión guardada, inicializar con credenciales vacías de Baileys
  let creds = data?.creds
    ? JSON.parse(JSON.stringify(data.creds), BufferJSON.reviver)
    : initAuthCreds();

  // Revivir todos los Buffers almacenados en las claves al cargarlas
  let keysRaw = data?.keys || {};
  let keys = JSON.parse(JSON.stringify(keysRaw), BufferJSON.reviver);

  const saveToSupabase = async () => {
    try {
      await supabase
        .from('whatsapp_sessions')
        .upsert(
          {
            id: SESSION_ID,
            creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
            keys: JSON.parse(JSON.stringify(keys, BufferJSON.replacer)),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      console.log('[Session] Sesión guardada en Supabase ✓');
    } catch (err) {
      console.error('[Session] Error guardando sesión:', err.message);
    }
  };

  const saveCreds = async () => {
    await saveToSupabase();
  };

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result = {};
        for (const id of ids) {
          const val = keys[`${type}-${id}`];
          // val ya está revivido en memoria desde la carga inicial
          if (val !== undefined && val !== null) {
            result[id] = val;
          }
        }
        return result;
      },
      set: async (data) => {
        for (const [type, typeData] of Object.entries(data)) {
          for (const [id, value] of Object.entries(typeData || {})) {
            const key = `${type}-${id}`;
            if (value !== undefined && value !== null) {
              // Guardar en memoria como objeto nativo (Buffer real)
              keys[key] = value;
            } else {
              delete keys[key];
            }
          }
        }
        await saveToSupabase();
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
