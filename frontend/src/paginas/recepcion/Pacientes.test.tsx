import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { usuarios } from '../../api/servicios';
import type { ListadoUsuarios, UsuarioGestion } from '../../api/tipos';
import { Pacientes } from './Pacientes';

const paciente = (extra: Partial<UsuarioGestion> = {}): UsuarioGestion => ({
  id_usuario: 5,
  nombre: 'Ana',
  apellido: 'Paz',
  dni: '30111222',
  email: 'ana@demo.test',
  rol: 'paciente',
  estado: 'activo',
  especialidad: null,
  matricula: null,
  obra_social: 'OSDE',
  telefono: null,
  gestionable: true,
  ...extra,
});

const listado = (lista: UsuarioGestion[]): ListadoUsuarios => ({ usuarios: lista, total: lista.length, pagina: 1, por_pagina: 10, paginas: 1, especialidades: [] });

function NuevoTurnoFalso() {
  const { search } = useLocation();

  return <p>nuevo turno {search}</p>;
}

function montar() {
  render(
    <MemoryRouter initialEntries={['/recepcion/pacientes']}>
      <Routes>
        <Route path="/recepcion/pacientes" element={<Pacientes />} />
        <Route path="/recepcion/turnos/nuevo" element={<NuevoTurnoFalso />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Pacientes (recepción)', () => {
  it('no ofrece crear pacientes', async () => {
    vi.spyOn(usuarios, 'listar').mockResolvedValue(listado([paciente()]));
    montar();
    await screen.findByText('Paz, Ana');
    expect(screen.queryByRole('link', { name: /Nuevo paciente/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nuevo paciente|Registrar paciente/ })).toBeNull();
  });

  it('busca por DNI sin puntos y muestra el aviso si no hay ningún paciente registrado', async () => {
    const listar = vi.spyOn(usuarios, 'listar').mockResolvedValue(listado([]));
    montar();
    fireEvent.change(screen.getByLabelText('Buscar por DNI, nombre o correo'), { target: { value: ' 38.123.456 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'pacientes', buscar: '38123456' })));
    expect(await screen.findByText('No se encontró ningún paciente registrado con esos datos.')).toBeTruthy();
  });

  it('el paciente encontrado se elige para registrarle un turno; los inactivos no', async () => {
    vi.spyOn(usuarios, 'listar').mockResolvedValue(listado([paciente(), paciente({ id_usuario: 6, nombre: 'Luis', apellido: 'Baja', dni: '30999888', estado: 'inactivo' })]));
    montar();
    await screen.findByText('Paz, Ana');
    expect(screen.queryByRole('link', { name: 'Registrar turno para Luis Baja' })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Registrar turno para Ana Paz' }));
    expect(await screen.findByText('nuevo turno ?dni=30111222')).toBeTruthy();
  });
});
