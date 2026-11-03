import { Injectable } from '@nestjs/common';
import { compare } from 'bcryptjs';
import type { Request } from 'express';
import type { SesionExpress } from '../auth/auth.service';
import { hashContrasena, huellaDeCredencial, nuevoTokenCsrf } from '../auth/sesion';
import { ApiException } from '../comun/api-exception';
import { Entrada, campoSinRecortar } from '../comun/entrada';
import { CONTRASENA_MAXIMA, CONTRASENA_MENSAJE, contrasenaValida } from '../reglas/contrasena.reglas';
import { strlenBytes } from '../reglas/php';
import { UsuariosRepository } from './usuarios.repository';

export const MAX_FALLOS_CONTRASENA = 5;
export const BLOQUEO_CONTRASENA_MS = 15 * 60 * 1000;

/**
 * Cambio de la contraseña propia (CuentaController.php y CuentaService.php). El usuario sale
 * siempre de la sesión, nunca del pedido. Los intentos fallidos se cuentan por sesión.
 */
@Injectable()
export class CuentaService {
  /** Un cambio a la vez por sesión, como el bloqueo de archivo de la sesión en PHP: el contador no se puede esquivar con pedidos simultáneos. */
  private readonly enCurso = new Map<string, Promise<void>>();
  /** Reloj en milisegundos; las pruebas lo reemplazan para simular el vencimiento del bloqueo. */
  reloj: () => number = Date.now;

  constructor(private readonly usuarios: UsuariosRepository) {}

