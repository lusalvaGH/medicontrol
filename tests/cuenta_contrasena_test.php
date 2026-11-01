<?php
// ============================================================================
// MEDICONTROL - PRUEBAS DEL CAMBIO DE LA CONTRASEÑA PROPIA
// Uso: MEDICONTROL_DB=medicontrol_test php tests/cuenta_contrasena_test.php
//
// SOLO se ejecuta contra una base "medicontrol_test". Levanta un servidor PHP propio
// (php -S, puerto 8097), crea usuarios temporales, los borra al final y verifica que
// la base real (medicontrol_db) no cambie.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/helpers/sesion_simulada.php';
ini_set('display_errors', '1');

// Sesiones en memoria del proceso para las partes que no pasan por HTTP
session_save_path(sys_get_temp_dir());
ini_set('session.use_cookies', '0');
ini_set('session.cache_limiter', '');

use MediControl\Http\ApiException;
use MediControl\Http\App;
use MediControl\Http\Request;
use MediControl\Repositories\UsuariosRepository;
use MediControl\Services\CuentaService;

$pdo = Database::getConnection();
$base = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
if (!preg_match('/^medicontrol_test(_[a-z0-9]+)?$/', $base)) {
    fwrite(STDERR, "ABORTADO: la conexión apunta a «{$base}». Ejecutá con MEDICONTROL_DB=medicontrol_test.\n");
    exit(2);
}
if (!function_exists('curl_init')) {
    fwrite(STDERR, "ABORTADO: falta la extensión curl de PHP.\n");
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

/** Navegador mínimo con cookies propias. */
final class Cliente
{
    public array $cookies = [];
    private string $base;

    public function __construct(string $base)
    {
        $this->base = $base;
    }

    /** @return array{estado: int, ubicacion: string, cuerpo: string} */
    public function pedir(string $metodo, string $ruta, array $form = [], array $cabeceras = [], ?string $json = null): array
    {
        $ch = curl_init($this->base . $ruta);
        $setCookie = [];
        $hdr = $cabeceras;
        if ($this->cookies !== []) {
            $hdr[] = 'Cookie: ' . implode('; ', array_map(static fn ($n, $v) => "{$n}={$v}", array_keys($this->cookies), $this->cookies));
        }
        $opciones = [
            CURLOPT_CUSTOMREQUEST  => $metodo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $linea) use (&$setCookie) {
                if (stripos($linea, 'Set-Cookie:') === 0) {
                    $setCookie[] = trim(substr($linea, 11));
                }

                return strlen($linea);
            },
        ];
        if ($json !== null) {
            $opciones[CURLOPT_POSTFIELDS] = $json;
            $hdr[] = 'Content-Type: application/json';
        } elseif ($form !== []) {
            $opciones[CURLOPT_POSTFIELDS] = http_build_query($form);
        }
        $opciones[CURLOPT_HTTPHEADER] = $hdr;
        curl_setopt_array($ch, $opciones);
        $cuerpo = (string) curl_exec($ch);
        $estado = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $ubicacion = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: '');
        curl_close($ch);

        foreach ($setCookie as $cookie) {
            [$par] = explode(';', $cookie, 2);
            [$nombre, $valor] = array_map('trim', explode('=', $par, 2) + [1 => '']);
            if ($valor === '' || $valor === 'deleted') {
                unset($this->cookies[$nombre]);
            } else {
                $this->cookies[$nombre] = $valor;
            }
        }

        return ['estado' => $estado, 'ubicacion' => $ubicacion, 'cuerpo' => $cuerpo];
    }

    public function iniciarSesion(string $email, string $contrasena): array
    {
        $html = $this->pedir('GET', '/login.php')['cuerpo'];
        $token = preg_match('/name="csrf_token" value="([0-9a-f]{64})"/', $html, $m) ? $m[1] : '';

        return $this->pedir('POST', '/login.php', ['csrf_token' => $token, 'email' => $email, 'contrasena' => $contrasena]);
    }

    public function tokenApi(): string
    {
        $r = json_decode($this->pedir('GET', '/api/auth/csrf')['cuerpo'], true);

        return (string) ($r['data']['token'] ?? '');
    }

    /** @return array{estado: int, codigo: string, cuerpo: string} */
    public function cambiar($actual, $nueva, $confirmacion = null, ?string $token = null, array $extra = []): array
    {
        $token = $token ?? $this->tokenApi();
        $datos = array_merge(['contrasena_actual' => $actual, 'contrasena_nueva' => $nueva, 'contrasena_confirmacion' => $confirmacion ?? $nueva], $extra);
        $r = $this->pedir('POST', '/api/cuenta/contrasena', [], ['X-CSRF-Token: ' . $token], (string) json_encode($datos));
        $json = json_decode($r['cuerpo'], true);

        return ['estado' => $r['estado'], 'codigo' => (string) ($json['error']['codigo'] ?? ''), 'cuerpo' => $r['cuerpo']];
    }
}

