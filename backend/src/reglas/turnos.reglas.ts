/**
 * Reglas de negocio de los turnos. Funciones puras, sin acceso a la base de datos.
 * Migradas de includes/turnos.php (y de la parte pura de TurnosService::disponibilidad)
 * con el mismo comportamiento: tests/turnos_reglas_test.php es su especificación.
 */
import { coincideAnclado } from './php';
import { TURNOS_ZONA_HORARIA, instanteEnZona } from './zona-horaria';

export { TURNOS_ZONA_HORARIA };

/** Horarios permitidos para registrar o reprogramar turnos. */
export const TURNOS_HORARIOS: readonly string[] = [
  '08:00:00', '08:30:00',
  '09:00:00', '09:30:00',
  '10:00:00', '10:30:00',
  '11:00:00', '11:30:00',
  '12:00:00', '12:30:00',
  '13:00:00', '13:30:00',
  '14:00:00', '14:30:00',
  '15:00:00', '15:30:00',
  '16:00:00', '16:30:00',
  '17:00:00',
];

export const TURNOS_ESTADOS = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  en_curso: 'En curso',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
} as const;

export type EstadoTurno = keyof typeof TURNOS_ESTADOS;

/** Estado actual => estados a los que puede pasar. 'atendido' y 'cancelado' son finales. */
export const TURNOS_TRANSICIONES: Readonly<Record<EstadoTurno, readonly EstadoTurno[]>> = {
  pendiente: ['confirmado', 'en_curso', 'cancelado'],
  confirmado: ['pendiente', 'en_curso', 'cancelado'],
  en_curso: ['atendido', 'confirmado'],
  atendido: [],
  cancelado: [],
};

/** Solo estos estados permiten cambiar fecha u hora. */
export const TURNOS_ESTADOS_REPROGRAMABLES: readonly EstadoTurno[] = ['pendiente', 'confirmado'];

