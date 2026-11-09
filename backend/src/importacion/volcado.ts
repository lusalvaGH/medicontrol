/**
 * Lectura de un volcado de mysqldump sin ejecutarlo: se extraen las columnas de cada CREATE TABLE
 * y las filas de cada INSERT. Así un volcado de medicontrol_db (que trae CREATE DATABASE y USE)
 * nunca puede terminar escribiendo sobre la base original.
 */

export type Valor = string | null;

export interface TablaVolcada {
  columnas: string[];
  filas: Valor[][];
}

export interface Volcado {
  tablas: Record<string, TablaVolcada>;
  /** mysqldump escribe los TIMESTAMP en UTC cuando el volcado trae SET TIME_ZONE='+00:00' (opción por defecto). */
  timestampsEnUtc: boolean;
  /** Base de origen según el encabezado del volcado, si figura. */
  baseOrigen: string | null;
}

const ESCAPES: Record<string, string> = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', '\\': '\\', "'": "'", '"': '"' };

/** Columnas de cada CREATE TABLE, en orden. */
function columnasPorTabla(texto: string): Record<string, string[]> {
  const resultado: Record<string, string[]> = {};
  for (const m of texto.matchAll(/CREATE TABLE `(\w+)` \(\n([\s\S]*?)\n\)[^;]*;/g)) {
    resultado[m[1]] = [...m[2].matchAll(/^\s*`(\w+)`\s/gm)].map((c) => c[1]);
  }

  return resultado;
}

/**
 * Lee la lista de tuplas de un INSERT a partir de la posición indicada y devuelve las filas y
 * dónde termina la sentencia. Respeta comillas y escapes de mysqldump.
 */
export function leerTuplas(texto: string, desde: number): { filas: Valor[][]; fin: number } {
  const filas: Valor[][] = [];
  let i = desde;
  while (i < texto.length) {
    const c = texto[i];
    if (c === ';') {
      return { filas, fin: i + 1 };
    }
    if (c !== '(') {
      i++;
      continue;
    }
    i++;
    const fila: Valor[] = [];
    let valor = '';
    let entreComillas = false;
    let fueCadena = false;
    for (; i < texto.length; i++) {
      const d = texto[i];
      if (entreComillas) {
        if (d === '\\') {
          const siguiente = texto[++i];
          valor += ESCAPES[siguiente] ?? siguiente;
        } else if (d === "'") {
          if (texto[i + 1] === "'") {
            valor += "'";
            i++;
          } else {
            entreComillas = false;
          }
        } else {
          valor += d;
        }
        continue;
      }
      if (d === "'") {
        entreComillas = true;
        fueCadena = true;
      } else if (d === ',' || d === ')') {
        const crudo = fueCadena ? valor : valor.trim();
        fila.push(!fueCadena && crudo.toUpperCase() === 'NULL' ? null : crudo);
        valor = '';
        fueCadena = false;
        if (d === ')') {
          i++;
          break;
        }
      } else if (!/\s/.test(d)) {
        valor += d;
      }
    }
    filas.push(fila);
  }
  throw new Error('El volcado termina en medio de un INSERT: el archivo está incompleto.');
}

export function leerVolcado(texto: string): Volcado {
  const columnas = columnasPorTabla(texto);
  const tablas: Record<string, TablaVolcada> = {};
  const patron = /INSERT INTO `(\w+)`(?: \(([^)]*)\))? VALUES\s*/g;
  let m: RegExpExecArray | null;
  while ((m = patron.exec(texto)) !== null) {
    const tabla = m[1];
    const declaradas = m[2] ? [...m[2].matchAll(/`(\w+)`/g)].map((c) => c[1]) : columnas[tabla];
    if (!declaradas) {
      throw new Error(`El volcado inserta en ${tabla} pero no trae su CREATE TABLE ni la lista de columnas.`);
    }
    const { filas, fin } = leerTuplas(texto, patron.lastIndex);
    patron.lastIndex = fin;
    for (const fila of filas) {
      if (fila.length !== declaradas.length) {
        throw new Error(`Una fila de ${tabla} tiene ${fila.length} valores y la tabla ${declaradas.length} columnas.`);
      }
    }
    const destino = (tablas[tabla] ??= { columnas: declaradas, filas: [] });
    if (destino.columnas.join() !== declaradas.join()) {
      throw new Error(`Los INSERT de ${tabla} usan columnas distintas entre sí.`);
    }
    destino.filas.push(...filas);
  }
  // Tablas con estructura pero sin filas
  for (const [tabla, cols] of Object.entries(columnas)) {
    tablas[tabla] ??= { columnas: cols, filas: [] };
  }

  return {
    tablas,
    timestampsEnUtc: /SET TIME_ZONE='\+00:00'/.test(texto),
    baseOrigen: /^-- Host: .*Database: (\w+)/m.exec(texto)?.[1] ?? null,
  };
}
