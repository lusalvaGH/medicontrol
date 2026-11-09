import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PermitidaConContrasenaProvisoria, UsuarioActual } from '../auth/decoradores';
import type { UsuarioSesion } from '../auth/sesion';
import { cuerpoComoObjeto } from '../comun/entrada';
import { CuentaService, DatosCuenta } from './cuenta.service';

/**
 * Cuenta del usuario con sesión, para cualquier rol. La persona sale siempre de la sesión: no hay
 * forma de pedir ni modificar los datos de otra.
 */
@Controller('cuenta')
export class CuentaController {
  constructor(private readonly cuenta: CuentaService) {}

  /** GET /api/cuenta — datos propios (sin contraseña). */
  @PermitidaConContrasenaProvisoria()
  @Get()
  async datos(@UsuarioActual() usuario: UsuarioSesion): Promise<{ cuenta: DatosCuenta }> {
    return { cuenta: await this.cuenta.datosPropios(usuario.id_usuario) };
  }

  /** PATCH /api/cuenta/datos — {nombre, apellido, email, contrasena_actual?, …perfil de paciente}. */
  @Patch('datos')
  async actualizarDatos(@Req() pedido: Request, @UsuarioActual() usuario: UsuarioSesion, @Body() cuerpo: unknown): Promise<{ cuenta: DatosCuenta }> {
    return { cuenta: await this.cuenta.actualizarDatos(pedido, usuario.id_usuario, cuerpoComoObjeto(cuerpo)) };
  }

  /** POST /api/cuenta/contrasena — {contrasena_actual, contrasena_nueva, contrasena_confirmacion}. */
  @PermitidaConContrasenaProvisoria()
  @Post('contrasena')
  @HttpCode(200)
  async cambiarContrasena(@Req() pedido: Request, @UsuarioActual() usuario: UsuarioSesion, @Body() cuerpo: unknown): Promise<{ actualizada: true }> {
    await this.cuenta.cambiarContrasena(pedido, usuario.id_usuario, cuerpoComoObjeto(cuerpo));

    return { actualizada: true };
  }
}
