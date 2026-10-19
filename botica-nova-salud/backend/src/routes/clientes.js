const express = require('express');
const { ruta, texto, email, HttpError } = require('../utils');

function leerCliente(body) {
  return {
    documento: texto(body.documento, 'DNI/RUC', { patron: /^(\d{8}|\d{11})$/, mensajePatron: 'El documento debe ser un DNI (8 dígitos) o RUC (11 dígitos).' }),
    nombres: texto(body.nombres, 'nombres', { max: 150 }),
    telefono: texto(body.telefono, 'teléfono', { requerido: false, max: 20, patron: /^[0-9+\s-]{6,20}$/ }),
    email: email(body.email),
  };
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', ruta((req, res) => {
    const q = req.query.q ? `%${req.query.q}%` : '%';
    res.json(db.prepare(`
      SELECT c.*, COUNT(v.id) AS compras, COALESCE(SUM(v.total), 0) AS total_comprado, MAX(v.fecha) AS ultima_compra
      FROM clientes c LEFT JOIN ventas v ON v.cliente_id = c.id AND v.estado = 'EMITIDA'
      WHERE c.nombres LIKE ? OR c.documento LIKE ?
      GROUP BY c.id ORDER BY c.nombres LIMIT 200`).all(q, q));
  }));

  router.get('/documento/:documento', ruta((req, res) => {
    const c = db.prepare('SELECT * FROM clientes WHERE documento = ?').get(req.params.documento);
    if (!c) throw new HttpError(404, 'Cliente no registrado.');
    res.json(c);
  }));

  router.get('/:id/compras', ruta((req, res) => {
    res.json(db.prepare(`SELECT id, numero, fecha, total, metodo_pago, estado FROM ventas
      WHERE cliente_id = ? ORDER BY fecha DESC LIMIT 50`).all(Number(req.params.id)));
  }));

  router.post('/', ruta((req, res) => {
    const d = leerCliente(req.body);
    if (db.prepare('SELECT 1 FROM clientes WHERE documento = ?').get(d.documento)) throw new HttpError(409, 'Ya existe un cliente con ese documento.');
    const { lastInsertRowid } = db.prepare('INSERT INTO clientes (documento, nombres, telefono, email) VALUES (:documento, :nombres, :telefono, :email)').run(d);
    res.status(201).json({ id: Number(lastInsertRowid), ...d });
  }));

  router.put('/:id', ruta((req, res) => {
    const d = leerCliente(req.body);
    const id = Number(req.params.id);
    if (db.prepare('SELECT 1 FROM clientes WHERE documento = ? AND id <> ?').get(d.documento, id)) throw new HttpError(409, 'Ya existe otro cliente con ese documento.');
    const r = db.prepare('UPDATE clientes SET documento = :documento, nombres = :nombres, telefono = :telefono, email = :email WHERE id = :id').run({ ...d, id });
    if (!r.changes) throw new HttpError(404, 'Cliente no encontrado.');
    res.json({ id, ...d });
  }));

  return router;
};
