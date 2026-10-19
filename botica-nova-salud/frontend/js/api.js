// Cliente HTTP para la API REST. Añade el token JWT y unifica el manejo de errores.

const CLAVE = 'novasalud.sesion';

export const sesion = {
  get() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE)); } catch { return null; }
  },
  set(datos) { sessionStorage.setItem(CLAVE, JSON.stringify(datos)); },
  limpiar() { sessionStorage.removeItem(CLAVE); },
};

let alExpirar = () => {};
export const onSesionExpirada = (fn) => { alExpirar = fn; };

async function solicitar(metodo, url, cuerpo) {
  const s = sesion.get();
  const resp = await fetch(`/api${url}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await resp.json().catch(() => ({}));
  if (resp.status === 401 && s?.token) {
    alExpirar();
  }
  if (!resp.ok) throw new Error(datos.error || `Error ${resp.status}`);
  return datos;
}

// Convierte un objeto en query string omitiendo valores vacíos.
export const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null);
  return p.length ? `?${new URLSearchParams(p)}` : '';
};

export const api = {
  get: (url) => solicitar('GET', url),
  post: (url, cuerpo = {}) => solicitar('POST', url, cuerpo),
  put: (url, cuerpo) => solicitar('PUT', url, cuerpo),
  del: (url) => solicitar('DELETE', url),
};

// Comprueba si el usuario en sesión tiene alguno de los roles indicados.
export const puede = (...roles) => roles.includes(sesion.get()?.usuario?.rol);
