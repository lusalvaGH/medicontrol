import { useCallback, useEffect, useRef, useState } from 'react';

export interface Datos<T> {
  datos: T | null;
  error: unknown;
  cargando: boolean;
  recargar: () => void;
}

/**
 * Carga datos de la API cada vez que cambian las dependencias. Si llega una respuesta vieja
 * (el usuario cambió la fecha antes de que terminara la anterior), se descarta.
 */
export function useDatos<T>(cargar: () => Promise<T>, dependencias: unknown[]): Datos<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const ultimo = useRef(0);

  // La función se recrea solo cuando cambian las dependencias que indica quien llama
  const funcion = useCallback(cargar, dependencias);

  useEffect(() => {
    const numero = ++ultimo.current;
    setCargando(true);
    setError(null);
    funcion()
      .then((d) => numero === ultimo.current && setDatos(d))
      .catch((e) => numero === ultimo.current && setError(e))
      .finally(() => numero === ultimo.current && setCargando(false));
  }, [funcion, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { datos, error, cargando, recargar };
}
