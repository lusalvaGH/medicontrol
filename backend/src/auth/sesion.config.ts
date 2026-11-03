import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import session from 'express-session';
import type { Configuracion } from '../config/configuracion';
import { SesionesEnMemoria } from './sesion.store';

export const NOMBRE_COOKIE = 'medicontrol.sid';
export const SESIONES = Symbol('SESIONES');

export function crearAlmacenSesiones(config: ConfigService): SesionesEnMemoria {
  const sesion = config.getOrThrow<Configuracion['sesion']>('sesion');

  return new SesionesEnMemoria(sesion.inactividadMinutos * 60 * 1000);
}

/**
 * Cookie de sesión: HttpOnly, SameSite=Lax y Secure cuando la conexión es HTTPS; sin vencimiento
 * propio (se borra al cerrar el navegador), como la cookie de PHP. La sesión vence en el
 * servidor tras el tiempo de inactividad configurado.
 */
export function configurarSesiones(app: INestApplication): void {
  const config = app.get(ConfigService);
  const sesion = config.getOrThrow<Configuracion['sesion']>('sesion');
  const express = app.getHttpAdapter().getInstance();
  if (sesion.confiarEnProxy) {
    express.set('trust proxy', 1);
  }

  app.use(
    session({
      name: NOMBRE_COOKIE,
      secret: sesion.secreto,
      store: app.get<SesionesEnMemoria>(SESIONES),
      resave: false,
      saveUninitialized: false,
      unset: 'destroy',
      cookie: { httpOnly: true, sameSite: 'lax', secure: sesion.cookieSegura, path: '/' },
    }),
  );
}
