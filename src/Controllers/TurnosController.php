<?php
declare(strict_types=1);

namespace MediControl\Controllers;

use MediControl\Auth\Csrf;
use MediControl\Auth\Guard;
use MediControl\Http\ApiException;
use MediControl\Http\Request;
use MediControl\Http\Respuesta;
use MediControl\Repositories\TurnosRepository;
use MediControl\Services\TurnosService;

final class TurnosController
{
    /** Máximo de días que se puede pedir con desde/hasta (cubre una grilla mensual completa). */
    private const MAX_DIAS_RANGO = 42;

    /** GET /turnos?fecha=YYYY-MM-DD  o  GET /turnos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD */
    public static function listar(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        $fecha = $pedido->texto('fecha');
        $desde = $pedido->texto('desde');
        $hasta = $pedido->texto('hasta');

        if (($fecha === null || $fecha === '') && ($desde !== null || $hasta !== null)) {
            return self::listarRango((string) $desde, (string) $hasta);
        }
        if ($fecha === null || $fecha === '') {
            throw new ApiException(400, 'PARAMETRO_REQUERIDO', 'Indicá la fecha (YYYY-MM-DD) o el rango desde/hasta.', ['fecha' => 'requerido']);
        }
        if (!turnosFechaValida($fecha)) {
            throw new ApiException(400, 'FECHA_INVALIDA', 'La fecha no es válida. Formato esperado: YYYY-MM-DD.', ['fecha' => 'invalida']);
        }

        return Respuesta::ok([
            'fecha'  => $fecha,
            'turnos' => (new TurnosRepository())->listarPorFecha($fecha),
        ]);
    }

    private static function listarRango(string $desde, string $hasta): Respuesta
    {
        $campos = [];
        if (!turnosFechaValida($desde)) {
            $campos['desde'] = 'invalida';
        }
        if (!turnosFechaValida($hasta)) {
            $campos['hasta'] = 'invalida';
        }
        if ($campos !== []) {
            throw new ApiException(400, 'FECHA_INVALIDA', 'Las fechas desde y hasta deben tener el formato YYYY-MM-DD.', $campos);
        }

        $inicio = new \DateTimeImmutable($desde);
        $fin = new \DateTimeImmutable($hasta);
        if ($fin < $inicio) {
            throw new ApiException(400, 'RANGO_INVALIDO', 'La fecha hasta no puede ser anterior a desde.');
        }
        if ($inicio->diff($fin)->days + 1 > self::MAX_DIAS_RANGO) {
            throw new ApiException(400, 'RANGO_DEMASIADO_AMPLIO', 'El rango no puede superar los ' . self::MAX_DIAS_RANGO . ' días.');
        }

        return Respuesta::ok([
            'desde'  => $desde,
            'hasta'  => $hasta,
            'turnos' => (new TurnosRepository())->listarPorRango($desde, $hasta),
        ]);
    }

    /** GET /turnos/{id} */
    public static function detalle(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        $idTurno = (int) $pedido->parametrosRuta['id'];
        $turno = $idTurno > 0 ? (new TurnosRepository())->buscarPorId($idTurno) : null;
        if ($turno === null) {
            throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
        }

        return Respuesta::ok(['turno' => $turno]);
    }

    /** POST /turnos  {id_paciente, id_medico, fecha, hora, motivo_consulta} */
    public static function crear(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        $turno = (new TurnosService())->crear([
            'id_paciente'     => $pedido->campoEntero('id_paciente'),
            'id_medico'       => $pedido->campoEntero('id_medico'),
            'fecha'           => $pedido->campoTexto('fecha'),
            'hora'            => $pedido->campoTexto('hora'),
            'motivo_consulta' => $pedido->campoTexto('motivo_consulta'),
        ], turnosAhora());

        return Respuesta::ok(['turno' => $turno], 201);
    }

    /** PATCH /turnos/{id}  {fecha, hora, estado} */
    public static function modificar(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        $resultado = (new TurnosService())->modificar((int) $pedido->parametrosRuta['id'], [
            'fecha'  => $pedido->campoTexto('fecha'),
            'hora'   => $pedido->campoTexto('hora'),
            'estado' => $pedido->campoTexto('estado'),
        ], turnosAhora());

        return Respuesta::ok($resultado);
    }

    /** POST /turnos/{id}/cancelacion */
    public static function cancelar(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');
        Csrf::verificar($pedido);

        return Respuesta::ok(['turno' => (new TurnosService())->cancelar((int) $pedido->parametrosRuta['id'])]);
    }

    /** GET /turnos/resumen?mes=YYYY-MM */
    public static function resumen(Request $pedido): Respuesta
    {
        Guard::requerirRol('recepcionista');

        $mes = $pedido->texto('mes') ?? '';
        $primerDia = turnosParsearMes($mes);
        if ($primerDia === null) {
            throw new ApiException(400, 'MES_INVALIDO', 'El mes no es válido. Formato esperado: YYYY-MM.', ['mes' => 'invalido']);
        }

        return Respuesta::ok([
            'mes'  => $mes,
            'dias' => (new TurnosRepository())->resumenMensual($primerDia),
        ]);
    }
}
