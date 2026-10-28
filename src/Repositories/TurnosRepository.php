<?php
declare(strict_types=1);

namespace MediControl\Repositories;

use Database;
use DateTimeImmutable;
use PDO;

/**
 * Consultas de turnos. Es el único lugar de la API con SQL de turnos.
 * Las notas médicas no se incluyen: recepción no debe verlas.
 */
final class TurnosRepository
{
    private const SELECT_TURNO = "
        SELECT
            t.id_turno,
            t.fecha,
            t.hora,
            t.estado,
            t.motivo_consulta,
            p.id_paciente,
            CONCAT(up.nombre, ' ', up.apellido) AS paciente,
            up.dni AS paciente_dni,
            p.obra_social,
            m.id_medico,
            CONCAT(um.nombre, ' ', um.apellido) AS medico,
            m.especialidad
        FROM turnos t
        INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
        INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
        INNER JOIN medicos m ON m.id_medico = t.id_medico
        INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
    ";

    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    public function listarPorFecha(string $fecha): array
    {
        $stmt = $this->pdo->prepare(self::SELECT_TURNO . ' WHERE t.fecha = :fecha ORDER BY t.hora ASC, t.id_turno ASC');
        $stmt->execute([':fecha' => $fecha]);

        return array_map([self::class, 'formatear'], $stmt->fetchAll());
    }

    /** Turnos entre dos fechas inclusive (YYYY-MM-DD), ordenados por fecha y hora. */
    public function listarPorRango(string $desde, string $hasta): array
    {
        $stmt = $this->pdo->prepare(self::SELECT_TURNO . ' WHERE t.fecha BETWEEN :desde AND :hasta ORDER BY t.fecha ASC, t.hora ASC, t.id_turno ASC');
        $stmt->execute([':desde' => $desde, ':hasta' => $hasta]);

        return array_map([self::class, 'formatear'], $stmt->fetchAll());
    }

    public function buscarPorId(int $idTurno): ?array
    {
        $stmt = $this->pdo->prepare(self::SELECT_TURNO . ' WHERE t.id_turno = :id LIMIT 1');
        $stmt->execute([':id' => $idTurno]);
        $fila = $stmt->fetch();

        return $fila ? self::formatear($fila) : null;
    }

    /**
     * Cantidad de turnos por día y por estado para el mes que empieza en $primerDia.
     * Filtra por rango de fechas para aprovechar el índice idx_turnos_fecha.
     *
     * @return array<string, array<string, int>> fecha => [total, pendiente, confirmado, ...]
     */
    public function resumenMensual(DateTimeImmutable $primerDia): array
    {
        $stmt = $this->pdo->prepare("
            SELECT
                fecha,
                COUNT(*) AS total,
                SUM(estado = 'pendiente')  AS pendiente,
                SUM(estado = 'confirmado') AS confirmado,
                SUM(estado = 'en_curso')   AS en_curso,
                SUM(estado = 'atendido')   AS atendido,
                SUM(estado = 'cancelado')  AS cancelado
            FROM turnos
            WHERE fecha BETWEEN :inicio AND :fin
            GROUP BY fecha
            ORDER BY fecha
        ");
        $stmt->execute([
            ':inicio' => $primerDia->format('Y-m-d'),
            ':fin'    => $primerDia->modify('last day of this month')->format('Y-m-d'),
        ]);

        $dias = [];
        foreach ($stmt->fetchAll() as $fila) {
            $fecha = (string) $fila['fecha'];
            unset($fila['fecha']);
            $dias[$fecha] = array_map('intval', $fila);
        }

        return $dias;
    }

    // ── Escritura ────────────────────────────────────────────────────────────

    /** Valores actuales de un turno tal como están en la base (hora HH:MM:SS), para validar cambios. */
    public function buscarParaActualizar(int $idTurno): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id_turno, id_paciente, id_medico, fecha, hora, estado FROM turnos WHERE id_turno = :id LIMIT 1');
        $stmt->execute([':id' => $idTurno]);
        $fila = $stmt->fetch();

        return $fila ?: null;
    }

    /**
     * Indica si el médico ya tiene un turno en esa fecha y hora.
     * Incluye los cancelados: la restricción única de la tabla también los cuenta.
     */
    public function horarioOcupado(int $idMedico, string $fecha, string $hora, ?int $exceptoTurno = null): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM turnos
             WHERE id_medico = :id_medico AND fecha = :fecha AND hora = :hora AND id_turno <> :excepto
             LIMIT 1'
        );
        $stmt->execute([':id_medico' => $idMedico, ':fecha' => $fecha, ':hora' => $hora, ':excepto' => $exceptoTurno ?? 0]);

        return (bool) $stmt->fetchColumn();
    }

    /** Horas (HH:MM:SS) ya ocupadas por el médico en una fecha. */
    public function horasOcupadas(int $idMedico, string $fecha): array
    {
        $stmt = $this->pdo->prepare('SELECT hora FROM turnos WHERE id_medico = :id_medico AND fecha = :fecha');
        $stmt->execute([':id_medico' => $idMedico, ':fecha' => $fecha]);

        return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /** Crea un turno pendiente y devuelve su id. */
    public function insertar(int $idPaciente, int $idMedico, string $fecha, string $hora, string $motivo): int
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta)
            VALUES (:id_paciente, :id_medico, :fecha, :hora, 'pendiente', :motivo)
        ");
        $stmt->execute([
            ':id_paciente' => $idPaciente,
            ':id_medico'   => $idMedico,
            ':fecha'       => $fecha,
            ':hora'        => $hora,
            ':motivo'      => $motivo,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Actualiza fecha, hora y estado solo si el turno sigue con los valores leídos
     * (evita pisar un cambio hecho por otra persona). Devuelve las filas modificadas.
     */
    public function actualizarSiNoCambio(int $idTurno, array $nuevo, array $actual): int
    {
        $stmt = $this->pdo->prepare(
            'UPDATE turnos SET fecha = :fecha, hora = :hora, estado = :estado
             WHERE id_turno = :id AND fecha = :fecha_actual AND hora = :hora_actual AND estado = :estado_actual'
        );
        $stmt->execute([
            ':fecha'         => $nuevo['fecha'],
            ':hora'          => $nuevo['hora'],
            ':estado'        => $nuevo['estado'],
            ':id'            => $idTurno,
            ':fecha_actual'  => $actual['fecha'],
            ':hora_actual'   => $actual['hora'],
            ':estado_actual' => $actual['estado'],
        ]);

        return $stmt->rowCount();
    }

    /** Cancela el turno solo si sigue en el estado leído. Devuelve las filas modificadas. */
    public function cancelarSiEstado(int $idTurno, string $estadoActual): int
    {
        $stmt = $this->pdo->prepare("UPDATE turnos SET estado = 'cancelado' WHERE id_turno = :id AND estado = :estado_actual");
        $stmt->execute([':id' => $idTurno, ':estado_actual' => $estadoActual]);

        return $stmt->rowCount();
    }

    private static function formatear(array $fila): array
    {
        $fila['id_turno'] = (int) $fila['id_turno'];
        $fila['id_paciente'] = (int) $fila['id_paciente'];
        $fila['id_medico'] = (int) $fila['id_medico'];
        $fila['hora'] = substr((string) $fila['hora'], 0, 5);

        return $fila;
    }
}
