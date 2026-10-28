<?php
// ============================================================================
// MEDICONTROL - PRUEBAS DE INICIO DE SESIÓN, SESIONES, PERMISOS Y REGISTRO
// Uso: MEDICONTROL_DB=medicontrol_test php tests/acceso_registro_test.php
//
// Levanta un servidor PHP propio (php -S, puerto 8098) apuntado a la base de
// pruebas y hace pedidos HTTP reales con cookies. SOLO se ejecuta contra una base
// "medicontrol_test". Borra al final los usuarios que crea y verifica que la base
// real (medicontrol_db) no cambie.
// ============================================================================
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../src/bootstrap.php';
ini_set('display_errors', '1');

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

    /** @return array{estado: int, ubicacion: string, cuerpo: string, setCookie: array<int, string>} */
    public function pedir(string $metodo, string $ruta, array $form = [], array $cabeceras = [], ?string $json = null): array
    {
        $ch = curl_init($this->base . $ruta);
        $setCookie = [];
        $lineas = [];
        foreach ($this->cookies as $nombre => $valor) {
            $lineas[] = $nombre . '=' . $valor;
        }
        $hdr = $cabeceras;
        if ($lineas !== []) {
            $hdr[] = 'Cookie: ' . implode('; ', $lineas);
        }
        $opciones = [
            CURLOPT_CUSTOMREQUEST  => $metodo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => $hdr,
            CURLOPT_HEADERFUNCTION => function ($ch, string $linea) use (&$setCookie) {
                if (stripos($linea, 'Set-Cookie:') === 0) {
                    $setCookie[] = trim(substr($linea, 11));
                }

                return strlen($linea);
            },
        ];
        if ($json !== null) {
            $opciones[CURLOPT_POSTFIELDS] = $json;
            $opciones[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
        } elseif ($form !== []) {
            $opciones[CURLOPT_POSTFIELDS] = http_build_query($form);
        }
        curl_setopt_array($ch, $opciones);
        $cuerpo = (string) curl_exec($ch);
        $estado = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $ubicacion = (string) (curl_getinfo($ch, CURLINFO_REDIRECT_URL) ?: '');
        curl_close($ch);

        foreach ($setCookie as $cookie) {
            [$par] = explode(';', $cookie, 2);
            [$nombre, $valor] = array_map('trim', explode('=', $par, 2) + [1 => '']);
            if ($valor === '' || $valor === 'deleted' || stripos($cookie, 'expires=Thu, 01 Jan 1970') !== false || preg_match('/expires=[^;]*19[0-9]{2}/i', $cookie)) {
                unset($this->cookies[$nombre]);
            } else {
                $this->cookies[$nombre] = $valor;
            }
        }

        return ['estado' => $estado, 'ubicacion' => $ubicacion, 'cuerpo' => $cuerpo, 'setCookie' => $setCookie];
    }

    public function tokenDe(string $html): string
    {
        return preg_match('/name="csrf_token" value="([0-9a-f]{64})"/', $html, $m) ? $m[1] : '';
    }

    public function iniciarSesion(string $email, string $contrasena): array
    {
        $token = $this->tokenDe($this->pedir('GET', '/login.php')['cuerpo']);

        return $this->pedir('POST', '/login.php', ['csrf_token' => $token, 'email' => $email, 'contrasena' => $contrasena]);
    }
}

function terminaEn(string $url, string $sufijo): bool
{
    return $url !== '' && substr((string) parse_url($url, PHP_URL_PATH), -strlen($sufijo)) === $sufijo;
}

function checksumReal(PDO $pdo): string
{
    return json_encode($pdo->query('CHECKSUM TABLE medicontrol_db.usuarios, medicontrol_db.pacientes, medicontrol_db.medicos, medicontrol_db.turnos')->fetchAll(PDO::FETCH_NUM));
}

