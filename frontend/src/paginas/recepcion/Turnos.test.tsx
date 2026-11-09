import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { catalogo, turnos } from '../../api/servicios';
import type { Horario, Turno } from '../../api/tipos';
import { VistaMes } from '../../calendario/VistaMes';
import { VistaSemana } from '../../calendario/VistaSemana';
import { Agenda } from './Agenda';
import { NuevoTurno } from './NuevoTurno';

const turno = (extra: Partial<Turno> = {}): Turno => ({
  id_turno: 7,
  fecha: '2030-06-14',
  hora: '10:00',
  estado: 'pendiente',
  motivo_consulta: 'Control',
  id_paciente: 3,
  paciente: 'Ana Paz',
  paciente_dni: '30111222',
  obra_social: 'Particular',
  id_medico: 2,
  medico: 'Luis Gómez',
  especialidad: 'Clínica',
  ...extra,
});

const horarios = (libres: string[]): Horario[] => ['10:00', '10:30', '11:00'].map((hora) => ({ hora, estado: libres.includes(hora) ? 'libre' : 'ocupado' }));

function montar(ruta: string, elemento: React.ReactElement, patron: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path={patron} element={elemento} />
        <Route path="/recepcion/agenda/dia" element={<p>vista día</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('Vista Día', () => {
  const montarDia = () => montar('/recepcion/agenda/dia?fecha=2030-06-14', <Agenda />, '/recepcion/agenda/dia');

  it('muestra los totales, la línea de tiempo y selecciona el primer turno en la ficha', async () => {
    const delDia = vi.spyOn(turnos, 'delDia').mockResolvedValue({
      fecha: '2030-06-14',
      turnos: [turno(), turno({ id_turno: 8, hora: '10:30', paciente: 'Juan Sosa', estado: 'confirmado' })],
    });
    montarDia();
    const ficha = await screen.findByRole('complementary', { name: 'Paciente seleccionado' });
    expect(delDia).toHaveBeenCalledWith('2030-06-14');
    expect(within(ficha).getByText('Ana Paz')).toBeTruthy();
    expect(screen.getByText('Turnos del día').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('Confirmados').nextSibling?.textContent).toBe('1');
    // Tocar otro turno lo selecciona en la ficha
    fireEvent.click(screen.getByRole('button', { name: '10:30, Juan Sosa, con Luis Gómez' }));
    expect(within(ficha).getByText('Juan Sosa')).toBeTruthy();
  });

  it('el buscador y la especialidad filtran la línea de tiempo', async () => {
    vi.spyOn(turnos, 'delDia').mockResolvedValue({
      fecha: '2030-06-14',
      turnos: [turno(), turno({ id_turno: 8, hora: '10:30', paciente: 'Juan Sosa', especialidad: 'Cardiología' })],
    });
    montarDia();
    await screen.findByRole('button', { name: /Ana Paz/ });
    fireEvent.change(screen.getByLabelText('Buscar paciente o médico'), { target: { value: 'SOSA' } });
    expect(screen.queryByRole('button', { name: /Ana Paz/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Juan Sosa/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar paciente o médico'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Clínica' } });
    expect(screen.queryByRole('button', { name: /Juan Sosa/ })).toBeNull();
  });

  it('Modificar: elige otro horario libre y cambia el estado con la misma llamada al backend', async () => {
    const delDia = vi.spyOn(turnos, 'delDia').mockResolvedValue({ fecha: '2030-06-14', turnos: [turno()] });
    vi.spyOn(catalogo, 'disponibilidad').mockResolvedValue({ id_medico: 2, fecha: '2030-06-14', horarios: horarios(['11:00']) });
    const modificar = vi.spyOn(turnos, 'modificar').mockResolvedValue({ turno: turno({ hora: '11:00', estado: 'confirmado' }), sin_cambios: false });
    montarDia();
    fireEvent.click(await screen.findByRole('button', { name: '✏️ Modificar este turno' }));
    const ventana = await screen.findByRole('dialog', { name: '✏️ Modificar y ajustar turno' });
    // El horario actual del turno se ofrece como elegible aunque figure ocupado por el propio turno
    expect(within(ventana).getByRole('button', { name: '10:00, libre' })).toBeTruthy();
    expect(within(ventana).getByRole('button', { name: '10:30, ocupado' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(ventana).getByRole('button', { name: '11:00, libre' }));
    fireEvent.change(within(ventana).getByLabelText('Estado del turno'), { target: { value: 'confirmado' } });
    fireEvent.click(within(ventana).getByRole('button', { name: '✓ Guardar modificaciones' }));

    await waitFor(() => expect(modificar).toHaveBeenCalledWith(7, { fecha: '2030-06-14', hora: '11:00', estado: 'confirmado' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(delDia).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Turno guardado: Ana Paz/)).toBeTruthy();
  });

  it('Cancelar pide confirmación en la misma ventana y muestra el error del backend', async () => {
    vi.spyOn(turnos, 'delDia').mockResolvedValue({ fecha: '2030-06-14', turnos: [turno()] });
    vi.spyOn(catalogo, 'disponibilidad').mockResolvedValue({ id_medico: 2, fecha: '2030-06-14', horarios: horarios([]) });
    const cancelar = vi.spyOn(turnos, 'cancelar').mockRejectedValue(new ErrorApi(409, 'TURNO_MODIFICADO', 'El turno cambió mientras se cancelaba.'));
    montarDia();
    fireEvent.click(await screen.findByRole('button', { name: '✏️ Modificar este turno' }));
    const ventana = await screen.findByRole('dialog');
    fireEvent.click(within(ventana).getByRole('button', { name: '❌ Cancelar turno' }));
    expect(cancelar).not.toHaveBeenCalled();
    fireEvent.click(within(ventana).getByRole('button', { name: 'Sí, cancelar' }));
    expect(await within(ventana).findByText('El turno cambió mientras se cancelaba.')).toBeTruthy();
    expect(cancelar).toHaveBeenCalledWith(7);
  });

  it('un turno atendido no se puede modificar ni cancelar', async () => {
    vi.spyOn(turnos, 'delDia').mockResolvedValue({ fecha: '2030-06-14', turnos: [turno({ estado: 'atendido' })] });
    montarDia();
    expect(await screen.findByRole('button', { name: '✏️ Modificar este turno' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: '📄 Ver detalle breve' }));
    const ventana = await screen.findByRole('dialog', { name: '📄 Detalle del turno' });
    expect(within(ventana).queryByRole('button', { name: '❌ Cancelar turno' })).toBeNull();
    expect(within(ventana).getByText('#7')).toBeTruthy();
  });
});

describe('Vista Semana', () => {
  it('reparte los turnos de lunes a domingo y abre el detalle al tocar uno', async () => {
    const rango = vi.spyOn(turnos, 'delRango').mockResolvedValue({
      desde: '2030-06-10',
      hasta: '2030-06-16',
      turnos: [turno({ fecha: '2030-06-10', id_turno: 1, paciente: 'Lunes Uno' }), turno({ fecha: '2030-06-14', id_turno: 2, paciente: 'Viernes Dos' })],
    });
    montar('/recepcion/agenda/semana?fecha=2030-06-14', <VistaSemana />, '/recepcion/agenda/semana');
    expect(await screen.findByText('Semana del 10 de junio al 16 de junio de 2030')).toBeTruthy();
    expect(rango).toHaveBeenCalledWith('2030-06-10', '2030-06-16');
    expect(within(screen.getByRole('region', { name: 'Lunes 10' })).getByText('Lunes Uno')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Viernes 14' })).getByText('Viernes Dos')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Martes 11' })).getByText('Sin turnos')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Viernes Dos/ }));
    const ventana = await screen.findByRole('dialog', { name: '📄 Detalle del turno' });
    expect(within(ventana).getByRole('link', { name: '📅 Abrir en vista Día' }).getAttribute('href')).toBe('/recepcion/agenda/dia?fecha=2030-06-14&turno=2');
  });

  it('las flechas cambian de semana y la pestaña Mes conserva la fecha', async () => {
    const rango = vi.spyOn(turnos, 'delRango').mockResolvedValue({ desde: '', hasta: '', turnos: [] });
    montar('/recepcion/agenda/semana?fecha=2030-06-14', <VistaSemana />, '/recepcion/agenda/semana');
    fireEvent.click(await screen.findByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() => expect(rango).toHaveBeenLastCalledWith('2030-06-17', '2030-06-23'));
    expect(screen.getByRole('link', { name: 'Mes' }).getAttribute('href')).toBe('/recepcion/agenda/mes?fecha=2030-06-01');
    expect(screen.getByRole('link', { name: 'Día' }).getAttribute('href')).toBe('/recepcion/agenda/dia?fecha=2030-06-17');
  });
});

