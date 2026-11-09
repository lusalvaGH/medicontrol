-- ============================================================================
-- MEDICONTROL - Esquema inicial para Docker (base medicontrol_local)
--
-- Copia exacta de las secciones 2 y 3 de database/medicontrol.sql (tablas, índices,
-- claves foráneas y vistas), sin CREATE DATABASE, USE ni datos:
--   * La base la crea la imagen de MariaDB con el nombre de MARIADB_DATABASE.
--   * No hay cuentas ni turnos: las 3 cuentas iniciales se crean a mano con
--     backend/scripts/crear-cuentas-iniciales.mjs (ver docs/instalacion-docker.md).
--
-- MariaDB ejecuta este archivo UNA sola vez, cuando el volumen de datos está vacío.
-- Si cambiás el esquema en database/medicontrol.sql, actualizá también este archivo.
-- ============================================================================

-- ============================================================================
-- 2. TABLAS PRINCIPALES
-- ============================================================================

-- 2.1. TABLA USUARIOS (Centraliza autenticación y control de accesos RBAC)
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    apellido VARCHAR(80) NOT NULL,
    dni VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,
    rol ENUM('recepcionista', 'medico', 'paciente') NOT NULL,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_usuarios_rol (rol, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.2. TABLA PACIENTES (Extensión de perfil para pacientes)
CREATE TABLE IF NOT EXISTS pacientes (
    id_paciente INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL UNIQUE,
    telefono VARCHAR(30) NULL,
    direccion VARCHAR(200) NULL,
    fecha_nacimiento DATE NULL,
    genero ENUM('Femenino', 'Masculino', 'Otro') NULL,
    obra_social VARCHAR(100) NULL DEFAULT 'Particular',
    CONSTRAINT fk_pacientes_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.3. TABLA MEDICOS (Extensión de perfil para profesionales médicos)
CREATE TABLE IF NOT EXISTS medicos (
    id_medico INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL UNIQUE,
    especialidad VARCHAR(100) NOT NULL,
    matricula VARCHAR(50) NULL,
    CONSTRAINT fk_medicos_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2.4. TABLA TURNOS (Gestión de citas médicas y estados)
CREATE TABLE IF NOT EXISTS turnos (
    id_turno INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT NOT NULL,
    id_medico INT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    estado ENUM('pendiente', 'confirmado', 'en_curso', 'atendido', 'cancelado') NOT NULL DEFAULT 'pendiente',
    motivo_consulta VARCHAR(255) NULL,
    notas_medicas TEXT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_turnos_paciente
        FOREIGN KEY (id_paciente) REFERENCES pacientes(id_paciente)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_turnos_medico
        FOREIGN KEY (id_medico) REFERENCES medicos(id_medico)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uk_medico_fecha_hora (id_medico, fecha, hora),
    INDEX idx_turnos_fecha (fecha),
    INDEX idx_turnos_paciente_fecha (id_paciente, fecha),
    INDEX idx_turnos_medico_fecha (id_medico, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. VISTAS DE SEGURIDAD (SECURITY VIEWS - CONTROL DE ACCESO RBAC)
-- ============================================================================

-- 3.1. Vista para Recepción: Visión consolidada de toda la agenda hospitalaria
CREATE OR REPLACE VIEW vista_recepcion_turnos AS
SELECT
    t.id_turno,
    t.fecha,
    t.hora,
    t.estado,
    t.motivo_consulta,
    t.notas_medicas,
    p.id_paciente,
    up.nombre AS paciente_nombre,
    up.apellido AS paciente_apellido,
    up.dni AS paciente_dni,
    p.telefono AS paciente_telefono,
    p.obra_social AS paciente_obra_social,
    m.id_medico,
    um.nombre AS medico_nombre,
    um.apellido AS medico_apellido,
    m.especialidad AS medico_especialidad,
    m.matricula AS medico_matricula
FROM turnos t
JOIN pacientes p ON t.id_paciente = p.id_paciente
JOIN usuarios up ON p.id_usuario = up.id_usuario
JOIN medicos m ON t.id_medico = m.id_medico
JOIN usuarios um ON m.id_usuario = um.id_usuario;

-- 3.2. Vista para Médico: Su propia agenda con datos básicos de pacientes asignados
CREATE OR REPLACE VIEW vista_medico_agenda AS
SELECT
    t.id_turno,
    t.id_medico,
    t.fecha,
    t.hora,
    t.estado,
    t.motivo_consulta,
    t.notas_medicas,
    p.id_paciente,
    up.nombre AS paciente_nombre,
    up.apellido AS paciente_apellido,
    up.dni AS paciente_dni,
    p.telefono AS paciente_telefono,
    p.obra_social AS paciente_obra_social
FROM turnos t
JOIN pacientes p ON t.id_paciente = p.id_paciente
JOIN usuarios up ON p.id_usuario = up.id_usuario;

-- 3.3. Vista para Paciente: Consulta segura y restringida de sus propios turnos
CREATE OR REPLACE VIEW vista_paciente_turnos AS
SELECT
    t.id_turno,
    t.id_paciente,
    t.fecha,
    t.hora,
    t.estado,
    t.motivo_consulta,
    um.nombre AS medico_nombre,
    um.apellido AS medico_apellido,
    m.especialidad AS medico_especialidad
FROM turnos t
JOIN medicos m ON t.id_medico = m.id_medico
JOIN usuarios um ON m.id_usuario = um.id_usuario;
