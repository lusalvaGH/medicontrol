-- ============================================================================
-- PROYECTO: MEDICONTROL - SISTEMA DE GESTIÓN HOSPITALARIA Y TURNOS
-- MOTOR: MySQL 8.0+ / MariaDB (InnoDB, UTF-8 Multibyte)
-- ARCHIVO: database/medicontrol_db.sql
-- ============================================================================

-- 1. CREACIÓN Y SELECCIÓN DE LA BASE DE DATOS
DROP DATABASE IF EXISTS medicontrol_db;
CREATE DATABASE medicontrol_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE medicontrol_db;

-- ============================================================================
-- 2. TABLAS PRINCIPALES
-- ============================================================================

-- 2.1. TABLA USUARIOS (Centraliza autenticación y roles)
CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    apellido VARCHAR(80) NOT NULL,
    dni VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL, -- Hashes Bcrypt / Argon2
    rol ENUM('recepcionista', 'medico', 'paciente') NOT NULL,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2.2. TABLA PACIENTES (Extensión de perfil de paciente)
CREATE TABLE pacientes (
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
) ENGINE=InnoDB;

-- 2.3. TABLA MEDICOS (Extensión de perfil de médico)
CREATE TABLE medicos (
    id_medico INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL UNIQUE,
    especialidad VARCHAR(100) NOT NULL,
    matricula VARCHAR(50) NULL,
    CONSTRAINT fk_medicos_usuario 
        FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 2.4. TABLA TURNOS (Gestión de citas médicas)
CREATE TABLE turnos (
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
    -- Evitar solapamiento de turno exacto para el mismo médico
    UNIQUE KEY uk_medico_fecha_hora (id_medico, fecha, hora)
) ENGINE=InnoDB;

-- Índices estratégicos para alto rendimiento en filtros de sesión y agenda
CREATE INDEX idx_turnos_fecha ON turnos(fecha);
CREATE INDEX idx_turnos_paciente_fecha ON turnos(id_paciente, fecha);
CREATE INDEX idx_turnos_medico_fecha ON turnos(id_medico, fecha);
CREATE INDEX idx_usuarios_rol ON usuarios(rol, estado);

-- ============================================================================
-- 3. VISTAS DE SEGURIDAD (SECURITY VIEWS - CONTROL DE ACCESO)
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

-- ============================================================================
-- 4. POBLACIÓN DE DATOS DE PRUEBA (SEED DATA REALISTA)
-- Passwords por defecto: '123456' (Hash generado con password_hash de PHP / Bcrypt)
-- ============================================================================

-- 4.1. Insertar Usuarios
INSERT INTO usuarios (id_usuario, nombre, apellido, dni, email, contrasena, rol, estado) VALUES
-- Recepcionistas
(1, 'Elena', 'Martínez', '30111222', 'operador@medicore.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'recepcionista', 'activo'),
(2, 'Lucas', 'Gómez', '31555666', 'recepcion2@medicore.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'recepcionista', 'activo'),

-- Médicos
(3, 'Alejandro', 'Rossi', '20111333', 'a.rossi@medicore.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'medico', 'activo'),
(4, 'Maria', 'Garcia', '22444555', 'm.garcia@medicore.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'medico', 'activo'),
(5, 'Julián', 'Martínez', '24777888', 'j.martinez@medicore.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'medico', 'activo'),
(6, 'Carlos', 'Ruiz', '23111000', 'c.ruiz@medicore.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'medico', 'activo'),

-- Pacientes
(7, 'Eduardo', 'Rodríguez', '34552121', 'e.rodriguez@mail.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'paciente', 'activo'),
(8, 'Valentina', 'Rossi', '34567890', 'v.rossi@mail.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'paciente', 'activo'),
(9, 'Mateo', 'Fernández', '38991204', 'm.fernandez@mail.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'paciente', 'activo'),
(10, 'Roberto', 'García', '24556788', 'r.garcia@mail.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'paciente', 'activo'),
(11, 'Ricardo', 'Alarcón', '32114556', 'r.alarcon@mail.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'paciente', 'activo'),
(12, 'Lucía', 'Méndez', '36778912', 'l.mendez@mail.com', '$2y$10$wsH02NHsGcDH97H9oPAfPuXUZEJOG7zRVb/uaEdgQmgP66xTPS05K', 'paciente', 'activo');

-- 4.2. Insertar Médicos (Especialidad y Matrícula)
INSERT INTO medicos (id_medico, id_usuario, especialidad, matricula) VALUES
(1, 3, 'Cardiología', 'MN-45892'),
(2, 4, 'Cardiología', 'MN-38104'),
(3, 5, 'Pediatría', 'MN-51209'),
(4, 6, 'Traumatología', 'MN-44910');

-- 4.3. Insertar Pacientes (Datos complementarios)
INSERT INTO pacientes (id_paciente, id_usuario, telefono, direccion, fecha_nacimiento, genero, obra_social) VALUES
(1, 7, '+54 11 4567-8901', 'Av. Rivadavia 1234, CABA', '1988-04-12', 'Masculino', 'OSDE 210'),
(2, 8, '+54 11 5566-7788', 'Av. Santa Fe 2450, Piso 4, CABA', '1992-05-24', 'Femenino', 'Swiss Medical'),
(3, 9, '+54 11 9988-1122', 'Corrientes 3450, CABA', '2001-11-03', 'Masculino', 'Galeno Silver'),
(4, 10, '+54 11 3344-5566', 'Belgrano 890, CABA', '1975-08-19', 'Masculino', 'Particular'),
(5, 11, '+54 11 2233-4455', 'Cabildo 1500, CABA', '1985-02-14', 'Masculino', 'Medifé'),
(6, 12, '+54 11 7788-9900', 'Callao 670, CABA', '1995-09-30', 'Femenino', 'OSDE 310');

-- 4.4. Insertar Turnos Médicos (Coincidentes con las maquetas visuales)
INSERT INTO turnos (id_turno, id_paciente, id_medico, fecha, hora, estado, motivo_consulta, notas_medicas) VALUES
-- Turnos para Dr. Alejandro Rossi / Dra. Maria Garcia (Cardiología)
(1, 1, 2, CURDATE(), '09:00:00', 'confirmado', 'Control cardiológico anual', 'Paciente asintomático.'),
(2, 2, 1, CURDATE(), '09:30:00', 'confirmado', 'Consulta de Seguimiento Post-Quirúrgico', 'Evolución favorable tras cirugía valvular.'),
(3, 3, 1, CURDATE(), '10:30:00', 'en_curso', 'Control post-operatorio y ECG', 'Ligera molestia al esfuerzo leve.'),
(4, 4, 1, CURDATE(), '11:00:00', 'cancelado', 'Chequeo rutinario', '[Cancelación: Aviso previo del paciente por motivos laborales]'),
(5, 5, 3, CURDATE(), '11:30:00', 'pendiente', 'Consulta pediátrica general', 'Primera consulta.'),
(6, 6, 4, CURDATE(), '12:00:00', 'confirmado', 'Dolor articular en rodilla derecha', 'Requiere radiografía previa.'),

-- Turnos adicionales para próximos días
(7, 2, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00', 'confirmado', 'Revisión de estudios', NULL),
(8, 1, 3, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00:00', 'pendiente', 'Control general', NULL),
(9, 3, 4, DATE_ADD(CURDATE(), INTERVAL 3 DAY), '14:30:00', 'confirmado', 'Seguimiento traumatológico', NULL),
(10, 5, 1, DATE_ADD(CURDATE(), INTERVAL 5 DAY), '16:00:00', 'confirmado', 'Consulta cardiológica', NULL);
