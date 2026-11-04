import { useState } from 'react';
import { Link } from 'react-router-dom';
import { turnos as apiTurnos } from '../api/servicios';
import type { Turno } from '../api/tipos';
import { MensajeError } from '../componentes/Estados';
import { EtiquetaEstado } from '../componentes/Turnos';
import { TRANSICIONES } from '../utilidades/turnos';
import { fechaCompleta } from './fechas';
import { Ventana } from './Ventana';

interface PropsDetalle {
  turno: Turno;
  alCerrar: () => void;
  /** Se canceló el turno (la vista recarga y avisa). */
  alCancelar: (turno: Turno) => void;
  /** Abre la ventana de modificación (vista Día). */
  alModificar?: (turno: Turno) => void;
  /** Vuelve a la lista del día (vista Mes). */
  alVolver?: () => void;
  /** Muestra el acceso a la vista Día de la fecha del turno (vistas Semana y Mes). */
  conEnlaceAlDia?: boolean;
}

/** Detalle del turno con las acciones que el estado permite (detalle de las tres pantallas PHP). */
export function DetalleTurno({ turno: t, alCerrar, alCancelar, alModificar, alVolver, conEnlaceAlDia = false }: PropsDetalle) {
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cancelable = TRANSICIONES[t.estado].includes('cancelado');

  const cancelar = async () => {
    setCancelando(true);
    setError(null);
    try {
      const { turno } = await apiTurnos.cancelar(t.id_turno);
      alCancelar(turno);
    } catch (e) {
      setError(e);
      setCancelando(false);
      setConfirmando(false);
    }
  };

  return (
    <Ventana
      titulo="📄 Detalle del turno"
      oscura
      angosta
      alCerrar={alCerrar}
      pie={
        confirmando ? (
          <>
            <span className="pregunta">¿Cancelar este turno? El cambio se guarda en la base de datos.</span>
            <button type="button" className="boton boton-secundario" onClick={() => setConfirmando(false)} disabled={cancelando}>
              No
            </button>
            <button type="button" className="boton boton-peligro-lleno" onClick={cancelar} disabled={cancelando}>
              {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
            </button>
          </>
        ) : (
          <>
            {alVolver && (
              <button type="button" className="boton boton-secundario" onClick={alVolver}>
                ← Volver al día
              </button>
            )}
            {conEnlaceAlDia && (
              <Link className="boton boton-secundario" to={`/recepcion/agenda/dia?fecha=${t.fecha}&turno=${t.id_turno}`}>
                📅 Abrir en vista Día
              </Link>
            )}
            {alModificar && TRANSICIONES[t.estado].length > 0 && (
              <button type="button" className="boton boton-secundario" onClick={() => alModificar(t)}>
                ✏️ Modificar
              </button>
            )}
            {cancelable && (
              <button type="button" className="boton boton-peligro" onClick={() => setConfirmando(true)}>
                ❌ Cancelar turno
              </button>
            )}
            <button type="button" className="boton boton-primario" onClick={alCerrar}>
              Cerrar
            </button>
          </>
        )
      }
    >
      {error !== null && <MensajeError error={error} />}
      <div className="detalle-resumen">
        <div>
          <span className="rotulo">Estado del turno</span>
          <EtiquetaEstado estado={t.estado} />
        </div>
        <div className="alinear-derecha">
          <span className="rotulo">Horario programado</span>
          <strong className="detalle-hora">{t.hora}</strong>
        </div>
      </div>
      <div className="detalle-grilla">
        <div className="detalle-dato">
          <span className="rotulo">👤 Paciente</span>
          <strong>{t.paciente}</strong>
          <span className="secundario">
            {t.obra_social || 'Particular'} • DNI: {t.paciente_dni}
          </span>
        </div>
        <div className="detalle-dato">
          <span className="rotulo">🩺 Médico tratante</span>
          <strong>{t.medico}</strong>
          <span className="detalle-especialidad">{t.especialidad}</span>
        </div>
        <div className="detalle-dato">
          <span className="rotulo">📅 Fecha</span>
          <strong>{fechaCompleta(t.fecha)}</strong>
        </div>
        <div className="detalle-dato">
          <span className="rotulo">🆔 Turno</span>
          <strong>#{t.id_turno}</strong>
        </div>
      </div>
      <div className="detalle-motivo">
        <span className="rotulo">📝 Motivo de consulta</span>
        <p>{t.motivo_consulta || 'Sin motivo informado'}</p>
      </div>
    </Ventana>
  );
}
