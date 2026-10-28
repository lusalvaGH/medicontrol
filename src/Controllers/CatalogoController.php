<?php
declare(strict_types=1);

namespace MediControl\Controllers;

use MediControl\Auth\Guard;
use MediControl\Http\ApiException;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;
use MediControl\Repositories\PersonasRepository;
use MediControl\Services\TurnosService;

/**
 * Datos de apoyo para registrar turnos: médicos, pacientes y horarios disponibles.
 */
final class CatalogoController
{
    /** GET /medicos */
    public static function medicos(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        return Respuesta::ok(['medicos' => (new PersonasRepository())->listarMedicos()]);
    }

    /** GET /pacientes?buscar=texto&limite=50 */
    public static function pacientes(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        $texto = $pedido->texto('buscar') ?? '';
        if (mb_strlen($texto) > 80) {
            throw new ApiException(400, 'BUSQUEDA_INVALIDA', 'La búsqueda es demasiado larga.');
        }
        $limite = (int) ($pedido->texto('limite') ?? 50);
        $limite = max(1, min(100, $limite));

        return Respuesta::ok(['pacientes' => (new PersonasRepository())->buscarPacientes($texto, $limite)]);
    }

    /** GET /medicos/{id}/disponibilidad?fecha=YYYY-MM-DD */
    public static function disponibilidad(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        $fecha = $pedido->texto('fecha') ?? '';
        if (!turnosFechaValida($fecha)) {
            throw new ApiException(400, 'FECHA_INVALIDA', 'La fecha no es válida. Formato esperado: YYYY-MM-DD.', ['fecha' => 'invalida']);
        }
        $idMedico = (int) $pedido->parametrosRuta['id'];

        return Respuesta::ok([
            'id_medico' => $idMedico,
            'fecha'     => $fecha,
            'horarios'  => (new TurnosService())->disponibilidad($idMedico, $fecha, turnosAhora()),
        ]);
    }
}
