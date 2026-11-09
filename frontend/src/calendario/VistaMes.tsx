import { useState } from 'react';
import { Link } from 'react-router-dom';
import { turnos as apiTurnos } from '../api/servicios';
import type { ConteoDia, Turno } from '../api/tipos';
import { Aviso, Cargando, MensajeError, Vacio } from '../componentes/Estados';
import { EtiquetaEstado } from '../componentes/Turnos';
import { hoyEnClinica } from '../utilidades/fechas';
import { useDatos } from '../utilidades/useDatos';
import { useAvisoFlotante } from './Aviso';
import { BarraCalendario } from './BarraCalendario';
import { DetalleTurno } from './DetalleTurno';
import { DIAS_CORTOS, celdasDelMes, fechaLarga, mesDe, nombreDelMes, sumarMeses } from './fechas';
import { estadoPredominante, totalesDelMes } from './filtros';
import { useFechaDeLaUrl } from './useFechaDeLaUrl';
import { Ventana } from './Ventana';

/**
 * Vista Mes (recepcionista_mes.php): grilla de lunes a domingo con la cantidad de turnos por
 * día (GET /api/turnos/resumen), la lista del día elegido (GET /api/turnos?fecha=) y su detalle.
 */
export function VistaMes() {
  const { fecha, fechaInvalida, irA } = useFechaDeLaUrl();
  const mes = mesDe(fecha);
  const hoy = hoyEnClinica();
  const aviso = useAvisoFlotante();
  const resumen = useDatos(() => apiTurnos.resumenMes(mes), [mes]);
  const dias: Record<string, ConteoDia> = resumen.datos && !Array.isArray(resumen.datos.dias) ? resumen.datos.dias : {};

  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  const [turnoElegido, setTurnoElegido] = useState<Turno | null>(null);

  const irAlMes = (nuevo: string) => {
    setDiaElegido(null);
    irA(`${nuevo}-01`);
  };

  return (
    <section>
      {fechaInvalida && <Aviso tipo="info">⚠️ El mes indicado no es válido. Se muestra el mes actual.</Aviso>}
      <BarraCalendario
        vista="mes"
        fecha={diaElegido ?? (mesDe(hoy) === mes ? hoy : fecha)}
        totales={resumen.datos ? totalesDelMes(dias) : null}
        rotuloTotal="Turnos del mes"
        navegacion={
          <div className="navegacion-fecha">
            <button type="button" className="boton boton-secundario" onClick={() => irAlMes(sumarMeses(mes, -1))} aria-label="Mes anterior">
              ‹
            </button>
            <h1 className="titulo-periodo">{nombreDelMes(mes)}</h1>
            <button type="button" className="boton boton-secundario" onClick={() => irAlMes(sumarMeses(mes, 1))} aria-label="Mes siguiente">
              ›
            </button>
            <button type="button" className="boton boton-secundario boton-chico" onClick={() => irAlMes(mesDe(hoy))}>
              Hoy
            </button>
          </div>
        }
      />

      {resumen.cargando && !resumen.datos && <Cargando />}
      {resumen.error !== null && <MensajeError error={resumen.error} alReintentar={resumen.recargar} />}

      <div className="grilla-mes" role="grid" aria-label={`Turnos de ${nombreDelMes(mes)}`}>
        {DIAS_CORTOS.map((d) => (
          <div key={d} className="grilla-mes-encabezado" role="columnheader">
            {d}
          </div>
        ))}
        {celdasDelMes(mes).map((dia, i) => {
          if (!dia) {
            return <div key={`vacio-${i}`} className="dia-mes dia-mes-otro" aria-hidden="true" />;
          }
          const conteo = dias[dia];
          // Solo cuentan los vigentes; un día con turnos todos cancelados lo indica aparte
          const cancelados = conteo?.cancelado ?? 0;
          const total = (conteo?.total ?? 0) - cancelados;
          const descripcion = total > 0 ? `${total} turno${total === 1 ? '' : 's'}` : cancelados > 0 ? `${cancelados} cancelado${cancelados === 1 ? '' : 's'}` : '0 turnos';

          return (
            <button
              key={dia}
              type="button"
              role="gridcell"
              className={`dia-mes ${dia === hoy ? 'dia-mes-hoy' : ''} ${dia === diaElegido ? 'dia-mes-elegido' : ''}`}
              aria-label={`${fechaLarga(dia)}${dia === hoy ? ' (hoy)' : ''}: ${descripcion}`}
              onClick={() => setDiaElegido(dia)}
            >
              <span className="dia-mes-numero">{Number(dia.slice(8))}</span>
              {total > 0 || cancelados > 0 ? (
                <span className={`dia-mes-cantidad etiqueta-${estadoPredominante(conteo)}`}>{descripcion}</span>
              ) : (
                <span className="dia-mes-vacio">Sin turnos</span>
              )}
            </button>
          );
        })}
      </div>

      {diaElegido && !turnoElegido && <ListaDelDia fecha={diaElegido} alCerrar={() => setDiaElegido(null)} alElegir={setTurnoElegido} />}
      {diaElegido && turnoElegido && (
        <DetalleConDatosActuales
          id={turnoElegido.id_turno}
          alCerrar={() => {
            setTurnoElegido(null);
            setDiaElegido(null);
          }}
          alVolver={() => setTurnoElegido(null)}
          alCancelar={(t) => {
            setTurnoElegido(null);
            resumen.recargar();
            aviso.mostrar(`✅ Turno cancelado: ${t.paciente} — ${t.hora}.`);
          }}
        />
      )}
      {aviso.elemento}
    </section>
  );
}

