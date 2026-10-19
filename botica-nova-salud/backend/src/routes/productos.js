const express = require('express');
const { permitir } = require('../middleware/auth');
const { ruta, texto, numero, fecha, HttpError } = require('../utils');
const { moverStock, notificarCambios } = require('../inventario');
const { transaccion } = require('../db');

const SELECT_PRODUCTO = `
  SELECT p.*, c.nombre AS categoria, pr.razon_social AS proveedor,
         CASE WHEN p.stock = 0 THEN 'AGOTADO'
              WHEN p.stock <= p.stock_minimo THEN 'BAJO'
              ELSE 'NORMAL' END AS estado_stock
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN proveedores pr ON pr.id = p.proveedor_id`;

function leerProducto(body) {
  return {
    codigo: texto(body.codigo, 'código', { max: 30 }),
    nombre: texto(body.nombre, 'nombre', { max: 150 }),
    descripcion: texto(body.descripcion, 'descripción', { requerido: false, max: 500 }),
    laboratorio: texto(body.laboratorio, 'laboratorio', { requerido: false, max: 100 }),
    presentacion: texto(body.presentacion, 'presentación', { requerido: false, max: 100 }),
    categoria_id: numero(body.categoria_id, 'categoría', { requerido: false, min: 1, entero: true }),
    proveedor_id: numero(body.proveedor_id, 'proveedor', { requerido: false, min: 1, entero: true }),
    precio_compra: numero(body.precio_compra ?? 0, 'precio de compra'),
    precio_venta: numero(body.precio_venta, 'precio de venta', { min: 0.01 }),
    stock_minimo: numero(body.stock_minimo ?? 5, 'stock mínimo', { entero: true, max: 100000 }),
    lote: texto(body.lote, 'lote', { requerido: false, max: 50 }),
    fecha_vencimiento: fecha(body.fecha_vencimiento, 'fecha de vencimiento'),
    requiere_receta: body.requiere_receta ? 1 : 0,
  };
}

module.exports = (db) => {
  const router = express.Router();

  // Listado con filtros: ?q=texto&categoria=id&estado=BAJO|AGOTADO|NORMAL&inactivos=1
  router.get('/', ruta((req, res) => {
    const where = [];
    const params = [];
    if (req.query.inactivos !== '1') where.push('p.activo = 1');
    if (req.query.q) {
      where.push('(p.nombre LIKE ? OR p.codigo LIKE ? OR p.laboratorio LIKE ?)');
      const q = `%${req.query.q}%`;
      params.push(q, q, q);
    }
    if (req.query.categoria) {
      where.push('p.categoria_id = ?');
      params.push(Number(req.query.categoria));
    }
    let sql = SELECT_PRODUCTO + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY p.nombre';
    if (['BAJO', 'AGOTADO', 'NORMAL'].includes(req.query.estado)) {
      sql = `SELECT * FROM (${sql}) WHERE estado_stock = ?`;
      params.push(req.query.estado);
    }
    res.json(db.prepare(sql).all(...params));
  }));

  // Búsqueda rápida para el punto de venta (por código exacto o nombre).
  router.get('/buscar', ruta((req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const filas = db.prepare(`${SELECT_PRODUCTO}
      WHERE p.activo = 1 AND (p.codigo = ? OR p.nombre LIKE ? OR p.laboratorio LIKE ?)
      ORDER BY (p.codigo = ?) DESC, p.nombre LIMIT 15`).all(q, `%${q}%`, `%${q}%`, q);
    res.json(filas);
  }));

  router.get('/:id', ruta((req, res) => {
    const p = db.prepare(`${SELECT_PRODUCTO} WHERE p.id = ?`).get(Number(req.params.id));
    if (!p) throw new HttpError(404, 'Producto no encontrado.');
    res.json(p);
  }));

  router.post('/', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const d = leerProducto(req.body);
    const stockInicial = numero(req.body.stock ?? 0, 'stock inicial', { entero: true, max: 1000000 });
    if (db.prepare('SELECT 1 FROM productos WHERE codigo = ?').get(d.codigo)) {
      throw new HttpError(409, `Ya existe un producto con el código ${d.codigo}.`);
    }
    const id = transaccion(db, () => {
      const { lastInsertRowid } = db.prepare(`INSERT INTO productos
        (codigo, nombre, descripcion, laboratorio, presentacion, categoria_id, proveedor_id, precio_compra,
         precio_venta, stock_minimo, lote, fecha_vencimiento, requiere_receta)
        VALUES (:codigo, :nombre, :descripcion, :laboratorio, :presentacion, :categoria_id, :proveedor_id,
         :precio_compra, :precio_venta, :stock_minimo, :lote, :fecha_vencimiento, :requiere_receta)`).run(d);
      if (stockInicial > 0) {
        moverStock(db, { productoId: Number(lastInsertRowid), tipo: 'ENTRADA', delta: stockInicial,
          motivo: 'Stock inicial', usuarioId: req.usuario.id });
      }
      return Number(lastInsertRowid);
    });
    const producto = db.prepare(`${SELECT_PRODUCTO} WHERE p.id = ?`).get(id);
    notificarCambios(db, [{ id, stock: producto.stock }]);
    res.status(201).json(producto);
  }));

  // El stock NO se edita aquí: se modifica solo mediante movimientos de inventario o ventas.
  router.put('/:id', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM productos WHERE id = ?').get(id)) throw new HttpError(404, 'Producto no encontrado.');
    const d = leerProducto(req.body);
    if (db.prepare('SELECT 1 FROM productos WHERE codigo = ? AND id <> ?').get(d.codigo, id)) {
      throw new HttpError(409, `Ya existe otro producto con el código ${d.codigo}.`);
    }
    db.prepare(`UPDATE productos SET codigo = :codigo, nombre = :nombre, descripcion = :descripcion,
      laboratorio = :laboratorio, presentacion = :presentacion, categoria_id = :categoria_id,
      proveedor_id = :proveedor_id, precio_compra = :precio_compra, precio_venta = :precio_venta,
      stock_minimo = :stock_minimo, lote = :lote, fecha_vencimiento = :fecha_vencimiento,
      requiere_receta = :requiere_receta WHERE id = :id`).run({ ...d, id });
    const producto = db.prepare(`${SELECT_PRODUCTO} WHERE p.id = ?`).get(id);
    notificarCambios(db, [{ id, stock: producto.stock }]);
    res.json(producto);
  }));

  // Baja lógica: se conserva el historial de ventas y movimientos.
  router.delete('/:id', permitir('ADMIN'), ruta((req, res) => {
    const r = db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Producto no encontrado.');
    notificarCambios(db, []);
    res.json({ mensaje: 'Producto desactivado.' });
  }));

  router.post('/:id/activar', permitir('ADMIN'), ruta((req, res) => {
    const r = db.prepare('UPDATE productos SET activo = 1 WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Producto no encontrado.');
    notificarCambios(db, []);
    res.json({ mensaje: 'Producto reactivado.' });
  }));

  return router;
};
