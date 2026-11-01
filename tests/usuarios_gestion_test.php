<?php
// ============================================================================
// MEDICONTROL - PRUEBAS DE CONFIGURACIÓN DE RECEPCIÓN (GESTIÓN DE USUARIOS)
// Uso: MEDICONTROL_DB=medicontrol_test php tests/usuarios_gestion_test.php
//
// SOLO se ejecuta contra una base "medicontrol_test". Crea usuarios y turnos
// temporales, los borra al final y verifica que la base real (medicontrol_db) no cambie.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/helpers/sesion_simulada.php';
ini_set('display_errors', '1');

session_save_path(sys_get_temp_dir());
ini_set('session.use_cookies', '0');
ini_set('session.cache_limiter', '');

use MediControl\Http\App;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;

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

const DOMINIO = '@gestion-prueba.test';
const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function checksumReal(PDO $pdo): string
{
    return (string) json_encode($pdo->query('CHECKSUM TABLE medicontrol_db.usuarios, medicontrol_db.pacientes, medicontrol_db.medicos, medicontrol_db.turnos')->fetchAll(PDO::FETCH_NUM));
}

/** Borra solo lo que creó esta prueba: primero los turnos y después los usuarios (con sus perfiles). */
function limpiar(PDO $pdo): void
{
    $pdo->exec("DELETE t FROM turnos t
                LEFT JOIN pacientes p ON p.id_paciente = t.id_paciente LEFT JOIN usuarios up ON up.id_usuario = p.id_usuario
                LEFT JOIN medicos m ON m.id_medico = t.id_medico LEFT JOIN usuarios um ON um.id_usuario = m.id_usuario
                WHERE up.email LIKE '%" . DOMINIO . "' OR um.email LIKE '%" . DOMINIO . "'");
    $pdo->exec("DELETE FROM usuarios WHERE email LIKE '%" . DOMINIO . "'");
}

$secuencia = 0;
$hashComun = password_hash('Inicial2026', PASSWORD_DEFAULT);

function crear(PDO $pdo, string $rol, string $apellido = 'Temporal', string $especialidad = 'Prueba'): array
{
    global $secuencia, $hashComun;
    $secuencia++;
    $email = "{$rol}{$secuencia}" . DOMINIO;
    $dni = (string) (96000000 + $secuencia);
    $pdo->prepare("INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES ('Persona', :a, :d, :e, :c, :r, 'activo')")
        ->execute([':a' => $apellido, ':d' => $dni, ':e' => $email, ':c' => $hashComun, ':r' => $rol]);
    $id = (int) $pdo->lastInsertId();
    $perfil = 0;
    if ($rol === 'medico') {
        $pdo->prepare('INSERT INTO medicos (id_usuario, especialidad) VALUES (:i, :e)')->execute([':i' => $id, ':e' => $especialidad]);
        $perfil = (int) $pdo->lastInsertId();
    } elseif ($rol === 'paciente') {
        $pdo->prepare('INSERT INTO pacientes (id_usuario) VALUES (:i)')->execute([':i' => $id]);
        $perfil = (int) $pdo->lastInsertId();
    }

    return ['id' => $id, 'perfil' => $perfil, 'email' => $email, 'dni' => $dni, 'rol' => $rol];
}

function pedir(string $metodo, string $ruta, ?array $actor, array $cuerpo = [], array $query = [], bool $conToken = true): Respuesta
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = $actor === null ? [] : sesionSimulada($actor['id'], $actor['rol'], ['csrf_token' => TOKEN]);

    return App::manejar(new Request($metodo, $ruta, $query, $cuerpo, $conToken ? ['X-CSRF-Token' => TOKEN] : []));
}

function usuarioDb(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT u.*, m.especialidad, m.matricula, p.telefono, p.direccion, p.fecha_nacimiento, p.genero, p.obra_social
                           FROM usuarios u LEFT JOIN medicos m ON m.id_usuario = u.id_usuario LEFT JOIN pacientes p ON p.id_usuario = u.id_usuario
                           WHERE u.id_usuario = :id');
    $stmt->execute([':id' => $id]);

    return $stmt->fetch() ?: [];
}

