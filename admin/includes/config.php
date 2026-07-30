<?php
// ============================================================================
// config.php — Configuración de entorno Figuetronic
// ============================================================================
// Las credenciales se resuelven desde variables de entorno del servidor
// (FTRONIC_DB_*) con fallback a los valores por defecto definidos aquí.
//
// RECOMENDADO para producción:
//   1. Definir FTRONIC_DB_PASS (y opcionalmente el resto) en el .htaccess,
//      php.ini del hosting o como variable de entorno del sistema.
//   2. Crear admin/includes/env.local.php con las constantes para el
//      entorno actual (este archivo SÍ está en .gitignore).
//
// ⚠️  NO versionar credenciales reales. El bloque "DEFAULTS" de abajo
//     contiene los valores legacy de migración; sobreescríbelos con env
//     o con env.local.php en cada despliegue.
// ============================================================================

require_once __DIR__ . '/env.php';

// ── Override opcional por archivo local no versionado ────────────────────────
$_env_local = __DIR__ . '/env.local.php';
if (is_file($_env_local)) {
    require_once $_env_local;
}

// ── Resolución: env → defaults ───────────────────────────────────────────────
if (!defined('DB_HOST')) define('DB_HOST', env_string('FTRONIC_DB_HOST', 'localhost'));
if (!defined('DB_NAME')) define('DB_NAME', env_string('FTRONIC_DB_NAME', 'dagober5_dashboard'));
if (!defined('DB_USER')) define('DB_USER', env_string('FTRONIC_DB_USER', 'dagober5_admin'));
if (!defined('DB_PASS')) define('DB_PASS', env_string('FTRONIC_DB_PASS', 'cachaelwillo$1'));

// Entorno: 'production' | 'development'
if (!defined('APP_ENV')) define('APP_ENV', env_string('FTRONIC_APP_ENV', 'production'));

// Rutas base
if (!defined('UPLOADS_BASE_PATH')) define('UPLOADS_BASE_PATH', dirname(__DIR__) . '/uploads/');
if (!defined('UPLOADS_BASE_URL'))  define('UPLOADS_BASE_URL',  '/admin/uploads/');