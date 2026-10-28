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
require_once __DIR__ . '/../includes/turnos.php';

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
        // Verificar que el turno existe y que su estado actual permite cancelarlo
        $check = $pdo->prepare('SELECT estado FROM turnos WHERE id_turno = :id LIMIT 1');
        $check->execute([':id' => $idTurno]);
        $row = $check->fetch();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Turno no encontrado.']);
            exit;
        }
        if ($row['estado'] === 'cancelado') {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'El turno ya está cancelado.']);
            exit;
        }
        if (!turnosPuedeTransicionar((string) $row['estado'], 'cancelado')) {
            http_response_code(409);
            $estadoLabel = TURNOS_ESTADOS[$row['estado']] ?? $row['estado'];
            echo json_encode(['ok' => false, 'error' => "No se puede cancelar un turno «{$estadoLabel}»."]);
            exit;
        }

        // El WHERE por estado evita pisar un cambio hecho por otra persona entre la lectura y la escritura
        $stmt = $pdo->prepare('UPDATE turnos SET estado = :estado WHERE id_turno = :id AND estado = :estado_actual');
        $stmt->execute([':estado' => 'cancelado', ':id' => $idTurno, ':estado_actual' => $row['estado']]);
        if ($stmt->rowCount() === 0) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'El turno cambió mientras se cancelaba. Recargá la página e intentá de nuevo.']);
            exit;
        }

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
    $nuevaHora   = turnosNormalizarHora(trim((string) ($_POST['hora'] ?? '')));
    $nuevoEstado = trim((string) ($_POST['estado'] ?? ''));

    // Validaciones de formato (las reglas de negocio se aplican después, contra la base)
    if (!turnosFechaValida($nuevaFecha)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Fecha inválida.']);
        exit;
    }
    if ($nuevaHora === null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Horario inválido.']);
        exit;
    }
    if (!isset(TURNOS_ESTADOS[$nuevoEstado])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Estado inválido.']);
        exit;
    }

    try {
        // Valores actuales del turno
        $check = $pdo->prepare('SELECT id_turno, id_medico, fecha, hora, estado FROM turnos WHERE id_turno = :id LIMIT 1');
        $check->execute([':id' => $idTurno]);
        $row = $check->fetch();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Turno no encontrado.']);
            exit;
        }

        $validacion = turnosValidarModificacion($row, $nuevaFecha, $nuevaHora, $nuevoEstado, turnosAhora());
        if ($validacion['error'] !== null) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => $validacion['error']]);
            exit;
        }
        if ($validacion['sin_cambios']) {
            echo json_encode(['ok' => true, 'error' => null, 'sin_cambios' => true]);
            exit;
        }

        if ($validacion['reprograma']) {
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
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'Ese horario ya está ocupado para ese médico en esa fecha.']);
                exit;
            }
        }

        // El WHERE por los valores leídos evita pisar un cambio hecho por otra persona
        $stmt = $pdo->prepare(
            'UPDATE turnos SET fecha = :fecha, hora = :hora, estado = :estado
             WHERE id_turno = :id AND fecha = :fecha_actual AND hora = :hora_actual AND estado = :estado_actual'
        );
        $stmt->execute([
            ':fecha'         => $nuevaFecha,
            ':hora'          => $nuevaHora,
            ':estado'        => $nuevoEstado,
            ':id'            => $idTurno,
            ':fecha_actual'  => $row['fecha'],
            ':hora_actual'   => $row['hora'],
            ':estado_actual' => $row['estado'],
        ]);
        if ($stmt->rowCount() === 0) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'El turno cambió mientras se guardaba. Recargá la página e intentá de nuevo.']);
            exit;
        }

        echo json_encode(['ok' => true, 'error' => null]);
    } catch (PDOException $e) {
        if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Ese horario ya está ocupado para ese médico en esa fecha.']);
            exit;
        }
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error interno al modificar el turno.']);
    }
    exit;
}

// Acción desconocida
http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Acción desconocida.']);
