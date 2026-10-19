// Canal de eventos en tiempo real (Server-Sent Events).
// Cada cambio de stock se notifica a todos los navegadores conectados.

const clientes = new Set();

function suscribir(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: conectado\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const latido = setInterval(() => res.write(': ping\n\n'), 25000);
  clientes.add(res);
  req.on('close', () => {
    clearInterval(latido);
    clientes.delete(res);
  });
}

function emitir(evento, datos) {
  const mensaje = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const res of clientes) res.write(mensaje);
}

module.exports = { suscribir, emitir };
