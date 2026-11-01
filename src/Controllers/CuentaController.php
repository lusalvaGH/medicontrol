<?php
declare(strict_types=1);

namespace MediControl\Controllers;

use MediControl\Auth\Csrf;
use MediControl\Auth\Guard;
use MediControl\Http\ApiException;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;
use MediControl\Services\CuentaService;

/**
 * Cuenta del usuario con sesión. El usuario siempre sale de la sesión, nunca del pedido.
 */
final class CuentaController
{
    private const MAX_FALLOS = 5;
    private const SEGUNDOS_BLOQUEO = 900;

    /** POST /cuenta/contrasena */
    public static function cambiarContrasena(Request $pedido): Respuesta
    {
        $usuario = Guard::usuario();
        Csrf::verificar($pedido);

        // La sesión queda abierta hasta el final: su bloqueo de archivo hace que los pedidos
        // simultáneos de una misma sesión se atiendan de a uno y el contador no se pueda esquivar.
        ensureSessionStarted();
        try {
            self::exigirSinBloqueo();

            $datos = [
                'actual'       => $pedido->campoSinRecortar('contrasena_actual'),
                'nueva'        => $pedido->campoSinRecortar('contrasena_nueva'),
                'confirmacion' => $pedido->campoSinRecortar('contrasena_confirmacion'),
            ];
            $servicio = new CuentaService();
            $servicio->exigirCampos($datos);

            $hashActual = $servicio->hashSiActualCorrecta($usuario['id_usuario'], $datos['actual']);
            if ($hashActual === null) {
                self::registrarFallo();
                throw new ApiException(422, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual es incorrecta.', ['contrasena_actual' => 'incorrecta']);
            }

            $hashNuevo = $servicio->cambiarContrasena($usuario['id_usuario'], $hashActual, $datos);

            // Solo con la contraseña ya guardada: renueva esta sesión y deja inválidas las demás
            renovarSesionTrasCambioDeContrasena($hashNuevo);
            unset($_SESSION['contrasena_fallos'], $_SESSION['contrasena_bloqueo_hasta']);
        } finally {
            session_write_close();
        }

        return Respuesta::ok(['actualizada' => true]);
    }

    private static function exigirSinBloqueo(): void
    {
        $hasta = (int) ($_SESSION['contrasena_bloqueo_hasta'] ?? 0);
        if ($hasta > time()) {
            $minutos = (int) ceil(($hasta - time()) / 60);
            throw new ApiException(429, 'DEMASIADOS_INTENTOS', "Demasiados intentos fallidos. Volvé a intentar en {$minutos} min.");
        }
        if ($hasta !== 0) {
            unset($_SESSION['contrasena_fallos'], $_SESSION['contrasena_bloqueo_hasta']);
        }
    }

    private static function registrarFallo(): void
    {
        $fallos = (int) ($_SESSION['contrasena_fallos'] ?? 0) + 1;
        $_SESSION['contrasena_fallos'] = $fallos;
        if ($fallos >= self::MAX_FALLOS) {
            $_SESSION['contrasena_bloqueo_hasta'] = time() + self::SEGUNDOS_BLOQUEO;
        }
    }
}
