/**
 * Configuración desde variables de entorno. No hay credenciales por defecto: si falta un dato
 * obligatorio, la aplicación no arranca. La contraseña puede estar vacía (XAMPP local).
 */
export interface Configuracion {
  puerto: number;
  host: string;
  db: { host: string; puerto: number; nombre: string; usuario: string; contrasena: string };
}

const NOMBRE_BASE = /^[A-Za-z0-9_]{1,64}$/;

export function leerConfiguracion(entorno: NodeJS.ProcessEnv): Configuracion {
  const faltantes = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'].filter((clave) => !entorno[clave]);
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(', ')}. Revisá backend/.env (ver .env.example).`);
  }

  const entero = (clave: string, valor: string): number => {
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < 1 || numero > 65535) {
      throw new Error(`${clave} debe ser un puerto válido.`);
    }

    return numero;
  };

  const nombre = String(entorno.DB_NAME);
  if (!NOMBRE_BASE.test(nombre)) {
    throw new Error('DB_NAME solo puede tener letras, números y guiones bajos.');
  }

  return {
    puerto: entero('PORT', entorno.PORT ?? '3000'),
    host: entorno.HOST ?? '127.0.0.1',
    db: {
      host: String(entorno.DB_HOST),
      puerto: entero('DB_PORT', String(entorno.DB_PORT)),
      nombre,
      usuario: String(entorno.DB_USER),
      contrasena: entorno.DB_PASSWORD ?? '',
    },
  };
}
