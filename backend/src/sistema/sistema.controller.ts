import { Controller, Get, Inject, Logger } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { Publico } from '../auth/decoradores';
import { ApiException } from '../comun/api-exception';
import { POOL_DB } from '../database/database.module';
import { versionEsquema } from '../migraciones/ejecutor';
import { VERSION_ESQUEMA_REQUERIDA } from '../migraciones/migraciones';

@Controller()
export class SistemaController {
  private readonly logger = new Logger('Salud');

  constructor(@Inject(POOL_DB) private readonly pool: Pool) {}

  /** GET /api/health — público; no expone versiones ni detalles de conexión. */
  @Publico()
  @Get('health')
  async salud(): Promise<{ estado: string; base_de_datos: string }> {
    let version: number;
    try {
      version = await versionEsquema(this.pool);
    } catch (error) {
      this.logger.error(`/health: ${error instanceof Error ? error.message : String(error)}`);
      throw new ApiException(503, 'BASE_NO_DISPONIBLE', 'La base de datos no está disponible.');
    }
    // La base responde pero le faltan migraciones: el código usaría columnas que no existen
    if (version < VERSION_ESQUEMA_REQUERIDA) {
      this.logger.error(`/health: esquema en versión ${version}, el código necesita la ${VERSION_ESQUEMA_REQUERIDA}. Ejecutá las migraciones.`);
      throw new ApiException(503, 'ESQUEMA_DESACTUALIZADO', 'La base de datos necesita actualizarse.');
    }

    return { estado: 'ok', base_de_datos: 'ok' };
  }
}
