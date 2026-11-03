import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, Pool } from 'mysql2/promise';
import type { Configuracion } from '../config/configuracion';

export const POOL_DB = Symbol('POOL_DB');

/** Cierra las conexiones al apagar la aplicación. */
@Injectable()
class CierrePool implements OnModuleDestroy {
  constructor(@Inject(POOL_DB) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Conexión propia de Node.js a MariaDB, independiente de la configuración de la versión PHP.
 * Las fechas y horas se leen como texto ('YYYY-MM-DD', 'HH:MM:SS') para no depender de la zona
 * horaria del proceso, igual que en PHP. Consultas siempre preparadas (placeholders).
 */
@Global()
@Module({
  providers: [
    {
      provide: POOL_DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => {
        const db = config.getOrThrow<Configuracion['db']>('db');

        return createPool({
          host: db.host,
          port: db.puerto,
          database: db.nombre,
          user: db.usuario,
          password: db.contrasena,
          charset: 'utf8mb4_unicode_ci',
          dateStrings: true,
          connectionLimit: 10,
          waitForConnections: true,
          multipleStatements: false,
        });
      },
    },
    CierrePool,
  ],
  exports: [POOL_DB],
})
export class DatabaseModule {}
