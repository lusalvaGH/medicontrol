<?php

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/../conexion.php';
require_once __DIR__ . '/../includes/auth.php';

requireRole('recepcionista');

$today = new DateTimeImmutable('today');
$selectedDate = trim((string) ($_POST['fecha'] ?? $_GET['fecha'] ?? $today->format('Y-m-d')));
$selectedDoctor = (int) ($_POST['id_medico'] ?? $_GET['id_medico'] ?? 0);
$selectedPatient = (int) ($_POST['id_paciente'] ?? 0);
$selectedTime = trim((string) ($_POST['hora'] ?? ''));
$patientSearch = trim((string) ($_GET['buscar_paciente'] ?? ''));
$reason = trim((string) ($_POST['motivo_consulta'] ?? ''));
$message = null;
$messageType = 'error';

$fixedSlots = ['09:00:00', '09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:30:00', '12:00:00'];
$dateObject = DateTimeImmutable::createFromFormat('!Y-m-d', $selectedDate);
$validDate = $dateObject && $dateObject->format('Y-m-d') === $selectedDate;
if (!$validDate) {
    $selectedDate = $today->format('Y-m-d');
    $dateObject = $today;
}

$patients = [];
$doctors = [];

try {
    $stmtPatients = $pdo->prepare("
        SELECT p.id_paciente, u.nombre, u.apellido, u.dni
        FROM pacientes p
        INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
        WHERE u.nombre LIKE :search_nombre
           OR u.apellido LIKE :search_apellido
           OR CONCAT(u.nombre, ' ', u.apellido) LIKE :search_nombre_completo
           OR u.dni LIKE :search_dni
        ORDER BY u.apellido, u.nombre
        LIMIT 50
    ");
    $patientSearchValue = '%' . $patientSearch . '%';
    $stmtPatients->execute([
        'search_nombre' => $patientSearchValue,
        'search_apellido' => $patientSearchValue,
        'search_nombre_completo' => $patientSearchValue,
        'search_dni' => $patientSearchValue,
    ]);
    $patients = $stmtPatients->fetchAll();
} catch (PDOException $e) {
    $message = 'No se pudieron cargar los pacientes. Intentá nuevamente más tarde.';
}

try {
    $doctors = $pdo->query("
        SELECT m.id_medico, m.especialidad, u.nombre, u.apellido
        FROM medicos m
        INNER JOIN usuarios u ON u.id_usuario = m.id_usuario
        ORDER BY u.apellido, u.nombre
    ")->fetchAll();
} catch (PDOException $e) {
    $message = $message ?? 'No se pudieron cargar los médicos. Intentá nuevamente más tarde.';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $message === null) {
    $now = new DateTimeImmutable();
    $minimumTime = $now->modify('+2 hours')->format('H:i:s');
    $selectedDateObject = DateTimeImmutable::createFromFormat('!Y-m-d', $selectedDate);

    if (!$selectedDateObject || $selectedDateObject < $today) {
        $message = 'No se pueden registrar turnos en fechas pasadas.';
    } elseif (!in_array($selectedTime, $fixedSlots, true)) {
        $message = 'Seleccioná un horario disponible válido.';
    } elseif ($selectedDate === $today->format('Y-m-d') && $selectedTime < $minimumTime) {
        $message = 'Para hoy, el turno debe ser dentro de al menos 2 horas.';
    } elseif ($selectedPatient <= 0 || $selectedDoctor <= 0) {
        $message = 'Seleccioná un paciente y un médico.';
    } elseif ($reason === '' || mb_strlen($reason) > 255) {
        $message = 'Ingresá un motivo de consulta de hasta 255 caracteres.';
    } else {
        try {
            $stmtOccupied = $pdo->prepare('SELECT 1 FROM turnos WHERE id_medico = :id_medico AND fecha = :fecha AND hora = :hora LIMIT 1');
            $stmtOccupied->execute([
                'id_medico' => $selectedDoctor,
                'fecha' => $selectedDate,
                'hora' => $selectedTime,
            ]);

            if ($stmtOccupied->fetchColumn()) {
                $message = 'Ese horario ya está ocupado para el médico seleccionado.';
            } else {
                $stmtInsert = $pdo->prepare("
                    INSERT INTO turnos (id_paciente, id_medico, fecha, hora, estado, motivo_consulta)
                    VALUES (:id_paciente, :id_medico, :fecha, :hora, 'pendiente', :motivo_consulta)
                ");
                $stmtInsert->execute([
                    'id_paciente' => $selectedPatient,
                    'id_medico' => $selectedDoctor,
                    'fecha' => $selectedDate,
                    'hora' => $selectedTime,
                    'motivo_consulta' => $reason,
                ]);
                header('Location: recepcionista.php?fecha=' . rawurlencode($selectedDate));
                exit;
            }
        } catch (PDOException $e) {
            if ((int) $e->errorInfo[1] === 1062) {
                $message = 'Ese horario ya está ocupado para el médico seleccionado.';
            } else {
                $message = 'No se pudo registrar el turno. Intentá nuevamente más tarde.';
            }
        }
    }
}

$occupiedSlots = [];
if ($selectedDoctor > 0) {
    try {
        $stmtOccupied = $pdo->prepare('SELECT hora FROM turnos WHERE id_medico = :id_medico AND fecha = :fecha');
        $stmtOccupied->execute(['id_medico' => $selectedDoctor, 'fecha' => $selectedDate]);
        $occupiedSlots = array_map(static fn ($row) => (string) $row['hora'], $stmtOccupied->fetchAll());
    } catch (PDOException $e) {
        $message = $message ?? 'No se pudieron consultar los horarios ocupados.';
    }
}

$selectedDoctorData = null;
foreach ($doctors as $doctor) {
    if ((int) $doctor['id_medico'] === $selectedDoctor) {
        $selectedDoctorData = $doctor;
        break;
    }
}
$dateDisplay = $dateObject->format('d/m/Y');
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediCore Health - Registrar Nuevo Turno</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --primary:#004797; --primary-hover:#003673; --bg-main:#64748b; --bg-card:#fff; --bg-subtle:#f8fafc; --text-dark:#0f172a; --text-main:#1e293b; --text-muted:#64748b; --text-light:#94a3b8; --border-color:#e2e8f0; --border-dark:#cbd5e1; --radius-md:8px; --shadow-xl:0 20px 25px -5px rgba(0,0,0,.15); }
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    body { background:var(--bg-main); color:var(--text-main); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:1.5rem; -webkit-font-smoothing:antialiased; }
    .modal-card { background:#fff; border-radius:16px; width:100%; max-width:540px; box-shadow:var(--shadow-xl); overflow:hidden; }
    .modal-header { padding:1.5rem 2rem 1rem; display:flex; justify-content:space-between; align-items:flex-start; }
    .close-btn { background:none; border:none; font-size:1.2rem; color:var(--text-light); cursor:pointer; text-decoration:none; }
    .modal-body { padding:0 2rem 1.5rem; }
    .modal-footer { background:var(--bg-subtle); padding:1rem 2rem; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:.75rem; }
    .form-group { margin-bottom:1.1rem; }
    .form-group label { display:block; font-size:.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:.4rem; }
    .input-box { width:100%; padding:.7rem .9rem; border:1px solid var(--border-dark); border-radius:var(--radius-md); font-size:.85rem; outline:none; background:var(--bg-subtle); }
    .input-box:focus { border-color:var(--primary); background:#fff; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
    .time-pills { display:flex; gap:.6rem; flex-wrap:wrap; }
    .time-pill { padding:.5rem .85rem; border-radius:6px; border:1px solid var(--border-dark); background:#fff; font-size:.8rem; font-weight:700; color:var(--text-muted); cursor:pointer; }
    .time-pill.selected { background:var(--primary); color:#fff; border-color:var(--primary); }
    .time-pill.disabled { background:#e2e8f0; color:#94a3b8; cursor:not-allowed; text-decoration:line-through; }
    .btn { padding:.6rem 1.1rem; border-radius:var(--radius-md); font-size:.85rem; font-weight:700; cursor:pointer; border:none; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:.4rem; }
    .btn-primary { background:var(--primary); color:#fff; } .btn-primary:hover { background:var(--primary-hover); }
    .btn-secondary { background:#fff; color:var(--primary); border:1px solid var(--border-dark); }
    .notice { padding:.7rem .9rem; border-radius:var(--radius-md); margin-bottom:1rem; font-size:.82rem; background:#fee2e2; color:#991b1b; }
    .patient-results { max-height:140px; overflow:auto; border:1px solid var(--border-color); border-radius:var(--radius-md); margin-top:.35rem; }
    .patient-result { display:block; width:100%; border:0; background:#fff; padding:.55rem .75rem; text-align:left; cursor:pointer; font-size:.8rem; color:var(--text-main); }
    .patient-result:hover { background:var(--bg-subtle); }
    @media (max-width:480px) { .modal-card{border-radius:12px}.modal-header,.modal-body,.modal-footer{padding-left:1.25rem;padding-right:1.25rem}.grid-2{grid-template-columns:1fr} }
  </style>
</head>
<body>
  <div class="modal-card">
    <div class="modal-header">
      <div>
        <h2 style="font-size:1.3rem;font-weight:800;color:var(--primary);">Registrar Nuevo Turno</h2>
        <p style="font-size:.82rem;color:var(--text-muted);margin-top:.2rem;">Complete los datos para agendar la cita médica.</p>
      </div>
      <a class="close-btn" href="recepcionista.php">✕</a>
    </div>
    <div class="modal-body">
      <?php if ($message !== null): ?><div class="notice"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
      <form method="post" id="newTurnForm">
        <div class="form-group">
          <label for="patientSearch">Buscar Paciente</label>
          <input id="patientSearch" type="search" class="input-box" value="<?= htmlspecialchars($patientSearch, ENT_QUOTES, 'UTF-8') ?>" placeholder="DNI o Nombre..." autocomplete="off">
          <input type="hidden" name="id_paciente" id="patientId" value="<?= $selectedPatient ?>">
          <div class="patient-results" id="patientResults">
            <?php foreach ($patients as $patient): ?>
              <button type="button" class="patient-result" data-id="<?= (int) $patient['id_paciente'] ?>" data-label="<?= htmlspecialchars($patient['nombre'] . ' ' . $patient['apellido'] . ' - DNI ' . $patient['dni'], ENT_QUOTES, 'UTF-8') ?>">
                <?= htmlspecialchars($patient['nombre'] . ' ' . $patient['apellido'] . ' - DNI ' . $patient['dni'], ENT_QUOTES, 'UTF-8') ?>
              </button>
            <?php endforeach; ?>
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label for="doctorSelect">Médico</label>
            <select id="doctorSelect" name="id_medico" class="input-box" required>
              <option value="">Seleccionar médico</option>
              <?php foreach ($doctors as $doctor): ?>
                <option value="<?= (int) $doctor['id_medico'] ?>" <?= (int) $doctor['id_medico'] === $selectedDoctor ? 'selected' : '' ?>>
                  <?= htmlspecialchars($doctor['nombre'] . ' ' . $doctor['apellido'], ENT_QUOTES, 'UTF-8') ?>
                </option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="form-group">
            <label for="specialty">Especialidad</label>
            <input id="specialty" type="text" class="input-box" value="<?= htmlspecialchars((string) ($selectedDoctorData['especialidad'] ?? ''), ENT_QUOTES, 'UTF-8') ?>" readonly style="background:var(--border-color);color:var(--text-main);">
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label for="date">Fecha de Turno</label>
            <input id="date" type="date" name="fecha" class="input-box" value="<?= htmlspecialchars($selectedDate, ENT_QUOTES, 'UTF-8') ?>" min="<?= $today->format('Y-m-d') ?>" required>
          </div>
          <div class="form-group">
            <label>Horario Disponible</label>
            <div class="time-pills" id="timePills">
              <?php foreach ($fixedSlots as $slot): $occupied = in_array($slot, $occupiedSlots, true); $slotValue = substr($slot, 0, 5); ?>
                <button type="button" class="time-pill<?= $selectedTime === $slot ? ' selected' : '' ?><?= $occupied ? ' disabled' : '' ?>" data-time="<?= $slot ?>" <?= $occupied ? 'disabled' : '' ?>><?= $slotValue ?></button>
              <?php endforeach; ?>
            </div>
            <input type="hidden" name="hora" id="timeInput" value="<?= htmlspecialchars($selectedTime, ENT_QUOTES, 'UTF-8') ?>" required>
          </div>
        </div>
        <div class="form-group">
          <label for="reason">Motivo de Consulta</label>
          <textarea id="reason" name="motivo_consulta" class="input-box" rows="3" maxlength="255" placeholder="Descripción breve del síntoma o consulta..." style="resize:none;"><?= htmlspecialchars($reason, ENT_QUOTES, 'UTF-8') ?></textarea>
        </div>
        <div class="modal-footer" style="margin:1.5rem -2rem -1.5rem -2rem;">
          <a href="recepcionista.php" class="btn btn-secondary">Cancelar</a>
          <button type="submit" class="btn btn-primary">✓ Registrar Turno</button>
        </div>
      </form>
    </div>
  </div>
  <script>
    const doctorSelect = document.getElementById('doctorSelect');
    const dateInput = document.getElementById('date');
    const patientSearch = document.getElementById('patientSearch');
    const patientId = document.getElementById('patientId');
    const patientResults = document.getElementById('patientResults');
    const patientButtons = Array.from(document.querySelectorAll('.patient-result'));
    const specialties = <?= json_encode(array_column($doctors, 'especialidad', 'id_medico'), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    function reloadSlots() {
      const params = new URLSearchParams({ id_medico: doctorSelect.value, fecha: dateInput.value });
      window.location.href = 'recepcionista_turno_nuevo.php?' + params.toString();
    }
    doctorSelect.addEventListener('change', function () {
      document.getElementById('specialty').value = specialties[this.value] || '';
      reloadSlots();
    });
    dateInput.addEventListener('change', reloadSlots);
    patientSearch.addEventListener('input', function () {
      const query = this.value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      patientButtons.forEach(function (button) {
        button.hidden = !normalize(button.dataset.label).includes(query);
      });
      patientId.value = '';
    });
    function normalize(value) {
      return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    patientButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        patientId.value = this.dataset.id;
        patientSearch.value = this.dataset.label;
        patientResults.hidden = true;
      });
    });
    document.querySelectorAll('.time-pill:not(.disabled)').forEach(function (pill) {
      pill.addEventListener('click', function () {
        document.querySelectorAll('.time-pill').forEach(function (item) { item.classList.remove('selected'); });
        this.classList.add('selected');
        document.getElementById('timeInput').value = this.dataset.time;
      });
    });
  </script>
</body>
</html>
