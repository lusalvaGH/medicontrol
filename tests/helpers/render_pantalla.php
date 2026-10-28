<?php
// ============================================================================
// Genera el HTML de una pantalla PHP del panel con una sesión simulada.
// Uso (solo CLI): php render_pantalla.php <archivo.php> <query> <id_usuario> <rol>
// Se ejecuta en un proceso aparte por pantalla (las páginas no están pensadas
// para incluirse dos veces). Solo lectura: las pantallas consultadas no escriben.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli' || $argc < 5) {
    http_response_code(404);
    exit(1);
}

[, $archivo, $query, $idUsuario, $rol] = $argv;

session_save_path(sys_get_temp_dir());
ini_set('session.use_cookies', '0');
ini_set('session.cache_limiter', '');
session_start();
$_SESSION = ['id_usuario' => (int) $idUsuario, 'rol' => $rol, 'nombre' => 'Prueba', 'apellido' => 'Automática'];
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/medicontrol/panel/' . basename($archivo);
parse_str($query, $_GET);

include __DIR__ . '/../../panel/' . basename($archivo);
