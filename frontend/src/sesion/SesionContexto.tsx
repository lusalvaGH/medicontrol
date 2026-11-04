import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { alVencerSesion } from '../api/cliente';
import { auth } from '../api/servicios';
import type { Rol, UsuarioSesion } from '../api/tipos';

export type EstadoSesion =
  | { estado: 'cargando' }
  | { estado: 'anonimo'; motivo?: 'vencida' | 'cerrada' }
  | { estado: 'autenticado'; usuario: UsuarioSesion };

interface ValorSesion {
  sesion: EstadoSesion;
  iniciarSesion: (email: string, contrasena: string) => Promise<UsuarioSesion>;
  cerrarSesion: () => Promise<void>;
}

const Contexto = createContext<ValorSesion | null>(null);

/** Pantalla de inicio de cada rol. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  recepcionista: '/recepcion/agenda/dia',
  medico: '/medico/agenda',
  paciente: '/paciente/turnos',
};

/**
 * Estado de la sesión. Al abrir la aplicación pregunta al backend quién es el usuario
 * (la cookie es HttpOnly: el frontend no la lee). Si cualquier pedido responde que la sesión
 * venció, vuelve al estado anónimo y la pantalla de login lo avisa.
 */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: 'cargando' });

  useEffect(() => {
    let vigente = true;
    auth
      .usuarioActual()
      .then((usuario) => vigente && setSesion(usuario ? { estado: 'autenticado', usuario } : { estado: 'anonimo' }))
      .catch(() => vigente && setSesion({ estado: 'anonimo' }));
    const baja = alVencerSesion(() => setSesion({ estado: 'anonimo', motivo: 'vencida' }));

    return () => {
      vigente = false;
      baja();
    };
  }, []);

  const iniciarSesion = useCallback(async (email: string, contrasena: string) => {
    const usuario = await auth.iniciarSesion(email, contrasena);
    setSesion({ estado: 'autenticado', usuario });

    return usuario;
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await auth.cerrarSesion();
    } finally {
      // Aunque el pedido falle (por ejemplo, sin conexión), la interfaz deja de mostrar datos
      setSesion({ estado: 'anonimo', motivo: 'cerrada' });
    }
  }, []);

  const valor = useMemo(() => ({ sesion, iniciarSesion, cerrarSesion }), [sesion, iniciarSesion, cerrarSesion]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error('useSesion se usa dentro de ProveedorSesion');
  }

  return valor;
}

/** Usuario autenticado; solo se usa dentro de rutas protegidas. */
export function useUsuario(): UsuarioSesion {
  const { sesion } = useSesion();
  if (sesion.estado !== 'autenticado') {
    throw new Error('useUsuario requiere una sesión iniciada');
  }

  return sesion.usuario;
}
