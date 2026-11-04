/**
 * Tipos de las respuestas de la API NestJS (backend/src). Reflejan el contrato actual:
 * {ok: true, data} o {ok: false, error: {codigo, mensaje, campos?}}.
 */

export type Rol = 'recepcionista' | 'medico' | 'paciente';

export interface UsuarioSesion {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
}

export interface ErrorRespuesta {
  codigo: string;
  mensaje: string;
  campos?: Record<string, string>;
}

export type EstadoTurno = 'pendiente' | 'confirmado' | 'en_curso' | 'atendido' | 'cancelado';

/** Turno tal como lo ve recepción (sin notas médicas). */
export interface Turno {
  id_turno: number;
  fecha: string;
  hora: string;
  estado: EstadoTurno;
  motivo_consulta: string;
  id_paciente: number;
  paciente: string;
  paciente_dni: string;
  obra_social: string | null;
  id_medico: number;
  medico: string;
  especialidad: string;
}

export interface TurnoAgendaMedico {
  id_turno: number;
  fecha: string;
  hora: string;
  estado: EstadoTurno;
  motivo_consulta: string;
  notas_medicas: string | null;
  paciente: string;
  paciente_dni: string;
  obra_social: string | null;
  telefono: string | null;
}

export interface TurnoPaciente {
  id_turno: number;
  fecha: string;
  hora: string;
  estado: EstadoTurno;
  motivo_consulta: string;
  medico_nombre: string;
  medico_apellido: string;
  medico_especialidad: string;
}

/** Un día del resumen mensual (GET /api/turnos/resumen). */
export type ConteoDia = Record<'total' | EstadoTurno, number>;

export interface Horario {
  hora: string;
  estado: 'libre' | 'ocupado' | 'pasado';
}

export interface MedicoCatalogo {
  id_medico: number;
  nombre: string;
  apellido: string;
  especialidad: string;
}

export interface PacienteCatalogo {
  id_paciente: number;
  nombre: string;
  apellido: string;
  dni: string;
  obra_social: string | null;
}

export interface UsuarioGestion {
  id_usuario: number;
  nombre: string;
  apellido: string;
  dni: string;
  email: string;
  rol: Rol;
  estado: 'activo' | 'inactivo';
  especialidad: string | null;
  matricula: string | null;
  obra_social: string | null;
  telefono: string | null;
  gestionable: boolean;
}

export interface ListadoUsuarios {
  usuarios: UsuarioGestion[];
  total: number;
  pagina: number;
  por_pagina: number;
  paginas: number;
  especialidades: string[];
}
