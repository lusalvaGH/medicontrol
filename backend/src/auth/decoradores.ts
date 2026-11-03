import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Rol, UsuarioSesion } from './sesion';

export const META_PUBLICO = 'medicontrol:publico';
export const META_ROLES = 'medicontrol:roles';

/** La ruta no exige sesión. Los pedidos que modifican datos siguen exigiendo CSRF. */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(META_PUBLICO, true);

/** Solo estos roles pueden usar la ruta (como Guard::requerirRol en PHP). */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator => SetMetadata(META_ROLES, roles);

export type PedidoConUsuario = Request & { usuario?: UsuarioSesion };

/** Usuario de la sesión ya verificado. Nunca sale de datos enviados por el cliente. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): UsuarioSesion | undefined => {
  return contexto.switchToHttp().getRequest<PedidoConUsuario>().usuario;
});
