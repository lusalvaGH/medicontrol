/**
 * Casos tomados de las pruebas PHP que ejercitan estas validaciones:
 * tests/acceso_registro_test.php (registro), tests/usuarios_gestion_test.php (altas y
 * modificaciones) y tests/cuenta_contrasena_test.php (política de contraseñas).
 */
import { CONTRASENA_MENSAJE, contrasenaValida } from './contrasena.reglas';
import { validarContrasena, validarPerfilMedico, validarPerfilPaciente, validarPersona } from './personas.validador';

const hoy = '2026-11-03';

// Registro válido de acceso_registro_test.php
const valido = {
  nombre: 'Ana María', apellido: "D'Alessandro", dni: '40.111.222', email: 'Ana.Prueba@registro-prueba.test',
  telefono: '+54 342 456-7890', direccion: 'San Martín 1234, Santa Fe', fecha_nacimiento: '1990-05-20',
  genero: 'Femenino', obra_social: 'IAPOS', contrasena: 'Segura2026', contrasena_confirmacion: 'Segura2026',
};

function erroresRegistro(entrada: Record<string, unknown>): Record<string, string> {
  return { ...validarPersona(entrada).errores, ...validarContrasena(entrada).errores, ...validarPerfilPaciente(entrada, hoy).errores };
}

describe('registro (acceso_registro_test.php)', () => {
  it('un registro válido no tiene errores', () => expect(erroresRegistro(valido)).toEqual({}));

  it('registro vacío marca los campos obligatorios', () => {
    expect(Object.keys(erroresRegistro({})).sort()).toEqual(['apellido', 'contrasena', 'dni', 'email', 'nombre']);
  });

  it.each([
    ['email inválido', { email: 'no-es-un-correo' }, 'email'],
    ['DNI con letras', { dni: '12AB3456' }, 'dni'],
    ['DNI demasiado corto', { dni: '12345' }, 'dni'],
    ['contraseña corta', { contrasena: 'abc1', contrasena_confirmacion: 'abc1' }, 'contrasena'],
    ['contraseña sin números', { contrasena: 'soloLetras', contrasena_confirmacion: 'soloLetras' }, 'contrasena'],
    ['contraseñas distintas', { contrasena_confirmacion: 'Otra2026xx' }, 'contrasena_confirmacion'],
    ['nombre con números', { nombre: 'Ana99' }, 'nombre'],
    ['fecha de nacimiento futura', { fecha_nacimiento: '2999-01-01' }, 'fecha_nacimiento'],
    ['fecha de nacimiento inválida', { fecha_nacimiento: '1990-02-30' }, 'fecha_nacimiento'],
    ['género fuera de la lista', { genero: 'Administrador' }, 'genero'],
    ['teléfono con letras', { telefono: 'llamar luego' }, 'telefono'],
  ])('registro con %s: se rechaza marcando el campo', (_nombre, cambio, campo) => {
    expect(Object.keys(erroresRegistro({ ...valido, ...cambio }))).toContain(campo);
  });

  it('normaliza los datos: DNI sin puntos y email en minúsculas', () => {
    const { datos } = validarPersona(valido);
    expect(datos.dni).toBe('40111222');
    expect(datos.email).toBe('ana.prueba@registro-prueba.test');
  });

  it('conserva los datos opcionales', () => {
    expect(validarPerfilPaciente(valido, hoy).datos).toEqual({
      telefono: '+54 342 456-7890', direccion: 'San Martín 1234, Santa Fe', fecha_nacimiento: '1990-05-20', genero: 'Femenino', obra_social: 'IAPOS',
    });
  });
});

