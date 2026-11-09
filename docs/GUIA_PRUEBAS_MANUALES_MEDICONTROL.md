# MediControl · guía de pruebas manuales

Guía para probar la versión NestJS + React de MediControl en una computadora con Docker Desktop
y reportar los resultados **antes de integrar la rama `feature/migracion-nestjs` en `main`**.

> **Este documento no contiene contraseñas.** Las contraseñas provisorias de las cuentas de prueba
> se entregan aparte, de forma privada, en el paquete `medicontrol_entrega_privada`.

## 0. Estado de la versión que vas a probar

| Ya verificado en la computadora de desarrollo (sin Docker) | Lo que verificás vos |
|---|---|
| Typecheck y build del backend y del frontend | Que Docker Compose levante MariaDB, backend y frontend |
| 184 pruebas unitarias del backend, 73 del frontend y 205 de integración contra MariaDB 10.4.32 | Los flujos de la lista de la sección 9, en el navegador |
| Migraciones del esquema e importación de las 12 cuentas sobre MariaDB | La carga de las cuentas en tu Docker |
| Recorrido de los tres roles por la API | La persistencia después de reiniciar Docker |

**Docker todavía no se ejecutó nunca.** Tu prueba es la primera. Si algo falla al levantarlo, anotá el
paso y el mensaje (sección 11).

---

## 1. Requisitos

| Programa | Para qué | Descarga |
|---|---|---|
| Docker Desktop (con WSL 2) | Ejecuta MariaDB, el backend y el frontend | https://www.docker.com/products/docker-desktop/ |
| Git | Descargar la rama | https://git-scm.com/downloads |
| Un navegador actualizado (Chrome, Edge o Firefox) | Usar MediControl | — |

- **Computadora:** Windows 10 22H2 u 11, 8 GB de RAM como mínimo (recomendado 16 GB) y unos 5 GB libres en disco.
- **Puerto:** el **8080** libre en tu computadora (se puede cambiar, sección 3).
- **No hace falta instalar** Node.js, MariaDB, Nginx ni XAMPP: Docker los trae.

Si nunca usaste Docker Desktop, la instalación paso a paso está en
[GUIA_INSTALACION_COMPANERO.md](GUIA_INSTALACION_COMPANERO.md), secciones 1 y 2.

---

## 2. Descargar la rama actualizada

**Si todavía no tenés el proyecto:**

```powershell
cd $HOME\Documents
git clone --branch feature/migracion-nestjs https://github.com/lusalvaGH/medicontrol.git
cd medicontrol
```

**Si ya lo tenés:**

```powershell
cd $HOME\Documents\medicontrol
git switch feature/migracion-nestjs
git pull
```

**Comprobar** que estás en la rama correcta y que llegaron los archivos nuevos:

```powershell
git branch --show-current
git log -1 --oneline
Test-Path compose.yaml, backend\migraciones, docs\GUIA_PRUEBAS_MANUALES_MEDICONTROL.md
```

Tiene que decir `feature/migracion-nestjs`, el último commit y tres veces `True`.

---

## 3. Variables de entorno (sin compartir secretos)

Las claves del `.env` las inventás vos y **no se comparten con nadie**: cada instalación tiene las suyas.

```powershell
Copy-Item .env.example .env
```

Generá un valor al azar. Ejecutá esta línea **tres veces** y usá un resultado distinto para cada clave:

```powershell
$b = New-Object byte[] 30; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
```

Abrí `.env` (`notepad .env`) y completá:

```ini
MARIADB_PASSWORD=<primer valor>
MARIADB_ROOT_PASSWORD=<segundo valor>
SESSION_SECRET=<tercer valor>
```

- **Puerto ocupado:** si el 8080 lo usa otro programa, cambiá `FRONTEND_PUERTO=8081` y usá ese puerto en el navegador.
- **El `.env` no se sube a Git:** está en `.gitignore`. No lo mandes por chat ni lo adjuntes a los reportes.

---

## 4. Levantar MediControl con Docker Compose

