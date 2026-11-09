/**
 * Mismos casos que tests/turnos_reglas_test.php (81 comprobaciones), en el mismo orden.
 */
import {
  TURNOS_ESTADOS,
  TURNOS_HORARIOS,
  turnosDisponibilidad,
  turnosEsFuturo,
  turnosFechaValida,
  turnosHorarioPermitido,
  turnosNormalizarHora,
  turnosParsearMes,
  turnosPuedeTransicionar,
  turnosValidarModificacion,
} from './turnos.reglas';

// "Ahora" fijo: 27/10/2026 10:10 en Argentina (UTC-3) = 13:10 UTC
const ahora = new Date('2026-10-27T13:10:00Z');
const estados = Object.keys(TURNOS_ESTADOS);

describe('turnosParsearMes', () => {
  it('mes válido', () => expect(turnosParsearMes('2026-10')?.primerDia).toBe('2026-10-01'));
  it('enero', () => expect(turnosParsearMes('2027-01')?.primerDia).toBe('2027-01-01'));
  it('diciembre', () => expect(turnosParsearMes('2026-12')?.primerDia).toBe('2026-12-01'));
  it.each(['2026-13', '2026-00', '2026-1', '26-10', '0000-01', 'abcd-ef', '2026-10-01', ' 2026-10', '2026-10x', ''])('mes inválido «%s»', (mes) => {
    expect(turnosParsearMes(mes)).toBeNull();
  });
  it('febrero bisiesto tiene 29 días', () => expect(turnosParsearMes('2024-02')?.dias).toBe(29));
  it('febrero común tiene 28 días', () => expect(turnosParsearMes('2026-02')?.dias).toBe(28));
});

describe('formatos de fecha y hora', () => {
  it('fecha válida', () => expect(turnosFechaValida('2026-10-27')).toBe(true));
  it('fecha 30 de febrero inválida', () => expect(turnosFechaValida('2026-02-30')).toBe(false));
  it('fecha con formato corto inválida', () => expect(turnosFechaValida('2026-1-5')).toBe(false));
  it('hora HH:MM se normaliza', () => expect(turnosNormalizarHora('09:30')).toBe('09:30:00'));
  it('hora HH:MM:SS se conserva', () => expect(turnosNormalizarHora('09:30:00')).toBe('09:30:00'));
  it.each(['99:99:99', '24:00', '9:30', '09:60', '', '09:30 AM'])('hora inválida «%s»', (hora) => {
    expect(turnosNormalizarHora(hora)).toBeNull();
  });
  it('08:00 permitido', () => expect(turnosHorarioPermitido('08:00:00')).toBe(true));
  it('17:00 permitido', () => expect(turnosHorarioPermitido('17:00:00')).toBe(true));
  it('11:15 no permitido', () => expect(turnosHorarioPermitido('11:15:00')).toBe(false));
  it('07:13 no permitido', () => expect(turnosHorarioPermitido('07:13:00')).toBe(false));
});

describe('momento futuro (zona horaria de la clínica)', () => {
  it('hoy más tarde es futuro', () => expect(turnosEsFuturo('2026-10-27', '10:30:00', ahora)).toBe(true));
  it('hoy más temprano no es futuro', () => expect(turnosEsFuturo('2026-10-27', '10:00:00', ahora)).toBe(false));
  it('mañana es futuro', () => expect(turnosEsFuturo('2026-10-28', '08:00:00', ahora)).toBe(true));
  it('ayer no es futuro', () => expect(turnosEsFuturo('2026-10-26', '17:00:00', ahora)).toBe(false));
  it('un "ahora" en otra zona se compara en la misma línea de tiempo', () => {
    // 27/10/2026 15:10 en Berlín (UTC+1) = 14:10 UTC = 11:10 en Argentina
    expect(turnosEsFuturo('2026-10-27', '11:30:00', new Date('2026-10-27T14:10:00Z'))).toBe(true);
  });
});

describe('transiciones aprobadas', () => {
  const permitidas: Record<string, string[]> = {
    pendiente: ['confirmado', 'en_curso', 'cancelado'],
    confirmado: ['pendiente', 'en_curso', 'cancelado'],
    en_curso: ['atendido', 'confirmado'],
    atendido: [],
    cancelado: [],
  };
  const casos = estados.flatMap((desde) => estados.filter((hacia) => hacia !== desde).map((hacia) => [desde, hacia, permitidas[desde].includes(hacia)] as const));
  it.each(casos)('transición %s → %s permitida: %s', (desde, hacia, esperado) => {
    expect(turnosPuedeTransicionar(desde, hacia)).toBe(esperado);
  });
});

