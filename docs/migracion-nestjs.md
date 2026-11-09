# MEDICONTROL: migración a NestJS

**Rama:** `feature/migracion-nestjs`, creada desde `main` (`522472d`).
**Regla principal:** la versión PHP + Apache no se modifica y sigue siendo el respaldo funcional hasta que la nueva versión esté verificada.

## Estado por etapa

| Etapa | Estado | Qué quedó funcionando |
|---|---|---|
| 0. Node.js | Terminada (03/11/2026) | Node.js 24.22.2 LTS portable en la carpeta de herramientas del usuario, con SHA-256 y firma verificadas |
| 1. Backend base | Terminada (03/11/2026) | NestJS 11 con TypeScript 6, configuración por variables de entorno, conexión propia a MariaDB con `mysql2`, formato de respuestas `{ok, data, error}` y `GET /api/health` |
| 2. Reglas de negocio | Terminada (03/11/2026) | Reglas de turnos, disponibilidad, estados y transiciones, fechas y horarios, validaciones de personas y política de contraseñas en `backend/src/reglas/`. Mismos casos que `tests/turnos_reglas_test.php` y comparación directa con el PHP: 6347 casos, 0 diferencias |
| 3. Autenticación | Terminada (03/11/2026) | Login con las contraseñas existentes, logout, sesiones con cookie, CSRF, roles, huella de sesión, vencimiento por inactividad y límite de intentos |
| 4. Usuarios y cuenta | Terminada (03/11/2026) | Cambio de la contraseña propia y Configuración de Recepción: listado, alta, modificación, baja lógica, reactivación y contraseña provisoria. Mismos casos que `tests/usuarios_gestion_test.php` y `tests/cuenta_contrasena_test.php` |
| 5. Turnos | Terminada (04/11/2026) | Agenda, disponibilidad, alta, modificación y cancelación para recepción; agenda del médico y turnos del paciente (solo lectura). Mismos casos que `tests/api_escritura_test.php` y `tests/api_lectura_test.php` |
| 6. Médico y paciente | Pendiente | |
| 7. Frontend React | En progreso (04/11/2026), sin commit | Circuito de la demo completo: login, calendario de recepción (Día, Semana y Mes, como en PHP), alta y gestión de turnos, pacientes y médicos, registro público de pacientes, agenda del médico, turnos del paciente y cierre de sesión. Probado de punta a punta contra `medicontrol_demo` |
| 8. Pruebas de integración | Preparadas, sin ejecutar | Casos nuevos para las reglas de la etapa 10. Se ejecutan contra una base descartable `medicontrol_test_<sufijo>` creada con `npm run preparar-base` |
| 9. Docker y documentación | Archivos listos, sin probar | `compose.yaml`, Dockerfiles y guías. Necesita una computadora con Docker |
| 10. Cierre y migración de datos | En progreso (09/11/2026), sin commit | Migraciones versionadas, importador de datos de PHP, cancelados que liberan el horario, sin turnos superpuestos del paciente, contraseña provisoria obligatoria, Mi cuenta con datos propios, notas e historial del médico. Ver [migracion-datos.md](migracion-datos.md) |

## Cómo ejecutar el backend

En PowerShell, desde `backend/`:

```powershell
$env:Path = "$env:USERPROFILE\Tools\node24;" + $env:Path   # carpeta donde está Node.js
Copy-Item .env.example .env   # solo la primera vez; completar DB_USER y DB_PASSWORD
npm install
npm run dev                   # compila y arranca en http://127.0.0.1:3000/api
```

`http://127.0.0.1:3000/api/health` debe responder `{"ok":true,"data":{"estado":"ok","base_de_datos":"ok"}}`. Con MariaDB detenida responde 503 `BASE_NO_DISPONIBLE`.

## Pruebas

Las pruebas unitarias (`npx jest src`) no usan base de datos. Las de integración (`test/`) usan
una base **descartable** con el esquema migrado y las cuentas de demostración públicas. Se crea
una sola vez y nunca es `medicontrol_test` ni ninguna base existente:

```powershell
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="3306"; $env:DB_NAME="medicontrol_test_ci"
$env:DB_USER="<usuario de MariaDB>"; $env:DB_PASSWORD="<contraseña>"
npm run build; npm run preparar-base   # crea medicontrol_test_ci (se niega si ya existe)
npm test
```

Las pruebas de integración se niegan a correr si `DB_NAME` no es una base `medicontrol_test`
o `medicontrol_test_<sufijo>`. Crean y borran sus propios usuarios y turnos temporales, y al
terminar comprueban que la huella de la base sea la misma que al empezar.

