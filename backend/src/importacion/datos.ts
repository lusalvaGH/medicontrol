import { createHash } from 'node:crypto';
import type { Valor } from './volcado';

/**
 * Datos de MediControl en un formato común (venga de un volcado o de una base), las columnas que
 * se migran, los controles de integridad y las huellas para comparar origen y destino.
 * Ningún informe incluye datos personales: solo cantidades y huellas.
 */

/** Columnas del esquema original (PHP) que se trasladan, en el orden en que se insertan. */
export const COLUMNAS = {
  usuarios: ['id_usuario', 'nombre', 'apellido', 'dni', 'email', 'contrasena', 'rol', 'estado', 'creado_en'],
  medicos: ['id_medico', 'id_usuario', 'especialidad', 'matricula'],
  pacientes: ['id_paciente', 'id_usuario', 'telefono', 'direccion', 'fecha_nacimiento', 'genero', 'obra_social'],
  turnos: ['id_turno', 'id_paciente', 'id_medico', 'fecha', 'hora', 'estado', 'motivo_consulta', 'notas_medicas', 'creado_en'],
} as const;

export type NombreTabla = keyof typeof COLUMNAS;

/** Orden de inserción: primero las tablas referenciadas por las claves foráneas. */
export const ORDEN: NombreTabla[] = ['usuarios', 'medicos', 'pacientes', 'turnos'];

export type Fila = Record<string, Valor>;
export type Datos = Record<NombreTabla, Fila[]>;

/** Convierte columnas y filas sueltas en objetos con las columnas del esquema; falla si falta alguna. */
export function filasConColumnas(tabla: NombreTabla, columnas: string[], filas: Valor[][]): Fila[] {
  const faltantes = COLUMNAS[tabla].filter((c) => !columnas.includes(c));
  if (faltantes.length > 0) {
    throw new Error(`La tabla ${tabla} del origen no tiene las columnas: ${faltantes.join(', ')}.`);
  }
  const indices = COLUMNAS[tabla].map((c) => columnas.indexOf(c));

  return filas.map((fila) => Object.fromEntries(COLUMNAS[tabla].map((c, i) => [c, fila[indices[i]]])));
}

