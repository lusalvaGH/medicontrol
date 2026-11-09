# Instalar MediControl con Docker (Windows + WSL2)

Esta guía levanta MediControl completo en tu computadora con **Docker Desktop**, sin XAMPP ni
ninguna base de datos previa. Está pensada para alguien que no participó en el desarrollo.

Se levantan tres contenedores:

| Servicio   | Qué es                                   | Dónde se ve                       |
|------------|------------------------------------------|-----------------------------------|
| `mariadb`  | MariaDB 10.4.32 con la base `medicontrol_local` | Solo dentro de Docker       |
| `backend`  | API NestJS                               | Solo dentro de Docker             |
| `frontend` | React compilado + Nginx                  | http://localhost:8080             |

La base se crea **nueva y vacía**: tiene las tablas, pero no tiene turnos ni cuentas. Las tres
cuentas de prueba se crean con un comando aparte (paso 11).

> **Entorno de demostración y desarrollo, no de producción.** No hay HTTPS y la aplicación
> solo se abre desde la misma computadora (127.0.0.1). No lo publiques en Internet así.

Requisitos: Windows 10 22H2 o Windows 11, 16 GB de RAM (alcanza holgado), Git, unos 5 GB libres
en disco y conexión a Internet la primera vez (para descargar las imágenes).

Todos los comandos son de **PowerShell** salvo que se indique otra cosa. Escribilos sin el
símbolo `>` y de a uno.

---

## 1. Instalar Docker Desktop

1. Descargá Docker Desktop para Windows desde https://www.docker.com/products/docker-desktop/
2. Ejecutá el instalador y dejá marcada la opción **Use WSL 2 instead of Hyper-V**.
3. Reiniciá Windows si te lo pide.
4. Abrí Docker Desktop y esperá a que abajo a la izquierda diga **Engine running**. La primera
   vez puede pedir aceptar los términos de uso.

Comprobá en PowerShell:

```powershell
docker --version
docker compose version
```

Si dice que `docker` no se reconoce, cerrá y volvé a abrir PowerShell.

## 2. Habilitar WSL2

Docker Desktop usa WSL2 para correr Linux. Abrí **PowerShell como administrador** (clic derecho →
Ejecutar como administrador):

```powershell
wsl --install --no-distribution
wsl --set-default-version 2
```

Reiniciá Windows si es la primera vez que se instala WSL. Después, en PowerShell normal:

```powershell
wsl --status
```

Tiene que decir que la versión predeterminada es la 2.

## 3. Instalar Ubuntu 24.04

```powershell
wsl --install -d Ubuntu-24.04
```

Se abre una ventana de Ubuntu que pide crear un usuario y una contraseña de Linux (son solo de
Ubuntu, no tienen nada que ver con MediControl). Después comprobá:

```powershell
wsl -l -v
```

`Ubuntu-24.04` tiene que figurar con `VERSION 2`.

En Docker Desktop: **Settings → Resources → WSL integration**, activá **Ubuntu-24.04** y tocá
**Apply & restart**. Así también podés usar `docker` desde la terminal de Ubuntu.

> Opcional, si la computadora se pone lenta: WSL2 puede usar hasta la mitad de la RAM. Para
> limitarlo, creá el archivo `C:\Users\<tu usuario>\.wslconfig` con este contenido y ejecutá
> `wsl --shutdown`:
>
> ```ini
> [wsl2]
> memory=6GB
> ```
>
> MediControl usa menos de 1 GB en total.

## 4. Clonar el repositorio

Elegí una carpeta (por ejemplo `Documentos`) y cloná:

```powershell
cd $HOME\Documents
git clone https://github.com/lusalvaGH/medicontrol.git
cd medicontrol
```

## 5. Cambiar a la rama de la migración

```powershell
git switch feature/migracion-nestjs
git log -1 --oneline
```

Desde acá, todos los comandos se ejecutan **dentro de la carpeta `medicontrol`**.

> ¿Preferís trabajar desde Ubuntu? Podés clonar ahí (`cd ~ && git clone ...`) y usar los mismos
> comandos `docker compose`. Lo único que cambia es la sección 6: en Ubuntu se copia con
> `cp .env.example .env` y se edita con `nano .env`.

