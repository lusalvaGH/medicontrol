<?php

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$idUsuario = (int) $_SESSION['id_usuario'];
$nombre = $_SESSION['nombre'] ?? '';
$apellido = $_SESSION['apellido'] ?? '';

$selectedDate = $_GET['fecha'] ?? date('Y-m-d');
$selectedDate = trim((string) $selectedDate);
$hasValidDate = preg_match('/^\d{4}-\d{2}-\d{2}$/', $selectedDate) === 1;
$selectedDateObj = DateTimeImmutable::createFromFormat('Y-m-d', $selectedDate);
if (!$hasValidDate || !$selectedDateObj || $selectedDateObj->format('Y-m-d') !== $selectedDate) {
    $selectedDate = date('Y-m-d');
    $dateMessage = 'La fecha seleccionada no era válida. Se mostró la fecha actual.';
} else {
    $dateMessage = null;
}

$estadoLabels = [
    'pendiente' => 'Pendiente',
    'confirmado' => 'Confirmado',
    'en_curso' => 'En curso',
    'atendido' => 'Atendido',
    'cancelado' => 'Cancelado',
];

$estadoStyles = [
    'pendiente' => 'background:#fef3c7; color:#b45309;',
    'confirmado' => 'background:#dcfce7; color:#15803d;',
    'en_curso' => 'background:#e0e7ff; color:#3730a3;',
    'atendido' => 'background:#e0f2fe; color:#0369a1;',
    'cancelado' => 'background:#fee2e2; color:#b91c1c;',
];

$turnos = [];
$queryError = null;

try {
    $sqlTurnos = "
        SELECT
            t.id_turno,
            t.fecha,
            t.hora,
            t.estado,
            t.motivo_consulta,
            CONCAT(up.nombre, ' ', up.apellido) AS paciente,
            CONCAT(um.nombre, ' ', um.apellido) AS medico,
            m.especialidad
        FROM turnos t
        INNER JOIN pacientes p ON p.id_paciente = t.id_paciente
        INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
        INNER JOIN medicos m ON m.id_medico = t.id_medico
        INNER JOIN usuarios um ON um.id_usuario = m.id_usuario
        WHERE t.fecha = :fecha
        ORDER BY t.hora ASC, t.id_turno ASC
    ";

    $stmtTurnos = $pdo->prepare($sqlTurnos);
    $stmtTurnos->execute(['fecha' => $selectedDate]);
    $turnos = $stmtTurnos->fetchAll();
} catch (PDOException $e) {
    $queryError = 'No se pudieron cargar los turnos de la fecha seleccionada. Intentá nuevamente más tarde.';
    $turnos = [];
}

