import { INestApplication } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import { NOMBRE_COOKIE, SESIONES } from '../src/auth/sesion.config';
import { SesionesEnMemoria } from '../src/auth/sesion.store';
import { POOL_DB } from '../src/database/database.module';
import { UsuariosTemporales, checksumBase, crearApp } from './helpers/app-prueba';

/**
 * Etapa 3: inicio de sesión, sesiones, CSRF, roles, límite de intentos y aislamiento entre usuarios.
 * Corre contra medicontrol_test. Las cuentas de demostración solo se leen; los casos que modifican
 * cuentas usan usuarios temporales que se borran al terminar.
 */
const CLAVE_DEMO = '123456'; // contraseña de las cuentas de demostración documentada en el README
const DEMO = { recepcionista: 'operador@medicore.com', medico: 'a.rossi@medicore.com', paciente: 'm.fernandez@mail.com' } as const;
const CLAVE_TEMPORAL = 'Temporal2026';

type Agente = ReturnType<typeof request.agent>;

async function token(agente: Agente, ruta = '/api/auth/csrf-inicio'): Promise<string> {
  const r = await agente.get(ruta);

  return r.body.data?.token ?? '';
}

async function login(agente: Agente, email: string, contrasena: string, csrf?: string) {
  const t = csrf ?? (await token(agente));

  return agente.post('/api/auth/login').set('X-CSRF-Token', t).send({ email, contrasena });
}

async function sesionIniciada(app: INestApplication, email: string, contrasena = CLAVE_DEMO): Promise<Agente> {
  const agente = request.agent(app.getHttpServer());
  const r = await login(agente, email, contrasena);
  expect(r.status).toBe(200);

  return agente;
}

function cookieDe(r: request.Response): string {
  const c = r.headers['set-cookie'] as unknown as string[] | undefined;

  return (c ?? []).find((x) => x.startsWith(NOMBRE_COOKIE + '=')) ?? '';
}

