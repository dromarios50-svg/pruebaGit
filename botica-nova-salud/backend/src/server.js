const config = require('./config');
const { abrirBaseDatos } = require('./db');
const { sembrarDatos } = require('./seed');
const { crearApp } = require('./app');

const db = abrirBaseDatos();
if (sembrarDatos(db)) console.log('Base de datos inicializada con datos de ejemplo.');

crearApp(db).listen(config.port, () => {
  console.log(`Botica Nova Salud en http://localhost:${config.port}`);
});
