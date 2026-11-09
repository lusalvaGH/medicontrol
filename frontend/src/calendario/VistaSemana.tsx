import { useState } from 'react';
import { Link } from 'react-router-dom';
import { turnos as apiTurnos } from '../api/servicios';
import type { Turno } from '../api/tipos';
import { Aviso, Cargando, MensajeError } from '../componentes/Estados';
import { hoyEnClinica, sumarDias } from '../utilidades/fechas';
import { useDatos } from '../utilidades/useDatos';
import { useAvisoFlotante } from './Aviso';
import { BarraCalendario } from './BarraCalendario';
import { DetalleTurno } from './DetalleTurno';
import { MESES, diasDeLaSemana, nombreCortoDelDia, tituloDeLaSemana } from './fechas';
import { especialidadesDe, filtrarTurnos, totalesDeTurnos, type FiltroTurnos } from './filtros';
import { TarjetaTurno } from './TarjetaTurno';
import { useFechaDeLaUrl } from './useFechaDeLaUrl';

/**
 * Vista Semana (recepcionista_semana.php): lunes a domingo con los turnos de cada día
 * (GET /api/turnos?desde=&hasta=). Al tocar un turno se abre su detalle.
 */
export function VistaSemana() {
  const { fecha, fechaInvalida, irA } = useFechaDeLaUrl();
  const dias = diasDeLaSemana(fecha);
  const [desde, hasta] = [dias[0], dias[6]];
  const hoy = hoyEnClinica();
  const aviso = useAvisoFlotante();
  const { datos, error, cargando, recargar } = useDatos(() => apiTurnos.delRango(desde, hasta), [desde, hasta]);
  const [filtro, setFiltro] = useState<FiltroTurnos>({ buscar: '', especialidad: '' });
  const [elegido, setElegido] = useState<Turno | null>(null);

  const turnos = datos?.turnos ?? [];
  const visibles = filtrarTurnos(turnos, filtro);

  return (
    <section>
      {fechaInvalida && <Aviso tipo="info">⚠️ La fecha indicada no es válida. Se muestra la semana actual.</Aviso>}
      <BarraCalendario
        vista="semana"
        fecha={fecha}
        totales={datos ? totalesDeTurnos(turnos) : null}
        rotuloTotal="Turnos de la semana"
        filtro={filtro}
        alFiltrar={setFiltro}
        especialidades={especialidadesDe(turnos)}
        navegacion={
          <div className="navegacion-fecha">
            <button type="button" className="boton boton-secundario" onClick={() => irA(sumarDias(desde, -7))} aria-label="Semana anterior">
              ‹
            </button>
            <h1 className="titulo-periodo">{tituloDeLaSemana(fecha)}</h1>
            <button type="button" className="boton boton-secundario" onClick={() => irA(sumarDias(desde, 7))} aria-label="Semana siguiente">
              ›
            </button>
            <button type="button" className="boton boton-secundario boton-chico" onClick={() => irA(hoy)}>
              Esta semana
            </button>
            <input type="date" aria-label="Ir a la semana de una fecha" value={fecha} onChange={(e) => e.target.value && irA(e.target.value)} />
          </div>
        }
      />
      <p className="pista">🤚 Tocá un turno para ver su detalle. Para modificarlo, abrilo en la vista Día.</p>

      {cargando && !datos && <Cargando />}
      {error !== null && <MensajeError error={error} alReintentar={recargar} />}

      <div className="grilla-semana">
        {dias.map((dia) => {
          const delDia = visibles.filter((t) => t.fecha === dia);

          return (
            <section key={dia} className={`columna-dia ${dia === hoy ? 'columna-dia-hoy' : ''}`} aria-label={nombreCortoDelDia(dia)}>
              <Link to={`/recepcion/agenda/dia?fecha=${dia}`} className="columna-dia-encabezado" title="Abrir este día en la vista Día">
                <h2>
                  {nombreCortoDelDia(dia)}
                  {dia === hoy ? ' · Hoy' : ''}
                </h2>
                <p>{MESES[Number(dia.slice(5, 7)) - 1]}</p>
              </Link>
              {datos && delDia.length === 0 && <p className="columna-dia-vacia">Sin turnos</p>}
              {delDia.map((t) => (
                <TarjetaTurno key={t.id_turno} turno={t} compacta seleccionada={elegido?.id_turno === t.id_turno} alElegir={setElegido} />
              ))}
            </section>
          );
        })}
      </div>
      {datos && turnos.length > 0 && visibles.length === 0 && <p className="vacio">🔍 No se encontraron turnos que coincidan con la búsqueda.</p>}

      {elegido && (
        <DetalleTurno
          turno={elegido}
          conEnlaceAlDia
          alCerrar={() => setElegido(null)}
          alCancelar={(t) => {
            setElegido(null);
            recargar();
            aviso.mostrar(`✅ Turno cancelado: ${t.paciente} — ${t.hora}.`);
          }}
        />
      )}
      {aviso.elemento}
    </section>
  );
}
