import { api, qs, puede } from '../api.js';
import { html, raw, soles, fechaHora, hoyISO, toast, abrirModal, confirmar, estadoVacio, exportarCSV } from '../ui.js';

let raiz = null;
let filas = [];

export async function render(contenedor) {
  raiz = contenedor;
  const hoy = hoyISO();
  contenedor.innerHTML = html`
    <form class="filtros" id="filtros-ventas">
      <label>Desde<input type="date" name="desde" value="${hoy}"></label>
      <label>Hasta<input type="date" name="hasta" value="${hoy}"></label>
      <label>Estado<select name="estado"><option value="">Todos</option><option>EMITIDA</option><option>ANULADA</option></select></label>
      <label class="crece">Buscar<input type="search" name="q" placeholder="N° boleta, cliente o DNI"></label>
      <button class="btn btn-primario">Filtrar</button>
      <button type="button" class="btn" id="exportar-ventas">Exportar CSV</button>
    </form>
    <section class="panel"><div id="tabla-ventas"></div></section>`;

  const form = contenedor.querySelector('#filtros-ventas');
  form.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
  contenedor.querySelector('#exportar-ventas').addEventListener('click', () => exportarCSV('ventas', filas, [
    { titulo: 'N° boleta', valor: (v) => v.numero }, { titulo: 'Fecha', valor: (v) => v.fecha },
    { titulo: 'Cliente', valor: (v) => v.cliente || 'Público general' }, { titulo: 'Vendedor', valor: (v) => v.vendedor },
    { titulo: 'Método', valor: (v) => v.metodo_pago }, { titulo: 'Total', valor: (v) => v.total.toFixed(2) },
    { titulo: 'Estado', valor: (v) => v.estado },
  ]));
  contenedor.querySelector('#tabla-ventas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ver]');
    if (b) verBoleta(await api.get(`/ventas/${b.dataset.ver}`), { alAnular: cargar });
  });
  await cargar();
}

async function cargar() {
  const form = raiz.querySelector('#filtros-ventas');
  filas = await api.get(`/ventas${qs(Object.fromEntries(new FormData(form)))}`);
  const emitidas = filas.filter((v) => v.estado === 'EMITIDA');
  const total = emitidas.reduce((s, v) => s + v.total, 0);
  raiz.querySelector('#tabla-ventas').innerHTML = filas.length ? html`
    <p class="resumen">${emitidas.length} ventas emitidas · Total ${soles(total)}</p>
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>N° boleta</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Método</th><th class="num">Unid.</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas.map((v) => raw(html`<tr class="${raw(v.estado === 'ANULADA' ? 'anulada' : '')}">
        <td><b>${v.numero}</b></td><td>${fechaHora(v.fecha)}</td><td>${v.cliente || 'Público general'}</td>
        <td>${v.vendedor}</td><td>${v.metodo_pago}</td><td class="num">${v.unidades}</td><td class="num">${soles(v.total)}</td>
        <td><span class="chip ${raw(v.estado === 'ANULADA' ? 'chip-peligro' : 'chip-ok')}">${v.estado}</span></td>
        <td><button class="btn btn-chico" data-ver="${v.id}">Ver</button></td></tr>`))}</tbody>
    </table></div>` : estadoVacio('No hay ventas en el periodo seleccionado.');
}

// Boleta de venta (se puede imprimir en ticketera de 80 mm).
export function verBoleta(v, { alAnular } = {}) {
  const cuerpo = abrirModal(`Boleta ${v.numero}`, html`
    <div class="boleta" id="boleta-imprimible">
      <div class="boleta-cab"><b>BOTICA NOVA SALUD</b><small>RUC 20601234567 · Av. Comercio 123</small>
        <b>BOLETA DE VENTA ELECTRÓNICA</b><b>${v.numero}</b></div>
      <div class="boleta-datos">
        <div>Fecha: ${fechaHora(v.fecha)}</div>
        <div>Cliente: ${v.cliente_nombres || 'Público general'} ${v.cliente_documento ? `(${v.cliente_documento})` : ''}</div>
        <div>Atendido por: ${v.vendedor}</div>
      </div>
      <table class="boleta-items"><thead><tr><th>Cant.</th><th>Descripción</th><th class="num">P.U.</th><th class="num">Importe</th></tr></thead>
        <tbody>${v.items.map((i) => raw(html`<tr><td>${i.cantidad}</td><td>${i.nombre}</td><td class="num">${i.precio_unitario.toFixed(2)}</td><td class="num">${i.subtotal.toFixed(2)}</td></tr>`))}</tbody></table>
      <div class="boleta-totales">
        <div><span>Op. gravada</span><span>${soles(v.subtotal)}</span></div>
        <div><span>IGV 18%</span><span>${soles(v.igv)}</span></div>
        ${raw(v.descuento ? html`<div><span>Descuento</span><span>- ${soles(v.descuento)}</span></div>` : '')}
        <div class="total"><span>TOTAL</span><span>${soles(v.total)}</span></div>
        <div><span>Pago</span><span>${v.metodo_pago}</span></div>
        ${raw(v.metodo_pago === 'EFECTIVO' ? html`<div><span>Recibido</span><span>${soles(v.monto_recibido)}</span></div><div><span>Vuelto</span><span>${soles(v.vuelto)}</span></div>` : '')}
      </div>
      ${raw(v.estado === 'ANULADA' ? html`<p class="sello-anulada">ANULADA: ${v.motivo_anulacion}</p>` : '<p class="boleta-pie">¡Gracias por su compra! Cuide su salud.</p>')}
    </div>
    <div class="form-acciones no-imprimir">
      ${raw(puede('ADMIN') && v.estado === 'EMITIDA' && alAnular ? '<button class="btn btn-peligro" data-anular>Anular venta</button>' : '')}
      <button class="btn" data-cerrar-modal>Cerrar</button>
      <button class="btn btn-primario" data-imprimir>🖨️ Imprimir</button>
    </div>`);

  cuerpo.querySelector('[data-imprimir]').addEventListener('click', () => window.print());
  cuerpo.querySelector('[data-anular]')?.addEventListener('click', async () => {
    const motivo = await confirmar(`Se anulará la venta ${v.numero} y se devolverá el stock de sus productos.`,
      { titulo: 'Anular venta', boton: 'Anular', peligro: true, pedirMotivo: true });
    if (!motivo) return;
    try {
      await api.post(`/ventas/${v.id}/anular`, { motivo });
      toast(`Venta ${v.numero} anulada.`);
      alAnular?.();
    } catch (err) { toast(err.message, 'error'); }
  });
}
