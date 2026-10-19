const bcrypt = require('bcryptjs');

function fechaEnDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Carga datos iniciales solo si la base de datos está vacía.
function sembrarDatos(db) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total > 0) return false;

  const insUsuario = db.prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)');
  insUsuario.run('Administrador General', 'admin', bcrypt.hashSync('admin123', 10), 'ADMIN');
  insUsuario.run('María Quispe (Caja)', 'vendedor', bcrypt.hashSync('vendedor123', 10), 'VENDEDOR');
  insUsuario.run('Luis Torres (Almacén)', 'almacen', bcrypt.hashSync('almacen123', 10), 'ALMACEN');

  const categorias = ['Analgésicos', 'Antibióticos', 'Antigripales', 'Vitaminas y suplementos',
    'Gastrointestinales', 'Cuidado personal', 'Material médico', 'Dermatológicos'];
  const insCategoria = db.prepare('INSERT INTO categorias (nombre) VALUES (?)');
  categorias.forEach((c) => insCategoria.run(c));

  const insProveedor = db.prepare('INSERT INTO proveedores (ruc, razon_social, telefono, email) VALUES (?, ?, ?, ?)');
  insProveedor.run('20100055237', 'Droguería Alfaro S.A.C.', '014567890', 'ventas@alfaro.pe');
  insProveedor.run('20512345678', 'Distribuidora Farmacéutica del Perú S.A.', '016543210', 'pedidos@difarperu.pe');
  insProveedor.run('20498765432', 'Medifarma Distribuciones E.I.R.L.', '017778899', 'contacto@medifarma.pe');

  // [codigo, nombre, laboratorio, presentación, categoría, proveedor, p.compra, p.venta, stock, mínimo, días p/vencer, receta]
  const productos = [
    ['P0001', 'Paracetamol 500 mg', 'Genfar', 'Caja x 100 tabletas', 1, 1, 0.08, 0.20, 850, 200, 540, 0],
    ['P0002', 'Ibuprofeno 400 mg', 'Portugal', 'Caja x 100 tabletas', 1, 1, 0.12, 0.30, 420, 150, 400, 0],
    ['P0003', 'Naproxeno 550 mg', 'Medifarma', 'Caja x 100 tabletas', 1, 3, 0.25, 0.60, 90, 100, 300, 0],
    ['P0004', 'Amoxicilina 500 mg', 'Genfar', 'Caja x 100 cápsulas', 2, 2, 0.30, 0.80, 300, 100, 365, 1],
    ['P0005', 'Azitromicina 500 mg', 'Portugal', 'Caja x 3 tabletas', 2, 2, 3.50, 9.00, 12, 20, 200, 1],
    ['P0006', 'Ciprofloxacino 500 mg', 'AC Farma', 'Caja x 100 tabletas', 2, 2, 0.35, 1.00, 150, 80, 45, 1],
    ['P0007', 'Panadol Antigripal NF', 'GSK', 'Caja x 12 tabletas', 3, 1, 6.00, 9.50, 60, 30, 500, 0],
    ['P0008', 'Next Antigripal', 'Medifarma', 'Sobre x 4 tabletas', 3, 3, 1.20, 2.50, 8, 40, 420, 0],
    ['P0009', 'Vitamina C 1 g efervescente', 'Redoxon', 'Tubo x 10 tabletas', 4, 1, 12.00, 18.90, 45, 15, 600, 0],
    ['P0010', 'Complejo B', 'Farmindustria', 'Caja x 100 tabletas', 4, 3, 0.15, 0.40, 500, 100, 25, 0],
    ['P0011', 'Omeprazol 20 mg', 'Genfar', 'Caja x 100 cápsulas', 5, 2, 0.10, 0.30, 700, 150, 380, 0],
    ['P0012', 'Sal de Andrews', 'GSK', 'Sobre x 5 g', 5, 1, 0.60, 1.20, 0, 50, 700, 0],
    ['P0013', 'Suero oral Electrolit 625 ml', 'Pisa', 'Botella', 5, 2, 4.50, 7.50, 36, 24, 250, 0],
    ['P0014', 'Alcohol medicinal 70° 1 L', 'Alkofarma', 'Frasco', 6, 3, 6.50, 11.00, 25, 10, 900, 0],
    ['P0015', 'Jabón antibacterial Protex', 'Colgate', 'Unidad 110 g', 6, 3, 2.80, 4.50, 40, 15, 800, 0],
    ['P0016', 'Mascarilla KN95', 'Valmy', 'Unidad', 7, 1, 0.70, 2.00, 300, 100, 1000, 0],
    ['P0017', 'Jeringa descartable 5 ml', 'BD', 'Unidad', 7, 2, 0.25, 0.70, 180, 50, 1200, 0],
    ['P0018', 'Gasa estéril 10x10', 'Cuidado Médico', 'Sobre x 5', 7, 2, 0.50, 1.20, 15, 30, 900, 0],
    ['P0019', 'Clotrimazol crema 1%', 'Portugal', 'Tubo 20 g', 8, 2, 2.20, 5.00, 22, 10, 15, 0],
    ['P0020', 'Hidrocortisona crema 1%', 'Medifarma', 'Tubo 15 g', 8, 3, 3.00, 7.00, 18, 10, -5, 1],
  ];
  const insProducto = db.prepare(`INSERT INTO productos
    (codigo, nombre, laboratorio, presentacion, categoria_id, proveedor_id, precio_compra, precio_venta,
     stock, stock_minimo, lote, fecha_vencimiento, requiere_receta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insMov = db.prepare(`INSERT INTO movimientos_inventario
    (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) VALUES (?, 'ENTRADA', ?, 0, ?, 'Inventario inicial', 1)`);
  productos.forEach((p, i) => {
    const [codigo, nombre, lab, pres, cat, prov, pc, pv, stock, min, dias, receta] = p;
    const { lastInsertRowid } = insProducto.run(codigo, nombre, lab, pres, cat, prov, pc, pv, stock, min,
      `L${2026}${String(i + 1).padStart(3, '0')}`, fechaEnDias(dias), receta);
    if (stock > 0) insMov.run(lastInsertRowid, stock, stock);
  });

  const insCliente = db.prepare('INSERT INTO clientes (documento, nombres, telefono, email) VALUES (?, ?, ?, ?)');
  insCliente.run('00000000', 'Cliente varios', null, null);
  insCliente.run('45678912', 'Juan Pérez Rojas', '987654321', 'juan.perez@mail.com');
  insCliente.run('72345678', 'Ana Lucía Mendoza', '912345678', null);

  return true;
}

module.exports = { sembrarDatos };

// Permite reiniciar la base de datos con: npm run seed
if (require.main === module) {
  const fs = require('node:fs');
  const config = require('./config');
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(config.dbFile + ext, { force: true });
  const { abrirBaseDatos } = require('./db');
  const db = abrirBaseDatos();
  sembrarDatos(db);
  console.log(`Base de datos reiniciada con datos de ejemplo en ${config.dbFile}`);
}
