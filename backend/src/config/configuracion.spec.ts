import { leerConfiguracion } from './configuracion';

const base = { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'medicontrol_test', DB_USER: 'usuario' };

describe('leerConfiguracion', () => {
  it('lee la configuración completa con valores por defecto del servidor', () => {
    const c = leerConfiguracion(base);
    expect(c).toEqual({
      puerto: 3000,
      host: '127.0.0.1',
      db: { host: '127.0.0.1', puerto: 3306, nombre: 'medicontrol_test', usuario: 'usuario', contrasena: '' },
    });
  });

  it.each(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'])('no arranca si falta %s', (clave) => {
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
});
