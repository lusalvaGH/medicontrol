import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UsuarioActual } from '../auth/decoradores';
import type { UsuarioSesion } from '../auth/sesion';
import { cuerpoComoObjeto } from '../comun/entrada';
import { CuentaService } from './cuenta.service';

/** Cuenta del usuario con sesión, para cualquier rol. Sus datos se leen con GET /api/auth/me. */
@Controller('cuenta')
export class CuentaController {
  constructor(private readonly cuenta: CuentaService) {}

  /** POST /api/cuenta/contrasena — {contrasena_actual, contrasena_nueva, contrasena_confirmacion}. */
  @Post('contrasena')
  @HttpCode(200)
  async cambiarContrasena(@Req() pedido: Request, @UsuarioActual() usuario: UsuarioSesion, @Body() cuerpo: unknown): Promise<{ actualizada: true }> {
    await this.cuenta.cambiarContrasena(pedido, usuario.id_usuario, cuerpoComoObjeto(cuerpo));

    return { actualizada: true };
  }
}
