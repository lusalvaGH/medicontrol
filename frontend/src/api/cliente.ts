import type { ErrorRespuesta } from './tipos';

/** Error de la API con el código y los campos que devuelve el backend. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly campos: Record<string, string> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

/** Códigos con los que el backend indica que no hay sesión o que dejó de ser válida. */
const SIN_SESION = new Set(['NO_AUTENTICADO', 'SESION_INVALIDA']);
const METODOS_SEGUROS = new Set(['GET', 'HEAD']);

type Metodo = 'GET' | 'POST' | 'PATCH';

export interface OpcionesPedido {
  /** El 401 es una respuesta esperada (por ejemplo, al comprobar si hay sesión): no avisa de sesión vencida. */
  sinAvisoDeSesion?: boolean;
  /** Pedido previo al login: usa el token de /auth/csrf-inicio (sesión anónima). */
  antesDelLogin?: boolean;
}

let tokenCsrf: string | null = null;
const alVencer = new Set<() => void>();

/** Avisa cuando el backend responde que la sesión no existe o venció. Devuelve la baja de la suscripción. */
export function alVencerSesion(escucha: () => void): () => void {
  alVencer.add(escucha);

  return () => alVencer.delete(escucha);
}

/**
 * Descarta el token CSRF guardado. El backend lo renueva al iniciar sesión, al cambiar la
 * contraseña y al cerrar la sesión: el próximo pedido que modifica datos pide uno nuevo.
 */
export function olvidarTokenCsrf(): void {
  tokenCsrf = null;
}

async function obtenerToken(opciones: OpcionesPedido): Promise<string> {
  if (tokenCsrf === null) {
    const ruta = opciones.antesDelLogin ? '/auth/csrf-inicio' : '/auth/csrf';
    tokenCsrf = (await enviar<{ token: string }>('GET', ruta, undefined, null, opciones)).token;
  }

  return tokenCsrf;
}

/**
 * Pedido a la API. La cookie de sesión viaja sola (mismo origen). Los pedidos que modifican
 * datos llevan X-CSRF-Token; si el backend lo rechaza, se pide un token nuevo y se reintenta
 * una vez (el rechazo ocurre antes de procesar el pedido, así que reintentar es seguro).
 */
export async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: unknown, opciones: OpcionesPedido = {}): Promise<T> {
  if (METODOS_SEGUROS.has(metodo)) {
    return enviar<T>(metodo, ruta, cuerpo, null, opciones);
  }
  try {
    return await enviar<T>(metodo, ruta, cuerpo, await obtenerToken(opciones), opciones);
  } catch (error) {
    if (error instanceof ErrorApi && error.codigo === 'CSRF_INVALIDO') {
      olvidarTokenCsrf();

      return enviar<T>(metodo, ruta, cuerpo, await obtenerToken(opciones), opciones);
    }
    throw error;
  }
}

async function enviar<T>(metodo: Metodo, ruta: string, cuerpo: unknown, token: string | null, opciones: OpcionesPedido): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: 'application/json' };
  if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }
  if (token !== null) {
    cabeceras['X-CSRF-Token'] = token;
  }

  let respuesta: Response;
  try {
    respuesta = await fetch('/api' + ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
  }

  let json: { ok?: boolean; data?: T; error?: ErrorRespuesta } | null = null;
  try {
    json = await respuesta.json();
  } catch {
    // El backend siempre responde JSON; si no, se informa como error del servidor
  }

  if (respuesta.ok && json?.ok === true) {
    return json.data as T;
  }

  const error = json?.error;
  const fallo = error
    ? new ErrorApi(respuesta.status, error.codigo, error.mensaje, error.campos ?? {})
    : new ErrorApi(respuesta.status, 'RESPUESTA_INVALIDA', 'El servidor respondió algo inesperado. Intentá nuevamente.');

  if (respuesta.status === 401 && SIN_SESION.has(fallo.codigo)) {
    olvidarTokenCsrf();
    if (!opciones.sinAvisoDeSesion) {
      alVencer.forEach((escucha) => escucha());
    }
  }
  throw fallo;
}
