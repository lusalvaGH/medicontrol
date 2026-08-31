<?php

function ensureSessionStarted(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
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

function loginRedirectUrl(): string
{
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '/';
    $dir = rtrim(dirname($scriptName), '/\\');

    if ($dir === '' || $dir === '.' || $dir === '/') {
        return 'login.php';
    }

    return $dir . '/../login.php';
}

function redirectToLogin(): void
{
    header('Location: ' . loginRedirectUrl());
    exit;
}

function requireLogin(): void
{
    ensureSessionStarted();

    if (!isAuthenticated()) {
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
        die('Acceso denegado: esta página es exclusiva para ' . $requiredRole . 's.');
    }
}
