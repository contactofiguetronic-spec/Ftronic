<?php
// ============================================================================
// index.php — Punto de entrada del ERP
// ============================================================================
// Si hay sesión activa → redirige al dashboard
// Si NO hay sesión → sirve la página de login
// ============================================================================

session_start();

// Verificar sesión activa y válida
$hasSession = false;
if (!empty($_SESSION['usuario_id'])) {
    // Verificar inactividad (8h por defecto, leído de BD)
    $lifetime = 28800; // fallback
    if (!empty($_SESSION['ultimo_activo'])) {
        $inactive = time() - strtotime($_SESSION['ultimo_activo']);
        if ($inactive > $lifetime) {
            // Sesión expirada
            $_SESSION = [];
            if (ini_get("session.use_cookies")) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
            }
            session_destroy();
            session_start();
        } else {
            $hasSession = true;
            // Refrescar timestamp
            $_SESSION['ultimo_activo'] = date('Y-m-d H:i:s');
        }
    } else {
        $hasSession = true;
        $_SESSION['ultimo_activo'] = date('Y-m-d H:i:s');
    }
}

if ($hasSession) {
    // Redirigir al dashboard
    header('Location: dashboard.html');
    exit;
}

// No hay sesión → servir el login
// Cambiar headers para que se renderice como HTML
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// Servir el contenido de login.html
readfile(__DIR__ . '/login.html');
exit;
