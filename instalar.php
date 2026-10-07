<?php
/**
 * MediControl - Instalador Automático de Base de Datos
 *
 * Permite inicializar o restaurar la base de datos medicontrol_db
 * en cualquier instalación de XAMPP / MariaDB / MySQL con un solo clic.
 *
 * Acceso web: http://localhost/medicontrol/instalar.php
 * Acceso CLI: php instalar.php
 */

declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');

$isCli = (php_sapi_name() === 'cli');
$sqlFile = __DIR__ . '/database/medicontrol.sql';

$status = null;
$error = null;
$details = [];

if ($isCli || (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST')) {
    if (!file_exists($sqlFile)) {
        $error = "No se encontró el archivo SQL en: " . $sqlFile;
    } else {
        // Cargar configuración de base de datos
        require_once __DIR__ . '/config/database.php';
        $cfg = Database::getConfigInfo();

        // Conectar inicialmente al servidor MySQL (sin seleccionar BD) para crearla si no existe
        $host = $cfg['host'];
        $port = $cfg['port'];
        $user = $cfg['user'];
        $passAttempts = ['', '1234', 'root'];
        
        // Si hay archivo local o config personalizada, probar esa primero
        if (file_exists(__DIR__ . '/config/database.local.php')) {
            $local = require __DIR__ . '/config/database.local.php';
            if (isset($local['pass'])) {
                array_unshift($passAttempts, (string)$local['pass']);
            }
        }

        $pdoServer = null;
        $connectedPass = '';
        foreach ($passAttempts as $testPass) {
            foreach ([$host, ($host === '127.0.0.1' ? 'localhost' : '127.0.0.1')] as $testHost) {
                try {
                    $dsn = "mysql:host={$testHost};port={$port};charset=utf8mb4";
                    $pdoServer = new PDO($dsn, $user, $testPass, [
                        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                    ]);
                    $connectedPass = $testPass;
                    break 2;
                } catch (PDOException $e) {
                    // Seguir probando credenciales
                }
            }
        }

        if ($pdoServer === null) {
            $error = "No se pudo conectar al servidor MySQL en {$host}:{$port} con el usuario '{$user}'. Asegurate de que el servicio MySQL esté iniciado en el panel de XAMPP.";
        } else {
            try {
                $sqlContent = file_get_contents($sqlFile);
                if ($sqlContent === false) {
                    throw new RuntimeException("No se pudo leer el archivo SQL.");
                }

                // Ejecutar el script SQL completo
                $pdoServer->exec($sqlContent);

                // Verificar que las tablas y datos se hayan creado correctamente
                $pdoApp = Database::getConnection();
                $tables = $pdoApp->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
                $usersCount = $pdoApp->query("SELECT COUNT(*) FROM usuarios")->fetchColumn();
                $turnosCount = $pdoApp->query("SELECT COUNT(*) FROM turnos")->fetchColumn();
                $medicosCount = $pdoApp->query("SELECT COUNT(*) FROM medicos")->fetchColumn();
                $pacientesCount = $pdoApp->query("SELECT COUNT(*) FROM pacientes")->fetchColumn();

                $details = [
                    'Base de datos' => 'medicontrol_db',
                    'Tablas creadas' => count($tables),
                    'Usuarios iniciales' => (int) $usersCount,
                    'Médicos' => (int) $medicosCount,
                    'Pacientes' => (int) $pacientesCount,
                    'Turnos de prueba' => (int) $turnosCount,
                ];

                $status = 'success';
            } catch (Exception $e) {
                $error = "Error al ejecutar el script SQL: " . $e->getMessage();
            }
        }
    }

    if ($isCli) {
        if ($status === 'success') {
            echo "========================================================\n";
            echo " [OK] Base de datos 'medicontrol_db' instalada con éxito\n";
            echo "========================================================\n";
            foreach ($details as $k => $v) {
                echo " - {$k}: {$v}\n";
            }
            echo "\nAcceso al sistema: http://localhost/medicontrol/login.php\n";
        } else {
            echo "[ERROR] {$error}\n";
        }
        exit(0);
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediControl - Instalador Automático de Base de Datos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #004797;
      --primary-hover: #003673;
      --primary-light: #e0f2fe;
      --bg-main: #f0f4f9;
      --bg-card: #ffffff;
      --bg-subtle: #f8fafc;
      --text-dark: #0f172a;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --radius-md: 8px;
      --radius-lg: 12px;
      --shadow-lg: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      background-color: var(--bg-main);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 2.25rem 2rem;
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--border-color);
      width: 100%;
      max-width: 560px;
    }
    .header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .icon {
      width: 48px;
      height: 48px;
      background: var(--primary);
      color: white;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      margin-bottom: 0.75rem;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--text-dark);
    }
    .subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .alert {
      padding: 1rem 1.25rem;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
      font-weight: 600;
    }
    .alert-success {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .alert-error {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5rem;
      font-size: 0.85rem;
    }
    .details-table td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--border-color);
    }
    .details-table td:first-child {
      color: var(--text-muted);
      font-weight: 600;
    }
    .details-table td:last-child {
      text-align: right;
      font-weight: 700;
      color: var(--text-dark);
    }
    .credentials-box {
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.82rem;
    }
    .credentials-box h3 {
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
      color: var(--primary);
      margin-bottom: 0.5rem;
      letter-spacing: 0.5px;
    }
    .btn {
      width: 100%;
      padding: 0.85rem;
      border: none;
      border-radius: var(--radius-md);
      background: var(--primary);
      color: white;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      display: inline-block;
      transition: background 0.2s;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: #f1f5f9;
      color: var(--text-dark);
      border: 1px solid var(--border-color);
      margin-top: 0.75rem;
    }
    .btn-secondary:hover {
      background: #e2e8f0;
    }
  </style>
