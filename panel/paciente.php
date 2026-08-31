```php
<?php

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('paciente');

$idUsuario = (int) $_SESSION['id_usuario'];

// Obtener los datos del paciente asociado al usuario
$sql = "
    SELECT
        u.nombre,
        u.apellido,
        u.email,
        p.id_paciente,
        p.telefono,
        p.direccion,
        p.fecha_nacimiento,
        p.genero,
        p.obra_social
    FROM usuarios u
    INNER JOIN pacientes p ON p.id_usuario = u.id_usuario
    WHERE u.id_usuario = :id_usuario
    LIMIT 1
";

$stmt = $pdo->prepare($sql);
$stmt->execute(['id_usuario' => $idUsuario]);

$paciente = $stmt->fetch();

if (!$paciente) {
    die('No se encontró el perfil del paciente.');
}
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

    <p>
        Acá posteriormente aparecerán tus turnos.
    </p>

    <a href="../logout.php">Cerrar sesión</a>

</body>
</html>
```
