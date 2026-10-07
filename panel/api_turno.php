<?php
/**
 * api_turno.php — Endpoint JSON para modificar y cancelar turnos
 * Solo accesible para recepcionista (sesión activa + rol correcto).
 * Responde siempre JSON: {"ok": bool, "error": string|null}
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

// Solo POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);
    exit;
}

// Verificar sesión y rol sin redirigir (somos un endpoint JSON)
ensureSessionStarted();
if (!isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autenticado.']);
    exit;
}
if (currentRole() !== 'recepcionista') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Acceso denegado.']);
    exit;
}

$accion = trim((string) ($_POST['accion'] ?? ''));
$idTurno = (int) ($_POST['id_turno'] ?? 0);

if ($idTurno <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'ID de turno inválido.']);
    exit;
}

// ──────────────────────────────────────────────
// ACCIÓN: CANCELAR
// ──────────────────────────────────────────────
if ($accion === 'cancelar') {
    try {
        // Verificar que el turno existe y no está ya cancelado o atendido
        $check = $pdo->prepare('SELECT estado FROM turnos WHERE id_turno = :id LIMIT 1');
        $check->execute([':id' => $idTurno]);
        $row = $check->fetch();

        if (!$row) {
            echo json_encode(['ok' => false, 'error' => 'Turno no encontrado.']);
            exit;
        }
        if ($row['estado'] === 'cancelado') {
            echo json_encode(['ok' => false, 'error' => 'El turno ya está cancelado.']);
            exit;
        }
        if ($row['estado'] === 'atendido') {
            echo json_encode(['ok' => false, 'error' => 'No se puede cancelar un turno ya atendido.']);
            exit;
        }

        $stmt = $pdo->prepare('UPDATE turnos SET estado = :estado WHERE id_turno = :id');
        $stmt->execute([':estado' => 'cancelado', ':id' => $idTurno]);

        echo json_encode(['ok' => true, 'error' => null]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error interno al cancelar el turno.']);
    }
    exit;
}

// ──────────────────────────────────────────────
// ACCIÓN: MODIFICAR
// ──────────────────────────────────────────────
if ($accion === 'modificar') {
    $nuevaFecha  = trim((string) ($_POST['fecha']  ?? ''));
    $nuevaHora   = trim((string) ($_POST['hora']   ?? ''));
    $nuevoEstado = trim((string) ($_POST['estado'] ?? ''));

    $estadosValidos = ['pendiente', 'confirmado', 'en_curso', 'atendido', 'cancelado'];
    $horasValidas   = ['09:00:00', '09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:15:00', '11:30:00', '12:00:00',
                       '08:00:00', '08:15:00', '08:30:00'];

    // Validaciones
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $nuevaFecha)) {
        echo json_encode(['ok' => false, 'error' => 'Fecha inválida.']);
        exit;
    }
    $dateObj = DateTimeImmutable::createFromFormat('!Y-m-d', $nuevaFecha);
    if (!$dateObj || $dateObj->format('Y-m-d') !== $nuevaFecha) {
        echo json_encode(['ok' => false, 'error' => 'Fecha inválida.']);
        exit;
    }
    // Normalizar hora: acepta HH:MM o HH:MM:SS
    if (preg_match('/^\d{2}:\d{2}$/', $nuevaHora)) {
        $nuevaHora .= ':00';
    }
    if (!preg_match('/^\d{2}:\d{2}:\d{2}$/', $nuevaHora)) {
        echo json_encode(['ok' => false, 'error' => 'Horario inválido.']);
        exit;
    }
    if (!in_array($nuevoEstado, $estadosValidos, true)) {
        echo json_encode(['ok' => false, 'error' => 'Estado inválido.']);
        exit;
    }

    try {
        // Verificar que el turno existe
        $check = $pdo->prepare('SELECT id_turno, id_medico, estado FROM turnos WHERE id_turno = :id LIMIT 1');
        $check->execute([':id' => $idTurno]);
        $row = $check->fetch();

        if (!$row) {
            echo json_encode(['ok' => false, 'error' => 'Turno no encontrado.']);
            exit;
        }

        // Verificar conflicto de horario: otro turno del mismo médico en esa fecha+hora
        $conflict = $pdo->prepare(
            'SELECT 1 FROM turnos
             WHERE id_medico = :id_medico AND fecha = :fecha AND hora = :hora AND id_turno != :id_turno
             LIMIT 1'
        );
        $conflict->execute([
            ':id_medico' => $row['id_medico'],
            ':fecha'     => $nuevaFecha,
            ':hora'      => $nuevaHora,
            ':id_turno'  => $idTurno,
        ]);
        if ($conflict->fetchColumn()) {
            echo json_encode(['ok' => false, 'error' => 'Ese horario ya está ocupado para ese médico en esa fecha.']);
            exit;
        }

        $stmt = $pdo->prepare(
            'UPDATE turnos SET fecha = :fecha, hora = :hora, estado = :estado WHERE id_turno = :id'
        );
        $stmt->execute([
            ':fecha'  => $nuevaFecha,
            ':hora'   => $nuevaHora,
            ':estado' => $nuevoEstado,
            ':id'     => $idTurno,
        ]);

        echo json_encode(['ok' => true, 'error' => null]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error interno al modificar el turno.']);
    }
    exit;
}

// Acción desconocida
http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Acción desconocida.']);
