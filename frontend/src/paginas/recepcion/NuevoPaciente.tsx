import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { usuarios } from '../../api/servicios';
import { Campo } from '../../componentes/Campo';
import { MensajeError } from '../../componentes/Estados';
import { hoyEnClinica } from '../../utilidades/fechas';

const VACIO = {
  nombre: '',
  apellido: '',
  dni: '',
  email: '',
  telefono: '',
  direccion: '',
  fecha_nacimiento: '',
  genero: '',
  obra_social: '',
  contrasena: '',
  contrasena_confirmacion: '',
};

/**
 * Alta de paciente por recepción (POST /api/usuarios con rol paciente). Las validaciones son
 * las del backend: el formulario muestra los mensajes de cada campo tal como llegan.
 */
export function NuevoPaciente() {
  const navegar = useNavigate();
  const [datos, setDatos] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const campos = error instanceof ErrorApi ? error.campos : {};

  const cambiar = (campo: keyof typeof VACIO) => (e: { target: { value: string } }) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const { usuario } = await usuarios.crear({ ...datos, rol: 'paciente' });
      navegar('/recepcion/pacientes', { state: { aviso: `Se registró a ${usuario.nombre} ${usuario.apellido} (DNI ${usuario.dni}).` } });
    } catch (e) {
      setError(e);
      setEnviando(false);
      window.scrollTo({ top: 0 });
    }
  };

  const texto = (campo: keyof typeof VACIO, etiqueta: string, props: Record<string, unknown> = {}) => (
    <Campo etiqueta={etiqueta} error={campos[campo]}>
      {(a11y) => <input {...a11y} value={datos[campo]} onChange={cambiar(campo)} {...props} />}
    </Campo>
  );

  return (
    <section>
      <h1>Nuevo paciente</h1>
      {error !== null && <MensajeError error={error} />}
      <form className="tarjeta" onSubmit={enviar} noValidate>
        <h2>Datos personales</h2>
        <div className="rejilla">
          {texto('nombre', 'Nombre', { autoComplete: 'off', required: true, maxLength: 80 })}
          {texto('apellido', 'Apellido', { autoComplete: 'off', required: true, maxLength: 80 })}
          {texto('dni', 'DNI', { inputMode: 'numeric', required: true, maxLength: 12 })}
          {texto('email', 'Correo electrónico', { type: 'email', autoComplete: 'off', required: true, maxLength: 120 })}
          {texto('telefono', 'Teléfono (opcional)', { type: 'tel', maxLength: 30 })}
          {texto('direccion', 'Dirección (opcional)', { maxLength: 200 })}
          {texto('fecha_nacimiento', 'Fecha de nacimiento (opcional)', { type: 'date', min: '1900-01-01', max: hoyEnClinica() })}
          <Campo etiqueta="Género (opcional)" error={campos.genero}>
            {(a11y) => (
              <select {...a11y} value={datos.genero} onChange={cambiar('genero')}>
                <option value="">Sin indicar</option>
                <option value="Femenino">Femenino</option>
                <option value="Masculino">Masculino</option>
                <option value="Otro">Otro</option>
              </select>
            )}
          </Campo>
          {texto('obra_social', 'Obra social (opcional, por defecto Particular)', { maxLength: 100 })}
        </div>

        <h2 style={{ marginTop: '1rem' }}>Contraseña provisoria</h2>
        <p className="secundario">Entre 8 y 72 caracteres, con letras y números. Comunicásela al paciente para su primer ingreso.</p>
        <div className="rejilla">
          {texto('contrasena', 'Contraseña', { type: 'password', autoComplete: 'new-password', required: true })}
          {texto('contrasena_confirmacion', 'Repetir contraseña', { type: 'password', autoComplete: 'new-password', required: true })}
        </div>

        <div className="fila" style={{ marginTop: '1rem' }}>
          <button type="submit" className="boton boton-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar paciente'}
          </button>
          <Link to="/recepcion/pacientes" className="boton boton-secundario">
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