## Decisiones técnicas

- **NestJS 11 y no 12:** la 12 se publicó el 27/10/2026. La 11 tiene más tiempo de uso. Subir de versión más adelante es un cambio acotado.
- **TypeScript 6 y no 7:** `ts-jest` todavía no admite TypeScript 7.
- **`mysql2` con SQL explícito, sin ORM:** mantiene exactamente el esquema actual y permite trasladar las consultas probadas de los repositorios PHP.
- **Fechas como texto (`dateStrings`):** evita corrimientos por zona horaria, igual que en PHP.
- **`multer` fijado en 2.5.0** con `overrides`: corrige una vulnerabilidad alta de la 2.4.0 que trae NestJS 11. La API no recibe archivos.
- **`backend/.htaccess` con `Require all denied`:** Apache publica la raíz del repositorio; así no expone el código, `node_modules` ni `.env`.
- **El backend escucha solo en `127.0.0.1`** por defecto.

## Autenticación y sesiones (etapa 3)

| Ruta | Acceso | Qué hace |
|---|---|---|
| `GET /api/auth/csrf-inicio` | Pública | Token CSRF para enviar el login (crea una sesión anónima) |
| `POST /api/auth/login` | Pública, con CSRF | `{email, contrasena}`. Devuelve `{usuario}` y una sesión nueva |
| `POST /api/auth/logout` | Pública, con CSRF | Cierra la sesión y borra la cookie |
| `GET /api/auth/csrf` | Con sesión | Token CSRF para los pedidos que modifican datos |
| `GET /api/auth/me` | Con sesión | Usuario de la sesión |

**Igual que en PHP:**
- Las contraseñas existentes (`$2y$`) se verifican sin modificarlas, y si el correo no existe se verifica contra un hash ficticio. El mensaje de error es siempre el mismo.
- En cada pedido se comprueba que el usuario siga activo, con el mismo rol y la misma contraseña (huella de sesión). Si no, la sesión se cierra.
- El orden de control es: sesión (401), rol (403 `SIN_PERMISO`) y CSRF (403 `CSRF_INVALIDO`, cabecera `X-CSRF-Token`).
- La cookie es HttpOnly y SameSite=Lax, Secure con HTTPS, y el identificador cambia al iniciar sesión.

**Diferencias con PHP, justificadas:**
- **El logout es `POST` con CSRF.** En PHP es un GET sin protección (pendiente S3 de la auditoría).
- **Hay límite de intentos de login.** En PHP no existe (pendiente S1): 5 fallos por correo o 20 por IP en 15 minutos bloquean 15 minutos (429 `DEMASIADOS_INTENTOS`). Solo cuentan los errores de credenciales.
- **El login es un endpoint JSON**, y `csrf-inicio` es nuevo. En PHP el login es un formulario con token oculto.
- **Una sesión que deja de ser válida se borra en el servidor.** Pasa cuando el usuario se dio de baja, cambió de rol o cambió la contraseña. Las dos versiones responden 401 `SESION_INVALIDA`, pero PHP conserva el archivo de sesión.
- **Las sesiones de PHP y de NestJS son independientes.** Hay que iniciar sesión en cada versión por separado. Las dos calculan la huella de la contraseña con la misma fórmula y revisan el estado del usuario en cada pedido. Por eso, un cambio de contraseña o una baja hecha en una versión debería cerrar las sesiones de la otra. No se probó de punta a punta.

### Sesiones en memoria: solución temporal

Las sesiones se guardan en la memoria del proceso (`SesionesEnMemoria`). Es una solución **temporal y válida solo para una instancia** del backend:
- Al reiniciar el backend se pierden todas las sesiones y todos deben volver a iniciar sesión.
- Con dos o más instancias (balanceador, réplicas de Docker), cada una tendría sus propias sesiones y los usuarios perderían la sesión al cambiar de instancia.
- Hay un tope de 10 000 sesiones; al superarlo se descarta la más antigua. Las vencidas se limpian solas.
- El vencimiento es por inactividad: 24 minutos por defecto, como en PHP (`SESSION_INACTIVIDAD_MINUTOS`, entre 1 y 1440).

Para varias instancias habrá que guardar las sesiones en MariaDB u otro almacén compartido. Eso requiere una tabla nueva y se consultará antes de cambiar el esquema.

### Límite de intentos de login

