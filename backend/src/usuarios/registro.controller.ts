import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SesionExpress } from '../auth/auth.service';
import { Publico } from '../auth/decoradores';
import { nuevoTokenCsrf } from '../auth/sesion';
import { cuerpoComoObjeto } from '../comun/entrada';
import { UsuariosService } from './usuarios.service';

/**
 * Registro público de pacientes (register.php). No exige sesión, pero sí el token CSRF de
 * /api/auth/csrf-inicio, como el login. Solo crea cuentas de paciente.
 */
@Controller('registro')
export class RegistroController {
  constructor(private readonly servicio: UsuariosService) {}

  /** POST /api/registro — datos del formulario de register.php. Responde 201 sin datos de la cuenta. */
  @Publico()
  @Post()
  async registrar(@Body() cuerpo: unknown, @Req() pedido: Request): Promise<{ registrado: true }> {
    const sesion = pedido.session as SesionExpress;
    try {
      await this.servicio.registrarPaciente(cuerpoComoObjeto(cuerpo));
    } finally {
      // Como csrfRenovar() en PHP: el mismo token no sirve para reenviar el formulario
      sesion.csrf_token = nuevoTokenCsrf();
    }

    return { registrado: true };
  }
}
