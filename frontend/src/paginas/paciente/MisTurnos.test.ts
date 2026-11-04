import { describe, expect, it } from 'vitest';
import type { TurnoPaciente } from '../../api/tipos';
import { separarTurnos } from './MisTurnos';

const t = (id: number, fecha: string, hora: string, estado: TurnoPaciente['estado']): TurnoPaciente => ({
  id_turno: id,
  fecha,
  hora,
  estado,
  motivo_consulta: 'Control',
  medico_nombre: 'Luis',
  medico_apellido: 'Gómez',
  medico_especialidad: 'Clínica',
});

describe('turnos del paciente', () => {
  it('separa próximos de anteriores con la hora de la clínica; cancelados y atendidos van a anteriores', () => {
    const lista = [t(1, '2026-11-04', '09:00', 'atendido'), t(2, '2026-11-04', '10:00', 'pendiente'), t(3, '2026-11-04', '11:00', 'pendiente'), t(4, '2026-11-06', '09:00', 'cancelado'), t(5, '2026-11-07', '09:00', 'confirmado')];
    const { proximos, anteriores } = separarTurnos(lista, '2026-11-04 10:30');
    expect(proximos.map((x) => x.id_turno)).toEqual([3, 5]);
    // Los anteriores, del más reciente al más viejo
    expect(anteriores.map((x) => x.id_turno)).toEqual([4, 2, 1]);
  });
});
