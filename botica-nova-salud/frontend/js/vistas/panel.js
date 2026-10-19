import { api, puede } from '../api.js';
import { html, raw, soles, entero, barras } from '../ui.js';

let contenedorActual = null;

export async function render(contenedor) {
  contenedorActual = contenedor;
  const d = await api.get('/reportes/dashboard');
  const dia = (f) => new Date(`${f}T00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit' });

  contenedor.innerHTML = html`
    <div class="tarjetas">
      <div class="tarjeta"><span>Ventas de hoy</span><b>${soles(d.hoy.monto)}</b><small>${entero(d.hoy.ventas)} boletas · ticket prom. ${soles(d.hoy.ticket_promedio)}</small></div>
      <div class="tarjeta"><span>Ventas del mes</span><b>${soles(d.mes.monto)}</b><small>${entero(d.mes.ventas)} boletas</small></div>
      <div class="tarjeta"><span>Inventario</span><b>${entero(d.inventario.unidades)} u.</b><small>${entero(d.inventario.productos)} productos · valor ${soles(d.inventario.valor_costo)}</small></div>
      <a class="tarjeta tarjeta-alerta ${raw(d.alertas.total ? 'activa' : '')}" href="#/alertas">
        <span>Alertas de inventario</span><b>${entero(d.alertas.total)}</b>
        <small>${d.alertas.agotados} agotados · ${d.alertas.stockBajo} stock bajo · ${d.alertas.porVencer} por vencer · ${d.alertas.vencidos} vencidos</small></a>
    </div>
    ${raw(puede('ADMIN', 'VENDEDOR') ? '<div class="acciones-rapidas"><a class="btn btn-primario" href="#/pos">🛒 Nueva venta (F2)</a></div>' : '')}
    <div class="grid-2">
      <section class="panel"><h3>Ventas de los últimos 7 días</h3>
        ${raw(barras(d.ultimos7, { etiqueta: (x) => dia(x.fecha), valor: (x) => x.monto, formato: soles }))}</section>
      <section class="panel"><h3>Productos más vendidos (30 días)</h3>
        ${raw(barras(d.topProductos, { etiqueta: (x) => x.nombre, valor: (x) => x.unidades, formato: (n) => `${entero(n)} u.` }))}</section>
    </div>`;
}

export function alActualizarStock() {
  if (contenedorActual?.isConnected) render(contenedorActual).catch(() => {});
}
