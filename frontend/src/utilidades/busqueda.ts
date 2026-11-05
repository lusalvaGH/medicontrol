/**
 * Texto para buscar pacientes. Un DNI escrito con puntos o espacios ("38.123.456") se busca sin
 * ellos, porque la base guarda el DNI solo con dígitos. Un nombre o un correo queda igual.
 */
export function textoDeBusqueda(texto: string): string {
  const limpio = texto.trim();

  return /^[\d.\s]+$/.test(limpio) ? limpio.replace(/[.\s]/g, '') : limpio;
}
