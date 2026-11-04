import { useSearchParams } from 'react-router-dom';
import { misTurnos } from '../../api/servicios';
import { Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { EtiquetaEstado, ResumenEstados } from '../../componentes/Turnos';
import { fechaLegible, hoyEnClinica, sumarDias } from '../../utilidades/fechas';
import { useDatos } from '../../utilidades/useDatos';

/**
 * Agenda del día del médico de la sesión (GET /api/medico/agenda). Solo lectura: la edición
 * de notas médicas todavía no está migrada (pendiente PROD-09).
 */
export function AgendaMedico() {
  const [parametros, setParametros] = useSearchParams();
  const fecha = parametros.get('fecha') || hoyEnClinica();
  const { datos, error, cargando, recargar } = useDatos(() => misTurnos.agendaMedico(fecha), [fecha]);
  const irA = (nueva: string) => setParametros({ fecha: nueva });

  return (
    <section>
      <h1>Mi agenda · {fechaLegible(fecha)}</h1>
      <div className="tarjeta fila">
        <button type="button" className="boton boton-secundario" onClick={() => irA(sumarDias(fecha, -1))} aria-label="Día anterior">
          ←
        </button>
        <label className="campo">
          <span>Fecha</span>
          <input type="date" value={fecha} onChange={(e) => e.target.value && irA(e.target.value)} />
        </label>
        <button type="button" className="boton boton-secundario" onClick={() => irA(sumarDias(fecha, 1))} aria-label="Día siguiente">
          →
        </button>
        <button type="button" className="boton boton-secundario" onClick={() => irA(hoyEnClinica())}>
          Hoy
        </button>
      </div>

      {cargando && <Cargando />}
      {!cargando && error !== null && <MensajeError error={error} alReintentar={recargar} />}
      {!cargando && datos && datos.turnos.length === 0 && <Vacio>No tenés turnos para esta fecha.</Vacio>}
      {!cargando && datos && datos.turnos.length > 0 && (
        <>
          <ResumenEstados turnos={datos.turnos} />
          <table className="tabla">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Paciente</th>
                <th>Motivo y notas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.turnos.map((t) => (
                <tr key={t.id_turno}>
                  <td data-etiqueta="Hora">
                    <strong>{t.hora}</strong>
                  </td>
                  <td data-etiqueta="Paciente">
                    {t.paciente}
                    <div className="secundario">
                      DNI {t.paciente_dni} · {t.obra_social ?? 'Sin obra social'}
                      {t.telefono && <> · Tel. {t.telefono}</>}
                    </div>
                  </td>
                  <td data-etiqueta="Motivo y notas">
                    {t.motivo_consulta}
                    {t.notas_medicas && <p className="notas secundario">Notas: {t.notas_medicas}</p>}
                  </td>
                  <td data-etiqueta="Estado">
                    <EtiquetaEstado estado={t.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
