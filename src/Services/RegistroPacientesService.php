<?php
declare(strict_types=1);

namespace MediControl\Services;

use DateTimeImmutable;
use Database;
use PDO;
use PDOException;

/**
 * Registro público de pacientes.
 *
 * Crea siempre un usuario con rol "paciente" (el rol nunca se toma del formulario)
 * y su perfil en la tabla pacientes, en una sola transacción.
 */
final class RegistroPacientesService
{
    public const GENEROS = ['Femenino', 'Masculino', 'Otro'];
    public const CONTRASENA_MINIMA = 8;
    public const CONTRASENA_MAXIMA = 72; // límite de bcrypt (bytes)

    /** Mensaje único para correo o DNI ya registrados: no revela cuál de los dos existe. */
    public const MENSAJE_DUPLICADO = 'No se pudo crear la cuenta con esos datos. Si ya tenés una cuenta, iniciá sesión.';

    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    /**
     * Normaliza y valida los datos del formulario.
     *
     * @return array{datos: array, errores: array<string, string>}
     */
    public static function validar(array $entrada, DateTimeImmutable $hoy): array
    {
        $texto = static fn (string $campo): string => is_string($entrada[$campo] ?? null) ? trim($entrada[$campo]) : '';
        $sinEspaciosDobles = static fn (string $v): string => (string) preg_replace('/\s+/u', ' ', $v);

        $datos = [
            'nombre'           => $sinEspaciosDobles($texto('nombre')),
            'apellido'         => $sinEspaciosDobles($texto('apellido')),
            'dni'              => str_replace(['.', ' ', '-'], '', $texto('dni')),
            'email'            => mb_strtolower($texto('email')),
            'telefono'         => $texto('telefono'),
            'direccion'        => $sinEspaciosDobles($texto('direccion')),
            'fecha_nacimiento' => $texto('fecha_nacimiento'),
            'genero'           => $texto('genero'),
            'obra_social'      => $sinEspaciosDobles($texto('obra_social')),
        ];
        $contrasena = is_string($entrada['contrasena'] ?? null) ? $entrada['contrasena'] : '';
        $confirmacion = is_string($entrada['contrasena_confirmacion'] ?? null) ? $entrada['contrasena_confirmacion'] : '';

        $errores = [];
        $patronNombre = "/^\\p{L}[\\p{L}\\p{M}' .-]*$/u";
        foreach (['nombre' => 'El nombre', 'apellido' => 'El apellido'] as $campo => $etiqueta) {
            if ($datos[$campo] === '') {
                $errores[$campo] = "{$etiqueta} es obligatorio.";
            } elseif (mb_strlen($datos[$campo]) < 2 || mb_strlen($datos[$campo]) > 80 || !preg_match($patronNombre, $datos[$campo])) {
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

        if ($contrasena === '') {
            $errores['contrasena'] = 'La contraseña es obligatoria.';
        } elseif (mb_strlen($contrasena) < self::CONTRASENA_MINIMA || strlen($contrasena) > self::CONTRASENA_MAXIMA
            || !preg_match('/\p{L}/u', $contrasena) || !preg_match('/\d/', $contrasena)) {
            $errores['contrasena'] = 'La contraseña debe tener entre ' . self::CONTRASENA_MINIMA . ' y ' . self::CONTRASENA_MAXIMA . ' caracteres e incluir letras y números.';
        } elseif ($contrasena !== $confirmacion) {
            $errores['contrasena_confirmacion'] = 'Las contraseñas no coinciden.';
        }

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

        $datos['contrasena'] = $contrasena;

        return ['datos' => $datos, 'errores' => $errores];
    }

    /**
     * Crea el usuario paciente y su perfil. Devuelve el id_usuario creado,
     * o null si el correo o el DNI ya están registrados.
     */
    public function registrar(array $datos): ?int
    {
        if ($this->existeEmailODni($datos['email'], $datos['dni'])) {
            return null;
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado)
                VALUES (:nombre, :apellido, :dni, :email, :contrasena, 'paciente', 'activo')
            ");
            $stmt->execute([
                ':nombre'     => $datos['nombre'],
                ':apellido'   => $datos['apellido'],
                ':dni'        => $datos['dni'],
                ':email'      => $datos['email'],
                ':contrasena' => password_hash($datos['contrasena'], PASSWORD_DEFAULT),
            ]);
            $idUsuario = (int) $this->pdo->lastInsertId();

            $stmt = $this->pdo->prepare('
                INSERT INTO pacientes (id_usuario, telefono, direccion, fecha_nacimiento, genero, obra_social)
                VALUES (:id_usuario, :telefono, :direccion, :fecha_nacimiento, :genero, :obra_social)
            ');
            $stmt->execute([
                ':id_usuario'       => $idUsuario,
                ':telefono'         => $datos['telefono'] !== '' ? $datos['telefono'] : null,
                ':direccion'        => $datos['direccion'] !== '' ? $datos['direccion'] : null,
                ':fecha_nacimiento' => $datos['fecha_nacimiento'] !== '' ? $datos['fecha_nacimiento'] : null,
                ':genero'           => $datos['genero'] !== '' ? $datos['genero'] : null,
                ':obra_social'      => $datos['obra_social'] !== '' ? $datos['obra_social'] : 'Particular',
            ]);

            $this->pdo->commit();

            return $idUsuario;
        } catch (PDOException $e) {
            $this->pdo->rollBack();
            // Dos envíos simultáneos con el mismo correo o DNI: la restricción única lo impide
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                return null;
            }
            throw $e;
        }
    }

    private function existeEmailODni(string $email, string $dni): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM usuarios WHERE email = :email OR dni = :dni LIMIT 1');
        $stmt->execute([':email' => $email, ':dni' => $dni]);

        return (bool) $stmt->fetchColumn();
    }
}
