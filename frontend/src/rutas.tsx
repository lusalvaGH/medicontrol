import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Rol } from './api/tipos';
import { VistaMes } from './calendario/VistaMes';
import { VistaSemana } from './calendario/VistaSemana';
import { AgendaMedico } from './paginas/medico/AgendaMedico';
import { MisTurnos } from './paginas/paciente/MisTurnos';
import { Agenda } from './paginas/recepcion/Agenda';
import { Medicos } from './paginas/recepcion/Medicos';
import { NuevoPaciente } from './paginas/recepcion/NuevoPaciente';
import { NuevoTurno } from './paginas/recepcion/NuevoTurno';
import { Pacientes } from './paginas/recepcion/Pacientes';

/** /recepcion/agenda (dirección anterior) lleva a la vista Día conservando ?fecha=. */
function RedirigirAgenda() {
  const { search, state } = useLocation();

  return <Navigate to={`/recepcion/agenda/dia${search}`} replace state={state} />;
}

/** Pantallas de cada rol. Cada grupo queda detrás de RutaProtegida con su rol. */
export const rutasPorRol: { rol: Rol; rutas: { ruta: string; elemento: ReactElement }[] }[] = [
  {
    rol: 'recepcionista',
    rutas: [
      { ruta: '/recepcion/agenda', elemento: <RedirigirAgenda /> },
      { ruta: '/recepcion/agenda/dia', elemento: <Agenda /> },
      { ruta: '/recepcion/agenda/semana', elemento: <VistaSemana /> },
      { ruta: '/recepcion/agenda/mes', elemento: <VistaMes /> },
      { ruta: '/recepcion/turnos/nuevo', elemento: <NuevoTurno /> },
      { ruta: '/recepcion/pacientes', elemento: <Pacientes /> },
      { ruta: '/recepcion/pacientes/nuevo', elemento: <NuevoPaciente /> },
      { ruta: '/recepcion/medicos', elemento: <Medicos /> },
    ],
  },
  { rol: 'medico', rutas: [{ ruta: '/medico/agenda', elemento: <AgendaMedico /> }] },
  { rol: 'paciente', rutas: [{ ruta: '/paciente/turnos', elemento: <MisTurnos /> }] },
];
