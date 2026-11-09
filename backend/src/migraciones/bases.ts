/**
 * Qué bases pueden modificar las herramientas de migración, importación y preparación de pruebas.
 *
 * Nunca se tocan:
 *   - medicontrol_db: la base original de la versión PHP (respaldo y referencia).
 *   - medicontrol_test y medicontrol_demo: bases locales existentes que no se deben alterar.
 * Las bases nuevas de MediControl NestJS usan nombres reconocibles para que un error de
 * configuración (por ejemplo DB_NAME=medicontrol_db) no termine modificando la base original.
 */
export const BASES_PROTEGIDAS = ['medicontrol_db', 'medicontrol_test', 'medicontrol_demo'] as const;

/** medicontrol_local (Docker), medicontrol_produccion, y bases descartables de ensayo o de pruebas. */
const BASES_PERMITIDAS = /^medicontrol_(local|produccion|ensayo_[a-z0-9_]{1,40}|test_[a-z0-9_]{1,40})$/;

/** Bases descartables para pruebas automáticas (las únicas que puede crear preparar-pruebas). */
const BASES_DE_PRUEBA = /^medicontrol_test_[a-z0-9_]{1,40}$/;

export function esBaseProtegida(nombre: string): boolean {
  return (BASES_PROTEGIDAS as readonly string[]).includes(nombre);
}

/** Motivo por el que no se puede modificar esa base, o null si se puede. */
export function motivoBaseNoPermitida(nombre: string): string | null {
  if (esBaseProtegida(nombre)) {
    return `${nombre} es una base protegida: las herramientas de MediControl NestJS nunca la modifican.`;
  }
  if (!BASES_PERMITIDAS.test(nombre)) {
    return `${nombre || '(vacío)'} no es un nombre de base permitido. Usá medicontrol_local, medicontrol_produccion, medicontrol_ensayo_<sufijo> o medicontrol_test_<sufijo>.`;
  }

  return null;
}

export function esBaseDePrueba(nombre: string): boolean {
  return BASES_DE_PRUEBA.test(nombre) && !esBaseProtegida(nombre);
}
