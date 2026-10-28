<?php

require_once __DIR__ . '/includes/auth.php';

// Vacía la sesión, borra la cookie y destruye la sesión en el servidor
cerrarSesion();

header('Location: login.php');
exit;
