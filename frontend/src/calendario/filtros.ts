import type { ConteoDia, EstadoTurno, Turno } from '../api/tipos';

/** Minúsculas y sin acentos, como normalizar() de las pantallas PHP. */
export function normalizar(texto: string): string {
  return texto.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export interface FiltroTurnos {
  buscar: string;
  /** '' = todas las especialidades */
  especialidad: string;
}

/** Turnos que coinciden con el buscador (paciente, DNI, médico, especialidad o motivo) y la especialidad. */
export function filtrarTurnos(turnos: Turno[], filtro: FiltroTurnos): Turno[] {
  const termino = normalizar(filtro.buscar);

  return turnos.filter((t) => {
    const coincideEspecialidad = filtro.especialidad === '' || t.especialidad === filtro.especialidad;
    const texto = normalizar([t.paciente, t.paciente_dni, t.medico, t.especialidad, t.motivo_consulta].join(' '));

    return coincideEspecialidad && (termino === '' || texto.includes(termino));
  });
}

/** Especialidades presentes en los turnos, ordenadas (el filtro de la vista Semana de PHP). */
export function especialidadesDe(turnos: Turno[]): string[] {
  return [...new Set(turnos.map((t) => t.especialidad).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

export interface Totales {
  total: number;
  confirmado: number;
  pendiente: number;
  en_curso: number;
}

/**
 * Las cuatro tarjetas de totales de las pantallas PHP. «Turnos» cuenta solo los vigentes: un
 * turno cancelado ya no ocupa la agenda (ni su horario).
 */
export function totalesDeTurnos(turnos: { estado: EstadoTurno }[]): Totales {
  const contar = (estado: EstadoTurno) => turnos.filter((t) => t.estado === estado).length;

  return { total: turnos.length - contar('cancelado'), confirmado: contar('confirmado'), pendiente: contar('pendiente'), en_curso: contar('en_curso') };
}

export function totalesDelMes(dias: Record<string, ConteoDia>): Totales {
  const totales: Totales = { total: 0, confirmado: 0, pendiente: 0, en_curso: 0 };
  for (const c of Object.values(dias)) {
    totales.total += c.total - c.cancelado;
    totales.confirmado += c.confirmado;
    totales.pendiente += c.pendiente;
    totales.en_curso += c.en_curso;
  }

  return totales;
}

/**
 * Color de la etiqueta de un día en la vista Mes, con la misma regla que recepcionista_mes.php:
 * en curso si hay alguno; pendiente si hay más pendientes que confirmados; cancelado si todos
 * están cancelados; si no, confirmado.
 */
export function estadoPredominante(c: ConteoDia): EstadoTurno {
  if (c.en_curso > 0) return 'en_curso';
  if (c.pendiente > c.confirmado) return 'pendiente';
  if (c.total > 0 && c.cancelado === c.total) return 'cancelado';

  return 'confirmado';
}
