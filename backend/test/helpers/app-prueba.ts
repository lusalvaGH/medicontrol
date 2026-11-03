import { Body, Controller, Get, HttpCode, INestApplication, Post, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { AppModule } from '../../src/app.module';
import { Roles, UsuarioActual } from '../../src/auth/decoradores';
import { LimitadorLogin, OpcionesLimitador, LIMITE_LOGIN } from '../../src/auth/limitador-login';
import type { UsuarioSesion } from '../../src/auth/sesion';
import { SESIONES } from '../../src/auth/sesion.config';
import { SesionesEnMemoria } from '../../src/auth/sesion.store';
import { configurarApp } from '../../src/configurar-app';
import { POOL_DB } from '../../src/database/database.module';

/** Las pruebas solo corren contra una base de pruebas. */
export function exigirBaseDePruebas(): void {
  const nombre = process.env.DB_NAME ?? '';
  if (!/^medicontrol_test(_[a-z0-9]+)?$/.test(nombre)) {
    throw new Error(`ABORTADO: las pruebas solo corren contra medicontrol_test (DB_NAME=${nombre || 'vacío'}).`);
  }
  process.env.SESSION_SECRET ??= randomBytes(32).toString('hex');
}

/** Rutas de prueba (solo en las pruebas): sirven para comprobar permisos por rol y CSRF. */
@Controller('prueba')
export class RutasDePruebaController {
  @Roles('recepcionista')
  @Get('recepcion')
  recepcion(): { area: string } {
    return { area: 'recepcion' };
  }

  @Roles('medico')
  @Get('medico')
  medico(): { area: string } {
    return { area: 'medico' };
  }

  @Roles('paciente')
  @Get('paciente')
  paciente(): { area: string } {
    return { area: 'paciente' };
  }

  @Roles('recepcionista', 'medico')
  @Get('personal')
  personal(): { area: string } {
    return { area: 'personal' };
  }

  /** Escritura de cualquier rol: devuelve quién la hizo según la sesión, ignorando el cuerpo. */
  @Post('escritura')
  @HttpCode(200)
  escritura(@UsuarioActual() usuario: UsuarioSesion, @Body() _cuerpo: unknown): { id_usuario: number } {
    return { id_usuario: usuario.id_usuario };
  }
}

export interface OpcionesApp {
  inactividadMs?: number;
  limitador?: Partial<OpcionesLimitador>;
  controladores?: Type<unknown>[];
}

export async function crearApp(opciones: OpcionesApp = {}): Promise<INestApplication> {
  exigirBaseDePruebas();
  let constructor = Test.createTestingModule({ imports: [AppModule], controllers: opciones.controladores ?? [RutasDePruebaController] })
    .overrideProvider(LimitadorLogin)
    .useValue(new LimitadorLogin({ ...LIMITE_LOGIN, ...opciones.limitador }));
  if (opciones.inactividadMs !== undefined) {
    constructor = constructor.overrideProvider(SESIONES).useValue(new SesionesEnMemoria(opciones.inactividadMs));
  }
  const modulo = await constructor.compile();
  const app = modulo.createNestApplication();
  configurarApp(app);
  // Escucha en un puerto propio: así varios pedidos pueden superponerse (supertest no abre y cierra un servidor por pedido)
  await app.listen(0, '127.0.0.1');

  return app;
}

export const DOMINIO_TEMPORAL = '@nest-prueba.test';

/** Usuarios temporales en la base de pruebas, con hash en formato $2y$ como los que genera PHP. */
export class UsuariosTemporales {
  private secuencia = 0;

  constructor(private readonly pool: Pool) {}

  static de(app: INestApplication): UsuariosTemporales {
    return new UsuariosTemporales(app.get<Pool>(POOL_DB));
  }

  async crear(rol: 'paciente' | 'medico' | 'recepcionista', contrasena: string, estado = 'activo'): Promise<{ id: number; email: string }> {
    this.secuencia++;
    const email = `${rol}${this.secuencia}.${Date.now()}${DOMINIO_TEMPORAL}`;
    const dni = String(93000000 + Math.floor(Math.random() * 999999));
    const hash = '$2y$' + hashSync(contrasena, 10).slice(4);
    const [r] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES ('Temporal', 'Nest', ?, ?, ?, ?, ?)",
      [dni, email, hash, rol, estado],
    );

    return { id: r.insertId, email };
  }

  async cambiar(id: number, campo: 'estado' | 'rol' | 'contrasena', valor: string): Promise<void> {
    await this.pool.execute(`UPDATE usuarios SET ${campo} = ? WHERE id_usuario = ? AND email LIKE ?`, [valor, id, '%' + DOMINIO_TEMPORAL]);
  }

  async borrarTodos(): Promise<void> {
    await this.pool.execute('DELETE FROM usuarios WHERE email LIKE ?', ['%' + DOMINIO_TEMPORAL]);
  }

  async cantidad(): Promise<number> {
    const [filas] = await this.pool.query<any[]>('SELECT COUNT(*) AS n FROM usuarios WHERE email LIKE ?', ['%' + DOMINIO_TEMPORAL]);

    return Number(filas[0].n);
  }
}

/** Huella de la base de pruebas sin los usuarios temporales: debe quedar igual al terminar. */
export async function checksumBase(pool: Pool): Promise<string> {
  const [filas] = await pool.query('CHECKSUM TABLE usuarios, pacientes, medicos, turnos EXTENDED');

  return JSON.stringify(filas);
}
