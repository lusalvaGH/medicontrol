<?php
// ============================================================================
// MEDICONTROL - COHERENCIA ENTRE LAS VISTAS DÍA, SEMANA Y MES (recepción)
// Uso: php tests/coherencia_vistas_test.php
//
// Para cada fecha con turnos en la base (incluidas las pasadas) y algunas sin
// turnos, comprueba que:
//   - Día (panel/recepcionista.php?fecha=)   muestra los mismos turnos que la base,
//   - Semana (GET /api/turnos?desde=&hasta=, que es lo que carga la pantalla)
//     muestra los mismos turnos para ese día, y la pantalla pide la semana correcta,
//   - Mes (panel/recepcionista_mes.php?mes=) muestra la misma cantidad.
// Solo lectura: no escribe en la base.
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

/** HTML de una pantalla del panel generada en un proceso aparte. */
function renderizar(string $pantalla, array $query, int $idUsuario, string $rol): string
{
    $comando = implode(' ', array_map('escapeshellarg', [
        PHP_BINARY, __DIR__ . '/helpers/render_pantalla.php', $pantalla, http_build_query($query), (string) $idUsuario, $rol,
    ]));

    return (string) shell_exec($comando);
}

function idsEnVistaDia(string $html): array
{
    preg_match_all('/class="slot-box[^"]*" id="turn-(\d+)"/', $html, $m);

    return array_map('intval', $m[1]);
}

function totalEnVistaMes(string $html, string $fecha): ?int
{
    $html = preg_replace('/\s+/', ' ', $html);

    return preg_match('/data-fecha="' . preg_quote($fecha, '/') . '" data-total="(\d+)"/', $html, $m) ? (int) $m[1] : null;
}

function lunesDe(string $fecha): string
{
    $d = new DateTimeImmutable($fecha);

    return $d->modify('-' . ((int) $d->format('N') - 1) . ' days')->format('Y-m-d');
}

// Sesiones en memoria del proceso: sin cookie ni cabeceras, así funcionan aunque ya se haya impreso algo
session_save_path(sys_get_temp_dir());
ini_set('session.use_cookies', '0');
ini_set('session.cache_limiter', '');
$pdo = Database::getConnection();

$recepcion = $pdo->query("SELECT id_usuario FROM usuarios WHERE rol = 'recepcionista' AND estado = 'activo' ORDER BY id_usuario LIMIT 1")->fetchColumn();
comprobar('la base tiene una recepcionista activa', $recepcion !== false);
$recepcion = (int) $recepcion;
$sesion = ['id_usuario' => $recepcion, 'rol' => 'recepcionista'];

$api = static function (string $ruta, array $query) use ($sesion) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = $sesion;

    return App::manejar(new Request('GET', $ruta, $query));
};