  async cambiarContrasena(pedido: Request, idUsuario: number, entrada: Entrada): Promise<void> {
    await this.deAUno(pedido.sessionID, async () => {
      // Datos frescos de la sesión: otro pedido pudo haber sumado un fallo mientras se esperaba
      await recargar(pedido);
      const sesion = pedido.session as SesionExpress;
      try {
        this.exigirSinBloqueo(sesion);

        const datos = {
          actual: campoSinRecortar(entrada, 'contrasena_actual'),
          nueva: campoSinRecortar(entrada, 'contrasena_nueva'),
          confirmacion: campoSinRecortar(entrada, 'contrasena_confirmacion'),
        };
        exigirCampos(datos);

        const hashActual = await this.hashSiActualCorrecta(idUsuario, datos.actual as string);
        if (hashActual === null) {
          this.registrarFallo(sesion);
          throw new ApiException(422, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual es incorrecta.', { contrasena_actual: 'incorrecta' });
        }

        const hashNuevo = await this.guardarNueva(idUsuario, hashActual, datos.nueva as string, datos.confirmacion as string);
        // Solo con la contraseña ya guardada: renueva esta sesión y deja inválidas las demás
        await renovarSesion(pedido, hashNuevo);
      } finally {
        await guardar(pedido.session as SesionExpress);
      }
    });
  }

  private exigirSinBloqueo(sesion: SesionExpress): void {
    const hasta = sesion.contrasena_bloqueo_hasta ?? 0;
    const ahora = this.reloj();
    if (hasta > ahora) {
      const minutos = Math.ceil((hasta - ahora) / 60000);
      throw new ApiException(429, 'DEMASIADOS_INTENTOS', `Demasiados intentos fallidos. Volvé a intentar en ${minutos} min.`);
    }
    if (hasta !== 0) {
      delete sesion.contrasena_fallos;
      delete sesion.contrasena_bloqueo_hasta;
    }
  }

  private registrarFallo(sesion: SesionExpress): void {
    const fallos = (sesion.contrasena_fallos ?? 0) + 1;
    sesion.contrasena_fallos = fallos;
    if (fallos >= MAX_FALLOS_CONTRASENA) {
      sesion.contrasena_bloqueo_hasta = this.reloj() + BLOQUEO_CONTRASENA_MS;
    }
  }

  /** Hash guardado si la contraseña actual es correcta; null si no lo es. */
  private async hashSiActualCorrecta(idUsuario: number, actual: string): Promise<string | null> {
    // bcrypt solo mira los primeros 72 bytes: un texto más largo no es la contraseña
    if (strlenBytes(actual) > CONTRASENA_MAXIMA) {
      return null;
    }
    const hash = await this.usuarios.buscarHashContrasena(idUsuario);

    return hash !== null && (await compare(actual, hash)) ? hash : null;
  }

  /** Valida la contraseña nueva y la guarda. Devuelve el hash nuevo. */
  private async guardarNueva(idUsuario: number, hashActual: string, nueva: string, confirmacion: string): Promise<string> {
    if (!contrasenaValida(nueva)) {
      throw new ApiException(422, 'CONTRASENA_NO_VALIDA', CONTRASENA_MENSAJE, { contrasena_nueva: 'no_valida' });
    }
    if (nueva !== confirmacion) {
      throw new ApiException(422, 'CONFIRMACION_NO_COINCIDE', 'Las contraseñas no coinciden.', { contrasena_confirmacion: 'no_coincide' });
    }
    if (await compare(nueva, hashActual)) {
      throw new ApiException(422, 'CONTRASENA_REPETIDA', 'La contraseña nueva debe ser distinta de la actual.', { contrasena_nueva: 'repetida' });
    }

    const hashNuevo = await hashContrasena(nueva);
    if ((await this.usuarios.actualizarContrasena(idUsuario, hashNuevo, hashActual)) === 0) {
      throw new ApiException(409, 'CUENTA_MODIFICADA', 'La cuenta cambió mientras se guardaba. Recargá la página e intentá de nuevo.');
    }

    return hashNuevo;
  }

  private async deAUno(clave: string, trabajo: () => Promise<void>): Promise<void> {
    const anterior = this.enCurso.get(clave) ?? Promise.resolve();
    const actual = anterior.then(trabajo, trabajo);
    const turno = actual.catch(() => undefined);
    this.enCurso.set(clave, turno);
    try {
      await actual;
    } finally {
      if (this.enCurso.get(clave) === turno) {
        this.enCurso.delete(clave);
      }
    }
  }
}

function exigirCampos(datos: Record<string, string | null>): void {
  const campos: Record<string, string> = {};
  for (const [clave, campo] of [
    ['actual', 'contrasena_actual'],
    ['nueva', 'contrasena_nueva'],
    ['confirmacion', 'contrasena_confirmacion'],
  ] as const) {
    if ((datos[clave] ?? '') === '') {
      campos[campo] = 'requerido';
    }
  }
  if (Object.keys(campos).length > 0) {
    throw new ApiException(400, 'DATOS_INVALIDOS', 'Completá todos los campos.', campos);
  }
}

function recargar(pedido: Request): Promise<void> {
  return new Promise((resolver, rechazar) =>
    pedido.session.reload((error: unknown) =>
      // La sesión ya no existe (otro pedido la cerró o la renovó): hay que volver a iniciar sesión
      error ? rechazar(new ApiException(401, 'SESION_INVALIDA', 'La sesión ya no es válida. Iniciá sesión nuevamente.')) : resolver(),
    ),
  );
}

function guardar(sesion: SesionExpress): Promise<void> {
  return new Promise((resolver, rechazar) => sesion.save((error) => (error ? rechazar(error) : resolver())));
}

/**
 * Nuevo identificador de sesión con los mismos datos, la huella de la contraseña nueva y un
 * token CSRF nuevo; sin el contador de fallos (renovarSesionTrasCambioDeContrasena en PHP).
 */
async function renovarSesion(pedido: Request, hashNuevo: string): Promise<void> {
  const { cookie: _cookie, contrasena_fallos: _f, contrasena_bloqueo_hasta: _b, ...datos } = pedido.session as SesionExpress;
  await new Promise<void>((resolver, rechazar) => pedido.session.regenerate((error) => (error ? rechazar(error) : resolver())));
  Object.assign(pedido.session, datos, { huella_credencial: huellaDeCredencial(hashNuevo), csrf_token: nuevoTokenCsrf() });
}
