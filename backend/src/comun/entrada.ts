import { PipeTransform } from '@nestjs/common';
import { phpTrim } from '../reglas/php';
import { ApiException } from './api-exception';

export type Entrada = Record<string, unknown>;

/** Cuerpo JSON como objeto; cualquier otra cosa cuenta como vacío (como $pedido->cuerpo en PHP). */
export function cuerpoComoObjeto(cuerpo: unknown): Entrada {
  return cuerpo !== null && typeof cuerpo === 'object' ? (cuerpo as Entrada) : {};
}

/** Parámetro de query como texto recortado; las listas (?x[]=...) se ignoran (Request::texto). */
export function textoQuery(query: Entrada, nombre: string): string | null {
  const valor = query[nombre];

  return typeof valor === 'string' ? phpTrim(valor) : null;
}

/** Campo del cuerpo tal como llegó (contraseñas: los espacios cuentan); null si no es texto. */
export function campoSinRecortar(entrada: Entrada, nombre: string): string | null {
  const valor = entrada[nombre];

  return typeof valor === 'string' ? valor : null;
}

/** Campo del cuerpo como texto recortado (los enteros se convierten); null si falta o no es texto (Request::campoTexto). */
export function campoTexto(entrada: Entrada, nombre: string): string | null {
  const valor = entrada[nombre];
  if (typeof valor === 'string') {
    return phpTrim(valor);
  }

  return Number.isSafeInteger(valor) ? String(valor) : null;
}

/** Campo del cuerpo como entero positivo; null si falta o no es válido (Request::campoEntero). */
export function campoEntero(entrada: Entrada, nombre: string): number | null {
  const valor = entrada[nombre];
  if (typeof valor === 'number') {
    return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
  }
  if (typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(phpTrim(valor))) {
    return Number(phpTrim(valor));
  }

  return null;
}

/** (int) de PHP sobre un texto: toma el número inicial ("12abc" → 12, "1e3" → 1000) y si no hay, 0. */
export function enteroPhp(texto: string): number {
  const m = /^[ \t\n\r\v\f]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/.exec(texto);
  const numero = m ? Math.trunc(Number(m[1])) : 0;

  return Number.isFinite(numero) ? numero : 0;
}

/** :id de la ruta. El control de rutas ya exige solo dígitos; esto es una segunda barrera. */
export class IdRutaPipe implements PipeTransform<string, number> {
  transform(valor: string): number {
    if (!/^\d+$/.test(valor)) {
      throw new ApiException(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.');
    }

    return Number(valor);
  }
}
