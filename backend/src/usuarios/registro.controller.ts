import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SesionExpress } from '../auth/auth.service';
import { Publico } from '../auth/decoradores';
import { nuevoTokenCsrf } from '../auth/sesion';
import { ApiException } from '../comun/api-exception';
import { cuerpoComoObjeto } from '../comun/entrada';
import { LimitadorRegistro } from './limitador-registro';
import { UsuariosService } from './usuarios.service';

/**
 * Registro público de pacientes (register.php). No exige sesión, pero sí el token CSRF de
 * /api/auth/csrf-inicio, como el login. Solo crea cuentas de paciente.
 */
@Controller('registro')
export class RegistroController {
  constructor(
    private readonly servicio: UsuariosService,
    private readonly limitador: LimitadorRegistro,
  ) {}

  /** POST /api/registro — datos del formulario de register.php. Responde 201 sin datos de la cuenta. */
  @Publico()
  @Post()
  async registrar(@Body() cuerpo: unknown, @Req() pedido: Request): Promise<{ registrado: true }> {
    const sesion = pedido.session as SesionExpress;
    // Con una sesión iniciada no se crea otra cuenta (en PHP, register.php redirige al panel)
    if (typeof sesion.id_usuario === 'number') {
      throw new ApiException(409, 'SESION_INICIADA', 'Ya iniciaste sesión. Para crear otra cuenta, cerrá la sesión primero.');
    }
    const ip = pedido.ip ?? '';
    const espera = this.limitador.esperaRestante(ip);
    if (espera > 0) {
      throw new ApiException(429, 'DEMASIADOS_INTENTOS', `Demasiados registros desde esta conexión. Volvé a intentar en ${Math.ceil(espera / 60000)} min.`);
    }
    this.limitador.registrar(ip);

    try {
      await this.servicio.registrarPaciente(cuerpoComoObjeto(cuerpo));
    } finally {
      // Como csrfRenovar() en PHP: el mismo token no sirve para reenviar el formulario
      sesion.csrf_token = nuevoTokenCsrf();
    }

    return { registrado: true };
  }
}
