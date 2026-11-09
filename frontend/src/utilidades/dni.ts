/**
 * DNI con la misma regla que el backend (validarPersona en backend/src/reglas/personas.validador.ts):
 * se quitan puntos, espacios y guiones, y lo que queda tiene que ser de 7 u 8 dígitos.
 */
export function normalizarDni(texto: string): string {
  return texto.trim().replace(/[. -]/g, '');
}

export function dniValido(texto: string): boolean {
  return /^\d{7,8}$/.test(normalizarDni(texto));
}

export const MENSAJE_DNI = 'El DNI debe tener 7 u 8 números (podés escribirlo con puntos).';
