// ============================================================================
// MEDICONTROL - Configuración de Recepción (requiere api.js)
// Los permisos y validaciones reales están en el servidor; acá solo se muestran.
// Los datos se escriben siempre con textContent: nunca se interpretan como HTML.
// ============================================================================
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ROLES = { medico: 'Médico', recepcionista: 'Recepcionista', paciente: 'Paciente' };
  const ICONOS = {
    ver: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    editar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    clave: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/></svg>',
    baja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    reactivar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  };

  const estado = { tipo: 'personal', buscar: '', filtro: 'todos', pagina: 1 };
  let consultaActual = 0;
  let usuarioEnEdicion = null;
  let rolEnAlta = null;
  let accionEstado = null;

  // ── Listado ───────────────────────────────────────────────────────────────
  function nombreCompleto(u) {
    return (u.nombre + ' ' + u.apellido).trim();
  }

  function avisar(texto, esError) {
    const aviso = $('avisoUsuarios');
    aviso.textContent = texto;
    aviso.classList.toggle('es-error', Boolean(esError));
    aviso.hidden = texto === '';
  }

  function celda(etiqueta, texto) {
    const td = document.createElement('td');
    td.dataset.etiqueta = etiqueta;
    td.textContent = texto;
    return td;
  }

  function botonIcono(icono, titulo, alHacerClic, clase) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cfg-icono' + (clase ? ' ' + clase : '');
    b.innerHTML = ICONOS[icono];
    b.title = titulo;
    b.setAttribute('aria-label', titulo);
    b.addEventListener('click', alHacerClic);
    return b;
  }

  function filaUsuario(u) {
    const tr = document.createElement('tr');

    const persona = document.createElement('td');
    persona.className = 'cfg-celda-persona';
    const contenedor = document.createElement('div');
    contenedor.className = 'cfg-persona';
    const iniciales = document.createElement('span');
    iniciales.className = 'cfg-iniciales';
    iniciales.setAttribute('aria-hidden', 'true');
    iniciales.textContent = (u.nombre.charAt(0) + u.apellido.charAt(0)).toUpperCase();
    const textos = document.createElement('div');
    const nombre = document.createElement('strong');
    nombre.textContent = (u.rol === 'medico' ? 'Dr/a. ' : '') + nombreCompleto(u);
    const correo = document.createElement('small');
    correo.textContent = 'DNI ' + u.dni + ' · ' + u.email;
    textos.append(nombre, correo);
    contenedor.append(iniciales, textos);
    persona.append(contenedor);
    tr.append(persona);

    tr.append(celda('Rol', ROLES[u.rol] || u.rol));
    tr.append(estado.tipo === 'personal'
      ? celda('Especialidad', u.especialidad || '—')
      : celda('Obra social', u.obra_social || '—'));

    const tdEstado = document.createElement('td');
    tdEstado.dataset.etiqueta = 'Estado';
    const chip = document.createElement('span');
    chip.className = 'cfg-estado ' + u.estado;
    chip.textContent = u.estado === 'activo' ? 'Activo' : 'Inactivo';
    tdEstado.append(chip);
    tr.append(tdEstado);

    const tdAcciones = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'cfg-acciones';
    if (u.gestionable) {
      acciones.append(botonIcono('editar', 'Editar a ' + nombreCompleto(u), () => abrirUsuario(u.id_usuario, true)));
      acciones.append(botonIcono('clave', 'Asignar contraseña provisoria a ' + nombreCompleto(u), () => abrirProvisoria(u)));
      if (u.estado === 'activo') {
        acciones.append(botonIcono('baja', 'Dar de baja a ' + nombreCompleto(u), () => abrirEstado(u, 'baja'), 'peligro'));
      } else {
        acciones.append(botonIcono('reactivar', 'Reactivar a ' + nombreCompleto(u), () => abrirEstado(u, 'reactivacion')));
      }
    } else {
      acciones.append(botonIcono('ver', 'Ver datos de ' + nombreCompleto(u), () => abrirUsuario(u.id_usuario, false)));
    }
    tdAcciones.append(acciones);
    tr.append(tdAcciones);
    return tr;
  }

  function mostrarFilaUnica(texto) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'cfg-vacio';
    td.textContent = texto;
    tr.append(td);
    $('cuerpoTabla').replaceChildren(tr);
  }

  function botonPagina(texto, pagina, opciones) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.disabled = Boolean(opciones.deshabilitado);
    if (opciones.actual) {
      b.setAttribute('aria-current', 'page');
    }
    b.addEventListener('click', () => {
      estado.pagina = pagina;
      cargar();
    });
    return b;
  }

  function dibujarPaginacion(d) {
    const nav = $('paginas');
    nav.replaceChildren();
    nav.append(botonPagina('Anterior', d.pagina - 1, { deshabilitado: d.pagina <= 1 }));
    const desde = Math.max(1, Math.min(d.pagina - 2, d.paginas - 4));
    const hasta = Math.min(d.paginas, desde + 4);
    for (let i = desde; i <= hasta; i++) {
      nav.append(botonPagina(String(i), i, { actual: i === d.pagina }));
    }
    nav.append(botonPagina('Siguiente', d.pagina + 1, { deshabilitado: d.pagina >= d.paginas }));
    $('resumenListado').textContent = 'Mostrando ' + d.usuarios.length + ' de ' + d.total + (d.total === 1 ? ' usuario' : ' usuarios');
  }

  async function cargar() {
    const consulta = ++consultaActual;
    mostrarFilaUnica('Cargando...');
    try {
      const d = await MediApi.get('usuarios', { tipo: estado.tipo, buscar: estado.buscar, estado: estado.filtro, pagina: estado.pagina });
      if (consulta !== consultaActual) {
        return;
      }
      if (d.usuarios.length === 0 && d.total > 0 && estado.pagina > 1) {
        estado.pagina = d.paginas;
        cargar();
        return;
      }
      if (d.usuarios.length === 0) {
        mostrarFilaUnica('No hay usuarios para mostrar.');
      } else {
        $('cuerpoTabla').replaceChildren(...d.usuarios.map(filaUsuario));
      }
      dibujarPaginacion(d);
      $('listaEspecialidades').replaceChildren(...d.especialidades.map((e) => {
        const op = document.createElement('option');
        op.value = e;
        return op;
      }));
    } catch (err) {
      if (consulta === consultaActual) {
        mostrarFilaUnica(err.message || 'No se pudo cargar el listado.');
        $('resumenListado').textContent = '';
        $('paginas').replaceChildren();
      }
    }
  }

  function elegirTipo(tipo, recargar) {
    estado.tipo = tipo;
    estado.pagina = 1;
    const esPersonal = tipo === 'personal';
    $('pestanaPersonal').setAttribute('aria-selected', String(esPersonal));
    $('pestanaPacientes').setAttribute('aria-selected', String(!esPersonal));
    $('columnaVariable').textContent = esPersonal ? 'Especialidad' : 'Obra social';
    $('tituloUsuarios').textContent = esPersonal ? 'Gestión de Usuarios y Médicos' : 'Gestión de Pacientes';
    $('botonAgregar').textContent = esPersonal ? 'Agregar médico' : 'Agregar paciente';
    avisar('');
    if (recargar) {
      cargar();
    }
  }

  // ── Alta, edición y consulta ──────────────────────────────────────────────
  const formUsuario = $('formUsuario');

  function limpiarErrores(form, mensaje) {
    form.querySelectorAll('[data-error]').forEach((s) => { s.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
    mensaje.textContent = '';
    mensaje.hidden = true;
  }

  function mostrarErrores(form, mensaje, err) {
    let hayCampo = false;
    Object.entries(err.campos || {}).forEach(([campo, texto]) => {
      const destino = form.querySelector('[data-error="' + CSS.escape(campo) + '"]');
      const control = form.elements[campo];
      if (destino && typeof texto === 'string') {
        destino.textContent = texto;
        hayCampo = true;
        if (control) {
          control.setAttribute('aria-invalid', 'true');
        }
      }
    });
    mensaje.textContent = err.message || 'No se pudo guardar.';
    mensaje.hidden = false;
    if (hayCampo) {
      const primero = form.querySelector('[aria-invalid="true"]');
      if (primero) {
        primero.focus();
      }
    }
  }

  function prepararFormulario(rol, modo) {
    formUsuario.reset();
    limpiarErrores(formUsuario, $('mensajeUsuario'));
    formUsuario.querySelectorAll('[data-solo]').forEach((c) => {
      const solo = c.dataset.solo;
      const visible = solo === 'alta' ? modo === 'alta' : solo === rol;
      c.hidden = !visible;
      c.querySelectorAll('input, select').forEach((i) => { i.disabled = !visible; });
    });
    const soloLectura = modo === 'consulta';
    formUsuario.querySelectorAll('input, select').forEach((i) => {
      if (soloLectura) {
        i.disabled = true;
      } else if (!i.closest('[data-solo]')) {
        i.disabled = false;
      }
    });
    $('guardarUsuario').hidden = soloLectura;
    $('dialogoUsuario').dataset.rol = rol;
  }

  function abrirAlta() {
    const rol = estado.tipo === 'personal' ? 'medico' : 'paciente';
    usuarioEnEdicion = null;
    rolEnAlta = rol;
    prepararFormulario(rol, 'alta');
    $('tituloDialogoUsuario').textContent = rol === 'medico' ? 'Agregar médico' : 'Agregar paciente';
    $('dialogoUsuario').showModal();
    $('campoNombre').focus();
  }

  async function abrirUsuario(id, editable) {
    try {
      const { usuario: u } = await MediApi.get('usuarios/' + encodeURIComponent(id));
      usuarioEnEdicion = editable ? u : null;
      rolEnAlta = null;
      const rol = u.rol === 'recepcionista' ? 'recepcionista' : u.rol;
      prepararFormulario(rol, editable ? 'edicion' : 'consulta');
      ['nombre', 'apellido', 'dni', 'email', 'especialidad', 'matricula', 'telefono', 'obra_social', 'direccion', 'fecha_nacimiento', 'genero'].forEach((campo) => {
        if (formUsuario.elements[campo]) {
          formUsuario.elements[campo].value = u[campo] || '';
        }
      });
      $('tituloDialogoUsuario').textContent = (editable ? 'Editar a ' : 'Datos de ') + nombreCompleto(u) + ' (' + (ROLES[u.rol] || u.rol) + ')';
      $('dialogoUsuario').showModal();
    } catch (err) {
      avisar(err.message || 'No se pudieron cargar los datos.', true);
    }
  }

  formUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(formUsuario, $('mensajeUsuario'));
    const datos = {};
    Array.from(formUsuario.elements).forEach((c) => {
      if (c.name && !c.disabled) {
        datos[c.name] = c.value;
      }
    });
    const boton = $('guardarUsuario');
    boton.disabled = true;
    try {
      if (usuarioEnEdicion) {
        await MediApi.patch('usuarios/' + encodeURIComponent(usuarioEnEdicion.id_usuario), datos);
        avisar('Los datos se guardaron correctamente.');
      } else {
        datos.rol = rolEnAlta;
        await MediApi.post('usuarios', datos);
        avisar(rolEnAlta === 'medico' ? 'El médico se registró correctamente.' : 'El paciente se registró correctamente.');
      }
      $('dialogoUsuario').close();
      cargar();
    } catch (err) {
      mostrarErrores(formUsuario, $('mensajeUsuario'), err);
    } finally {
      boton.disabled = false;
    }
  });

  // ── Contraseña provisoria ─────────────────────────────────────────────────
  const formProvisoria = $('formProvisoria');
  let idProvisoria = null;

  function abrirProvisoria(u) {
    idProvisoria = u.id_usuario;
    formProvisoria.reset();
    limpiarErrores(formProvisoria, $('mensajeProvisoria'));
    $('textoProvisoria').textContent = 'Para ' + nombreCompleto(u) + '. Se cerrarán sus sesiones abiertas y deberá entrar con esta contraseña. Mínimo 8 caracteres, con letras y números.';
    $('dialogoProvisoria').showModal();
    $('provisoriaNueva').focus();
  }

  formProvisoria.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores(formProvisoria, $('mensajeProvisoria'));
    const boton = $('guardarProvisoria');
    boton.disabled = true;
    try {
      await MediApi.post('usuarios/' + encodeURIComponent(idProvisoria) + '/contrasena-provisoria', {
        contrasena: $('provisoriaNueva').value,
        contrasena_confirmacion: $('provisoriaConfirmacion').value,
      });
      $('dialogoProvisoria').close();
      avisar('La contraseña provisoria se asignó correctamente.');
    } catch (err) {
      mostrarErrores(formProvisoria, $('mensajeProvisoria'), err);
    } finally {
      boton.disabled = false;
    }
  });

  // ── Baja y reactivación ───────────────────────────────────────────────────
  function abrirEstado(u, accion) {
    accionEstado = { id: u.id_usuario, accion: accion };
    const esBaja = accion === 'baja';
    $('tituloEstado').textContent = esBaja ? 'Dar de baja' : 'Reactivar';
    $('textoEstado').textContent = esBaja
      ? '¿Dar de baja a ' + nombreCompleto(u) + '? No podrá iniciar sesión, pero sus datos y su historial de turnos se conservan.'
      : '¿Reactivar a ' + nombreCompleto(u) + '? Volverá a poder iniciar sesión.';
    const boton = $('confirmarEstado');
    boton.textContent = esBaja ? 'Dar de baja' : 'Reactivar';
    boton.classList.toggle('cfg-boton-peligro', esBaja);
    $('mensajeEstado').hidden = true;
    $('dialogoEstado').showModal();
  }

  $('confirmarEstado').addEventListener('click', async () => {
    const boton = $('confirmarEstado');
    boton.disabled = true;
    $('mensajeEstado').hidden = true;
    try {
      await MediApi.post('usuarios/' + encodeURIComponent(accionEstado.id) + '/' + accionEstado.accion);
      avisar(accionEstado.accion === 'baja' ? 'El usuario se dio de baja.' : 'El usuario se reactivó.');
      $('dialogoEstado').close();
      cargar();
    } catch (err) {
      $('mensajeEstado').textContent = err.message || 'No se pudo completar la operación.';
      $('mensajeEstado').hidden = false;
    } finally {
      boton.disabled = false;
    }
  });

  // ── Eventos generales ─────────────────────────────────────────────────────
  document.querySelectorAll('.cfg-dialogo').forEach((dialogo) => {
    dialogo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => dialogo.close()));
    // Al cerrar, no quedan contraseñas escritas en el formulario
    dialogo.addEventListener('close', () => {
      dialogo.querySelectorAll('input[type="password"]').forEach((i) => { i.value = ''; });
    });
  });

  $('botonAgregar').addEventListener('click', abrirAlta);
  document.querySelectorAll('.cfg-pestanas button').forEach((b) => {
    b.addEventListener('click', () => {
      history.replaceState(null, '', '#' + b.dataset.tipo);
      elegirTipo(b.dataset.tipo, true);
    });
  });
  $('filtroEstado').addEventListener('change', (e) => {
    estado.filtro = e.target.value;
    estado.pagina = 1;
    cargar();
  });

  let temporizador = null;
  $('buscarUsuarios').addEventListener('input', (e) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      estado.buscar = e.target.value.trim();
      estado.pagina = 1;
      cargar();
    }, 300);
  });

  window.addEventListener('hashchange', () => {
    elegirTipo(location.hash === '#pacientes' ? 'pacientes' : 'personal', true);
  });

  elegirTipo(location.hash === '#pacientes' ? 'pacientes' : 'personal', false);
  cargar();
})();
