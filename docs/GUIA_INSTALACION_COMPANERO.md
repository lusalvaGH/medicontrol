# Guía rápida de instalación de MediControl (Windows)

Esta guía te lleva desde cero hasta tener MediControl funcionando en tu computadora, con los
tres roles (recepción, médico y paciente). Calculá unos 30 a 45 minutos, la mayor parte
esperando descargas.

Si algo no coincide con lo que ves, la guía detallada está en
[instalacion-docker.md](instalacion-docker.md).

> Esto es un entorno de **demostración y desarrollo**. MediControl queda disponible solo en tu
> computadora (http://localhost:8080) y no se publica en Internet.

---

## 1. Qué tenés que instalar y qué hace Docker solo

### Programas que instalás vos

| Programa | ¿Lo tenés? | Para qué sirve | Descarga oficial |
|---|---|---|---|
| **Docker Desktop** | **Hay que instalarlo** | Ejecuta MediControl completo | https://www.docker.com/products/docker-desktop/ |
| **WSL 2** | **Hay que activarlo** (viene con Windows) | Docker lo necesita para correr Linux | https://learn.microsoft.com/es-es/windows/wsl/install |
| Git | Ya lo tenés | Descargar el proyecto | https://git-scm.com/downloads |
| Visual Studio Code | Ya lo tenés | Editar el archivo `.env` (opcional: también sirve el Bloc de notas) | https://code.visualstudio.com/ |

Requisitos de Docker Desktop para Windows:
https://docs.docker.com/desktop/setup/install/windows-install/

**Node.js no hace falta** para esta instalación: Docker trae su propia versión adentro de los
contenedores. Podés tenerlo instalado sin problema; no se usa.

### Lo que Docker descarga y configura solo (no instales nada de esto)

| Componente | Versión | Qué hace |
|---|---|---|
| MariaDB | 10.4.32 | Base de datos `medicontrol_local`, nueva y vacía |
| Node.js (dentro del contenedor) | 24.22.2 | Compila y ejecuta el backend NestJS y compila el frontend React |
| Nginx | 1.30.6 | Sirve la página y le pasa las consultas al backend |
| Dependencias npm | Las del proyecto | Se instalan dentro de las imágenes |

**No necesitás XAMPP, MySQL ni phpMyAdmin.** Si los tenés, no molestan: el MariaDB de Docker no
usa el puerto 3306 de tu computadora.

---

## 2. Instalar Docker Desktop y WSL 2

### 2.1. Activar WSL 2

1. Abrí **PowerShell como administrador**: menú Inicio → escribí `PowerShell` → clic derecho →
   **Ejecutar como administrador**.
2. Ejecutá:

   ```powershell
   wsl --install --no-distribution
   ```

3. **Reiniciá Windows** si te lo pide.
4. Después del reinicio, en PowerShell (normal, no hace falta administrador):

   ```powershell
   wsl --set-default-version 2
   wsl --status
   ```

   Tiene que decir que la versión predeterminada es **2**.

### 2.2. Instalar Docker Desktop

1. Descargá **Docker Desktop for Windows** desde https://www.docker.com/products/docker-desktop/
2. Ejecutá el instalador. Dejá marcada la opción **Use WSL 2 instead of Hyper-V** (puede
   aparecer como "Use WSL 2 based engine").
3. Reiniciá Windows si te lo pide.
4. Abrí **Docker Desktop** desde el menú Inicio. Aceptá los términos la primera vez. No hace
   falta crear una cuenta: podés saltear el inicio de sesión.
5. Esperá a que abajo a la izquierda diga **Engine running** (en verde).

### 2.3. Comprobar que Docker funciona

Abrí una **PowerShell nueva** y ejecutá:

```powershell
docker --version
docker compose version
docker run --rm hello-world
```

Si el último comando muestra **Hello from Docker!**, Docker funciona. Si `docker` no se
reconoce, cerrá PowerShell, abrila de nuevo y comprobá que Docker Desktop esté abierto.

---

## 3. Descargar el proyecto

Elegí dónde guardarlo (en este ejemplo, `Documentos`) y descargá directamente la rama de la
migración:

```powershell
cd $HOME\Documents
git clone --branch feature/migracion-nestjs https://github.com/lusalvaGH/medicontrol.git
cd medicontrol
```

Comprobá que estás en la rama correcta y que están los archivos de Docker:

```powershell
git branch --show-current
Test-Path compose.yaml, .env.example
```

Tiene que mostrar `feature/migracion-nestjs` y dos veces `True`.

> Si `git clone` dice `Remote branch feature/migracion-nestjs not found`, o `Test-Path`
> muestra `False`, la rama todavía no está publicada en GitHub con estos archivos. Avisale a
> quien te pasó la guía.

**Desde acá, todos los comandos se ejecutan en PowerShell, dentro de la carpeta `medicontrol`.**
Si cerrás la ventana, volvé a entrar con `cd $HOME\Documents\medicontrol`.

También podés abrir la carpeta en VS Code (`code .`) y usar su terminal (**Terminal → New
Terminal**), que por defecto es PowerShell.

---

## 4. Configurar las variables de entorno

MediControl necesita tres claves secretas que vas a inventar vos. No existen todavía: cada
instalación tiene las suyas.

1. Creá tu archivo `.env` a partir del ejemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Generá un valor al azar. Ejecutá esta línea **tres veces** y copiá cada resultado (son
   distintos cada vez):

   ```powershell
   $b = New-Object byte[] 30; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
   ```

3. Abrí el archivo:

   ```powershell
   code .env
   ```

   (o `notepad .env` si preferís el Bloc de notas)

4. Pegá un valor distinto después del `=` en cada una de estas tres líneas:

   ```ini
   MARIADB_PASSWORD=<pegá el primer valor>
   MARIADB_ROOT_PASSWORD=<pegá el segundo valor>
   SESSION_SECRET=<pegá el tercer valor>
   ```

   Sin espacios ni comillas. El resto del archivo dejalo como está.

5. Guardá y cerrá.

> El archivo `.env` es solo tuyo: Git lo ignora y **no se tiene que subir ni compartir**.

---

## 5. Iniciar MediControl

Con Docker Desktop abierto (**Engine running**):

```powershell
docker compose up -d --build
```

La primera vez tarda varios minutos: descarga MariaDB, Node.js y Nginx, instala dependencias
y compila el proyecto. Las siguientes veces es mucho más rápido.

Comprobá el estado:

```powershell
docker compose ps
```

Tienen que aparecer **tres servicios**: `mariadb`, `backend` y `frontend`, los tres con
**(healthy)**. Si alguno dice `starting`, esperá 30 segundos y repetí el comando.

Comprobá que la aplicación llega a la base de datos:

```powershell
Invoke-RestMethod http://localhost:8080/api/health | ConvertTo-Json
```

Tiene que mostrar `"ok": true` y `"base_de_datos": "ok"`.

---

## 6. Acceder al sistema

Abrí el navegador en:

**http://localhost:8080**

Tiene que aparecer la pantalla de inicio de sesión de MediControl. Todavía no podés entrar
porque la base está vacía: seguí con el paso 7.

---

## 7. Crear las cuentas iniciales

Ejecutá **una sola vez**:

```powershell
docker compose exec backend node scripts/crear-cuentas-iniciales.mjs
```

El comando crea tres cuentas de prueba con datos ficticios y muestra una contraseña al azar
para cada una:

| Rol | Correo |
|---|---|
| Recepción | `operador@medicore.com` |
| Médico | `a.rossi@medicore.com` |
| Paciente | `m.fernandez@mail.com` |

**Copiá las tres contraseñas en ese momento** (por ejemplo, en un archivo de texto que no
subas a Git). No se guardan en ningún lado y no se vuelven a mostrar.

Si lo ejecutás otra vez, no crea nada y avisa que la base ya tiene datos. Es normal.

---

## 8. Comprobar los tres roles

Usá las contraseñas del paso 7. Para cambiar de rol, tocá **Cerrar sesión** arriba a la
derecha.

### Recepción (`operador@medicore.com`)

1. Al entrar se ve la **Agenda** del día, con las pestañas **Día**, **Semana** y **Mes**.
2. Tocá **Pacientes**: aparece Mateo Fernández.
3. Tocá **Médicos**: aparecen Alejandro Rossi y Elena Martínez.
4. Registrá un turno:
   1. Tocá **Nuevo turno**.
   2. En "Buscar paciente" escribí `fernandez`, tocá **Buscar** y elegí a **Mateo Fernández**.
   3. Elegí el médico **Rossi, Alejandro · Cardiología**.
   4. Elegí una **fecha futura** y un horario libre.
   5. Escribí un motivo (por ejemplo, `Control`) y tocá **Registrar turno**.
5. Aparece el aviso **Turno registrado** y el turno se ve en la agenda. Revisalo también en
   **Semana** y **Mes**.

### Médico (`a.rossi@medicore.com`)

1. Al entrar se ve **Mi agenda**.
2. Elegí la fecha del turno que registraste: tiene que aparecer, con los datos del paciente.
3. Probá abrir http://localhost:8080/recepcion/agenda: te tiene que devolver a tu agenda (el
   médico no puede entrar a recepción).

