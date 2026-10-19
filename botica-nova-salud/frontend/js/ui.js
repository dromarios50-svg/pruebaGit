// Utilidades de interfaz: escape de HTML (previene XSS), formato, modales, notificaciones y formularios.

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);

// Plantilla etiquetada: escapa automáticamente cada valor interpolado, salvo los marcados con raw().
class Seguro { constructor(v) { this.v = v; } }
export const raw = (v) => new Seguro(v);
export function html(partes, ...valores) {
  return partes.reduce((acc, p, i) => {
    if (i === 0) return p;
    const v = valores[i - 1];
    const s = v instanceof Seguro ? v.v : Array.isArray(v) ? v.map((x) => (x instanceof Seguro ? x.v : esc(x))).join('') : esc(v);
    return acc + s + p;
  }, '');
}

export const soles = (n) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const entero = (n) => Number(n || 0).toLocaleString('es-PE');
export const fechaCorta = (f) => (f ? new Date(f.length === 10 ? `${f}T00:00` : f.replace(' ', 'T')).toLocaleDateString('es-PE') : '—');
export const fechaHora = (f) => (f ? new Date(f.replace(' ', 'T')).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const hoyISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export function toast(mensaje, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.textContent = mensaje;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('salir'), 3500);
  setTimeout(() => el.remove(), 4000);
}

const modal = document.getElementById('modal');
let alCerrarModal = null;

export function abrirModal(titulo, contenido, { ancho = '' } = {}) {
  document.getElementById('modal-titulo').textContent = titulo;
  const cuerpo = document.getElementById('modal-cuerpo');
  cuerpo.innerHTML = contenido;
  modal.querySelector('.modal-caja').className = `modal-caja ${ancho}`;
  modal.hidden = false;
  cuerpo.querySelector('input:not([type=hidden]), select, textarea, button')?.focus();
  return cuerpo;
}

export function cerrarModal() {
  modal.hidden = true;
  document.getElementById('modal-cuerpo').innerHTML = '';
  if (alCerrarModal) { const fn = alCerrarModal; alCerrarModal = null; fn(); }
}
export const onCerrarModal = (fn) => { alCerrarModal = fn; };

modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-cerrar-modal]')) cerrarModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) cerrarModal(); });

export function confirmar(mensaje, { titulo = 'Confirmar', boton = 'Aceptar', peligro = false, pedirMotivo = false } = {}) {
  return new Promise((resolve) => {
    const cuerpo = abrirModal(titulo, html`
      <form class="form">
        <p>${mensaje}</p>
        ${raw(pedirMotivo ? '<label>Motivo<textarea name="motivo" required maxlength="200" rows="2"></textarea></label>' : '')}
        <div class="form-acciones">
          <button type="button" class="btn" data-cerrar-modal>Cancelar</button>
          <button type="submit" class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}">${boton}</button>
        </div>
      </form>`);
    let respondido = false;
    onCerrarModal(() => { if (!respondido) resolve(null); });
    cuerpo.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      respondido = true;
      const motivo = e.target.motivo?.value.trim();
      cerrarModal();
      resolve(pedirMotivo ? motivo : true);
    });
  });
}

// Genera un formulario a partir de una definición de campos.
// campo: { nombre, etiqueta, tipo: text|number|date|select|textarea|checkbox|password, opciones, requerido, ... }
export function formulario(campos, valores = {}, { boton = 'Guardar' } = {}) {
  const filas = campos.map((c) => {
    const v = valores[c.nombre] ?? c.valor ?? '';
    const req = c.requerido ? 'required' : '';
    const attrs = raw([
      c.min !== undefined ? `min="${c.min}"` : '', c.max !== undefined ? `max="${c.max}"` : '',
      c.step ? `step="${c.step}"` : '', c.patron ? `pattern="${esc(c.patron)}"` : '',
      c.maxlength ? `maxlength="${c.maxlength}"` : '', c.placeholder ? `placeholder="${esc(c.placeholder)}"` : '',
      c.soloLectura ? 'readonly' : '', req,
    ].join(' '));
    let control;
    if (c.tipo === 'select') {
      control = html`<select name="${c.nombre}" ${attrs}>
        ${raw(c.requerido ? '' : '<option value="">— Ninguno —</option>')}
        ${c.opciones.map((o) => raw(html`<option value="${o.valor}" ${raw(String(o.valor) === String(v) ? 'selected' : '')}>${o.texto}</option>`))}
      </select>`;
    } else if (c.tipo === 'textarea') {
      control = html`<textarea name="${c.nombre}" rows="2" ${attrs}>${v}</textarea>`;
    } else if (c.tipo === 'checkbox') {
      return html`<label class="check ${c.ancho || ''}"><input type="checkbox" name="${c.nombre}" ${raw(v ? 'checked' : '')}> ${c.etiqueta}</label>`;
    } else {
      control = html`<input type="${c.tipo || 'text'}" name="${c.nombre}" value="${v}" ${attrs}>`;
    }
    return html`<label class="${c.ancho || ''}">${c.etiqueta}${raw(c.requerido ? ' <span class="req">*</span>' : '')}${raw(control)}
      ${raw(c.ayuda ? html`<small class="muted">${c.ayuda}</small>` : '')}</label>`;
  });
  return html`<form class="form form-grid">${raw(filas.join(''))}
    <p class="error form-error" role="alert"></p>
    <div class="form-acciones"><button type="button" class="btn" data-cerrar-modal>Cancelar</button>
    <button type="submit" class="btn btn-primario">${boton}</button></div></form>`;
}

export function leerFormulario(form) {
  const datos = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    datos[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  return datos;
}

// Abre un formulario en un modal y ejecuta "guardar" al enviarlo, mostrando errores en línea.
export function modalFormulario(titulo, campos, valores, guardar, opciones = {}) {
  const cuerpo = abrirModal(titulo, formulario(campos, valores, opciones), { ancho: opciones.ancho || 'ancho' });
  const form = cuerpo.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      await guardar(leerFormulario(form));
      cerrarModal();
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      boton.disabled = false;
    }
  });
  return form;
}

export const estadoVacio = (texto) => html`<div class="vacio">${texto}</div>`;
export const cargando = () => '<div class="cargando" aria-busy="true">Cargando…</div>';

// Gráfico de barras simple en HTML/CSS (sin librerías externas).
export function barras(datos, { etiqueta, valor, formato = entero }) {
  if (!datos.length) return estadoVacio('Sin datos para el periodo.');
  const max = Math.max(...datos.map(valor), 1);
  return html`<div class="barras">${datos.map((d) => raw(html`
    <div class="barra-fila"><span class="barra-etq" title="${etiqueta(d)}">${etiqueta(d)}</span>
      <span class="barra-pista"><span class="barra" style="width:${((valor(d) / max) * 100).toFixed(1)}%"></span></span>
      <span class="barra-val">${formato(valor(d))}</span></div>`))}</div>`;
}

export function exportarCSV(nombre, filas, columnas) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenido = [columnas.map((c) => celda(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${contenido}`], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}
