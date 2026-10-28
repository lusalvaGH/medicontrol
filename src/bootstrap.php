<?php
// ============================================================================
// MEDICONTROL - ARRANQUE DE LA API
// ============================================================================
// Carga de clases (sin Composer), dependencias compartidas con las pantallas
// PHP actuales y configuración de errores propia de la API.
// Compatible con PHP 8.0.
// ============================================================================
declare(strict_types=1);

spl_autoload_register(static function (string $clase): void {
    $prefijo = 'MediControl\\';
    if (strncmp($clase, $prefijo, strlen($prefijo)) !== 0) {
        return;
    }
    $archivo = __DIR__ . '/' . str_replace('\\', '/', substr($clase, strlen($prefijo))) . '.php';
    if (is_file($archivo)) {
        require $archivo;
    }
});

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/turnos.php';

// La API nunca muestra errores en la respuesta: se registran en el log del servidor
// y el cliente recibe un JSON genérico (ver MediControl\Http\App).
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Las reglas de turnos usan la zona horaria de la clínica; dentro de la API
// también la usan las fechas generadas por PHP.
date_default_timezone_set(TURNOS_ZONA_HORARIA);
