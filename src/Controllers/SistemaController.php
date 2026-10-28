<?php
declare(strict_types=1);

namespace MediControl\Controllers;

use Database;
use MediControl\Auth\Csrf;
use MediControl\Auth\Guard;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;
use Throwable;

final class SistemaController
{
    /** GET /health — público; no expone versiones ni detalles de conexión. */
    public static function salud(Request $pedido): Respuesta
    {
        try {
            Database::getConnection()->query('SELECT 1')->fetchColumn();
        } catch (Throwable $e) {
            error_log('MediControl API /health: ' . $e->getMessage());

            return Respuesta::error(503, 'BASE_NO_DISPONIBLE', 'La base de datos no está disponible.');
        }

        return Respuesta::ok(['estado' => 'ok', 'base_de_datos' => 'ok']);
    }

    /** GET /auth/csrf — token para los pedidos que modifican datos (requiere sesión). */
    public static function tokenCsrf(Request $pedido): Respuesta
    {
        Guard::usuario();

        return Respuesta::ok(['token' => Csrf::token()]);
    }

    /** GET /auth/me — usuario de la sesión actual. */
    public static function usuarioActual(Request $pedido): Respuesta
    {
        return Respuesta::ok(['usuario' => Guard::usuario()]);
    }
}