### Paciente (`m.fernandez@mail.com`)

1. Al entrar se ve **Mis turnos**.
2. El turno registrado aparece en **Próximos**.
3. Probá abrir http://localhost:8080/recepcion/agenda: te tiene que devolver a tus turnos.

Si los tres roles funcionan, MediControl está instalado correctamente.

---

## 9. Detener y volver a iniciar sin perder datos

### Detener

```powershell
docker compose stop
```

Los datos (cuentas y turnos) quedan guardados. También se conservan si cerrás Docker Desktop o
apagás la computadora.

### Volver a iniciar

1. Abrí Docker Desktop y esperá **Engine running**.
2. En PowerShell, dentro de la carpeta `medicontrol`:

   ```powershell
   docker compose up -d
   docker compose ps
   ```

3. Entrá a http://localhost:8080 e iniciá sesión de nuevo (las sesiones abiertas se cierran
   al reiniciar; las cuentas y los turnos siguen ahí).

### Comprobar que los datos se conservaron

```powershell
"SELECT COUNT(*) AS usuarios FROM usuarios; SELECT COUNT(*) AS turnos FROM turnos;" | docker compose exec -T mariadb sh -c 'MYSQL_PWD=$MARIADB_PASSWORD mysql -u $MARIADB_USER $MARIADB_DATABASE'
```

