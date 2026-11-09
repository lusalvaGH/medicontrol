import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { POOL_DB } from '../database/database.module';

/** Turno tal como lo ve recepción: sin notas médicas. */
export interface Turno {
  id_turno: number;
  fecha: string;
  hora: string;
  estado: string;
  motivo_consulta: string;
  id_paciente: number;
  paciente: string;
  paciente_dni: string;
  obra_social: string | null;
  id_medico: number;
  medico: string;
  especialidad: string;
}

/** Valores actuales de un turno tal como están en la base (hora HH:MM:SS), para validar cambios. */
export interface TurnoGuardado {
  id_turno: number;
  id_paciente: number;
  id_medico: number;
  fecha: string;
  hora: string;
  estado: string;
}

const SELECT_TURNO = `
  SELECT
    t.id_turno, t.fecha, t.hora, t.estado, t.motivo_consulta,
    p.id_paciente, CONCAT(up.nombre, ' ', up.apellido) AS paciente, up.dni AS paciente_dni, p.obra_social,
    m.id_medico, CONCAT(um.nombre, ' ', um.apellido) AS medico, m.especialidad
  FROM turnos t
  INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
  INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
  INNER JOIN medicos m ON m.id_medico = t.id_medico
  INNER JOIN usuarios um ON um.id_usuario = m.id_usuario`;

const ESTADOS_RESUMEN = ['pendiente', 'confirmado', 'en_curso', 'atendido', 'cancelado'] as const;

/**
 * Consultas de turnos (migradas de TurnosRepository.php y PersonasRepository.php, y las de
 * los paneles de médico y paciente). Es el único lugar del backend con SQL de turnos.
 */
@Injectable()
export class TurnosRepository {
  constructor(@Inject(POOL_DB) private readonly pool: Pool) {}

  // ── Lectura para recepción ────────────────────────────────────────────────

  async listarPorFecha(fecha: string): Promise<Turno[]> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(`${SELECT_TURNO} WHERE t.fecha = ? ORDER BY t.hora ASC, t.id_turno ASC`, [fecha]);

