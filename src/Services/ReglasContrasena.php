<?php
declare(strict_types=1);

namespace MediControl\Services;

/**
 * Política única de contraseñas: la usan el registro público y el cambio de contraseña.
 */
final class ReglasContrasena
{
    public const MINIMA = 8;
    public const MAXIMA = 72; // límite de bcrypt (bytes)

    public const MENSAJE = 'La contraseña debe tener entre ' . self::MINIMA . ' y ' . self::MAXIMA . ' caracteres e incluir letras y números.';

    public static function esValida(string $contrasena): bool
    {
        return mb_strlen($contrasena) >= self::MINIMA
            && strlen($contrasena) <= self::MAXIMA
            && strpos($contrasena, "\0") === false // bcrypt no admite el byte nulo
            && preg_match('/\p{L}/u', $contrasena) === 1
            && preg_match('/\d/', $contrasena) === 1;
    }
}
