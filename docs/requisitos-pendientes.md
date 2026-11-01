# MediControl: requisitos pendientes

**Fecha:** 01/11/2026
**Origen:** revisión visual de las 22 maquetas y las pantallas reales en el navegador (escritorio de 1280×800 y celular de 375×812), más la revisión del código.
**Estado:** propuesta. Las prioridades son sugerencias y nada de esto está implementado ni aprobado.

**Prioridad:** Alta = el sistema muestra algo falso o no cumple lo prometido. Media = función que el proyecto necesita o tiene prevista. Baja = mejora opcional, a decidir.

## 1. Datos falsos o controles que no hacen lo que dicen

| ID | Requisito | Situación actual | Dónde | Prioridad |
|---|---|---|---|---|
| RP-01 | Mostrar datos reales en el detalle del turno | Todos los turnos muestran «Consultorio 3 • Piso 2» y «Paciente Registrado • DNI Registrado» | `panel/recepcionista.php`, líneas 666, 1021 y 1040 | Alta |
| RP-02 | Conectar a datos reales el listado «Todos los Clientes / Pacientes», o quitarlo | Lista personas ficticias; su botón abre el detalle de un turno inexistente | `panel/recepcionista.php`, línea 686 | Alta |
| RP-03 | Imprimir de verdad el comprobante, o quitar el botón | Solo muestra el aviso «Imprimiendo…» | `panel/recepcionista.php`, línea 679 | Alta |
| RP-04 | Generar la lista de especialidades desde la base | Las opciones del filtro están escritas a mano | `panel/recepcionista.php`, línea 416, y Semana | Media |
| RP-05 | Cambiar el título «Turnos de Hoy» cuando se consulta otra fecha | Dice «de Hoy» aunque la fecha consultada sea otra | Vista Día | Baja |

## 2. Reglas de negocio prometidas

| ID | Requisito | Situación actual | Origen | Prioridad |
|---|---|---|---|---|
| RP-06 | Liberar el horario al cancelar un turno | La clave única incluye los cancelados, así que el horario sigue ocupado. Requiere migrar la base | Incremento 3; maquetas 03 y 06 | Alta |
| RP-07 | Registrar motivo y comentarios de la cancelación. La maqueta proponía: aviso previo del paciente, ausencia del profesional y emergencia médica | No existen en la interfaz ni en la base | Maqueta 06, `turnos/cancelar.html` | Media |
| RP-08 | Avisar al paciente cuando se cancela | No existe | Maqueta 06 | Baja |

## 3. Funciones sin implementar (con maqueta para conservar)

| ID | Requisito | Situación actual | Maqueta de referencia | Prioridad |
|---|---|---|---|---|
| RP-09 | Agenda semanal y mensual del médico | Solo existe la vista por día | `09-medico-dashboard.html` | Media (incremento 3) |
| RP-10 | Ficha del paciente con datos, indicadores e historial de turnos | No existe | `07-paciente-detalle.html` | Media |
| RP-11 | Alta y edición de pacientes desde recepción | Solo existe el registro que hace el propio paciente | `pacientes/registro.html`, `07-paciente-detalle.html` | Media |
| RP-12 | Gestión de usuarios y médicos | No existe pantalla ni rol para hacerlo | `02-configuracion-usuarios.html` | Media |
| RP-13 | Cambiar la contraseña con la sesión iniciada | No existe | `02-configuracion-usuarios.html` | Media |
| RP-14 | Médico: próximo paciente e historial del paciente | No existen | `09-medico-dashboard.html`, `07-paciente-detalle.html` | Baja |
| RP-15 | Médico: llamar al paciente desde la agenda | No existe; el sistema ya guarda el teléfono | `09-medico-dashboard.html` | Baja |

## 4. Mejoras a decidir (la maqueta no se conserva)

