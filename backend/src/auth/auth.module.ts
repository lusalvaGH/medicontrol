import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LimitadorLogin } from './limitador-login';
import { SeguridadGuard } from './seguridad.guard';
import { SESIONES, crearAlmacenSesiones } from './sesion.config';
import { SesionesEnMemoria } from './sesion.store';
import { UsuariosAuthRepository } from './usuarios-auth.repository';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    UsuariosAuthRepository,
    { provide: LimitadorLogin, useFactory: () => new LimitadorLogin() },
    { provide: SESIONES, inject: [ConfigService], useFactory: crearAlmacenSesiones },
    // Todas las rutas de la API pasan por el control de acceso, salvo las marcadas @Publico()
    { provide: APP_GUARD, useClass: SeguridadGuard },
  ],
  exports: [AuthService, SESIONES],
})
export class AuthModule implements OnModuleDestroy {
  constructor(@Inject(SESIONES) private readonly sesiones: SesionesEnMemoria) {}

  onModuleDestroy(): void {
    this.sesiones.cerrar();
  }
}
