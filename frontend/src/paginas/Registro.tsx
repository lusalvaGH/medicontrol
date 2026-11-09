import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { auth } from '../api/servicios';
import { Campo } from '../componentes/Campo';
import { Cargando, MensajeError } from '../componentes/Estados';
import { INICIO_POR_ROL, useSesion } from '../sesion/SesionContexto';
import { MENSAJE_DNI, dniValido } from '../utilidades/dni';
import { hoyEnClinica } from '../utilidades/fechas';

/** Mismos valores que GENEROS en el backend (y ValidadorPersonas::GENEROS en PHP). */
const GENEROS = ['Femenino', 'Masculino', 'Otro'];
const CONTRASENA_MINIMA = 8;
const CONTRASENA_MAXIMA = 72;

const VACIO = {
  nombre: '',
  apellido: '',
  dni: '',
  fecha_nacimiento: '',
  genero: '',
  obra_social: '',
  email: '',
  telefono: '',
  direccion: '',
  contrasena: '',
  contrasena_confirmacion: '',
};
type CampoRegistro = keyof typeof VACIO;

/**
 * Registro público de pacientes: la pantalla register.php de la versión PHP, con sus campos,
 * secciones y textos. El navegador hace una validación básica y el backend vuelve a validar todo.
 * No hay forma de elegir el rol: el backend crea siempre una cuenta de paciente.
 */
export function Registro() {
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const formulario = useRef<HTMLFormElement>(null);
  const confirmacion = useRef<HTMLInputElement>(null);
  const campoDni = useRef<HTMLInputElement>(null);
  const [datos, setDatos] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const campos = error instanceof ErrorApi ? error.campos : {};

  if (sesion.estado === 'cargando') {
    return <Cargando texto="Verificando la sesión…" />;
  }
  // Como en PHP: con una sesión válida no tiene sentido registrarse, va a su panel
  if (sesion.estado === 'autenticado') {
    return <Navigate to={INICIO_POR_ROL[sesion.usuario.rol]} replace />;
  }

  const cambiar = (campo: CampoRegistro) => (e: { target: { value: string } }) => {
    if (campo === 'contrasena_confirmacion') {
      confirmacion.current?.setCustomValidity('');
    }
    if (campo === 'dni') {
      campoDni.current?.setCustomValidity('');
    }
    setDatos((d) => ({ ...d, [campo]: e.target.value }));
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const form = formulario.current;
    confirmacion.current?.setCustomValidity(datos.contrasena === datos.contrasena_confirmacion ? '' : 'Las contraseñas no coinciden.');
    // Misma regla que el backend: sin puntos, espacios ni guiones, 7 u 8 dígitos
    campoDni.current?.setCustomValidity(datos.dni.trim() === '' || dniValido(datos.dni) ? '' : MENSAJE_DNI);
    if (form && !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      await auth.registrarPaciente(datos);
      navegar('/login', { replace: true, state: { registrado: true } });
    } catch (e) {
      setError(e);
      setDatos((d) => ({ ...d, contrasena: '', contrasena_confirmacion: '' }));
      setEnviando(false);
      window.scrollTo({ top: 0 });
    }
  };

  const texto = (campo: CampoRegistro, etiqueta: ReactNode, props: Record<string, unknown> = {}) => (
    <Campo etiqueta={etiqueta} error={campos[campo]}>
      {(a11y) => <input {...a11y} name={campo} className="input-registro" value={datos[campo]} onChange={cambiar(campo)} {...props} />}
    </Campo>
  );
  const opcional = (etiqueta: string) => (
    <>
      {etiqueta} <span className="opcional">(opcional)</span>
    </>
  );

  return (
    <main className="pantalla-registro">
      <div className="tarjeta-registro">
        <div className="encabezado-registro">
          <div className="icono-registro" aria-hidden="true">
            +
          </div>
          <h1>Crear cuenta de paciente</h1>
          <p className="subtitulo">Registrate para consultar tus turnos en MediControl</p>
        </div>

        {error !== null && <MensajeError error={error} />}

        <form ref={formulario} onSubmit={enviar} noValidate>
          <h2 className="seccion-registro">Datos personales</h2>
          <div className="rejilla-registro">
            {texto('nombre', 'Nombre', { maxLength: 80, autoComplete: 'given-name', required: true })}
            {texto('apellido', 'Apellido', { maxLength: 80, autoComplete: 'family-name', required: true })}
          </div>
          <div className="rejilla-registro">
            {texto('dni', 'DNI', { ref: campoDni, inputMode: 'numeric', maxLength: 12, placeholder: 'Ej. 38.123.456', required: true })}
            {texto('fecha_nacimiento', opcional('Fecha de nacimiento'), { type: 'date', min: '1900-01-01', max: hoyEnClinica() })}
          </div>
          <div className="rejilla-registro">
            <Campo etiqueta={opcional('Género')} error={campos.genero}>
              {(a11y) => (
                <select {...a11y} name="genero" className="input-registro" value={datos.genero} onChange={cambiar('genero')}>
                  <option value="">Prefiero no indicarlo</option>
                  {GENEROS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            {texto('obra_social', opcional('Obra social'), { maxLength: 100, placeholder: 'Ej. OSDE, IAPOS, Particular' })}
          </div>

          <h2 className="seccion-registro">Contacto</h2>
          <div className="rejilla-registro">
            {texto('email', 'Correo electrónico', { type: 'email', maxLength: 120, autoComplete: 'email', required: true })}
            {texto('telefono', opcional('Teléfono'), { type: 'tel', maxLength: 30, autoComplete: 'tel', placeholder: 'Ej. +54 342 456-7890' })}
          </div>
          {texto('direccion', opcional('Dirección'), { maxLength: 200, autoComplete: 'street-address' })}

          <h2 className="seccion-registro">Contraseña</h2>
          <div className="rejilla-registro">
            <div>
              {texto('contrasena', 'Contraseña', {
                type: 'password',
                minLength: CONTRASENA_MINIMA,
                maxLength: CONTRASENA_MAXIMA,
                autoComplete: 'new-password',
                required: true,
              })}
              {!campos.contrasena && <p className="ayuda-registro">Mínimo {CONTRASENA_MINIMA} caracteres, con letras y números.</p>}
            </div>
            <Campo etiqueta="Repetir contraseña" error={campos.contrasena_confirmacion}>
              {(a11y) => (
                <input
                  {...a11y}
                  ref={confirmacion}
                  name="contrasena_confirmacion"
                  className="input-registro"
                  type="password"
                  maxLength={CONTRASENA_MAXIMA}
                  autoComplete="new-password"
                  required
                  value={datos.contrasena_confirmacion}
                  onChange={cambiar('contrasena_confirmacion')}
                />
              )}
            </Campo>
          </div>

          <button type="submit" className="boton boton-primario boton-registro" disabled={enviando}>
            {enviando ? 'Creando cuenta…' : 'Crear cuenta →'}
          </button>
          <p className="aviso-rol">Este registro es solo para pacientes. Las cuentas de médicos y del personal de recepción las crea la institución.</p>
        </form>

        <p className="enlace-cambio">
          ¿Ya tenés una cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}
