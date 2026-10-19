// Utilidades compartidas: errores HTTP y validación de entradas.

class HttpError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Envuelve un manejador para que cualquier excepción llegue al middleware de errores.
const ruta = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (err) {
    next(err);
  }
};

function texto(valor, campo, { requerido = true, max = 200, patron, mensajePatron } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (requerido) throw new HttpError(400, `El campo "${campo}" es obligatorio.`);
    return null;
  }
  const v = String(valor).trim();
  if (v.length > max) throw new HttpError(400, `El campo "${campo}" admite máximo ${max} caracteres.`);
  if (patron && !patron.test(v)) throw new HttpError(400, mensajePatron || `El campo "${campo}" no es válido.`);
  return v;
}

function numero(valor, campo, { requerido = true, min = 0, max = 1e9, entero = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw new HttpError(400, `El campo "${campo}" es obligatorio.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) {
    throw new HttpError(400, `El campo "${campo}" debe ser un número${entero ? ' entero' : ''} entre ${min} y ${max}.`);
  }
  return n;
}

function fecha(valor, campo, { requerido = false } = {}) {
  const v = texto(valor, campo, { requerido, max: 10 });
  if (v === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new HttpError(400, `El campo "${campo}" debe tener el formato AAAA-MM-DD.`);
  }
  return v;
}

const email = (valor, campo = 'email') =>
  texto(valor, campo, { requerido: false, max: 120, patron: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, mensajePatron: 'El correo electrónico no es válido.' });

const redondear = (n) => Math.round(n * 100) / 100;

module.exports = { HttpError, ruta, texto, numero, fecha, email, redondear };