## 6. Preparar las variables de entorno

Copiá el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

Generá tres valores al azar, uno para cada clave. Ejecutá esta línea **tres veces** y copiá cada
resultado:

```powershell
$b = New-Object byte[] 30; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
```

Abrí el archivo y pegá un valor distinto en cada una de estas tres líneas:

```powershell
notepad .env
```

```ini
MARIADB_PASSWORD=<primer valor>
MARIADB_ROOT_PASSWORD=<segundo valor>
SESSION_SECRET=<tercer valor>
```

Guardá y cerrá. Lo demás puede quedar como está. El `.env` no se sube a Git (está en
`.gitignore`): **no lo compartas ni lo subas**.

## 7. Construir los contenedores

```powershell
docker compose build
```

La primera vez tarda varios minutos: descarga las imágenes de Node, Nginx y MariaDB, instala
dependencias y compila el backend y el frontend.

## 8. Levantar MediControl

```powershell
docker compose up -d
```

Docker espera a que cada servicio esté sano antes de iniciar el siguiente: primero MariaDB
(que en el primer arranque crea la base y las tablas), después el backend (que antes de
arrancar aplica las migraciones pendientes del esquema) y por último el frontend. Puede tardar
un minuto. Mirá el estado con:

```powershell
docker compose ps
```

Los tres tienen que figurar como `running (healthy)` o `Up ... (healthy)`. Si alguno dice
`starting`, esperá unos segundos y repetí el comando.

## 9. Comprobar la conexión con MariaDB

La API informa si llega a la base:

```powershell
Invoke-RestMethod http://localhost:8080/api/health | ConvertTo-Json
```

Respuesta esperada: `"ok": true` y `"base_de_datos": "ok"`.

Para mirar la base por dentro (tablas creadas y cantidad de turnos):

```powershell
"SHOW TABLES; SELECT COUNT(*) AS turnos FROM turnos; SELECT COUNT(*) AS usuarios FROM usuarios;" | docker compose exec -T mariadb sh -c 'MYSQL_PWD=$MARIADB_PASSWORD mysql -u $MARIADB_USER $MARIADB_DATABASE'
```

En una instalación nueva tienen que aparecer 7 tablas (4 tablas y 3 vistas), 0 turnos y
0 usuarios.

## 10. Abrir el frontend

Entrá a http://localhost:8080 desde el navegador. Tiene que aparecer la pantalla de inicio de
sesión. Todavía no hay cuentas: seguí con el paso 11.

## 11. Crear las cuentas iniciales de prueba

Este paso se hace **una sola vez**, con los contenedores levantados:

```powershell
docker compose exec backend node scripts/crear-cuentas-iniciales.mjs
```

Crea tres cuentas con datos ficticios, una por rol, y muestra la contraseña de cada una:

| Rol           | Correo                  |
|---------------|-------------------------|
| Recepción     | `operador@medicore.com` |
| Médico        | `a.rossi@medicore.com`  |
| Paciente      | `m.fernandez@mail.com`  |

**Anotá las contraseñas en ese momento**: son al azar, no se guardan en ningún archivo y no se
vuelven a mostrar.

El comando es seguro de repetir: si la base ya tiene usuarios, pacientes, médicos o turnos, no
crea nada y avisa. No corre solo al reiniciar. Si perdiste las contraseñas, la única forma de
volver a generarlas es borrar el entorno (paso 14) y empezar de nuevo desde el paso 8.

Ahora podés iniciar sesión con cada rol:

- **Recepción**: registrar, modificar y cancelar turnos; ver la agenda en Día, Semana y Mes.
- **Médico**: ver su propia agenda.
- **Paciente**: ver sus turnos.

### Registrar un turno de prueba

1. Entrá como **recepción** (`operador@medicore.com`).
2. Tocá **Nuevo turno**.
3. En "Buscar paciente" escribí `fernandez`, tocá **Buscar** y elegí a Mateo Fernández.
4. Elegí el médico **Rossi, Alejandro · Cardiología**, una fecha futura y un horario libre.
5. Escribí un motivo y tocá **Registrar turno**.

