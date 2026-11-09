import { describe, expect, it } from 'vitest';
import { textoDeBusqueda } from './busqueda';
import { dniValido, normalizarDni } from './dni';

describe('DNI con la misma regla que el backend', () => {
  it('acepta 7 u 8 dígitos con puntos, espacios o guiones', () => {
    for (const dni of ['38123456', '38.123.456', '38 123 456', '38-123-456', ' 1.234.567 ']) {
      expect(dniValido(dni)).toBe(true);
    }
    expect(normalizarDni('38.123.456')).toBe('38123456');
  });

  it('rechaza menos de 7, más de 8 o con letras', () => {
    for (const dni of ['123456', '123456789', '38A23456', '', '...']) {
      expect(dniValido(dni)).toBe(false);
    }
  });

  it('la búsqueda limpia un DNI pero deja igual un nombre o un correo', () => {
    expect(textoDeBusqueda(' 38.123.456 ')).toBe('38123456');
    expect(textoDeBusqueda('38-123-456')).toBe('38123456');
    expect(textoDeBusqueda('García')).toBe('García');
    expect(textoDeBusqueda('ana-paz@demo.test')).toBe('ana-paz@demo.test');
  });
});