describe('Vista Mes', () => {
  it('muestra la cantidad por día, abre la lista del día y el detalle, y vuelve', async () => {
    vi.spyOn(turnos, 'resumenMes').mockResolvedValue({
      mes: '2030-06',
      dias: { '2030-06-14': { total: 2, pendiente: 1, confirmado: 1, en_curso: 0, atendido: 0, cancelado: 0 } },
    });
    vi.spyOn(turnos, 'delDia').mockResolvedValue({ fecha: '2030-06-14', turnos: [turno()] });
    const detalle = vi.spyOn(turnos, 'detalle').mockResolvedValue({ turno: turno() });
    montar('/recepcion/agenda/mes?fecha=2030-06-01', <VistaMes />, '/recepcion/agenda/mes');

    expect(await screen.findByText('Junio 2030')).toBeTruthy();
    expect(screen.getByText('Turnos del mes').nextSibling?.textContent).toBe('2');
    const dia = screen.getByRole('gridcell', { name: '14 de junio: 2 turnos' });
    expect(within(dia).getByText('2 turnos').className).toContain('etiqueta-confirmado');
    fireEvent.click(dia);

    const lista = await screen.findByRole('dialog', { name: '📋 Turnos — 14 de junio de 2030' });
    expect(within(lista).getByRole('link', { name: '⊕ Registrar turno este día' }).getAttribute('href')).toBe('/recepcion/turnos/nuevo?fecha=2030-06-14');
    fireEvent.click(await within(lista).findByRole('button', { name: /Ana Paz/ }));

    // El detalle se vuelve a leer del backend: primero se ve cargando y después los datos
    fireEvent.click(await screen.findByRole('button', { name: '← Volver al día' }));
    expect(detalle).toHaveBeenCalledWith(7);
    expect(await screen.findByRole('dialog', { name: '📋 Turnos — 14 de junio de 2030' })).toBeTruthy();
  });

  it('un mes sin turnos (dias: []) muestra todos los días vacíos y navega entre meses', async () => {
    const resumen = vi.spyOn(turnos, 'resumenMes').mockResolvedValue({ mes: '2030-06', dias: [] });
    montar('/recepcion/agenda/mes?fecha=2030-06-01', <VistaMes />, '/recepcion/agenda/mes');
    expect(await screen.findByRole('gridcell', { name: '1 de junio: 0 turnos' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    await waitFor(() => expect(resumen).toHaveBeenLastCalledWith('2030-07'));
  });
});

describe('Nuevo turno', () => {
  const montarNuevo = (ruta = '/recepcion/turnos/nuevo?fecha=2030-06-14') => montar(ruta, <NuevoTurno />, '/recepcion/turnos/nuevo');
  const medicos = () => vi.spyOn(catalogo, 'medicos').mockResolvedValue({ medicos: [{ id_medico: 2, nombre: 'Luis', apellido: 'Gómez', especialidad: 'Clínica' }] });

  const completar = async () => {
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(await screen.findByRole('button', { name: '10:30, libre' }));
    fireEvent.change(screen.getByLabelText('Buscar por nombre, apellido o DNI'), { target: { value: 'Paz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Paz, Ana/ }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Control anual' } });
  };

  it('completa la especialidad, solo deja registrar con todo elegido y vuelve a la vista Día', async () => {
    medicos();
    vi.spyOn(catalogo, 'disponibilidad').mockResolvedValue({ id_medico: 2, fecha: '2030-06-14', horarios: horarios(['10:30']) });
    vi.spyOn(catalogo, 'pacientes').mockResolvedValue({ pacientes: [{ id_paciente: 3, nombre: 'Ana', apellido: 'Paz', dni: '30111222', obra_social: null }] });
    const crear = vi.spyOn(turnos, 'crear').mockResolvedValue({ turno: turno({ hora: '10:30' }) });
    montarNuevo();

    const registrar = () => screen.getByRole('button', { name: '✓ Registrar turno' });
    expect(registrar()).toHaveProperty('disabled', true);
    await completar();
    expect((screen.getByLabelText('Especialidad') as HTMLInputElement).value).toBe('Clínica');
    expect(screen.getByRole('button', { name: '10:00, ocupado' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(registrar());

    await waitFor(() => expect(screen.getByText('vista día')).toBeTruthy());
    expect(crear).toHaveBeenCalledWith({ id_paciente: 3, id_medico: 2, fecha: '2030-06-14', hora: '10:30', motivo_consulta: 'Control anual' });
  });

  it('si el horario se ocupó mientras tanto, muestra el error y vuelve a pedir la disponibilidad', async () => {
    medicos();
    const disponibilidad = vi.spyOn(catalogo, 'disponibilidad').mockResolvedValue({ id_medico: 2, fecha: '2030-06-14', horarios: horarios(['10:30']) });
    vi.spyOn(catalogo, 'pacientes').mockResolvedValue({ pacientes: [{ id_paciente: 3, nombre: 'Ana', apellido: 'Paz', dni: '30111222', obra_social: null }] });
    vi.spyOn(turnos, 'crear').mockRejectedValue(new ErrorApi(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para el médico seleccionado.'));
    montarNuevo();
    await completar();
    const llamadasAntes = disponibilidad.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '✓ Registrar turno' }));

    expect(await screen.findByText('Ese horario ya está ocupado para el médico seleccionado.')).toBeTruthy();
    await waitFor(() => expect(disponibilidad.mock.calls.length).toBeGreaterThan(llamadasAntes));
    expect(screen.getByRole('button', { name: '✓ Registrar turno' })).toHaveProperty('disabled', true);
  });

  it('no ofrece registrar pacientes y avisa cuando el DNI no corresponde a ningún paciente', async () => {
    medicos();
    const buscar = vi.spyOn(catalogo, 'pacientes').mockResolvedValue({ pacientes: [] });
    montarNuevo();
    expect(screen.queryByRole('link', { name: /Registrar paciente/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, apellido o DNI'), { target: { value: '38.123.456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText(/No se encontró ningún paciente registrado/)).toBeTruthy();
    expect(buscar).toHaveBeenLastCalledWith('38123456');
  });

  it('con ?dni= busca al paciente y lo deja elegido si el DNI coincide', async () => {
    medicos();
    const buscar = vi
      .spyOn(catalogo, 'pacientes')
      .mockResolvedValue({ pacientes: [{ id_paciente: 3, nombre: 'Ana', apellido: 'Paz', dni: '30111222', obra_social: 'OSDE' }] });
    montarNuevo('/recepcion/turnos/nuevo?fecha=2030-06-14&dni=30111222');

    expect(await screen.findByText(/DNI 30111222 · OSDE/)).toBeTruthy();
    expect(buscar).toHaveBeenCalledWith('30111222');
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeTruthy();
  });

  it('una búsqueda por nombre no elige sola al paciente', async () => {
    medicos();
    vi.spyOn(catalogo, 'pacientes').mockResolvedValue({ pacientes: [{ id_paciente: 3, nombre: 'Ana', apellido: 'Paz', dni: '30111222', obra_social: null }] });
    montarNuevo();
    fireEvent.change(screen.getByLabelText('Buscar por nombre, apellido o DNI'), { target: { value: 'Paz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByRole('button', { name: /Paz, Ana/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cambiar' })).toBeNull();
  });

  it('acepta el médico preelegido por la URL', async () => {
    medicos();
    const disponibilidad = vi.spyOn(catalogo, 'disponibilidad').mockResolvedValue({ id_medico: 2, fecha: '2030-06-14', horarios: horarios(['10:30']) });
    montarNuevo('/recepcion/turnos/nuevo?fecha=2030-06-14&id_medico=2');
    await waitFor(() => expect(disponibilidad).toHaveBeenCalledWith(2, '2030-06-14'));
    expect((await screen.findByLabelText('Especialidad') as HTMLInputElement).value).toBe('Clínica');
  });
});
