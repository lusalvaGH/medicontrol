<?php

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/turnos.php';

requireRole('recepcionista');

$nombreUsuario = trim((string) ($_SESSION['nombre'] ?? ''));
$apellidoUsuario = trim((string) ($_SESSION['apellido'] ?? ''));
$usuarioActual = trim($nombreUsuario . ' ' . $apellidoUsuario);
$usuarioActual = $usuarioActual !== '' ? $usuarioActual : 'Recepción';

// ──────────────────────────────────────────────
// SEMANA SELECCIONADA (?semana=YYYY-MM-DD, cualquier día de la semana; por defecto, la actual)
// La semana va de lunes a domingo. Los turnos se cargan desde la API (GET /api/turnos?desde=&hasta=).
// ──────────────────────────────────────────────
$hoy = turnosHoy();
$semanaParam = isset($_GET['semana']) && is_string($_GET['semana']) ? trim($_GET['semana']) : '';
$semanaMensaje = null;
$referencia = $hoy;
if ($semanaParam !== '') {
    if (turnosFechaValida($semanaParam)) {
        $referencia = new DateTimeImmutable($semanaParam, $hoy->getTimezone());
    } else {
        $semanaMensaje = 'La fecha indicada no es válida. Se muestra la semana actual.';
    }
}
$lunes = $referencia->modify('-' . ((int) $referencia->format('N') - 1) . ' days');
$domingo = $lunes->modify('+6 days');

