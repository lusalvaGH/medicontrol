<?php
// ============================================================================
// MEDICONTROL - REGISTRO PÚBLICO DE PACIENTES
// Solo crea cuentas con rol "paciente". Las cuentas de médicos y recepcionistas
// no se pueden crear desde acá.
// ============================================================================
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/src/bootstrap.php';

use MediControl\Services\RegistroPacientesService;

ensureSessionStarted();

// Con una sesión válida no tiene sentido registrarse: va a su panel
$usuarioActual = usuarioSesionVigente();
if ($usuarioActual !== null) {
    redirigirAlPanel($usuarioActual['rol']);
}

$errores = [];
$mensajeGeneral = '';
$valores = [
    'nombre' => '', 'apellido' => '', 'dni' => '', 'email' => '', 'telefono' => '',
    'direccion' => '', 'fecha_nacimiento' => '', 'genero' => '', 'obra_social' => '',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $validacion = RegistroPacientesService::validar($_POST, turnosHoy());
    $valores = array_intersect_key($validacion['datos'], $valores);

    if (!csrfFormularioValido($_POST['csrf_token'] ?? null)) {
        // También frena el reenvío del mismo formulario: el token se renueva después de cada registro
        $mensajeGeneral = 'El formulario ya fue enviado o estuvo abierto demasiado tiempo. Revisá los datos y volvé a intentarlo.';
    } elseif ($validacion['errores'] !== []) {
        $errores = $validacion['errores'];
        $mensajeGeneral = 'Revisá los campos marcados.';
    } else {
        try {
            $idUsuario = (new RegistroPacientesService())->registrar($validacion['datos']);
        } catch (Throwable $e) {
            error_log('MediControl registro: ' . $e->getMessage());
            $idUsuario = false;
        }

        if ($idUsuario === null) {
            $mensajeGeneral = RegistroPacientesService::MENSAJE_DUPLICADO;
        } elseif ($idUsuario === false) {
            $mensajeGeneral = 'No se pudo crear la cuenta en este momento. Intentá nuevamente más tarde.';
        } else {
            csrfRenovar();
            header('Location: login.php?registrado=1');
            exit;
        }
    }
    if ($mensajeGeneral !== '') {
        csrfRenovar();
    }
}

$e = static fn (string $texto): string => htmlspecialchars($texto, ENT_QUOTES, 'UTF-8');
$error = static fn (string $campo): string => isset($errores[$campo])
    ? '<div class="field-error" id="error-' . $campo . '">' . htmlspecialchars($errores[$campo], ENT_QUOTES, 'UTF-8') . '</div>'
    : '';