El turno aparece en la agenda (Día, Semana y Mes). Si después entrás como **médico** o como
**paciente**, lo ves en su agenda o en "Mis turnos".

## 12. Detener los servicios

```powershell
docker compose stop
```

Los contenedores se detienen y **los datos quedan guardados** en el volumen
`medicontrol_datos_mariadb`. También podés usar `docker compose down`, que además borra los
contenedores (no los datos).

Cerrar Docker Desktop o apagar la computadora también detiene todo sin perder datos.

## 13. Volver a iniciar conservando los datos

Con Docker Desktop abierto:

```powershell
docker compose up -d
docker compose ps
```

Los turnos y las cuentas siguen ahí. Las sesiones abiertas sí se pierden al reiniciar el
backend: hay que volver a iniciar sesión (es lo esperado).

Para comprobarlo, repetí la consulta del paso 9: la cantidad de turnos y usuarios tiene que ser
la misma que antes de detener. También podés entrar como recepción y buscar el turno de prueba.

Si actualizaste el código (`git pull`), reconstruí antes de levantar:

```powershell
docker compose up -d --build
```

## 14. Eliminar el entorno local

**Borra todos los datos de MediControl en Docker** (turnos y cuentas de `medicontrol_local`).
No afecta ninguna otra base ni archivo de tu computadora.

```powershell
docker compose down -v --rmi local
```

- `-v` borra el volumen de la base.
- `--rmi local` borra las imágenes construidas para este proyecto (`medicontrol-backend` y
  `medicontrol-frontend`).

Las imágenes descargadas (Node, Nginx, MariaDB) quedan en caché; podés borrarlas desde Docker
Desktop → **Images** si necesitás espacio. Para volver a instalar, repetí desde el paso 7.

---

## Traer los datos de la versión PHP (opcional)

La base de Docker nace vacía. Para usar los usuarios, pacientes, médicos y turnos de la versión
PHP, en lugar del paso 11 se importan con la herramienta de migración, que conserva los
identificadores y verifica la copia. **No ejecutes el paso 11 antes:** la importación solo se
hace sobre una base vacía. El procedimiento completo, con respaldo y ensayo, está en
[migracion-datos.md](migracion-datos.md).

## Problemas habituales

### Puerto ocupado

Síntoma: `docker compose up` falla con `ports are not available` o `address already in use`
para el 8080.

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object LocalPort, OwningProcess
Get-Process -Id <número de OwningProcess>
```

Cerrá ese programa o usá otro puerto: en `.env` cambiá `FRONTEND_PUERTO=8081`, ejecutá
`docker compose up -d` y entrá a http://localhost:8081.

MariaDB y el backend no publican puertos en Windows, así que no chocan con un XAMPP o un MySQL
que tengas instalado.

### MariaDB no inicia

```powershell
docker compose ps
docker compose logs mariadb --tail 50
```

- `starting` durante el primer arranque es normal: la inicialización puede tardar hasta un
  minuto. Esperá y volvé a mirar.
- `Cannot connect to the Docker daemon` o `error during connect`: Docker Desktop no está
  abierto. Abrilo y esperá a que diga **Engine running**.
- Errores de InnoDB o de archivos: el volumen puede estar dañado. Si no tenés datos que
  conservar, borralo con `docker compose down -v` y levantá de nuevo.

### El backend no conecta a la base

```powershell
docker compose logs backend --tail 50
```

- `Faltan variables de entorno: ...`: falta una variable obligatoria (ver más abajo).
- `ABORTADO: Falló la migración …`: una migración del esquema no se pudo aplicar y el backend
  no arranca. Ver «Si una migración falla» en [migracion-datos.md](migracion-datos.md).
- `Access denied for user`: la contraseña de `.env` no coincide con la del volumen. Pasa si
  cambiaste `MARIADB_PASSWORD` después del primer arranque (ver "Volumen con datos anteriores").
- `ECONNREFUSED` o `ENOTFOUND mariadb`: MariaDB no está disponible. Revisá la sección
  anterior; en cuanto la base vuelve a responder, el backend se reconecta solo (`/api/health`
  pasa de 503 a 200).

### El frontend no conecta al backend

Síntoma: la página carga pero al iniciar sesión aparece un error, o
`http://localhost:8080/api/health` responde **502 Bad Gateway**.

