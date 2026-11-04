// ============================================================================
// MEDICONTROL - Datos ficticios para la demostración
// Uso (desde backend/):
//   DB_NAME=medicontrol_demo DEMO_CLAVE=<contraseña> node --env-file=.env scripts/sembrar-demo.mjs
//
// Solo corre contra una base "medicontrol_demo" VACÍA (con el esquema ya creado). No toca
// medicontrol_db ni medicontrol_test. La contraseña de las cuentas sale de DEMO_CLAVE: nunca
// se guarda en el repositorio. Las personas, correos y DNI son inventados.
// ============================================================================
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const BASE = process.env.DB_NAME ?? '';
const CLAVE = process.env.DEMO_CLAVE ?? '';
const DOMINIO = '@demo.medicontrol.test';
const ZONA = 'America/Argentina/Buenos_Aires';

function abortar(mensaje) {
  console.error(`ABORTADO: ${mensaje}`);
  process.exit(2);
}

if (!/^medicontrol_demo(_[a-z0-9]+)?$/.test(BASE)) {
  abortar(`este script solo carga datos en medicontrol_demo (DB_NAME=${BASE || 'vacío'}).`);
}
// Misma política que el backend: 8 a 72 bytes, con letras y números
if (Buffer.byteLength(CLAVE) < 8 || Buffer.byteLength(CLAVE) > 72 || !/\p{L}/u.test(CLAVE) || !/\d/.test(CLAVE)) {
  abortar('DEMO_CLAVE debe tener entre 8 y 72 caracteres, con letras y números.');
}

/** 'YYYY-MM-DD' en la zona de la clínica, n días desde hoy. */
function dia(n) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + n));

  return d.toISOString().slice(0, 10);
}

const recepcion = { nombre: 'Elena', apellido: 'Recepción Demo', dni: '99000001', email: `recepcion${DOMINIO}` };
const medicos = [
  { nombre: 'Laura', apellido: 'Benítez Demo', dni: '99000101', email: `medico1${DOMINIO}`, especialidad: 'Clínica Médica', matricula: 'MN-90101' },
  { nombre: 'Martín', apellido: 'Quiroga Demo', dni: '99000102', email: `medico2${DOMINIO}`, especialidad: 'Pediatría', matricula: 'MN-90102' },
  { nombre: 'Sofía', apellido: 'Arce Demo', dni: '99000103', email: `medico3${DOMINIO}`, especialidad: 'Cardiología', matricula: 'MN-90103' },
];
const pacientes = [
  { nombre: 'Carla', apellido: 'Domínguez Demo', dni: '99000201', email: `paciente1${DOMINIO}`, telefono: '+54 342 400-0001', obra_social: 'OSDE', fecha_nacimiento: '1988-04-12', genero: 'Femenino' },
  { nombre: 'Julián', apellido: 'Ferreyra Demo', dni: '99000202', email: `paciente2${DOMINIO}`, telefono: '+54 342 400-0002', obra_social: 'IAPOS', fecha_nacimiento: '1975-09-30', genero: 'Masculino' },
  { nombre: 'Lucía', apellido: 'Morales Demo', dni: '99000203', email: `paciente3${DOMINIO}`, telefono: null, obra_social: 'Particular', fecha_nacimiento: '2015-02-08', genero: 'Femenino' },
  { nombre: 'Tomás', apellido: 'Ibarra Demo', dni: '99000204', email: `paciente4${DOMINIO}`, telefono: '+54 342 400-0004', obra_social: 'Swiss Medical', fecha_nacimiento: '1992-11-21', genero: 'Masculino' },
  { nombre: 'Valeria', apellido: 'Sosa Demo', dni: '99000205', email: `paciente5${DOMINIO}`, telefono: '+54 342 400-0005', obra_social: 'Particular', fecha_nacimiento: '1960-06-17', genero: 'Otro' },
];

