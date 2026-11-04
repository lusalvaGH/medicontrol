import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { usuarios } from '../../api/servicios';
import { NuevoPaciente } from './NuevoPaciente';

function montar() {
  render(
    <MemoryRouter initialEntries={['/recepcion/pacientes/nuevo']}>
      <Routes>
        <Route path="/recepcion/pacientes/nuevo" element={<NuevoPaciente />} />
        <Route path="/recepcion/pacientes" element={<p>listado de pacientes</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const completar = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

afterEach(cleanup);
// jsdom no implementa el desplazamiento de la ventana
window.scrollTo = vi.fn() as never;

describe('Alta de paciente', () => {
  it('envía el rol paciente con los datos cargados y vuelve al listado', async () => {
    const crear = vi.spyOn(usuarios, 'crear').mockResolvedValue({ usuario: { nombre: 'Ana', apellido: 'Paz', dni: '30111222' } } as never);
    montar();
    completar('Nombre', 'Ana');
    completar('Apellido', 'Paz');
    completar('DNI', '30111222');
    completar('Correo electrónico', 'ana@demo.test');
    completar('Contraseña', 'Provisoria2026');
    completar('Repetir contraseña', 'Provisoria2026');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar paciente' }));

    await waitFor(() => expect(screen.getByText('listado de pacientes')).toBeTruthy());
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ rol: 'paciente', nombre: 'Ana', dni: '30111222', contrasena: 'Provisoria2026' }));
  });

  it('muestra el mensaje general y el de cada campo que devuelve el backend', async () => {
    vi.spyOn(usuarios, 'crear').mockRejectedValue(
      new ErrorApi(409, 'DATO_DUPLICADO', 'Hay datos que ya pertenecen a otro usuario.', { dni: 'Ese DNI ya está registrado.' }),
    );
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar paciente' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Hay datos que ya pertenecen a otro usuario.');
    expect(screen.getByText('Ese DNI ya está registrado.')).toBeTruthy();
    expect(screen.getByLabelText('DNI').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: 'Registrar paciente' })).toHaveProperty('disabled', false);
  });
});