export function esEstadoTurno(estado: string): estado is EstadoTurno {
  return Object.prototype.hasOwnProperty.call(TURNOS_ESTADOS, estado);
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/** Días del mes en el calendario gregoriano proléptico, como PHP. */
export function diasDelMes(anio: number, mes: number): number {
  return [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

/** Valida una fecha con formato estricto YYYY-MM-DD que exista en el calendario. */
export function turnosFechaValida(fecha: string): boolean {
  if (!coincideAnclado(/^\d{4}-\d{2}-\d{2}$/, fecha)) {
    return false;
  }
  // createFromFormat no admite datos sobrantes: con un \n final, PHP devuelve false
  if (fecha.length !== 10) {
    return false;
  }
  const [anio, mes, dia] = fecha.split('-').map(Number);

  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes);
}

/** Normaliza una hora HH:MM o HH:MM:SS a HH:MM:SS. Devuelve null si no es una hora real. */
export function turnosNormalizarHora(hora: string): string | null {
  let valor = hora;
  if (coincideAnclado(/^\d{2}:\d{2}$/, valor)) {
    valor += ':00';
  }
  if (!coincideAnclado(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, valor)) {
    return null;
  }

  return valor;
}

export function turnosHorarioPermitido(hora: string): boolean {
  return TURNOS_HORARIOS.includes(hora);
}

/**
 * Indica si la fecha (YYYY-MM-DD) y hora (HH:MM:SS) son posteriores a "ahora",
 * interpretadas en la zona horaria de la clínica.
 */
export function turnosEsFuturo(fecha: string, hora: string, ahora: Date): boolean {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const h = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hora);
  if (!f || !h) {
    return false;
  }
  const momento = instanteEnZona(Number(f[1]), Number(f[2]), Number(f[3]), Number(h[1]), Number(h[2]), Number(h[3]), TURNOS_ZONA_HORARIA);

  return momento.getTime() > ahora.getTime();
}

export function turnosPuedeTransicionar(estadoActual: string, estadoNuevo: string): boolean {
  if (!esEstadoTurno(estadoActual)) {
    return false;
  }

  return (TURNOS_TRANSICIONES[estadoActual] as readonly string[]).includes(estadoNuevo);
}

export interface TurnoActual {
  fecha: string;
  hora: string;
  estado: string;
}

export interface ResultadoModificacion {
  error: string | null;
  sin_cambios: boolean;
  reprograma: boolean;
}

const etiqueta = (estado: string): string => (esEstadoTurno(estado) ? TURNOS_ESTADOS[estado] : estado);

/**
 * Valida la modificación de un turno contra sus valores actuales en la base.
 * Fecha y hora nuevas ya deben venir validadas en formato y normalizadas.
 * Las reglas de fecha/hora solo se aplican si esos campos cambian.
 */
export function turnosValidarModificacion(actual: TurnoActual, fecha: string, hora: string, estado: string, ahora: Date): ResultadoModificacion {
  const resultado = (error: string | null, sinCambios = false, reprograma = false): ResultadoModificacion => ({
    error,
    sin_cambios: sinCambios,
    reprograma,
  });

  const estadoActual = String(actual.estado);
  if (!esEstadoTurno(estado)) {
    return resultado('Estado inválido.');
  }

  const cambiaEstado = estado !== estadoActual;
  const reprograma = fecha !== String(actual.fecha) || hora !== String(actual.hora);

  if (!cambiaEstado && !reprograma) {
    return resultado(null, true);
  }

  if (cambiaEstado && !turnosPuedeTransicionar(estadoActual, estado)) {
    const desde = etiqueta(estadoActual);
    const siguientes = esEstadoTurno(estadoActual) ? TURNOS_TRANSICIONES[estadoActual] : [];
    if (siguientes.length === 0) {
      return resultado(`El turno está «${desde}» y no se puede modificar.`);
    }

    return resultado(`No se puede pasar un turno de «${desde}» a «${TURNOS_ESTADOS[estado]}».`);
  }

  if (reprograma) {
    if (!(TURNOS_ESTADOS_REPROGRAMABLES as readonly string[]).includes(estadoActual)) {
      return resultado(`No se puede cambiar la fecha u hora de un turno «${etiqueta(estadoActual)}».`);
    }
    if (!TURNOS_ESTADOS_REPROGRAMABLES.includes(estado)) {
      return resultado('Para cambiar la fecha u hora, el turno debe quedar pendiente o confirmado.');
    }
    if (hora !== String(actual.hora) && !turnosHorarioPermitido(hora)) {
      return resultado('El horario elegido no está entre los horarios permitidos.');
    }
    if (!turnosEsFuturo(fecha, hora, ahora)) {
      return resultado('La nueva fecha y hora ya pasaron. Elegí un horario futuro.');
    }
  }

  return resultado(null, false, reprograma);
}

export interface MesParseado {
  anio: number;
  mes: number;
  primerDia: string;
  dias: number;
}

/** Valida un parámetro de mes con formato estricto YYYY-MM (mes 01-12). Devuelve null si no es válido. */
export function turnosParsearMes(mes: string): MesParseado | null {
  if (!coincideAnclado(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, mes)) {
    return null;
  }
  // createFromFormat('!Y-m-d', $mes . '-01') rechaza el \n sobrante
  if (mes.length !== 7) {
    return null;
  }
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));

  return { anio, mes: numero, primerDia: `${mes}-01`, dias: diasDelMes(anio, numero) };
}

export type EstadoHorario = 'libre' | 'ocupado' | 'pasado';

/**
 * Estado de cada horario permitido en una fecha (parte pura de TurnosService::disponibilidad):
 * ocupado si ya hay un turno en esa hora; si no, libre o pasado según el momento actual.
 */
export function turnosDisponibilidad(fecha: string, horasOcupadas: readonly string[], ahora: Date): { hora: string; estado: EstadoHorario }[] {
  const ocupadas = new Set(horasOcupadas.map(String));

  return TURNOS_HORARIOS.map((hora) => ({
    hora: hora.slice(0, 5),
    estado: ocupadas.has(hora) ? 'ocupado' : turnosEsFuturo(fecha, hora, ahora) ? 'libre' : 'pasado',
  }));
}