// [médico, paciente, días desde hoy, hora, estado, motivo, notas]
const turnos = [
  [0, 0, -7, '09:00:00', 'atendido', 'Control anual', 'Presión 120/80. Control en un año.'],
  [0, 1, -3, '10:00:00', 'atendido', 'Dolor de garganta', 'Faringitis viral. Reposo e hidratación.'],
  [2, 0, -2, '11:00:00', 'cancelado', 'Electrocardiograma', null],
  [0, 0, 0, '08:00:00', 'atendido', 'Resultados de laboratorio', 'Valores normales.'],
  [0, 3, 0, '09:00:00', 'confirmado', 'Chequeo general', null],
  [0, 4, 0, '10:30:00', 'pendiente', 'Dolor lumbar', null],
  [1, 2, 0, '11:00:00', 'confirmado', 'Control de crecimiento', null],
  [2, 1, 0, '15:00:00', 'pendiente', 'Palpitaciones', null],
  [0, 1, 1, '08:30:00', 'pendiente', 'Seguimiento de tratamiento', null],
  [1, 2, 1, '09:30:00', 'pendiente', 'Vacunación', null],
  [2, 3, 1, '14:00:00', 'confirmado', 'Ergometría', null],
  [0, 0, 2, '12:00:00', 'pendiente', 'Consulta por alergia', null],
  [2, 4, 3, '16:00:00', 'pendiente', 'Control de presión', null],
  [1, 2, 7, '10:00:00', 'pendiente', 'Control pediátrico', null],
];

const conexion = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? '',
  database: BASE,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
});

try {
  const [[{ base }]] = await conexion.query('SELECT DATABASE() AS base');
  if (base !== BASE) {
    abortar(`la conexión apunta a ${base}.`);
  }
  const [[{ n }]] = await conexion.query('SELECT (SELECT COUNT(*) FROM usuarios) + (SELECT COUNT(*) FROM turnos) AS n');
  if (Number(n) > 0) {
    abortar(`${BASE} ya tiene datos: este script solo carga una base vacía y no borra nada.`);
  }

  // Mismo formato que password_hash de PHP: bcrypt de costo 10 con prefijo $2y$
  const hash = '$2y$' + (await bcrypt.hash(CLAVE, 10)).slice(4);
  await conexion.beginTransaction();

  const insertarUsuario = async (p, rol) => {
    const [r] = await conexion.execute("INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES (?, ?, ?, ?, ?, ?, 'activo')", [
      p.nombre,
      p.apellido,
      p.dni,
      p.email,
      hash,
      rol,
    ]);

    return r.insertId;
  };

  await insertarUsuario(recepcion, 'recepcionista');
  const idsMedico = [];
  for (const m of medicos) {
    const id = await insertarUsuario(m, 'medico');
    const [r] = await conexion.execute('INSERT INTO medicos (id_usuario, especialidad, matricula) VALUES (?, ?, ?)', [id, m.especialidad, m.matricula]);
    idsMedico.push(r.insertId);
  }
  const idsPaciente = [];
  for (const p of pacientes) {
    const id = await insertarUsuario(p, 'paciente');
    const [r] = await conexion.execute('INSERT INTO pacientes (id_usuario, telefono, fecha_nacimiento, genero, obra_social) VALUES (?, ?, ?, ?, ?)', [
      id,
      p.telefono,
      p.fecha_nacimiento,
      p.genero,
      p.obra_social,
    ]);
    idsPaciente.push(r.insertId);
  }
  for (const [m, p, n, hora, estado, motivo, notas] of turnos) {
    await conexion.execute('INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta, notas_medicas) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      idsPaciente[p],
      idsMedico[m],
      dia(n),
      hora,
      estado,
      motivo,
      notas,
    ]);
  }

  await conexion.commit();
  console.log(`Listo: ${BASE} tiene 1 recepcionista, ${medicos.length} médicos, ${pacientes.length} pacientes y ${turnos.length} turnos (desde ${dia(-7)} hasta ${dia(7)}).`);
  console.log(`Cuentas: recepcion${DOMINIO}, medico1..3${DOMINIO}, paciente1..5${DOMINIO}; contraseña: la de DEMO_CLAVE.`);
} catch (error) {
  await conexion.rollback().catch(() => undefined);
  console.error(`Error al cargar los datos: ${error.message}`);
  process.exitCode = 1;
} finally {
  await conexion.end();
}
