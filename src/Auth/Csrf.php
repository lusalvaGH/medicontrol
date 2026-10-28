<?php
declare(strict_types=1);

namespace MediControl\Auth;

use MediControl\Http\ApiException;
use MediControl\Http\Request;

/**
 * Protección CSRF para los pedidos que modifican datos.
 *
 * El token se guarda en la sesión PHP y el frontend lo envía en la cabecera
 * X-CSRF-Token. Un sitio externo no puede leerlo, así que no puede falsificar
 * pedidos aunque el navegador envíe la cookie de sesión.
 */
final class Csrf
{
    /** Devuelve el token de la sesión actual, creándolo si no existe. */
    public static function token(): string
    {
        ensureSessionStarted();
        if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || strlen($_SESSION['csrf_token']) !== 64) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        $token = $_SESSION['csrf_token'];
        session_write_close();

        return $token;
    }

    /**
     * Verifica el token recibido. Debe llamarse después de Guard (que ya leyó la sesión).
     */
    public static function verificar(Request $pedido): void
    {
        $esperado = $_SESSION['csrf_token'] ?? null;
        $recibido = $pedido->cabecera('X-CSRF-Token');
        if (!is_string($esperado) || $esperado === '' || !is_string($recibido) || !hash_equals($esperado, $recibido)) {
            throw new ApiException(403, 'CSRF_INVALIDO', 'La verificación de seguridad falló. Recargá la página e intentá de nuevo.');
        }
    }
}
