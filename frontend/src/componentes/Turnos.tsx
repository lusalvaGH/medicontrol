import type { EstadoTurno, Horario } from '../api/tipos';
import { ESTADOS, ETIQUETA_ESTADO, contarPorEstado } from '../utilidades/turnos';

export function EtiquetaEstado({ estado }: { estado: EstadoTurno }) {
  return <span className={`etiqueta etiqueta-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

/** Totales del día por estado. */
export function ResumenEstados({ turnos }: { turnos: { estado: EstadoTurno }[] }) {
  const conteo = contarPorEstado(turnos);

  return (
    <div className="resumen" aria-label="Turnos por estado">
      <span className="etiqueta">Total: {turnos.length}</span>
      {ESTADOS.filter((e) => conteo[e] > 0).map((e) => (
        <span key={e} className={`etiqueta etiqueta-${e}`}>
          {ETIQUETA_ESTADO[e]}: {conteo[e]}
        </span>
      ))}
    </div>
  );
}

const ESTADO_HORARIO: Record<Horario['estado'], string> = { libre: 'libre', ocupado: 'ocupado', pasado: 'ya pasó' };

/** Grilla de horarios del médico: solo los libres se pueden elegir. */
export function GrillaHorarios({ horarios, elegido, alElegir }: { horarios: Horario[]; elegido: string; alElegir: (hora: string) => void }) {
  const libres = horarios.filter((h) => h.estado === 'libre').length;

  return (
    <div>
      <p className="secundario">{libres === 0 ? 'No quedan horarios libres en esta fecha.' : `${libres} horario(s) libre(s).`}</p>
      <div className="horarios" role="group" aria-label="Horarios">
        {horarios.map((h) => (
          <button
            key={h.hora}
            type="button"
            className="horario"
            disabled={h.estado !== 'libre'}
            aria-pressed={elegido === h.hora}
            aria-label={`${h.hora}, ${ESTADO_HORARIO[h.estado]}`}
            title={ESTADO_HORARIO[h.estado]}
            onClick={() => alElegir(h.hora)}
          >
            {h.hora}
          </button>
        ))}
      </div>
    </div>
  );
}
