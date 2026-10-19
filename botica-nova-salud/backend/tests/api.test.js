// Pruebas de integración del API con una base de datos en memoria.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { abrirBaseDatos } = require('../src/db');
const { sembrarDatos } = require('../src/seed');
const { crearApp } = require('../src/app');

let servidor;
let base;
const tokens = {};

async function llamar(metodo, url, { token, cuerpo } = {}) {
  const resp = await fetch(base + url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: resp.status, datos: await resp.json() };
}

before(async () => {
  const db = abrirBaseDatos(':memory:');
  sembrarDatos(db);
  servidor = crearApp(db).listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  for (const [u, p] of [['admin', 'admin123'], ['vendedor', 'vendedor123'], ['almacen', 'almacen123']]) {
    tokens[u] = (await llamar('POST', '/auth/login', { cuerpo: { usuario: u, password: p } })).datos.token;
  }
});

after(() => servidor.close());

test('rechaza credenciales incorrectas y peticiones sin token', async () => {
  assert.equal((await llamar('POST', '/auth/login', { cuerpo: { usuario: 'admin', password: 'mala' } })).status, 401);
  assert.equal((await llamar('GET', '/productos')).status, 401);
  assert.equal((await llamar('GET', '/productos', { token: 'token-falso' })).status, 401);
});

test('aplica control de acceso por roles', async () => {
  assert.equal((await llamar('GET', '/usuarios', { token: tokens.vendedor })).status, 403);
  assert.equal((await llamar('POST', '/ventas', { token: tokens.almacen, cuerpo: {} })).status, 403);
  assert.equal((await llamar('POST', '/productos', { token: tokens.vendedor, cuerpo: {} })).status, 403);
  assert.equal((await llamar('GET', '/reportes/ventas', { token: tokens.vendedor })).status, 403);
});

test('registra una venta, calcula IGV/vuelto y descuenta stock', async () => {
  const antes = (await llamar('GET', '/productos/1', { token: tokens.vendedor })).datos.stock;
  const { status, datos: venta } = await llamar('POST', '/ventas', {
    token: tokens.vendedor,
    cuerpo: { metodo_pago: 'EFECTIVO', monto_recibido: 50, items: [{ producto_id: 1, cantidad: 10 }, { producto_id: 7, cantidad: 2 }, { producto_id: 1, cantidad: 5 }] },
  });
  assert.equal(status, 201);
  assert.match(venta.numero, /^B001-\d{6}$/);
  assert.equal(venta.total, 15 * 0.2 + 2 * 9.5); // 22.00, precios tomados de la BD
  assert.equal(venta.vuelto, 28);
  assert.equal(Math.round((venta.subtotal + venta.igv) * 100) / 100, venta.total);
  assert.equal(venta.items.length, 2, 'agrupa productos repetidos');
  const despues = (await llamar('GET', '/productos/1', { token: tokens.vendedor })).datos.stock;
  assert.equal(despues, antes - 15);
});

test('impide vender más que el stock disponible sin modificar nada', async () => {
  const antes = (await llamar('GET', '/productos/7', { token: tokens.admin })).datos.stock;
  const { status, datos } = await llamar('POST', '/ventas', {
    token: tokens.vendedor,
    cuerpo: { metodo_pago: 'YAPE', items: [{ producto_id: 7, cantidad: 1 }, { producto_id: 5, cantidad: 9999 }] },
  });
  assert.equal(status, 409);
  assert.match(datos.error, /Stock insuficiente/);
  assert.equal((await llamar('GET', '/productos/7', { token: tokens.admin })).datos.stock, antes, 'la transacción se revierte');
});

test('no permite vender productos vencidos ni agotados', async () => {
  assert.equal((await llamar('POST', '/ventas', { token: tokens.vendedor, cuerpo: { metodo_pago: 'TARJETA', items: [{ producto_id: 20, cantidad: 1 }] } })).status, 409);
  assert.equal((await llamar('POST', '/ventas', { token: tokens.vendedor, cuerpo: { metodo_pago: 'TARJETA', items: [{ producto_id: 12, cantidad: 1 }] } })).status, 409);
});

test('la anulación de una venta devuelve el stock', async () => {
  const { datos: venta } = await llamar('POST', '/ventas', {
    token: tokens.admin, cuerpo: { metodo_pago: 'TARJETA', items: [{ producto_id: 2, cantidad: 4 }] },
  });
  const stockVenta = (await llamar('GET', '/productos/2', { token: tokens.admin })).datos.stock;
  const r = await llamar('POST', `/ventas/${venta.id}/anular`, { token: tokens.admin, cuerpo: { motivo: 'Error de digitación' } });
  assert.equal(r.status, 200);
  assert.equal(r.datos.estado, 'ANULADA');
  assert.equal((await llamar('GET', '/productos/2', { token: tokens.admin })).datos.stock, stockVenta + 4);
  assert.equal((await llamar('POST', `/ventas/${venta.id}/anular`, { token: tokens.admin, cuerpo: { motivo: 'x' } })).status, 409);
});

test('movimientos de inventario y alertas de reposición', async () => {
  const inicial = await llamar('GET', '/inventario/alertas', { token: tokens.almacen });
  assert.ok(inicial.datos.stockBajo.some((p) => p.id === 12 && p.nivel === 'AGOTADO'));

  const entrada = await llamar('POST', '/inventario/movimientos', {
    token: tokens.almacen, cuerpo: { tipo: 'ENTRADA', producto_id: 12, cantidad: 120, lote: 'L-NUEVO', referencia: 'F001-77' },
  });
  assert.equal(entrada.status, 201);
  assert.equal(entrada.datos.stock, 120);
  const luego = await llamar('GET', '/inventario/alertas', { token: tokens.almacen });
  assert.ok(!luego.datos.stockBajo.some((p) => p.id === 12), 'deja de alertar al reponer');

  const ajuste = await llamar('POST', '/inventario/movimientos', {
    token: tokens.almacen, cuerpo: { tipo: 'AJUSTE', producto_id: 12, stock_real: 118, motivo: 'Conteo físico' },
  });
  assert.equal(ajuste.datos.stock, 118);
  const salidaInvalida = await llamar('POST', '/inventario/movimientos', {
    token: tokens.almacen, cuerpo: { tipo: 'SALIDA', producto_id: 12, cantidad: 500, motivo: 'Merma' },
  });
  assert.equal(salidaInvalida.status, 409);

  const kardex = await llamar('GET', '/inventario/movimientos?producto=12', { token: tokens.almacen });
  assert.deepEqual(kardex.datos.slice(0, 2).map((m) => m.tipo), ['AJUSTE', 'ENTRADA']);
});

test('valida datos de entrada', async () => {
  const r = await llamar('POST', '/productos', { token: tokens.admin, cuerpo: { codigo: 'X1', nombre: 'Prueba', precio_venta: -3 } });
  assert.equal(r.status, 400);
  assert.equal((await llamar('POST', '/clientes', { token: tokens.vendedor, cuerpo: { documento: '123', nombres: 'A' } })).status, 400);
  assert.equal((await llamar('POST', '/productos', { token: tokens.admin, cuerpo: { codigo: 'P0001', nombre: 'Dup', precio_venta: 1 } })).status, 409);
});

test('el panel de control resume ventas y alertas', async () => {
  const { status, datos } = await llamar('GET', '/reportes/dashboard', { token: tokens.vendedor });
  assert.equal(status, 200);
  assert.ok(datos.hoy.ventas >= 1);
  assert.equal(datos.ultimos7.length, 7);
  assert.ok(datos.alertas.total > 0);
});
