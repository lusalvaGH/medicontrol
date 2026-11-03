/**
 * Límite de intentos fallidos de inicio de sesión, en memoria del servidor.
 * Cuenta por correo (aunque no exista, para no revelar qué cuentas hay) y por dirección IP.
 * Mismos valores que el límite del cambio de contraseña: 5 fallos, 15 minutos de bloqueo.
 */
export interface OpcionesLimitador {
  maxFallosCorreo: number;
  maxFallosIp: number;
  ventanaMs: number;
  bloqueoMs: number;
}

export const LIMITE_LOGIN: OpcionesLimitador = {
  maxFallosCorreo: 5,
  maxFallosIp: 20,
  ventanaMs: 15 * 60 * 1000,
  bloqueoMs: 15 * 60 * 1000,
};

interface Registro {
  fallos: number;
  desde: number;
  bloqueadoHasta: number;
}

export class LimitadorLogin {
  private readonly registros = new Map<string, Registro>();
  private static readonly MAXIMO_REGISTROS = 50000;

  constructor(
    private readonly opciones: OpcionesLimitador = LIMITE_LOGIN,
    private readonly ahora: () => number = Date.now,
  ) {}

  /** Milisegundos de bloqueo que faltan para ese correo o esa IP (0 si no hay bloqueo). */
  bloqueoRestante(correo: string, ip: string): number {
    const ahora = this.ahora();

    return Math.max(0, ...[this.clave('c', correo), this.clave('i', ip)].map((k) => (this.registros.get(k)?.bloqueadoHasta ?? 0) - ahora));
  }

  registrarFallo(correo: string, ip: string): void {
    this.sumar(this.clave('c', correo), this.opciones.maxFallosCorreo);
    this.sumar(this.clave('i', ip), this.opciones.maxFallosIp);
  }

  /** Un inicio de sesión correcto reinicia el contador del correo (no el de la IP). */
  registrarExito(correo: string): void {
    this.registros.delete(this.clave('c', correo));
  }

  private clave(tipo: 'c' | 'i', valor: string): string {
    return `${tipo}:${tipo === 'c' ? valor.toLowerCase() : valor}`;
  }

  private sumar(clave: string, maximo: number): void {
    const ahora = this.ahora();
    let r = this.registros.get(clave);
    if (!r || ahora - r.desde > this.opciones.ventanaMs) {
      r = { fallos: 0, desde: ahora, bloqueadoHasta: 0 };
    }
    r.fallos++;
    if (r.fallos >= maximo) {
      r.bloqueadoHasta = ahora + this.opciones.bloqueoMs;
      r.fallos = 0;
      r.desde = ahora;
    }
    this.registros.delete(clave);
    this.registros.set(clave, r);
    if (this.registros.size > LimitadorLogin.MAXIMO_REGISTROS) {
      this.podar(ahora);
    }
  }

  private podar(ahora: number): void {
    for (const [clave, r] of this.registros) {
      if (r.bloqueadoHasta <= ahora && ahora - r.desde > this.opciones.ventanaMs) {
        this.registros.delete(clave);
      }
    }
    while (this.registros.size > LimitadorLogin.MAXIMO_REGISTROS) {
      const masViejo = this.registros.keys().next().value;
      if (masViejo === undefined) {
        break;
      }
      this.registros.delete(masViejo);
    }
  }
}