function checksumReal(PDO $pdo): string
{
    return (string) json_encode($pdo->query('CHECKSUM TABLE medicontrol_db.usuarios, medicontrol_db.pacientes, medicontrol_db.medicos, medicontrol_db.turnos')->fetchAll(PDO::FETCH_NUM));
}

const DOMINIO_PRUEBA = '@contrasena-prueba.test';
const CLAVE_INICIAL = 'Inicial2026';

$secuenciaDni = 0;

function crearUsuario(PDO $pdo, string $rol, string $nombre = 'Prueba', string $clave = CLAVE_INICIAL): array
{
    global $secuenciaDni;
    $secuenciaDni++;
    $email = "{$rol}{$secuenciaDni}" . DOMINIO_PRUEBA;
    $dni = (string) (97000000 + $secuenciaDni);
    $stmt = $pdo->prepare("INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado) VALUES (:n, 'Contraseña', :d, :e, :c, :r, 'activo')");
    $stmt->execute([':n' => $nombre, ':d' => $dni, ':e' => $email, ':c' => password_hash($clave, PASSWORD_DEFAULT), ':r' => $rol]);
    $id = (int) $pdo->lastInsertId();
    if ($rol === 'medico') {
        $pdo->prepare("INSERT INTO medicos (id_usuario, especialidad) VALUES (:id, 'Prueba')")->execute([':id' => $id]);
    } elseif ($rol === 'paciente') {
        $pdo->prepare('INSERT INTO pacientes (id_usuario) VALUES (:id)')->execute([':id' => $id]);
    }

    return ['id' => $id, 'email' => $email];
}

function hashDe(PDO $pdo, int $id): string
{
    $stmt = $pdo->prepare('SELECT contrasena FROM usuarios WHERE id_usuario = :id');
    $stmt->execute([':id' => $id]);

    return (string) $stmt->fetchColumn();
}

function borrarUsuariosDePrueba(PDO $pdo): void
{
    $pdo->exec("DELETE FROM usuarios WHERE email LIKE '%" . DOMINIO_PRUEBA . "'"); // borra también los perfiles (ON DELETE CASCADE)
}

// ── Servidor de pruebas ──────────────────────────────────────────────────────
$puerto = 8097;
$url = "http://127.0.0.1:{$puerto}";
if (@fsockopen('127.0.0.1', $puerto, $codigo, $mensaje, 0.5) !== false) {
    fwrite(STDERR, "ABORTADO: el puerto {$puerto} ya está en uso.\n");
    exit(2);
}
$raiz = dirname(__DIR__);
$servidor = proc_open(
    [PHP_BINARY, '-S', "127.0.0.1:{$puerto}", '-t', $raiz, $raiz . '/tests/helpers/router_pruebas.php'],
    [0 => ['pipe', 'r'], 1 => ['file', sys_get_temp_dir() . '/medicontrol_pruebas_servidor.log', 'a'], 2 => ['file', sys_get_temp_dir() . '/medicontrol_pruebas_servidor.log', 'a']],
    $tuberias,
    $raiz,
    array_merge(getenv(), ['MEDICONTROL_DB' => $base])
);
$listo = false;
for ($i = 0; $i < 50 && !$listo; $i++) {
    usleep(100000);
    $listo = @file_get_contents($url . '/api/health') !== false;
}
if (!$listo) {
    fwrite(STDERR, "ABORTADO: no arrancó el servidor de pruebas en el puerto {$puerto}.\n");
    proc_terminate($servidor);
    exit(2);
}

