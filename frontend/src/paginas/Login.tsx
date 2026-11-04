import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Cargando, MensajeError } from '../componentes/Estados';
import { INICIO_POR_ROL, useSesion } from '../sesion/SesionContexto';

export function Login() {
  const { sesion, iniciarSesion } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const desde = (ubicacion.state as { desde?: string } | null)?.desde;

  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (sesion.estado === 'cargando') {
    return <Cargando texto="Verificando la sesión…" />;
  }
  if (sesion.estado === 'autenticado' && !enviando) {
    return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  }

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const usuario = await iniciarSesion(email, contrasena);
      // Solo se vuelve a la pantalla pedida si es del área de su rol
      const inicio = INICIO_POR_ROL[usuario.rol];
      const area = '/' + inicio.split('/')[1] + '/';
      const destino = desde && desde.startsWith(area) ? desde : inicio;
      navegar(destino, { replace: true });
    } catch (e) {
      setError(e);
      setContrasena('');
      setEnviando(false);
    }
  };

  return (
    <main className="pantalla-login">
      <form className="tarjeta formulario-login" onSubmit={enviar} noValidate>
        <h1 className="marca">MEDICONTROL</h1>
        <p className="subtitulo">Iniciá sesión para continuar</p>

        {sesion.estado === 'anonimo' && sesion.motivo === 'vencida' && (
          <div className="aviso aviso-info" role="status">
            Tu sesión venció o ya no es válida. Iniciá sesión nuevamente.
          </div>
        )}
        {error !== null && <MensajeError error={error} />}

        <label className="campo">
          <span>Correo electrónico</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
        </label>
        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
