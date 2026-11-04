import type { ReactNode } from 'react';
import { ErrorApi } from '../api/cliente';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p className="estado-cargando" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {texto}
    </p>
  );
}

/** Mensaje del error tal como lo devuelve el backend (ya está en español y sin datos internos). */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) {
    return error.message;
  }

  return 'Ocurrió un error inesperado. Intentá nuevamente.';
}

export function MensajeError({ error, alReintentar }: { error: unknown; alReintentar?: () => void }) {
  return (
    <div className="aviso aviso-error" role="alert">
      <span>{mensajeDeError(error)}</span>
      {alReintentar && (
        <button type="button" className="boton boton-secundario" onClick={alReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Aviso({ tipo = 'exito', children }: { tipo?: 'exito' | 'info'; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`} role="status">
      {children}
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="vacio">{children}</p>;
}
