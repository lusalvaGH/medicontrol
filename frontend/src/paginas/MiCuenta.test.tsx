import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { auth, cuenta } from '../api/servicios';
import type { DatosCuenta, UsuarioSesion } from '../api/tipos';
import { RutaProtegida } from '../sesion/RutaProtegida';
import { ProveedorSesion } from '../sesion/SesionContexto';
import { MiCuenta } from './MiCuenta';

const usuario = (extra: Partial<UsuarioSesion> = {}): UsuarioSesion => ({
  id_usuario: 9,
  nombre: 'Ana',
  apellido: 'Paz',
  email: 'ana@demo.test',
  rol: 'paciente',
  debe_cambiar_contrasena: false,
  ...extra,
});
const datos: DatosCuenta = {
  nombre: 'Ana',
  apellido: 'Paz',
  dni: '30111222',
  email: 'ana@demo.test',
  rol: 'paciente',
  telefono: '+54 11 1234-5678',
  direccion: null,
  fecha_nacimiento: '1990-01-01',
  genero: 'Femenino',
  obra_social: 'OSDE',
};

function montar() {
  render(
    <ProveedorSesion>
      <MemoryRouter initialEntries={['/mi-cuenta']}>
        <Routes>
          <Route element={<RutaProtegida roles={['recepcionista', 'medico', 'paciente']} />}>
            <Route path="/mi-cuenta" element={<MiCuenta />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ProveedorSesion>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Mi cuenta', () => {
  it('el paciente edita sus datos de contacto; el DNI no se puede editar', async () => {
    vi.spyOn(auth, 'usuarioActual').mockResolvedValue(usuario());
    vi.spyOn(cuenta, 'datos').mockResolvedValue(datos);
    const actualizar = vi.spyOn(cuenta, 'actualizar').mockResolvedValue({ ...datos, telefono: '+54 11 9999-0000' });
    montar();

    const telefono = (await screen.findByLabelText('Teléfono (opcional)')) as HTMLInputElement;
    expect((screen.getByLabelText('DNI') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(telefono, { target: { value: '+54 11 9999-0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => expect(screen.getByText('Tus datos se guardaron correctamente.')).toBeTruthy());
    const enviado = actualizar.mock.calls[0][0];
    expect(enviado.telefono).toBe('+54 11 9999-0000');
    // Sin cambio de correo no se envía la contraseña
    expect(enviado).not.toHaveProperty('contrasena_actual');
    expect(enviado).not.toHaveProperty('dni');
  });

  it('cambiar el correo pide la contraseña actual', async () => {
    vi.spyOn(auth, 'usuarioActual').mockResolvedValue(usuario());
    vi.spyOn(cuenta, 'datos').mockResolvedValue(datos);
    const actualizar = vi.spyOn(cuenta, 'actualizar').mockResolvedValue({ ...datos, email: 'nueva@demo.test' });
    montar();

    fireEvent.change(await screen.findByLabelText('Correo electrónico'), { target: { value: 'nueva@demo.test' } });
    const contrasena = screen.getByLabelText('Contraseña actual (para cambiar el correo)');
    fireEvent.change(contrasena, { target: { value: 'secreta123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    await waitFor(() => expect(actualizar).toHaveBeenCalled());
    expect(actualizar.mock.calls[0][0]).toMatchObject({ email: 'nueva@demo.test', contrasena_actual: 'secreta123' });
  });

  it('con una contraseña provisoria solo muestra el cambio de contraseña', async () => {
    vi.spyOn(auth, 'usuarioActual').mockResolvedValue(usuario({ debe_cambiar_contrasena: true }));
    const leerDatos = vi.spyOn(cuenta, 'datos').mockResolvedValue(datos);
    montar();

    expect(await screen.findByText(/Tu contraseña es provisoria/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gestión de Seguridad' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Mis datos' })).toBeNull();
    expect(leerDatos).not.toHaveBeenCalled();
  });
});
