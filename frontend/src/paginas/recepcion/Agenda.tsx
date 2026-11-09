import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { turnos as apiTurnos } from '../../api/servicios';
import type { Turno } from '../../api/tipos';
import { useAvisoFlotante } from '../../calendario/Aviso';
import { BarraCalendario } from '../../calendario/BarraCalendario';
import { DetalleTurno } from '../../calendario/DetalleTurno';
import { fechaCompleta } from '../../calendario/fechas';
import { especialidadesDe, filtrarTurnos, totalesDeTurnos, type FiltroTurnos } from '../../calendario/filtros';
import { ModificarTurno } from '../../calendario/ModificarTurno';
import { TarjetaTurno } from '../../calendario/TarjetaTurno';
import { useFechaDeLaUrl } from '../../calendario/useFechaDeLaUrl';
import { Aviso, Cargando, MensajeError, Vacio } from '../../componentes/Estados';
import { EtiquetaEstado } from '../../componentes/Turnos';
import { fechaLegible, hoyEnClinica, sumarDias } from '../../utilidades/fechas';
import { TRANSICIONES } from '../../utilidades/turnos';
import { useDatos } from '../../utilidades/useDatos';

/**
 * Vista Día de recepción (recepcionista.php): línea de tiempo de los turnos de la fecha
 * (GET /api/turnos?fecha=), ficha del paciente del turno seleccionado, detalle y
 * modificación (reprogramar, cambiar estado o cancelar).
 */
