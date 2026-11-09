/**
 * Fechas del calendario de recepción, iguales a las de las pantallas PHP: semana de lunes a
 * domingo (recepcionista_semana.php) y grilla mensual que empieza en lunes (recepcionista_mes.php).
 * Todas las fechas son 'YYYY-MM-DD' sin hora: se calculan en UTC para no depender de la zona
 * de la computadora; "hoy" sale de la zona de la clínica (utilidades/fechas.ts).
 */
import { sumarDias } from '../utilidades/fechas';

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'];

const partes = (fecha: string) => fecha.split('-').map(Number) as [number, number, number];
const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** 0 = lunes … 6 = domingo. */
export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = partes(fecha);

  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

export function lunesDeLaSemana(fecha: string): string {
  return sumarDias(fecha, -diaDeLaSemana(fecha));
}

/** Los siete días de la semana de esa fecha, de lunes a domingo. */
export function diasDeLaSemana(fecha: string): string[] {
  const lunes = lunesDeLaSemana(fecha);

  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** 'YYYY-MM' de una fecha. */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/** 'YYYY-MM' más n meses. */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;

  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function diasDelMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);

  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * Celdas de la grilla mensual: null para las celdas de relleno antes del día 1 y después del
 * último, hasta completar semanas de lunes a domingo (como recepcionista_mes.php).
 */
export function celdasDelMes(mes: string): (string | null)[] {
  const inicio = diaDeLaSemana(`${mes}-01`);
  const dias = diasDelMes(mes);
  const celdas: (string | null)[] = Array(inicio).fill(null);
  for (let d = 1; d <= dias; d++) {
    celdas.push(`${mes}-${String(d).padStart(2, '0')}`);
  }
  while (celdas.length % 7 !== 0) {
    celdas.push(null);
  }

  return celdas;
}

/** 'Noviembre 2026'. */
export function nombreDelMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);

  return `${capitalizar(MESES[m - 1])} ${a}`;
}

/** '5 de noviembre'. */
export function fechaLarga(fecha: string): string {
  const [, m, d] = partes(fecha);

  return `${d} de ${MESES[m - 1]}`;
}

/** 'Jueves 5 de noviembre de 2026'. */
export function fechaCompleta(fecha: string): string {
  return `${DIAS_SEMANA[diaDeLaSemana(fecha)]} ${fechaLarga(fecha)} de ${fecha.slice(0, 4)}`;
}

/** 'Semana del 2 al 8 de noviembre de 2026' (con el año en las dos puntas si cambia). */
export function tituloDeLaSemana(fecha: string): string {
  const dias = diasDeLaSemana(fecha);
  const [lunes, domingo] = [dias[0], dias[6]];
  const anioLunes = lunes.slice(0, 4) !== domingo.slice(0, 4) ? ` de ${lunes.slice(0, 4)}` : '';

  return `Semana del ${fechaLarga(lunes)}${anioLunes} al ${fechaLarga(domingo)} de ${domingo.slice(0, 4)}`;
}

/** 'Lunes 2'. */
export function nombreCortoDelDia(fecha: string): string {
  return `${DIAS_SEMANA[diaDeLaSemana(fecha)]} ${Number(fecha.slice(8, 10))}`;
}

/** Fecha 'YYYY-MM-DD' válida (las de la URL pueden venir mal escritas). */
export function esFechaValida(fecha: string | null): fecha is string {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }
  const [a, m, d] = partes(fecha);

  return m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes(`${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
}
