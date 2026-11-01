<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../includes/auth.php';

requireLogin();

$usuario = (array) getCurrentUser();
$e = static fn (?string $texto): string => htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
$nombreCompleto = trim((string) ($usuario['nombre'] ?? '') . ' ' . (string) ($usuario['apellido'] ?? ''));
$emailCuenta = (string) ($usuario['email'] ?? '');
$panel = rutaRaizProyecto() . (string) panelDelRol((string) ($usuario['rol'] ?? ''));
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MEDICONTROL - Mi cuenta</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../app/assets/css/cuenta.css">
</head>
<body>
  <header class="cuenta-cabecera">
    <div class="cuenta-marca">MEDICONTROL</div>
    <nav class="cuenta-enlaces" aria-label="Navegación de la cuenta">
      <a href="<?= $e($panel) ?>">← Volver a mi panel</a>
      <a href="../logout.php">Cerrar sesión</a>
    </nav>
  </header>

  <main class="cuenta-contenido">
    <h1>Mi cuenta</h1>
    <p class="cuenta-subtitulo"><?= $e($nombreCompleto) ?></p>
    <?php include __DIR__ . '/../includes/form_contrasena.php'; ?>
  </main>

  <script src="../app/assets/js/api.js"></script>
  <script src="../app/assets/js/contrasena.js"></script>
</body>
</html>
