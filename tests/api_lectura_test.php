<?php
// ============================================================================
// MEDICONTROL - PRUEBAS DE LA API DE SOLO LECTURA
// Uso: php tests/api_lectura_test.php [url_base]
//      url_base por defecto: http://127.0.0.1/medicontrol
//
// Parte 1: llama a la API en el mismo proceso, con sesiones simuladas, contra la
//          base configurada. Solo ejecuta SELECT: no escribe datos.
// Parte 2: pedidos GET por HTTP al Apache local (sin sesión): acceso público,
//          rechazo sin sesión y bloqueo de archivos internos.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';
ini_set('display_errors', '1');

use MediControl\Http\App;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;

$fallas = 0;
$total  = 0;

function comprobar(string $descripcion, bool $condicion, string $detalle = ''): void
{
    global $fallas, $total;
    $total++;
    if (!$condicion) {
        $fallas++;
        echo "FALLA: {$descripcion}" . ($detalle !== '' ? " ({$detalle})" : '') . "\n";
    }
}

/** Ejecuta un pedido a la API con la sesión indicada (null = sin sesión). */
function pedir(string $ruta, array $query = [], ?array $sesion = null, string $metodo = 'GET'): Respuesta
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = $sesion ?? [];

    return App::manejar(new Request($metodo, $ruta, $query));
}

function sesionDe(?array $usuario): ?array
{
    return $usuario === null ? null : ['id_usuario' => (int) $usuario['id_usuario'], 'rol' => $usuario['rol']];
}

// Sesiones en memoria del proceso: sin cookie ni cabeceras, así funcionan aunque ya se haya impreso algo
session_save_path(sys_get_temp_dir());
ini_set('session.use_cookies', '0');
ini_set('session.cache_limiter', '');
$pdo = Database::getConnection();

// ── Datos de referencia (consultas independientes, solo SELECT) ─────────────
$usuarioPorRol = static function (string $rol) use ($pdo): ?array {
    $stmt = $pdo->prepare("SELECT id_usuario, rol FROM usuarios WHERE rol = :rol AND estado = 'activo' ORDER BY id_usuario LIMIT 1");
    $stmt->execute([':rol' => $rol]);

    return $stmt->fetch() ?: null;
};
$recepcion = $usuarioPorRol('recepcionista');
$medico    = $usuarioPorRol('medico');
$paciente  = $usuarioPorRol('paciente');
comprobar('la base tiene al menos una recepcionista activa', $recepcion !== null);