// Referencia: ids por fecha directamente desde la base (misma unión que usan las vistas)
$referencia = [];
foreach ($pdo->query("
    SELECT t.fecha, t.id_turno
    FROM turnos t
    INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
    INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
    INNER JOIN medicos m ON m.id_medico = t.id_medico
    INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
    ORDER BY t.fecha, t.hora, t.id_turno
") as $fila) {
    $referencia[(string) $fila['fecha']][] = (int) $fila['id_turno'];
}
comprobar('la base tiene turnos para comparar', $referencia !== []);

$hoy = turnosHoy()->format('Y-m-d');
$pasadas = array_filter(array_keys($referencia), static fn ($f) => $f < $hoy);
comprobar('hay turnos en fechas pasadas para probar', count($pasadas) > 0, 'hoy=' . $hoy);

// Fechas a revisar: todas las que tienen turnos y, por cada semana, un día vacío
$fechas = array_keys($referencia);
foreach (array_keys($referencia) as $f) {
    for ($i = 0; $i < 7; $i++) {
        $candidata = (new DateTimeImmutable(lunesDe($f)))->modify("+{$i} days")->format('Y-m-d');
        if (!isset($referencia[$candidata])) {
            $fechas[] = $candidata;
            break;
        }
    }
}
$fechas = array_values(array_unique($fechas));
sort($fechas);

$cacheSemana = [];
$cacheMes = [];
foreach ($fechas as $fecha) {
    $esperado = $referencia[$fecha] ?? [];
    $etiqueta = $fecha . ($fecha < $hoy ? ' (pasada)' : '') . ' con ' . count($esperado) . ' turno(s)';

    // Día
    $htmlDia = renderizar('recepcionista.php', ['fecha' => $fecha], $recepcion, 'recepcionista');
    comprobar("Día {$etiqueta}: muestra los turnos de la base", idsEnVistaDia($htmlDia) === $esperado, json_encode(idsEnVistaDia($htmlDia)));
    if ($esperado === []) {
        comprobar("Día {$etiqueta}: muestra el mensaje de día vacío", strpos($htmlDia, 'No hay turnos para el día') !== false);
    }

    // Semana: la pantalla pide /api/turnos?desde=lunes&hasta=domingo y dibuja una columna por día
    $lunes = lunesDe($fecha);
    $domingo = (new DateTimeImmutable($lunes))->modify('+6 days')->format('Y-m-d');
    if (!isset($cacheSemana[$lunes])) {
        $html = renderizar('recepcionista_semana.php', ['semana' => $fecha], $recepcion, 'recepcionista');
        $respuesta = $api('/turnos', ['desde' => $lunes, 'hasta' => $domingo]);
        $cacheSemana[$lunes] = [$html, $respuesta];
    }
    [$htmlSemana, $respSemana] = $cacheSemana[$lunes];
    comprobar("Semana de {$fecha}: la pantalla pide el rango {$lunes} a {$domingo}",
        strpos($htmlSemana, 'data-desde="' . $lunes . '" data-hasta="' . $domingo . '"') !== false);
    comprobar("Semana de {$fecha}: la grilla tiene la columna del día", strpos($htmlSemana, 'class="week-col') !== false && strpos($htmlSemana, 'data-fecha="' . $fecha . '"') !== false);
    $idsSemana = array_values(array_map(
        static fn ($t) => $t['id_turno'],
        array_filter($respSemana->cuerpo['data']['turnos'] ?? [], static fn ($t) => $t['fecha'] === $fecha)
    ));
    comprobar("Semana {$etiqueta}: la API de la semana devuelve los mismos turnos que Día", $respSemana->estadoHttp === 200 && $idsSemana === $esperado, json_encode($idsSemana));

    // Mes
    $mes = substr($fecha, 0, 7);
    if (!isset($cacheMes[$mes])) {
        $cacheMes[$mes] = [
            renderizar('recepcionista_mes.php', ['mes' => $mes], $recepcion, 'recepcionista'),
            $api('/turnos/resumen', ['mes' => $mes]),
        ];
    }
    [$htmlMes, $respMes] = $cacheMes[$mes];
    comprobar("Mes {$etiqueta}: la grilla mensual muestra la misma cantidad", totalEnVistaMes($htmlMes, $fecha) === count($esperado), 'mes muestra ' . var_export(totalEnVistaMes($htmlMes, $fecha), true));
    $resumen = $respMes->cuerpo['data']['dias'][$fecha]['total'] ?? 0;
    comprobar("Mes {$etiqueta}: el resumen de la API coincide", $resumen === count($esperado), "resumen={$resumen}");
}

// ── Vista Semana: cálculo de la semana, navegación y ausencia de datos ficticios ─
$casos = [
    '2026-10-23' => ['2026-10-19', '2026-10-25', '2026-10-12', '2026-10-26'], // viernes
    '2026-10-25' => ['2026-10-19', '2026-10-25', '2026-10-12', '2026-10-26'], // domingo: semana que termina ese día
    '2026-10-19' => ['2026-10-19', '2026-10-25', '2026-10-12', '2026-10-26'], // lunes
    '2026-12-31' => ['2026-12-28', '2027-01-03', '2026-12-21', '2027-01-04'], // cruza el año
    '2024-02-29' => ['2024-02-26', '2024-03-03', '2024-02-19', '2024-03-04'], // año bisiesto
];
foreach ($casos as $fecha => [$lunes, $domingo, $anterior, $siguiente]) {
    $html = renderizar('recepcionista_semana.php', ['semana' => $fecha], $recepcion, 'recepcionista');
    comprobar("Semana de {$fecha}: va de {$lunes} a {$domingo}", strpos($html, 'data-desde="' . $lunes . '" data-hasta="' . $domingo . '"') !== false);
    comprobar("Semana de {$fecha}: tiene 7 columnas", preg_match_all('/class="week-col( today)?"/', $html) === 7);
    comprobar("Semana de {$fecha}: enlace a la semana anterior", strpos($html, 'recepcionista_semana.php?semana=' . $anterior) !== false);
    comprobar("Semana de {$fecha}: enlace a la semana siguiente", strpos($html, 'recepcionista_semana.php?semana=' . $siguiente) !== false);
    comprobar("Semana de {$fecha}: cada columna enlaza a su vista Día", strpos($html, 'recepcionista.php?fecha=' . $lunes) !== false && strpos($html, 'recepcionista.php?fecha=' . $domingo) !== false);
}
$html = renderizar('recepcionista_semana.php', ['semana' => '2026-02-30'], $recepcion, 'recepcionista');
comprobar('Semana con fecha inválida: avisa y muestra la semana actual',
    strpos($html, 'La fecha indicada no es válida') !== false && strpos($html, 'data-desde="' . lunesDe($hoy) . '"') !== false);
$html = renderizar('recepcionista_semana.php', [], $recepcion, 'recepcionista');
comprobar('Semana sin parámetro: muestra la semana actual', strpos($html, 'data-desde="' . lunesDe($hoy) . '"') !== false);
comprobar('Semana: el día de hoy está marcado', substr_count($html, 'week-col today') === 1);
foreach (['2023-10-2', 'Juan Pérez', 'Marta Gómez', 'Roberto Silva', 'Sofia Carranza', 'draggable', 'handleDrop', 'saveModalChanges',
          'cancelTurnFromModal', 'Imprimiendo', '04-registrar-turno-modal.html', 'allClientsModal', 'Consultorio 2'] as $resto) {
    comprobar("Semana: no contiene «{$resto}» (datos ficticios o acciones falsas)", strpos($html, $resto) === false);
}
comprobar('Semana: carga los turnos desde la API', strpos($html, "MediApi.get('turnos', { desde:") !== false);
comprobar('Semana: «Registrar Turno» lleva al registro real', strpos($html, 'href="recepcionista_turno_nuevo.php"') !== false);

// ── API de rango: validaciones y permisos ────────────────────────────────────
$r = $api('/turnos', ['desde' => '2026-10-19']);
comprobar('API rango sin hasta responde 400', $r->estadoHttp === 400);
$r = $api('/turnos', ['desde' => '2026-10-25', 'hasta' => '2026-10-19']);
comprobar('API rango invertido responde 400 RANGO_INVALIDO', $r->estadoHttp === 400 && $r->cuerpo['error']['codigo'] === 'RANGO_INVALIDO');
$r = $api('/turnos', ['desde' => '2026-01-01', 'hasta' => '2026-03-01']);
comprobar('API rango de más de 42 días responde 400', $r->estadoHttp === 400 && $r->cuerpo['error']['codigo'] === 'RANGO_DEMASIADO_AMPLIO');
$r = $api('/turnos', ['desde' => '2026-02-30', 'hasta' => '2026-03-01']);
comprobar('API rango con fecha inválida responde 400', $r->estadoHttp === 400 && $r->cuerpo['error']['codigo'] === 'FECHA_INVALIDA');
foreach (['medico', 'paciente'] as $rol) {
    $id = $pdo->query("SELECT id_usuario FROM usuarios WHERE rol = '{$rol}' AND estado = 'activo' ORDER BY id_usuario LIMIT 1")->fetchColumn();
    if ($id === false) {
        continue;
    }
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = ['id_usuario' => (int) $id, 'rol' => $rol];
    $r = App::manejar(new Request('GET', '/turnos', ['desde' => '2026-10-19', 'hasta' => '2026-10-25']));
    comprobar("API rango con rol {$rol} responde 403", $r->estadoHttp === 403);
    $html = renderizar('recepcionista_semana.php', [], (int) $id, $rol);
    comprobar("pantalla Semana con rol {$rol} queda bloqueada", strpos($html, 'Acceso denegado') !== false && strpos($html, 'weeklyGridContainer') === false);
}

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
