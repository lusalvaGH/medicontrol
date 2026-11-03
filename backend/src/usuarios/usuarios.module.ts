import { Module } from '@nestjs/common';
import { CuentaController } from './cuenta.controller';
import { CuentaService } from './cuenta.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

/** Mi cuenta (contraseña propia) y Configuración de Recepción (gestión de pacientes y médicos). */
@Module({
  controllers: [CuentaController, UsuariosController],
  providers: [CuentaService, UsuariosService, UsuariosRepository],
})
export class UsuariosModule {}
