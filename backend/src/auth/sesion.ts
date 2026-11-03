import { hash } from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ROLES = ['paciente', 'medico', 'recepcionista'] as const;
export type Rol = (typeof ROLES)[number];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/** Usuario de la sesión, sin contraseña ni estado (igual que Guard::usuario en PHP). */
export interface UsuarioSesion {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
}

declare module 'express-session' {
  interface SessionData {
    id_usuario?: number;
    rol?: Rol;
    huella_credencial?: string;
    csrf_token?: string;
    /** Intentos fallidos de cambio de contraseña en esta sesión (como en CuentaController.php). */
    contrasena_fallos?: number;
    /** Hasta cuándo (ms desde 1970) está bloqueado el cambio de contraseña en esta sesión. */
    contrasena_bloqueo_hasta?: number;
  }
}

/**
 * Hash bcrypt de costo 10, como password_hash(PASSWORD_DEFAULT) de PHP. Se guarda con el
 * prefijo $2y$ de PHP: el algoritmo es el mismo que $2b$ y así todas las cuentas quedan iguales.
 */
export async function hashContrasena(contrasena: string): Promise<string> {
  return '$2y$' + (await hash(contrasena, 10)).slice(4);
}

/**
 * Huella de sesión: el mismo resumen de un solo sentido que usa PHP (includes/auth.php).
 * Si la contraseña cambia, cambia la huella y las demás sesiones de ese usuario dejan de valer.
 */
export function huellaDeCredencial(hashContrasena: string): string {
  return createHash('sha256').update('medicontrol-sesion|' + hashContrasena, 'utf8').digest('hex');
}

/** Compara dos textos en tiempo constante (como hash_equals de PHP). */
export function igualesSeguro(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');

  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token CSRF de 64 caracteres hexadecimales, como en PHP. */
export function nuevoTokenCsrf(): string {
  return randomBytes(32).toString('hex');
}
