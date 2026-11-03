import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { POOL_DB } from '../database/database.module';
import type { DatosPerfilMedico, DatosPerfilPaciente, DatosPersona } from '../reglas/personas.validador';

/** El pool o una conexión con una transacción abierta. */
export type Ejecutor = Pool | PoolConnection;

export interface FilaUsuario extends RowDataPacket {
  id_usuario: number;
  nombre: string;
  apellido: string;
  dni: string;
  email: string;
  rol: string;
  estado: string;
  especialidad: string | null;
  matricula: string | null;
  obra_social: string | null;
  telefono: string | null;
  direccion?: string | null;
  fecha_nacimiento?: string | null;
  genero?: string | null;
}

const CAMPOS_LISTADO = `u.id_usuario, u.nombre, u.apellido, u.dni, u.email, u.rol, u.estado,
  m.especialidad, m.matricula, p.obra_social, p.telefono`;

const DESDE = `FROM usuarios u
  LEFT JOIN medicos m ON m.id_usuario = u.id_usuario
  LEFT JOIN pacientes p ON p.id_usuario = u.id_usuario`;

/** Consultas de usuarios (migradas de src/Repositories/UsuariosRepository.php). Nunca devuelven la contraseña. */
@Injectable()
export class UsuariosRepository {
  constructor(@Inject(POOL_DB) private readonly pool: Pool) {}

  /** Conexión propia para una transacción. Quien la pide debe liberarla. */
  conexion(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  /** Hash de la contraseña. Separado del resto para leerlo solo cuando hace falta. */
  async buscarHashContrasena(idUsuario: number): Promise<string | null> {
    const [filas] = await this.pool.execute<RowDataPacket[]>('SELECT contrasena FROM usuarios WHERE id_usuario = ? LIMIT 1', [idUsuario]);
    const hash: unknown = filas[0]?.contrasena;

    return typeof hash === 'string' ? hash : null;
  }

  /**
   * Guarda el hash nuevo solo si la contraseña no cambió desde que se leyó y el usuario
   * sigue activo. Devuelve las filas modificadas.
   */
  async actualizarContrasena(idUsuario: number, hashNuevo: string, hashLeido: string): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>(
      "UPDATE usuarios SET contrasena = ? WHERE id_usuario = ? AND contrasena = ? AND estado = 'activo'",
      [hashNuevo, idUsuario, hashLeido],
    );

    return r.affectedRows;
  }