describe('altas y modificaciones (usuarios_gestion_test.php)', () => {
  const alta = { nombre: 'Ana María', apellido: "D'Alessandro", dni: '95.111.222', email: 'Ana.Alta@gestion-prueba.test', contrasena: 'Provisoria2026', contrasena_confirmacion: 'Provisoria2026' };

  it('normaliza DNI y correo como la versión PHP', () => {
    const { datos, errores } = validarPersona(alta);
    expect(errores).toEqual({});
    expect(datos).toEqual({ nombre: 'Ana María', apellido: "D'Alessandro", dni: '95111222', email: 'ana.alta@gestion-prueba.test' });
  });

  it.each([
    ['sin especialidad', () => validarPerfilMedico({}).errores, 'especialidad'],
    ['DNI con letras', () => validarPersona({ ...alta, dni: '12AB3456' }).errores, 'dni'],
    ['correo inválido', () => validarPersona({ ...alta, email: 'no-es-correo' }).errores, 'email'],
    ['nombre con números', () => validarPersona({ ...alta, nombre: 'Ana99' }).errores, 'nombre'],
    ['teléfono inválido', () => validarPerfilPaciente({ telefono: 'llamar' }, hoy).errores, 'telefono'],
    ['género fuera de lista', () => validarPerfilPaciente({ genero: 'Administrador' }, hoy).errores, 'genero'],
    ['contraseña corta', () => validarContrasena({ contrasena: 'Ab1', contrasena_confirmacion: 'Ab1' }).errores, 'contrasena'],
    ['contraseñas distintas', () => validarContrasena({ ...alta, contrasena_confirmacion: 'Otra2026xx' }).errores, 'contrasena_confirmacion'],
    ['matrícula inválida', () => validarPerfilMedico({ especialidad: 'Prueba', matricula: '<script>' }).errores, 'matricula'],
  ])('alta con %s: responde con el campo marcado', (_nombre, errores, campo) => {
    expect(Object.keys(errores())).toContain(campo);
  });

  it('acepta los perfiles de médico de los datos de prueba', () => {
    expect(validarPerfilMedico({ especialidad: 'Dermatología', matricula: 'MN-1234' })).toEqual({ datos: { especialidad: 'Dermatología', matricula: 'MN-1234' }, errores: {} });
    expect(validarPerfilMedico({ especialidad: 'Neurología', matricula: 'MP 77' }).errores).toEqual({});
  });

  it('modificación de paciente con los datos de la prueba PHP', () => {
    const r = validarPerfilPaciente({ telefono: '+54 342 111-2222', direccion: 'San Martín 100', fecha_nacimiento: '1990-05-20', genero: 'Femenino', obra_social: 'IAPOS' }, hoy);
    expect(r.errores).toEqual({});
  });

  it('obra social vacía queda vacía (el valor por defecto lo pone la base)', () => {
    expect(validarPerfilPaciente({}, hoy).datos.obra_social).toBe('');
  });
});

describe('mensajes de error (iguales a los de PHP)', () => {
  it('persona', () => {
    expect(validarPersona({}).errores).toEqual({
      nombre: 'El nombre es obligatorio.',
      apellido: 'El apellido es obligatorio.',
      dni: 'El DNI es obligatorio.',
      email: 'El correo electrónico es obligatorio.',
    });
    expect(validarPersona({ nombre: 'A', apellido: 'B2', dni: '1', email: 'x' }).errores).toEqual({
      nombre: 'El nombre debe tener entre 2 y 80 letras (se permiten espacios, apóstrofes y guiones).',
      apellido: 'El apellido debe tener entre 2 y 80 letras (se permiten espacios, apóstrofes y guiones).',
      dni: 'El DNI debe tener 7 u 8 números, sin letras.',
      email: 'Ingresá un correo electrónico válido.',
    });
  });
  it('fecha de nacimiento fuera de rango', () => {
    expect(validarPerfilPaciente({ fecha_nacimiento: '1899-12-31' }, hoy).errores.fecha_nacimiento).toBe('La fecha de nacimiento debe estar entre 1900 y hoy.');
  });
  it('contraseña', () => {
    expect(validarContrasena({}).errores).toEqual({ contrasena: 'La contraseña es obligatoria.' });
    expect(validarContrasena({ contrasena: 'corta1', contrasena_confirmacion: 'corta1' }).errores).toEqual({ contrasena: CONTRASENA_MENSAJE });
  });
});

describe('política de contraseñas (cuenta_contrasena_test.php)', () => {
  it.each([
    ['nueva corta', 'Ab1', false],
    ['sin números', 'SoloLetras', false],
    ['sin letras', '12345678', false],
    ['73 bytes', 'a'.repeat(72) + '1', false],
    ['byte nulo', 'Nueva\0' + '2026x', false],
    ['exactamente 72 bytes', 'a'.repeat(71) + '1', true],
    ['espacios al inicio y al final', '  Espacios 2026  ', true],
    ['acentos', 'Contraseña2026áé', true],
    ['válida', 'Nueva2026x', true],
  ])('%s', (_nombre, contrasena, esperado) => {
    expect(contrasenaValida(contrasena)).toBe(esperado);
  });

  it('cuenta caracteres para el mínimo y bytes para el máximo', () => {
    expect(contrasenaValida('ñññññññ1')).toBe(true); // 8 caracteres, 15 bytes
    expect(contrasenaValida('ñ'.repeat(36) + '1')).toBe(false); // 37 caracteres, 73 bytes
  });

  it('la contraseña no se recorta', () => {
    expect(validarContrasena({ contrasena: ' Clave2026 ', contrasena_confirmacion: 'Clave2026' }).errores).toEqual({ contrasena_confirmacion: 'Las contraseñas no coinciden.' });
  });
});
