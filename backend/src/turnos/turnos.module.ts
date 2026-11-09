import { Module } from '@nestjs/common';
import { CatalogoController } from './catalogo.controller';
import { MisTurnosController } from './mis-turnos.controller';
import { TurnosController } from './turnos.controller';
import { TurnosRepository } from './turnos.repository';
import { TurnosService } from './turnos.service';

/** Agenda de recepción, catálogo para registrar turnos y turnos propios de médicos y pacientes. */
@Module({
  controllers: [TurnosController, CatalogoController, MisTurnosController],
  providers: [TurnosService, TurnosRepository],
})
export class TurnosModule {}