| ID | Requisito | Situación actual | Maqueta de origen | Prioridad |
|---|---|---|---|---|
| RP-16 | Recuperar la contraseña | No existe | `01-login-registro.html` | Media |
| RP-17 | Términos y política de privacidad en el registro | No existen; relevante por tratar datos de salud | `01-login-registro.html` | Media |
| RP-18 | Botón para mostrar la contraseña | No existe en el login | `01-login-registro.html` | Baja |
| RP-19 | Cambiar el médico de un turno ya creado | La API solo cambia fecha, hora y estado | `05-modificar-turno.html`, `turnos/modificar.html` | Baja |
| RP-20 | Tipo de turno o de consulta | No existe en la base | `05-modificar-turno.html`, `08-turno-detalle.html` | Baja |
| RP-21 | Consultorio o lugar real de atención | No existe en la base (relacionado con RP-01) | 07, 10, `paciente/mis-turnos.html` | Baja |
| RP-22 | Documentación a presentar, visible para el paciente | No existe | `paciente/mis-turnos.html` | Baja |
| RP-23 | Elegir la especialidad antes que el médico al registrar un turno | Hoy se elige el médico y la especialidad se completa sola | `turnos/crear.html` | Baja |
| RP-24 | Modificar y cancelar desde Mes; modificar desde Semana | Mes es de solo lectura; Semana solo cancela y envía a Día para modificar | `10a-turnos-semana.html` | Baja |
| RP-25 | Filtro por especialidad en Mes | Existe en Día y Semana, no en Mes | `10b-turnos-mes.html` | Baja |
| RP-26 | Filtro por estado en la vista Día | No se observó en la pantalla real | `03-recepcion-dashboard.html` | Baja |
| RP-27 | Edad y sexo del paciente en la agenda del médico | La agenda muestra DNI y obra social | 08, 09 | Baja |
| RP-34 | Reprogramar arrastrando un turno en la vista Día | No funciona: quedan funciones de arrastre sin uso en `panel/recepcionista.php` | `10-gestion-turnos-timeline.html` | Baja |
| RP-35 | Acceso a la disponibilidad del médico desde la vista Día | La disponibilidad solo se ve en Nuevo turno; en la maqueta era un enlace sin destino | `10-gestion-turnos-timeline.html` | Baja |

## 5. Problemas de diseño y adaptación en pantallas reales

| ID | Requisito | Situación actual | Dónde | Prioridad |
|---|---|---|---|---|
| RP-28 | Que el modal de modificar entre en pantalla o tenga desplazamiento propio | Mide unos 845 px y no se desplaza. A 800 px de alto se cortan el título y parte de los botones; en pantallas más bajas podrían quedar inaccesibles | `panel/recepcionista.php` | Alta |
| RP-29 | Que Semana muestre los 7 días a 1280 px | Hay que desplazarse de costado para ver el domingo | `panel/recepcionista_semana.php` | Media |
| RP-30 | Priorizar los turnos en celular | En Día, Semana y Mes los 4 indicadores ocupan toda la primera pantalla | Vistas de recepción | Media |
| RP-31 | Agenda del médico legible en celular | La tabla se corta y requiere desplazamiento lateral | `panel/medico.php` | Media |
| RP-32 | Igualar las columnas del calendario en celular | La columna del lunes es más ancha que las demás | `panel/recepcionista_mes.php` | Baja |
| RP-33 | Unificar la identidad visual como MEDICONTROL. «MediCore Health» fue solo un nombre de ejemplo de las maquetas | Conviven ambos nombres, y el panel del paciente tiene otro estilo | Paciente, login y paneles | Baja |

## Maquetas eliminadas

Las maquetas citadas que ya no están en el proyecto se pueden recuperar desde el commit `2285e40`.

## Maquetas conservadas

| Maqueta | Requisitos que respalda |
|---|---|
| `02-configuracion-usuarios.html` | RP-12, RP-13 |
| `07-paciente-detalle.html` | RP-10, RP-11, RP-14 |
| `09-medico-dashboard.html` | RP-09, RP-14, RP-15 |
| `pacientes/registro.html` | RP-11 |
