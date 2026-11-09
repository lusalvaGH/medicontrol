import type { Connection, Pool, RowDataPacket } from 'mysql2/promise';
import { Migracion, MigracionAplicada, Plan, planificar, sentencias } from './migraciones';

type Base = Pool | Connection;

/** Tablas base del esquema original (docker/mariadb/01-esquema.sql): las migraciones parten de ellas. */
export const TABLAS_BASE = ['usuarios', 'pacientes', 'medicos', 'turnos'] as const;

const CANDADO = 'medicontrol_migraciones';

function errno(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? ((error as { errno?: number }).errno ?? undefined) : undefined;
}

/** Versión del esquema aplicada en la base (0 si nunca se migró). */
export async function versionEsquema(db: Base): Promise<number> {
  try {
    const [filas] = await db.query<RowDataPacket[]>('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migraciones');

    return Number(filas[0].v);
  } catch (error) {
    // 1146: la tabla no existe todavía
    if (errno(error) === 1146) {
      return 0;
    }
    throw error;
  }
}

export async function tablasBaseFaltantes(db: Base): Promise<string[]> {
  const [filas] = await db.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME IN (?)",
    [TABLAS_BASE],
  );
  const existentes = new Set(filas.map((f) => String(f.t)));

  return TABLAS_BASE.filter((t) => !existentes.has(t));
}

/** Registro de migraciones aplicadas y de intentos fallidos. Se crea la primera vez. */
export async function asegurarRegistro(db: Base): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
    version INT NOT NULL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    huella CHAR(64) NOT NULL,
    aplicada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracion_ms INT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migraciones_errores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    huella CHAR(64) NOT NULL,
    sentencia INT NOT NULL,
    error TEXT NOT NULL,
    ocurrido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function leerAplicadas(db: Base): Promise<MigracionAplicada[]> {
  const [filas] = await db.query<RowDataPacket[]>('SELECT version, nombre, huella FROM schema_migraciones ORDER BY version');

  return filas.map((f) => ({ version: Number(f.version), nombre: String(f.nombre), huella: String(f.huella) }));
}

export class ErrorMigracion extends Error {
  constructor(
    mensaje: string,
    readonly migracion?: Migracion,
    readonly sentencia?: number,
  ) {
    super(mensaje);
  }
}

/** Plan de la base: lo que falta aplicar. Falla si una migración aplicada cambió o si la base es más nueva que el código. */
export async function planDeLaBase(db: Base, archivos: Migracion[], soloLectura = false): Promise<Plan> {
  const faltantes = await tablasBaseFaltantes(db);
  if (faltantes.length > 0) {
    throw new ErrorMigracion(
      `La base no tiene el esquema inicial (faltan: ${faltantes.join(', ')}). Cargá primero docker/mariadb/01-esquema.sql; las migraciones parten de ese esquema.`,
    );
  }
  let aplicadas: MigracionAplicada[] = [];
  if (soloLectura) {
    // Consultar el estado no crea nada: si el registro no existe, no hay migraciones aplicadas
    aplicadas = (await versionEsquema(db)) > 0 ? await leerAplicadas(db) : [];
  } else {
    await asegurarRegistro(db);
    aplicadas = await leerAplicadas(db);
  }
  const plan = planificar(archivos, aplicadas);
  if (plan.modificadas.length > 0) {
    throw new ErrorMigracion(
      `Estas migraciones ya aplicadas cambiaron después de aplicarse: ${plan.modificadas.map((m) => `${m.version} (${m.nombre})`).join(', ')}. ` +
        'Una migración aplicada no se edita: los cambios nuevos van en una migración nueva.',
    );
  }
  if (plan.desconocidas.length > 0) {
    throw new ErrorMigracion(`La base tiene migraciones que este código no conoce (${plan.desconocidas.map((m) => m.version).join(', ')}). Actualizá el código antes de seguir.`);
  }

  return plan;
}

/**
 * Aplica las pendientes en orden, una sola vez cada una. MariaDB no deshace los ALTER TABLE
 * dentro de una transacción, por eso cada migración está escrita para poder repetirse
 * (IF EXISTS / IF NOT EXISTS): si una falla a mitad de camino, se registra el error, se corrige
 * la causa y se vuelve a ejecutar.
 */
export async function aplicarPendientes(db: Connection, archivos: Migracion[], informar: (texto: string) => void = () => undefined): Promise<Migracion[]> {
  const [candado] = await db.query<RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS ok', [CANDADO]);
  if (Number(candado[0].ok) !== 1) {
    throw new ErrorMigracion('Otra ejecución de migraciones está en curso en esta base. Esperá a que termine.');
  }
  try {
    const plan = await planDeLaBase(db, archivos);
    for (const migracion of plan.pendientes) {
      const inicio = Date.now();
      const partes = sentencias(migracion.sql);
      for (let i = 0; i < partes.length; i++) {
        try {
          await db.query(partes[i]);
        } catch (error) {
          const mensaje = error instanceof Error ? error.message : String(error);
          await db.query('INSERT INTO schema_migraciones_errores (version, nombre, huella, sentencia, error) VALUES (?, ?, ?, ?, ?)', [
            migracion.version,
            migracion.nombre,
            migracion.huella,
            i + 1,
            mensaje.slice(0, 2000),
          ]);
          throw new ErrorMigracion(`Falló la migración ${migracion.archivo}, sentencia ${i + 1} de ${partes.length}: ${mensaje}`, migracion, i + 1);
        }
      }
      await db.query('INSERT INTO schema_migraciones (version, nombre, huella, duracion_ms) VALUES (?, ?, ?, ?)', [
        migracion.version,
        migracion.nombre,
        migracion.huella,
        Date.now() - inicio,
      ]);
      informar(`  ✓ ${migracion.archivo} (${Date.now() - inicio} ms)`);
    }

    return plan.pendientes;
  } finally {
    await db.query('SELECT RELEASE_LOCK(?)', [CANDADO]);
  }
}
