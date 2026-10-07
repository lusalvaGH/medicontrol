<?php

require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$nombreUsuario = trim((string) ($_SESSION['nombre'] ?? ''));
$apellidoUsuario = trim((string) ($_SESSION['apellido'] ?? ''));
$usuarioActual = trim($nombreUsuario . ' ' . $apellidoUsuario);
$usuarioActual = $usuarioActual !== '' ? $usuarioActual : 'Recepción';
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

    /* VISTA MENSUAL */
    .month-grid-container { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; margin-bottom: 2rem; }
    .month-day-header { text-align: center; font-weight: 800; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; padding: 0.5rem; background: white; border-radius: 6px; border: 1px solid var(--border-color); }
    .month-day-card { background: white; border: 1px solid var(--border-color); border-radius: 10px; padding: 0.6rem; min-height: 105px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s; cursor: pointer; }
    .month-day-card:hover { border-color: var(--primary); box-shadow: var(--shadow-sm); transform: translateY(-2px); }
    .month-day-card.other-month { background: var(--bg-subtle); opacity: 0.5; cursor: default; }

    .month-day-number { font-size: 0.9rem; font-weight: 800; color: #0f172a; }
    .month-day-badge { font-size: 0.68rem; font-weight: 700; padding: 0.25rem 0.4rem; border-radius: 6px; margin-top: 0.25rem; display: block; text-align: center; }

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
      .grid-4 { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      header { flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 0.85rem 1rem; }
      .search-input { width: 100%; }
      .page-padding { padding: 1rem 0.75rem; }
      .grid-4 { grid-template-columns: 1fr; }
      .filter-bar-card { flex-direction: column; align-items: flex-start; }
      .full-time-grid { grid-template-columns: repeat(3, 1fr); }
      .month-grid-container { gap: 0.25rem; }
      .month-day-card { min-height: 80px; padding: 0.4rem; }
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
        <div style="font-size:0.85rem; font-weight:700; color:var(--primary);"><?= htmlspecialchars($usuarioActual, ENT_QUOTES, 'UTF-8') ?> (RECEPCIÓN) · <a href="../logout.php" style="color:var(--primary); text-decoration:none;">Cerrar sesión</a></div>
      </header>

      <div class="page-padding">
        
        <!-- Stats del Mes -->
        <div class="grid-4" style="margin-bottom: 1.5rem;">
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Turnos del Mes</div>
              <div style="font-size:1.6rem; font-weight:800; color:#0f172a; margin-top:0.2rem;">740 <span style="font-size:0.75rem; color:#166534;">+14%</span></div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Confirmados</div>
              <div style="font-size:1.6rem; font-weight:800; color:#166534; margin-top:0.2rem;">520</div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Pendientes</div>
              <div style="font-size:1.6rem; font-weight:800; color:#b45309; margin-top:0.2rem;">160</div>
            </div>
          </div>
          <div class="stat-card">
            <div>
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">En Curso</div>
              <div style="font-size:1.6rem; font-weight:800; color:#3730a3; margin-top:0.2rem;">60</div>
            </div>
          </div>
        </div>

        <!-- BARRA DE FILTRADO DE ESPECIALIDAD & TODOS LOS CLIENTES -->
        <div class="filter-bar-card">
          <div class="spec-selector">
            <span style="font-size:0.82rem; font-weight:800; color:#0f172a;">🩺 Especialidad:</span>
            <select class="spec-select-input" id="specFilterSelectMonth">
              <option value="ALL">Todas las Especialidades</option>
              <option value="Cardiología">Cardiología</option>
              <option value="Pediatría">Pediatría</option>
              <option value="Traumatología">Traumatología</option>
              <option value="Clínica Médica">Clínica Médica</option>
            </select>
          </div>

          <div style="display:flex; gap:0.75rem; align-items:center;">
            <button class="btn btn-secondary" onclick="openAllClientsModal()">👥 Todos los Clientes / Pacientes</button>
            <div class="drag-hint">🗓️ Tocá cualquier día para ver el detalle exacto de sus turnos</div>
          </div>
        </div>

        <!-- Controls / Switch Vistas -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:0.75rem;">
          <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
            <a href="04-registrar-turno-modal.html" class="btn btn-primary">⊕ Registrar Turno</a>
            <!-- El botón de Detalle abre el turno que el usuario haya seleccionado -->
            <button class="btn btn-secondary" onclick="openDetailModalFromTop()">📄 Detalle del Turno</button>
            <span style="font-size:1.1rem; font-weight:800; color:#0f172a; margin-left:0.5rem;">Octubre 2023</span>
          </div>

          <div class="view-tabs">
            <a href="recepcionista.php" class="tab-btn">Día</a>
            <a href="recepcionista_semana.php" class="tab-btn">Semana</a>
            <a href="recepcionista_mes.php" class="tab-btn active">Mes</a>
          </div>
        </div>

        <!-- ÚNICA VISTA DE TURNOS: GRILLA MENSUAL -->
        <div class="month-grid-container">
          <div class="month-day-header">LU</div>
          <div class="month-day-header">MA</div>
          <div class="month-day-header">MI</div>
          <div class="month-day-header">JU</div>
          <div class="month-day-header">VI</div>
          <div class="month-day-header">SÁ</div>
          <div class="month-day-header">DO</div>

          <!-- Días de mes anterior -->
          <div class="month-day-card other-month"><span class="month-day-number">25</span></div>
          <div class="month-day-card other-month"><span class="month-day-number">26</span></div>
          <div class="month-day-card other-month"><span class="month-day-number">27</span></div>
          <div class="month-day-card other-month"><span class="month-day-number">28</span></div>
          <div class="month-day-card other-month"><span class="month-day-number">29</span></div>
          <div class="month-day-card other-month"><span class="month-day-number">30</span></div>

          <!-- Días del Mes con datos dinámicos únicos -->
          <div class="month-day-card" onclick="handleMonthDayClick('Juan Pérez', 'Dr. Roberto Gómez', 'Cardiología', '08:30 AM', '1 de Octubre de 2023', 'CONFIRMADO', 'OSDE 310', '18 Turnos programados para la jornada del 1 de Octubre.', '35.123.456', this)">
            <span class="month-day-number">1</span>
            <span class="month-day-badge badge-confirmado">18 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Marta Gómez', 'Dra. Espinoza', 'Cardiología', '09:00 AM', '2 de Octubre de 2023', 'EN CURSO', 'IAPOS', '22 Turnos programados para la jornada del 2 de Octubre.', '12.333.444', this)">
            <span class="month-day-number">2</span>
            <span class="month-day-badge badge-confirmado">22 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Carlos Lopez', 'Dr. Castro', 'Clínica Médica', '10:00 AM', '3 de Octubre de 2023', 'PENDIENTE', 'Particular', '15 Turnos programados para la jornada del 3 de Octubre.', '28.190.455', this)">
            <span class="month-day-number">3</span>
            <span class="month-day-badge badge-pendiente">15 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Ana Martinez', 'Dra. María Fernández', 'Pediatría', '11:00 AM', '4 de Octubre de 2023', 'CONFIRMADO', 'Swiss Medical', '26 Turnos programados para la jornada del 4 de Octubre.', '28.555.666', this)">
            <span class="month-day-number">4</span>
            <span class="month-day-badge badge-confirmado">26 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Lucía Mendez', 'Médico asignado', 'Cardiología', '02:00 PM', '5 de Octubre de 2023', 'EN CURSO', 'Galeno', '30 Turnos programados para la jornada del 5 de Octubre.', '22.888.777', this)">
            <span class="month-day-number">5</span>
            <span class="month-day-badge badge-encurso">30 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Diego Torres', 'Dr. Martínez', 'Traumatología', '03:00 PM', '6 de Octubre de 2023', 'CONFIRMADO', 'OSDE 410', '12 Turnos programados para la jornada del 6 de Octubre.', '40.999.888', this)">
            <span class="month-day-number">6</span>
            <span class="month-day-badge badge-confirmado">12 Turnos</span>
          </div>
          <div class="month-day-card other-month">
            <span class="month-day-number">7</span>
            <span style="font-size:0.68rem; color:var(--text-muted);">Cerrado</span>
          </div>

          <!-- Semana 2 -->
          <div class="month-day-card" onclick="handleMonthDayClick('Valeria Fernandez', 'Dr. Roberto Gómez', 'Cardiología', '08:30 AM', '8 de Octubre de 2023', 'CONFIRMADO', 'OSDE 310', '24 Turnos programados.', '38.123.999', this)">
            <span class="month-day-number">8</span>
            <span class="month-day-badge badge-confirmado">24 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Roberto Silva', 'Dr. Martínez', 'Traumatología', '09:00 AM', '9 de Octubre de 2023', 'EN CURSO', 'Particular', '28 Turnos programados para la jornada de Traumatología.', '34.111.999', this)">
            <span class="month-day-number">9</span>
            <span class="month-day-badge badge-confirmado">28 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Julia Velez', 'Dr. Esteban Castro', 'Clínica Médica', '10:30 AM', '10 de Octubre de 2023', 'PENDIENTE', 'Swiss Medical', '32 Turnos programados.', '22.888.777', this)">
            <span class="month-day-number">10</span>
            <span class="month-day-badge badge-encurso">32 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Fernando Torres', 'Médico asignado', 'Pediatría', '12:15 PM', '11 de Octubre de 2023', 'CONFIRMADO', 'OSDE 410', '25 Turnos programados.', '31.444.555', this)">
            <span class="month-day-number">11</span>
            <span class="month-day-badge badge-confirmado">25 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Marta Gómez', 'Dra. Espinoza', 'Cardiología', '01:30 PM', '12 de Octubre de 2023', 'CONFIRMADO', 'IAPOS', '19 Turnos programados.', '12.333.444', this)">
            <span class="month-day-number">12</span>
            <span class="month-day-badge badge-confirmado">19 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Sofia Carranza', 'Dr. Roberto Gómez', 'Cardiología', '03:00 PM', '13 de Octubre de 2023', 'CONFIRMADO', 'OSDE 310', '21 Turnos programados.', '42.880.111', this)">
            <span class="month-day-number">13</span>
            <span class="month-day-badge badge-confirmado">21 Turnos</span>
          </div>
          <div class="month-day-card other-month">
            <span class="month-day-number">14</span>
            <span style="font-size:0.68rem; color:var(--text-muted);">Cerrado</span>
          </div>

          <!-- Semana 3 -->
          <div class="month-day-card" onclick="handleMonthDayClick('Ricardo Alarcón', 'Dra. María Fernández', 'Pediatría', '08:00 AM', '15 de Octubre de 2023', 'CONFIRMADO', 'Galeno', '17 Turnos programados.', '36.555.444', this)">
            <span class="month-day-number">15</span>
            <span class="month-day-badge badge-confirmado">17 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Lucia Castro', 'Dr. Sánchez', 'Clínica Médica', '09:30 AM', '16 de Octubre de 2023', 'PENDIENTE', 'Swiss Medical', '23 Turnos programados.', '40.112.339', this)">
            <span class="month-day-number">16</span>
            <span class="month-day-badge badge-pendiente">23 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Martin Lopez', 'Dr. Gómez', 'Traumatología', '11:00 AM', '17 de Octubre de 2023', 'CANCELADO', 'Particular', '14 Turnos programados.', '28.190.455', this)">
            <span class="month-day-number">17</span>
            <span class="month-day-badge badge-cancelado">14 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Eduardo Rodríguez', 'Dra. Espinoza', 'Cardiología', '12:00 PM', '18 de Octubre de 2023', 'CONFIRMADO', 'OSDE 410', '29 Turnos programados.', '34.552.121', this)">
            <span class="month-day-number">18</span>
            <span class="month-day-badge badge-confirmado">29 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Marta Gómez', 'Médico asignado', 'Cardiología', '02:30 PM', '19 de Octubre de 2023', 'EN CURSO', 'IAPOS', '31 Turnos programados.', '12.333.444', this)">
            <span class="month-day-number">19</span>
            <span class="month-day-badge badge-encurso">31 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Mateo Fernandez', 'Dr. Julian Rossi', 'Cardiología', '04:00 PM', '20 de Octubre de 2023', 'CONFIRMADO', 'OSDE 410', '20 Turnos programados.', '38.452.190', this)">
            <span class="month-day-number">20</span>
            <span class="month-day-badge badge-confirmado">20 Turnos</span>
          </div>
          <div class="month-day-card other-month">
            <span class="month-day-number">21</span>
            <span style="font-size:0.68rem; color:var(--text-muted);">Cerrado</span>
          </div>

          <!-- Semana 4 -->
          <div class="month-day-card" onclick="handleMonthDayClick('Juan Pérez', 'Dr. Roberto Gómez', 'Cardiología', '08:30 AM', '22 de Octubre de 2023', 'CONFIRMADO', 'OSDE 310', '27 Turnos programados.', '35.123.456', this)">
            <span class="month-day-number">22</span>
            <span class="month-day-badge badge-confirmado">27 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Ana Martinez', 'Dra. María Fernández', 'Pediatría', '10:00 AM', '23 de Octubre de 2023', 'CONFIRMADO', 'Swiss Medical', '35 Turnos programados.', '28.555.666', this)">
            <span class="month-day-number">23</span>
            <span class="month-day-badge badge-confirmado">35 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Mateo Fernandez', 'Dr. Julian Rossi', 'Cardiología', '10:30 AM', '24 de Octubre de 2023', 'CONFIRMADO', 'OSDE 410', '42 Turnos programados.', '38.452.190', this)">
            <span class="month-day-number">24</span>
            <span class="month-day-badge badge-confirmado">42 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Sofia Carranza', 'Dra. Espinoza', 'Cardiología', '11:15 AM', '25 de Octubre de 2023', 'EN CURSO', 'Medifé', '18 Turnos programados.', '42.880.111', this)">
            <span class="month-day-number">25</span>
            <span class="month-day-badge badge-encurso">18 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Diego Torres', 'Dr. Martínez', 'Traumatología', '01:00 PM', '26 de Octubre de 2023', 'CONFIRMADO', 'OSDE 410', '22 Turnos programados.', '40.999.888', this)">
            <span class="month-day-number">26</span>
            <span class="month-day-badge badge-confirmado">22 Turnos</span>
          </div>
          <div class="month-day-card" onclick="handleMonthDayClick('Julia Velez', 'Dr. Esteban Castro', 'Clínica Médica', '03:30 PM', '27 de Octubre de 2023', 'PENDIENTE', 'Swiss Medical', '16 Turnos programados.', '22.888.777', this)">
            <span class="month-day-number">27</span>
            <span class="month-day-badge badge-pendiente">16 Turnos</span>
          </div>
          <div class="month-day-card other-month">
            <span class="month-day-number">28</span>
            <span style="font-size:0.68rem; color:var(--text-muted);">Cerrado</span>
          </div>

        </div>

      </div>
    </div>
  </div>

  <!-- POP-UP MODAL EMERGENTE: DETALLE DEL TURNO MEDICO EN LA VISTA MENSUAL -->
  <div class="turn-modal-overlay" id="turnDetailModal">
    <div class="turn-modal-card" style="max-width: 520px;">
      <div class="turn-modal-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white;">
        <h3 style="color: white; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          📄 Detalle del Turno Médico (Mes)
        </h3>
        <span class="close-modal" style="color: white;" onclick="closeDetailModal()">✕</span>
      </div>

      <div class="turn-modal-body" style="padding: 1.25rem;">
        
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

        <div class="detail-info-grid">
          <div class="detail-info-item">
            <label>👤 Paciente Principal</label>
            <div id="detailPatientText">Mateo Fernandez</div>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;" id="detailCoverageText">OSDE 410 • DNI Registrado</span>
          </div>

          <div class="detail-info-item">
            <label>🩺 Médico Tratante</label>
            <div id="detailDoctorText">Dr. Julian Rossi</div>
            <span style="font-size: 0.72rem; color: var(--primary); font-weight: 700;" id="detailSpecText">Cardiología</span>
          </div>

          <div class="detail-info-item">
            <label>📅 Día / Fecha del Mes</label>
            <div id="detailDateText">24 de Octubre de 2023</div>
          </div>

          <div class="detail-info-item">
            <label>🏥 Consultorio</label>
            <div>Consultorio 3 • Piso 2</div>
          </div>
        </div>

        <div style="background: var(--bg-subtle); border-left: 4px solid var(--primary); padding: 0.85rem; border-radius: 8px; margin-bottom: 1rem;">
          <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">📝 Resumen del Día & Notas</div>
          <p style="font-size: 0.82rem; color: var(--text-dark); margin: 0; line-height: 1.45;" id="detailReasonText">42 Turnos programados para esta jornada clínica.</p>
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
          <button class="btn btn-secondary" style="font-size:0.75rem;" onclick="closeAllClientsModal(); handleMonthDayClick('Juan Pérez', 'Dr. Roberto Gómez', 'Cardiología', '08:30 AM', '1 de Octubre de 2023', 'CONFIRMADO', 'OSDE 310', 'Consulta mensual.', '35.123.456', null)">Ver Detalle</button>
        </div>

        <div class="client-item-card">
          <div>
            <strong style="color:#0f172a;">Roberto Silva</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(DNI: 34.111.999)</span>
            <div style="font-size:0.75rem; color:var(--text-muted);">Particular • Tel: +54 11 2233-4455</div>
          </div>
          <button class="btn btn-secondary" style="font-size:0.75rem;" onclick="closeAllClientsModal(); handleMonthDayClick('Roberto Silva', 'Dr. Martínez', 'Traumatología', '09:00 AM', '9 de Octubre de 2023', 'EN CURSO', 'Particular', 'Evaluación por esguince de tobillo.', '34.111.999', null)">Ver Detalle</button>
        </div>

        <div class="client-item-card">
          <div>
            <strong style="color:#0f172a;">Marta Gómez</strong> <span style="font-size:0.75rem; color:var(--text-muted);">(DNI: 12.333.444)</span>
            <div style="font-size:0.75rem; color:var(--text-muted);">IAPOS • Tel: +54 11 9876-5432</div>
          </div>
          <button class="btn btn-secondary" style="font-size:0.75rem;" onclick="closeAllClientsModal(); handleMonthDayClick('Marta Gómez', 'Dra. Espinoza', 'Cardiología', '09:00 AM', '2 de Octubre de 2023', 'EN CURSO', 'IAPOS', 'Consulta mensual.', '12.333.444', null)">Ver Detalle</button>
        </div>

      </div>
    </div>
  </div>

  <!-- NOTIFICACIÓN TOAST -->
  <div class="toast-notification" id="toastNotif">
    <span id="toastMessage"></span>
  </div>

  <script>
    // ESTADO DEL TURNO SELECCIONADO ACTIVO EN EL MES
    let activeSelectedAppointment = {
      patient: 'Marta Gómez',
      doctor: 'Dra. Espinoza',
      spec: 'Cardiología',
      time: '08:15 AM',
      dateStr: '24 de Octubre de 2023',
      status: 'CONFIRMADO',
      coverage: 'OSDE 410',
      reason: 'Control mensual programado.',
      dni: '12.333.444'
    };

    // CERRAR MODALES AL HACER CLIC EN CUALQUIER LUGAR FUERA DEL MODAL
    document.querySelectorAll('.turn-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('show');
        }
      });
    });

    const specFilterSelectMonth = document.getElementById('specFilterSelectMonth');
    if (specFilterSelectMonth) {
      specFilterSelectMonth.addEventListener('change', (e) => {
        showToast(`🩺 Filtrando por especialidad: ${e.target.value === 'ALL' ? 'Todas' : e.target.value}`);
      });
    }

    function openAllClientsModal() {
      document.getElementById('allClientsModal').classList.add('show');
    }
    function closeAllClientsModal() {
      document.getElementById('allClientsModal').classList.remove('show');
    }

    function handleMonthDayClick(patient, doctor, spec, time, dateStr, status, coverage, reason, dni, dayCardEl) {
      document.querySelectorAll('.month-day-card').forEach(c => c.classList.remove('selected-card-highlight'));
      if (dayCardEl) dayCardEl.classList.add('selected-card-highlight');

      // Actualizar el estado global del turno seleccionado en el mes
      activeSelectedAppointment = { patient, doctor, spec, time, dateStr, status, coverage, reason, dni };

      openDetailModal(patient, doctor, spec, time, dateStr, status, coverage, reason, dni);
    }

    function openDetailModalFromTop() {
      const { patient, doctor, spec, time, dateStr, status, coverage, reason, dni } = activeSelectedAppointment;
      openDetailModal(patient, doctor, spec, time, dateStr, status, coverage, reason, dni);
    }

    function openDetailModal(patient, doctor, spec, time, dateStr, status, coverage, reason, dni) {
      document.getElementById('detailPatientText').textContent = patient;
      document.getElementById('detailDoctorText').textContent = doctor;
      document.getElementById('detailSpecText').textContent = spec;
      document.getElementById('detailTimeText').textContent = time;
      document.getElementById('detailDateText').textContent = dateStr || "Octubre de 2023";
      document.getElementById('detailCoverageText').textContent = `${coverage || 'OSDE 410'} • DNI: ${dni || '38.452.190'}`;
      document.getElementById('detailReasonText').textContent = reason || "Consulta médica programada en el mes.";

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
    const turnosSearch = document.getElementById('turnosSearch');
    const turnosMes = Array.from(document.querySelectorAll('.month-day-card'));
    const agendaMes = document.querySelector('.month-grid-container');

    function normalizeSearchValue(value) {
      return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    if (turnosSearch && agendaMes && turnosMes.length > 0) {
      const searchEmpty = document.createElement('div');
      searchEmpty.className = 'search-empty';
      searchEmpty.textContent = 'No se encontraron turnos';
      agendaMes.parentElement.insertBefore(searchEmpty, agendaMes.nextSibling);

      turnosSearch.addEventListener('input', function () {
        const term = normalizeSearchValue(this.value.trim());
        let visibleCount = 0;

        turnosMes.forEach(function (turno) {
          const searchableText = turno.textContent + ' ' + (turno.getAttribute('onclick') || '');
          const matches = term === '' || normalizeSearchValue(searchableText).includes(term);
          turno.style.display = matches ? '' : 'none';
          if (matches) {
            visibleCount++;
          }
        });

        searchEmpty.style.display = visibleCount > 0 ? 'none' : 'block';
      });
    }
  </script>
</body>
</html>
