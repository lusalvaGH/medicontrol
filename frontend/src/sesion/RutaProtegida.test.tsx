import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { UsuarioSesion } from '../api/tipos';
import { RutaProtegida } from './RutaProtegida';

const sesionSimulada = vi.hoisted(() => ({ valor: { estado: 'cargando' } as unknown }));
vi.mock('./SesionContexto', async (original) => ({
  ...(await original<typeof import('./SesionContexto')>()),
  useSesion: () => ({ sesion: sesionSimulada.valor, iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }),
}));

const usuario = (rol: UsuarioSesion['rol']): UsuarioSesion => ({ id_usuario: 1, nombre: 'Ana', apellido: 'Paz', email: 'a@b.test', rol });

function montar(inicial: string) {
  render(
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/login" element={<p>pantalla de login</p>} />
        <Route path="/medico/agenda" element={<p>agenda del médico</p>} />
        <Route path="/paciente/turnos" element={<p>turnos del paciente</p>} />
        <Route element={<RutaProtegida roles={['recepcionista']} />}>
          <Route path="/recepcion/agenda" element={<p>agenda de recepción</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('RutaProtegida', () => {
  it('mientras verifica la sesión no muestra la pantalla', () => {
    sesionSimulada.valor = { estado: 'cargando' };
    montar('/recepcion/agenda');
    expect(screen.getByRole('status').textContent).toContain('Verificando');
    expect(screen.queryByText('agenda de recepción')).toBeNull();
  });

  it('sin sesión lleva al login', () => {
    sesionSimulada.valor = { estado: 'anonimo' };
    montar('/recepcion/agenda');
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });

  it('con el rol correcto muestra la pantalla', () => {
    sesionSimulada.valor = { estado: 'autenticado', usuario: usuario('recepcionista') };
    montar('/recepcion/agenda');
    expect(screen.getByText('agenda de recepción')).toBeTruthy();
  });

  it('con otro rol lleva al inicio de ese rol, nunca a la pantalla pedida', () => {
    sesionSimulada.valor = { estado: 'autenticado', usuario: usuario('medico') };
    montar('/recepcion/agenda');
    expect(screen.getByText('agenda del médico')).toBeTruthy();
    cleanup();
    sesionSimulada.valor = { estado: 'autenticado', usuario: usuario('paciente') };
    montar('/recepcion/agenda');
    expect(screen.getByText('turnos del paciente')).toBeTruthy();
  });
});
