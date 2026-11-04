import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Rol } from '../api/tipos';
import { Cargando } from '../componentes/Estados';
import { INICIO_POR_ROL, useSesion } from './SesionContexto';

/**
 * Solo deja pasar a usuarios con alguno de los roles indicados. Es una ayuda para la
 * navegación: el permiso real lo controla el backend en cada pedido.
 */
export function RutaProtegida({ roles }: { roles: Rol[] }) {
  const { sesion } = useSesion();
  const ubicacion = useLocation();

  if (sesion.estado === 'cargando') {
    return <Cargando texto="Verificando la sesión…" />;
  }
  if (sesion.estado === 'anonimo') {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  }
  if (!roles.includes(sesion.usuario.rol)) {
    return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  }

  return <Outlet />;
}
