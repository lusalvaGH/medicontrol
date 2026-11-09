/**
 * Configuración desde variables de entorno. No hay credenciales por defecto: si falta un dato
 * obligatorio, la aplicación no arranca. La contraseña puede estar vacía (XAMPP local).
 */
export interface Configuracion {
  puerto: number;
  host: string;
  db: { host: string; puerto: number; nombre: string; usuario: string; contrasena: string };
  sesion: {
    secreto: string;
    /** Minutos sin actividad hasta que la sesión vence (PHP: session.gc_maxlifetime = 1440 s). */
    inactividadMinutos: number;
    /** Cookie Secure: 'auto' la marca solo cuando la conexión es HTTPS. */
    cookieSegura: boolean | 'auto';
    /** Confiar en el proxy (Nginx en Docker) para la IP del cliente y el protocolo HTTPS. */
    confiarEnProxy: boolean;
  };
}

const NOMBRE_BASE = /^[A-Za-z0-9_]{1,64}$/;
const SECRETO_MINIMO = 32;

export function leerConfiguracion(entorno: NodeJS.ProcessEnv): Configuracion {
  const faltantes = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'SESSION_SECRET'].filter((clave) => !entorno[clave]);
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(', ')}. Revisá backend/.env (ver .env.example).`);
  }

  const entero = (clave: string, valor: string, minimo: number, maximo: number): number => {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
      throw new Error(`${clave} debe ser un número entero entre ${minimo} y ${maximo}.`);
    }

    return numero;
  };
  const booleano = (clave: string, valor: string | undefined): boolean => {
    if (valor === undefined || valor === '' || valor === 'false') {
      return false;
    }
    if (valor === 'true') {
      return true;
    }
    throw new Error(`${clave} debe ser true o false.`);
  };

  const nombre = String(entorno.DB_NAME);
  if (!NOMBRE_BASE.test(nombre)) {
    throw new Error('DB_NAME solo puede tener letras, números y guiones bajos.');
  }
  const secreto = String(entorno.SESSION_SECRET);
  if (secreto.length < SECRETO_MINIMO) {
    throw new Error(`SESSION_SECRET debe tener al menos ${SECRETO_MINIMO} caracteres.`);
  }
  const cookieSegura = entorno.COOKIE_SECURE ?? 'auto';
  if (!['auto', 'true', 'false'].includes(cookieSegura)) {
    throw new Error('COOKIE_SECURE debe ser auto, true o false.');
  }

  return {
    puerto: entero('PORT', entorno.PORT ?? '3000', 1, 65535),
    host: entorno.HOST ?? '127.0.0.1',
    db: {
      host: String(entorno.DB_HOST),
      puerto: entero('DB_PORT', String(entorno.DB_PORT), 1, 65535),
      nombre,
      usuario: String(entorno.DB_USER),
      contrasena: entorno.DB_PASSWORD ?? '',
    },
    sesion: {
      secreto,
      inactividadMinutos: entero('SESSION_INACTIVIDAD_MINUTOS', entorno.SESSION_INACTIVIDAD_MINUTOS ?? '24', 1, 1440),
      cookieSegura: cookieSegura === 'auto' ? 'auto' : cookieSegura === 'true',
      confiarEnProxy: booleano('TRUST_PROXY', entorno.TRUST_PROXY),
    },
  };
}
