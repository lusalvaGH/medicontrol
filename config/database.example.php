<?php
// ============================================================================
// MEDICONTROL - PLANTILLA DE CONFIGURACIÓN LOCAL DE BASE DE DATOS
// ============================================================================
// Si tu instalación de XAMPP / MySQL utiliza credenciales distintas a las
// predeterminadas (usuario 'root' sin contraseña), copiá este archivo como:
// config/database.local.php y configurá tus credenciales.
// ============================================================================

return [
    'host'     => '127.0.0.1',       // o 'localhost'
    'port'     => 3306,              // Puerto de MySQL
    'database' => 'medicontrol_db',  // Nombre de la base de datos
    'user'     => 'root',            // Usuario de MySQL
    'pass'     => '',                // Contraseña de MySQL (en XAMPP por defecto es vacío '')
    'charset'  => 'utf8mb4'
];
