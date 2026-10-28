<?php
declare(strict_types=1);

namespace MediControl\Auth;

use MediControl\Http\ApiException;
use MediControl\Repositories\UsuariosRepository;

/**
 * Autenticación y autorización de la API.
 *
 * Reutiliza la sesión PHP de las pantallas actuales (includes/auth.php), pero en
 * cada pedido vuelve a comprobar en la base que el usuario exista, esté activo y
 * conserve el mismo rol.
 */
final class Guard
{
    public static function usuario(): array
    {
        $sesion = getCurrentUser();
        // Los endpoints actuales solo leen la sesión: se libera el bloqueo del archivo
        // para no frenar otros pedidos simultáneos del mismo usuario.
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        if ($sesion === null) {
            throw new ApiException(401, 'NO_AUTENTICADO', 'Iniciá sesión para continuar.');
        }

        $usuario = (new UsuariosRepository())->buscarPorId($sesion['id_usuario']);
        if ($usuario === null || $usuario['estado'] !== 'activo' || $usuario['rol'] !== $sesion['rol']) {
            throw new ApiException(401, 'SESION_INVALIDA', 'La sesión ya no es válida. Iniciá sesión nuevamente.');
        }

        $usuario['id_usuario'] = (int) $usuario['id_usuario'];
        unset($usuario['estado']);

        return $usuario;
    }

    public static function requerirRol(string ...$roles): array
    {
        $usuario = self::usuario();
        if (!in_array($usuario['rol'], $roles, true)) {
            throw new ApiException(403, 'SIN_PERMISO', 'No tenés permiso para realizar esta operación.');
        }

        return $usuario;
    }
}
