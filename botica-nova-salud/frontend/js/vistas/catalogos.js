import { api, puede } from '../api.js';
import { html, raw, toast, modalFormulario, confirmar, estadoVacio } from '../ui.js';

export async function render(contenedor) {
  const [proveedores, categorias] = await Promise.all([api.get('/proveedores'), api.get('/categorias')]);
  const admin = puede('ADMIN');

  contenedor.innerHTML = html`
    <div class="grid-catalogos">
      <section class="panel">
        <div class="panel-cab"><h3>Proveedores</h3><button class="btn btn-primario btn-chico" data-nuevo="proveedor">+ Nuevo</button></div>
        ${raw(proveedores.length ? html`<div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>RUC</th><th>Razón social</th><th>Contacto</th><th class="num">Prod.</th><th></th></tr></thead>
          <tbody>${proveedores.map((p) => raw(html`<tr><td>${p.ruc}</td><td><b>${p.razon_social}</b></td>
            <td>${p.telefono || ''}<small class="muted">${p.email || ''}</small></td><td class="num">${p.productos}</td>
            <td class="acciones"><button class="btn btn-chico" data-editar="proveedor" data-id="${p.id}">Editar</button>
            ${raw(admin ? html`<button class="btn btn-chico btn-peligro-suave" data-eliminar="proveedor" data-id="${p.id}">Desactivar</button>` : '')}</td></tr>`))}</tbody>
        </table></div>` : estadoVacio('Sin proveedores.'))}
      </section>
      <section class="panel">
        <div class="panel-cab"><h3>Categorías</h3><button class="btn btn-primario btn-chico" data-nuevo="categoria">+ Nueva</button></div>
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Nombre</th><th class="num">Productos</th><th></th></tr></thead>
          <tbody>${categorias.map((c) => raw(html`<tr><td>${c.nombre}</td><td class="num">${c.productos}</td>
            <td class="acciones"><button class="btn btn-chico" data-editar="categoria" data-id="${c.id}">Editar</button>
            ${raw(admin ? html`<button class="btn btn-chico btn-peligro-suave" data-eliminar="categoria" data-id="${c.id}">Eliminar</button>` : '')}</td></tr>`))}</tbody>
        </table></div>
      </section>
    </div>`;

  const camposProveedor = [
    { nombre: 'ruc', etiqueta: 'RUC', requerido: true, patron: '(10|15|17|20)\\d{9}', maxlength: 11 },
    { nombre: 'razon_social', etiqueta: 'Razón social', requerido: true, maxlength: 150 },
    { nombre: 'telefono', etiqueta: 'Teléfono', maxlength: 20 },
    { nombre: 'email', etiqueta: 'Correo', tipo: 'email', maxlength: 120 },
  ];
  const camposCategoria = [{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80 }];
  const conf = {
    proveedor: { url: '/proveedores', campos: camposProveedor, lista: proveedores, titulo: 'proveedor' },
    categoria: { url: '/categorias', campos: camposCategoria, lista: categorias, titulo: 'categoría' },
  };

  // El listener se asocia al contenido de esta vista, que se reemplaza en cada render.
  contenedor.querySelector('.grid-catalogos').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const tipo = b.dataset.nuevo || b.dataset.editar || b.dataset.eliminar;
    if (!tipo) return;
    const c = conf[tipo];
    const item = c.lista.find((x) => x.id === Number(b.dataset.id));
    try {
      if (b.dataset.nuevo || b.dataset.editar) {
        modalFormulario(item ? `Editar ${c.titulo}` : `Nuevo/a ${c.titulo}`, c.campos, item || {}, async (datos) => {
          if (item) await api.put(`${c.url}/${item.id}`, datos);
          else await api.post(c.url, datos);
          toast('Guardado correctamente.');
          render(contenedor);
        });
      } else if (await confirmar(`¿Confirma eliminar/desactivar este registro?`, { peligro: true })) {
        await api.del(`${c.url}/${item.id}`);
        toast('Registro eliminado.');
        render(contenedor);
      }
    } catch (err) { toast(err.message, 'error'); }
  });
}
