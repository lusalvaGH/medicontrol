<?php
// ============================================================================
// Bloque «Gestión de Seguridad»: cambio de la contraseña propia.
// La pantalla que lo incluye debe cargar api.js y contrasena.js.
// ============================================================================
?>
<section class="tarjeta-seguridad" aria-labelledby="tituloSeguridad">
  <h2 id="tituloSeguridad">Gestión de Seguridad</h2>
  <p class="tarjeta-ayuda">Mínimo 8 caracteres, con letras y números.</p>

  <form id="formContrasena" autocomplete="on" novalidate>
    <!-- Permite a los gestores de contraseñas asociar el cambio con la cuenta -->
    <input type="text" name="usuario" value="<?= htmlspecialchars((string) ($emailCuenta ?? ''), ENT_QUOTES, 'UTF-8') ?>" autocomplete="username" hidden>

    <div class="campo">
      <label for="contrasenaActual">Contraseña actual</label>
      <input type="password" id="contrasenaActual" name="contrasena_actual" autocomplete="current-password" required>
    </div>
    <div class="campo">
      <label for="contrasenaNueva">Nueva contraseña</label>
      <input type="password" id="contrasenaNueva" name="contrasena_nueva" autocomplete="new-password" required>
    </div>
    <div class="campo">
      <label for="contrasenaConfirmacion">Confirmar nueva contraseña</label>
      <input type="password" id="contrasenaConfirmacion" name="contrasena_confirmacion" autocomplete="new-password" required>
    </div>

    <div id="mensajeContrasena" class="mensaje-contrasena" role="status" aria-live="polite" hidden></div>
    <button type="submit" id="botonContrasena" class="boton-primario">Actualizar contraseña</button>
  </form>
</section>
