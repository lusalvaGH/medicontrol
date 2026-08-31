```php
<?php

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
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel del Paciente - MediControl</title>
</head>

<body>

    <h1>MediControl</h1>

    <h2>Panel del Paciente</h2>

    <p>
        Bienvenido,
        <strong>
            <?= htmlspecialchars($paciente['nombre'] . ' ' . $paciente['apellido']) ?>
        </strong>
    </p>

    <h3>Mis datos</h3>

    <ul>
        <li>
            Email:
            <?= htmlspecialchars($paciente['email']) ?>
        </li>

        <li>
            Teléfono:
            <?= htmlspecialchars($paciente['telefono'] ?? 'No informado') ?>
        </li>

        <li>
            Dirección:
            <?= htmlspecialchars($paciente['direccion'] ?? 'No informada') ?>
        </li>

        <li>
            Obra social:
            <?= htmlspecialchars($paciente['obra_social'] ?? 'Particular') ?>
        </li>
    </ul>

    <p>
        <strong>Rol:</strong> Paciente
    </p>

    <h3>Mis turnos</h3>

    <?php if (count($turnos) === 0): ?>
        <p>Actualmente no tenés turnos registrados.</p>
    <?php else: ?>
        <ul>
            <?php foreach ($turnos as $turno): ?>
                <li>
                    <strong>
                        <?= htmlspecialchars($turno['fecha'] . ' ' . $turno['hora'], ENT_QUOTES, 'UTF-8') ?>
                    </strong>
                    -
                    Médico:
                    <?= htmlspecialchars($turno['medico_nombre'] . ' ' . $turno['medico_apellido'], ENT_QUOTES, 'UTF-8') ?>
                    (<?= htmlspecialchars($turno['medico_especialidad'], ENT_QUOTES, 'UTF-8') ?>)
                    -
                    Estado:
                    <?= htmlspecialchars($estadosTurno[$turno['estado']] ?? $turno['estado'], ENT_QUOTES, 'UTF-8') ?>
                    <?php if ($turno['motivo_consulta'] !== null && $turno['motivo_consulta'] !== ''): ?>
                        -
                        Motivo:
                        <?= htmlspecialchars($turno['motivo_consulta'], ENT_QUOTES, 'UTF-8') ?>
                    <?php endif; ?>
                </li>
            <?php endforeach; ?>
        </ul>
    <?php endif; ?>

    <a href="../logout.php">Cerrar sesión</a>

</body>
</html>
```