describe('Autenticación, sesiones y permisos', () => {
  let app: INestApplication;
  let pool: Pool;
  let temporales: UsuariosTemporales;
  let huellaAntes: string;
  let hashesDemoAntes: string;

  const hashesDemo = async (): Promise<string> => {
    const [filas] = await pool.query('SELECT email, contrasena FROM usuarios WHERE email IN (?, ?, ?) ORDER BY email', Object.values(DEMO));

    return JSON.stringify(filas);
  };

  beforeAll(async () => {
    app = await crearApp();
    pool = app.get<Pool>(POOL_DB);
    temporales = UsuariosTemporales.de(app);
    await temporales.borrarTodos();
    huellaAntes = await checksumBase(pool);
    hashesDemoAntes = await hashesDemo();
  });

  afterAll(async () => {
    await temporales?.borrarTodos();
    if (pool) {
      expect(await temporales.cantidad()).toBe(0);
      expect(await checksumBase(pool)).toBe(huellaAntes);
    }
    await app?.close();
  });

  describe('login correcto e incorrecto', () => {
    it('login correcto devuelve el usuario sin datos sensibles', async () => {
      const agente = request.agent(app.getHttpServer());
      const r = await login(agente, DEMO.recepcionista, CLAVE_DEMO);
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
      expect(Object.keys(r.body.data.usuario).sort()).toEqual(['apellido', 'email', 'id_usuario', 'nombre', 'rol']);
      expect(r.body.data.usuario).toMatchObject({ email: DEMO.recepcionista, rol: 'recepcionista' });
      expect(JSON.stringify(r.body)).not.toMatch(/\$2[aby]\$|huella|contrasena|123456/);
    });

    it('la cookie de sesión es HttpOnly, SameSite=Lax, de sesión y no Secure en HTTP local', async () => {
      const agente = request.agent(app.getHttpServer());
      const r = await login(agente, DEMO.recepcionista, CLAVE_DEMO);
      const cookie = cookieDe(r);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Expires|Max-Age/i);
      expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    it('login con el correo en mayúsculas y con espacios funciona, como en PHP', async () => {
      const r = await login(request.agent(app.getHttpServer()), '  ' + DEMO.medico.toUpperCase() + ' ', CLAVE_DEMO);
      expect(r.status).toBe(200);
      expect(r.body.data.usuario.rol).toBe('medico');
    });

    it('contraseña incorrecta y correo inexistente dan el mismo error genérico', async () => {
      const mal = await login(request.agent(app.getHttpServer()), DEMO.paciente, 'incorrecta1');
      const inexistente = await login(request.agent(app.getHttpServer()), 'no-existe@nest-prueba.test', 'cualquiera1');
      for (const r of [mal, inexistente]) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ ok: false, error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Email o contraseña incorrectos.' } });
      }
    });

    it('la contraseña no se recorta: con un espacio de más no entra', async () => {
      expect((await login(request.agent(app.getHttpServer()), DEMO.paciente, CLAVE_DEMO + ' ')).status).toBe(401);
    });

    it.each([
      ['sin datos', {}],
      ['correo vacío', { email: '', contrasena: CLAVE_DEMO }],
      ['contraseña vacía', { email: DEMO.paciente, contrasena: '' }],
      ['tipos inválidos', { email: ['x'], contrasena: 123456 }],
    ])('%s responde 400', async (_nombre, cuerpo) => {
      const agente = request.agent(app.getHttpServer());
      const t = await token(agente);
      const r = await agente.post('/api/auth/login').set('X-CSRF-Token', t).send(cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.error.codigo).toBe('DATOS_INVALIDOS');
    });

    it('un usuario inactivo no puede iniciar sesión (mismo error genérico)', async () => {
      const u = await temporales.crear('paciente', CLAVE_TEMPORAL, 'inactivo');
      const r = await login(request.agent(app.getHttpServer()), u.email, CLAVE_TEMPORAL);
      expect(r.status).toBe(401);
      expect(r.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    });
  });

  describe('compatibilidad con las contraseñas existentes', () => {
    it.each(Object.entries(DEMO))('la cuenta de %s entra con su hash $2y$ de PHP', async (rol, email) => {
      const r = await login(request.agent(app.getHttpServer()), email, CLAVE_DEMO);
      expect(r.status).toBe(200);
      expect(r.body.data.usuario.rol).toBe(rol);
    });

    it('los hashes guardados son $2y$ y el login no los modifica', async () => {
      const filas = JSON.parse(await hashesDemo()) as { contrasena: string }[];
      expect(filas).toHaveLength(3);
      expect(filas.every((f) => f.contrasena.startsWith('$2y$'))).toBe(true);
      expect(await hashesDemo()).toBe(hashesDemoAntes);
    });
  });

  describe('sesión: identificador, logout y vencimiento', () => {
    it('el login cambia el identificador de sesión (evita la fijación)', async () => {
      const agente = request.agent(app.getHttpServer());
      const anonima = await agente.get('/api/auth/csrf-inicio');
      const r = await login(agente, DEMO.recepcionista, CLAVE_DEMO, anonima.body.data.token);
      expect(cookieDe(anonima)).not.toBe('');
      expect(cookieDe(r).split(';')[0]).not.toBe(cookieDe(anonima).split(';')[0]);
    });

    it('el token CSRF de antes del login deja de valer', async () => {
      const agente = request.agent(app.getHttpServer());
      const anterior = await token(agente);
      await login(agente, DEMO.recepcionista, CLAVE_DEMO, anterior);
      const r = await agente.post('/api/prueba/escritura').set('X-CSRF-Token', anterior).send({});
      expect(r.status).toBe(403);
      expect(r.body.error.codigo).toBe('CSRF_INVALIDO');
    });

    it('logout sin token CSRF responde 403 y no cierra la sesión', async () => {
      const agente = await sesionIniciada(app, DEMO.recepcionista);
      expect((await agente.post('/api/auth/logout')).status).toBe(403);
      expect((await agente.get('/api/auth/me')).status).toBe(200);
    });

    it('logout cierra la sesión, borra la cookie y la cookie vieja deja de servir', async () => {
      const agente = request.agent(app.getHttpServer());
      const entrada = await login(agente, DEMO.recepcionista, CLAVE_DEMO);
      const cookieVieja = cookieDe(entrada).split(';')[0];
      expect(cookieVieja).not.toBe('');
      expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieVieja)).status).toBe(200);
      const t = await token(agente, '/api/auth/csrf');
      const r = await agente.post('/api/auth/logout').set('X-CSRF-Token', t);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, data: { sesion_cerrada: true } });
      expect(cookieDe(r)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await agente.get('/api/auth/me')).status).toBe(401);
      expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieVieja)).status).toBe(401);
    });

    it('sin sesión: /auth/me y /auth/csrf responden 401 NO_AUTENTICADO', async () => {
      for (const ruta of ['/api/auth/me', '/api/auth/csrf']) {
        const r = await request(app.getHttpServer()).get(ruta);
        expect(r.status).toBe(401);
        expect(r.body.error).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: 'Iniciá sesión para continuar.' });
      }
    });

    it('una cookie alterada o inventada no da acceso', async () => {
      const agente = await sesionIniciada(app, DEMO.recepcionista);
      const r = await agente.get('/api/auth/me');
      expect(r.status).toBe(200);
      for (const falsa of [`${NOMBRE_COOKIE}=s%3Ainventada.firmafalsa`, `${NOMBRE_COOKIE}=inventada`]) {
        expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', falsa)).status).toBe(401);
      }
    });
  });

  describe('roles: acceso permitido y denegado', () => {
    const casos: [string, string, number][] = [
      ['recepcionista', '/api/prueba/recepcion', 200], ['recepcionista', '/api/prueba/medico', 403], ['recepcionista', '/api/prueba/paciente', 403], ['recepcionista', '/api/prueba/personal', 200],
      ['medico', '/api/prueba/recepcion', 403], ['medico', '/api/prueba/medico', 200], ['medico', '/api/prueba/paciente', 403], ['medico', '/api/prueba/personal', 200],
      ['paciente', '/api/prueba/recepcion', 403], ['paciente', '/api/prueba/medico', 403], ['paciente', '/api/prueba/paciente', 200], ['paciente', '/api/prueba/personal', 403],
    ];
    it.each(casos)('%s → %s responde %i', async (rol, ruta, estado) => {
      const agente = await sesionIniciada(app, DEMO[rol as keyof typeof DEMO]);
      const r = await agente.get(ruta);
      expect(r.status).toBe(estado);
      if (estado === 403) {
        expect(r.body.error).toEqual({ codigo: 'SIN_PERMISO', mensaje: 'No tenés permiso para realizar esta operación.' });
      }
    });

    it.each(['/api/prueba/recepcion', '/api/prueba/medico', '/api/prueba/paciente'])('sin sesión: %s responde 401', async (ruta) => {
      expect((await request(app.getHttpServer()).get(ruta)).status).toBe(401);
    });
  });

  describe('protección CSRF', () => {
    it('login sin token CSRF responde 403 y no inicia sesión', async () => {
      const agente = request.agent(app.getHttpServer());
      const r = await agente.post('/api/auth/login').send({ email: DEMO.recepcionista, contrasena: CLAVE_DEMO });
      expect(r.status).toBe(403);
      expect(r.body.error.codigo).toBe('CSRF_INVALIDO');
      expect((await agente.get('/api/auth/me')).status).toBe(401);
    });

    it('login con token incorrecto o de otra sesión responde 403', async () => {
      const otro = await token(request.agent(app.getHttpServer()));
      const agente = request.agent(app.getHttpServer());
      await token(agente);
      for (const t of ['0'.repeat(64), otro, '']) {
        expect((await login(agente, DEMO.recepcionista, CLAVE_DEMO, t)).status).toBe(403);
      }
    });

    it('una escritura con sesión: sin token 403, con token correcto 200', async () => {
      const agente = await sesionIniciada(app, DEMO.medico);
      expect((await agente.post('/api/prueba/escritura').send({})).status).toBe(403);
      expect((await agente.post('/api/prueba/escritura').set('X-CSRF-Token', 'x'.repeat(64)).send({})).status).toBe(403);
      const t = await token(agente, '/api/auth/csrf');
      expect((await agente.post('/api/prueba/escritura').set('X-CSRF-Token', t).send({})).status).toBe(200);
    });

    it('sin sesión, una escritura responde 401 antes que el CSRF (mismo orden que PHP)', async () => {
      expect((await request(app.getHttpServer()).post('/api/prueba/escritura').send({})).status).toBe(401);
    });

    it('el token se mantiene durante la sesión y tiene 64 caracteres', async () => {
      const agente = await sesionIniciada(app, DEMO.paciente);
      const a = await token(agente, '/api/auth/csrf');
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(await token(agente, '/api/auth/csrf')).toBe(a);
    });
  });

  describe('información de otros usuarios', () => {
    it('/auth/me devuelve siempre el usuario de la sesión, aunque se pida otro', async () => {
      const agente = await sesionIniciada(app, DEMO.paciente);
      const r = await agente.get('/api/auth/me?id_usuario=1');
      expect(r.body.data.usuario.email).toBe(DEMO.paciente);
    });

    it('el usuario de una escritura sale de la sesión, no del cuerpo del pedido', async () => {
      const agente = await sesionIniciada(app, DEMO.paciente);
      const yo = (await agente.get('/api/auth/me')).body.data.usuario.id_usuario;
      const t = await token(agente, '/api/auth/csrf');
      const r = await agente.post('/api/prueba/escritura').set('X-CSRF-Token', t).send({ id_usuario: 1, rol: 'recepcionista' });
      expect(r.body.data.id_usuario).toBe(yo);
    });

    it('dos usuarios conectados a la vez ven cada uno sus datos', async () => {
      const a = await sesionIniciada(app, DEMO.paciente);
      const b = await sesionIniciada(app, DEMO.medico);
      expect((await a.get('/api/auth/me')).body.data.usuario.email).toBe(DEMO.paciente);
      expect((await b.get('/api/auth/me')).body.data.usuario.email).toBe(DEMO.medico);
    });
  });

  describe('huella de sesión y cierre de sesiones', () => {
    it.each([
      ['se desactiva el usuario', 'estado', 'inactivo'],
      ['cambia el rol en la base', 'rol', 'medico'],
      ['cambia la contraseña', 'contrasena', '$2y$10$abcdefghijklmnopqrstuuJwGDtyqcVzVnsTbDWk3zBDz4m1Hq9mK'],
    ] as const)('si %s, la sesión abierta deja de valer (401 SESION_INVALIDA)', async (_caso, campo, valor) => {
      const u = await temporales.crear('paciente', CLAVE_TEMPORAL);
      const agente = await sesionIniciada(app, u.email, CLAVE_TEMPORAL);
      const otro = await sesionIniciada(app, DEMO.paciente);
      expect((await agente.get('/api/auth/me')).status).toBe(200);
      await temporales.cambiar(u.id, campo, valor);
      const r = await agente.get('/api/auth/me');
      expect(r.status).toBe(401);
      expect(r.body.error).toEqual({ codigo: 'SESION_INVALIDA', mensaje: 'La sesión ya no es válida. Iniciá sesión nuevamente.' });
      expect((await agente.get('/api/auth/me')).body.error.codigo).toBe('NO_AUTENTICADO'); // la sesión se destruyó
      expect((await otro.get('/api/auth/me')).status).toBe(200); // las sesiones de otros siguen
    });
  });
});

