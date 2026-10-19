import { api, sesion, onSesionExpirada, puede } from './api.js';
import { html, toast, cerrarModal, cargando } from './ui.js';
import * as panel from './vistas/panel.js';
import * as pos from './vistas/pos.js';
import * as productos from './vistas/productos.js';
import * as inventario from './vistas/inventario.js';
import * as alertas from './vistas/alertas.js';
import * as ventas from './vistas/ventas.js';
import * as clientes from './vistas/clientes.js';
import * as catalogos from './vistas/catalogos.js';
import * as reportes from './vistas/reportes.js';
import * as usuarios from './vistas/usuarios.js';

// Rutas de la SPA y roles que pueden acceder a cada una.
const RUTAS = [
  { ruta: 'panel', titulo: 'Panel de control', icono: '📊', vista: panel, roles: ['ADMIN', 'VENDEDOR', 'ALMACEN'] },
  { ruta: 'pos', titulo: 'Punto de venta', icono: '🛒', vista: pos, roles: ['ADMIN', 'VENDEDOR'] },
  { ruta: 'productos', titulo: 'Productos', icono: '💊', vista: productos, roles: ['ADMIN', 'VENDEDOR', 'ALMACEN'] },
  { ruta: 'inventario', titulo: 'Inventario', icono: '📦', vista: inventario, roles: ['ADMIN', 'ALMACEN'] },
  { ruta: 'alertas', titulo: 'Alertas', icono: '🔔', vista: alertas, roles: ['ADMIN', 'VENDEDOR', 'ALMACEN'] },
  { ruta: 'ventas', titulo: 'Ventas', icono: '🧾', vista: ventas, roles: ['ADMIN', 'VENDEDOR'] },
  { ruta: 'clientes', titulo: 'Clientes', icono: '👥', vista: clientes, roles: ['ADMIN', 'VENDEDOR'] },
  { ruta: 'catalogos', titulo: 'Proveedores y categorías', icono: '🏷️', vista: catalogos, roles: ['ADMIN', 'ALMACEN'] },
  { ruta: 'reportes', titulo: 'Reportes', icono: '📈', vista: reportes, roles: ['ADMIN'] },
  { ruta: 'usuarios', titulo: 'Usuarios', icono: '🔐', vista: usuarios, roles: ['ADMIN'] },
];
const ROL_TEXTO = { ADMIN: 'Administrador', VENDEDOR: 'Vendedor / Caja', ALMACEN: 'Almacén' };

const $ = (id) => document.getElementById(id);
let rutaActual = null;
let eventos = null;

const usuario = () => sesion.get()?.usuario;
const rutasPermitidas = () => RUTAS.filter((r) => r.roles.includes(usuario()?.rol));

function mostrarLogin() {
  eventos?.close();
  $('vista-app').hidden = true;
  $('vista-login').hidden = false;
  $('form-login').usuario.focus();
}

function mostrarApp() {
  const u = usuario();
  $('vista-login').hidden = true;
  $('vista-app').hidden = false;
  $('usuario-actual').innerHTML = html`<b>${u.nombre}</b><small>${ROL_TEXTO[u.rol]}</small>`;
  $('menu').innerHTML = rutasPermitidas().map((r) => html`
    <a href="#/${r.ruta}" data-ruta="${r.ruta}"><span aria-hidden="true">${r.icono}</span> ${r.titulo}</a>`).join('');
  conectarEventos();
  actualizarBadge();
  navegar();
}

async function navegar() {
  if (!usuario()) return mostrarLogin();
  const permitidas = rutasPermitidas();
  const nombre = location.hash.replace('#/', '').split('?')[0] || permitidas[0].ruta;
  const destino = permitidas.find((r) => r.ruta === nombre);
  if (!destino) { location.hash = `#/${permitidas[0].ruta}`; return; }

  rutaActual?.vista.salir?.();
  rutaActual = destino;
  cerrarModal();
  document.body.classList.remove('menu-abierto');
  $('titulo-vista').textContent = destino.titulo;
  document.title = `${destino.titulo} | Nova Salud`;
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === destino.ruta));

  const contenedor = $('vista');
  contenedor.innerHTML = cargando();
  try {
    await destino.vista.render(contenedor);
  } catch (err) {
    contenedor.innerHTML = html`<div class="vacio error">No se pudo cargar la vista: ${err.message}</div>`;
  }
}

async function actualizarBadge(total) {
  if (total === undefined) {
    try { total = (await api.get('/inventario/alertas')).total; } catch { return; }
  }
  const b = $('badge-alertas');
  b.textContent = total;
  b.hidden = !total;
}

// Tiempo real: el servidor envía eventos cuando cambia el stock.
function conectarEventos() {
  eventos?.close();
  eventos = new EventSource(`/api/eventos?token=${encodeURIComponent(sesion.get().token)}`);
  const estado = $('estado-conexion');
  eventos.addEventListener('conectado', () => { estado.classList.remove('off'); estado.textContent = '● En vivo'; });
  eventos.onerror = () => { estado.classList.add('off'); estado.textContent = '● Reconectando…'; };
  eventos.addEventListener('stock', (e) => {
    const datos = JSON.parse(e.data);
    const anterior = Number($('badge-alertas').textContent) || 0;
    actualizarBadge(datos.alertas.total);
    if (datos.alertas.total > anterior) toast('Nueva alerta de inventario: revise productos con stock bajo.', 'aviso');
    rutaActual?.vista.alActualizarStock?.(datos);
  });
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const boton = f.querySelector('button[type=submit]');
  boton.disabled = true;
  $('login-error').textContent = '';
  try {
    const datos = await api.post('/auth/login', { usuario: f.usuario.value.trim(), password: f.password.value });
    sesion.set(datos);
    f.reset();
    if (!location.hash) location.hash = '#/panel';
    mostrarApp();
  } catch (err) {
    $('login-error').textContent = err.message;
  } finally {
    boton.disabled = false;
  }
});

$('btn-salir').addEventListener('click', () => {
  sesion.limpiar();
  location.hash = '';
  mostrarLogin();
});
$('btn-menu').addEventListener('click', () => document.body.classList.toggle('menu-abierto'));

onSesionExpirada(() => {
  sesion.limpiar();
  toast('Su sesión expiró. Ingrese nuevamente.', 'error');
  mostrarLogin();
});

window.addEventListener('hashchange', navegar);

// Atajos de teclado para agilizar la atención.
document.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && puede('ADMIN', 'VENDEDOR')) { e.preventDefault(); location.hash = '#/pos'; }
});

if (usuario()) mostrarApp(); else mostrarLogin();
