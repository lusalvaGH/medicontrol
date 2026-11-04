import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Marco } from './componentes/Marco';
import { Cargando } from './componentes/Estados';
import { Login } from './paginas/Login';
import { NoEncontrada } from './paginas/NoEncontrada';
import { RutaProtegida } from './sesion/RutaProtegida';
import { INICIO_POR_ROL, ProveedorSesion, useSesion } from './sesion/SesionContexto';
import { rutasPorRol } from './rutas';

/** "/" lleva al inicio del rol, o al login si no hay sesión. */
function Inicio() {
  const { sesion } = useSesion();
  if (sesion.estado === 'cargando') {
    return <Cargando texto="Verificando la sesión…" />;
  }

  return <Navigate to={sesion.estado === 'autenticado' ? INICIO_POR_ROL[sesion.usuario.rol] : '/login'} replace />;
}

export function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/login" element={<Login />} />
          {rutasPorRol.map(({ rol, rutas }) => (
            <Route key={rol} element={<RutaProtegida roles={[rol]} />}>
              <Route element={<Marco />}>
                {rutas.map((r) => (
                  <Route key={r.ruta} path={r.ruta} element={r.elemento} />
                ))}
              </Route>
            </Route>
          ))}
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  );
}
