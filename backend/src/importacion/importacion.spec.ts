import { COLUMNAS, Datos, Fila, controlar, filasConColumnas, huellaTabla } from './datos';
import { leerVolcado } from './volcado';

/** Volcado ficticio con el formato de mysqldump (sin datos reales). */
const VOLCADO = `-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: medicontrol_db
/*!40103 SET TIME_ZONE='+00:00' */;
CREATE DATABASE /*!32312 IF NOT EXISTS*/ \`medicontrol_db\`;
USE \`medicontrol_db\`;
CREATE TABLE \`usuarios\` (
  \`id_usuario\` int(11) NOT NULL AUTO_INCREMENT,
  \`nombre\` varchar(80) NOT NULL,
  \`apellido\` varchar(80) NOT NULL,
  \`dni\` varchar(20) NOT NULL,
  \`email\` varchar(120) NOT NULL,
  \`contrasena\` varchar(255) NOT NULL,
  \`rol\` enum('recepcionista','medico','paciente') NOT NULL,
  \`estado\` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  \`creado_en\` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (\`id_usuario\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO \`usuarios\` VALUES (1,'Ana','O\\'Brien','10000001','a@x.test','$2y$10$abc','recepcionista','activo','2026-01-01 03:00:00'),(2,'Juan, con coma','Pérez','10000002','j@x.test','$2y$10$abc','medico','activo','2026-01-02 03:00:00');
INSERT INTO \`usuarios\` VALUES (3,'Línea\\nnueva','Paz','10000003','l@x.test','$2y$10$abc','paciente','inactivo','2026-01-03 03:00:00');
CREATE TABLE \`medicos\` (
  \`id_medico\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_usuario\` int(11) NOT NULL,
  \`especialidad\` varchar(100) NOT NULL,
  \`matricula\` varchar(50) DEFAULT NULL,
  PRIMARY KEY (\`id_medico\`)
) ENGINE=InnoDB;
INSERT INTO \`medicos\` (\`id_medico\`, \`id_usuario\`, \`especialidad\`, \`matricula\`) VALUES (1,2,'Clínica',NULL);
CREATE TABLE \`turnos\` (
  \`id_turno\` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`id_turno\`)
) ENGINE=InnoDB;
`;

describe('lectura de volcados de mysqldump', () => {
  const volcado = leerVolcado(VOLCADO);

  it('lee las filas de varios INSERT, con comillas, comas, escapes y NULL', () => {
    expect(volcado.tablas.usuarios.filas).toHaveLength(3);
    expect(volcado.tablas.usuarios.filas[0][2]).toBe("O'Brien");
    expect(volcado.tablas.usuarios.filas[1][1]).toBe('Juan, con coma');
    expect(volcado.tablas.usuarios.filas[2][1]).toBe('Línea\nnueva');
    expect(volcado.tablas.medicos.filas[0]).toEqual(['1', '2', 'Clínica', null]);
  });

  it('toma las columnas del CREATE TABLE o de la lista del INSERT', () => {
    expect(volcado.tablas.usuarios.columnas).toEqual(COLUMNAS.usuarios);
    expect(volcado.tablas.medicos.columnas).toEqual(COLUMNAS.medicos);
    expect(volcado.tablas.turnos.filas).toEqual([]);
  });

  it('detecta la zona UTC de los TIMESTAMP y la base de origen', () => {
    expect(volcado.timestampsEnUtc).toBe(true);
    expect(volcado.baseOrigen).toBe('medicontrol_db');
    expect(leerVolcado('INSERT INTO `x` (`a`) VALUES (1);').timestampsEnUtc).toBe(false);
  });

  it('rechaza un volcado cortado o con filas incompletas', () => {
    expect(() => leerVolcado("INSERT INTO `x` (`a`) VALUES (1),(2")).toThrow(/incompleto/);
    expect(() => leerVolcado('INSERT INTO `x` (`a`, `b`) VALUES (1);')).toThrow(/valores/);
  });

  it('exige las columnas del esquema', () => {
    expect(() => filasConColumnas('usuarios', ['id_usuario', 'nombre'], [])).toThrow(/columnas/);
  });
});

