import { useId, type ReactNode } from 'react';

/** Etiqueta, control y mensaje de error del backend para ese campo (error.campos[nombre]). */
export function Campo({ etiqueta, error, children }: { etiqueta: ReactNode; error?: string; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode }) {
  const id = useId();
  const idError = `${id}-error`;

  return (
    <div className="campo">
      <label htmlFor={id}>
        <span>{etiqueta}</span>
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? idError : undefined })}
      {error && (
        <span id={idError} className="campo-error">
          {error}
        </span>
      )}
    </div>
  );
}
