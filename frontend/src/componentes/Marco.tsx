import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Rol } from '../api/tipos';
import { useSesion, useUsuario } from '../sesion/SesionContexto';

const MENU: Record<Rol, { a: string; texto: string; conSubrutas?: boolean }[]> = {
  recepcionista: [
    // Activo en Día, Semana y Mes
    { a: '/recepcion/agenda', texto: 'Agenda', conSubrutas: true },
    { a: '/recepcion/turnos/nuevo', texto: 'Nuevo turno' },
    { a: '/recepcion/pacientes', texto: 'Pacientes' },
    { a: '/recepcion/medicos', texto: 'Médicos' },
  ],
  medico: [{ a: '/medico/agenda', texto: 'Mi agenda' }],
  paciente: [{ a: '/paciente/turnos', texto: 'Mis turnos' }],
};

const NOMBRE_ROL: Record<Rol, string> = { recepcionista: 'Recepción', medico: 'Médico', paciente: 'Paciente' };

/** Encabezado con el menú del rol y el cierre de sesión, y el contenido de la pantalla. */
export function Marco() {
  const usuario = useUsuario();
  const { cerrarSesion } = useSesion();
  const navegar = useNavigate();
  const [cerrando, setCerrando] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const salir = async () => {
    setCerrando(true);
    await cerrarSesion();
    navegar('/login', { replace: true });
  };

  return (
    <div className="marco">
      <header className="encabezado">
        <div className="encabezado-fila">
          <span className="marca">MEDICONTROL</span>
          <button
            type="button"
            className="boton-menu"
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            onClick={() => setMenuAbierto((v) => !v)}
          >
            Menú
          </button>
        </div>
        <nav id="menu-principal" className={`menu ${menuAbierto ? 'menu-abierto' : ''}`} aria-label="Principal">
          {MENU[usuario.rol].map((item) => (
            <NavLink key={item.a} to={item.a} end={!item.conSubrutas} onClick={() => setMenuAbierto(false)}>
              {item.texto}
            </NavLink>
          ))}
          <span className="usuario" title={usuario.email}>
            {usuario.nombre} {usuario.apellido} · {NOMBRE_ROL[usuario.rol]}
          </span>
          <button type="button" className="boton boton-secundario" onClick={salir} disabled={cerrando}>
            {cerrando ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </nav>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
