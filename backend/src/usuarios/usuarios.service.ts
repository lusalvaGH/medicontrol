import { Injectable } from '@nestjs/common';
import { hashContrasena } from '../auth/sesion';
import { ApiException } from '../comun/api-exception';
import type { Entrada } from '../comun/entrada';
import { mbStrlen } from '../reglas/php';
import {
  DatosPerfilMedico,
  DatosPerfilPaciente,
  DatosPersona,
  Validacion,
  validarContrasena,
  validarPerfilMedico,
  validarPerfilPaciente,
  validarPersona,
} from '../reglas/personas.validador';
import { fechaHoy, horaAhora } from '../reglas/zona-horaria';
import { FilaUsuario, UsuariosRepository } from './usuarios.repository';

export const POR_PAGINA = 10;
const ROLES_GESTIONABLES = ['medico', 'paciente'] as const;
type RolGestionable = (typeof ROLES_GESTIONABLES)[number];
const ROLES_POR_TIPO: Record<string, readonly string[]> = { personal: ['medico', 'recepcionista'], pacientes: ['paciente'] };

type Datos = DatosPersona & Partial<DatosPerfilPaciente> & Partial<DatosPerfilMedico> & { contrasena?: string };
export type UsuarioPresentado = FilaUsuario & { gestionable: boolean };

function esGestionable(rol: string): rol is RolGestionable {
  return (ROLES_GESTIONABLES as readonly string[]).includes(rol);
}

/** Error de MariaDB por un valor único repetido (ER_DUP_ENTRY). */
function esDuplicado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { errno?: unknown }).errno === 1062;
}

const duplicadoConcurrente = (): ApiException => new ApiException(409, 'DATO_DUPLICADO', 'El correo o el DNI ya pertenecen a otro usuario.');

/**
 * Gestión de usuarios desde Configuración de Recepción (migrada de UsuariosService.php).
 * Recepción gestiona pacientes y médicos, y solo consulta a otros recepcionistas.
 * Nunca se cambia un rol ni se borra un registro: las bajas son lógicas.
 */
@Injectable()
export class UsuariosService {
  /** Reloj en milisegundos; las pruebas lo fijan para no depender del horario real de ejecución. */
  reloj: () => number = Date.now;

  constructor(private readonly usuarios: UsuariosRepository) {}

