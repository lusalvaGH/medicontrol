<?php
// ============================================================================
// CONFIGURACIÓN DE CONEXIÓN A BASE DE DATOS - MEDICONTROL
// ============================================================================
declare(strict_types=1);

class Database {
    private static string $host = '127.0.0.1'; // 'localhost'
    private static int    $port = 3306;
    private static string $db   = 'medicontrol_db';
    private static string $user = 'root';
    private static string $pass = '1234';
    private static string $charset = 'utf8mb4';

    private static ?PDO $instance = null;

    /**
     * Obtiene una instancia única (Singleton) de la conexión PDO
     * @return PDO
     * @throws PDOException
     */
    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $dsn = sprintf(
                "mysql:host=%s;port=%d;dbname=%s;charset=%s",
                self::$host,
                self::$port,
                self::$db,
                self::$charset
            );

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$instance = new PDO($dsn, self::$user, self::$pass, $options);
            } catch (PDOException $e) {
                // Reintentar con 'localhost' si 127.0.0.1 difiere por socket
                try {
                    $dsnFallback = sprintf(
                        "mysql:host=localhost;port=%d;dbname=%s;charset=%s",
                        self::$port,
                        self::$db,
                        self::$charset
                    );
                    self::$instance = new PDO($dsnFallback, self::$user, self::$pass, $options);
                } catch (PDOException $ex) {
                    throw new PDOException("Error de conexión a la base de datos: " . $e->getMessage(), (int)$e->getCode());
                }
            }
        }

        return self::$instance;
    }

    /**
     * Retorna los parámetros de configuración (sin exponer contraseñas en logs)
     */
    public static function getConfigInfo(): array {
        return [
            'host'     => self::$host,
            'port'     => self::$port,
            'database' => self::$db,
            'user'     => self::$user,
            'charset'  => self::$charset
        ];
    }
}
