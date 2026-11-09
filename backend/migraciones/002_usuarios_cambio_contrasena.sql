-- ============================================================================
-- 002 · Cambio obligatorio de contraseña
--
-- debe_cambiar_contrasena = 1 obliga a la persona a cambiar su contraseña antes de usar el
-- sistema. Se marca cuando recepción asigna una contraseña provisoria o da de alta un médico,
-- y cuando el importador reemplaza contraseñas de demostración. Se borra al cambiarla.
--
-- Las cuentas existentes quedan en 0: no cambia nada para ellas.
-- Se puede repetir sin efectos (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS debe_cambiar_contrasena TINYINT(1) NOT NULL DEFAULT 0 AFTER estado;