export function Agenda() {
  const { fecha, fechaInvalida, turnoPedido, irA } = useFechaDeLaUrl();
  const avisoInicial = (useLocation().state as { aviso?: string } | null)?.aviso;
  const aviso = useAvisoFlotante();
  const { datos, error, cargando, recargar } = useDatos(() => apiTurnos.delDia(fecha), [fecha]);
  const [filtro, setFiltro] = useState<FiltroTurnos>({ buscar: '', especialidad: '' });
  const [idElegido, setIdElegido] = useState<number | null>(turnoPedido);
  const [ventana, setVentana] = useState<'detalle' | 'modificar' | null>(null);

  const { mostrar } = aviso;
  useEffect(() => {
    if (avisoInicial) {
      mostrar(`✅ ${avisoInicial}`);
    }
  }, [avisoInicial, mostrar]);

  const turnos = datos && datos.fecha === fecha ? datos.turnos : [];
  const visibles = filtrarTurnos(turnos, filtro);
  // Como en PHP, si no se eligió ninguno queda seleccionado el primero del día
  const elegido = turnos.find((t) => t.id_turno === idElegido) ?? visibles[0] ?? null;

  const irAFecha = (nueva: string) => {
    setIdElegido(null);
    setVentana(null);
    irA(nueva);
  };

  const listo = (mensaje: string, turno: Turno | null) => {
    setVentana(null);
    mostrar(`✅ ${mensaje}`);
    // Reprogramado a otro día: la vista Día va a esa fecha y lo deja seleccionado
    if (turno && turno.fecha !== fecha) {
      setIdElegido(turno.id_turno);
      irA(turno.fecha);
      return;
    }
    setIdElegido(turno ? turno.id_turno : null);
    recargar();
  };

  return (
    <section>
      {fechaInvalida && <Aviso tipo="info">⚠️ La fecha seleccionada no era válida. Se muestra la fecha actual.</Aviso>}
      <BarraCalendario
        vista="dia"
        fecha={fecha}
        totales={datos ? totalesDeTurnos(turnos) : null}
        rotuloTotal={fecha === hoyEnClinica() ? 'Turnos de hoy' : 'Turnos del día'}
        filtro={filtro}
        alFiltrar={setFiltro}
        especialidades={especialidadesDe(turnos)}
        acciones={
          <button type="button" className="boton boton-secundario" disabled={!elegido} onClick={() => setVentana('detalle')}>
            📄 Detalle del turno
          </button>
        }
        navegacion={
          <div className="navegacion-fecha">
            <button type="button" className="boton boton-secundario" onClick={() => irAFecha(sumarDias(fecha, -1))} aria-label="Día anterior">
              ‹
            </button>
            <h1 className="titulo-periodo">{fechaLegible(fecha)}</h1>
            <button type="button" className="boton boton-secundario" onClick={() => irAFecha(sumarDias(fecha, 1))} aria-label="Día siguiente">
              ›
            </button>
            <button type="button" className="boton boton-secundario boton-chico" onClick={() => irAFecha(hoyEnClinica())}>
              Hoy
            </button>
            <input type="date" aria-label="Fecha" value={fecha} onChange={(e) => e.target.value && irAFecha(e.target.value)} />
          </div>
        }
      />
      <p className="pista">🤚 Tocá un turno para seleccionarlo y usá «Modificar este turno» para editarlo.</p>

      <div className="linea-de-tiempo">
        <div className="tarjeta">
          {cargando && !datos && <Cargando />}
          {error !== null && <MensajeError error={error} alReintentar={recargar} />}
          {datos && turnos.length === 0 && <Vacio>No hay turnos para el {fechaLegible(fecha)}.</Vacio>}
          {turnos.length > 0 && visibles.length === 0 && <Vacio>🔍 No se encontraron turnos que coincidan con la búsqueda.</Vacio>}
          <ol className="horarios-del-dia">
            {visibles.map((t) => (
              <li key={t.id_turno} className="fila-horario">
                <span className="fila-horario-hora">{t.hora}</span>
                <TarjetaTurno turno={t} seleccionada={elegido?.id_turno === t.id_turno} alElegir={(x) => setIdElegido(x.id_turno)} />
              </li>
            ))}
          </ol>
        </div>

        <aside className="tarjeta ficha-paciente" aria-label="Paciente seleccionado">
          <div className="ficha-paciente-titulo">
            <span>👤 Paciente seleccionado</span>
            {elegido ? <EtiquetaEstado estado={elegido.estado} /> : <span className="etiqueta">Sin selección</span>}
          </div>
          <div className="ficha-paciente-persona">
            <span className="avatar" aria-hidden="true">
              {elegido ? elegido.paciente.slice(0, 2).toUpperCase() : 'PT'}
            </span>
            <strong>{elegido ? elegido.paciente : 'Seleccioná un turno'}</strong>
            <span className="secundario">{elegido ? `${elegido.obra_social || 'Particular'} • DNI ${elegido.paciente_dni}` : ''}</span>
          </div>
          <dl className="ficha-paciente-datos">
            <dt>Médico tratante</dt>
            <dd>{elegido ? `${elegido.medico} (${elegido.especialidad})` : '—'}</dd>
            <dt>Fecha y horario</dt>
            <dd className="destacado">{elegido ? `${fechaCompleta(elegido.fecha)} — ${elegido.hora}` : '—'}</dd>
            <dt>Motivo de consulta</dt>
            <dd>{elegido ? elegido.motivo_consulta || 'Sin motivo informado' : 'Hacé clic en cualquier turno de la lista para ver su detalle o modificarlo.'}</dd>
          </dl>
          <div className="ficha-paciente-acciones">
            <button type="button" className="boton boton-primario" disabled={!elegido} onClick={() => setVentana('detalle')}>
              📄 Ver detalle breve
            </button>
            <button type="button" className="boton boton-secundario" disabled={!elegido || TRANSICIONES[elegido.estado].length === 0} onClick={() => setVentana('modificar')}>
              ✏️ Modificar este turno
            </button>
          </div>
        </aside>
      </div>

      {elegido && ventana === 'detalle' && (
        <DetalleTurno
          turno={elegido}
          alCerrar={() => setVentana(null)}
          alModificar={() => setVentana('modificar')}
          alCancelar={(t) => listo(`Turno cancelado: ${t.paciente} — ${t.hora}.`, t)}
        />
      )}
      {elegido && ventana === 'modificar' && <ModificarTurno turno={elegido} alCerrar={() => setVentana(null)} alGuardar={listo} />}
      {aviso.elemento}
    </section>
  );
}