| Valor | Límite |
|---|---|
| Fallos por correo | 5 en 15 minutos |
| Fallos por IP | 20 en 15 minutos |
| Bloqueo | 15 minutos, respuesta 429 `DEMASIADOS_INTENTOS` |

- Solo cuentan los errores de credenciales (correo inexistente, contraseña incorrecta o cuenta inactiva). Los campos vacíos o el CSRF inválido no cuentan.
- El correo se compara sin distinguir mayúsculas. Un login correcto reinicia el contador de ese correo, pero no el de la IP.
- Mientras dura el bloqueo no se verifica la contraseña, ni siquiera la correcta.

Limitaciones:
- Vive en memoria: se reinicia con el backend y no se comparte entre instancias.
- Un atacante puede bloquear durante 15 minutos la cuenta de otra persona fallando 5 veces con su correo.
- Varios usuarios detrás de la misma IP (una red con NAT) comparten el límite de 20.
- Detrás de un proxy inverso hay que activar `TRUST_PROXY=true`: si no, todos los pedidos parecen venir de la IP del proxy. No se debe activar sin proxy, porque la IP podría falsificarse con `X-Forwarded-For`.

### Compatibilidad con las contraseñas existentes

- Los hashes de PHP (`password_hash`, formato `$2y$`) se verifican con `bcryptjs` sin convertirlos ni modificar las cuentas. Se comprobó con cuentas de demostración de la base y con usuarios temporales creados con `$2y$`.
- También se comprobó el sentido inverso: PHP (`password_verify`) acepta los hashes `$2b$` que genera Node. Así, una contraseña cambiada desde Node seguirá funcionando en la versión PHP de respaldo.
- No se cambió ninguna cuenta, contraseña ni el esquema de la base.

### Cookies y CSRF en desarrollo y producción

| Variable | Desarrollo (HTTP local) | Producción (HTTPS) |
|---|---|---|
| `SESSION_SECRET` | Valor aleatorio propio, de 32 caracteres o más | Valor aleatorio largo, distinto al de desarrollo, fuera del repositorio |
| `COOKIE_SECURE` | `auto` (la cookie se envía sin `Secure` por HTTP) | `true`, o `auto` con `TRUST_PROXY=true` si el HTTPS termina en un proxy |
| `TRUST_PROXY` | `false` | `true` solo detrás de un proxy inverso |

- La cookie `medicontrol.sid` es siempre HttpOnly, SameSite=Lax y con ruta `/`. No tiene vencimiento propio: se borra al cerrar el navegador, como la de PHP.
- Con `COOKIE_SECURE=true` y HTTP sin proxy, el navegador no guarda la cookie y el login no funciona. Por eso el valor por defecto es `auto`.
- Cambiar `SESSION_SECRET` invalida todas las sesiones abiertas.
- El token CSRF es aleatorio (32 bytes), se guarda en la sesión, se renueva al iniciar sesión y se compara en tiempo constante. Se exige en todo método distinto de `GET`, `HEAD` y `OPTIONS`, con la cabecera `X-CSRF-Token`.
- SameSite=Lax supone que el frontend y la API se sirven desde el mismo sitio. Si en producción quedaran en dominios distintos, habrá que revisar la cookie y CORS.

## Usuarios y cuenta (etapa 4)

| Ruta | Acceso | Qué hace |
|---|---|---|
| `POST /api/cuenta/contrasena` | Cualquier rol, con CSRF | `{contrasena_actual, contrasena_nueva, contrasena_confirmacion}`. Cambia la contraseña propia |
| `GET /api/usuarios` | Recepción | `?tipo=personal\|pacientes&buscar=&estado=todos\|activo\|inactivo&pagina=1`. De a 10 |
| `GET /api/usuarios/:id` | Recepción | Detalle con los datos del perfil |
| `POST /api/usuarios` | Recepción, con CSRF | Alta de médico (201). Con `rol: paciente` responde 403 `SIN_PERMISO`: los pacientes se registran solos con `POST /api/registro` |
| `PATCH /api/usuarios/:id` | Recepción, con CSRF | Datos personales y de perfil. No cambia rol, estado ni contraseña |
| `POST /api/usuarios/:id/baja` | Recepción, con CSRF | Baja lógica |
| `POST /api/usuarios/:id/reactivacion` | Recepción, con CSRF | Reactivación |
| `POST /api/usuarios/:id/contrasena-provisoria` | Recepción, con CSRF | `{contrasena, contrasena_confirmacion}` |

Los datos de Mi cuenta (nombre, apellido, correo y rol) se leen con `GET /api/auth/me`.