$checksumAntes = checksumReal($pdo);
borrarUsuariosDePrueba($pdo); // restos de una ejecución anterior interrumpida

try {
    // ── Acceso ──────────────────────────────────────────────────────────────
    $anonimo = new Cliente($url);
    $r = $anonimo->pedir('POST', '/api/cuenta/contrasena', [], [], '{}');
    comprobar('sin sesión responde 401', $r['estado'] === 401, (string) $r['estado']);
    $r = $anonimo->pedir('GET', '/panel/mi_cuenta.php');
    comprobar('sin sesión, Mi cuenta lleva al login', $r['estado'] === 302 && strpos($r['ubicacion'], 'login.php') !== false);

    $u = crearUsuario($pdo, 'paciente');
    $c = new Cliente($url);
    $c->iniciarSesion($u['email'], CLAVE_INICIAL);
    $r = $c->pedir('GET', '/api/cuenta/contrasena');
    comprobar('GET responde 405', $r['estado'] === 405, (string) $r['estado']);
    $r = $c->pedir('POST', '/api/cuenta/contrasena', [], [], '{}');
    comprobar('sin token CSRF responde 403', $r['estado'] === 403 && strpos($r['cuerpo'], 'CSRF_INVALIDO') !== false);
    $r = $c->cambiar(CLAVE_INICIAL, 'Nueva2026x', null, str_repeat('0', 64));
    comprobar('con token CSRF incorrecto responde 403', $r['estado'] === 403 && $r['codigo'] === 'CSRF_INVALIDO');
    comprobar('sin token válido la contraseña no cambia', password_verify(CLAVE_INICIAL, hashDe($pdo, $u['id'])));

    // ── Validaciones ────────────────────────────────────────────────────────
    $casos = [
        'actual vacía'                => ['', 'Nueva2026x', 'Nueva2026x', 400, 'DATOS_INVALIDOS'],
        'nueva vacía'                 => [CLAVE_INICIAL, '', '', 400, 'DATOS_INVALIDOS'],
        'actual como número'          => [12345678, 'Nueva2026x', 'Nueva2026x', 400, 'DATOS_INVALIDOS'],
        'nueva como lista'            => [CLAVE_INICIAL, ['Nueva2026x'], ['Nueva2026x'], 400, 'DATOS_INVALIDOS'],
        'nueva corta'                 => [CLAVE_INICIAL, 'Ab1', 'Ab1', 422, 'CONTRASENA_NO_VALIDA'],
        'nueva sin números'           => [CLAVE_INICIAL, 'SoloLetras', 'SoloLetras', 422, 'CONTRASENA_NO_VALIDA'],
        'nueva sin letras'            => [CLAVE_INICIAL, '12345678', '12345678', 422, 'CONTRASENA_NO_VALIDA'],
        'nueva de 73 bytes'           => [CLAVE_INICIAL, str_repeat('a', 72) . '1', str_repeat('a', 72) . '1', 422, 'CONTRASENA_NO_VALIDA'],
        'nueva con byte nulo'         => [CLAVE_INICIAL, "Nueva\0" . '2026x', "Nueva\0" . '2026x', 422, 'CONTRASENA_NO_VALIDA'],
        'confirmación distinta'       => [CLAVE_INICIAL, 'Nueva2026x', 'Otra2026xx', 422, 'CONFIRMACION_NO_COINCIDE'],
        'nueva igual a la actual'     => [CLAVE_INICIAL, CLAVE_INICIAL, CLAVE_INICIAL, 422, 'CONTRASENA_REPETIDA'],
    ];
    foreach ($casos as $nombre => [$actual, $nueva, $confirmacion, $estado, $codigo]) {
        $r = $c->cambiar($actual, $nueva, $confirmacion);
        comprobar("{$nombre}: responde {$estado} {$codigo}", $r['estado'] === $estado && $r['codigo'] === $codigo, $r['estado'] . ' ' . $r['codigo']);
    }
    $r = $c->cambiar('Equivocada2026', 'Nueva2026x');
    comprobar('actual incorrecta: responde 422', $r['estado'] === 422 && $r['codigo'] === 'CONTRASENA_ACTUAL_INCORRECTA');
    $r = $c->cambiar(CLAVE_INICIAL . str_repeat('x', 70), 'Nueva2026x');
    comprobar('actual de más de 72 bytes: se rechaza como incorrecta', $r['codigo'] === 'CONTRASENA_ACTUAL_INCORRECTA');
    comprobar('ningún envío inválido cambió la contraseña', password_verify(CLAVE_INICIAL, hashDe($pdo, $u['id'])));

    // ── Cambio correcto para cada rol ───────────────────────────────────────
    foreach (['recepcionista', 'medico', 'paciente'] as $rol) {
        $usuario = crearUsuario($pdo, $rol);
        $cli = new Cliente($url);
        $cli->iniciarSesion($usuario['email'], CLAVE_INICIAL);
        $pagina = $cli->pedir('GET', '/panel/mi_cuenta.php');
        comprobar("{$rol}: Mi cuenta abre y tiene el formulario", $pagina['estado'] === 200 && strpos($pagina['cuerpo'], 'id="formContrasena"') !== false);
        $r = $cli->cambiar(CLAVE_INICIAL, 'Nueva2026x');
        comprobar("{$rol}: cambia su contraseña", $r['estado'] === 200 && strpos($r['cuerpo'], '"actualizada":true') !== false, $r['cuerpo']);
        $hash = hashDe($pdo, $usuario['id']);
        comprobar("{$rol}: se guarda con bcrypt y sin texto plano", strncmp($hash, '$2y$', 4) === 0 && strpos($hash, 'Nueva2026x') === false && password_verify('Nueva2026x', $hash));
        comprobar("{$rol}: la respuesta no expone contraseña, hash ni huella", strpos($r['cuerpo'], 'Nueva2026x') === false && strpos($r['cuerpo'], '$2y$') === false && strpos($r['cuerpo'], huellaDeCredencial($hash)) === false);
        $vieja = (new Cliente($url))->iniciarSesion($usuario['email'], CLAVE_INICIAL);
        comprobar("{$rol}: la contraseña vieja deja de funcionar", $vieja['estado'] === 200);
        $bien = (new Cliente($url))->iniciarSesion($usuario['email'], 'Nueva2026x');
        comprobar("{$rol}: la contraseña nueva funciona", $bien['estado'] === 302);
    }

    // ── Aislamiento: el usuario sale de la sesión, nunca del pedido ─────────
    $u1 = crearUsuario($pdo, 'paciente');
    $u2 = crearUsuario($pdo, 'paciente');
    $hashU2 = hashDe($pdo, $u2['id']);
    $c1 = new Cliente($url);
    $c1->iniciarSesion($u1['email'], CLAVE_INICIAL);
    $r = $c1->cambiar(CLAVE_INICIAL, 'Nueva2026x', null, null, ['id_usuario' => $u2['id']]);
    comprobar('enviar otro id_usuario no afecta a ese usuario', $r['estado'] === 200 && hashDe($pdo, $u2['id']) === $hashU2);
    comprobar('el cambio se aplica solo al usuario de la sesión', password_verify('Nueva2026x', hashDe($pdo, $u1['id'])));

    // ── Exactitud: la contraseña no se altera ───────────────────────────────
    $u3 = crearUsuario($pdo, 'paciente');
    $c3 = new Cliente($url);
    $c3->iniciarSesion($u3['email'], CLAVE_INICIAL);
    $conEspacios = '  Espacios 2026  ';
    $r = $c3->cambiar(CLAVE_INICIAL, $conEspacios);
    comprobar('los espacios al inicio y al final se conservan', $r['estado'] === 200 && password_verify($conEspacios, hashDe($pdo, $u3['id'])) && !password_verify(trim($conEspacios), hashDe($pdo, $u3['id'])));
    $acentos = 'Contraseña2026áé';
    $r = $c3->cambiar($conEspacios, $acentos);
    comprobar('funcionan los caracteres acentuados', $r['estado'] === 200 && password_verify($acentos, hashDe($pdo, $u3['id'])));
    $de72 = str_repeat('a', 71) . '1';
    $r = $c3->cambiar($acentos, $de72);
    comprobar('se acepta una contraseña de exactamente 72 bytes', $r['estado'] === 200, $r['cuerpo']);

    // ── Sesiones: la actual sigue, las demás quedan inválidas ───────────────
    $u4 = crearUsuario($pdo, 'recepcionista');
    $esta = new Cliente($url);
    $otra = new Cliente($url);
    $esta->iniciarSesion($u4['email'], CLAVE_INICIAL);
    $otra->iniciarSesion($u4['email'], CLAVE_INICIAL);
    $idAntes = $esta->cookies['PHPSESSID'] ?? '';
    $tokenAntes = $esta->tokenApi();

    $r = $esta->cambiar('Equivocada2026', 'Nueva2026x', null, $tokenAntes);
    comprobar('un intento fallido no cierra las otras sesiones', $r['estado'] === 422 && $otra->pedir('GET', '/panel/recepcionista.php')['estado'] === 200);
    $r = $esta->cambiar(CLAVE_INICIAL, 'Corta1', null, $tokenAntes);
    comprobar('un cambio rechazado no cierra las otras sesiones', $r['estado'] === 422 && $otra->pedir('GET', '/api/auth/me')['estado'] === 200);

    $r = $esta->cambiar(CLAVE_INICIAL, 'Nueva2026x', null, $tokenAntes);
    comprobar('el cambio responde 200', $r['estado'] === 200, $r['cuerpo']);
    comprobar('la sesión actual cambia de identificador', ($esta->cookies['PHPSESSID'] ?? '') !== '' && $esta->cookies['PHPSESSID'] !== $idAntes);
    comprobar('la sesión actual sigue funcionando en pantallas', $esta->pedir('GET', '/panel/recepcionista.php')['estado'] === 200);
    comprobar('la sesión actual sigue funcionando en la API', $esta->pedir('GET', '/api/auth/me')['estado'] === 200);
    $yo = $esta->pedir('GET', '/api/auth/me')['cuerpo'];
    comprobar('/auth/me no expone hash ni huella', strpos($yo, '$2y$') === false && strpos($yo, 'huella') === false && strpos($yo, '"contrasena"') === false);
    $r = $esta->cambiar('Nueva2026x', 'Otra2026xx', null, $tokenAntes);
    comprobar('el token CSRF anterior ya no sirve', $r['estado'] === 403 && $r['codigo'] === 'CSRF_INVALIDO');
    $r = $esta->cambiar('Nueva2026x', 'Otra2026xx');
    comprobar('con el token nuevo se puede volver a cambiar', $r['estado'] === 200, $r['cuerpo']);

    $r = $otra->pedir('GET', '/panel/recepcionista.php');
    comprobar('la otra sesión pierde el acceso a las pantallas', $r['estado'] === 302 && strpos($r['ubicacion'], 'login.php') !== false);
    $u5 = crearUsuario($pdo, 'recepcionista');
    $otraApi = new Cliente($url);
    $estaApi = new Cliente($url);
    $otraApi->iniciarSesion($u5['email'], CLAVE_INICIAL);
    $estaApi->iniciarSesion($u5['email'], CLAVE_INICIAL);
    $estaApi->cambiar(CLAVE_INICIAL, 'Nueva2026x');
    $r = $otraApi->pedir('GET', '/api/turnos?fecha=2026-10-21');
    comprobar('la otra sesión pierde el acceso a la API', $r['estado'] === 401 && strpos($r['cuerpo'], 'SESION_INVALIDA') !== false, (string) $r['estado']);

    // Una sesión sin huella (anterior a este mecanismo) no es válida
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = ['id_usuario' => $u5['id'], 'rol' => 'recepcionista'];
    $r = App::manejar(new Request('GET', '/auth/me'));
    comprobar('una sesión sin huella responde 401', $r->estadoHttp === 401);

    // ── Fallo al guardar: no hay éxito ni cambia nada ───────────────────────
    $u6 = crearUsuario($pdo, 'paciente');
    $hashU6 = hashDe($pdo, $u6['id']);
    $repo = new UsuariosRepository();
    comprobar('un UPDATE con un hash desactualizado no modifica nada', $repo->actualizarContrasena($u6['id'], password_hash('Nueva2026x', PASSWORD_DEFAULT), 'hash-desactualizado') === 0);
    $codigoFallo = 0;
    try {
        (new CuentaService())->cambiarContrasena($u6['id'], 'hash-desactualizado', ['nueva' => 'Nueva2026x', 'confirmacion' => 'Nueva2026x']);
    } catch (ApiException $e) {
        $codigoFallo = $e->respuesta()->estadoHttp;
    }
    comprobar('si el guardado no aplica, el servicio responde 409 sin éxito', $codigoFallo === 409);
    comprobar('si el guardado no aplica, la contraseña sigue igual', hashDe($pdo, $u6['id']) === $hashU6);
    $pdo->prepare("UPDATE usuarios SET estado = 'inactivo' WHERE id_usuario = :id")->execute([':id' => $u6['id']]);
    comprobar('no se guarda la contraseña de un usuario inactivo', $repo->actualizarContrasena($u6['id'], password_hash('Nueva2026x', PASSWORD_DEFAULT), $hashU6) === 0);

    // ── Límite de intentos ──────────────────────────────────────────────────
    $u7 = crearUsuario($pdo, 'paciente');
    $bloq = new Cliente($url);
    $bloq->iniciarSesion($u7['email'], CLAVE_INICIAL);
    for ($i = 1; $i <= 12; $i++) {
        $bloq->cambiar(CLAVE_INICIAL, 'Corta1');            // política: no cuenta
        $bloq->cambiar('', 'Nueva2026x');                   // campo vacío: no cuenta
        $bloq->cambiar(CLAVE_INICIAL, 'Nueva2026x', 'Otra2026xx'); // confirmación: no cuenta
    }
    for ($i = 1; $i <= 5; $i++) {
        $r = $bloq->cambiar('Equivocada2026', 'Nueva2026x');
        comprobar("intento fallido {$i}: responde 422 (las otras validaciones no contaron)", $r['estado'] === 422 && $r['codigo'] === 'CONTRASENA_ACTUAL_INCORRECTA', $r['estado'] . ' ' . $r['codigo']);
    }
    $r = $bloq->cambiar('Equivocada2026', 'Nueva2026x');
    comprobar('el sexto intento queda bloqueado (429)', $r['estado'] === 429 && $r['codigo'] === 'DEMASIADOS_INTENTOS', $r['estado'] . ' ' . $r['codigo']);
    $r = $bloq->cambiar(CLAVE_INICIAL, 'Nueva2026x');
    comprobar('durante el bloqueo tampoco sirve la contraseña correcta', $r['estado'] === 429 && password_verify(CLAVE_INICIAL, hashDe($pdo, $u7['id'])));
    comprobar('el bloqueo no cierra la sesión', $bloq->pedir('GET', '/panel/paciente.php')['estado'] === 200);

    $u8 = crearUsuario($pdo, 'paciente');
    $reinicio = new Cliente($url);
    $reinicio->iniciarSesion($u8['email'], CLAVE_INICIAL);
    for ($i = 1; $i <= 4; $i++) {
        $reinicio->cambiar('Equivocada2026', 'Nueva2026x');
    }
    $r = $reinicio->cambiar(CLAVE_INICIAL, 'Nueva2026x');
    comprobar('tras 4 fallos, un cambio correcto funciona', $r['estado'] === 200, $r['cuerpo']);
    for ($i = 1; $i <= 5; $i++) {
        $r = $reinicio->cambiar('Equivocada2026', 'Otra2026xx');
        comprobar("un cambio exitoso reinicia el contador (fallo {$i})", $r['codigo'] === 'CONTRASENA_ACTUAL_INCORRECTA', $r['codigo']);
    }

    // El vencimiento del bloqueo se simula en el proceso, sin esperar 15 minutos
    $u9 = crearUsuario($pdo, 'paciente');
    $simular = static function (array $extra, string $actual, string $nueva) use ($u9) {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $_SESSION = sesionSimulada($u9['id'], 'paciente', ['csrf_token' => str_repeat('a', 64)] + $extra);

        // @: esta parte corre en consola y ya imprimió salida, así que PHP no puede regenerar el
        // identificador. El cambio de identificador se comprueba por HTTP más arriba.
        return @App::manejar(new Request('POST', '/cuenta/contrasena', [], ['contrasena_actual' => $actual, 'contrasena_nueva' => $nueva, 'contrasena_confirmacion' => $nueva], ['X-CSRF-Token' => str_repeat('a', 64)]));
    };
    $r = $simular(['contrasena_fallos' => 5, 'contrasena_bloqueo_hasta' => time() + 60], CLAVE_INICIAL, 'Nueva2026x');
    comprobar('con el bloqueo vigente responde 429', $r->estadoHttp === 429);
    $r = $simular(['contrasena_fallos' => 5, 'contrasena_bloqueo_hasta' => time() - 1], 'Equivocada2026', 'Nueva2026x');
    comprobar('con el bloqueo vencido se vuelve a evaluar', $r->estadoHttp === 422);
    comprobar('con el bloqueo vencido el contador vuelve a empezar', ($_SESSION['contrasena_fallos'] ?? 0) === 1 && !isset($_SESSION['contrasena_bloqueo_hasta']));
    $r = $simular(['contrasena_fallos' => 5, 'contrasena_bloqueo_hasta' => time() - 1], CLAVE_INICIAL, 'Nueva2026x');
    comprobar('con el bloqueo vencido la contraseña correcta funciona', $r->estadoHttp === 200);
    comprobar('un cambio exitoso borra el contador', !isset($_SESSION['contrasena_fallos'], $_SESSION['contrasena_bloqueo_hasta']));

    // ── Pantalla ────────────────────────────────────────────────────────────
    $u10 = crearUsuario($pdo, 'paciente', '<b>Ana</b>');
    $pant = new Cliente($url);
    $pant->iniciarSesion($u10['email'], CLAVE_INICIAL);
    $html = $pant->pedir('GET', '/panel/mi_cuenta.php')['cuerpo'];
    comprobar('Mi cuenta escapa el nombre', strpos($html, '<b>Ana</b>') === false && strpos($html, '&lt;b&gt;Ana') !== false);
    comprobar('los campos no vienen rellenos ni exponen el hash', !preg_match('/type="password"[^>]*value=/', $html) && strpos($html, '$2y$') === false);
    comprobar('los campos indican contraseña actual y nueva', strpos($html, 'autocomplete="current-password"') !== false && substr_count($html, 'autocomplete="new-password"') === 2);
    comprobar('Mi cuenta vuelve al panel del rol', strpos($html, 'href="../panel/paciente.php"') !== false);
    comprobar('Mi cuenta usa la identidad MEDICONTROL', strpos($html, 'MEDICONTROL') !== false && stripos($html, 'MediCore') === false);
    comprobar('el panel del paciente enlaza a Mi cuenta', strpos($pant->pedir('GET', '/panel/paciente.php')['cuerpo'], 'href="mi_cuenta.php"') !== false);
    comprobar('el bloque del formulario no es accesible por web', in_array($pant->pedir('GET', '/includes/form_contrasena.php')['estado'], [403, 404], true));

    // ── Registro público: sigue con la misma política ───────────────────────
    comprobar('el registro público rechaza una contraseña fuera de la política', isset(MediControl\Services\RegistroPacientesService::validar(['contrasena' => 'Corta1', 'contrasena_confirmacion' => 'Corta1'], turnosHoy())['errores']['contrasena']));
    comprobar('el registro público acepta una contraseña válida', !isset(MediControl\Services\RegistroPacientesService::validar(['contrasena' => 'Valida2026', 'contrasena_confirmacion' => 'Valida2026'], turnosHoy())['errores']['contrasena']));
} catch (Throwable $e) {
    comprobar('la prueba terminó sin excepciones', false, $e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine());
} finally {
    if ((string) $pdo->query('SELECT DATABASE()')->fetchColumn() === $base) {
        borrarUsuariosDePrueba($pdo);
    }
    proc_terminate($servidor);
}

$stmt = $pdo->query("SELECT COUNT(*) FROM usuarios WHERE email LIKE '%" . DOMINIO_PRUEBA . "'");
comprobar('limpieza: no quedan usuarios de prueba', (int) $stmt->fetchColumn() === 0);
comprobar('la base real medicontrol_db no cambió durante la prueba', checksumReal($pdo) === $checksumAntes);

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
