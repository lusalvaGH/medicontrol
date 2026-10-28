<?php
// ============================================================================
// MEDICONTROL - API REST (punto de entrada único)
// Todas las rutas /api/... llegan acá mediante api/.htaccess.
// ============================================================================
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use MediControl\Http\App;
use MediControl\Http\Request;

$baseApi = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');

App::manejar(Request::desdeGlobales($baseApi))->enviar();
