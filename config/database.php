<?php
// ============================================================================
// CONFIGURACIÓN DE CONEXIÓN A BASE DE DATOS - MEDICONTROL
// ============================================================================
// Por defecto está preparado para funcionar directamente con XAMPP / MariaDB:
// Host: 127.0.0.1 / localhost, Usuario: root, Contraseña: '' (vacía)
//
// Para personalizar credenciales en tu equipo sin modificar este archivo,
// podés crear: config/database.local.php (ver config/database.example.php).
// ============================================================================
declare(strict_types=1);

class Database {
    private static string $host = '127.0.0.1';
    private static int    $port = 3306;
    private static string $db   = 'medicontrol_db';
    private static string $user = 'root';
    private static string $pass = ''; // Por defecto XAMPP viene sin contraseña
    private static string $charset = 'utf8mb4';

    private static ?PDO $instance = null;
    private static bool $initialized = false;

    /**
     * Inicializa la configuración cargando database.local.php si existe
     */
    private static function initConfig(): void {
        if (self::$initialized) {
            return;
        }
        self::$initialized = true;

        $localConfigFile = __DIR__ . '/database.local.php';
        if (file_exists($localConfigFile)) {
            $localConfig = require $localConfigFile;
            if (is_array($localConfig)) {
                if (!empty($localConfig['host']))     self::$host     = (string) $localConfig['host'];
                if (!empty($localConfig['port']))     self::$port     = (int) $localConfig['port'];
                if (!empty($localConfig['database'])) self::$db       = (string) $localConfig['database'];
                if (isset($localConfig['user']))      self::$user     = (string) $localConfig['user'];
                if (isset($localConfig['pass']))      self::$pass     = (string) $localConfig['pass'];
                if (!empty($localConfig['charset']))  self::$charset  = (string) $localConfig['charset'];
            }
        }
    }

    /**
     * Obtiene una instancia única (Singleton) de la conexión PDO
     * @return PDO
     * @throws PDOException
     */
    public static function getConnection(): PDO {
        if (self::$instance !== null) {
            return self::$instance;
        }

        self::initConfig();

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . self::$charset . " COLLATE " . self::$charset . "_unicode_ci"
        ];

        // Lista de intentos ordenados (primero la configuración explícita, luego fallbacks comunes)
        $attempts = [];

        // 1. Configuración principal
        $attempts[] = [
            'host' => self::$host,
            'port' => self::$port,
            'pass' => self::$pass
        ];

        // 2. Fallback con 'localhost' si el host era '127.0.0.1' (o viceversa)
        $altHost = (self::$host === '127.0.0.1') ? 'localhost' : '127.0.0.1';
        $attempts[] = [
            'host' => $altHost,
            'port' => self::$port,
            'pass' => self::$pass
        ];

        // 3. Si la contraseña falló y era '', intentar '1234' o viceversa para mayor portabilidad en entornos locales
        $altPass = (self::$pass === '') ? '1234' : '';
        $attempts[] = [
            'host' => self::$host,
            'port' => self::$port,
            'pass' => $altPass
        ];
        $attempts[] = [
            'host' => $altHost,
            'port' => self::$port,
            'pass' => $altPass
        ];

        $lastException = null;
        foreach ($attempts as $cfg) {
            $dsn = sprintf(
                "mysql:host=%s;port=%d;dbname=%s;charset=%s",
                $cfg['host'],
                $cfg['port'],
                self::$db,
                self::$charset
            );

            try {
                self::$instance = new PDO($dsn, self::$user, $cfg['pass'], $options);
                return self::$instance;
            } catch (PDOException $e) {
                $lastException = $e;
            }
        }

        throw new PDOException(
            "Error de conexión a la base de datos '" . self::$db . "': " . ($lastException ? $lastException->getMessage() : 'Verifique sus credenciales en config/database.php o config/database.local.php'),
            $lastException ? (int)$lastException->getCode() : 0
        );
    }

    /**
     * Retorna los parámetros de configuración (sin exponer contraseñas)
     */
    public static function getConfigInfo(): array {
        self::initConfig();
        return [
            'host'     => self::$host,
            'port'     => self::$port,
            'database' => self::$db,
            'user'     => self::$user,
            'charset'  => self::$charset
        ];
    }
}
