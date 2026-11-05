import { INestApplication } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { POOL_DB } from '../src/database/database.module';
import { MENSAJE_REGISTRO_DUPLICADO } from '../src/usuarios/usuarios.service';
import { DOMINIO_TEMPORAL, UsuariosTemporales, checksumBase, crearApp } from './helpers/app-prueba';
import { Agente, login, sinDatosSensibles, tokenCsrf } from './helpers/sesion-prueba';

/**
 * Registro público de pacientes (los mismos casos de registro que tests/acceso_registro_test.php).
 * Corre contra medicontrol_test; los usuarios creados usan el dominio temporal y se borran al terminar.
 */
const CLAVE = 'Registro2026';

describe('Registro público de pacientes', () => {
  let app: INestApplication;
  let pool: Pool;
  let tmp: UsuariosTemporales;
  let huellaAntes: string;

  const valido = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Lucía',
    apellido: 'Registro',
    dni: '95.123.456',
    email: 'Lucia.Registro' + DOMINIO_TEMPORAL,
    telefono: '+54 342 456-7890',
    direccion: 'San Martín 1234',
    fecha_nacimiento: '1990-05-17',
    genero: 'Femenino',
    obra_social: 'OSDE',
    contrasena: CLAVE,
    contrasena_confirmacion: CLAVE,
    ...extra,
  });

  const anonimo = (): Agente => request.agent(app.getHttpServer());
  const registrar = async (agente: Agente, cuerpo: object) => {
    // Primero el token: el agente adjunta la cookie de sesión al armar el pedido
    const token = await tokenCsrf(agente, '/api/auth/csrf-inicio');

    return agente.post('/api/registro').set('X-CSRF-Token', token).send(cuerpo);
  };
  const usuarioPorEmail = async (email: string) => {
    const [filas] = await pool.query<RowDataPacket[]>(
      `SELECT u.id_usuario, u.rol, u.estado, u.dni, u.email, u.contrasena, p.telefono, p.direccion, p.fecha_nacimiento, p.genero, p.obra_social
       FROM usuarios u LEFT JOIN pacientes p ON p.id_usuario = u.id_usuario WHERE u.email = ?`,
      [email],
    );

    return filas;
  };
  const cantidadUsuarios = async (): Promise<number> => {
    const [[fila]] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM usuarios');

    return Number(fila.n);
  };

  beforeAll(async () => {
    app = await crearApp();
    pool = app.get<Pool>(POOL_DB);
    tmp = UsuariosTemporales.de(app);
    await tmp.borrarTodos(); // restos de una ejecución anterior interrumpida
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

  it('sin token CSRF se rechaza y no crea nada', async () => {
    const antes = await cantidadUsuarios();
    const r = await anonimo().post('/api/registro').send(valido());
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('CSRF_INVALIDO');
    expect(await cantidadUsuarios()).toBe(antes);
  });

  it('con datos inválidos responde 400 con el error de cada campo', async () => {
    const r = await registrar(anonimo(), valido({ nombre: '', dni: '12', email: 'no-es-correo', contrasena_confirmacion: 'Otra2026' }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(Object.keys(r.body.error.campos)).toEqual(expect.arrayContaining(['nombre', 'dni', 'email', 'contrasena_confirmacion']));
  });

  it.each([
    ['teléfono inválido', { telefono: 'llamar' }, 'telefono'],
    ['género fuera de lista', { genero: 'Administrador' }, 'genero'],
    ['fecha de nacimiento futura', { fecha_nacimiento: '2999-01-01' }, 'fecha_nacimiento'],
  ])('perfil con %s: 400 marcando el campo', async (_nombre, extra, campo) => {
    const r = await registrar(anonimo(), valido(extra));
    expect(r.status).toBe(400);
    expect(r.body.error.campos).toHaveProperty(campo);
  });

  it('rechaza una contraseña sin números', async () => {
    const r = await registrar(anonimo(), valido({ contrasena: 'SoloLetras', contrasena_confirmacion: 'SoloLetras' }));
    expect(r.status).toBe(400);
    expect(r.body.error.campos.contrasena).toBeTruthy();
  });

  it('un registro válido crea el usuario paciente y su perfil, aunque se envíe otro rol', async () => {
    const r = await registrar(anonimo(), valido({ rol: 'recepcionista', estado: 'inactivo' }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ ok: true, data: { registrado: true } });
    expect(sinDatosSensibles(r.body, CLAVE)).toBe(true);

    const [fila] = await usuarioPorEmail('lucia.registro' + DOMINIO_TEMPORAL);
    expect(fila).toBeDefined();
    expect(fila).toMatchObject({ rol: 'paciente', estado: 'activo', dni: '95123456', telefono: '+54 342 456-7890', genero: 'Femenino', obra_social: 'OSDE' });
    expect(fila.fecha_nacimiento).toBe('1990-05-17');
    // Mismo formato que password_hash de PHP: la versión PHP la verifica sin cambios
    expect(String(fila.contrasena)).toMatch(/^\$2y\$10\$/);
  });

  it('el mismo token CSRF no sirve para reenviar el formulario', async () => {
    const agente = anonimo();
    const token = await tokenCsrf(agente, '/api/auth/csrf-inicio');
    const primero = await agente.post('/api/registro').set('X-CSRF-Token', token).send(valido({ email: 'Reenvio' + DOMINIO_TEMPORAL, dni: '95.654.321' }));
    expect(primero.status).toBe(201);
    const reenvio = await agente.post('/api/registro').set('X-CSRF-Token', token).send(valido({ email: 'Reenvio2' + DOMINIO_TEMPORAL, dni: '95.654.322' }));
    expect(reenvio.status).toBe(403);
    expect(reenvio.body.error.codigo).toBe('CSRF_INVALIDO');
    expect(await usuarioPorEmail('reenvio2' + DOMINIO_TEMPORAL)).toHaveLength(0);
  });

  it('correo o DNI repetidos responden el mismo mensaje genérico, sin revelar cuál existe', async () => {
    const antes = await cantidadUsuarios();
    const correo = await registrar(anonimo(), valido({ dni: '95.777.888' }));
    const correoMayusculas = await registrar(anonimo(), valido({ dni: '95.777.889', email: 'LUCIA.REGISTRO' + DOMINIO_TEMPORAL.toUpperCase() }));
    const dni = await registrar(anonimo(), valido({ email: 'Otra.Persona' + DOMINIO_TEMPORAL }));

    for (const r of [correo, correoMayusculas, dni]) {
      expect(r.status).toBe(409);
      expect(r.body.error).toEqual({ codigo: 'REGISTRO_NO_DISPONIBLE', mensaje: MENSAJE_REGISTRO_DUPLICADO });
      expect(JSON.stringify(r.body)).not.toContain('ya está registrado');
    }
    expect(await cantidadUsuarios()).toBe(antes);
  });

  it('el paciente registrado inicia sesión como paciente y no accede a recepción', async () => {
    const agente = anonimo();
    const r = await login(agente, 'lucia.registro' + DOMINIO_TEMPORAL, CLAVE);
    expect(r.status).toBe(200);
    expect(r.body.data.usuario.rol).toBe('paciente');

    expect((await agente.get('/api/paciente/turnos')).status).toBe(200);
    expect((await agente.get('/api/usuarios')).status).toBe(403);
  });

  it('solo acepta POST', async () => {
    expect((await anonimo().get('/api/registro')).status).toBe(405);
  });
});