$diasSemanaES = [1 => 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
$mesesES = [1 => 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
$fechaLarga = static fn (DateTimeImmutable $d): string => (int) $d->format('j') . ' de ' . $mesesES[(int) $d->format('n')];
$tituloSemana = 'Semana del ' . $fechaLarga($lunes)
    . ($lunes->format('Y') !== $domingo->format('Y') ? ' de ' . $lunes->format('Y') : '')
    . ' al ' . $fechaLarga($domingo) . ' de ' . $domingo->format('Y');

$diasDeLaSemana = [];
for ($i = 0; $i < 7; $i++) {
    $dia = $lunes->modify("+{$i} days");
    $diasDeLaSemana[] = [
        'fecha'  => $dia->format('Y-m-d'),
        'nombre' => $diasSemanaES[(int) $dia->format('N')] . ' ' . $dia->format('j'),
        'mes'    => ucfirst($mesesES[(int) $dia->format('n')]),
        'esHoy'  => $dia->format('Y-m-d') === $hoy->format('Y-m-d'),
    ];
}
$semanaAnterior = $lunes->modify('-7 days')->format('Y-m-d');
$semanaSiguiente = $lunes->modify('+7 days')->format('Y-m-d');
$e = static fn (string $texto): string => htmlspecialchars($texto, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediCore Health - Gestión de Turnos (Semana)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* ==========================================================================
       10A - GESTIÓN DE TURNOS (SEMANA) | MEDICORE HEALTH
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

    /* GRID & CARDS */
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    .card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-color);
      padding: 1.5rem;
      box-shadow: var(--shadow-sm);
      margin-bottom: 1.5rem;
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

    /* VISTA SEMANAL */
    .weekly-grid-container { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.85rem; overflow-x: auto; margin-bottom: 2rem; }
    .week-col { background: white; border: 2px dashed transparent; border-radius: 12px; padding: 1rem 0.75rem; min-width: 180px; min-height: 480px; transition: all 0.2s; }
    .week-col-header { text-align: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 0.85rem; user-select: none; }
    .week-col-header h3 { font-size: 0.95rem; font-weight: 800; color: #0f172a; }
    .week-col-header p { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
    
    .week-slot-card { background: var(--bg-subtle); border-left: 4px solid var(--primary); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; font-size: 0.8rem; cursor: grab; transition: all 0.2s; box-shadow: var(--shadow-sm); }
    .week-slot-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .week-slot-card.conf { border-left-color: #15803d; background: #f0fdf4; }
    .week-slot-card.pend { border-left-color: #b45309; background: #fffbeb; }
    .week-slot-card.encurso { border-left-color: #3730a3; background: #f5f3ff; }
    .week-slot-card.canc { border-left-color: #b91c1c; background: #fef2f2; }
    .week-slot-card.atendido { border-left-color: #0369a1; background: #f0f9ff; }
    .week-slot-card { cursor: pointer; }
    .week-col.today { border-color: var(--primary); }
    .week-col-header a { color: inherit; text-decoration: none; }
    .week-col-header a:hover h3 { color: var(--primary); text-decoration: underline; }
    .week-empty { font-size: 0.75rem; color: var(--text-light); text-align: center; padding: 0.75rem 0; }
    .week-status { grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--text-muted); font-weight: 600; font-size: 0.88rem; }
    .week-status.error { color: #991b1b; background: #fee2e2; border-radius: 10px; }
    .alert-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem; }
    .week-slot-card.selected-card-highlight {
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
    .badge-atendido { background: var(--status-att-bg); color: var(--status-att-text); }

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
      .grid-4 { grid-template-columns: repeat(2, 1fr); }
      .weekly-grid-container { gap: 0.5rem; }
    }
    @media (max-width: 767px) {
      header { flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; }
      .search-input { width: 100%; }
      .page-padding { padding: 1rem 0.75rem; }
      .grid-4 { grid-template-columns: 1fr; }
      .filter-bar-card { flex-direction: column; align-items: flex-start; }
      .full-time-grid { grid-template-columns: repeat(3, 1fr); }
    }
    .search-empty { display:none; padding:1rem; margin-top:1rem; border:1px dashed var(--border-dark); border-radius:8px; color:var(--text-muted); text-align:center; }
  </style>
</head>
<body>

  <div class="app-container">
    <!-- Main Content Area -->
    <div class="main-area">
      <header>
        <div class="search-input">
          🔍 <input id="turnosSearch" type="search" placeholder="Buscar paciente o médico..." autocomplete="off">
        </div>
        <div style="font-size:0.85rem; font-weight:700; color:var(--primary);"><?= $e($usuarioActual) ?> (RECEPCIÓN) · <a href="../logout.php" style="color:var(--primary); text-decoration:none;">Cerrar sesión</a></div>
      </header>

      <div class="page-padding">

        <?php if ($semanaMensaje !== null): ?>
          <div class="alert-warning">⚠️ <?= $e($semanaMensaje) ?></div>
        <?php endif; ?>

        <!-- Stats de la Semana (se calculan con los turnos reales de la API) -->
        <div class="grid-4" style="margin-bottom: 1.5rem;">
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Turnos de la Semana</div>
              <div style="font-size:1.6rem; font-weight:800; color:#0f172a; margin-top:0.2rem;" id="statTotal">—</div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Confirmados</div>
              <div style="font-size:1.6rem; font-weight:800; color:#166534; margin-top:0.2rem;" id="statConfirmado">—</div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Pendientes</div>
              <div style="font-size:1.6rem; font-weight:800; color:#b45309; margin-top:0.2rem;" id="statPendiente">—</div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">En Curso</div>
              <div style="font-size:1.6rem; font-weight:800; color:#3730a3; margin-top:0.2rem;" id="statEnCurso">—</div>
            </div>
          </div>
        </div>

        <!-- BARRA DE FILTRADO DE ESPECIALIDAD -->
        <div class="filter-bar-card">
          <div class="spec-selector">
            <span style="font-size:0.82rem; font-weight:800; color:#0f172a;">🩺 Especialidad:</span>
            <select class="spec-select-input" id="specFilterSelect">
              <option value="ALL">Todas las Especialidades</option>
            </select>
          </div>

          <div style="display:flex; gap:0.75rem; align-items:center;">
            <div class="drag-hint">🤚 Tocá un turno para ver su detalle. Para modificarlo o cancelarlo, abrilo en la vista Día.</div>
          </div>
        </div>

        <!-- Controls / Switch Vistas -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:0.75rem;">
          <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
            <a href="recepcionista_turno_nuevo.php" class="btn btn-primary">⊕ Registrar Turno</a>
            <button class="btn btn-secondary" onclick="openDetailModalFromTop()">📄 Detalle del Turno</button>
            <a href="recepcionista_semana.php?semana=<?= $e($semanaAnterior) ?>" class="btn btn-secondary" style="padding:0.45rem 0.75rem;" aria-label="Semana anterior">‹</a>
            <span style="font-size:0.95rem; font-weight:800; color:#0f172a;" id="tituloSemana"><?= $e($tituloSemana) ?></span>
            <a href="recepcionista_semana.php?semana=<?= $e($semanaSiguiente) ?>" class="btn btn-secondary" style="padding:0.45rem 0.75rem;" aria-label="Semana siguiente">›</a>
            <a href="recepcionista_semana.php" class="btn btn-secondary" style="font-size:0.78rem;">Esta semana</a>
            <input type="date" value="<?= $e($lunes->format('Y-m-d')) ?>" aria-label="Ir a la semana de una fecha" onchange="if (this.value) window.location.href='recepcionista_semana.php?semana='+encodeURIComponent(this.value)" style="border:1px solid var(--border-dark); border-radius:var(--radius-md); padding:0.35rem 0.6rem; font-size:0.8rem; font-weight:700; color:var(--text-dark); background:var(--bg-subtle); cursor:pointer;">
          </div>

          <div class="view-tabs">
            <a href="recepcionista.php" class="tab-btn">Día</a>
            <a href="recepcionista_semana.php" class="tab-btn active">Semana</a>
            <a href="recepcionista_mes.php?mes=<?= $e($lunes->format('Y-m')) ?>" class="tab-btn">Mes</a>
          </div>
        </div>

        <!-- GRILLA SEMANAL (lunes a domingo); las tarjetas se cargan desde la API -->
        <div class="weekly-grid-container" id="weeklyGridContainer"
             data-desde="<?= $e($lunes->format('Y-m-d')) ?>" data-hasta="<?= $e($domingo->format('Y-m-d')) ?>">
          <?php foreach ($diasDeLaSemana as $dia): ?>
            <div class="week-col<?= $dia['esHoy'] ? ' today' : '' ?>" data-fecha="<?= $e($dia['fecha']) ?>">
              <div class="week-col-header">
                <a href="recepcionista.php?fecha=<?= $e($dia['fecha']) ?>" title="Abrir este día en la vista Día">
                  <h3><?= $e($dia['nombre']) ?><?= $dia['esHoy'] ? ' · Hoy' : '' ?></h3>
                  <p><?= $e($dia['mes']) ?></p>
                </a>
              </div>
              <div class="week-col-body"><div class="week-empty">Cargando…</div></div>
            </div>
          <?php endforeach; ?>
        </div>

      </div>
    </div>
  </div>

  <!-- DETALLE DEL TURNO (solo lectura, con datos reales) -->
  <div class="turn-modal-overlay" id="turnDetailModal">
    <div class="turn-modal-card" style="max-width: 520px;">
      <div class="turn-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white;">
        <h3 style="color: white; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          📄 Detalle del Turno Médico
        </h3>
        <span class="close-modal" style="color: white;" onclick="closeDetailModal()">✕</span>
      </div>

      <div class="turn-modal-body" style="padding: 1.25rem;">

        <div style="display: flex; justify-content: space-between; align-items: center; background: #f0f9ff; border: 1px solid #bae6fd; padding: 0.75rem 1rem; border-radius: 10px; margin-bottom: 1.25rem;">
          <div>
            <div style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Estado del Turno</div>
            <div style="margin-top: 0.2rem;">
              <span class="badge" id="detailStatusBadge"></span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Horario Programado</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: var(--primary);" id="detailTimeText"></div>
          </div>
        </div>

        <div class="detail-info-grid">
          <div class="detail-info-item">
            <label>👤 Paciente</label>
            <div id="detailPatientText"></div>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;" id="detailCoverageText"></span>
          </div>

          <div class="detail-info-item">
            <label>🩺 Médico Tratante</label>
            <div id="detailDoctorText"></div>
            <span style="font-size: 0.72rem; color: var(--primary); font-weight: 700;" id="detailSpecText"></span>
          </div>

          <div class="detail-info-item">
            <label>📅 Día / Fecha</label>
            <div id="detailDateText"></div>
          </div>

          <div class="detail-info-item">
            <label>🆔 Turno</label>
            <div id="detailIdText"></div>
          </div>
        </div>

        <div style="background: var(--bg-subtle); border-left: 4px solid var(--primary); padding: 0.85rem; border-radius: 8px; margin-bottom: 1rem;">
          <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">📝 Motivo de Consulta</div>
          <p style="font-size: 0.82rem; color: var(--text-dark); margin: 0; line-height: 1.45;" id="detailReasonText"></p>
        </div>

      </div>

      <div class="turn-modal-footer" style="padding: 0.85rem 1.25rem;">
        <a class="btn btn-secondary" id="detailOpenDayLink" href="recepcionista.php">📅 Modificar en vista Día</a>
        <button type="button" class="btn btn-secondary" id="detailCancelBtn" onclick="cancelarTurnoSeleccionado()" style="color:#ef4444;">❌ Cancelar turno</button>
        <button type="button" class="btn btn-primary" onclick="closeDetailModal()">Cerrar</button>
      </div>
    </div>
  </div>

  <!-- NOTIFICACIÓN TOAST -->
  <div class="toast-notification" id="toastNotif">
    <span id="toastMessage"></span>
  </div>

  <script src="../app/assets/js/api.js"></script>
  <script>
    const ESTADOS = <?= json_encode(TURNOS_ESTADOS, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;
    const TRANSICIONES = <?= json_encode(TURNOS_TRANSICIONES, JSON_HEX_TAG) ?>;
    const CLASE_TARJETA = { pendiente: 'pend', confirmado: 'conf', en_curso: 'encurso', atendido: 'atendido', cancelado: 'canc' };
    const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

    const grilla = document.getElementById('weeklyGridContainer');
    const specFilterSelect = document.getElementById('specFilterSelect');
    const turnosSearch = document.getElementById('turnosSearch');

    let turnosPorId = {};
    let turnoSeleccionado = null;

    // CERRAR MODALES AL HACER CLIC FUERA
    document.querySelectorAll('.turn-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    });

    function etiquetaEstado(estado) {
      return String(ESTADOS[estado] || estado).toUpperCase();
    }

    function fechaLegible(fecha) {
      const [a, m, d] = fecha.split('-').map(Number);
      const dia = new Date(a, m - 1, d).getDay();
      return `${DIAS[dia].charAt(0).toUpperCase() + DIAS[dia].slice(1)} ${d} de ${MESES[m]} de ${a}`;
    }

    function crearTarjeta(t) {
      const card = document.createElement('div');
      card.className = 'week-slot-card ' + (CLASE_TARJETA[t.estado] || '');
      card.id = 'turn-' + t.id_turno;
      card.dataset.idTurno = t.id_turno;
      card.dataset.spec = t.especialidad || '';
      card.dataset.search = [t.paciente, t.paciente_dni, t.medico, t.especialidad, t.motivo_consulta].join(' ');

      const nombre = document.createElement('div');
      nombre.className = 'card-patient-name';
      nombre.style.cssText = 'font-weight:800; color:#0f172a;';
      nombre.textContent = t.paciente;

      const medico = document.createElement('div');
      medico.className = 'card-doc-info';
      medico.style.cssText = 'font-size:0.72rem; color:var(--text-muted);';
      medico.textContent = `${t.medico} • ${t.especialidad}`;

      const pie = document.createElement('div');
      pie.style.cssText = 'margin-top:0.4rem; display:flex; justify-content:space-between; align-items:center;';
      const hora = document.createElement('strong');
      hora.className = 'card-time';
      hora.textContent = t.hora;
      const badge = document.createElement('span');
      badge.className = 'badge card-badge badge-' + t.estado.replace(/_/g, '');
      badge.textContent = etiquetaEstado(t.estado);
      pie.append(hora, badge);

      card.append(nombre, medico, pie);
      card.addEventListener('click', () => seleccionarTurno(t.id_turno, true));
      return card;
    }

    function mostrarEstadoGrilla(mensaje, esError) {
      grilla.querySelectorAll('.week-col-body').forEach(b => { b.innerHTML = ''; });
      let aviso = grilla.querySelector('.week-status');
      if (!aviso) {
        aviso = document.createElement('div');
        grilla.prepend(aviso);
      }
      aviso.className = 'week-status' + (esError ? ' error' : '');
      aviso.textContent = mensaje;
    }

    function renderizarSemana(turnos) {
      turnosPorId = {};
      const porFecha = {};
      turnos.forEach(t => {
        turnosPorId[t.id_turno] = t;
        (porFecha[t.fecha] = porFecha[t.fecha] || []).push(t);
      });

      grilla.querySelectorAll('.week-col').forEach(col => {
        const cuerpo = col.querySelector('.week-col-body');
        cuerpo.innerHTML = '';
        const delDia = porFecha[col.dataset.fecha] || [];
        if (delDia.length === 0) {
          const vacio = document.createElement('div');
          vacio.className = 'week-empty';
          vacio.textContent = 'Sin turnos';
          cuerpo.appendChild(vacio);
        }
        delDia.forEach(t => cuerpo.appendChild(crearTarjeta(t)));
      });

      const contar = estado => turnos.filter(t => t.estado === estado).length;
      document.getElementById('statTotal').textContent = turnos.length;
      document.getElementById('statConfirmado').textContent = contar('confirmado');
      document.getElementById('statPendiente').textContent = contar('pendiente');
      document.getElementById('statEnCurso').textContent = contar('en_curso');

      // Opciones del filtro: solo especialidades presentes en la semana
      const actual = specFilterSelect.value;
      specFilterSelect.length = 1;
      [...new Set(turnos.map(t => t.especialidad).filter(Boolean))].sort().forEach(esp => {
        specFilterSelect.add(new Option(esp, esp));
      });
      specFilterSelect.value = [...specFilterSelect.options].some(o => o.value === actual) ? actual : 'ALL';
      aplicarFiltros();
    }

    function aplicarFiltros() {
      const esp = specFilterSelect.value;
      const termino = normalizar(turnosSearch.value.trim());
      grilla.querySelectorAll('.week-slot-card').forEach(card => {
        const coincideEsp = esp === 'ALL' || card.dataset.spec === esp;
        const coincideTexto = termino === '' || normalizar(card.dataset.search).includes(termino);
        card.style.display = coincideEsp && coincideTexto ? '' : 'none';
      });
    }

    function normalizar(valor) {
      return String(valor || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    function seleccionarTurno(idTurno, abrirDetalle) {
      grilla.querySelectorAll('.week-slot-card').forEach(c => c.classList.remove('selected-card-highlight'));
      const card = document.getElementById('turn-' + idTurno);
      if (card) card.classList.add('selected-card-highlight');
      turnoSeleccionado = turnosPorId[idTurno] || null;
      if (abrirDetalle && turnoSeleccionado) openDetailModal(turnoSeleccionado);
    }

    function openDetailModalFromTop() {
      if (turnoSeleccionado) {
        openDetailModal(turnoSeleccionado);
      } else {
        showToast('⚠️ Seleccioná un turno de la semana para ver su detalle.');
      }
    }

    function openDetailModal(t) {
      const badge = document.getElementById('detailStatusBadge');
      badge.className = 'badge badge-' + t.estado.replace(/_/g, '');
      badge.textContent = etiquetaEstado(t.estado);
      document.getElementById('detailTimeText').textContent = t.hora;
      document.getElementById('detailPatientText').textContent = t.paciente;
      document.getElementById('detailCoverageText').textContent = `${t.obra_social || 'Particular'} • DNI: ${t.paciente_dni}`;
      document.getElementById('detailDoctorText').textContent = t.medico;
      document.getElementById('detailSpecText').textContent = t.especialidad;
      document.getElementById('detailDateText').textContent = fechaLegible(t.fecha);
      document.getElementById('detailIdText').textContent = '#' + t.id_turno;
      document.getElementById('detailReasonText').textContent = t.motivo_consulta || 'Sin motivo informado';
      document.getElementById('detailOpenDayLink').href = 'recepcionista.php?fecha=' + encodeURIComponent(t.fecha);
      // Solo se ofrece cancelar si el estado actual lo permite (las mismas reglas que valida la API)
      document.getElementById('detailCancelBtn').style.display = (TRANSICIONES[t.estado] || []).includes('cancelado') ? '' : 'none';
      document.getElementById('turnDetailModal').classList.add('show');
    }

    async function cancelarTurnoSeleccionado() {
      if (!turnoSeleccionado) return;
      if (!confirm('¿Confirmar la cancelación de este turno? El cambio se guarda en la base de datos.')) return;
      const boton = document.getElementById('detailCancelBtn');
      boton.disabled = true;
      try {
        await MediApi.post('turnos/' + turnoSeleccionado.id_turno + '/cancelacion');
        closeDetailModal();
        showToast('✅ Turno cancelado y guardado en la base de datos.');
        await cargarSemana();
        seleccionarTurno(turnoSeleccionado.id_turno, false);
      } catch (err) {
        showToast('❌ ' + (err.message || 'No se pudo cancelar el turno.'));
      } finally {
        boton.disabled = false;
      }
    }

    function closeDetailModal() {
      document.getElementById('turnDetailModal').classList.remove('show');
    }

    function showToast(msg) {
      const toast = document.getElementById('toastNotif');
      document.getElementById('toastMessage').textContent = msg;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 3500);
    }

    specFilterSelect.addEventListener('change', aplicarFiltros);
    turnosSearch.addEventListener('input', aplicarFiltros);

    // Carga de los turnos reales de la semana (GET /api/turnos?desde=&hasta=)
    async function cargarSemana() {
      try {
        const data = await MediApi.get('turnos', { desde: grilla.dataset.desde, hasta: grilla.dataset.hasta });
        grilla.querySelector('.week-status')?.remove();
        renderizarSemana(data.turnos);
      } catch (err) {
        if (err.estado === 401) {
          mostrarEstadoGrilla('Tu sesión terminó. Volvé a iniciar sesión para ver la agenda.', true);
        } else {
          mostrarEstadoGrilla('⚠️ ' + (err.message || 'No se pudieron cargar los turnos de la semana.'), true);
        }
        ['statTotal', 'statConfirmado', 'statPendiente', 'statEnCurso'].forEach(id => { document.getElementById(id).textContent = '—'; });
      }
    }
    cargarSemana();
  </script>
</body>
</html>
