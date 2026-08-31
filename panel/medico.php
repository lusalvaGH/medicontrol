<?php

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('medico');

$idUsuario = (int) $_SESSION['id_usuario'];
$nombre = $_SESSION['nombre'] ?? '';
$apellido = $_SESSION['apellido'] ?? '';
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel del Médico - MediControl</title>
</head>

<body>

    <h1>MediControl</h1>

    <h2>Panel del Médico</h2>

    <p>
        Bienvenido,
        <strong>
            <?= htmlspecialchars(trim($nombre . ' ' . $apellido)) ?>
        </strong>
    </p>

    <p>
        <strong>Rol:</strong> Médico
    </p>

    <p>
        Aquí aparecerá la agenda y la gestión de turnos del médico.
    </p>

    <a href="../logout.php">Cerrar sesión</a>

</body>
</html>