function agregarTurno(PDO $pdo, array $paciente, array $medico, string $fecha, string $hora, string $estado): int
{
    $pdo->prepare('INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta) VALUES (:p, :m, :f, :h, :e, :mo)')
        ->execute([':p' => $paciente['perfil'], ':m' => $medico['perfil'], ':f' => $fecha, ':h' => $hora, ':e' => $estado, ':mo' => 'Prueba de gestión']);

    return (int) $pdo->lastInsertId();
}

function sinDatosSensibles(Respuesta $r): bool
{
    $json = (string) json_encode($r->cuerpo, JSON_UNESCAPED_SLASHES);

    return strpos($json, '$2y$') === false && strpos($json, '"contrasena"') === false && strpos($json, 'huella') === false && strpos($json, 'Inicial2026') === false;
}

function renderizar(string $pantalla, array $actor): string
{
    return (string) shell_exec(implode(' ', array_map('escapeshellarg', [PHP_BINARY, __DIR__ . '/helpers/render_pantalla.php', $pantalla, '', (string) $actor['id'], $actor['rol']])));
}

$checksumAntes = checksumReal($pdo);
limpiar($pdo); // restos de una ejecución anterior interrumpida

$valido = static fn (array $extra = []): array => $extra + [
    'nombre' => 'Ana María', 'apellido' => "D'Alessandro", 'dni' => '95.111.222', 'email' => 'Ana.Alta' . DOMINIO,
    'contrasena' => 'Provisoria2026', 'contrasena_confirmacion' => 'Provisoria2026',
];