describe('turnosValidarModificacion', () => {
  const turno = (estado: string, fecha = '2026-10-27', hora = '11:00:00') => ({ fecha, hora, estado });
  const validar = (actual: ReturnType<typeof turno>, fecha: string, hora: string, estado: string) => turnosValidarModificacion(actual, fecha, hora, estado, ahora);

  it.each(estados)('guardar sin cambios un turno %s es válido', (estado) => {
    const r = validar(turno(estado), '2026-10-27', '11:00:00', estado);
    expect(r.error).toBeNull();
    expect(r.sin_cambios).toBe(true);
  });
  it('en_curso de fecha pasada sin cambios es válido', () => {
    const r = validar(turno('en_curso', '2026-10-20', '09:00:00'), '2026-10-20', '09:00:00', 'en_curso');
    expect(r.error).toBeNull();
    expect(r.sin_cambios).toBe(true);
  });
  it('en_curso pasado → atendido es válido (no valida fecha si no cambia)', () => {
    const r = validar(turno('en_curso', '2026-10-20', '09:00:00'), '2026-10-20', '09:00:00', 'atendido');
    expect(r.error).toBeNull();
    expect(r.reprograma).toBe(false);
  });
  it('horario heredado fuera de la lista no bloquea un cambio de estado', () => {
    expect(validar(turno('confirmado', '2026-10-27', '11:15:00'), '2026-10-27', '11:15:00', 'en_curso').error).toBeNull();
  });
  it('cambiar solo la fecha no exige que la hora heredada esté en la lista', () => {
    const r = validar(turno('confirmado', '2026-10-27', '11:15:00'), '2026-10-28', '11:15:00', 'confirmado');
    expect(r.error).toBeNull();
    expect(r.reprograma).toBe(true);
  });
  it('reprogramar confirmado a futuro es válido', () => {
    const r = validar(turno('confirmado'), '2026-10-28', '15:00:00', 'confirmado');
    expect(r.error).toBeNull();
    expect(r.reprograma).toBe(true);
  });
  it('reprogramar y confirmar a la vez es válido', () => {
    const r = validar(turno('pendiente'), '2026-10-27', '14:00:00', 'confirmado');
    expect(r.error).toBeNull();
    expect(r.reprograma).toBe(true);
  });
  it.each([
    ['reprogramar a una hora ya pasada', 'pendiente', '2026-10-27', '10:00:00', 'pendiente'],
    ['reprogramar a una fecha pasada', 'pendiente', '2026-10-26', '11:00:00', 'pendiente'],
    ['reprogramar a un horario no permitido', 'pendiente', '2026-10-28', '07:13:00', 'pendiente'],
    ['reprogramar dejando el turno en_curso', 'pendiente', '2026-10-28', '11:00:00', 'en_curso'],
    ['reprogramar y cancelar a la vez', 'pendiente', '2026-10-28', '11:00:00', 'cancelado'],
  ])('%s se rechaza', (_nombre, actual, fecha, hora, estado) => {
    expect(validar(turno(actual), fecha, hora, estado).error).not.toBeNull();
  });
  it.each(['en_curso', 'atendido', 'cancelado'])('no se puede reprogramar un turno %s', (estado) => {
    expect(validar(turno(estado), '2026-10-28', '11:00:00', estado).error).not.toBeNull();
  });
  it.each(['en_curso', 'atendido', 'cancelado'])('no se puede cambiar la hora de un turno %s', (estado) => {
    expect(validar(turno(estado), '2026-10-27', '11:30:00', estado).error).not.toBeNull();
  });
  it.each([
    ['atendido → pendiente', 'atendido', 'pendiente'],
    ['cancelado → confirmado', 'cancelado', 'confirmado'],
    ['pendiente → atendido', 'pendiente', 'atendido'],
    ['estado desconocido', 'pendiente', 'inexistente'],
  ])('%s se rechaza', (_nombre, actual, nuevo) => {
    expect(validar(turno(actual), '2026-10-27', '11:00:00', nuevo).error).not.toBeNull();
  });
});

/* ── Casos adicionales: mensajes y disponibilidad (comportamiento del PHP, no reglas nuevas) ── */
describe('mensajes de turnosValidarModificacion (iguales a los de PHP)', () => {
  const t = (estado: string) => ({ fecha: '2026-10-27', hora: '11:00:00', estado });
  it.each([
    [t('atendido'), '2026-10-27', '11:00:00', 'pendiente', 'El turno está «Atendido» y no se puede modificar.'],
    [t('pendiente'), '2026-10-27', '11:00:00', 'atendido', 'No se puede pasar un turno de «Pendiente» a «Atendido».'],
    [t('en_curso'), '2026-10-28', '11:00:00', 'en_curso', 'No se puede cambiar la fecha u hora de un turno «En curso».'],
    [t('pendiente'), '2026-10-28', '11:00:00', 'en_curso', 'Para cambiar la fecha u hora, el turno debe quedar pendiente o confirmado.'],
    [t('pendiente'), '2026-10-28', '07:13:00', 'pendiente', 'El horario elegido no está entre los horarios permitidos.'],
    [t('pendiente'), '2026-10-26', '11:00:00', 'pendiente', 'La nueva fecha y hora ya pasaron. Elegí un horario futuro.'],
    [t('pendiente'), '2026-10-27', '11:00:00', 'inexistente', 'Estado inválido.'],
  ])('%#: %s', (actual, fecha, hora, estado, mensaje) => {
    expect(turnosValidarModificacion(actual, fecha, hora, estado, ahora).error).toBe(mensaje);
  });
});

describe('turnosDisponibilidad (parte pura de TurnosService::disponibilidad)', () => {
  it('devuelve los 19 horarios como HH:MM', () => {
    const h = turnosDisponibilidad('2026-10-28', [], ahora);
    expect(h).toHaveLength(TURNOS_HORARIOS.length);
    expect(h[0]).toEqual({ hora: '08:00', estado: 'libre' });
    expect(h.at(-1)).toEqual({ hora: '17:00', estado: 'libre' });
  });
  it('marca ocupado, libre y pasado según la hora actual', () => {
    const h = Object.fromEntries(turnosDisponibilidad('2026-10-27', ['11:00:00', '09:00:00'], ahora).map((x) => [x.hora, x.estado]));
    expect(h['09:00']).toBe('ocupado'); // ocupado tiene prioridad aunque ya haya pasado
    expect(h['10:00']).toBe('pasado');
    expect(h['10:30']).toBe('libre');
    expect(h['11:00']).toBe('ocupado');
  });
  it('un día anterior queda sin horarios libres', () => {
    expect(turnosDisponibilidad('2026-10-26', [], ahora).every((x) => x.estado === 'pasado')).toBe(true);
  });
});
