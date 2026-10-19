const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../utils');

function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, usuario: usuario.usuario, rol: usuario.rol },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

// Verifica el JWT enviado en "Authorization: Bearer <token>".
// EventSource (SSE) no permite cabeceras, por eso el endpoint de eventos acepta ?token=.
function autenticar(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : req.query.token;
  if (!token) return next(new HttpError(401, 'Debe iniciar sesión.'));
  try {
    req.usuario = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Sesión expirada o inválida. Vuelva a iniciar sesión.'));
  }
}

// Control de acceso basado en roles.
const permitir = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuario?.rol)) {
    return next(new HttpError(403, 'No tiene permisos para realizar esta acción.'));
  }
  next();
};

module.exports = { firmarToken, autenticar, permitir };
