/**
 * Crea una base NUEVA y descartable con el esquema inicial y todas las migraciones:
 *
 *   DB_NAME=medicontrol_test_<sufijo>    base para las pruebas de integración, con las cuentas
 *                                         de demostración públicas de database/medicontrol.sql
 *   DB_NAME=medicontrol_ensayo_<sufijo>  base vacía para ensayar una importación de datos
 *   DB_NAME=medicontrol_local --definitiva   base definitiva vacía (también medicontrol_produccion),
 *                                         para importar después las cuentas de la versión PHP
 *
 *   node dist/migraciones/preparar-base.js [--definitiva]
 *
 * Se niega si la base ya existe (no reutiliza ni vacía nada) y nunca acepta medicontrol_db,
 * medicontrol_test ni medicontrol_demo. Las bases definitivas solo con --definitiva y sin datos. El usuario de DB_USER necesita permiso
 * para crear bases (en XAMPP, root). Es una herramienta de desarrollo: usa los archivos del repositorio.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import { esBaseDePrueba, esBaseProtegida } from './bases';
import { aplicarPendientes } from './ejecutor';
import { carpetaMigraciones, leerMigraciones, sentencias } from './migraciones';

const RAIZ = resolve(__dirname, '..', '..', '..');
const ESQUEMA = resolve(RAIZ, 'docker', 'mariadb', '01-esquema.sql');
const DATOS_DEMO = resolve(RAIZ, 'database', 'medicontrol.sql');
const BASE_ENSAYO = /^medicontrol_ensayo_[a-z0-9_]{1,40}$/;
const BASE_DEFINITIVA = /^medicontrol_(local|produccion)$/;

function salir(mensaje: string, codigo = 2): never {
  console.error(`ABORTADO: ${mensaje}`);
  process.exit(codigo);
}

/** Solo los INSERT de las cuentas y perfiles de demostración (sección 4 de medicontrol.sql), nunca CREATE DATABASE ni USE. */
function insertsDeDemostracion(): string[] {
  return sentencias(readFileSync(DATOS_DEMO, 'utf8')).filter((s) => /^INSERT INTO (usuarios|medicos|pacientes) /.test(s));
}

async function principal(): Promise<void> {
  const base = process.env.DB_NAME ?? '';
  const argumentos = process.argv.slice(2);
  if (argumentos.some((a) => a !== '--definitiva')) {
    salir('opción desconocida. Uso: preparar-base [--definitiva]');
  }
  const definitiva = argumentos.includes('--definitiva');
  const paraPruebas = esBaseDePrueba(base);
  const permitida = definitiva ? BASE_DEFINITIVA.test(base) : paraPruebas || BASE_ENSAYO.test(base);
  if (esBaseProtegida(base) || !permitida) {
    salir(
      definitiva
        ? `DB_NAME=${base || '(vacío)'}: con --definitiva solo se crean medicontrol_local o medicontrol_produccion.`
        : `DB_NAME=${base || '(vacío)'}: solo se crean bases medicontrol_test_<sufijo> o medicontrol_ensayo_<sufijo> (las definitivas, con --definitiva).`,
    );
  }

  const servidor = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4_unicode_ci',
  }).catch((e: { code?: string; message: string }) => salir(`no se pudo conectar al servidor (${e.code ?? e.message}).`));
  try {
    const [existe] = await servidor.query<RowDataPacket[]>('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [base]);
    if (existe.length > 0) {
      salir(`la base ${base} ya existe. Esta herramienta solo crea bases nuevas; si es una base descartable que ya no usás, borrala a mano y volvé a ejecutarla.`);
    }
    await servidor.query(`CREATE DATABASE \`${base}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await servidor.end();
  }

  const db = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: base,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4_unicode_ci',
  });
  try {
    for (const sentencia of sentencias(readFileSync(ESQUEMA, 'utf8'))) {
      await db.query(sentencia);
    }
    console.log(`Base ${base} creada con el esquema inicial.`);
    if (paraPruebas) {
      for (const sentencia of insertsDeDemostracion()) {
        await db.query(sentencia);
      }
      console.log('Cuentas de demostración cargadas (las de database/medicontrol.sql, solo para pruebas).');
    }
    const aplicadas = await aplicarPendientes(db, leerMigraciones(carpetaMigraciones()), (t) => console.log(t));
    console.log(`Migraciones aplicadas: ${aplicadas.length}.`);
  } finally {
    await db.end();
  }
}

principal().catch((error: unknown) => salir(error instanceof Error ? error.message : String(error), 1));
