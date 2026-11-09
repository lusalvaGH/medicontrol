import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { respuestaError } from './respuesta';

interface Ruta {
  metodo: string;
  patron: RegExp;
}

/**
 * Rutas inexistentes y métodos no permitidos, antes de la sesión y del control de acceso, como
 * el Router de la API PHP: si la ruta no existe responde 404 y si existe con otro método, 405.
 * Los parámetros (:id) solo aceptan números, igual que {id} en PHP.
 */
export function controlDeRutas(app: INestApplication, prefijo: string): (pedido: Request, respuesta: Response, siguiente: NextFunction) => void {
  let rutas: Ruta[] | null = null;

  return (pedido, respuesta, siguiente) => {
    rutas ??= listarRutas(app, prefijo);
    const ruta = normalizar(pedido.path);
    const coincidentes = rutas.filter((r) => r.patron.test(ruta));
    if (coincidentes.length === 0) {
      respuesta.status(404).json(respuestaError('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.'));
      return;
    }
    // HEAD se atiende como GET (comportamiento de Express)
    const metodo = pedido.method === 'HEAD' ? 'GET' : pedido.method;
    if (!coincidentes.some((r) => r.metodo === metodo || r.metodo === 'ALL')) {
      respuesta.status(405).json(respuestaError('METODO_NO_PERMITIDO', 'Método no permitido para esta ruta.'));
      return;
    }
    siguiente();
  };
}

function normalizar(ruta: string): string {
  let decodificada = ruta;
  try {
    decodificada = decodeURIComponent(ruta);
  } catch {
    // una secuencia % inválida no coincide con ninguna ruta
  }

  return '/' + decodificada.replace(/^\/+|\/+$/g, '');
}

function listarRutas(app: INestApplication, prefijo: string): Ruta[] {
  const descubrimiento = app.get(DiscoveryService);
  const escaner = app.get(MetadataScanner);
  const rutas: Ruta[] = [];

  for (const envoltorio of descubrimiento.getControllers()) {
    const { instance, metatype } = envoltorio;
    if (!instance || !metatype) {
      continue;
    }
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const prototipo = Object.getPrototypeOf(instance) as object;
    for (const nombre of escaner.getAllMethodNames(prototipo)) {
      const manejador = (prototipo as Record<string, unknown>)[nombre] as object;
      const camino = Reflect.getMetadata(PATH_METADATA, manejador) as string | string[] | undefined;
      const metodo = Reflect.getMetadata(METHOD_METADATA, manejador) as RequestMethod | undefined;
      if (camino === undefined || metodo === undefined) {
        continue;
      }
      for (const c of Array.isArray(camino) ? camino : [camino]) {
        const completa = normalizar([prefijo, base, c].join('/').replace(/\/+/g, '/'));
        const patron = completa
          .split('/')
          .map((parte) => (parte.startsWith(':') ? '\\d+' : parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
          .join('/');
        rutas.push({ metodo: RequestMethod[metodo], patron: new RegExp(`^${patron}$`) });
      }
    }
  }

  return rutas;
}
