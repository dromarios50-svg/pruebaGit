const { HttpError } = require('./utils');
const { emitir } = require('./eventos');
const { obtenerAlertas } = require('./alertas');

// Único punto donde se modifica el stock. Siempre deja trazabilidad en movimientos_inventario.
// "delta" es positivo para ingresos y negativo para salidas. Debe llamarse dentro de una transacción.
function moverStock(db, { productoId, tipo, delta, motivo = null, referencia = null, usuarioId }) {
  const producto = db.prepare('SELECT id, nombre, stock, activo FROM productos WHERE id = ?').get(productoId);
  if (!producto) throw new HttpError(404, `El producto ${productoId} no existe.`);
  const nuevo = producto.stock + delta;
  if (nuevo < 0) {
    throw new HttpError(409, `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}.`);
  }
  db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(nuevo, productoId);
  db.prepare(`INSERT INTO movimientos_inventario
      (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(productoId, tipo, delta, producto.stock, nuevo, motivo, referencia, usuarioId);
  return { id: productoId, nombre: producto.nombre, stock: nuevo };
}

// Notifica a todos los clientes conectados el nuevo stock y el resumen de alertas.
function notificarCambios(db, productos) {
  const alertas = obtenerAlertas(db);
  emitir('stock', { productos, alertas: { total: alertas.total } });
}

module.exports = { moverStock, notificarCambios };
