<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$usuario = (array) getCurrentUser();
$e = static fn (?string $texto): string => htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
$nombre = (string) ($usuario['nombre'] ?? '');
$apellido = (string) ($usuario['apellido'] ?? '');
$iniciales = mb_strtoupper(mb_substr($nombre, 0, 1) . mb_substr($apellido, 0, 1));
$emailCuenta = (string) ($usuario['email'] ?? '');
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MEDICONTROL - Configuración</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../app/assets/css/cuenta.css">
  <link rel="stylesheet" href="../app/assets/css/configuracion.css">
</head>
<body class="cfg-cuerpo">
  <aside class="cfg-lateral">
    <div class="cfg-marca">
      <strong>MEDICONTROL</strong>
      <span>Recepción</span>
    </div>
    <nav class="cfg-nav" aria-label="Navegación de recepción">
      <a href="recepcionista.php">Turnos</a>
      <a href="#pacientes">Pacientes</a>
      <a href="recepcionista_configuracion.php" class="activo" aria-current="page">Configuración</a>
      <a href="mi_cuenta.php">Mi cuenta</a>
    </nav>
    <div class="cfg-lateral-pie">
      <a class="cfg-salir" href="../logout.php">Cerrar sesión</a>
      <div class="cfg-perfil">
        <span class="cfg-iniciales" aria-hidden="true"><?= $e($iniciales) ?></span>
        <div>
          <strong><?= $e(trim($nombre . ' ' . $apellido)) ?></strong>
          <span>Recepcionista</span>
        </div>
      </div>
    </div>
  </aside>

  <div class="cfg-principal">
    <header class="cfg-superior">
      <label class="cfg-buscar">
        <span class="cfg-oculto">Buscar en el listado</span>
        <input type="search" id="buscarUsuarios" placeholder="Buscar por nombre, DNI, correo o especialidad..." maxlength="80" autocomplete="off">
      </label>
    </header>

    <main class="cfg-contenido">
      <h1>Configuración del Sistema</h1>
      <p class="cfg-subtitulo">Administrá la seguridad de tu cuenta y los perfiles de los usuarios del centro médico.</p>

      <div class="cfg-grilla">
        <div class="cfg-columna-seguridad">
          <?php include __DIR__ . '/../includes/form_contrasena.php'; ?>
        </div>

        <section class="cfg-tarjeta cfg-usuarios" aria-labelledby="tituloUsuarios">
          <div class="cfg-usuarios-cabecera">
            <div>
              <h2 id="tituloUsuarios">Gestión de Usuarios y Médicos</h2>
              <p id="descripcionListado">Perfiles activos e inactivos</p>
            </div>
            <button type="button" class="cfg-boton" id="botonAgregar">Agregar médico</button>
          </div>

          <div class="cfg-filtros">
            <div class="cfg-pestanas" role="tablist" aria-label="Tipo de usuario">
              <button type="button" role="tab" id="pestanaPersonal" data-tipo="personal" aria-selected="true">Personal</button>
              <button type="button" role="tab" id="pestanaPacientes" data-tipo="pacientes" aria-selected="false">Pacientes</button>
            </div>
            <label class="cfg-filtro-estado">
              <span>Estado</span>
              <select id="filtroEstado">
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </label>
          </div>

          <div id="avisoUsuarios" class="cfg-aviso" role="status" aria-live="polite" hidden></div>

          <div class="cfg-tabla-marco">
            <table class="cfg-tabla">
              <thead>
                <tr id="cabeceraTabla">
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th id="columnaVariable">Especialidad</th>
                  <th>Estado</th>
                  <th class="cfg-derecha">Acciones</th>
                </tr>
              </thead>
              <tbody id="cuerpoTabla"></tbody>
            </table>
          </div>

          <div class="cfg-paginacion">
            <p id="resumenListado" aria-live="polite"></p>
            <nav id="paginas" aria-label="Paginación"></nav>
          </div>
        </section>

        <section class="cfg-tarjeta cfg-permisos" aria-labelledby="tituloPermisos">
          <h2 id="tituloPermisos">Roles y permisos</h2>
          <p class="cfg-ayuda">Información de solo lectura. Los roles de los usuarios no se pueden cambiar.</p>
          <div class="cfg-tabla-marco">
            <table class="cfg-tabla cfg-tabla-permisos">
              <thead>
                <tr><th>Quién</th><th>Sobre</th><th>Permiso</th></tr>
              </thead>
              <tbody>
                <tr><td data-etiqueta="Quién">Recepción</td><td data-etiqueta="Sobre">Pacientes</td><td data-etiqueta="Permiso">Consultar, crear, modificar, dar de baja y reactivar</td></tr>
                <tr><td data-etiqueta="Quién">Recepción</td><td data-etiqueta="Sobre">Médicos</td><td data-etiqueta="Permiso">Consultar, crear, modificar, dar de baja y reactivar</td></tr>
                <tr><td data-etiqueta="Quién">Recepción</td><td data-etiqueta="Sobre">Otros recepcionistas</td><td data-etiqueta="Permiso">Solo consultar</td></tr>
                <tr><td data-etiqueta="Quién">Todos los usuarios</td><td data-etiqueta="Sobre">Su propia cuenta</td><td data-etiqueta="Permiso">Cambiar su contraseña</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </div>

  <!-- Alta, edición y consulta de un usuario -->
  <dialog class="cfg-dialogo" id="dialogoUsuario" aria-labelledby="tituloDialogoUsuario">
    <form id="formUsuario" novalidate>
      <header class="cfg-dialogo-cabecera">
        <h2 id="tituloDialogoUsuario">Usuario</h2>
        <button type="button" class="cfg-cerrar" data-cerrar aria-label="Cerrar">✕</button>
      </header>
      <div class="cfg-dialogo-cuerpo">
        <div id="mensajeUsuario" class="cfg-aviso es-error" role="alert" hidden></div>
        <div class="cfg-campos">
          <div class="campo"><label for="campoNombre">Nombre</label><input id="campoNombre" name="nombre" maxlength="80" autocomplete="off" required><span class="cfg-error" data-error="nombre"></span></div>
          <div class="campo"><label for="campoApellido">Apellido</label><input id="campoApellido" name="apellido" maxlength="80" autocomplete="off" required><span class="cfg-error" data-error="apellido"></span></div>
          <div class="campo"><label for="campoDni">DNI</label><input id="campoDni" name="dni" maxlength="20" inputmode="numeric" autocomplete="off" required><span class="cfg-error" data-error="dni"></span></div>
          <div class="campo"><label for="campoEmail">Correo electrónico</label><input id="campoEmail" name="email" type="email" maxlength="120" autocomplete="off" required><span class="cfg-error" data-error="email"></span></div>

          <div class="campo" data-solo="medico"><label for="campoEspecialidad">Especialidad</label><input id="campoEspecialidad" name="especialidad" maxlength="100" list="listaEspecialidades" autocomplete="off"><datalist id="listaEspecialidades"></datalist><span class="cfg-error" data-error="especialidad"></span></div>
          <div class="campo" data-solo="medico"><label for="campoMatricula">Matrícula (opcional)</label><input id="campoMatricula" name="matricula" maxlength="50" autocomplete="off"><span class="cfg-error" data-error="matricula"></span></div>

          <div class="campo" data-solo="paciente"><label for="campoTelefono">Teléfono (opcional)</label><input id="campoTelefono" name="telefono" maxlength="30" inputmode="tel" autocomplete="off"><span class="cfg-error" data-error="telefono"></span></div>
          <div class="campo" data-solo="paciente"><label for="campoObraSocial">Obra social (opcional)</label><input id="campoObraSocial" name="obra_social" maxlength="100" autocomplete="off"><span class="cfg-error" data-error="obra_social"></span></div>
          <div class="campo cfg-campo-ancho" data-solo="paciente"><label for="campoDireccion">Dirección (opcional)</label><input id="campoDireccion" name="direccion" maxlength="200" autocomplete="off"><span class="cfg-error" data-error="direccion"></span></div>
          <div class="campo" data-solo="paciente"><label for="campoNacimiento">Fecha de nacimiento (opcional)</label><input id="campoNacimiento" name="fecha_nacimiento" type="date"><span class="cfg-error" data-error="fecha_nacimiento"></span></div>
          <div class="campo" data-solo="paciente"><label for="campoGenero">Género (opcional)</label>
            <select id="campoGenero" name="genero"><option value="">Sin indicar</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select>
            <span class="cfg-error" data-error="genero"></span></div>

          <div class="campo" data-solo="alta"><label for="campoContrasena">Contraseña provisoria</label><input id="campoContrasena" name="contrasena" type="password" autocomplete="new-password"><span class="cfg-error" data-error="contrasena"></span></div>
          <div class="campo" data-solo="alta"><label for="campoConfirmacion">Repetir contraseña</label><input id="campoConfirmacion" name="contrasena_confirmacion" type="password" autocomplete="new-password"><span class="cfg-error" data-error="contrasena_confirmacion"></span></div>
        </div>
      </div>
      <footer class="cfg-dialogo-pie">
        <button type="button" class="cfg-boton cfg-boton-secundario" data-cerrar>Cerrar</button>
        <button type="submit" class="cfg-boton" id="guardarUsuario">Guardar</button>
      </footer>
    </form>
  </dialog>

  <!-- Contraseña provisoria -->
  <dialog class="cfg-dialogo cfg-dialogo-chico" id="dialogoProvisoria" aria-labelledby="tituloProvisoria">
    <form id="formProvisoria" novalidate>
      <header class="cfg-dialogo-cabecera">
        <h2 id="tituloProvisoria">Contraseña provisoria</h2>
        <button type="button" class="cfg-cerrar" data-cerrar aria-label="Cerrar">✕</button>
      </header>
      <div class="cfg-dialogo-cuerpo">
        <p class="cfg-ayuda" id="textoProvisoria"></p>
        <div id="mensajeProvisoria" class="cfg-aviso es-error" role="alert" hidden></div>
        <div class="campo"><label for="provisoriaNueva">Contraseña provisoria</label><input id="provisoriaNueva" name="contrasena" type="password" autocomplete="new-password"><span class="cfg-error" data-error="contrasena"></span></div>
        <div class="campo"><label for="provisoriaConfirmacion">Repetir contraseña</label><input id="provisoriaConfirmacion" name="contrasena_confirmacion" type="password" autocomplete="new-password"><span class="cfg-error" data-error="contrasena_confirmacion"></span></div>
      </div>
      <footer class="cfg-dialogo-pie">
        <button type="button" class="cfg-boton cfg-boton-secundario" data-cerrar>Cancelar</button>
        <button type="submit" class="cfg-boton" id="guardarProvisoria">Asignar</button>
      </footer>
    </form>
  </dialog>

  <!-- Confirmar baja o reactivación -->
  <dialog class="cfg-dialogo cfg-dialogo-chico" id="dialogoEstado" aria-labelledby="tituloEstado">
    <header class="cfg-dialogo-cabecera">
      <h2 id="tituloEstado"></h2>
      <button type="button" class="cfg-cerrar" data-cerrar aria-label="Cerrar">✕</button>
    </header>
    <div class="cfg-dialogo-cuerpo">
      <p id="textoEstado"></p>
      <div id="mensajeEstado" class="cfg-aviso es-error" role="alert" hidden></div>
    </div>
    <footer class="cfg-dialogo-pie">
      <button type="button" class="cfg-boton cfg-boton-secundario" data-cerrar>Volver</button>
      <button type="button" class="cfg-boton" id="confirmarEstado">Confirmar</button>
    </footer>
  </dialog>

  <script src="../app/assets/js/api.js"></script>
  <script src="../app/assets/js/contrasena.js"></script>
  <script src="../app/assets/js/configuracion.js"></script>
</body>
</html>
