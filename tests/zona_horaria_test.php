<?php
// ============================================================================
// MEDICONTROL - ZONA HORARIA DE LA APLICACIÓN
// Uso: php tests/zona_horaria_test.php
//
// Genera las pantallas forzando date.timezone del PHP a zonas extremas
// (UTC+14 y UTC-11; a cualquier hora al menos una cae en otro día que Argentina)
// y comprueba que «hoy» sea siempre el día de America/Argentina/Buenos_Aires en
// las vistas Día, Semana y Mes, el panel del médico y la API. Solo lectura.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';
ini_set('display_errors', '1');

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

function renderizarConZona(string $zona, string $pantalla, array $query, int $idUsuario, string $rol): string
{
    $comando = implode(' ', array_map('escapeshellarg', [
        PHP_BINARY, '-d', 'date.timezone=' . $zona, __DIR__ . '/helpers/render_pantalla.php',
        $pantalla, http_build_query($query), (string) $idUsuario, $rol,
    ]));

    return (string) shell_exec($comando);
}

$pdo = Database::getConnection();
$recepcion = (int) $pdo->query("SELECT id_usuario FROM usuarios WHERE rol = 'recepcionista' AND estado = 'activo' ORDER BY id_usuario LIMIT 1")->fetchColumn();
$medico = (int) $pdo->query("SELECT id_usuario FROM usuarios WHERE rol = 'medico' AND estado = 'activo' ORDER BY id_usuario LIMIT 1")->fetchColumn();

$ar = new DateTimeZone('America/Argentina/Buenos_Aires');
$hoyAr = (new DateTimeImmutable('now', $ar))->format('Y-m-d');
$lunesAr = (new DateTimeImmutable($hoyAr))->modify('-' . ((int) (new DateTimeImmutable($hoyAr))->format('N') - 1) . ' days')->format('Y-m-d');

$zonas = ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Berlin'];
$algunaDistinta = false;
foreach ($zonas as $zona) {
    $hoyZona = (new DateTimeImmutable('now', new DateTimeZone($zona)))->format('Y-m-d');
    $algunaDistinta = $algunaDistinta || $hoyZona !== $hoyAr;
    $etiqueta = "{$zona} (allí es {$hoyZona}; en Argentina {$hoyAr})";

    $html = renderizarConZona($zona, 'recepcionista.php', [], $recepcion, 'recepcionista');
    comprobar("Día con {$etiqueta}: abre en el día de Argentina",
        (bool) preg_match('/<input type="date" value="' . $hoyAr . '" onchange="window\.location\.href=\'recepcionista\.php/', $html));

    $html = preg_replace('/\s+/', ' ', renderizarConZona($zona, 'recepcionista_mes.php', [], $recepcion, 'recepcionista'));
    comprobar("Mes con {$etiqueta}: muestra el mes de Argentina y marca hoy",
        (bool) preg_match('/class="month-day-card today" data-fecha="' . $hoyAr . '"/', $html) && substr_count($html, 'month-day-card today') === 1);

    $html = renderizarConZona($zona, 'recepcionista_semana.php', [], $recepcion, 'recepcionista');
    comprobar("Semana con {$etiqueta}: muestra la semana de Argentina y marca hoy",
        strpos($html, 'data-desde="' . $lunesAr . '"') !== false && (bool) preg_match('/class="week-col today" data-fecha="' . $hoyAr . '"/', $html));

    $html = renderizarConZona($zona, 'medico.php', [], $medico, 'medico');
    comprobar("Médico con {$etiqueta}: abre la agenda en el día de Argentina",
        strpos($html, 'name="fecha" value="' . $hoyAr . '"') !== false);

    $salida = (string) shell_exec(implode(' ', array_map('escapeshellarg', [
        PHP_BINARY, '-d', 'date.timezone=' . $zona, __DIR__ . '/helpers/hoy_api.php',
    ])));
    comprobar("API con {$etiqueta}: date() y turnosHoy() dan el día de Argentina", trim($salida) === $hoyAr . '|' . $hoyAr, trim($salida));
}
comprobar('al menos una zona de prueba cae en otro día que Argentina (la prueba es significativa)', $algunaDistinta);

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
