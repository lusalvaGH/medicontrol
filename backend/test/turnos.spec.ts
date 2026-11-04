import { INestApplication } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import { POOL_DB } from '../src/database/database.module';
import { TURNOS_HORARIOS } from '../src/reglas/turnos.reglas';
import { fechaHoy, instanteEnZona } from '../src/reglas/zona-horaria';
import { TurnosRepository } from '../src/turnos/turnos.repository';
import { TurnosService } from '../src/turnos/turnos.service';
import { MOTIVO_TEMPORAL, UsuarioTemporal, UsuariosTemporales, checksumBase, crearApp } from './helpers/app-prueba';
import { Agente, conToken, sesionIniciada, sumarDias } from './helpers/sesion-prueba';

/**
 * Etapa 5: turnos (los casos de tests/api_escritura_test.php y tests/api_lectura_test.php),
 * agenda del médico y turnos del paciente. Corre contra medicontrol_test con usuarios y turnos
 * temporales que se borran al terminar.
 */
const CLAVE = 'Inicial2026';

describe('Turnos', () => {
  let app: INestApplication;
  let pool: Pool;
  let tmp: UsuariosTemporales;
  let huellaAntes: string;

  let recep: UsuarioTemporal;
  let medico: UsuarioTemporal;
  let otroMedico: UsuarioTemporal;
  let pacientes: UsuarioTemporal[];
  let agRecep: Agente;
  let agMedico: Agente;
  let agOtroMedico: Agente;
  let agPaciente: Agente;

  const hoy = fechaHoy();
  const dia1 = sumarDias(hoy, 20);
  const dia2 = sumarDias(hoy, 21);
  const ayer = sumarDias(hoy, -1);
  let nuevo: Record<string, unknown>;

  const crearTurno = (extra: Record<string, unknown> = {}) => conToken(agRecep, 'post', '/api/turnos', { ...nuevo, ...extra });
  const filaTurno = async (id: number) => {
    const [filas] = await pool.query<any[]>('SELECT * FROM turnos WHERE id_turno = ?', [id]);

    return filas[0];
  };

  beforeAll(async () => {
    app = await crearApp();
    pool = app.get<Pool>(POOL_DB);
    tmp = UsuariosTemporales.de(app);
    await tmp.borrarTodos();
    huellaAntes = await checksumBase(pool);

    recep = await tmp.crearUsuario('recepcionista', CLAVE);
    medico = await tmp.crearUsuario('medico', CLAVE, { apellido: 'MedicoUno' });
    otroMedico = await tmp.crearUsuario('medico', CLAVE, { apellido: 'MedicoDos' });
    pacientes = [];
    for (let i = 0; i < 3; i++) {
      pacientes.push(await tmp.crearUsuario('paciente', CLAVE, { apellido: `PacienteTurnos${i}` }));
    }
    agRecep = await sesionIniciada(app, recep.email, CLAVE);
    agMedico = await sesionIniciada(app, medico.email, CLAVE);
    agOtroMedico = await sesionIniciada(app, otroMedico.email, CLAVE);
    agPaciente = await sesionIniciada(app, pacientes[0].email, CLAVE);
    nuevo = { id_paciente: pacientes[0].perfil, id_medico: medico.perfil, fecha: dia1, hora: '08:00', motivo_consulta: MOTIVO_TEMPORAL };
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

  describe('permisos por rol', () => {
    const rutasRecepcion = (): [string, string][] => [
      ['GET', `/api/turnos?fecha=${dia1}`],
      ['GET', '/api/turnos/resumen?mes=2026-10'],
      ['GET', '/api/turnos/1'],
      ['POST', '/api/turnos'],
      ['PATCH', '/api/turnos/1'],
      ['POST', '/api/turnos/1/cancelacion'],
      ['GET', '/api/medicos'],
      ['GET', '/api/pacientes'],
      ['GET', `/api/medicos/${medico.perfil}/disponibilidad?fecha=${dia1}`],
    ];
    const pedir = (agente: Agente | null, metodo: string, ruta: string) => {
      const m = metodo.toLowerCase() as 'get' | 'post' | 'patch';
      if (!agente) {
        return request(app.getHttpServer())[m](ruta).send({});
      }

      return metodo === 'GET' ? agente.get(ruta) : conToken(agente, m as 'post' | 'patch', ruta, {});
    };

    it('sin sesión responde 401 en todas las rutas de turnos', async () => {
      for (const [metodo, ruta] of [...rutasRecepcion(), ['GET', '/api/medico/agenda'], ['GET', '/api/paciente/turnos']] as [string, string][]) {
        const r = await pedir(null, metodo, ruta);
        expect([metodo, ruta, r.status]).toEqual([metodo, ruta, 401]);
      }
    });

    it('médico y paciente reciben 403 en las rutas de recepción, aun con token CSRF', async () => {
      for (const agente of [agMedico, agPaciente]) {
        for (const [metodo, ruta] of rutasRecepcion()) {
          const r = await pedir(agente, metodo, ruta);
          expect([metodo, ruta, r.status, r.body.error?.codigo]).toEqual([metodo, ruta, 403, 'SIN_PERMISO']);
        }
      }
    });

    it('la agenda es solo del médico y los turnos propios solo del paciente', async () => {
      for (const agente of [agRecep, agPaciente]) {
        expect((await agente.get('/api/medico/agenda')).status).toBe(403);
      }
      for (const agente of [agRecep, agMedico]) {
        expect((await agente.get('/api/paciente/turnos')).status).toBe(403);
      }
    });

    it('recepción sin token CSRF o con uno incorrecto recibe 403 CSRF_INVALIDO', async () => {
      const sinToken = await agRecep.post('/api/turnos').send(nuevo);
      expect([sinToken.status, sinToken.body.error.codigo]).toEqual([403, 'CSRF_INVALIDO']);
      const malo = await agRecep.post('/api/turnos').set('X-CSRF-Token', '0'.repeat(64)).send(nuevo);
      expect(malo.body.error.codigo).toBe('CSRF_INVALIDO');
      for (const [m, ruta] of [['patch', '/api/turnos/1'], ['post', '/api/turnos/1/cancelacion']] as const) {
        expect((await agRecep[m](ruta).send({})).body.error.codigo).toBe('CSRF_INVALIDO');
      }
    });

    it('DELETE no existe (405) y un id no numérico no es una ruta (404)', async () => {
      expect((await conToken(agRecep, 'delete', '/api/turnos/1')).status).toBe(405);
      expect((await agRecep.get('/api/turnos/abc')).status).toBe(404);
      expect((await agRecep.get('/api/medicos/abc/disponibilidad?fecha=' + dia1)).status).toBe(404);
    });
  });

  describe('registro', () => {
    let idA: number;

    it('POST vacío responde 400 con los 5 campos', async () => {
      const r = await conToken(agRecep, 'post', '/api/turnos', {});
      expect([r.status, r.body.error.codigo]).toEqual([400, 'DATOS_INVALIDOS']);
      expect(r.body.error.campos).toEqual({ id_paciente: 'requerido', id_medico: 'requerido', fecha: 'invalida', hora: 'invalida', motivo_consulta: 'requerido' });
    });

    it.each([
      ['hora no permitida 07:13', { hora: '07:13' }, 422, 'HORARIO_NO_PERMITIDO'],
      ['hora inválida 99:99', { hora: '99:99' }, 400, 'DATOS_INVALIDOS'],
      ['fecha inválida 2026-02-30', { fecha: '2026-02-30' }, 400, 'DATOS_INVALIDOS'],
      ['fecha pasada (ayer)', { fecha: ayer, hora: '10:00' }, 422, 'FECHA_PASADA'],
      ['paciente inexistente', { id_paciente: 999999 }, 422, 'PACIENTE_NO_DISPONIBLE'],
      ['médico inexistente', { id_medico: 999999 }, 422, 'MEDICO_NO_DISPONIBLE'],
      ['motivo vacío', { motivo_consulta: '   ' }, 400, 'DATOS_INVALIDOS'],
      ['motivo de 256 caracteres', { motivo_consulta: 'a'.repeat(256) }, 400, 'DATOS_INVALIDOS'],
      ['id_paciente no numérico', { id_paciente: 'abc' }, 400, 'DATOS_INVALIDOS'],
      ['id_paciente negativo', { id_paciente: -3 }, 400, 'DATOS_INVALIDOS'],
      ['id_medico decimal', { id_medico: 1.5 }, 400, 'DATOS_INVALIDOS'],
      ['hora como lista', { hora: ['08:00'] }, 400, 'DATOS_INVALIDOS'],
    ])('con %s responde %i %s', async (_nombre, cambio, estado, codigo) => {
      const r = await crearTurno(cambio);
      expect([r.status, r.body.error?.codigo]).toEqual([estado, codigo]);
    });

    it('paciente o médico inactivos: 422 y no aparecen en el catálogo', async () => {
      const inactivo = await tmp.crearUsuario('paciente', CLAVE, { estado: 'inactivo', apellido: 'PacienteTurnosInactivo' });
      const medicoInactivo = await tmp.crearUsuario('medico', CLAVE, { estado: 'inactivo' });
      expect((await crearTurno({ id_paciente: inactivo.perfil })).body.error.codigo).toBe('PACIENTE_NO_DISPONIBLE');
      expect((await crearTurno({ id_medico: medicoInactivo.perfil })).body.error.codigo).toBe('MEDICO_NO_DISPONIBLE');
      const lista = await agRecep.get('/api/pacientes').query({ buscar: 'PacienteTurnos', limite: '100' });
      const ids = lista.body.data.pacientes.map((p: { id_paciente: number }) => p.id_paciente);
      expect(ids).toEqual(expect.arrayContaining(pacientes.map((p) => p.perfil)));
      expect(ids).not.toContain(inactivo.perfil);
      expect((await agRecep.get('/api/medicos')).body.data.medicos.map((m: { id_medico: number }) => m.id_medico)).not.toContain(medicoInactivo.perfil);
      const disp = await agRecep.get(`/api/medicos/${medicoInactivo.perfil}/disponibilidad`).query({ fecha: dia1 });
      expect([disp.status, disp.body.error.codigo]).toEqual([404, 'MEDICO_NO_ENCONTRADO']);
    });

    it('registro válido: 201, queda pendiente y se guarda con la hora completa', async () => {
      const r = await crearTurno({ hora: ' 08:00 ', id_paciente: String(pacientes[0].perfil) });
      expect(r.status).toBe(201);
      const t = r.body.data.turno;
      idA = t.id_turno;
      expect(t).toMatchObject({ estado: 'pendiente', fecha: dia1, hora: '08:00', id_paciente: pacientes[0].perfil, id_medico: medico.perfil, especialidad: 'Prueba' });
      expect(Object.keys(t)).toEqual(['id_turno', 'fecha', 'hora', 'estado', 'motivo_consulta', 'id_paciente', 'paciente', 'paciente_dni', 'obra_social', 'id_medico', 'medico', 'especialidad']);
      expect(t).not.toHaveProperty('notas_medicas');
      expect(await filaTurno(idA)).toMatchObject({ hora: '08:00:00', estado: 'pendiente', motivo_consulta: MOTIVO_TEMPORAL, id_paciente: pacientes[0].perfil });
    });

    it('el horario ocupado responde 409; el mismo horario con otro médico se registra', async () => {
      const r = await crearTurno({ id_paciente: pacientes[1].perfil });
      expect([r.status, r.body.error.codigo]).toEqual([409, 'HORARIO_OCUPADO']);
      expect((await crearTurno({ id_medico: otroMedico.perfil })).status).toBe(201);
    });

    it('detalle: 200 con los datos y sin notas médicas; inexistente 404', async () => {
      const r = await agRecep.get(`/api/turnos/${idA}`);
      expect(r.status).toBe(200);
      expect(r.body.data.turno).toMatchObject({ id_turno: idA, paciente_dni: pacientes[0].dni });
      expect(r.body.data.turno).not.toHaveProperty('notas_medicas');
      const no = await agRecep.get('/api/turnos/999999');
      expect([no.status, no.body.error.codigo]).toEqual([404, 'TURNO_NO_ENCONTRADO']);
      expect((await agRecep.get('/api/turnos/0')).status).toBe(404);
    });
  });

  describe('disponibilidad y catálogo', () => {
    it('devuelve los 19 horarios: 08:00 ocupado, 08:30 libre; ayer ninguno libre', async () => {
      const r = await agRecep.get(`/api/medicos/${medico.perfil}/disponibilidad`).query({ fecha: dia1 });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ id_medico: medico.perfil, fecha: dia1 });
      const estados = Object.fromEntries(r.body.data.horarios.map((h: { hora: string; estado: string }) => [h.hora, h.estado]));
      expect(Object.keys(estados)).toHaveLength(TURNOS_HORARIOS.length);
      expect([estados['08:00'], estados['08:30']]).toEqual(['ocupado', 'libre']);
      const pasado = await agRecep.get(`/api/medicos/${medico.perfil}/disponibilidad`).query({ fecha: ayer });
      expect(pasado.body.data.horarios.map((h: { estado: string }) => h.estado)).not.toContain('libre');
    });

    it('médico inexistente 404 y fecha inválida 400', async () => {
      expect((await agRecep.get('/api/medicos/999999/disponibilidad').query({ fecha: dia1 })).status).toBe(404);
      const r = await agRecep.get(`/api/medicos/${medico.perfil}/disponibilidad`).query({ fecha: '2026-13-01' });
      expect([r.status, r.body.error.codigo]).toEqual([400, 'FECHA_INVALIDA']);
    });

    it('GET /medicos lista los médicos activos de la base', async () => {
      const r = await agRecep.get('/api/medicos');
      const [filas] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM medicos m JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE u.estado = 'activo'");
      expect(r.body.data.medicos).toHaveLength(Number(filas[0].n));
      expect(Object.keys(r.body.data.medicos[0])).toEqual(['id_medico', 'nombre', 'apellido', 'especialidad']);
    });

    it('GET /pacientes: busca por DNI, limita entre 1 y 100 y rechaza búsquedas largas', async () => {
      const r = await agRecep.get('/api/pacientes').query({ buscar: pacientes[1].dni });
      expect(r.body.data.pacientes.map((p: { id_paciente: number }) => p.id_paciente)).toEqual([pacientes[1].perfil]);
      expect(Object.keys(r.body.data.pacientes[0])).toEqual(['id_paciente', 'nombre', 'apellido', 'dni', 'obra_social']);
      expect((await agRecep.get('/api/pacientes').query({ buscar: 'PacienteTurnos', limite: 'abc' })).body.data.pacientes).toHaveLength(1);
      expect((await agRecep.get('/api/pacientes').query({ buscar: 'PacienteTurnos', limite: '2' })).body.data.pacientes).toHaveLength(2);
      expect((await agRecep.get('/api/pacientes').query({ limite: '1e3' })).body.data.pacientes.length).toBeLessThanOrEqual(100);
      expect((await agRecep.get('/api/pacientes').query({ buscar: '%' })).body.data.pacientes).toEqual([]);
      const largo = await agRecep.get('/api/pacientes').query({ buscar: 'a'.repeat(81) });
      expect([largo.status, largo.body.error.codigo]).toEqual([400, 'BUSQUEDA_INVALIDA']);
    });

    it('con reloj fijo: los horarios de hoy ya pasados figuran pasados y no se puede reservar a la hora exacta', async () => {
      const servicio = app.get(TurnosService);
      const real = servicio.reloj;
      servicio.reloj = () => instanteEnZona(2030, 6, 14, 10, 0, 0).getTime();
      try {
        const r = await agRecep.get(`/api/medicos/${otroMedico.perfil}/disponibilidad`).query({ fecha: '2030-06-14' });
        const estados = Object.fromEntries(r.body.data.horarios.map((h: { hora: string; estado: string }) => [h.hora, h.estado]));
        expect([estados['09:30'], estados['10:00'], estados['10:30']]).toEqual(['pasado', 'pasado', 'libre']);
        expect((await crearTurno({ id_medico: otroMedico.perfil, fecha: '2030-06-14', hora: '10:00' })).body.error.codigo).toBe('FECHA_PASADA');
        expect((await crearTurno({ id_medico: otroMedico.perfil, fecha: '2030-06-14', hora: '10:30' })).status).toBe(201);
      } finally {
        servicio.reloj = real;
      }
    });
  });

  describe('modificación, transiciones y cancelación', () => {
    let idA: number;
    let idB: number;
    const patch = (id: number, datos: object) => conToken(agRecep, 'patch', `/api/turnos/${id}`, datos);

    beforeAll(async () => {
      idA = (await crearTurno({ fecha: dia2, hora: '08:00' })).body.data.turno.id_turno;
      idB = (await crearTurno({ fecha: dia2, hora: '10:00', id_paciente: pacientes[1].perfil })).body.data.turno.id_turno;
    });

    it('sin cambios responde 200 con sin_cambios', async () => {
      const r = await patch(idA, { fecha: dia2, hora: '08:00', estado: 'pendiente' });
      expect([r.status, r.body.data.sin_cambios, r.body.data.turno.id_turno]).toEqual([200, true, idA]);
    });

    it('reprograma y confirma; vuelve al horario anterior ya libre', async () => {
      const r = await patch(idA, { fecha: dia1, hora: '09:00', estado: 'confirmado' });
      expect([r.status, r.body.data.sin_cambios, r.body.data.turno.fecha, r.body.data.turno.estado]).toEqual([200, false, dia1, 'confirmado']);
      expect(await filaTurno(idA)).toMatchObject({ fecha: dia1, hora: '09:00:00', estado: 'confirmado' });
      expect((await patch(idA, { fecha: dia2, hora: '08:00', estado: 'confirmado' })).status).toBe(200);
    });

    it('rechaza horario ocupado, fecha pasada, horario no permitido y datos inválidos', async () => {
      expect((await patch(idA, { fecha: dia2, hora: '10:00', estado: 'confirmado' })).body.error.codigo).toBe('HORARIO_OCUPADO');
      expect((await patch(idA, { fecha: ayer, hora: '10:00', estado: 'confirmado' })).body.error).toMatchObject({ codigo: 'CAMBIO_NO_PERMITIDO', mensaje: 'La nueva fecha y hora ya pasaron. Elegí un horario futuro.' });
      expect((await patch(idA, { fecha: dia2, hora: '07:13', estado: 'confirmado' })).status).toBe(409);
      const r = await patch(idA, { fecha: dia2, hora: '99:99', estado: 'inexistente' });
      expect([r.status, r.body.error.campos]).toEqual([400, { hora: 'invalida', estado: 'invalido' }]);
      expect((await patch(999999, { fecha: dia2, hora: '08:00', estado: 'pendiente' })).status).toBe(404);
      // Igual que PHP: los datos se validan antes de buscar el turno
      expect((await patch(999999, {})).status).toBe(400);
    });

    it('confirmado → en_curso → atendido, y las transiciones prohibidas responden 409', async () => {
      expect((await patch(idA, { fecha: dia2, hora: '08:00', estado: 'en_curso' })).body.data.turno.estado).toBe('en_curso');
      expect((await patch(idA, { fecha: dia2, hora: '08:00', estado: 'en_curso' })).body.data.sin_cambios).toBe(true);
      expect((await patch(idA, { fecha: dia1, hora: '08:00', estado: 'en_curso' })).body.error.mensaje).toBe('No se puede cambiar la fecha u hora de un turno «En curso».');
      const c = await conToken(agRecep, 'post', `/api/turnos/${idA}/cancelacion`);
      expect([c.status, c.body.error.mensaje]).toEqual([409, 'No se puede cancelar un turno «En curso».']);
      expect((await patch(idA, { fecha: dia2, hora: '08:00', estado: 'atendido' })).body.data.turno.estado).toBe('atendido');
      expect((await patch(idA, { fecha: dia2, hora: '08:00', estado: 'pendiente' })).body.error.mensaje).toBe('El turno está «Atendido» y no se puede modificar.');
      expect((await conToken(agRecep, 'post', `/api/turnos/${idA}/cancelacion`)).status).toBe(409);
    });

    it('cancela un pendiente; dos veces responde YA_CANCELADO y no se puede reactivar', async () => {
      const r = await conToken(agRecep, 'post', `/api/turnos/${idB}/cancelacion`);
      expect([r.status, r.body.data.turno.estado]).toEqual([200, 'cancelado']);
      expect((await filaTurno(idB)).estado).toBe('cancelado');
      expect((await conToken(agRecep, 'post', `/api/turnos/${idB}/cancelacion`)).body.error.codigo).toBe('YA_CANCELADO');
      expect((await patch(idB, { fecha: dia2, hora: '10:00', estado: 'confirmado' })).status).toBe(409);
      expect((await conToken(agRecep, 'post', '/api/turnos/999999/cancelacion')).status).toBe(404);
    });

    it('[igual que PHP] el horario de un turno cancelado sigue ocupado', async () => {
      const r = await agRecep.get(`/api/medicos/${medico.perfil}/disponibilidad`).query({ fecha: dia2 });
      expect(r.body.data.horarios.find((h: { hora: string }) => h.hora === '10:00').estado).toBe('ocupado');
      expect((await crearTurno({ fecha: dia2, hora: '10:00' })).body.error.codigo).toBe('HORARIO_OCUPADO');
    });

    it('un UPDATE con valores leídos desactualizados no modifica nada', async () => {
      const repo = app.get(TurnosRepository);
      const leido = await repo.buscarParaActualizar(idB);
      expect(await repo.actualizarSiNoCambio(idB, { fecha: dia2, hora: '10:00:00', estado: 'pendiente' }, { ...leido!, estado: 'pendiente' })).toBe(0);
      expect((await filaTurno(idB)).estado).toBe('cancelado');
    });
  });

  describe('reservas simultáneas', () => {
    it('varias reservas simultáneas del mismo horario: se registra una sola', async () => {
      const respuestas = await Promise.all(pacientes.map((p) => crearTurno({ id_paciente: p.perfil, hora: '11:00' })));
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(respuestas.filter((r) => r.status === 409).every((r) => r.body.error.codigo === 'HORARIO_OCUPADO')).toBe(true);
      const [filas] = await pool.query<any[]>('SELECT COUNT(*) AS n FROM turnos WHERE id_medico = ? AND fecha = ? AND hora = ?', [medico.perfil, dia1, '11:00:00']);
      expect(Number(filas[0].n)).toBe(1);
    });

    it('si dos pedidos pasan la verificación a la vez, la restricción única frena al segundo (409)', async () => {
      const repo = app.get(TurnosRepository);
      const original = repo.horarioOcupado.bind(repo);
      repo.horarioOcupado = async () => false; // simula que los dos verificaron antes de que el otro guardara
      try {
        const respuestas = await Promise.all(pacientes.map((p) => crearTurno({ id_paciente: p.perfil, hora: '11:30' })));
        expect(respuestas.map((r) => [r.status, r.body.error?.codigo ?? null]).sort()).toEqual([
          [201, null],
          [409, 'HORARIO_OCUPADO'],
          [409, 'HORARIO_OCUPADO'],
        ]);
        // Lo mismo al reprogramar dos turnos al mismo horario
        const a = (await crearTurno({ hora: '12:00' })).body.data.turno.id_turno;
        const b = (await crearTurno({ hora: '12:30' })).body.data.turno.id_turno;
        const dos = await Promise.all([a, b].map((id) => conToken(agRecep, 'patch', `/api/turnos/${id}`, { fecha: dia1, hora: '13:00', estado: 'pendiente' })));
        expect(dos.map((r) => r.status).sort()).toEqual([200, 409]);
      } finally {
        repo.horarioOcupado = original;
      }
      const [filas] = await pool.query<any[]>('SELECT COUNT(*) AS n FROM turnos WHERE id_medico = ? AND fecha = ? AND hora IN (?, ?)', [medico.perfil, dia1, '11:30:00', '13:00:00']);
      expect(Number(filas[0].n)).toBe(2);
    });

    it('dos cancelaciones simultáneas del mismo turno: una sola se aplica', async () => {
      const id = (await crearTurno({ hora: '14:00' })).body.data.turno.id_turno;
      const respuestas = await Promise.all([1, 2].map(() => conToken(agRecep, 'post', `/api/turnos/${id}/cancelacion`)));
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  describe('consulta de agenda de recepción', () => {
    it('GET /turnos?fecha coincide con la consulta de la vista diaria', async () => {
      const r = await agRecep.get('/api/turnos').query({ fecha: dia1 });
      const [filas] = await pool.query<any[]>(
        `SELECT t.id_turno FROM turnos t JOIN pacientes p ON p.id_paciente = t.id_paciente JOIN usuarios up ON up.id_usuario = p.id_usuario
         JOIN medicos m ON m.id_medico = t.id_medico JOIN usuarios um ON um.id_usuario = m.id_usuario
         WHERE t.fecha = ? ORDER BY t.hora, t.id_turno`,
        [dia1],
      );
      expect(r.body.data.fecha).toBe(dia1);
      expect(r.body.data.turnos.map((t: { id_turno: number }) => t.id_turno)).toEqual(filas.map((f) => f.id_turno));
      for (const t of r.body.data.turnos) {
        expect(t).not.toHaveProperty('notas_medicas');
        expect(t.hora).toMatch(/^\d{2}:\d{2}$/);
      }
      expect((await agRecep.get('/api/turnos').query({ fecha: '1999-01-01' })).body.data.turnos).toEqual([]);
    });

    it.each([
      [{}, 'PARAMETRO_REQUERIDO'],
      [{ fecha: '2026-02-30' }, 'FECHA_INVALIDA'],
      [{ fecha: '27/10/2026' }, 'FECHA_INVALIDA'],
      [{ desde: '2026-10-01' }, 'FECHA_INVALIDA'],
      [{ desde: '2026-10-10', hasta: '2026-10-01' }, 'RANGO_INVALIDO'],
      [{ desde: '2026-10-01', hasta: '2026-11-12' }, 'RANGO_DEMASIADO_AMPLIO'],
    ])('GET /turnos con %j responde 400 %s', async (query, codigo) => {
      const r = await agRecep.get('/api/turnos').query(query);
      expect([r.status, r.body.error.codigo]).toEqual([400, codigo]);
    });

    it('rango de 42 días: devuelve los turnos de ese período ordenados', async () => {
      const r = await agRecep.get('/api/turnos').query({ desde: dia1, hasta: sumarDias(dia1, 41) });
      expect(r.status).toBe(200);
      const fechas = r.body.data.turnos.map((t: { fecha: string; hora: string }) => t.fecha + t.hora);
      expect(fechas).toEqual([...fechas].sort());
      expect(r.body.data.turnos.map((t: { fecha: string }) => t.fecha)).toEqual(expect.arrayContaining([dia1, dia2]));
    });

    it('resumen mensual coincide con la base y la suma por estado da el total', async () => {
      const mes = dia1.slice(0, 7);
      const r = await agRecep.get('/api/turnos/resumen').query({ mes });
      const [filas] = await pool.query<any[]>('SELECT fecha, COUNT(*) AS n FROM turnos WHERE fecha LIKE ? GROUP BY fecha', [mes + '-%']);
      expect(Object.fromEntries(Object.entries(r.body.data.dias).map(([d, c]: [string, any]) => [d, c.total]))).toEqual(Object.fromEntries(filas.map((f) => [f.fecha, Number(f.n)])));
      for (const c of Object.values<any>(r.body.data.dias)) {
        expect(c.pendiente + c.confirmado + c.en_curso + c.atendido + c.cancelado).toBe(c.total);
      }
      expect((await agRecep.get('/api/turnos/resumen').query({ mes: '1999-01' })).body.data).toEqual({ mes: '1999-01', dias: [] });
      for (const m of ['2026-13', '2026-1', 'abc', '']) {
        expect((await agRecep.get('/api/turnos/resumen').query({ mes: m })).status).toBe(400);
      }
    });
  });

  describe('agenda del médico y turnos del paciente', () => {
    it('el médico ve solo sus turnos del día, con notas y teléfono, aunque pida otro médico', async () => {
      await pool.query('UPDATE turnos SET notas_medicas = ? WHERE id_medico = ? AND fecha = ? AND hora = ?', ['Nota de prueba', medico.perfil, dia1, '08:00:00']);
      const r = await agMedico.get('/api/medico/agenda').query({ fecha: dia1, id_medico: otroMedico.perfil });
      expect(r.status).toBe(200);
      const [filas] = await pool.query<any[]>('SELECT id_turno FROM turnos WHERE id_medico = ? AND fecha = ? ORDER BY hora, id_turno', [medico.perfil, dia1]);
      expect(r.body.data.turnos.map((t: { id_turno: number }) => t.id_turno)).toEqual(filas.map((f) => f.id_turno));
      expect(r.body.data.turnos[0]).toMatchObject({ hora: '08:00', notas_medicas: 'Nota de prueba' });
      expect(Object.keys(r.body.data.turnos[0])).toEqual(['id_turno', 'fecha', 'hora', 'estado', 'motivo_consulta', 'notas_medicas', 'paciente', 'paciente_dni', 'obra_social', 'telefono']);
      const otro = await agOtroMedico.get('/api/medico/agenda').query({ fecha: dia1 });
      const propios = new Set(filas.map((f) => f.id_turno));
      expect(otro.body.data.turnos.length).toBeGreaterThan(0);
      expect(otro.body.data.turnos.filter((t: { id_turno: number }) => propios.has(t.id_turno))).toEqual([]);
    });

    it('sin fecha usa hoy en la zona de la clínica; una fecha inválida responde 400', async () => {
      expect((await agMedico.get('/api/medico/agenda')).body.data.fecha).toBe(fechaHoy());
      expect((await agMedico.get('/api/medico/agenda').query({ fecha: '2026-02-30' })).body.error.codigo).toBe('FECHA_INVALIDA');
    });

    it('el paciente ve solo sus turnos, ordenados, con los datos del médico y sin notas', async () => {
      const r = await agPaciente.get('/api/paciente/turnos').query({ id_paciente: pacientes[1].perfil });
      const [filas] = await pool.query<any[]>('SELECT id_turno FROM turnos WHERE id_paciente = ? ORDER BY fecha, hora, id_turno', [pacientes[0].perfil]);
      expect(r.status).toBe(200);
      expect(r.body.data.turnos.map((t: { id_turno: number }) => t.id_turno)).toEqual(filas.map((f) => f.id_turno));
      expect(r.body.data.turnos.length).toBeGreaterThan(0);
      expect(Object.keys(r.body.data.turnos[0])).toEqual(['id_turno', 'fecha', 'hora', 'estado', 'motivo_consulta', 'medico_nombre', 'medico_apellido', 'medico_especialidad']);
      expect(JSON.stringify(r.body)).not.toMatch(/notas_medicas|Nota de prueba/);
    });

    it('médico o paciente sin perfil: 404 PERFIL_NO_ENCONTRADO', async () => {
      const sinPerfil = await tmp.crearUsuario('medico', CLAVE, { perfil: false });
      const ag = await sesionIniciada(app, sinPerfil.email, CLAVE);
      expect((await ag.get('/api/medico/agenda')).body.error.codigo).toBe('PERFIL_NO_ENCONTRADO');
    });
  });

  describe('integración con la gestión de usuarios', () => {
    it('un turno registrado por la API impide la baja del paciente hasta que se cancela', async () => {
      const p = await tmp.crearUsuario('paciente', CLAVE);
      const id = (await crearTurno({ id_paciente: p.perfil, hora: '15:00' })).body.data.turno.id_turno;
      const baja = () => conToken(agRecep, 'post', `/api/usuarios/${p.id}/baja`);
      expect((await baja()).body.error.codigo).toBe('TURNOS_SIN_RESOLVER');
      expect((await conToken(agRecep, 'post', `/api/turnos/${id}/cancelacion`)).status).toBe(200);
      expect((await baja()).status).toBe(200);
      // Ya inactivo, no se le pueden registrar turnos
      expect((await crearTurno({ id_paciente: p.perfil, hora: '15:30' })).body.error.codigo).toBe('PACIENTE_NO_DISPONIBLE');
    });
  });
});
