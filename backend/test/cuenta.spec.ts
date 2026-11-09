import { INestApplication } from '@nestjs/common';
import { compareSync, hashSync } from 'bcryptjs';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import { huellaDeCredencial } from '../src/auth/sesion';
import { POOL_DB } from '../src/database/database.module';
import { BLOQUEO_CONTRASENA_MS, CuentaService } from '../src/usuarios/cuenta.service';
import { UsuariosRepository } from '../src/usuarios/usuarios.repository';
import { UsuariosTemporales, checksumBase, crearApp } from './helpers/app-prueba';
import { Agente, cookieDeSesion, login, sesionIniciada, tokenCsrf } from './helpers/sesion-prueba';

/**
 * Etapa 4: Mi cuenta y cambio de la contraseña propia (los casos de tests/cuenta_contrasena_test.php).
 * Corre contra medicontrol_test con usuarios temporales que se borran al terminar.
 */
const CLAVE = 'Inicial2026';
const NUEVA = 'Nueva2026x';

async function cambiar(agente: Agente, actual: unknown, nueva: unknown, confirmacion: unknown = nueva, opciones: { token?: string; extra?: object } = {}) {
  const token = opciones.token ?? (await tokenCsrf(agente));
  const r = await agente
    .post('/api/cuenta/contrasena')
    .set('X-CSRF-Token', token)
    .send({ contrasena_actual: actual, contrasena_nueva: nueva, contrasena_confirmacion: confirmacion, ...opciones.extra });

  return { estado: r.status, codigo: (r.body.error?.codigo ?? '') as string, r };
}

