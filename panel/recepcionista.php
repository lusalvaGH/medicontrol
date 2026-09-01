<?php

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$idUsuario = (int) $_SESSION['id_usuario'];
$nombre = $_SESSION['nombre'] ?? '';
$apellido = $_SESSION['apellido'] ?? '';

$selectedDate = $_GET['fecha'] ?? date('Y-m-d');
$selectedDate = trim((string) $selectedDate);
$hasValidDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $selectedDate) === 1;
$selectedDateObj = DateTimeImmutable::createFromFormat('Y-m-d', $selectedDate);
if (!$hasValidDate || !$selectedDateObj || $selectedDateObj->format('Y-m-d') !== $selectedDate) {
    $selectedDate = date('Y-m-d');
    $dateMessage = 'La fecha seleccionada no era válida. Se mostró la fecha actual.';
} else {
    $dateMessage = null;
}

$estadoLabels = [
    'pendiente' => 'Pendiente',
    'confirmado' => 'Confirmado',
    'en_curso' => 'En curso',
    'atendido' => 'Atendido',
    'cancelado' => 'Cancelado',
];

$estadoStyles = [
    'pendiente' => 'background:#fef3c7; color:#b45309;',
    'confirmado' => 'background:#dcfce7; color:#15803d;',
    'en_curso' => 'background:#e0e7ff; color:#3730a3;',
    'atendido' => 'background:#e0f2fe; color:#0369a1;',
    'cancelado' => 'background:#fee2e2; color:#b91c1c;',
];

$turnos = [];
$queryError = null;

try {
    $sqlTurnos = "
        SELECT
            t.id_turno,
            t.fecha,
            t.hora,
            t.estado,
            t.motivo_consulta,
            CONCAT(up.nombre, ' ', up.apellido) AS paciente,
            CONCAT(um.nombre, ' ', um.apellido) AS medico,
            m.especialidad
        FROM turnos t
        INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
        INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
        INNER JOIN medicos m ON m.id_medico = t.id_medico
        INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
        WHERE t.fecha = :fecha
        ORDER BY t.hora ASC, t.id_turno ASC
    ";

    $stmtTurnos = $pdo->prepare($sqlTurnos);
    $stmtTurnos->execute(['fecha' => $selectedDate]);
    $turnos = $stmtTurnos->fetchAll();
} catch (PDOException $e) {
    $queryError = 'No se pudieron cargar los turnos de la fecha seleccionada. Intentá nuevamente más tarde.';
    $turnos = [];
}
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediCore Health - Panel de Recepción</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
    <style>
        .agenda-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 1rem;
        }

        .date-form {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
        }

        .date-form label {
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--text-muted);
        }

        .date-form input[type="date"] {
            border: 1px solid var(--border-dark);
            border-radius: 8px;
            background: var(--bg-subtle);
            color: var(--text-dark);
            padding: 0.6rem 0.8rem;
            font-size: 0.85rem;
            min-width: 170px;
        }

        .turnos-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--bg-card);
        }

        .turnos-table th,
        .turnos-table td {
            padding: 0.9rem 0.75rem;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: middle;
            font-size: 0.83rem;
        }

        .turnos-table th {
            color: var(--text-muted);
            font-size: 0.72rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            background: #f8fafc;
        }

        .turnos-table tbody tr:hover {
            background: #f8fafc;
        }

        .badge-state {
            display: inline-block;
            padding: 0.3rem 0.7rem;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.02em;
        }

        .empty-panel {
            background: var(--bg-subtle);
            border: 1px dashed var(--border-dark);
            color: var(--text-muted);
            border-radius: 8px;
            padding: 1rem;
            font-size: 0.85rem;
        }

        .alert-box {
            padding: 0.85rem 1rem;
            border-radius: 10px;
            background: #fff7ed;
            color: #9a5b00;
            border: 1px solid #fdba74;
            font-size: 0.82rem;
            margin-bottom: 1rem;
        }
    </style>
</head>

