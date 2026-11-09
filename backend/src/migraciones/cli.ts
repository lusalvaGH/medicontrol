/**
 * Migraciones del esquema de MediControl.
 *
 *   node dist/migraciones/cli.js            muestra el estado (no modifica nada)
 *   node dist/migraciones/cli.js --aplicar  aplica las migraciones pendientes, en orden
 *
 * Usa DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD. Se niega a trabajar sobre medicontrol_db,
 * medicontrol_test, medicontrol_demo o cualquier base con un nombre no permitido (ver bases.ts).
 * Solo cambia el esquema: nunca importa ni borra datos.
 */
import { createConnection } from 'mysql2/promise';
import { motivoBaseNoPermitida } from './bases';
import { ErrorMigracion, aplicarPendientes, planDeLaBase, versionEsquema } from './ejecutor';
import { carpetaMigraciones, leerMigraciones } from './migraciones';

function salir(mensaje: string, codigo = 2): never {
  console.error(`ABORTADO: ${mensaje}`);
  process.exit(codigo);
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const desconocidos = argumentos.filter((a) => a !== '--aplicar');
  if (desconocidos.length > 0) {
    salir(`opción desconocida: ${desconocidos.join(' ')}. Uso: migraciones [--aplicar]`);
  }
  const aplicar = argumentos.includes('--aplicar');

  const faltantes = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'].filter((c) => !process.env[c]);
  if (faltantes.length > 0) {
    salir(`faltan variables de entorno: ${faltantes.join(', ')}.`);
  }
  const base = String(process.env.DB_NAME);
  const motivo = motivoBaseNoPermitida(base);
  if (motivo) {
    salir(motivo);
  }

  const archivos = leerMigraciones(carpetaMigraciones());
  const db = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: base,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4_unicode_ci',
    multipleStatements: false,
  }).catch((error: { code?: string; message: string }) => salir(`no se pudo conectar a ${base} (${error.code ?? error.message}).`));

  try {
    console.log(`Base: ${base} · versión aplicada: ${await versionEsquema(db)} · versión del código: ${archivos.length}`);
    if (!aplicar) {
      const plan = await planDeLaBase(db, archivos, true);
      console.log(plan.pendientes.length === 0 ? 'Sin migraciones pendientes.' : `Pendientes: ${plan.pendientes.map((m) => m.archivo).join(', ')}`);
      return;
    }
    const aplicadas = await aplicarPendientes(db, archivos, (t) => console.log(t));
    console.log(aplicadas.length === 0 ? 'Sin migraciones pendientes.' : `Aplicadas ${aplicadas.length} migración(es). Versión actual: ${await versionEsquema(db)}.`);
  } catch (error) {
    if (error instanceof ErrorMigracion) {
      salir(`${error.message}\nVer docs/migracion-datos.md, sección «Si una migración falla».`, 1);
    }
    throw error;
  } finally {
    await db.end();
  }
}

principal().catch((error: unknown) => salir(error instanceof Error ? error.message : String(error), 1));
