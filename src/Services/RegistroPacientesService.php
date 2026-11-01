<?php
declare(strict_types=1);

namespace MediControl\Services;

use DateTimeImmutable;
use Database;
use MediControl\Repositories\UsuariosRepository;
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
    public const GENEROS = ValidadorPersonas::GENEROS;
    public const CONTRASENA_MINIMA = ReglasContrasena::MINIMA;
    public const CONTRASENA_MAXIMA = ReglasContrasena::MAXIMA;

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
        $persona = ValidadorPersonas::persona($entrada);
        $perfil = ValidadorPersonas::perfilPaciente($entrada, $hoy);
        $contrasena = ValidadorPersonas::contrasena($entrada);

        return [
            'datos'   => $persona['datos'] + $perfil['datos'] + $contrasena['datos'],
            'errores' => $persona['errores'] + $contrasena['errores'] + $perfil['errores'],
        ];
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
            $usuarios = new UsuariosRepository($this->pdo);
            $idUsuario = $usuarios->insertar($datos, 'paciente', password_hash($datos['contrasena'], PASSWORD_DEFAULT));
            $usuarios->insertarPerfilPaciente($idUsuario, $datos);

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
        return (new UsuariosRepository($this->pdo))->datosDuplicados($email, $dni) !== [];
    }
}
