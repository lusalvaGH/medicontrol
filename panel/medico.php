<?php

declare(strict_types=1);
header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('medico');

$idUsuario = (int) $_SESSION['id_usuario'];
$nombre    = htmlspecialchars((string) ($_SESSION['nombre']   ?? ''), ENT_QUOTES, 'UTF-8');
$apellido  = htmlspecialchars((string) ($_SESSION['apellido'] ?? ''), ENT_QUOTES, 'UTF-8');
$nombreCompleto = trim("$nombre $apellido");

// ── Obtener id_medico desde la sesión/BD (NUNCA desde URL) ──────────────────
$idMedico = 0;
$especialidad = '';
$matricula = '';
try {
    $stmtM = $pdo->prepare('SELECT id_medico, especialidad, matricula FROM medicos WHERE id_usuario = :id LIMIT 1');
    $stmtM->execute([':id' => $idUsuario]);
    $medicoRow = $stmtM->fetch();
    if ($medicoRow) {
        $idMedico    = (int) $medicoRow['id_medico'];
        $especialidad = htmlspecialchars((string) $medicoRow['especialidad'], ENT_QUOTES, 'UTF-8');
        $matricula    = htmlspecialchars((string) ($medicoRow['matricula'] ?? ''), ENT_QUOTES, 'UTF-8');
    }
} catch (PDOException $e) {
    // se mostrará error más abajo
}

// ── Fecha seleccionada ───────────────────────────────────────────────────────
$selectedDate = trim((string) ($_GET['fecha'] ?? date('Y-m-d')));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $selectedDate)) {
    $selectedDate = date('Y-m-d');
}
$dateObj = DateTimeImmutable::createFromFormat('!Y-m-d', $selectedDate);
if (!$dateObj || $dateObj->format('Y-m-d') !== $selectedDate) {
    $selectedDate = date('Y-m-d');
    $dateObj = new DateTimeImmutable('today');
}
$dateDisplay = $dateObj->format('d/m/Y');

// ── Turnos del día (SOLO del médico logueado) ────────────────────────────────
$turnos    = [];
$queryError = null;
if ($idMedico > 0) {
    try {
        $stmtT = $pdo->prepare("
            SELECT
                t.id_turno,
                t.fecha,
                t.hora,
                t.estado,
                t.motivo_consulta,
                t.notas_medicas,
                CONCAT(up.nombre, ' ', up.apellido) AS paciente,
                up.dni AS paciente_dni,
                p.obra_social,
                p.telefono
            FROM turnos t
            INNER JOIN pacientes p  ON p.id_paciente = t.id_paciente
            INNER JOIN usuarios up  ON up.id_usuario  = p.id_usuario
            WHERE t.id_medico = :id_medico
              AND t.fecha     = :fecha
            ORDER BY t.hora ASC, t.id_turno ASC
        ");
        $stmtT->execute([':id_medico' => $idMedico, ':fecha' => $selectedDate]);
        $turnos = $stmtT->fetchAll();
    } catch (PDOException $e) {
        $queryError = 'No se pudieron cargar los turnos.';
    }
}

// ── Estadísticas del día ─────────────────────────────────────────────────────
$stats = ['pendiente' => 0, 'confirmado' => 0, 'en_curso' => 0, 'atendido' => 0, 'cancelado' => 0];
foreach ($turnos as $t) {
    if (isset($stats[$t['estado']])) $stats[$t['estado']]++;
}

// ── Manejo de guardar notas médicas (POST) ───────────────────────────────────
$notaMsg = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['guardar_nota'])) {
    $idTurnoNota = (int) ($_POST['id_turno'] ?? 0);
    $nota        = trim((string) ($_POST['notas_medicas'] ?? ''));

    if ($idTurnoNota > 0 && $idMedico > 0) {
        try {
            // Verificar que el turno pertenece a este médico
            $checkNota = $pdo->prepare(
                'SELECT 1 FROM turnos WHERE id_turno = :id_turno AND id_medico = :id_medico LIMIT 1'
            );
            $checkNota->execute([':id_turno' => $idTurnoNota, ':id_medico' => $idMedico]);
            if ($checkNota->fetchColumn()) {
                $stmtNota = $pdo->prepare(
                    'UPDATE turnos SET notas_medicas = :notas WHERE id_turno = :id_turno AND id_medico = :id_medico'
                );
                $stmtNota->execute([
                    ':notas'     => $nota !== '' ? $nota : null,
                    ':id_turno'  => $idTurnoNota,
                    ':id_medico' => $idMedico,
                ]);
                // Recargar para mostrar cambio
                header('Location: medico.php?fecha=' . rawurlencode($selectedDate) . '&nota_ok=1');
                exit;
            } else {
                $notaMsg = ['tipo' => 'error', 'texto' => 'No tenés permiso para editar ese turno.'];
            }
        } catch (PDOException $e) {
            $notaMsg = ['tipo' => 'error', 'texto' => 'Error al guardar la nota.'];
        }
    }
}