Con Docker Desktop abierto, en estado **Engine running**:

```powershell
docker compose up -d --build
```

La primera vez tarda varios minutos. Docker arranca los servicios en este orden:
1. **MariaDB**, que en el primer arranque crea la base `medicontrol_local` con sus tablas;
2. el **backend**, que aplica las **migraciones** del esquema antes de iniciar la API;
3. el **frontend**.

---

## 5. Comprobar que los tres servicios funcionan

| Qué | Comando | Resultado esperado |
|---|---|---|
| Estado de los contenedores | `docker compose ps` | `mariadb`, `backend` y `frontend` en **(healthy)** |
| Backend y base | `Invoke-RestMethod http://localhost:8080/api/health \| ConvertTo-Json` | `"ok": true` y `"base_de_datos": "ok"` |
| Migraciones aplicadas | `docker compose logs backend --tail 20` | Líneas `✓ 001_…` y `✓ 002_…` (o "Sin migraciones pendientes"), y después `MEDICONTROL API escuchando` |
| Frontend | Abrir http://localhost:8080 | Pantalla de inicio de sesión |

**MariaDB por dentro**, para ver la versión del esquema y la cantidad de usuarios y turnos:

```powershell
"SELECT MAX(version) AS esquema FROM schema_migraciones; SELECT COUNT(*) AS usuarios FROM usuarios; SELECT COUNT(*) AS turnos FROM turnos;" | docker compose exec -T mariadb sh -c 'MYSQL_PWD=$MARIADB_PASSWORD mysql -u $MARIADB_USER $MARIADB_DATABASE'
```

Esperado: `esquema 2`. En una instalación nueva, 0 usuarios y 0 turnos.

---

## 6. Cargar las cuentas de prueba

La base de Docker nace **vacía**. Las 12 cuentas de prueba (sección 8) se cargan desde el paquete
privado `medicontrol_entrega_privada`, que te llega aparte con dos archivos:

- **`medicontrol_cuentas.sql`:** las 12 cuentas y sus perfiles, sin turnos. Las contraseñas están guardadas como hashes; los datos son ficticios.
- **`CREDENCIALES_MEDICONTROL.md`:** las contraseñas provisorias.

