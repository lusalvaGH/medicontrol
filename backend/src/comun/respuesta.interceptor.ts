import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { RespuestaOk } from './respuesta';

/** Envuelve el valor que devuelve cada controlador en {"ok": true, "data": ...}. */
@Injectable()
export class RespuestaInterceptor<T> implements NestInterceptor<T, RespuestaOk<T>> {
  intercept(_contexto: ExecutionContext, siguiente: CallHandler<T>): Observable<RespuestaOk<T>> {
    return siguiente.handle().pipe(map((data) => ({ ok: true as const, data })));
  }
}
