/**
 * Error esperado de la API: se convierte en {"ok": false, "error": {codigo, mensaje, campos?}}
 * con su código HTTP. Mismo contrato que MediControl\Http\ApiException de la versión PHP.
 */
export class ApiException extends Error {
  constructor(
    readonly estadoHttp: number,
    readonly codigo: string,
    mensaje: string,
    readonly campos: Record<string, string> = {},
  ) {
    super(mensaje);
    this.name = 'ApiException';
  }
}