$notaOk = isset($_GET['nota_ok']);

$estadoLabels = [
    'pendiente'  => 'Pendiente',
    'confirmado' => 'Confirmado',
    'en_curso'   => 'En curso',
    'atendido'   => 'Atendido',
    'cancelado'  => 'Cancelado',
];
$estadoBadge = [
    'pendiente'  => 'background:#fef3c7;color:#b45309;',
    'confirmado' => 'background:#dcfce7;color:#15803d;',
    'en_curso'   => 'background:#e0e7ff;color:#3730a3;',
    'atendido'   => 'background:#e0f2fe;color:#0369a1;',
    'cancelado'  => 'background:#fee2e2;color:#b91c1c;',
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediCore Health – Panel Médico</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* ── TOKENS ──────────────────────────────────────────────── */
    :root {
      --primary:#004797; --primary-hover:#003673; --primary-light:#e0f2fe;
      --bg-main:#f0f4f9; --bg-card:#fff; --bg-subtle:#f8fafc;
      --text-dark:#0f172a; --text-main:#1e293b; --text-muted:#64748b; --text-light:#94a3b8;
      --border-color:#e2e8f0; --border-dark:#cbd5e1;
      --radius-md:8px; --radius-lg:12px;
      --shadow-sm:0 1px 3px rgba(0,0,0,.04); --shadow-lg:0 8px 24px rgba(0,0,0,.08);
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;font-family:'Inter',-apple-system,sans-serif;}
    body{background:var(--bg-main);color:var(--text-main);min-height:100vh;-webkit-font-smoothing:antialiased;}

    /* ── LAYOUT ──────────────────────────────────────────────── */
    .app-wrap{display:flex;min-height:100vh;}
    .sidebar{width:220px;background:#fff;border-right:1px solid var(--border-color);display:flex;flex-direction:column;padding:1.5rem 0;flex-shrink:0;}
    .sidebar-logo{padding:0 1.25rem 1.5rem;display:flex;align-items:center;gap:.5rem;font-size:1rem;font-weight:800;color:var(--primary);}
    .sidebar-logo span{font-size:1.4rem;}
    .sidebar-section{font-size:.65rem;font-weight:800;color:var(--text-light);text-transform:uppercase;letter-spacing:.7px;padding:.75rem 1.25rem .35rem;}
    .sidebar-link{display:flex;align-items:center;gap:.6rem;padding:.55rem 1.25rem;font-size:.82rem;font-weight:600;color:var(--text-muted);text-decoration:none;border-left:3px solid transparent;transition:all .15s;}
    .sidebar-link:hover,.sidebar-link.active{color:var(--primary);background:var(--primary-light);border-left-color:var(--primary);}
    .sidebar-link .ico{font-size:1rem;width:1.2rem;text-align:center;}
    .sidebar-bottom{margin-top:auto;padding:0 1rem;}

    .main-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;}
    .topbar{background:#fff;border-bottom:1px solid var(--border-color);padding:.75rem 1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;}
    .topbar-title{font-size:1rem;font-weight:800;color:var(--text-dark);}
    .topbar-right{display:flex;align-items:center;gap:.75rem;}
    .user-chip{display:flex;align-items:center;gap:.5rem;background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:20px;padding:.3rem .75rem;font-size:.78rem;font-weight:700;color:var(--text-main);}
    .user-chip .dot{width:8px;height:8px;background:#22c55e;border-radius:50%;}
    .role-badge{background:var(--primary);color:#fff;font-size:.68rem;font-weight:800;padding:.2rem .55rem;border-radius:20px;text-transform:uppercase;}

    .content{padding:1.5rem;overflow-y:auto;}

    /* ── TARJETAS ─────────────────────────────────────────────── */
    .card{background:#fff;border-radius:var(--radius-lg);border:1px solid var(--border-color);box-shadow:var(--shadow-sm);padding:1.25rem;margin-bottom:1.25rem;}
    .card-title{font-size:.85rem;font-weight:800;color:var(--text-dark);margin-bottom:1rem;}

    /* ── KPIs ─────────────────────────────────────────────────── */
    .kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.85rem;margin-bottom:1.25rem;}
    .kpi{background:#fff;border-radius:var(--radius-lg);border:1px solid var(--border-color);padding:1rem;text-align:center;}
    .kpi-val{font-size:1.8rem;font-weight:800;color:var(--primary);}
    .kpi-lbl{font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-top:.15rem;}

    /* ── FECHA NAV ────────────────────────────────────────────── */
    .date-nav{display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;}
    .date-nav input[type=date]{border:1px solid var(--border-dark);border-radius:var(--radius-md);padding:.45rem .75rem;font-size:.82rem;font-weight:700;color:var(--text-dark);outline:none;cursor:pointer;}
    .date-nav input[type=date]:focus{border-color:var(--primary);}

    /* ── TABLA ────────────────────────────────────────────────── */
    .tabla{width:100%;border-collapse:collapse;font-size:.83rem;}
    .tabla th{background:var(--bg-subtle);padding:.6rem .9rem;text-align:left;font-size:.68rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid var(--border-color);}
    .tabla td{padding:.7rem .9rem;border-bottom:1px solid var(--border-color);color:var(--text-main);vertical-align:top;}
    .tabla tr:last-child td{border-bottom:none;}
    .tabla tr:hover td{background:var(--bg-subtle);}

    /* ── BADGE ESTADO ─────────────────────────────────────────── */
    .badge{display:inline-block;padding:.2rem .55rem;border-radius:20px;font-size:.68rem;font-weight:800;letter-spacing:.3px;}

    /* ── BOTONES ──────────────────────────────────────────────── */
    .btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;border-radius:var(--radius-md);font-size:.78rem;font-weight:700;cursor:pointer;border:none;text-decoration:none;}
    .btn-primary{background:var(--primary);color:#fff;}
    .btn-primary:hover{background:var(--primary-hover);}
    .btn-secondary{background:#fff;color:var(--primary);border:1px solid var(--border-dark);}
    .btn-secondary:hover{background:var(--bg-subtle);}
    .btn-sm{padding:.3rem .65rem;font-size:.72rem;}

    /* ── MODAL ────────────────────────────────────────────────── */
    .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center;}
    .modal-overlay.show{display:flex;}
    .modal-box{background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 40px rgba(0,0,0,.18);}
    .modal-head{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-color);}
    .modal-head h3{font-size:1rem;font-weight:800;color:var(--primary);}
    .close-x{background:none;border:none;font-size:1.2rem;color:var(--text-light);cursor:pointer;}
    .modal-body{padding:1.25rem 1.5rem;}
    .modal-foot{display:flex;justify-content:flex-end;gap:.65rem;padding:1rem 1.5rem;border-top:1px solid var(--border-color);}
    .form-group{margin-bottom:1rem;}
    .form-group label{display:block;font-size:.7rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:.35rem;}
    .input-box{width:100%;padding:.6rem .85rem;border:1px solid var(--border-dark);border-radius:var(--radius-md);font-size:.83rem;outline:none;background:var(--bg-subtle);}
    .input-box:focus{border-color:var(--primary);background:#fff;}

    /* ── VACÍO / AVISO ────────────────────────────────────────── */
    .empty-msg{text-align:center;padding:2.5rem 1rem;color:var(--text-muted);font-size:.85rem;}
    .alert-success{background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;padding:.75rem 1rem;border-radius:var(--radius-md);font-size:.82rem;font-weight:600;margin-bottom:1rem;}
    .alert-error{background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;padding:.75rem 1rem;border-radius:var(--radius-md);font-size:.82rem;font-weight:600;margin-bottom:1rem;}

    .info-row{display:flex;gap:.4rem;flex-direction:column;}
    .info-row span{font-size:.72rem;color:var(--text-muted);}

    @media (max-width:680px){
      .sidebar{display:none;}
      .kpi-row{grid-template-columns:1fr 1fr;}
    }
  </style>
</head>
<body>
<div class="app-wrap">

  <!-- SIDEBAR -->
  <nav class="sidebar">
    <div class="sidebar-logo"><span>🏥</span> MediCore</div>
    <div class="sidebar-section">Mi Actividad</div>
    <a class="sidebar-link active" href="medico.php"><span class="ico">📅</span> Mi Agenda</a>
    <div class="sidebar-section">Cuenta</div>
    <a class="sidebar-link" href="../logout.php"><span class="ico">🚪</span> Cerrar Sesión</a>
  </nav>

  <!-- MAIN -->
  <div class="main-wrap">
    <!-- TOPBAR -->
    <div class="topbar">
      <div class="topbar-title">Panel Médico – Agenda del Día</div>
      <div class="topbar-right">
        <span class="role-badge">Médico</span>
        <div class="user-chip"><span class="dot"></span><?= $nombreCompleto ?></div>
        <a href="../logout.php" class="btn btn-secondary btn-sm">🚪 Salir</a>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="content">

      <?php if ($idMedico === 0): ?>
        <div class="alert-error">⚠️ No se encontró perfil de médico asociado a tu cuenta. Contactá al administrador.</div>
      <?php else: ?>

      <?php if ($notaOk): ?>
        <div class="alert-success">✅ Nota médica guardada correctamente.</div>
      <?php endif; ?>
      <?php if ($notaMsg): ?>
        <div class="alert-<?= $notaMsg['tipo'] ?>"><?= htmlspecialchars($notaMsg['texto'], ENT_QUOTES, 'UTF-8') ?></div>
      <?php endif; ?>

      <!-- PERFIL MÉDICO + ESPECIALIDAD -->
      <div class="card" style="display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--primary);color:#fff;font-size:1.3rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <?= mb_strtoupper(mb_substr($_SESSION['nombre'] ?? 'M', 0, 1) . mb_substr($_SESSION['apellido'] ?? 'D', 0, 1)) ?>
        </div>
        <div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--text-dark);">Dr/a. <?= $nombreCompleto ?></div>
          <div style="font-size:.82rem;color:var(--primary);font-weight:700;"><?= $especialidad ?></div>
          <?php if ($matricula !== ''): ?>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.15rem;">Matrícula: <?= $matricula ?></div>
          <?php endif; ?>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-val"><?= count($turnos) ?></div><div class="kpi-lbl">Total hoy</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#b45309;"><?= $stats['pendiente'] ?></div><div class="kpi-lbl">Pendientes</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#15803d;"><?= $stats['confirmado'] ?></div><div class="kpi-lbl">Confirmados</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#3730a3;"><?= $stats['en_curso'] ?></div><div class="kpi-lbl">En curso</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#0369a1;"><?= $stats['atendido'] ?></div><div class="kpi-lbl">Atendidos</div></div>
      </div>

      <!-- SELECTOR DE FECHA -->
      <form method="get" class="date-nav">
        <label style="font-size:.8rem;font-weight:700;color:var(--text-dark);">📅 Fecha:</label>
        <input type="date" name="fecha" value="<?= htmlspecialchars($selectedDate, ENT_QUOTES, 'UTF-8') ?>" onchange="this.form.submit()">
        <span style="font-size:.82rem;font-weight:700;color:var(--text-muted);"><?= htmlspecialchars($dateDisplay, ENT_QUOTES, 'UTF-8') ?></span>
      </form>

      <!-- TABLA DE TURNOS -->
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);">
          <div class="card-title" style="margin:0;">Turnos — <?= htmlspecialchars($dateDisplay, ENT_QUOTES, 'UTF-8') ?></div>
        </div>
        <?php if ($queryError): ?>
          <div class="alert-error" style="margin:1rem;"><?= htmlspecialchars($queryError, ENT_QUOTES, 'UTF-8') ?></div>
        <?php elseif (empty($turnos)): ?>
          <div class="empty-msg">Sin turnos para este día.</div>
        <?php else: ?>
          <table class="tabla">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Paciente</th>
                <th>DNI / Obra Social</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($turnos as $t): ?>
                <?php
                  $hora     = substr((string) $t['hora'], 0, 5);
                  $estado   = (string) $t['estado'];
                  $estLabel = $estadoLabels[$estado] ?? $estado;
                  $estStyle = $estadoBadge[$estado] ?? '';
                  $paciente = htmlspecialchars((string) $t['paciente'], ENT_QUOTES, 'UTF-8');
                  $dni      = htmlspecialchars((string) ($t['paciente_dni'] ?? ''), ENT_QUOTES, 'UTF-8');
                  $os       = htmlspecialchars((string) ($t['obra_social'] ?? 'Particular'), ENT_QUOTES, 'UTF-8');
                  $motivo   = htmlspecialchars((string) ($t['motivo_consulta'] ?? '—'), ENT_QUOTES, 'UTF-8');
                  $notas    = htmlspecialchars((string) ($t['notas_medicas'] ?? ''), ENT_QUOTES, 'UTF-8');
                  $idT      = (int) $t['id_turno'];
                ?>
                <tr>
                  <td style="font-weight:800;color:var(--primary);white-space:nowrap;"><?= $hora ?></td>
                  <td><strong><?= $paciente ?></strong></td>
                  <td>
                    <div class="info-row">
                      <strong><?= $dni ?></strong>
                      <span><?= $os ?></span>
                    </div>
                  </td>
                  <td style="max-width:180px;"><?= $motivo ?></td>
                  <td><span class="badge" style="<?= $estStyle ?>"><?= htmlspecialchars($estLabel, ENT_QUOTES, 'UTF-8') ?></span></td>
                  <td style="max-width:160px;font-size:.75rem;color:var(--text-muted);"><?= $notas !== '' ? $notas : '<em>Sin notas</em>' ?></td>
                  <td>
                    <button class="btn btn-secondary btn-sm"
                      onclick="abrirModal(<?= $idT ?>, '<?= $paciente ?>', '<?= $motivo ?>', '<?= addslashes($notas) ?>')">
                      ✏️ Notas
                    </button>
                  </td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        <?php endif; ?>
      </div>

      <?php endif; // fin if idMedico ?>

    </div><!-- /content -->
  </div><!-- /main-wrap -->
</div><!-- /app-wrap -->

<!-- MODAL NOTAS MÉDICAS -->
<div class="modal-overlay" id="modalNotas">
  <div class="modal-box">
    <div class="modal-head">
      <h3>✏️ Registrar / Editar Nota Médica</h3>
      <button class="close-x" onclick="cerrarModal()">✕</button>
    </div>
    <form method="post">
      <input type="hidden" name="guardar_nota" value="1">
      <input type="hidden" name="id_turno" id="notaIdTurno">
      <div class="modal-body">
        <div class="form-group">
          <label>Paciente</label>
          <input type="text" class="input-box" id="notaPaciente" readonly style="background:var(--border-color);">
        </div>
        <div class="form-group">
          <label>Motivo de Consulta</label>
          <input type="text" class="input-box" id="notaMotivo" readonly style="background:var(--border-color);">
        </div>
        <div class="form-group">
          <label>Notas Médicas</label>
          <textarea name="notas_medicas" id="notaTexto" class="input-box" rows="5"
            placeholder="Evolución, diagnóstico, indicaciones..." style="resize:vertical;"></textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">💾 Guardar Nota</button>
      </div>
    </form>
  </div>
</div>

<script>
  function abrirModal(idTurno, paciente, motivo, notas) {
    document.getElementById('notaIdTurno').value  = idTurno;
    document.getElementById('notaPaciente').value = paciente;
    document.getElementById('notaMotivo').value   = motivo;
    document.getElementById('notaTexto').value    = notas;
    document.getElementById('modalNotas').classList.add('show');
  }
  function cerrarModal() {
    document.getElementById('modalNotas').classList.remove('show');
  }
  document.getElementById('modalNotas').addEventListener('click', function(e) {
    if (e.target === this) cerrarModal();
  });
</script>
</body>
</html>