/** Lista de los turnos de un día (modal 1 de recepcionista_mes.php). */
function ListaDelDia({ fecha, alCerrar, alElegir }: { fecha: string; alCerrar: () => void; alElegir: (t: Turno) => void }) {
  const { datos, error, cargando, recargar } = useDatos(() => apiTurnos.delDia(fecha), [fecha]);

  return (
    <Ventana
      titulo={`📋 Turnos — ${fechaLarga(fecha)} de ${fecha.slice(0, 4)}`}
      alCerrar={alCerrar}
      pie={
        <>
          <Link to={`/recepcion/turnos/nuevo?fecha=${fecha}`} className="boton boton-primario">
            ⊕ Registrar turno este día
          </Link>
          <Link to={`/recepcion/agenda/dia?fecha=${fecha}`} className="boton boton-secundario">
            📅 Abrir en vista Día
          </Link>
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      {cargando && <Cargando texto="Cargando turnos…" />}
      {error !== null && <MensajeError error={error} alReintentar={recargar} />}
      {datos && !cargando && datos.turnos.length === 0 && (
        <Vacio>
          🗓️ No hay turnos registrados para este día. Usá «Registrar turno este día» para agendar uno.
        </Vacio>
      )}
      {datos && !cargando && datos.turnos.length > 0 && (
        <ul className="lista-dia">
          {datos.turnos.map((t) => (
            <li key={t.id_turno}>
              <button type="button" className="lista-dia-item" onClick={() => alElegir(t)}>
                <span className="hora-pastilla">{t.hora}</span>
                <span className="lista-dia-info">
                  <strong>{t.paciente}</strong>
                  <span className="secundario">
                    {t.medico} · {t.especialidad}
                  </span>
                </span>
                <EtiquetaEstado estado={t.estado} />
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Ventana>
  );
}

/** Detalle leído de nuevo del backend (GET /api/turnos/:id), como hacía la vista Mes de PHP. */
function DetalleConDatosActuales({ id, alCerrar, alVolver, alCancelar }: { id: number; alCerrar: () => void; alVolver: () => void; alCancelar: (t: Turno) => void }) {
  const { datos, error, cargando, recargar } = useDatos(() => apiTurnos.detalle(id), [id]);

  if (datos && !cargando) {
    return <DetalleTurno turno={datos.turno} alCerrar={alCerrar} alVolver={alVolver} alCancelar={alCancelar} conEnlaceAlDia />;
  }

  return (
    <Ventana titulo="📄 Detalle del turno" oscura angosta alCerrar={alCerrar}>
      {cargando && <Cargando texto="Cargando detalle…" />}
      {error !== null && <MensajeError error={error} alReintentar={recargar} />}
    </Ventana>
  );
}
