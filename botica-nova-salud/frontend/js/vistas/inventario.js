import { api, qs } from '../api.js';
import { html, raw, fechaHora, toast, estadoVacio, exportarCSV } from '../ui.js';

let raiz = null;
let productos = [];
let movimientos = [];

const TIPO_CHIP = { ENTRADA: 'chip-ok', ANULACION: 'chip-ok', VENTA: 'chip-info', SALIDA: 'chip-peligro', AJUSTE: 'chip-aviso' };

export async function render(contenedor) {
  raiz = contenedor;
  productos = await api.get('/productos');
  const preseleccion = new URLSearchParams(location.hash.split('?')[1]).get('producto') || '';

  contenedor.innerHTML = html`
    <div class="grid-inventario">
      <section class="panel">
        <h3>Registrar movimiento</h3>
        <form class="form" id="form-movimiento">
          <div class="segmentado" role="radiogroup" aria-label="Tipo de movimiento">
            <label><input type="radio" name="tipo" value="ENTRADA" checked><span>Ingreso</span></label>
            <label><input type="radio" name="tipo" value="SALIDA"><span>Salida / merma</span></label>
            <label><input type="radio" name="tipo" value="AJUSTE"><span>Ajuste físico</span></label>
          </div>
          <label>Producto <span class="req">*</span>
            <select name="producto_id" required><option value="">Seleccione…</option>
              ${productos.map((p) => raw(html`<option value="${p.id}" ${raw(String(p.id) === preseleccion ? 'selected' : '')}>${p.codigo} — ${p.nombre} (stock ${p.stock})</option>`))}
            </select></label>
          <p class="info-stock muted" id="info-stock"></p>
          <label data-para="ENTRADA SALIDA">Cantidad <span class="req">*</span><input type="number" name="cantidad" min="1" step="1"></label>
          <label data-para="AJUSTE">Stock contado físicamente <span class="req">*</span><input type="number" name="stock_real" min="0" step="1"></label>
          <div class="form-grid" data-para="ENTRADA">
            <label>Lote<input name="lote" maxlength="50"></label>
            <label>Vencimiento<input type="date" name="fecha_vencimiento"></label>
            <label>Costo unit. (S/)<input type="number" name="precio_compra" min="0" step="0.01"></label>
            <label>Guía / factura<input name="referencia" maxlength="60" placeholder="F001-1234"></label>
          </div>
          <label>Motivo <span class="req" data-para="SALIDA AJUSTE">*</span><input name="motivo" maxlength="200" placeholder="Ej.: compra a proveedor, producto dañado, conteo mensual"></label>
          <p class="error form-error" role="alert"></p>
          <button class="btn btn-primario">Registrar</button>
        </form>
      </section>
      <section class="panel">
        <div class="panel-cab"><h3>Kardex / historial de movimientos</h3><button class="btn btn-chico" id="exportar-kardex">Exportar CSV</button></div>
        <form class="filtros filtros-compactos" id="filtros-kardex">
          <select name="producto"><option value="">Todos los productos</option>
            ${productos.map((p) => raw(html`<option value="${p.id}">${p.nombre}</option>`))}</select>
          <select name="tipo"><option value="">Todos los tipos</option>
            ${['ENTRADA', 'SALIDA', 'AJUSTE', 'VENTA', 'ANULACION'].map((t) => raw(html`<option>${t}</option>`))}</select>
          <input type="date" name="desde" aria-label="Desde"><input type="date" name="hasta" aria-label="Hasta">
        </form>
        <div id="tabla-kardex"></div>
      </section>
    </div>`;

  const form = contenedor.querySelector('#form-movimiento');
  const actualizarCampos = () => {
    const tipo = form.tipo.value;
    form.querySelectorAll('[data-para]').forEach((el) => { el.hidden = !el.dataset.para.split(' ').includes(tipo); });
    form.cantidad.required = tipo !== 'AJUSTE';
    form.stock_real.required = tipo === 'AJUSTE';
    form.motivo.required = tipo !== 'ENTRADA';
    const p = productos.find((x) => String(x.id) === form.producto_id.value);
    contenedor.querySelector('#info-stock').textContent = p
      ? `Stock actual: ${p.stock} · mínimo: ${p.stock_minimo} · lote: ${p.lote || '—'} · vence: ${p.fecha_vencimiento || '—'}` : '';
  };
  form.addEventListener('change', actualizarCampos);
  actualizarCampos();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    const err = form.querySelector('.form-error');
    err.textContent = '';
    try {
      const r = await api.post('/inventario/movimientos', datos);
      toast(`Movimiento registrado. Nuevo stock de ${r.nombre}: ${r.stock}.`);
      await render(contenedor);
    } catch (ex) { err.textContent = ex.message; }
  });

  const filtros = contenedor.querySelector('#filtros-kardex');
  filtros.addEventListener('change', cargarKardex);
  if (preseleccion) filtros.producto.value = preseleccion;
  contenedor.querySelector('#exportar-kardex').addEventListener('click', () => exportarCSV('kardex', movimientos, [
    { titulo: 'Fecha', valor: (m) => m.fecha }, { titulo: 'Código', valor: (m) => m.codigo }, { titulo: 'Producto', valor: (m) => m.producto },
    { titulo: 'Tipo', valor: (m) => m.tipo }, { titulo: 'Cantidad', valor: (m) => m.cantidad },
    { titulo: 'Stock anterior', valor: (m) => m.stock_anterior }, { titulo: 'Stock nuevo', valor: (m) => m.stock_nuevo },
    { titulo: 'Motivo', valor: (m) => m.motivo }, { titulo: 'Referencia', valor: (m) => m.referencia }, { titulo: 'Usuario', valor: (m) => m.usuario },
  ]));
  await cargarKardex();
}

export function alActualizarStock() {
  if (raiz?.isConnected) cargarKardex().catch(() => {});
}

async function cargarKardex() {
  const filtros = raiz.querySelector('#filtros-kardex');
  movimientos = await api.get(`/inventario/movimientos${qs(Object.fromEntries(new FormData(filtros)))}`);
  raiz.querySelector('#tabla-kardex').innerHTML = movimientos.length ? html`
    <div class="tabla-scroll alto"><table class="tabla tabla-compacta">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="num">Cant.</th><th class="num">Antes</th><th class="num">Después</th><th>Detalle</th></tr></thead>
      <tbody>${movimientos.map((m) => raw(html`<tr>
        <td>${fechaHora(m.fecha)}</td><td>${m.producto}</td>
        <td><span class="chip ${TIPO_CHIP[m.tipo]}">${m.tipo}</span></td>
        <td class="num ${raw(m.cantidad < 0 ? 'txt-peligro' : 'txt-ok')}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
        <td class="num">${m.stock_anterior}</td><td class="num"><b>${m.stock_nuevo}</b></td>
        <td><small>${m.motivo || ''} ${m.referencia ? `[${m.referencia}]` : ''} · ${m.usuario || ''}</small></td></tr>`))}</tbody>
    </table></div>` : estadoVacio('Sin movimientos para los filtros seleccionados.');
}
