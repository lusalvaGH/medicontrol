import { describe, expect, it } from 'vitest';
import { ahoraEnClinica, fechaLegible, hoyEnClinica, sumarDias } from './fechas';

describe('fechas en la zona de la clínica', () => {
  it('a las 01:30 UTC todavía es el día anterior en Argentina (UTC-3)', () => {
    const instante = new Date('2026-11-05T01:30:00Z');
    expect(hoyEnClinica(instante)).toBe('2026-11-04');
    expect(ahoraEnClinica(instante)).toBe('2026-11-04 22:30');
  });

  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('muestra la fecha como dd/mm/aaaa con el día de la semana', () => {
    expect(fechaLegible('2026-11-05')).toMatch(/^jue\.? 05\/11\/2026$/);
  });
});
