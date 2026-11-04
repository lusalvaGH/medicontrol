import { Controller, Get, Query } from '@nestjs/common';
import { Roles, UsuarioActual } from '../auth/decoradores';
import type { UsuarioSesion } from '../auth/sesion';
import { ApiException } from '../comun/api-exception';
import { Entrada, textoQuery } from '../comun/entrada';
import { turnosFechaValida } from '../reglas/turnos.reglas';
import { fechaHoy } from '../reglas/zona-horaria';
import { TurnosRepository } from './turnos.repository';

/**
 * Turnos propios del médico y del paciente: las mismas consultas que panel/medico.php y
 * panel/paciente.php, de solo lectura. El médico o paciente sale siempre de la sesión, nunca del pedido.
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
