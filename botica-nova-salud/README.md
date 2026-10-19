# Botica Nova Salud: sistema web de inventario y ventas

Trabajo final del curso **Fullstack Developer Software (SENATI)**.
Tema: *Implementación de un software web de gestión de inventario y venta de una botica*.

Es una aplicación web full stack que centraliza el **inventario**, las **ventas** y la **atención al cliente** de la botica "Nova Salud". Incluye actualización del stock **en tiempo real** y **alertas automáticas de reposición y vencimiento**.

| Capa | Tecnología |
|---|---|
| Front-end | HTML5, CSS3 (responsive), JavaScript ES Modules (SPA, sin frameworks) |
| Back-end | Node.js 22 + Express 4 (API REST) |
| Base de datos | SQLite (módulo nativo `node:sqlite`), con transacciones e integridad referencial |
| Seguridad | JWT, contraseñas con bcrypt, roles, validación en servidor, cabeceras CSP |
| Tiempo real | Server-Sent Events (SSE) |
| Pruebas | `node:test` (pruebas de integración del API) |

## Funcionalidades

- **Punto de venta (POS)**: búsqueda por código o nombre (compatible con lector de código de barras), carrito, cálculo de IGV, descuento y vuelto, métodos de pago (efectivo, tarjeta, Yape, Plin), boleta imprimible y atajos de teclado (`F2` nueva venta, `F4` cliente, `F9` cobrar).
- **Productos**: CRUD con laboratorio, presentación, lote, vencimiento, stock mínimo y la marca "requiere receta". La baja es lógica.
- **Inventario**: ingresos de mercadería, salidas y mermas, ajustes por conteo físico, y **kárdex** con trazabilidad (usuario, fecha, stock anterior y nuevo).
- **Alertas**: stock bajo o agotado (con cantidad sugerida para pedir y datos del proveedor) y productos por vencer o vencidos. Se muestran con un contador en vivo y notificaciones.
- **Ventas**: historial con filtros, detalle, reimpresión y **anulación con devolución automática de stock** (solo administrador).
- **Clientes**: registro rápido desde el POS por DNI/RUC e historial de compras.
- **Proveedores y categorías**.
- **Reportes**: ventas por día, por método de pago, por vendedor, productos más vendidos y utilidad estimada. Exportación a CSV e impresión.
- **Usuarios y roles**: `ADMIN`, `VENDEDOR` (caja) y `ALMACEN`.

## Instalación y ejecución

Requisito: **Node.js 22.5 o superior** (incluye SQLite, así que no hace falta instalar un motor de base de datos).

```bash
cd botica-nova-salud/backend
npm install
npm start
```

Luego abra <http://localhost:3000>. La primera vez se crea la base de datos `backend/data/botica.db` con datos de ejemplo.

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | admin123 | Administrador |
| vendedor | vendedor123 | Vendedor / caja |
| almacen | almacen123 | Almacén |

Otros comandos:

```bash
npm run dev    # reinicia automáticamente al editar
npm run seed   # borra y vuelve a crear la base con datos de ejemplo
npm test       # ejecuta las pruebas automáticas del API
```

Variables de entorno opcionales: `PORT`, `DB_FILE`, `JWT_SECRET` (obligatoria en producción), `JWT_EXPIRES_IN` y `DIAS_ALERTA_VENCIMIENTO` (por defecto 60).

## Estructura

```
botica-nova-salud/
├── backend/
│   ├── src/
│   │   ├── server.js        # punto de entrada
│   │   ├── app.js           # configuración de Express, seguridad y rutas
│   │   ├── config.js        # configuración por variables de entorno
│   │   ├── db.js            # esquema SQL y transacciones
│   │   ├── seed.js          # datos de ejemplo
│   │   ├── inventario.js    # único punto que modifica el stock (con kárdex)
│   │   ├── alertas.js       # reglas de stock bajo y vencimiento
│   │   ├── eventos.js       # tiempo real (SSE)
│   │   ├── middleware/auth.js
│   │   └── routes/          # auth, productos, catalogos, clientes, ventas, inventario, reportes, usuarios
│   └── tests/api.test.js
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/                  # app.js (router), api.js, ui.js, vistas/*.js
└── docs/
    ├── INFORME.md           # propuesta de solución, preguntas guía y diagramas
    └── base_datos.sql       # script de la base de datos
```

## API REST (resumen)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión (devuelve JWT) | público |
| GET | `/api/productos?q=&categoria=&estado=` | Listar productos | todos |
| GET | `/api/productos/buscar?q=` | Búsqueda rápida para el POS | todos |
| POST/PUT/DELETE | `/api/productos[/:id]` | Mantenimiento de productos | ADMIN, ALMACEN (eliminar: ADMIN) |
| GET/POST | `/api/inventario/movimientos` | Kárdex y registro de movimientos | lectura: todos; registro: ADMIN, ALMACEN |
| GET | `/api/inventario/alertas` | Alertas de reposición y vencimiento | todos |
| POST | `/api/ventas` | Registrar venta | ADMIN, VENDEDOR |
| GET | `/api/ventas`, `/api/ventas/:id` | Historial y detalle | ADMIN, VENDEDOR (solo las suyas) |
| POST | `/api/ventas/:id/anular` | Anular venta | ADMIN |
| GET/POST/PUT | `/api/clientes` | Clientes | todos |
| GET/POST/PUT/DELETE | `/api/proveedores`, `/api/categorias` | Catálogos | ADMIN, ALMACEN |
| GET | `/api/reportes/dashboard` | Indicadores del panel | todos |
| GET | `/api/reportes/ventas?desde=&hasta=` | Reporte de ventas | ADMIN |
| GET/POST/PUT | `/api/usuarios` | Usuarios | ADMIN |
| GET | `/api/eventos` | Canal de tiempo real (SSE) | todos |

La propuesta completa, con las respuestas a las preguntas guía y los diagramas, está en [`docs/INFORME.md`](docs/INFORME.md).
