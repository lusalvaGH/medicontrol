<?php
declare(strict_types=1);

namespace MediControl\Http;

use RuntimeException;

/**
 * Error esperado de la API: se convierte en una respuesta JSON con su código HTTP.
 */
final class ApiException extends RuntimeException
{
    private int $estadoHttp;
    private string $codigo;
    private array $campos;

    public function __construct(int $estadoHttp, string $codigo, string $mensaje, array $campos = [])
    {
        parent::__construct($mensaje);
        $this->estadoHttp = $estadoHttp;
        $this->codigo = $codigo;
        $this->campos = $campos;
    }

    public function respuesta(): Respuesta
    {
        return Respuesta::error($this->estadoHttp, $this->codigo, $this->getMessage(), $this->campos);
    }
}
