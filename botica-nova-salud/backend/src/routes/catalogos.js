const express = require('express');
const { permitir } = require('../middleware/auth');
const { ruta, texto, email, HttpError } = require('../utils');

// Categorías y proveedores: catálogos simples administrados por ADMIN y ALMACEN.

function categorias(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id AND p.activo = 1) AS productos
      FROM categorias c ORDER BY c.nombre`).all());
  });

  router.post('/', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const nombre = texto(req.body.nombre, 'nombre', { max: 80 });
    if (db.prepare('SELECT 1 FROM categorias WHERE nombre = ?').get(nombre)) throw new HttpError(409, 'La categoría ya existe.');
    const { lastInsertRowid } = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre);
    res.status(201).json({ id: Number(lastInsertRowid), nombre });
  }));

  router.put('/:id', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const nombre = texto(req.body.nombre, 'nombre', { max: 80 });
    const id = Number(req.params.id);
    if (db.prepare('SELECT 1 FROM categorias WHERE nombre = ? AND id <> ?').get(nombre, id)) throw new HttpError(409, 'La categoría ya existe.');
    const r = db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?').run(nombre, id);
    if (!r.changes) throw new HttpError(404, 'Categoría no encontrada.');
    res.json({ id, nombre });
  }));

  router.delete('/:id', permitir('ADMIN'), ruta((req, res) => {
    const id = Number(req.params.id);
    if (db.prepare('SELECT 1 FROM productos WHERE categoria_id = ?').get(id)) {
      throw new HttpError(409, 'No se puede eliminar: hay productos asociados a esta categoría.');
    }
    const r = db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
    if (!r.changes) throw new HttpError(404, 'Categoría no encontrada.');
    res.json({ mensaje: 'Categoría eliminada.' });
  }));

  return router;
}

function leerProveedor(body) {
  return {
    ruc: texto(body.ruc, 'RUC', { patron: /^(10|15|17|20)\d{9}$/, mensajePatron: 'El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.' }),
    razon_social: texto(body.razon_social, 'razón social', { max: 150 }),
    telefono: texto(body.telefono, 'teléfono', { requerido: false, max: 20, patron: /^[0-9+\s-]{6,20}$/ }),
    email: email(body.email),
  };
}

function proveedores(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT pr.*, (SELECT COUNT(*) FROM productos p WHERE p.proveedor_id = pr.id AND p.activo = 1) AS productos
      FROM proveedores pr WHERE pr.activo = 1 ORDER BY pr.razon_social`).all());
  });

  router.post('/', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const d = leerProveedor(req.body);
    if (db.prepare('SELECT 1 FROM proveedores WHERE ruc = ?').get(d.ruc)) throw new HttpError(409, 'Ya existe un proveedor con ese RUC.');
    const { lastInsertRowid } = db.prepare('INSERT INTO proveedores (ruc, razon_social, telefono, email) VALUES (:ruc, :razon_social, :telefono, :email)').run(d);
    res.status(201).json({ id: Number(lastInsertRowid), ...d });
  }));

  router.put('/:id', permitir('ADMIN', 'ALMACEN'), ruta((req, res) => {
    const d = leerProveedor(req.body);
    const id = Number(req.params.id);
    if (db.prepare('SELECT 1 FROM proveedores WHERE ruc = ? AND id <> ?').get(d.ruc, id)) throw new HttpError(409, 'Ya existe otro proveedor con ese RUC.');
    const r = db.prepare('UPDATE proveedores SET ruc = :ruc, razon_social = :razon_social, telefono = :telefono, email = :email WHERE id = :id').run({ ...d, id });
    if (!r.changes) throw new HttpError(404, 'Proveedor no encontrado.');
    res.json({ id, ...d });
  }));

  router.delete('/:id', permitir('ADMIN'), ruta((req, res) => {
    const r = db.prepare('UPDATE proveedores SET activo = 0 WHERE id = ?').run(Number(req.params.id));
    if (!r.changes) throw new HttpError(404, 'Proveedor no encontrado.');
    res.json({ mensaje: 'Proveedor desactivado.' });
  }));

  return router;
}

module.exports = { categorias, proveedores };
