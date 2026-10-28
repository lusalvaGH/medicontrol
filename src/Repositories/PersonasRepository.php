<?php
declare(strict_types=1);

namespace MediControl\Repositories;

use Database;
use PDO;

/**
 * Consultas de pacientes y médicos necesarias para registrar turnos.
 * Solo devuelve personas con el usuario activo.
 */
final class PersonasRepository
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    public function buscarPacientes(string $texto, int $limite): array
    {
        $stmt = $this->pdo->prepare("
            SELECT p.id_paciente, u.nombre, u.apellido, u.dni, p.obra_social
            FROM pacientes p
            INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
            WHERE u.estado = 'activo'
              AND (u.nombre LIKE :t1 OR u.apellido LIKE :t2 OR CONCAT(u.nombre, ' ', u.apellido) LIKE :t3 OR u.dni LIKE :t4)
            ORDER BY u.apellido, u.nombre
            LIMIT {$limite}
        ");
        $patron = '%' . addcslashes($texto, '%_\\') . '%';
        $stmt->execute([':t1' => $patron, ':t2' => $patron, ':t3' => $patron, ':t4' => $patron]);

        return array_map(static function (array $fila): array {
            $fila['id_paciente'] = (int) $fila['id_paciente'];

            return $fila;
        }, $stmt->fetchAll());
    }

    public function listarMedicos(): array
    {
        $filas = $this->pdo->query("
            SELECT m.id_medico, u.nombre, u.apellido, m.especialidad
            FROM medicos m
            INNER JOIN usuarios u ON u.id_usuario = m.id_usuario
            WHERE u.estado = 'activo'
            ORDER BY u.apellido, u.nombre
        ")->fetchAll();

        return array_map(static function (array $fila): array {
            $fila['id_medico'] = (int) $fila['id_medico'];

            return $fila;
        }, $filas);
    }

    public function pacienteActivo(int $idPaciente): bool
    {
        $stmt = $this->pdo->prepare("SELECT 1 FROM pacientes p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE p.id_paciente = :id AND u.estado = 'activo'");
        $stmt->execute([':id' => $idPaciente]);

        return (bool) $stmt->fetchColumn();
    }

    public function medicoActivo(int $idMedico): bool
    {
        $stmt = $this->pdo->prepare("SELECT 1 FROM medicos m INNER JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE m.id_medico = :id AND u.estado = 'activo'");
        $stmt->execute([':id' => $idMedico]);

        return (bool) $stmt->fetchColumn();
    }
}
