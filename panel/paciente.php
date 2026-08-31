```php
<?php

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('paciente');

$idUsuario = (int) $_SESSION['id_usuario'];

try {
    // Obtener los datos del paciente asociado al usuario autenticado.
    $sqlPaciente = "
        SELECT
            u.nombre,
            u.apellido,
            u.email,
            p.id_paciente,
            p.telefono,
            p.direccion,
            p.obra_social
        FROM usuarios u
        INNER JOIN pacientes p ON p.id_usuario = u.id_usuario
        WHERE u.id_usuario = :id_usuario
        LIMIT 1
    ";

    $stmtPaciente = $pdo->prepare($sqlPaciente);
    $stmtPaciente->execute(['id_usuario' => $idUsuario]);
    $paciente = $stmtPaciente->fetch();

    if (!$paciente) {
        die('No se encontró el perfil del paciente.');
    }

    $sqlTurnos = "
        SELECT
            fecha,
            hora,
            medico_nombre,
            medico_apellido,
            medico_especialidad,
            estado,
            motivo_consulta
        FROM vista_paciente_turnos
        WHERE id_paciente = :id_paciente
        ORDER BY fecha ASC, hora ASC
    ";

    $stmtTurnos = $pdo->prepare($sqlTurnos);
    $stmtTurnos->execute(['id_paciente' => $paciente['id_paciente']]);
    $turnos = $stmtTurnos->fetchAll();
} catch (PDOException $e) {
    http_response_code(500);
    die('No se pudo cargar la información del paciente. Intentá nuevamente más tarde.');
}

$estadosTurno = [
    'pendiente' => 'Pendiente',
    'confirmado' => 'Confirmado',
    'en_curso' => 'En curso',
    'atendido' => 'Atendido',
    'cancelado' => 'Cancelado',
];

$estilosEstado = [
    'pendiente' => 'background:#fef3c7; color:#b45309;',
    'confirmado' => 'background:#dcfce7; color:#15803d;',
    'en_curso' => 'background:#e0e7ff; color:#3730a3;',
    'atendido' => 'background:#e0f2fe; color:#0369a1;',
    'cancelado' => 'background:#fee2e2; color:#b91c1c;',
];
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MEDICONTROL - Panel del Paciente</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: #f8fafc; color: #0f172a; min-height: 100vh; }
        header { background: #0f172a; color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        header a { color: #38bdf8; text-decoration: none; font-size: 0.85rem; font-weight: 600; }
        .header-links { display: flex; gap: 1rem; }
        .container { max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; }
        .welcome-box { margin-bottom: 1.5rem; }
        .welcome-box h1 { font-size: 1.5rem; font-weight: 800; }
        .welcome-box p { color: #64748b; font-size: 0.88rem; margin-top: 0.25rem; }
        .profile-card, .appointment-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
        .section-title { font-size: 1.05rem; font-weight: 800; margin-bottom: 1rem; }
        .profile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem 1.5rem; }
        .profile-item { font-size: 0.85rem; color: #475569; }
        .profile-item strong { color: #0f172a; }
        .app-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9; }
        .date-badge { background: #e0f2fe; color: #0369a1; font-weight: 800; padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.88rem; }
        .status-badge { padding: 0.25rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700; }
        .app-body h3 { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
        .app-body p { font-size: 0.85rem; color: #475569; margin-top: 0.3rem; }
        .empty-message { color: #64748b; font-size: 0.88rem; }
        @media (max-width: 600px) {
            header { padding: 1rem; }
            .header-links { gap: 0.6rem; }
            .container { margin: 1.25rem auto; padding: 0 1rem; }
            .profile-grid { grid-template-columns: 1fr; }
            .app-header { align-items: flex-start; flex-direction: column; }
        }
    </style>
</head>

<body>

    <header>
        <div style="font-weight: 800;">MEDICONTROL • Paciente</div>
        <div class="header-links">
            <a href="../logout.php">Cerrar sesión</a>
        </div>
    </header>

    <main class="container">
        <section class="welcome-box">
            <h1>Hola, <?= htmlspecialchars($paciente['nombre'] . ' ' . $paciente['apellido'], ENT_QUOTES, 'UTF-8') ?></h1>
            <p>Consultá tu información personal y tus turnos registrados.</p>
        </section>

        <section class="profile-card">
            <h2 class="section-title">Mis datos</h2>
            <div class="profile-grid">
                <div class="profile-item"><strong>Nombre y apellido:</strong> <?= htmlspecialchars($paciente['nombre'] . ' ' . $paciente['apellido'], ENT_QUOTES, 'UTF-8') ?></div>
                <div class="profile-item"><strong>Email:</strong> <?= htmlspecialchars($paciente['email'], ENT_QUOTES, 'UTF-8') ?></div>
                <div class="profile-item"><strong>Teléfono:</strong> <?= htmlspecialchars($paciente['telefono'] ?? 'No informado', ENT_QUOTES, 'UTF-8') ?></div>
                <div class="profile-item"><strong>Dirección:</strong> <?= htmlspecialchars($paciente['direccion'] ?? 'No informada', ENT_QUOTES, 'UTF-8') ?></div>
                <div class="profile-item"><strong>Obra social:</strong> <?= htmlspecialchars($paciente['obra_social'] ?? 'Particular', ENT_QUOTES, 'UTF-8') ?></div>
                <div class="profile-item"><strong>Rol:</strong> Paciente</div>
            </div>
        </section>

        <section>
            <h2 class="section-title">Mis turnos</h2>
            <?php if (count($turnos) === 0): ?>
                <p class="empty-message">Actualmente no tenés turnos registrados.</p>
            <?php else: ?>
                <?php foreach ($turnos as $turno): ?>
                    <article class="appointment-card">
                        <div class="app-header">
                            <span class="date-badge">
                                <?= htmlspecialchars(date('d/m/Y', strtotime($turno['fecha'])) . ' - ' . substr($turno['hora'], 0, 5) . ' hs', ENT_QUOTES, 'UTF-8') ?>
                            </span>
                            <span class="status-badge" style="<?= htmlspecialchars($estilosEstado[$turno['estado']] ?? '', ENT_QUOTES, 'UTF-8') ?>">
                                <?= htmlspecialchars($estadosTurno[$turno['estado']] ?? $turno['estado'], ENT_QUOTES, 'UTF-8') ?>
                            </span>
                        </div>
                        <div class="app-body">
                            <h3>Médico: <?= htmlspecialchars($turno['medico_nombre'] . ' ' . $turno['medico_apellido'], ENT_QUOTES, 'UTF-8') ?></h3>
                            <p><strong>Especialidad:</strong> <?= htmlspecialchars($turno['medico_especialidad'], ENT_QUOTES, 'UTF-8') ?></p>
                            <?php if ($turno['motivo_consulta'] !== null && $turno['motivo_consulta'] !== ''): ?>
                                <p><strong>Motivo:</strong> <?= htmlspecialchars($turno['motivo_consulta'], ENT_QUOTES, 'UTF-8') ?></p>
                            <?php endif; ?>
                        </div>
                    </article>
                <?php endforeach; ?>
            <?php endif; ?>
        </section>
    </main>

</body>
</html>
