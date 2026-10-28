<?php
declare(strict_types=1);

namespace MediControl\Services;

use DateTimeImmutable;
use MediControl\Http\ApiException;
use MediControl\Repositories\PersonasRepository;
use MediControl\Repositories\TurnosRepository;
use PDOException;

/**
 * Reglas de negocio para registrar, modificar y cancelar turnos.
 * Las reglas puras (horarios, estados, transiciones, fecha futura) están en
 * includes/turnos.php y son las mismas que usan las pantallas PHP.
 */
final class TurnosService
{
    private TurnosRepository $turnos;
    private PersonasRepository $personas;

    public function __construct(?TurnosRepository $turnos = null, ?PersonasRepository $personas = null)
    {
        $this->turnos = $turnos ?? new TurnosRepository();
        $this->personas = $personas ?? new PersonasRepository();
    }

    /**
     * @param array{id_paciente: ?int, id_medico: ?int, fecha: ?string, hora: ?string, motivo_consulta: ?string} $datos
     */
    public function crear(array $datos, DateTimeImmutable $ahora): array
    {
        $campos = [];
        $idPaciente = $datos['id_paciente'];
        $idMedico = $datos['id_medico'];
        $fecha = (string) ($datos['fecha'] ?? '');
        $hora = turnosNormalizarHora((string) ($datos['hora'] ?? ''));
        $motivo = trim((string) ($datos['motivo_consulta'] ?? ''));

        if ($idPaciente === null) {
            $campos['id_paciente'] = 'requerido';
        }
        if ($idMedico === null) {
            $campos['id_medico'] = 'requerido';
        }
        if (!turnosFechaValida($fecha)) {
            $campos['fecha'] = 'invalida';
        }
        if ($hora === null) {
            $campos['hora'] = 'invalida';
        }
        if ($motivo === '' || mb_strlen($motivo) > 255) {
            $campos['motivo_consulta'] = $motivo === '' ? 'requerido' : 'demasiado_largo';
        }
        if ($campos !== []) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'Revisá los datos del turno.', $campos);
        }

        if (!turnosHorarioPermitido($hora)) {
            throw new ApiException(422, 'HORARIO_NO_PERMITIDO', 'El horario elegido no está entre los horarios permitidos.', ['hora' => 'no_permitida']);
        }
        if (!turnosEsFuturo($fecha, $hora, $ahora)) {
            throw new ApiException(422, 'FECHA_PASADA', 'La fecha y hora elegidas ya pasaron. Elegí un horario futuro.', ['fecha' => 'pasada']);
        }
        if (!$this->personas->pacienteActivo($idPaciente)) {
            throw new ApiException(422, 'PACIENTE_NO_DISPONIBLE', 'El paciente seleccionado no existe o no está activo.', ['id_paciente' => 'no_disponible']);
        }
        if (!$this->personas->medicoActivo($idMedico)) {
            throw new ApiException(422, 'MEDICO_NO_DISPONIBLE', 'El médico seleccionado no existe o no está activo.', ['id_medico' => 'no_disponible']);
        }
        if ($this->turnos->horarioOcupado($idMedico, $fecha, $hora)) {
            throw new ApiException(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para el médico seleccionado.');
        }

        try {
            $id = $this->turnos->insertar($idPaciente, $idMedico, $fecha, $hora, $motivo);
        } catch (PDOException $e) {
            // Otra persona tomó el mismo horario entre la verificación y la inserción
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                throw new ApiException(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para el médico seleccionado.');
            }
            throw $e;
        }

        return $this->turnos->buscarPorId($id) ?? ['id_turno' => $id];
    }

    /**
     * @param array{fecha: ?string, hora: ?string, estado: ?string} $datos
     * @return array{turno: array, sin_cambios: bool}
     */
    public function modificar(int $idTurno, array $datos, DateTimeImmutable $ahora): array
    {
        $fecha = (string) ($datos['fecha'] ?? '');
        $hora = turnosNormalizarHora((string) ($datos['hora'] ?? ''));
        $estado = (string) ($datos['estado'] ?? '');

        $campos = [];
        if (!turnosFechaValida($fecha)) {
            $campos['fecha'] = 'invalida';
        }
        if ($hora === null) {
            $campos['hora'] = 'invalida';
        }
        if (!isset(TURNOS_ESTADOS[$estado])) {
            $campos['estado'] = 'invalido';
        }
        if ($campos !== []) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'Revisá los datos del turno.', $campos);
        }

        $actual = $this->turnos->buscarParaActualizar($idTurno);
        if ($actual === null) {
            throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
        }

        $validacion = turnosValidarModificacion($actual, $fecha, $hora, $estado, $ahora);
        if ($validacion['error'] !== null) {
            throw new ApiException(409, 'CAMBIO_NO_PERMITIDO', $validacion['error']);
        }
        if ($validacion['sin_cambios']) {
            return ['turno' => $this->turnos->buscarPorId($idTurno), 'sin_cambios' => true];
        }

        if ($validacion['reprograma'] && $this->turnos->horarioOcupado((int) $actual['id_medico'], $fecha, $hora, $idTurno)) {
            throw new ApiException(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para ese médico en esa fecha.');
        }

        try {
            $filas = $this->turnos->actualizarSiNoCambio($idTurno, ['fecha' => $fecha, 'hora' => $hora, 'estado' => $estado], $actual);
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
                throw new ApiException(409, 'HORARIO_OCUPADO', 'Ese horario ya está ocupado para ese médico en esa fecha.');
            }
            throw $e;
        }
        if ($filas === 0) {
            throw new ApiException(409, 'TURNO_MODIFICADO', 'El turno cambió mientras se guardaba. Recargá la página e intentá de nuevo.');
        }

        return ['turno' => $this->turnos->buscarPorId($idTurno), 'sin_cambios' => false];
    }

    public function cancelar(int $idTurno): array
    {
        $actual = $this->turnos->buscarParaActualizar($idTurno);
        if ($actual === null) {
            throw new ApiException(404, 'TURNO_NO_ENCONTRADO', 'Turno no encontrado.');
        }
        $estado = (string) $actual['estado'];
        if ($estado === 'cancelado') {
            throw new ApiException(409, 'YA_CANCELADO', 'El turno ya está cancelado.');
        }
        if (!turnosPuedeTransicionar($estado, 'cancelado')) {
            $etiqueta = TURNOS_ESTADOS[$estado] ?? $estado;
            throw new ApiException(409, 'CAMBIO_NO_PERMITIDO', "No se puede cancelar un turno «{$etiqueta}».");
        }
        if ($this->turnos->cancelarSiEstado($idTurno, $estado) === 0) {
            throw new ApiException(409, 'TURNO_MODIFICADO', 'El turno cambió mientras se cancelaba. Recargá la página e intentá de nuevo.');
        }

        return $this->turnos->buscarPorId($idTurno);
    }

    /**
     * Estado de cada horario permitido para un médico en una fecha: libre, ocupado o pasado.
     */
    public function disponibilidad(int $idMedico, string $fecha, DateTimeImmutable $ahora): array
    {
        if (!$this->personas->medicoActivo($idMedico)) {
            throw new ApiException(404, 'MEDICO_NO_ENCONTRADO', 'El médico no existe o no está activo.');
        }
        $ocupadas = array_flip($this->turnos->horasOcupadas($idMedico, $fecha));

        $horarios = [];
        foreach (TURNOS_HORARIOS as $hora) {
            $estado = isset($ocupadas[$hora]) ? 'ocupado' : (turnosEsFuturo($fecha, $hora, $ahora) ? 'libre' : 'pasado');
            $horarios[] = ['hora' => substr($hora, 0, 5), 'estado' => $estado];
        }

        return $horarios;
    }
}
