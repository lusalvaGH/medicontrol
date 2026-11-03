import { leerConfiguracion } from './configuracion';

const SECRETO = 'x'.repeat(32);
const base = { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'medicontrol_test', DB_USER: 'usuario', SESSION_SECRET: SECRETO };

describe('leerConfiguracion', () => {
  it('lee la configuración completa con valores por defecto del servidor', () => {
    const c = leerConfiguracion(base);
    expect(c).toEqual({
      puerto: 3000,
      host: '127.0.0.1',
      db: { host: '127.0.0.1', puerto: 3306, nombre: 'medicontrol_test', usuario: 'usuario', contrasena: '' },
      sesion: { secreto: SECRETO, inactividadMinutos: 24, cookieSegura: 'auto', confiarEnProxy: false },
    });
  });

  it.each(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'SESSION_SECRET'])('no arranca si falta %s', (clave) => {
    const entorno: NodeJS.ProcessEnv = { ...base };
    delete entorno[clave];
    expect(() => leerConfiguracion(entorno)).toThrow(clave);
  });

  it.each(['0', '70000', 'abc', '33.5'])('rechaza el puerto de base %s', (puerto) => {
    expect(() => leerConfiguracion({ ...base, DB_PORT: puerto })).toThrow('DB_PORT');
  });

  it('rechaza un nombre de base con caracteres no permitidos', () => {
    expect(() => leerConfiguracion({ ...base, DB_NAME: 'base; DROP DATABASE x' })).toThrow('DB_NAME');
  });

  it('acepta una contraseña vacía y una con caracteres especiales', () => {
    expect(leerConfiguracion({ ...base, DB_PASSWORD: '' }).db.contrasena).toBe('');
    expect(leerConfiguracion({ ...base, DB_PASSWORD: ' a#b$ ' }).db.contrasena).toBe(' a#b$ ');
  });

  it('exige un secreto de sesión de al menos 32 caracteres', () => {
    expect(() => leerConfiguracion({ ...base, SESSION_SECRET: 'corto' })).toThrow('SESSION_SECRET');
  });

  it('lee las opciones de la cookie y del proxy', () => {
    const c = leerConfiguracion({ ...base, COOKIE_SECURE: 'true', TRUST_PROXY: 'true', SESSION_INACTIVIDAD_MINUTOS: '30' });
    expect(c.sesion).toEqual({ secreto: SECRETO, inactividadMinutos: 30, cookieSegura: true, confiarEnProxy: true });
    expect(() => leerConfiguracion({ ...base, COOKIE_SECURE: 'quizas' })).toThrow('COOKIE_SECURE');
    expect(() => leerConfiguracion({ ...base, TRUST_PROXY: 'si' })).toThrow('TRUST_PROXY');
    expect(() => leerConfiguracion({ ...base, SESSION_INACTIVIDAD_MINUTOS: '0' })).toThrow('SESSION_INACTIVIDAD_MINUTOS');
  });
});
