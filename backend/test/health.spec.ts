import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { POOL_DB } from '../src/database/database.module';

/**
 * Prueba de integración contra MariaDB. Solo lee (SELECT 1) y exige una base de pruebas:
 * se niega a correr contra cualquier base cuyo nombre no empiece con "medicontrol_test".
 */
describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const nombre = process.env.DB_NAME ?? '';
    if (!/^medicontrol_test(_[a-z0-9]+)?$/.test(nombre)) {
      throw new Error(`ABORTADO: las pruebas solo corren contra medicontrol_test (DB_NAME=${nombre || 'vacío'}).`);
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde 200 con la base disponible y el mismo formato que la API PHP', async () => {
    const r = await request(app.getHttpServer()).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, data: { estado: 'ok', base_de_datos: 'ok' } });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('usa la base de pruebas configurada', async () => {
    const pool = app.get(POOL_DB);
    const [filas] = await pool.query('SELECT DATABASE() AS base');
    expect(filas[0].base).toBe(process.env.DB_NAME);
  });

  it('una ruta inexistente responde 404 RUTA_NO_ENCONTRADA', async () => {
    const r = await request(app.getHttpServer()).get('/api/no-existe');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ ok: false, error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'La ruta solicitada no existe.' } });
  });

  it('fuera de /api no hay rutas', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(404);
  });
});
