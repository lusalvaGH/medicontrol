import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { POOL_DB } from '../database/database.module';

export interface FilaCredencial extends RowDataPacket {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  contrasena: string;
  rol: string;
  estado: string;
  debe_cambiar_contrasena: number;
}

/** Consultas de autenticación. Solo lecturas: esta etapa no modifica ninguna cuenta. */
@Injectable()
export class UsuariosAuthRepository {
  constructor(@Inject(POOL_DB) private readonly pool: Pool) {}

  async buscarPorEmail(email: string): Promise<FilaCredencial | null> {
    const [filas] = await this.pool.execute<FilaCredencial[]>(
      'SELECT id_usuario, nombre, apellido, email, contrasena, rol, estado, debe_cambiar_contrasena FROM usuarios WHERE email = ? LIMIT 1',
      [email],
    );

    return filas[0] ?? null;
  }

  async buscarPorId(idUsuario: number): Promise<FilaCredencial | null> {
    const [filas] = await this.pool.execute<FilaCredencial[]>(
      'SELECT id_usuario, nombre, apellido, email, contrasena, rol, estado, debe_cambiar_contrasena FROM usuarios WHERE id_usuario = ? LIMIT 1',
      [idUsuario],
    );

    return filas[0] ?? null;
  }
}