<body>

    <div class="app-container">
        <div class="main-area">
            <header>
                <div class="search-input">
                    🔍 <input type="text" placeholder="Buscar paciente o médico..." disabled>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="font-size:0.85rem; font-weight:700; color:var(--primary);">
                        <?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?> (RECEPCIÓN)
                    </div>
                    <a href="../logout.php" class="btn btn-secondary">Cerrar sesión</a>
                </div>
            </header>

            <main class="page-padding">
                <div class="stats-grid">
                    <div class="stat-card">
                        <div>
                            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">Turnos del día</div>
                            <div class="stat-val" style="font-size:1rem;">
                                <?= count($turnos) ?>
                            </div>
                        </div>
                        <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">📅</div>
                    </div>
                    <div class="stat-card">
                        <div>
                            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">Fecha consultada</div>
                            <div class="stat-val" style="font-size:1rem;">
                                <?= htmlspecialchars(date('d/m/Y', strtotime($selectedDate)), ENT_QUOTES, 'UTF-8') ?>
                            </div>
                        </div>
                        <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">📌</div>
                    </div>
                    <div class="stat-card">
                        <div>
                            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">Rol actual</div>
                            <div class="stat-val" style="font-size:1rem; color:var(--primary);">Recepcionista</div>
                        </div>
                        <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">🛡️</div>
                    </div>
                </div>

                <section class="table-container">
                    <div class="agenda-toolbar">
                        <div>
                            <h1 style="font-size:1.2rem; font-weight:800; color:var(--text-dark);">Agenda de turnos</h1>
                            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
                                Bienvenido/a, <?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?>.
                            </p>
                        </div>

                        <form method="GET" class="date-form">
                            <label for="fecha">Fecha</label>
                            <input id="fecha" type="date" name="fecha" value="<?= htmlspecialchars($selectedDate, ENT_QUOTES, 'UTF-8') ?>" />
                            <button type="submit" class="btn btn-primary">Consultar</button>
                        </form>
                    </div>

                    <?php if (!empty($dateMessage)): ?>
                        <div class="alert-box">
                            <?= htmlspecialchars($dateMessage, ENT_QUOTES, 'UTF-8') ?>
                        </div>
                    <?php endif; ?>

                    <?php if (!empty($queryError)): ?>
                        <div class="alert-box">
                            <?= htmlspecialchars($queryError, ENT_QUOTES, 'UTF-8') ?>
                        </div>
                    <?php elseif (empty($turnos)): ?>
                        <div class="empty-panel">
                            No hay turnos para el día <?= htmlspecialchars(date('d/m/Y', strtotime($selectedDate)), ENT_QUOTES, 'UTF-8') ?>.
                        </div>
                    <?php else: ?>
                        <table class="turnos-table">
                            <thead>
                                <tr>
                                    <th>Hora</th>
                                    <th>Paciente</th>
                                    <th>Médico</th>
                                    <th>Especialidad</th>
                                    <th>Motivo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($turnos as $turno): ?>
                                    <?php
                                        $estado = isset($turno['estado']) ? (string) $turno['estado'] : '';
                                        $estadoLabel = $estadoLabels[$estado] ?? ucfirst(str_replace('_', ' ', $estado));
                                        $estadoStyle = $estadoStyles[$estado] ?? 'background:#e2e8f0; color:#334155;';
                                    ?>
                                    <tr>
                                        <td><?= htmlspecialchars(substr($turno['hora'], 0, 5), ENT_QUOTES, 'UTF-8') ?> hs</td>
                                        <td><?= htmlspecialchars(trim((string) $turno['paciente']), ENT_QUOTES, 'UTF-8') ?></td>
                                        <td><?= htmlspecialchars(trim((string) $turno['medico']), ENT_QUOTES, 'UTF-8') ?></td>
                                        <td><?= htmlspecialchars((string) $turno['especialidad'], ENT_QUOTES, 'UTF-8') ?></td>
                                        <td><?= htmlspecialchars((string) ($turno['motivo_consulta'] ?? 'Sin motivo informado'), ENT_QUOTES, 'UTF-8') ?></td>
                                        <td>
                                            <span class="badge-state" style="<?= htmlspecialchars($estadoStyle, ENT_QUOTES, 'UTF-8') ?>">
                                                <?= htmlspecialchars($estadoLabel, ENT_QUOTES, 'UTF-8') ?>
                                            </span>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                </section>
            </main>
        </div>
    </div>

</body>
</html>
