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

/** :id de la ruta. El control de rutas ya exige solo dígitos; esto es una segunda barrera. */
export class IdRutaPipe implements PipeTransform<string, number> {
  transform(valor: string): number {
    if (!/^\d+$/.test(valor)) {
      throw new ApiException(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.');
    }

    return Number(valor);
  }
}
