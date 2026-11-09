import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { usuarios } from '../../api/servicios';
import type { UsuarioGestion } from '../../api/tipos';
import { Ventana } from '../../calendario/Ventana';
import { mensajeDeError } from '../../componentes/Estados';
import { FormContrasena } from '../../componentes/FormContrasena';
import { useUsuario } from '../../sesion/SesionContexto';
import { hoyEnClinica } from '../../utilidades/fechas';
import { useDatos } from '../../utilidades/useDatos';

/**
 * «Configuración del Sistema» de recepción (panel/recepcionista_configuracion.php y configuracion.js):
 * cambio de la contraseña propia, gestión de médicos y pacientes, y la tabla de roles y permisos.
 * Los permisos reales los controla el backend en cada pedido (Roles('recepcionista') y «gestionable»).
 * Diferencia con PHP: no hay «Agregar paciente», porque los pacientes crean su cuenta en el registro público.
 */

type Tipo = 'personal' | 'pacientes';
type Aviso = { texto: string; error: boolean } | null;
type Dialogo =
  | { tipo: 'usuario'; modo: 'alta' }
  | { tipo: 'usuario'; modo: 'edicion' | 'consulta'; usuario: UsuarioGestion }
  | { tipo: 'provisoria'; usuario: UsuarioGestion }
  | { tipo: 'estado'; usuario: UsuarioGestion; accion: 'baja' | 'reactivacion' }
  | null;

const ROLES: Record<string, string> = { medico: 'Médico', recepcionista: 'Recepcionista', paciente: 'Paciente' };
const nombreCompleto = (u: Pick<UsuarioGestion, 'nombre' | 'apellido'>) => `${u.nombre} ${u.apellido}`.trim();

const ICONOS: Record<'ver' | 'editar' | 'clave' | 'baja' | 'reactivar', ReactNode> = {
  ver: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  editar: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  clave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9" />
      <path d="M16 7l3 3" />
    </>
  ),
  baja: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </>
  ),
  reactivar: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
};

function BotonIcono({ icono, titulo, alHacerClic, peligro = false }: { icono: keyof typeof ICONOS; titulo: string; alHacerClic: () => void; peligro?: boolean }) {
  return (
    <button type="button" className={`cfg-icono ${peligro ? 'peligro' : ''}`} title={titulo} aria-label={titulo} onClick={alHacerClic}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ICONOS[icono]}
      </svg>
    </button>
  );
}

