import { api, puede } from '../api.js';
import { html, raw, fechaCorta, estadoVacio, exportarCSV } from '../ui.js';

let raiz = null;

export async function render(contenedor) {
  raiz = contenedor;
  const a = await api.get('/inventario/alertas');
  const reponer = puede('ADMIN', 'ALMACEN');

  contenedor.innerHTML = html`
    <section class="panel">
      <div class="panel-cab"><h3>⚠️ Reposición: stock bajo o agotado (${a.stockBajo.length})</h3>
        ${raw(a.stockBajo.length ? '<button class="btn btn-chico" id="exportar-pedido">Generar pedido (CSV)</button>' : '')}</div>
      ${raw(a.stockBajo.length ? html`<div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Producto</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Sugerido pedir</th><th>Proveedor</th><th>Nivel</th>${raw(reponer ? '<th></th>' : '')}</tr></thead>
        <tbody>${a.stockBajo.map((p) => raw(html`<tr>
          <td><b>${p.nombre}</b><small class="muted">${p.codigo} · ${p.presentacion || ''}</small></td>
          <td class="num"><b>${p.stock}</b></td><td class="num">${p.stock_minimo}</td><td class="num">${p.cantidad_sugerida}</td>
          <td>${p.proveedor || '—'}<small class="muted">${p.proveedor_telefono || ''}</small></td>
          <td><span class="chip ${raw(p.nivel === 'AGOTADO' ? 'chip-peligro' : 'chip-aviso')}">${p.nivel === 'AGOTADO' ? 'Agotado' : 'Stock bajo'}</span></td>
          ${raw(reponer ? html`<td><a class="btn btn-chico btn-primario" href="#/inventario?producto=${p.id}">Registrar ingreso</a></td>` : '')}
        </tr>`))}</tbody></table></div>` : estadoVacio('✅ Todos los productos tienen stock suficiente.'))}
    </section>
    <section class="panel">
      <h3>⏳ Productos vencidos o próximos a vencer (${a.porVencer.length})</h3>
      ${raw(a.porVencer.length ? html`<div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Producto</th><th>Lote</th><th class="num">Stock</th><th>Vencimiento</th><th class="num">Días</th><th>Nivel</th>${raw(reponer ? '<th></th>' : '')}</tr></thead>
        <tbody>${a.porVencer.map((p) => raw(html`<tr>
          <td><b>${p.nombre}</b><small class="muted">${p.codigo}</small></td><td>${p.lote || '—'}</td><td class="num">${p.stock}</td>
          <td>${fechaCorta(p.fecha_vencimiento)}</td><td class="num">${p.dias_restantes}</td>
          <td><span class="chip ${raw(p.nivel === 'VENCIDO' ? 'chip-peligro' : 'chip-aviso')}">${p.nivel === 'VENCIDO' ? 'Vencido' : 'Por vencer'}</span></td>
          ${raw(reponer ? html`<td><a class="btn btn-chico" href="#/inventario?producto=${p.id}">Dar de baja</a></td>` : '')}
        </tr>`))}</tbody></table></div>` : estadoVacio('✅ No hay productos próximos a vencer.'))}
    </section>`;

  contenedor.querySelector('#exportar-pedido')?.addEventListener('click', () => exportarCSV('pedido-reposicion', a.stockBajo, [
    { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Producto', valor: (p) => p.nombre },
    { titulo: 'Stock actual', valor: (p) => p.stock }, { titulo: 'Cantidad a pedir', valor: (p) => p.cantidad_sugerida },
    { titulo: 'Proveedor', valor: (p) => p.proveedor }, { titulo: 'Teléfono', valor: (p) => p.proveedor_telefono },
  ]));
}

export function alActualizarStock() {
  if (raiz?.isConnected) render(raiz).catch(() => {});
}
