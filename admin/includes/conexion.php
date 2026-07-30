<?php
// ============================================================================
// conexion.php — Conexión central PDO a MySQL
// ============================================================================

require_once __DIR__ . '/config.php';

try {
    $conn = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER,
        DB_PASS
    );
    $conn->setAttribute(PDO::ATTR_ERRMODE,            PDO::ERRMODE_EXCEPTION);
    $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $conn->setAttribute(PDO::ATTR_EMULATE_PREPARES,   false);

    // Alias de compatibilidad: algunos archivos usan $pdo en lugar de $conn
    $pdo = $conn;

} catch (PDOException $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    $msg = (APP_ENV === 'development')
        ? "Error de conexión: " . $e->getMessage()
        : "Error de conexión a la base de datos.";
    echo json_encode(['status' => 'error', 'message' => $msg]);
    exit;
}

// ============================================================================
// FUNCIONES GLOBALES COMPARTIDAS
// (Se delegan en helpers.php; aquí solo se mantienen las más básicas)
// ============================================================================

if (!function_exists('jsonResponse')) {
    /**
     * Envía una respuesta JSON estandarizada y termina la ejecución.
     */
    function jsonResponse(string $status, string $message, $data = null, int $code = 200): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        http_response_code($code);
        echo json_encode([
            'status'  => $status,
            'message' => $message,
            'data'    => $data,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if (!function_exists('normalizeNullableInt')) {
    /**
     * Convierte un valor vacío o no-numérico a null; de lo contrario devuelve int.
     */
    function normalizeNullableInt($value): ?int
    {
        if ($value === null || $value === '') return null;
        return is_numeric($value) ? (int)$value : null;
    }
}

if (!function_exists('normalizeNullableDecimal')) {
    /**
     * Convierte un valor vacío o no-numérico a null; de lo contrario devuelve float.
     */
    function normalizeNullableDecimal($value): ?float
    {
        if ($value === null || $value === '') return null;
        return is_numeric($value) ? (float)$value : null;
    }
}

// Cargar helpers centralizados
require_once __DIR__ . '/helpers.php';

// Sistema de autenticación
require_once __DIR__ . '/auth.php';

session_start();

// Configurar parámetros de sesión seguros
ini_set('session.cookie_httponly', 1);
ini_set('session.use_strict_mode', 1);
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', 1);
}
