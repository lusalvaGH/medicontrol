<?php
declare(strict_types=1);

namespace MediControl\Services;

use Database;
use DateTimeImmutable;
use MediControl\Http\ApiException;
use MediControl\Repositories\TurnosRepository;
use MediControl\Repositories\UsuariosRepository;
use PDOException;

/**
 * Gestión de usuarios desde Configuración de Recepción.
 *
 * Permisos aprobados: recepción gestiona pacientes y médicos, y solo consulta a otros
 * recepcionistas. Nunca se cambia un rol ni se borra un registro: las bajas son lógicas.
 */
final class UsuariosService
{
    public const POR_PAGINA = 10;
    private const ROLES_GESTIONABLES = ['medico', 'paciente'];
    private const ROLES_POR_TIPO = ['personal' => ['medico', 'recepcionista'], 'pacientes' => ['paciente']];

    private UsuariosRepository $usuarios;
    private TurnosRepository $turnos;

    public function __construct(?UsuariosRepository $usuarios = null, ?TurnosRepository $turnos = null)
    {
        $this->usuarios = $usuarios ?? new UsuariosRepository();
        $this->turnos = $turnos ?? new TurnosRepository();
    }

    public function listar(string $tipo, string $buscar, string $estado, int $pagina): array
    {
        if (!isset(self::ROLES_POR_TIPO[$tipo])) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'El tipo de listado no es válido.', ['tipo' => 'invalido']);
        }
        if (!in_array($estado, ['todos', 'activo', 'inactivo'], true)) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'El filtro de estado no es válido.', ['estado' => 'invalido']);
        }
        if (mb_strlen($buscar) > 80) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'La búsqueda es demasiado larga.', ['buscar' => 'demasiado_largo']);
        }

        $resultado = $this->usuarios->listar(
            self::ROLES_POR_TIPO[$tipo],
            $buscar,
            $estado === 'todos' ? null : $estado,
            self::POR_PAGINA,
            ($pagina - 1) * self::POR_PAGINA
        );

        return [
            'usuarios'       => array_map([$this, 'presentar'], $resultado['filas']),
            'total'          => $resultado['total'],
            'pagina'         => $pagina,
            'por_pagina'     => self::POR_PAGINA,
            'paginas'        => max(1, (int) ceil($resultado['total'] / self::POR_PAGINA)),
            'especialidades' => $this->usuarios->especialidades(),
        ];
    }

    public function detalle(int $idUsuario): array
    {
        return $this->presentar($this->exigirUsuario($idUsuario));
    }

    public function crear(array $entrada, DateTimeImmutable $hoy): array
    {
        $rol = is_string($entrada['rol'] ?? null) ? $entrada['rol'] : '';
        if ($rol === 'recepcionista') {
            throw new ApiException(403, 'SIN_PERMISO', 'Recepción no puede crear otros recepcionistas.');
        }
        if (!in_array($rol, self::ROLES_GESTIONABLES, true)) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'Elegí si vas a registrar un paciente o un médico.', ['rol' => 'Elegí un tipo de usuario válido.']);
        }

        $datos = $this->validar($rol, $entrada, $hoy, true);
        $this->exigirSinDuplicados($datos);

        try {
            $idUsuario = $rol === 'paciente'
                ? (new RegistroPacientesService())->registrar($datos)
                : $this->registrarMedico($datos);
        } catch (PDOException $e) {
            $this->relanzarDuplicado($e);
            throw $e;
        }
        if ($idUsuario === null) {
            $this->relanzarDuplicado(null);
        }

        return $this->detalle($idUsuario);
    }

    public function modificar(int $idUsuario, array $entrada, DateTimeImmutable $hoy): array
    {
        $usuario = $this->exigirGestionable($idUsuario);
        if (array_key_exists('rol', $entrada) && $entrada['rol'] !== $usuario['rol']) {
            throw new ApiException(403, 'CAMBIO_ROL_NO_PERMITIDO', 'El rol de un usuario no se puede cambiar.');
        }

        $datos = $this->validar($usuario['rol'], $entrada, $hoy, false);
        $this->exigirSinDuplicados($datos, $idUsuario);

        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        try {
            $this->usuarios->actualizarPersona($idUsuario, $datos);
            if ($usuario['rol'] === 'medico') {
                $this->usuarios->actualizarPerfilMedico($idUsuario, $datos);
            } else {
                $this->usuarios->actualizarPerfilPaciente($idUsuario, $datos);
            }
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            $this->relanzarDuplicado($e);
            throw $e;
        }

        return $this->detalle($idUsuario);
    }

    public function darDeBaja(int $idUsuario, int $idActor, DateTimeImmutable $ahora): array
    {
        if ($idUsuario === $idActor) {
            throw new ApiException(403, 'BAJA_PROPIA_NO_PERMITIDA', 'No podés darte de baja a vos mismo.');
        }
        $usuario = $this->exigirGestionable($idUsuario);
        if ($usuario['estado'] === 'inactivo') {
            throw new ApiException(409, 'YA_INACTIVO', 'El usuario ya está dado de baja.');
        }

        $sinResolver = $this->turnos->contarSinResolverDeUsuario($idUsuario, $usuario['rol'], $ahora);
        if ($sinResolver > 0) {
            $persona = $usuario['rol'] === 'medico' ? 'El médico' : 'El paciente';
            throw new ApiException(409, 'TURNOS_SIN_RESOLVER', "{$persona} tiene {$sinResolver} turno(s) futuro(s) o en curso. Cancelalos o resolvelos desde la agenda antes de dar la baja.");
        }

        if ($this->usuarios->cambiarEstado($idUsuario, 'inactivo', 'activo') === 0) {
            throw new ApiException(409, 'USUARIO_MODIFICADO', 'El usuario cambió mientras se guardaba. Recargá el listado e intentá de nuevo.');
        }

        return $this->detalle($idUsuario);
    }

    public function reactivar(int $idUsuario): array
    {
        $usuario = $this->exigirGestionable($idUsuario);
        if ($usuario['estado'] === 'activo') {
            throw new ApiException(409, 'YA_ACTIVO', 'El usuario ya está activo.');
        }
        if ($this->usuarios->cambiarEstado($idUsuario, 'activo', 'inactivo') === 0) {
            throw new ApiException(409, 'USUARIO_MODIFICADO', 'El usuario cambió mientras se guardaba. Recargá el listado e intentá de nuevo.');
        }

        return $this->detalle($idUsuario);
    }

    /** Asigna una contraseña provisoria. La huella de sesión cierra las sesiones abiertas de ese usuario. */
    public function restablecerContrasena(int $idUsuario, int $idActor, array $entrada): void
    {
        if ($idUsuario === $idActor) {
            throw new ApiException(403, 'SIN_PERMISO', 'Tu propia contraseña se cambia desde Mi cuenta.');
        }
        $this->exigirGestionable($idUsuario);

        $validacion = ValidadorPersonas::contrasena($entrada);
        if ($validacion['errores'] !== []) {
            throw new ApiException(422, 'CONTRASENA_NO_VALIDA', 'Revisá la contraseña provisoria.', $validacion['errores']);
        }
        $this->usuarios->establecerContrasena($idUsuario, password_hash($validacion['datos']['contrasena'], PASSWORD_DEFAULT));
    }

    private function validar(string $rol, array $entrada, DateTimeImmutable $hoy, bool $conContrasena): array
    {
        $partes = [
            ValidadorPersonas::persona($entrada),
            $rol === 'medico' ? ValidadorPersonas::perfilMedico($entrada) : ValidadorPersonas::perfilPaciente($entrada, $hoy),
        ];
        if ($conContrasena) {
            $partes[] = ValidadorPersonas::contrasena($entrada);
        }

        $datos = [];
        $errores = [];
        foreach ($partes as $parte) {
            $datos += $parte['datos'];
            $errores += $parte['errores'];
        }
        if ($errores !== []) {
            throw new ApiException(400, 'DATOS_INVALIDOS', 'Revisá los campos marcados.', $errores);
        }

        return $datos;
    }

    private function exigirSinDuplicados(array $datos, ?int $exceptoUsuario = null): void
    {
        $campos = [];
        foreach ($this->usuarios->datosDuplicados($datos['email'], $datos['dni'], $exceptoUsuario) as $campo) {
            $campos[$campo] = $campo === 'email' ? 'Ese correo ya está registrado.' : 'Ese DNI ya está registrado.';
        }
        if ($campos !== []) {
            throw new ApiException(409, 'DATO_DUPLICADO', 'Hay datos que ya pertenecen a otro usuario.', $campos);
        }
    }

    /** Dos envíos simultáneos con el mismo dato: lo impide la restricción única de la base. */
    private function relanzarDuplicado(?PDOException $e): void
    {
        if ($e === null || (int) ($e->errorInfo[1] ?? 0) === 1062) {
            throw new ApiException(409, 'DATO_DUPLICADO', 'El correo o el DNI ya pertenecen a otro usuario.');
        }
    }

    private function registrarMedico(array $datos): int
    {
        $pdo = Database::getConnection();
        $pdo->beginTransaction();
        try {
            $idUsuario = $this->usuarios->insertar($datos, 'medico', password_hash($datos['contrasena'], PASSWORD_DEFAULT));
            $this->usuarios->insertarPerfilMedico($idUsuario, $datos);
            $pdo->commit();

            return $idUsuario;
        } catch (PDOException $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    private function exigirUsuario(int $idUsuario): array
    {
        $usuario = $this->usuarios->detalle($idUsuario);
        if ($usuario === null) {
            throw new ApiException(404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.');
        }

        return $usuario;
    }

    private function exigirGestionable(int $idUsuario): array
    {
        $usuario = $this->exigirUsuario($idUsuario);
        if (!in_array($usuario['rol'], self::ROLES_GESTIONABLES, true)) {
            throw new ApiException(403, 'SIN_PERMISO', 'Recepción solo puede consultar a otros recepcionistas.');
        }

        return $usuario;
    }

    private function presentar(array $fila): array
    {
        $fila['id_usuario'] = (int) $fila['id_usuario'];
        $fila['gestionable'] = in_array($fila['rol'], self::ROLES_GESTIONABLES, true);

        return $fila;
    }
}
