const express = require('express');
const config = require('../config');
const { permitir } = require('../middleware/auth');
const { ruta, texto, numero, fecha, redondear, HttpError } = require('../utils');
const { moverStock, notificarCambios } = require('../inventario');
const { transaccion } = require('../db');

const METODOS = ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'];

module.exports = (db) => {
  const router = express.Router();

  function obtenerVenta(id) {
    const venta = db.prepare(`
      SELECT v.*, c.documento AS cliente_documento, c.nombres AS cliente_nombres, u.nombre AS vendedor
      FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.id = ?`).get(id);
    if (!venta) return null;
    venta.items = db.prepare(`
      SELECT d.*, p.codigo, p.nombre, p.presentacion FROM detalle_venta d JOIN productos p ON p.id = d.producto_id
      WHERE d.venta_id = ? ORDER BY d.id`).all(id);
    return venta;
  }

  // Registrar una venta: valida stock, descuenta inventario y genera la boleta en una sola transacción.
  router.post('/', permitir('ADMIN', 'VENDEDOR'), ruta((req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) throw new HttpError(400, 'La venta debe tener al menos un producto.');
    if (items.length > 100) throw new HttpError(400, 'Máximo 100 líneas por venta.');

    const metodo = texto(req.body.metodo_pago, 'método de pago');
    if (!METODOS.includes(metodo)) throw new HttpError(400, 'Método de pago no válido.');
    const clienteId = numero(req.body.cliente_id, 'cliente', { requerido: false, min: 1, entero: true });
    if (clienteId && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) {
      throw new HttpError(400, 'El cliente seleccionado no existe.');
    }

    // Agrupa productos repetidos y toma SIEMPRE el precio desde la base de datos (no del navegador).
    const cantidades = new Map();
    for (const it of items) {
      const pid = numero(it.producto_id, 'producto', { min: 1, entero: true });
      const cant = numero(it.cantidad, 'cantidad', { min: 1, max: 10000, entero: true });
      cantidades.set(pid, (cantidades.get(pid) || 0) + cant);
    }

    const ventaId = transaccion(db, () => {
      const lineas = [];
      let total = 0;
      for (const [pid, cantidad] of cantidades) {
        const p = db.prepare('SELECT id, nombre, precio_venta, stock, activo, fecha_vencimiento FROM productos WHERE id = ?').get(pid);
        if (!p || !p.activo) throw new HttpError(400, `El producto ${pid} no está disponible.`);
        if (p.fecha_vencimiento && p.fecha_vencimiento < new Date().toISOString().slice(0, 10)) {
          throw new HttpError(409, `"${p.nombre}" está vencido y no puede venderse.`);
        }
        if (p.stock < cantidad) throw new HttpError(409, `Stock insuficiente para "${p.nombre}". Disponible: ${p.stock}.`);
        const subtotal = redondear(p.precio_venta * cantidad);
        total += subtotal;
        lineas.push({ pid, cantidad, precio: p.precio_venta, subtotal });
      }
      total = redondear(total);
      const descuento = redondear(numero(req.body.descuento ?? 0, 'descuento', { max: total }));
      const totalPagar = redondear(total - descuento);
      const subtotal = redondear(totalPagar / (1 + config.igv));
      const igv = redondear(totalPagar - subtotal);

      let recibido = null;
      let vuelto = null;
      if (metodo === 'EFECTIVO') {
        recibido = numero(req.body.monto_recibido ?? totalPagar, 'monto recibido', { max: 1e6 });
        if (recibido < totalPagar) throw new HttpError(400, 'El monto recibido es menor al total a pagar.');
        vuelto = redondear(recibido - totalPagar);
      }

      const { siguiente } = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS siguiente FROM ventas').get();
      const numeroBoleta = `B001-${String(siguiente).padStart(6, '0')}`;
      const { lastInsertRowid } = db.prepare(`INSERT INTO ventas
        (numero, cliente_id, usuario_id, subtotal, igv, descuento, total, metodo_pago, monto_recibido, vuelto)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(numeroBoleta, clienteId, req.usuario.id, subtotal, igv, descuento, totalPagar, metodo, recibido, vuelto);
      const id = Number(lastInsertRowid);

      const insDetalle = db.prepare('INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
      for (const l of lineas) {
        insDetalle.run(id, l.pid, l.cantidad, l.precio, l.subtotal);
        moverStock(db, { productoId: l.pid, tipo: 'VENTA', delta: -l.cantidad, referencia: numeroBoleta, usuarioId: req.usuario.id });
      }
      return id;
    });

    const venta = obtenerVenta(ventaId);
    notificarCambios(db, venta.items.map((i) => ({
      id: i.producto_id,
      stock: db.prepare('SELECT stock FROM productos WHERE id = ?').get(i.producto_id).stock,
    })));
    res.status(201).json(venta);
  }));

  // Historial: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&estado=EMITIDA|ANULADA&q=numero/cliente
  router.get('/', ruta((req, res) => {
    const where = [];
    const params = [];
    const desde = fecha(req.query.desde, 'desde');
    const hasta = fecha(req.query.hasta, 'hasta');
    if (desde) { where.push('date(v.fecha) >= ?'); params.push(desde); }
    if (hasta) { where.push('date(v.fecha) <= ?'); params.push(hasta); }
    if (['EMITIDA', 'ANULADA'].includes(req.query.estado)) { where.push('v.estado = ?'); params.push(req.query.estado); }
    if (req.query.q) {
      where.push('(v.numero LIKE ? OR c.nombres LIKE ? OR c.documento LIKE ?)');
      const q = `%${req.query.q}%`;
      params.push(q, q, q);
    }
    // Un vendedor solo ve sus propias ventas.
    if (req.usuario.rol === 'VENDEDOR') { where.push('v.usuario_id = ?'); params.push(req.usuario.id); }
    res.json(db.prepare(`
      SELECT v.id, v.numero, v.fecha, v.total, v.metodo_pago, v.estado,
             c.nombres AS cliente, u.nombre AS vendedor,
             (SELECT SUM(cantidad) FROM detalle_venta d WHERE d.venta_id = v.id) AS unidades
      FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id JOIN usuarios u ON u.id = v.usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY v.fecha DESC, v.id DESC LIMIT 500`).all(...params));
  }));

  router.get('/:id', ruta((req, res) => {
    const venta = obtenerVenta(Number(req.params.id));
    if (!venta) throw new HttpError(404, 'Venta no encontrada.');
    if (req.usuario.rol === 'VENDEDOR' && venta.usuario_id !== req.usuario.id) {
      throw new HttpError(403, 'No tiene permisos para ver esta venta.');
    }
    res.json(venta);
  }));

  // Anulación: devuelve el stock y deja trazabilidad. Solo ADMIN.
  router.post('/:id/anular', permitir('ADMIN'), ruta((req, res) => {
    const id = Number(req.params.id);
    const motivo = texto(req.body.motivo, 'motivo de anulación', { max: 200 });
    const venta = obtenerVenta(id);
    if (!venta) throw new HttpError(404, 'Venta no encontrada.');
    if (venta.estado === 'ANULADA') throw new HttpError(409, 'La venta ya está anulada.');

    const productos = transaccion(db, () => {
      db.prepare("UPDATE ventas SET estado = 'ANULADA', motivo_anulacion = ? WHERE id = ?").run(motivo, id);
      return venta.items.map((i) => moverStock(db, {
        productoId: i.producto_id, tipo: 'ANULACION', delta: i.cantidad,
        motivo, referencia: venta.numero, usuarioId: req.usuario.id,
      }));
    });
    notificarCambios(db, productos.map(({ id: pid, stock }) => ({ id: pid, stock })));
    res.json(obtenerVenta(id));
  }));

  return router;
};