**Igual que en PHP:**
- Recepción gestiona pacientes y médicos, pero **no crea pacientes**: cada paciente crea su cuenta en el registro público y recepción lo busca por DNI. Esto es una diferencia con PHP, donde Configuración sí da de alta pacientes. A otros recepcionistas solo los consulta (`gestionable: false`): no los crea, modifica, da de baja, reactiva ni les asigna contraseña. Tampoco puede hacerlo consigo misma.
- Las validaciones son las de la etapa 2, con los mismos mensajes y el mismo orden de errores. Correo o DNI repetidos: 409 `DATO_DUPLICADO`, sin distinguir mayúsculas en el correo.
- El rol nunca sale del formulario, y en una modificación no se puede cambiar (403 `CAMBIO_ROL_NO_PERMITIDO`). Se ignoran el estado, la contraseña y el `id_usuario` enviados.
- No hay borrado físico: `DELETE` responde 405. La baja es lógica, conserva el historial y cierra la sesión del usuario.
- No se da de baja a quien tiene turnos pendientes o confirmados futuros, o en curso de cualquier fecha (409 `TURNOS_SIN_RESOLVER`). La hora actual es la de la clínica.
- El alta y la modificación se guardan en una transacción. Si dos envíos simultáneos usan el mismo correo o DNI, la restricción única de la base deja pasar uno solo.
- Las contraseñas se guardan con bcrypt de costo 10 y prefijo `$2y$`, como `password_hash` de PHP. La versión PHP las verifica sin cambios.
- Cambio de contraseña propia:
  - el usuario sale de la sesión, nunca del pedido;
  - los espacios de la contraseña se conservan;
  - una contraseña actual de más de 72 bytes cuenta como incorrecta;
  - solo se guarda si la contraseña no cambió en el medio y la cuenta sigue activa (si no, 409 `CUENTA_MODIFICADA`);
  - si sale bien, la sesión actual cambia de identificador y de token CSRF, y las demás sesiones del usuario quedan inválidas.
- Límite del cambio de contraseña propia: 5 fallos de la contraseña actual en la misma sesión la bloquean 15 minutos (429). Las otras validaciones no cuentan. Un cambio exitoso reinicia el contador. Los pedidos simultáneos de una sesión se atienden de a uno, para que el contador no se pueda esquivar.
- La contraseña provisoria cierra las sesiones abiertas de ese usuario.
- Rutas: una ruta inexistente responde 404 y un método no permitido 405, antes de pedir sesión. Los `:id` solo aceptan números.

**Diferencias con PHP en la lectura de los pedidos (afectan a toda la API):**
- **`HEAD`:** en una ruta GET se responde como un `GET`, que es el comportamiento de Express. En PHP responde 405.
- **Parámetro repetido en la query** (`?tipo=a&tipo=b`): se descarta y se usa el valor por defecto. PHP toma el último.
- **Cuerpo con formato de formulario** (`application/x-www-form-urlencoded`): NestJS lo acepta, y PHP solo lee JSON. El token CSRF por cabecera sigue siendo obligatorio, así que no abre una vía de ataque desde otros sitios.

**Funcionalidades que la versión PHP no tiene y se agregaron en la etapa 10:**
- Edición de los datos personales propios desde Mi cuenta (`GET /api/cuenta` y `PATCH /api/cuenta/datos`). Cada persona edita su nombre, su apellido y su correo; el paciente, además, su contacto y su perfil. Cambiar el correo exige la contraseña actual, con el mismo límite de intentos que el cambio de contraseña. El DNI, el rol, el estado, la especialidad y la matrícula los sigue gestionando recepción.
- Contraseña provisoria obligatoria: la que asigna recepción, y la del alta de un médico, marcan `debe_cambiar_contrasena`. Hasta cambiarla, el backend responde 403 `CAMBIO_CONTRASENA_REQUERIDO` en todas las rutas salvo `GET /auth/me`, `GET /auth/csrf`, `GET /cuenta`, `POST /cuenta/contrasena` y el cierre de sesión.

### Registro público de pacientes

| Ruta | Acceso | Qué hace |
|---|---|---|
| `POST /api/registro` | Pública, con el CSRF de `/auth/csrf-inicio` | Los campos de `register.php`. Crea una cuenta de paciente activa con su perfil (201 `{registrado: true}`) |

