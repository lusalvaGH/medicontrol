// ============================================================================
// MEDICONTROL - Cuentas iniciales para una instalación nueva (Docker)
//
// Uso, con los contenedores levantados (ver docs/instalacion-docker.md):
//   docker compose exec backend node scripts/crear-cuentas-iniciales.mjs
//
// Crea una cuenta por rol (recepción, médico y paciente) con los datos ficticios de
// demostración del proyecto y una contraseña al azar para cada una. Las contraseñas se
// muestran UNA sola vez en la terminal: no se guardan en ningún archivo ni en el log.
//
// Es un paso manual: no corre al iniciar ni al reiniciar. Solo trabaja sobre la base
// medicontrol_local de Docker, y se niega a ejecutarse si esa base ya tiene usuarios,
// pacientes, médicos o turnos. Nunca se ejecuta contra medicontrol_db, medicontrol_test
// ni medicontrol_demo.
// ============================================================================
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const BASE_PERMITIDA = 'medicontrol_local';
const BASES_PROHIBIDAS = /^medicontrol_(db|test|demo)(_.*)?$/;
const TABLAS = ['usuarios', 'pacientes', 'medicos', 'turnos'];

function abortar(mensaje) {
  console.error(`ABORTADO: ${mensaje}`);
  process.exit(2);
}

const BASE = process.env.DB_NAME ?? '';
const faltantes = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'].filter((clave) => !process.env[clave]);
if (faltantes.length > 0) {
  abortar(`faltan variables de entorno: ${faltantes.join(', ')}. Ejecutalo dentro del contenedor backend.`);
}
if (BASES_PROHIBIDAS.test(BASE)) {
  abortar(`este script no se ejecuta contra ${BASE}. Solo es para la base nueva de Docker.`);
}
if (BASE !== BASE_PERMITIDA) {
  abortar(`este script solo trabaja sobre ${BASE_PERMITIDA} (DB_NAME=${BASE}).`);
}

// Contraseña al azar de 16 caracteres con letras y números (la política del backend pide
// entre 8 y 72 caracteres con al menos una letra y un número). Sin caracteres ambiguos.
const LETRAS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITOS = '23456789';
function claveAlAzar() {
  const todos = LETRAS + DIGITOS;
  const caracteres = [LETRAS[randomInt(LETRAS.length)], DIGITOS[randomInt(DIGITOS.length)]];
  while (caracteres.length < 16) {
    caracteres.push(todos[randomInt(todos.length)]);
  }
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }

  return caracteres.join('');
}

// Mismo formato que password_hash de PHP: bcrypt de costo 10 con prefijo $2y$
async function hashCompatible(clave) {
  return '$2y$' + (await bcrypt.hash(clave, 10)).slice(4);
}

// Datos ficticios de demostración (los mismos que database/medicontrol.sql)
const CUENTAS = [
  { rol: 'recepcionista', nombre: 'Elena', apellido: 'Martínez', dni: '30111222', email: 'operador@medicore.com' },
  {
    rol: 'medico',
    nombre: 'Alejandro',
    apellido: 'Rossi',
    dni: '20111333',
    email: 'a.rossi@medicore.com',
    medico: { especialidad: 'Cardiología', matricula: 'MN-45892' },
  },
  {
    rol: 'paciente',
    nombre: 'Mateo',
    apellido: 'Fernández',
    dni: '38991204',
    email: 'm.fernandez@mail.com',
    paciente: { telefono: '+54 11 9988-1122', direccion: 'Corrientes 3450, CABA', fecha_nacimiento: '2001-11-03', genero: 'Masculino', obra_social: 'Galeno Silver' },
  },
];

let conexion;
try {
  conexion = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: BASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    charset: 'utf8mb4_unicode_ci',
    dateStrings: true,
  });
} catch (error) {
  abortar(`no se pudo conectar a la base ${BASE} (${error.code ?? error.message}). ¿Está levantado el servicio mariadb?`);
}

const salidas = [];
try {
  const [[base]] = await conexion.query('SELECT DATABASE() AS nombre');
  if (base.nombre !== BASE) {
    abortar(`la conexión apunta a ${base.nombre}, no a ${BASE}.`);
  }
  const [tablas] = await conexion.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME IN (?)", [BASE, TABLAS]);
  if (Number(tablas[0].n) !== TABLAS.length) {
    abortar(`la base ${BASE} no tiene el esquema de MediControl. Revisá que MariaDB haya cargado docker/mariadb/01-esquema.sql.`);
  }

  await conexion.beginTransaction();
  // FOR UPDATE bloquea las tablas: dos ejecuciones simultáneas no pueden crear cuentas duplicadas
  for (const tabla of TABLAS) {
    const [[fila]] = await conexion.query(`SELECT COUNT(*) AS n FROM ${tabla} FOR UPDATE`);
    if (Number(fila.n) > 0) {
      await conexion.rollback();
      abortar(`la tabla ${tabla} de ${BASE} ya tiene ${fila.n} registro(s). Este script solo inicializa una base vacía; no se creó nada.`);
    }
  }

  for (const cuenta of CUENTAS) {
    const clave = claveAlAzar();
    const [r] = await conexion.execute(
      "INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES (?, ?, ?, ?, ?, ?, 'activo')",
      [cuenta.nombre, cuenta.apellido, cuenta.dni, cuenta.email, await hashCompatible(clave), cuenta.rol],
    );
    if (cuenta.medico) {
      await conexion.execute('INSERT INTO medicos (id_usuario, especialidad, matricula) VALUES (?, ?, ?)', [r.insertId, cuenta.medico.especialidad, cuenta.medico.matricula]);
    }
    if (cuenta.paciente) {
      const p = cuenta.paciente;
      await conexion.execute('INSERT INTO pacientes (id_usuario, telefono, direccion, fecha_nacimiento, genero, obra_social) VALUES (?, ?, ?, ?, ?, ?)', [
        r.insertId,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        p.genero,
        p.obra_social,
      ]);
    }
    salidas.push({ rol: cuenta.rol, email: cuenta.email, clave });
  }
  await conexion.commit();
} catch (error) {
  await conexion.rollback().catch(() => {});
  abortar(`no se crearon cuentas: ${error.code ?? error.message}`);
} finally {
  await conexion.end().catch(() => {});
}

console.log(`\nCuentas iniciales creadas en la base ${BASE}.`);
console.log('Anotá las contraseñas ahora: no se guardan en ningún lado y no se vuelven a mostrar.\n');
for (const s of salidas) {
  console.log(`  ${s.rol.padEnd(14)} ${s.email.padEnd(24)} ${s.clave}`);
}
console.log('');
