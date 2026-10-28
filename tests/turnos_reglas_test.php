<?php
// ============================================================================
// MEDICONTROL - PRUEBAS DE REGLAS DE TURNOS (sin base de datos)
// Uso: php tests/turnos_reglas_test.php
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../includes/turnos.php';

$fallas = 0;
$total  = 0;

function comprobar(string $descripcion, bool $condicion): void
{
    global $fallas, $total;
    $total++;
    if (!$condicion) {
        $fallas++;
        echo "FALLA: {$descripcion}\n";
    }
}

// ── turnosParsearMes ─────────────────────────────────────────────────────────
comprobar('mes válido', turnosParsearMes('2026-10')?->format('Y-m-d') === '2026-10-01');
comprobar('enero', turnosParsearMes('2027-01')?->format('Y-m-d') === '2027-01-01');
comprobar('diciembre', turnosParsearMes('2026-12')?->format('Y-m-d') === '2026-12-01');
foreach (['2026-13', '2026-00', '2026-1', '26-10', '0000-01', 'abcd-ef', '2026-10-01', ' 2026-10', '2026-10x', ''] as $invalido) {
    comprobar("mes inválido «{$invalido}»", turnosParsearMes($invalido) === null);
}
comprobar('febrero bisiesto tiene 29 días', turnosParsearMes('2024-02')?->format('t') === '29');
comprobar('febrero común tiene 28 días', turnosParsearMes('2026-02')?->format('t') === '28');

// ── Formatos de fecha y hora ─────────────────────────────────────────────────
comprobar('fecha válida', turnosFechaValida('2026-10-27'));
comprobar('fecha 30 de febrero inválida', !turnosFechaValida('2026-02-30'));
comprobar('fecha con formato corto inválida', !turnosFechaValida('2026-1-5'));
comprobar('hora HH:MM se normaliza', turnosNormalizarHora('09:30') === '09:30:00');
comprobar('hora HH:MM:SS se conserva', turnosNormalizarHora('09:30:00') === '09:30:00');
foreach (['99:99:99', '24:00', '9:30', '09:60', '', '09:30 AM'] as $horaInvalida) {
    comprobar("hora inválida «{$horaInvalida}»", turnosNormalizarHora($horaInvalida) === null);
}
comprobar('08:00 permitido', turnosHorarioPermitido('08:00:00'));
comprobar('17:00 permitido', turnosHorarioPermitido('17:00:00'));
comprobar('11:15 no permitido', !turnosHorarioPermitido('11:15:00'));
comprobar('07:13 no permitido', !turnosHorarioPermitido('07:13:00'));

// ── Momento futuro (zona horaria de la clínica) ──────────────────────────────
$tz    = new DateTimeZone(TURNOS_ZONA_HORARIA);
$ahora = new DateTimeImmutable('2026-10-27 10:10:00', $tz);
comprobar('hoy más tarde es futuro', turnosEsFuturo('2026-10-27', '10:30:00', $ahora));
comprobar('hoy más temprano no es futuro', !turnosEsFuturo('2026-10-27', '10:00:00', $ahora));
comprobar('mañana es futuro', turnosEsFuturo('2026-10-28', '08:00:00', $ahora));
comprobar('ayer no es futuro', !turnosEsFuturo('2026-10-26', '17:00:00', $ahora));
$ahoraBerlin = new DateTimeImmutable('2026-10-27 15:10:00', new DateTimeZone('Europe/Berlin')); // 11:10 en Argentina
comprobar('un "ahora" en otra zona se compara en la misma línea de tiempo', turnosEsFuturo('2026-10-27', '11:30:00', $ahoraBerlin));

// ── Transiciones aprobadas ───────────────────────────────────────────────────
$permitidas = [
    'pendiente'  => ['confirmado', 'en_curso', 'cancelado'],
    'confirmado' => ['pendiente', 'en_curso', 'cancelado'],
    'en_curso'   => ['atendido', 'confirmado'],
    'atendido'   => [],
    'cancelado'  => [],
];
foreach (array_keys(TURNOS_ESTADOS) as $desde) {
    foreach (array_keys(TURNOS_ESTADOS) as $hacia) {
        if ($desde === $hacia) {
            continue;
        }
        $esperado = in_array($hacia, $permitidas[$desde], true);
        comprobar(
            "transición {$desde} → {$hacia} " . ($esperado ? 'permitida' : 'rechazada'),
            turnosPuedeTransicionar($desde, $hacia) === $esperado
        );
    }
}

