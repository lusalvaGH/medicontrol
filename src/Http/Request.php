<?php
declare(strict_types=1);

namespace MediControl\Http;

/**
 * Pedido HTTP ya normalizado: método, ruta relativa a /api, parámetros,
 * cuerpo JSON y cabeceras.
 */
final class Request
{
    public string $metodo;
    public string $ruta;
    public array $query;
    public array $cuerpo;
    public array $parametrosRuta = [];
    /** @var array<string, string> cabeceras con el nombre en minúsculas */
    private array $cabeceras;

    public function __construct(string $metodo, string $ruta, array $query = [], array $cuerpo = [], array $cabeceras = [])
    {
        $this->metodo = strtoupper($metodo);
        $this->ruta = '/' . trim($ruta, '/');
        $this->query = $query;
        $this->cuerpo = $cuerpo;
        $this->cabeceras = array_change_key_case($cabeceras, CASE_LOWER);
    }

    /**
     * Construye el pedido a partir de las variables del servidor.
     * $baseApi es la ruta pública de la carpeta api (por ejemplo /medicontrol/api).
     */
    public static function desdeGlobales(string $baseApi): self
    {
        $ruta = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
        $ruta = rawurldecode($ruta);
        if ($baseApi !== '' && strncmp($ruta, $baseApi, strlen($baseApi)) === 0) {
            $ruta = substr($ruta, strlen($baseApi));
        }
        if ($ruta === '/index.php' || $ruta === 'index.php') {
            $ruta = '/';
        }

        $cuerpo = [];
        $tipo = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
        if (stripos($tipo, 'application/json') !== false) {
            $datos = json_decode((string) file_get_contents('php://input'), true);
            $cuerpo = is_array($datos) ? $datos : [];
        }

        $cabeceras = [];
        if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
            $cabeceras['x-csrf-token'] = (string) $_SERVER['HTTP_X_CSRF_TOKEN'];
        }

        return new self((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'), $ruta, $_GET, $cuerpo, $cabeceras);
    }

    /**
     * Parámetro de query como texto; los arrays (?x[]=...) se ignoran.
     */
    public function texto(string $nombre): ?string
    {
        $valor = $this->query[$nombre] ?? null;

        return is_string($valor) ? trim($valor) : null;
    }

    /** Campo del cuerpo como texto (números se convierten); null si falta o no es escalar. */
    public function campoTexto(string $nombre): ?string
    {
        $valor = $this->cuerpo[$nombre] ?? null;
        if (is_string($valor)) {
            return trim($valor);
        }

        return is_int($valor) ? (string) $valor : null;
    }

    /** Campo del cuerpo como entero positivo; null si falta o no es válido. */
    public function campoEntero(string $nombre): ?int
    {
        $valor = $this->cuerpo[$nombre] ?? null;
        if (is_int($valor)) {
            return $valor > 0 ? $valor : null;
        }
        if (is_string($valor) && preg_match('/^[1-9]\d{0,9}$/', trim($valor))) {
            return (int) $valor;
        }

        return null;
    }

    public function cabecera(string $nombre): ?string
    {
        return $this->cabeceras[strtolower($nombre)] ?? null;
    }
}
