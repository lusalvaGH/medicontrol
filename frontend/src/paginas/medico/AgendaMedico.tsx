import { useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { misTurnos } from '../../api/servicios';
import type { TurnoAgendaMedico } from '../../api/tipos';
import { Ventana } from '../../calendario/Ventana';
import { Cargando, MensajeError, Vacio, mensajeDeError } from '../../componentes/Estados';
import { EtiquetaEstado, ResumenEstados } from '../../componentes/Turnos';
import { fechaLegible, hoyEnClinica, sumarDias } from '../../utilidades/fechas';
import { useDatos } from '../../utilidades/useDatos';

/** Mismo límite que el backend (NOTAS_MAXIMO en mis-turnos.controller.ts). */
const NOTAS_MAXIMO = 5000;

/**
 * Agenda del día del médico de la sesión (GET /api/medico/agenda), como panel/medico.php: los
 * turnos con los datos del paciente, las notas médicas de cada turno (las escribe solo este
 * médico) y el historial de cada paciente con este médico. Las notas no las ven recepción ni el paciente.
 */
export function AgendaMedico() {
  const [parametros, setParametros] = useSearchParams();
  const fecha = parametros.get('fecha') || hoyEnClinica();
  const { datos, error, cargando, recargar } = useDatos(() => misTurnos.agendaMedico(fecha), [fecha]);
  const irA = (nueva: string) => setParametros({ fecha: nueva });
  const [notasDe, setNotasDe] = useState<TurnoAgendaMedico | null>(null);
  const [historialDe, setHistorialDe] = useState<TurnoAgendaMedico | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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

      {aviso && (
        <div className="aviso aviso-exito" role="status">
          {aviso}
        </div>
      )}
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
                <th>Acciones</th>
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
                  <td data-etiqueta="Acciones">
                    <div className="fila">
                      <button type="button" className="boton boton-secundario boton-chico" onClick={() => setNotasDe(t)} aria-label={`Notas del turno de ${t.paciente} a las ${t.hora}`}>
                        {t.notas_medicas ? 'Editar notas' : 'Agregar notas'}
                      </button>
                      <button type="button" className="boton boton-secundario boton-chico" onClick={() => setHistorialDe(t)} aria-label={`Historial de ${t.paciente}`}>
                        Historial
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {notasDe && (
        <VentanaNotas
          turno={notasDe}
          alCerrar={() => setNotasDe(null)}
          alGuardar={() => {
            setNotasDe(null);
            setAviso(`Notas guardadas: ${notasDe.paciente} — ${notasDe.hora}.`);
            recargar();
          }}
        />
      )}
      {historialDe && <VentanaHistorial turno={historialDe} alCerrar={() => setHistorialDe(null)} />}
    </section>
  );
}

function VentanaNotas({ turno, alCerrar, alGuardar }: { turno: TurnoAgendaMedico; alCerrar: () => void; alGuardar: () => void }) {
  const idForm = useId();
  const [notas, setNotas] = useState(turno.notas_medicas ?? '');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await misTurnos.guardarNotas(turno.id_turno, notas);
      alGuardar();
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  };

  return (
    <Ventana
      titulo={`Notas · ${turno.paciente} · ${turno.hora}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" form={idForm} className="boton boton-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar notas'}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar}>
        {error !== null && (
          <div className="aviso aviso-error" role="alert">
            {mensajeDeError(error)}
          </div>
        )}
        <p className="secundario">Motivo: {turno.motivo_consulta}. Las notas solo las ves vos; si dejás el texto vacío, se borran.</p>
        <label className="campo">
          <span>Notas médicas</span>
          <textarea rows={8} maxLength={NOTAS_MAXIMO} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={enviando} />
        </label>
        <p className="secundario">
          {notas.length} / {NOTAS_MAXIMO}
        </p>
      </form>
    </Ventana>
  );
}

function VentanaHistorial({ turno, alCerrar }: { turno: TurnoAgendaMedico; alCerrar: () => void }) {
  const { datos, error, cargando, recargar } = useDatos(() => misTurnos.historial(turno.id_paciente), [turno.id_paciente]);

  return (
    <Ventana
      titulo={`Historial · ${turno.paciente}`}
      alCerrar={alCerrar}
      pie={
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <p className="secundario">Solo tus turnos con este paciente, del más reciente al más antiguo.</p>
      {cargando && <Cargando />}
      {!cargando && error !== null && <MensajeError error={error} alReintentar={recargar} />}
      {!cargando && datos && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Motivo y notas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {datos.turnos.map((h) => (
              <tr key={h.id_turno}>
                <td data-etiqueta="Fecha">
                  {fechaLegible(h.fecha)} · {h.hora}
                </td>
                <td data-etiqueta="Motivo y notas">
                  {h.motivo_consulta}
                  {h.notas_medicas && <p className="notas secundario">Notas: {h.notas_medicas}</p>}
                </td>
                <td data-etiqueta="Estado">
                  <EtiquetaEstado estado={h.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Ventana>
  );
}
