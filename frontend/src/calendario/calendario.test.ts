import { describe, expect, it } from 'vitest';
import type { Turno } from '../api/tipos';
import { celdasDelMes, diasDeLaSemana, esFechaValida, fechaCompleta, nombreDelMes, sumarMeses, tituloDeLaSemana } from './fechas';
import { especialidadesDe, estadoPredominante, filtrarTurnos, totalesDeTurnos, totalesDelMes } from './filtros';

const turno = (extra: Partial<Turno>): Turno => ({
  id_turno: 1,
  fecha: '2026-11-05',
  hora: '10:00',
  estado: 'pendiente',
  motivo_consulta: 'Control',
  id_paciente: 1,
  paciente: 'Lucía Pérez',
  paciente_dni: '30111222',
  obra_social: null,
  id_medico: 1,
  medico: 'Laura Benítez',
  especialidad: 'Clínica Médica',
  ...extra,
});

describe('fechas del calendario (como recepcionista_semana.php y recepcionista_mes.php)', () => {
  it('la semana va de lunes a domingo, también si la fecha es domingo', () => {
    expect(diasDeLaSemana('2026-11-05')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(diasDeLaSemana('2026-11-08')[0]).toBe('2026-11-02');
    expect(diasDeLaSemana('2026-11-09')[0]).toBe('2026-11-09');
  });

  it('el título de la semana muestra el año en las dos puntas si cambia', () => {
    expect(tituloDeLaSemana('2026-11-05')).toBe('Semana del 2 de noviembre al 8 de noviembre de 2026');
    expect(tituloDeLaSemana('2026-12-31')).toBe('Semana del 28 de diciembre de 2026 al 3 de enero de 2027');
  });

  it('la grilla del mes empieza en lunes y completa semanas enteras', () => {
    // Noviembre de 2026 empieza en domingo: 6 celdas de relleno antes del 1
    const celdas = celdasDelMes('2026-11');
    expect(celdas.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(celdas.length % 7).toBe(0);
    expect(celdas.filter(Boolean)).toHaveLength(30);
    // Febrero de 2027 empieza en lunes y tiene 28 días: 4 semanas exactas
    expect(celdasDelMes('2027-02')).toHaveLength(28);
  });

  it('suma meses cruzando años y nombra el mes en español', () => {
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(nombreDelMes('2026-11')).toBe('Noviembre 2026');
    expect(fechaCompleta('2026-11-05')).toBe('Jueves 5 de noviembre de 2026');
  });

  it('rechaza fechas inexistentes o mal escritas de la URL', () => {
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('05/11/2026')).toBe(false);
    expect(esFechaValida(null)).toBe(false);
  });
});

describe('filtros y totales', () => {
  const lista = [
    turno({ id_turno: 1, paciente: 'Lucía Pérez', estado: 'confirmado' }),
    turno({ id_turno: 2, paciente: 'Martín Gómez', medico: 'Sofía Arce', especialidad: 'Cardiología', estado: 'en_curso' }),
    turno({ id_turno: 3, paciente: 'Ana Ruiz', paciente_dni: '40999888', estado: 'cancelado' }),
  ];

  it('el buscador ignora mayúsculas y acentos, y busca también por DNI y médico', () => {
    expect(filtrarTurnos(lista, { buscar: 'LUCIA', especialidad: '' }).map((t) => t.id_turno)).toEqual([1]);
    expect(filtrarTurnos(lista, { buscar: '40999', especialidad: '' }).map((t) => t.id_turno)).toEqual([3]);
    expect(filtrarTurnos(lista, { buscar: 'arce', especialidad: '' }).map((t) => t.id_turno)).toEqual([2]);
  });

  it('el filtro de especialidad combina con el buscador', () => {
    expect(filtrarTurnos(lista, { buscar: '', especialidad: 'Cardiología' }).map((t) => t.id_turno)).toEqual([2]);
    expect(filtrarTurnos(lista, { buscar: 'lucia', especialidad: 'Cardiología' })).toEqual([]);
    expect(especialidadesDe(lista)).toEqual(['Cardiología', 'Clínica Médica']);
  });

  it('las tarjetas de totales cuentan los turnos vigentes: los cancelados no suman', () => {
    expect(totalesDeTurnos(lista)).toEqual({ total: 2, confirmado: 1, pendiente: 0, en_curso: 1 });
    const dia = { total: 2, pendiente: 1, confirmado: 1, en_curso: 0, atendido: 0, cancelado: 0 };
    expect(totalesDelMes({ '2026-11-05': dia, '2026-11-06': dia })).toEqual({ total: 4, confirmado: 2, pendiente: 2, en_curso: 0 });
    const conCancelado = { ...dia, total: 3, cancelado: 1 };
    expect(totalesDelMes({ '2026-11-05': conCancelado })).toEqual({ total: 2, confirmado: 1, pendiente: 1, en_curso: 0 });
  });

  it('el color de un día del mes sigue la regla de recepcionista_mes.php', () => {
    const c = (extra: Partial<Record<string, number>>) => ({ total: 3, pendiente: 0, confirmado: 0, en_curso: 0, atendido: 0, cancelado: 0, ...extra });
    expect(estadoPredominante(c({ en_curso: 1, pendiente: 2 }))).toBe('en_curso');
    expect(estadoPredominante(c({ pendiente: 2, confirmado: 1 }))).toBe('pendiente');
    expect(estadoPredominante(c({ cancelado: 3 }))).toBe('cancelado');
    expect(estadoPredominante(c({ confirmado: 1, pendiente: 1, atendido: 1 }))).toBe('confirmado');
  });
});
