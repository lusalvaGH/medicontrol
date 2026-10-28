<?php
declare(strict_types=1);

namespace MediControl\Http;

/**
 * Enrutador mínimo: rutas con parámetros numéricos del tipo /turnos/{id}.
 */
final class Router
{
    /** @var array<int, array{metodo: string, patron: string, accion: callable}> */
    private array $rutas = [];

    public function agregar(string $metodo, string $ruta, callable $accion): void
    {
        $patron = '#^' . preg_replace('#\{([a-z_]+)\}#', '(?P<$1>\d+)', $ruta) . '$#';
        $this->rutas[] = ['metodo' => strtoupper($metodo), 'patron' => $patron, 'accion' => $accion];
    }

    public function despachar(Request $pedido): Respuesta
    {
        $rutaExiste = false;
        foreach ($this->rutas as $ruta) {
            if (!preg_match($ruta['patron'], $pedido->ruta, $coincidencias)) {
                continue;
            }
            $rutaExiste = true;
            if ($ruta['metodo'] !== $pedido->metodo) {
                continue;
            }
            $pedido->parametrosRuta = array_filter($coincidencias, 'is_string', ARRAY_FILTER_USE_KEY);

            return ($ruta['accion'])($pedido);
        }

        if ($rutaExiste) {
            throw new ApiException(405, 'METODO_NO_PERMITIDO', 'Método no permitido para esta ruta.');
        }
        throw new ApiException(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.');
    }
}
