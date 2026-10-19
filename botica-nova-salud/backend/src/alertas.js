const config = require('./config');

// Módulo de alertas: productos con stock bajo/agotado y productos próximos a vencer o vencidos.
function obtenerAlertas(db) {
  const stockBajo = db.prepare(`
    SELECT p.id, p.codigo, p.nombre, p.stock, p.stock_minimo, p.presentacion,
           pr.razon_social AS proveedor, pr.telefono AS proveedor_telefono,
           CASE WHEN p.stock = 0 THEN 'AGOTADO' ELSE 'STOCK_BAJO' END AS nivel,
           MAX(p.stock_minimo * 2 - p.stock, 0) AS cantidad_sugerida
    FROM productos p LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
    WHERE p.activo = 1 AND p.stock <= p.stock_minimo
    ORDER BY p.stock * 1.0 / MAX(p.stock_minimo, 1), p.nombre`).all();

  const porVencer = db.prepare(`
    SELECT p.id, p.codigo, p.nombre, p.stock, p.lote, p.fecha_vencimiento,
           CAST(julianday(p.fecha_vencimiento) - julianday(date('now', 'localtime')) AS INTEGER) AS dias_restantes,
           CASE WHEN p.fecha_vencimiento < date('now', 'localtime') THEN 'VENCIDO' ELSE 'POR_VENCER' END AS nivel
    FROM productos p
    WHERE p.activo = 1 AND p.stock > 0 AND p.fecha_vencimiento IS NOT NULL
      AND p.fecha_vencimiento <= date('now', 'localtime', ?)
    ORDER BY p.fecha_vencimiento`).all(`+${config.diasAlertaVencimiento} days`);

  return {
    stockBajo,
    porVencer,
    total: stockBajo.length + porVencer.length,
  };
}

module.exports = { obtenerAlertas };
