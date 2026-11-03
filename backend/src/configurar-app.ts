import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { configurarSesiones } from './auth/sesion.config';
import { ErroresFilter } from './comun/errores.filter';
import { RespuestaInterceptor } from './comun/respuesta.interceptor';
import { controlDeRutas } from './comun/rutas';

const PREFIJO = 'api';

/** Configuración común a la aplicación y a las pruebas, para que se comporten igual. */
export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix(PREFIJO);
  app.useGlobalInterceptors(new RespuestaInterceptor());
  app.useGlobalFilters(new ErroresFilter());

  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  // Mismas cabeceras que la API PHP: las respuestas no se guardan en caché ni se reinterpretan
  express.use((_pedido: Request, respuesta: Response, siguiente: NextFunction) => {
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    siguiente();
  });
  // 404 y 405 antes de abrir la sesión, como el Router de PHP
  express.use(controlDeRutas(app, PREFIJO));
  configurarSesiones(app);
}