**Igual que en PHP (`register.php` y `RegistroPacientesService.php`):**
- El rol es siempre `paciente`: se ignoran el `rol` y el `estado` enviados. Médicos y recepcionistas no se pueden registrar.
- Las validaciones son las de persona, perfil de paciente y contraseña de la etapa 2, con 400 `DATOS_INVALIDOS` y el error de cada campo.
- Correo o DNI ya registrados: 409 `REGISTRO_NO_DISPONIBLE` con un mensaje único que no revela cuál de los dos existe. Dos envíos simultáneos los frena la restricción única.
- El token CSRF se renueva después de cada envío, así que el mismo formulario no se puede reenviar.
- El usuario y su perfil se guardan en una transacción, con la contraseña en formato `$2y$`.

**Agregado en la etapa 10:**
- Con una sesión iniciada no se crea otra cuenta: 409 `SESION_INICIADA`.
- Máximo 10 envíos por hora desde una misma conexión, válidos o no; después, 429 `DEMASIADOS_INTENTOS`. Frena la creación masiva de cuentas y las pruebas repetidas para averiguar qué correos o DNI existen. Está en memoria, como el límite del login.
- El formulario valida el DNI con la misma regla que el backend: se quitan puntos, espacios y guiones, y lo que queda tiene que ser de 7 u 8 dígitos.

**Diferencias:** es una ruta JSON y no un formulario, y la respuesta no devuelve los datos de la cuenta. Como en PHP, no tiene límite de intentos.

## Turnos (etapa 5)

| Ruta | Acceso | Qué hace |
|---|---|---|
| `GET /api/turnos?fecha=` o `?desde=&hasta=` | Recepción | Turnos de un día o de un rango de hasta 42 días |
| `GET /api/turnos/resumen?mes=YYYY-MM` | Recepción | Cantidad por día y por estado |
| `GET /api/turnos/:id` | Recepción | Detalle |
| `POST /api/turnos` | Recepción, con CSRF | `{id_paciente, id_medico, fecha, hora, motivo_consulta}`. Crea un turno pendiente (201) |
| `PATCH /api/turnos/:id` | Recepción, con CSRF | `{fecha, hora, estado}`. Reprograma o cambia el estado |
| `POST /api/turnos/:id/cancelacion` | Recepción, con CSRF | Cancela |
| `GET /api/medicos` | Recepción | Médicos activos |
| `GET /api/pacientes?buscar=&limite=` | Recepción | Pacientes activos (de 1 a 100) |
| `GET /api/medicos/:id/disponibilidad?fecha=` | Recepción | Los 19 horarios: libre, ocupado o pasado |
| `GET /api/medico/agenda?fecha=` | Médico | Sus turnos del día (por defecto, hoy), con notas y teléfono del paciente |
| `GET /api/paciente/turnos` | Paciente | Todos sus turnos, con los datos del médico |

**Igual que en PHP:**
- Las validaciones, los códigos y los mensajes son los de `TurnosService.php`, con las reglas de la etapa 2 (horarios permitidos, estados, transiciones y fecha futura en la hora de Argentina).
- Recepción nunca ve las notas médicas.
- **Reservas simultáneas:** se comprueba que el horario esté libre y, además, una restricción única de la base impide dos turnos vigentes del mismo médico en la misma fecha y hora (`uk_medico_horario_activo`, migración 001). Si dos pedidos pasan la verificación a la vez, el segundo recibe 409 `HORARIO_OCUPADO`.
- **Ediciones simultáneas:** una modificación o una cancelación solo se guarda si el turno sigue como se leyó (si no, 409 `TURNO_MODIFICADO`).
- **Diferencias con PHP desde la etapa 10:**
  - **Horario de un turno cancelado:** queda libre y se puede volver a dar. En PHP seguía ocupado. El turno cancelado se conserva en el historial.
  - **Un paciente no puede tener dos turnos vigentes en la misma fecha y hora**, aunque sean con médicos distintos: 409 `PACIENTE_OCUPADO`, también al reprogramar. Lo garantiza `uk_paciente_horario_activo` aunque dos pedidos lleguen a la vez.
  - **Las tarjetas de totales** ("Turnos del día", "de la semana" y "del mes", y el total de la agenda del médico) cuentan solo los turnos vigentes. Los cancelados se muestran aparte.
  - **Notas médicas:** el médico las escribe con `PATCH /api/medico/turnos/:id/notas`, solo en sus turnos, igual que en `panel/medico.php`. Con `GET /api/medico/pacientes/:id/historial` ve los turnos de un paciente con él (no los de otros médicos).
