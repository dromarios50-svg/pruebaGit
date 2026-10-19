const path = require('node:path');
const crypto = require('node:crypto');

// Configuración centralizada. Todo valor sensible se puede sobreescribir con variables de entorno.
const config = {
  port: Number(process.env.PORT) || 3000,
  dbFile: process.env.DB_FILE || path.join(__dirname, '..', 'data', 'botica.db'),
  // En producción se DEBE definir JWT_SECRET; en desarrollo se genera uno aleatorio por arranque.
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  igv: 0.18, // Los precios de venta en Perú incluyen IGV
  diasAlertaVencimiento: Number(process.env.DIAS_ALERTA_VENCIMIENTO) || 60,
  frontendDir: path.join(__dirname, '..', '..', 'frontend'),
};

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('ERROR: defina la variable de entorno JWT_SECRET en producción.');
  process.exit(1);
}

module.exports = config;
