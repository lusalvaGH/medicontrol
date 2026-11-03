/** Formato de las respuestas: el mismo que la API PHP (src/Http/Respuesta.php). */
export interface RespuestaOk<T> {
  ok: true;
  data: T;
}

export interface RespuestaError {
  ok: false;
  error: { codigo: string; mensaje: string; campos?: Record<string, string> };
}

export function respuestaError(codigo: string, mensaje: string, campos: Record<string, string> = {}): RespuestaError {
  const error: RespuestaError['error'] = { codigo, mensaje };
  if (Object.keys(campos).length > 0) {
    error.campos = campos;
  }

  return { ok: false, error };
}
