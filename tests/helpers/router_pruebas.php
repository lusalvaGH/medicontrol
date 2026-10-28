<?php
// ============================================================================
// Enrutador del servidor de PRUEBAS (php -S) de MediControl.
// Uso: MEDICONTROL_DB=medicontrol_test php -S 127.0.0.1:8099 -t <raíz> tests/helpers/router_pruebas.php
// Reemplaza a los .htaccess (que php -S no lee): bloquea las carpetas internas,
// envía /api/* a api/index.php y usa index.php como página de inicio.
// ============================================================================

$raiz = dirname(__DIR__, 2);
$ruta = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

if (preg_match('#^/(\.git|config|database|includes|src|tests)(/|$)#i', $ruta)
    || preg_match('#(\.(sql|md|bak|log|ini|ps1|bat|sh)|/\.[^/]*)$#i', $ruta)
    || preg_match('#^/(instalar|test_conexion)\.php$#i', $ruta)) {
    http_response_code(404);
    exit;
}
if (preg_match('#^/api(/|$)#', $ruta)) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require $raiz . '/api/index.php';
    return true;
}
if ($ruta === '/') {
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    require $raiz . '/index.php';
    return true;
}

return false;
