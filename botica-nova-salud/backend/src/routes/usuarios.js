const express = require('express');
const bcrypt = require('bcryptjs');
const { ruta, texto, HttpError } = require('../utils');

const ROLES = ['ADMIN', 'VENDEDOR', 'ALMACEN'];

// Gestión de usuarios del sistema (solo ADMIN, ver server.js).
module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios ORDER BY nombre').all());
  });

  router.post('/', ruta((req, res) => {
    const nombre = texto(req.body.nombre, 'nombre', { max: 100 });
    const usuario = texto(req.body.usuario, 'usuario', { max: 30, patron: /^[a-zA-Z0-9._-]{3,30}$/, mensajePatron: 'El usuario debe tener 3 a 30 caracteres (letras, números, punto, guion).' });
    const password = texto(req.body.password, 'contraseña', { max: 100 });
    if (password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres.');
    const rol = texto(req.body.rol, 'rol');
    if (!ROLES.includes(rol)) throw new HttpError(400, 'Rol no válido.');
    if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(usuario)) throw new HttpError(409, 'El nombre de usuario ya está en uso.');
    const { lastInsertRowid } = db.prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run(nombre, usuario, bcrypt.hashSync(password, 10), rol);
    res.status(201).json({ id: Number(lastInsertRowid), nombre, usuario, rol, activo: 1 });
  }));

  router.put('/:id', ruta((req, res) => {
    const id = Number(req.params.id);
    const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!actual) throw new HttpError(404, 'Usuario no encontrado.');
    const nombre = texto(req.body.nombre, 'nombre', { max: 100 });
    const rol = texto(req.body.rol, 'rol');
    if (!ROLES.includes(rol)) throw new HttpError(400, 'Rol no válido.');
    const activo = req.body.activo === undefined ? actual.activo : (req.body.activo ? 1 : 0);
    if (id === req.usuario.id && (rol !== 'ADMIN' || !activo)) {
      throw new HttpError(400, 'No puede quitarse a sí mismo el rol de administrador ni desactivarse.');
    }
    let hash = actual.password_hash;
    if (req.body.password) {
      const password = texto(req.body.password, 'contraseña', { max: 100 });
      if (password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres.');
      hash = bcrypt.hashSync(password, 10);
    }
    db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, password_hash = ? WHERE id = ?').run(nombre, rol, activo, hash, id);
    res.json({ id, nombre, usuario: actual.usuario, rol, activo });
  }));

  return router;
};
