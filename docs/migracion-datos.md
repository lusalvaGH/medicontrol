# Migración de la base de datos (PHP → NestJS)

Cómo se versiona el esquema de MediControl NestJS y cómo se trasladan los datos de la versión PHP
sin perder información. La versión PHP y su base `medicontrol_db` **no se modifican nunca**: la
migración solo las lee.

## 1. Punto de partida

La base de la versión PHP y la de NestJS tienen **el mismo esquema inicial**: 4 tablas
(`usuarios`, `pacientes`, `medicos` y `turnos`) y 3 vistas. Es el que define
`docker/mariadb/01-esquema.sql`, copia sin datos de `database/medicontrol.sql`.

Sobre ese esquema inicial se aplican las **migraciones versionadas** de `backend/migraciones/`:

| Versión | Archivo | Qué cambia |
|---|---|---|
| 001 | `001_turnos_liberar_cancelados.sql` | Columna calculada `turnos.ocupa_horario` (1 si el turno está vigente, `NULL` si está cancelado). Reemplaza el índice único `uk_medico_fecha_hora` por `uk_medico_horario_activo` y agrega `uk_paciente_horario_activo`. Así un turno cancelado **libera su horario**, y un paciente **no puede tener dos turnos vigentes a la misma hora**, ni siquiera con médicos distintos |
| 002 | `002_usuarios_cambio_contrasena.sql` | Columna `usuarios.debe_cambiar_contrasena` (0 por defecto). Marca las contraseñas provisorias, que hay que cambiar antes de usar el sistema |

Ninguna migración borra datos. Todas usan `IF EXISTS` / `IF NOT EXISTS`, así que se pueden repetir.

## 2. Bases protegidas y bases permitidas

Las herramientas de migración, de importación y de preparación de bases **se niegan** a modificar:

- `medicontrol_db`: la base original de la versión PHP;
- `medicontrol_test` y `medicontrol_demo`: bases locales existentes.

Solo trabajan sobre:
- `medicontrol_local` (Docker);
- `medicontrol_produccion`;
- `medicontrol_ensayo_<sufijo>` (ensayos);
- `medicontrol_test_<sufijo>` (pruebas automáticas).

La regla está en `backend/src/migraciones/bases.ts` y tiene pruebas.

## 3. Migraciones versionadas

### Cómo funcionan

- La tabla `schema_migraciones` registra la versión, el nombre, la huella SHA-256 del archivo, la fecha y la duración de cada migración aplicada.
- Las pendientes se aplican **en orden y una sola vez**, con un candado (`GET_LOCK`) para que dos ejecuciones no se pisen.
- Si una migración aplicada **se edita** después, el ejecutor se detiene: los cambios nuevos van siempre en una migración nueva.
- Si la base tiene migraciones que el código no conoce (base más nueva que el código), también se detiene.
- Un error se guarda en `schema_migraciones_errores`, con la sentencia que falló y el mensaje, y la ejecución se detiene.
- El backend comprueba la versión del esquema: si faltan migraciones, `/api/health` responde **503 `ESQUEMA_DESACTUALIZADO`**.

### Comandos

