import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles, UsuarioActual } from '../auth/decoradores';
import type { UsuarioSesion } from '../auth/sesion';
import { ApiException } from '../comun/api-exception';
import { Entrada, IdRutaPipe, cuerpoComoObjeto, textoQuery } from '../comun/entrada';
import { UsuarioPresentado, UsuariosService } from './usuarios.service';

/** Configuración de Recepción: pacientes, médicos y consulta de recepcionistas (UsuariosController.php). */
@Roles('recepcionista')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly servicio: UsuariosService) {}

  /** GET /api/usuarios?tipo=personal|pacientes&buscar=&estado=todos|activo|inactivo&pagina=1 */
  @Get()
  listar(@Query() query: Entrada) {
    const pagina = textoQuery(query, 'pagina') ?? '1';
    if (!/^[1-9]\d{0,5}$/.test(pagina)) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'La página no es válida.', { pagina: 'invalida' });
    }

    return this.servicio.listar(textoQuery(query, 'tipo') ?? 'personal', textoQuery(query, 'buscar') ?? '', textoQuery(query, 'estado') ?? 'todos', Number(pagina));
  }

  @Get(':id')
  async detalle(@Param('id', IdRutaPipe) id: number): Promise<{ usuario: UsuarioPresentado }> {
    return { usuario: await this.servicio.detalle(id) };
  }

  @Post()
  async crear(@Body() cuerpo: unknown): Promise<{ usuario: UsuarioPresentado }> {
    return { usuario: await this.servicio.crear(cuerpoComoObjeto(cuerpo)) };
  }

  @Patch(':id')
  async modificar(@Param('id', IdRutaPipe) id: number, @Body() cuerpo: unknown): Promise<{ usuario: UsuarioPresentado }> {
    return { usuario: await this.servicio.modificar(id, cuerpoComoObjeto(cuerpo)) };
  }

  @Post(':id/baja')
  @HttpCode(200)
  async baja(@Param('id', IdRutaPipe) id: number, @UsuarioActual() actor: UsuarioSesion): Promise<{ usuario: UsuarioPresentado }> {
    return { usuario: await this.servicio.darDeBaja(id, actor.id_usuario) };
  }

  @Post(':id/reactivacion')
  @HttpCode(200)
  async reactivar(@Param('id', IdRutaPipe) id: number): Promise<{ usuario: UsuarioPresentado }> {
    return { usuario: await this.servicio.reactivar(id) };
  }

  @Post(':id/contrasena-provisoria')
  @HttpCode(200)
  async restablecerContrasena(@Param('id', IdRutaPipe) id: number, @UsuarioActual() actor: UsuarioSesion, @Body() cuerpo: unknown): Promise<{ actualizada: true }> {
    await this.servicio.restablecerContrasena(id, actor.id_usuario, cuerpoComoObjeto(cuerpo));

    return { actualizada: true };
  }
}
