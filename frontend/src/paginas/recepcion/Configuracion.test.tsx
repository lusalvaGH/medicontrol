import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { auth, usuarios } from '../../api/servicios';
import type { ListadoUsuarios, UsuarioGestion } from '../../api/tipos';
import { RutaProtegida } from '../../sesion/RutaProtegida';
import { ProveedorSesion } from '../../sesion/SesionContexto';
import { MiCuenta } from '../MiCuenta';
import { Configuracion } from './Configuracion';

const persona = (extra: Partial<UsuarioGestion> = {}): UsuarioGestion => ({
  id_usuario: 10,
  nombre: 'Luis',
  apellido: 'Gómez',
  dni: '30111222',
  email: 'luis@demo.test',
  rol: 'medico',
  estado: 'activo',
  especialidad: 'Clínica',
  matricula: 'MN 1',
  obra_social: null,
  telefono: null,
  gestionable: true,
  ...extra,
});
const recepcionista = persona({ id_usuario: 11, nombre: 'Elena', apellido: 'Martínez', rol: 'recepcionista', especialidad: null, matricula: null, gestionable: false });
const paciente = persona({ id_usuario: 12, nombre: 'Ana', apellido: 'Paz', rol: 'paciente', especialidad: null, matricula: null, obra_social: 'OSDE', estado: 'inactivo' });
const listado = (lista: UsuarioGestion[]): ListadoUsuarios => ({ usuarios: lista, total: lista.length, pagina: 1, por_pagina: 10, paginas: 1, especialidades: ['Clínica'] });

function montar(ruta = '/recepcion/configuracion', rol: 'recepcionista' | 'paciente' = 'recepcionista') {
  vi.spyOn(auth, 'usuarioActual').mockResolvedValue({ id_usuario: 1, nombre: 'Elena', apellido: 'Martínez', email: 'operador@demo.test', rol });
  render(
    <ProveedorSesion>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route element={<RutaProtegida roles={['recepcionista']} />}>
            <Route path="/recepcion/configuracion" element={<Configuracion />} />
          </Route>
          <Route element={<RutaProtegida roles={['recepcionista', 'medico', 'paciente']} />}>
            <Route path="/mi-cuenta" element={<MiCuenta />} />
          </Route>
          <Route path="/paciente/turnos" element={<p>mis turnos</p>} />
        </Routes>
      </MemoryRouter>
    </ProveedorSesion>,
  );
}