function datosValidos(): Datos {
  const u = (id: number, rol: string, extra: Partial<Fila> = {}): Fila => ({
    id_usuario: String(id),
    nombre: 'N',
    apellido: 'A',
    dni: String(20000000 + id),
    email: `u${id}@x.test`,
    contrasena: '$2y$10$' + 'a'.repeat(53),
    rol,
    estado: 'activo',
    creado_en: '2026-01-01 00:00:00',
    ...extra,
  });
  const t = (id: number, paciente: number, medico: number, hora: string, estado = 'pendiente'): Fila => ({
    id_turno: String(id),
    id_paciente: String(paciente),
    id_medico: String(medico),
    fecha: '2026-12-01',
    hora,
    estado,
    motivo_consulta: 'Control',
    notas_medicas: null,
    creado_en: '2026-01-01 00:00:00',
  });

  return {
    usuarios: [u(1, 'recepcionista'), u(2, 'medico'), u(3, 'medico'), u(4, 'paciente')],
    medicos: [
      { id_medico: '1', id_usuario: '2', especialidad: 'X', matricula: null },
      { id_medico: '2', id_usuario: '3', especialidad: 'Y', matricula: null },
    ],
    pacientes: [{ id_paciente: '1', id_usuario: '4', telefono: null, direccion: null, fecha_nacimiento: null, genero: null, obra_social: 'Particular' }],
    turnos: [t(1, 1, 1, '09:00:00'), t(2, 1, 2, '09:00:00', 'cancelado'), t(3, 1, 1, '09:00:00', 'cancelado')],
  };
}

describe('controles de integridad antes de importar', () => {
  it('datos coherentes no tienen errores (los cancelados no ocupan el horario)', () => {
    const informe = controlar(datosValidos(), '2026-11-09');
    expect(informe.errores).toEqual([]);
    expect(informe.conteos).toMatchObject({ usuarios: 4, turnos: 3, turnos_cancelado: 2, turnos_paciente_superpuesto: 0 });
  });

  it('detecta un paciente con dos turnos vigentes a la misma hora con médicos distintos', () => {
    const datos = datosValidos();
    datos.turnos[1].estado = 'confirmado';
    expect(controlar(datos, '2026-11-09').errores.join()).toMatch(/paciente tiene dos turnos vigentes/);
  });

  it('detecta relaciones colgadas, perfiles con otro rol y correos repetidos sin distinguir mayúsculas', () => {
    const datos = datosValidos();
    datos.turnos[0].id_medico = '99';
    datos.pacientes[0].id_usuario = '2';
    datos.usuarios[3].email = 'U1@X.TEST';
    const errores = controlar(datos, '2026-11-09').errores.join('\n');
    expect(errores).toMatch(/paciente o un médico que no existe/);
    expect(errores).toMatch(/otro rol/);
    expect(errores).toMatch(/correos repetidos/);
  });

  it('avisa (sin bloquear) turnos pasados abiertos y usuarios sin perfil', () => {
    const datos = datosValidos();
    datos.medicos.pop();
    datos.turnos = datos.turnos.filter((t) => t.id_medico !== '2');
    datos.turnos[0].fecha = '2026-01-01';
    const informe = controlar(datos, '2026-11-09');
    expect(informe.errores).toEqual([]);
    expect(informe.avisos.join('\n')).toMatch(/pasados/);
    expect(informe.avisos.join('\n')).toMatch(/sin perfil/);
  });

  it('la huella no depende del orden de las filas, pero sí de cada valor', () => {
    const datos = datosValidos();
    const h = huellaTabla('turnos', datos.turnos);
    expect(huellaTabla('turnos', [...datos.turnos].reverse())).toBe(h);
    datos.turnos[0].notas_medicas = '';
    expect(huellaTabla('turnos', datos.turnos)).not.toBe(h);
  });
});