```powershell
docker compose ps
docker compose logs backend --tail 50
docker compose logs frontend --tail 50
```

El frontend espera a que el backend esté sano. Si el backend se cayó, el 502 desaparece en
cuanto vuelve. Si la página entera no abre, revisá que el frontend esté `healthy` y que estés
usando el puerto de `FRONTEND_PUERTO`. Si `http://localhost:8080` no responde pero el
frontend está sano, probá con `http://127.0.0.1:8080` (el puerto se publica solo en esa
dirección).

### Variables de entorno faltantes

Síntoma: `docker compose up` se detiene con
`required variable MARIADB_PASSWORD is missing a value: Falta MARIADB_PASSWORD en .env`.

- Comprobá que el archivo se llame exactamente `.env` (no `.env.txt`) y esté en la raíz del
  repositorio, al lado de `compose.yaml`: `Get-ChildItem -Force .env`.
- Comprobá que las tres claves obligatorias tengan valor.
- `SESSION_SECRET` necesita al menos 32 caracteres; si es más corto, el backend no arranca y lo
  dice en `docker compose logs backend`.

### Volumen con datos anteriores

MariaDB crea la base, el usuario y las tablas **solo la primera vez**, cuando el volumen está
vacío. Después, aunque cambies `.env` o el esquema, sigue usando lo que ya estaba guardado.

Síntomas: `Access denied` después de cambiar contraseñas en `.env`, o el script de cuentas dice
que la base ya tiene usuarios.

Si no necesitás conservar esos datos, empezá de cero (borra turnos y cuentas de Docker):

```powershell
docker compose down -v
docker compose up -d
docker compose exec backend node scripts/crear-cuentas-iniciales.mjs
```

Si sí necesitás los datos, volvé a poner en `.env` las contraseñas con que se creó el volumen.

### Contenedores detenidos

```powershell
docker compose ps -a
docker compose up -d
```

Los servicios tienen `restart: unless-stopped`: si se caen, Docker los vuelve a iniciar, y
arrancan solos al abrir Docker Desktop salvo que los hayas detenido con `docker compose stop`.
Si uno se reinicia una y otra vez, mirá sus logs con `docker compose logs <servicio>`.

### El inicio de sesión queda bloqueado

Después de 5 contraseñas incorrectas para el mismo correo (o 20 en total), el inicio de sesión
se bloquea 15 minutos. Para desbloquearlo antes:

```powershell
docker compose restart backend
```

Esto también cierra todas las sesiones abiertas.

---

## Referencia rápida

| Acción                          | Comando                                                        |
|---------------------------------|----------------------------------------------------------------|
| Levantar                        | `docker compose up -d`                                         |
| Ver estado                      | `docker compose ps`                                            |
| Ver logs de un servicio         | `docker compose logs backend --tail 50`                        |
| Comprobar la API y la base      | `Invoke-RestMethod http://localhost:8080/api/health`           |
| Crear cuentas (una vez)         | `docker compose exec backend node scripts/crear-cuentas-iniciales.mjs` |
| Detener sin perder datos        | `docker compose stop`                                          |
| Reconstruir tras `git pull`     | `docker compose up -d --build`                                 |
| Borrar todo (datos incluidos)   | `docker compose down -v --rmi local`                           |

Archivos de la configuración:

- `compose.yaml`: los tres servicios, el volumen y la red interna.
- `.env.example`: variables, con explicación de cada una.
- `docker/mariadb/01-esquema.sql`: tablas, índices y vistas (copia sin datos de
  `database/medicontrol.sql`).
- `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`.
- `backend/scripts/crear-cuentas-iniciales.mjs`: el comando del paso 11.

La versión PHP original (XAMPP) sigue en el repositorio y no la usa este entorno.
