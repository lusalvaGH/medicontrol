<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/includes/auth.php';

ensureSessionStarted();

// Con una sesión válida no hace falta volver a iniciar sesión: va directo a su panel
$usuarioActual = usuarioSesionVigente();
if ($usuarioActual !== null) {
    redirigirAlPanel($usuarioActual['rol']);
}

$error = '';
$aviso = isset($_GET['registrado']) ? 'Tu cuenta se creó correctamente. Ya podés iniciar sesión.' : '';
$emailIngresado = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = is_string($_POST['email'] ?? null) ? trim($_POST['email']) : '';
    $contrasena = is_string($_POST['contrasena'] ?? null) ? $_POST['contrasena'] : '';
    $emailIngresado = $email;

    if (!csrfFormularioValido($_POST['csrf_token'] ?? null)) {
        $error = 'La página estuvo abierta demasiado tiempo. Intentá iniciar sesión nuevamente.';
    } elseif ($email === '' || $contrasena === '') {
        $error = 'Completá todos los campos.';
    } else {
        $sql = "SELECT id_usuario, nombre, apellido, email, contrasena, rol, estado
                FROM usuarios
                WHERE email = :email
                LIMIT 1";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(['email' => $email]);

        $usuario = $stmt->fetch();

        // Si el email no existe se verifica igual contra un hash ficticio, para que el
        // tiempo de respuesta no revele qué emails están registrados.
        $hash = $usuario ? (string) $usuario['contrasena'] : '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        $contrasenaCorrecta = password_verify($contrasena, $hash);

        if (
            $usuario &&
            $usuario['estado'] === 'activo' &&
            $contrasenaCorrecta
        ) {
            if (panelDelRol((string) $usuario['rol']) === null) {
                $error = 'Email o contraseña incorrectos.';
            } else {
                // Identificador de sesión nuevo para evitar la fijación de sesión
                session_regenerate_id(true);

                $_SESSION['id_usuario'] = $usuario['id_usuario'];
                $_SESSION['nombre'] = $usuario['nombre'];
                $_SESSION['apellido'] = $usuario['apellido'];
                $_SESSION['email'] = $usuario['email'];
                $_SESSION['rol'] = $usuario['rol'];
                csrfRenovar();

                redirigirAlPanel((string) $usuario['rol']);
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
    <title>MediCore Health - Acceso</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #004797;
            --primary-hover: #003673;
            --bg-main: #f0f4f9;
            --bg-subtle: #f8fafc;
            --text-dark: #0f172a;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --text-light: #94a3b8;
            --border-color: #e2e8f0;
            --border-dark: #cbd5e1;
            --radius-md: 8px;
            --shadow-lg: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
        }

        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        body {
            background-color: var(--bg-main);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem 1rem;
            -webkit-font-smoothing: antialiased;
        }

        .top-bar, .auth-card {
            width: 100%;
            max-width: 480px;
        }

        .top-bar {
            margin-bottom: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .top-bar a, .switch-link a {
            color: var(--primary);
            text-decoration: none;
            font-weight: 700;
        }

        .top-bar a {
            font-size: 0.85rem;
        }

        .auth-card {
            background: white;
            border-radius: 16px;
            padding: 2.25rem 2rem;
            box-shadow: var(--shadow-lg);
            border: 1px solid var(--border-color);
            text-align: center;
        }

        .card-icon {
            width: 44px;
            height: 44px;
            background: var(--primary);
            color: white;
            border-radius: 12px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 1.3rem;
            margin-bottom: 1rem;
        }

        .subtitle {
            font-size: 0.82rem;
            color: var(--text-muted);
            margin: 0.25rem 0 1.5rem;
        }

        .form-group {
            margin-bottom: 1.1rem;
            text-align: left;
        }

        .form-group label {
            display: block;
            font-size: 0.72rem;
            font-weight: 800;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 0.4rem;
        }

        .input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .input-icon {
            position: absolute;
            left: 1rem;
            color: var(--text-light);
            font-size: 0.9rem;
        }

        .input-box {
            width: 100%;
            padding: 0.7rem 0.9rem 0.7rem 2.5rem;
            border: 1px solid var(--border-dark);
            border-radius: var(--radius-md);
            font-size: 0.85rem;
            outline: none;
            background: var(--bg-subtle);
            transition: border-color 0.2s;
        }

        .input-box:focus {
            border-color: var(--primary);
            background: white;
        }

        .btn {
            width: 100%;
            padding: 0.85rem;
            margin-top: 0.5rem;
            border: none;
            border-radius: var(--radius-md);
            background: var(--primary);
            color: white;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
        }

        .btn:hover {
            background: var(--primary-hover);
        }

        .error-message {
            margin-bottom: 1rem;
            padding: 0.75rem;
            border-radius: var(--radius-md);
            background: #fee2e2;
            color: #b91c1c;
            font-size: 0.82rem;
            text-align: left;
        }

        .switch-link, .secure-tag, .copyright {
            font-size: 0.78rem;
        }

        .switch-link {
            color: var(--text-muted);
            margin-top: 1.5rem;
        }

        .secure-tag {
            display: inline-flex;
            gap: 0.4rem;
            color: var(--text-muted);
            margin-top: 1rem;
        }

        .copyright {
            margin-top: 2rem;
            color: var(--text-light);
            text-align: center;
        }

        @media (max-width: 480px) {
            .auth-card {
                padding: 1.75rem 1.25rem;
            }
        }
    </style>
</head>
<body>


    <main class="auth-card">
        <div class="card-icon">+</div>
        <h1 style="font-size:1.6rem; font-weight:800; color:var(--text-dark);">MediCore Health</h1>
        <p class="subtitle">Acceso al Portal de Gestión Hospitalaria</p>

        <?php if ($error !== ''): ?>
            <div class="error-message" role="alert">
                <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
            </div>
        <?php endif; ?>
        <?php if ($aviso !== '' && $error === ''): ?>
            <div class="error-message" role="status" style="background:#dcfce7; color:#166534;">
                <?= htmlspecialchars($aviso, ENT_QUOTES, 'UTF-8') ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="login.php">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrfTokenFormulario(), ENT_QUOTES, 'UTF-8') ?>">
            <div class="form-group">
                <label for="email">Email</label>
                <div class="input-wrapper">
                    <span class="input-icon">✉️</span>
                    <input class="input-box" type="email" id="email" name="email"
                           value="<?= htmlspecialchars($emailIngresado, ENT_QUOTES, 'UTF-8') ?>"
                           placeholder="nombre@hospital.com" autocomplete="username" required>
                </div>
            </div>

            <div class="form-group">
                <label for="contrasena">Contraseña</label>
                <div class="input-wrapper">
                    <span class="input-icon">🔒</span>
                    <input class="input-box" type="password" id="contrasena" name="contrasena"
                           placeholder="••••••••" autocomplete="current-password" required>
                </div>
            </div>

            <button class="btn" type="submit">Iniciar sesión →</button>
        </form>

        <div class="switch-link">¿Sos paciente y no tenés una cuenta? <a href="register.php">Registrarse</a></div>
        <div class="secure-tag">🛡️ Conexión cifrada de grado médico</div>
    </main>

    <div class="copyright">© 2024 MediCore Health v2.4.0 • Soporte IT</div>

</body>
</html>