Guardá los dos archivos en una carpeta privada de tu computadora, **fuera** de la carpeta del proyecto.
Por ejemplo, `C:\Users\<tu usuario>\Documents\medicontrol_privado\`.

> **Importante:** la carga solo funciona sobre una base vacía. No ejecutes antes
> `crear-cuentas-iniciales.mjs`. Si la base ya tiene datos de pruebas anteriores que no necesitás,
> mirá la sección 12.

1. **Copiar el archivo al contenedor del backend** (ajustá la ruta):
   ```powershell
   docker compose cp "C:\Users\<tu usuario>\Documents\medicontrol_privado\medicontrol_cuentas.sql" backend:/tmp/medicontrol_cuentas.sql
   ```
2. **Ensayo sin escribir nada.** Tiene que terminar con "Ensayo: el origen se puede importar":
   ```powershell
   docker compose exec backend node dist/importacion/cli.js --volcado /tmp/medicontrol_cuentas.sql --solo-cuentas --exigir-cambio-contrasena --ensayo
   ```
3. **Carga real:**
   ```powershell
   docker compose exec backend node dist/importacion/cli.js --volcado /tmp/medicontrol_cuentas.sql --solo-cuentas --exigir-cambio-contrasena
   ```
   Esperado:
   - "Verificación: cantidades, huellas e integridad coinciden con el origen";
   - "Importación confirmada en medicontrol_local: 12 usuarios, 4 medicos, 6 pacientes, 0 turnos".
4. **Borrar la copia** que quedó dentro del contenedor:
   ```powershell
   docker compose exec -u root backend rm /tmp/medicontrol_cuentas.sql
   ```
5. **Comprobar:** repetí la consulta de la sección 5. Tiene que dar 12 usuarios y 0 turnos.

El importador no modifica ninguna otra base y no carga nada si la base ya tiene datos.

**Si no tenés el paquete privado:** podés probar igual con
`docker compose exec backend node scripts/crear-cuentas-iniciales.mjs`. Crea solo 3 cuentas (una
por rol) con contraseñas al azar que muestra en tu terminal. En ese caso, las pruebas que necesitan
varias cuentas del mismo rol quedan como "Pendiente".

---

## 7. Acceder desde el navegador

Abrí **http://localhost:8080** (o el puerto de `FRONTEND_PUERTO`).

- La aplicación funciona **solo en tu computadora**: no se publica en la red.
- Usá una ventana normal. Para probar dos roles a la vez, usá otra ventana en modo incógnito, que tiene una sesión separada.

---

## 8. Cuentas de prueba

**Las contraseñas están en `CREDENCIALES_MEDICONTROL.md`, del paquete privado.** Son provisorias: en el
**primer inicio de sesión cada cuenta tiene que cambiarla**, y hasta hacerlo MediControl solo deja usar
«Mi cuenta». La contraseña nueva tiene que tener entre 8 y 72 caracteres, con letras y números.
Anotala en un lugar privado.

**Recepción (2)**

| Usuario | Nombre | Correo |
|---|---|---|
| #1 | Elena Martínez | `operador@medicore.com` |
| #2 | Lucas Gómez | `recepcion2@medicore.com` |

**Médicos (4)**

| Usuario | Nombre | Correo | Especialidad |
|---|---|---|---|
| #3 | Alejandro Rossi | `a.rossi@medicore.com` | Cardiología |
| #4 | Maria Garcia | `m.garcia@medicore.com` | Cardiología |
| #5 | Julián Martínez | `j.martinez@medicore.com` | Pediatría |
| #6 | Carlos Ruiz | `c.ruiz@medicore.com` | Traumatología |

**Pacientes (6)**

| Usuario | Nombre | Correo | DNI |
|---|---|---|---|
| #7 | Eduardo Rodríguez | `e.rodriguez@mail.com` | 34552121 |
| #8 | Valentina Rossi | `v.rossi@mail.com` | 34567890 |
| #9 | Mateo Fernández | `m.fernandez@mail.com` | 38991204 |
| #10 | Roberto García | `r.garcia@mail.com` | 24556788 |
| #11 | Ricardo Alarcón | `r.alarcon@mail.com` | 32114556 |
| #12 | Lucía Méndez | `l.mendez@mail.com` | 36778912 |

Todos los datos son ficticios: son las cuentas de demostración del proyecto.

---

## 9. Lista de pruebas manuales

**Cómo registrar cada resultado:**
- en "Estado", marcá una opción: **☐ Pendiente · ☐ Correcta · ☐ Fallida**;
- en "Observaciones", si falla, anotá qué pasó, el mensaje que apareció y la hora aproximada;
- usá **fechas futuras** para los turnos: el sistema rechaza horarios que ya pasaron.

**Reglas que conviene conocer:**
- los turnos se dan cada 30 minutos, de 08:00 a 17:00;
- el DNI tiene 7 u 8 números (con o sin puntos);
- el motivo del turno es obligatorio, de hasta 255 caracteres;
- después de 5 contraseñas incorrectas para el mismo correo, el login se bloquea 15 minutos. Para desbloquearlo antes: `docker compose restart backend`.

### 9.1 Recepcionista (`operador@medicore.com`)

| ID | Prueba | Pasos | Resultado esperado | Estado | Observaciones |
|---|---|---|---|---|---|
| R-01 | Inicio de sesión con contraseña provisoria | Ingresar con la contraseña del documento privado | Entra y va directo a «Mi cuenta» con el aviso "Tu contraseña es provisoria" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-02 | Bloqueo hasta cambiarla | Desde la barra, intentar abrir «Agenda» o escribir `/recepcion/agenda/dia` en la dirección | Vuelve siempre a «Mi cuenta» | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-03 | Cambio obligatorio de contraseña | En «Gestión de Seguridad»: actual = provisoria, nueva dos veces → «Actualizar contraseña» | Mensaje de éxito; aparecen «Mis datos» y la navegación completa | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-04 | La provisoria deja de servir | Cerrar sesión y entrar con la provisoria; después con la nueva | Con la provisoria: "Email o contraseña incorrectos". Con la nueva: entra a la Agenda | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-05 | Búsqueda de pacientes por DNI | «Pacientes» → buscar `38991204` y después `38.991.204` | Las dos búsquedas muestran solo a Mateo Fernández | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-06 | Registrar turno desde Pacientes | En la fila del paciente, «Registrar turno» | Abre «Nuevo turno» con ese paciente ya elegido | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-07 | Recepción no crea pacientes | Revisar «Pacientes» y «Nuevo turno» | No hay opción de crear pacientes; el mensaje indica que se registran solos | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-08 | Gestión de médicos: listado | «Configuración» → pestaña «Personal» | Aparecen los 4 médicos y las 2 recepcionistas; buscar "Cardio" filtra | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-09 | Gestión de médicos: alta | «Agregar médico» con datos ficticios y una contraseña provisoria | Mensaje de éxito; el médico aparece en el listado y en «Nuevo turno». Al entrar con esa cuenta, se le exige cambiar la contraseña | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-10 | Gestión de médicos: edición | Editar la especialidad o la matrícula de ese médico | Se guarda y se ve en el listado | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-11 | Gestión de médicos: baja y reactivación | Dar de baja al médico nuevo y reactivarlo | Pasa a "Inactivo" (no puede entrar ni aparece en «Nuevo turno") y vuelve a "Activo" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-12 | Contraseña provisoria a otra cuenta | Ícono de llave sobre un médico → asignar una provisoria | Mensaje de éxito; esa cuenta debe cambiarla al entrar | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-13 | Crear un turno | «Nuevo turno»: paciente por DNI, médico, fecha futura, horario libre, motivo → «Registrar turno» | Aviso "Turno registrado"; el turno aparece en la vista Día de esa fecha como "Pendiente" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-14 | Modificar el estado | Vista Día → elegir el turno → «Modificar este turno» → estado "Confirmado" | Se guarda; la tarjeta muestra "Confirmado" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-15 | Reprogramar a otro día | En «Modificar», cambiar la fecha y elegir un horario libre | La vista Día pasa a la fecha nueva con el turno seleccionado; en la fecha vieja ya no está | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-16 | Cancelar un turno | Detalle del turno → «Cancelar turno» → confirmar | La tarjeta queda "Cancelado"; el total del día baja en uno | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-17 | Vista Día | Navegar con las flechas, «Hoy» y el selector de fecha; usar el buscador y el filtro de especialidad | Muestra los turnos de cada fecha; los filtros reducen la lista | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-18 | Vista Semana | Pestaña «Semana» | Lunes a domingo; cada turno en su día; al tocarlo se abre el detalle | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-19 | Vista Mes | Pestaña «Mes»; tocar un día con turnos | La grilla muestra la cantidad de turnos vigentes por día; al tocar un día se listan sus turnos | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-20 | Horario ocupado del médico | En «Nuevo turno», mismo médico y fecha de un turno existente | Ese horario aparece tachado como ocupado y no se puede elegir | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-21 | Paciente con dos turnos simultáneos | Mismo paciente, otro médico, misma fecha y hora que un turno vigente | Error "El paciente ya tiene otro turno en esa fecha y hora" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| R-22 | Horario no permitido o pasado | En «Nuevo turno», elegir hoy y mirar los horarios ya pasados | Aparecen como "ya pasó" y no se pueden elegir | ☐ Pendiente ☐ Correcta ☐ Fallida | |

### 9.2 Médico (`a.rossi@medicore.com`)

| ID | Prueba | Pasos | Resultado esperado | Estado | Observaciones |
|---|---|---|---|---|---|
| M-01 | Inicio y cambio obligatorio | Entrar con la provisoria y cambiarla en «Mi cuenta» | Igual que R-01 a R-03 | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-02 | Acceso a su agenda | «Mi agenda» en la fecha de un turno que recepción le dio | Ve el turno con el DNI, la obra social y el teléfono del paciente | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-03 | Consulta de sus turnos | Recorrer varios días con las flechas | Ve solo sus turnos; el total no cuenta los cancelados | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-04 | Escribir notas médicas | «Agregar notas» en un turno → escribir → «Guardar notas» | Aviso "Notas guardadas"; la nota aparece debajo del motivo | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-05 | Modificar y borrar notas | «Editar notas» → cambiar el texto; después vaciarlo y guardar | Se ve el texto nuevo; vacío borra la nota | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-06 | Historial del paciente | «Historial» en un turno | Lista solo los turnos de ese paciente con este médico, con sus notas | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-07 | Sin información de otros médicos | Recepción da un turno al mismo paciente con otro médico (por ejemplo, Maria Garcia). Rossi mira su agenda y el historial | Rossi no ve ese turno ni sus notas. Al entrar como Garcia, ella no ve los turnos ni las notas de Rossi | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| M-08 | Sin acceso a recepción | Escribir `/recepcion/agenda/dia` en la dirección | Vuelve a «Mi agenda» | ☐ Pendiente ☐ Correcta ☐ Fallida | |

### 9.3 Paciente (`m.fernandez@mail.com`)

| ID | Prueba | Pasos | Resultado esperado | Estado | Observaciones |
|---|---|---|---|---|---|
| P-01 | Inicio y cambio obligatorio | Entrar con la provisoria y cambiarla en «Mi cuenta» | Igual que R-01 a R-03 | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-02 | Acceso a sus turnos | «Mis turnos» | Ve sus turnos en "Próximos" y los cancelados en "Anteriores y cancelados" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-03 | Edición de datos personales | «Mi cuenta» → «Mis datos»: cambiar teléfono y obra social → «Guardar datos» | Mensaje de éxito; al recargar, los datos siguen cambiados. El DNI no se puede editar | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-04 | Cambio de correo | Cambiar el correo | Pide la contraseña actual; con la correcta se guarda y se puede entrar con el correo nuevo | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-05 | Cambio de contraseña (voluntario) | «Gestión de Seguridad» con la contraseña actual correcta | Se actualiza; la contraseña anterior deja de servir | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-06 | Sin notas médicas | Comparar «Mis turnos» con un turno que tiene notas del médico | El paciente no ve las notas | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-07 | Sin información de otros pacientes | Revisar «Mis turnos» cuando hay turnos de otros pacientes ese día | Solo aparecen los suyos | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| P-08 | Sin acceso a otros roles | Escribir `/recepcion/pacientes` y `/medico/agenda` en la dirección | Vuelve a «Mis turnos» | ☐ Pendiente ☐ Correcta ☐ Fallida | |

### 9.4 Seguridad y funcionamiento

| ID | Prueba | Pasos | Resultado esperado | Estado | Observaciones |
|---|---|---|---|---|---|
| S-01 | Rutas protegidas sin sesión | Cerrar sesión y abrir `http://localhost:8080/recepcion/agenda/dia` | Lleva al inicio de sesión | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-02 | Rutas por rol | Con cada rol, intentar las direcciones de los otros dos | Siempre vuelve a la pantalla de su rol | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-03 | Cierre de sesión | «Cerrar sesión» y usar el botón Atrás del navegador | No muestra datos: pide iniciar sesión | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-04 | Sesión vencida | `docker compose restart backend` con una sesión abierta; después hacer cualquier acción | Aparece el login con "Tu sesión venció o ya no es válida" | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-05 | Límite de intentos de login | 5 contraseñas incorrectas seguidas para una misma cuenta | El sexto intento avisa "Demasiados intentos"; `docker compose restart backend` lo desbloquea | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-06 | Registro de pacientes | En el login, «Registrarse» → completar con datos ficticios (DNI de 8 números, con puntos) | "Tu cuenta se creó correctamente"; el paciente entra sin cambio obligatorio y recepción lo encuentra por DNI | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-07 | Registro duplicado | Registrar otra vez el mismo correo o DNI | Mensaje genérico, sin indicar cuál dato existe | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-08 | Validaciones del registro | DNI de 6 números, correo inválido, contraseña sin números, contraseñas distintas | Cada campo muestra su error y no se crea la cuenta | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-09 | Validaciones de Mi cuenta | Nombre de 1 letra o teléfono con letras | Error en el campo; no se guarda | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-10 | Liberación de horarios cancelados | Cancelar un turno y abrir «Nuevo turno» con el mismo médico, fecha y hora | El horario aparece libre y se puede dar a otro paciente | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-11 | Mensajes de error claros | Repasar los errores vistos en las pruebas anteriores | Están en español y explican qué corregir; no se ven errores técnicos | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-12 | Persistencia: reinicio de servicios | Anotar la cantidad de turnos; `docker compose restart`; volver a entrar | Los turnos, las cuentas y los datos editados siguen iguales | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-13 | Persistencia: reinicio de Docker | `docker compose stop`, cerrar y abrir Docker Desktop, `docker compose up -d` | Los servicios vuelven a "(healthy)" y los datos siguen ahí | ☐ Pendiente ☐ Correcta ☐ Fallida | |
| S-14 | Conteos sin cancelados | Con un día que tenga turnos cancelados, mirar las tarjetas de Día, Semana y Mes | "Turnos del día/de la semana/del mes" cuenta solo los vigentes | ☐ Pendiente ☐ Correcta ☐ Fallida | |