- **Mes sin turnos:** el resumen devuelve `dias: []`, como `json_encode` de un array vacío en PHP.
- **Turnos del médico y del paciente:** usan las mismas consultas que `panel/medico.php` y `panel/paciente.php`. El médico o el paciente sale de la sesión, nunca del pedido.

**Diferencias con PHP:**
- **Turnos del médico y del paciente:** en PHP solo existen como pantallas. Acá son rutas JSON de solo lectura.
- **Fecha inválida en la agenda del médico:** responde 400; la pantalla PHP la reemplazaba por hoy en silencio.
- **Hora en los turnos del paciente:** sale como `HH:MM`, igual que en el resto de la API.
- **Turnos del paciente:** incluyen `id_turno`, que la pantalla no mostraba. Con la misma fecha y hora, se ordenan por `id_turno`.
- **Médico o paciente sin perfil:** responde 404 `PERFIL_NO_ENCONTRADO`; la pantalla PHP mostraba un mensaje.
- **Agenda del médico:** no devuelve los totales por estado que calculaba la pantalla. Los calcula el frontend a partir de la lista.

**Pendiente:**
- Notas médicas: el médico las edita en `panel/medico.php` (etapa 6).
- Que el paciente pida o cancele sus propios turnos: la versión PHP no lo tiene.
- Evitar que un paciente tenga dos turnos a la misma hora con médicos distintos: la versión PHP tampoco lo controla.

## Frontend React (etapa 7)

React 19 + TypeScript 6 + Vite 8, en `frontend/`. Solo usa las rutas existentes de la API; no hizo falta cambiar el backend.

**Cómo se ejecuta en desarrollo:**

```powershell
# Backend contra la base de la demo (el valor de la variable de entorno tiene prioridad sobre backend/.env)
cd backend; $env:DB_NAME = "medicontrol_demo"; npm run build; node dist/main.js
# En otra terminal, el frontend en http://127.0.0.1:5173
cd frontend; npm install; npm run dev
```

**Estructura:**

| Carpeta | Contenido |
|---|---|
| `src/api/` | `cliente.ts` (fetch, CSRF y sesión vencida), `servicios.ts` (una función por ruta) y `tipos.ts` (contrato de respuestas) |
| `src/sesion/` | Estado de la sesión (`GET /api/auth/me` al abrir) y protección de rutas por rol |
| `src/paginas/` | Pantallas por rol: `recepcion/`, `medico/` y `paciente/`, más el login |
| `src/calendario/` | Calendario de recepción: vistas Semana y Mes, y las piezas que comparte con la vista Día (barra con totales, filtros y pestañas, tarjeta de turno, ventanas de detalle y de modificación, aviso flotante, fechas y filtros) |
| `src/componentes/` | Marco con menú, estados de carga y error, campos, etiquetas y grilla de horarios |
| `src/utilidades/` | Fechas en la zona de la clínica, reglas de estados para la interfaz y carga de datos |

| Pantalla | Rol | Rutas que usa |
|---|---|---|
| Login | Todos | `GET /auth/csrf-inicio`, `POST /auth/login` |
| Registro de paciente (`/registro`) | Sin sesión | `GET /auth/csrf-inicio`, `POST /registro` |
| Agenda: vista Día | Recepción | `GET /turnos?fecha=`, `PATCH /turnos/:id`, `POST /turnos/:id/cancelacion`, `GET /medicos/:id/disponibilidad` para reprogramar |
| Agenda: vista Semana | Recepción | `GET /turnos?desde=&hasta=` (lunes a domingo), `POST /turnos/:id/cancelacion` |
| Agenda: vista Mes | Recepción | `GET /turnos/resumen?mes=`, `GET /turnos?fecha=` (turnos del día elegido), `GET /turnos/:id` (detalle), `POST /turnos/:id/cancelacion` |
| Nuevo turno | Recepción | `GET /medicos`, `GET /medicos/:id/disponibilidad`, `GET /pacientes`, `POST /turnos` |
| Pacientes: búsqueda por DNI, nombre o correo, y «Registrar turno» | Recepción | `GET /usuarios?tipo=pacientes`. «Registrar turno» abre Nuevo turno con `?dni=` y deja elegido al paciente. Recepción no crea pacientes |
| Mi agenda | Médico | `GET /medico/agenda?fecha=`, `PATCH /medico/turnos/:id/notas`, `GET /medico/pacientes/:id/historial` |
| Mis turnos | Paciente | `GET /paciente/turnos` |
| Configuración del Sistema (`recepcionista_configuracion.php`) | Recepción | `POST /cuenta/contrasena`; `GET /usuarios`, `GET /usuarios/:id`, `POST /usuarios` (solo médicos), `PATCH /usuarios/:id`, `POST /usuarios/:id/baja`, `/reactivacion` y `/contrasena-provisoria`. Sin «Agregar paciente»: los pacientes se registran solos |
| Mi cuenta (`mi_cuenta.php`) | Todos | `GET /cuenta`, `PATCH /cuenta/datos`, `POST /cuenta/contrasena`. Con una contraseña provisoria, es la única pantalla disponible |
| Cerrar sesión | Todos | `POST /auth/logout` |

