import { useEffect, useId, useRef, type ReactNode } from 'react';

interface PropsVentana {
  titulo: ReactNode;
  alCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  /** Encabezado oscuro, como la ventana de detalle de las pantallas PHP. */
  oscura?: boolean;
  angosta?: boolean;
}

/**
 * Ventana emergente (las .turn-modal de PHP) accesible: se cierra con Escape o con un clic
 * en el fondo, toma el foco al abrirse y lo devuelve al cerrarse.
 */
export function Ventana({ titulo, alCerrar, children, pie, oscura = false, angosta = false }: PropsVentana) {
  const id = useId();
  const tarjeta = useRef<HTMLDivElement>(null);
  // La función de cierre puede cambiar en cada dibujo: se guarda para no volver a tomar el foco
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    tarjeta.current?.focus();
    const alPresionar = (e: KeyboardEvent) => e.key === 'Escape' && cerrar.current();
    document.addEventListener('keydown', alPresionar);

    return () => {
      document.removeEventListener('keydown', alPresionar);
      anterior?.focus?.();
    };
  }, []);

  return (
    <div className="ventana-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div ref={tarjeta} className={`ventana ${angosta ? 'ventana-angosta' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className={`ventana-encabezado ${oscura ? 'ventana-encabezado-oscuro' : ''}`}>
          <h2 id={id}>{titulo}</h2>
          <button type="button" className="ventana-cerrar" onClick={alCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="ventana-cuerpo">{children}</div>
        {pie && <div className="ventana-pie">{pie}</div>}
      </div>
    </div>
  );
}