</head>
<body>

<div class="card">
  <div class="header">
    <div class="icon">🏥</div>
    <h1>Instalación de Base de Datos</h1>
    <p class="subtitle">MediControl - Sistema Hospitalario</p>
  </div>

  <?php if ($status === 'success'): ?>
    <div class="alert alert-success">
      ✓ Base de datos <strong>medicontrol_db</strong> instalada e inicializada correctamente.
    </div>

    <table class="details-table">
      <?php foreach ($details as $key => $val): ?>
        <tr>
          <td><?= htmlspecialchars($key, ENT_QUOTES, 'UTF-8') ?></td>
          <td><?= htmlspecialchars((string)$val, ENT_QUOTES, 'UTF-8') ?></td>
        </tr>
      <?php endforeach; ?>
    </table>

    <div class="credentials-box">
      <h3>🔑 Cuentas de Prueba Disponibles</h3>
      <p style="margin-bottom:0.35rem;"><strong>Contraseña para todas:</strong> <code>123456</code></p>
      <ul style="padding-left: 1.25rem; line-height: 1.6;">
        <li><strong>Recepción:</strong> <code>operador@medicore.com</code></li>
        <li><strong>Médico:</strong> <code>a.rossi@medicore.com</code></li>
        <li><strong>Paciente:</strong> <code>m.fernandez@mail.com</code></li>
      </ul>
    </div>

    <a href="login.php" class="btn">Ir al Inicio de Sesión →</a>
    <a href="test_conexion.php" class="btn btn-secondary">Comprobar Conexión (Test)</a>

  <?php else: ?>
    <?php if ($error !== null): ?>
      <div class="alert alert-error">
        ✗ <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
      </div>
    <?php endif; ?>

    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.5rem; line-height:1.5;">
      Este asistente creará la base de datos <strong>medicontrol_db</strong>, todas sus tablas, vistas de seguridad RBAC y cargará los datos de prueba iniciales desde <code>database/medicontrol.sql</code>.
    </p>

    <form method="POST">
      <button type="submit" class="btn">🚀 Instalar / Inicializar Base de Datos</button>
    </form>
    <a href="login.php" class="btn btn-secondary">Ir directamente a Login</a>
  <?php endif; ?>
</div>

<div style="margin-top: 1.5rem; font-size:0.75rem; color:var(--text-muted); text-align:center;">
  MediControl • Compatible con XAMPP / MariaDB / MySQL 8.0+
</div>

</body>
</html>