$invalido = static fn (string $campo): string => isset($errores[$campo]) ? ' aria-invalid="true" aria-describedby="error-' . $campo . '"' : '';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediCore Health - Registro de Pacientes</title>
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
            --danger: #b91c1c;
            --radius-md: 8px;
            --shadow-lg: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background-color: var(--bg-main); color: var(--text-main); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1rem; -webkit-font-smoothing: antialiased; }
        .auth-card { width: 100%; max-width: 620px; background: white; border-radius: 16px; padding: 2.25rem 2rem; box-shadow: var(--shadow-lg); border: 1px solid var(--border-color); }
        .card-icon { width: 44px; height: 44px; background: var(--primary); color: white; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.3rem; margin-bottom: 1rem; }
        .encabezado { text-align: center; margin-bottom: 1.5rem; }
        .subtitle { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem; }
        .seccion { font-size: 0.72rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin: 1.25rem 0 0.75rem; padding-bottom: 0.35rem; border-bottom: 1px solid var(--border-color); }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.4rem; }
        .opcional { font-weight: 600; text-transform: none; color: var(--text-light); letter-spacing: 0; }
        .input-box { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid var(--border-dark); border-radius: var(--radius-md); font-size: 0.85rem; outline: none; background: var(--bg-subtle); transition: border-color 0.2s; }
        .input-box:focus { border-color: var(--primary); background: white; }
        .input-box[aria-invalid="true"] { border-color: var(--danger); background: #fef2f2; }
        .field-error { font-size: 0.75rem; color: var(--danger); margin-top: 0.3rem; font-weight: 600; }
        .ayuda { font-size: 0.72rem; color: var(--text-light); margin-top: 0.3rem; }
        .btn { width: 100%; padding: 0.85rem; margin-top: 0.5rem; border: none; border-radius: var(--radius-md); background: var(--primary); color: white; font-size: 0.85rem; font-weight: 700; cursor: pointer; }
        .btn:hover { background: var(--primary-hover); }
        .btn:disabled { opacity: 0.6; cursor: wait; }
        .error-message { margin-bottom: 1rem; padding: 0.75rem; border-radius: var(--radius-md); background: #fee2e2; color: var(--danger); font-size: 0.82rem; }
        .switch-link { font-size: 0.78rem; color: var(--text-muted); margin-top: 1.5rem; text-align: center; }
        .switch-link a { color: var(--primary); text-decoration: none; font-weight: 700; }
        .aviso-rol { font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 0.75rem; }
        @media (max-width: 560px) { .auth-card { padding: 1.75rem 1.25rem; } .grid-2 { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <main class="auth-card">
        <div class="encabezado">
            <div class="card-icon">+</div>
            <h1 style="font-size:1.5rem; font-weight:800; color:var(--text-dark);">Crear cuenta de paciente</h1>
            <p class="subtitle">Registrate para consultar tus turnos en MediCore Health</p>
        </div>

        <?php if ($mensajeGeneral !== ''): ?>
            <div class="error-message" role="alert"><?= $e($mensajeGeneral) ?></div>
        <?php endif; ?>

        <form method="POST" action="register.php" id="formRegistro" novalidate>
            <input type="hidden" name="csrf_token" value="<?= $e(csrfTokenFormulario()) ?>">

            <div class="seccion">Datos personales</div>
            <div class="grid-2">
                <div class="form-group">
                    <label for="nombre">Nombre</label>
                    <input class="input-box" type="text" id="nombre" name="nombre" value="<?= $e($valores['nombre']) ?>" maxlength="80" autocomplete="given-name" required<?= $invalido('nombre') ?>>
                    <?= $error('nombre') ?>
                </div>
                <div class="form-group">
                    <label for="apellido">Apellido</label>
                    <input class="input-box" type="text" id="apellido" name="apellido" value="<?= $e($valores['apellido']) ?>" maxlength="80" autocomplete="family-name" required<?= $invalido('apellido') ?>>
                    <?= $error('apellido') ?>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label for="dni">DNI</label>
                    <input class="input-box" type="text" id="dni" name="dni" value="<?= $e($valores['dni']) ?>" inputmode="numeric" maxlength="10" pattern="[0-9.]{7,10}" placeholder="Ej. 38123456" required<?= $invalido('dni') ?>>
                    <?= $error('dni') ?>
                </div>
                <div class="form-group">
                    <label for="fecha_nacimiento">Fecha de nacimiento <span class="opcional">(opcional)</span></label>
                    <input class="input-box" type="date" id="fecha_nacimiento" name="fecha_nacimiento" value="<?= $e($valores['fecha_nacimiento']) ?>" min="1900-01-01" max="<?= $e(turnosHoy()->format('Y-m-d')) ?>"<?= $invalido('fecha_nacimiento') ?>>
                    <?= $error('fecha_nacimiento') ?>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label for="genero">Género <span class="opcional">(opcional)</span></label>
                    <select class="input-box" id="genero" name="genero"<?= $invalido('genero') ?>>
                        <option value="">Prefiero no indicarlo</option>
                        <?php foreach (RegistroPacientesService::GENEROS as $genero): ?>
                            <option value="<?= $e($genero) ?>"<?= $valores['genero'] === $genero ? ' selected' : '' ?>><?= $e($genero) ?></option>
                        <?php endforeach; ?>
                    </select>
                    <?= $error('genero') ?>
                </div>
                <div class="form-group">
                    <label for="obra_social">Obra social <span class="opcional">(opcional)</span></label>
                    <input class="input-box" type="text" id="obra_social" name="obra_social" value="<?= $e($valores['obra_social']) ?>" maxlength="100" placeholder="Ej. OSDE, IAPOS, Particular"<?= $invalido('obra_social') ?>>
                    <?= $error('obra_social') ?>
                </div>
            </div>

            <div class="seccion">Contacto</div>
            <div class="grid-2">
                <div class="form-group">
                    <label for="email">Correo electrónico</label>
                    <input class="input-box" type="email" id="email" name="email" value="<?= $e($valores['email']) ?>" maxlength="120" autocomplete="email" required<?= $invalido('email') ?>>
                    <?= $error('email') ?>
                </div>
                <div class="form-group">
                    <label for="telefono">Teléfono <span class="opcional">(opcional)</span></label>
                    <input class="input-box" type="tel" id="telefono" name="telefono" value="<?= $e($valores['telefono']) ?>" maxlength="30" autocomplete="tel" placeholder="Ej. +54 342 456-7890"<?= $invalido('telefono') ?>>
                    <?= $error('telefono') ?>
                </div>
            </div>
            <div class="form-group">
                <label for="direccion">Dirección <span class="opcional">(opcional)</span></label>
                <input class="input-box" type="text" id="direccion" name="direccion" value="<?= $e($valores['direccion']) ?>" maxlength="200" autocomplete="street-address"<?= $invalido('direccion') ?>>
                <?= $error('direccion') ?>
            </div>

            <div class="seccion">Contraseña</div>
            <div class="grid-2">
                <div class="form-group">
                    <label for="contrasena">Contraseña</label>
                    <input class="input-box" type="password" id="contrasena" name="contrasena" minlength="<?= RegistroPacientesService::CONTRASENA_MINIMA ?>" maxlength="<?= RegistroPacientesService::CONTRASENA_MAXIMA ?>" autocomplete="new-password" required<?= $invalido('contrasena') ?>>
                    <?= $error('contrasena') ?: '<div class="ayuda">Mínimo ' . RegistroPacientesService::CONTRASENA_MINIMA . ' caracteres, con letras y números.</div>' ?>
                </div>
                <div class="form-group">
                    <label for="contrasena_confirmacion">Repetir contraseña</label>
                    <input class="input-box" type="password" id="contrasena_confirmacion" name="contrasena_confirmacion" maxlength="<?= RegistroPacientesService::CONTRASENA_MAXIMA ?>" autocomplete="new-password" required<?= $invalido('contrasena_confirmacion') ?>>
                    <?= $error('contrasena_confirmacion') ?>
                </div>
            </div>

            <button class="btn" type="submit" id="btnRegistro">Crear cuenta →</button>
            <p class="aviso-rol">Este registro es solo para pacientes. Las cuentas de médicos y del personal de recepción las crea la institución.</p>
        </form>

        <div class="switch-link">¿Ya tenés una cuenta? <a href="login.php">Iniciar sesión</a></div>
    </main>

    <script>
        // Validación básica en el navegador (el servidor vuelve a validar todo)
        (function () {
            const form = document.getElementById('formRegistro');
            const boton = document.getElementById('btnRegistro');
            const contrasena = document.getElementById('contrasena');
            const confirmacion = document.getElementById('contrasena_confirmacion');

            form.addEventListener('submit', function (e) {
                confirmacion.setCustomValidity(contrasena.value === confirmacion.value ? '' : 'Las contraseñas no coinciden.');
                if (!form.checkValidity()) {
                    e.preventDefault();
                    form.reportValidity();
                    return;
                }
                // Evita el doble envío por clics repetidos
                boton.disabled = true;
                boton.textContent = 'Creando cuenta…';
            });
            confirmacion.addEventListener('input', function () { confirmacion.setCustomValidity(''); });
        })();
    </script>
</body>
</html>
