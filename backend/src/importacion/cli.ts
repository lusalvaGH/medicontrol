/**
 * Importa los datos de la versión PHP (usuarios, médicos, pacientes y turnos) a una base nueva de
 * MediControl NestJS, conservando los identificadores originales. Ver docs/migracion-datos.md.
 *
 * Origen (solo lectura, uno de los dos):
 *   --volcado <archivo.sql>     un volcado de mysqldump; se lee como texto, nunca se ejecuta
 *   --base-origen <nombre>      una base del mismo servidor, leída en una transacción READ ONLY
 *
 * Destino: la base de DB_NAME (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD). Tiene que tener un nombre
 * permitido (nunca medicontrol_db, medicontrol_test ni medicontrol_demo), las migraciones al día y
 * las cuatro tablas vacías.
 *
 * Opciones:
 *   --ensayo                    controla el origen y muestra el informe, sin escribir nada
 *   --solo-cuentas              migra usuarios y perfiles de médicos y pacientes, sin turnos (ni sus notas):
 *                               la instalación nueva empieza sin turnos
 *   --sin-inactivos             con --solo-cuentas: no migra las cuentas dadas de baja (no pueden iniciar sesión)
 *   --exigir-cambio-contrasena  todas las cuentas importadas deben cambiar su contraseña al entrar
 *                               (por ejemplo, al trasladar cuentas que ya tenían contraseñas provisorias)
 *   --listar-cuentas            muestra las cuentas que se migrarían (id, rol, estado, correo, perfil y si
 *                               usan la contraseña de demostración), para revisarlas antes de importar
 *   --contrasenas-demo=reemplazar|conservar
 *       qué hacer con las cuentas cuya contraseña es la de demostración publicada en el README.
 *       reemplazar: cada una recibe una contraseña provisoria al azar y debe cambiarla al entrar.
 *       Si hay cuentas así y no se indica la opción, no se importa nada.
 *   --archivo-contrasenas <ruta>  obligatorio con --contrasenas-demo=reemplazar: archivo NUEVO, fuera
 *       del repositorio, donde se guardan los correos con sus contraseñas provisorias. Nunca se
 *       muestran en la consola. El archivo queda legible solo por el usuario que ejecuta el comando.
 *
 * Todo se inserta en una transacción. Antes de confirmarla se comparan cantidades y huellas
 * SHA-256 de cada tabla entre origen y destino, y la integridad de las relaciones; si algo no
 * coincide se deshace todo. El informe no muestra datos personales.
 */
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { motivoBaseNoPermitida } from '../migraciones/bases';
import { versionEsquema } from '../migraciones/ejecutor';
import { VERSION_ESQUEMA_REQUERIDA } from '../migraciones/migraciones';
import { fechaHoy } from '../reglas/zona-horaria';
import { COLUMNAS, Datos, Fila, ORDEN, controlar, filasConColumnas, huellaTabla } from './datos';
import { leerVolcado } from './volcado';

/** Contraseña de las cuentas de demostración, publicada en el README del proyecto PHP. */
const CONTRASENA_DEMO_PUBLICA = '123456';

interface Opciones {
  volcado: string | null;
  baseOrigen: string | null;
  ensayo: boolean;
  contrasenasDemo: 'reemplazar' | 'conservar' | null;
  soloCuentas: boolean;
  sinInactivos: boolean;
  listarCuentas: boolean;
  archivoContrasenas: string | null;
  exigirCambio: boolean;
}

function salir(mensaje: string, codigo = 2): never {
  console.error(`ABORTADO: ${mensaje}`);
  process.exit(codigo);
}

