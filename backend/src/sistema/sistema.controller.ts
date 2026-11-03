import { Controller, Get, Inject, Logger } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { Publico } from '../auth/decoradores';
import { ApiException } from '../comun/api-exception';
import { POOL_DB } from '../database/database.module';

@Controller()
export class SistemaController {
  private readonly logger = new Logger('Salud');

  constructor(@Inject(POOL_DB) private readonly pool: Pool) {}

  /** GET /api/health — público; no expone versiones ni detalles de conexión. */
  @Publico()
  @Get('health')
  async salud(): Promise<{ estado: string; base_de_datos: string }> {
    try {
      await this.pool.query('SELECT 1');
    } catch (error) {
      this.logger.error(`/health: ${error instanceof Error ? error.message : String(error)}`);
      throw new ApiException(503, 'BASE_NO_DISPONIBLE', 'La base de datos no está disponible.');
    }

    return { estado: 'ok', base_de_datos: 'ok' };
  }
}
