# MEDICONTROL: migración a NestJS

**Rama:** `feature/migracion-nestjs`, creada desde `main` (`522472d`).
**Regla principal:** la versión PHP + Apache no se modifica y sigue siendo el respaldo funcional hasta que la nueva versión esté verificada.

## Estado por etapa

| Etapa | Estado | Qué quedó funcionando |
|---|---|---|
| 0. Node.js | Terminada (03/11/2026) | Node.js 24.22.2 LTS portable en la carpeta de herramientas del usuario, con SHA-256 y firma verificadas |
| 1. Backend base | Terminada (03/11/2026) | NestJS 11 con TypeScript 6, configuración por variables de entorno, conexión propia a MariaDB con `mysql2`, formato de respuestas `{ok, data, error}` y `GET /api/health` |
| 2. Reglas de negocio | Terminada (03/11/2026) | Reglas de turnos, disponibilidad, estados y transiciones, fechas y horarios, validaciones de personas y política de contraseñas en `backend/src/reglas/`. Mismos casos que `tests/turnos_reglas_test.php` y comparación directa con el PHP: 6347 casos, 0 diferencias |
| 3. Autenticación | Pendiente | |
| 4. Usuarios y cuenta | Pendiente | |
| 5. Turnos | Pendiente | |
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
