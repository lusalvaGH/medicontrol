<?php
declare(strict_types=1);

namespace MediControl\Services;

use MediControl\Http\ApiException;
use MediControl\Repositories\UsuariosRepository;

/**
 * Operaciones de un usuario sobre su propia cuenta.
 */
final class CuentaService
{
    private UsuariosRepository $usuarios;

    public function __construct(?UsuariosRepository $usuarios = null)
    {
        $this->usuarios = $usuarios ?? new UsuariosRepository();
    }

    /**
     * Comprueba que los tres campos hayan llegado como texto.
     *
     * @param array{actual: ?string, nueva: ?string, confirmacion: ?string} $datos
     */
    public function exigirCampos(array $datos): void
    {
        $campos = [];
        foreach (['actual' => 'contrasena_actual', 'nueva' => 'contrasena_nueva', 'confirmacion' => 'contrasena_confirmacion'] as $clave => $campo) {
            if (($datos[$clave] ?? '') === '') {
                $campos[$campo] = 'requerido';
            }
        }
        if ($campos !== []) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'Completá todos los campos.', $campos);
        }
    }

    /**
     * Devuelve el hash guardado si la contraseña actual es correcta, o null si no lo es.
     */
    public function hashSiActualCorrecta(int $idUsuario, string $actual): ?string
    {
        // bcrypt solo mira los primeros 72 bytes: un texto más largo no es la contraseña
        if (strlen($actual) > ReglasContrasena::MAXIMA) {
            return null;
        }
        $hash = $this->usuarios->buscarHashContrasena($idUsuario);

        return $hash !== null && password_verify($actual, $hash) ? $hash : null;
    }

    /**
     * Valida la contraseña nueva y la guarda. Devuelve el hash nuevo.
     *
     * @param array{nueva: string, confirmacion: string} $datos
     */
    public function cambiarContrasena(int $idUsuario, string $hashActual, array $datos): string
    {
        $nueva = $datos['nueva'];
        if (!ReglasContrasena::esValida($nueva)) {
            throw new ApiException(422, 'CONTRASENA_NO_VALIDA', ReglasContrasena::MENSAJE, ['contrasena_nueva' => 'no_valida']);
        }
        if (!hash_equals($nueva, $datos['confirmacion'])) {
            throw new ApiException(422, 'CONFIRMACION_NO_COINCIDE', 'Las contraseñas no coinciden.', ['contrasena_confirmacion' => 'no_coincide']);
        }
        if (password_verify($nueva, $hashActual)) {
            throw new ApiException(422, 'CONTRASENA_REPETIDA', 'La contraseña nueva debe ser distinta de la actual.', ['contrasena_nueva' => 'repetida']);
        }

        $hashNuevo = password_hash($nueva, PASSWORD_DEFAULT);
        if ($this->usuarios->actualizarContrasena($idUsuario, $hashNuevo, $hashActual) === 0) {
            throw new ApiException(409, 'CUENTA_MODIFICADA', 'La cuenta cambió mientras se guardaba. Recargá la página e intentá de nuevo.');
        }

        return $hashNuevo;
    }
}
