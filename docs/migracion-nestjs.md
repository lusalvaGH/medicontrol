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
| 7. Frontend React | Pendiente | |
| 8. Pruebas de integración | Pendiente | |
| 9. Docker y documentación | Pendiente | Necesita una computadora con Docker: en el equipo actual no se puede instalar |

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

```powershell
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="3306"; $env:DB_NAME="medicontrol_test"
$env:DB_USER="<usuario de MariaDB>"; $env:DB_PASSWORD="<contraseña>"
npm test
```

Las pruebas de integración se niegan a correr si `DB_NAME` no es una base `medicontrol_test`.

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
| `POST /api/usuarios` | Recepción, con CSRF | Alta de paciente o médico (201) |
| `PATCH /api/usuarios/:id` | Recepción, con CSRF | Datos personales y de perfil. No cambia rol, estado ni contraseña |
| `POST /api/usuarios/:id/baja` | Recepción, con CSRF | Baja lógica |
| `POST /api/usuarios/:id/reactivacion` | Recepción, con CSRF | Reactivación |
| `POST /api/usuarios/:id/contrasena-provisoria` | Recepción, con CSRF | `{contrasena, contrasena_confirmacion}` |

Los datos de Mi cuenta (nombre, apellido, correo y rol) se leen con `GET /api/auth/me`.

**Igual que en PHP:**
- Recepción gestiona pacientes y médicos. A otros recepcionistas solo los consulta (`gestionable: false`): no los crea, modifica, da de baja, reactiva ni les asigna contraseña. Tampoco puede hacerlo consigo misma.
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

**Funcionalidades que la versión PHP no tiene y no se agregaron:**
- Edición de los datos personales propios desde Mi cuenta. En PHP, Mi cuenta solo cambia la contraseña; los datos de pacientes y médicos los edita recepción.
- Registro público de pacientes (`register.php`). Es un formulario y no una ruta de la API; queda pendiente de definir junto con el frontend (etapa 7).

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
- **Reservas simultáneas:** se comprueba que el horario esté libre y, además, la restricción única `uk_medico_fecha_hora` de la base impide dos turnos del mismo médico en la misma fecha y hora. Si dos pedidos pasan la verificación a la vez, el segundo recibe 409 `HORARIO_OCUPADO`. Las dos bases tienen esa restricción.
- **Ediciones simultáneas:** una modificación o una cancelación solo se guarda si el turno sigue como se leyó (si no, 409 `TURNO_MODIFICADO`).
- **Horario de un turno cancelado:** sigue ocupado, porque la restricción única también cuenta los cancelados. Liberarlo requiere cambiar el esquema y queda para consultar.
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