try {
    $recep = crear($pdo, 'recepcionista');
    $otraRecep = crear($pdo, 'recepcionista');
    $medico = crear($pdo, 'medico', 'Temporal', 'Especialidad Única Prueba');
    $paciente = crear($pdo, 'paciente');

    // ── Permisos y CSRF ─────────────────────────────────────────────────────
    $rutas = [
        ['GET', '/usuarios'], ['POST', '/usuarios'], ['GET', "/usuarios/{$paciente['id']}"], ['PATCH', "/usuarios/{$paciente['id']}"],
        ['POST', "/usuarios/{$paciente['id']}/baja"], ['POST', "/usuarios/{$paciente['id']}/reactivacion"], ['POST', "/usuarios/{$paciente['id']}/contrasena-provisoria"],
    ];
    foreach ($rutas as [$metodo, $ruta]) {
        comprobar("sin sesión: {$metodo} {$ruta} responde 401", pedir($metodo, $ruta, null)->estadoHttp === 401);
        comprobar("médico: {$metodo} {$ruta} responde 403", pedir($metodo, $ruta, $medico)->estadoHttp === 403);
        comprobar("paciente: {$metodo} {$ruta} responde 403", pedir($metodo, $ruta, $paciente)->estadoHttp === 403);
        if ($metodo !== 'GET') {
            $r = pedir($metodo, $ruta, $recep, [], [], false);
            comprobar("sin token CSRF: {$metodo} {$ruta} responde 403", $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'CSRF_INVALIDO');
        }
    }
    comprobar('DELETE no existe: no hay borrado físico por la API', pedir('DELETE', "/usuarios/{$paciente['id']}", $recep)->estadoHttp === 405);

    // ── Listado ─────────────────────────────────────────────────────────────
    $idsDe = static fn (Respuesta $r): array => array_column($r->cuerpo['data']['usuarios'] ?? [], 'id_usuario');
    $roles = static fn (Respuesta $r): array => array_unique(array_column($r->cuerpo['data']['usuarios'] ?? [], 'rol'));

    $r = pedir('GET', '/usuarios', $recep, [], ['tipo' => 'personal', 'buscar' => 'Persona Temporal']);
    comprobar('Personal lista médicos y recepcionistas', $r->estadoHttp === 200 && in_array($medico['id'], $idsDe($r), true) && in_array($otraRecep['id'], $idsDe($r), true));
    comprobar('Personal no incluye pacientes', !in_array('paciente', $roles($r), true));
    comprobar('Personal: el listado no expone datos sensibles', sinDatosSensibles($r));
    $filaMedico = array_values(array_filter($r->cuerpo['data']['usuarios'], static fn ($u) => $u['id_usuario'] === $medico['id']))[0] ?? [];
    $filaRecep = array_values(array_filter($r->cuerpo['data']['usuarios'], static fn ($u) => $u['id_usuario'] === $otraRecep['id']))[0] ?? [];
    comprobar('un médico figura como gestionable', ($filaMedico['gestionable'] ?? null) === true);
    comprobar('otro recepcionista figura como solo consulta', ($filaRecep['gestionable'] ?? null) === false);

    $r = pedir('GET', '/usuarios', $recep, [], ['tipo' => 'pacientes', 'buscar' => $paciente['dni']]);
    comprobar('Pacientes: se busca por DNI', $idsDe($r) === [$paciente['id']]);
    comprobar('Pacientes no incluye personal', $roles($r) === ['paciente']);
    comprobar('Pacientes: se busca por correo', $idsDe(pedir('GET', '/usuarios', $recep, [], ['tipo' => 'pacientes', 'buscar' => $paciente['email']])) === [$paciente['id']]);
    comprobar('Personal: se busca por especialidad', $idsDe(pedir('GET', '/usuarios', $recep, [], ['tipo' => 'personal', 'buscar' => 'Especialidad Única Prueba'])) === [$medico['id']]);
    comprobar('un % en la búsqueda se toma como texto', pedir('GET', '/usuarios', $recep, [], ['tipo' => 'pacientes', 'buscar' => '%'])->cuerpo['data']['total'] === 0);
    comprobar('la búsqueda con comilla no rompe la consulta', pedir('GET', '/usuarios', $recep, [], ['tipo' => 'pacientes', 'buscar' => "' OR 1=1 -- "])->cuerpo['data']['total'] === 0);
    foreach ([['tipo' => 'otros'], ['estado' => 'borrado'], ['pagina' => '0'], ['pagina' => 'abc'], ['buscar' => str_repeat('a', 81)]] as $q) {
        comprobar('parámetro inválido responde 400: ' . json_encode($q), pedir('GET', '/usuarios', $recep, [], $q)->estadoHttp === 400);
    }

    // Paginación con 12 pacientes del mismo apellido
    for ($i = 0; $i < 12; $i++) {
        crear($pdo, 'paciente', 'Paginado');
    }
    $p1 = pedir('GET', '/usuarios', $recep, [], ['tipo' => 'pacientes', 'buscar' => 'Paginado', 'pagina' => '1']);
    $p2 = pedir('GET', '/usuarios', $recep, [], ['tipo' => 'pacientes', 'buscar' => 'Paginado', 'pagina' => '2']);
    comprobar('paginación: total y páginas correctos', $p1->cuerpo['data']['total'] === 12 && $p1->cuerpo['data']['paginas'] === 2);
    comprobar('paginación: 10 en la primera y 2 en la segunda', count($idsDe($p1)) === 10 && count($idsDe($p2)) === 2);
    comprobar('paginación: las páginas no se superponen', array_intersect($idsDe($p1), $idsDe($p2)) === []);

    $r = pedir('GET', "/usuarios/{$paciente['id']}", $recep);
    comprobar('detalle: incluye datos de perfil y no datos sensibles', $r->estadoHttp === 200 && array_key_exists('direccion', $r->cuerpo['data']['usuario']) && sinDatosSensibles($r));
    comprobar('detalle de otro recepcionista: se puede consultar', pedir('GET', "/usuarios/{$otraRecep['id']}", $recep)->estadoHttp === 200);
    comprobar('detalle inexistente responde 404', pedir('GET', '/usuarios/999999', $recep)->estadoHttp === 404);

    // ── Altas ───────────────────────────────────────────────────────────────
    $r = pedir('POST', '/usuarios', $recep, $valido(['rol' => 'paciente', 'estado' => 'inactivo', 'id_usuario' => 1, 'contrasena_hash' => 'x']));
    comprobar('alta de paciente responde 201', $r->estadoHttp === 201, (string) json_encode($r->cuerpo));
    comprobar('alta de paciente: la respuesta no expone datos sensibles', sinDatosSensibles($r) && strpos((string) json_encode($r->cuerpo), 'Provisoria2026') === false);
    $idAlta = (int) ($r->cuerpo['data']['usuario']['id_usuario'] ?? 0);
    $fila = usuarioDb($pdo, $idAlta);
    comprobar('alta de paciente: rol, estado y perfil correctos', ($fila['rol'] ?? '') === 'paciente' && ($fila['estado'] ?? '') === 'activo' && ($fila['obra_social'] ?? '') === 'Particular');
    comprobar('alta: no se usó el id_usuario enviado', $idAlta !== 1 && $idAlta > 0);
    comprobar('alta: datos normalizados', ($fila['dni'] ?? '') === '95111222' && ($fila['email'] ?? '') === 'ana.alta' . DOMINIO);
    comprobar('alta: contraseña con bcrypt y sin texto plano', strncmp((string) ($fila['contrasena'] ?? ''), '$2y$', 4) === 0 && password_verify('Provisoria2026', (string) ($fila['contrasena'] ?? '')));

    $r = pedir('POST', '/usuarios', $recep, $valido(['rol' => 'medico', 'dni' => '95111223', 'email' => 'medico.alta' . DOMINIO, 'especialidad' => 'Dermatología', 'matricula' => 'MN-1234']));
    comprobar('alta de médico responde 201', $r->estadoHttp === 201, (string) json_encode($r->cuerpo));
    $fila = usuarioDb($pdo, (int) ($r->cuerpo['data']['usuario']['id_usuario'] ?? 0));
    comprobar('alta de médico: rol y perfil correctos', ($fila['rol'] ?? '') === 'medico' && ($fila['especialidad'] ?? '') === 'Dermatología' && ($fila['matricula'] ?? '') === 'MN-1234');

    $cuantos = static fn (): int => (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE email LIKE '%" . DOMINIO . "'")->fetchColumn();
    $antes = $cuantos();
    $r = pedir('POST', '/usuarios', $recep, $valido(['rol' => 'recepcionista', 'dni' => '95111224', 'email' => 'x1' . DOMINIO]));
    comprobar('no se pueden crear recepcionistas (403)', $r->estadoHttp === 403);
    comprobar('rol inválido responde 400', pedir('POST', '/usuarios', $recep, $valido(['rol' => 'administrador', 'dni' => '95111225', 'email' => 'x2' . DOMINIO]))->estadoHttp === 400);
    comprobar('rol como lista responde 400', pedir('POST', '/usuarios', $recep, $valido(['rol' => ['medico'], 'dni' => '95111226', 'email' => 'x3' . DOMINIO]))->estadoHttp === 400);
    $casos = [
        'sin especialidad'       => ['rol' => 'medico', 'dni' => '95111227', 'email' => 'x4' . DOMINIO],
        'DNI con letras'         => ['rol' => 'paciente', 'dni' => '12AB3456', 'email' => 'x5' . DOMINIO],
        'correo inválido'        => ['rol' => 'paciente', 'dni' => '95111228', 'email' => 'no-es-correo'],
        'nombre con números'     => ['rol' => 'paciente', 'dni' => '95111229', 'email' => 'x6' . DOMINIO, 'nombre' => 'Ana99'],
        'teléfono inválido'      => ['rol' => 'paciente', 'dni' => '95111230', 'email' => 'x7' . DOMINIO, 'telefono' => 'llamar'],
        'género fuera de lista'  => ['rol' => 'paciente', 'dni' => '95111231', 'email' => 'x8' . DOMINIO, 'genero' => 'Administrador'],
        'contraseña corta'       => ['rol' => 'paciente', 'dni' => '95111232', 'email' => 'x9' . DOMINIO, 'contrasena' => 'Ab1', 'contrasena_confirmacion' => 'Ab1'],
        'contraseñas distintas'  => ['rol' => 'paciente', 'dni' => '95111233', 'email' => 'x10' . DOMINIO, 'contrasena_confirmacion' => 'Otra2026xx'],
        'matrícula inválida'     => ['rol' => 'medico', 'dni' => '95111234', 'email' => 'x11' . DOMINIO, 'especialidad' => 'Prueba', 'matricula' => '<script>'],
    ];
    foreach ($casos as $nombre => $extra) {
        $r = pedir('POST', '/usuarios', $recep, $valido($extra));
        comprobar("alta con {$nombre}: responde 400 con campos", $r->estadoHttp === 400 && ($r->cuerpo['error']['campos'] ?? []) !== [], (string) $r->estadoHttp);
    }
    $r = pedir('POST', '/usuarios', $recep, $valido(['rol' => 'paciente', 'dni' => '95111235', 'email' => strtoupper('ana.alta') . DOMINIO]));
    comprobar('alta con correo duplicado: 409 marcando el correo', $r->estadoHttp === 409 && isset($r->cuerpo['error']['campos']['email']));
    $r = pedir('POST', '/usuarios', $recep, $valido(['rol' => 'medico', 'dni' => '95111222', 'email' => 'x12' . DOMINIO, 'especialidad' => 'Prueba']));
    comprobar('alta con DNI duplicado: 409 marcando el DNI', $r->estadoHttp === 409 && isset($r->cuerpo['error']['campos']['dni']));
    comprobar('los envíos rechazados no crearon usuarios', $cuantos() === $antes);

    // ── Modificación ────────────────────────────────────────────────────────
    $datosPaciente = ['nombre' => 'Lucía', 'apellido' => 'Cambiada', 'dni' => '95.222.333', 'email' => 'Lucia.Mod' . DOMINIO, 'telefono' => '+54 342 111-2222', 'direccion' => 'San Martín 100', 'fecha_nacimiento' => '1990-05-20', 'genero' => 'Femenino', 'obra_social' => 'IAPOS'];
    $hashAntes = usuarioDb($pdo, $paciente['id'])['contrasena'];
    $r = pedir('PATCH', "/usuarios/{$paciente['id']}", $recep, $datosPaciente + ['contrasena' => 'Hackeada2026', 'estado' => 'inactivo']);
    comprobar('modificar paciente responde 200', $r->estadoHttp === 200, (string) json_encode($r->cuerpo));
    $fila = usuarioDb($pdo, $paciente['id']);
    comprobar('modificar: datos personales guardados', $fila['nombre'] === 'Lucía' && $fila['dni'] === '95222333' && $fila['email'] === 'lucia.mod' . DOMINIO);
    comprobar('modificar: datos de perfil guardados', $fila['telefono'] === '+54 342 111-2222' && $fila['obra_social'] === 'IAPOS' && $fila['fecha_nacimiento'] === '1990-05-20' && $fila['genero'] === 'Femenino');
    comprobar('modificar: contraseña y estado enviados se ignoran', $fila['contrasena'] === $hashAntes && $fila['estado'] === 'activo');
    comprobar('modificar: la respuesta no expone datos sensibles', sinDatosSensibles($r));
    comprobar('modificar sin cambios responde 200', pedir('PATCH', "/usuarios/{$paciente['id']}", $recep, $datosPaciente)->estadoHttp === 200);

    $datosMedico = ['nombre' => 'Carlos', 'apellido' => 'Modificado', 'dni' => $medico['dni'], 'email' => $medico['email'], 'especialidad' => 'Neurología', 'matricula' => 'MP 77'];
    $r = pedir('PATCH', "/usuarios/{$medico['id']}", $recep, $datosMedico);
    $fila = usuarioDb($pdo, $medico['id']);
    comprobar('modificar médico: datos y perfil guardados', $r->estadoHttp === 200 && $fila['apellido'] === 'Modificado' && $fila['especialidad'] === 'Neurología' && $fila['matricula'] === 'MP 77');

    foreach (['recepcionista', 'paciente', 'administrador', ''] as $rolNuevo) {
        $r = pedir('PATCH', "/usuarios/{$medico['id']}", $recep, $datosMedico + ['rol' => $rolNuevo]);
        comprobar("no se puede cambiar el rol a «{$rolNuevo}»", $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'CAMBIO_ROL_NO_PERMITIDO');
    }
    comprobar('enviar el mismo rol se acepta', pedir('PATCH', "/usuarios/{$medico['id']}", $recep, $datosMedico + ['rol' => 'medico'])->estadoHttp === 200);
    comprobar('el rol del médico sigue igual', usuarioDb($pdo, $medico['id'])['rol'] === 'medico');

    $r = pedir('PATCH', "/usuarios/{$medico['id']}", $recep, ['email' => 'lucia.mod' . DOMINIO] + $datosMedico);
    comprobar('modificar con correo de otro: 409', $r->estadoHttp === 409 && isset($r->cuerpo['error']['campos']['email']));
    $r = pedir('PATCH', "/usuarios/{$medico['id']}", $recep, ['dni' => '95222333'] + $datosMedico);
    comprobar('modificar con DNI de otro: 409', $r->estadoHttp === 409 && isset($r->cuerpo['error']['campos']['dni']));
    comprobar('modificar con datos inválidos: 400', pedir('PATCH', "/usuarios/{$medico['id']}", $recep, ['especialidad' => ''] + $datosMedico)->estadoHttp === 400);
    comprobar('modificar inexistente: 404', pedir('PATCH', '/usuarios/999999', $recep, $datosMedico)->estadoHttp === 404);
    $apellidoRecep = usuarioDb($pdo, $otraRecep['id'])['apellido'];
    comprobar('no se puede modificar a otro recepcionista', pedir('PATCH', "/usuarios/{$otraRecep['id']}", $recep, ['apellido' => 'Atacado', 'dni' => $otraRecep['dni'], 'nombre' => 'Persona', 'email' => $otraRecep['email']])->estadoHttp === 403);
    comprobar('no se puede modificar a sí mismo desde la gestión', pedir('PATCH', "/usuarios/{$recep['id']}", $recep, ['apellido' => 'Atacado', 'dni' => $recep['dni'], 'nombre' => 'Persona', 'email' => $recep['email']])->estadoHttp === 403);
    comprobar('el otro recepcionista no cambió', usuarioDb($pdo, $otraRecep['id'])['apellido'] === $apellidoRecep);

    // ── Bajas: reglas de roles ──────────────────────────────────────────────
    $r = pedir('POST', "/usuarios/{$recep['id']}/baja", $recep);
    comprobar('nadie puede darse de baja a sí mismo', $r->estadoHttp === 403 && $r->cuerpo['error']['codigo'] === 'BAJA_PROPIA_NO_PERMITIDA');
    comprobar('no se puede dar de baja a otro recepcionista', pedir('POST', "/usuarios/{$otraRecep['id']}/baja", $recep)->estadoHttp === 403);
    comprobar('no se puede reactivar a otro recepcionista', pedir('POST', "/usuarios/{$otraRecep['id']}/reactivacion", $recep)->estadoHttp === 403);
    comprobar('baja de inexistente: 404', pedir('POST', '/usuarios/999999/baja', $recep)->estadoHttp === 404);

    // ── Bajas: turnos sin resolver ──────────────────────────────────────────
    $hoy = turnosHoy();
    $manana = $hoy->modify('+1 day')->format('Y-m-d');
    $ayer = $hoy->modify('-1 day')->format('Y-m-d');
    foreach (['medico', 'paciente'] as $rol) {
        $otroMedico = crear($pdo, 'medico');
        $otroPaciente = crear($pdo, 'paciente');
        $sujeto = crear($pdo, $rol);
        [$tPaciente, $tMedico] = $rol === 'medico' ? [$otroPaciente, $sujeto] : [$sujeto, $otroMedico];
        $baja = static fn () => pedir('POST', "/usuarios/{$sujeto['id']}/baja", $recep);

        $turnoPasado = agregarTurno($pdo, $tPaciente, $tMedico, $ayer, '09:00:00', 'confirmado');
        $turnoCancelado = agregarTurno($pdo, $tPaciente, $tMedico, $manana, '09:00:00', 'cancelado');
        $turnoAtendido = agregarTurno($pdo, $tPaciente, $tMedico, $manana, '09:30:00', 'atendido');

        foreach (['pendiente', 'confirmado', 'en_curso'] as $estado) {
            $turno = agregarTurno($pdo, $tPaciente, $tMedico, $manana, '10:00:00', $estado);
            $r = $baja();
            comprobar("{$rol} con un turno futuro {$estado}: no se da de baja (409)", $r->estadoHttp === 409 && $r->cuerpo['error']['codigo'] === 'TURNOS_SIN_RESOLVER', (string) json_encode($r->cuerpo));
            comprobar("{$rol} con un turno futuro {$estado}: sigue activo", usuarioDb($pdo, $sujeto['id'])['estado'] === 'activo');
            $pdo->exec("DELETE FROM turnos WHERE id_turno = {$turno}");
        }
        $turnoEnCursoViejo = agregarTurno($pdo, $tPaciente, $tMedico, $ayer, '10:00:00', 'en_curso');
        comprobar("{$rol} con un turno en curso de otro día: no se da de baja", $baja()->estadoHttp === 409);
        $pdo->exec("DELETE FROM turnos WHERE id_turno = {$turnoEnCursoViejo}");

        $r = $baja();
        comprobar("{$rol} con turnos pasados, cancelados o atendidos: se da de baja", $r->estadoHttp === 200 && ($r->cuerpo['data']['usuario']['estado'] ?? '') === 'inactivo', (string) json_encode($r->cuerpo));
        comprobar("{$rol}: la baja es lógica y el registro sigue", usuarioDb($pdo, $sujeto['id'])['estado'] === 'inactivo');
        $conservados = (int) $pdo->query("SELECT COUNT(*) FROM turnos WHERE id_turno IN ({$turnoPasado}, {$turnoCancelado}, {$turnoAtendido})")->fetchColumn();
        comprobar("{$rol}: la baja conserva el historial de turnos", $conservados === 3);
        comprobar("{$rol}: dar de baja dos veces responde 409", $baja()->cuerpo['error']['codigo'] === 'YA_INACTIVO');
        comprobar("{$rol}: con la baja pierde el acceso a la API", pedir('GET', '/auth/me', $sujeto)->estadoHttp === 401);

        $inactivos = pedir('GET', '/usuarios', $recep, [], ['tipo' => $rol === 'medico' ? 'personal' : 'pacientes', 'estado' => 'inactivo', 'buscar' => $sujeto['dni']]);
        comprobar("{$rol}: aparece en el filtro de inactivos", $idsDe($inactivos) === [$sujeto['id']]);
        $activos = pedir('GET', '/usuarios', $recep, [], ['tipo' => $rol === 'medico' ? 'personal' : 'pacientes', 'estado' => 'activo', 'buscar' => $sujeto['dni']]);
        comprobar("{$rol}: no aparece en el filtro de activos", $idsDe($activos) === []);

        $r = pedir('POST', "/usuarios/{$sujeto['id']}/reactivacion", $recep);
        comprobar("{$rol}: se reactiva", $r->estadoHttp === 200 && usuarioDb($pdo, $sujeto['id'])['estado'] === 'activo');
        comprobar("{$rol}: reactivar dos veces responde 409", pedir('POST', "/usuarios/{$sujeto['id']}/reactivacion", $recep)->cuerpo['error']['codigo'] === 'YA_ACTIVO');
        comprobar("{$rol}: reactivado recupera el acceso", pedir('GET', '/auth/me', $sujeto)->estadoHttp === 200);
    }

    // ── Contraseña provisoria ───────────────────────────────────────────────
    $sujeto = crear($pdo, 'paciente');
    $ruta = "/usuarios/{$sujeto['id']}/contrasena-provisoria";
    $hashAntes = usuarioDb($pdo, $sujeto['id'])['contrasena'];
    comprobar('provisoria con política inválida: 422', pedir('POST', $ruta, $recep, ['contrasena' => 'Ab1', 'contrasena_confirmacion' => 'Ab1'])->estadoHttp === 422);
    comprobar('provisoria con confirmación distinta: 422', pedir('POST', $ruta, $recep, ['contrasena' => 'Provisoria2026', 'contrasena_confirmacion' => 'Otra2026xx'])->estadoHttp === 422);
    comprobar('los rechazos no cambian la contraseña', usuarioDb($pdo, $sujeto['id'])['contrasena'] === $hashAntes);

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $sesionVieja = sesionSimulada($sujeto['id'], 'paciente');
    $r = pedir('POST', $ruta, $recep, ['contrasena' => 'Provisoria2026', 'contrasena_confirmacion' => 'Provisoria2026']);
    comprobar('provisoria válida responde 200', $r->estadoHttp === 200, (string) json_encode($r->cuerpo));
    comprobar('provisoria: la respuesta no devuelve la contraseña', strpos((string) json_encode($r->cuerpo), 'Provisoria2026') === false && sinDatosSensibles($r));
    $hashNuevo = usuarioDb($pdo, $sujeto['id'])['contrasena'];
    comprobar('provisoria: se guarda con bcrypt', strncmp($hashNuevo, '$2y$', 4) === 0 && password_verify('Provisoria2026', $hashNuevo) && !password_verify('Inicial2026', $hashNuevo));
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = $sesionVieja;
    comprobar('provisoria: cierra las sesiones abiertas de ese usuario', App::manejar(new Request('GET', '/auth/me'))->estadoHttp === 401);
    comprobar('provisoria: no se aplica a sí mismo', pedir('POST', "/usuarios/{$recep['id']}/contrasena-provisoria", $recep, ['contrasena' => 'Provisoria2026', 'contrasena_confirmacion' => 'Provisoria2026'])->estadoHttp === 403);
    comprobar('provisoria: no se aplica a otro recepcionista', pedir('POST', "/usuarios/{$otraRecep['id']}/contrasena-provisoria", $recep, ['contrasena' => 'Provisoria2026', 'contrasena_confirmacion' => 'Provisoria2026'])->estadoHttp === 403);
    comprobar('provisoria: inexistente responde 404', pedir('POST', '/usuarios/999999/contrasena-provisoria', $recep, ['contrasena' => 'Provisoria2026', 'contrasena_confirmacion' => 'Provisoria2026'])->estadoHttp === 404);

    // ── Pantalla ────────────────────────────────────────────────────────────
    $html = renderizar('recepcionista_configuracion.php', $recep);
    comprobar('la pantalla abre para recepción', strpos($html, 'Gestión de Usuarios y Médicos') !== false && strpos($html, 'id="formContrasena"') !== false);
    comprobar('la pantalla usa la identidad MEDICONTROL', strpos($html, 'MEDICONTROL') !== false && stripos($html, 'MediCore') === false && stripos($html, 'MedCore') === false);
    foreach (['Alertas', 'Último acceso', 'cdn.tailwindcss', 'notifications'] as $ausente) {
        comprobar("la pantalla no incluye «{$ausente}»", stripos($html, $ausente) === false);
    }
    comprobar('la pantalla enlaza a Mi cuenta y a Turnos', strpos($html, 'href="mi_cuenta.php"') !== false && strpos($html, 'href="recepcionista.php"') !== false);
    comprobar('la pantalla no trae datos de usuarios ni hashes en el HTML', strpos($html, '$2y$') === false && strpos($html, $paciente['email']) === false);
    foreach (['medico', 'paciente'] as $rol) {
        comprobar("la pantalla queda bloqueada para {$rol}", strpos(renderizar('recepcionista_configuracion.php', $rol === 'medico' ? $medico : crear($pdo, 'paciente')), 'Acceso denegado') !== false);
    }
    foreach (['recepcionista.php', 'recepcionista_semana.php', 'recepcionista_mes.php'] as $pantalla) {
        comprobar("{$pantalla} enlaza a Configuración", strpos(renderizar($pantalla, $recep), 'href="recepcionista_configuracion.php"') !== false);
    }
} catch (Throwable $e) {
    comprobar('la prueba terminó sin excepciones', false, $e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine());
} finally {
    if ((string) $pdo->query('SELECT DATABASE()')->fetchColumn() === $base) {
        limpiar($pdo);
    }
}

comprobar('limpieza: no quedan usuarios de prueba', (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE email LIKE '%" . DOMINIO . "'")->fetchColumn() === 0);
comprobar('limpieza: no quedan turnos de prueba', (int) $pdo->query("SELECT COUNT(*) FROM turnos WHERE motivo_consulta = 'Prueba de gestión'")->fetchColumn() === 0);
comprobar('la base real medicontrol_db no cambió durante la prueba', checksumReal($pdo) === $checksumAntes);

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
