<?php
declare(strict_types=1);

namespace MediControl\Controllers;

use MediControl\Auth\Csrf;
use MediControl\Auth\Guard;
use MediControl\Http\ApiException;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;
use MediControl\Services\UsuariosService;

/**
 * Configuración de Recepción: pacientes, médicos y consulta de recepcionistas.
 */
final class UsuariosController
{
    /** GET /usuarios?tipo=personal|pacientes&buscar=&estado=todos|activo|inactivo&pagina=1 */
    public static function listar(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        $pagina = $pedido->texto('pagina') ?? '1';
        if (!preg_match('/^[1-9]\d{0,5}$/', $pagina)) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'La página no es válida.', ['pagina' => 'invalida']);
        }

        return Respuesta::ok((new UsuariosService())->listar(
            $pedido->texto('tipo') ?? 'personal',
            $pedido->texto('buscar') ?? '',
            $pedido->texto('estado') ?? 'todos',
            (int) $pagina
        ));
    }

    public static function detalle(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        return Respuesta::ok(['usuario' => (new UsuariosService())->detalle((int) $pedido->parametrosRuta['id'])]);
    }

    public static function crear(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        return Respuesta::ok(['usuario' => (new UsuariosService())->crear($pedido->cuerpo, turnosHoy())], 201);
    }

    public static function modificar(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        return Respuesta::ok(['usuario' => (new UsuariosService())->modificar((int) $pedido->parametrosRuta['id'], $pedido->cuerpo, turnosHoy())]);
    }

    public static function baja(Request $pedido): Respuesta
    {
        $actor = Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        return Respuesta::ok(['usuario' => (new UsuariosService())->darDeBaja((int) $pedido->parametrosRuta['id'], $actor['id_usuario'], turnosAhora())]);
    }

    public static function reactivar(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        return Respuesta::ok(['usuario' => (new UsuariosService())->reactivar((int) $pedido->parametrosRuta['id'])]);
    }

    public static function restablecerContrasena(Request $pedido): Respuesta
    {
        $actor = Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);
        (new UsuariosService())->restablecerContrasena((int) $pedido->parametrosRuta['id'], $actor['id_usuario'], $pedido->cuerpo);

        return Respuesta::ok(['actualizada' => true]);
    }
}