    return filas.map(formatear);
  }

  /** Turnos entre dos fechas inclusive, ordenados por fecha y hora. */
  async listarPorRango(desde: string, hasta: string): Promise<Turno[]> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(`${SELECT_TURNO} WHERE t.fecha BETWEEN ? AND ? ORDER BY t.fecha ASC, t.hora ASC, t.id_turno ASC`, [
      desde,
      hasta,
    ]);

    return filas.map(formatear);
  }

  async buscarPorId(idTurno: number): Promise<Turno | null> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(`${SELECT_TURNO} WHERE t.id_turno = ? LIMIT 1`, [idTurno]);

    return filas[0] ? formatear(filas[0]) : null;
  }

  /** Cantidad de turnos por día y por estado entre dos fechas: fecha => {total, pendiente, ...}. */
  async resumenMensual(inicio: string, fin: string): Promise<Record<string, Record<string, number>>> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT fecha, COUNT(*) AS total, ${ESTADOS_RESUMEN.map((e) => `SUM(estado = '${e}') AS ${e}`).join(', ')}
       FROM turnos WHERE fecha BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha`,
      [inicio, fin],
    );

    const dias: Record<string, Record<string, number>> = {};
    for (const { fecha, ...conteos } of filas) {
      dias[String(fecha)] = Object.fromEntries(Object.entries(conteos).map(([clave, valor]) => [clave, Number(valor)]));
    }

    return dias;
  }

  // ── Catálogo para registrar turnos ────────────────────────────────────────

  async buscarPacientes(texto: string, limite: number): Promise<{ id_paciente: number; nombre: string; apellido: string; dni: string; obra_social: string | null }[]> {
    // % y _ se buscan como texto, igual que addcslashes($texto, '%_\\')
    const patron = '%' + texto.replace(/[%_\\]/g, '\\$&') + '%';
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT p.id_paciente, u.nombre, u.apellido, u.dni, p.obra_social
       FROM pacientes p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
       WHERE u.estado = 'activo'
         AND (u.nombre LIKE ? OR u.apellido LIKE ? OR CONCAT(u.nombre, ' ', u.apellido) LIKE ? OR u.dni LIKE ?)
       ORDER BY u.apellido, u.nombre
       LIMIT ${Math.max(1, Math.trunc(limite))}`,
      [patron, patron, patron, patron],
    );

    return filas.map((f) => ({ id_paciente: Number(f.id_paciente), nombre: f.nombre, apellido: f.apellido, dni: f.dni, obra_social: f.obra_social }));
  }

  async listarMedicos(): Promise<{ id_medico: number; nombre: string; apellido: string; especialidad: string }[]> {
    const [filas] = await this.pool.query<RowDataPacket[]>(
      `SELECT m.id_medico, u.nombre, u.apellido, m.especialidad
       FROM medicos m INNER JOIN usuarios u ON u.id_usuario = m.id_usuario
       WHERE u.estado = 'activo' ORDER BY u.apellido, u.nombre`,
    );

    return filas.map((f) => ({ id_medico: Number(f.id_medico), nombre: f.nombre, apellido: f.apellido, especialidad: f.especialidad }));
  }

  async pacienteActivo(idPaciente: number): Promise<boolean> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM pacientes p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE p.id_paciente = ? AND u.estado = 'activo'",
      [idPaciente],
    );

    return filas.length > 0;
  }

  async medicoActivo(idMedico: number): Promise<boolean> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM medicos m INNER JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE m.id_medico = ? AND u.estado = 'activo'",
      [idMedico],
    );

    return filas.length > 0;
  }

  // ── Escritura ─────────────────────────────────────────────────────────────

  async buscarParaActualizar(idTurno: number): Promise<TurnoGuardado | null> {
    const [filas] = await this.pool.execute<RowDataPacket[]>('SELECT id_turno, id_paciente, id_medico, fecha, hora, estado FROM turnos WHERE id_turno = ? LIMIT 1', [idTurno]);

    return (filas[0] as TurnoGuardado | undefined) ?? null;
  }

  /**
   * Indica si el médico ya tiene un turno vigente en esa fecha y hora. Los cancelados no
   * ocupan el horario (migración 001: la restricción única tampoco los cuenta).
   */
  async horarioOcupado(idMedico: number, fecha: string, hora: string, exceptoTurno: number | null = null): Promise<boolean> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM turnos WHERE id_medico = ? AND fecha = ? AND hora = ? AND estado <> 'cancelado' AND id_turno <> ? LIMIT 1",
      [idMedico, fecha, hora, exceptoTurno ?? 0],
    );

    return filas.length > 0;
  }

  /** Indica si el paciente ya tiene un turno vigente en esa fecha y hora, con cualquier médico. */
  async pacienteOcupado(idPaciente: number, fecha: string, hora: string, exceptoTurno: number | null = null): Promise<boolean> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      "SELECT 1 FROM turnos WHERE id_paciente = ? AND fecha = ? AND hora = ? AND estado <> 'cancelado' AND id_turno <> ? LIMIT 1",
      [idPaciente, fecha, hora, exceptoTurno ?? 0],
    );

    return filas.length > 0;
  }

  /** Horas (HH:MM:SS) ocupadas por turnos vigentes del médico en una fecha. */
  async horasOcupadas(idMedico: number, fecha: string): Promise<string[]> {
    const [filas] = await this.pool.execute<RowDataPacket[]>("SELECT hora FROM turnos WHERE id_medico = ? AND fecha = ? AND estado <> 'cancelado'", [idMedico, fecha]);

    return filas.map((f) => String(f.hora));
  }

  /** Crea un turno pendiente y devuelve su id. Si el horario ya está tomado, la restricción única lo rechaza (1062). */
  async insertar(idPaciente: number, idMedico: number, fecha: string, hora: string, motivo: string): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta) VALUES (?, ?, ?, ?, 'pendiente', ?)",
      [idPaciente, idMedico, fecha, hora, motivo],
    );

    return r.insertId;
  }

  /** Actualiza fecha, hora y estado solo si el turno sigue con los valores leídos. Devuelve las filas modificadas. */
  async actualizarSiNoCambio(idTurno: number, nuevo: { fecha: string; hora: string; estado: string }, actual: TurnoGuardado): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>(
      'UPDATE turnos SET fecha = ?, hora = ?, estado = ? WHERE id_turno = ? AND fecha = ? AND hora = ? AND estado = ?',
      [nuevo.fecha, nuevo.hora, nuevo.estado, idTurno, actual.fecha, actual.hora, actual.estado],
    );

    return r.affectedRows;
  }

  /** Cancela el turno solo si sigue en el estado leído. Devuelve las filas modificadas. */
  async cancelarSiEstado(idTurno: number, estadoActual: string): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>("UPDATE turnos SET estado = 'cancelado' WHERE id_turno = ? AND estado = ?", [idTurno, estadoActual]);

    return r.affectedRows;
  }

  // ── Agenda del médico y turnos del paciente (consultas de panel/medico.php y panel/paciente.php) ──

  async idMedicoDeUsuario(idUsuario: number): Promise<number | null> {
    const [filas] = await this.pool.execute<RowDataPacket[]>('SELECT id_medico FROM medicos WHERE id_usuario = ? LIMIT 1', [idUsuario]);

    return filas[0] ? Number(filas[0].id_medico) : null;
  }

  async idPacienteDeUsuario(idUsuario: number): Promise<number | null> {
    const [filas] = await this.pool.execute<RowDataPacket[]>('SELECT id_paciente FROM pacientes WHERE id_usuario = ? LIMIT 1', [idUsuario]);

    return filas[0] ? Number(filas[0].id_paciente) : null;
  }

  /** Turnos de un día del médico, con sus notas y el teléfono del paciente (los ve solo ese médico). */
  async agendaDelMedico(idMedico: number, fecha: string) {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.id_turno, t.fecha, t.hora, t.estado, t.motivo_consulta, t.notas_medicas, t.id_paciente,
              CONCAT(up.nombre, ' ', up.apellido) AS paciente, up.dni AS paciente_dni, p.obra_social, p.telefono
       FROM turnos t
       INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
       INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
       WHERE t.id_medico = ? AND t.fecha = ?
       ORDER BY t.hora ASC, t.id_turno ASC`,
      [idMedico, fecha],
    );

    return filas.map((f) => ({ ...f, id_turno: Number(f.id_turno), id_paciente: Number(f.id_paciente), hora: String(f.hora).slice(0, 5) }));
  }

  /**
   * Historial de un paciente con este médico: solo los turnos que atendió o tiene asignados ese
   * médico, nunca los de otros profesionales (las notas son privadas de cada médico).
   */
  async historialConMedico(idMedico: number, idPaciente: number) {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.id_turno, t.fecha, t.hora, t.estado, t.motivo_consulta, t.notas_medicas
       FROM turnos t
       WHERE t.id_medico = ? AND t.id_paciente = ?
       ORDER BY t.fecha DESC, t.hora DESC, t.id_turno DESC`,
      [idMedico, idPaciente],
    );

    return filas.map((f) => ({ ...f, id_turno: Number(f.id_turno), hora: String(f.hora).slice(0, 5) }));
  }

  /** Datos básicos del paciente para el encabezado del historial. */
  async pacienteResumen(idPaciente: number): Promise<{ id_paciente: number; paciente: string; paciente_dni: string; obra_social: string | null } | null> {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT p.id_paciente, CONCAT(u.nombre, ' ', u.apellido) AS paciente, u.dni AS paciente_dni, p.obra_social
       FROM pacientes p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE p.id_paciente = ? LIMIT 1`,
      [idPaciente],
    );

    return filas[0] ? { id_paciente: Number(filas[0].id_paciente), paciente: filas[0].paciente, paciente_dni: filas[0].paciente_dni, obra_social: filas[0].obra_social } : null;
  }

  async esTurnoDelMedico(idTurno: number, idMedico: number): Promise<boolean> {
    const [filas] = await this.pool.execute<RowDataPacket[]>('SELECT 1 FROM turnos WHERE id_turno = ? AND id_medico = ? LIMIT 1', [idTurno, idMedico]);

    return filas.length > 0;
  }

  /** Guarda las notas solo si el turno es de ese médico (panel/medico.php). Devuelve las filas modificadas. */
  async guardarNotas(idTurno: number, idMedico: number, notas: string | null): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>('UPDATE turnos SET notas_medicas = ? WHERE id_turno = ? AND id_medico = ?', [notas, idTurno, idMedico]);

    return r.affectedRows;
  }

  /** Turnos del paciente con los datos del médico (mismas columnas que vista_paciente_turnos). */
  async turnosDelPaciente(idPaciente: number) {
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT t.id_turno, t.fecha, t.hora, t.estado, t.motivo_consulta,
              um.nombre AS medico_nombre, um.apellido AS medico_apellido, m.especialidad AS medico_especialidad
       FROM turnos t
       INNER JOIN medicos m ON m.id_medico = t.id_medico
       INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
       WHERE t.id_paciente = ?
       ORDER BY t.fecha ASC, t.hora ASC, t.id_turno ASC`,
      [idPaciente],
    );

    return filas.map((f) => ({ ...f, id_turno: Number(f.id_turno), hora: String(f.hora).slice(0, 5) }));
  }
}

function formatear(fila: RowDataPacket): Turno {
  return {
    ...(fila as Turno),
    id_turno: Number(fila.id_turno),
    id_paciente: Number(fila.id_paciente),
    id_medico: Number(fila.id_medico),
    hora: String(fila.hora).slice(0, 5),
  };
}