$stateCounts = array_fill_keys(array_keys($estadoLabels), 0);
foreach ($turnos as $turno) {
    if (isset($stateCounts[$turno['estado']])) {
        $stateCounts[$turno['estado']]++;
    }
}
$dateDisplay = date('d/m/Y', strtotime($selectedDate));
$prevDate = date('Y-m-d', strtotime($selectedDate . ' -1 day'));
$nextDate = date('Y-m-d', strtotime($selectedDate . ' +1 day'));
$firstTurno = !empty($turnos) ? $turnos[0] : null;
?><!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediCore Health - Gestión de Turnos (Día)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* ==========================================================================
       10 - GESTIÓN DE TURNOS (DÍA / TIMELINE) | MEDICORE HEALTH
       CSS Específico y Autónomo de la Pantalla
       ========================================================================== */
    :root {
      --primary: #004797;
      --primary-hover: #003673;
      --primary-light: #e0f2fe;
      --primary-subtle: #e8f1fd;
      --bg-main: #f0f4f9;
      --bg-card: #ffffff;
      --bg-subtle: #f8fafc;
      --text-dark: #0f172a;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --text-light: #94a3b8;
      --border-color: #e2e8f0;
      --border-dark: #cbd5e1;
      --status-conf-bg: #dcfce7;
      --status-conf-text: #15803d;
      --status-pend-bg: #fef3c7;
      --status-pend-text: #b45309;
      --status-canc-bg: #fee2e2;
      --status-canc-text: #b91c1c;
      --status-att-bg: #e0f2fe;
      --status-att-text: #0369a1;
      --status-espera-bg: #ffedd5;
      --status-espera-text: #c2410c;
      --status-encurso-bg: #e0e7ff;
      --status-encurso-text: #3730a3;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.03);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
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
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* ESTRUCTURA GENERAL */
    .app-container {
      display: flex;
      min-height: 100vh;
    }

    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      position: relative;
    }

    header {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .search-input {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      padding: 0.5rem 0.85rem;
      border-radius: var(--radius-md);
      width: 340px;
      font-size: 0.82rem;
    }

    .search-input input {
      border: none;
      background: transparent;
      outline: none;
      width: 100%;
      font-size: 0.82rem;
      color: var(--text-main);
    }

    .page-padding {
      padding: 2rem;
      flex: 1;
    }

    /* GRID & LAYOUTS */
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    .timeline-layout {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 1.5rem;
    }

    .card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      padding: 1.5rem;
      box-shadow: var(--shadow-sm);
      margin-bottom: 1.5rem;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-dark);
      margin-bottom: 1.25rem;
    }

    .stat-card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .stat-val {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text-dark);
      line-height: 1;
      margin-top: 0.3rem;
    }

    /* ELEMENTOS DEL TIMELINE */
    .slot-box {
      background: var(--bg-subtle);
      border-left: 4px solid var(--primary);
      border-radius: 8px;
      padding: 0.85rem;
      margin-bottom: 0.75rem;
      transition: all 0.2s;
    }
    .slot-box.purple { background: #f5f3ff; border-left-color: #6d28d9; }
    .slot-box.canc { background: #fef2f2; border-left-color: #b91c1c; }
    .slot-box.selected { background: #fefce8; border-left-color: #ca8a04; border: 2px solid #ca8a04; }
    .slot-box.selected-card-highlight {
      border: 2px solid var(--primary) !important;
      box-shadow: 0 0 15px rgba(0, 71, 151, 0.35) !important;
      background: #f0f9ff !important;
    }

    .view-tabs { display: flex; background: var(--border-color); padding: 3px; border-radius: 8px; font-size: 0.78rem; }
    .tab-btn { border: none; padding: 0.4rem 0.85rem; border-radius: 6px; font-weight: 700; cursor: pointer; background: transparent; color: var(--text-muted); text-decoration: none; display: inline-block; }
    .tab-btn.active { background: white; color: var(--primary); box-shadow: var(--shadow-sm); }
    .drag-hint { font-size: 0.75rem; color: var(--primary); font-weight: 700; background: var(--primary-light); padding: 0.4rem 0.8rem; border-radius: 20px; display: inline-flex; align-items: center; gap: 0.4rem; }

    /* BARRA DE FILTROS */
    .filter-bar-card { background: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .spec-selector { display: flex; align-items: center; gap: 0.5rem; }
    .spec-select-input { padding: 0.55rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-dark); font-weight: 700; font-size: 0.85rem; background: var(--bg-subtle); color: var(--text-dark); cursor: pointer; outline: none; }

    /* GRILLA DE HORARIOS */
    .full-time-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-top: 0.5rem; max-height: 180px; overflow-y: auto; padding-right: 0.2rem; }
    .time-slot-btn { background: var(--bg-subtle); border: 1px solid var(--border-color); padding: 0.45rem 0.25rem; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: var(--text-main); text-align: center; cursor: pointer; transition: all 0.15s; }
    .time-slot-btn:hover { background: #e0f2fe; color: var(--primary); border-color: var(--primary); }
    .time-slot-btn.selected { background: var(--primary); color: white; border-color: var(--primary); font-weight: 800; box-shadow: 0 2px 4px rgba(0,71,151,0.2); }

    /* MODAL DE CLIENTES */
    .client-list-modal { width: 100%; max-width: 600px; }
    .client-item-card { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); }
    .client-item-card:hover { background: var(--bg-subtle); }

    /* DETALLE BREVE */
    .detail-info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.85rem; margin-bottom: 1rem; }
    .detail-info-item { background: var(--bg-subtle); padding: 0.85rem; border-radius: 10px; border: 1px solid var(--border-color); }
    .detail-info-item label { font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 0.25rem; }
    .detail-info-item div { font-size: 0.88rem; font-weight: 700; color: var(--text-dark); }

    /* BADGES */
    .badge {
      padding: 0.25rem 0.65rem;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.3px;
      display: inline-block;
    }
    .badge-confirmado { background: var(--status-conf-bg); color: var(--status-conf-text); }
    .badge-pendiente { background: var(--status-pend-bg); color: var(--status-pend-text); }
    .badge-cancelado { background: var(--status-canc-bg); color: var(--status-canc-text); }
    .badge-encurso { background: var(--status-encurso-bg); color: var(--status-encurso-text); }

    /* BOTONES */
    .btn {
      padding: 0.6rem 1.1rem;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--bg-card); color: var(--primary); border: 1px solid var(--border-dark); }
    .btn-secondary:hover { background: var(--primary-light); }
    .btn-danger { background: var(--status-canc-text); color: white; }
    .btn-danger:hover { background: #991b1b; }

    /* FORMULARIOS */
    .form-group { margin-bottom: 1.1rem; }
    .form-group label { display: block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.4rem; }
    .input-box { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid var(--border-dark); border-radius: var(--radius-md); font-size: 0.85rem; outline: none; background: var(--bg-subtle); transition: border-color 0.2s; }
    .input-box:focus { border-color: var(--primary); background: white; }

    /* POPUP & MODALES */
    .menu-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999; display: none; }
    .menu-backdrop.show { display: block; }
    .action-btn-trigger { width: 32px; height: 32px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold; color: var(--text-muted); transition: all 0.2s; user-select: none; }
    .action-btn-trigger:hover, .action-btn-trigger.active { background: var(--primary-light); color: var(--primary); }
    .popup-menu { position: absolute; background: white; border-radius: var(--radius-lg); border: 1px solid var(--border-dark); box-shadow: var(--shadow-xl); width: 270px; z-index: 1000; display: none; overflow: hidden; animation: popIn 0.15s ease-out; }
    @keyframes popIn { from { opacity: 0; transform: scale(0.95) translateY(-5px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    .popup-menu.show { display: block; }
    .popup-header { background: var(--bg-subtle); padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 0.75rem; font-weight: 800; color: var(--text-dark); display: flex; justify-content: space-between; align-items: center; }
    .popup-actions-list { list-style: none; padding: 0.35rem 0; }
    .popup-action-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 1rem; font-size: 0.83rem; font-weight: 600; color: var(--text-main); text-decoration: none; transition: background 0.15s; cursor: pointer; }
    .popup-action-item:hover { background: #f0f9ff; color: var(--primary); }
    .popup-action-item.danger { color: #dc2626; }
    .popup-action-item.danger:hover { background: var(--status-canc-bg); color: var(--status-canc-text); }

    .turn-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); z-index: 2000; display: none; align-items: center; justify-content: center; padding: 1.5rem; }
    .turn-modal-overlay.show { display: flex; }
    .turn-modal-card { background: white; border-radius: 16px; width: 100%; max-width: 540px; box-shadow: var(--shadow-xl); overflow: hidden; animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
    .turn-modal-header { padding: 1.25rem 1.5rem; background: var(--bg-subtle); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
    .turn-modal-header h3 { font-size: 1.1rem; font-weight: 800; color: var(--primary); }
    .close-modal { font-size: 1.2rem; color: var(--text-light); cursor: pointer; font-weight: bold; }
    .turn-modal-body { padding: 1.5rem; }
    .turn-modal-footer { padding: 1rem 1.5rem; background: var(--bg-subtle); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; gap: 0.75rem; }

    /* TOAST NOTIFICATION */
    .toast-notification { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(100px); background: #0f172a; color: white; padding: 0.85rem 1.5rem; border-radius: 30px; font-size: 0.88rem; font-weight: 700; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 3000; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: flex; align-items: center; gap: 0.5rem; }
    .toast-notification.show { transform: translateX(-50%) translateY(0); }

    /* RESPONSIVE */
    @media (max-width: 1199px) {
      .timeline-layout { grid-template-columns: 1fr; }
      .grid-4 { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      header { flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; }
      .search-input { width: 100%; }
      .page-padding { padding: 1rem 0.75rem; }
      .grid-4 { grid-template-columns: 1fr; }
      .filter-bar-card { flex-direction: column; align-items: flex-start; }
      .full-time-grid { grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>

  <div class="app-container">
    <!-- Main Content Area -->
    <div class="main-area">
      <header>
        <div class="search-input">
          🔍 <input type="text" id="turnosSearch" placeholder="Buscar paciente o médico..." autocomplete="off">
        </div>
        <div style="font-size:0.85rem; font-weight:700; color:var(--primary);"><?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?> (RECEPCIÓN) · <a href="../logout.php" style="color:var(--primary); text-decoration:none;">Cerrar sesión</a></div>
      </header>

      <div class="page-padding">

        <!-- Stats -->
        <div class="grid-4" style="margin-bottom: 1.5rem;">
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Turnos de Hoy</div>
              <div style="font-size:1.6rem; font-weight:800; color:#0f172a; margin-top:0.2rem;"><?= count($turnos) ?> <span style="font-size:0.75rem; color:#166534;">Fecha consultada</span></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Confirmados</div>
              <div style="font-size:1.6rem; font-weight:800; color:#166534; margin-top:0.2rem;"><?= $stateCounts['confirmado'] ?></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Pendientes</div>
              <div style="font-size:1.6rem; font-weight:800; color:#b45309; margin-top:0.2rem;"><?= $stateCounts['pendiente'] ?></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">En Curso</div>
              <div style="font-size:1.6rem; font-weight:800; color:#3730a3; margin-top:0.2rem;"><?= $stateCounts['en_curso'] ?></div>
            </div>
          </div>
        </div>

        <!-- BARRA DE FILTRADO DE ESPECIALIDAD & TODOS LOS CLIENTES -->
        <div class="filter-bar-card">
          <div class="spec-selector">
            <span style="font-size:0.82rem; font-weight:800; color:#0f172a;">🩺 Especialidad:</span>
            <select class="spec-select-input" id="specFilterSelectDaily">
              <option value="ALL">Todas las Especialidades</option>
              <option value="Cardiología">Cardiología</option>
              <option value="Pediatría">Pediatría</option>
              <option value="Traumatología">Traumatología</option>
              <option value="Clínica Médica">Clínica Médica</option>
            </select>
          </div>

          <div style="display:flex; gap:0.75rem; align-items:center;">
            <button class="btn btn-secondary" onclick="openAllClientsModal()">👥 Todos los Clientes / Pacientes</button>
            <div class="drag-hint">🤚 Tocá un turno para seleccionar y modificar o arrastralo de horario</div>
          </div>
        </div>

        <!-- Acciones Principales Side-by-Side (Registrar & Detalle del Turno) -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:0.75rem;">
          <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
            <a href="recepcionista_turno_nuevo.php" class="btn btn-primary">⊕ Registrar Turno</a>
            <button class="btn btn-secondary" onclick="openDetailModalFromTop()">📄 Detalle del Turno</button>
            <span style="font-size:0.95rem; font-weight:800; color:#0f172a; margin-left:0.5rem;"><?= htmlspecialchars($dateDisplay, ENT_QUOTES, "UTF-8") ?></span>
          </div>

          <div class="view-tabs">
            <a href="recepcionista.php" class="tab-btn active">Día</a>
            <a href="recepcionista_semana.php" class="tab-btn">Semana</a>
            <a href="recepcionista_mes.php" class="tab-btn">Mes</a>
          </div>
        </div>

        <!-- ÚNICO LISTADO E INTERFAZ DE TIMELINE -->
        <div class="timeline-layout">

          <!-- Timeline Cronológico -->
          <div class="card" style="margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-weight:800; font-size:1.1rem; color:#0f172a; margin-bottom:1.5rem; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <a href="recepcionista.php?fecha=<?= urlencode($prevDate) ?>" style="color:var(--primary); text-decoration:none; font-size:1.2rem; padding:0 0.3rem;">‹</a>
                <span><?= htmlspecialchars($dateDisplay, ENT_QUOTES, "UTF-8") ?></span>
                <a href="recepcionista.php?fecha=<?= urlencode($nextDate) ?>" style="color:var(--primary); text-decoration:none; font-size:1.2rem; padding:0 0.3rem;">›</a>
              </div>
              <input type="date" value="<?= htmlspecialchars($selectedDate, ENT_QUOTES, 'UTF-8') ?>" onchange="window.location.href='recepcionista.php?fecha='+encodeURIComponent(this.value)" style="border:1px solid var(--border-dark); border-radius:var(--radius-md); padding:0.35rem 0.6rem; font-size:0.8rem; font-weight:700; color:var(--text-dark); background:var(--bg-subtle); cursor:pointer;">
            </div>

            <div class="timeline-slots">
              <?php if (!empty($queryError)): ?>
                <div class="alert-box"><?= htmlspecialchars($queryError, ENT_QUOTES, 'UTF-8') ?></div>
              <?php elseif (empty($turnos)): ?>
                <div class="empty-panel">No hay turnos para el día <?= htmlspecialchars($dateDisplay, ENT_QUOTES, 'UTF-8') ?>.</div>
              <?php else: ?>
                <?php foreach ($turnos as $turno): ?>
                  <?php
                    $estado = (string) $turno['estado'];
                    $estadoLabel = $estadoLabels[$estado];
                    $estadoClassMap = [
                        'confirmado' => 'green',
                        'pendiente' => 'selected',
                        'en_curso' => 'purple',
                        'atendido' => 'blue',
                        'cancelado' => 'canc',
                    ];
                    $estadoClass = $estadoClassMap[$estado] ?? '';
                    $hora = substr((string) $turno['hora'], 0, 5);
                    $paciente = trim((string) $turno['paciente']);
                    $medico = trim((string) $turno['medico']);
                    $especialidad = trim((string) $turno['especialidad']);
                    $motivo = trim((string) ($turno['motivo_consulta'] ?? ''));
                    $cardId = 'turn-' . (int) $turno['id_turno'];
                    // JSON_HEX_APOS convierte ' → \u0027 (protege el atributo onclick='...')
                    // JSON_HEX_TAG protege < y >. NO usar htmlspecialchars: rompería las " del JSON.
                    $cardArgs = json_encode(
                        [$cardId, $paciente, $medico, $especialidad, $hora, $turno['fecha'], strtoupper($estado)],
                        JSON_UNESCAPED_UNICODE | JSON_HEX_APOS | JSON_HEX_TAG
                    );
                  ?>
                  <div class="slot-row">
                    <div class="slot-time"><?= htmlspecialchars($hora, ENT_QUOTES, 'UTF-8') ?></div>
                    <div class="slot-box <?= htmlspecialchars($estadoClass, ENT_QUOTES, 'UTF-8') ?>" id="<?= htmlspecialchars($cardId, ENT_QUOTES, 'UTF-8') ?>" data-spec="<?= htmlspecialchars($especialidad, ENT_QUOTES, 'UTF-8') ?>" data-search="<?= htmlspecialchars($paciente . ' ' . $medico . ' ' . $especialidad . ' ' . $motivo, ENT_QUOTES, 'UTF-8') ?>" draggable="true" onclick='handleCardClick(...<?= $cardArgs ?>, this)'>
                      <strong class="card-title-text"><?= htmlspecialchars($hora, ENT_QUOTES, 'UTF-8') ?> | <?= htmlspecialchars($paciente, ENT_QUOTES, 'UTF-8') ?></strong> — <span class="badge badge-<?= htmlspecialchars(strtolower(str_replace('_', '', $estado)), ENT_QUOTES, 'UTF-8') ?> card-badge"><?= htmlspecialchars(strtoupper($estadoLabel), ENT_QUOTES, 'UTF-8') ?></span><br>
                      <span class="card-doc-text" style="font-size:0.75rem; color:var(--text-muted);"><?= htmlspecialchars($medico, ENT_QUOTES, 'UTF-8') ?> (<?= htmlspecialchars($especialidad, ENT_QUOTES, 'UTF-8') ?>)</span>
                      <span style="display:block; font-size:0.75rem; margin-top:0.3rem;"><strong>Motivo:</strong> <?= htmlspecialchars($motivo !== '' ? $motivo : 'Sin motivo informado', ENT_QUOTES, 'UTF-8') ?></span>
                    </div>
                  </div>
                <?php endforeach; ?>
              <?php endif; ?>
              <div id="searchEmpty" class="empty-panel" style="display:none; padding:2.5rem 1rem; text-align:center; color:var(--text-muted); font-size:0.9rem; font-weight:700;">🔍 No se encontraron turnos que coincidan con la búsqueda.</div>
            </div>
          </div>
          <!-- Columna Lateral: Ficha del Paciente Activo -->
          <div class="card" style="margin-bottom:0; background:var(--bg-subtle);">
            <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>👤 Paciente Seleccionado</span>
              <?php
                $sideStatus = $firstTurno ? strtoupper((string) $firstTurno['estado']) : 'SIN SELECCIÓN';
                $sideBadgeClass = $firstTurno ? 'badge-' . strtolower(str_replace('_', '', (string)$firstTurno['estado'])) : 'badge-pendiente';
                $sidePatient = $firstTurno ? htmlspecialchars((string) $firstTurno['paciente'], ENT_QUOTES, 'UTF-8') : 'Seleccioná un turno';
                $sideDoctor = $firstTurno ? htmlspecialchars((string) $firstTurno['medico'] . ' (' . $firstTurno['especialidad'] . ')', ENT_QUOTES, 'UTF-8') : '—';
                $sideDate = $firstTurno ? htmlspecialchars((string) $firstTurno['fecha'], ENT_QUOTES, 'UTF-8') : $selectedDate;
                $sideTime = $firstTurno ? substr((string) $firstTurno['hora'], 0, 5) : '—';
                $sideReason = $firstTurno ? htmlspecialchars((string) ($firstTurno['motivo_consulta'] ?? 'Sin motivo informado'), ENT_QUOTES, 'UTF-8') : 'Hacé clic en cualquier turno de la lista para ver su detalle o modificarlo.';
                $initials = $firstTurno ? mb_strtoupper(mb_substr((string)$firstTurno['paciente'], 0, 2)) : 'PT';
              ?>
              <span class="badge <?= $sideBadgeClass ?>" id="sideBadge"><?= htmlspecialchars($sideStatus, ENT_QUOTES, 'UTF-8') ?></span>
            </div>

            <div style="text-align:center; padding:1rem 0; border-bottom:1px solid var(--border-color);">
              <div style="width:60px; height:60px; border-radius:50%; background:var(--primary); color:white; font-size:1.4rem; font-weight:800; display:flex; align-items:center; justify-content:center; margin:0 auto 0.75rem auto;" id="sideAvatar"><?= $initials ?></div>
              <h3 style="font-size:1.1rem; font-weight:800; color:#0f172a;" id="sidePatientName"><?= $sidePatient ?></h3>
              <p style="font-size:0.78rem; color:var(--text-muted);" id="sideCoverageText">Paciente registrado</p>
            </div>

            <div style="padding:1rem 0;">
              <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem;">Médico Tratante</div>
              <div style="font-size:0.85rem; font-weight:700; color:#0f172a;" id="sideDoctorText"><?= $sideDoctor ?></div>

              <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-top:0.85rem; margin-bottom:0.4rem;">Fecha y Horario</div>
              <div style="font-size:0.85rem; font-weight:700; color:var(--primary);"><span id="sideDateText"><?= $sideDate ?></span> — <span id="sideTimeText"><?= $sideTime ?></span></div>

              <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-top:0.85rem; margin-bottom:0.4rem;">Motivo de Consulta</div>
              <p style="font-size:0.8rem; color:var(--text-main); line-height:1.4;" id="sideReasonText"><?= $sideReason ?></p>
            </div>

            <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem;">
              <button class="btn btn-primary" onclick="openDetailModalFromTop()">📄 Ver Detalle Breve</button>
              <button class="btn btn-secondary" onclick="openEditModalFromSide()">✏️ Modificar este Turno</button>
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>

  <!-- 1. POP-UP MODAL EMERGENTE: MODIFICAR / REGISTRAR AJUSTES DE TURNO (PROFESIONAL Y BREVE) -->
  <div class="turn-modal-overlay" id="turnEditModal">
    <div class="turn-modal-card">
      <div class="turn-modal-header" style="background: var(--bg-subtle);">
        <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--primary);">✏️ Modificar & Ajustar Turno</h3>
        <span class="close-modal" onclick="closeEditModal()">✕</span>
      </div>

      <div class="turn-modal-body">
        <form onsubmit="saveModalChanges(event)">
          <input type="hidden" id="activeCardId">

          <div class="form-group">
            <label>Paciente</label>
            <input type="text" id="modalPatientInput" class="input-box" required>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Médico Asignado</label>
              <input type="text" id="modalDoctorInput" class="input-box" required>
            </div>
            <div class="form-group">
              <label>Especialidad</label>
              <input type="text" id="modalSpecInput" class="input-box" required>
            </div>
          </div>

          <!-- CALENDARIO DE FECHA Y HORARIO -->
          <div class="grid-2">
            <div class="form-group">
              <label>📆 Seleccionar Fecha</label>
              <input type="date" id="modalDateInput" class="input-box" required style="font-weight:700; cursor:pointer;">
            </div>
            <div class="form-group">
              <label>Horario Seleccionado</label>
              <input type="text" id="modalTimeInput" class="input-box" required readonly style="background:#e0f2fe; color:var(--primary); font-weight:800;">
            </div>
          </div>

          <!-- SELECCIÓN DE HORARIOS DISPONIBLES -->
          <div class="form-group">
            <label>Seleccionar Horario Disponible (Clic en la pastilla):</label>
            <div class="full-time-grid" id="fullTimeGrid">
              <div class="time-slot-btn" onclick="selectSlotTime('08:00 AM', this)">08:00 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('08:15 AM', this)">08:15 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('08:30 AM', this)">08:30 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('09:00 AM', this)">09:00 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('09:30 AM', this)">09:30 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('10:00 AM', this)">10:00 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('10:30 AM', this)">10:30 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('11:00 AM', this)">11:00 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('11:15 AM', this)">11:15 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('11:30 AM', this)">11:30 AM</div>
              <div class="time-slot-btn" onclick="selectSlotTime('12:00 PM', this)">12:00 PM</div>
            </div>
          </div>

          <div class="form-group">
            <label>Estado del Turno</label>
            <select id="modalStatusSelect" class="input-box" style="font-weight:700;">
              <option value="CONFIRMADO">CONFIRMADO</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="EN CURSO">EN CURSO</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </div>

          <div class="turn-modal-footer" style="margin: 1.5rem -1.5rem -1.5rem -1.5rem;">
            <button type="button" class="btn btn-secondary" onclick="cancelTurnFromModal()" style="color:#ef4444;">❌ Cancelar Turno</button>
            <button type="submit" class="btn btn-primary">✓ Guardar Modificaciones</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- 2. POP-UP MODAL EMERGENTE: DETALLE DEL TURNO SOLO DETALLE (PROFESIONAL Y BREVE) -->
  <div class="turn-modal-overlay" id="turnDetailModal">
    <div class="turn-modal-card" style="max-width: 520px;">
      <div class="turn-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white;">
        <h3 style="color: white; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          📄 Detalle del Turno Médico
        </h3>
        <span class="close-modal" style="color: white;" onclick="closeDetailModal()">✕</span>
      </div>

      <div class="turn-modal-body" style="padding: 1.25rem;">

        <!-- Estado y Resumen Rápido -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: #f0f9ff; border: 1px solid #bae6fd; padding: 0.75rem 1rem; border-radius: 10px; margin-bottom: 1.25rem;">
          <div>
            <div style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Estado del Turno</div>
            <div style="margin-top: 0.2rem;" id="detailStatusBadgeContainer">
              <span class="badge badge-confirmado" id="detailStatusBadge">CONFIRMADO</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Horario Programado</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--primary);" id="detailTimeText">10:30 AM</div>
          </div>
        </div>

        <!-- Grilla de Información del Turno -->
        <div class="detail-info-grid">
          <div class="detail-info-item">
            <label>👤 Paciente</label>
            <div id="detailPatientText">Mateo Fernandez</div>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;" id="detailCoverageText">OSDE 410 • DNI: 38.452.190</span>
          </div>

          <div class="detail-info-item">
            <label>🩺 Médico Tratante</label>
            <div id="detailDoctorText">Dr. Julian Rossi</div>
            <span style="font-size: 0.72rem; color: var(--primary); font-weight: 700;" id="detailSpecText">Cardiología</span>
          </div>

          <div class="detail-info-item">
            <label>📅 Fecha de Consulta</label>
            <div id="detailDateText">24 de Octubre de 2023</div>
          </div>

          <div class="detail-info-item">
            <label>🏥 Ubicación / Consultorio</label>
            <div>Consultorio 3 • Piso 2</div>
          </div>
        </div>

        <!-- Motivo de Consulta -->
        <div style="background: var(--bg-subtle); border-left: 4px solid var(--primary); padding: 0.85rem; border-radius: 8px; margin-bottom: 1rem;">
          <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">📝 Motivo de Consulta & Notas</div>
          <p style="font-size: 0.82rem; color: var(--text-dark); margin: 0; line-height: 1.45;" id="detailReasonText">Control post-operatorio. El paciente presenta evolución favorable tras procedimiento quirúrgico.</p>
        </div>

      </div>

      <div class="turn-modal-footer" style="padding: 0.85rem 1.25rem;">
        <button type="button" class="btn btn-secondary" onclick="showToast('🖨️ Imprimiendo comprobante de turno...')">🖨️ Imprimir</button>
        <button type="button" class="btn btn-primary" onclick="closeDetailModal()">Aceptar y Cerrar</button>
      </div>
    </div>
  </div>

  <!-- MODAL DE LISTADO COMPLETO DE CLIENTES / PACIENTES -->
  <div class="turn-modal-overlay" id="allClientsModal">
    <div class="turn-modal-card client-list-modal">
      <div class="turn-modal-header">
        <h3>👥 Todos los Clientes / Pacientes Registrados</h3>
        <span class="close-modal" onclick="closeAllClientsModal()">✕</span>
      </div>
      <div class="turn-modal-body" style="padding:0; max-height:400px; overflow-y:auto;">

        <div class="client-item-card">
          <div>
            <strong style="color:#0f172a;">Juan Pérez</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(DNI: 35.123.456)</span>
            <div style="font-size:0.75rem; color:var(--text-muted);">OSDE 310 • Tel: +54 11 4567-8901</div>
          </div>
          <button class="btn btn-secondary" style="font-size:0.75rem;" onclick="closeAllClientsModal(); openDetailModal('Juan Pérez', 'Dr. Juan Pérez', 'Pediatría', '09:00 AM', '2023-10-24', 'CONFIRMADO', 'OSDE 310', 'Chequeo pediátrico anual.')">Ver Detalle</button>
        </div>

        <div class="client-item-card">
          <div>
            <strong style="color:#0f172a;">Marta Gómez</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(DNI: 12.333.444)</span>
            <div style="font-size:0.75rem; color:var(--text-muted);">IAPOS • Tel: +54 11 9876-5432</div>
          </div>
          <button class="btn btn-secondary" style="font-size:0.75rem;" onclick="closeAllClientsModal(); openDetailModal('Marta Gómez', 'Dra. Espinoza', 'Cardiología', '08:15 AM', '2023-10-24', 'CONFIRMADO', 'IAPOS', 'Control post-operatorio.')">Ver Detalle</button>
        </div>

        <div class="client-item-card">
          <div>
            <strong style="color:#0f172a;">Roberto Silva</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(DNI: 34.111.999)</span>
            <div style="font-size:0.75rem; color:var(--text-muted);">Particular • Tel: +54 11 2233-4455</div>
          </div>
          <button class="btn btn-secondary" style="font-size:0.75rem;" onclick="closeAllClientsModal(); openDetailModal('Roberto Silva', 'Dr. Sánchez', 'Clínica Médica', '11:00 AM', '2023-10-24', 'PENDIENTE', 'Particular', 'Consulta por control rutina.')">Ver Detalle</button>
        </div>

      </div>
    </div>
  </div>

  <!-- NOTIFICACIÓN TOAST -->
  <div class="toast-notification" id="toastNotif">
    <span id="toastMessage"></span>
  </div>

  <script>
    // CERRAR MODALES AL HACER CLIC EN CUALQUIER LUGAR FUERA DEL MODAL
    document.querySelectorAll('.turn-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('show');
        }
      });
    });



    function openAllClientsModal() {
      document.getElementById('allClientsModal').classList.add('show');
    }
    function closeAllClientsModal() {
      document.getElementById('allClientsModal').classList.remove('show');
    }

    // AL TOCAR UN TURNO: RESALTAR SELECCIÓN Y ABRIR MODAL DE EDICIÓN/MODIFICACIÓN
    let currentSelectedCardEl = null;
    let currentSelectedTurnoData = <?= $firstTurno ? json_encode([
        'cardId' => 'turn-' . (int) $firstTurno['id_turno'],
        'patient' => $firstTurno['paciente'],
        'doctor' => $firstTurno['medico'],
        'spec' => $firstTurno['especialidad'],
        'time' => substr((string)$firstTurno['hora'], 0, 5),
        'dateStr' => $firstTurno['fecha'],
        'status' => strtoupper((string)$firstTurno['estado']),
        'reason' => $firstTurno['motivo_consulta'] ?? 'Consulta médica programada.',
    ], JSON_UNESCAPED_UNICODE) : 'null' ?>;

    function handleCardClick(cardId, patient, doctor, spec, time, dateStr, status, cardEl) {
      // 1. Marcar el turno seleccionado visualmente
      document.querySelectorAll('.slot-box').forEach(c => c.classList.remove('selected-card-highlight'));
      if (cardEl) {
        cardEl.classList.add('selected-card-highlight');
        currentSelectedCardEl = cardEl;
      }

      currentSelectedTurnoData = { cardId, patient, doctor, spec, time, dateStr, status };

      // 2. Actualizar panel lateral de paciente
      document.getElementById('sidePatientName').textContent = patient;
      document.getElementById('sideDoctorText').textContent = `${doctor} (${spec})`;
      document.getElementById('sideTimeText').textContent = time;
      document.getElementById('sideDateText').textContent = dateStr || "";
      const sideBadge = document.getElementById('sideBadge');
      if (sideBadge) {
        sideBadge.className = `badge badge-${status.toLowerCase().replace(/[\s_]+/g, '')}`;
        sideBadge.textContent = status;
      }

      // 3. Abrir la pantalla emergente de Modificación/Ajustes
      openEditModal(cardId, patient, doctor, spec, time, dateStr, status);
    }

    function openEditModalFromSide() {
      if (currentSelectedTurnoData) {
        openEditModal(
          currentSelectedTurnoData.cardId,
          currentSelectedTurnoData.patient,
          currentSelectedTurnoData.doctor,
          currentSelectedTurnoData.spec,
          currentSelectedTurnoData.time,
          currentSelectedTurnoData.dateStr,
          currentSelectedTurnoData.status
        );
      } else {
        const firstCard = document.querySelector('.slot-box');
        if (firstCard) {
          firstCard.click();
        } else {
          showToast('⚠️ No hay turnos en esta fecha para modificar.');
        }
      }
    }

    function openEditModal(cardId, patient, doctor, spec, time, dateStr, status) {
      document.getElementById('activeCardId').value = cardId;
      document.getElementById('modalPatientInput').value = patient;
      document.getElementById('modalDoctorInput').value = doctor;
      document.getElementById('modalSpecInput').value = spec;
      document.getElementById('modalTimeInput').value = time;
      document.getElementById('modalDateInput').value = dateStr || "2023-10-24";
      document.getElementById('modalStatusSelect').value = status;

      document.querySelectorAll('.time-slot-btn').forEach(b => {
        if (b.textContent.trim() === time) {
          b.classList.add('selected');
        } else {
          b.classList.remove('selected');
        }
      });

      document.getElementById('turnEditModal').classList.add('show');
    }

    function closeEditModal() {
      document.getElementById('turnEditModal').classList.remove('show');
    }

    function selectSlotTime(timeStr, btnEl) {
      document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
      btnEl.classList.add('selected');
      document.getElementById('modalTimeInput').value = timeStr;
    }

    // ── PERSISTIR CAMBIOS EN MySQL vía endpoint JSON ─────────────────────────
    function _idTurnoReal() {
      // cardId es "turn-42", extraemos el número
      const cardId = document.getElementById('activeCardId').value || '';
      const match = cardId.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    }

    function _horaParaServidor(timeStr) {
      // Acepta "09:30 AM", "09:30", "09:30:00" → devuelve "HH:MM:SS"
      if (!timeStr) return '';
      const cleanTime = timeStr.trim();
      // Formato HH:MM AM/PM
      const ampmMatch = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (ampmMatch) {
        let h = parseInt(ampmMatch[1], 10);
        const m = ampmMatch[2];
        const period = ampmMatch[3].toUpperCase();
        if (period === 'AM' && h === 12) h = 0;
        if (period === 'PM' && h !== 12) h += 12;
        return `${String(h).padStart(2,'0')}:${m}:00`;
      }
      // Formato HH:MM
      if (/^\d{2}:\d{2}$/.test(cleanTime)) return cleanTime + ':00';
      // Formato HH:MM:SS
      if (/^\d{2}:\d{2}:\d{2}$/.test(cleanTime)) return cleanTime;
      return cleanTime;
    }

    function _estadoParaServidor(statusStr) {
      const map = { 'CONFIRMADO': 'confirmado', 'PENDIENTE': 'pendiente', 'EN CURSO': 'en_curso', 'ATENDIDO': 'atendido', 'CANCELADO': 'cancelado' };
      return map[statusStr.toUpperCase()] || statusStr.toLowerCase();
    }

    async function _apiTurno(accion, extraData = {}) {
      const id = _idTurnoReal();
      if (!id) { showToast('⚠️ No se identificó el turno.'); return false; }
      const body = new URLSearchParams({ accion, id_turno: id, ...extraData });
      try {
        const res = await fetch('api_turno.php', { method: 'POST', body });
        const data = await res.json();
        if (!data.ok) { showToast('❌ ' + (data.error || 'Error desconocido.')); return false; }
        return true;
      } catch (err) {
        showToast('❌ Error de red. Intentá nuevamente.');
        return false;
      }
    }

    // APLICAR Y GUARDAR CAMBIOS REALES EN MySQL + VISTA DIARIA
    async function saveModalChanges(e) {
      e.preventDefault();
      const cardId = document.getElementById('activeCardId').value;
      const patient = document.getElementById('modalPatientInput').value;
      const doctor = document.getElementById('modalDoctorInput').value;
      const spec = document.getElementById('modalSpecInput').value;
      const time = document.getElementById('modalTimeInput').value;
      const dateVal = document.getElementById('modalDateInput').value;
      const status = document.getElementById('modalStatusSelect').value;

      if (!dateVal) { showToast('⚠️ Seleccioná una fecha.'); return; }
      if (!time)    { showToast('⚠️ Seleccioná un horario.'); return; }

      const ok = await _apiTurno('modificar', {
        fecha:  dateVal,
        hora:   _horaParaServidor(time),
        estado: _estadoParaServidor(status),
      });

      if (!ok) return; // Error ya mostrado por _apiTurno

      // Actualizar vista local
      const cardEl = document.getElementById(cardId);
      if (cardEl) {
        const titleEl = cardEl.querySelector('.card-title-text');
        const docEl = cardEl.querySelector('.card-doc-text');
        const badgeEl = cardEl.querySelector('.card-badge');
        if (titleEl) titleEl.textContent = `${time} | ${patient}`;
        if (docEl) docEl.textContent = `${doctor} (${spec}) • Consultorio Asignado`;
        cardEl.setAttribute('data-spec', spec);
        cardEl.classList.remove('green', 'blue', 'purple', 'canc', 'selected');
        if (badgeEl) {
          badgeEl.classList.remove('badge-confirmado', 'badge-pendiente', 'badge-encurso', 'badge-cancelado', 'badge-atendido');
          const statusMap = {
            'CONFIRMADO': ['green','badge-confirmado'],
            'PENDIENTE':  ['selected','badge-pendiente'],
            'EN CURSO':   ['purple','badge-encurso'],
            'ATENDIDO':   ['blue','badge-atendido'],
            'CANCELADO':  ['canc','badge-cancelado'],
          };
          const [cls, badgeCls] = statusMap[status.toUpperCase()] || ['',''];
          if (cls) cardEl.classList.add(cls);
          badgeEl.classList.add(badgeCls);
          badgeEl.textContent = status;
        }
        document.getElementById('sidePatientName').textContent = patient;
        document.getElementById('sideDoctorText').textContent = doctor;
        document.getElementById('sideTimeText').textContent = time;
        document.getElementById('sideDateText').textContent = dateVal;
      }

      closeEditModal();
      showToast(`✅ Turno guardado en base de datos. ${patient} — ${time} (${dateVal})`);

      // Recargar página para sincronizar con MySQL si cambió la fecha
      const currentFecha = new URLSearchParams(window.location.search).get('fecha') || '';
      if (dateVal !== currentFecha && currentFecha !== '') {
        setTimeout(() => { window.location.reload(); }, 1200);
      }
    }

    async function cancelTurnFromModal() {
      if (!confirm('¿Confirmar cancelación de este turno? Esta acción se guardará en la base de datos.')) return;

      const ok = await _apiTurno('cancelar');
      if (!ok) return;

      // Actualizar vista local
      const cardId = document.getElementById('activeCardId').value;
      const cardEl = document.getElementById(cardId);
      if (cardEl) {
        cardEl.classList.remove('green', 'blue', 'purple', 'selected');
        cardEl.classList.add('canc');
        const badgeEl = cardEl.querySelector('.card-badge');
        if (badgeEl) {
          badgeEl.className = 'badge badge-cancelado card-badge';
          badgeEl.textContent = 'CANCELADO';
        }
      }
      document.getElementById('modalStatusSelect').value = 'CANCELADO';
      closeEditModal();
      showToast('✅ Turno cancelado y guardado en base de datos.');
    }

    function openDetailModalFromTop() {
      if (currentSelectedTurnoData) {
        openDetailModal(
          currentSelectedTurnoData.patient,
          currentSelectedTurnoData.doctor,
          currentSelectedTurnoData.spec,
          currentSelectedTurnoData.time,
          currentSelectedTurnoData.dateStr,
          currentSelectedTurnoData.status,
          'Paciente Registrado',
          currentSelectedTurnoData.reason || 'Consulta médica programada.'
        );
      } else {
        const firstCard = document.querySelector('.slot-box');
        if (firstCard) {
          firstCard.click();
        } else {
          showToast('⚠️ No hay turnos en esta fecha para ver detalle.');
        }
      }
    }

    function openDetailModal(patient, doctor, spec, time, dateStr, status, coverage, reason) {
      document.getElementById('detailPatientText').textContent = patient;
      document.getElementById('detailDoctorText').textContent = doctor;
      document.getElementById('detailSpecText').textContent = spec;
      document.getElementById('detailTimeText').textContent = time;
      document.getElementById('detailDateText').textContent = dateStr || "24 de Octubre de 2023";
      document.getElementById('detailCoverageText').textContent = `${coverage || 'OSDE 410'} • DNI Registrado`;
      document.getElementById('detailReasonText').textContent = reason || "Consulta médica programada en agenda.";

      const badge = document.getElementById('detailStatusBadge');
      badge.className = 'badge';
      if (status === 'CONFIRMADO') badge.classList.add('badge-confirmado');
      else if (status === 'PENDIENTE') badge.classList.add('badge-pendiente');
      else if (status === 'EN CURSO') badge.classList.add('badge-encurso');
      else if (status === 'CANCELADO') badge.classList.add('badge-cancelado');
      badge.textContent = status;

      document.getElementById('turnDetailModal').classList.add('show');
    }

    function closeDetailModal() {
      document.getElementById('turnDetailModal').classList.remove('show');
    }

    function handleDragStart(e) {
      e.dataTransfer.setData('text/plain', e.target.id);
      e.target.style.opacity = '0.5';
    }

    function allowDrop(e) {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    function handleDrop(e, targetTime) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      const cardId = e.dataTransfer.getData('text/plain');
      const cardEl = document.getElementById(cardId);

      if (cardEl) {
        cardEl.style.opacity = '1';
        e.currentTarget.appendChild(cardEl);
        showToast(`↔️ Turno reprogramado exitosamente al bloque de las ${targetTime}`);
      }
    }

    document.addEventListener('dragend', (e) => {
      if (e.target && e.target.style) {
        e.target.style.opacity = '1';
      }
    });

    function showToast(msg) {
      const toast = document.getElementById('toastNotif');
      document.getElementById('toastMessage').textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3500);
    }
  </script>
  <script>
    // ── BÚSQUEDA Y FILTRADO EN TIEMPO REAL DEL CALENDARIO DIARIO ───────────────
    function normalizeSearchValue(value) {
      if (!value) return '';
      return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function filterDailyTurnos() {
      const searchInput = document.getElementById('turnosSearch');
      const specFilter = document.getElementById('specFilterSelectDaily');
      const searchEmpty = document.getElementById('searchEmpty');
      const dailyCards = document.querySelectorAll('.slot-box');

      const query = searchInput ? normalizeSearchValue(searchInput.value) : '';
      const specialty = specFilter ? specFilter.value : 'ALL';

      let visible = 0;

      dailyCards.forEach(function (card) {
        const cardSearchText = normalizeSearchValue(
          (card.getAttribute('data-search') || '') + ' ' + (card.textContent || '')
        );
        const cardSpec = card.getAttribute('data-spec') || '';

        const matchesText = query === '' || cardSearchText.includes(query);
        const matchesSpec = specialty === 'ALL' || cardSpec === specialty;
        const show = matchesText && matchesSpec;

        const row = card.closest('.slot-row');
        if (row) {
          row.style.display = show ? '' : 'none';
        }
        if (show) {
          visible++;
        }
      });

      if (searchEmpty) {
        searchEmpty.style.display = (dailyCards.length > 0 && visible === 0) ? 'block' : 'none';
      }
    }

    // Registrar eventos para el buscador y el selector de especialidad
    document.addEventListener('DOMContentLoaded', function () {
      const turnosSearch = document.getElementById('turnosSearch');
      const specFilterSelectDaily = document.getElementById('specFilterSelectDaily');

      if (turnosSearch) {
        turnosSearch.addEventListener('input', filterDailyTurnos);
        turnosSearch.addEventListener('keyup', filterDailyTurnos);
        turnosSearch.addEventListener('search', filterDailyTurnos);
      }
      if (specFilterSelectDaily) {
        specFilterSelectDaily.addEventListener('change', function () {
          filterDailyTurnos();
          if (this.value !== 'ALL') {
            showToast(`🩺 Filtrando por especialidad: ${this.value}`);
          }
        });
      }
    });

    // Vinculación directa si el script corre al final del DOM
    const turnosSearchEl = document.getElementById('turnosSearch');
    if (turnosSearchEl) {
      turnosSearchEl.addEventListener('input', filterDailyTurnos);
      turnosSearchEl.addEventListener('keyup', filterDailyTurnos);
      turnosSearchEl.addEventListener('search', filterDailyTurnos);
    }
    const specFilterEl = document.getElementById('specFilterSelectDaily');
    if (specFilterEl) {
      specFilterEl.addEventListener('change', function () {
        filterDailyTurnos();
        if (this.value !== 'ALL') {
          showToast(`🩺 Filtrando por especialidad: ${this.value}`);
        }
      });
    }
  </script>
</body>
</html>