// ── Servidor de pruebas ──────────────────────────────────────────────────────
$puerto = 8098;
$raiz = dirname(__DIR__);
$entorno = array_merge(getenv(), ['MEDICONTROL_DB' => $base]);
$servidor = proc_open(
    [PHP_BINARY, '-S', "127.0.0.1:{$puerto}", '-t', $raiz, $raiz . '/tests/helpers/router_pruebas.php'],
    [0 => ['pipe', 'r'], 1 => ['file', sys_get_temp_dir() . '/medicontrol_pruebas_servidor.log', 'a'], 2 => ['file', sys_get_temp_dir() . '/medicontrol_pruebas_servidor.log', 'a']],
    $tuberias,
    $raiz,
    $entorno
);
$url = "http://127.0.0.1:{$puerto}";
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
$dominioPrueba = '@registro-prueba.test';
$medicoDesactivado = null;
$pdo->exec("DELETE FROM usuarios WHERE email LIKE '%{$dominioPrueba}'"); // restos de una ejecución anterior interrumpida

try {
    // ── Punto de entrada y login ────────────────────────────────────────────
    $anonimo = new Cliente($url);
    $r = $anonimo->pedir('GET', '/');
    comprobar('sin sesión, la raíz lleva al login', $r['estado'] === 302 && terminaEn($r['ubicacion'], '/login.php'), $r['estado'] . ' ' . $r['ubicacion']);
    $r = $anonimo->pedir('GET', '/login.php');
    comprobar('el login responde 200 con token CSRF', $r['estado'] === 200 && $anonimo->tokenDe($r['cuerpo']) !== '');
    $cookie = implode(' ', (new Cliente($url))->pedir('GET', '/login.php')['setCookie']);
    comprobar('la cookie de sesión es HttpOnly y SameSite=Lax', stripos($cookie, 'HttpOnly') !== false && stripos($cookie, 'SameSite=Lax') !== false, $cookie);
    comprobar('el login ya no enlaza al menú de maquetas', strpos($r['cuerpo'], 'index.html') === false);
    comprobar('el login enlaza al registro real', strpos($r['cuerpo'], 'href="register.php"') !== false);
    foreach (['/panel/recepcionista.php', '/panel/medico.php', '/panel/paciente.php', '/panel/recepcionista_semana.php'] as $panel) {
        $r = $anonimo->pedir('GET', $panel);
        comprobar("sin sesión, {$panel} lleva al login", $r['estado'] === 302 && terminaEn($r['ubicacion'], '/login.php'));
    }
    $r = $anonimo->pedir('GET', '/api/turnos', [], [], null);
    comprobar('sin sesión, la API responde 401', $r['estado'] === 401);

    // Errores de autenticación genéricos
    $c = new Cliente($url);
    $r = $c->iniciarSesion('operador@medicore.com', 'contraseña-incorrecta');
    $mensajeClaveMala = preg_match('/role="alert">\s*([^<]+)/', $r['cuerpo'], $m) ? trim($m[1]) : '';
    $r = $c->iniciarSesion('no-existe' . $dominioPrueba, 'cualquiera1');
    $mensajeNoExiste = preg_match('/role="alert">\s*([^<]+)/', $r['cuerpo'], $m) ? trim($m[1]) : '';
    comprobar('contraseña incorrecta y email inexistente dan el mismo mensaje', $mensajeClaveMala !== '' && $mensajeClaveMala === $mensajeNoExiste, "{$mensajeClaveMala} / {$mensajeNoExiste}");
    $r = $c->pedir('POST', '/login.php', ['email' => 'operador@medicore.com', 'contrasena' => '123456']);
    comprobar('un login sin token CSRF no inicia sesión', $r['estado'] === 200 && strpos($r['cuerpo'], 'role="alert"') !== false);
    $r = $c->pedir('GET', '/panel/recepcionista.php');
    comprobar('después del login rechazado sigue sin sesión', $r['estado'] === 302);

    // Fijación de sesión: un identificador inventado no se acepta
    $atacante = new Cliente($url);
    $atacante->cookies['PHPSESSID'] = 'identificadorinventado1234567890';
    $r = $atacante->pedir('GET', '/login.php');
    comprobar('un identificador de sesión inventado se reemplaza (modo estricto)', ($atacante->cookies['PHPSESSID'] ?? '') !== 'identificadorinventado1234567890');

    // ── Login por rol y redirección ─────────────────────────────────────────
    $cuentas = [
        'recepcionista' => ['operador@medicore.com', '/panel/recepcionista.php'],
        'medico'        => ['a.rossi@medicore.com', '/panel/medico.php'],
        'paciente'      => ['m.fernandez@mail.com', '/panel/paciente.php'],
    ];
    $sesiones = [];
    foreach ($cuentas as $rol => [$email, $panel]) {
        $cli = new Cliente($url);
        $antes = $cli->pedir('GET', '/login.php');
        $idAntes = $cli->cookies['PHPSESSID'] ?? '';
        $r = $cli->pedir('POST', '/login.php', ['csrf_token' => $cli->tokenDe($antes['cuerpo']), 'email' => $email, 'contrasena' => '123456']);
        comprobar("login de {$rol} redirige a {$panel}", $r['estado'] === 302 && terminaEn($r['ubicacion'], $panel), $r['estado'] . ' ' . $r['ubicacion']);
        comprobar("login de {$rol}: el identificador de sesión cambia", ($cli->cookies['PHPSESSID'] ?? '') !== '' && ($cli->cookies['PHPSESSID'] ?? '') !== $idAntes);
        $r = $cli->pedir('GET', $panel);
        comprobar("{$rol} ve su panel", $r['estado'] === 200);
        $r = $cli->pedir('GET', '/login.php');
        comprobar("{$rol} con sesión que entra al login va a su panel", $r['estado'] === 302 && terminaEn($r['ubicacion'], $panel));
        $r = $cli->pedir('GET', '/');
        comprobar("{$rol} con sesión que entra a la raíz va a su panel", $r['estado'] === 302 && terminaEn($r['ubicacion'], $panel));
        $r = $cli->pedir('GET', '/register.php');
        comprobar("{$rol} con sesión que entra al registro va a su panel", $r['estado'] === 302 && terminaEn($r['ubicacion'], $panel));
        $sesiones[$rol] = $cli;
    }

    // ── Acceso cruzado entre roles (pantallas y API) ────────────────────────
    $panelesProhibidos = [
        'recepcionista' => ['/panel/medico.php', '/panel/paciente.php'],
        'medico'        => ['/panel/recepcionista.php', '/panel/recepcionista_semana.php', '/panel/recepcionista_mes.php', '/panel/recepcionista_turno_nuevo.php', '/panel/paciente.php'],
        'paciente'      => ['/panel/recepcionista.php', '/panel/recepcionista_turno_nuevo.php', '/panel/medico.php'],
    ];
    foreach ($panelesProhibidos as $rol => $rutas) {
        foreach ($rutas as $ruta) {
            $r = $sesiones[$rol]->pedir('GET', $ruta);
            comprobar("{$rol} no puede abrir {$ruta}", $r['estado'] === 403 && strpos($r['cuerpo'], 'Acceso denegado') !== false && strpos($r['cuerpo'], 'Ir a mi panel') !== false, (string) $r['estado']);
        }
    }
    foreach (['medico', 'paciente'] as $rol) {
        foreach (['/api/turnos?fecha=2026-10-21', '/api/turnos/resumen?mes=2026-10', '/api/medicos', '/api/pacientes'] as $ruta) {
            $r = $sesiones[$rol]->pedir('GET', $ruta);
            comprobar("{$rol}: GET {$ruta} responde 403", $r['estado'] === 403);
        }
        $r = $sesiones[$rol]->pedir('POST', '/api/turnos', [], [], '{}');
        comprobar("{$rol}: POST /api/turnos responde 403", $r['estado'] === 403);
    }
    $r = $sesiones['recepcionista']->pedir('GET', '/api/turnos?fecha=2026-10-21');
    comprobar('recepción: GET /api/turnos responde 200', $r['estado'] === 200);
    $r = $sesiones['recepcionista']->pedir('POST', '/api/turnos', [], [], '{}');
    comprobar('recepción: POST /api/turnos sin token CSRF responde 403', $r['estado'] === 403 && strpos($r['cuerpo'], 'CSRF_INVALIDO') !== false);

    // ── Usuario desactivado mientras tiene la sesión abierta ────────────────
    $medicoDesactivado = (int) $pdo->query("SELECT id_usuario FROM usuarios WHERE email = 'a.rossi@medicore.com'")->fetchColumn();
    $pdo->prepare("UPDATE usuarios SET estado = 'inactivo' WHERE id_usuario = :id")->execute([':id' => $medicoDesactivado]);
    $r = $sesiones['medico']->pedir('GET', '/panel/medico.php');
    comprobar('un usuario desactivado pierde el acceso con la sesión abierta', $r['estado'] === 302 && terminaEn($r['ubicacion'], '/login.php'));
    $r = (new Cliente($url))->iniciarSesion('a.rossi@medicore.com', '123456');
    comprobar('un usuario desactivado no puede iniciar sesión', $r['estado'] === 200 && strpos($r['cuerpo'], 'role="alert"') !== false);
    $pdo->prepare("UPDATE usuarios SET estado = 'activo' WHERE id_usuario = :id")->execute([':id' => $medicoDesactivado]);
    $medicoDesactivado = null;

    // ── Cierre de sesión ────────────────────────────────────────────────────
    $cookieVieja = $sesiones['recepcionista']->cookies['PHPSESSID'] ?? '';
    $r = $sesiones['recepcionista']->pedir('GET', '/logout.php');
    comprobar('logout redirige al login', $r['estado'] === 302 && terminaEn($r['ubicacion'], '/login.php'));
    comprobar('logout borra la cookie de sesión', !isset($sesiones['recepcionista']->cookies['PHPSESSID']));
    $reuso = new Cliente($url);
    $reuso->cookies['PHPSESSID'] = $cookieVieja;
    $r = $reuso->pedir('GET', '/panel/recepcionista.php');
    comprobar('la sesión cerrada ya no da acceso aunque se reutilice la cookie', $r['estado'] === 302 && terminaEn($r['ubicacion'], '/login.php'));
    $r = $reuso->pedir('GET', '/api/turnos?fecha=2026-10-21');
    comprobar('la sesión cerrada ya no da acceso a la API', $r['estado'] === 401);

    // ── Registro de pacientes ───────────────────────────────────────────────
    $reg = new Cliente($url);
    $r = $reg->pedir('GET', '/register.php');
    comprobar('el registro responde 200 con token CSRF', $r['estado'] === 200 && $reg->tokenDe($r['cuerpo']) !== '');
    $valido = [
        'nombre' => 'Ana María', 'apellido' => "D'Alessandro", 'dni' => '40.111.222', 'email' => 'Ana.Prueba' . $dominioPrueba,
        'telefono' => '+54 342 456-7890', 'direccion' => 'San Martín 1234, Santa Fe', 'fecha_nacimiento' => '1990-05-20',
        'genero' => 'Femenino', 'obra_social' => 'IAPOS', 'contrasena' => 'Segura2026', 'contrasena_confirmacion' => 'Segura2026',
    ];
    $enviarRegistro = static function (Cliente $cli, array $datos, ?string $token = null): array {
        $token = $token ?? $cli->tokenDe($cli->pedir('GET', '/register.php')['cuerpo']);

        return $cli->pedir('POST', '/register.php', array_merge(['csrf_token' => $token], $datos));
    };
    $contarUsuarios = static fn (): int => (int) $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();

    // Validaciones
    $usuariosAntes = $contarUsuarios();
    $r = $enviarRegistro($reg, []);
    foreach (['nombre', 'apellido', 'dni', 'email', 'contrasena'] as $campo) {
        comprobar("registro vacío: marca el campo obligatorio {$campo}", strpos($r['cuerpo'], 'id="error-' . $campo . '"') !== false);
    }
    $invalidos = [
        'email inválido'                => ['email' => 'no-es-un-correo', 'campo' => 'email'],
        'DNI con letras'                => ['dni' => '12AB3456', 'campo' => 'dni'],
        'DNI demasiado corto'           => ['dni' => '12345', 'campo' => 'dni'],
        'contraseña corta'              => ['contrasena' => 'abc1', 'contrasena_confirmacion' => 'abc1', 'campo' => 'contrasena'],
        'contraseña sin números'        => ['contrasena' => 'soloLetras', 'contrasena_confirmacion' => 'soloLetras', 'campo' => 'contrasena'],
        'contraseñas distintas'         => ['contrasena_confirmacion' => 'Otra2026xx', 'campo' => 'contrasena_confirmacion'],
        'nombre con números'            => ['nombre' => 'Ana99', 'campo' => 'nombre'],
        'fecha de nacimiento futura'    => ['fecha_nacimiento' => '2999-01-01', 'campo' => 'fecha_nacimiento'],
        'fecha de nacimiento inválida'  => ['fecha_nacimiento' => '1990-02-30', 'campo' => 'fecha_nacimiento'],
        'género fuera de la lista'      => ['genero' => 'Administrador', 'campo' => 'genero'],
        'teléfono con letras'           => ['telefono' => 'llamar luego', 'campo' => 'telefono'],
    ];
    foreach ($invalidos as $nombre => $cambio) {
        $campo = $cambio['campo'];
        unset($cambio['campo']);
        $r = $enviarRegistro($reg, array_merge($valido, $cambio));
        comprobar("registro con {$nombre}: se rechaza marcando {$campo}", $r['estado'] === 200 && strpos($r['cuerpo'], 'id="error-' . $campo . '"') !== false);
    }
    $r = $reg->pedir('POST', '/register.php', $valido);
    comprobar('registro sin token CSRF se rechaza', $r['estado'] === 200 && strpos($r['cuerpo'], 'role="alert"') !== false);
    comprobar('ningún envío inválido creó usuarios', $contarUsuarios() === $usuariosAntes);

    // Registro válido, con intento de elegir un rol privilegiado
    $token = $reg->tokenDe($reg->pedir('GET', '/register.php')['cuerpo']);
    $r = $reg->pedir('POST', '/register.php', array_merge(['csrf_token' => $token, 'rol' => 'recepcionista', 'estado' => 'activo', 'id_usuario' => '1'], $valido));
    comprobar('registro válido redirige al login con aviso', $r['estado'] === 302 && strpos($r['ubicacion'], 'login.php?registrado=1') !== false, $r['estado'] . ' ' . $r['ubicacion']);
    $fila = $pdo->query("SELECT u.id_usuario, u.nombre, u.apellido, u.dni, u.email, u.contrasena, u.rol, u.estado, p.telefono, p.direccion, p.fecha_nacimiento, p.genero, p.obra_social
                         FROM usuarios u JOIN pacientes p ON p.id_usuario = u.id_usuario WHERE u.email = 'ana.prueba{$dominioPrueba}'")->fetch();
    comprobar('el registro creó el usuario y su perfil de paciente', $fila !== false);
    if ($fila) {
        comprobar('el rol es paciente aunque se envió rol=recepcionista', $fila['rol'] === 'paciente' && $fila['estado'] === 'activo');
        comprobar('no se usó el id_usuario enviado', (int) $fila['id_usuario'] !== 1);
        comprobar('los datos se normalizaron (DNI sin puntos, email en minúsculas)', $fila['dni'] === '40111222' && $fila['email'] === 'ana.prueba' . $dominioPrueba);
        comprobar('los datos opcionales se guardaron', $fila['telefono'] === '+54 342 456-7890' && $fila['fecha_nacimiento'] === '1990-05-20' && $fila['genero'] === 'Femenino' && $fila['obra_social'] === 'IAPOS');
        comprobar('la contraseña no se guardó en texto plano', strpos($fila['contrasena'], 'Segura2026') === false);
        comprobar('la contraseña se guardó con bcrypt y se verifica', strncmp($fila['contrasena'], '$2y$', 4) === 0 && password_verify('Segura2026', $fila['contrasena']));
    }
    $r = $reg->pedir('GET', '/login.php?registrado=1');
    comprobar('el login muestra el aviso de cuenta creada', strpos($r['cuerpo'], 'Tu cuenta se creó correctamente') !== false);

    // Reenvío del mismo formulario (mismo token) y duplicados
    $usuariosAntes = $contarUsuarios();
    $r = $reg->pedir('POST', '/register.php', array_merge(['csrf_token' => $token], $valido));
    comprobar('reenviar el mismo formulario se rechaza (token ya usado)', $r['estado'] === 200 && strpos($r['cuerpo'], 'ya fue enviado') !== false);
    $r = $enviarRegistro($reg, array_merge($valido, ['dni' => '40999888']));
    comprobar('correo duplicado: mensaje genérico', $r['estado'] === 200 && strpos($r['cuerpo'], 'No se pudo crear la cuenta con esos datos') !== false);
    $r = $enviarRegistro($reg, array_merge($valido, ['email' => 'otro' . $dominioPrueba]));
    comprobar('DNI duplicado: el mismo mensaje genérico', $r['estado'] === 200 && strpos($r['cuerpo'], 'No se pudo crear la cuenta con esos datos') !== false);
    $r = $enviarRegistro($reg, array_merge($valido, ['email' => 'ANA.PRUEBA' . strtoupper($dominioPrueba), 'dni' => '40999777']));
    comprobar('correo duplicado con otras mayúsculas también se rechaza', strpos($r['cuerpo'], 'No se pudo crear la cuenta con esos datos') !== false);
    comprobar('reenvíos y duplicados no crearon usuarios', $contarUsuarios() === $usuariosAntes);
    comprobar('el mensaje de duplicado no revela el dato existente', strpos($r['cuerpo'], 'ya está registrado') === false);

    // El paciente registrado inicia sesión y ve solo lo suyo
    $nuevo = new Cliente($url);
    $r = $nuevo->iniciarSesion('ana.prueba' . $dominioPrueba, 'Segura2026');
    comprobar('el paciente registrado inicia sesión y va a su panel', $r['estado'] === 302 && terminaEn($r['ubicacion'], '/panel/paciente.php'), $r['estado'] . ' ' . $r['ubicacion']);
    $r = $nuevo->pedir('GET', '/panel/paciente.php');
    comprobar('el panel del paciente muestra su nombre', $r['estado'] === 200 && strpos($r['cuerpo'], 'Ana María') !== false);
    comprobar('el panel del paciente ya no empieza con texto suelto', strncmp(ltrim($r['cuerpo']), '<!DOCTYPE', 9) === 0 || stripos(substr(ltrim($r['cuerpo']), 0, 20), '<!doctype') === 0);
    $r = $nuevo->pedir('GET', '/panel/recepcionista.php');
    comprobar('el paciente registrado no accede a recepción', $r['estado'] === 403);
    $r = $nuevo->pedir('GET', '/api/turnos?fecha=2026-10-21');
    comprobar('el paciente registrado no accede a la API de recepción', $r['estado'] === 403);
    $r = (new Cliente($url))->iniciarSesion('ana.prueba' . $dominioPrueba, 'otraClave99');
    comprobar('con una contraseña incorrecta no entra', $r['estado'] === 200);

    // ── Panel del médico: los textos del turno no pueden romper el JavaScript ─
    $idMedicoRossi = (int) $pdo->query("SELECT m.id_medico FROM medicos m JOIN usuarios u ON u.id_usuario = m.id_usuario WHERE u.email = 'a.rossi@medicore.com'")->fetchColumn();
    $fechaXss = turnosHoy()->modify('+300 days')->format('Y-m-d');
    $motivoMalicioso = "Dolor');window.__xss=1;//";
    $notaMultilinea = "Primera línea\nSegunda \"línea\" con <b>etiqueta</b> y 'comillas'";
    $pdo->prepare("INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta, notas_medicas) VALUES (1, :m, :f, '08:00:00', 'pendiente', :motivo, :nota)")
        ->execute([':m' => $idMedicoRossi, ':f' => $fechaXss, ':motivo' => $motivoMalicioso, ':nota' => $notaMultilinea]);
    $idTurnoXss = (int) $pdo->lastInsertId();
    $medicoCli = new Cliente($url);
    $medicoCli->iniciarSesion('a.rossi@medicore.com', '123456');
    $html = $medicoCli->pedir('GET', '/panel/medico.php?fecha=' . $fechaXss)['cuerpo'];
    $args = preg_match('/onclick="abrirModal\(\.\.\.([^"]*)\)"/', $html, $m) ? json_decode(html_entity_decode($m[1], ENT_QUOTES, 'UTF-8'), true) : null;
    comprobar('médico: el botón de notas recibe los datos como JSON válido', is_array($args) && ($args[0] ?? null) === $idTurnoXss, $m[1] ?? 'sin onclick');
    comprobar('médico: un motivo con comillas no rompe el atributo', is_array($args) && ($args[2] ?? null) === $motivoMalicioso);
    comprobar('médico: una nota con saltos de línea llega completa al modal', is_array($args) && ($args[3] ?? null) === $notaMultilinea);
    comprobar('médico: el texto «window.__xss» no queda como código suelto en el atributo', strpos($html, "');window.__xss") === false);
    $pdo->prepare('DELETE FROM turnos WHERE id_turno = :id')->execute([':id' => $idTurnoXss]);

    // ── Archivos internos bloqueados en el servidor de pruebas ──────────────
    foreach (['/tests/acceso_registro_test.php', '/src/bootstrap.php', '/config/database.php', '/database/medicontrol.sql', '/instalar.php', '/README.md'] as $ruta) {
        $r = $anonimo->pedir('GET', $ruta);
        comprobar("{$ruta} no es accesible", in_array($r['estado'], [403, 404], true), (string) $r['estado']);
    }
} catch (Throwable $e) {
    comprobar('la prueba terminó sin excepciones', false, $e->getMessage() . ' en ' . basename($e->getFile()) . ':' . $e->getLine());
} finally {
    if ((string) $pdo->query('SELECT DATABASE()')->fetchColumn() === $base) {
        if ($medicoDesactivado !== null) {
            $pdo->prepare("UPDATE usuarios SET estado = 'activo' WHERE id_usuario = :id")->execute([':id' => $medicoDesactivado]);
        }
        $pdo->exec("DELETE FROM usuarios WHERE email LIKE '%{$dominioPrueba}'"); // borra también el perfil (ON DELETE CASCADE)
    }
    proc_terminate($servidor);
}

comprobar('limpieza: no quedan usuarios de prueba', (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE email LIKE '%{$dominioPrueba}'")->fetchColumn() === 0);
comprobar('limpieza: no quedan perfiles huérfanos', (int) $pdo->query('SELECT COUNT(*) FROM pacientes p LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario WHERE u.id_usuario IS NULL')->fetchColumn() === 0);
comprobar('la base real medicontrol_db no cambió durante la prueba', checksumReal($pdo) === $checksumAntes);

echo $fallas === 0 ? "OK: {$total} comprobaciones\n" : "{$fallas} de {$total} comprobaciones fallaron\n";
exit($fallas === 0 ? 0 : 1);
