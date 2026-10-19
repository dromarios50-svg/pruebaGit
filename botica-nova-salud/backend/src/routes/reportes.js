const express = require('express');
const { permitir } = require('../middleware/auth');
const { ruta, fecha, redondear } = require('../utils');
const { obtenerAlertas } = require('../alertas');

module.exports = (db) => {
  const router = express.Router();

  // Indicadores principales para el panel de control.
  router.get('/dashboard', ruta((req, res) => {
    const hoy = db.prepare(`
      SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS monto
      FROM ventas WHERE estado = 'EMITIDA' AND date(fecha) = date('now', 'localtime')`).get();
    const mes = db.prepare(`
      SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS monto
      FROM ventas WHERE estado = 'EMITIDA' AND strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')`).get();
    const inventario = db.prepare(`
      SELECT COUNT(*) AS productos, COALESCE(SUM(stock), 0) AS unidades,
             COALESCE(SUM(stock * precio_compra), 0) AS valor_costo,
             COALESCE(SUM(stock * precio_venta), 0) AS valor_venta
      FROM productos WHERE activo = 1`).get();
    const ultimos7 = db.prepare(`
      WITH RECURSIVE dias(d) AS (
        SELECT date('now', 'localtime', '-6 days') UNION ALL SELECT date(d, '+1 day') FROM dias WHERE d < date('now', 'localtime')
      )
      SELECT dias.d AS fecha, COUNT(v.id) AS ventas, COALESCE(SUM(v.total), 0) AS monto
      FROM dias LEFT JOIN ventas v ON date(v.fecha) = dias.d AND v.estado = 'EMITIDA'
      GROUP BY dias.d ORDER BY dias.d`).all();
    const topProductos = db.prepare(`
      SELECT p.nombre, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS monto
      FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id
      WHERE v.estado = 'EMITIDA' AND date(v.fecha) >= date('now', 'localtime', '-30 days')
      GROUP BY p.id ORDER BY unidades DESC LIMIT 5`).all();
    const alertas = obtenerAlertas(db);

    res.json({
      hoy: { ...hoy, monto: redondear(hoy.monto), ticket_promedio: hoy.ventas ? redondear(hoy.monto / hoy.ventas) : 0 },
      mes: { ...mes, monto: redondear(mes.monto) },
      inventario: { ...inventario, valor_costo: redondear(inventario.valor_costo), valor_venta: redondear(inventario.valor_venta) },
      ultimos7,
      topProductos,
      alertas: {
        total: alertas.total,
        agotados: alertas.stockBajo.filter((a) => a.nivel === 'AGOTADO').length,
        stockBajo: alertas.stockBajo.filter((a) => a.nivel === 'STOCK_BAJO').length,
        porVencer: alertas.porVencer.filter((a) => a.nivel === 'POR_VENCER').length,
        vencidos: alertas.porVencer.filter((a) => a.nivel === 'VENCIDO').length,
      },
    });
  }));

  // Reporte de ventas por rango de fechas (por defecto, el mes actual).
  router.get('/ventas', permitir('ADMIN'), ruta((req, res) => {
    const hoyIso = new Date().toISOString().slice(0, 10);
    const desde = fecha(req.query.desde, 'desde') || `${hoyIso.slice(0, 8)}01`;
    const hasta = fecha(req.query.hasta, 'hasta') || hoyIso;
    const filtro = "v.estado = 'EMITIDA' AND date(v.fecha) BETWEEN ? AND ?";

    const resumen = db.prepare(`SELECT COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS monto, COALESCE(SUM(igv), 0) AS igv,
      COALESCE(AVG(total), 0) AS ticket_promedio FROM ventas v WHERE ${filtro}`).get(desde, hasta);
    const costo = db.prepare(`SELECT COALESCE(SUM(d.cantidad * p.precio_compra), 0) AS costo
      FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id WHERE ${filtro}`).get(desde, hasta);
    const anuladas = db.prepare(`SELECT COUNT(*) AS n FROM ventas v WHERE v.estado = 'ANULADA' AND date(v.fecha) BETWEEN ? AND ?`).get(desde, hasta);

    res.json({
      desde,
      hasta,
      resumen: {
        ventas: resumen.ventas,
        monto: redondear(resumen.monto),
        igv: redondear(resumen.igv),
        ticket_promedio: redondear(resumen.ticket_promedio),
        utilidad_estimada: redondear(resumen.monto / 1.18 - costo.costo),
        anuladas: anuladas.n,
      },
      porDia: db.prepare(`SELECT date(v.fecha) AS fecha, COUNT(*) AS ventas, SUM(v.total) AS monto
        FROM ventas v WHERE ${filtro} GROUP BY date(v.fecha) ORDER BY fecha`).all(desde, hasta),
      porMetodo: db.prepare(`SELECT v.metodo_pago, COUNT(*) AS ventas, SUM(v.total) AS monto
        FROM ventas v WHERE ${filtro} GROUP BY v.metodo_pago ORDER BY monto DESC`).all(desde, hasta),
      porVendedor: db.prepare(`SELECT u.nombre AS vendedor, COUNT(*) AS ventas, SUM(v.total) AS monto
        FROM ventas v JOIN usuarios u ON u.id = v.usuario_id WHERE ${filtro} GROUP BY u.id ORDER BY monto DESC`).all(desde, hasta),
      topProductos: db.prepare(`SELECT p.codigo, p.nombre, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS monto
        FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id
        WHERE ${filtro} GROUP BY p.id ORDER BY unidades DESC LIMIT 10`).all(desde, hasta),
    });
  }));

  return router;
};