/** Huella de una tabla: SHA-256 de sus filas ordenadas por id, con las columnas del esquema. */
export function huellaTabla(tabla: NombreTabla, filas: Fila[]): string {
  const id = COLUMNAS[tabla][0];
  const ordenadas = [...filas].sort((a, b) => Number(a[id]) - Number(b[id]));
  const texto = ordenadas.map((f) => COLUMNAS[tabla].map((c) => (f[c] === null ? '\\N' : String(f[c]))).join('\u001f')).join('\u001e');

  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

const HORARIOS = new Set(Array.from({ length: 19 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00`));
const ENUMS = {
  rol: ['recepcionista', 'medico', 'paciente'],
  estadoUsuario: ['activo', 'inactivo'],
  genero: ['Femenino', 'Masculino', 'Otro'],
  estadoTurno: ['pendiente', 'confirmado', 'en_curso', 'atendido', 'cancelado'],
};

export interface Informe {
  /** Impiden migrar: hay que resolverlos en el origen (o decidir qué hacer) antes de importar. */
  errores: string[];
  /** No impiden migrar, pero conviene revisarlos. */
  avisos: string[];
  conteos: Record<string, number>;
}

/**
 * Controles sobre los datos de origen. Los errores son los que romperían una restricción del
 * esquema nuevo o dejarían relaciones colgadas; nada se corrige solo, para no inventar datos.
 */
export function controlar(datos: Datos, hoy: string): Informe {
  const errores: string[] = [];
  const avisos: string[] = [];
  const conteos: Record<string, number> = {};
  const cuenta = (nombre: string, n: number) => {
    conteos[nombre] = n;
    return n;
  };
  const repetidos = (valores: string[]) => valores.length - new Set(valores).size;

  for (const tabla of ORDEN) {
    cuenta(tabla, datos[tabla].length);
    if (repetidos(datos[tabla].map((f) => String(f[COLUMNAS[tabla][0]]))) > 0) {
      errores.push(`${tabla}: hay identificadores repetidos.`);
    }
  }

  const usuarios = new Map(datos.usuarios.map((u) => [String(u.id_usuario), u]));
  const medicos = new Map(datos.medicos.map((m) => [String(m.id_medico), m]));
  const pacientes = new Map(datos.pacientes.map((p) => [String(p.id_paciente), p]));

  // Usuarios
  if (cuenta('usuarios_correo_repetido', repetidos(datos.usuarios.map((u) => String(u.email).toLowerCase()))) > 0) {
    errores.push('usuarios: hay correos repetidos (sin distinguir mayúsculas). La base nueva no los admite.');
  }
  if (cuenta('usuarios_dni_repetido', repetidos(datos.usuarios.map((u) => String(u.dni)))) > 0) {
    errores.push('usuarios: hay DNI repetidos.');
  }
  if (cuenta('usuarios_valor_invalido', datos.usuarios.filter((u) => !ENUMS.rol.includes(String(u.rol)) || !ENUMS.estadoUsuario.includes(String(u.estado))).length) > 0) {
    errores.push('usuarios: hay roles o estados que no existen en el esquema.');
  }
  if (cuenta('usuarios_hash_no_bcrypt', datos.usuarios.filter((u) => !/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(String(u.contrasena))).length) > 0) {
    avisos.push('usuarios: hay contraseñas que no son hashes bcrypt; esas cuentas no van a poder iniciar sesión hasta asignarles una provisoria.');
  }
  if (cuenta('usuarios_dni_formato', datos.usuarios.filter((u) => !/^\d{7,8}$/.test(String(u.dni))).length) > 0) {
    avisos.push('usuarios: hay DNI que no tienen 7 u 8 dígitos; se migran igual, pero al editar esas cuentas habrá que corregirlos.');
  }
  for (const rol of ['recepcionista', 'medico', 'paciente']) {
    cuenta(`usuarios_${rol}`, datos.usuarios.filter((u) => u.rol === rol).length);
  }
  cuenta('usuarios_inactivos', datos.usuarios.filter((u) => u.estado === 'inactivo').length);

  // Perfiles
  const perfiles = (filas: Fila[], rol: string, tabla: string) => {
    if (filas.some((f) => !usuarios.has(String(f.id_usuario)))) {
      errores.push(`${tabla}: hay perfiles de usuarios que no existen.`);
    }
    if (filas.some((f) => usuarios.has(String(f.id_usuario)) && usuarios.get(String(f.id_usuario))?.rol !== rol)) {
      errores.push(`${tabla}: hay perfiles cuyo usuario tiene otro rol.`);
    }
    if (repetidos(filas.map((f) => String(f.id_usuario))) > 0) {
      errores.push(`${tabla}: hay usuarios con más de un perfil.`);
    }
    const conPerfil = new Set(filas.map((f) => String(f.id_usuario)));
    if (cuenta(`${tabla}_usuarios_sin_perfil`, datos.usuarios.filter((u) => u.rol === rol && !conPerfil.has(String(u.id_usuario))).length) > 0) {
      avisos.push(`${tabla}: hay usuarios con rol ${rol} sin perfil; el sistema nuevo no les mostrará agenda ni turnos.`);
    }
  };
  perfiles(datos.medicos, 'medico', 'medicos');
  perfiles(datos.pacientes, 'paciente', 'pacientes');
  if (datos.pacientes.some((p) => p.genero !== null && !ENUMS.genero.includes(String(p.genero)))) {
    errores.push('pacientes: hay géneros que no existen en el esquema.');
  }

  // Turnos
  if (datos.turnos.some((t) => !pacientes.has(String(t.id_paciente)) || !medicos.has(String(t.id_medico)))) {
    errores.push('turnos: hay turnos con un paciente o un médico que no existe.');
  }
  if (datos.turnos.some((t) => !ENUMS.estadoTurno.includes(String(t.estado)))) {
    errores.push('turnos: hay estados que no existen en el esquema.');
  }
  for (const estado of ENUMS.estadoTurno) {
    cuenta(`turnos_${estado}`, datos.turnos.filter((t) => t.estado === estado).length);
  }
  const vigentes = datos.turnos.filter((t) => t.estado !== 'cancelado');
  if (cuenta('turnos_medico_superpuesto', repetidos(vigentes.map((t) => `${t.id_medico}|${t.fecha}|${t.hora}`))) > 0) {
    errores.push('turnos: un médico tiene dos turnos vigentes en la misma fecha y hora.');
  }
  if (cuenta('turnos_paciente_superpuesto', repetidos(vigentes.map((t) => `${t.id_paciente}|${t.fecha}|${t.hora}`))) > 0) {
    errores.push('turnos: un paciente tiene dos turnos vigentes en la misma fecha y hora (la migración 001 lo prohíbe). Hay que cancelar o reprogramar uno en el origen antes de importar.');
  }
  if (cuenta('turnos_fuera_de_horario', datos.turnos.filter((t) => !HORARIOS.has(String(t.hora))).length) > 0) {
    avisos.push('turnos: hay turnos fuera de la grilla de 08:00 a 17:00; se migran igual.');
  }
  if (cuenta('turnos_pasados_abiertos', datos.turnos.filter((t) => String(t.fecha) < hoy && ['pendiente', 'confirmado', 'en_curso'].includes(String(t.estado))).length) > 0) {
    avisos.push('turnos: hay turnos pasados que siguen pendientes, confirmados o en curso; se migran tal cual (no se cambia su estado).');
  }
  cuenta('turnos_con_notas', datos.turnos.filter((t) => t.notas_medicas !== null && t.notas_medicas !== '').length);

  return { errores, avisos, conteos };
}
