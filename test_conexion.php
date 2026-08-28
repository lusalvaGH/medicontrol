<?php
declare(strict_types=1);

require_once __DIR__ . '/config/database.php';

$ok  = '&#10003;'; // ✓
$err = '&#10007;'; // ✗
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>MediControl – Test de Conexión</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',sans-serif}
    body{background:#f0f4f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}
    .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:2.5rem;max-width:640px;width:100%}
    h1{font-size:1.4rem;font-weight:800;color:#004797;margin-bottom:0.3rem}
    .subtitle{color:#64748b;font-size:.85rem;margin-bottom:2rem}
    table{width:100%;border-collapse:collapse;font-size:.88rem}
    th{background:#f8fafc;text-align:left;padding:.65rem 1rem;font-weight:700;color:#64748b;font-size:.73rem;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0}
    td{padding:.7rem 1rem;border-bottom:1px solid #f1f5f9;color:#1e293b}
    tr:last-child td{border-bottom:none}
    .pass{color:#15803d;font-weight:700}
    .fail{color:#b91c1c;font-weight:700}
    .section{margin-top:2rem;padding-top:1.5rem;border-top:1px solid #e2e8f0}
    .section h2{font-size:.95rem;font-weight:700;color:#0f172a;margin-bottom:1rem}
    .banner{margin-top:2rem;padding:1rem 1.25rem;border-radius:10px;font-weight:700;font-size:.9rem}
    .banner.success{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0}
    .banner.error{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca}
    .info-row{display:flex;justify-content:space-between;font-size:.82rem;color:#64748b;margin-top:1.25rem}
  </style>
</head>
<body>
<div class="card">
  <h1>🏥 MediControl &mdash; Test de Conexión MySQL</h1>
  <p class="subtitle">Verificando acceso a <strong>medicontrol_db</strong> vía PDO</p>

  <?php
  $overallOk = true;
  $rows = [];

  // ── 1. Intentar conexión
  try {
    $db = Database::getConnection();
    $rows[] = [$ok, 'Conexión PDO', 'Establecida exitosamente', 'pass'];
  } catch (PDOException $e) {
    $overallOk = false;
    $rows[] = [$err, 'Conexión PDO', htmlspecialchars($e->getMessage()), 'fail'];
    $db = null;
  }

  if ($db) {
    // ── 2. Info del servidor
    $info = $db->query("SELECT DATABASE() AS bd, VERSION() AS ver, USER() AS usr")->fetch();
    $rows[] = [$ok, 'Base de datos activa', '<code>' . $info['bd'] . '</code>', 'pass'];
    $rows[] = [$ok, 'Versión MySQL',        '<code>' . $info['ver'] . '</code>', 'pass'];
    $rows[] = [$ok, 'Usuario conectado',    '<code>' . $info['usr'] . '</code>', 'pass'];

    // ── 3. Verificar tablas y registros
    $tablas = [
      'usuarios'  => 'Usuarios del sistema',
      'medicos'   => 'Profesionales médicos',
      'pacientes' => 'Pacientes registrados',
      'turnos'    => 'Turnos médicos',
    ];
    foreach ($tablas as $tabla => $label) {
      try {
        $n = $db->query("SELECT COUNT(*) FROM {$tabla}")->fetchColumn();
        $rows[] = [$ok, "Tabla <code>{$tabla}</code>", "{$label}: <strong>{$n} registros</strong>", 'pass'];
      } catch (PDOException $ex) {
        $overallOk = false;
        $rows[] = [$err, "Tabla <code>{$tabla}</code>", htmlspecialchars($ex->getMessage()), 'fail'];
      }
    }

    // ── 4. Verificar vistas de seguridad RBAC
    $vistas = [
      'vista_recepcion_turnos' => 'Vista Recepcionista',
      'vista_medico_agenda'    => 'Vista Médico',
      'vista_paciente_turnos'  => 'Vista Paciente',
    ];
    foreach ($vistas as $vista => $label) {
      try {
        $n = $db->query("SELECT COUNT(*) FROM {$vista}")->fetchColumn();
        $rows[] = [$ok, "<code>{$vista}</code>", "{$label}: <strong>{$n} filas</strong>", 'pass'];
      } catch (PDOException $ex) {
        $overallOk = false;
        $rows[] = [$err, "<code>{$vista}</code>", htmlspecialchars($ex->getMessage()), 'fail'];
      }
    }
  }
  ?>

  <table>
    <thead>
      <tr><th>Estado</th><th>Componente</th><th>Resultado</th></tr>
    </thead>
    <tbody>
      <?php foreach ($rows as [$icon, $comp, $result, $cls]): ?>
      <tr>
        <td class="<?= $cls ?>"><?= $icon ?></td>
        <td><?= $comp ?></td>
        <td><?= $result ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <div class="banner <?= $overallOk ? 'success' : 'error' ?>">
    <?= $overallOk
      ? '✓ Todo funciona correctamente. PHP está conectado a medicontrol_db.'
      : '✗ Se encontraron errores. Revisá los detalles en la tabla de arriba.' ?>
  </div>

  <div class="info-row">
    <span>PHP <?= phpversion() ?></span>
    <span>PDO MySQL: <?= in_array('mysql', PDO::getAvailableDrivers()) ? 'Disponible' : 'No disponible' ?></span>
    <span><?= date('d/m/Y H:i:s') ?></span>
  </div>
</div>
</body>
</html>
