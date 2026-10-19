import { api } from '../api.js';
import { html, raw, soles, toast, abrirModal, cerrarModal, modalFormulario, estadoVacio } from '../ui.js';
import { verBoleta } from './ventas.js';

// Punto de venta optimizado para atender rápido: búsqueda por código/nombre, teclado, cálculo de vuelto.
const estado = { carrito: [], cliente: null, resultados: [] };
let raiz = null;
let temporizador = null;

export async function render(contenedor) {
  raiz = contenedor;
  contenedor.innerHTML = html`
    <div class="pos">
      <section class="panel pos-busqueda">
        <label class="buscador">
          <span class="sr-only">Buscar producto</span>
          <input id="pos-buscar" type="search" placeholder="Escanee el código o escriba el nombre del producto…" autocomplete="off">
        </label>
        <div id="pos-resultados" class="pos-resultados">${raw(estadoVacio('Busque un producto para agregarlo a la venta.'))}</div>
      </section>
      <section class="panel pos-carrito">
        <div class="pos-cliente" id="pos-cliente"></div>
        <div class="tabla-scroll"><table class="tabla tabla-compacta">
          <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Importe</th><th></th></tr></thead>
          <tbody id="pos-items"></tbody>
        </table></div>
        <div class="pos-totales" id="pos-totales"></div>
        <form id="pos-pago" class="pos-pago">
          <div class="metodos" role="radiogroup" aria-label="Método de pago">
            ${raw(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'].map((m, i) => html`
              <label class="metodo"><input type="radio" name="metodo" value="${m}" ${raw(i === 0 ? 'checked' : '')}><span>${m}</span></label>`).join(''))}
          </div>
          <div class="pago-fila">
            <label>Descuento (S/)<input name="descuento" type="number" min="0" step="0.10" value="0"></label>
            <label id="campo-recibido">Recibido (S/)<input name="recibido" type="number" min="0" step="0.10" placeholder="0.00"></label>
            <div class="vuelto">Vuelto<b id="pos-vuelto">S/ 0.00</b></div>
          </div>
          <div class="pago-botones">
            <button type="button" class="btn" id="pos-cancelar">Cancelar</button>
            <button type="submit" class="btn btn-primario btn-grande" id="pos-cobrar">Cobrar (F9)</button>
          </div>
        </form>
      </section>
    </div>`;

  const buscar = contenedor.querySelector('#pos-buscar');
  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => buscarProductos(buscar.value), 200);
  });
  // Enter agrega el primer resultado (útil con lector de código de barras).
  buscar.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(temporizador);
    await buscarProductos(buscar.value);
    const exacto = estado.resultados.find((p) => p.codigo.toLowerCase() === buscar.value.trim().toLowerCase());
    const elegido = exacto || (estado.resultados.length === 1 ? estado.resultados[0] : null);
    if (elegido) { agregar(elegido); buscar.value = ''; buscar.focus(); }
  });

  contenedor.querySelector('#pos-resultados').addEventListener('click', (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila) return;
    const p = estado.resultados.find((x) => x.id === Number(fila.dataset.id));
    if (p) { agregar(p); buscar.focus(); }
  });

  const items = contenedor.querySelector('#pos-items');
  items.addEventListener('change', (e) => {
    if (!e.target.matches('[data-cant]')) return;
    const item = estado.carrito.find((i) => i.id === Number(e.target.dataset.cant));
    const cant = Math.floor(Number(e.target.value));
    if (!cant || cant < 1) quitar(item.id);
    else if (cant > item.stock) { toast(`Solo hay ${item.stock} unidades de ${item.nombre}.`, 'error'); item.cantidad = item.stock; }
    else item.cantidad = cant;
    pintar();
  });
  items.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar]');
    if (b) quitar(Number(b.dataset.quitar));
  });

  const pago = contenedor.querySelector('#pos-pago');
  pago.addEventListener('input', pintarTotales);
  pago.addEventListener('submit', (e) => { e.preventDefault(); cobrar(); });
  contenedor.querySelector('#pos-cancelar').addEventListener('click', limpiar);
  contenedor.querySelector('#pos-cliente').addEventListener('click', (e) => {
    if (e.target.closest('[data-buscar-cliente]')) elegirCliente();
    if (e.target.closest('[data-quitar-cliente]')) { estado.cliente = null; pintarCliente(); }
  });

  document.addEventListener('keydown', atajos);
  pintar();
  pintarCliente();
  buscar.focus();
}

