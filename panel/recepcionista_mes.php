<?php

declare(strict_types=1);

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$nombreUsuario  = trim((string) ($_SESSION['nombre']   ?? ''));
$apellidoUsuario = trim((string) ($_SESSION['apellido'] ?? ''));
$usuarioActual  = trim($nombreUsuario . ' ' . $apellidoUsuario);
$usuarioActual  = $usuarioActual !== '' ? $usuarioActual : 'Recepción';

// ──────────────────────────────────────────────
// PARÁMETRO DE MES (YYYY-MM, por defecto el mes actual)
// ──────────────────────────────────────────────
$mesParam = trim((string) ($_GET['mes'] ?? ''));
if (!preg_match('/^\d{4}-\d{2}$/', $mesParam)) {
    $mesParam = date('Y-m');
}
[$anioActual, $mesActual] = array_map('intval', explode('-', $mesParam));

$primerDiaObj = DateTimeImmutable::createFromFormat('!Y-m', $mesParam);
if (!$primerDiaObj) {
    $mesParam     = date('Y-m');
    [$anioActual, $mesActual] = array_map('intval', explode('-', $mesParam));
    $primerDiaObj = new DateTimeImmutable('first day of this month midnight');
}

$ultimoDiaObj    = $primerDiaObj->modify('last day of this month midnight');
$diasEnElMes     = (int) $primerDiaObj->format('t');
$diaSemanaInicio = (int) $primerDiaObj->format('N'); // 1=Lun … 7=Dom

// Mes anterior / siguiente para navegación
$mesAnteriorObj = $primerDiaObj->modify('-1 month');
$mesSiguienteObj = $primerDiaObj->modify('+1 month');
$mesAnteriorParam  = $mesAnteriorObj->format('Y-m');
$mesSiguienteParam = $mesSiguienteObj->format('Y-m');

// Nombre del mes en español
$mesesES = [
    1 => 'Enero', 2 => 'Febrero', 3 => 'Marzo', 4 => 'Abril',
    5 => 'Mayo', 6 => 'Junio', 7 => 'Julio', 8 => 'Agosto',
    9 => 'Septiembre', 10 => 'Octubre', 11 => 'Noviembre', 12 => 'Diciembre',
];
$nombreMes = $mesesES[$mesActual] . ' ' . $anioActual;

// ──────────────────────────────────────────────
// CONSULTA: Conteo de turnos por día del mes
// ──────────────────────────────────────────────
$conteoPorDia = [];
$queryError   = null;