describe('Límite de intentos de inicio de sesión', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await crearApp({ limitador: { maxFallosCorreo: 5, maxFallosIp: 1000 } });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('el sexto intento queda bloqueado (429), incluso con la contraseña correcta', async () => {
    const agente = request.agent(app.getHttpServer());
    const t = await token(agente);
    for (let i = 1; i <= 5; i++) {
      expect((await login(agente, DEMO.medico, 'incorrecta' + i, t)).status).toBe(401);
    }
    const bloqueado = await login(agente, DEMO.medico, CLAVE_DEMO, t);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
    expect(bloqueado.body.error.mensaje).toBe('Demasiados intentos fallidos. Volvé a intentar en 15 min.');
  });

  it('el bloqueo de un correo no afecta a otro', async () => {
    expect((await login(request.agent(app.getHttpServer()), DEMO.paciente, CLAVE_DEMO)).status).toBe(200);
  });

  it('cuenta también los intentos con correos inexistentes (no revela qué cuentas existen)', async () => {
    const agente = request.agent(app.getHttpServer());
    const t = await token(agente);
    for (let i = 1; i <= 5; i++) {
      await login(agente, 'nadie@nest-prueba.test', 'x' + i, t);
    }
    expect((await login(agente, 'nadie@nest-prueba.test', 'x', t)).status).toBe(429);
  });

  it('un login correcto reinicia el contador', async () => {
    const agente = request.agent(app.getHttpServer());
    for (let i = 1; i <= 4; i++) {
      expect((await login(agente, DEMO.recepcionista, 'incorrecta' + i)).status).toBe(401);
    }
    expect((await login(agente, DEMO.recepcionista, CLAVE_DEMO)).status).toBe(200);
    const otro = request.agent(app.getHttpServer());
    for (let i = 1; i <= 4; i++) {
      expect((await login(otro, DEMO.recepcionista, 'incorrecta' + i)).status).toBe(401);
    }
    expect((await login(otro, DEMO.recepcionista, CLAVE_DEMO)).status).toBe(200);
  });

  it('los errores de formato no cuentan como intentos fallidos', async () => {
    const agente = request.agent(app.getHttpServer());
    const t = await token(agente);
    for (let i = 0; i < 10; i++) {
      expect((await agente.post('/api/auth/login').set('X-CSRF-Token', t).send({ email: 'm.garcia@medicore.com' })).status).toBe(400);
    }
    expect((await login(agente, 'm.garcia@medicore.com', CLAVE_DEMO, t)).status).toBe(200);
  });
});

