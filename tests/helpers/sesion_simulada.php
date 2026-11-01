<?php
// ============================================================================
// Sesión simulada para las pruebas: incluye la huella que exige una sesión válida.
// Solo lee el hash del usuario; no escribe en la base.
// ============================================================================
declare(strict_types=1);

function sesionSimulada(int $idUsuario, string $rol, array $extra = []): array
{
    $stmt = Database::getConnection()->prepare('SELECT contrasena FROM usuarios WHERE id_usuario = :id');
    $stmt->execute([':id' => $idUsuario]);
    $hash = $stmt->fetchColumn();

    return ['id_usuario' => $idUsuario, 'rol' => $rol, 'huella_credencial' => is_string($hash) ? huellaDeCredencial($hash) : ''] + $extra;
}
