<?php
declare(strict_types=1);

namespace MediControl\Repositories;

use Database;
use PDO;

final class UsuariosRepository
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    /**
     * Datos del usuario necesarios para validar una sesión (sin la contraseña).
     */
    public function buscarPorId(int $idUsuario): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id_usuario, nombre, apellido, email, rol, estado
             FROM usuarios
             WHERE id_usuario = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $idUsuario]);
        $fila = $stmt->fetch();

        return $fila ?: null;
    }
}
