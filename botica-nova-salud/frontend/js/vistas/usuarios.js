import { api } from '../api.js';
import { html, raw, fechaCorta, toast, modalFormulario } from '../ui.js';

const ROLES = [
  { valor: 'ADMIN', texto: 'Administrador' },
  { valor: 'VENDEDOR', texto: 'Vendedor / Caja' },
  { valor: 'ALMACEN', texto: 'Almacén' },
];
const rolTexto = (r) => ROLES.find((x) => x.valor === r)?.texto || r;

export async function render(contenedor) {
  const usuarios = await api.get('/usuarios');
  contenedor.innerHTML = html`
    <div class="filtros"><span class="crece muted">Cada usuario accede solo a los módulos de su rol.</span>
      <button class="btn btn-primario" id="nuevo-usuario">+ Nuevo usuario</button></div>
    <section class="panel"><div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
      <tbody>${usuarios.map((u) => raw(html`<tr class="${raw(u.activo ? '' : 'inactivo')}">
        <td><b>${u.nombre}</b></td><td>${u.usuario}</td><td>${rolTexto(u.rol)}</td>
        <td><span class="chip ${raw(u.activo ? 'chip-ok' : 'chip-peligro')}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>${fechaCorta(u.creado_en)}</td>
        <td><button class="btn btn-chico" data-id="${u.id}">Editar</button></td></tr>`))}</tbody>
    </table></div></section>`;

  const recargar = () => render(contenedor);
  contenedor.querySelector('#nuevo-usuario').addEventListener('click', () => {
    modalFormulario('Nuevo usuario', [
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true, maxlength: 100 },
      { nombre: 'usuario', etiqueta: 'Usuario', requerido: true, maxlength: 30, patron: '[a-zA-Z0-9._\\-]{3,30}' },
      { nombre: 'password', etiqueta: 'Contraseña', tipo: 'password', requerido: true, maxlength: 100, ayuda: 'Mínimo 6 caracteres' },
      { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', requerido: true, opciones: ROLES, valor: 'VENDEDOR' },
    ], {}, async (d) => { await api.post('/usuarios', d); toast('Usuario creado.'); recargar(); });
  });
  contenedor.querySelector('tbody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const u = usuarios.find((x) => x.id === Number(b.dataset.id));
    modalFormulario(`Editar ${u.usuario}`, [
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true, maxlength: 100 },
      { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', requerido: true, opciones: ROLES },
      { nombre: 'password', etiqueta: 'Nueva contraseña', tipo: 'password', maxlength: 100, ayuda: 'Déjelo vacío para no cambiarla' },
      { nombre: 'activo', etiqueta: 'Usuario activo', tipo: 'checkbox' },
    ], u, async (d) => { await api.put(`/usuarios/${u.id}`, d); toast('Usuario actualizado.'); recargar(); });
  });
}
