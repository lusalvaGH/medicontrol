import { Injectable } from '@nestjs/common';
import { compare } from 'bcryptjs';
import type { Request } from 'express';
import type { Session, SessionData } from 'express-session';
import { ApiException } from '../comun/api-exception';
import { phpTrim } from '../reglas/php';
import { LimitadorLogin } from './limitador-login';
import { UsuarioSesion, esRol, huellaDeCredencial, igualesSeguro, nuevoTokenCsrf } from './sesion';
import { FilaCredencial, UsuariosAuthRepository } from './usuarios-auth.repository';

/**
 * Hash ficticio (el mismo de login.php): si el correo no existe se verifica igual contra él,
 * para que el tiempo de respuesta no revele qué correos están registrados.
 */
const HASH_FICTICIO = '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';

export type SesionExpress = Session & Partial<SessionData>;

@Injectable()
export class AuthService {
  constructor(
    private readonly usuarios: UsuariosAuthRepository,
    private readonly limitador: LimitadorLogin,
  ) {}

  /**
   * Verifica las credenciales (mismas reglas que login.php). No modifica la cuenta:
   * los hashes $2y$ de PHP se verifican tal como están guardados.
   */
  async verificarCredenciales(entrada: Record<string, unknown>, ip: string): Promise<{ usuario: UsuarioSesion; hash: string }> {
    const email = typeof entrada.email === 'string' ? phpTrim(entrada.email) : '';
    const contrasena = typeof entrada.contrasena === 'string' ? entrada.contrasena : '';

    const bloqueo = this.limitador.bloqueoRestante(email, ip);
    if (bloqueo > 0) {
      throw new ApiException(429, 'DEMASIADOS_INTENTOS', `Demasiados intentos fallidos. Volvé a intentar en ${Math.ceil(bloqueo / 60000)} min.`);
    }
    if (email === '' || contrasena === '') {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'Completá todos los campos.');
    }

    const fila = await this.usuarios.buscarPorEmail(email);
    const correcta = await compare(contrasena, fila ? String(fila.contrasena) : HASH_FICTICIO);
    if (!fila || fila.estado !== 'activo' || !correcta || !esRol(fila.rol)) {
      this.limitador.registrarFallo(email, ip);
      throw new ApiException(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    this.limitador.registrarExito(email);

    return { usuario: presentar(fila), hash: String(fila.contrasena) };
  }

  /** Nueva sesión con otro identificador (evita la fijación de sesión) y un token CSRF nuevo. */
  async iniciarSesion(pedido: Request, usuario: UsuarioSesion, hash: string): Promise<void> {
    await new Promise<void>((resolver, rechazar) => pedido.session.regenerate((error) => (error ? rechazar(error) : resolver())));
    const nueva = pedido.session as SesionExpress;
    nueva.id_usuario = usuario.id_usuario;
    nueva.rol = usuario.rol;
    nueva.huella_credencial = huellaDeCredencial(hash);
    nueva.csrf_token = nuevoTokenCsrf();
    await new Promise<void>((resolver, rechazar) => nueva.save((error) => (error ? rechazar(error) : resolver())));
  }

  /**
   * Usuario de la sesión si sigue existiendo, está activo, conserva el rol y la contraseña no
   * cambió (huella). Si no, cierra la sesión. Igual que usuarioSesionVigente() y Guard en PHP.
   */
  async usuarioVigente(sesion: SesionExpress | undefined): Promise<UsuarioSesion> {
    if (!sesion || typeof sesion.id_usuario !== 'number' || !esRol(sesion.rol)) {
      throw new ApiException(401, 'NO_AUTENTICADO', 'Iniciá sesión para continuar.');
    }

    const fila = await this.usuarios.buscarPorId(sesion.id_usuario);
    const huella = sesion.huella_credencial;
    if (
      !fila ||
      fila.estado !== 'activo' ||
      fila.rol !== sesion.rol ||
      typeof huella !== 'string' ||
      !igualesSeguro(huellaDeCredencial(String(fila.contrasena)), huella)
    ) {
      await cerrar(sesion);
      throw new ApiException(401, 'SESION_INVALIDA', 'La sesión ya no es válida. Iniciá sesión nuevamente.');
    }

    return presentar(fila);
  }
}

function presentar(fila: FilaCredencial): UsuarioSesion {
  return {
    id_usuario: Number(fila.id_usuario),
    nombre: String(fila.nombre),
    apellido: String(fila.apellido),
    email: String(fila.email),
    rol: fila.rol as UsuarioSesion['rol'],
  };
}

export function cerrar(sesion: SesionExpress): Promise<void> {
  return new Promise((resolver, rechazar) => sesion.destroy((error) => (error ? rechazar(error) : resolver())));
}
