<?php
declare(strict_types=1);

namespace MediControl\Repositories;

use Database;
use PDO;

final class UsuariosRepository
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Database::getConnection();
    }

    /**
     * Datos del usuario necesarios para validar una sesión (sin la contraseña).
     */
    public function buscarPorId(int $idUsuario): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id_usuario, nombre, apellido, email, rol, estado
             FROM usuarios
             WHERE id_usuario = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $idUsuario]);
        $fila = $stmt->fetch();

        return $fila ?: null;
    }

    /** Hash de la contraseña. Separado de buscarPorId para leerlo solo cuando hace falta. */
    public function buscarHashContrasena(int $idUsuario): ?string
    {
        $stmt = $this->pdo->prepare('SELECT contrasena FROM usuarios WHERE id_usuario = :id LIMIT 1');
        $stmt->execute([':id' => $idUsuario]);
        $hash = $stmt->fetchColumn();

        return is_string($hash) ? $hash : null;
    }

    /**
     * Guarda el hash nuevo solo si la contraseña no cambió desde que se leyó y el usuario
     * sigue activo. Devuelve las filas modificadas.
     */
    public function actualizarContrasena(int $idUsuario, string $hashNuevo, string $hashLeido): int
    {
        $stmt = $this->pdo->prepare(
            "UPDATE usuarios SET contrasena = :nuevo
             WHERE id_usuario = :id AND contrasena = :leido AND estado = 'activo'"
        );
        $stmt->execute([':nuevo' => $hashNuevo, ':id' => $idUsuario, ':leido' => $hashLeido]);

        return $stmt->rowCount();
    }

    private const CAMPOS_LISTADO = 'u.id_usuario, u.nombre, u.apellido, u.dni, u.email, u.rol, u.estado,
                m.especialidad, m.matricula, p.obra_social, p.telefono';

    /**
     * Listado paginado. Nunca incluye la contraseña.
     *
     * @param string[] $roles
     * @return array{filas: array, total: int}
     */
    public function listar(array $roles, string $buscar, ?string $estado, int $limite, int $desplazamiento): array
    {
        $marcas = [];
        $parametros = [];
        foreach (array_values($roles) as $i => $rol) {
            $marcas[] = ":rol{$i}";
            $parametros[":rol{$i}"] = $rol;
        }
        $condiciones = ['u.rol IN (' . implode(', ', $marcas) . ')'];
        if ($estado !== null) {
            $condiciones[] = 'u.estado = :estado';
            $parametros[':estado'] = $estado;
        }
        if ($buscar !== '') {
            $condiciones[] = "(u.nombre LIKE :b1 OR u.apellido LIKE :b2 OR CONCAT(u.nombre, ' ', u.apellido) LIKE :b3
                               OR u.dni LIKE :b4 OR u.email LIKE :b5 OR m.especialidad LIKE :b6)";
            $patron = '%' . addcslashes($buscar, '%_\\') . '%';
            foreach (range(1, 6) as $i) {
                $parametros[":b{$i}"] = $patron;
            }
        }
        $desde = 'FROM usuarios u
                  LEFT JOIN medicos m ON m.id_usuario = u.id_usuario
                  LEFT JOIN pacientes p ON p.id_usuario = u.id_usuario
                  WHERE ' . implode(' AND ', $condiciones);

        $stmt = $this->pdo->prepare("SELECT COUNT(*) {$desde}");
        $stmt->execute($parametros);
        $total = (int) $stmt->fetchColumn();

        $limite = max(1, $limite);
        $desplazamiento = max(0, $desplazamiento);
        $stmt = $this->pdo->prepare('SELECT ' . self::CAMPOS_LISTADO . " {$desde} ORDER BY u.apellido, u.nombre, u.id_usuario LIMIT {$limite} OFFSET {$desplazamiento}");
        $stmt->execute($parametros);

        return ['filas' => $stmt->fetchAll(), 'total' => $total];
    }

    /** Detalle con los datos del perfil. Nunca incluye la contraseña. */
    public function detalle(int $idUsuario): ?array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::CAMPOS_LISTADO . ', p.direccion, p.fecha_nacimiento, p.genero
            FROM usuarios u
            LEFT JOIN medicos m ON m.id_usuario = u.id_usuario
            LEFT JOIN pacientes p ON p.id_usuario = u.id_usuario
            WHERE u.id_usuario = :id
            LIMIT 1');
        $stmt->execute([':id' => $idUsuario]);
        $fila = $stmt->fetch();

        return $fila ?: null;
    }

    /** @return string[] especialidades ya cargadas en la base */
    public function especialidades(): array
    {
        return $this->pdo->query('SELECT DISTINCT especialidad FROM medicos ORDER BY especialidad')->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * Qué datos únicos ya usa otro usuario.
     *
     * @return string[] 'email' y/o 'dni'
     */
    public function datosDuplicados(string $email, string $dni, ?int $exceptoUsuario = null): array
    {
        $stmt = $this->pdo->prepare('SELECT email, dni FROM usuarios WHERE (email = :email OR dni = :dni) AND id_usuario <> :excepto');
        $stmt->execute([':email' => $email, ':dni' => $dni, ':excepto' => $exceptoUsuario ?? 0]);

        $duplicados = [];
        foreach ($stmt->fetchAll() as $fila) {
            if (mb_strtolower((string) $fila['email']) === mb_strtolower($email)) {
                $duplicados['email'] = 'email';
            }
            if ((string) $fila['dni'] === $dni) {
                $duplicados['dni'] = 'dni';
            }
        }

        return array_values($duplicados);
    }

    /** Crea el usuario activo. El rol lo decide siempre quien llama, nunca un formulario. */
    public function insertar(array $datos, string $rol, string $hashContrasena): int
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO usuarios (nombre, apellido, dni, email, contrasena, rol, estado)
            VALUES (:nombre, :apellido, :dni, :email, :contrasena, :rol, 'activo')
        ");
        $stmt->execute([
            ':nombre'     => $datos['nombre'],
            ':apellido'   => $datos['apellido'],
            ':dni'        => $datos['dni'],
            ':email'      => $datos['email'],
            ':contrasena' => $hashContrasena,
            ':rol'        => $rol,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function insertarPerfilPaciente(int $idUsuario, array $datos): void
    {
        $stmt = $this->pdo->prepare('
            INSERT INTO pacientes (id_usuario, telefono, direccion, fecha_nacimiento, genero, obra_social)
            VALUES (:id_usuario, :telefono, :direccion, :fecha_nacimiento, :genero, :obra_social)
        ');
        $stmt->execute([':id_usuario' => $idUsuario] + self::parametrosPaciente($datos));
    }

    public function insertarPerfilMedico(int $idUsuario, array $datos): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO medicos (id_usuario, especialidad, matricula) VALUES (:id_usuario, :especialidad, :matricula)');
        $stmt->execute([':id_usuario' => $idUsuario, ':especialidad' => $datos['especialidad'], ':matricula' => $datos['matricula'] !== '' ? $datos['matricula'] : null]);
    }

    /** Actualiza los datos personales. El rol, el estado y la contraseña no se tocan acá. */
    public function actualizarPersona(int $idUsuario, array $datos): void
    {
        $stmt = $this->pdo->prepare('UPDATE usuarios SET nombre = :nombre, apellido = :apellido, dni = :dni, email = :email WHERE id_usuario = :id');
        $stmt->execute([':nombre' => $datos['nombre'], ':apellido' => $datos['apellido'], ':dni' => $datos['dni'], ':email' => $datos['email'], ':id' => $idUsuario]);
    }

    public function actualizarPerfilPaciente(int $idUsuario, array $datos): void
    {
        $stmt = $this->pdo->prepare('
            UPDATE pacientes SET telefono = :telefono, direccion = :direccion, fecha_nacimiento = :fecha_nacimiento,
                                 genero = :genero, obra_social = :obra_social
            WHERE id_usuario = :id_usuario
        ');
        $stmt->execute([':id_usuario' => $idUsuario] + self::parametrosPaciente($datos));
    }

    public function actualizarPerfilMedico(int $idUsuario, array $datos): void
    {
        $stmt = $this->pdo->prepare('UPDATE medicos SET especialidad = :especialidad, matricula = :matricula WHERE id_usuario = :id_usuario');
        $stmt->execute([':id_usuario' => $idUsuario, ':especialidad' => $datos['especialidad'], ':matricula' => $datos['matricula'] !== '' ? $datos['matricula'] : null]);
    }

    /** Baja lógica o reactivación: solo aplica si el estado sigue siendo el esperado. */
    public function cambiarEstado(int $idUsuario, string $estadoNuevo, string $estadoEsperado): int
    {
        $stmt = $this->pdo->prepare('UPDATE usuarios SET estado = :nuevo WHERE id_usuario = :id AND estado = :esperado');
        $stmt->execute([':nuevo' => $estadoNuevo, ':id' => $idUsuario, ':esperado' => $estadoEsperado]);

        return $stmt->rowCount();
    }

    /** Contraseña provisoria: al cambiar el hash, las sesiones de ese usuario dejan de ser válidas. */
    public function establecerContrasena(int $idUsuario, string $hashNuevo): void
    {
        $stmt = $this->pdo->prepare('UPDATE usuarios SET contrasena = :nuevo WHERE id_usuario = :id');
        $stmt->execute([':nuevo' => $hashNuevo, ':id' => $idUsuario]);
    }

    private static function parametrosPaciente(array $datos): array
    {
        return [
            ':telefono'         => $datos['telefono'] !== '' ? $datos['telefono'] : null,
            ':direccion'        => $datos['direccion'] !== '' ? $datos['direccion'] : null,
            ':fecha_nacimiento' => $datos['fecha_nacimiento'] !== '' ? $datos['fecha_nacimiento'] : null,
            ':genero'           => $datos['genero'] !== '' ? $datos['genero'] : null,
            ':obra_social'      => $datos['obra_social'] !== '' ? $datos['obra_social'] : 'Particular',
        ];
    }
}
