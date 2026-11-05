import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Marco } from './componentes/Marco';
import { Cargando } from './componentes/Estados';
import { Login } from './paginas/Login';
import { MiCuenta } from './paginas/MiCuenta';
import { NoEncontrada } from './paginas/NoEncontrada';
import { Registro } from './paginas/Registro';
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
          <Route path="/registro" element={<Registro />} />
          {rutasPorRol.map(({ rol, rutas }) => (
            <Route key={rol} element={<RutaProtegida roles={[rol]} />}>
              <Route element={<Marco />}>
                {rutas.map((r) => (
                  <Route key={r.ruta} path={r.ruta} element={r.elemento} />
                ))}
              </Route>
            </Route>
          ))}
          {/* Mi cuenta (panel/mi_cuenta.php): la misma pantalla para los tres roles */}
          <Route element={<RutaProtegida roles={['recepcionista', 'medico', 'paciente']} />}>
            <Route element={<Marco />}>
              <Route path="/mi-cuenta" element={<MiCuenta />} />
            </Route>
          </Route>
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  );
}