describe('Límite por dirección IP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await crearApp({ limitador: { maxFallosCorreo: 1000, maxFallosIp: 3 } });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('muchos fallos desde la misma IP con distintos correos la bloquean', async () => {
    const agente = request.agent(app.getHttpServer());
    const t = await token(agente);
    for (let i = 1; i <= 3; i++) {
      expect((await login(agente, `otro${i}@nest-prueba.test`, 'x', t)).status).toBe(401);
    }
    expect((await login(agente, DEMO.paciente, CLAVE_DEMO, t)).status).toBe(429);
  });
});

describe('Vencimiento por inactividad', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await crearApp({ inactividadMs: 800 });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('una sesión activa se renueva con cada pedido', async () => {
    const agente = await sesionIniciada(app, DEMO.paciente);
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 400));
      expect((await agente.get('/api/auth/me')).status).toBe(200);
    }
  });

  it('pasado el tiempo sin actividad, la sesión vence y pide iniciar sesión de nuevo', async () => {
    const agente = await sesionIniciada(app, DEMO.paciente);
    await new Promise((r) => setTimeout(r, 1000));
    const r = await agente.get('/api/auth/me');
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('NO_AUTENTICADO');
    expect(app.get<SesionesEnMemoria>(SESIONES)).toBeInstanceOf(SesionesEnMemoria);
  });
});
