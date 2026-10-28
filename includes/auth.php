<?php
// ============================================================================
// MEDICONTROL - SESIÓN, AUTENTICACIÓN Y PERMISOS DE LAS PANTALLAS
// ============================================================================
// Usado por login.php, register.php, index.php, logout.php, los paneles y la API.
// ============================================================================

require_once __DIR__ . '/turnos.php';
require_once __DIR__ . '/../config/database.php';

// Zona horaria de la aplicación (la misma que usan las reglas de turnos), sin
// depender de date.timezone del php.ini global.
date_default_timezone_set(TURNOS_ZONA_HORARIA);

/** Panel de inicio de cada rol, relativo a la raíz del proyecto. */
const PANELES_POR_ROL = [
    'paciente'      => 'panel/paciente.php',
    'medico'        => 'panel/medico.php',
    'recepcionista' => 'panel/recepcionista.php',
];

function ensureSessionStarted(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }

    // Cookie de sesión segura, configurada desde la aplicación (no se toca php.ini).
    if (!headers_sent()) {
        ini_set('session.use_strict_mode', '1');   // rechaza identificadores de sesión no emitidos por el servidor
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        $https = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    session_start();
}

function getCurrentUser(): ?array
{
    ensureSessionStarted();

    if (!isset($_SESSION['id_usuario'], $_SESSION['rol'])) {
        return null;
    }

    return [
        'id_usuario' => (int) $_SESSION['id_usuario'],
        'rol' => (string) $_SESSION['rol'],
        'nombre' => $_SESSION['nombre'] ?? null,
        'apellido' => $_SESSION['apellido'] ?? null,
        'email' => $_SESSION['email'] ?? null,
    ];
}

/**
 * Usuario de la sesión solo si sigue existiendo, está activo y conserva el mismo rol
 * en la base. Si no, cierra la sesión y devuelve null.
 */
function usuarioSesionVigente(): ?array
{
    $usuario = getCurrentUser();
    if ($usuario === null) {
        return null;
    }

    try {
        $stmt = Database::getConnection()->prepare('SELECT rol, estado FROM usuarios WHERE id_usuario = :id LIMIT 1');
        $stmt->execute([':id' => $usuario['id_usuario']]);
        $fila = $stmt->fetch();
    } catch (PDOException $e) {
        error_log('MediControl auth: ' . $e->getMessage());
        http_response_code(503);
        die('El servicio no está disponible en este momento. Intentá nuevamente más tarde.');
    }

    if (!$fila || $fila['estado'] !== 'activo' || $fila['rol'] !== $usuario['rol']) {
        cerrarSesion();

        return null;
    }

    return $usuario;
}

function isAuthenticated(): bool
{
    return getCurrentUser() !== null;
}

function currentRole(): ?string
{
    $user = getCurrentUser();

    if ($user === null) {
        return null;
    }

    return $user['rol'];
}

/** Ruta relativa desde el script actual hasta la raíz del proyecto ('' o '../'). */
function rutaRaizProyecto(): string
{
    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/'));

    return preg_match('#/(panel|api)/[^/]+$#', $scriptName) ? '../' : '';
}

function panelDelRol(string $rol): ?string
{
    return PANELES_POR_ROL[$rol] ?? null;
}

function loginRedirectUrl(): string
{
    return rutaRaizProyecto() . 'login.php';
}

function redirectToLogin(): void
{
    header('Location: ' . loginRedirectUrl());
    exit;
}

/** Envía al usuario a su panel según el rol. */
function redirigirAlPanel(string $rol): void
{
    $panel = panelDelRol($rol);
    if ($panel === null) {
        cerrarSesion();
        redirectToLogin();
    }
    header('Location: ' . rutaRaizProyecto() . $panel);
    exit;
}

function requireLogin(): void
{
    if (usuarioSesionVigente() === null) {
        redirectToLogin();
    }
}

function requireRole(string $requiredRole): void
{
    requireLogin();

    $current = strtolower((string) ($_SESSION['rol'] ?? ''));
    $required = strtolower($requiredRole);

    if ($current !== $required) {
        http_response_code(403);
        $panel = panelDelRol($current);
        $enlace = $panel !== null
            ? ' <a href="' . htmlspecialchars(rutaRaizProyecto() . $panel, ENT_QUOTES, 'UTF-8') . '">Ir a mi panel</a>.'
            : '';
        die('Acceso denegado: esta página es exclusiva para ' . htmlspecialchars($requiredRole, ENT_QUOTES, 'UTF-8') . 's.' . $enlace);
    }
}

/** Cierra la sesión actual: vacía los datos, borra la cookie y destruye la sesión. */
function cerrarSesion(): void
{
    ensureSessionStarted();
    $_SESSION = [];

    if (ini_get('session.use_cookies') && !headers_sent()) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $params['path'],
            'domain'   => $params['domain'],
            'secure'   => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }

    session_destroy();
}

// ── CSRF de formularios ─────────────────────────────────────────────────────
// Usa la misma clave de sesión que la API (MediControl\Auth\Csrf), así hay un
// único token por sesión.

function csrfTokenFormulario(): string
{
    ensureSessionStarted();
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || strlen($_SESSION['csrf_token']) !== 64) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function csrfFormularioValido($recibido): bool
{
    ensureSessionStarted();
    $esperado = $_SESSION['csrf_token'] ?? null;

    return is_string($esperado) && $esperado !== '' && is_string($recibido) && hash_equals($esperado, $recibido);
}

/** Genera un token nuevo (después de iniciar sesión o de completar un formulario). */
function csrfRenovar(): void
{
    ensureSessionStarted();
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
