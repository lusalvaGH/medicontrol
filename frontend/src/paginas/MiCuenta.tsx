import { useEffect, useId, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import { cuenta } from '../api/servicios';
import type { DatosCuenta } from '../api/tipos';
import { Cargando, MensajeError, mensajeDeError } from '../componentes/Estados';
import { FormContrasena } from '../componentes/FormContrasena';
import { useSesion, useUsuario } from '../sesion/SesionContexto';
import { hoyEnClinica } from '../utilidades/fechas';

const ROLES: Record<string, string> = { recepcionista: 'Recepción', medico: 'Médico', paciente: 'Paciente' };
const CAMPOS_PACIENTE = ['telefono', 'direccion', 'fecha_nacimiento', 'genero', 'obra_social'] as const;

/**
 * «Mi cuenta» (panel/mi_cuenta.php), para cualquier rol: los datos propios y el cambio de la
 * contraseña. Cada persona edita su nombre, apellido y correo (el correo pide la contraseña
 * actual); el paciente, además, su contacto y su perfil. El DNI, el rol, la especialidad y la
 * matrícula los gestiona recepción. Con una contraseña provisoria solo se puede cambiarla.
 */
export function MiCuenta() {
  const usuario = useUsuario();
  const { refrescar } = useSesion();
  const provisoria = usuario.debe_cambiar_contrasena;

  return (
    <section className="cuenta-contenido">
      <h1>Mi cuenta</h1>
      <p className="cuenta-subtitulo">
        {usuario.nombre} {usuario.apellido} · {ROLES[usuario.rol] ?? usuario.rol}
      </p>
      {provisoria && (
        <div className="aviso aviso-info" role="alert">
          Tu contraseña es provisoria. Elegí una contraseña nueva para seguir usando MediControl.
        </div>
      )}
      <FormContrasena email={usuario.email} alCambiar={() => void refrescar()} />
      {!provisoria && <DatosPropios alGuardar={() => void refrescar()} />}
    </section>
  );
}

function DatosPropios({ alGuardar }: { alGuardar: () => void }) {
  const idForm = useId();
  const [original, setOriginal] = useState<DatosCuenta | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campos = error instanceof ErrorApi ? error.campos : {};

  useEffect(() => {
    let vigente = true;
    cuenta
      .datos()
      .then((d) => {
        if (vigente) {
          setOriginal(d);
          setValores(aTexto(d));
        }
      })
      .catch((e: unknown) => vigente && setErrorCarga(e));

    return () => {
      vigente = false;
    };
  }, []);

  if (errorCarga !== null) {
    return <MensajeError error={errorCarga} />;
  }
  if (!original) {
    return <Cargando texto="Cargando tus datos…" />;
  }

  const esPaciente = original.rol === 'paciente';
  const cambiaCorreo = (valores.email ?? '').trim().toLowerCase() !== original.email.toLowerCase();
  const cambiar = (campo: string) => (e: { target: { value: string } }) => setValores((v) => ({ ...v, [campo]: e.target.value }));

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const { contrasena_actual, ...resto } = valores;
      const actualizados = await cuenta.actualizar(cambiaCorreo ? { ...resto, contrasena_actual: contrasena_actual ?? '' } : resto);
      setOriginal(actualizados);
      setValores(aTexto(actualizados));
      setAviso('Tus datos se guardaron correctamente.');
      alGuardar();
    } catch (e) {
      setError(e);
      setValores((v) => ({ ...v, contrasena_actual: '' }));
    } finally {
      setEnviando(false);
    }
  };

  const campo = (nombre: string, etiqueta: string, props: Record<string, unknown> = {}) => (
    <div className="campo-cfg">
      <label htmlFor={`${idForm}-${nombre}`}>{etiqueta}</label>
      <input
        id={`${idForm}-${nombre}`}
        name={nombre}
        value={valores[nombre] ?? ''}
        onChange={cambiar(nombre)}
        disabled={enviando}
        aria-invalid={campos[nombre] ? true : undefined}
        {...props}
      />
      {campos[nombre] && <span className="cfg-error">{campos[nombre]}</span>}
    </div>
  );

  return (
    <section className="tarjeta-seguridad tarjeta-datos" aria-labelledby={`${idForm}-titulo`}>
      <h2 id={`${idForm}-titulo`}>Mis datos</h2>
      <p className="tarjeta-ayuda">El DNI{original.rol === 'medico' ? ', la especialidad y la matrícula los' : ' lo'} actualiza recepción.</p>
      <form onSubmit={enviar} noValidate>
        {error !== null && (
          <div className="mensaje-contrasena es-error" role="alert">
            {mensajeDeError(error)}
          </div>
        )}
        {aviso && (
          <div className="mensaje-contrasena" role="status">
            {aviso}
          </div>
        )}
        {campo('nombre', 'Nombre', { maxLength: 80, autoComplete: 'given-name', required: true })}
        {campo('apellido', 'Apellido', { maxLength: 80, autoComplete: 'family-name', required: true })}
        <div className="campo-cfg">
          <label htmlFor={`${idForm}-dni`}>DNI</label>
          <input id={`${idForm}-dni`} value={original.dni} disabled readOnly />
        </div>
        {campo('email', 'Correo electrónico', { type: 'email', maxLength: 120, autoComplete: 'email', required: true })}
        {cambiaCorreo && campo('contrasena_actual', 'Contraseña actual (para cambiar el correo)', { type: 'password', autoComplete: 'current-password', required: true })}
        {original.rol === 'medico' && (
          <div className="campo-cfg">
            <label htmlFor={`${idForm}-especialidad`}>Especialidad</label>
            <input id={`${idForm}-especialidad`} value={[original.especialidad, original.matricula].filter(Boolean).join(' · ')} disabled readOnly />
          </div>
        )}
        {esPaciente && (
          <>
            {campo('telefono', 'Teléfono (opcional)', { type: 'tel', maxLength: 30, autoComplete: 'tel' })}
            {campo('direccion', 'Dirección (opcional)', { maxLength: 200, autoComplete: 'street-address' })}
            {campo('fecha_nacimiento', 'Fecha de nacimiento (opcional)', { type: 'date', min: '1900-01-01', max: hoyEnClinica() })}
            <div className="campo-cfg">
              <label htmlFor={`${idForm}-genero`}>Género (opcional)</label>
              <select id={`${idForm}-genero`} value={valores.genero ?? ''} onChange={cambiar('genero')} disabled={enviando} aria-invalid={campos.genero ? true : undefined}>
                <option value="">Prefiero no indicarlo</option>
                <option value="Femenino">Femenino</option>
                <option value="Masculino">Masculino</option>
                <option value="Otro">Otro</option>
              </select>
              {campos.genero && <span className="cfg-error">{campos.genero}</span>}
            </div>
            {campo('obra_social', 'Obra social (opcional)', { maxLength: 100 })}
          </>
        )}
        <button type="submit" className="boton-seguridad" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar datos'}
        </button>
      </form>
    </section>
  );
}

function aTexto(d: DatosCuenta): Record<string, string> {
  const valores: Record<string, string> = { nombre: d.nombre, apellido: d.apellido, email: d.email };
  if (d.rol === 'paciente') {
    for (const c of CAMPOS_PACIENTE) {
      valores[c] = d[c] ?? '';
    }
  }

  return valores;
}