function leerOpciones(argumentos: string[]): Opciones {
  const opciones: Opciones = { volcado: null, baseOrigen: null, ensayo: false, contrasenasDemo: null, soloCuentas: false, sinInactivos: false, listarCuentas: false, archivoContrasenas: null, exigirCambio: false };
  for (let i = 0; i < argumentos.length; i++) {
    const a = argumentos[i];
    if (a === '--volcado') {
      opciones.volcado = argumentos[++i] ?? salir('falta la ruta después de --volcado.');
    } else if (a === '--base-origen') {
      opciones.baseOrigen = argumentos[++i] ?? salir('falta el nombre después de --base-origen.');
    } else if (a === '--ensayo') {
      opciones.ensayo = true;
    } else if (a === '--solo-cuentas') {
      opciones.soloCuentas = true;
    } else if (a === '--sin-inactivos') {
      opciones.sinInactivos = true;
    } else if (a === '--exigir-cambio-contrasena') {
      opciones.exigirCambio = true;
    } else if (a === '--listar-cuentas') {
      opciones.listarCuentas = true;
    } else if (a === '--archivo-contrasenas') {
      opciones.archivoContrasenas = argumentos[++i] ?? salir('falta la ruta después de --archivo-contrasenas.');
    } else if (a === '--contrasenas-demo=reemplazar' || a === '--contrasenas-demo=conservar') {
      opciones.contrasenasDemo = a.endsWith('reemplazar') ? 'reemplazar' : 'conservar';
    } else {
      salir(`opción desconocida: ${a}.`);
    }
  }
  if ((opciones.volcado === null) === (opciones.baseOrigen === null)) {
    salir('indicá un origen: --volcado <archivo.sql> o --base-origen <nombre> (uno solo).');
  }
  if (opciones.contrasenasDemo === 'reemplazar' && !opciones.ensayo) {
    validarArchivoContrasenas(opciones.archivoContrasenas);
  }
  if (opciones.sinInactivos && !opciones.soloCuentas) {
    salir('--sin-inactivos solo se puede usar con --solo-cuentas (un turno podría quedar sin su paciente o médico).');
  }

  return opciones;
}

function conexion(base: string | undefined): Promise<Connection> {
  return createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: base,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4_unicode_ci',
    dateStrings: true,
    multipleStatements: false,
  });
}

/** Datos desde un volcado: se lee el texto, no se ejecuta ninguna sentencia. */
function desdeVolcado(ruta: string, soloCuentas: boolean): Datos {
  const volcado = leerVolcado(readFileSync(ruta, 'utf8'));
  if (!volcado.timestampsEnUtc) {
    salir("el volcado no trae SET TIME_ZONE='+00:00': las fechas de alta (creado_en) quedarían corridas. Generalo con mysqldump sin --skip-tz-utc.");
  }
  const datos = {} as Datos;
  for (const tabla of ORDEN) {
    // Un volcado de solo cuentas puede no traer la tabla de turnos
    const t = volcado.tablas[tabla] ?? (soloCuentas && tabla === 'turnos' ? { columnas: [...COLUMNAS.turnos], filas: [] } : salir(`el volcado no tiene la tabla ${tabla}.`));
    datos[tabla] = filasConColumnas(tabla, t.columnas, t.filas);
  }
  console.log(`Origen: volcado ${ruta}${volcado.baseOrigen ? ` (base ${volcado.baseOrigen})` : ''}.`);

  return datos;
}

/** Datos desde una base del servidor, en una transacción de solo lectura (foto coherente). */
async function desdeBase(nombre: string): Promise<Datos> {
  if (!/^\w{1,64}$/.test(nombre)) {
    salir('nombre de base de origen inválido.');
  }
  const db = await conexion(nombre).catch((e: { code?: string; message: string }) => salir(`no se pudo conectar al origen ${nombre} (${e.code ?? e.message}).`));
  try {
    await db.query("SET SESSION time_zone = '+00:00'");
    await db.query('START TRANSACTION READ ONLY');
    const datos = {} as Datos;
    for (const tabla of ORDEN) {
      const [filas] = await db.query<RowDataPacket[]>(`SELECT ${COLUMNAS[tabla].join(', ')} FROM ${tabla} ORDER BY ${COLUMNAS[tabla][0]}`);
      datos[tabla] = filas.map((f) => Object.fromEntries(COLUMNAS[tabla].map((c) => [c, f[c] === null ? null : String(f[c])])));
    }
    await db.query('COMMIT');
    console.log(`Origen: base ${nombre} (solo lectura).`);

    return datos;
  } finally {
    await db.end();
  }
}

/** Raíz del repositorio (este archivo está en backend/src/importacion o backend/dist/importacion). */
const RAIZ_REPOSITORIO = resolve(__dirname, '..', '..', '..');

