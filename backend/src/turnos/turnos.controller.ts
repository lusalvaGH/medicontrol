import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decoradores';
import { ApiException } from '../comun/api-exception';
import { Entrada, IdRutaPipe, campoEntero, campoTexto, cuerpoComoObjeto, textoQuery } from '../comun/entrada';
import { turnosFechaValida, turnosParsearMes } from '../reglas/turnos.reglas';
import { Turno, TurnosRepository } from './turnos.repository';
import { TurnosService } from './turnos.service';

/** Máximo de días que se puede pedir con desde/hasta (cubre una grilla mensual completa). */
const MAX_DIAS_RANGO = 42;

/** Días entre dos fechas YYYY-MM-DD ya validadas. */
function diasEntre(desde: string, hasta: string): number {
  const utc = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));

  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

/** Agenda de turnos de recepción (TurnosController.php). Solo recepción usa estas rutas. */
@Roles('recepcionista')
@Controller('turnos')
export class TurnosController {
  constructor(
    private readonly servicio: TurnosService,
    private readonly turnos: TurnosRepository,
  ) {}

  /** GET /api/turnos?fecha=YYYY-MM-DD  o  GET /api/turnos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD */
  @Get()
  async listar(@Query() query: Entrada) {
    const fecha = textoQuery(query, 'fecha');
    const desde = textoQuery(query, 'desde');
    const hasta = textoQuery(query, 'hasta');

    if ((fecha === null || fecha === '') && (desde !== null || hasta !== null)) {
      return this.listarRango(desde ?? '', hasta ?? '');
    }
    if (fecha === null || fecha === '') {
      throw new ApiException(400, 'PARAMETRO_REQUERIDO', 'Indicá la fecha (YYYY-MM-DD) o el rango desde/hasta.', { fecha: 'requerido' });
    }
    if (!turnosFechaValida(fecha)) {
      throw new ApiException(400, 'FECHA_INVALIDA', 'La fecha no es válida. Formato esperado: YYYY-MM-DD.', { fecha: 'invalida' });
    }

    return { fecha, turnos: await this.turnos.listarPorFecha(fecha) };
  }

  private async listarRango(desde: string, hasta: string) {
    const campos: Record<string, string> = {};
    if (!turnosFechaValida(desde)) {
      campos.desde = 'invalida';
    }
    if (!turnosFechaValida(hasta)) {
      campos.hasta = 'invalida';
    }
    if (Object.keys(campos).length > 0) {
      throw new ApiException(400, 'FECHA_INVALIDA', 'Las fechas desde y hasta deben tener el formato YYYY-MM-DD.', campos);
    }
    if (hasta < desde) {
      throw new ApiException(400, 'RANGO_INVALIDO', 'La fecha hasta no puede ser anterior a desde.');
    }
    if (diasEntre(desde, hasta) + 1 > MAX_DIAS_RANGO) {
      throw new ApiException(400, 'RANGO_DEMASIADO_AMPLIO', `El rango no puede superar los ${MAX_DIAS_RANGO} días.`);
    }

    return { desde, hasta, turnos: await this.turnos.listarPorRango(desde, hasta) };
  }

  /** GET /api/turnos/resumen?mes=YYYY-MM (va antes que /turnos/:id) */
  @Get('resumen')
  async resumen(@Query() query: Entrada) {
    const mes = textoQuery(query, 'mes') ?? '';
    const parseado = turnosParsearMes(mes);
    if (!parseado) {
      throw new ApiException(400, 'MES_INVALIDO', 'El mes no es válido. Formato esperado: YYYY-MM.', { mes: 'invalido' });
    }
    const dias = await this.turnos.resumenMensual(parseado.primerDia, `${mes}-${String(parseado.dias).padStart(2, '0')}`);

    // Un mes sin turnos es [] en PHP (json_encode de un array vacío), no {}
    return { mes, dias: Object.keys(dias).length > 0 ? dias : [] };
  }

  @Get(':id')
  async detalle(@Param('id', IdRutaPipe) id: number): Promise<{ turno: Turno }> {
    const turno = id > 0 ? await this.turnos.buscarPorId(id) : null;
    if (!turno) {
      throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
    }

    return { turno };
  }

  /** POST /api/turnos  {id_paciente, id_medico, fecha, hora, motivo_consulta} */
  @Post()
  async crear(@Body() cuerpo: unknown): Promise<{ turno: Turno }> {
    const e = cuerpoComoObjeto(cuerpo);
    const turno = await this.servicio.crear({
      id_paciente: campoEntero(e, 'id_paciente'),
      id_medico: campoEntero(e, 'id_medico'),
      fecha: campoTexto(e, 'fecha'),
      hora: campoTexto(e, 'hora'),
      motivo_consulta: campoTexto(e, 'motivo_consulta'),
    });

    return { turno };
  }

  /** PATCH /api/turnos/:id  {fecha, hora, estado} */
  @Patch(':id')
  modificar(@Param('id', IdRutaPipe) id: number, @Body() cuerpo: unknown) {
    const e = cuerpoComoObjeto(cuerpo);

    return this.servicio.modificar(id, { fecha: campoTexto(e, 'fecha'), hora: campoTexto(e, 'hora'), estado: campoTexto(e, 'estado') });
  }

  /** POST /api/turnos/:id/cancelacion */
  @Post(':id/cancelacion')
  @HttpCode(200)
  async cancelar(@Param('id', IdRutaPipe) id: number): Promise<{ turno: Turno | null }> {
    return { turno: await this.servicio.cancelar(id) };
  }
}
