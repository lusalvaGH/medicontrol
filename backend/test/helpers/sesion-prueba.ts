import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NOMBRE_COOKIE } from '../../src/auth/sesion.config';

export type Agente = ReturnType<typeof request.agent>;

/** Token CSRF de la sesión del agente (csrf-inicio antes del login, csrf con sesión). */
export async function tokenCsrf(agente: Agente, ruta = '/api/auth/csrf'): Promise<string> {
  const r = await agente.get(ruta);

  return r.body.data?.token ?? '';
}

export async function login(agente: Agente, email: string, contrasena: string) {
  const t = await tokenCsrf(agente, '/api/auth/csrf-inicio');

  return agente.post('/api/auth/login').set('X-CSRF-Token', t).send({ email, contrasena });
}

/** Agente con la sesión ya iniciada. */
export async function sesionIniciada(app: INestApplication, email: string, contrasena: string): Promise<Agente> {
  const agente = request.agent(app.getHttpServer());
  const r = await login(agente, email, contrasena);
  if (r.status !== 200) {
    throw new Error(`No se pudo iniciar sesión con ${email}: ${r.status}`);
  }

  return agente;
}

/** Pedido con el token CSRF vigente del agente. */
export async function conToken(agente: Agente, metodo: 'post' | 'patch' | 'delete' | 'put', ruta: string, cuerpo?: object) {
  const t = await tokenCsrf(agente);

  return agente[metodo](ruta).set('X-CSRF-Token', t).send(cuerpo);
}

export function cookieDeSesion(r: request.Response): string {
  const c = r.headers['set-cookie'] as unknown as string[] | undefined;

  return (c ?? []).find((x) => x.startsWith(NOMBRE_COOKIE + '=')) ?? '';
}

/** 'YYYY-MM-DD' más n días. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);

  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** La respuesta no contiene contraseñas, hashes ni huellas. */
export function sinDatosSensibles(cuerpo: unknown, ...textos: string[]): boolean {
  const json = JSON.stringify(cuerpo);

  return !/\$2[aby]\$|"contrasena"|huella/.test(json) && textos.every((t) => !json.includes(t));
}
