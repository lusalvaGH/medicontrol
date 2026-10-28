<?php
// Imprime cómo ve «hoy» la API (date() y turnosHoy()) con la zona horaria de PHP que se le pase con -d.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}
require __DIR__ . '/../../src/bootstrap.php';
echo date('Y-m-d'), '|', turnosHoy()->format('Y-m-d');
