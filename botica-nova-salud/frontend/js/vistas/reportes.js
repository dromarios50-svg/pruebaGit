import { api, qs } from '../api.js';
import { html, raw, soles, entero, fechaCorta, hoyISO, barras, exportarCSV } from '../ui.js';

let datos = null;

export async function render(contenedor) {
  const hoy = hoyISO();
  contenedor.innerHTML = html`
    <form class="filtros" id="filtros-reporte">
      <label>Desde<input type="date" name="desde" value="${hoy.slice(0, 8)}01"></label>
      <label>Hasta<input type="date" name="hasta" value="${hoy}"></label>
      <button class="btn btn-primario">Generar</button>
      <button type="button" class="btn" id="exportar-reporte">Exportar productos (CSV)</button>
      <button type="button" class="btn" id="imprimir-reporte">🖨️ Imprimir</button>
    </form>
    <div id="reporte"></div>`;
  const form = contenedor.querySelector('#filtros-reporte');
  const generar = async () => {
    datos = await api.get(`/reportes/ventas${qs(Object.fromEntries(new FormData(form)))}`);
    pintar(contenedor.querySelector('#reporte'));
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); generar(); });
  contenedor.querySelector('#imprimir-reporte').addEventListener('click', () => window.print());
  contenedor.querySelector('#exportar-reporte').addEventListener('click', () => exportarCSV(`productos-vendidos-${datos.desde}_${datos.hasta}`, datos.topProductos, [
    { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Producto', valor: (p) => p.nombre },
    { titulo: 'Unidades', valor: (p) => p.unidades }, { titulo: 'Monto', valor: (p) => p.monto.toFixed(2) },
  ]));
  await generar();
}

function pintar(el) {
  const r = datos.resumen;
  el.innerHTML = html`
    <p class="resumen">Periodo: ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}</p>
    <div class="tarjetas">
      <div class="tarjeta"><span>Total vendido</span><b>${soles(r.monto)}</b><small>IGV incluido: ${soles(r.igv)}</small></div>
      <div class="tarjeta"><span>N° de ventas</span><b>${entero(r.ventas)}</b><small>${r.anuladas} anuladas</small></div>
      <div class="tarjeta"><span>Ticket promedio</span><b>${soles(r.ticket_promedio)}</b><small>por boleta</small></div>
      <div class="tarjeta"><span>Utilidad estimada</span><b>${soles(r.utilidad_estimada)}</b><small>venta sin IGV − costo</small></div>
    </div>
    <div class="grid-2">
      <section class="panel"><h3>Ventas por día</h3>
        ${raw(barras(datos.porDia, { etiqueta: (d) => fechaCorta(d.fecha), valor: (d) => d.monto, formato: soles }))}</section>
      <section class="panel"><h3>Productos más vendidos</h3>
        ${raw(barras(datos.topProductos, { etiqueta: (d) => d.nombre, valor: (d) => d.unidades, formato: (n) => `${entero(n)} u.` }))}</section>
      <section class="panel"><h3>Por método de pago</h3>
        ${raw(barras(datos.porMetodo, { etiqueta: (d) => d.metodo_pago, valor: (d) => d.monto, formato: soles }))}</section>
      <section class="panel"><h3>Por vendedor</h3>
        ${raw(barras(datos.porVendedor, { etiqueta: (d) => d.vendedor, valor: (d) => d.monto, formato: soles }))}</section>
    </div>`;
}
