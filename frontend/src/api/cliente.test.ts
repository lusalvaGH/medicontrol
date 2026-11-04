import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, alVencerSesion, olvidarTokenCsrf, pedir } from './cliente';
import { auth } from './servicios';

type Llamada = { url: string; metodo: string; cabeceras: Record<string, string>; cuerpo?: string };

/** Servidor simulado: cada respuesta es [estado, cuerpo JSON] según método y ruta. */
function simular(responder: (l: Llamada, n: number) => [number, unknown]) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const l: Llamada = { url, metodo: String(init.method), cabeceras: init.headers as Record<string, string>, cuerpo: init.body as string | undefined };
      llamadas.push(l);
      const [estado, cuerpo] = responder(l, llamadas.length);

      return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
    }),
  );

  return llamadas;
}

const ok = (data: unknown): [number, unknown] => [200, { ok: true, data }];
const error = (estado: number, codigo: string, mensaje = 'Error', campos?: Record<string, string>): [number, unknown] => [
  estado,
  { ok: false, error: { codigo, mensaje, ...(campos ? { campos } : {}) } },
];

beforeEach(() => olvidarTokenCsrf());
afterEach(() => vi.unstubAllGlobals());

describe('cliente de la API', () => {
  it('devuelve data cuando la respuesta es {ok: true} y usa la cookie del mismo origen', async () => {
    const llamadas = simular(() => ok({ turnos: [] }));
    await expect(pedir('GET', '/turnos?fecha=2026-11-05')).resolves.toEqual({ turnos: [] });
    expect(llamadas[0].url).toBe('/api/turnos?fecha=2026-11-05');
    expect(llamadas[0].cabeceras['X-CSRF-Token']).toBeUndefined();
  });

  it('convierte {ok: false} en ErrorApi con código, mensaje y campos', async () => {
    simular(() => error(400, 'DATOS_INVALIDOS', 'Revisá los datos del turno.', { hora: 'invalida' }));
    const fallo = await pedir('POST', '/turnos', {}).catch((e) => e);
    expect(fallo).toBeInstanceOf(ErrorApi);
    expect(fallo).toMatchObject({ estado: 400, codigo: 'DATOS_INVALIDOS', message: 'Revisá los datos del turno.', campos: { hora: 'invalida' } });
  });

  it('las escrituras piden el token una vez, lo envían en X-CSRF-Token y lo reutilizan', async () => {
    const llamadas = simular((l) => (l.url === '/api/auth/csrf' ? ok({ token: 'a'.repeat(64) }) : ok({})));
    await pedir('POST', '/turnos/1/cancelacion');
    await pedir('PATCH', '/turnos/1', { estado: 'confirmado' });
    expect(llamadas.map((l) => `${l.metodo} ${l.url}`)).toEqual(['GET /api/auth/csrf', 'POST /api/turnos/1/cancelacion', 'PATCH /api/turnos/1']);
    expect(llamadas[1].cabeceras['X-CSRF-Token']).toBe('a'.repeat(64));
    expect(llamadas[2].cabeceras['Content-Type']).toBe('application/json');
    expect(llamadas[2].cuerpo).toBe('{"estado":"confirmado"}');
  });

  it('ante CSRF_INVALIDO pide un token nuevo y reintenta una sola vez', async () => {
    let tokens = 0;
    const llamadas = simular((l) => {
      if (l.url === '/api/auth/csrf') {
        tokens++;

        return ok({ token: String(tokens).repeat(64) });
      }

      return error(403, 'CSRF_INVALIDO');
    });
    const fallo = (await pedir('POST', '/turnos').catch((e) => e)) as ErrorApi;
    expect(fallo.codigo).toBe('CSRF_INVALIDO');
    expect(llamadas.map((l) => l.url)).toEqual(['/api/auth/csrf', '/api/turnos', '/api/auth/csrf', '/api/turnos']);
    expect(llamadas[3].cabeceras['X-CSRF-Token']).toBe('2'.repeat(64));
  });

  it('un 401 de sesión avisa que la sesión venció y descarta el token', async () => {
    const aviso = vi.fn();
    const baja = alVencerSesion(aviso);
    let primera = true;
    const llamadas = simular((l) => {
      if (l.url === '/api/auth/csrf') {
        return ok({ token: 'b'.repeat(64) });
      }
      if (primera) {
        primera = false;

        return error(401, 'SESION_INVALIDA');
      }

      return ok({});
    });
    await expect(pedir('POST', '/turnos')).rejects.toMatchObject({ estado: 401 });
    expect(aviso).toHaveBeenCalledTimes(1);
    await pedir('POST', '/turnos');
    // Después del 401 vuelve a pedir el token
    expect(llamadas.filter((l) => l.url === '/api/auth/csrf')).toHaveLength(2);
    baja();
  });

  it('sin conexión responde SIN_CONEXION', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(pedir('GET', '/medicos')).rejects.toMatchObject({ estado: 0, codigo: 'SIN_CONEXION' });
  });

  it('una respuesta que no es JSON se informa como RESPUESTA_INVALIDA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    await expect(pedir('GET', '/medicos')).rejects.toMatchObject({ estado: 502, codigo: 'RESPUESTA_INVALIDA' });
  });
});

describe('servicio de sesión', () => {
  it('el login usa el token de csrf-inicio y después lo descarta', async () => {
    const usuario = { id_usuario: 1, nombre: 'Ana', apellido: 'Paz', email: 'a@b.test', rol: 'recepcionista' };
    const llamadas = simular((l) => {
      if (l.url === '/api/auth/csrf-inicio') return ok({ token: 'c'.repeat(64) });
      if (l.url === '/api/auth/csrf') return ok({ token: 'd'.repeat(64) });

      return ok({ usuario });
    });
    await expect(auth.iniciarSesion('a@b.test', 'Clave2026')).resolves.toEqual(usuario);
    expect(JSON.parse(llamadas[1].cuerpo!)).toEqual({ email: 'a@b.test', contrasena: 'Clave2026' });
    expect(llamadas[1].cabeceras['X-CSRF-Token']).toBe('c'.repeat(64));
    // El siguiente pedido que modifica datos usa el token de la sesión nueva
    await pedir('POST', '/turnos/1/cancelacion');
    expect(llamadas.slice(2).map((l) => l.url)).toEqual(['/api/auth/csrf', '/api/turnos/1/cancelacion']);
  });

  it('las credenciales incorrectas no avisan "sesión vencida"', async () => {
    const aviso = vi.fn();
    const baja = alVencerSesion(aviso);
    simular((l) => (l.url === '/api/auth/csrf-inicio' ? ok({ token: 'c'.repeat(64) }) : error(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.')));
    await expect(auth.iniciarSesion('a@b.test', 'mal')).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(aviso).not.toHaveBeenCalled();
    baja();
  });

  it('usuarioActual devuelve null sin sesión, sin avisar vencimiento', async () => {
    const aviso = vi.fn();
    const baja = alVencerSesion(aviso);
    simular(() => error(401, 'NO_AUTENTICADO'));
    await expect(auth.usuarioActual()).resolves.toBeNull();
    expect(aviso).not.toHaveBeenCalled();
    baja();
  });

  it('cerrar sesión con la sesión ya vencida no avisa vencimiento', async () => {
    const aviso = vi.fn();
    const baja = alVencerSesion(aviso);
    simular(() => error(401, 'NO_AUTENTICADO'));
    await expect(auth.cerrarSesion()).rejects.toMatchObject({ estado: 401 });
    expect(aviso).not.toHaveBeenCalled();
    baja();
  });
});
