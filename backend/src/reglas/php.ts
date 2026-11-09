/**
 * Equivalentes exactos de funciones de PHP que usan las reglas de MediControl. Las reglas
 * migradas deben dar el mismo resultado que en PHP, incluidos los casos borde.
 */

/** trim() de PHP: quita solo espacio, \t, \n, \r, \0 y \x0B (String.trim de JS quita más). */
export function phpTrim(texto: string): string {
  return texto.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
}

/** mb_strlen() en UTF-8: cuenta caracteres (puntos de código), no unidades UTF-16. */
export function mbStrlen(texto: string): number {
  return [...texto].length;
}

/** strlen() de PHP: cuenta bytes en UTF-8. */
export function strlenBytes(texto: string): number {
  return Buffer.byteLength(texto, 'utf8');
}

/**
 * preg_match con un patrón anclado con ^...$ y sin el modificador D: en PCRE, $ también
 * coincide antes de un \n final. El patrón recibido debe estar anclado y sin la bandera g.
 */
export function coincideAnclado(patron: RegExp, texto: string): boolean {
  return patron.test(texto) || (texto.endsWith('\n') && patron.test(texto.slice(0, -1)));
}

/** \s de PCRE con /u (UCP): espacios Unicode, \t \n \x0B \f \r y NEL (U+0085). */
const ESPACIOS_PCRE_UCP = /[\t\n\x0B\f\r\x85\p{Z}]+/gu;

/** preg_replace('/\s+/u', ' ', $texto). */
export function colapsarEspacios(texto: string): string {
  return texto.replace(ESPACIOS_PCRE_UCP, ' ');
}

/** Lectura de un campo de texto como en PHP: si no es string, ''; si es, recortado con trim(). */
export function textoRecortado(entrada: Record<string, unknown>, campo: string): string {
  const valor = entrada[campo];

  return typeof valor === 'string' ? phpTrim(valor) : '';
}
