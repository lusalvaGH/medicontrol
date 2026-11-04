import { Injectable } from '@nestjs/common';
import { ApiException } from '../comun/api-exception';
import { mbStrlen, phpTrim } from '../reglas/php';
import {
  TURNOS_ESTADOS,
  esEstadoTurno,
  turnosDisponibilidad,
  turnosEsFuturo,
  turnosFechaValida,
  turnosHorarioPermitido,
  turnosNormalizarHora,
  turnosPuedeTransicionar,
  turnosValidarModificacion,
} from '../reglas/turnos.reglas';
import { Turno, TurnosRepository } from './turnos.repository';

export interface DatosNuevoTurno {
  id_paciente: number | null;
  id_medico: number | null;
  fecha: string | null;
  hora: string | null;
  motivo_consulta: string | null;
}

export interface DatosModificacion {
  fecha: string | null;
  hora: string | null;
  estado: string | null;
}

/** Error de MariaDB por un valor único repetido (ER_DUP_ENTRY): otro pedido tomó el mismo horario. */
function esDuplicado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { errno?: unknown }).errno === 1062;
}

/**
 * Registrar, modificar y cancelar turnos (migrado de TurnosService.php). Las reglas puras
 * (horarios, estados, transiciones, fecha futura) son las de la etapa 2.
 */
@Injectable()
export class TurnosService {
  /** Reloj en milisegundos; las pruebas lo fijan para no depender del horario real de ejecución. */
  reloj: () => number = Date.now;

  constructor(private readonly turnos: TurnosRepository) {}

  async crear(datos: DatosNuevoTurno): Promise<Turno> {
    const ahora = new Date(this.reloj());
    const fecha = datos.fecha ?? '';
    const hora = turnosNormalizarHora(datos.hora ?? '');
    const motivo = phpTrim(datos.motivo_consulta ?? '');

    const campos: Record<string, string> = {};
    if (datos.id_paciente === null) {
      campos.id_paciente = 'requerido';
    }
    if (datos.id_medico === null) {
      campos.id_medico = 'requerido';
    }
    if (!turnosFechaValida(fecha)) {
      campos.fecha = 'invalida';
    }
    if (hora === null) {
      campos.hora = 'invalida';
    }
    if (motivo === '' || mbStrlen(motivo) > 255) {
      campos.motivo_consulta = motivo === '' ? 'requerido' : 'demasiado_largo';
    }
    if (Object.keys(campos).length > 0 || hora === null || datos.id_paciente === null || datos.id_medico === null) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'Revisá los datos del turno.', campos);
    }

    if (!turnosHorarioPermitido(hora)) {
      throw new ApiException(422, 'HORARIO_NO_PERMITIDO', 'El horario elegido no está entre los horarios permitidos.', { hora: 'no_permitida' });
    }
    if (!turnosEsFuturo(fecha, hora, ahora)) {
      throw new ApiException(422, 'FECHA_PASADA', 'La fecha y hora elegidas ya pasaron. Elegí un horario futuro.', { fecha: 'pasada' });
    }
    if (!(await this.turnos.pacienteActivo(datos.id_paciente))) {
      throw new ApiException(422, 'PACIENTE_NO_DISPONIBLE', 'El paciente seleccionado no existe o no está activo.', { id_paciente: 'no_disponible' });
    }
    if (!(await this.turnos.medicoActivo(datos.id_medico))) {
      throw new ApiException(422, 'MEDICO_NO_DISPONIBLE', 'El médico seleccionado no existe o no está activo.', { id_medico: 'no_disponible' });
    }
    const ocupado = () => new ApiException(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para el médico seleccionado.');
    if (await this.turnos.horarioOcupado(datos.id_medico, fecha, hora)) {
      throw ocupado();
    }

    let id: number;
    try {
      id = await this.turnos.insertar(datos.id_paciente, datos.id_medico, fecha, hora, motivo);
    } catch (error) {
      // Otra persona tomó el mismo horario entre la verificación y la inserción
      throw esDuplicado(error) ? ocupado() : error;
    }

    return (await this.turnos.buscarPorId(id)) ?? ({ id_turno: id } as Turno);
  }

  async modificar(idTurno: number, datos: DatosModificacion): Promise<{ turno: Turno | null; sin_cambios: boolean }> {
    const ahora = new Date(this.reloj());
    const fecha = datos.fecha ?? '';
    const hora = turnosNormalizarHora(datos.hora ?? '');
    const estado = datos.estado ?? '';

    const campos: Record<string, string> = {};
    if (!turnosFechaValida(fecha)) {
      campos.fecha = 'invalida';
    }
    if (hora === null) {
      campos.hora = 'invalida';
    }
    if (!esEstadoTurno(estado)) {
      campos.estado = 'invalido';
    }
    if (Object.keys(campos).length > 0 || hora === null) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'Revisá los datos del turno.', campos);
    }

    const actual = await this.turnos.buscarParaActualizar(idTurno);
    if (!actual) {
      throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
    }

    const validacion = turnosValidarModificacion(actual, fecha, hora, estado, ahora);
    if (validacion.error !== null) {
      throw new ApiException(409, 'CAMBIO_NO_PERMITIDO', validacion.error);
    }
    if (validacion.sin_cambios) {
      return { turno: await this.turnos.buscarPorId(idTurno), sin_cambios: true };
    }

    const ocupado = () => new ApiException(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para ese médico en esa fecha.');
    if (validacion.reprograma && (await this.turnos.horarioOcupado(Number(actual.id_medico), fecha, hora, idTurno))) {
      throw ocupado();
    }

    let filas: number;
    try {
      filas = await this.turnos.actualizarSiNoCambio(idTurno, { fecha, hora, estado }, actual);
    } catch (error) {
      throw esDuplicado(error) ? ocupado() : error;
    }
    if (filas === 0) {
      throw new ApiException(409, 'TURNO_MODIFICADO', 'El turno cambió mientras se guardaba. Recargá la página e intentá de nuevo.');
    }

    return { turno: await this.turnos.buscarPorId(idTurno), sin_cambios: false };
  }

  async cancelar(idTurno: number): Promise<Turno | null> {
    const actual = await this.turnos.buscarParaActualizar(idTurno);
    if (!actual) {
      throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
    }
    const estado = String(actual.estado);
    if (estado === 'cancelado') {
      throw new ApiException(409, 'YA_CANCELADO', 'El turno ya está cancelado.');
    }
    if (!turnosPuedeTransicionar(estado, 'cancelado')) {
      const etiqueta = esEstadoTurno(estado) ? TURNOS_ESTADOS[estado] : estado;
      throw new ApiException(409, 'CAMBIO_NO_PERMITIDO', `No se puede cancelar un turno «${etiqueta}».`);
    }
    if ((await this.turnos.cancelarSiEstado(idTurno, estado)) === 0) {
      throw new ApiException(409, 'TURNO_MODIFICADO', 'El turno cambió mientras se cancelaba. Recargá la página e intentá de nuevo.');
    }

    return this.turnos.buscarPorId(idTurno);
  }

  /** Estado de cada horario permitido para un médico en una fecha: libre, ocupado o pasado. */
  async disponibilidad(idMedico: number, fecha: string) {
    if (!(await this.turnos.medicoActivo(idMedico))) {
      throw new ApiException(404, 'MEDICO_NO_ENCONTRADO', 'El médico no existe o no está activo.');
    }

    return turnosDisponibilidad(fecha, await this.turnos.horasOcupadas(idMedico, fecha), new Date(this.reloj()));
  }
}
