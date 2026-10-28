<?php
declare(strict_types=1);

namespace MediControl\Http;

/**
 * Respuesta JSON uniforme:
 *   éxito: {"ok": true,  "data": ...}
 *   error: {"ok": false, "error": {"codigo": "...", "mensaje": "...", "campos": {...}}}
 */
final class Respuesta
{
    public int $estadoHttp;
    public array $cuerpo;

    private function __construct(int $estadoHttp, array $cuerpo)
    {
        $this->estadoHttp = $estadoHttp;
        $this->cuerpo = $cuerpo;
    }

    public static function ok($data, int $estadoHttp = 200): self
    {
        return new self($estadoHttp, ['ok' => true, 'data' => $data]);
    }

    public static function error(int $estadoHttp, string $codigo, string $mensaje, array $campos = []): self
    {
        $error = ['codigo' => $codigo, 'mensaje' => $mensaje];
        if ($campos !== []) {
            $error['campos'] = $campos;
        }

        return new self($estadoHttp, ['ok' => false, 'error' => $error]);
    }

    public function enviar(): void
    {
        http_response_code($this->estadoHttp);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($this->cuerpo, JSON_UNESCAPED_UNICODE);
    }
}
