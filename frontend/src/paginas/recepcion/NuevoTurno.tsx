import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { catalogo, turnos } from '../../api/servicios';
import type { PacienteCatalogo } from '../../api/tipos';
import { esFechaValida } from '../../calendario/fechas';
import { Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { GrillaHorarios } from '../../componentes/Turnos';
import { fechaLegible, hoyEnClinica } from '../../utilidades/fechas';
import { useDatos } from '../../utilidades/useDatos';

/**
 * «Registrar nuevo turno» (recepcionista_turno_nuevo.php): paciente activo (GET /api/pacientes),
 * médico con su especialidad, fecha y horario libre (GET /api/medicos/:id/disponibilidad) y
 * motivo. Lo guarda POST /api/turnos y vuelve a la vista Día de esa fecha.
 * Acepta ?fecha= y ?id_medico= (por ejemplo, desde «Registrar turno este día» de la vista Mes).
 */
export function NuevoTurno() {
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const hoy = hoyEnClinica();
  const fechaInicial = parametros.get('fecha');

  const [idMedico, setIdMedico] = useState<number | null>(Number(parametros.get('id_medico')) || null);
  const [fecha, setFecha] = useState(esFechaValida(fechaInicial) && fechaInicial >= hoy ? fechaInicial : hoy);
  const [hora, setHora] = useState('');
  const [paciente, setPaciente] = useState<PacienteCatalogo | null>(null);
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const campos = error instanceof ErrorApi ? error.campos : {};

  const medicos = useDatos(() => catalogo.medicos(), []);
  const disponibilidad = useDatos(() => (idMedico ? catalogo.disponibilidad(idMedico, fecha) : Promise.resolve(null)), [idMedico, fecha]);
  const pacientes = useDatos(() => (consulta === null ? Promise.resolve(null) : catalogo.pacientes(consulta)), [consulta]);
  const medico = medicos.datos?.medicos.find((m) => m.id_medico === idMedico);
  const volver = `/recepcion/agenda/dia?fecha=${fecha}`;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!idMedico || !paciente || !hora) {
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const { turno } = await turnos.crear({ id_paciente: paciente.id_paciente, id_medico: idMedico, fecha, hora, motivo_consulta: motivo });
      navegar(`/recepcion/agenda/dia?fecha=${turno.fecha}&turno=${turno.id_turno}`, {
        state: { aviso: `Turno registrado: ${turno.paciente} con ${turno.medico}, ${fechaLegible(turno.fecha)} a las ${turno.hora}.` },
      });
    } catch (e) {
      setError(e);
      setEnviando(false);
      // Si otro lo reservó mientras tanto, o el horario ya pasó, se vuelve a mostrar la disponibilidad actual
      if (e instanceof ErrorApi && (e.codigo === 'HORARIO_OCUPADO' || e.codigo === 'FECHA_PASADA')) {
        setHora('');
        disponibilidad.recargar();
      }
    }
  };

  return (
    <section className="tarjeta-formulario">
      <div className="tarjeta-formulario-encabezado">
        <div>
          <h1>Registrar nuevo turno</h1>
          <p className="secundario">Completá los datos para agendar la cita médica.</p>
        </div>
        <Link to={volver} className="ventana-cerrar" aria-label="Volver a la agenda">
          ✕
        </Link>
      </div>

      <form onSubmit={enviar} noValidate className="tarjeta-formulario-cuerpo">
        {error !== null && <MensajeError error={error} />}

        <div className="campo">
          <label htmlFor="buscar-paciente">
            <span>Buscar paciente</span>
          </label>
          {paciente ? (
            <div className="paciente-elegido">
              <span>
                <strong>
                  {paciente.nombre} {paciente.apellido}
                </strong>{' '}
                · DNI {paciente.dni} · {paciente.obra_social ?? 'Sin obra social'}
              </span>
              <button type="button" className="boton boton-secundario boton-chico" onClick={() => setPaciente(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <div className="fila">
                <input
                  id="buscar-paciente"
                  type="search"
                  placeholder="DNI o nombre…"
                  aria-label="Buscar por nombre, apellido o DNI"
                  value={buscar}
                  maxLength={80}
                  style={{ flex: '1 1 200px' }}
                  aria-invalid={Boolean(campos.id_paciente)}
                  onChange={(e) => setBuscar(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setConsulta(buscar.trim());
                    }
                  }}
                />
                <button type="button" className="boton boton-secundario" onClick={() => setConsulta(buscar.trim())}>
                  Buscar
                </button>
                <Link to="/recepcion/pacientes/nuevo" className="boton boton-secundario">
                  Registrar paciente
                </Link>
              </div>
              {consulta !== null && pacientes.cargando && <Cargando texto="Buscando pacientes…" />}
              {pacientes.error !== null && <MensajeError error={pacientes.error} alReintentar={pacientes.recargar} />}
              {pacientes.datos && !pacientes.cargando && pacientes.datos.pacientes.length === 0 && <Vacio>No se encontraron pacientes activos.</Vacio>}
              {pacientes.datos && !pacientes.cargando && pacientes.datos.pacientes.length > 0 && (
                <ul className="resultados-pacientes">
                  {pacientes.datos.pacientes.map((p) => (
                    <li key={p.id_paciente}>
                      <button type="button" onClick={() => setPaciente(p)}>
                        {p.apellido}, {p.nombre} · DNI {p.dni}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="rejilla">
          <label className="campo">
            <span>Médico</span>
            {medicos.cargando ? (
              <Cargando texto="Cargando médicos…" />
            ) : (
              <select
                value={idMedico ?? ''}
                aria-invalid={Boolean(campos.id_medico)}
                onChange={(e) => {
                  setHora('');
                  setIdMedico(e.target.value ? Number(e.target.value) : null);
                }}
              >
                <option value="">Seleccionar médico</option>
                {medicos.datos?.medicos.map((m) => (
                  <option key={m.id_medico} value={m.id_medico}>
                    {m.apellido}, {m.nombre} · {m.especialidad}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="campo">
            <span>Especialidad</span>
            <input value={medico?.especialidad ?? ''} readOnly placeholder="Se completa al elegir el médico" />
          </label>
          <label className="campo">
            <span>Fecha del turno</span>
            <input
              type="date"
              value={fecha}
              min={hoy}
              onChange={(e) => {
                setHora('');
                if (e.target.value) setFecha(e.target.value);
              }}
            />
          </label>
        </div>
        {medicos.error !== null && <MensajeError error={medicos.error} alReintentar={medicos.recargar} />}

        <div className="campo">
          <span>Horario disponible</span>
          {!idMedico && <Vacio>Elegí un médico para ver sus horarios.</Vacio>}
          {idMedico && disponibilidad.cargando && <Cargando texto="Buscando horarios…" />}
          {idMedico && disponibilidad.error !== null && <MensajeError error={disponibilidad.error} alReintentar={disponibilidad.recargar} />}
          {idMedico && disponibilidad.datos && !disponibilidad.cargando && <GrillaHorarios horarios={disponibilidad.datos.horarios} elegido={hora} alElegir={setHora} />}
        </div>

        <label className="campo">
          <span>Motivo</span>
          <textarea
            value={motivo}
            maxLength={255}
            rows={3}
            placeholder="Descripción breve del síntoma o consulta…"
            aria-invalid={Boolean(campos.motivo_consulta)}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
        <p className="secundario">{motivo.length}/255</p>

        <div className="tarjeta-formulario-pie">
          <Link to={volver} className="boton boton-secundario">
            Cancelar
          </Link>
          <button type="submit" className="boton boton-primario" disabled={enviando || !idMedico || !paciente || !hora || !motivo.trim()}>
            {enviando ? 'Registrando…' : '✓ Registrar turno'}
          </button>
        </div>
      </form>
    </section>
  );
}
