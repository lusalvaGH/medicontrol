import { useRef, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import { auth } from '../api/servicios';
import { mensajeDeError } from './Estados';

/**
 * Bloque «Gestión de Seguridad» (includes/form_contrasena.php y contrasena.js): cambio de la
 * contraseña propia con POST /api/cuenta/contrasena. Las validaciones de acá solo evitan un envío
 * inútil; las reales (largo, letras y números, distinta de la actual, límite de intentos) son del backend.
 */
export function FormContrasena({ email, alCambiar }: { email: string; alCambiar?: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoActual = useRef<HTMLInputElement>(null);
  const campoConfirmacion = useRef<HTMLInputElement>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (actual === '' || nueva === '' || confirmacion === '') {
      setMensaje({ texto: 'Completá todos los campos.', error: true });
      return;
    }
    if (nueva !== confirmacion) {
      setMensaje({ texto: 'Las contraseñas no coinciden.', error: true });
      campoConfirmacion.current?.focus();
      return;
    }

    setEnviando(true);
    try {
      await auth.cambiarContrasena(actual, nueva, confirmacion);
      setActual('');
      setNueva('');
      setConfirmacion('');
      setMensaje({ texto: 'Tu contraseña se actualizó correctamente.', error: false });
      alCambiar?.();
    } catch (e) {
      setMensaje({ texto: e instanceof ErrorApi ? e.message : mensajeDeError(e), error: true });
      if (e instanceof ErrorApi && e.codigo === 'CONTRASENA_ACTUAL_INCORRECTA') {
        setActual('');
        campoActual.current?.focus();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="tarjeta-seguridad" aria-labelledby="titulo-seguridad">
      <h2 id="titulo-seguridad">Gestión de Seguridad</h2>
      <p className="tarjeta-ayuda">Mínimo 8 caracteres, con letras y números.</p>

      <form onSubmit={enviar} autoComplete="on" noValidate>
        {/* Permite a los gestores de contraseñas asociar el cambio con la cuenta */}
        <input type="text" name="usuario" value={email} autoComplete="username" readOnly hidden />

        <div className="campo-cfg">
          <label htmlFor="contrasena-actual">Contraseña actual</label>
          <input
            ref={campoActual}
            id="contrasena-actual"
            type="password"
            autoComplete="current-password"
            required
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </div>
        <div className="campo-cfg">
          <label htmlFor="contrasena-nueva">Nueva contraseña</label>
          <input id="contrasena-nueva" type="password" autoComplete="new-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>
        <div className="campo-cfg">
          <label htmlFor="contrasena-confirmacion">Confirmar nueva contraseña</label>
          <input
            ref={campoConfirmacion}
            id="contrasena-confirmacion"
            type="password"
            autoComplete="new-password"
            required
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
          />
        </div>

        {mensaje && (
          <div className={`mensaje-contrasena ${mensaje.error ? 'es-error' : ''}`} role="status" aria-live="polite">
            {mensaje.texto}
          </div>
        )}
        <button type="submit" className="boton-seguridad" disabled={enviando}>
          Actualizar contraseña
        </button>
      </form>
    </section>
  );
}
