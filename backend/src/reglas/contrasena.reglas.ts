/**
 * Política única de contraseñas (migrada de src/Services/ReglasContrasena.php).
 */
import { mbStrlen, strlenBytes } from './php';

export const CONTRASENA_MINIMA = 8;
export const CONTRASENA_MAXIMA = 72; // límite de bcrypt (bytes)

export const CONTRASENA_MENSAJE = `La contraseña debe tener entre ${CONTRASENA_MINIMA} y ${CONTRASENA_MAXIMA} caracteres e incluir letras y números.`;

export function contrasenaValida(contrasena: string): boolean {
  return (
    mbStrlen(contrasena) >= CONTRASENA_MINIMA &&
    strlenBytes(contrasena) <= CONTRASENA_MAXIMA &&
    !contrasena.includes('\0') && // bcrypt no admite el byte nulo
    /\p{L}/u.test(contrasena) &&
    /\d/.test(contrasena)
  );
}