export function Configuracion() {
  const usuario = useUsuario();
  const [parametros, setParametros] = useSearchParams();
  const tipo: Tipo = parametros.get('tipo') === 'pacientes' ? 'pacientes' : 'personal';
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'activo' | 'inactivo'>('todos');
  const [pagina, setPagina] = useState(1);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const listado = useDatos(() => usuarios.listar({ tipo, buscar: consulta, estado: filtro, pagina }), [tipo, consulta, filtro, pagina]);
  const datos = listado.cargando ? null : listado.datos;

  // Búsqueda mientras se escribe, con una pausa de 300 ms como en PHP
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setConsulta(buscar.trim());
      setPagina(1);
    }, 300);

    return () => clearTimeout(temporizador);
  }, [buscar]);

  // Si la página quedó vacía (por ejemplo, después de una baja con filtro), se va a la última
  useEffect(() => {
    if (datos && datos.usuarios.length === 0 && datos.total > 0 && pagina > 1) {
      setPagina(datos.paginas);
    }
  }, [datos, pagina]);

  const elegirTipo = (nuevo: Tipo) => {
    setParametros(nuevo === 'pacientes' ? { tipo: 'pacientes' } : {}, { replace: true });
    setPagina(1);
    setAviso(null);
  };

  const abrirUsuario = async (u: UsuarioGestion, editable: boolean) => {
    try {
      const { usuario: detalle } = await usuarios.detalle(u.id_usuario);
      setDialogo({ tipo: 'usuario', modo: editable ? 'edicion' : 'consulta', usuario: detalle });
    } catch (e) {
      setAviso({ texto: mensajeDeError(e), error: true });
    }
  };

  const terminar = (texto: string, recargar = true) => {
    setDialogo(null);
    setAviso({ texto, error: false });
    if (recargar) {
      listado.recargar();
    }
  };

  const esPersonal = tipo === 'personal';
  const paginas = datos ? numerosDePagina(datos.pagina, datos.paginas) : [];

  return (
    <div className="cfg-contenido">
      <h1>Configuración del Sistema</h1>
      <p className="cfg-subtitulo">Administrá la seguridad de tu cuenta y los perfiles de los usuarios del centro médico.</p>

      <div className="cfg-grilla">
        <div>
          <FormContrasena email={usuario.email} />
        </div>

        <section className="cfg-tarjeta" aria-labelledby="titulo-usuarios">
          <div className="cfg-usuarios-cabecera">
            <div>
              <h2 id="titulo-usuarios">{esPersonal ? 'Gestión de Usuarios y Médicos' : 'Gestión de Pacientes'}</h2>
              <p>{esPersonal ? 'Perfiles activos e inactivos' : 'Los pacientes crean su cuenta desde la pantalla de registro'}</p>
            </div>
            {esPersonal && (
              <button type="button" className="cfg-boton" onClick={() => setDialogo({ tipo: 'usuario', modo: 'alta' })}>
                Agregar médico
              </button>
            )}
          </div>

          <div className="cfg-filtros">
            <div className="cfg-pestanas" role="tablist" aria-label="Tipo de usuario">
              <button type="button" role="tab" aria-selected={esPersonal} onClick={() => elegirTipo('personal')}>
                Personal
              </button>
              <button type="button" role="tab" aria-selected={!esPersonal} onClick={() => elegirTipo('pacientes')}>
                Pacientes
              </button>
            </div>
            <label className="cfg-buscar">
              <span className="cfg-oculto">Buscar en el listado</span>
              <input
                type="search"
                placeholder="Buscar por nombre, DNI, correo o especialidad..."
                maxLength={80}
                autoComplete="off"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </label>
            <label className="cfg-filtro-estado">
              <span>Estado</span>
              <select
                value={filtro}
                onChange={(e) => {
                  setFiltro(e.target.value as typeof filtro);
                  setPagina(1);
                }}
              >
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </label>
          </div>

          {aviso && (
            <div className={`cfg-aviso ${aviso.error ? 'es-error' : ''}`} role="status" aria-live="polite">
              {aviso.texto}
            </div>
          )}

          <div className="cfg-tabla-marco">
            <table className="cfg-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>{esPersonal ? 'Especialidad' : 'Obra social'}</th>
                  <th>Estado</th>
                  <th className="cfg-derecha">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!datos && (
                  <tr>
                    <td colSpan={5} className="cfg-vacio">
                      {listado.error !== null ? mensajeDeError(listado.error) : 'Cargando...'}
                    </td>
                  </tr>
                )}
                {datos && datos.usuarios.length === 0 && (
                  <tr>
                    <td colSpan={5} className="cfg-vacio">
                      No hay usuarios para mostrar.
                    </td>
                  </tr>
                )}
                {datos?.usuarios.map((u) => (
                  <tr key={u.id_usuario}>
                    <td className="cfg-celda-persona">
                      <div className="cfg-persona">
                        <span className="cfg-iniciales" aria-hidden="true">
                          {(u.nombre.charAt(0) + u.apellido.charAt(0)).toUpperCase()}
                        </span>
                        <div>
                          <strong>
                            {u.rol === 'medico' ? 'Dr/a. ' : ''}
                            {nombreCompleto(u)}
                          </strong>
                          <small>
                            DNI {u.dni} · {u.email}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td data-etiqueta="Rol">{ROLES[u.rol] ?? u.rol}</td>
                    <td data-etiqueta={esPersonal ? 'Especialidad' : 'Obra social'}>{(esPersonal ? u.especialidad : u.obra_social) || '—'}</td>
                    <td data-etiqueta="Estado">
                      <span className={`cfg-estado ${u.estado}`}>{u.estado === 'activo' ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td>
                      <div className="cfg-acciones">
                        {u.gestionable ? (
                          <>
                            <BotonIcono icono="editar" titulo={`Editar a ${nombreCompleto(u)}`} alHacerClic={() => abrirUsuario(u, true)} />
                            <BotonIcono
                              icono="clave"
                              titulo={`Asignar contraseña provisoria a ${nombreCompleto(u)}`}
                              alHacerClic={() => setDialogo({ tipo: 'provisoria', usuario: u })}
                            />
                            {u.estado === 'activo' ? (
                              <BotonIcono
                                icono="baja"
                                titulo={`Dar de baja a ${nombreCompleto(u)}`}
                                peligro
                                alHacerClic={() => setDialogo({ tipo: 'estado', usuario: u, accion: 'baja' })}
                              />
                            ) : (
                              <BotonIcono
                                icono="reactivar"
                                titulo={`Reactivar a ${nombreCompleto(u)}`}
                                alHacerClic={() => setDialogo({ tipo: 'estado', usuario: u, accion: 'reactivacion' })}
                              />
                            )}
                          </>
                        ) : (
                          <BotonIcono icono="ver" titulo={`Ver datos de ${nombreCompleto(u)}`} alHacerClic={() => abrirUsuario(u, false)} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {datos && (
            <div className="cfg-paginacion">
              <p aria-live="polite">
                Mostrando {datos.usuarios.length} de {datos.total} {datos.total === 1 ? 'usuario' : 'usuarios'}
              </p>
              <nav aria-label="Paginación">
                <button type="button" disabled={datos.pagina <= 1} onClick={() => setPagina(datos.pagina - 1)}>
                  Anterior
                </button>
                {paginas.map((n) => (
                  <button key={n} type="button" aria-current={n === datos.pagina ? 'page' : undefined} onClick={() => setPagina(n)}>
                    {n}
                  </button>
                ))}
                <button type="button" disabled={datos.pagina >= datos.paginas} onClick={() => setPagina(datos.pagina + 1)}>
                  Siguiente
                </button>
              </nav>
            </div>
          )}
        </section>

        <section className="cfg-tarjeta cfg-permisos" aria-labelledby="titulo-permisos">
          <h2 id="titulo-permisos">Roles y permisos</h2>
          <p className="cfg-ayuda">Información de solo lectura. Los roles de los usuarios no se pueden cambiar.</p>
          <div className="cfg-tabla-marco">
            <table className="cfg-tabla cfg-tabla-permisos">
              <thead>
                <tr>
                  <th>Quién</th>
                  <th>Sobre</th>
                  <th>Permiso</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Recepción', 'Pacientes', 'Consultar, modificar, dar de baja y reactivar (los pacientes crean su cuenta desde el registro)'],
                  ['Recepción', 'Médicos', 'Consultar, crear, modificar, dar de baja y reactivar'],
                  ['Recepción', 'Otros recepcionistas', 'Solo consultar'],
                  ['Todos los usuarios', 'Su propia cuenta', 'Cambiar su contraseña y editar su nombre y correo (el paciente, también su contacto)'],
                ].map(([quien, sobre, permiso]) => (
                  <tr key={quien + sobre}>
                    <td data-etiqueta="Quién">{quien}</td>
                    <td data-etiqueta="Sobre">{sobre}</td>
                    <td data-etiqueta="Permiso">{permiso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {dialogo?.tipo === 'usuario' && (
        <DialogoUsuario
          dialogo={dialogo}
          especialidades={datos?.especialidades ?? listado.datos?.especialidades ?? []}
          alCerrar={() => setDialogo(null)}
          alGuardar={(texto) => terminar(texto)}
        />
      )}
      {dialogo?.tipo === 'provisoria' && (
        <DialogoProvisoria usuario={dialogo.usuario} alCerrar={() => setDialogo(null)} alGuardar={() => terminar('La contraseña provisoria se asignó correctamente.', false)} />
      )}
      {dialogo?.tipo === 'estado' && (
        <DialogoEstado
          usuario={dialogo.usuario}
          accion={dialogo.accion}
          alCerrar={() => setDialogo(null)}
          alGuardar={() => terminar(dialogo.accion === 'baja' ? 'El usuario se dio de baja.' : 'El usuario se reactivó.')}
        />
      )}
    </div>
  );
}

/** Hasta cinco números de página alrededor de la actual, como dibujarPaginacion() de PHP. */
function numerosDePagina(actual: number, total: number): number[] {
  const desde = Math.max(1, Math.min(actual - 2, total - 4));
  const hasta = Math.min(total, desde + 4);

  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

// ── Diálogos ────────────────────────────────────────────────────────────────

const CAMPOS_COMUNES = ['nombre', 'apellido', 'dni', 'email'] as const;
const CAMPOS_MEDICO = ['especialidad', 'matricula'] as const;
const CAMPOS_PACIENTE = ['telefono', 'obra_social', 'direccion', 'fecha_nacimiento', 'genero'] as const;
const CAMPOS_ALTA = ['contrasena', 'contrasena_confirmacion'] as const;

interface PropsCampo {
  nombre: string;
  etiqueta: string;
  valor: string;
  error?: string;
  deshabilitado: boolean;
  alCambiar: (valor: string) => void;
  ancho?: boolean;
  props?: Record<string, unknown>;
  children?: (a11y: Record<string, unknown>) => ReactNode;
}

function CampoCfg({ nombre, etiqueta, valor, error, deshabilitado, alCambiar, ancho = false, props = {}, children }: PropsCampo) {
  const id = useId();
  const a11y = {
    id,
    name: nombre,
    value: valor,
    disabled: deshabilitado,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    onChange: (e: { target: { value: string } }) => alCambiar(e.target.value),
  };

  return (
    <div className={`campo-cfg ${ancho ? 'cfg-campo-ancho' : ''}`}>
      <label htmlFor={id}>{etiqueta}</label>
      {children ? children(a11y) : <input {...a11y} autoComplete="off" {...props} />}
      {error && (
        <span id={`${id}-error`} className="cfg-error">
          {error}
        </span>
      )}
    </div>
  );
}

function DialogoUsuario({
  dialogo,
  especialidades,
  alCerrar,
  alGuardar,
}: {
  dialogo: Extract<Dialogo, { tipo: 'usuario' }>;
  especialidades: string[];
  alCerrar: () => void;
  alGuardar: (texto: string) => void;
}) {
  const idForm = useId();
  const idLista = useId();
  const existente = dialogo.modo === 'alta' ? null : dialogo.usuario;
  const rol = existente ? existente.rol : 'medico';
  const soloLectura = dialogo.modo === 'consulta';
  const campos = [
    ...CAMPOS_COMUNES,
    ...(rol === 'medico' ? CAMPOS_MEDICO : []),
    ...(rol === 'paciente' ? CAMPOS_PACIENTE : []),
    ...(dialogo.modo === 'alta' ? CAMPOS_ALTA : []),
  ];
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((c) => [c, existente ? String((existente as unknown as Record<string, unknown>)[c] ?? '') : ''])),
  );
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const errores = error instanceof ErrorApi ? error.campos : {};

  const titulo =
    dialogo.modo === 'alta' ? 'Agregar médico' : `${dialogo.modo === 'edicion' ? 'Editar a ' : 'Datos de '}${nombreCompleto(dialogo.usuario)} (${ROLES[rol] ?? rol})`;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      if (existente) {
        await usuarios.modificar(existente.id_usuario, valores);
        alGuardar('Los datos se guardaron correctamente.');
      } else {
        await usuarios.crearMedico(valores);
        alGuardar('El médico se registró correctamente.');
      }
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  };

  const campo = (nombre: string, etiqueta: string, extra: Partial<PropsCampo> = {}) => (
    <CampoCfg
      nombre={nombre}
      etiqueta={etiqueta}
      valor={valores[nombre] ?? ''}
      error={errores[nombre]}
      deshabilitado={soloLectura || enviando}
      alCambiar={(v) => setValores((d) => ({ ...d, [nombre]: v }))}
      {...extra}
    />
  );

  return (
    <Ventana
      titulo={titulo}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="cfg-boton cfg-boton-secundario" onClick={alCerrar}>
            Cerrar
          </button>
          {!soloLectura && (
            <button type="submit" form={idForm} className="cfg-boton" disabled={enviando}>
              Guardar
            </button>
          )}
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} noValidate>
        {error !== null && (
          <div className="cfg-aviso es-error" role="alert">
            {mensajeDeError(error)}
          </div>
        )}
        <div className="cfg-campos">
          {campo('nombre', 'Nombre', { props: { maxLength: 80, required: true } })}
          {campo('apellido', 'Apellido', { props: { maxLength: 80, required: true } })}
          {campo('dni', 'DNI', { props: { maxLength: 20, inputMode: 'numeric', required: true } })}
          {campo('email', 'Correo electrónico', { props: { type: 'email', maxLength: 120, required: true } })}

          {rol === 'medico' && (
            <>
              {campo('especialidad', 'Especialidad', { props: { maxLength: 100, list: idLista } })}
              <datalist id={idLista}>
                {especialidades.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
              {campo('matricula', 'Matrícula (opcional)', { props: { maxLength: 50 } })}
            </>
          )}

          {rol === 'paciente' && (
            <>
              {campo('telefono', 'Teléfono (opcional)', { props: { maxLength: 30, inputMode: 'tel' } })}
              {campo('obra_social', 'Obra social (opcional)', { props: { maxLength: 100 } })}
              {campo('direccion', 'Dirección (opcional)', { ancho: true, props: { maxLength: 200 } })}
              {campo('fecha_nacimiento', 'Fecha de nacimiento (opcional)', { props: { type: 'date', min: '1900-01-01', max: hoyEnClinica() } })}
              {campo('genero', 'Género (opcional)', {
                children: (a11y) => (
                  <select {...a11y}>
                    <option value="">Sin indicar</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro">Otro</option>
                  </select>
                ),
              })}
            </>
          )}

          {dialogo.modo === 'alta' && (
            <>
              {campo('contrasena', 'Contraseña provisoria', { props: { type: 'password', autoComplete: 'new-password' } })}
              {campo('contrasena_confirmacion', 'Repetir contraseña', { props: { type: 'password', autoComplete: 'new-password' } })}
            </>
          )}
        </div>
      </form>
    </Ventana>
  );
}

function DialogoProvisoria({ usuario, alCerrar, alGuardar }: { usuario: UsuarioGestion; alCerrar: () => void; alGuardar: () => void }) {
  const idForm = useId();
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const errores = error instanceof ErrorApi ? error.campos : {};

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await usuarios.contrasenaProvisoria(usuario.id_usuario, contrasena, confirmacion);
      alGuardar();
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  };

  return (
    <Ventana
      titulo="Contraseña provisoria"
      angosta
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="cfg-boton cfg-boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" form={idForm} className="cfg-boton" disabled={enviando}>
            Asignar
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} noValidate>
        <p className="cfg-ayuda cfg-ayuda-dialogo">
          Para {nombreCompleto(usuario)}. Se cerrarán sus sesiones abiertas: deberá entrar con esta contraseña y elegir una propia antes de usar el sistema. Mínimo 8 caracteres, con letras y números.
        </p>
        {error !== null && (
          <div className="cfg-aviso es-error" role="alert">
            {mensajeDeError(error)}
          </div>
        )}
        <CampoCfg
          nombre="contrasena"
          etiqueta="Contraseña provisoria"
          valor={contrasena}
          error={errores.contrasena}
          deshabilitado={enviando}
          alCambiar={setContrasena}
          props={{ type: 'password', autoComplete: 'new-password' }}
        />
        <CampoCfg
          nombre="contrasena_confirmacion"
          etiqueta="Repetir contraseña"
          valor={confirmacion}
          error={errores.contrasena_confirmacion}
          deshabilitado={enviando}
          alCambiar={setConfirmacion}
          props={{ type: 'password', autoComplete: 'new-password' }}
        />
      </form>
    </Ventana>
  );
}

function DialogoEstado({ usuario, accion, alCerrar, alGuardar }: { usuario: UsuarioGestion; accion: 'baja' | 'reactivacion'; alCerrar: () => void; alGuardar: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const esBaja = accion === 'baja';

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await (esBaja ? usuarios.darDeBaja(usuario.id_usuario) : usuarios.reactivar(usuario.id_usuario));
      alGuardar();
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  };

  return (
    <Ventana
      titulo={esBaja ? 'Dar de baja' : 'Reactivar'}
      angosta
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="cfg-boton cfg-boton-secundario" onClick={alCerrar}>
            Volver
          </button>
          <button type="button" className={`cfg-boton ${esBaja ? 'cfg-boton-peligro' : ''}`} disabled={enviando} onClick={confirmar}>
            {esBaja ? 'Dar de baja' : 'Reactivar'}
          </button>
        </>
      }
    >
      <p>
        {esBaja
          ? `¿Dar de baja a ${nombreCompleto(usuario)}? No podrá iniciar sesión, pero sus datos y su historial de turnos se conservan.`
          : `¿Reactivar a ${nombreCompleto(usuario)}? Volverá a poder iniciar sesión.`}
      </p>
      {error !== null && (
        <div className="cfg-aviso es-error" role="alert">
          {mensajeDeError(error)}
        </div>
      )}
    </Ventana>
  );
}
