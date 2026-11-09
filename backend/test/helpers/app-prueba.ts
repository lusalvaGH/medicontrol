import { Body, Controller, Get, HttpCode, INestApplication, Post, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import type { Pool, ResultSetHeader } from 'mysql2/promise';
import { AppModule } from '../../src/app.module';
import { Publico, Roles, UsuarioActual } from '../../src/auth/decoradores';
import { LimitadorLogin, OpcionesLimitador, LIMITE_LOGIN } from '../../src/auth/limitador-login';
import { LimitadorRegistro, OpcionesLimitadorRegistro } from '../../src/usuarios/limitador-registro';
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

  /** Error inesperado, para comprobar qué se registra en el log y qué recibe el cliente. */
  @Publico()
  @Get('error-interno')
  errorInterno(): never {
    throw new Error('falla simulada de prueba');
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
  /** Por defecto las pruebas no chocan con el límite del registro público. */
  limitadorRegistro?: Partial<OpcionesLimitadorRegistro>;
  controladores?: Type<unknown>[];
}

export async function crearApp(opciones: OpcionesApp = {}): Promise<INestApplication> {
  exigirBaseDePruebas();
  let constructor = Test.createTestingModule({ imports: [AppModule], controllers: opciones.controladores ?? [RutasDePruebaController] })
    .overrideProvider(LimitadorLogin)
    .useValue(new LimitadorLogin({ ...LIMITE_LOGIN, ...opciones.limitador }))
    .overrideProvider(LimitadorRegistro)
    .useValue(new LimitadorRegistro({ maxIntentos: 1000, ventanaMs: 60 * 60 * 1000, ...opciones.limitadorRegistro }));
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

export const MOTIVO_TEMPORAL = 'Prueba Nest temporal';

export interface UsuarioTemporal {
  id: number;
  email: string;
  dni: string;
  rol: 'paciente' | 'medico' | 'recepcionista';
  /** id_paciente o id_medico (0 si no tiene perfil) */
  perfil: number;
}

/** Usuarios temporales en la base de pruebas, con hash en formato $2y$ como los que genera PHP. */
export class UsuariosTemporales {
  private secuencia = 0;
  // DNI de 8 dígitos en un tramo propio de esta ejecución, para no chocar con otras corridas
  private readonly baseDni = 93000000 + Math.floor(Math.random() * 900) * 1000;

  constructor(private readonly pool: Pool) {}

  static de(app: INestApplication): UsuariosTemporales {
    return new UsuariosTemporales(app.get<Pool>(POOL_DB));
  }

  async crear(rol: 'paciente' | 'medico' | 'recepcionista', contrasena: string, estado = 'activo'): Promise<{ id: number; email: string }> {
    const u = await this.crearUsuario(rol, contrasena, { estado, perfil: false });

    return { id: u.id, email: u.email };
  }

  /** Usuario con su perfil de médico o paciente, como los que crea la versión PHP. */
  async crearUsuario(
    rol: UsuarioTemporal['rol'],
    contrasena: string,
    opciones: { estado?: string; apellido?: string; nombre?: string; especialidad?: string; perfil?: boolean } = {},
  ): Promise<UsuarioTemporal> {
    this.secuencia++;
    const email = `${rol}${this.secuencia}.${Date.now()}${DOMINIO_TEMPORAL}`;
    const dni = String(this.baseDni + this.secuencia);
    const hash = '$2y$' + hashSync(contrasena, 10).slice(4);
    const [r] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [opciones.nombre ?? 'Temporal', opciones.apellido ?? 'Nest', dni, email, hash, rol, opciones.estado ?? 'activo'],
    );
    let perfil = 0;
    if (opciones.perfil !== false && rol === 'medico') {
      const [m] = await this.pool.execute<ResultSetHeader>('INSERT INTO medicos (id_usuario, especialidad) VALUES (?, ?)', [r.insertId, opciones.especialidad ?? 'Prueba']);
      perfil = m.insertId;
    } else if (opciones.perfil !== false && rol === 'paciente') {
      const [p] = await this.pool.execute<ResultSetHeader>('INSERT INTO pacientes (id_usuario) VALUES (?)', [r.insertId]);
      perfil = p.insertId;
    }

    return { id: r.insertId, email, dni, rol, perfil };
  }

  async agregarTurno(paciente: UsuarioTemporal, medico: UsuarioTemporal, fecha: string, hora: string, estado: string): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta) VALUES (?, ?, ?, ?, ?, ?)',
      [paciente.perfil, medico.perfil, fecha, hora, estado, MOTIVO_TEMPORAL],
    );

    return r.insertId;
  }

  async borrarTurno(idTurno: number): Promise<void> {
    await this.pool.execute('DELETE FROM turnos WHERE id_turno = ? AND motivo_consulta = ?', [idTurno, MOTIVO_TEMPORAL]);
  }

  /** Fila completa del usuario con su perfil, para comprobar lo que quedó guardado. */
  async fila(id: number): Promise<Record<string, any>> {
    const [filas] = await this.pool.execute<any[]>(
      `SELECT u.*, m.especialidad, m.matricula, p.telefono, p.direccion, p.fecha_nacimiento, p.genero, p.obra_social
       FROM usuarios u LEFT JOIN medicos m ON m.id_usuario = u.id_usuario LEFT JOIN pacientes p ON p.id_usuario = u.id_usuario
       WHERE u.id_usuario = ?`,
      [id],
    );

    return filas[0] ?? {};
  }

  async cambiar(id: number, campo: 'estado' | 'rol' | 'contrasena', valor: string): Promise<void> {
    await this.pool.execute(`UPDATE usuarios SET ${campo} = ? WHERE id_usuario = ? AND email LIKE ?`, [valor, id, '%' + DOMINIO_TEMPORAL]);
  }

  /** Borra solo lo creado por las pruebas: primero sus turnos y después los usuarios (con sus perfiles). */
  async borrarTodos(): Promise<void> {
    const dominio = '%' + DOMINIO_TEMPORAL;
    await this.pool.execute(
      `DELETE t FROM turnos t
       LEFT JOIN pacientes p ON p.id_paciente = t.id_paciente LEFT JOIN usuarios up ON up.id_usuario = p.id_usuario
       LEFT JOIN medicos m ON m.id_medico = t.id_medico LEFT JOIN usuarios um ON um.id_usuario = m.id_usuario
       WHERE up.email LIKE ? OR um.email LIKE ?`,
      [dominio, dominio],
    );
    await this.pool.execute('DELETE FROM usuarios WHERE email LIKE ?', [dominio]);
  }

  async cantidadTurnos(): Promise<number> {
    const [filas] = await this.pool.query<any[]>('SELECT COUNT(*) AS n FROM turnos WHERE motivo_consulta = ?', [MOTIVO_TEMPORAL]);

    return Number(filas[0].n);
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
