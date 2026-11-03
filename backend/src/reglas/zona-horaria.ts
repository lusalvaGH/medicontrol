/**
 * Fechas y horas en la zona horaria de la clínica, sin depender de la zona del proceso
 * (equivale a turnosAhora(), turnosHoy() y DateTimeZone de includes/turnos.php).
 */
export const TURNOS_ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

const formateadores = new Map<string, Intl.DateTimeFormat>();

function partesEnZona(instante: Date, zona: string): Record<string, number> {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formateadores.set(zona, f);
  }
  const partes: Record<string, number> = {};
  for (const p of f.formatToParts(instante)) {
    if (p.type !== 'literal') {
      partes[p.type] = Number(p.value);
    }
  }

  return partes;
}

/** Diferencia en milisegundos entre la hora local de la zona y UTC para ese instante. */
function desfase(instante: Date, zona: string): number {
  const p = partesEnZona(instante, zona);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Instante que corresponde a una fecha y hora "de pared" en la zona (como
 * DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', ..., new DateTimeZone($zona))).
 */
export function instanteEnZona(anio: number, mes: number, dia: number, hora: number, minuto: number, segundo: number, zona = TURNOS_ZONA_HORARIA): Date {
  const comoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo);
  let instante = comoUtc - desfase(new Date(comoUtc), zona);
  // Segunda pasada por si el desfase cambia en ese tramo (cambios de horario)
  instante = comoUtc - desfase(new Date(instante), zona);

  return new Date(instante);
}

/** Fecha de hoy en la zona de la clínica, como 'YYYY-MM-DD'. */
export function fechaHoy(ahora: Date = new Date(), zona = TURNOS_ZONA_HORARIA): string {
  const p = partesEnZona(ahora, zona);

  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
