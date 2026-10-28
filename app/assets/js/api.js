// ============================================================================
// MEDICONTROL - CLIENTE DE LA API
// ============================================================================
// Único lugar del frontend que hace fetch() a la API. Uso:
//   const data = await MediApi.get('turnos', { fecha: '2026-10-27' });
//   const data = await MediApi.patch('turnos/15', { fecha, hora, estado });  // agrega el token CSRF
// Si la API responde un error, lanza MediApi.ApiError con estado, código y mensaje.
// ============================================================================
(function (global) {
  'use strict';

  // La API vive en /<proyecto>/api/; este archivo está en /<proyecto>/app/assets/js/
  const BASE_API = new URL('../../../api/', document.currentScript.src).pathname;

  class ApiError extends Error {
    constructor(estado, codigo, mensaje, campos) {
      super(mensaje);
      this.name = 'ApiError';
      this.estado = estado;
      this.codigo = codigo;
      this.campos = campos || {};
    }
  }

  function armarUrl(ruta, parametros) {
    const url = new URL(String(ruta).replace(/^\/+/, ''), window.location.origin + BASE_API);
    Object.keys(parametros || {}).forEach(function (clave) {
      const valor = parametros[clave];
      if (valor !== undefined && valor !== null && valor !== '') {
        url.searchParams.set(clave, valor);
      }
    });
    return url.pathname + url.search;
  }

  // Token CSRF de la sesión: se pide una vez y se reutiliza en POST/PATCH
  let tokenCsrf = null;

  async function obtenerTokenCsrf(renovar) {
    if (tokenCsrf === null || renovar) {
      const data = await solicitar('GET', 'auth/csrf');
      tokenCsrf = data.token;
    }
    return tokenCsrf;
  }

  async function escribir(metodo, ruta, datos) {
    const enviar = async (renovar) => solicitar(metodo, ruta, null, datos || {}, await obtenerTokenCsrf(renovar));
    try {
      return await enviar(false);
    } catch (err) {
      // Si el token venció (por ejemplo, después de volver a iniciar sesión), se renueva una vez
      if (err instanceof ApiError && err.codigo === 'CSRF_INVALIDO') {
        return enviar(true);
      }
      throw err;
    }
  }

  async function solicitar(metodo, ruta, parametros, datos, csrf) {
    const cabeceras = { 'Accept': 'application/json' };
    if (datos !== undefined) {
      cabeceras['Content-Type'] = 'application/json';
    }
    if (csrf) {
      cabeceras['X-CSRF-Token'] = csrf;
    }

    let respuesta;
    try {
      respuesta = await fetch(armarUrl(ruta, parametros), {
        method: metodo,
        credentials: 'same-origin',
        headers: cabeceras,
        body: datos !== undefined ? JSON.stringify(datos) : undefined,
      });
    } catch (e) {
      throw new ApiError(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.');
    }

    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch (e) {
      cuerpo = null;
    }

    if (!respuesta.ok || !cuerpo || cuerpo.ok !== true) {
      const error = (cuerpo && cuerpo.error) || {};
      throw new ApiError(
        respuesta.status,
        error.codigo || 'ERROR_INESPERADO',
        error.mensaje || 'Respuesta inesperada del servidor.',
        error.campos
      );
    }
    return cuerpo.data;
  }

  global.MediApi = {
    get: function (ruta, parametros) { return solicitar('GET', ruta, parametros); },
    post: function (ruta, datos) { return escribir('POST', ruta, datos); },
    patch: function (ruta, datos) { return escribir('PATCH', ruta, datos); },
    ApiError: ApiError,
  };
})(window);
