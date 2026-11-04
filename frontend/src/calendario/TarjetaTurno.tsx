import type { Turno } from '../api/tipos';
import { EtiquetaEstado } from '../componentes/Turnos';

/** Tarjeta de un turno, coloreada por estado (las .slot-box y .week-slot-card de PHP). */
export function TarjetaTurno({ turno: t, seleccionada, alElegir, compacta = false }: { turno: Turno; seleccionada: boolean; alElegir: (t: Turno) => void; compacta?: boolean }) {
  return (
    <button
      type="button"
      className={`tarjeta-turno tarjeta-turno-${t.estado} ${seleccionada ? 'tarjeta-turno-seleccionada' : ''} ${compacta ? 'tarjeta-turno-compacta' : ''}`}
      aria-pressed={seleccionada}
      aria-label={`${t.hora}, ${t.paciente}, con ${t.medico}`}
      onClick={() => alElegir(t)}
    >
      {compacta ? (
        <>
          <span className="tarjeta-turno-paciente">{t.paciente}</span>
          <span className="tarjeta-turno-medico">
            {t.medico} • {t.especialidad}
          </span>
          <span className="tarjeta-turno-pie">
            <strong>{t.hora}</strong>
            <EtiquetaEstado estado={t.estado} />
          </span>
        </>
      ) : (
        <>
          <span className="tarjeta-turno-titulo">
            <strong>
              {t.hora} | {t.paciente}
            </strong>{' '}
            <EtiquetaEstado estado={t.estado} />
          </span>
          <span className="tarjeta-turno-medico">
            {t.medico} ({t.especialidad})
          </span>
          <span className="tarjeta-turno-motivo">
            <strong>Motivo:</strong> {t.motivo_consulta || 'Sin motivo informado'}
          </span>
        </>
      )}
    </button>
  );
}
