import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { misTurnos } from '../../api/servicios';
import type { TurnoAgendaMedico } from '../../api/tipos';
import { AgendaMedico } from './AgendaMedico';

const turno = (extra: Partial<TurnoAgendaMedico> = {}): TurnoAgendaMedico => ({
  id_turno: 7,
  fecha: '2026-11-20',
  hora: '10:00',
  estado: 'confirmado',
  motivo_consulta: 'Control',
  notas_medicas: null,
  id_paciente: 3,
  paciente: 'Ana Paz',
  paciente_dni: '30111222',
  obra_social: 'OSDE',
  telefono: null,
  ...extra,
});

function montar() {
  render(
    <MemoryRouter initialEntries={['/medico/agenda?fecha=2026-11-20']}>
      <AgendaMedico />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Agenda del médico', () => {
  it('el total no cuenta los cancelados', async () => {
    vi.spyOn(misTurnos, 'agendaMedico').mockResolvedValue({ fecha: '2026-11-20', turnos: [turno(), turno({ id_turno: 8, hora: '11:00', estado: 'cancelado' })] });
    montar();
    const resumen = await screen.findByLabelText('Turnos por estado');
    expect(resumen.textContent).toContain('Total: 1');
    expect(resumen.textContent).toContain('Cancelado: 1');
  });

  it('guarda las notas de un turno y vuelve a cargar la agenda', async () => {
    const agenda = vi.spyOn(misTurnos, 'agendaMedico').mockResolvedValue({ fecha: '2026-11-20', turnos: [turno()] });
    const guardar = vi.spyOn(misTurnos, 'guardarNotas').mockResolvedValue({ id_turno: 7, notas_medicas: 'Presión normal.' });
    montar();

    fireEvent.click(await screen.findByRole('button', { name: 'Notas del turno de Ana Paz a las 10:00' }));
    const ventana = await screen.findByRole('dialog');
    fireEvent.change(within(ventana).getByLabelText('Notas médicas'), { target: { value: 'Presión normal.' } });
    fireEvent.click(within(ventana).getByRole('button', { name: 'Guardar notas' }));

    await waitFor(() => expect(screen.getByText(/Notas guardadas: Ana Paz/)).toBeTruthy());
    expect(guardar).toHaveBeenCalledWith(7, 'Presión normal.');
    expect(agenda).toHaveBeenCalledTimes(2);
  });

  it('el historial pide solo los turnos de ese paciente con el médico', async () => {
    vi.spyOn(misTurnos, 'agendaMedico').mockResolvedValue({ fecha: '2026-11-20', turnos: [turno()] });
    const historial = vi.spyOn(misTurnos, 'historial').mockResolvedValue({
      paciente: { id_paciente: 3, paciente: 'Ana Paz', paciente_dni: '30111222', obra_social: 'OSDE' },
      turnos: [{ id_turno: 2, fecha: '2026-10-01', hora: '09:00', estado: 'atendido', motivo_consulta: 'Primera consulta', notas_medicas: 'Sin novedades.' }],
    });
    montar();

    fireEvent.click(await screen.findByRole('button', { name: 'Historial de Ana Paz' }));
    const ventana = await screen.findByRole('dialog');
    expect(await within(ventana).findByText('Primera consulta')).toBeTruthy();
    expect(within(ventana).getByText('Notas: Sin novedades.')).toBeTruthy();
    expect(historial).toHaveBeenCalledWith(3);
  });
});
