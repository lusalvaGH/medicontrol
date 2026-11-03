import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { leerConfiguracion } from './config/configuracion';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { SistemaController } from './sistema/sistema.controller';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // Valida las variables al arrancar y expone el objeto ya tipado
      load: [() => leerConfiguracion(process.env)],
    }),
    // Permite listar las rutas para responder 404 y 405 como la API PHP
    DiscoveryModule,
    DatabaseModule,
    AuthModule,
    UsuariosModule,
  ],
  controllers: [SistemaController],
})
export class AppModule {}
