import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { leerConfiguracion } from './config/configuracion';
import { DatabaseModule } from './database/database.module';
import { SistemaController } from './sistema/sistema.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // Valida las variables al arrancar y expone el objeto ya tipado
      load: [() => leerConfiguracion(process.env)],
    }),
    DatabaseModule,
  ],
  controllers: [SistemaController],
})
export class AppModule {}