let listar: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  listar = vi.spyOn(usuarios, 'listar').mockImplementation(async (f) => listado(f.tipo === 'pacientes' ? [paciente] : [persona(), recepcionista]));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Configuración del Sistema', () => {
  it('muestra las secciones de la pantalla PHP y la contraseña propia', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Configuración del Sistema' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gestión de Seguridad' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gestión de Usuarios y Médicos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Roles y permisos' })).toBeTruthy();
    expect(await screen.findByText('Dr/a. Luis Gómez')).toBeTruthy();
  });

  it('un médico se edita, y otro recepcionista solo se consulta', async () => {
    montar();
    await screen.findByText('Dr/a. Luis Gómez');
    expect(screen.getByRole('button', { name: 'Editar a Luis Gómez' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dar de baja a Luis Gómez' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver datos de Elena Martínez' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar a Elena Martínez' })).toBeNull();
  });

  it('en Pacientes no hay forma de crear pacientes', async () => {
    montar('/recepcion/configuracion?tipo=pacientes');
    expect(await screen.findByRole('heading', { name: 'Gestión de Pacientes' })).toBeTruthy();
    await screen.findByText('Ana Paz');
    expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull();
    expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'pacientes' }));
    // Paciente inactivo: se ofrece reactivar
    expect(screen.getByRole('button', { name: 'Reactivar a Ana Paz' })).toBeTruthy();
  });

  it('edita un médico con PATCH y muestra los errores por campo del backend', async () => {
    vi.spyOn(usuarios, 'detalle').mockResolvedValue({ usuario: persona() });
    const modificar = vi
      .spyOn(usuarios, 'modificar')
      .mockRejectedValueOnce(new ErrorApi(409, 'DATO_DUPLICADO', 'Hay datos que ya pertenecen a otro usuario.', { email: 'Ese correo ya está registrado.' }))
      .mockResolvedValueOnce({ usuario: persona({ especialidad: 'Cardiología' }) });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Luis Gómez' }));

    const ventana = await screen.findByRole('dialog', { name: 'Editar a Luis Gómez (Médico)' });
    fireEvent.change(within(ventana).getByLabelText('Especialidad'), { target: { value: 'Cardiología' } });
    fireEvent.click(within(ventana).getByRole('button', { name: 'Guardar' }));
    expect(await within(ventana).findByText('Ese correo ya está registrado.')).toBeTruthy();
    expect(within(ventana).getByLabelText('Correo electrónico').getAttribute('aria-invalid')).toBe('true');

    fireEvent.click(within(ventana).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Los datos se guardaron correctamente.')).toBeTruthy();
    expect(modificar).toHaveBeenLastCalledWith(10, expect.objectContaining({ especialidad: 'Cardiología', nombre: 'Luis', dni: '30111222' }));
    expect(modificar.mock.calls[0][1]).not.toHaveProperty('contrasena');
  });

  it('agrega un médico con su contraseña provisoria', async () => {
    const crear = vi.spyOn(usuarios, 'crearMedico').mockResolvedValue({ usuario: persona() });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar médico' }));
    const ventana = await screen.findByRole('dialog', { name: 'Agregar médico' });
    for (const [etiqueta, valor] of [
      ['Nombre', 'Sofía'],
      ['Apellido', 'Ríos'],
      ['DNI', '30222333'],
      ['Correo electrónico', 'sofia@demo.test'],
      ['Especialidad', 'Pediatría'],
      ['Contraseña provisoria', 'Provisoria2026'],
      ['Repetir contraseña', 'Provisoria2026'],
    ]) {
      fireEvent.change(within(ventana).getByLabelText(etiqueta), { target: { value: valor } });
    }
    fireEvent.click(within(ventana).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El médico se registró correctamente.')).toBeTruthy();
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Sofía', especialidad: 'Pediatría', contrasena: 'Provisoria2026' }));
  });

  it('confirma la baja antes de enviarla y muestra el rechazo del backend', async () => {
    const baja = vi
      .spyOn(usuarios, 'darDeBaja')
      .mockRejectedValue(new ErrorApi(409, 'TURNOS_SIN_RESOLVER', 'El médico tiene 2 turno(s) futuro(s) o en curso.'));
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Dar de baja a Luis Gómez' }));
    const ventana = await screen.findByRole('dialog', { name: 'Dar de baja' });
    expect(baja).not.toHaveBeenCalled();
    fireEvent.click(within(ventana).getByRole('button', { name: 'Dar de baja' }));

    expect(await within(ventana).findByText('El médico tiene 2 turno(s) futuro(s) o en curso.')).toBeTruthy();
    expect(baja).toHaveBeenCalledWith(10);
  });

  it('asigna una contraseña provisoria', async () => {
    const provisoria = vi.spyOn(usuarios, 'contrasenaProvisoria').mockResolvedValue({ actualizada: true });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar contraseña provisoria a Luis Gómez' }));
    const ventana = await screen.findByRole('dialog', { name: 'Contraseña provisoria' });
    fireEvent.change(within(ventana).getByLabelText('Contraseña provisoria'), { target: { value: 'Provisoria2026' } });
    fireEvent.change(within(ventana).getByLabelText('Repetir contraseña'), { target: { value: 'Provisoria2026' } });
    fireEvent.click(within(ventana).getByRole('button', { name: 'Asignar' }));

    expect(await screen.findByText('La contraseña provisoria se asignó correctamente.')).toBeTruthy();
    expect(provisoria).toHaveBeenCalledWith(10, 'Provisoria2026', 'Provisoria2026');
  });

  it('un paciente que entra a Configuración vuelve a su panel', async () => {
    montar('/recepcion/configuracion', 'paciente');
    expect(await screen.findByText('mis turnos')).toBeTruthy();
  });
});

describe('Gestión de Seguridad (Mi cuenta)', () => {
  const completar = (actual: string, nueva: string, confirmacion: string) => {
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: actual } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: nueva } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: confirmacion } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));
  };

  it('valida antes de enviar: campos completos y contraseñas iguales', async () => {
    const cambiar = vi.spyOn(auth, 'cambiarContrasena').mockResolvedValue();
    montar('/mi-cuenta', 'paciente');
    await screen.findByRole('heading', { name: 'Mi cuenta' });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));
    expect(screen.getByText('Completá todos los campos.')).toBeTruthy();
    completar('Vieja2026', 'Nueva2026', 'Otra2026');
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(cambiar).not.toHaveBeenCalled();
  });

  it('cambia la contraseña y limpia el formulario', async () => {
    const cambiar = vi.spyOn(auth, 'cambiarContrasena').mockResolvedValue();
    montar('/mi-cuenta', 'paciente');
    await screen.findByRole('heading', { name: 'Mi cuenta' });
    completar('Vieja2026', 'Nueva2026', 'Nueva2026');

    expect(await screen.findByText('Tu contraseña se actualizó correctamente.')).toBeTruthy();
    expect(cambiar).toHaveBeenCalledWith('Vieja2026', 'Nueva2026', 'Nueva2026');
    expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).value).toBe('');
  });

  it('si la contraseña actual es incorrecta muestra el error y borra solo ese campo', async () => {
    vi.spyOn(auth, 'cambiarContrasena').mockRejectedValue(new ErrorApi(422, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual es incorrecta.'));
    montar('/mi-cuenta', 'paciente');
    await screen.findByRole('heading', { name: 'Mi cuenta' });
    completar('Mala2026', 'Nueva2026', 'Nueva2026');

    expect(await screen.findByText('La contraseña actual es incorrecta.')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).value).toBe(''));
    expect((screen.getByLabelText('Nueva contraseña') as HTMLInputElement).value).toBe('Nueva2026');
  });
});
