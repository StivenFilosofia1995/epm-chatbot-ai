/**
 * python-bridge.js
 * Bridge Node.js ↔ Python: llama scripts Python pasando JSON por stdin,
 * recibe resultado por stdout. Síncrono (spawnSync) para mantener el flujo simple.
 *
 * Si Python no está disponible, todas las llamadas retornan null
 * y los agentes usan su fallback en JS automáticamente.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');

// Detectar el comando Python disponible en el sistema (Windows / Linux / Mac)
function _detectPython() {
  for (const cmd of ['python3', 'python', 'py']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 2000 });
    if (!r.error && r.status === 0) {
      console.log(`[PythonBridge] ✅ Python encontrado: ${cmd} (${r.stdout.trim() || r.stderr.trim()})`);
      return cmd;
    }
  }
  console.warn('[PythonBridge] ⚠ Python no encontrado. Los scripts Python quedan desactivados (fallback JS activo).');
  return null;
}

export const PYTHON_CMD = _detectPython();

/**
 * Llama a un script Python en /scripts/, pasando data como JSON por stdin.
 * @param {string} script   — nombre del archivo, ej: 'ner_barrio.py'
 * @param {any}    input    — dato a serializar como JSON al stdin del script
 * @param {number} [timeout=5000]
 * @returns {string|null}   — stdout del script (string sin parsear) o null si falla
 */
export function callPython(script, input, timeout = 5000) {
  if (!PYTHON_CMD) return null;

  const result = spawnSync(
    PYTHON_CMD,
    [path.join(SCRIPTS_DIR, script)],
    { input: JSON.stringify(input), encoding: 'utf8', timeout },
  );

  if (result.error) {
    console.warn(`[PythonBridge] Error ejecutando ${script}: ${result.error.message}`);
    return null;
  }
  if (result.status !== 0) {
    console.warn(`[PythonBridge] ${script} salió con código ${result.status}: ${result.stderr?.slice(0, 200)}`);
    return null;
  }

  return result.stdout?.trim() || null;
}