  /** Listado paginado de los roles pedidos, con búsqueda por texto y filtro de estado. */
  async listar(roles: readonly string[], buscar: string, estado: string | null, limite: number, desplazamiento: number): Promise<{ filas: FilaUsuario[]; total: number }> {
    const condiciones = [`u.rol IN (${roles.map(() => '?').join(', ')})`];
    const parametros: string[] = [...roles];
    if (estado !== null) {
      condiciones.push('u.estado = ?');
      parametros.push(estado);
    }
    if (buscar !== '') {
      condiciones.push(`(u.nombre LIKE ? OR u.apellido LIKE ? OR CONCAT(u.nombre, ' ', u.apellido) LIKE ?
        OR u.dni LIKE ? OR u.email LIKE ? OR m.especialidad LIKE ?)`);
      // % y _ se buscan como texto, igual que addcslashes($buscar, '%_\\')
      const patron = '%' + buscar.replace(/[%_\\]/g, '\\$&') + '%';
      parametros.push(...Array<string>(6).fill(patron));
    }
    const desde = `${DESDE} WHERE ${condiciones.join(' AND ')}`;

    const [cuenta] = await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${desde}`, parametros);
    const lim = Math.max(1, Math.trunc(limite));
    const desp = Math.max(0, Math.trunc(desplazamiento));
    const [filas] = await this.pool.execute<FilaUsuario[]>(
      `SELECT ${CAMPOS_LISTADO} ${desde} ORDER BY u.apellido, u.nombre, u.id_usuario LIMIT ${lim} OFFSET ${desp}`,
      parametros,
    );

    return { filas, total: Number(cuenta[0].total) };
  }

  /** Detalle con los datos del perfil. */
  async detalle(idUsuario: number): Promise<FilaUsuario | null> {
    const [filas] = await this.pool.execute<FilaUsuario[]>(
      `SELECT ${CAMPOS_LISTADO}, p.direccion, p.fecha_nacimiento, p.genero ${DESDE} WHERE u.id_usuario = ? LIMIT 1`,
      [idUsuario],
    );

    return filas[0] ?? null;
  }

  /** Especialidades ya cargadas en la base. */
  async especialidades(): Promise<string[]> {
    const [filas] = await this.pool.query<RowDataPacket[]>('SELECT DISTINCT especialidad FROM medicos ORDER BY especialidad');

    return filas.map((f) => String(f.especialidad));
  }

  /** Qué datos únicos ('email' y/o 'dni') ya usa otro usuario. */
  async datosDuplicados(email: string, dni: string, exceptoUsuario: number | null = null): Promise<('email' | 'dni')[]> {
    const [filas] = await this.pool.execute<RowDataPacket[]>('SELECT email, dni FROM usuarios WHERE (email = ? OR dni = ?) AND id_usuario <> ?', [
      email,
      dni,
      exceptoUsuario ?? 0,
    ]);

    const duplicados = new Set<'email' | 'dni'>();
    for (const fila of filas) {
      if (String(fila.email).toLowerCase() === email.toLowerCase()) {
        duplicados.add('email');
      }
      if (String(fila.dni) === dni) {
        duplicados.add('dni');
      }
    }

    return [...duplicados];
  }

  /** Crea el usuario activo. El rol lo decide siempre quien llama, nunca un formulario. */
  async insertar(db: Ejecutor, datos: DatosPersona, rol: 'medico' | 'paciente', hashContrasena: string): Promise<number> {
    const [r] = await db.execute<ResultSetHeader>(
      "INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES (?, ?, ?, ?, ?, ?, 'activo')",
      [datos.nombre, datos.apellido, datos.dni, datos.email, hashContrasena, rol],
    );

    return r.insertId;
  }

  async insertarPerfilPaciente(db: Ejecutor, idUsuario: number, datos: DatosPerfilPaciente): Promise<void> {
    await db.execute(
      'INSERT INTO pacientes (id_usuario, telefono, direccion, fecha_nacimiento, genero, obra_social) VALUES (?, ?, ?, ?, ?, ?)',
      [idUsuario, ...parametrosPaciente(datos)],
    );
  }

  async insertarPerfilMedico(db: Ejecutor, idUsuario: number, datos: DatosPerfilMedico): Promise<void> {
    await db.execute('INSERT INTO medicos (id_usuario, especialidad, matricula) VALUES (?, ?, ?)', [idUsuario, datos.especialidad, datos.matricula || null]);
  }

  /** Actualiza los datos personales. El rol, el estado y la contraseña no se tocan acá. */
  async actualizarPersona(db: Ejecutor, idUsuario: number, datos: DatosPersona): Promise<void> {
    await db.execute('UPDATE usuarios SET nombre = ?, apellido = ?, dni = ?, email = ? WHERE id_usuario = ?', [
      datos.nombre,
      datos.apellido,
      datos.dni,
      datos.email,
      idUsuario,
    ]);
  }

  async actualizarPerfilPaciente(db: Ejecutor, idUsuario: number, datos: DatosPerfilPaciente): Promise<void> {
    await db.execute('UPDATE pacientes SET telefono = ?, direccion = ?, fecha_nacimiento = ?, genero = ?, obra_social = ? WHERE id_usuario = ?', [
      ...parametrosPaciente(datos),
      idUsuario,
    ]);
  }

  async actualizarPerfilMedico(db: Ejecutor, idUsuario: number, datos: DatosPerfilMedico): Promise<void> {
    await db.execute('UPDATE medicos SET especialidad = ?, matricula = ? WHERE id_usuario = ?', [datos.especialidad, datos.matricula || null, idUsuario]);
  }

  /** Baja lógica o reactivación: solo aplica si el estado sigue siendo el esperado. */
  async cambiarEstado(idUsuario: number, estadoNuevo: string, estadoEsperado: string): Promise<number> {
    const [r] = await this.pool.execute<ResultSetHeader>('UPDATE usuarios SET estado = ? WHERE id_usuario = ? AND estado = ?', [
      estadoNuevo,
      idUsuario,
      estadoEsperado,
    ]);

    return r.affectedRows;
  }

  /** Contraseña provisoria: al cambiar el hash, las sesiones de ese usuario dejan de ser válidas. */
  async establecerContrasena(idUsuario: number, hashNuevo: string): Promise<void> {
    await this.pool.execute('UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?', [hashNuevo, idUsuario]);
  }

  /**
   * Turnos futuros o en curso de un médico o paciente (TurnosRepository::contarSinResolverDeUsuario).
   * fecha y hora: el momento actual en la zona de la clínica.
   */
  async contarSinResolverDeUsuario(idUsuario: number, rol: string, fecha: string, hora: string): Promise<number> {
    const union = rol === 'medico' ? 'INNER JOIN medicos x ON x.id_medico = t.id_medico' : 'INNER JOIN pacientes x ON x.id_paciente = t.id_paciente';
    const [filas] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM turnos t ${union}
       WHERE x.id_usuario = ?
         AND (t.estado = 'en_curso'
              OR (t.estado IN ('pendiente', 'confirmado') AND (t.fecha > ? OR (t.fecha = ? AND t.hora >= ?))))`,
      [idUsuario, fecha, fecha, hora],
    );

    return Number(filas[0].n);
  }
}

function parametrosPaciente(datos: DatosPerfilPaciente): (string | null)[] {
  return [datos.telefono || null, datos.direccion || null, datos.fecha_nacimiento || null, datos.genero || null, datos.obra_social || 'Particular'];
}
