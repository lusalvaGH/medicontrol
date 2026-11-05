/**
 * Servicios por área. Cada función corresponde a una ruta existente del backend NestJS
 * (ver docs/migracion-nestjs.md); no hay rutas propias del frontend.
 */
import { ErrorApi, olvidarTokenCsrf, pedir } from './cliente';
import type {
  ConteoDia,
  EstadoTurno,
  Horario,
  ListadoUsuarios,
  MedicoCatalogo,
  PacienteCatalogo,
  Turno,
  TurnoAgendaMedico,
  TurnoPaciente,
  UsuarioGestion,
  UsuarioSesion,
} from './tipos';

const consulta = (parametros: Record<string, string | number | undefined>): string => {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== '') {
      p.set(clave, String(valor));
    }
  }
  const texto = p.toString();

  return texto ? `?${texto}` : '';
};

// ── Sesión ──────────────────────────────────────────────────────────────────

export const auth = {
  /** Usuario de la sesión actual, o null si no hay sesión. */
  async usuarioActual(): Promise<UsuarioSesion | null> {
    try {
      return (await pedir<{ usuario: UsuarioSesion }>('GET', '/auth/me', undefined, { sinAvisoDeSesion: true })).usuario;
    } catch (error) {
      if (error instanceof ErrorApi && error.estado === 401) {
        return null;
      }
      throw error;
    }
  },

  async iniciarSesion(email: string, contrasena: string): Promise<UsuarioSesion> {
    // El token sale de una sesión anónima; el login la reemplaza por una nueva con otro token
    olvidarTokenCsrf();
    try {
      return (await pedir<{ usuario: UsuarioSesion }>('POST', '/auth/login', { email, contrasena }, { antesDelLogin: true, sinAvisoDeSesion: true })).usuario;
    } finally {
      olvidarTokenCsrf();
    }
  },

  /**
   * Registro público de pacientes (POST /api/registro). Como el login, usa el token de la sesión
   * anónima. El backend lo renueva después de cada envío, así que se descarta siempre.
   */
  async registrarPaciente(datos: Record<string, string>): Promise<void> {
    olvidarTokenCsrf();
    try {
      await pedir('POST', '/registro', datos, { antesDelLogin: true, sinAvisoDeSesion: true });
    } finally {
      olvidarTokenCsrf();
    }
  },

  async cerrarSesion(): Promise<void> {
    try {
      await pedir('POST', '/auth/logout', undefined, { sinAvisoDeSesion: true });
    } finally {
      olvidarTokenCsrf();
    }
  },

  async cambiarContrasena(actual: string, nueva: string, confirmacion: string): Promise<void> {
    try {
      await pedir('POST', '/cuenta/contrasena', { contrasena_actual: actual, contrasena_nueva: nueva, contrasena_confirmacion: confirmacion });
    } finally {
      // Si el cambio salió bien, el backend renovó la sesión y su token
      olvidarTokenCsrf();
    }
  },
};

// ── Recepción: usuarios ─────────────────────────────────────────────────────

export interface FiltroUsuarios {
  tipo: 'pacientes' | 'personal';
  buscar?: string;
  estado?: 'todos' | 'activo' | 'inactivo';
  pagina?: number;
}

export const usuarios = {
  /** Pacientes y personal. Los pacientes no se crean desde recepción: se registran con auth.registrarPaciente. */
  listar: (filtro: FiltroUsuarios) => pedir<ListadoUsuarios>('GET', '/usuarios' + consulta({ ...filtro })),
  detalle: (id: number) => pedir<{ usuario: UsuarioGestion }>('GET', `/usuarios/${id}`),
  /** Alta de médico (Configuración). El backend rechaza los pacientes y los recepcionistas. */
  crearMedico: (datos: Record<string, string>) => pedir<{ usuario: UsuarioGestion }>('POST', '/usuarios', { ...datos, rol: 'medico' }),
  modificar: (id: number, datos: Record<string, string>) => pedir<{ usuario: UsuarioGestion }>('PATCH', `/usuarios/${id}`, datos),
  darDeBaja: (id: number) => pedir<{ usuario: UsuarioGestion }>('POST', `/usuarios/${id}/baja`),
  reactivar: (id: number) => pedir<{ usuario: UsuarioGestion }>('POST', `/usuarios/${id}/reactivacion`),
  contrasenaProvisoria: (id: number, contrasena: string, confirmacion: string) =>
    pedir<{ actualizada: true }>('POST', `/usuarios/${id}/contrasena-provisoria`, { contrasena, contrasena_confirmacion: confirmacion }),
};

// ── Recepción: turnos y catálogo ────────────────────────────────────────────

export const turnos = {
  delDia: (fecha: string) => pedir<{ fecha: string; turnos: Turno[] }>('GET', '/turnos' + consulta({ fecha })),
  /** Turnos entre dos fechas inclusive (hasta 42 días): la vista Semana. */
  delRango: (desde: string, hasta: string) => pedir<{ desde: string; hasta: string; turnos: Turno[] }>('GET', '/turnos' + consulta({ desde, hasta })),
  /** Cantidad por día y por estado: la vista Mes. Un mes sin turnos llega como [] (igual que PHP). */
  resumenMes: (mes: string) => pedir<{ mes: string; dias: Record<string, ConteoDia> | [] }>('GET', '/turnos/resumen' + consulta({ mes })),
  detalle: (id: number) => pedir<{ turno: Turno }>('GET', `/turnos/${id}`),
  crear: (datos: { id_paciente: number; id_medico: number; fecha: string; hora: string; motivo_consulta: string }) =>
    pedir<{ turno: Turno }>('POST', '/turnos', datos),
  modificar: (id: number, datos: { fecha: string; hora: string; estado: EstadoTurno }) =>
    pedir<{ turno: Turno; sin_cambios: boolean }>('PATCH', `/turnos/${id}`, datos),
  cancelar: (id: number) => pedir<{ turno: Turno }>('POST', `/turnos/${id}/cancelacion`),
};

export const catalogo = {
  medicos: () => pedir<{ medicos: MedicoCatalogo[] }>('GET', '/medicos'),
  pacientes: (buscar: string, limite = 20) => pedir<{ pacientes: PacienteCatalogo[] }>('GET', '/pacientes' + consulta({ buscar, limite })),
  disponibilidad: (idMedico: number, fecha: string) =>
    pedir<{ id_medico: number; fecha: string; horarios: Horario[] }>('GET', `/medicos/${idMedico}/disponibilidad` + consulta({ fecha })),
};

// ── Médico y paciente ───────────────────────────────────────────────────────

export const misTurnos = {
  agendaMedico: (fecha: string) => pedir<{ fecha: string; turnos: TurnoAgendaMedico[] }>('GET', '/medico/agenda' + consulta({ fecha })),
  delPaciente: () => pedir<{ turnos: TurnoPaciente[] }>('GET', '/paciente/turnos'),
};
