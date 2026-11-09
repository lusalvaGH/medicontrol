/**
 * Fechas en la zona horaria de la clínica, igual que el backend (backend/src/reglas/zona-horaria.ts):
 * "hoy" no depende de la zona configurada en la computadora del usuario.
 */
export const ZONA_CLINICA = 'America/Argentina/Buenos_Aires';

function partes(instante: Date): Record<string, string> {
  const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CLINICA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  return Object.fromEntries(formato.formatToParts(instante).map((p) => [p.type, p.value]));
}

/** 'YYYY-MM-DD' de hoy en la clínica. */
export function hoyEnClinica(ahora: Date = new Date()): string {
  const p = partes(ahora);

  return `${p.year}-${p.month}-${p.day}`;
}

/** 'YYYY-MM-DD HH:MM' de ahora en la clínica, para comparar con fecha + hora de un turno. */
export function ahoraEnClinica(ahora: Date = new Date()): string {
  const p = partes(ahora);

  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** 'YYYY-MM-DD' más n días. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);

  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → 'mié 05/11/2026'. */
export function fechaLegible(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)));

  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}
