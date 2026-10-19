import { api, qs, puede } from '../api.js';
import { html, raw, soles, fechaCorta, toast, modalFormulario, confirmar, estadoVacio, exportarCSV } from '../ui.js';

let raiz = null;
let filas = [];
let categorias = [];
let proveedores = [];

const ESTADO_CHIP = { NORMAL: 'chip-ok', BAJO: 'chip-aviso', AGOTADO: 'chip-peligro' };

export async function render(contenedor) {
  raiz = contenedor;
  [categorias, proveedores] = await Promise.all([api.get('/categorias'), api.get('/proveedores')]);
  const filtroEstado = new URLSearchParams(location.hash.split('?')[1]).get('estado') || '';
  const editable = puede('ADMIN', 'ALMACEN');

  contenedor.innerHTML = html`
    <form class="filtros" id="filtros-productos">
      <label class="crece">Buscar<input type="search" name="q" placeholder="Nombre, código o laboratorio"></label>
      <label>Categoría<select name="categoria"><option value="">Todas</option>
        ${categorias.map((c) => raw(html`<option value="${c.id}">${c.nombre}</option>`))}</select></label>
      <label>Stock<select name="estado">
        ${[['', 'Todos'], ['NORMAL', 'Normal'], ['BAJO', 'Bajo'], ['AGOTADO', 'Agotado']].map(([v, t]) =>
          raw(html`<option value="${v}" ${raw(v === filtroEstado ? 'selected' : '')}>${t}</option>`))}</select></label>
      ${raw(puede('ADMIN') ? '<label class="check"><input type="checkbox" name="inactivos" value="1"> Ver inactivos</label>' : '')}
      <button type="button" class="btn" id="exportar-productos">Exportar CSV</button>
      ${raw(editable ? '<button type="button" class="btn btn-primario" id="nuevo-producto">+ Nuevo producto</button>' : '')}
    </form>
    <section class="panel"><div id="tabla-productos"></div></section>`;

  const form = contenedor.querySelector('#filtros-productos');
  let t;
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(cargar, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  contenedor.querySelector('#nuevo-producto')?.addEventListener('click', () => editar());
  contenedor.querySelector('#exportar-productos').addEventListener('click', () => exportarCSV('productos', filas, [
    { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Nombre', valor: (p) => p.nombre },
    { titulo: 'Categoría', valor: (p) => p.categoria }, { titulo: 'Laboratorio', valor: (p) => p.laboratorio },
    { titulo: 'Precio venta', valor: (p) => p.precio_venta.toFixed(2) }, { titulo: 'Stock', valor: (p) => p.stock },
    { titulo: 'Stock mínimo', valor: (p) => p.stock_minimo }, { titulo: 'Vencimiento', valor: (p) => p.fecha_vencimiento },
  ]));
  contenedor.querySelector('#tabla-productos').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-accion]');
    if (!b) return;
    const p = filas.find((x) => x.id === Number(b.dataset.id));
    try {
      if (b.dataset.accion === 'editar') editar(p);
      if (b.dataset.accion === 'activar') {
        await api.post(`/productos/${p.id}/activar`);
        toast('Producto reactivado.');
        cargar();
      }
      if (b.dataset.accion === 'eliminar' && await confirmar(`¿Desactivar "${p.nombre}"? No aparecerá en ventas pero se conserva su historial.`, { peligro: true, boton: 'Desactivar' })) {
        await api.del(`/productos/${p.id}`);
        toast('Producto desactivado.');
        cargar();
      }
    } catch (err) { toast(err.message, 'error'); }
  });
  await cargar();
}

export function alActualizarStock() {
  if (raiz?.isConnected) cargar().catch(() => {});
}

