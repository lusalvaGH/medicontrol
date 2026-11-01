// ============================================================================
// MEDICONTROL - Cambio de la contraseña propia (requiere api.js)
// Las validaciones de aquí solo evitan un envío inútil: las reales están en el servidor.
// ============================================================================
(function () {
  'use strict';

  const form = document.getElementById('formContrasena');
  if (!form) {
    return;
  }

  const actual = document.getElementById('contrasenaActual');
  const nueva = document.getElementById('contrasenaNueva');
  const confirmacion = document.getElementById('contrasenaConfirmacion');
  const mensaje = document.getElementById('mensajeContrasena');
  const boton = document.getElementById('botonContrasena');

  function mostrar(texto, esError) {
    mensaje.textContent = texto;
    mensaje.classList.toggle('es-error', esError);
    mensaje.hidden = false;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (actual.value === '' || nueva.value === '' || confirmacion.value === '') {
      mostrar('Completá todos los campos.', true);
      return;
    }
    if (nueva.value !== confirmacion.value) {
      mostrar('Las contraseñas no coinciden.', true);
      confirmacion.focus();
      return;
    }

    boton.disabled = true;
    try {
      await MediApi.post('cuenta/contrasena', {
        contrasena_actual: actual.value,
        contrasena_nueva: nueva.value,
        contrasena_confirmacion: confirmacion.value,
      });
      form.reset();
      mostrar('Tu contraseña se actualizó correctamente.', false);
    } catch (err) {
      mostrar(err.message || 'No se pudo actualizar la contraseña.', true);
      if (err.codigo === 'CONTRASENA_ACTUAL_INCORRECTA') {
        actual.value = '';
        actual.focus();
      }
    } finally {
      boton.disabled = false;
    }
  });
})();
