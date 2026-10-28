<?php
declare(strict_types=1);

namespace MediControl\Http;

use MediControl\Controllers\CatalogoController;
use MediControl\Controllers\SistemaController;
use MediControl\Controllers\TurnosController;
use Throwable;

/**
 * Rutas de la API y manejo central de errores.
 */
final class App
{
    public static function router(): Router
    {
        $router = new Router();

        $router->agregar('GET', '/health', [SistemaController::class, 'salud']);
        $router->agregar('GET', '/auth/me', [SistemaController::class, 'usuarioActual']);
        $router->agregar('GET', '/auth/csrf', [SistemaController::class, 'tokenCsrf']);

        // /turnos/resumen va antes que /turnos/{id} (aunque {id} solo acepta números)
        $router->agregar('GET', '/turnos/resumen', [TurnosController::class, 'resumen']);
        $router->agregar('GET', '/turnos', [TurnosController::class, 'listar']);
        $router->agregar('POST', '/turnos', [TurnosController::class, 'crear']);
        $router->agregar('GET', '/turnos/{id}', [TurnosController::class, 'detalle']);
        $router->agregar('PATCH', '/turnos/{id}', [TurnosController::class, 'modificar']);
        $router->agregar('POST', '/turnos/{id}/cancelacion', [TurnosController::class, 'cancelar']);

        $router->agregar('GET', '/medicos', [CatalogoController::class, 'medicos']);
        $router->agregar('GET', '/medicos/{id}/disponibilidad', [CatalogoController::class, 'disponibilidad']);
        $router->agregar('GET', '/pacientes', [CatalogoController::class, 'pacientes']);

        return $router;
    }

    public static function manejar(Request $pedido): Respuesta
    {
        try {
            return self::router()->despachar($pedido);
        } catch (ApiException $e) {
            return $e->respuesta();
        } catch (Throwable $e) {
            error_log(sprintf('MediControl API %s %s: %s en %s:%d', $pedido->metodo, $pedido->ruta, $e->getMessage(), $e->getFile(), $e->getLine()));

            return Respuesta::error(500, 'ERROR_INTERNO', 'Ocurrió un error interno. Intentá nuevamente más tarde.');
        }
    }
}