async function cargar() {
  const form = raiz.querySelector('#filtros-productos');
  filas = await api.get(`/productos${qs(Object.fromEntries(new FormData(form)))}`);
  const hoy = new Date().toISOString().slice(0, 10);
  const editable = puede('ADMIN', 'ALMACEN');
  raiz.querySelector('#tabla-productos').innerHTML = filas.length ? html`
    <p class="resumen">${filas.length} productos</p>
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="num">P. venta</th><th class="num">Stock</th><th class="num">Mín.</th><th>Vence</th><th>Estado</th>${raw(editable ? '<th></th>' : '')}</tr></thead>
      <tbody>${filas.map((p) => {
        const vencido = p.fecha_vencimiento && p.fecha_vencimiento < hoy;
        return raw(html`<tr class="${raw(p.activo ? '' : 'inactivo')}">
          <td>${p.codigo}</td>
          <td><b>${p.nombre}</b> ${raw(p.requiere_receta ? '<span class="chip chip-aviso" title="Requiere receta">Rx</span>' : '')}<small class="muted">${p.presentacion || ''} · ${p.laboratorio || ''}</small></td>
          <td>${p.categoria || '—'}</td><td class="num">${soles(p.precio_venta)}</td>
          <td class="num"><b>${p.stock}</b></td><td class="num">${p.stock_minimo}</td>
          <td class="${raw(vencido ? 'txt-peligro' : '')}">${fechaCorta(p.fecha_vencimiento)}</td>
          <td><span class="chip ${ESTADO_CHIP[p.estado_stock]}">${p.activo ? p.estado_stock : 'INACTIVO'}</span></td>
          ${raw(editable ? html`<td class="acciones">
            <button class="btn btn-chico" data-accion="editar" data-id="${p.id}">Editar</button>
            ${raw(puede('ADMIN') ? html`<button class="btn btn-chico ${raw(p.activo ? 'btn-peligro-suave' : '')}" data-accion="${p.activo ? 'eliminar' : 'activar'}" data-id="${p.id}">${p.activo ? 'Desactivar' : 'Activar'}</button>` : '')}
          </td>` : '')}</tr>`);
      })}</tbody>
    </table></div>` : estadoVacio('No se encontraron productos.');
}

function editar(p) {
  const nuevo = !p;
  const campos = [
    { nombre: 'codigo', etiqueta: 'Código', requerido: true, maxlength: 30 },
    { nombre: 'nombre', etiqueta: 'Nombre comercial', requerido: true, maxlength: 150, ancho: 'span-2' },
    { nombre: 'laboratorio', etiqueta: 'Laboratorio', maxlength: 100 },
    { nombre: 'presentacion', etiqueta: 'Presentación', maxlength: 100, placeholder: 'Caja x 100 tabletas' },
    { nombre: 'categoria_id', etiqueta: 'Categoría', tipo: 'select', opciones: categorias.map((c) => ({ valor: c.id, texto: c.nombre })) },
    { nombre: 'proveedor_id', etiqueta: 'Proveedor', tipo: 'select', opciones: proveedores.map((c) => ({ valor: c.id, texto: c.razon_social })) },
    { nombre: 'precio_compra', etiqueta: 'Precio compra (S/)', tipo: 'number', min: 0, step: '0.01', valor: 0 },
    { nombre: 'precio_venta', etiqueta: 'Precio venta (S/)', tipo: 'number', min: 0.01, step: '0.01', requerido: true },
    ...(nuevo ? [{ nombre: 'stock', etiqueta: 'Stock inicial', tipo: 'number', min: 0, step: 1, valor: 0 }] : []),
    { nombre: 'stock_minimo', etiqueta: 'Stock mínimo (alerta)', tipo: 'number', min: 0, step: 1, valor: 5, requerido: true },
    { nombre: 'lote', etiqueta: 'Lote', maxlength: 50 },
    { nombre: 'fecha_vencimiento', etiqueta: 'Fecha de vencimiento', tipo: 'date' },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 500, ancho: 'span-3' },
    { nombre: 'requiere_receta', etiqueta: 'Requiere receta médica', tipo: 'checkbox', ancho: 'span-3' },
  ];
  modalFormulario(nuevo ? 'Nuevo producto' : `Editar ${p.nombre}`, campos, p || {}, async (datos) => {
    if (nuevo) await api.post('/productos', datos);
    else await api.put(`/productos/${p.id}`, datos);
    toast(nuevo ? 'Producto registrado.' : 'Producto actualizado.');
    cargar();
  }, { ancho: 'muy-ancho' });
}
