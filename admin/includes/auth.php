<?php
// ============================================================================
// auth.php — Funciones de autenticación y autorización
// Figuetronic ERP — Julio 2026
// ============================================================================
// Los valores de configuración se leen desde la tabla `config_sistema` (BD).
// Si la BD no tiene un valor, se usan los defaults aquí definidos.
// ============================================================================

if (!function_exists('authConfig')) {
    /**
     * Helper para leer configuración del grupo auth.
     * Lee desde la tabla config_sistema con fallback a defaults.
     */
    function authConfig(string $clave, $default = null) {
        $val = function_exists('getConfig') ? getConfig('auth_' . $clave, $default) : $default;
        return $val !== null ? $val : $default;
    }
}

/**
 * Verifica que haya una sesión válida. Si no, responde 401 y termina.
 * Llamar al inicio de CADA endpoint API.
 */
function requireAuth(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();

    // Verificar sesión activa
    if (empty($_SESSION['usuario_id'])) {
        header('Content-Type: application/json');
        http_response_code(401);
        echo json_encode([
            'status'  => 'error',
            'message' => 'Sesión no válida. Inicie sesión.',
            'code'    => 'AUTH_REQUIRED'
        ]);
        exit;
    }

    // Verificar que el usuario esté activo
    if (isset($_SESSION['user_activo']) && $_SESSION['user_activo'] != 1) {
        session_unset();
        session_destroy();
        header('Content-Type: application/json');
        http_response_code(401);
        echo json_encode([
            'status'  => 'error',
            'message' => 'Su cuenta ha sido desactivada. Contacte al administrador.',
            'code'    => 'ACCOUNT_DISABLED'
        ]);
        exit;
    }

    // Verificar expiración por inactividad
    if (isset($_SESSION['ultimo_activo'])) {
        $inactive = time() - strtotime($_SESSION['ultimo_activo']);
        $lifetime = (int)authConfig('session_lifetime', 28800);
        if ($inactive > $lifetime) {
            session_unset();
            session_destroy();
            header('Content-Type: application/json');
            http_response_code(401);
            echo json_encode([
                'status'  => 'error',
                'message' => 'Sesión expirada por inactividad. Inicie sesión nuevamente.',
                'code'    => 'SESSION_EXPIRED'
            ]);
            exit;
        }
    }

    // Actualizar timestamp de actividad
    $_SESSION['ultimo_activo'] = date('Y-m-d H:i:s');
}

/**
 * Retorna el usuario actual desde la sesión.
 */
function currentUser(): ?array
{
    if (empty($_SESSION['usuario_id'])) return null;

    return [
        'id'           => $_SESSION['usuario_id'],
        'username'     => $_SESSION['username'] ?? '',
        'nombre'       => $_SESSION['user_nombre'] ?? '',
        'apellido'     => $_SESSION['user_apellido'] ?? '',
        'email'        => $_SESSION['user_email'] ?? '',
        'tipo'         => $_SESSION['user_tipo'] ?? 'empleado',
        'empleado_id'  => $_SESSION['empleado_id'] ?? null,
        'cliente_id'   => $_SESSION['cliente_id'] ?? null,
        'rol'          => $_SESSION['rol_principal'] ?? '',
        'rol_principal' => $_SESSION['rol_principal'] ?? null,
        'nivel'        => $_SESSION['nivel'] ?? 99,
        'activo'       => $_SESSION['user_activo'] ?? 1,
        'permisos'     => $_SESSION['permisos'] ?? [],
    ];
}

/**
 * Verifica si el usuario actual tiene un permiso específico.
 * Formato: 'modulo:accion' o 'modulo:campo'
 */
function hasPerm(string $permiso): bool
{
    if (empty($_SESSION['permisos'])) return false;
    $user = currentUser();
    if (!$user) return false;

    // Admin tiene todo
    if ($user['nivel'] == 1) return true;

    return in_array($permiso, $_SESSION['permisos']);
}

/**
 * Verifica permiso y responde 403 si no lo tiene.
 */
function requirePerm(string $permiso): void
{
    if (!hasPerm($permiso)) {
        header('Content-Type: application/json');
        http_response_code(403);
        echo json_encode([
            'status'  => 'error',
            'message' => 'No tiene permiso para realizar esta acción.',
            'code'    => 'FORBIDDEN',
            'needed'  => $permiso
        ]);
        exit;
    }
}

/**
 * Login: valida credenciales y crea la sesión.
 * Retorna array con resultado.
 */
