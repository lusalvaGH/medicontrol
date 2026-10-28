<?php
/**
 * api_turnos_dia.php — Endpoint JSON GET para el calendario mensual.
 *
 * Modos de uso:
 *   ?fecha=YYYY-MM-DD          → Devuelve todos los turnos de ese día.
 *   ?mes=YYYY-MM               → Devuelve el conteo de turnos por día del mes.
 *   ?id_turno=N                → Devuelve el detalle completo de ese turno.
 *
 * Solo accesible para recepcionista (sesión activa + rol correcto).
 * Responde siempre JSON.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/turnos.php';

// Solo GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);
    exit;
}

// Verificar sesión y rol
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

// ──────────────────────────────────────────────
// MODO 1: Detalle de un turno por id_turno
// ──────────────────────────────────────────────
if (isset($_GET['id_turno'])) {
    $idTurno = (int) $_GET['id_turno'];
    if ($idTurno <= 0) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'ID de turno inválido.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT
                t.id_turno,
                t.fecha,
                t.hora,
                t.estado,
                t.motivo_consulta,
                CONCAT(up.nombre, ' ', up.apellido) AS paciente,
                up.dni AS paciente_dni,
                p.obra_social,
                CONCAT(um.nombre, ' ', um.apellido) AS medico,
                m.especialidad
            FROM turnos t
            INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
            INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
            INNER JOIN medicos m ON m.id_medico = t.id_medico
            INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
            WHERE t.id_turno = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $idTurno]);
        $turno = $stmt->fetch();

        if (!$turno) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Turno no encontrado.']);
            exit;
        }

        // Formatear hora a HH:MM
        $turno['hora'] = substr((string) $turno['hora'], 0, 5);

        echo json_encode(['ok' => true, 'turno' => $turno]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error interno al obtener el turno.']);
    }
    exit;
}

// ──────────────────────────────────────────────
// MODO 2: Lista de turnos de un día
// ──────────────────────────────────────────────
if (isset($_GET['fecha'])) {
    $fecha = trim((string) $_GET['fecha']);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Fecha inválida.']);
        exit;
    }
    $dateObj = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
    if (!$dateObj || $dateObj->format('Y-m-d') !== $fecha) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Fecha inválida.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT
                t.id_turno,
                t.hora,
                t.estado,
                t.motivo_consulta,
                CONCAT(up.nombre, ' ', up.apellido) AS paciente,
                up.dni AS paciente_dni,
                p.obra_social,
                CONCAT(um.nombre, ' ', um.apellido) AS medico,
                m.especialidad
            FROM turnos t
            INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
            INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
            INNER JOIN medicos m ON m.id_medico = t.id_medico
            INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
            WHERE t.fecha = :fecha
            ORDER BY t.hora ASC, t.id_turno ASC
        ");
        $stmt->execute([':fecha' => $fecha]);
        $turnos = $stmt->fetchAll();

        // Formatear horas a HH:MM
        foreach ($turnos as &$t) {
            $t['hora'] = substr((string) $t['hora'], 0, 5);
        }
        unset($t);

        echo json_encode(['ok' => true, 'fecha' => $fecha, 'turnos' => $turnos]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error interno al obtener los turnos del día.']);
    }
    exit;
}

// ──────────────────────────────────────────────
// MODO 3: Conteo de turnos por día de un mes
// ──────────────────────────────────────────────
if (isset($_GET['mes'])) {
    $mes = is_string($_GET['mes']) ? trim($_GET['mes']) : '';

    $dateObj = turnosParsearMes($mes);
    if ($dateObj === null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Mes inválido. Formato esperado: YYYY-MM.']);
        exit;
    }
    $primerDia = $dateObj->format('Y-m-d');
    $ultimoDia = $dateObj->modify('last day of this month')->format('Y-m-d');

    try {
        $stmt = $pdo->prepare("
            SELECT
                DATE_FORMAT(fecha, '%Y-%m-%d') AS dia,
                COUNT(*) AS total
            FROM turnos
            WHERE fecha BETWEEN :inicio AND :fin
            GROUP BY fecha
            ORDER BY fecha ASC
        ");
        $stmt->execute([':inicio' => $primerDia, ':fin' => $ultimoDia]);
        $rows = $stmt->fetchAll();

        // Construir mapa día → total
        $conteo = [];
        foreach ($rows as $row) {
            $conteo[$row['dia']] = (int) $row['total'];
        }

        echo json_encode(['ok' => true, 'mes' => $mes, 'conteo' => $conteo]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error interno al obtener el conteo mensual.']);
    }
    exit;
}

// Ningún parámetro válido
http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Parámetro requerido: fecha, mes o id_turno.']);
