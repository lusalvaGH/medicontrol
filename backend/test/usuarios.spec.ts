import { INestApplication } from '@nestjs/common';
import { compareSync } from 'bcryptjs';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import { POOL_DB } from '../src/database/database.module';
import { fechaHoy, instanteEnZona } from '../src/reglas/zona-horaria';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { DOMINIO_TEMPORAL, UsuarioTemporal, UsuariosTemporales, checksumBase, crearApp } from './helpers/app-prueba';
import { Agente, conToken, login, sesionIniciada, sinDatosSensibles, sumarDias } from './helpers/sesion-prueba';

/**
 * Etapa 4: Configuración de Recepción (los mismos casos que tests/usuarios_gestion_test.php).
 * Corre contra medicontrol_test con usuarios y turnos temporales que se borran al terminar.
 */
const CLAVE = 'Inicial2026';
const PROVISORIA = 'Provisoria2026';

describe('Gestión de usuarios (Configuración de Recepción)', () => {
  let app: INestApplication;
  let pool: Pool;
  let tmp: UsuariosTemporales;
  let huellaAntes: string;

  let recep: UsuarioTemporal;
  let otraRecep: UsuarioTemporal;
  let medico: UsuarioTemporal;
  let paciente: UsuarioTemporal;
  let agRecep: Agente;
  let agMedico: Agente;
  let agPaciente: Agente;

  const valido = (extra: Record<string, unknown> = {}) => ({
    nombre: 'Ana María',
    apellido: "D'Alessandro",
    dni: '94.111.222',
    email: 'Ana.Alta' + DOMINIO_TEMPORAL,
    contrasena: PROVISORIA,
    contrasena_confirmacion: PROVISORIA,
    ...extra,
  });
  const listar = (query: Record<string, string>) => agRecep.get('/api/usuarios').query(query);
  const ids = (r: request.Response): number[] => (r.body.data?.usuarios ?? []).map((u: { id_usuario: number }) => u.id_usuario);
  const roles = (r: request.Response): string[] => [...new Set<string>((r.body.data?.usuarios ?? []).map((u: { rol: string }) => u.rol))];

  beforeAll(async () => {
    app = await crearApp();
    pool = app.get<Pool>(POOL_DB);
    tmp = UsuariosTemporales.de(app);
    await tmp.borrarTodos(); // restos de una ejecución anterior interrumpida
    huellaAntes = await checksumBase(pool);

    recep = await tmp.crearUsuario('recepcionista', CLAVE, { nombre: 'Persona', apellido: 'Temporal' });
    otraRecep = await tmp.crearUsuario('recepcionista', CLAVE, { nombre: 'Persona', apellido: 'Temporal' });
    medico = await tmp.crearUsuario('medico', CLAVE, { nombre: 'Persona', apellido: 'Temporal', especialidad: 'Especialidad Única Prueba' });
    paciente = await tmp.crearUsuario('paciente', CLAVE, { nombre: 'Persona', apellido: 'Temporal' });
    agRecep = await sesionIniciada(app, recep.email, CLAVE);
    agMedico = await sesionIniciada(app, medico.email, CLAVE);
    agPaciente = await sesionIniciada(app, paciente.email, CLAVE);
  });

  afterAll(async () => {
    await tmp?.borrarTodos();
    if (pool) {
      expect(await tmp.cantidad()).toBe(0);
      expect(await tmp.cantidadTurnos()).toBe(0);
      expect(await checksumBase(pool)).toBe(huellaAntes);
    }
    await app?.close();
  });

  describe('permisos y CSRF', () => {
    const rutas = (): [string, string][] => [
      ['GET', '/api/usuarios'],
      ['POST', '/api/usuarios'],
      ['GET', `/api/usuarios/${paciente.id}`],
      ['PATCH', `/api/usuarios/${paciente.id}`],
      ['POST', `/api/usuarios/${paciente.id}/baja`],
      ['POST', `/api/usuarios/${paciente.id}/reactivacion`],
      ['POST', `/api/usuarios/${paciente.id}/contrasena-provisoria`],
    ];
    const pedir = async (agente: Agente | null, metodo: string, ruta: string, token = true) => {
      const cliente = agente ?? request(app.getHttpServer());
      const m = metodo.toLowerCase() as 'get' | 'post' | 'patch';
      if (metodo === 'GET' || !agente || !token) {
        return cliente[m](ruta).send({});
      }

      return conToken(agente, m as 'post' | 'patch', ruta, {});
    };

    it('sin sesión responde 401 en todas las rutas', async () => {
      for (const [metodo, ruta] of rutas()) {
        const r = await pedir(null, metodo, ruta);
        expect([metodo, ruta, r.status]).toEqual([metodo, ruta, 401]);
      }
    });

    it('médico y paciente reciben 403 SIN_PERMISO, aun con token CSRF', async () => {
      for (const agente of [agMedico, agPaciente]) {
        for (const [metodo, ruta] of rutas()) {
          const r = await pedir(agente, metodo, ruta);
          expect([metodo, ruta, r.status, r.body.error?.codigo]).toEqual([metodo, ruta, 403, 'SIN_PERMISO']);
        }
      }
    });

    it('recepción sin token CSRF recibe 403 CSRF_INVALIDO en las escrituras', async () => {
      for (const [metodo, ruta] of rutas().filter(([m]) => m !== 'GET')) {
        const r = await pedir(agRecep, metodo, ruta, false);
        expect([metodo, ruta, r.status, r.body.error?.codigo]).toEqual([metodo, ruta, 403, 'CSRF_INVALIDO']);
      }
    });

    it('DELETE no existe: no hay borrado físico por la API (405)', async () => {
      const r = await conToken(agRecep, 'delete', `/api/usuarios/${paciente.id}`);
      expect(r.status).toBe(405);
      expect(r.body).toEqual({ ok: false, error: { codigo: 'METODO_NO_PERMITIDO', mensaje: 'Método no permitido para esta ruta.' } });
      expect((await request(app.getHttpServer()).delete(`/api/usuarios/${paciente.id}`)).status).toBe(405);
    });

    it('un id que no es número no es una ruta (404), como {id} en PHP', async () => {
      for (const ruta of ['/api/usuarios/abc', '/api/usuarios/-1', '/api/usuarios/1.5', '/api/usuarios/1/baja/x']) {
        const r = await agRecep.get(ruta);
        expect([ruta, r.status, r.body.error?.codigo]).toEqual([ruta, 404, 'RUTA_NO_ENCONTRADA']);
      }
    });
  });

  describe('listado y detalle', () => {
    it('Personal lista médicos y recepcionistas, sin pacientes ni datos sensibles', async () => {
      const r = await listar({ tipo: 'personal', buscar: 'Persona Temporal' });
      expect(r.status).toBe(200);
      expect(ids(r)).toEqual(expect.arrayContaining([medico.id, otraRecep.id, recep.id]));
      expect(roles(r)).not.toContain('paciente');
      expect(sinDatosSensibles(r.body, CLAVE)).toBe(true);
      const fila = (id: number) => r.body.data.usuarios.find((u: { id_usuario: number }) => u.id_usuario === id);
      expect(fila(medico.id).gestionable).toBe(true);
      expect(fila(otraRecep.id).gestionable).toBe(false);
      expect(Object.keys(fila(medico.id))).toEqual([
        'id_usuario', 'nombre', 'apellido', 'dni', 'email', 'rol', 'estado', 'especialidad', 'matricula', 'obra_social', 'telefono', 'gestionable',
      ]);
      expect(r.body.data).toMatchObject({ pagina: 1, por_pagina: 10 });
      expect(r.body.data.especialidades).toContain('Especialidad Única Prueba');
    });

    it('Pacientes: busca por DNI y por correo, y no incluye personal', async () => {
      const r = await listar({ tipo: 'pacientes', buscar: paciente.dni });
      expect(ids(r)).toEqual([paciente.id]);
      expect(roles(r)).toEqual(['paciente']);
      expect(ids(await listar({ tipo: 'pacientes', buscar: paciente.email }))).toEqual([paciente.id]);
    });

    it('Personal: busca por especialidad', async () => {
      expect(ids(await listar({ tipo: 'personal', buscar: 'Especialidad Única Prueba' }))).toEqual([medico.id]);
    });

    it('% y comillas en la búsqueda se toman como texto', async () => {
      expect((await listar({ tipo: 'pacientes', buscar: '%' })).body.data.total).toBe(0);
      expect((await listar({ tipo: 'pacientes', buscar: "' OR 1=1 -- " })).body.data.total).toBe(0);
    });

    it('parámetros inválidos responden 400 DATOS_INVALIDOS', async () => {
      const casos: Record<string, string>[] = [{ tipo: 'otros' }, { estado: 'borrado' }, { pagina: '0' }, { pagina: 'abc' }, { pagina: '1234567' }, { buscar: 'a'.repeat(81) }];
      for (const q of casos) {
        const r = await listar(q);
        expect([q, r.status, r.body.error?.codigo]).toEqual([q, 400, 'DATOS_INVALIDOS']);
      }
    });

    it('la búsqueda de 80 caracteres se acepta (el límite cuenta caracteres, no bytes)', async () => {
      expect((await listar({ buscar: 'ñ'.repeat(80) })).status).toBe(200);
    });

    it('paginación de a 10, sin superposición', async () => {
      for (let i = 0; i < 12; i++) {
        await tmp.crearUsuario('paciente', CLAVE, { apellido: 'Paginado' });
      }
      const p1 = await listar({ tipo: 'pacientes', buscar: 'Paginado', pagina: '1' });
      const p2 = await listar({ tipo: 'pacientes', buscar: 'Paginado', pagina: '2' });
      expect(p1.body.data).toMatchObject({ total: 12, paginas: 2 });
      expect(ids(p1)).toHaveLength(10);
      expect(ids(p2)).toHaveLength(2);
      expect(ids(p1).filter((id) => ids(p2).includes(id))).toEqual([]);
      const p9 = await listar({ tipo: 'pacientes', buscar: 'Paginado', pagina: '9' });
      expect(p9.status).toBe(200);
      expect(ids(p9)).toEqual([]);
    });

    it('detalle con datos de perfil y sin datos sensibles; otro recepcionista se puede consultar', async () => {
      const r = await agRecep.get(`/api/usuarios/${paciente.id}`);
      expect(r.status).toBe(200);
      expect(r.body.data.usuario).toHaveProperty('direccion');
      expect(r.body.data.usuario).toHaveProperty('fecha_nacimiento');
      expect(sinDatosSensibles(r.body)).toBe(true);
      expect((await agRecep.get(`/api/usuarios/${otraRecep.id}`)).status).toBe(200);
      const no = await agRecep.get('/api/usuarios/999999');
      expect([no.status, no.body.error.codigo]).toEqual([404, 'USUARIO_NO_ENCONTRADO']);
    });
  });

  describe('altas', () => {
    let cuantosAntes: number;

    it('alta de paciente: 201, datos normalizados, rol y estado fijos, contraseña con bcrypt $2y$', async () => {
      const r = await conToken(agRecep, 'post', '/api/usuarios', valido({ rol: 'paciente', estado: 'inactivo', id_usuario: 1, contrasena_hash: 'x' }));
      expect(r.status).toBe(201);
      expect(sinDatosSensibles(r.body, PROVISORIA)).toBe(true);
      const id = r.body.data.usuario.id_usuario;
      expect(id).not.toBe(1);
      const fila = await tmp.fila(id);
      expect(fila).toMatchObject({ rol: 'paciente', estado: 'activo', obra_social: 'Particular', dni: '94111222', email: 'ana.alta' + DOMINIO_TEMPORAL });
      expect(String(fila.contrasena).startsWith('$2y$10$')).toBe(true);
      expect(compareSync(PROVISORIA, fila.contrasena)).toBe(true);
      expect(r.body.data.usuario.gestionable).toBe(true);
    });

    it('el paciente creado puede iniciar sesión con su contraseña', async () => {
      expect((await login(request.agent(app.getHttpServer()), 'ana.alta' + DOMINIO_TEMPORAL, PROVISORIA)).status).toBe(200);
    });

    it('alta de médico con especialidad y matrícula', async () => {
      const r = await conToken(agRecep, 'post', '/api/usuarios', valido({ rol: 'medico', dni: '94111223', email: 'medico.alta' + DOMINIO_TEMPORAL, especialidad: 'Dermatología', matricula: 'MN-1234' }));
      expect(r.status).toBe(201);
      expect(await tmp.fila(r.body.data.usuario.id_usuario)).toMatchObject({ rol: 'medico', especialidad: 'Dermatología', matricula: 'MN-1234' });
      cuantosAntes = await tmp.cantidad();
    });

    it('no se pueden crear recepcionistas (403) y el rol debe ser válido (400)', async () => {
      const r = await conToken(agRecep, 'post', '/api/usuarios', valido({ rol: 'recepcionista', dni: '94111224', email: 'x1' + DOMINIO_TEMPORAL }));
      expect([r.status, r.body.error.codigo]).toEqual([403, 'SIN_PERMISO']);
      for (const rol of ['administrador', ['medico'], undefined]) {
        const r2 = await conToken(agRecep, 'post', '/api/usuarios', valido({ rol, dni: '94111225', email: 'x2' + DOMINIO_TEMPORAL }));
        expect([rol, r2.status, r2.body.error.campos?.rol]).toEqual([rol, 400, 'Elegí un tipo de usuario válido.']);
      }
    });

    it.each([
      ['sin especialidad', { rol: 'medico', dni: '94111227', email: 'x4' + DOMINIO_TEMPORAL }, 'especialidad'],
      ['DNI con letras', { rol: 'paciente', dni: '12AB3456', email: 'x5' + DOMINIO_TEMPORAL }, 'dni'],
      ['correo inválido', { rol: 'paciente', dni: '94111228', email: 'no-es-correo' }, 'email'],
      ['nombre con números', { rol: 'paciente', dni: '94111229', email: 'x6' + DOMINIO_TEMPORAL, nombre: 'Ana99' }, 'nombre'],
      ['teléfono inválido', { rol: 'paciente', dni: '94111230', email: 'x7' + DOMINIO_TEMPORAL, telefono: 'llamar' }, 'telefono'],
      ['género fuera de lista', { rol: 'paciente', dni: '94111231', email: 'x8' + DOMINIO_TEMPORAL, genero: 'Administrador' }, 'genero'],
      ['contraseña corta', { rol: 'paciente', dni: '94111232', email: 'x9' + DOMINIO_TEMPORAL, contrasena: 'Ab1', contrasena_confirmacion: 'Ab1' }, 'contrasena'],
      ['contraseñas distintas', { rol: 'paciente', dni: '94111233', email: 'x10' + DOMINIO_TEMPORAL, contrasena_confirmacion: 'Otra2026xx' }, 'contrasena_confirmacion'],
      ['matrícula inválida', { rol: 'medico', dni: '94111234', email: 'x11' + DOMINIO_TEMPORAL, especialidad: 'Prueba', matricula: '<script>' }, 'matricula'],
      ['fecha de nacimiento futura', { rol: 'paciente', dni: '94111236', email: 'x13' + DOMINIO_TEMPORAL, fecha_nacimiento: '2999-01-01' }, 'fecha_nacimiento'],
    ])('alta con %s: 400 marcando el campo', async (_nombre, extra, campo) => {
      const r = await conToken(agRecep, 'post', '/api/usuarios', valido(extra));
      expect(r.status).toBe(400);
      expect(r.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(r.body.error.campos).toHaveProperty(campo);
    });

    it('correo o DNI duplicados: 409 marcando el campo, sin distinguir mayúsculas', async () => {
      const r = await conToken(agRecep, 'post', '/api/usuarios', valido({ rol: 'paciente', dni: '94111235', email: 'ANA.ALTA' + DOMINIO_TEMPORAL }));
      expect([r.status, r.body.error.codigo, r.body.error.campos]).toEqual([409, 'DATO_DUPLICADO', { email: 'Ese correo ya está registrado.' }]);
      const r2 = await conToken(agRecep, 'post', '/api/usuarios', valido({ rol: 'medico', dni: '94111222', email: 'x12' + DOMINIO_TEMPORAL, especialidad: 'Prueba' }));
      expect([r2.status, r2.body.error.campos]).toEqual([409, { dni: 'Ese DNI ya está registrado.' }]);
    });

    it('dos altas simultáneas con el mismo correo crean un solo usuario', async () => {
      const datos = valido({ rol: 'paciente', dni: '94111240', email: 'simultaneo' + DOMINIO_TEMPORAL });
      const respuestas = await Promise.all([1, 2, 3].map((i) => conToken(agRecep, 'post', '/api/usuarios', { ...datos, dni: `9411124${i}` })));
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      const [filas] = await pool.query<any[]>('SELECT COUNT(*) AS n FROM usuarios WHERE email = ?', ['simultaneo' + DOMINIO_TEMPORAL]);
      expect(Number(filas[0].n)).toBe(1);
      cuantosAntes += 1;
    });

    it('los envíos rechazados no crearon usuarios', async () => {
      expect(await tmp.cantidad()).toBe(cuantosAntes);
    });
  });

  describe('modificación', () => {
    const datosPaciente = {
      nombre: 'Lucía', apellido: 'Cambiada', dni: '94.222.333', email: 'Lucia.Mod' + DOMINIO_TEMPORAL,
      telefono: '+54 342 111-2222', direccion: 'San Martín 100', fecha_nacimiento: '1990-05-20', genero: 'Femenino', obra_social: 'IAPOS',
    };
    const datosMedico = () => ({ nombre: 'Carlos', apellido: 'Modificado', dni: medico.dni, email: medico.email, especialidad: 'Neurología', matricula: 'MP 77' });

    it('modifica datos personales y de perfil; la contraseña y el estado enviados se ignoran', async () => {
      const hashAntes = (await tmp.fila(paciente.id)).contrasena;
      const r = await conToken(agRecep, 'patch', `/api/usuarios/${paciente.id}`, { ...datosPaciente, contrasena: 'Hackeada2026', estado: 'inactivo' });
      expect(r.status).toBe(200);
      expect(sinDatosSensibles(r.body)).toBe(true);
      const fila = await tmp.fila(paciente.id);
      expect(fila).toMatchObject({ nombre: 'Lucía', dni: '94222333', email: 'lucia.mod' + DOMINIO_TEMPORAL, telefono: '+54 342 111-2222', obra_social: 'IAPOS', fecha_nacimiento: '1990-05-20', genero: 'Femenino', estado: 'activo' });
      expect(fila.contrasena).toBe(hashAntes);
      expect(r.body.data.usuario).toMatchObject({ nombre: 'Lucía', direccion: 'San Martín 100' });
      expect((await conToken(agRecep, 'patch', `/api/usuarios/${paciente.id}`, datosPaciente)).status).toBe(200);
    });

    it('vaciar los datos opcionales del paciente los deja en NULL y la obra social en Particular', async () => {
      const r = await conToken(agRecep, 'patch', `/api/usuarios/${paciente.id}`, { ...datosPaciente, telefono: '', direccion: '', fecha_nacimiento: '', genero: '', obra_social: '' });
      expect(r.status).toBe(200);
      expect(await tmp.fila(paciente.id)).toMatchObject({ telefono: null, direccion: null, fecha_nacimiento: null, genero: null, obra_social: 'Particular' });
    });

    it('modifica médico: datos y perfil', async () => {
      const r = await conToken(agRecep, 'patch', `/api/usuarios/${medico.id}`, datosMedico());
      expect(r.status).toBe(200);
      expect(await tmp.fila(medico.id)).toMatchObject({ apellido: 'Modificado', especialidad: 'Neurología', matricula: 'MP 77' });
    });

    it('no se puede cambiar el rol; enviar el mismo rol se acepta', async () => {
      for (const rol of ['recepcionista', 'paciente', 'administrador', '', null, ['medico']]) {
        const r = await conToken(agRecep, 'patch', `/api/usuarios/${medico.id}`, { ...datosMedico(), rol });
        expect([rol, r.status, r.body.error?.codigo]).toEqual([rol, 403, 'CAMBIO_ROL_NO_PERMITIDO']);
      }
      expect((await conToken(agRecep, 'patch', `/api/usuarios/${medico.id}`, { ...datosMedico(), rol: 'medico' })).status).toBe(200);
      expect((await tmp.fila(medico.id)).rol).toBe('medico');
    });

    it('correo o DNI de otro usuario: 409; datos inválidos: 400; inexistente: 404', async () => {
      const r = await conToken(agRecep, 'patch', `/api/usuarios/${medico.id}`, { ...datosMedico(), email: 'lucia.mod' + DOMINIO_TEMPORAL });
      expect([r.status, Object.keys(r.body.error.campos)]).toEqual([409, ['email']]);
      const r2 = await conToken(agRecep, 'patch', `/api/usuarios/${medico.id}`, { ...datosMedico(), dni: '94222333' });
      expect([r2.status, Object.keys(r2.body.error.campos)]).toEqual([409, ['dni']]);
      expect((await conToken(agRecep, 'patch', `/api/usuarios/${medico.id}`, { ...datosMedico(), especialidad: '' })).status).toBe(400);
      expect((await conToken(agRecep, 'patch', '/api/usuarios/999999', datosMedico())).status).toBe(404);
    });

    it('no se puede modificar a otro recepcionista ni a sí mismo desde la gestión', async () => {
      const apellido = (await tmp.fila(otraRecep.id)).apellido;
      for (const u of [otraRecep, recep]) {
        const r = await conToken(agRecep, 'patch', `/api/usuarios/${u.id}`, { nombre: 'Persona', apellido: 'Atacado', dni: u.dni, email: u.email });
        expect([r.status, r.body.error.codigo]).toEqual([403, 'SIN_PERMISO']);
      }
      expect((await tmp.fila(otraRecep.id)).apellido).toBe(apellido);
    });
  });

  describe('bajas y reactivaciones', () => {
    it('nadie puede darse de baja a sí mismo; otro recepcionista no se da de baja ni se reactiva', async () => {
      const r = await conToken(agRecep, 'post', `/api/usuarios/${recep.id}/baja`);
      expect([r.status, r.body.error.codigo]).toEqual([403, 'BAJA_PROPIA_NO_PERMITIDA']);
      expect((await conToken(agRecep, 'post', `/api/usuarios/${otraRecep.id}/baja`)).status).toBe(403);
      expect((await conToken(agRecep, 'post', `/api/usuarios/${otraRecep.id}/reactivacion`)).status).toBe(403);
      expect((await conToken(agRecep, 'post', '/api/usuarios/999999/baja')).status).toBe(404);
      expect((await tmp.fila(otraRecep.id)).estado).toBe('activo');
    });

    for (const rol of ['medico', 'paciente'] as const) {
      it(`${rol}: los turnos futuros o en curso impiden la baja; los pasados, cancelados y atendidos no`, async () => {
        const hoy = fechaHoy();
        const manana = sumarDias(hoy, 1);
        const ayer = sumarDias(hoy, -1);
        const otroMedico = await tmp.crearUsuario('medico', CLAVE);
        const otroPaciente = await tmp.crearUsuario('paciente', CLAVE);
        const sujeto = await tmp.crearUsuario(rol, CLAVE);
        const [tPac, tMed] = rol === 'medico' ? [otroPaciente, sujeto] : [sujeto, otroMedico];
        const agSujeto = await sesionIniciada(app, sujeto.email, CLAVE);
        const baja = () => conToken(agRecep, 'post', `/api/usuarios/${sujeto.id}/baja`);

        const historial = [
          await tmp.agregarTurno(tPac, tMed, ayer, '09:00:00', 'confirmado'),
          await tmp.agregarTurno(tPac, tMed, manana, '09:00:00', 'cancelado'),
          await tmp.agregarTurno(tPac, tMed, manana, '09:30:00', 'atendido'),
        ];

        for (const estado of ['pendiente', 'confirmado', 'en_curso']) {
          const turno = await tmp.agregarTurno(tPac, tMed, manana, '10:00:00', estado);
          const r = await baja();
          expect([estado, r.status, r.body.error?.codigo]).toEqual([estado, 409, 'TURNOS_SIN_RESOLVER']);
          expect(r.body.error.mensaje).toBe(`${rol === 'medico' ? 'El médico' : 'El paciente'} tiene 1 turno(s) futuro(s) o en curso. Cancelalos o resolvelos desde la agenda antes de dar la baja.`);
          expect((await tmp.fila(sujeto.id)).estado).toBe('activo');
          await tmp.borrarTurno(turno);
        }
        const enCursoViejo = await tmp.agregarTurno(tPac, tMed, ayer, '10:00:00', 'en_curso');
        expect((await baja()).status).toBe(409);
        await tmp.borrarTurno(enCursoViejo);

        const r = await baja();
        expect(r.status).toBe(200);
        expect(r.body.data.usuario.estado).toBe('inactivo');
        expect((await tmp.fila(sujeto.id)).estado).toBe('inactivo');
        const [conservados] = await pool.query<any[]>('SELECT COUNT(*) AS n FROM turnos WHERE id_turno IN (?)', [historial]);
        expect(Number(conservados[0].n)).toBe(3);
        expect((await baja()).body.error.codigo).toBe('YA_INACTIVO');

        // Con la baja pierde el acceso: la sesión abierta se cierra y no puede volver a entrar
        const me = await agSujeto.get('/api/auth/me');
        expect([me.status, me.body.error.codigo]).toEqual([401, 'SESION_INVALIDA']);
        expect((await login(request.agent(app.getHttpServer()), sujeto.email, CLAVE)).status).toBe(401);

        const tipo = rol === 'medico' ? 'personal' : 'pacientes';
        expect(ids(await listar({ tipo, estado: 'inactivo', buscar: sujeto.dni }))).toEqual([sujeto.id]);
        expect(ids(await listar({ tipo, estado: 'activo', buscar: sujeto.dni }))).toEqual([]);

        const re = await conToken(agRecep, 'post', `/api/usuarios/${sujeto.id}/reactivacion`);
        expect([re.status, re.body.data?.usuario.estado]).toEqual([200, 'activo']);
        expect((await conToken(agRecep, 'post', `/api/usuarios/${sujeto.id}/reactivacion`)).body.error.codigo).toBe('YA_ACTIVO');
        expect((await login(request.agent(app.getHttpServer()), sujeto.email, CLAVE)).status).toBe(200);
      });
    }

    it('turnos del mismo día: cuenta la hora de la clínica, con el borde exacto (reloj fijo)', async () => {
      // Instante fijo en la zona de la clínica: no depende del horario real de ejecución
      const servicio = app.get(UsuariosService);
      const real = servicio.reloj;
      let ahora = instanteEnZona(2030, 6, 15, 12, 0, 0);
      servicio.reloj = () => ahora.getTime();
      try {
        const sujeto = await tmp.crearUsuario('paciente', CLAVE);
        const otroMedico = await tmp.crearUsuario('medico', CLAVE);
        const baja = () => conToken(agRecep, 'post', `/api/usuarios/${sujeto.id}/baja`);
        const sinResolver = async () => (await baja()).body.error?.mensaje.match(/tiene (\d+) turno/)?.[1];

        await tmp.agregarTurno(sujeto, otroMedico, '2030-06-15', '11:59:59', 'pendiente'); // un segundo antes: ya pasó
        await tmp.agregarTurno(sujeto, otroMedico, '2030-06-15', '12:00:00', 'pendiente'); // a la hora exacta: todavía cuenta
        await tmp.agregarTurno(sujeto, otroMedico, '2030-06-15', '12:00:01', 'confirmado');
        await tmp.agregarTurno(sujeto, otroMedico, '2030-06-15', '23:59:59', 'pendiente');
        expect(await sinResolver()).toBe('3');

        // En el último segundo del día solo cuenta el turno de esa misma hora
        ahora = instanteEnZona(2030, 6, 15, 23, 59, 59);
        expect(await sinResolver()).toBe('1');
        expect((await tmp.fila(sujeto.id)).estado).toBe('activo');

        // Al día siguiente ningún turno pendiente o confirmado del 15 impide la baja
        ahora = instanteEnZona(2030, 6, 16, 0, 0, 0);
        const r = await baja();
        expect([r.status, r.body.data?.usuario.estado]).toEqual([200, 'inactivo']);
      } finally {
        servicio.reloj = real;
      }
    });
  });

  describe('contraseña provisoria', () => {
    it('valida la política y la confirmación sin cambiar la contraseña', async () => {
      const sujeto = await tmp.crearUsuario('paciente', CLAVE);
      const ruta = `/api/usuarios/${sujeto.id}/contrasena-provisoria`;
      const hashAntes = (await tmp.fila(sujeto.id)).contrasena;
      const r = await conToken(agRecep, 'post', ruta, { contrasena: 'Ab1', contrasena_confirmacion: 'Ab1' });
      expect([r.status, r.body.error.codigo, Object.keys(r.body.error.campos)]).toEqual([422, 'CONTRASENA_NO_VALIDA', ['contrasena']]);
      const r2 = await conToken(agRecep, 'post', ruta, { contrasena: PROVISORIA, contrasena_confirmacion: 'Otra2026xx' });
      expect([r2.status, Object.keys(r2.body.error.campos)]).toEqual([422, ['contrasena_confirmacion']]);
      expect((await conToken(agRecep, 'post', ruta, {})).status).toBe(422);
      expect((await tmp.fila(sujeto.id)).contrasena).toBe(hashAntes);
    });

    it('asigna la provisoria con bcrypt y cierra las sesiones abiertas de ese usuario', async () => {
      const sujeto = await tmp.crearUsuario('medico', CLAVE);
      const agSujeto = await sesionIniciada(app, sujeto.email, CLAVE);
      const r = await conToken(agRecep, 'post', `/api/usuarios/${sujeto.id}/contrasena-provisoria`, { contrasena: PROVISORIA, contrasena_confirmacion: PROVISORIA });
      expect([r.status, r.body]).toEqual([200, { ok: true, data: { actualizada: true } }]);
      const hash = (await tmp.fila(sujeto.id)).contrasena;
      expect(hash.startsWith('$2y$10$')).toBe(true);
      expect(compareSync(PROVISORIA, hash)).toBe(true);
      expect((await agSujeto.get('/api/auth/me')).status).toBe(401);
      expect((await login(request.agent(app.getHttpServer()), sujeto.email, CLAVE)).status).toBe(401);
      expect((await login(request.agent(app.getHttpServer()), sujeto.email, PROVISORIA)).status).toBe(200);
    });

    it('no se aplica a sí mismo, a otro recepcionista ni a un usuario inexistente', async () => {
      const cuerpo = { contrasena: PROVISORIA, contrasena_confirmacion: PROVISORIA };
      const propia = await conToken(agRecep, 'post', `/api/usuarios/${recep.id}/contrasena-provisoria`, cuerpo);
      expect([propia.status, propia.body.error.mensaje]).toEqual([403, 'Tu propia contraseña se cambia desde Mi cuenta.']);
      expect((await conToken(agRecep, 'post', `/api/usuarios/${otraRecep.id}/contrasena-provisoria`, cuerpo)).status).toBe(403);
      expect((await conToken(agRecep, 'post', '/api/usuarios/999999/contrasena-provisoria', cuerpo)).status).toBe(404);
      expect(compareSync(CLAVE, (await tmp.fila(otraRecep.id)).contrasena)).toBe(true);
    });
  });
});
