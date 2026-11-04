import { misTurnos } from '../../api/servicios';
import type { TurnoPaciente } from '../../api/tipos';
import { Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { EtiquetaEstado } from '../../componentes/Turnos';
import { ahoraEnClinica, fechaLegible } from '../../utilidades/fechas';
import { useDatos } from '../../utilidades/useDatos';

/** Separa los turnos que todavía no pasaron (en la hora de la clínica) de los anteriores. */
export function separarTurnos(turnos: TurnoPaciente[], ahora = ahoraEnClinica()) {
  const proximos = turnos.filter((t) => `${t.fecha} ${t.hora}` >= ahora && t.estado !== 'cancelado' && t.estado !== 'atendido');
  const anteriores = turnos.filter((t) => !proximos.includes(t)).reverse();

  return { proximos, anteriores };
}

/** Turnos del paciente de la sesión (GET /api/paciente/turnos). Solo lectura. */
export function MisTurnos() {
  const { datos, error, cargando, recargar } = useDatos(() => misTurnos.delPaciente(), []);
  const { proximos, anteriores } = datos ? separarTurnos(datos.turnos) : { proximos: [], anteriores: [] };

  return (
    <section>
      <h1>Mis turnos</h1>
      {cargando && <Cargando />}
      {!cargando && error !== null && <MensajeError error={error} alReintentar={recargar} />}
      {!cargando && datos && (
        <>
          <h2>Próximos</h2>
          {proximos.length === 0 ? <Vacio>No tenés turnos próximos.</Vacio> : <ListaTurnos turnos={proximos} />}
          <h2 style={{ marginTop: '1.25rem' }}>Anteriores y cancelados</h2>
          {anteriores.length === 0 ? <Vacio>No hay turnos anteriores.</Vacio> : <ListaTurnos turnos={anteriores} />}
        </>
      )}
    </section>
  );
}

function ListaTurnos({ turnos }: { turnos: TurnoPaciente[] }) {
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Hora</th>
          <th>Médico</th>
          <th>Motivo</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {turnos.map((t) => (
          <tr key={t.id_turno}>
            <td data-etiqueta="Fecha">{fechaLegible(t.fecha)}</td>
            <td data-etiqueta="Hora">{t.hora}</td>
            <td data-etiqueta="Médico">
              {t.medico_nombre} {t.medico_apellido}
              <div className="secundario">{t.medico_especialidad}</div>
            </td>
            <td data-etiqueta="Motivo">{t.motivo_consulta}</td>
            <td data-etiqueta="Estado">
              <EtiquetaEstado estado={t.estado} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
