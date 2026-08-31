<?php

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$idUsuario = (int) $_SESSION['id_usuario'];
$nombre = $_SESSION['nombre'] ?? '';
$apellido = $_SESSION['apellido'] ?? '';
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediCore Health - Panel de Recepción</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
</head>

<body>

    <div class="app-container">
        <div class="main-area">
            <header>
                <div class="search-input">
                    🔍 <input type="text" placeholder="Buscar paciente o médico..." disabled>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="font-size:0.85rem; font-weight:700; color:var(--primary);">
                        <?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?> (RECEPCIÓN)
                    </div>
                    <a href="../logout.php" class="btn btn-secondary">Cerrar sesión</a>
                </div>
            </header>

            <main class="page-padding">
                <div class="stats-grid">
                    <div class="stat-card">
                        <div>
                            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">Turnos del día</div>
                            <div class="stat-val" style="font-size:1rem;">Próximamente</div>
                        </div>
                        <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">📅</div>
                    </div>
                    <div class="stat-card">
                        <div>
                            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">Pacientes</div>
                            <div class="stat-val" style="font-size:1rem;">Próximamente</div>
                        </div>
                        <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">👥</div>
                    </div>
                    <div class="stat-card">
                        <div>
                            <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">Rol actual</div>
                            <div class="stat-val" style="font-size:1rem; color:var(--primary);">Recepcionista</div>
                        </div>
                        <div class="stat-icon" style="background:var(--primary-light); color:var(--primary);">🛡️</div>
                    </div>
                </div>

                <section class="table-container">
                    <div style="margin-bottom:1rem;">
                        <h1 style="font-size:1.2rem; font-weight:800; color:var(--text-dark);">Panel de Recepción</h1>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
                            Bienvenido/a, <?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?>.
                        </p>
                    </div>
                    <div style="background:var(--bg-subtle); border-radius:8px; padding:1rem; font-size:0.85rem; color:var(--text-muted);">
                        La gestión de agenda, pacientes y turnos estará disponible en una próxima etapa.
                    </div>
                </section>
            </main>
        </div>
    </div>

</body>
</html>
