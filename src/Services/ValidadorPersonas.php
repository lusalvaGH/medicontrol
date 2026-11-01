<?php
declare(strict_types=1);

namespace MediControl\Services;

use DateTimeImmutable;

/**
 * Validaciones de datos de personas: las usan el registro público y la gestión de usuarios.
 * Cada método normaliza la entrada y devuelve array{datos: array, errores: array<string, string>}.
 */
final class ValidadorPersonas
{
    public const GENEROS = ['Femenino', 'Masculino', 'Otro'];

    private const PATRON_NOMBRE = "/^\\p{L}[\\p{L}\\p{M}' .-]*$/u";

    private static function texto(array $entrada, string $campo): string
    {
        return is_string($entrada[$campo] ?? null) ? trim($entrada[$campo]) : '';
    }

    private static function sinEspaciosDobles(string $valor): string
    {
        return (string) preg_replace('/\s+/u', ' ', $valor);
    }

    /** Nombre, apellido, DNI y correo: comunes a todos los usuarios. */
    public static function persona(array $entrada): array
    {
        $datos = [
            'nombre'   => self::sinEspaciosDobles(self::texto($entrada, 'nombre')),
            'apellido' => self::sinEspaciosDobles(self::texto($entrada, 'apellido')),
            'dni'      => str_replace(['.', ' ', '-'], '', self::texto($entrada, 'dni')),
            'email'    => mb_strtolower(self::texto($entrada, 'email')),
        ];

        $errores = [];
        foreach (['nombre' => 'El nombre', 'apellido' => 'El apellido'] as $campo => $etiqueta) {
            if ($datos[$campo] === '') {
                $errores[$campo] = "{$etiqueta} es obligatorio.";
            } elseif (mb_strlen($datos[$campo]) < 2 || mb_strlen($datos[$campo]) > 80 || !preg_match(self::PATRON_NOMBRE, $datos[$campo])) {
                $errores[$campo] = "{$etiqueta} debe tener entre 2 y 80 letras (se permiten espacios, apóstrofes y guiones).";
            }
        }

        if ($datos['dni'] === '') {
            $errores['dni'] = 'El DNI es obligatorio.';
        } elseif (!preg_match('/^\d{7,8}$/', $datos['dni'])) {
            $errores['dni'] = 'El DNI debe tener 7 u 8 números, sin letras.';
        }

        if ($datos['email'] === '') {
            $errores['email'] = 'El correo electrónico es obligatorio.';
        } elseif (mb_strlen($datos['email']) > 120 || filter_var($datos['email'], FILTER_VALIDATE_EMAIL) === false) {
            $errores['email'] = 'Ingresá un correo electrónico válido.';
        }

        return ['datos' => $datos, 'errores' => $errores];
    }

    /** Datos del perfil de paciente (todos opcionales). */
    public static function perfilPaciente(array $entrada, DateTimeImmutable $hoy): array
    {
        $datos = [
            'telefono'         => self::texto($entrada, 'telefono'),
            'direccion'        => self::sinEspaciosDobles(self::texto($entrada, 'direccion')),
            'fecha_nacimiento' => self::texto($entrada, 'fecha_nacimiento'),
            'genero'           => self::texto($entrada, 'genero'),
            'obra_social'      => self::sinEspaciosDobles(self::texto($entrada, 'obra_social')),
        ];

        $errores = [];
        if ($datos['telefono'] !== '' && (strlen($datos['telefono']) > 30 || !preg_match('/^\+?[\d\s()-]{6,30}$/', $datos['telefono']))) {
            $errores['telefono'] = 'El teléfono solo puede tener números, espacios, paréntesis, guiones y un + inicial.';
        }
        if (mb_strlen($datos['direccion']) > 200) {
            $errores['direccion'] = 'La dirección no puede superar los 200 caracteres.';
        }
        if (mb_strlen($datos['obra_social']) > 100) {
            $errores['obra_social'] = 'La obra social no puede superar los 100 caracteres.';
        }
        if ($datos['genero'] !== '' && !in_array($datos['genero'], self::GENEROS, true)) {
            $errores['genero'] = 'Elegí una opción de género válida.';
        }
        if ($datos['fecha_nacimiento'] !== '') {
            if (!turnosFechaValida($datos['fecha_nacimiento'])) {
                $errores['fecha_nacimiento'] = 'La fecha de nacimiento no es válida.';
            } elseif ($datos['fecha_nacimiento'] > $hoy->format('Y-m-d') || $datos['fecha_nacimiento'] < '1900-01-01') {
                $errores['fecha_nacimiento'] = 'La fecha de nacimiento debe estar entre 1900 y hoy.';
            }
        }

        return ['datos' => $datos, 'errores' => $errores];
    }

    /** Datos del perfil de médico. Especialidad obligatoria y matrícula opcional. */
    public static function perfilMedico(array $entrada): array
    {
        $datos = [
            'especialidad' => self::sinEspaciosDobles(self::texto($entrada, 'especialidad')),
            'matricula'    => self::sinEspaciosDobles(self::texto($entrada, 'matricula')),
        ];

        $errores = [];
        if ($datos['especialidad'] === '') {
            $errores['especialidad'] = 'La especialidad es obligatoria.';
        } elseif (mb_strlen($datos['especialidad']) < 2 || mb_strlen($datos['especialidad']) > 100 || !preg_match(self::PATRON_NOMBRE, $datos['especialidad'])) {
            $errores['especialidad'] = 'La especialidad debe tener entre 2 y 100 letras.';
        }
        if ($datos['matricula'] !== '' && (mb_strlen($datos['matricula']) > 50 || !preg_match('/^[\p{L}\d][\p{L}\d .\/-]*$/u', $datos['matricula']))) {
            $errores['matricula'] = 'La matrícula solo puede tener letras, números, espacios, puntos, barras y guiones.';
        }

        return ['datos' => $datos, 'errores' => $errores];
    }

    /** Contraseña y su confirmación. No se recortan espacios: forman parte de la contraseña. */
    public static function contrasena(array $entrada): array
    {
        $contrasena = is_string($entrada['contrasena'] ?? null) ? $entrada['contrasena'] : '';
        $confirmacion = is_string($entrada['contrasena_confirmacion'] ?? null) ? $entrada['contrasena_confirmacion'] : '';

        $errores = [];
        if ($contrasena === '') {
            $errores['contrasena'] = 'La contraseña es obligatoria.';
        } elseif (!ReglasContrasena::esValida($contrasena)) {
            $errores['contrasena'] = ReglasContrasena::MENSAJE;
        } elseif ($contrasena !== $confirmacion) {
            $errores['contrasena_confirmacion'] = 'Las contraseñas no coinciden.';
        }

        return ['datos' => ['contrasena' => $contrasena], 'errores' => $errores];
    }
}
