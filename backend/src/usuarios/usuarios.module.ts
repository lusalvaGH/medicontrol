import { Module } from '@nestjs/common';
import { CuentaController } from './cuenta.controller';
import { CuentaService } from './cuenta.service';
import { LimitadorRegistro } from './limitador-registro';
import { RegistroController } from './registro.controller';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

/** Mi cuenta (contraseña propia), Configuración de Recepción (pacientes y médicos) y registro público de pacientes. */
@Module({
  controllers: [CuentaController, UsuariosController, RegistroController],
  providers: [CuentaService, UsuariosService, UsuariosRepository, { provide: LimitadorRegistro, useFactory: () => new LimitadorRegistro() }],
})
export class UsuariosModule {}
