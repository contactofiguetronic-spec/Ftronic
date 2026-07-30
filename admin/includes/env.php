<?php
// ============================================================================
// env.php — Resolución centralizada de variables de entorno
// ============================================================================
// Define constantes desde variables de entorno (getenv / $_SERVER) si existen.
// Si no existen, mantiene los defaults provistos (no llamar a esta función
// directamente; usar env() desde config.php).
// ============================================================================

if (!function_exists('env_string')) {
    /**
     * Lee una variable de entorno como string.
     * Prioridad: getenv() → $_SERVER → $default.
     */
    function env_string(string $key, ?string $default = null): ?string
    {
        $v = getenv($key);
        if ($v !== false && $v !== '') return $v;
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return $_SERVER[$key];
        return $default;
    }
}

if (!function_exists('env_bool')) {
    function env_bool(string $key, bool $default = false): bool
    {
        $v = env_string($key);
        if ($v === null) return $default;
        return in_array(strtolower($v), ['1', 'true', 'yes', 'on', 'production'], true)
            ? true : false;
    }
}