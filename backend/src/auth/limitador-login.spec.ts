import { LimitadorLogin } from './limitador-login';
import { SesionesEnMemoria } from './sesion.store';

describe('LimitadorLogin (reloj simulado)', () => {
  const crear = () => {
    let ahora = 1_000_000;
    const limitador = new LimitadorLogin({ maxFallosCorreo: 5, maxFallosIp: 20, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 }, () => ahora);

    return { limitador, avanzar: (ms: number) => (ahora += ms) };
  };

  it('bloquea al quinto fallo y el bloqueo vence a los 15 minutos', () => {
    const { limitador, avanzar } = crear();
    for (let i = 0; i < 4; i++) limitador.registrarFallo('a@x.com', '1.1.1.1');
    expect(limitador.bloqueoRestante('a@x.com', '1.1.1.1')).toBe(0);
    limitador.registrarFallo('a@x.com', '1.1.1.1');
    expect(limitador.bloqueoRestante('a@x.com', '1.1.1.1')).toBe(15 * 60_000);
    avanzar(15 * 60_000 - 1);
    expect(limitador.bloqueoRestante('a@x.com', '1.1.1.1')).toBe(1);
    avanzar(1);
    expect(limitador.bloqueoRestante('a@x.com', '1.1.1.1')).toBe(0);
  });

  it('el correo se compara sin distinguir mayúsculas', () => {
    const { limitador } = crear();
    for (let i = 0; i < 5; i++) limitador.registrarFallo(i % 2 ? 'A@X.COM' : 'a@x.com', '2.2.2.2');
    expect(limitador.bloqueoRestante('a@X.com', '9.9.9.9')).toBeGreaterThan(0);
  });

  it('los fallos fuera de la ventana de 15 minutos no se acumulan', () => {
    const { limitador, avanzar } = crear();
    for (let i = 0; i < 4; i++) limitador.registrarFallo('b@x.com', '3.3.3.3');
    avanzar(15 * 60_000 + 1);
    limitador.registrarFallo('b@x.com', '3.3.3.3');
    expect(limitador.bloqueoRestante('b@x.com', '3.3.3.3')).toBe(0);
  });

  it('un éxito reinicia el contador del correo', () => {
    const { limitador } = crear();
    for (let i = 0; i < 4; i++) limitador.registrarFallo('c@x.com', '4.4.4.4');
    limitador.registrarExito('c@x.com');
    for (let i = 0; i < 4; i++) limitador.registrarFallo('c@x.com', '4.4.4.4');
    expect(limitador.bloqueoRestante('c@x.com', '4.4.4.4')).toBe(0);
  });

  it('la IP se bloquea a los 20 fallos con distintos correos', () => {
    const { limitador } = crear();
    for (let i = 0; i < 19; i++) limitador.registrarFallo(`u${i}@x.com`, '5.5.5.5');
    expect(limitador.bloqueoRestante('nuevo@x.com', '5.5.5.5')).toBe(0);
    limitador.registrarFallo('u19@x.com', '5.5.5.5');
    expect(limitador.bloqueoRestante('nuevo@x.com', '5.5.5.5')).toBeGreaterThan(0);
    expect(limitador.bloqueoRestante('nuevo@x.com', '6.6.6.6')).toBe(0);
  });
});

describe('SesionesEnMemoria (reloj simulado)', () => {
  it('vence por inactividad, se renueva con touch y respeta el tope de sesiones', () => {
    let ahora = 0;
    const store = new SesionesEnMemoria(1000, 2, () => ahora);
    const datos = { cookie: {} } as never;
    const leer = (sid: string) => {
      let r: unknown;
      store.get(sid, (_e, s) => (r = s));

      return r;
    };
    store.set('a', datos);
    ahora = 900;
    store.touch('a', datos);
    ahora = 1800;
    expect(leer('a')).not.toBeNull();
    ahora = 2900;
    expect(leer('a')).toBeNull();
    store.set('b', datos);
    store.set('c', datos);
    store.set('d', datos);
    expect(store.cantidad()).toBe(2);
    expect(leer('b')).toBeNull();
    store.cerrar();
  });
});