---

## 10. Persistencia y reinicios

Los datos viven en el volumen de Docker `medicontrol_datos_mariadb`.

| Acción | Comando | Datos |
|---|---|---|
| Reiniciar los servicios | `docker compose restart` | Se conservan. Las sesiones abiertas se cierran |
| Detener sin borrar nada | `docker compose stop` | Se conservan |
| Detener y quitar los contenedores | `docker compose down` | Se conservan: el volumen no se toca |
| Volver a iniciar | `docker compose up -d` | Recupera todo |

**Comprobar la persistencia**, antes y después de reiniciar:

```powershell
"SELECT COUNT(*) AS usuarios FROM usuarios; SELECT COUNT(*) AS turnos FROM turnos;" | docker compose exec -T mariadb sh -c 'MYSQL_PWD=$MARIADB_PASSWORD mysql -u $MARIADB_USER $MARIADB_DATABASE'
```

---

## 11. Cómo reportar los resultados

1. Completá el estado y las observaciones de cada prueba de la sección 9, en este archivo o en el PDF impreso.
2. Si algo falla, agregá el ID de la prueba, los pasos exactos y una captura. **Revisá que la captura no muestre contraseñas.**
3. Si falla Docker o el backend, guardá el final de los logs:
   ```powershell
   docker compose ps
   docker compose logs --tail 100 > medicontrol_logs.txt
   ```
   Antes de mandar ese archivo, revisá que no tenga contraseñas (el sistema no las registra, pero verificalo igual).
4. **No envíes** el `.env`, `CREDENCIALES_MEDICONTROL.md` ni `medicontrol_cuentas.sql`.

---

## 12. Detener o empezar de cero

- **Detener sin perder nada:** `docker compose stop` o `docker compose down`. **Nunca** uses `-v` si querés conservar los datos.
- **Empezar de cero.** **Borra todos los datos de MediControl en tu Docker**: cuentas, turnos y pacientes registrados. No afecta ninguna otra base ni archivo de tu computadora.
  ```powershell
  docker compose down -v
  docker compose up -d --build
  ```
  Después volvé a cargar las cuentas (sección 6). Las contraseñas provisorias del documento privado vuelven a servir, porque se cargan los mismos hashes.

Más ayuda para errores de Docker (puerto ocupado, MariaDB que no inicia, variables faltantes):
[instalacion-docker.md](instalacion-docker.md), sección «Problemas habituales».
