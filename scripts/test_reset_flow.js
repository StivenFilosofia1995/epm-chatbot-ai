#!/usr/bin/env node
import 'dotenv/config';
import { procesarMensaje } from '../src/agents/chat-agent.js';

const sessionId = '255903060234244@lid';

const mensajes = ['Volvamos a empezar', 'Hola'];
for (const mensaje of mensajes) {
  const r = await procesarMensaje({ sessionId, mensaje });
  console.log('---');
  console.log('USER:', mensaje);
  console.log('BOT :', r.respuesta.replace(/\n/g, ' '));
}
