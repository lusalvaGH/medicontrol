<?php
// ============================================================================
// MEDICONTROL - PRUEBAS DE LA API DE ESCRITURA DE TURNOS
// Uso: MEDICONTROL_DB=medicontrol_test php tests/api_escritura_test.php
//
// SOLO se ejecuta contra una base cuyo nombre empiece con "medicontrol_test".
// Crea, modifica y cancela turnos de prueba en fechas futuras y al terminar
// borra únicamente los turnos que creó. Verifica además que la base real
// (medicontrol_db) no cambie durante la prueba.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';
ini_set('display_errors', '1');

// Sesiones en memoria del proceso: sin cookie ni cabeceras (se configura antes de imprimir nada)
session_save_path(sys_get_temp_dir());
ini_set('session.use_cookies', '0');
ini_set('session.cache_limiter', '');

use MediControl\Http\App;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;
use MediControl\Repositories\TurnosRepository;

$pdo = Database::getConnection();
$base = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
if (!preg_match('/^medicontrol_test(_[a-z0-9]+)?$/', $base)) {
    fwrite(STDERR, "ABORTADO: la conexión apunta a «{$base}». Ejecutá con MEDICONTROL_DB=medicontrol_test.\n");
    exit(2);
}
echo "Base de pruebas: {$base}\n";

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

/** Sesión simulada que se conserva entre pedidos (incluido el token CSRF). */
$sesionActual = [];

function pedir(string $metodo, string $ruta, array $query = [], array $cuerpo = [], ?string $csrf = null): Respuesta
{
    global $sesionActual;
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = $sesionActual;
    $respuesta = App::manejar(new Request($metodo, $ruta, $query, $cuerpo, $csrf === null ? [] : ['X-CSRF-Token' => $csrf]));
    $sesionActual = $_SESSION;

    return $respuesta;
}

function iniciarSesionComo(int $idUsuario, string $rol): string
{
    global $sesionActual;
    $sesionActual = ['id_usuario' => $idUsuario, 'rol' => $rol];
    $r = pedir('GET', '/auth/csrf');

    return (string) ($r->cuerpo['data']['token'] ?? '');
}

function checksumReal(PDO $pdo): string
{
    $filas = $pdo->query('CHECKSUM TABLE medicontrol_db.usuarios, medicontrol_db.pacientes, medicontrol_db.medicos, medicontrol_db.turnos')->fetchAll(PDO::FETCH_NUM);

    return json_encode($filas);
}

$checksumAntes = checksumReal($pdo);
$creados = [];
$usuarioDesactivado = null;

