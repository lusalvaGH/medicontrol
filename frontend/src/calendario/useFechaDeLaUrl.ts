import { useSearchParams } from 'react-router-dom';
import { hoyEnClinica } from '../utilidades/fechas';
import { esFechaValida } from './fechas';

/**
 * Fecha del calendario en la URL (?fecha=YYYY-MM-DD), compartida por Día, Semana y Mes. Si no
 * es válida se usa hoy y se avisa, como las pantallas PHP.
 */
export function useFechaDeLaUrl() {
  const [parametros, setParametros] = useSearchParams();
  const pedida = parametros.get('fecha');
  const valida = esFechaValida(pedida);
  const fecha = valida ? pedida : hoyEnClinica();

  return {
    fecha,
    fechaInvalida: pedida !== null && !valida,
    turnoPedido: Number(parametros.get('turno')) || null,
    irA: (nueva: string) => setParametros({ fecha: nueva }),
  };
}