Tiene que mostrar 3 usuarios y la misma cantidad de turnos que antes de detener.

### Comandos que BORRAN los datos (usalos solo si querés empezar de cero)

```powershell
docker compose down -v
```

La opción **`-v` borra la base de datos de MediControl** (cuentas y turnos). Sin `-v`,
`docker compose down` es seguro: borra los contenedores pero conserva los datos.

Después de borrar, para empezar de nuevo: `docker compose up -d --build` y otra vez el paso 7.

---

## 10. Errores frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `docker` no se reconoce como comando | PowerShell se abrió antes de instalar Docker | Cerrá y abrí PowerShell de nuevo |
| `error during connect` o `Cannot connect to the Docker daemon` | Docker Desktop no está abierto | Abrilo y esperá **Engine running** |
| Docker Desktop dice que falta WSL o que hay que actualizarlo | WSL 2 no está activo o está desactualizado | En PowerShell como administrador: `wsl --update` y reiniciá |
| Docker Desktop dice que la virtualización está desactivada | La virtualización está apagada en la BIOS/UEFI | Activá "Intel VT-x" o "AMD-V/SVM" en la BIOS (buscá el modelo de tu PC) y reiniciá |
| `required variable MARIADB_PASSWORD is missing a value` (o `SESSION_SECRET`) | Falta el `.env` o una clave está vacía | Revisá el paso 4. Comprobá que exista con `Test-Path .env` (tiene que dar `True`) |
| El archivo se guardó como `.env.txt` | El Bloc de notas agregó la extensión | `Rename-Item .env.txt .env` |
| `ports are not available` o `address already in use` en el 8080 | Otro programa usa el puerto 8080 | En `.env` cambiá `FRONTEND_PUERTO=8081`, ejecutá `docker compose up -d` y entrá a http://localhost:8081 |
| Un servicio queda en `starting` o `unhealthy` | Todavía está arrancando o tiene un error | Esperá un minuto. Si sigue igual: `docker compose logs mariadb --tail 50` (o `backend`, `frontend`) |
| `Access denied for user` en los logs del backend | Cambiaste las claves de `.env` después del primer arranque | Volvé a poner las claves originales, o empezá de cero con `docker compose down -v` (borra los datos) |
| http://localhost:8080 responde **502 Bad Gateway** | El backend no está listo o se detuvo | `docker compose ps` y `docker compose logs backend --tail 50`. Suele resolverse solo en unos segundos |
| http://localhost:8080 no abre pero los servicios están `healthy` | El navegador no resuelve `localhost` | Probá con http://127.0.0.1:8080 |
| El script de cuentas dice que la base ya tiene registros | Las cuentas ya se crearon antes | Usá las contraseñas que anotaste. Si las perdiste: `docker compose down -v` (borra todo), `docker compose up -d` y el paso 7 otra vez |
| No puedo iniciar sesión después de varios intentos | Después de 5 contraseñas incorrectas, el login se bloquea 15 minutos | Esperá, o ejecutá `docker compose restart backend` |
| La computadora se pone muy lenta | WSL 2 usa mucha memoria | Seguí la nota sobre `.wslconfig` de la sección 3 de [instalacion-docker.md](instalacion-docker.md) |

Si un error no está en la tabla, guardá la salida de estos comandos para quien te ayude:

```powershell
docker compose ps
docker compose logs --tail 80
```

Revisá que no aparezcan contraseñas antes de compartir esa salida.

---

## Resumen de comandos

```powershell
# Una sola vez
git clone --branch feature/migracion-nestjs https://github.com/lusalvaGH/medicontrol.git
cd medicontrol
Copy-Item .env.example .env          # y completar las 3 claves
docker compose up -d --build
docker compose exec backend node scripts/crear-cuentas-iniciales.mjs

# Uso diario
docker compose up -d                 # iniciar
docker compose ps                    # ver estado
docker compose stop                  # detener (conserva los datos)
```

Abrir: **http://localhost:8080**
