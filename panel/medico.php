<?php

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('medico');

$idUsuario = (int) $_SESSION['id_usuario'];
$nombre = $_SESSION['nombre'] ?? '';
$apellido = $_SESSION['apellido'] ?? '';
?>

<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MediCore Health - Panel Médico</title>
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
                    🔍 <input type="text" placeholder="Buscar paciente o historial..." disabled>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="font-size:0.85rem; font-weight:700; color:var(--primary);">
                        <?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?> (MÉDICO)
                    </div>
                    <a href="../logout.php" class="btn btn-secondary">Cerrar sesión</a>
                </div>
            </header>

            <main class="page-padding">
                <div class="top-layout">
                    <div>
                        <div class="kpis-row">
                            <div class="stat-card">
                                <div>
                                    <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Agenda</div>
                                    <div style="font-size:1rem; font-weight:800; color:var(--primary); margin-top:0.2rem;">Próximamente</div>
                                </div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Pacientes</div>
                                    <div style="font-size:1rem; font-weight:800; color:var(--primary); margin-top:0.2rem;">Próximamente</div>
                                </div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted);">Rol actual</div>
                                    <div style="font-size:1rem; font-weight:800; color:var(--primary); margin-top:0.2rem;">Médico</div>
                                </div>
                            </div>
                        </div>

                        <section class="hero-patient">
                            <div style="font-size:0.72rem; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:0.5rem;">PANEL MÉDICO</div>
                            <div style="font-size:1.5rem; font-weight:800; color:var(--text-dark); margin-bottom:0.75rem;">
                                <?= htmlspecialchars(trim($nombre . ' ' . $apellido), ENT_QUOTES, 'UTF-8') ?>
                            </div>
                            <p style="font-size:0.85rem; color:var(--text-muted);">
                                La agenda y la gestión de turnos estarán disponibles en una próxima etapa.
                            </p>
                        </section>
                    </div>

                    <aside class="weekly-card">
                        <div style="font-weight:800; font-size:0.95rem; margin-bottom:1rem;">Acceso del usuario</div>
                        <div style="background:var(--bg-subtle); border-radius:8px; padding:0.75rem; font-size:0.8rem;">
                            <div style="font-weight:800; color:var(--primary);">Rol autorizado</div>
                            <div style="font-weight:700; margin-top:0.25rem;">Médico</div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    </div>

</body>
</html>