**Sesión, cookies y CSRF:**
- En desarrollo, Vite reenvía `/api` al backend: el navegador ve un solo origen. Por eso la cookie `HttpOnly` y `SameSite=Lax` viaja sin configurar CORS. El frontend nunca lee la cookie.
- Los pedidos que modifican datos llevan `X-CSRF-Token`, en tres momentos:
  - antes del login, el token sale de `/auth/csrf-inicio`;
  - después, de `/auth/csrf`;
  - se descarta al iniciar sesión, al cambiar la contraseña y al cerrar la sesión, porque el backend lo renueva.

  Si el backend responde `CSRF_INVALIDO`, el cliente pide otro token y reintenta una sola vez. El rechazo ocurre antes de procesar el pedido, así que reintentar es seguro.
- Cualquier 401 `NO_AUTENTICADO` o `SESION_INVALIDA` lleva al login con el aviso "Tu sesión venció". Después de iniciar sesión, se vuelve a la pantalla anterior si es del mismo rol.
- La protección de rutas por rol es solo de navegación: el permiso real lo controla el backend en cada pedido.

### Calendario de recepción (Día, Semana y Mes)

Reproduce las pantallas `panel/recepcionista.php`, `recepcionista_semana.php`, `recepcionista_mes.php` y `recepcionista_turno_nuevo.php`, con su paleta (azul `#004797`), sus colores por estado y la misma disposición. Las direcciones son `/recepcion/agenda/dia`, `/semana` y `/mes`, con `?fecha=YYYY-MM-DD`. Las pestañas conservan la fecha al cambiar de vista, y `/recepcion/agenda` lleva a la vista Día.

**Común a las tres vistas, como en PHP:**
- cuatro tarjetas de totales: turnos, confirmados, pendientes y en curso;
- botón «Registrar turno», que lleva la fecha;
- pestañas Día, Semana y Mes;
- aviso flotante después de cada acción;
- si la fecha de la URL no es válida, se muestra hoy y se avisa.

En Día y Semana también hay un buscador, que ignora acentos y busca por paciente, DNI, médico, especialidad y motivo, y un filtro de especialidad armado con las especialidades de los turnos cargados.

| Vista | Qué hace |
|---|---|
| Día | Flechas, «Hoy» y selector de fecha. Muestra los turnos en una línea de tiempo por hora. Al tocar un turno se completa la ficha «Paciente seleccionado»; si no se toca ninguno, queda elegido el primero, como en PHP. Desde la ficha se abre el detalle o «Modificar este turno»: fecha, horarios según la disponibilidad real del médico, solo los estados permitidos, una nota con la regla que aplica y cancelación |
| Semana | De lunes a domingo, con hoy resaltado. El encabezado de cada día abre la vista Día. Al tocar un turno se abre su detalle, con «Abrir en vista Día» (el turno queda seleccionado) y «Cancelar turno» |
| Mes | Grilla de lunes a domingo con la cantidad de turnos por día. El color sigue la misma regla que PHP: en curso si hay alguno; pendiente si hay más pendientes que confirmados; cancelado si todos están cancelados; si no, confirmado. Al tocar un día se abre su lista, de ahí el detalle (leído de nuevo del backend) y «Volver al día». También ofrece «Registrar turno este día» |
| Nuevo turno | Una tarjeta, como `recepcionista_turno_nuevo.php`: búsqueda de paciente activo, médico con la especialidad que se completa sola, fecha desde hoy, horarios según la disponibilidad y motivo. Acepta `?fecha=` y `?id_medico=`. Al registrar, vuelve a la vista Día con el turno seleccionado |

