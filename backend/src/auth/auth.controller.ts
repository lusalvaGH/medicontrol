import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, SesionExpress, cerrar } from './auth.service';
import { PermitidaConContrasenaProvisoria, Publico, UsuarioActual } from './decoradores';
import { NOMBRE_COOKIE } from './sesion.config';
import { UsuarioSesion, nuevoTokenCsrf } from './sesion';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** GET /api/auth/csrf-inicio — token para enviar el login (crea una sesión anónima). */
  @Publico()
  @Get('csrf-inicio')
  csrfInicio(@Req() pedido: Request): { token: string } {
    return { token: tokenDe(pedido.session as SesionExpress) };
  }

  /** GET /api/auth/csrf — token para los pedidos que modifican datos (requiere sesión). */
  @PermitidaConContrasenaProvisoria()
  @Get('csrf')
  csrf(@Req() pedido: Request): { token: string } {
    return { token: tokenDe(pedido.session as SesionExpress) };
  }

  /** GET /api/auth/me — usuario de la sesión actual. */
  @PermitidaConContrasenaProvisoria()
  @Get('me')
  yo(@UsuarioActual() usuario: UsuarioSesion): { usuario: UsuarioSesion } {
    return { usuario };
  }

  /** POST /api/auth/login — {email, contrasena}. Exige el token de /auth/csrf-inicio. */
  @Publico()
  @Post('login')
  @HttpCode(200)
  async login(@Body() cuerpo: unknown, @Req() pedido: Request): Promise<{ usuario: UsuarioSesion }> {
    const entrada = cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {};
    const { usuario, hash } = await this.auth.verificarCredenciales(entrada, pedido.ip ?? '');
    await this.auth.iniciarSesion(pedido, usuario, hash);

    return { usuario };
  }

  /** POST /api/auth/logout — cierra la sesión y borra la cookie. Exige CSRF (en PHP era un GET). */
  @Publico()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() pedido: Request, @Res({ passthrough: true }) respuesta: Response): Promise<{ sesion_cerrada: true }> {
    await cerrar(pedido.session as SesionExpress);
    respuesta.clearCookie(NOMBRE_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax' });

    return { sesion_cerrada: true };
  }
}

function tokenDe(sesion: SesionExpress): string {
  if (typeof sesion.csrf_token !== 'string' || sesion.csrf_token.length !== 64) {
    sesion.csrf_token = nuevoTokenCsrf();
  }

  return sesion.csrf_token;
}
