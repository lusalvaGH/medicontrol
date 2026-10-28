<?php
// ============================================================================
// MEDICONTROL - REGLAS DE NEGOCIO DE TURNOS
// ============================================================================
// Funciones puras (sin acceso a la base de datos) compartidas por las
// pantallas y endpoints de turnos.
// ============================================================================
declare(strict_types=1);

// Zona horaria de la clínica. Se usa para decidir si una fecha/hora ya pasó,
// independientemente de date.timezone en php.ini.
const TURNOS_ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

// Horarios permitidos para registrar o reprogramar turnos.
const TURNOS_HORARIOS = [
    '08:00:00', '08:30:00',
    '09:00:00', '09:30:00',
    '10:00:00', '10:30:00',
    '11:00:00', '11:30:00',
    '12:00:00', '12:30:00',
    '13:00:00', '13:30:00',
    '14:00:00', '14:30:00',
    '15:00:00', '15:30:00',
    '16:00:00', '16:30:00',
    '17:00:00',
];

const TURNOS_ESTADOS = [
    'pendiente'  => 'Pendiente',
    'confirmado' => 'Confirmado',
    'en_curso'   => 'En curso',
    'atendido'   => 'Atendido',
    'cancelado'  => 'Cancelado',
];

// Estado actual => estados a los que puede pasar. 'atendido' y 'cancelado' son finales.
const TURNOS_TRANSICIONES = [
    'pendiente'  => ['confirmado', 'en_curso', 'cancelado'],
    'confirmado' => ['pendiente', 'en_curso', 'cancelado'],
    'en_curso'   => ['atendido', 'confirmado'],
    'atendido'   => [],
    'cancelado'  => [],
];

// Solo estos estados permiten cambiar fecha u hora.
const TURNOS_ESTADOS_REPROGRAMABLES = ['pendiente', 'confirmado'];

function turnosAhora(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone(TURNOS_ZONA_HORARIA));
}

function turnosHoy(): DateTimeImmutable
{
    return new DateTimeImmutable('today', new DateTimeZone(TURNOS_ZONA_HORARIA));
}

/**
 * Valida una fecha con formato estricto YYYY-MM-DD.
 */
function turnosFechaValida(string $fecha): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        return false;
    }
    $obj = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);

    return $obj !== false && $obj->format('Y-m-d') === $fecha;
}

/**
 * Normaliza una hora HH:MM o HH:MM:SS a HH:MM:SS. Devuelve null si no es una hora real.
 */
function turnosNormalizarHora(string $hora): ?string
{
    if (preg_match('/^\d{2}:\d{2}$/', $hora)) {
        $hora .= ':00';
    }
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/', $hora)) {
        return null;
    }

    return $hora;
}

function turnosHorarioPermitido(string $hora): bool
{
    return in_array($hora, TURNOS_HORARIOS, true);
}

/**
 * Indica si la fecha (YYYY-MM-DD) y hora (HH:MM:SS) son posteriores a $ahora,
 * interpretadas en la zona horaria de la clínica.
 */
function turnosEsFuturo(string $fecha, string $hora, DateTimeImmutable $ahora): bool
{
    $momento = DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i:s',
        $fecha . ' ' . $hora,
        new DateTimeZone(TURNOS_ZONA_HORARIA)
    );

    return $momento !== false && $momento > $ahora;
}

function turnosPuedeTransicionar(string $estadoActual, string $estadoNuevo): bool
{
    return in_array($estadoNuevo, TURNOS_TRANSICIONES[$estadoActual] ?? [], true);
}

/**
 * Valida la modificación de un turno contra sus valores actuales en la base.
 *
 * $actual: ['fecha' => 'YYYY-MM-DD', 'hora' => 'HH:MM:SS', 'estado' => string]
 * Fecha y hora nuevas ya deben venir validadas en formato y normalizadas.
 * Las reglas de fecha/hora solo se aplican si esos campos cambian.
 *
 * @return array{error: ?string, sin_cambios: bool, reprograma: bool}
 */
function turnosValidarModificacion(
    array $actual,
    string $fecha,
    string $hora,
    string $estado,
    DateTimeImmutable $ahora
): array {
    $resultado = static fn (?string $error, bool $sinCambios = false, bool $reprograma = false): array =>
        ['error' => $error, 'sin_cambios' => $sinCambios, 'reprograma' => $reprograma];

    $estadoActual = (string) $actual['estado'];
    if (!isset(TURNOS_ESTADOS[$estado])) {
        return $resultado('Estado inválido.');
    }

    $cambiaEstado = $estado !== $estadoActual;
    $reprograma   = $fecha !== (string) $actual['fecha'] || $hora !== (string) $actual['hora'];

    if (!$cambiaEstado && !$reprograma) {
        return $resultado(null, true);
    }

    if ($cambiaEstado && !turnosPuedeTransicionar($estadoActual, $estado)) {
        $desde = TURNOS_ESTADOS[$estadoActual] ?? $estadoActual;
        if ((TURNOS_TRANSICIONES[$estadoActual] ?? []) === []) {
            return $resultado("El turno está «{$desde}» y no se puede modificar.");
        }
        return $resultado("No se puede pasar un turno de «{$desde}» a «" . TURNOS_ESTADOS[$estado] . '».');
    }

    if ($reprograma) {
        if (!in_array($estadoActual, TURNOS_ESTADOS_REPROGRAMABLES, true)) {
            $desde = TURNOS_ESTADOS[$estadoActual] ?? $estadoActual;
            return $resultado("No se puede cambiar la fecha u hora de un turno «{$desde}».");
        }
        if (!in_array($estado, TURNOS_ESTADOS_REPROGRAMABLES, true)) {
            return $resultado('Para cambiar la fecha u hora, el turno debe quedar pendiente o confirmado.');
        }
        if ($hora !== (string) $actual['hora'] && !turnosHorarioPermitido($hora)) {
            return $resultado('El horario elegido no está entre los horarios permitidos.');
        }
        if (!turnosEsFuturo($fecha, $hora, $ahora)) {
            return $resultado('La nueva fecha y hora ya pasaron. Elegí un horario futuro.');
        }
    }

    return $resultado(null, false, $reprograma);
}

/**
 * Valida un parámetro de mes con formato estricto YYYY-MM (mes 01-12).
 * Devuelve el primer día del mes a medianoche o null si no es válido.
 */
function turnosParsearMes(string $mes): ?DateTimeImmutable
{
    if (!preg_match('/^[1-9]\d{3}-(0[1-9]|1[0-2])$/', $mes)) {
        return null;
    }

    $primerDia = DateTimeImmutable::createFromFormat('!Y-m-d', $mes . '-01');
    if (!$primerDia || $primerDia->format('Y-m') !== $mes) {
        return null;
    }

    return $primerDia;
}