**Diferencias con las pantallas PHP:**
- **Controles simulados:** no se reprodujeron «Imprimir comprobante», «Todos los clientes» (listaba personas inventadas), la ubicación fija «Consultorio 3» ni el arrastrar y soltar, que anunciaba una reprogramación sin guardarla. Los pacientes reales se consultan en la pantalla Pacientes.
- **Confirmación de la cancelación:** se pide dentro de la misma ventana, no con el diálogo del navegador.
- **Ventana «Modificar»:** marca los horarios ocupados y pasados con la disponibilidad real. La de PHP mostraba todos los horarios y dejaba que el backend rechazara.
- **Filtro de especialidad de la vista Día:** sale de los turnos cargados. En PHP era una lista fija.
- **Vista Mes:** no tiene buscador. En PHP oscurecía días según el número; la búsqueda por paciente o médico está en Día y Semana.
- **Vista Semana según el ancho:** desde 1200 px son siete columnas iguales, y la página se ensancha hasta 1440 px para que entren. Entre 768 y 1199 px los días pasan a filas, en orden. En pantallas angostas van uno debajo del otro. En PHP la grilla se desplazaba de costado y las tarjetas podían sobresalir de su columna.

**Reglas copiadas para la interfaz:** las etiquetas y transiciones de estado están en `src/utilidades/turnos.ts`, copiadas de `backend/src/reglas/turnos.reglas.ts` para armar las opciones. El backend vuelve a validar cada cambio. La API todavía no expone esas reglas.

**Pruebas:** `npm test` corre 63 pruebas con Vitest y jsdom. Cubren:
- el cliente de la API y la protección de rutas;
- las fechas, el registro público, la búsqueda de pacientes por DNI y la separación de turnos del paciente;
- las fechas y los filtros del calendario, y el color predominante del mes;
- las vistas Día, Semana y Mes;
- las ventanas de detalle y de modificación, y el nuevo turno.

El recorrido completo se probó a mano en el navegador, en escritorio y en móvil.

### Base de la demo

La demo usa una base propia, `medicontrol_demo`. Nunca usa `medicontrol_test` ni `medicontrol_db`.
- Su estructura se copió de `medicontrol_test` sin datos, así que el esquema es el mismo.
- Los datos ficticios los carga `backend/scripts/sembrar-demo.mjs`. El script solo acepta una base `medicontrol_demo` vacía y no borra nada.
- La contraseña de las cuentas sale de `DEMO_CLAVE`, que se define en `backend/.env` y no se versiona.

```powershell
cd backend
$env:DB_NAME = "medicontrol_demo"; node --env-file=.env scripts/sembrar-demo.mjs
```

Las cuentas son `recepcion@`, `medico1@` a `medico3@` y `paciente1@` a `paciente5@`, todas con el dominio `demo.medicontrol.test`.

## Equivalencias con PHP en las reglas

Para que las reglas den el mismo resultado que en PHP, `backend/src/reglas/php.ts` reproduce detalles que cambian el resultado en casos borde:

- `trim()` de PHP quita solo espacio, `\t`, `\n`, `\r`, `\0` y `\x0B`; el de JavaScript quita más caracteres.
- `mb_strlen()` cuenta caracteres, y `strlen()` bytes en UTF-8: el máximo de la contraseña (72) son bytes.
- En PCRE, `$` sin el modificador `D` también coincide antes de un `\n` final.
- `\s` y `\d` con `/u` aceptan espacios y dígitos Unicode. Sin `/u`, solo los ASCII.
- `filter_var(FILTER_VALIDATE_EMAIL)` se reproduce con la misma expresión de PHP 8.0 y el mismo límite de 320 bytes.
- Las fechas se calculan en `America/Argentina/Buenos_Aires`, sin depender de la zona del proceso.

## Seguridad y datos

- Las credenciales van en `backend/.env`, que no se sube a Git. `.env.example` no tiene valores reales.
- La configuración no inventa credenciales: si falta un dato obligatorio, el backend no arranca.
- En desarrollo, el backend usa `medicontrol_test`, nunca `medicontrol_db`.
- Dependencias de producción: 0 vulnerabilidades según `npm audit`.
- Dependencias de desarrollo: 20 avisos (16 moderados y 4 bajos), todos dentro de Jest. No se instalan en producción ni procesan datos externos.

  | Paquete | Aviso | Gravedad |
  |---|---|---|
  | `glob` 10 a 13 | GHSA-3g3m-2fjr-6pw4 | Moderada |
  | `minimatch` menor que 11.0.1 | GHSA-g3hv-75wg-m249 | Moderada |
  | `deepmerge` 4.3.1 | GHSA-gcqx-w48m-w2h4 | Baja |

  La única corrección que propone npm es bajar Jest a la versión 25, que sería un retroceso. Hay que revisarlo cuando Jest publique una versión que los resuelva.
