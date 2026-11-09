import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../comun/api-exception';
import { AuthService, SesionExpress } from './auth.service';
import { META_CON_PROVISORIA, META_PUBLICO, META_ROLES, PedidoConUsuario } from './decoradores';
import { Rol, igualesSeguro } from './sesion';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Control de acceso de todas las rutas, en el mismo orden que la API PHP:
 * 1) sesión vigente (salvo rutas públicas), 2) rol, 3) token CSRF en los pedidos que modifican datos.
 */
@Injectable()
export class SeguridadGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const pedido = contexto.switchToHttp().getRequest<PedidoConUsuario>();
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    const publico = this.reflector.getAllAndOverride<boolean>(META_PUBLICO, objetivos) === true;
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(META_ROLES, objetivos);
    const sesion = pedido.session as SesionExpress | undefined;

    if (!publico) {
      pedido.usuario = await this.auth.usuarioVigente(sesion);
      if (roles && !roles.includes(pedido.usuario.rol)) {
        throw new ApiException(403, 'SIN_PERMISO', 'No tenés permiso para realizar esta operación.');
      }
      // Contraseña provisoria: hasta cambiarla, solo se puede consultar la sesión y cambiarla
      const conProvisoria = this.reflector.getAllAndOverride<boolean>(META_CON_PROVISORIA, objetivos) === true;
      if (pedido.usuario.debe_cambiar_contrasena && !conProvisoria) {
        throw new ApiException(403, 'CAMBIO_CONTRASENA_REQUERIDO', 'Tenés que cambiar tu contraseña provisoria antes de continuar.');
      }
    }

    if (!METODOS_SEGUROS.has(pedido.method)) {
      const esperado = sesion?.csrf_token;
      const recibido = pedido.headers['x-csrf-token'];
      if (typeof esperado !== 'string' || esperado === '' || typeof recibido !== 'string' || !igualesSeguro(esperado, recibido)) {
        throw new ApiException(403, 'CSRF_INVALIDO', 'La verificación de seguridad falló. Recargá la página e intentá de nuevo.');
      }
    }

    return true;
  }
}
