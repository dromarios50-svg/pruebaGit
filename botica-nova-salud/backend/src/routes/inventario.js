const express = require('express');
const { permitir } = require('../middleware/auth');
const { ruta, texto, numero, fecha, HttpError } = require('../utils');
const { moverStock, notificarCambios } = require('../inventario');
const { obtenerAlertas } = require('../alertas');
const { transaccion } = require('../db');

module.exports = (db) => {
  const router = express.Router();

  // Kardex / historial de movimientos: ?producto=id&tipo=ENTRADA&desde=&hasta=
  router.get('/movimientos', ruta((req, res) => {
    const where = [];
    const params = [];
    if (req.query.producto) { where.push('m.producto_id = ?'); params.push(Number(req.query.producto)); }
    if (req.query.tipo) { where.push('m.tipo = ?'); params.push(String(req.query.tipo)); }
    const desde = fecha(req.query.desde, 'desde');
    const hasta = fecha(req.query.hasta, 'hasta');
    if (desde) { where.push('date(m.fecha) >= ?'); params.push(desde); }
    if (hasta) { where.push('date(m.fecha) <= ?'); params.push(hasta); }
    res.json(db.prepare(`
      SELECT m.*, p.codigo, p.nombre AS producto, u.nombre AS usuario
      FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id LEFT JOIN usuarios u ON u.id = m.usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.fecha DESC, m.id DESC LIMIT 500`).all(...params));
  }));

  // Registrar ingreso de mercadería, salida (merma, vencimiento) o ajuste por inventario físico.
  router.post('/movimientos', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const tipo = texto(req.body.tipo, 'tipo');
    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipo)) throw new HttpError(400, 'Tipo de movimiento no válido.');
    const productoId = numero(req.body.producto_id, 'producto', { min: 1, entero: true });
    const motivo = texto(req.body.motivo, 'motivo', { requerido: tipo !== 'ENTRADA', max: 200 });

    const resultado = transaccion(db, () => {
      let delta;
      if (tipo === 'AJUSTE') {
        // En un ajuste se indica el stock contado físicamente.
        const contado = numero(req.body.stock_real, 'stock real', { entero: true, max: 1000000 });
        const actual = db.prepare('SELECT stock FROM productos WHERE id = ?').get(productoId);
        if (!actual) throw new HttpError(404, 'Producto no encontrado.');
        delta = contado - actual.stock;
        if (delta === 0) throw new HttpError(400, 'El stock contado es igual al registrado; no hay nada que ajustar.');
      } else {
        const cantidad = numero(req.body.cantidad, 'cantidad', { min: 1, max: 1000000, entero: true });
        delta = tipo === 'ENTRADA' ? cantidad : -cantidad;
      }
      if (tipo === 'ENTRADA') {
        // Al ingresar un nuevo lote se puede actualizar lote, vencimiento y costo.
        const lote = texto(req.body.lote, 'lote', { requerido: false, max: 50 });
        const venc = fecha(req.body.fecha_vencimiento, 'fecha de vencimiento');
        const costo = numero(req.body.precio_compra, 'precio de compra', { requerido: false });
        db.prepare(`UPDATE productos SET lote = COALESCE(?, lote), fecha_vencimiento = COALESCE(?, fecha_vencimiento),
          precio_compra = COALESCE(?, precio_compra) WHERE id = ?`).run(lote, venc, costo, productoId);
      }
      return moverStock(db, {
        productoId, tipo, delta, motivo: motivo || 'Ingreso de mercadería',
        referencia: texto(req.body.referencia, 'referencia', { requerido: false, max: 60 }),
        usuarioId: req.usuario.id,
      });
    });

    notificarCambios(db, [{ id: resultado.id, stock: resultado.stock }]);
    res.status(201).json(resultado);
  }));

  router.get('/alertas', (req, res) => res.json(obtenerAlertas(db)));

  return router;
};
