import { esBaseDePrueba, motivoBaseNoPermitida } from './bases';
import { VERSION_ESQUEMA_REQUERIDA, carpetaMigraciones, huellaSql, leerMigraciones, planificar, sentencias } from './migraciones';

describe('migraciones versionadas', () => {
  const archivos = leerMigraciones(carpetaMigraciones());

  it('las migraciones del repositorio son consecutivas y el código pide la última versión', () => {
    expect(archivos.map((m) => m.version)).toEqual(archivos.map((_, i) => i + 1));
    expect(VERSION_ESQUEMA_REQUERIDA).toBe(archivos.length);
    expect(archivos.map((m) => m.archivo)).toEqual(['001_turnos_liberar_cancelados.sql', '002_usuarios_cambio_contrasena.sql']);
  });

  it('cada migración se puede repetir: solo usa ALTER TABLE con IF EXISTS / IF NOT EXISTS y no borra datos', () => {
    for (const m of archivos) {
      for (const s of sentencias(m.sql)) {
        expect(s).toMatch(/^ALTER TABLE \w+/);
        expect(s).not.toMatch(/\b(DROP TABLE|DROP DATABASE|TRUNCATE|DELETE FROM|UPDATE)\b/i);
        for (const accion of s.match(/\b(ADD COLUMN|ADD UNIQUE KEY|ADD KEY|DROP INDEX|DROP COLUMN)\b[^,;]*/g) ?? []) {
          expect(accion).toMatch(/IF (NOT )?EXISTS/);
        }
      }
    }
  });

  it('la 001 crea los índices nuevos antes de quitar el anterior (la clave foránea nunca queda sin índice)', () => {
    const partes = sentencias(archivos[0].sql);
    const agrega = partes.findIndex((s) => s.includes('uk_medico_horario_activo'));
    const quita = partes.findIndex((s) => s.includes('DROP INDEX IF EXISTS uk_medico_fecha_hora'));
    expect(agrega).toBeGreaterThanOrEqual(0);
    expect(quita).toBeGreaterThan(agrega);
  });

  it('la huella no cambia con los saltos de línea de Windows ni con BOM', () => {
    expect(huellaSql('ALTER TABLE x;\r\nSELECT 1;\r\n')).toBe(huellaSql('ALTER TABLE x;\nSELECT 1;\n'));
    expect(huellaSql('﻿SELECT 1;')).toBe(huellaSql('SELECT 1;'));
    expect(huellaSql('SELECT 1;')).not.toBe(huellaSql('SELECT 2;'));
  });

  it('planifica las pendientes y detecta migraciones editadas o desconocidas', () => {
    const [m1, m2] = archivos;
    expect(planificar(archivos, []).pendientes.map((m) => m.version)).toEqual([1, 2]);
    expect(planificar(archivos, [{ version: 1, nombre: m1.nombre, huella: m1.huella }]).pendientes.map((m) => m.version)).toEqual([2]);
    const editada = planificar(archivos, [{ version: 1, nombre: m1.nombre, huella: 'otra' }]);
    expect(editada.modificadas).toEqual([{ version: 1, nombre: m1.nombre }]);
    const nueva = planificar(archivos, [
      { version: 1, nombre: m1.nombre, huella: m1.huella },
      { version: 2, nombre: m2.nombre, huella: m2.huella },
      { version: 3, nombre: 'futura', huella: 'x' },
    ]);
    expect(nueva.pendientes).toEqual([]);
    expect(nueva.desconocidas.map((m) => m.version)).toEqual([3]);
  });

  it('separa sentencias respetando comentarios y comillas', () => {
    expect(sentencias("-- comentario; con punto y coma\nSELECT 'a;b';\n/* bloque; */ SELECT `c;d`;\nSELECT 1")).toEqual(["SELECT 'a;b'", 'SELECT `c;d`', 'SELECT 1']);
  });
});

describe('bases que pueden modificar las herramientas', () => {
  it.each(['medicontrol_db', 'medicontrol_test', 'medicontrol_demo'])('%s está protegida', (base) => {
    expect(motivoBaseNoPermitida(base)).toContain('protegida');
  });

  it.each(['medicontrol_local', 'medicontrol_produccion', 'medicontrol_ensayo_1', 'medicontrol_test_ci'])('%s está permitida', (base) => {
    expect(motivoBaseNoPermitida(base)).toBeNull();
  });

  it.each(['', 'otra', 'medicontrol', 'medicontrol_db_copia', 'medicontrol_test_', 'medicontrol_ensayo_X'])('«%s» no está permitida', (base) => {
    expect(motivoBaseNoPermitida(base)).not.toBeNull();
  });

  it('solo las medicontrol_test_<sufijo> son bases de prueba', () => {
    expect(esBaseDePrueba('medicontrol_test_ci')).toBe(true);
    expect(esBaseDePrueba('medicontrol_test')).toBe(false);
    expect(esBaseDePrueba('medicontrol_local')).toBe(false);
  });
});