  async listar(tipo: string, buscar: string, estado: string, pagina: number) {
    const roles = Object.hasOwn(ROLES_POR_TIPO, tipo) ? ROLES_POR_TIPO[tipo] : undefined;
    if (!roles) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'El tipo de listado no es válido.', { tipo: 'invalido' });
    }
    if (!['todos', 'activo', 'inactivo'].includes(estado)) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'El filtro de estado no es válido.', { estado: 'invalido' });
    }
    if (mbStrlen(buscar) > 80) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'La búsqueda es demasiado larga.', { buscar: 'demasiado_largo' });
    }

    const resultado = await this.usuarios.listar(roles, buscar, estado === 'todos' ? null : estado, POR_PAGINA, (pagina - 1) * POR_PAGINA);

    return {
      usuarios: resultado.filas.map(presentar),
      total: resultado.total,
      pagina,
      por_pagina: POR_PAGINA,
      paginas: Math.max(1, Math.ceil(resultado.total / POR_PAGINA)),
      especialidades: await this.usuarios.especialidades(),
    };
  }

  async detalle(idUsuario: number): Promise<UsuarioPresentado> {
    return presentar(await this.exigirUsuario(idUsuario));
  }

  async crear(entrada: Entrada, ahora = new Date(this.reloj())): Promise<UsuarioPresentado> {
    const rol = typeof entrada.rol === 'string' ? entrada.rol : '';
    if (rol === 'recepcionista') {
      throw new ApiException(403, 'SIN_PERMISO', 'Recepción no puede crear otros recepcionistas.');
    }
    if (!esGestionable(rol)) {
      throw new ApiException(400, 'DATOS_INVALIDOS', 'Elegí si vas a registrar un paciente o un médico.', { rol: 'Elegí un tipo de usuario válido.' });
    }

    const datos = validar(rol, entrada, fechaHoy(ahora), true);
    await this.exigirSinDuplicados(datos);
    // Igual que RegistroPacientesService::registrar, que vuelve a comprobar antes de crear el paciente
    if (rol === 'paciente' && (await this.usuarios.datosDuplicados(datos.email, datos.dni)).length > 0) {
      throw duplicadoConcurrente();
    }

    const hash = await hashContrasena(datos.contrasena as string);
    const idUsuario = await this.enTransaccion(async (db) => {
      const id = await this.usuarios.insertar(db, datos, rol, hash);
      if (rol === 'paciente') {
        await this.usuarios.insertarPerfilPaciente(db, id, datos as DatosPerfilPaciente);
      } else {
        await this.usuarios.insertarPerfilMedico(db, id, datos as DatosPerfilMedico);
      }

      return id;
    });

    return this.detalle(idUsuario);
  }

  async modificar(idUsuario: number, entrada: Entrada, ahora = new Date(this.reloj())): Promise<UsuarioPresentado> {
    const usuario = await this.exigirGestionable(idUsuario);
    if (Object.hasOwn(entrada, 'rol') && entrada.rol !== usuario.rol) {
      throw new ApiException(403, 'CAMBIO_ROL_NO_PERMITIDO', 'El rol de un usuario no se puede cambiar.');
    }

    const datos = validar(usuario.rol as RolGestionable, entrada, fechaHoy(ahora), false);
    await this.exigirSinDuplicados(datos, idUsuario);

    await this.enTransaccion(async (db) => {
      await this.usuarios.actualizarPersona(db, idUsuario, datos);
      if (usuario.rol === 'medico') {
        await this.usuarios.actualizarPerfilMedico(db, idUsuario, datos as DatosPerfilMedico);
      } else {
        await this.usuarios.actualizarPerfilPaciente(db, idUsuario, datos as DatosPerfilPaciente);
      }
    });

    return this.detalle(idUsuario);
  }

  async darDeBaja(idUsuario: number, idActor: number, ahora = new Date(this.reloj())): Promise<UsuarioPresentado> {
    if (idUsuario === idActor) {
      throw new ApiException(403, 'BAJA_PROPIA_NO_PERMITIDA', 'No podés darte de baja a vos mismo.');
    }
    const usuario = await this.exigirGestionable(idUsuario);
    if (usuario.estado === 'inactivo') {
      throw new ApiException(409, 'YA_INACTIVO', 'El usuario ya está dado de baja.');
    }

    const sinResolver = await this.usuarios.contarSinResolverDeUsuario(idUsuario, usuario.rol, fechaHoy(ahora), horaAhora(ahora));
    if (sinResolver > 0) {
      const persona = usuario.rol === 'medico' ? 'El médico' : 'El paciente';
      throw new ApiException(
        409,
        'TURNOS_SIN_RESOLVER',
        `${persona} tiene ${sinResolver} turno(s) futuro(s) o en curso. Cancelalos o resolvelos desde la agenda antes de dar la baja.`,
      );
    }

    if ((await this.usuarios.cambiarEstado(idUsuario, 'inactivo', 'activo')) === 0) {
      throw new ApiException(409, 'USUARIO_MODIFICADO', 'El usuario cambió mientras se guardaba. Recargá el listado e intentá de nuevo.');
    }

    return this.detalle(idUsuario);
  }

  async reactivar(idUsuario: number): Promise<UsuarioPresentado> {
    const usuario = await this.exigirGestionable(idUsuario);
    if (usuario.estado === 'activo') {
      throw new ApiException(409, 'YA_ACTIVO', 'El usuario ya está activo.');
    }
    if ((await this.usuarios.cambiarEstado(idUsuario, 'activo', 'inactivo')) === 0) {
      throw new ApiException(409, 'USUARIO_MODIFICADO', 'El usuario cambió mientras se guardaba. Recargá el listado e intentá de nuevo.');
    }

    return this.detalle(idUsuario);
  }

  /** Asigna una contraseña provisoria. La huella de sesión cierra las sesiones abiertas de ese usuario. */
  async restablecerContrasena(idUsuario: number, idActor: number, entrada: Entrada): Promise<void> {
    if (idUsuario === idActor) {
      throw new ApiException(403, 'SIN_PERMISO', 'Tu propia contraseña se cambia desde Mi cuenta.');
    }
    await this.exigirGestionable(idUsuario);

    const validacion = validarContrasena(entrada);
    if (Object.keys(validacion.errores).length > 0) {
      throw new ApiException(422, 'CONTRASENA_NO_VALIDA', 'Revisá la contraseña provisoria.', validacion.errores);
    }
    await this.usuarios.establecerContrasena(idUsuario, await hashContrasena(validacion.datos.contrasena));
  }

  private async exigirSinDuplicados(datos: Datos, exceptoUsuario: number | null = null): Promise<void> {
    const campos: Record<string, string> = {};
    for (const campo of await this.usuarios.datosDuplicados(datos.email, datos.dni, exceptoUsuario)) {
      campos[campo] = campo === 'email' ? 'Ese correo ya está registrado.' : 'Ese DNI ya está registrado.';
    }
    if (Object.keys(campos).length > 0) {
      throw new ApiException(409, 'DATO_DUPLICADO', 'Hay datos que ya pertenecen a otro usuario.', campos);
    }
  }

  /** Transacción: si algo falla se deshace todo. Dos envíos simultáneos con el mismo dato los frena la restricción única. */
  private async enTransaccion<T>(trabajo: (db: Awaited<ReturnType<UsuariosRepository['conexion']>>) => Promise<T>): Promise<T> {
    const db = await this.usuarios.conexion();
    try {
      await db.beginTransaction();
      const resultado = await trabajo(db);
      await db.commit();

      return resultado;
    } catch (error) {
      await db.rollback();
      throw esDuplicado(error) ? duplicadoConcurrente() : error;
    } finally {
      db.release();
    }
  }

  private async exigirUsuario(idUsuario: number): Promise<FilaUsuario> {
    const usuario = await this.usuarios.detalle(idUsuario);
    if (!usuario) {
      throw new ApiException(404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.');
    }

    return usuario;
  }

  private async exigirGestionable(idUsuario: number): Promise<FilaUsuario> {
    const usuario = await this.exigirUsuario(idUsuario);
    if (!esGestionable(usuario.rol)) {
      throw new ApiException(403, 'SIN_PERMISO', 'Recepción solo puede consultar a otros recepcionistas.');
    }

    return usuario;
  }
}

/** Valida persona, perfil del rol y, en las altas, la contraseña. Mismo orden de errores que PHP. */
function validar(rol: RolGestionable, entrada: Entrada, hoy: string, conContrasena: boolean): Datos {
  const partes: Validacion<object>[] = [validarPersona(entrada), rol === 'medico' ? validarPerfilMedico(entrada) : validarPerfilPaciente(entrada, hoy)];
  if (conContrasena) {
    partes.push(validarContrasena(entrada));
  }

  const datos = {} as Datos;
  const errores: Record<string, string> = {};
  for (const parte of partes) {
    Object.assign(datos, parte.datos);
    for (const [campo, mensaje] of Object.entries(parte.errores)) {
      errores[campo] ??= mensaje;
    }
  }
  if (Object.keys(errores).length > 0) {
    throw new ApiException(400, 'DATOS_INVALIDOS', 'Revisá los campos marcados.', errores);
  }

  return datos;
}

function presentar(fila: FilaUsuario): UsuarioPresentado {
  return { ...fila, id_usuario: Number(fila.id_usuario), gestionable: esGestionable(fila.rol) };
}