export function salir() {
  document.removeEventListener('keydown', atajos);
}

function atajos(e) {
  if (e.key === 'F9') { e.preventDefault(); cobrar(); }
  if (e.key === 'F4') { e.preventDefault(); elegirCliente(); }
}

// Actualiza el stock mostrado cuando otra caja vende o almacén registra un ingreso.
export function alActualizarStock({ productos }) {
  for (const p of productos) {
    const item = estado.carrito.find((i) => i.id === p.id);
    if (item) {
      item.stock = p.stock;
      if (item.cantidad > p.stock) {
        toast(`El stock de ${item.nombre} cambió a ${p.stock}.`, 'aviso');
        item.cantidad = p.stock;
        if (!item.cantidad) estado.carrito = estado.carrito.filter((i) => i.id !== p.id);
      }
    }
    const r = estado.resultados.find((x) => x.id === p.id);
    if (r) r.stock = p.stock;
  }
  if (raiz?.isConnected) { pintar(); pintarResultados(); }
}

async function buscarProductos(q) {
  if (!q.trim()) { estado.resultados = []; pintarResultados(); return; }
  try {
    estado.resultados = await api.get(`/productos/buscar?q=${encodeURIComponent(q.trim())}`);
    pintarResultados();
  } catch (err) { toast(err.message, 'error'); }
}

