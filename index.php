<?php
// ============================================================================
// MEDICONTROL - PUNTO DE ENTRADA
// La raíz del sitio lleva al acceso real: con sesión válida, al panel del rol;
// sin sesión, al inicio de sesión. (index.html, el menú de maquetas, se conserva
// por ahora pero ya no es la página de inicio: Apache prioriza index.php.)
// ============================================================================

require_once __DIR__ . '/includes/auth.php';

$usuario = usuarioSesionVigente();
if ($usuario !== null) {
    redirigirAlPanel($usuario['rol']);
}

redirectToLogin();
