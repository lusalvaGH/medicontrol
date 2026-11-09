import { LimitadorRegistro } from './limitador-registro';

describe('límite del registro público', () => {
  it('después de N envíos desde una IP la bloquea hasta que vence la ventana; otras IP siguen', () => {
    let ahora = 1_000_000;
    const limitador = new LimitadorRegistro({ maxIntentos: 3, ventanaMs: 60_000 }, () => ahora);
    for (let i = 0; i < 3; i++) {
      expect(limitador.esperaRestante('10.0.0.1')).toBe(0);
      limitador.registrar('10.0.0.1');
      ahora += 1000;
    }
    expect(limitador.esperaRestante('10.0.0.1')).toBe(57_000);
    expect(limitador.esperaRestante('10.0.0.2')).toBe(0);

    ahora += 57_000;
    expect(limitador.esperaRestante('10.0.0.1')).toBe(0);
  });
});
