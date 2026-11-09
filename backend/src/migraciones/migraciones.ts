import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Migraciones versionadas del esquema (carpeta backend/migraciones). Funciones puras y de
 * lectura de archivos: la ejecución contra la base está en ejecutor.ts y cli.ts.
 *
 * Cada archivo se llama NNN_descripcion.sql (NNN = versión, de 001 en adelante) y se aplica
 * una sola vez, en orden. La tabla schema_migraciones registra cuáles se aplicaron y la huella
 * SHA-256 de su contenido: si alguien edita una migración ya aplicada, el ejecutor se detiene.
 */

/** Versión de esquema que necesita este código. Subirla junto con cada migración nueva. */
export const VERSION_ESQUEMA_REQUERIDA = 2;

export interface Migracion {
  version: number;
  nombre: string;
  archivo: string;
  sql: string;
  huella: string;
}

export interface MigracionAplicada {
  version: number;
  nombre: string;
  huella: string;
}

export interface Plan {
  pendientes: Migracion[];
  /** Aplicadas cuyo archivo cambió después de aplicarse. */
  modificadas: { version: number; nombre: string }[];
  /** Aplicadas en la base que ya no tienen archivo (base más nueva que el código). */
  desconocidas: MigracionAplicada[];
}

const NOMBRE_ARCHIVO = /^(\d{3})_([a-z0-9_]+)\.sql$/;

/**
 * Carpeta de migraciones (backend/migraciones). Este archivo está en src/migraciones (pruebas) o
 * en dist/migraciones (compilado): en los dos casos la carpeta queda dos niveles arriba.
 */
export function carpetaMigraciones(): string {
  return resolve(__dirname, '..', '..', 'migraciones');
}

/**
 * Huella del contenido con los saltos de línea normalizados: un checkout de Windows (CRLF) y
 * uno de Linux (LF) dan la misma huella.
 */
export function huellaSql(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n?/g, '\n').replace(/^﻿/, ''), 'utf8').digest('hex');
}

/** Lee y ordena las migraciones de una carpeta. Falla si hay nombres inválidos o versiones repetidas o salteadas. */
export function leerMigraciones(carpeta: string): Migracion[] {
  const migraciones: Migracion[] = [];
  for (const archivo of readdirSync(carpeta).sort()) {
    if (!archivo.endsWith('.sql')) {
      continue;
    }
    const m = NOMBRE_ARCHIVO.exec(archivo);
    if (!m) {
      throw new Error(`Nombre de migración inválido: ${archivo}. Formato esperado: NNN_descripcion.sql (minúsculas, números y _).`);
    }
    const sql = readFileSync(join(carpeta, archivo), 'utf8');
    migraciones.push({ version: Number(m[1]), nombre: m[2], archivo, sql, huella: huellaSql(sql) });
  }

  migraciones.forEach((mig, i) => {
    if (mig.version !== i + 1) {
      throw new Error(`Las migraciones deben ser consecutivas desde 001: se esperaba ${String(i + 1).padStart(3, '0')} y se encontró ${mig.archivo}.`);
    }
  });

  return migraciones;
}

/** Qué falta aplicar y qué no coincide, comparando los archivos con lo registrado en la base. */
export function planificar(archivos: Migracion[], aplicadas: MigracionAplicada[]): Plan {
  const porVersion = new Map(aplicadas.map((a) => [a.version, a]));
  const versiones = new Set(archivos.map((m) => m.version));

  return {
    pendientes: archivos.filter((m) => !porVersion.has(m.version)),
    modificadas: archivos.filter((m) => porVersion.has(m.version) && porVersion.get(m.version)?.huella !== m.huella).map((m) => ({ version: m.version, nombre: m.nombre })),
    desconocidas: aplicadas.filter((a) => !versiones.has(a.version)),
  };
}

/**
 * Separa un archivo de migración en sentencias. Las migraciones no usan procedimientos ni
 * delimitadores: alcanza con cortar en ';' fuera de comillas y sin comentarios.
 */
export function sentencias(sql: string): string[] {
  const resultado: string[] = [];
  let actual = '';
  let comilla: string | null = null;
  const texto = sql.replace(/\r\n?/g, '\n');
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comilla) {
      actual += c;
      if (c === '\\') {
        actual += texto[++i] ?? '';
      } else if (c === comilla) {
        comilla = null;
      }
      continue;
    }
    if (c === '-' && texto[i + 1] === '-') {
      while (i < texto.length && texto[i] !== '\n') {
        i++;
      }
      actual += '\n';
      continue;
    }
    if (c === '/' && texto[i + 1] === '*') {
      const fin = texto.indexOf('*/', i + 2);
      i = fin === -1 ? texto.length : fin + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      comilla = c;
    }
    if (c === ';') {
      if (actual.trim()) {
        resultado.push(actual.trim());
      }
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim()) {
    resultado.push(actual.trim());
  }

  return resultado;
}