try {
    $stmt = $pdo->prepare("
        SELECT
            DAY(fecha) AS dia,
            COUNT(*) AS total,
            SUM(estado = 'confirmado') AS confirmados,
            SUM(estado = 'pendiente')  AS pendientes,
            SUM(estado = 'en_curso')   AS en_curso,
            SUM(estado = 'cancelado')  AS cancelados,
            SUM(estado = 'atendido')   AS atendidos
        FROM turnos
        WHERE YEAR(fecha) = :anio AND MONTH(fecha) = :mes
        GROUP BY DAY(fecha)
        ORDER BY DAY(fecha)
    ");
    $stmt->execute([':anio' => $anioActual, ':mes' => $mesActual]);
    foreach ($stmt->fetchAll() as $row) {
        $conteoPorDia[(int) $row['dia']] = $row;
    }
} catch (PDOException $e) {
    $queryError = 'No se pudo cargar el calendario. Verificá la conexión a la base de datos.';
}

// Stats del mes
$statTotal      = 0;
$statConfirmado = 0;
$statPendiente  = 0;
$statEnCurso    = 0;
foreach ($conteoPorDia as $d) {
    $statTotal      += (int) $d['total'];
    $statConfirmado += (int) $d['confirmados'];
    $statPendiente  += (int) $d['pendientes'];
    $statEnCurso    += (int) $d['en_curso'];
}

$hoy = date('Y-m-d');
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediCore Health - Gestión de Turnos (Mes)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* ==========================================================================
       10B - GESTIÓN DE TURNOS (MES) | MEDICORE HEALTH
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
      --status-encurso-bg: #e0e7ff;
      --status-encurso-text: #3730a3;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.03);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.05);
      --shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.15);
    }

    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body { background-color: var(--bg-main); color: var(--text-main); min-height: 100vh; line-height: 1.5; -webkit-font-smoothing: antialiased; }

    /* ESTRUCTURA */
    .app-container { display: flex; min-height: 100vh; }
    .main-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    header { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    .search-input { display: flex; align-items: center; gap: 0.5rem; background: var(--bg-subtle); border: 1px solid var(--border-color); padding: 0.5rem 0.85rem; border-radius: var(--radius-md); width: 340px; font-size: 0.82rem; }
    .search-input input { border: none; background: transparent; outline: none; width: 100%; font-size: 0.82rem; color: var(--text-main); }
    .page-padding { padding: 2rem; flex: 1; }

    /* STATS */
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .stat-card { background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); padding: 1.25rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }

    /* VISTA MENSUAL */
    .month-grid-container { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; margin-bottom: 2rem; }
    .month-day-header { text-align: center; font-weight: 800; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; padding: 0.5rem; background: white; border-radius: 6px; border: 1px solid var(--border-color); }
    .month-day-card { background: white; border: 1px solid var(--border-color); border-radius: 10px; padding: 0.6rem; min-height: 105px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s; cursor: pointer; }
    .month-day-card:hover { border-color: var(--primary); box-shadow: var(--shadow-sm); transform: translateY(-2px); }
    .month-day-card.other-month { background: var(--bg-subtle); opacity: 0.45; cursor: default; pointer-events: none; }
    .month-day-card.today { border-color: var(--primary); background: var(--primary-subtle); }
    .month-day-card.selected-day { border: 2px solid var(--primary); box-shadow: 0 0 0 3px rgba(0,71,151,0.12); }
    .month-day-number { font-size: 0.9rem; font-weight: 800; color: #0f172a; }
    .month-day-card.today .month-day-number { color: var(--primary); }
    .month-day-badge { font-size: 0.68rem; font-weight: 700; padding: 0.25rem 0.4rem; border-radius: 6px; margin-top: 0.25rem; display: block; text-align: center; }

    /* TABS / BOTONES */
    .view-tabs { display: flex; background: var(--border-color); padding: 3px; border-radius: 8px; font-size: 0.78rem; }
    .tab-btn { border: none; padding: 0.4rem 0.85rem; border-radius: 6px; font-weight: 700; cursor: pointer; background: transparent; color: var(--text-muted); text-decoration: none; display: inline-block; }
    .tab-btn.active { background: white; color: var(--primary); box-shadow: var(--shadow-sm); }
    .drag-hint { font-size: 0.75rem; color: var(--primary); font-weight: 700; background: var(--primary-light); padding: 0.4rem 0.8rem; border-radius: 20px; display: inline-flex; align-items: center; gap: 0.4rem; }
    .filter-bar-card { background: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }

    /* BADGES */
    .badge { padding: 0.25rem 0.65rem; border-radius: 12px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.3px; display: inline-block; }
    .badge-confirmado  { background: var(--status-conf-bg);   color: var(--status-conf-text); }
    .badge-pendiente   { background: var(--status-pend-bg);   color: var(--status-pend-text); }
    .badge-cancelado   { background: var(--status-canc-bg);   color: var(--status-canc-text); }
    .badge-encurso     { background: var(--status-encurso-bg);color: var(--status-encurso-text); }
    .badge-atendido    { background: var(--status-att-bg);    color: var(--status-att-text); }

    /* BOTONES */
    .btn { padding: 0.6rem 1.1rem; border-radius: var(--radius-md); font-size: 0.85rem; font-weight: 700; cursor: pointer; border: none; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; transition: all 0.2s ease; }
    .btn-primary   { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--bg-card); color: var(--primary); border: 1px solid var(--border-dark); }
    .btn-secondary:hover { background: var(--primary-light); }

    /* MODALES */
    .turn-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15,23,42,0.55); backdrop-filter: blur(4px); z-index: 2000; display: none; align-items: center; justify-content: center; padding: 1.5rem; }
    .turn-modal-overlay.show { display: flex; }
    .turn-modal-card { background: white; border-radius: 16px; width: 100%; max-width: 600px; box-shadow: var(--shadow-xl); overflow: hidden; animation: popIn 0.2s cubic-bezier(0.16,1,0.3,1); }
    .turn-modal-card.narrow { max-width: 520px; }
    @keyframes popIn { from { opacity:0; transform:scale(0.95) translateY(-6px); } to { opacity:1; transform:scale(1) translateY(0); } }
    .turn-modal-header { padding: 1.25rem 1.5rem; background: var(--bg-subtle); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
    .turn-modal-header h3 { font-size: 1.05rem; font-weight: 800; color: var(--primary); }
    .turn-modal-header.dark { background: linear-gradient(135deg,#0f172a 0%,#1e293b 100%); }
    .turn-modal-header.dark h3 { color: white; }
    .close-modal { font-size: 1.2rem; color: var(--text-light); cursor: pointer; font-weight: bold; background: none; border: none; line-height: 1; padding: 0.15rem 0.3rem; }
    .turn-modal-header.dark .close-modal { color: rgba(255,255,255,0.7); }
    .turn-modal-header.dark .close-modal:hover { color: white; }
    .turn-modal-body { padding: 1.25rem 1.5rem; max-height: 70vh; overflow-y: auto; }
    .turn-modal-footer { padding: 1rem 1.5rem; background: var(--bg-subtle); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; }

    /* LISTA DE TURNOS DEL DÍA */
    .turno-list-item { display: flex; align-items: center; gap: 1rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s; border-radius: 0; }
    .turno-list-item:last-child { border-bottom: none; }
    .turno-list-item:hover { background: var(--primary-subtle); }
    .turno-list-item .hora-pill { background: var(--primary); color: white; font-weight: 800; font-size: 0.8rem; padding: 0.3rem 0.55rem; border-radius: 6px; min-width: 48px; text-align: center; flex-shrink: 0; }
    .turno-list-item .info { flex: 1; min-width: 0; }
    .turno-list-item .info strong { font-size: 0.88rem; font-weight: 700; color: var(--text-dark); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .turno-list-item .info span { font-size: 0.75rem; color: var(--text-muted); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .turno-list-item .chevron { color: var(--text-light); font-size: 1rem; flex-shrink: 0; }

    /* DETALLE DEL TURNO */
    .detail-info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.85rem; margin-bottom: 1rem; }
    .detail-info-item { background: var(--bg-subtle); padding: 0.85rem; border-radius: 10px; border: 1px solid var(--border-color); }
    .detail-info-item label { font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 0.25rem; }
    .detail-info-item div { font-size: 0.88rem; font-weight: 700; color: var(--text-dark); }

    /* ESTADO VACÍO */
    .empty-day { text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); }
    .empty-day .icon { font-size: 2rem; margin-bottom: 0.5rem; }
    .empty-day p { font-size: 0.88rem; font-weight: 600; }

    /* SPINNER */
    .spinner { display: inline-block; width: 22px; height: 22px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-row { display: flex; justify-content: center; align-items: center; padding: 2rem; gap: 0.75rem; color: var(--text-muted); font-size: 0.85rem; font-weight: 600; }

    /* TOAST */
    .toast-notification { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(100px); background: #0f172a; color: white; padding: 0.85rem 1.5rem; border-radius: 30px; font-size: 0.88rem; font-weight: 700; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 3000; transition: transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275); display: flex; align-items: center; gap: 0.5rem; }
    .toast-notification.show { transform: translateX(-50%) translateY(0); }

    /* ALERTA ERROR */
    .alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; padding: 0.85rem 1.25rem; border-radius: 10px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1.5rem; }

    /* RESPONSIVE */
    @media (max-width: 1199px) { .grid-4 { grid-template-columns: repeat(2,1fr); } }
    @media (max-width: 767px) {
      header { flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; }
      .search-input { width: 100%; }
      .page-padding { padding: 1rem 0.75rem; }
      .grid-4 { grid-template-columns: 1fr; }
      .filter-bar-card { flex-direction: column; align-items: flex-start; }
      .month-grid-container { gap: 0.25rem; }
      .month-day-card { min-height: 75px; padding: 0.4rem; }
      .detail-info-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <div class="app-container">
    <div class="main-area">
      <header>
        <div class="search-input">
          🔍 <input id="turnosSearch" type="search" placeholder="Buscar en el calendario..." autocomplete="off">
        </div>
        <div style="font-size:0.85rem; font-weight:700; color:var(--primary);"><?= htmlspecialchars($usuarioActual, ENT_QUOTES, 'UTF-8') ?> (RECEPCIÓN) · <a href="../logout.php" style="color:var(--primary); text-decoration:none;">Cerrar sesión</a></div>
      </header>

      <div class="page-padding">

        <?php if ($queryError !== null): ?>
          <div class="alert-error">⚠️ <?= htmlspecialchars($queryError, ENT_QUOTES, 'UTF-8') ?></div>
        <?php endif; ?>

        <!-- Stats del Mes -->
        <div class="grid-4" style="margin-bottom:1.5rem;">
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">Turnos del Mes</div>
              <div style="font-size:1.6rem;font-weight:800;color:#0f172a;margin-top:0.2rem;"><?= $statTotal ?></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">Confirmados</div>
              <div style="font-size:1.6rem;font-weight:800;color:#166534;margin-top:0.2rem;"><?= $statConfirmado ?></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">Pendientes</div>
              <div style="font-size:1.6rem;font-weight:800;color:#b45309;margin-top:0.2rem;"><?= $statPendiente ?></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);">En Curso</div>
              <div style="font-size:1.6rem;font-weight:800;color:#3730a3;margin-top:0.2rem;"><?= $statEnCurso ?></div>
            </div>
          </div>
        </div>

        <!-- Barra de controles -->
        <div class="filter-bar-card">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <!-- Navegación de mes -->
            <a href="recepcionista_mes.php?mes=<?= urlencode($mesAnteriorParam) ?>" class="btn btn-secondary" style="padding:0.45rem 0.75rem;">‹</a>
            <span style="font-size:1.05rem;font-weight:800;color:#0f172a;"><?= htmlspecialchars($nombreMes, ENT_QUOTES, 'UTF-8') ?></span>
            <a href="recepcionista_mes.php?mes=<?= urlencode($mesSiguienteParam) ?>" class="btn btn-secondary" style="padding:0.45rem 0.75rem;">›</a>
            <a href="recepcionista_mes.php" class="btn btn-secondary" style="font-size:0.78rem;">Hoy</a>
          </div>
          <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
            <a href="recepcionista_turno_nuevo.php" class="btn btn-primary">⊕ Registrar Turno</a>
            <div class="view-tabs">
              <a href="recepcionista.php" class="tab-btn">Día</a>
              <a href="recepcionista_semana.php" class="tab-btn">Semana</a>
              <a href="recepcionista_mes.php" class="tab-btn active">Mes</a>
            </div>
          </div>
        </div>

        <!-- GRILLA MENSUAL DINÁMICA -->
        <div class="month-grid-container" id="monthGrid">
          <div class="month-day-header">LU</div>
          <div class="month-day-header">MA</div>
          <div class="month-day-header">MI</div>
          <div class="month-day-header">JU</div>
          <div class="month-day-header">VI</div>
          <div class="month-day-header">SÁ</div>
          <div class="month-day-header">DO</div>

          <?php
          // Celdas del mes anterior para completar la primera semana
          $celdaAnterior = $diaSemanaInicio - 1; // cuántas celdas vacías antes del 1
          for ($i = 0; $i < $celdaAnterior; $i++): ?>
            <div class="month-day-card other-month"></div>
          <?php endfor; ?>

          <?php
          // Días del mes actual
          for ($dia = 1; $dia <= $diasEnElMes; $dia++):
            $fechaDia   = sprintf('%04d-%02d-%02d', $anioActual, $mesActual, $dia);
            $esHoy      = ($fechaDia === $hoy);
            $datos      = $conteoPorDia[$dia] ?? null;
            $total      = $datos ? (int) $datos['total'] : 0;

            // Badge: color según el estado predominante
            if ($datos) {
              $badgeClass = 'badge-confirmado'; // por defecto
              if ((int)$datos['en_curso'] > 0)   $badgeClass = 'badge-encurso';
              elseif ((int)$datos['pendientes'] > (int)$datos['confirmados']) $badgeClass = 'badge-pendiente';
              elseif ((int)$datos['cancelados'] === $total && $total > 0) $badgeClass = 'badge-cancelado';
            }
          ?>
            <div
              class="month-day-card<?= $esHoy ? ' today' : '' ?>"
              data-fecha="<?= htmlspecialchars($fechaDia, ENT_QUOTES, 'UTF-8') ?>"
              data-total="<?= $total ?>"
              onclick="abrirModalDia(this)"
              title="<?= $esHoy ? 'Hoy · ' : '' ?><?= $dia ?> de <?= htmlspecialchars($nombreMes, ENT_QUOTES, 'UTF-8') ?> — <?= $total ?> turno<?= $total !== 1 ? 's' : '' ?>"
            >
              <span class="month-day-number"><?= $dia ?></span>
              <?php if ($total > 0): ?>
                <span class="month-day-badge <?= $badgeClass ?>">
                  <?= $total ?> turno<?= $total !== 1 ? 's' : '' ?>
                </span>
              <?php else: ?>
                <span style="font-size:0.65rem;color:var(--text-light);margin-top:auto;">Sin turnos</span>
              <?php endif; ?>
            </div>
          <?php endfor; ?>

          <?php
          // Celdas del mes siguiente para completar la última semana
          $totalCeldas  = $celdaAnterior + $diasEnElMes;
          $celdaSiguiente = (7 - ($totalCeldas % 7)) % 7;
          for ($i = 0; $i < $celdaSiguiente; $i++): ?>
            <div class="month-day-card other-month"></div>
          <?php endfor; ?>
        </div>

      </div><!-- /page-padding -->
    </div><!-- /main-area -->
  </div><!-- /app-container -->

  <!-- ================================================================
       MODAL 1: Lista de turnos del día seleccionado
       ================================================================ -->
  <div class="turn-modal-overlay" id="modalListaDia">
    <div class="turn-modal-card">
      <div class="turn-modal-header">
        <h3 id="modalListaTitulo">📋 Turnos del día</h3>
        <button class="close-modal" onclick="cerrarModalDia()" aria-label="Cerrar">✕</button>
      </div>
      <div class="turn-modal-body" style="padding:0;" id="modalListaCuerpo">
        <div class="loading-row"><div class="spinner"></div> Cargando turnos...</div>
      </div>
      <div class="turn-modal-footer">
        <a id="linkRegistrarDia" href="recepcionista_turno_nuevo.php" class="btn btn-primary" style="font-size:0.82rem;">⊕ Registrar turno este día</a>
        <button class="btn btn-secondary" onclick="cerrarModalDia()" style="font-size:0.82rem;">Cerrar</button>
      </div>
    </div>
  </div>

  <!-- ================================================================
       MODAL 2: Detalle completo del turno seleccionado
       ================================================================ -->
  <div class="turn-modal-overlay" id="modalDetalleTurno">
    <div class="turn-modal-card narrow">
      <div class="turn-modal-header dark">
        <h3>📄 Detalle del Turno</h3>
        <button class="close-modal" onclick="cerrarModalDetalle()" aria-label="Cerrar">✕</button>
      </div>
      <div class="turn-modal-body" id="modalDetalleCuerpo">
        <div class="loading-row"><div class="spinner"></div> Cargando detalle...</div>
      </div>
      <div class="turn-modal-footer">
        <button class="btn btn-secondary" onclick="volverALista()" style="font-size:0.82rem;">← Volver al día</button>
        <button class="btn btn-primary" onclick="cerrarModalDetalle()" style="font-size:0.82rem;">Cerrar</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="toast-notification" id="toastNotif">
    <span id="toastMessage"></span>
  </div>

  <script>
    // ══════════════════════════════════════════════════════════
    // ESTADO
    // ══════════════════════════════════════════════════════════
    let fechaActiva   = null;  // 'YYYY-MM-DD' del día seleccionado
    let turnoActivo   = null;  // objeto turno seleccionado en lista

    // Cerrar modales al clicar el fondo
    document.querySelectorAll('.turn-modal-overlay').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    });

    // ══════════════════════════════════════════════════════════
    // MODAL 1: Lista de turnos del día
    // ══════════════════════════════════════════════════════════
    function abrirModalDia(cardEl) {
      const fecha = cardEl.dataset.fecha;
      if (!fecha) return;

      fechaActiva = fecha;

      // Resaltar día seleccionado
      document.querySelectorAll('.month-day-card').forEach(function(c) {
        c.classList.remove('selected-day');
      });
      cardEl.classList.add('selected-day');

      // Título del modal
      const partes = fecha.split('-');
      const mesesES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const fechaLegible = parseInt(partes[2]) + ' de ' + mesesES[parseInt(partes[1])] + ' de ' + partes[0];
      document.getElementById('modalListaTitulo').textContent = '📋 Turnos — ' + fechaLegible;

      // Link "Registrar turno este día"
      document.getElementById('linkRegistrarDia').href =
        'recepcionista_turno_nuevo.php?fecha=' + encodeURIComponent(fecha);

      // Mostrar spinner
      document.getElementById('modalListaCuerpo').innerHTML =
        '<div class="loading-row"><div class="spinner"></div> Cargando turnos...</div>';

      document.getElementById('modalListaDia').classList.add('show');

      // Fetch a la API
      fetch('api_turnos_dia.php?fecha=' + encodeURIComponent(fecha))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data.ok) {
            mostrarErrorModal(data.error || 'Error al cargar turnos.');
            return;
          }
          renderizarListaTurnos(data.turnos, fechaLegible);
        })
        .catch(function() {
          mostrarErrorModal('No se pudo conectar con el servidor.');
        });
    }

    function mostrarErrorModal(msg) {
      document.getElementById('modalListaCuerpo').innerHTML =
        '<div style="padding:1.5rem;color:#991b1b;font-size:0.85rem;font-weight:600;">⚠️ ' +
        escapeHtml(msg) + '</div>';
    }

    function renderizarListaTurnos(turnos, fechaLegible) {
      const cuerpo = document.getElementById('modalListaCuerpo');
      if (!turnos || turnos.length === 0) {
        cuerpo.innerHTML =
          '<div class="empty-day">' +
          '<div class="icon">🗓️</div>' +
          '<p>No hay turnos registrados para este día.</p>' +
          '<p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-light);">Usá "Registrar turno este día" para agendar uno.</p>' +
          '</div>';
        return;
      }

      const estadoLabels = {
        'pendiente':  'Pendiente',
        'confirmado': 'Confirmado',
        'en_curso':   'En Curso',
        'atendido':   'Atendido',
        'cancelado':  'Cancelado',
      };
      const badgeClass = {
        'pendiente':  'badge-pendiente',
        'confirmado': 'badge-confirmado',
        'en_curso':   'badge-encurso',
        'atendido':   'badge-atendido',
        'cancelado':  'badge-cancelado',
      };

      let html = '';
      turnos.forEach(function(t) {
        const eClass = badgeClass[t.estado] || 'badge-pendiente';
        const eLabel = estadoLabels[t.estado] || t.estado;
        html +=
          '<div class="turno-list-item" onclick="abrirModalDetalle(' + t.id_turno + ')">' +
          '<span class="hora-pill">' + escapeHtml(t.hora) + '</span>' +
          '<div class="info">' +
          '<strong>' + escapeHtml(t.paciente) + '</strong>' +
          '<span>' + escapeHtml(t.medico) + ' · ' + escapeHtml(t.especialidad) + '</span>' +
          '</div>' +
          '<span class="badge ' + eClass + '" style="flex-shrink:0;">' + escapeHtml(eLabel) + '</span>' +
          '<span class="chevron">›</span>' +
          '</div>';
      });

      cuerpo.innerHTML = html;
    }

    function cerrarModalDia() {
      document.getElementById('modalListaDia').classList.remove('show');
    }

    // ══════════════════════════════════════════════════════════
    // MODAL 2: Detalle del turno
    // ══════════════════════════════════════════════════════════
    function abrirModalDetalle(idTurno) {
      document.getElementById('modalDetalleCuerpo').innerHTML =
        '<div class="loading-row"><div class="spinner"></div> Cargando detalle...</div>';

      document.getElementById('modalDetalleTurno').classList.add('show');

      fetch('api_turnos_dia.php?id_turno=' + encodeURIComponent(idTurno))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data.ok) {
            document.getElementById('modalDetalleCuerpo').innerHTML =
              '<div style="padding:1.5rem;color:#991b1b;font-size:0.85rem;font-weight:600;">⚠️ ' +
              escapeHtml(data.error || 'Error al cargar detalle.') + '</div>';
            return;
          }
          renderizarDetalleTurno(data.turno);
        })
        .catch(function() {
          document.getElementById('modalDetalleCuerpo').innerHTML =
            '<div style="padding:1.5rem;color:#991b1b;font-size:0.85rem;">⚠️ No se pudo conectar.</div>';
        });
    }

    function renderizarDetalleTurno(t) {
      const estadoLabels = {
        'pendiente':  'Pendiente',
        'confirmado': 'Confirmado',
        'en_curso':   'En Curso',
        'atendido':   'Atendido',
        'cancelado':  'Cancelado',
      };
      const badgeClass = {
        'pendiente':  'badge-pendiente',
        'confirmado': 'badge-confirmado',
        'en_curso':   'badge-encurso',
        'atendido':   'badge-atendido',
        'cancelado':  'badge-cancelado',
      };

      const mesesES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const partes = t.fecha.split('-');
      const fechaLeg = parseInt(partes[2]) + ' de ' + mesesES[parseInt(partes[1])] + ' de ' + partes[0];

      const eLabel = estadoLabels[t.estado] || t.estado;
      const eBadge = badgeClass[t.estado]   || 'badge-pendiente';

      const obraSocial = t.obra_social || 'Particular';
      const motivo     = t.motivo_consulta || '—';

      document.getElementById('modalDetalleCuerpo').innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;background:#f0f9ff;border:1px solid #bae6fd;padding:0.75rem 1rem;border-radius:10px;margin-bottom:1.25rem;">' +
        '<div>' +
          '<div style="font-size:0.68rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;">Estado del Turno</div>' +
          '<div style="margin-top:0.2rem;"><span class="badge ' + eBadge + '">' + escapeHtml(eLabel) + '</span></div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:0.68rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;">Horario</div>' +
          '<div style="font-size:1.05rem;font-weight:800;color:var(--primary);">' + escapeHtml(t.hora) + '</div>' +
        '</div>' +
        '</div>' +

        '<div class="detail-info-grid">' +
          '<div class="detail-info-item">' +
            '<label>👤 Paciente</label>' +
            '<div>' + escapeHtml(t.paciente) + '</div>' +
            '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">' +
              escapeHtml(obraSocial) + ' · DNI: ' + escapeHtml(t.paciente_dni) +
            '</span>' +
          '</div>' +
          '<div class="detail-info-item">' +
            '<label>🩺 Médico Tratante</label>' +
            '<div>' + escapeHtml(t.medico) + '</div>' +
            '<span style="font-size:0.72rem;color:var(--primary);font-weight:700;">' + escapeHtml(t.especialidad) + '</span>' +
          '</div>' +
          '<div class="detail-info-item">' +
            '<label>📅 Fecha</label>' +
            '<div>' + escapeHtml(fechaLeg) + '</div>' +
          '</div>' +
          '<div class="detail-info-item">' +
            '<label>🆔 ID Turno</label>' +
            '<div>#' + escapeHtml(String(t.id_turno)) + '</div>' +
          '</div>' +
        '</div>' +

        '<div style="background:var(--bg-subtle);border-left:4px solid var(--primary);padding:0.85rem;border-radius:8px;">' +
          '<div style="font-size:0.68rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:0.25rem;">📝 Motivo de Consulta</div>' +
          '<p style="font-size:0.83rem;color:var(--text-dark);margin:0;line-height:1.5;">' + escapeHtml(motivo) + '</p>' +
        '</div>';
    }

    function cerrarModalDetalle() {
      document.getElementById('modalDetalleTurno').classList.remove('show');
    }

    function volverALista() {
      document.getElementById('modalDetalleTurno').classList.remove('show');
      document.getElementById('modalListaDia').classList.add('show');
    }

    // ══════════════════════════════════════════════════════════
    // BÚSQUEDA EN GRILLA
    // ══════════════════════════════════════════════════════════
    (function() {
      const input = document.getElementById('turnosSearch');
      const cards = Array.from(document.querySelectorAll('.month-day-card:not(.other-month)'));

      function normalize(s) {
        return s.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }

      input.addEventListener('input', function() {
        const term = normalize(this.value.trim());
        if (term === '') {
          cards.forEach(function(c) { c.style.opacity = ''; });
          return;
        }
        cards.forEach(function(c) {
          const text = normalize(c.title + ' ' + c.dataset.fecha);
          c.style.opacity = text.includes(term) ? '' : '0.3';
        });
      });
    })();

    // ══════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function showToast(msg) {
      const toast = document.getElementById('toastNotif');
      document.getElementById('toastMessage').textContent = msg;
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 3500);
    }
  </script>
</body>
</html>