// Misma consulta que usa panel/recepcionista.php para la agenda del día
$idsComoVistaDiaria = static function (string $fecha) use ($pdo): array {
    $stmt = $pdo->prepare("
        SELECT t.id_turno
        FROM turnos t
        INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
        INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
        INNER JOIN medicos m ON m.id_medico = t.id_medico
        INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
        WHERE t.fecha = :fecha
        ORDER BY t.hora ASC, t.id_turno ASC
    ");
    $stmt->execute([':fecha' => $fecha]);

    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
};
$fechasConTurnos = $pdo->query('SELECT DISTINCT fecha FROM turnos ORDER BY fecha')->fetchAll(PDO::FETCH_COLUMN);

// ── Parte 1: API en proceso ──────────────────────────────────────────────────
$r = pedir('/health');
comprobar('GET /health responde 200', $r->estadoHttp === 200);
comprobar('GET /health informa la base disponible', ($r->cuerpo['data']['base_de_datos'] ?? null) === 'ok');

foreach (['/auth/me' => [], '/turnos' => ['fecha' => '2026-10-27'], '/turnos/1' => [], '/turnos/resumen' => ['mes' => '2026-10']] as $ruta => $q) {
    $r = pedir($ruta, $q);
    comprobar("sin sesión, GET {$ruta} responde 401", $r->estadoHttp === 401 && $r->cuerpo['error']['codigo'] === 'NO_AUTENTICADO');
}

$r = pedir('/auth/me', [], ['id_usuario' => 999999, 'rol' => 'recepcionista']);
comprobar('una sesión de un usuario inexistente responde 401', $r->estadoHttp === 401 && $r->cuerpo['error']['codigo'] === 'SESION_INVALIDA');
if ($recepcion !== null) {
    $r = pedir('/auth/me', [], ['id_usuario' => (int) $recepcion['id_usuario'], 'rol' => 'medico']);
    comprobar('una sesión con un rol distinto al de la base responde 401', $r->estadoHttp === 401);
}

$sesionRecepcion = sesionDe($recepcion);
$r = pedir('/auth/me', [], $sesionRecepcion);
comprobar('GET /auth/me devuelve la recepcionista', $r->estadoHttp === 200 && ($r->cuerpo['data']['usuario']['rol'] ?? '') === 'recepcionista');
comprobar('GET /auth/me no expone la contraseña', !array_key_exists('contrasena', $r->cuerpo['data']['usuario'] ?? []));

foreach (['medico' => $medico, 'paciente' => $paciente] as $rol => $usuario) {
    if ($usuario === null) {
        continue;
    }
    foreach (['/turnos' => ['fecha' => '2026-10-27'], '/turnos/resumen' => ['mes' => '2026-10']] as $ruta => $q) {
        $r = pedir($ruta, $q, sesionDe($usuario));
        comprobar("rol {$rol}: GET {$ruta} responde 403", $r->estadoHttp === 403);
    }
}

foreach (['' => 'PARAMETRO_REQUERIDO', '2026-02-30' => 'FECHA_INVALIDA', '27/10/2026' => 'FECHA_INVALIDA'] as $fecha => $codigo) {
    $r = pedir('/turnos', $fecha === '' ? [] : ['fecha' => $fecha], $sesionRecepcion);
    comprobar("GET /turnos?fecha={$fecha} responde 400 {$codigo}", $r->estadoHttp === 400 && $r->cuerpo['error']['codigo'] === $codigo);
}
$r = pedir('/turnos', ['fecha' => ['2026-10-27']], $sesionRecepcion);
comprobar('GET /turnos con fecha como array responde 400', $r->estadoHttp === 400);

comprobar('hay fechas con turnos para comparar', count($fechasConTurnos) > 0);
$idDeEjemplo = null;
foreach ($fechasConTurnos as $fecha) {
    $r = pedir('/turnos', ['fecha' => $fecha], $sesionRecepcion);
    $turnos = $r->cuerpo['data']['turnos'] ?? [];
    $ids = array_column($turnos, 'id_turno');
    comprobar("GET /turnos?fecha={$fecha} coincide con la vista diaria", $r->estadoHttp === 200 && $ids === $idsComoVistaDiaria($fecha), json_encode($ids));
    foreach ($turnos as $t) {
        $idDeEjemplo = $idDeEjemplo ?? $t['id_turno'];
        comprobar("turno {$t['id_turno']}: no incluye notas médicas", !array_key_exists('notas_medicas', $t));
        comprobar("turno {$t['id_turno']}: hora en formato HH:MM", (bool) preg_match('/^\d{2}:\d{2}$/', $t['hora']));
        comprobar("turno {$t['id_turno']}: estado conocido", isset(TURNOS_ESTADOS[$t['estado']]));
    }
}
$r = pedir('/turnos', ['fecha' => '1999-01-01'], $sesionRecepcion);
comprobar('un día sin turnos devuelve una lista vacía', $r->estadoHttp === 200 && ($r->cuerpo['data']['turnos'] ?? null) === []);

if ($idDeEjemplo !== null) {
    $r = pedir('/turnos/' . $idDeEjemplo, [], $sesionRecepcion);
    $stmt = $pdo->prepare('SELECT t.fecha, up.dni FROM turnos t JOIN pacientes p ON p.id_paciente = t.id_paciente JOIN usuarios up ON up.id_usuario = p.id_usuario WHERE t.id_turno = :id');
    $stmt->execute([':id' => $idDeEjemplo]);
    $esperado = $stmt->fetch();
    $turno = $r->cuerpo['data']['turno'] ?? [];
    comprobar("GET /turnos/{$idDeEjemplo} responde 200 con los datos de la base", $r->estadoHttp === 200 && ($turno['fecha'] ?? null) === $esperado['fecha'] && ($turno['paciente_dni'] ?? null) === $esperado['dni']);
    comprobar("GET /turnos/{$idDeEjemplo} no incluye notas médicas", !array_key_exists('notas_medicas', $turno));
}
$r = pedir('/turnos/999999', [], $sesionRecepcion);
comprobar('GET /turnos/999999 responde 404', $r->estadoHttp === 404 && $r->cuerpo['error']['codigo'] === 'TURNO_NO_ENCONTRADO');

$meses = array_values(array_unique(array_map(static fn ($f) => substr((string) $f, 0, 7), $fechasConTurnos)));
foreach ($meses as $mes) {
    $r = pedir('/turnos/resumen', ['mes' => $mes], $sesionRecepcion);
    $stmt = $pdo->prepare('SELECT fecha, COUNT(*) FROM turnos WHERE fecha LIKE :mes GROUP BY fecha');
    $stmt->execute([':mes' => $mes . '-%']);
    $esperado = array_map('intval', $stmt->fetchAll(PDO::FETCH_KEY_PAIR));
    $obtenido = array_map(static fn ($d) => $d['total'], $r->cuerpo['data']['dias'] ?? []);
    comprobar("GET /turnos/resumen?mes={$mes} coincide con la base", $r->estadoHttp === 200 && $obtenido == $esperado, json_encode($obtenido));
    foreach ($r->cuerpo['data']['dias'] ?? [] as $dia => $c) {
        $suma = $c['pendiente'] + $c['confirmado'] + $c['en_curso'] + $c['atendido'] + $c['cancelado'];
        comprobar("resumen {$dia}: la suma por estado coincide con el total", $suma === $c['total']);
    }
}
foreach (['2026-13', '2026-1', 'abc', ''] as $mes) {
    $r = pedir('/turnos/resumen', ['mes' => $mes], $sesionRecepcion);
    comprobar("GET /turnos/resumen?mes={$mes} responde 400", $r->estadoHttp === 400);
}

// Escrituras sin token CSRF: se rechazan antes de tocar la base (seguro aun contra la base real)
foreach ([['POST', '/turnos'], ['PATCH', '/turnos/1'], ['POST', '/turnos/1/cancelacion']] as [$metodo, $ruta]) {
    $r = pedir($ruta, [], $sesionRecepcion, $metodo);
    comprobar("{$metodo} {$ruta} sin token CSRF responde 403", $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'CSRF_INVALIDO');
}
$r = pedir('/turnos/1', [], $sesionRecepcion, 'DELETE');
comprobar('DELETE /turnos/1 responde 405', $r->estadoHttp === 405);
$r = pedir('/no-existe', [], $sesionRecepcion);
comprobar('una ruta inexistente responde 404', $r->estadoHttp === 404);

// ── Parte 2: HTTP contra el Apache local (solo GET, sin sesión) ─────────────
$base = rtrim($argv[1] ?? 'http://127.0.0.1/medicontrol', '/');
$get = static function (string $ruta) use ($base): array {
    $contexto = stream_context_create(['http' => ['method' => 'GET', 'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 5]]);
    $cuerpo = @file_get_contents($base . $ruta, false, $contexto);
    $estado = 0;
    foreach ($http_response_header ?? [] as $linea) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $linea, $m)) {
            $estado = (int) $m[1];
        }
    }

    return [$estado, $cuerpo === false ? '' : $cuerpo];
};

[$estado] = $get('/api/health');
if ($estado === 0) {
    echo "AVISO: no se pudo conectar a {$base}; se omiten las pruebas HTTP.\n";
} else {
    [$estado, $cuerpo] = $get('/api/health');
    comprobar('HTTP GET /api/health responde 200 en JSON', $estado === 200 && (json_decode($cuerpo, true)['ok'] ?? false) === true);
    [$estado, $cuerpo] = $get('/api/turnos?fecha=2026-10-27');
    comprobar('HTTP GET /api/turnos sin sesión responde 401 en JSON', $estado === 401 && (json_decode($cuerpo, true)['error']['codigo'] ?? '') === 'NO_AUTENTICADO');

    foreach (['/.git/config', '/.git/HEAD', '/.gitignore', '/database/', '/database/medicontrol.sql', '/database/medicontrol_db.sql',
              '/config/', '/config/database.php', '/config/database.local.php', '/includes/', '/includes/turnos.php',
              '/src/bootstrap.php', '/tests/', '/tests/api_lectura_test.php', '/README.md', '/instalar.php', '/panel/', '/css/'] as $ruta) {
        [$estado] = $get($ruta);
        comprobar("HTTP GET {$ruta} está bloqueado (403/404)", in_array($estado, [403, 404], true), "HTTP {$estado}");
    }

    // APIs antiguas reemplazadas por /api: bloqueadas por web con cualquier método (panel/.htaccess).
    // Sin sesión ni datos: aunque el bloqueo fallara, no podrían escribir.
    $pedirHttp = static function (string $metodo, string $ruta) use ($base): int {
        $contexto = stream_context_create(['http' => ['method' => $metodo, 'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 5,
                                                      'header' => "Content-Type: application/x-www-form-urlencoded\r\n", 'content' => '']]);
        @file_get_contents($base . $ruta, false, $contexto);
        $estado = 0;
        foreach ($http_response_header ?? [] as $linea) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $linea, $m)) {
                $estado = (int) $m[1];
            }
        }

        return $estado;
    };
    foreach (['/panel/api_turno.php', '/panel/api_turnos_dia.php', '/panel/api_turnos_dia.php?fecha=2026-10-27',
              '/panel/api_turnos_dia.php?id_turno=1', '/panel/api_turnos_dia.php?mes=2026-10'] as $ruta) {
        foreach (['GET', 'POST', 'PATCH'] as $metodo) {
            $estado = $pedirHttp($metodo, $ruta);
            comprobar("API antigua: {$metodo} {$ruta} está bloqueada (403)", $estado === 403, "HTTP {$estado}");
        }
    }

    foreach (['/login.php' => 200, '/index.html' => 200, '/css/base.css' => 200, '/app/assets/js/api.js' => 200,
              '/panel/recepcionista.php' => 302, '/panel/recepcionista_mes.php' => 302, '/panel/medico.php' => 302,
              '/panel/paciente.php' => 302, '/panel/recepcionista_semana.php' => 302, '/panel/recepcionista_turno_nuevo.php' => 302,
              '/api/turnos?fecha=2026-10-27' => 401, '/api/auth/csrf' => 401] as $ruta => $esperado) {
        [$estado] = $get($ruta);
        comprobar("HTTP GET {$ruta} sigue respondiendo {$esperado}", $estado === $esperado, "HTTP {$estado}");
    }
}

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
