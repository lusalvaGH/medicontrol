# 🏥 MediControl - Sistema de Gestión Hospitalaria y Turnos

Sistema web para gestión hospitalaria, administración de turnos médicos y control de acceso basado en roles (**RBAC**): **Recepcionista**, **Médico** y **Paciente**.

Desarrollado con **PHP 8+**, **MySQL / MariaDB (PDO)** y diseño responsive moderno sin dependencias pesadas.

---

## 🚀 Requisitos Previos

* **XAMPP** (con **PHP 8.0+** y **MySQL / MariaDB**) descargable desde [apachefriends.org](https://www.apachefriends.org/).

---

## ⚡ Guía de Instalación Rápida (3 Pasos)

### Paso 1: Ubicar el proyecto en XAMPP

Cloná o copiá la carpeta del proyecto dentro del directorio `htdocs` de XAMPP:

* **Windows:** `C:\xampp\htdocs\medicontrol`
* **macOS:** `/Applications/XAMPP/xamppfiles/htdocs/medicontrol`
* **Linux:** `/opt/lampp/htdocs/medicontrol`

```bash
cd C:\xampp\htdocs
git clone https://github.com/tu-usuario/medicontrol.git
```

---

### Paso 2: Iniciar XAMPP y crear la Base de Datos

1. Abrí el **Panel de Control de XAMPP**.
2. Hacé clic en **Start** en los módulos **Apache** y **MySQL**.
3. Creá e inicializá la base de datos eligiendo **UNA** de las siguientes 2 opciones sencillas:

#### Opción A (Recomendada - 1 solo clic en el navegador):
Abrí en tu navegador:
👉 **`http://localhost/medicontrol/instalar.php`**
Hacé clic en **"🚀 Instalar / Inicializar Base de Datos"**. ¡Listo!

#### Opción B (Desde phpMyAdmin):
1. Entrá a `http://localhost/phpmyadmin/`.
2. Hacé clic en la pestaña **Importar** (arriba).
3. Seleccioná el archivo `database/medicontrol.sql` de la carpeta del proyecto y hacé clic en **Importar**.

---

### Paso 3: Abrir MediControl

Abrí en tu navegador:
👉 **`http://localhost/medicontrol/login.php`**

*(O también podés verificar el estado de la conexión en `http://localhost/medicontrol/test_conexion.php`)*

---

## 🔑 Cuentas de Acceso para Pruebas

Todas las cuentas de prueba tienen la misma contraseña:

> **Contraseña:** `123456`

| Rol | Correo Electrónico | Contraseña | Panel que atiende |
| :--- | :--- | :--- | :--- |
| 🧑‍💼 **Recepcionista** | `operador@medicore.com` | `123456` | Gestión de turnos día/semana/mes, registro, edición y cancelación. |
| 🩺 **Médico** | `a.rossi@medicore.com` | `123456` | Agenda del día, pacientes asignados y notas médicas. |
| 👤 **Paciente** | `m.fernandez@mail.com` | `123456` | Consulta de sus turnos y datos personales. |

---

## ⚙️ Configuración Personalizada de Base de Datos (Opcional)

Por defecto, MediControl se conecta a MySQL con la configuración estándar de XAMPP (`host: 127.0.0.1`, `usuario: root`, `contraseña: ''`, `base: medicontrol_db`).

Si tu instalación de MySQL requiere una contraseña distinta (por ejemplo `1234` o `root`), podés crear un archivo `config/database.local.php` (este archivo está ignorado en Git para tu seguridad):

1. Copiá `config/database.example.php` como `config/database.local.php`.
2. Ajustá tus credenciales:
   ```php
   <?php
   return [
       'host'     => '127.0.0.1',
       'port'     => 3306,
       'database' => 'medicontrol_db',
       'user'     => 'root',
       'pass'     => 'tu_password_aqui',
       'charset'  => 'utf8mb4'
   ];
   ```

---

## 📁 Estructura del Proyecto

```text
medicontrol/
├── config/
│   ├── database.php          # Conexión Singleton PDO con auto-fallback para XAMPP
│   └── database.example.php  # Plantilla para credenciales personalizadas
├── database/
│   ├── medicontrol.sql       # Script SQL portable de la BD (tablas, vistas, datos)
│   └── medicontrol_db.sql    # Script SQL de respaldo
├── includes/
│   ├── auth.php              # Control de sesiones y autenticación RBAC
│   └── acceso_denegado.php   # Pantalla HTTP 403 para accesos no autorizados
├── panel/
│   ├── recepcionista.php     # Calendario y timeline del día
│   ├── recepcionista_semana.php # Vista semanal
│   ├── recepcionista_mes.php    # Vista mensual
│   ├── recepcionista_turno_nuevo.php # Registro de turnos
│   ├── api_turno.php         # Endpoint JSON para modificar y cancelar turnos
│   ├── medico.php            # Panel del profesional médico y notas clínicas
│   └── paciente.php          # Panel del paciente
├── login.php                 # Inicio de sesión seguro con password_verify()
├── logout.php                # Cierre de sesión seguro
├── instalar.php              # Instalador web / CLI de 1 clic para la base de datos
├── test_conexion.php         # Verificador visual de conexión a la BD
└── README.md                 # Documentación e instrucciones
```

---

## 🛡️ Seguridad y Buenas Prácticas

* **RBAC en servidor:** Todas las pantallas y endpoints validan el rol en el backend mediante `requireRole()`.
* **Consultas preparadas:** 100% de las consultas utilizan PDO Prepared Statements contra inyecciones SQL.
* **Seguridad de contraseñas:** Contraseñas hasheadas con `password_hash()` (Bcrypt).
* **Vistas de seguridad:** Vistas MySQL (`vista_recepcion_turnos`, `vista_medico_agenda`, `vista_paciente_turnos`) para delimitar el alcance de datos por rol.
