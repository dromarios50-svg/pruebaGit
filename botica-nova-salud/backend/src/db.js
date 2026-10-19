const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  usuario       TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  rol           TEXT    NOT NULL CHECK (rol IN ('ADMIN', 'VENDEDOR', 'ALMACEN')),
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS proveedores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ruc          TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  telefono     TEXT,
  email        TEXT,
  activo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS productos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo            TEXT    NOT NULL UNIQUE,
  nombre            TEXT    NOT NULL,
  descripcion       TEXT,
  laboratorio       TEXT,
  presentacion      TEXT,
  categoria_id      INTEGER REFERENCES categorias(id),
  proveedor_id      INTEGER REFERENCES proveedores(id),
  precio_compra     REAL    NOT NULL DEFAULT 0 CHECK (precio_compra >= 0),
  precio_venta      REAL    NOT NULL CHECK (precio_venta >= 0),
  stock             INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo      INTEGER NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
  lote              TEXT,
  fecha_vencimiento TEXT,
  requiere_receta   INTEGER NOT NULL DEFAULT 0,
  activo            INTEGER NOT NULL DEFAULT 1,
  creado_en         TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  documento TEXT NOT NULL UNIQUE,
  nombres   TEXT NOT NULL,
  telefono  TEXT,
  email     TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  numero         TEXT    NOT NULL UNIQUE,
  cliente_id     INTEGER REFERENCES clientes(id),
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  fecha          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  subtotal       REAL    NOT NULL,
  igv            REAL    NOT NULL,
  descuento      REAL    NOT NULL DEFAULT 0,
  total          REAL    NOT NULL,
  metodo_pago    TEXT    NOT NULL CHECK (metodo_pago IN ('EFECTIVO', 'TARJETA', 'YAPE', 'PLIN')),
  monto_recibido REAL,
  vuelto         REAL,
  estado         TEXT    NOT NULL DEFAULT 'EMITIDA' CHECK (estado IN ('EMITIDA', 'ANULADA')),
  motivo_anulacion TEXT
);

CREATE TABLE IF NOT EXISTS detalle_venta (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL    NOT NULL,
  subtotal        REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id    INTEGER NOT NULL REFERENCES productos(id),
  tipo           TEXT    NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'VENTA', 'ANULACION')),
  cantidad       INTEGER NOT NULL,
  stock_anterior INTEGER NOT NULL,
  stock_nuevo    INTEGER NOT NULL,
  motivo         TEXT,
  referencia     TEXT,
  usuario_id     INTEGER REFERENCES usuarios(id),
  fecha          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_detalle_venta ON detalle_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos_inventario(producto_id, fecha);
`;

function abrirBaseDatos(archivo = config.dbFile) {
  if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

// Ejecuta fn dentro de una transacción: si algo falla se revierte todo (consistencia del stock).
function transaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { abrirBaseDatos, transaccion, SCHEMA };
