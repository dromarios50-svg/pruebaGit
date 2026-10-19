import { api } from '../api.js';
import { html, raw, soles, fechaHora, toast, abrirModal, modalFormulario, estadoVacio } from '../ui.js';

let raiz = null;
let filas = [];

const CAMPOS = [
  { nombre: 'documento', etiqueta: 'DNI / RUC', requerido: true, patron: '\\d{8}|\\d{11}', maxlength: 11 },
  { nombre: 'nombres', etiqueta: 'Nombres / Razón social', requerido: true, maxlength: 150 },
  { nombre: 'telefono', etiqueta: 'Teléfono', maxlength: 20 },
  { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', maxlength: 120 },
];

export async function render(contenedor) {
  raiz = contenedor;
  contenedor.innerHTML = `
    <form class="filtros" id="filtros-clientes">
      <label class="crece">Buscar<input type="search" name="q" placeholder="Nombre o documento"></label>
      <button type="button" class="btn btn-primario" id="nuevo-cliente">+ Nuevo cliente</button>
    </form>
    <section class="panel"><div id="tabla-clientes"></div></section>`;
  const form = contenedor.querySelector('#filtros-clientes');
  let t;
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(cargar, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  contenedor.querySelector('#nuevo-cliente').addEventListener('click', () => editar());
  contenedor.querySelector('#tabla-clientes').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const c = filas.find((x) => x.id === Number(b.dataset.id));
    if (b.dataset.accion === 'editar') editar(c);
    if (b.dataset.accion === 'compras') verCompras(c);
  });
  await cargar();
}

async function cargar() {
  const q = raiz.querySelector('[name=q]').value.trim();
  filas = await api.get(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  raiz.querySelector('#tabla-clientes').innerHTML = filas.length ? html`
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Documento</th><th>Nombres</th><th>Teléfono</th><th>Correo</th><th class="num">Compras</th><th class="num">Total comprado</th><th>Última compra</th><th></th></tr></thead>
      <tbody>${filas.map((c) => raw(html`<tr>
        <td>${c.documento}</td><td><b>${c.nombres}</b></td><td>${c.telefono || '—'}</td><td>${c.email || '—'}</td>
        <td class="num">${c.compras}</td><td class="num">${soles(c.total_comprado)}</td><td>${fechaHora(c.ultima_compra)}</td>
        <td class="acciones"><button class="btn btn-chico" data-accion="compras" data-id="${c.id}">Historial</button>
          <button class="btn btn-chico" data-accion="editar" data-id="${c.id}">Editar</button></td></tr>`))}</tbody>
    </table></div>` : estadoVacio('No se encontraron clientes.');
}

function editar(c) {
  modalFormulario(c ? 'Editar cliente' : 'Nuevo cliente', CAMPOS, c || {}, async (datos) => {
    if (c) await api.put(`/clientes/${c.id}`, datos);
    else await api.post('/clientes', datos);
    toast('Cliente guardado.');
    cargar();
  });
}

async function verCompras(c) {
  const compras = await api.get(`/clientes/${c.id}/compras`);
  abrirModal(`Historial de ${c.nombres}`, compras.length ? html`
    <div class="tabla-scroll"><table class="tabla tabla-compacta"><thead><tr><th>Boleta</th><th>Fecha</th><th>Método</th><th class="num">Total</th><th>Estado</th></tr></thead>
    <tbody>${compras.map((v) => raw(html`<tr><td>${v.numero}</td><td>${fechaHora(v.fecha)}</td><td>${v.metodo_pago}</td><td class="num">${soles(v.total)}</td><td>${v.estado}</td></tr>`))}</tbody></table></div>`
    : estadoVacio('El cliente aún no registra compras.'), { ancho: 'ancho' });
}
