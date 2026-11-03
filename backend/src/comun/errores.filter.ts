import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from './api-exception';
import { respuestaError } from './respuesta';

/**
 * Manejo central de errores. Un error esperado responde su código; uno inesperado se registra
 * en el log y el cliente recibe un mensaje genérico, sin detalles internos (igual que App::manejar).
 */
@Catch()
export class ErroresFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const respuesta = http.getResponse<Response>();
    const pedido = http.getRequest<Request>();

    if (error instanceof ApiException) {
      respuesta.status(error.estadoHttp).json(respuestaError(error.codigo, error.message, error.campos));
      return;
    }

    if (error instanceof HttpException) {
      const estado = error.getStatus();
      if (estado === HttpStatus.NOT_FOUND) {
        respuesta.status(estado).json(respuestaError('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.'));
        return;
      }
      if (estado === HttpStatus.PAYLOAD_TOO_LARGE || estado === HttpStatus.BAD_REQUEST) {
        respuesta.status(estado).json(respuestaError('DATOS_INVALIDOS', 'El pedido no es válido.'));
        return;
      }
    }

    const detalle = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    // Solo la ruta, sin la query: los parámetros de búsqueda pueden tener DNI o correos (igual que PHP)
    this.logger.error(`${pedido.method} ${pedido.path}: ${detalle}`);
    respuesta
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(respuestaError('ERROR_INTERNO', 'Ocurrió un error interno. Intentá nuevamente más tarde.'));
  }
}
