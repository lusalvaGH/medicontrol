-- ============================================================================
-- 001 · Un turno cancelado libera su horario y un paciente no puede tener dos turnos a la vez
--
-- Antes: el índice único uk_medico_fecha_hora (id_medico, fecha, hora) contaba también los
-- turnos cancelados, así que un horario cancelado no se podía volver a dar.
--
-- Ahora: la columna calculada ocupa_horario vale 1 para los turnos vigentes y NULL para los
-- cancelados. Un índice único admite varios NULL, así que los cancelados no chocan entre sí ni
-- con un turno nuevo, pero dos turnos vigentes en el mismo horario siguen siendo imposibles:
--   · del mismo médico   → uk_medico_horario_activo
--   · del mismo paciente → uk_paciente_horario_activo (regla nueva)
--
-- Compatible con MariaDB 10.4 (columna PERSISTENT con índice). Se puede repetir sin efectos:
-- todas las sentencias usan IF EXISTS / IF NOT EXISTS.
--
-- Antes de aplicarla sobre datos existentes, el importador comprueba que no haya dos turnos
-- vigentes del mismo paciente en el mismo horario; si los hubiera, el índice nuevo fallaría.
-- ============================================================================

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS ocupa_horario TINYINT(1) AS (IF(estado = 'cancelado', NULL, 1)) PERSISTENT;

-- Primero los índices nuevos, para que la clave foránea de id_medico nunca quede sin índice
ALTER TABLE turnos
  ADD UNIQUE KEY IF NOT EXISTS uk_medico_horario_activo (id_medico, fecha, hora, ocupa_horario),
  ADD UNIQUE KEY IF NOT EXISTS uk_paciente_horario_activo (id_paciente, fecha, hora, ocupa_horario);

ALTER TABLE turnos
  DROP INDEX IF EXISTS uk_medico_fecha_hora;