describe('Mi cuenta: cambio de la contraseña propia', () => {
  let app: INestApplication;
  let pool: Pool;
  let tmp: UsuariosTemporales;
  let huellaAntes: string;

  const hashDe = async (id: number): Promise<string> => (await tmp.fila(id)).contrasena;
  const nuevoUsuario = (rol: 'paciente' | 'medico' | 'recepcionista' = 'paciente') => tmp.crearUsuario(rol, CLAVE);

  beforeAll(async () => {
    app = await crearApp();
    pool = app.get<Pool>(POOL_DB);
    tmp = UsuariosTemporales.de(app);
    await tmp.borrarTodos();
    huellaAntes = await checksumBase(pool);
  });

  afterAll(async () => {
    await tmp?.borrarTodos();
    if (pool) {
      expect(await tmp.cantidad()).toBe(0);
      expect(await checksumBase(pool)).toBe(huellaAntes);
    }
    await app?.close();
  });

  describe('acceso', () => {
    it('sin sesión responde 401', async () => {
      expect((await request(app.getHttpServer()).post('/api/cuenta/contrasena').send({})).status).toBe(401);
    });

    it('GET responde 405, también sin sesión', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      expect((await ag.get('/api/cuenta/contrasena')).status).toBe(405);
      expect((await request(app.getHttpServer()).get('/api/cuenta/contrasena')).status).toBe(405);
    });

    it('sin token CSRF o con uno incorrecto responde 403 y la contraseña no cambia', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const r = await ag.post('/api/cuenta/contrasena').send({});
      expect([r.status, r.body.error.codigo]).toEqual([403, 'CSRF_INVALIDO']);
      expect((await cambiar(ag, CLAVE, NUEVA, NUEVA, { token: '0'.repeat(64) })).codigo).toBe('CSRF_INVALIDO');
      expect(compareSync(CLAVE, await hashDe(u.id))).toBe(true);
    });

    it('Mi cuenta: /auth/me devuelve los datos de la cuenta sin hash ni huella', async () => {
      const u = await nuevoUsuario('medico');
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const r = await ag.get('/api/auth/me');
      expect(r.body.data.usuario).toEqual({ id_usuario: u.id, nombre: 'Temporal', apellido: 'Nest', email: u.email, rol: 'medico', debe_cambiar_contrasena: false });
      expect(JSON.stringify(r.body)).not.toMatch(/\$2[aby]\$|huella|"contrasena"/);
    });
  });

  describe('validaciones', () => {
    let ag: Agente;
    let id: number;

    beforeAll(async () => {
      const u = await nuevoUsuario();
      id = u.id;
      ag = await sesionIniciada(app, u.email, CLAVE);
    });

    it.each([
      ['actual vacía', '', NUEVA, NUEVA, 400, 'DATOS_INVALIDOS'],
      ['nueva vacía', CLAVE, '', '', 400, 'DATOS_INVALIDOS'],
      ['actual como número', 12345678, NUEVA, NUEVA, 400, 'DATOS_INVALIDOS'],
      ['nueva como lista', CLAVE, [NUEVA], [NUEVA], 400, 'DATOS_INVALIDOS'],
      ['nueva corta', CLAVE, 'Ab1', 'Ab1', 422, 'CONTRASENA_NO_VALIDA'],
      ['nueva sin números', CLAVE, 'SoloLetras', 'SoloLetras', 422, 'CONTRASENA_NO_VALIDA'],
      ['nueva sin letras', CLAVE, '12345678', '12345678', 422, 'CONTRASENA_NO_VALIDA'],
      ['nueva de 73 bytes', CLAVE, 'a'.repeat(72) + '1', 'a'.repeat(72) + '1', 422, 'CONTRASENA_NO_VALIDA'],
      ['nueva con byte nulo', CLAVE, 'Nueva\0' + '2026x', 'Nueva\0' + '2026x', 422, 'CONTRASENA_NO_VALIDA'],
      ['confirmación distinta', CLAVE, NUEVA, 'Otra2026xx', 422, 'CONFIRMACION_NO_COINCIDE'],
      ['nueva igual a la actual', CLAVE, CLAVE, CLAVE, 422, 'CONTRASENA_REPETIDA'],
    ])('%s: responde %i %s', async (_nombre, actual, nueva, confirmacion, estado, codigo) => {
      const r = await cambiar(ag, actual, nueva, confirmacion);
      expect([r.estado, r.codigo]).toEqual([estado, codigo]);
    });

    it('campos faltantes se marcan como requeridos', async () => {
      const r = await cambiar(ag, undefined, undefined, undefined);
      expect(r.r.body.error.campos).toEqual({ contrasena_actual: 'requerido', contrasena_nueva: 'requerido', contrasena_confirmacion: 'requerido' });
    });

    it('actual incorrecta o de más de 72 bytes: 422 CONTRASENA_ACTUAL_INCORRECTA', async () => {
      expect((await cambiar(ag, 'Equivocada2026', NUEVA)).codigo).toBe('CONTRASENA_ACTUAL_INCORRECTA');
      expect((await cambiar(ag, CLAVE + 'x'.repeat(70), NUEVA)).codigo).toBe('CONTRASENA_ACTUAL_INCORRECTA');
    });

    it('ningún envío inválido cambió la contraseña', async () => {
      expect(compareSync(CLAVE, await hashDe(id))).toBe(true);
    });
  });

  describe('cambio correcto', () => {
    for (const rol of ['recepcionista', 'medico', 'paciente'] as const) {
      it(`${rol}: cambia su contraseña, se guarda con bcrypt $2y$ y solo sirve la nueva`, async () => {
        const u = await nuevoUsuario(rol);
        const ag = await sesionIniciada(app, u.email, CLAVE);
        const r = await cambiar(ag, CLAVE, NUEVA);
        expect([r.estado, r.r.body]).toEqual([200, { ok: true, data: { actualizada: true } }]);
        const hash = await hashDe(u.id);
        expect(hash.startsWith('$2y$10$')).toBe(true);
        expect(compareSync(NUEVA, hash)).toBe(true);
        expect(r.r.text).not.toContain(NUEVA);
        expect(r.r.text).not.toContain(huellaDeCredencial(hash));
        expect((await login(request.agent(app.getHttpServer()), u.email, CLAVE)).status).toBe(401);
        expect((await login(request.agent(app.getHttpServer()), u.email, NUEVA)).status).toBe(200);
      });
    }

    it('enviar otro id_usuario no afecta a ese usuario: el cambio es del usuario de la sesión', async () => {
      const u1 = await nuevoUsuario();
      const u2 = await nuevoUsuario();
      const hashU2 = await hashDe(u2.id);
      const ag = await sesionIniciada(app, u1.email, CLAVE);
      expect((await cambiar(ag, CLAVE, NUEVA, NUEVA, { extra: { id_usuario: u2.id } })).estado).toBe(200);
      expect(await hashDe(u2.id)).toBe(hashU2);
      expect(compareSync(NUEVA, await hashDe(u1.id))).toBe(true);
    });

    it('la contraseña no se altera: espacios, acentos y exactamente 72 bytes', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const conEspacios = '  Espacios 2026  ';
      expect((await cambiar(ag, CLAVE, conEspacios)).estado).toBe(200);
      expect(compareSync(conEspacios, await hashDe(u.id))).toBe(true);
      expect(compareSync(conEspacios.trim(), await hashDe(u.id))).toBe(false);
      const acentos = 'Contraseña2026áé';
      expect((await cambiar(ag, conEspacios, acentos)).estado).toBe(200);
      expect(compareSync(acentos, await hashDe(u.id))).toBe(true);
      expect((await cambiar(ag, acentos, 'a'.repeat(71) + '1')).estado).toBe(200);
    });
  });

  describe('sesiones', () => {
    it('la sesión actual sigue con otro identificador y otro token; las demás quedan inválidas', async () => {
      const u = await nuevoUsuario('recepcionista');
      const esta = request.agent(app.getHttpServer());
      const idAntes = cookieDeSesion(await login(esta, u.email, CLAVE));
      const otra = await sesionIniciada(app, u.email, CLAVE);
      const tokenAntes = await tokenCsrf(esta);

      expect((await cambiar(esta, 'Equivocada2026', NUEVA, NUEVA, { token: tokenAntes })).estado).toBe(422);
      expect((await cambiar(esta, CLAVE, 'Corta1', 'Corta1', { token: tokenAntes })).estado).toBe(422);
      expect((await otra.get('/api/auth/me')).status).toBe(200);

      const r = await cambiar(esta, CLAVE, NUEVA, NUEVA, { token: tokenAntes });
      expect(r.estado).toBe(200);
      const idDespues = cookieDeSesion(r.r);
      expect(idDespues).not.toBe('');
      expect(idDespues.split(';')[0]).not.toBe(idAntes.split(';')[0]);
      expect((await esta.get('/api/auth/me')).status).toBe(200);
      expect((await cambiar(esta, NUEVA, 'Otra2026xx', 'Otra2026xx', { token: tokenAntes })).codigo).toBe('CSRF_INVALIDO');
      expect((await cambiar(esta, NUEVA, 'Otra2026xx')).estado).toBe(200);

      const me = await otra.get('/api/auth/me');
      expect([me.status, me.body.error.codigo]).toEqual([401, 'SESION_INVALIDA']);
    });

    it('el identificador anterior ya no abre ninguna sesión', async () => {
      const u = await nuevoUsuario();
      const ag = request.agent(app.getHttpServer());
      const cookieVieja = cookieDeSesion(await login(ag, u.email, CLAVE)).split(';')[0];
      expect((await cambiar(ag, CLAVE, NUEVA)).estado).toBe(200);
      expect((await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookieVieja)).status).toBe(401);
    });
  });

  describe('guardado condicional', () => {
    it('un UPDATE con un hash desactualizado o de un usuario inactivo no modifica nada', async () => {
      const u = await nuevoUsuario();
      const hash = await hashDe(u.id);
      const repo = app.get(UsuariosRepository);
      expect(await repo.actualizarContrasena(u.id, hashSync(NUEVA, 10), 'hash-desactualizado')).toBe(0);
      expect(await hashDe(u.id)).toBe(hash);
      await tmp.cambiar(u.id, 'estado', 'inactivo');
      expect(await repo.actualizarContrasena(u.id, hashSync(NUEVA, 10), hash)).toBe(0);
      expect(await hashDe(u.id)).toBe(hash);
    });

    it('si la contraseña cambió desde otro lado durante el pedido, responde 409 CUENTA_MODIFICADA', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const repo = app.get(UsuariosRepository);
      const original = repo.actualizarContrasena.bind(repo);
      repo.actualizarContrasena = (id, nuevo) => original(id, nuevo, 'leido-antes-de-otro-cambio');
      try {
        expect((await cambiar(ag, CLAVE, NUEVA)).codigo).toBe('CUENTA_MODIFICADA');
      } finally {
        repo.actualizarContrasena = original;
      }
      expect(compareSync(CLAVE, await hashDe(u.id))).toBe(true);
      expect((await ag.get('/api/auth/me')).status).toBe(200);
    });
  });

  describe('límite de intentos por sesión', () => {
    it('solo cuenta la contraseña actual incorrecta; al quinto fallo bloquea 15 minutos', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      for (let i = 0; i < 12; i++) {
        await cambiar(ag, CLAVE, 'Corta1');
        await cambiar(ag, '', NUEVA);
        await cambiar(ag, CLAVE, NUEVA, 'Otra2026xx');
      }
      for (let i = 1; i <= 5; i++) {
        expect([i, (await cambiar(ag, 'Equivocada2026', NUEVA)).codigo]).toEqual([i, 'CONTRASENA_ACTUAL_INCORRECTA']);
      }
      const r = await cambiar(ag, 'Equivocada2026', NUEVA);
      expect([r.estado, r.codigo]).toEqual([429, 'DEMASIADOS_INTENTOS']);
      expect(r.r.body.error.mensaje).toBe('Demasiados intentos fallidos. Volvé a intentar en 15 min.');
      expect((await cambiar(ag, CLAVE, NUEVA)).estado).toBe(429);
      expect(compareSync(CLAVE, await hashDe(u.id))).toBe(true);
      expect((await ag.get('/api/auth/me')).status).toBe(200);
      // El bloqueo es de esta sesión: otra sesión del mismo usuario puede cambiarla
      const otra = await sesionIniciada(app, u.email, CLAVE);
      expect((await cambiar(otra, CLAVE, NUEVA)).estado).toBe(200);
    });

    it('un cambio exitoso reinicia el contador', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      for (let i = 0; i < 4; i++) {
        await cambiar(ag, 'Equivocada2026', NUEVA);
      }
      expect((await cambiar(ag, CLAVE, NUEVA)).estado).toBe(200);
      for (let i = 1; i <= 5; i++) {
        expect((await cambiar(ag, 'Equivocada2026', 'Otra2026xx')).codigo).toBe('CONTRASENA_ACTUAL_INCORRECTA');
      }
    });

    it('al vencer el bloqueo se vuelve a evaluar y el contador empieza de cero', async () => {
      const servicio = app.get(CuentaService);
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      for (let i = 0; i < 5; i++) {
        await cambiar(ag, 'Equivocada2026', NUEVA);
      }
      expect((await cambiar(ag, CLAVE, NUEVA)).estado).toBe(429);
      const real = servicio.reloj;
      let desfase = BLOQUEO_CONTRASENA_MS - 61_000;
      servicio.reloj = () => real() + desfase;
      try {
        expect((await cambiar(ag, CLAVE, NUEVA)).r.body.error.mensaje).toBe('Demasiados intentos fallidos. Volvé a intentar en 2 min.');
        desfase = BLOQUEO_CONTRASENA_MS + 1000;
        for (let i = 1; i <= 5; i++) {
          expect([i, (await cambiar(ag, 'Equivocada2026', NUEVA)).estado]).toEqual([i, 422]);
        }
        expect((await cambiar(ag, 'Equivocada2026', NUEVA)).estado).toBe(429);
        desfase = 2 * BLOQUEO_CONTRASENA_MS + 2000;
        expect((await cambiar(ag, CLAVE, NUEVA)).estado).toBe(200);
      } finally {
        servicio.reloj = real;
      }
    });

    it('pedidos simultáneos de la misma sesión no esquivan el contador', async () => {
      const u = await nuevoUsuario();
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const token = await tokenCsrf(ag);
      const respuestas = await Promise.all(Array.from({ length: 8 }, () => cambiar(ag, 'Equivocada2026', NUEVA, NUEVA, { token })));
      const estados = respuestas.map((r) => r.estado).sort();
      expect(estados).toEqual([422, 422, 422, 422, 422, 429, 429, 429]);
    });
  });

  describe('datos propios', () => {
    const editar = async (ag: Agente, datos: object) => {
      const token = await tokenCsrf(ag);

      return ag.patch('/api/cuenta/datos').set('X-CSRF-Token', token).send(datos);
    };

    it('GET /api/cuenta devuelve solo los datos propios, sin contraseña; sin sesión 401', async () => {
      const u = await nuevoUsuario('paciente');
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const r = await ag.get('/api/cuenta').query({ id_usuario: 1 });
      expect(r.status).toBe(200);
      expect(r.body.data.cuenta).toMatchObject({ email: u.email, rol: 'paciente', dni: u.dni });
      expect(JSON.stringify(r.body)).not.toMatch(/\$2[aby]\$|"contrasena"|huella/);
      expect((await request(app.getHttpServer()).get('/api/cuenta')).status).toBe(401);
    });

    it('el paciente edita su contacto y su nombre; el DNI, el rol y el estado no cambian aunque se envíen', async () => {
      const u = await nuevoUsuario('paciente');
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const r = await editar(ag, {
        nombre: '  Ana  María ',
        apellido: 'Paz',
        email: u.email,
        telefono: '+54 11 5555-0000',
        obra_social: 'OSDE',
        genero: 'Femenino',
        fecha_nacimiento: '1990-01-01',
        dni: '11111111',
        rol: 'recepcionista',
        estado: 'inactivo',
        id_usuario: 1,
      });
      expect(r.status).toBe(200);
      expect(r.body.data.cuenta).toMatchObject({ nombre: 'Ana María', telefono: '+54 11 5555-0000', obra_social: 'OSDE' });
      expect(await tmp.fila(u.id)).toMatchObject({ nombre: 'Ana María', dni: u.dni, rol: 'paciente', estado: 'activo', telefono: '+54 11 5555-0000' });
    });

    it('el médico edita nombre y correo, pero no su especialidad; cambiar el correo exige la contraseña actual', async () => {
      const u = await nuevoUsuario('medico');
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const nuevoCorreo = 'Cambio.' + u.email;
      const sin = await editar(ag, { nombre: 'Luis', apellido: 'Gómez', email: nuevoCorreo, especialidad: 'Otra' });
      expect([sin.status, sin.body.error.campos]).toEqual([400, { contrasena_actual: 'requerido' }]);
      const mal = await editar(ag, { nombre: 'Luis', apellido: 'Gómez', email: nuevoCorreo, contrasena_actual: 'Equivocada2026' });
      expect([mal.status, mal.body.error.codigo]).toEqual([422, 'CONTRASENA_ACTUAL_INCORRECTA']);
      const ok = await editar(ag, { nombre: 'Luis', apellido: 'Gómez', email: nuevoCorreo, contrasena_actual: CLAVE, especialidad: 'Otra' });
      expect([ok.status, ok.body.data.cuenta.email, ok.body.data.cuenta.especialidad]).toEqual([200, nuevoCorreo.toLowerCase(), 'Prueba']);
      // Con el correo nuevo inicia sesión; la sesión actual sigue válida
      expect((await login(request.agent(app.getHttpServer()), nuevoCorreo, CLAVE)).status).toBe(200);
      expect((await ag.get('/api/auth/me')).body.data.usuario.email).toBe(nuevoCorreo.toLowerCase());
    });

    it('rechaza datos inválidos y un correo que ya usa otra persona', async () => {
      const u = await nuevoUsuario('paciente');
      const otro = await nuevoUsuario('paciente');
      const ag = await sesionIniciada(app, u.email, CLAVE);
      const invalido = await editar(ag, { nombre: 'A', apellido: 'Paz', email: 'no-es-correo', telefono: 'abc' });
      expect(invalido.status).toBe(400);
      expect(Object.keys(invalido.body.error.campos).sort()).toEqual(['email', 'nombre', 'telefono']);
      const repetido = await editar(ag, { nombre: 'Ana', apellido: 'Paz', email: otro.email, contrasena_actual: CLAVE });
      expect([repetido.status, repetido.body.error.codigo]).toEqual([409, 'DATO_DUPLICADO']);
      expect((await tmp.fila(u.id)).email).toBe(u.email);
    });
  });

  describe('contraseña provisoria', () => {
    it('hasta cambiarla solo puede ver su cuenta y cambiar la contraseña; después usa el sistema normalmente', async () => {
      const u = await nuevoUsuario('paciente');
      await pool.execute('UPDATE usuarios SET debe_cambiar_contrasena = 1 WHERE id_usuario = ?', [u.id]);
      const ag = await sesionIniciada(app, u.email, CLAVE);
      expect((await ag.get('/api/auth/me')).body.data.usuario.debe_cambiar_contrasena).toBe(true);
      expect((await ag.get('/api/cuenta')).status).toBe(200);
      const bloqueada = await ag.get('/api/paciente/turnos');
      expect([bloqueada.status, bloqueada.body.error.codigo]).toEqual([403, 'CAMBIO_CONTRASENA_REQUERIDO']);

      expect((await cambiar(ag, CLAVE, NUEVA)).estado).toBe(200);
      expect((await tmp.fila(u.id)).debe_cambiar_contrasena).toBe(0);
      expect((await ag.get('/api/auth/me')).body.data.usuario.debe_cambiar_contrasena).toBe(false);
      expect((await ag.get('/api/paciente/turnos')).status).toBe(200);
    });
  });
});
