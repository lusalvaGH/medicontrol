import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../auth/decoradores';
import { ApiException } from '../comun/api-exception';
import { Entrada, IdRutaPipe, enteroPhp, textoQuery } from '../comun/entrada';
import { mbStrlen } from '../reglas/php';
import { turnosFechaValida } from '../reglas/turnos.reglas';
import { TurnosRepository } from './turnos.repository';
import { TurnosService } from './turnos.service';

/** Datos de apoyo para registrar turnos: médicos, pacientes y horarios disponibles (CatalogoController.php). */
@Roles('recepcionista')
@Controller()
export class CatalogoController {
  constructor(
    private readonly servicio: TurnosService,
    private readonly turnos: TurnosRepository,
  ) {}

  /** GET /api/medicos — médicos activos. */
  @Get('medicos')
  async medicos() {
    return { medicos: await this.turnos.listarMedicos() };
  }

  /** GET /api/pacientes?buscar=texto&limite=50 — pacientes activos (de 1 a 100). */
  @Get('pacientes')
  async pacientes(@Query() query: Entrada) {
    const texto = textoQuery(query, 'buscar') ?? '';
    if (mbStrlen(texto) > 80) {
      throw new ApiException(400, 'BUSQUEDA_INVALIDA', 'La búsqueda es demasiado larga.');
    }
    const limite = Math.max(1, Math.min(100, enteroPhp(textoQuery(query, 'limite') ?? '50')));

    return { pacientes: await this.turnos.buscarPacientes(texto, limite) };
  }

  /** GET /api/medicos/:id/disponibilidad?fecha=YYYY-MM-DD */
  @Get('medicos/:id/disponibilidad')
  async disponibilidad(@Param('id', IdRutaPipe) idMedico: number, @Query() query: Entrada) {
    const fecha = textoQuery(query, 'fecha') ?? '';
    if (!turnosFechaValida(fecha)) {
      throw new ApiException(400, 'FECHA_INVALIDA', 'La fecha no es válida. Formato esperado: YYYY-MM-DD.', { fecha: 'invalida' });
    }

    return { id_medico: idMedico, fecha, horarios: await this.servicio.disponibilidad(idMedico, fecha) };
  }
}