function doLogin(string $username, string $password, string $ip, string $userAgent): array
{
    global $conn;

    // Buscar usuario
    $stmt = $conn->prepare("
        SELECT u.id, u.username, u.password_hash, u.email, u.telefono, u.tipo,
               u.empleado_id, u.cliente_id, u.activo, u.intentos_fallidos, u.bloqueado_hasta,
               e.nombre AS emp_nombre, e.apellido AS emp_apellido, e.cargo
        FROM usuarios u
        LEFT JOIN empleados e ON u.empleado_id = e.id
        WHERE u.username = ?
        LIMIT 1
    ");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        // Delay para prevenir timing attacks
        usleep(500000); // 0.5s
        return ['ok' => false, 'message' => 'Credenciales incorrectas.'];
    }

    // Verificar si está bloqueado
    if ($user['bloqueado_hasta'] && strtotime($user['bloqueado_hasta']) > time()) {
        $mins = ceil((strtotime($user['bloqueado_hasta']) - time()) / 60);
        return ['ok' => false, 'message' => "Cuenta bloqueada. Intente nuevamente en {$mins} minutos."];
    }

    // Verificar si está activo
    if (!$user['activo']) {
        return ['ok' => false, 'message' => 'Cuenta deshabilitada. Contacte al administrador.'];
    }

    // Verificar password
    if (!password_verify($password, $user['password_hash'])) {
        $attempts = $user['intentos_fallidos'] + 1;
        $lockUntil = null;
        $maxAttempts = (int)authConfig('max_attempts', 5);
        $lockoutMins = (int)authConfig('lockout_minutes', 15);
        if ($attempts >= $maxAttempts) {
            $lockUntil = date('Y-m-d H:i:s', time() + ($lockoutMins * 60));
            $attempts = 0;
        }
        $stmt = $conn->prepare("UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?");
        $stmt->execute([$attempts, $lockUntil, $user['id']]);

        if ($lockUntil) {
            return ['ok' => false, 'message' => "Demasiados intentos fallidos. Cuenta bloqueada por {$lockoutMins} minutos."];
        }
        $remaining = $maxAttempts - $attempts;
        return ['ok' => false, 'message' => "Credenciales incorrectas. Le quedan {$remaining} intentos."];
    }

    // Login exitoso — resetear contadores
    $conn->prepare("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = ?")
         ->execute([$user['id']]);

    // Cargar permisos del usuario
    $permisos = [];
    $rolNombre = null;
    $nivel = 99;

    if ($user['tipo'] === 'empleado') {
        $stmt = $conn->prepare("
            SELECT r.nombre, r.nivel, GROUP_CONCAT(DISTINCT CONCAT(p.modulo, ':', p.accion) SEPARATOR ',') AS permisos_raw
            FROM usuario_roles ur
            JOIN roles r ON ur.rol_id = r.id AND r.activo = 1
            LEFT JOIN role_permisos rp ON rp.rol_id = r.id AND rp.activo = 1
            LEFT JOIN permisos p ON rp.permiso_id = p.id
            WHERE ur.usuario_id = ? AND ur.activo = 1
            GROUP BY r.id, r.nombre, r.nivel
            ORDER BY r.nivel ASC
            LIMIT 1
        ");
        $stmt->execute([$user['id']]);
        $roleData = $stmt->fetch();

        if ($roleData) {
            $rolNombre = $roleData['nombre'];
            $nivel = (int)$roleData['nivel'];
            if ($roleData['permisos_raw']) {
                $permisos = array_unique(explode(',', $roleData['permisos_raw']));
            }
        }
    }

    // Cargar permisos individuales del usuario (override del rol)
    // Si usuario_permisos tiene entries, reemplazan los del rol
    try {
        $stmt = $conn->prepare("SELECT permiso FROM usuario_permisos WHERE usuario_id = ?");
        $stmt->execute([$user['id']]);
        $userOverrides = $stmt->fetchAll(PDO::FETCH_COLUMN);
        // Filtrar basura ('on' de checkboxes sin value)
        $userOverrides = array_filter($userOverrides, fn($p) => str_contains($p, ':') && $p !== 'on');
        if (!empty($userOverrides)) {
            $permisos = array_values($userOverrides);
        }
        // Limpiar basura de la DB
        $conn->prepare("DELETE FROM usuario_permisos WHERE usuario_id = ? AND (permiso = 'on' OR permiso NOT LIKE '%:%')")->execute([$user['id']]);
    } catch (PDOException $e) {
        // tabla no existe aún, ignorar
    }

    // Crear sesión PHP
    session_regenerate_id(true);
    $_SESSION['usuario_id']     = $user['id'];
    $_SESSION['username']       = $user['username'];
    $_SESSION['user_nombre']    = $user['emp_nombre'] ?? $user['username'];
    $_SESSION['user_apellido']  = $user['emp_apellido'] ?? '';
    $_SESSION['user_email']     = $user['email'] ?? '';
    $_SESSION['user_tipo']      = $user['tipo'];
    $_SESSION['user_activo']    = $user['activo'];
    $_SESSION['empleado_id']    = $user['empleado_id'];
    $_SESSION['cliente_id']     = $user['cliente_id'];
    $_SESSION['rol_principal']  = $rolNombre;
    $_SESSION['nivel']          = $nivel;
    $_SESSION['permisos']       = $permisos;
    $_SESSION['ultimo_activo']  = date('Y-m-d H:i:s');
    $_SESSION['creado_en']      = date('Y-m-d H:i:s');

    // Registrar actividad
    $conn->prepare("INSERT INTO user_activity (usuario_id, accion, entidad, detalle, ip, user_agent, fecha) VALUES (?, 'login', 'sesion', ?, ?, ?, NOW())")
         ->execute([$user['id'], "Login exitoso — rol: {$rolNombre}", $ip, $userAgent]);

    return [
        'ok'       => true,
        'usuario'  => [
            'id'           => $user['id'],
            'username'     => $user['username'],
            'nombre'       => $user['emp_nombre'] ?? $user['username'],
            'apellido'     => $user['emp_apellido'] ?? '',
            'email'        => $user['email'] ?? '',
            'tipo'         => $user['tipo'],
            'rol'          => $rolNombre,
            'nivel'        => $nivel,
            'empleado_id'  => $user['empleado_id'],
            'cliente_id'   => $user['cliente_id'],
            'permisos'     => $permisos,
        ]
    ];
}

/**
 * Logout: destruye la sesión y registra actividad.
 */
function doLogout(): void
{
    if (!empty($_SESSION['usuario_id'])) {
        global $conn;
        $uid = $_SESSION['usuario_id'];
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $conn->prepare("INSERT INTO user_activity (usuario_id, accion, entidad, detalle, ip, user_agent, fecha) VALUES (?, 'logout', 'sesion', 'Logout', ?, ?, NOW())")
             ->execute([$uid, $ip, $ua]);
    }

    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
    }
    session_destroy();
}
