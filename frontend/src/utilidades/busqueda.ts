import { normalizarDni } from './dni';

/**
 * Texto para buscar pacientes. Un DNI escrito con puntos, espacios o guiones ("38.123.456") se
 * busca sin ellos, porque la base guarda el DNI solo con dígitos (misma regla que el backend).
 * Un nombre o un correo queda igual.
 */
export function textoDeBusqueda(texto: string): string {
  const limpio = texto.trim();

  return /^[\d.\s-]+$/.test(limpio) ? normalizarDni(limpio) : limpio;
}
