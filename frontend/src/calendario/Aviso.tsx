import { useCallback, useEffect, useRef, useState } from 'react';

/** Aviso flotante (el toast de las pantallas PHP): se muestra 3,5 s. */
export function useAvisoFlotante() {
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mostrar = useCallback((texto: string, error = false) => {
    clearTimeout(temporizador.current);
    setMensaje({ texto, error });
    temporizador.current = setTimeout(() => setMensaje(null), 3500);
  }, []);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const elemento = (
    <div className={`aviso-flotante ${mensaje ? 'aviso-flotante-visible' : ''} ${mensaje?.error ? 'aviso-flotante-error' : ''}`} role="status" aria-live="polite">
      {mensaje?.texto}
    </div>
  );

  return { mostrar, elemento };
}
