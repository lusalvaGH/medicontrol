<?php
// ============================================================================
// MEDICONTROL - CONEXIÓN DIRECTA PDO / HELPER
// ============================================================================
require_once __DIR__ . '/config/database.php';

try {
    $pdo = Database::getConnection();
} catch (PDOException $e) {
    die("Error crítico de conexión: " . $e->getMessage());
}
