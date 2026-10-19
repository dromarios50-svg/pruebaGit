const express = require('express');
const config = require('./config');
const { autenticar, permitir } = require('./middleware/auth');
const { suscribir } = require('./eventos');
const { HttpError } = require('./utils');

function crearApp(db) {
  const app = express();
  app.disable('x-powered-by');

  // Cabeceras de seguridad básicas.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    });
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/salud', (req, res) => res.json({ estado: 'ok', fecha: new Date().toISOString() }));
  app.use('/api/auth', require('./routes/auth')(db));

  // A partir de aquí todas las rutas requieren sesión iniciada.
  app.use('/api', autenticar);
  app.get('/api/eventos', suscribir);
  app.use('/api/productos', require('./routes/productos')(db));
  const { categorias, proveedores } = require('./routes/catalogos');
  app.use('/api/categorias', categorias(db));
  app.use('/api/proveedores', proveedores(db));
  app.use('/api/clientes', require('./routes/clientes')(db));
  app.use('/api/ventas', require('./routes/ventas')(db));
  app.use('/api/inventario', require('./routes/inventario')(db));
  app.use('/api/reportes', require('./routes/reportes')(db));
  app.use('/api/usuarios', permitir('ADMIN'), require('./routes/usuarios')(db));

  app.use('/api', (req, res, next) => next(new HttpError(404, 'Recurso no encontrado.')));

  // Front-end estático (SPA).
  app.use(express.static(config.frontendDir));

  // Manejador central de errores: nunca expone detalles internos al cliente.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado.' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}

module.exports = { crearApp };
