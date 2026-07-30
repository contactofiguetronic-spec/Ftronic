<?php
// ============================================================================
// admin_api.php — API Administrativa del Panel Admin
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();
requirePerm('admin:panel');
header('Content-Type: application/json; charset=utf-8');

$action = $_REQUEST['action'] ?? '';

switch ($action) {
    case 'stats':          stats(); break;
    case 'roles':          listRoles(); break;
    case 'save_role':      saveRole(); break;
    case 'delete_role':    deleteRole(); break;
    case 'role_perms':     rolePermisos(); break;
    case 'save_role_perms': saveRolePermisos(); break;
    case 'user_perms':     userPermisos(); break;
    case 'save_user_perms': saveUserPermisos(); break;
    case 'reset_user_role': resetUserRole(); break;
    case 'audit_log':      auditLog(); break;
    case 'sessions':       activeSessions(); break;
    case 'force_logout':   forceLogout(); break;
    case 'config':         getConfigList(); break;
    case 'save_config':    saveConfig(); break;
    default: jsonResponse('error', 'Acción no válida');
}

// ============================================================================
// RESUMEN — Estadísticas del sistema
// ============================================================================
function stats() {
    global $pdo;

    $activos = $pdo->query("SELECT COUNT(*) FROM usuarios WHERE activo = 1")->fetchColumn();
    $bloqueados = $pdo->query("SELECT COUNT(*) FROM usuarios WHERE bloqueado_hasta > NOW()")->fetchColumn();

    $loginsHoy = $pdo->query("SELECT COUNT(*) FROM user_activity WHERE accion = 'login' AND DATE(fecha) = CURDATE()")->fetchColumn();

    $sesiones = $pdo->query("SELECT COUNT(DISTINCT usuario_id) FROM user_activity WHERE accion = 'login' AND fecha > DATE_SUB(NOW(), INTERVAL 8 HOUR)")->fetchColumn();

    // Última actividad
    $stmt = $pdo->query("
        SELECT ua.*, u.username, e.nombre, e.apellido
        FROM user_activity ua
        LEFT JOIN usuarios u ON ua.usuario_id = u.id
        LEFT JOIN empleados e ON u.empleado_id = e.id
        ORDER BY ua.fecha DESC LIMIT 15
    ");
    $activity = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonResponse('success', '', [
        'usuarios_activos' => (int)$activos,
        'logins_hoy'       => (int)$loginsHoy,
        'sesiones_activas' => (int)$sesiones,
        'bloqueados'       => (int)$bloqueados,
        'actividad'        => $activity,
    ]);
}

// ============================================================================
// ROLES — CRUD
// ============================================================================
function listRoles() {
    global $pdo;
    $stmt = $pdo->query("
        SELECT r.*,
            (SELECT COUNT(*) FROM role_permisos WHERE rol_id = r.id AND activo = 1) AS permisos_count,
            (SELECT COUNT(*) FROM usuario_roles WHERE rol_id = r.id AND activo = 1) AS usuarios_count
        FROM roles r ORDER BY r.nivel ASC
    ");
    jsonResponse('success', '', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function saveRole() {
    global $pdo;
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) jsonResponse('error', 'Datos requeridos');

    $id = intval($data['id'] ?? 0);
    $nombre = trim($data['nombre'] ?? '');
    $nivel = intval($data['nivel'] ?? 5);
    $descripcion = trim($data['descripcion'] ?? '');
    $color = trim($data['color'] ?? '#6B7280');

    if (!$nombre) jsonResponse('error', 'Nombre requerido');

    if ($id) {
        $stmt = $pdo->prepare("UPDATE roles SET nombre=?, nivel=?, descripcion=?, color=? WHERE id=?");
        $stmt->execute([$nombre, $nivel, $descripcion, $color, $id]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO roles (nombre, nivel, descripcion, color) VALUES (?, ?, ?, ?)");
        $stmt->execute([$nombre, $nivel, $descripcion, $color]);
        $id = $pdo->lastInsertId();
    }

    jsonResponse('success', 'Rol guardado', ['id' => $id]);
}

function deleteRole() {
    global $pdo;
    $id = intval($_POST['id'] ?? 0);
    if (!$id) jsonResponse('error', 'ID requerido');

    // No eliminar si tiene usuarios asignados
    $count = $pdo->prepare("SELECT COUNT(*) FROM usuario_roles WHERE rol_id = ?");
    $count->execute([$id]);
    if ($count->fetchColumn() > 0) {
        jsonResponse('error', 'No se puede eliminar: hay usuarios con este rol');
    }

    $pdo->prepare("DELETE FROM role_permisos WHERE rol_id = ?")->execute([$id]);
    $pdo->prepare("DELETE FROM roles WHERE id = ?")->execute([$id]);
    jsonResponse('success', 'Rol eliminado');
}

// ============================================================================
// PERMISOS DE ROL
// ============================================================================
function rolePermisos() {
    global $pdo;
    $rolId = intval($_GET['rol_id'] ?? 0);
    if (!$rolId) jsonResponse('error', 'rol_id requerido');

    $stmt = $pdo->prepare("
        SELECT CONCAT(p.modulo, ':', p.accion) AS permiso, p.modulo, p.accion, p.descripcion, p.categoria
        FROM role_permisos rp
        JOIN permisos p ON rp.permiso_id = p.id
        WHERE rp.rol_id = ? AND rp.activo = 1
    ");
    $stmt->execute([$rolId]);
    jsonResponse('success', '', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function saveRolePermisos() {
    global $pdo;
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) jsonResponse('error', 'Datos requeridos');

    $rolId = intval($data['rol_id'] ?? 0);
    $permisos = $data['permisos'] ?? []; // Array de permiso strings "mod:accion"
    if (!$rolId) jsonResponse('error', 'rol_id requerido');

    // Limpiar existentes
    $pdo->prepare("DELETE FROM role_permisos WHERE rol_id = ?")->execute([$rolId]);

    // Insertar nuevos
    if ($permisos) {
        $stmt = $pdo->prepare("INSERT INTO role_permisos (rol_id, permiso_id, activo) VALUES (?, ?, 1)");
        $findPerm = $pdo->prepare("SELECT id FROM permisos WHERE CONCAT(modulo, ':', accion) = ? LIMIT 1");
        foreach ($permisos as $p) {
            $findPerm->execute([$p]);
            $permId = $findPerm->fetchColumn();
            if ($permId) {
                $stmt->execute([$rolId, $permId]);
            }
        }
    }

    jsonResponse('success', 'Permisos del rol actualizados');
}

// ============================================================================
// PERMISOS GRANULARES POR USUARIO
// ============================================================================
function userPermisos() {
    global $pdo;
    $userId = intval($_GET['usuario_id'] ?? 0);

    if ($userId) {
        // Permisos individuales del usuario
        $stmt = $pdo->prepare("SELECT permiso FROM usuario_permisos WHERE usuario_id = ?");
        $stmt->execute([$userId]);
        $userPerms = $stmt->fetchAll(PDO::FETCH_COLUMN);

        // Rol del usuario
        $stmt = $pdo->prepare("
            SELECT r.id, r.nombre, r.nivel
            FROM usuario_roles ur JOIN roles r ON ur.rol_id = r.id
            WHERE ur.usuario_id = ? AND ur.activo = 1 LIMIT 1
        ");
        $stmt->execute([$userId]);
        $role = $stmt->fetch(PDO::FETCH_ASSOC);

        jsonResponse('success', '', [
            'user_perms' => $userPerms,
            'role' => $role,
        ]);
    } else {
        jsonResponse('error', 'usuario_id requerido');
    }
}

function saveUserPermisos() {
    global $pdo;
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data) jsonResponse('error', 'Datos requeridos');

    $userId = intval($data['usuario_id'] ?? 0);
    $permisos = $data['permisos'] ?? [];
    if (!$userId) jsonResponse('error', 'usuario_id requerido');

    $pdo->prepare("DELETE FROM usuario_permisos WHERE usuario_id = ?")->execute([$userId]);

    if ($permisos) {
        $stmt = $pdo->prepare("INSERT INTO usuario_permisos (usuario_id, permiso) VALUES (?, ?)");
        foreach ($permisos as $p) {
            $stmt->execute([$userId, $p]);
        }
    }

    jsonResponse('success', 'Permisos del usuario actualizados');
}

function resetUserRole() {
    global $pdo;
    $data = json_decode(file_get_contents('php://input'), true);
    $userId = intval($data['usuario_id'] ?? 0);
    if (!$userId) jsonResponse('error', 'usuario_id requerido');

    $pdo->prepare("DELETE FROM usuario_permisos WHERE usuario_id = ?")->execute([$userId]);
    jsonResponse('success', 'Permisos individuales eliminados (hereda del rol)');
}

// ============================================================================
// AUDITORÍA
// ============================================================================
function auditLog() {
    global $pdo;

    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = min(100, max(1, intval($_GET['per_page'] ?? 25)));
    $offset = ($page - 1) * $perPage;

    $where = 'WHERE 1=1';
    $params = [];

    $userId = intval($_GET['usuario_id'] ?? 0);
    if ($userId) { $where .= " AND ua.usuario_id = :uid"; $params[':uid'] = $userId; }

    $module = trim($_GET['modulo'] ?? '');
    if ($module) { $where .= " AND ua.entidad = :mod"; $params[':mod'] = $module; }

    $dateFrom = trim($_GET['date_from'] ?? '');
    if ($dateFrom) { $where .= " AND ua.fecha >= :df"; $params[':df'] = $dateFrom . ' 00:00:00'; }

    $dateTo = trim($_GET['date_to'] ?? '');
    if ($dateTo) { $where .= " AND ua.fecha <= :dt"; $params[':dt'] = $dateTo . ' 23:59:59'; }

    $countSql = "SELECT COUNT(*) FROM user_activity ua $where";
    $stmt = $pdo->prepare($countSql);
    $stmt->execute($params);
    $total = $stmt->fetchColumn();

    $sql = "SELECT ua.*, u.username, e.nombre, e.apellido
            FROM user_activity ua
            LEFT JOIN usuarios u ON ua.usuario_id = u.id
            LEFT JOIN empleados e ON u.empleado_id = e.id
            $where
            ORDER BY ua.fecha DESC
            LIMIT $perPage OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonResponse('success', '', [
        'items' => $items,
        'total' => intval($total),
        'page' => $page,
        'per_page' => $perPage,
        'total_pages' => ceil($total / $perPage),
    ]);
}

// ============================================================================
// SESIONES ACTIVAS
// ============================================================================
function activeSessions() {
    global $pdo;

    $stmt = $pdo->query("
        SELECT ua.usuario_id, u.username, e.nombre, e.apellido,
               MAX(ua.fecha) AS ultimo_acceso,
               COUNT(*) AS total_actividad
        FROM user_activity ua
        LEFT JOIN usuarios u ON ua.usuario_id = u.id
        LEFT JOIN empleados e ON u.empleado_id = e.id
        WHERE ua.fecha > DATE_SUB(NOW(), INTERVAL 8 HOUR)
        GROUP BY ua.usuario_id, u.username, e.nombre, e.apellido
        ORDER BY ultimo_acceso DESC
    ");

    jsonResponse('success', '', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function forceLogout() {
    global $pdo;
    $userId = intval($_POST['usuario_id'] ?? 0);
    if (!$userId) jsonResponse('error', 'usuario_id requerido');

    // Invalidar intento de login futuro reseteando bloqueo
    $pdo->prepare("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?")->execute([$userId]);

    // Registrar
    $current = $_SESSION['usuario_id'] ?? 0;
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $pdo->prepare("INSERT INTO user_activity (usuario_id, accion, entidad, entidad_id, detalle, ip, fecha)
                   VALUES (?, 'force_logout', 'usuario', ?, 'Forzado por admin', ?, NOW())")
        ->execute([$current, $userId, $ip]);

    jsonResponse('success', 'Sesión invalidada');
}

// ============================================================================
// CONFIGURACIÓN DEL SISTEMA
// ============================================================================
function getConfigList() {
    $data = getAllConfig();
    jsonResponse('success', '', is_array($data) ? $data : []);
}

function saveConfig() {
    global $pdo;
    $data = json_decode(file_get_contents('php://input'), true);
    if (!$data || !isset($data['configs'])) jsonResponse('error', 'Datos requeridos');

    $configs = $data['configs'];
    $saved = 0;
    foreach ($configs as $clave => $valor) {
        $stmt = $pdo->prepare("UPDATE config_sistema SET valor = ? WHERE clave = ?");
        if ($stmt->execute([(string)$valor, $clave])) $saved++;
    }

    jsonResponse('success', "{$saved} configuraciones guardadas");
}
