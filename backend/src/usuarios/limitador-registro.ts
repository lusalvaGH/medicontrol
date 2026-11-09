/**
 * Límite de envíos del registro público, por dirección IP y en memoria del servidor (como el
 * límite del login). Cuenta todos los envíos, correctos o no: así se frenan tanto la creación
 * masiva de cuentas como las pruebas repetidas para averiguar qué correos o DNI existen.
 */
export interface OpcionesLimitadorRegistro {
  maxIntentos: number;
  ventanaMs: number;
}

export const LIMITE_REGISTRO: OpcionesLimitadorRegistro = {
  maxIntentos: 10,
  ventanaMs: 60 * 60 * 1000,
};

export class LimitadorRegistro {
  private readonly intentos = new Map<string, number[]>();
  private static readonly MAXIMO_IPS = 50000;

  constructor(
    private readonly opciones: OpcionesLimitadorRegistro = LIMITE_REGISTRO,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Milisegundos hasta que esa IP pueda volver a enviar (0 si puede ahora). */
  esperaRestante(ip: string): number {
    const vigentes = this.vigentes(ip);
    if (vigentes.length < this.opciones.maxIntentos) {
      return 0;
    }

    return Math.max(0, vigentes[0] + this.opciones.ventanaMs - this.ahora());
  }

  registrar(ip: string): void {
    const vigentes = this.vigentes(ip);
    vigentes.push(this.ahora());
    this.intentos.delete(ip);
    this.intentos.set(ip, vigentes);
    // Tope de memoria: se descarta la IP más antigua
    while (this.intentos.size > LimitadorRegistro.MAXIMO_IPS) {
      const masVieja = this.intentos.keys().next().value;
      if (masVieja === undefined) {
        break;
      }
      this.intentos.delete(masVieja);
    }
  }

  private vigentes(ip: string): number[] {
    const desde = this.ahora() - this.opciones.ventanaMs;

    return (this.intentos.get(ip) ?? []).filter((t) => t > desde);
  }
}
