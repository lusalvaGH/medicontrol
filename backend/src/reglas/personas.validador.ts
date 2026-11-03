/**
 * Validaciones de datos de personas (migradas de src/Services/ValidadorPersonas.php).
 * Cada función normaliza la entrada y devuelve { datos, errores }, con los mismos mensajes.
 */
import { CONTRASENA_MENSAJE, contrasenaValida } from './contrasena.reglas';
import { emailValidoPhp } from './email';
import { coincideAnclado, colapsarEspacios, mbStrlen, strlenBytes, textoRecortado } from './php';
import { turnosFechaValida } from './turnos.reglas';

export const GENEROS = ['Femenino', 'Masculino', 'Otro'] as const;

type Entrada = Record<string, unknown>;
type Errores = Record<string, string>;
export interface Validacion<T> {
  datos: T;
  errores: Errores;
}

const PATRON_NOMBRE = /^\p{L}[\p{L}\p{M}' .-]*$/u;

export interface DatosPersona {
  nombre: string;
  apellido: string;
  dni: string;
  email: string;
}

/** Nombre, apellido, DNI y correo: comunes a todos los usuarios. */
export function validarPersona(entrada: Entrada): Validacion<DatosPersona> {
  const datos: DatosPersona = {
    nombre: colapsarEspacios(textoRecortado(entrada, 'nombre')),
    apellido: colapsarEspacios(textoRecortado(entrada, 'apellido')),
    dni: textoRecortado(entrada, 'dni').replace(/[. -]/g, ''),
    email: textoRecortado(entrada, 'email').toLowerCase(),
  };

  const errores: Errores = {};
  for (const [campo, etiqueta] of [['nombre', 'El nombre'], ['apellido', 'El apellido']] as const) {
    const valor = datos[campo];
    if (valor === '') {
      errores[campo] = `${etiqueta} es obligatorio.`;
    } else if (mbStrlen(valor) < 2 || mbStrlen(valor) > 80 || !coincideAnclado(PATRON_NOMBRE, valor)) {
      errores[campo] = `${etiqueta} debe tener entre 2 y 80 letras (se permiten espacios, apóstrofes y guiones).`;
    }
  }

  if (datos.dni === '') {
    errores.dni = 'El DNI es obligatorio.';
  } else if (!coincideAnclado(/^\d{7,8}$/, datos.dni)) {
    errores.dni = 'El DNI debe tener 7 u 8 números, sin letras.';
  }

  if (datos.email === '') {
    errores.email = 'El correo electrónico es obligatorio.';
  } else if (mbStrlen(datos.email) > 120 || !emailValidoPhp(datos.email)) {
    errores.email = 'Ingresá un correo electrónico válido.';
  }

  return { datos, errores };
}

export interface DatosPerfilPaciente {
  telefono: string;
  direccion: string;
  fecha_nacimiento: string;
  genero: string;
  obra_social: string;
}

/** Datos del perfil de paciente (todos opcionales). hoy: 'YYYY-MM-DD' en la zona de la clínica. */
export function validarPerfilPaciente(entrada: Entrada, hoy: string): Validacion<DatosPerfilPaciente> {
  const datos: DatosPerfilPaciente = {
    telefono: textoRecortado(entrada, 'telefono'),
    direccion: colapsarEspacios(textoRecortado(entrada, 'direccion')),
    fecha_nacimiento: textoRecortado(entrada, 'fecha_nacimiento'),
    genero: textoRecortado(entrada, 'genero'),
    obra_social: colapsarEspacios(textoRecortado(entrada, 'obra_social')),
  };

  const errores: Errores = {};
  // \d y \s sin /u en PCRE: solo dígitos y espacios ASCII
  if (datos.telefono !== '' && (strlenBytes(datos.telefono) > 30 || !coincideAnclado(/^\+?[0-9 \t\n\x0B\f\r()-]{6,30}$/, datos.telefono))) {
    errores.telefono = 'El teléfono solo puede tener números, espacios, paréntesis, guiones y un + inicial.';
  }
  if (mbStrlen(datos.direccion) > 200) {
    errores.direccion = 'La dirección no puede superar los 200 caracteres.';
  }
  if (mbStrlen(datos.obra_social) > 100) {
    errores.obra_social = 'La obra social no puede superar los 100 caracteres.';
  }
  if (datos.genero !== '' && !(GENEROS as readonly string[]).includes(datos.genero)) {
    errores.genero = 'Elegí una opción de género válida.';
  }
  if (datos.fecha_nacimiento !== '') {
    if (!turnosFechaValida(datos.fecha_nacimiento)) {
      errores.fecha_nacimiento = 'La fecha de nacimiento no es válida.';
    } else if (datos.fecha_nacimiento > hoy || datos.fecha_nacimiento < '1900-01-01') {
      errores.fecha_nacimiento = 'La fecha de nacimiento debe estar entre 1900 y hoy.';
    }
  }

  return { datos, errores };
}

export interface DatosPerfilMedico {
  especialidad: string;
  matricula: string;
}

/** Datos del perfil de médico. Especialidad obligatoria y matrícula opcional. */
export function validarPerfilMedico(entrada: Entrada): Validacion<DatosPerfilMedico> {
  const datos: DatosPerfilMedico = {
    especialidad: colapsarEspacios(textoRecortado(entrada, 'especialidad')),
    matricula: colapsarEspacios(textoRecortado(entrada, 'matricula')),
  };

  const errores: Errores = {};
  if (datos.especialidad === '') {
    errores.especialidad = 'La especialidad es obligatoria.';
  } else if (mbStrlen(datos.especialidad) < 2 || mbStrlen(datos.especialidad) > 100 || !coincideAnclado(PATRON_NOMBRE, datos.especialidad)) {
    errores.especialidad = 'La especialidad debe tener entre 2 y 100 letras.';
  }
  // \d con /u en PCRE (UCP) acepta cualquier dígito Unicode: en JS es \p{Nd}
  if (datos.matricula !== '' && (mbStrlen(datos.matricula) > 50 || !coincideAnclado(/^[\p{L}\p{Nd}][\p{L}\p{Nd} .\/-]*$/u, datos.matricula))) {
    errores.matricula = 'La matrícula solo puede tener letras, números, espacios, puntos, barras y guiones.';
  }

  return { datos, errores };
}

/** Contraseña y su confirmación. No se recortan espacios: forman parte de la contraseña. */
export function validarContrasena(entrada: Entrada): Validacion<{ contrasena: string }> {
  const contrasena = typeof entrada.contrasena === 'string' ? entrada.contrasena : '';
  const confirmacion = typeof entrada.contrasena_confirmacion === 'string' ? entrada.contrasena_confirmacion : '';

  const errores: Errores = {};
  if (contrasena === '') {
    errores.contrasena = 'La contraseña es obligatoria.';
  } else if (!contrasenaValida(contrasena)) {
    errores.contrasena = CONTRASENA_MENSAJE;
  } else if (contrasena !== confirmacion) {
    errores.contrasena_confirmacion = 'Las contraseñas no coinciden.';
  }

  return { datos: { contrasena }, errores };
}
