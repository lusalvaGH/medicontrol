<?php
declare(strict_types=1);

session_start();

require_once __DIR__ . '/conexion.php';

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $contrasena = $_POST['contrasena'] ?? '';

    if ($email === '' || $contrasena === '') {
        $error = 'Completá todos los campos.';
    } else {
        $sql = "SELECT id_usuario, nombre, apellido, email, contrasena, rol, estado
                FROM usuarios
                WHERE email = :email
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(['email' => $email]);

        $usuario = $stmt->fetch();

        if (
            $usuario &&
            $usuario['estado'] === 'activo' &&
            password_verify($contrasena, $usuario['contrasena'])
        ) {
            session_regenerate_id(true);

            $_SESSION['id_usuario'] = $usuario['id_usuario'];
            $_SESSION['nombre'] = $usuario['nombre'];
            $_SESSION['apellido'] = $usuario['apellido'];
            $_SESSION['email'] = $usuario['email'];
            $_SESSION['rol'] = $usuario['rol'];

            switch ($usuario['rol']) {
                case 'paciente':
                    header('Location: panel/paciente.php');
                    exit;

                case 'medico':
                    header('Location: panel/medico.php');
                    exit;

                case 'recepcionista':
                    header('Location: panel/recepcionista.php');
                    exit;

                default:
                    session_destroy();
                    $error = 'Rol de usuario no válido.';
            }
        } else {
            $error = 'Email o contraseña incorrectos.';
        }
    }
}
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Iniciar sesión - MediControl</title>
</head>
<body>

    <h1>MediControl</h1>
    <h2>Iniciar sesión</h2>

    <?php if ($error !== ''): ?>
        <p><?= htmlspecialchars($error) ?></p>
    <?php endif; ?>

    <form method="POST" action="">
        <div>
            <label for="email">Email</label>
            <input
                type="email"
                id="email"
                name="email"
                required
            >
        </div>

        <div>
            <label for="contrasena">Contraseña</label>
            <input
                type="password"
                id="contrasena"
                name="contrasena"
                required
            >
        </div>

        <button type="submit">Iniciar sesión</button>
    </form>

</body>
</html>