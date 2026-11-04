import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FiltroTurnos, Totales } from './filtros';
import { mesDe } from './fechas';

export type Vista = 'dia' | 'semana' | 'mes';

interface PropsBarra {
  vista: Vista;
  /** Fecha de referencia: las pestañas la conservan al cambiar de vista. */
  fecha: string;
  totales: Totales | null;
  rotuloTotal: string;
  /** Sin filtro (vista Mes: el resumen trae solo cantidades). */
  filtro?: FiltroTurnos;
  alFiltrar?: (filtro: FiltroTurnos) => void;
  especialidades?: string[];
  /** Flechas, título y selector de fecha de cada vista. */
  navegacion: ReactNode;
  /** Botones propios de la vista, junto a «Registrar turno». */
  acciones?: ReactNode;
}

/**
 * Parte superior común a Día, Semana y Mes (como en las tres pantallas PHP): buscador,
 * tarjetas de totales, filtro de especialidad, «Registrar turno», navegación y pestañas.
 */
export function BarraCalendario({ vista, fecha, totales, rotuloTotal, filtro, alFiltrar, especialidades = [], navegacion, acciones }: PropsBarra) {
  const tarjetas: [string, keyof Totales, string][] = [
    [rotuloTotal, 'total', 'total'],
    ['Confirmados', 'confirmado', 'confirmado'],
    ['Pendientes', 'pendiente', 'pendiente'],
    ['En curso', 'en_curso', 'en_curso'],
  ];
  const pestanas: [Vista, string][] = [
    ['dia', 'Día'],
    ['semana', 'Semana'],
    ['mes', 'Mes'],
  ];

  return (
    <>
      <div className="totales" aria-label="Totales">
        {tarjetas.map(([rotulo, clave, clase]) => (
          <div key={clave} className={`tarjeta-total tarjeta-total-${clase}`}>
            <span>{rotulo}</span>
            <strong>{totales ? totales[clave] : '—'}</strong>
          </div>
        ))}
      </div>

      {filtro && alFiltrar && (
        <div className="barra-filtros" role="search">
          <label className="buscador">
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Buscar paciente o médico…"
              aria-label="Buscar paciente o médico"
              value={filtro.buscar}
              onChange={(e) => alFiltrar({ ...filtro, buscar: e.target.value })}
            />
          </label>
          <label className="selector-especialidad">
            <span>🩺 Especialidad:</span>
            <select value={filtro.especialidad} onChange={(e) => alFiltrar({ ...filtro, especialidad: e.target.value })}>
              <option value="">Todas las especialidades</option>
              {especialidades.map((esp) => (
                <option key={esp} value={esp}>
                  {esp}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="barra-calendario">
        <div className="fila">
          <Link to={`/recepcion/turnos/nuevo?fecha=${fecha}`} className="boton boton-primario">
            ⊕ Registrar turno
          </Link>
          {acciones}
          {navegacion}
        </div>
        <nav className="pestanas" aria-label="Vista del calendario">
          {pestanas.map(([v, texto]) => (
            <Link
              key={v}
              to={`/recepcion/agenda/${v}?fecha=${v === 'mes' ? `${mesDe(fecha)}-01` : fecha}`}
              className={`pestana ${v === vista ? 'pestana-activa' : ''}`}
              aria-current={v === vista ? 'page' : undefined}
            >
              {texto}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