function pintarResultados() {
  const cont = raiz.querySelector('#pos-resultados');
  if (!cont) return;
  if (!estado.resultados.length) {
    cont.innerHTML = estadoVacio(raiz.querySelector('#pos-buscar').value ? 'No se encontraron productos.' : 'Busque un producto para agregarlo a la venta.');
    return;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  cont.innerHTML = estado.resultados.map((p) => {
    const vencido = p.fecha_vencimiento && p.fecha_vencimiento < hoy;
    const deshabilitado = !p.stock || vencido;
    return html`<button type="button" class="producto-item ${raw(deshabilitado ? 'deshabilitado' : '')}" data-id="${p.id}" ${raw(deshabilitado ? 'disabled' : '')}>
      <span><b>${p.nombre}</b><small>${p.codigo} · ${p.presentacion || ''} · ${p.laboratorio || ''}</small>
        ${raw(p.requiere_receta ? '<span class="chip chip-aviso">Requiere receta</span>' : '')}
        ${raw(vencido ? '<span class="chip chip-peligro">Vencido</span>' : '')}</span>
      <span class="producto-precio"><b>${soles(p.precio_venta)}</b>
        <small class="${raw(p.stock === 0 ? 'txt-peligro' : p.estado_stock === 'BAJO' ? 'txt-aviso' : '')}">Stock: ${p.stock}</small></span>
    </button>`;
  }).join('');
}

function agregar(p) {
  const item = estado.carrito.find((i) => i.id === p.id);
  if ((item?.cantidad || 0) + 1 > p.stock) { toast(`Stock insuficiente de ${p.nombre} (${p.stock}).`, 'error'); return; }
  if (item) item.cantidad += 1;
  else {
    estado.carrito.push({ id: p.id, nombre: p.nombre, codigo: p.codigo, precio: p.precio_venta, stock: p.stock, cantidad: 1 });
    if (p.requiere_receta) toast(`${p.nombre} requiere receta médica. Solicítela al cliente.`, 'aviso');
  }
  pintar();
}

function quitar(id) {
  estado.carrito = estado.carrito.filter((i) => i.id !== id);
  pintar();
}

const totalBruto = () => Math.round(estado.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100;

function pintar() {
  const tbody = raiz.querySelector('#pos-items');
  if (!tbody) return;
  tbody.innerHTML = estado.carrito.length
    ? estado.carrito.map((i) => html`<tr>
        <td><b>${i.nombre}</b><small class="muted"> ${i.codigo}</small></td>
        <td class="num"><input class="input-cant" type="number" min="1" max="${i.stock}" value="${i.cantidad}" data-cant="${i.id}" aria-label="Cantidad"></td>
        <td class="num">${soles(i.precio)}</td>
        <td class="num">${soles(i.precio * i.cantidad)}</td>
        <td><button type="button" class="btn-icono" data-quitar="${i.id}" aria-label="Quitar">✕</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="vacio">El carrito está vacío.</td></tr>';
  pintarTotales();
}

function pintarTotales() {
  const form = raiz.querySelector('#pos-pago');
  const bruto = totalBruto();
  const descuento = Math.min(Math.max(Number(form.descuento.value) || 0, 0), bruto);
  const total = Math.round((bruto - descuento) * 100) / 100;
  const subtotal = Math.round((total / 1.18) * 100) / 100;
  raiz.querySelector('#pos-totales').innerHTML = html`
    <div><span>Op. gravada</span><span>${soles(subtotal)}</span></div>
    <div><span>IGV (18%)</span><span>${soles(total - subtotal)}</span></div>
    ${raw(descuento ? html`<div><span>Descuento</span><span>- ${soles(descuento)}</span></div>` : '')}
    <div class="total"><span>TOTAL</span><span>${soles(total)}</span></div>`;
  const efectivo = form.metodo.value === 'EFECTIVO';
  raiz.querySelector('#campo-recibido').hidden = !efectivo;
  const recibido = Number(form.recibido.value) || 0;
  const vuelto = efectivo && recibido >= total ? recibido - total : 0;
  raiz.querySelector('#pos-vuelto').textContent = soles(vuelto);
  raiz.querySelector('#pos-cobrar').disabled = !estado.carrito.length;
  return { total, descuento, efectivo, recibido };
}

function pintarCliente() {
  const c = raiz.querySelector('#pos-cliente');
  c.innerHTML = estado.cliente
    ? html`<span>👤 <b>${estado.cliente.nombres}</b> <small class="muted">${estado.cliente.documento}</small></span>
        <button type="button" class="btn btn-chico" data-quitar-cliente>Quitar</button>`
    : '<span class="muted">Cliente: público general</span><button type="button" class="btn btn-chico" data-buscar-cliente>Asignar cliente (F4)</button>';
}

function elegirCliente() {
  const cuerpo = abrirModal('Asignar cliente', `
    <form class="form" id="form-buscar-cliente">
      <label>DNI o RUC del cliente<input name="documento" required pattern="\\d{8}|\\d{11}" inputmode="numeric" maxlength="11" placeholder="8 u 11 dígitos"></label>
      <p class="error form-error" role="alert"></p>
      <div class="form-acciones"><button type="button" class="btn" data-cerrar-modal>Cancelar</button><button class="btn btn-primario">Buscar</button></div>
    </form>`);
  cuerpo.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const documento = e.target.documento.value.trim();
    try {
      estado.cliente = await api.get(`/clientes/documento/${encodeURIComponent(documento)}`);
      pintarCliente();
      cerrarModal();
      raiz.querySelector('#pos-buscar').focus();
    } catch {
      // Cliente nuevo: registro rápido sin salir del punto de venta.
      modalFormulario('Registrar cliente nuevo', [
        { nombre: 'documento', etiqueta: 'DNI / RUC', requerido: true, patron: '\\d{8}|\\d{11}', maxlength: 11 },
        { nombre: 'nombres', etiqueta: 'Nombres / Razón social', requerido: true, maxlength: 150 },
        { nombre: 'telefono', etiqueta: 'Teléfono', maxlength: 20 },
        { nombre: 'email', etiqueta: 'Correo', tipo: 'email', maxlength: 120 },
      ], { documento }, async (datos) => {
        estado.cliente = await api.post('/clientes', datos);
        pintarCliente();
        toast('Cliente registrado.');
      });
    }
  });
}

async function cobrar() {
  if (!estado.carrito.length || !raiz?.isConnected) return;
  const form = raiz.querySelector('#pos-pago');
  const { total, descuento, efectivo, recibido } = pintarTotales();
  if (efectivo && form.recibido.value && recibido < total) {
    toast('El monto recibido es menor al total.', 'error');
    form.recibido.focus();
    return;
  }
  const boton = raiz.querySelector('#pos-cobrar');
  boton.disabled = true;
  try {
    const venta = await api.post('/ventas', {
      cliente_id: estado.cliente?.id,
      metodo_pago: form.metodo.value,
      descuento,
      monto_recibido: efectivo ? (recibido || total) : undefined,
      items: estado.carrito.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
    });
    toast(`Venta ${venta.numero} registrada por ${soles(venta.total)}.`);
    limpiar();
    verBoleta(venta);
  } catch (err) {
    toast(err.message, 'error');
    boton.disabled = false;
  }
}

function limpiar() {
  estado.carrito = [];
  estado.cliente = null;
  estado.resultados = [];
  const form = raiz.querySelector('#pos-pago');
  form.reset();
  raiz.querySelector('#pos-buscar').value = '';
  pintar();
  pintarCliente();
  pintarResultados();
  raiz.querySelector('#pos-buscar').focus();
}