/** El archivo de contraseñas tiene que ser una ruta absoluta, nueva y fuera del repositorio (nunca en Git). */
function validarArchivoContrasenas(ruta: string | null): void {
  if (!ruta) {
    salir('con --contrasenas-demo=reemplazar indicá --archivo-contrasenas <ruta>: las contraseñas provisorias no se muestran en la consola.');
  }
  if (!isAbsolute(ruta)) {
    salir('--archivo-contrasenas tiene que ser una ruta absoluta.');
  }
  const dentro = relative(RAIZ_REPOSITORIO, resolve(ruta));
  if (!dentro.startsWith('..') && !isAbsolute(dentro)) {
    salir('el archivo de contraseñas no puede estar dentro del repositorio.');
  }
}

/** Escribe el archivo (falla si ya existe) y deja el acceso solo para el usuario actual. */
function guardarContrasenas(ruta: string, destino: string, provisorias: { email: string; clave: string }[]): void {
  const texto = [
    `MediControl · contraseñas provisorias de la base ${destino}`,
    `Generado: ${new Date().toISOString()}`,
    'Cada persona debe cambiarla al iniciar sesión. Entregalas por un medio seguro y borrá este archivo después.',
    '',
    ...provisorias.map((p) => `${p.email}\t${p.clave}`),
    '',
  ].join('\n');
  writeFileSync(ruta, texto, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (process.platform === 'win32') {
    // Sin permisos heredados: solo el usuario que ejecuta la importación puede leerlo
    const usuario = process.env.USERNAME ?? '';
    execFileSync('icacls', [ruta, '/inheritance:r', '/grant:r', `${usuario}:(R,W)`], { stdio: 'ignore' });
    // Windows agrega por defecto SYSTEM y Administradores al crear el archivo: se quitan también
    execFileSync('icacls', [ruta, '/remove:g', '*S-1-5-18', '*S-1-5-32-544'], { stdio: 'ignore' });
  }
}

function mostrarInforme(titulo: string, informe: ReturnType<typeof controlar>): void {
  console.log(`\n${titulo}`);
  for (const [clave, valor] of Object.entries(informe.conteos)) {
    console.log(`  ${clave.padEnd(34)} ${valor}`);
  }
  informe.avisos.forEach((a) => console.log(`  AVISO: ${a}`));
  informe.errores.forEach((e) => console.log(`  ERROR: ${e}`));
}

/** Cuentas cuya contraseña es la de demostración publicada. Se compara una vez por hash distinto. */
async function cuentasConContrasenaDemo(usuarios: Fila[]): Promise<Set<string>> {
  const porHash = new Map<string, boolean>();
  const ids = new Set<string>();
  for (const u of usuarios) {
    const h = String(u.contrasena);
    if (!porHash.has(h)) {
      porHash.set(h, /^\$2[aby]\$/.test(h) && (await compare(CONTRASENA_DEMO_PUBLICA, h)));
    }
    if (porHash.get(h)) {
      ids.add(String(u.id_usuario));
    }
  }

  return ids;
}

function claveProvisoria(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digitos = '23456789';
  const todos = letras + digitos;
  const c = [letras[randomInt(letras.length)], digitos[randomInt(digitos.length)]];
  while (c.length < 16) {
    c.push(todos[randomInt(todos.length)]);
  }
  for (let i = c.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [c[i], c[j]] = [c[j], c[i]];
  }

  return c.join('');
}

async function leerDestino(db: Connection): Promise<Datos> {
  const datos = {} as Datos;
  for (const tabla of ORDEN) {
    const [filas] = await db.query<RowDataPacket[]>(`SELECT ${COLUMNAS[tabla].join(', ')} FROM ${tabla} ORDER BY ${COLUMNAS[tabla][0]}`);
    datos[tabla] = filas.map((f) => Object.fromEntries(COLUMNAS[tabla].map((c) => [c, f[c] === null ? null : String(f[c])])));
  }

  return datos;
}

/** Relaciones colgadas en el destino (deben ser 0 con las claves foráneas activas). */
async function integridadDestino(db: Connection): Promise<number> {
  const [filas] = await db.query<RowDataPacket[]>(`SELECT
    (SELECT COUNT(*) FROM turnos t LEFT JOIN pacientes p ON p.id_paciente = t.id_paciente WHERE p.id_paciente IS NULL) +
    (SELECT COUNT(*) FROM turnos t LEFT JOIN medicos m ON m.id_medico = t.id_medico WHERE m.id_medico IS NULL) +
    (SELECT COUNT(*) FROM pacientes p LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE u.id_usuario IS NULL OR u.rol <> 'paciente') +
    (SELECT COUNT(*) FROM medicos m LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE u.id_usuario IS NULL OR u.rol <> 'medico') AS colgadas`);

  return Number(filas[0].colgadas);
}

async function principal(): Promise<void> {
  const opciones = leerOpciones(process.argv.slice(2));
  const faltantes = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'].filter((c) => !process.env[c]);
  if (faltantes.length > 0) {
    salir(`faltan variables de entorno: ${faltantes.join(', ')}.`);
  }
  const destino = String(process.env.DB_NAME);
  const motivo = motivoBaseNoPermitida(destino);
  if (motivo) {
    salir(`destino no permitido: ${motivo}`);
  }
  if (opciones.baseOrigen === destino) {
    salir('el origen y el destino son la misma base.');
  }

  // 1. Origen y controles
  const origen = opciones.volcado ? desdeVolcado(opciones.volcado, opciones.soloCuentas) : await desdeBase(String(opciones.baseOrigen));
  if (opciones.soloCuentas) {
    console.log(`Solo cuentas: ${origen.turnos.length} turno(s) del origen NO se migran (tampoco sus notas).`);
    origen.turnos = [];
    if (opciones.sinInactivos) {
      const inactivos = new Set(origen.usuarios.filter((u) => u.estado !== 'activo').map((u) => String(u.id_usuario)));
      origen.usuarios = origen.usuarios.filter((u) => !inactivos.has(String(u.id_usuario)));
      origen.medicos = origen.medicos.filter((m) => !inactivos.has(String(m.id_usuario)));
      origen.pacientes = origen.pacientes.filter((p) => !inactivos.has(String(p.id_usuario)));
      console.log(`Sin inactivos: ${inactivos.size} cuenta(s) dadas de baja NO se migran.`);
    }
  }
  const informe = controlar(origen, fechaHoy(new Date()));
  mostrarInforme('Controles del origen:', informe);
  const conDemo = await cuentasConContrasenaDemo(origen.usuarios);
  console.log(`  ${'usuarios_con_contrasena_demo'.padEnd(34)} ${conDemo.size}`);
  if (opciones.listarCuentas) {
    const perfilMedico = new Map(origen.medicos.map((m) => [String(m.id_usuario), m]));
    const perfilPaciente = new Map(origen.pacientes.map((p) => [String(p.id_usuario), p]));
    console.log('\nCuentas que se migrarían:');
    for (const u of origen.usuarios) {
      const id = String(u.id_usuario);
      const m = perfilMedico.get(id);
      const p = perfilPaciente.get(id);
      const perfil = m ? `médico #${m.id_medico} (${m.especialidad})` : p ? `paciente #${p.id_paciente}` : '—';
      console.log(`  #${id.padEnd(4)} ${String(u.rol).padEnd(14)} ${String(u.estado).padEnd(9)} ${String(u.email).padEnd(36)} ${perfil.padEnd(32)} ${conDemo.has(id) ? 'contraseña de demo' : 'contraseña propia'}`);
    }
  }
  const huellasOrigen = Object.fromEntries(ORDEN.map((t) => [t, huellaTabla(t, origen[t])]));
  ORDEN.forEach((t) => console.log(`  huella ${t.padEnd(27)} ${huellasOrigen[t]}`));

  if (informe.errores.length > 0) {
    salir('el origen tiene errores que impedirían migrar (ver arriba). No se escribió nada.', 1);
  }
  if (conDemo.size > 0 && opciones.contrasenasDemo === null) {
    salir(`${conDemo.size} cuenta(s) usan la contraseña de demostración publicada. Indicá --contrasenas-demo=reemplazar (recomendado) o --contrasenas-demo=conservar.`, 1);
  }
  if (opciones.ensayo) {
    console.log('\nEnsayo: el origen se puede importar. No se escribió nada.');
    return;
  }

  // 2. Destino: migrado y vacío
  const db = await conexion(destino).catch((e: { code?: string; message: string }) => salir(`no se pudo conectar al destino ${destino} (${e.code ?? e.message}).`));
  const provisorias: { email: string; clave: string }[] = [];
  try {
    const version = await versionEsquema(db);
    if (version < VERSION_ESQUEMA_REQUERIDA) {
      salir(`el destino ${destino} está en la versión de esquema ${version} y se necesita la ${VERSION_ESQUEMA_REQUERIDA}. Ejecutá antes las migraciones.`);
    }
    for (const tabla of ORDEN) {
      const [[{ n }]] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${tabla}`);
      if (Number(n) > 0) {
        salir(`el destino ${destino} ya tiene datos en ${tabla} (${n} filas). La importación solo se hace sobre tablas vacías: no se mezcla ni se sobrescribe nada.`);
      }
    }

    // 3. Inserción en una transacción, con los identificadores originales
    await db.query("SET SESSION time_zone = '+00:00'");
    await db.beginTransaction();
    for (const tabla of ORDEN) {
      const columnas = COLUMNAS[tabla];
      const sql = `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`;
      for (const fila of origen[tabla]) {
        await db.execute(sql, columnas.map((c) => fila[c]));
      }
    }

    // 4. Verificación antes de confirmar: cantidades, huellas e integridad
    const copia = await leerDestino(db);
    const diferencias = ORDEN.filter((t) => copia[t].length !== origen[t].length || huellaTabla(t, copia[t]) !== huellasOrigen[t]);
    const colgadas = await integridadDestino(db);
    if (diferencias.length > 0 || colgadas > 0) {
      await db.rollback();
      salir(`la copia no coincide con el origen (${diferencias.join(', ') || 'relaciones colgadas: ' + colgadas}). Se deshizo todo: el destino quedó vacío.`, 1);
    }
    console.log('\nVerificación: cantidades, huellas e integridad coinciden con el origen.');

    // 5. Cambio obligatorio para todas las cuentas importadas, si se pidió
    if (opciones.exigirCambio) {
      await db.query('UPDATE usuarios SET debe_cambiar_contrasena = 1');
      console.log('Todas las cuentas importadas deben cambiar su contraseña al entrar.');
    }

    // 6. Contraseñas de demostración: provisorias al azar y cambio obligatorio
    if (opciones.contrasenasDemo === 'reemplazar') {
      for (const u of origen.usuarios.filter((x) => conDemo.has(String(x.id_usuario)))) {
        const clave = claveProvisoria();
        const hashNuevo = '$2y$' + (await hash(clave, 10)).slice(4);
        await db.execute('UPDATE usuarios SET contrasena = ?, debe_cambiar_contrasena = 1 WHERE id_usuario = ?', [hashNuevo, u.id_usuario]);
        provisorias.push({ email: String(u.email), clave });
      }
      // Primero el archivo: si no se puede guardar, no se confirma nada (nadie quedaría sin poder entrar)
      try {
        guardarContrasenas(String(opciones.archivoContrasenas), destino, provisorias);
      } catch (error) {
        await db.rollback();
        salir(`no se pudo guardar el archivo de contraseñas (${error instanceof Error ? error.message : String(error)}). Se deshizo todo: el destino quedó vacío.`, 1);
      }
    }
    try {
      await db.commit();
    } catch (error) {
      if (provisorias.length > 0) {
        unlinkSync(String(opciones.archivoContrasenas));
      }
      throw error;
    }
  } catch (error) {
    await db.rollback().catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }

  console.log(`\nImportación confirmada en ${destino}: ${ORDEN.map((t) => `${origen[t].length} ${t}`).join(', ')}.`);
  if (provisorias.length > 0) {
    console.log(`\n${provisorias.length} cuenta(s) tenían la contraseña de demostración y recibieron una provisoria.`);
    console.log(`Contraseñas guardadas en ${opciones.archivoContrasenas} (solo legible por este usuario). No se muestran en la consola.`);
  }
}

principal().catch((error: unknown) => salir(error instanceof Error ? error.message : String(error), 1));
