import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { auth } from '../api/servicios';
import { ProveedorSesion } from '../sesion/SesionContexto';
import { Login } from './Login';
import { Registro } from './Registro';

function PanelPaciente() {
  return <p>panel del paciente {useLocation().pathname}</p>;
}

function montar() {
  render(
    <ProveedorSesion>
      <MemoryRouter initialEntries={['/registro']}>
        <Routes>
          <Route path="/registro" element={<Registro />} />
          <Route path="/login" element={<Login />} />
          <Route path="/paciente/turnos" element={<PanelPaciente />} />
        </Routes>
      </MemoryRouter>
    </ProveedorSesion>,
  );
}

const completar = (nombre: string, valor: string) => {
  const campo = document.querySelector<HTMLInputElement>(`[name="${nombre}"]`);
  if (!campo) {
    throw new Error(`No existe el campo ${nombre}`);
  }
  fireEvent.change(campo, { target: { value: valor } });
};

const completarObligatorios = (confirmacion = 'Registro2026') => {
  completar('nombre', 'Lucía');
  completar('apellido', 'Paz');
  completar('dni', '38123456');
  completar('email', 'lucia@demo.test');
  completar('contrasena', 'Registro2026');
  completar('contrasena_confirmacion', confirmacion);
};

const botonCrear = () => screen.getByRole('button', { name: /Crear cuenta/ });

beforeEach(() => {
  vi.spyOn(auth, 'usuarioActual').mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
// jsdom no implementa el desplazamiento de la ventana
window.scrollTo = vi.fn() as never;

describe('Registro público de pacientes', () => {
  it('muestra los campos del formulario PHP y no permite elegir el rol', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Crear cuenta de paciente' });
    for (const nombre of ['nombre', 'apellido', 'dni', 'fecha_nacimiento', 'genero', 'obra_social', 'email', 'telefono', 'direccion', 'contrasena', 'contrasena_confirmacion']) {
      expect(document.querySelector(`[name="${nombre}"]`), nombre).not.toBeNull();
    }
    expect(document.querySelector('[name="rol"]')).toBeNull();
    expect(screen.getByText(/Este registro es solo para pacientes/)).toBeTruthy();
  });

  it('no envía nada si faltan campos obligatorios o las contraseñas no coinciden', async () => {
    const registrar = vi.spyOn(auth, 'registrarPaciente').mockResolvedValue();
    montar();
    await screen.findByRole('heading', { name: 'Crear cuenta de paciente' });

    fireEvent.click(botonCrear());
    completarObligatorios('OtraClave2026');
    fireEvent.click(botonCrear());

    expect(registrar).not.toHaveBeenCalled();
    const confirmacion = document.querySelector<HTMLInputElement>('[name="contrasena_confirmacion"]');
    expect(confirmacion?.validationMessage).toBe('Las contraseñas no coinciden.');
  });

  it('envía los datos sin rol y vuelve al login con el aviso de cuenta creada', async () => {
    const registrar = vi.spyOn(auth, 'registrarPaciente').mockResolvedValue();
    montar();
    await screen.findByRole('heading', { name: 'Crear cuenta de paciente' });
    completarObligatorios();
    completar('obra_social', 'OSDE');
    fireEvent.click(botonCrear());

    expect(await screen.findByText('Tu cuenta se creó correctamente. Ya podés iniciar sesión.')).toBeTruthy();
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Lucía', dni: '38123456', obra_social: 'OSDE', contrasena: 'Registro2026' }));
    expect(registrar.mock.calls[0][0]).not.toHaveProperty('rol');
  });

  it('muestra el mensaje general, los errores por campo y borra las contraseñas', async () => {
    vi.spyOn(auth, 'registrarPaciente').mockRejectedValue(new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisá los campos marcados.', { dni: 'El DNI debe tener entre 7 y 10 dígitos.' }));
    montar();
    await screen.findByRole('heading', { name: 'Crear cuenta de paciente' });
    completarObligatorios();
    fireEvent.click(botonCrear());

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Revisá los campos marcados.');
    expect(screen.getByText('El DNI debe tener entre 7 y 10 dígitos.')).toBeTruthy();
    expect(document.querySelector('[name="dni"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector<HTMLInputElement>('[name="contrasena"]')?.value).toBe('');
    expect(botonCrear()).toHaveProperty('disabled', false);
  });

  it('con una sesión iniciada lleva al panel del rol', async () => {
    vi.spyOn(auth, 'usuarioActual').mockResolvedValue({ id_usuario: 9, nombre: 'Ana', apellido: 'Paz', email: 'ana@demo.test', rol: 'paciente', debe_cambiar_contrasena: false });
    montar();
    await waitFor(() => expect(screen.getByText(/panel del paciente/)).toBeTruthy());
  });

  it('el login enlaza al registro', async () => {
    render(
      <ProveedorSesion>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
          </Routes>
        </MemoryRouter>
      </ProveedorSesion>,
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Registrarse' }));
    expect(await screen.findByRole('heading', { name: 'Crear cuenta de paciente' })).toBeTruthy();
  });
});