Desde `backend/`, con las variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`:

```bash
npm run build
```

Ver el estado (no modifica nada):

```bash
npm run migraciones
```

Aplicar las pendientes:

```bash
npm run migraciones:aplicar
```

**En Docker se aplican solas:** el contenedor `backend` ejecuta `node dist/migraciones/cli.js --aplicar` antes de iniciar la API. Si una migración falla, el contenedor no arranca y el motivo aparece en `docker compose logs backend`.

### Agregar una migración nueva

1. Crear `backend/migraciones/NNN_descripcion.sql` con el número siguiente (minúsculas, números y `_`).
2. Escribirla para que se pueda repetir (`IF EXISTS` / `IF NOT EXISTS`) y sin borrar datos.
3. Subir `VERSION_ESQUEMA_REQUERIDA` en `backend/src/migraciones/migraciones.ts`.
4. Correr las pruebas: `migraciones.spec.ts` comprueba la numeración y las reglas.

### Si una migración falla

MariaDB no deshace un `ALTER TABLE` dentro de una transacción. Por eso cada migración se puede repetir:

1. Leer el error: `SELECT * FROM schema_migraciones_errores ORDER BY id DESC LIMIT 1;`
2. Corregir la causa en la base. Por ejemplo, si la 001 falla porque un paciente tiene dos turnos vigentes a la misma hora, cancelar o reprogramar uno de ellos.
3. Volver a ejecutar `npm run migraciones:aplicar` (o reiniciar el contenedor `backend`). Lo que ya se había aplicado se saltea por los `IF NOT EXISTS`.
4. Si hay que volver atrás: restaurar el respaldo tomado antes de migrar (sección 6).

## 4. Fuentes de datos encontradas

| Fuente | Qué es | Usuarios | Médicos | Pacientes | Turnos |
|---|---|---:|---:|---:|---:|
| `medicontrol_db` (XAMPP) | Base en uso de la versión PHP. **Fuente original.** Leída el 09/11/2026: idéntica al respaldo del 28/10 | 12 | 4 | 6 | 15 |
| `Desktop\MediControl_respaldo\base_de_datos\medicontrol_db.sql` | Volcado de `medicontrol_db` del 28/10/2026 (rama `main`, commit `2285e40`) | 12 | 4 | 6 | 15 |
| `Desktop\entrega_companero\medicontrol_companero.sql` | Base de demostración preparada para otro integrante (datos ficticios) | 12 | 4 | 6 | 21 |
| `medicontrol_test` | Base local de pruebas, limpiada para la presentación | 13 | 4 | 7 | 0 |

Controles hechos con el importador en modo ensayo (sin escribir nada), sobre los dos volcados:

- No hay identificadores, correos ni DNI repetidos.
- No hay perfiles huérfanos ni con el rol equivocado.
- No hay turnos con un paciente o médico inexistente.
- No hay turnos fuera de la grilla de horarios.
- No hay superposiciones.
- Todos los hashes son bcrypt `$2y$10$`, compatibles con el login de NestJS.
- **Las 12 cuentas de cada volcado usan la contraseña de demostración publicada en el README**, con el mismo hash.
- **Turnos pasados que siguen abiertos** (pendientes, confirmados o en curso): 13 en el respaldo y 12 en la exportación del compañero.

**La fuente correcta es `medicontrol_db` en vivo.** El respaldo del 28/10 sirve solo si se confirma que no hubo cambios después. La exportación del compañero y `medicontrol_test` son bases de demostración o de prueba, no la fuente original.

## 5. Importación de datos de PHP

`backend/src/importacion/cli.ts` (`npm run importar-php`) traslada usuarios, médicos, pacientes y turnos.

**Garantías:**
- **Solo lee el origen:**
  - un volcado se lee como texto y nunca se ejecuta, así que su `CREATE DATABASE medicontrol_db` y su `USE` no tienen efecto;
  - una base se lee en una transacción `READ ONLY`.
- **Conserva los identificadores originales** (`id_usuario`, `id_medico`, `id_paciente` e `id_turno`) y con ellos todas las relaciones, además de las fechas, horas, estados, notas médicas y hashes de contraseña.
- **El destino tiene que ser una base permitida, con las migraciones al día y con las 4 tablas vacías.** Nunca mezcla ni sobrescribe datos.
- **Antes de escribir controla el origen.** Los errores impiden importar y no corrige nada solo, para no inventar datos. Bloquean:
  - repetidos;
  - relaciones colgadas;
  - valores fuera del esquema;
  - superposiciones de médico o de paciente.

  Los avisos, en cambio, solo se informan:
  - turnos pasados abiertos;
  - usuarios sin perfil;
  - DNI con otro formato.
- **Todo se inserta en una transacción.** Antes de confirmarla compara la cantidad y la huella SHA-256 de cada tabla entre origen y destino, y busca relaciones colgadas. Si algo no coincide, deshace todo y el destino queda vacío.
- **Contraseñas de demostración:** si encuentra cuentas con la contraseña publicada, no importa nada hasta que se indique `--contrasenas-demo=reemplazar` (recomendado) o `--contrasenas-demo=conservar`.
  - Con `reemplazar`, cada una recibe una contraseña provisoria al azar de 16 caracteres y queda obligada a cambiarla al entrar.
  - Las contraseñas **nunca se muestran en la consola**. Se guardan en el archivo de `--archivo-contrasenas`, que tiene que ser una ruta absoluta, nueva y **fuera del repositorio**. El importador lo crea legible solo por el usuario que lo ejecuta: en Windows quita la herencia de permisos, y también a SYSTEM y Administradores; en Linux usa el modo 600.
  - Si el archivo no se puede guardar, no se confirma nada.
- **Solo cuentas (`--solo-cuentas`):** migra usuarios y perfiles de médicos y pacientes con sus identificadores, y deja afuera los turnos y sus notas. Con `--sin-inactivos` tampoco migra las cuentas dadas de baja. `--listar-cuentas` muestra antes qué cuentas se migrarían.
- **El informe no muestra datos personales:** solo cantidades y huellas. Con `--listar-cuentas` muestra también el correo, el rol y el perfil de cada cuenta, para revisarlas antes de importar.

### Procedimiento recomendado

1. **Congelar el origen:** detener Apache (la versión PHP) para que nadie escriba durante la migración.
2. **Respaldar el origen** (sección 6) y guardar su SHA-256.
3. **Ensayo sin escribir:**
   ```bash
   node dist/importacion/cli.js --base-origen medicontrol_db --ensayo --solo-cuentas --listar-cuentas --contrasenas-demo=reemplazar
   ```
   Con un volcado, `--volcado ruta.sql` en lugar de `--base-origen`. Si hay errores, resolverlos **en el origen**, con criterio de negocio, y repetir.
4. **Ensayo completo en una base descartable:**
   ```bash
   DB_NAME=medicontrol_ensayo_php npm run preparar-base
   ```
   ```bash
   DB_NAME=medicontrol_ensayo_php node dist/importacion/cli.js --base-origen medicontrol_db --solo-cuentas --contrasenas-demo=reemplazar --archivo-contrasenas C:/ruta/fuera/del/repo/ensayo.txt
   ```
   Después, levantar el backend contra `medicontrol_ensayo_php` y hacer las pruebas de la sección 7.
5. **Importación real**, en la base definitiva vacía y migrada, **sin ejecutar** `crear-cuentas-iniciales.mjs`.
   - Sin Docker (MariaDB local): primero crear la base vacía y después importar:
     ```bash
     DB_NAME=medicontrol_local npm run preparar-base -- --definitiva
     ```
     ```bash
     DB_NAME=medicontrol_local node dist/importacion/cli.js --base-origen medicontrol_db --solo-cuentas --contrasenas-demo=reemplazar --archivo-contrasenas C:/Users/<usuario>/Documents/medicontrol_contrasenas_provisorias.txt
     ```
   - En Docker, la base `medicontrol_local` se crea y migra sola, y el archivo de contraseñas se genera dentro del contenedor:
     ```bash
     docker compose cp medicontrol_db.sql backend:/tmp/medicontrol_db.sql
     ```
     ```bash
     docker compose exec backend node dist/importacion/cli.js --volcado /tmp/medicontrol_db.sql --solo-cuentas --contrasenas-demo=reemplazar --archivo-contrasenas /tmp/contrasenas.txt
     ```
     Después se copia afuera con `docker compose cp backend:/tmp/contrasenas.txt <carpeta privada>` y se borra del contenedor.
6. **Entregar las contraseñas provisorias** del archivo por un medio seguro y borrar el archivo. Cada persona elige su contraseña al entrar.

## 6. Respaldo y recuperación

**Antes de cualquier migración:**
- volcado lógico completo del origen:
  ```bash
  mysqldump -u root --single-transaction --routines --triggers --events --default-character-set=utf8mb4 --databases medicontrol_db > medicontrol_db_AAAAMMDD.sql
  ```
- y, si es posible, una copia en frío de la carpeta `mysql/data` con MariaDB detenido.

Guardar el SHA-256 de cada archivo fuera del repositorio. **No subir los respaldos a Git:** contienen datos personales.

**Si la importación falla:** el destino queda vacío, porque todo ocurre en una transacción. Se corrige la causa y se repite.

**Si hay que descartar una base de destino ya importada:**
- se borra esa base (solo destinos permitidos, nunca `medicontrol_db`);
- en Docker: `docker compose down -v` borra **solo** `medicontrol_local`;
- después se repite desde el paso 4 o 5 del procedimiento.

**Para volver a la versión PHP:** `medicontrol_db` sigue intacta, así que alcanza con volver a usar Apache.

**Respaldos de la base nueva:** la columna `ocupa_horario` es calculada. Al restaurar un volcado de la base nueva, verificar en el ensayo que MariaDB acepte los `INSERT` del volcado. Si no los acepta, exportar con el importador (`--base-origen`), que usa columnas explícitas.

## 7. Verificación de una migración

El importador ya verifica, dentro de la transacción:
- las cantidades por tabla;
- la huella SHA-256 de cada tabla;
- las relaciones colgadas.

Además conviene comprobar:

1. **Integridad** (cada consulta tiene que dar 0):
   ```sql
   SELECT COUNT(*) FROM turnos t LEFT JOIN pacientes p USING (id_paciente) WHERE p.id_paciente IS NULL;
   SELECT COUNT(*) FROM turnos t LEFT JOIN medicos m USING (id_medico) WHERE m.id_medico IS NULL;
   SELECT COUNT(*) FROM usuarios u LEFT JOIN pacientes p USING (id_usuario) WHERE u.rol = 'paciente' AND p.id_paciente IS NULL;
   SELECT COUNT(*) FROM usuarios u LEFT JOIN medicos m USING (id_usuario) WHERE u.rol = 'medico' AND m.id_medico IS NULL;
   ```
2. **Esquema:** `SELECT MAX(version) FROM schema_migraciones;` tiene que dar la versión requerida (hoy, 2), y `/api/health` tiene que responder 200.
3. **Funcional, con NestJS:**
   - login de una cuenta de cada rol (con su contraseña provisoria, que obliga a cambiarla);
   - la agenda de recepción de un día con turnos conocidos;
   - la agenda del médico;
   - "Mis turnos" del paciente.
4. **Comparación con PHP:** el mismo día en la versión PHP (sobre `medicontrol_db`) y en NestJS tiene que mostrar los mismos turnos.

## 8. Estado

| Tarea | Estado |
|---|---|
| Migraciones 001 y 002 y su ejecutor | Aplicadas sobre MariaDB 10.4.32 (09/11/2026), y repetidas sin efectos |
| Lectura de `medicontrol_db` en vivo | Hecha en solo lectura: 12 cuentas, 4 médicos, 6 pacientes y 15 turnos de muestra; idéntica al respaldo del 28/10. Huellas sin cambios |
| Pruebas de integración en `medicontrol_test_ci` | 205 de 205 |
| Ensayo `medicontrol_ensayo_cuentas` (12 cuentas, sin turnos) | Importación verificada. Recorrido de los tres roles: 56 de 56 comprobaciones |
| Base definitiva `medicontrol_local` (MariaDB local) | 12 cuentas con sus perfiles e identificadores, 0 turnos, contraseñas provisorias con cambio obligatorio. Las 12 inician sesión |
| Docker | Sin probar |
