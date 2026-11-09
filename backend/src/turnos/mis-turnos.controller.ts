import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Roles, UsuarioActual } from '../auth/decoradores';
import type { UsuarioSesion } from '../auth/sesion';
import { ApiException } from '../comun/api-exception';
import { Entrada, IdRutaPipe, cuerpoComoObjeto, textoQuery } from '../comun/entrada';
import { mbStrlen, phpTrim } from '../reglas/php';
import { turnosFechaValida } from '../reglas/turnos.reglas';
import { fechaHoy } from '../reglas/zona-horaria';
import { TurnosRepository } from './turnos.repository';

/** Largo máximo de las notas médicas de un turno (la columna TEXT admite bastante más). */
export const NOTAS_MAXIMO = 5000;

/**
 * Turnos propios del médico y del paciente: las mismas consultas que panel/medico.php y
 * panel/paciente.php. El médico o paciente sale siempre de la sesión, nunca del pedido.
 * El médico además escribe las notas de sus turnos y ve el historial de sus pacientes con él.
 */
@Controller()
export class MisTurnosController {
  constructor(private readonly turnos: TurnosRepository) {}

  /** GET /api/medico/agenda?fecha=YYYY-MM-DD — turnos del día del médico de la sesión (por defecto, hoy). */
  @Roles('medico')
  @Get('medico/agenda')
  async agenda(@UsuarioActual() usuario: UsuarioSesion, @Query() query: Entrada) {
    const fecha = textoQuery(query, 'fecha') || fechaHoy();
    if (!turnosFechaValida(fecha)) {
      throw new ApiException(400, 'FECHA_INVALIDA', 'La fecha no es válida. Formato esperado: YYYY-MM-DD.', { fecha: 'invalida' });
    }
    const idMedico = await this.turnos.idMedicoDeUsuario(usuario.id_usuario);
    if (idMedico === null) {
      throw new ApiException(404, 'PERFIL_NO_ENCONTRADO', 'No se encontró el perfil del médico.');
    }

    return { fecha, turnos: await this.turnos.agendaDelMedico(idMedico, fecha) };
  }

  /**
   * PATCH /api/medico/turnos/:id/notas — {notas_medicas}. Solo en turnos del médico de la sesión
   * (panel/medico.php). Un texto vacío borra las notas. Un turno de otro médico responde 404,
   * igual que uno inexistente, para no revelar qué turnos existen.
   */
  @Roles('medico')
  @Patch('medico/turnos/:id/notas')
  async guardarNotas(@UsuarioActual() usuario: UsuarioSesion, @Param('id', IdRutaPipe) idTurno: number, @Body() cuerpo: unknown) {
    const valor = cuerpoComoObjeto(cuerpo).notas_medicas;
    if (valor !== null && typeof valor !== 'string') {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'Las notas deben ser un texto.', { notas_medicas: 'invalido' });
    }
    const notas = phpTrim(valor ?? '');
    if (mbStrlen(notas) > NOTAS_MAXIMO) {
      throw new ApiException(400, 'DATOS_INVALIDOS', `Las notas no pueden superar los ${NOTAS_MAXIMO} caracteres.`, { notas_medicas: 'demasiado_largo' });
    }
    const idMedico = await this.exigirMedico(usuario);
    const encontrado = (await this.turnos.guardarNotas(idTurno, idMedico, notas === '' ? null : notas)) > 0 || (await this.turnoDelMedico(idTurno, idMedico));
    if (!encontrado) {
      throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
    }

    return { id_turno: idTurno, notas_medicas: notas === '' ? null : notas };
  }

  /**
   * GET /api/medico/pacientes/:id/historial — turnos de ese paciente con el médico de la sesión,
   * con sus notas. No incluye turnos con otros médicos. Si el médico nunca lo atendió, 404.
   */
  @Roles('medico')
  @Get('medico/pacientes/:id/historial')
  async historial(@UsuarioActual() usuario: UsuarioSesion, @Param('id', IdRutaPipe) idPaciente: number) {
    const idMedico = await this.exigirMedico(usuario);
    const turnos = await this.turnos.historialConMedico(idMedico, idPaciente);
    const paciente = turnos.length > 0 ? await this.turnos.pacienteResumen(idPaciente) : null;
    if (!paciente) {
      throw new ApiException(404, 'PACIENTE_NO_ENCONTRADO', 'No hay turnos de ese paciente en tu agenda.');
    }

    return { paciente, turnos };
  }

  private async exigirMedico(usuario: UsuarioSesion): Promise<number> {
    const idMedico = await this.turnos.idMedicoDeUsuario(usuario.id_usuario);
    if (idMedico === null) {
      throw new ApiException(404, 'PERFIL_NO_ENCONTRADO', 'No se encontró el perfil del médico.');
    }

    return idMedico;
  }

  /** Sin cambios en las notas, UPDATE puede informar 0 filas: se confirma que el turno sea de ese médico. */
  private turnoDelMedico(idTurno: number, idMedico: number): Promise<boolean> {
    return this.turnos.esTurnoDelMedico(idTurno, idMedico);
  }

  /** GET /api/paciente/turnos — todos los turnos del paciente de la sesión. */
  @Roles('paciente')
  @Get('paciente/turnos')
  async misTurnos(@UsuarioActual() usuario: UsuarioSesion) {
    const idPaciente = await this.turnos.idPacienteDeUsuario(usuario.id_usuario);
    if (idPaciente === null) {
      throw new ApiException(404, 'PERFIL_NO_ENCONTRADO', 'No se encontró el perfil del paciente.');
    }

    return { turnos: await this.turnos.turnosDelPaciente(idPaciente) };
  }
}