try {
    // ── Datos de la base de pruebas ─────────────────────────────────────────
    $idRecepcion = (int) $pdo->query("SELECT id_usuario FROM usuarios WHERE rol = 'recepcionista' AND estado = 'activo' ORDER BY id_usuario LIMIT 1")->fetchColumn();
    $medicos = $pdo->query("SELECT m.id_medico, m.id_usuario FROM medicos m JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE u.estado = 'activo' ORDER BY m.id_medico")->fetchAll();
    $pacientes = $pdo->query("SELECT p.id_paciente, p.id_usuario FROM pacientes p JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE u.estado = 'activo' ORDER BY p.id_paciente")->fetchAll();
    comprobar('la base de pruebas tiene recepción, 2 médicos y 3 pacientes activos', $idRecepcion > 0 && count($medicos) >= 2 && count($pacientes) >= 3);
    $idMedico = (int) $medicos[0]['id_medico'];
    $idPaciente = (int) $pacientes[0]['id_paciente'];

    // Fechas futuras sin turnos del médico de prueba
    $hoy = turnosHoy();
    $buscarDiaLibre = static function (int $desdeDias) use ($pdo, $idMedico, $hoy): string {
        for ($i = $desdeDias; $i < $desdeDias + 60; $i++) {
            $fecha = $hoy->modify("+{$i} days")->format('Y-m-d');
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM turnos WHERE id_medico = :m AND fecha = :f');
            $stmt->execute([':m' => $idMedico, ':f' => $fecha]);
            if ((int) $stmt->fetchColumn() === 0) {
                return $fecha;
            }
        }
        throw new RuntimeException('No hay un día libre para el médico de prueba.');
    };
    $dia1 = $buscarDiaLibre(20);
    $dia2 = $buscarDiaLibre((int) (new DateTimeImmutable($dia1))->diff($hoy)->days + 1);
    $ayer = $hoy->modify('-1 day')->format('Y-m-d');

    $token = iniciarSesionComo($idRecepcion, 'recepcionista');
    comprobar('GET /auth/csrf devuelve un token de 64 caracteres', strlen($token) === 64);
    $tokenOtraVez = pedir('GET', '/auth/csrf')->cuerpo['data']['token'] ?? '';
    comprobar('el token CSRF se mantiene durante la sesión', $tokenOtraVez === $token);

    $nuevo = ['id_paciente' => $idPaciente, 'id_medico' => $idMedico, 'fecha' => $dia1, 'hora' => '08:00', 'motivo_consulta' => 'Prueba automática'];

    // ── Protección CSRF y permisos ──────────────────────────────────────────
    $r = pedir('POST', '/turnos', [], $nuevo);
    comprobar('POST /turnos sin token CSRF responde 403', $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'CSRF_INVALIDO');
    $r = pedir('POST', '/turnos', [], $nuevo, str_repeat('0', 64));
    comprobar('POST /turnos con token CSRF incorrecto responde 403', $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'CSRF_INVALIDO');

    $tokenMedico = iniciarSesionComo((int) $medicos[0]['id_usuario'], 'medico');
    $r = pedir('POST', '/turnos', [], $nuevo, $tokenMedico);
    comprobar('rol médico: POST /turnos responde 403', $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'SIN_PERMISO');
    $tokenPaciente = iniciarSesionComo((int) $pacientes[0]['id_usuario'], 'paciente');
    $r = pedir('POST', '/turnos/1/cancelacion', [], [], $tokenPaciente);
    comprobar('rol paciente: cancelar responde 403', $r->estadoHttp === 403);
    global $sesionActual;
    $sesionActual = [];
    $r = pedir('POST', '/turnos', [], $nuevo, $token);
    comprobar('sin sesión: POST /turnos responde 401', $r->estadoHttp === 401);
    $token = iniciarSesionComo($idRecepcion, 'recepcionista');

    // ── Registro: validaciones ──────────────────────────────────────────────
    $r = pedir('POST', '/turnos', [], [], $token);
    comprobar('POST /turnos vacío responde 400 con los campos', $r->estadoHttp === 400 && count($r->cuerpo['error']['campos'] ?? []) === 5);
    $casos = [
        'hora no permitida 07:13'   => [['hora' => '07:13'], 422, 'HORARIO_NO_PERMITIDO'],
        'hora inválida 99:99'       => [['hora' => '99:99'], 400, 'DATOS_INVALIDOS'],
        'fecha inválida 2026-02-30' => [['fecha' => '2026-02-30'], 400, 'DATOS_INVALIDOS'],
        'fecha pasada (ayer)'       => [['fecha' => $ayer, 'hora' => '10:00'], 422, 'FECHA_PASADA'],
        'paciente inexistente'      => [['id_paciente' => 999999], 422, 'PACIENTE_NO_DISPONIBLE'],
        'médico inexistente'        => [['id_medico' => 999999], 422, 'MEDICO_NO_DISPONIBLE'],
        'motivo vacío'              => [['motivo_consulta' => '   '], 400, 'DATOS_INVALIDOS'],
        'motivo de 256 caracteres'  => [['motivo_consulta' => str_repeat('a', 256)], 400, 'DATOS_INVALIDOS'],
        'id_paciente no numérico'   => [['id_paciente' => 'abc'], 400, 'DATOS_INVALIDOS'],
    ];
    foreach ($casos as $nombre => [$cambio, $estado, $codigo]) {
        $r = pedir('POST', '/turnos', [], array_merge($nuevo, $cambio), $token);
        comprobar("POST /turnos con {$nombre} responde {$estado} {$codigo}", $r->estadoHttp === $estado && ($r->cuerpo['error']['codigo'] ?? '') === $codigo, $r->estadoHttp . ' ' . json_encode($r->cuerpo));
    }

    // Paciente con usuario inactivo (se desactiva solo en la base de pruebas y se restaura al final)
    $usuarioDesactivado = (int) $pacientes[2]['id_usuario'];
    $pdo->prepare("UPDATE usuarios SET estado = 'inactivo' WHERE id_usuario = :id")->execute([':id' => $usuarioDesactivado]);
    $r = pedir('POST', '/turnos', [], array_merge($nuevo, ['id_paciente' => (int) $pacientes[2]['id_paciente']]), $token);
    comprobar('POST /turnos con paciente inactivo responde 422', $r->estadoHttp === 422 && $r->cuerpo['error']['codigo'] === 'PACIENTE_NO_DISPONIBLE');
    $r = pedir('GET', '/pacientes', ['buscar' => '']);
    comprobar('GET /pacientes no lista pacientes inactivos', !in_array((int) $pacientes[2]['id_paciente'], array_column($r->cuerpo['data']['pacientes'] ?? [], 'id_paciente'), true));
    $pdo->prepare("UPDATE usuarios SET estado = 'activo' WHERE id_usuario = :id")->execute([':id' => $usuarioDesactivado]);
    $usuarioDesactivado = null;

    // ── Registro válido ─────────────────────────────────────────────────────
    $r = pedir('POST', '/turnos', [], $nuevo, $token);
    comprobar('POST /turnos válido responde 201', $r->estadoHttp === 201, json_encode($r->cuerpo));
    $turnoA = $r->cuerpo['data']['turno'] ?? [];
    $idA = (int) ($turnoA['id_turno'] ?? 0);
    if ($idA > 0) {
        $creados[] = $idA;
    }
    comprobar('el turno creado queda pendiente, con fecha y hora correctas', ($turnoA['estado'] ?? '') === 'pendiente' && ($turnoA['fecha'] ?? '') === $dia1 && ($turnoA['hora'] ?? '') === '08:00');
    $fila = $pdo->query('SELECT id_paciente, id_medico, fecha, hora, estado, motivo_consulta FROM turnos WHERE id_turno = ' . $idA)->fetch();
    comprobar('el turno se guardó en la base de pruebas', $fila !== false && (int) $fila['id_paciente'] === $idPaciente && $fila['hora'] === '08:00:00' && $fila['motivo_consulta'] === 'Prueba automática');

    $r = pedir('POST', '/turnos', [], array_merge($nuevo, ['id_paciente' => (int) $pacientes[1]['id_paciente']]), $token);
    comprobar('POST /turnos en un horario ocupado responde 409', $r->estadoHttp === 409 && $r->cuerpo['error']['codigo'] === 'HORARIO_OCUPADO');
    $r = pedir('POST', '/turnos', [], array_merge($nuevo, ['id_medico' => (int) $medicos[1]['id_medico']]), $token);
    comprobar('el mismo horario con otro médico se puede registrar', $r->estadoHttp === 201);
    if (isset($r->cuerpo['data']['turno']['id_turno'])) {
        $creados[] = (int) $r->cuerpo['data']['turno']['id_turno'];
    }

    // ── Disponibilidad ──────────────────────────────────────────────────────
    $r = pedir('GET', "/medicos/{$idMedico}/disponibilidad", ['fecha' => $dia1]);
    $estados = array_column($r->cuerpo['data']['horarios'] ?? [], 'estado', 'hora');
    comprobar('disponibilidad: devuelve los 19 horarios permitidos', count($estados) === count(TURNOS_HORARIOS));
    comprobar('disponibilidad: 08:00 figura ocupado y 08:30 libre', ($estados['08:00'] ?? '') === 'ocupado' && ($estados['08:30'] ?? '') === 'libre');
    $r = pedir('GET', "/medicos/{$idMedico}/disponibilidad", ['fecha' => $ayer]);
    comprobar('disponibilidad de ayer: ningún horario libre', !in_array('libre', array_column($r->cuerpo['data']['horarios'] ?? [], 'estado'), true));
    $r = pedir('GET', '/medicos/999999/disponibilidad', ['fecha' => $dia1]);
    comprobar('disponibilidad de un médico inexistente responde 404', $r->estadoHttp === 404);
    $r = pedir('GET', "/medicos/{$idMedico}/disponibilidad", ['fecha' => '2026-13-01']);
    comprobar('disponibilidad con fecha inválida responde 400', $r->estadoHttp === 400);
    $r = pedir('GET', '/medicos');
    comprobar('GET /medicos lista los médicos activos', $r->estadoHttp === 200 && count($r->cuerpo['data']['medicos'] ?? []) === count($medicos));

    // ── Modificación ────────────────────────────────────────────────────────
    $patch = static fn (array $datos, ?string $csrf = null) => pedir('PATCH', "/turnos/{$idA}", [], $datos, $csrf ?? $token);
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'pendiente'], '');
    comprobar('PATCH sin token CSRF responde 403', $r->estadoHttp === 403);
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'pendiente']);
    comprobar('PATCH sin cambios responde 200 con sin_cambios', $r->estadoHttp === 200 && ($r->cuerpo['data']['sin_cambios'] ?? null) === true);
    $r = $patch(['fecha' => $dia2, 'hora' => '09:00', 'estado' => 'confirmado']);
    comprobar('PATCH reprograma y confirma', $r->estadoHttp === 200 && ($r->cuerpo['data']['turno']['fecha'] ?? '') === $dia2 && ($r->cuerpo['data']['turno']['estado'] ?? '') === 'confirmado');
    $fila = $pdo->query("SELECT fecha, hora, estado FROM turnos WHERE id_turno = {$idA}")->fetch();
    comprobar('la modificación se guardó en la base de pruebas', $fila['fecha'] === $dia2 && $fila['hora'] === '09:00:00' && $fila['estado'] === 'confirmado');
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'confirmado']);
    comprobar('PATCH vuelve al horario anterior, ya libre', $r->estadoHttp === 200);

    // Segundo turno del mismo médico para probar colisiones
    $r = pedir('POST', '/turnos', [], array_merge($nuevo, ['hora' => '10:00', 'id_paciente' => (int) $pacientes[1]['id_paciente']]), $token);
    $idB = (int) ($r->cuerpo['data']['turno']['id_turno'] ?? 0);
    if ($idB > 0) {
        $creados[] = $idB;
    }
    comprobar('se crea un segundo turno a las 10:00', $r->estadoHttp === 201);
    $r = $patch(['fecha' => $dia1, 'hora' => '10:00', 'estado' => 'confirmado']);
    comprobar('PATCH a un horario ocupado responde 409', $r->estadoHttp === 409 && $r->cuerpo['error']['codigo'] === 'HORARIO_OCUPADO');
    $r = $patch(['fecha' => $ayer, 'hora' => '10:00', 'estado' => 'confirmado']);
    comprobar('PATCH a una fecha pasada responde 409', $r->estadoHttp === 409 && $r->cuerpo['error']['codigo'] === 'CAMBIO_NO_PERMITIDO');
    $r = $patch(['fecha' => $dia1, 'hora' => '07:13', 'estado' => 'confirmado']);
    comprobar('PATCH a un horario no permitido responde 409', $r->estadoHttp === 409);
    $r = $patch(['fecha' => $dia1, 'hora' => '99:99', 'estado' => 'confirmado']);
    comprobar('PATCH con hora inválida responde 400', $r->estadoHttp === 400);
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'inexistente']);
    comprobar('PATCH con estado inválido responde 400', $r->estadoHttp === 400);
    $r = pedir('PATCH', '/turnos/999999', [], ['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'pendiente'], $token);
    comprobar('PATCH de un turno inexistente responde 404', $r->estadoHttp === 404);

    // Transiciones aprobadas sobre el turno A (confirmado → en_curso → atendido)
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'en_curso']);
    comprobar('confirmado → en_curso', $r->estadoHttp === 200 && ($r->cuerpo['data']['turno']['estado'] ?? '') === 'en_curso');
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'en_curso']);
    comprobar('guardar un turno en_curso sin cambios responde 200', $r->estadoHttp === 200 && ($r->cuerpo['data']['sin_cambios'] ?? null) === true);
    $r = $patch(['fecha' => $dia2, 'hora' => '08:00', 'estado' => 'en_curso']);
    comprobar('reprogramar un turno en_curso responde 409', $r->estadoHttp === 409);
    $r = pedir('POST', "/turnos/{$idA}/cancelacion", [], [], $token);
    comprobar('cancelar un turno en_curso responde 409', $r->estadoHttp === 409 && $r->cuerpo['error']['codigo'] === 'CAMBIO_NO_PERMITIDO');
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'atendido']);
    comprobar('en_curso → atendido', $r->estadoHttp === 200 && ($r->cuerpo['data']['turno']['estado'] ?? '') === 'atendido');
    $r = $patch(['fecha' => $dia1, 'hora' => '08:00', 'estado' => 'pendiente']);
    comprobar('atendido → pendiente responde 409', $r->estadoHttp === 409);
    $r = pedir('POST', "/turnos/{$idA}/cancelacion", [], [], $token);
    comprobar('cancelar un turno atendido responde 409', $r->estadoHttp === 409);

    // ── Cancelación del turno B ─────────────────────────────────────────────
    $r = pedir('POST', "/turnos/{$idB}/cancelacion", [], [], '');
    comprobar('cancelar sin token CSRF responde 403', $r->estadoHttp === 403);
    $r = pedir('POST', "/turnos/{$idB}/cancelacion", [], [], $token);
    comprobar('cancelar un turno pendiente responde 200', $r->estadoHttp === 200 && ($r->cuerpo['data']['turno']['estado'] ?? '') === 'cancelado');
    comprobar('la cancelación se guardó en la base de pruebas', $pdo->query("SELECT estado FROM turnos WHERE id_turno = {$idB}")->fetchColumn() === 'cancelado');
    $r = pedir('POST', "/turnos/{$idB}/cancelacion", [], [], $token);
    comprobar('cancelar dos veces responde 409 YA_CANCELADO', $r->estadoHttp === 409 && $r->cuerpo['error']['codigo'] === 'YA_CANCELADO');
    $r = pedir('PATCH', "/turnos/{$idB}", [], ['fecha' => $dia1, 'hora' => '10:00', 'estado' => 'confirmado'], $token);
    comprobar('cancelado → confirmado responde 409', $r->estadoHttp === 409);
    $r = pedir('POST', '/turnos/999999/cancelacion', [], [], $token);
    comprobar('cancelar un turno inexistente responde 404', $r->estadoHttp === 404);

    // Comportamiento actual (pendiente de la migración que libera el horario):
    // el horario de un turno cancelado sigue ocupado.
    $r = pedir('GET', "/medicos/{$idMedico}/disponibilidad", ['fecha' => $dia1]);
    $estados = array_column($r->cuerpo['data']['horarios'] ?? [], 'estado', 'hora');
    comprobar('[limitación conocida] el horario de un turno cancelado figura ocupado', ($estados['10:00'] ?? '') === 'ocupado');
    $r = pedir('POST', '/turnos', [], array_merge($nuevo, ['hora' => '10:00']), $token);
    comprobar('[limitación conocida] registrar en el horario cancelado responde 409', $r->estadoHttp === 409);

    // ── Edición simultánea: el UPDATE exige que el turno no haya cambiado ────
    $repo = new TurnosRepository();
    $leido = $repo->buscarParaActualizar($idB);
    $filas = $repo->actualizarSiNoCambio($idB, ['fecha' => $dia1, 'hora' => '10:00:00', 'estado' => 'pendiente'], array_merge($leido, ['estado' => 'pendiente']));
    comprobar('un UPDATE con valores leídos desactualizados no modifica nada', $filas === 0);

    // ── Coherencia entre Día, Semana y Mes con los turnos creados ───────────
    $salida = (string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/coherencia_vistas_test.php') . ' 2>&1');
    comprobar('Día, Semana y Mes son coherentes después de crear, modificar y cancelar', strpos($salida, 'OK:') !== false, trim($salida));
    comprobar('la prueba de coherencia corrió sobre la base de pruebas', in_array($dia1, $pdo->query("SELECT DISTINCT fecha FROM turnos WHERE id_turno IN (" . implode(',', $creados) . ")")->fetchAll(PDO::FETCH_COLUMN), true));
} catch (Throwable $e) {
    comprobar('la prueba terminó sin excepciones', false, $e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine());
} finally {
    // Limpieza: solo en la base de pruebas y solo lo que creó esta prueba
    if ((string) $pdo->query('SELECT DATABASE()')->fetchColumn() === $base) {
        if ($usuarioDesactivado !== null) {
            $pdo->prepare("UPDATE usuarios SET estado = 'activo' WHERE id_usuario = :id")->execute([':id' => $usuarioDesactivado]);
        }
        if ($creados !== []) {
            $pdo->exec('DELETE FROM turnos WHERE id_turno IN (' . implode(',', array_map('intval', $creados)) . ')');
        }
    }
}

comprobar('limpieza: no quedan turnos de prueba', $creados === [] || (int) $pdo->query('SELECT COUNT(*) FROM turnos WHERE id_turno IN (' . implode(',', $creados) . ')')->fetchColumn() === 0);
comprobar('la base real medicontrol_db no cambió durante la prueba', checksumReal($pdo) === $checksumAntes);

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
