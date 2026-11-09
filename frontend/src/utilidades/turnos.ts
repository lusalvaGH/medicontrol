import type { EstadoTurno } from '../api/tipos';

/**
 * Copia de las etiquetas y transiciones de backend/src/reglas/turnos.reglas.ts, solo para
 * armar las opciones de la interfaz. El backend vuelve a validar cada cambio. La API todavía
 * no expone estas reglas (pendiente PROD-22 del documento maestro): si cambian allá, hay que
 * cambiarlas acá.
 */
export const ETIQUETA_ESTADO: Record<EstadoTurno, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  en_curso: 'En curso',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
};

export const TRANSICIONES: Record<EstadoTurno, EstadoTurno[]> = {
  pendiente: ['confirmado', 'en_curso', 'cancelado'],
  confirmado: ['pendiente', 'en_curso', 'cancelado'],
  en_curso: ['atendido', 'confirmado'],
  atendido: [],
  cancelado: [],
};

export const REPROGRAMABLES: EstadoTurno[] = ['pendiente', 'confirmado'];

export const ESTADOS: EstadoTurno[] = ['pendiente', 'confirmado', 'en_curso', 'atendido', 'cancelado'];

/** Cantidad de turnos por estado (lo que calculaba panel/medico.php). */
export function contarPorEstado(turnos: { estado: EstadoTurno }[]): Record<EstadoTurno, number> {
  const conteo = { pendiente: 0, confirmado: 0, en_curso: 0, atendido: 0, cancelado: 0 };
  for (const t of turnos) {
    conteo[t.estado]++;
  }

  return conteo;
}
