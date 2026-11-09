import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import { catalogo, turnos as apiTurnos } from '../api/servicios';
import type { EstadoTurno, Turno } from '../api/tipos';
import { Cargando, MensajeError } from '../componentes/Estados';
import { GrillaHorarios } from '../componentes/Turnos';
import { hoyEnClinica } from '../utilidades/fechas';
import { ETIQUETA_ESTADO, REPROGRAMABLES, TRANSICIONES } from '../utilidades/turnos';
import { useDatos } from '../utilidades/useDatos';
import { Ventana } from './Ventana';

interface PropsModificar {
  turno: Turno;
  alCerrar: () => void;
  /** Se guardó un cambio: mensaje para el aviso y el turno como quedó. */
  alGuardar: (mensaje: string, turno: Turno | null) => void;
}

/**
 * «Modificar y ajustar turno» de la vista Día de PHP: fecha, horario (con la disponibilidad
 * real del médico) y solo los estados a los que el turno puede pasar. El backend vuelve a
 * validar todo con las reglas de la etapa 2.
 */
export function ModificarTurno({ turno: t, alCerrar, alGuardar }: PropsModificar) {
  const reprogramable = REPROGRAMABLES.includes(t.estado);
  const siguientes = TRANSICIONES[t.estado];
  const esFinal = siguientes.length === 0;

  const [fecha, setFecha] = useState(t.fecha);
  const [hora, setHora] = useState(t.hora);
  const [estado, setEstado] = useState<EstadoTurno>(t.estado);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const disponibilidad = useDatos(() => (reprogramable ? catalogo.disponibilidad(t.id_medico, fecha) : Promise.resolve(null)), [t.id_medico, fecha, reprogramable]);

  // El horario actual del turno figura ocupado (por el propio turno): se lo muestra como elegible
  const horarios = disponibilidad.datos?.horarios.map((h) => (fecha === t.fecha && h.hora === t.hora ? { ...h, estado: 'libre' as const } : h)) ?? [];

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!hora) {
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await apiTurnos.modificar(t.id_turno, { fecha, hora, estado });
      alGuardar(r.sin_cambios ? 'No había cambios para guardar.' : `Turno guardado: ${t.paciente} — ${hora} (${fecha}).`, r.turno);
    } catch (e) {
      setError(e);
      setEnviando(false);
      if (e instanceof ErrorApi && e.codigo === 'HORARIO_OCUPADO') {
        disponibilidad.recargar();
      }
    }
  };

  const cancelar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await apiTurnos.cancelar(t.id_turno);
      alGuardar(`Turno cancelado: ${t.paciente} — ${t.hora}.`, r.turno);
    } catch (e) {
      setError(e);
      setEnviando(false);
      setConfirmando(false);
    }
  };

  let nota = '';
  if (esFinal) {
    nota = `El turno está ${ETIQUETA_ESTADO[t.estado].toUpperCase()}: es un estado final y no se puede modificar.`;
  } else if (!reprogramable) {
    nota = `Un turno ${ETIQUETA_ESTADO[t.estado].toUpperCase()} no se puede reprogramar; solo se puede cambiar su estado.`;
  }

  return (
    <Ventana
      titulo="✏️ Modificar y ajustar turno"
      alCerrar={alCerrar}
      pie={
        confirmando ? (
          <>
            <span className="pregunta">¿Confirmás la cancelación de este turno?</span>
            <button type="button" className="boton boton-secundario" onClick={() => setConfirmando(false)} disabled={enviando}>
              No
            </button>
            <button type="button" className="boton boton-peligro-lleno" onClick={cancelar} disabled={enviando}>
              {enviando ? 'Cancelando…' : 'Sí, cancelar'}
            </button>
          </>
        ) : (
          <>
            {siguientes.includes('cancelado') && (
              <button type="button" className="boton boton-peligro" onClick={() => setConfirmando(true)} disabled={enviando}>
                ❌ Cancelar turno
              </button>
            )}
            <button type="submit" form="formulario-modificar" className="boton boton-primario" disabled={esFinal || enviando || !hora}>
              {enviando ? 'Guardando…' : '✓ Guardar modificaciones'}
            </button>
          </>
        )
      }
    >
      {error !== null && <MensajeError error={error} />}
      <form id="formulario-modificar" onSubmit={guardar} className="formulario-ventana">
        <div className="rejilla">
          <label className="campo">
            <span>Paciente</span>
            <input value={t.paciente} readOnly />
          </label>
          <label className="campo">
            <span>Médico asignado</span>
            <input value={`${t.medico} (${t.especialidad})`} readOnly />
          </label>
          <label className="campo">
            <span>📆 Fecha</span>
            <input
              type="date"
              value={fecha}
              min={hoyEnClinica()}
              disabled={!reprogramable}
              onChange={(e) => {
                if (e.target.value) {
                  setFecha(e.target.value);
                  setHora(e.target.value === t.fecha ? t.hora : '');
                }
              }}
            />
          </label>
          <label className="campo">
            <span>Horario seleccionado</span>
            <input value={hora || 'Elegí un horario'} readOnly className="horario-elegido" />
          </label>
        </div>

        {reprogramable && (
          <div className="campo">
            <span>Horarios disponibles del médico</span>
            {disponibilidad.cargando && <Cargando texto="Buscando horarios…" />}
            {disponibilidad.error !== null && <MensajeError error={disponibilidad.error} alReintentar={disponibilidad.recargar} />}
            {disponibilidad.datos && !disponibilidad.cargando && <GrillaHorarios horarios={horarios} elegido={hora} alElegir={setHora} />}
          </div>
        )}

        <label className="campo">
          <span>Estado del turno</span>
          <select value={estado} disabled={esFinal} onChange={(e) => setEstado(e.target.value as EstadoTurno)}>
            {[t.estado, ...siguientes.filter((s) => s !== 'cancelado')].map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO[s]}
              </option>
            ))}
          </select>
        </label>
        {nota && <p className="secundario">{nota}</p>}
      </form>
    </Ventana>
  );
}