// ── turnosValidarModificacion ────────────────────────────────────────────────
$turno = static fn (string $estado, string $fecha = '2026-10-27', string $hora = '11:00:00'): array =>
    ['fecha' => $fecha, 'hora' => $hora, 'estado' => $estado];
$validar = static fn (array $actual, string $fecha, string $hora, string $estado): array =>
    turnosValidarModificacion($actual, $fecha, $hora, $estado, $ahora);

foreach (array_keys(TURNOS_ESTADOS) as $estado) {
    $r = $validar($turno($estado), '2026-10-27', '11:00:00', $estado);
    comprobar("guardar sin cambios un turno {$estado} es válido", $r['error'] === null && $r['sin_cambios']);
}
$r = $validar($turno('en_curso', '2026-10-20', '09:00:00'), '2026-10-20', '09:00:00', 'en_curso');
comprobar('en_curso de fecha pasada sin cambios es válido', $r['error'] === null && $r['sin_cambios']);
$r = $validar($turno('en_curso', '2026-10-20', '09:00:00'), '2026-10-20', '09:00:00', 'atendido');
comprobar('en_curso pasado → atendido es válido (no valida fecha si no cambia)', $r['error'] === null && !$r['reprograma']);
$r = $validar($turno('confirmado', '2026-10-27', '11:15:00'), '2026-10-27', '11:15:00', 'en_curso');
comprobar('horario heredado fuera de la lista no bloquea un cambio de estado', $r['error'] === null);
$r = $validar($turno('confirmado', '2026-10-27', '11:15:00'), '2026-10-28', '11:15:00', 'confirmado');
comprobar('cambiar solo la fecha no exige que la hora heredada esté en la lista', $r['error'] === null && $r['reprograma']);

$r = $validar($turno('confirmado'), '2026-10-28', '15:00:00', 'confirmado');
comprobar('reprogramar confirmado a futuro es válido', $r['error'] === null && $r['reprograma']);
$r = $validar($turno('pendiente'), '2026-10-27', '14:00:00', 'confirmado');
comprobar('reprogramar y confirmar a la vez es válido', $r['error'] === null && $r['reprograma']);
$r = $validar($turno('pendiente'), '2026-10-27', '10:00:00', 'pendiente');
comprobar('reprogramar a una hora ya pasada se rechaza', $r['error'] !== null);
$r = $validar($turno('pendiente'), '2026-10-26', '11:00:00', 'pendiente');
comprobar('reprogramar a una fecha pasada se rechaza', $r['error'] !== null);
$r = $validar($turno('pendiente'), '2026-10-28', '07:13:00', 'pendiente');
comprobar('reprogramar a un horario no permitido se rechaza', $r['error'] !== null);
$r = $validar($turno('pendiente'), '2026-10-28', '11:00:00', 'en_curso');
comprobar('reprogramar dejando el turno en_curso se rechaza', $r['error'] !== null);
$r = $validar($turno('pendiente'), '2026-10-28', '11:00:00', 'cancelado');
comprobar('reprogramar y cancelar a la vez se rechaza', $r['error'] !== null);
foreach (['en_curso', 'atendido', 'cancelado'] as $estado) {
    $r = $validar($turno($estado), '2026-10-28', '11:00:00', $estado);
    comprobar("no se puede reprogramar un turno {$estado}", $r['error'] !== null);
    $r = $validar($turno($estado), '2026-10-27', '11:30:00', $estado);
    comprobar("no se puede cambiar la hora de un turno {$estado}", $r['error'] !== null);
}
$r = $validar($turno('atendido'), '2026-10-27', '11:00:00', 'pendiente');
comprobar('atendido → pendiente se rechaza', $r['error'] !== null);
$r = $validar($turno('cancelado'), '2026-10-27', '11:00:00', 'confirmado');
comprobar('cancelado → confirmado se rechaza', $r['error'] !== null);
$r = $validar($turno('pendiente'), '2026-10-27', '11:00:00', 'atendido');
comprobar('pendiente → atendido se rechaza', $r['error'] !== null);
$r = $validar($turno('pendiente'), '2026-10-27', '11:00:00', 'inexistente');
comprobar('estado desconocido se rechaza', $r['error'] !== null);

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
