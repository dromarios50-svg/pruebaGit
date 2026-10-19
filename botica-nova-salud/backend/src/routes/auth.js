const express = require('express');
const bcrypt = require('bcryptjs');
const { firmarToken, autenticar } = require('../middleware/auth');
const { ruta, texto, HttpError } = require('../utils');

// Limita intentos de inicio de sesión fallidos por IP (protección contra fuerza bruta).
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;
const intentos = new Map();

module.exports = (db) => {
  const router = express.Router();

  router.post('/login', ruta((req, res) => {
    const ip = req.ip;
    const registro = intentos.get(ip);
    if (registro && registro.cuenta >= MAX_INTENTOS && Date.now() - registro.desde < BLOQUEO_MS) {
      throw new HttpError(429, 'Demasiados intentos fallidos. Espere 5 minutos.');
    }

    const usuario = texto(req.body.usuario, 'usuario', { max: 50 });
    const password = texto(req.body.password, 'contraseña', { max: 100 });
    const fila = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(usuario);

    if (!fila || !bcrypt.compareSync(password, fila.password_hash)) {
      const r = registro && Date.now() - registro.desde < BLOQUEO_MS ? registro : { cuenta: 0, desde: Date.now() };
      r.cuenta += 1;
      intentos.set(ip, r);
      throw new HttpError(401, 'Usuario o contraseña incorrectos.');
    }

    intentos.delete(ip);
    res.json({
      token: firmarToken(fila),
      usuario: { id: fila.id, nombre: fila.nombre, usuario: fila.usuario, rol: fila.rol },
    });
  }));

  router.get('/perfil', autenticar, (req, res) => res.json(req.usuario));

  return router;
};
