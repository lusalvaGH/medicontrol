import session from 'express-session';

/**
 * Almacén de sesiones en memoria del servidor, con vencimiento por inactividad y un tope de
 * sesiones. Los datos (incluida la huella) nunca salen del servidor: el navegador solo recibe
 * el identificador firmado. Al reiniciar el backend todos deben volver a iniciar sesión.
 * Sirve para una sola instancia del backend (monolito); con varias haría falta un almacén
 * compartido, por ejemplo en MariaDB, que requiere una tabla nueva.
 */
export class SesionesEnMemoria extends session.Store {
  private readonly sesiones = new Map<string, { datos: session.SessionData; vence: number }>();
  private readonly limpieza: NodeJS.Timeout;

  constructor(
    private readonly inactividadMs: number,
    private readonly maximo = 10000,
    private readonly ahora: () => number = Date.now,
  ) {
    super();
    this.limpieza = setInterval(() => this.borrarVencidas(), Math.min(inactividadMs, 60000));
    this.limpieza.unref();
  }

  get(sid: string, cb: (err: unknown, sesion?: session.SessionData | null) => void): void {
    const registro = this.sesiones.get(sid);
    if (!registro || registro.vence <= this.ahora()) {
      this.sesiones.delete(sid);
      cb(null, null);
      return;
    }
    cb(null, structuredClone(registro.datos));
  }

  set(sid: string, datos: session.SessionData, cb?: (err?: unknown) => void): void {
    this.sesiones.delete(sid);
    while (this.sesiones.size >= this.maximo) {
      // Map conserva el orden de inserción: se descarta la sesión menos usada recientemente
      const masVieja = this.sesiones.keys().next().value;
      if (masVieja === undefined) {
        break;
      }
      this.sesiones.delete(masVieja);
    }
    this.sesiones.set(sid, { datos: structuredClone(datos), vence: this.ahora() + this.inactividadMs });
    cb?.();
  }

  touch(sid: string, datos: session.SessionData, cb?: (err?: unknown) => void): void {
    const registro = this.sesiones.get(sid);
    if (registro && registro.vence > this.ahora()) {
      this.sesiones.delete(sid);
      this.sesiones.set(sid, { datos: registro.datos, vence: this.ahora() + this.inactividadMs });
    }
    cb?.();
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.sesiones.delete(sid);
    cb?.();
  }

  cantidad(): number {
    return this.sesiones.size;
  }

  cerrar(): void {
    clearInterval(this.limpieza);
  }

  private borrarVencidas(): void {
    const ahora = this.ahora();
    for (const [sid, registro] of this.sesiones) {
      if (registro.vence <= ahora) {
        this.sesiones.delete(sid);
      }
    }
  }
}
