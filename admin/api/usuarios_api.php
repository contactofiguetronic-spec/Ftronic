<?php
require_once '../includes/conexion.php';
requireAuth();
header('Content-Type: application/json; charset=utf-8');

$action = $_REQUEST['action'] ?? '';

// Acciones de escritura requieren permiso
$writeActions = ['save', 'save_cuenta', 'save_permisos', 'delete'];
if (in_array($action, $writeActions)) {
    requirePerm('usuarios:editar');
}

switch ($action) {
    case 'usuarios': listUsuarios(); break;
    case 'usuario': getUsuario(); break;
    case 'roles': listRoles(); break;
    case 'role_permisos': getRolePermisos(); break;
    case 'permisos': getPermisos(); break;
    case 'save': saveUsuario(); break;
    case 'save_cuenta': saveCuenta(); break;
    case 'save_permisos': savePermisos(); break;
    case 'delete': deleteUsuario(); break;
    case 'activity': getActivity(); break;
    case 'solicitudes': listSolicitudes(); break;
    case 'solicitud': getSolicitud(); break;
    case 'aprobar_solicitud': aprobarSolicitud(); break;
    case 'rechazar_solicitud': rechazarSolicitud(); break;
    case 'solicitudes_count': solicitudesCount(); break;
    default: jsonResponse('error', 'Acción no válida');
}

function listUsuarios() {
    global $pdo;
    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = min(100, max(1, intval($_GET['per_page'] ?? 12)));
    $search = trim($_GET['search'] ?? '');
    $offset = ($page - 1) * $perPage;

    $where = 'WHERE 1=1';
    $params = [];
    if ($search) {
        $where .= " AND (u.username LIKE :s1 OR u.email LIKE :s2 OR e.nombre LIKE :s3 OR e.apellido LIKE :s4 OR e.rut LIKE :s5)";
        $s = "%$search%";
        $params[':s1'] = $s; $params[':s2'] = $s; $params[':s3'] = $s; $params[':s4'] = $s; $params[':s5'] = $s;
    }

    $countSql = "SELECT COUNT(*) FROM usuarios u LEFT JOIN empleados e ON u.empleado_id = e.id $where";
    $stmt = $pdo->prepare($countSql);
    $stmt->execute($params);
    $total = $stmt->fetchColumn();

    $sql = "SELECT u.id, u.username, u.email, u.tipo, u.activo, u.ultimo_acceso,
                   e.nombre, e.apellido, e.telefono, e.rut, e.correo,
                   (SELECT r.nombre FROM usuario_roles ur2 JOIN roles r ON ur2.rol_id = r.id WHERE ur2.usuario_id = u.id AND ur2.activo = 1 ORDER BY r.nivel ASC LIMIT 1) AS rol_nombre,
                   (SELECT r.id FROM usuario_roles ur2 JOIN roles r ON ur2.rol_id = r.id WHERE ur2.usuario_id = u.id AND ur2.activo = 1 ORDER BY r.nivel ASC LIMIT 1) AS rol_id,
                   (SELECT r.nivel FROM usuario_roles ur2 JOIN roles r ON ur2.rol_id = r.id WHERE ur2.usuario_id = u.id AND ur2.activo = 1 ORDER BY r.nivel ASC LIMIT 1) AS rol_nivel
            FROM usuarios u
            LEFT JOIN empleados e ON u.empleado_id = e.id
            $where
            ORDER BY e.nombre ASC, u.username ASC
            LIMIT $perPage OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonResponse('success', '', [
        'items' => $items,
        'total' => intval($total),
        'page' => $page,
        'per_page' => $perPage,
        'total_pages' => ceil($total / $perPage)
    ]);
}

function getUsuario() {
    global $pdo;
    $id = intval($_GET['id'] ?? 0);
    if (!$id) jsonResponse('error', 'ID requerido');

    $stmt = $pdo->prepare("SELECT u.id, u.username, u.email, u.tipo, u.empleado_id, u.cliente_id,
                                  u.activo, u.intentos_fallidos, u.bloqueado_hasta, u.ultimo_acceso,
                                  e.nombre, e.apellido, e.telefono, e.rut, e.correo, e.cargo,
                                  r.nombre AS rol_nombre, r.id AS rol_id, r.nivel AS nivel
                           FROM usuarios u
                           LEFT JOIN empleados e ON u.empleado_id = e.id
                           LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id AND ur.activo = 1
                           LEFT JOIN roles r ON ur.rol_id = r.id
                           WHERE u.id = ?");
    $stmt->execute([$id]);
    $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$u) jsonResponse('error', 'Usuario no encontrado');

    unset($u['password_hash']);
    jsonResponse('success', '', $u);
}

function listRoles() {
    global $pdo;
    $stmt = $pdo->query("SELECT r.*, (SELECT COUNT(*) FROM role_permisos WHERE rol_id = r.id AND activo = 1) AS permisos_count
                         FROM roles r WHERE r.activo = 1 ORDER BY r.nivel ASC");
    jsonResponse('success', '', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function getRolePermisos() {
    global $pdo;
    $rolId = intval($_GET['rol_id'] ?? 0);
    if (!$rolId) jsonResponse('error', 'rol_id requerido');
    $stmt = $pdo->prepare("SELECT CONCAT(p.modulo, ':', p.accion) AS permiso
                           FROM role_permisos rp
                           JOIN permisos p ON rp.permiso_id = p.id
                           WHERE rp.rol_id = ? AND rp.activo = 1");
    $stmt->execute([$rolId]);
    jsonResponse('success', '', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function getPermisos() {
    global $pdo;
    $userId = intval($_GET['usuario_id'] ?? 0);

    $stmt = $pdo->query("SELECT DISTINCT modulo, accion, CONCAT(modulo, ':', accion) AS permiso, IFNULL(descripcion, accion) AS descripcion, IFNULL(categoria, modulo) AS categoria FROM permisos ORDER BY modulo, accion");
    $all = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $user = [];
    $role = [];
    if ($userId) {
        try {
            $stmt = $pdo->prepare("SELECT permiso FROM usuario_permisos WHERE usuario_id = ?");
            $stmt->execute([$userId]);
            $user = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {}

        // Load role permissions via usuario_roles → role_permisos
        try {
            $stmt = $pdo->prepare("
                SELECT CONCAT(p.modulo, ':', p.accion) AS permiso
                FROM usuario_roles ur
                JOIN role_permisos rp ON rp.rol_id = ur.rol_id AND rp.activo = 1
                JOIN permisos p ON p.id = rp.permiso_id
                WHERE ur.usuario_id = ? AND ur.activo = 1
            ");
            $stmt->execute([$userId]);
            $role = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (PDOException $e) {}
    }

    jsonResponse('success', '', ['all' => $all, 'user' => $user, 'role' => $role]);
}

function saveUsuario() {
    global $pdo;

    $id = intval($_POST['id'] ?? 0);
    $nombre = trim($_POST['nombre'] ?? '');
    $apellido = trim($_POST['apellido'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $telefono = trim($_POST['telefono'] ?? '');

    if (!$nombre) jsonResponse('error', 'Nombre requerido');

    if ($id) {
        $stmt = $pdo->prepare("SELECT empleado_id FROM usuarios WHERE id = ?");
        $stmt->execute([$id]);
        $empId = $stmt->fetchColumn();

        if ($empId) {
            $stmt = $pdo->prepare("UPDATE empleados SET nombre=?, apellido=?, telefono=? WHERE id=?");
            $stmt->execute([$nombre, $apellido, $telefono, $empId]);
        }
        $stmt = $pdo->prepare("UPDATE usuarios SET email=? WHERE id=?");
        $stmt->execute([$email, $id]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO empleados (nombre, apellido, correo, telefono) VALUES (?, ?, ?, ?)");
        $stmt->execute([$nombre, $apellido, $email, $telefono]);
        $empleadoId = $pdo->lastInsertId();

        $username = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $nombre . ($apellido ? $apellido[0] : '')));
        // Generar password temporal aleatorio (8 caracteres)
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        $tempPwd = '';
        for ($i = 0; $i < 8; $i++) $tempPwd .= $chars[random_int(0, strlen($chars) - 1)];
        $hash = password_hash($tempPwd, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO usuarios (empleado_id, username, email, password_hash, tipo) VALUES (?, ?, ?, ?, 'empleado')");
        $stmt->execute([$empleadoId, $username, $email, $hash]);
        $id = $pdo->lastInsertId();
    }

    jsonResponse('success', 'Usuario guardado', ['id' => $id]);
}

function saveCuenta() {
    global $pdo;

    $userId = intval($_POST['usuario_id'] ?? 0);
    if (!$userId) jsonResponse('error', 'usuario_id requerido');

    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $rolId = intval($_POST['rol_id'] ?? 0);
    $activo = intval($_POST['activo'] ?? 1);

    if (!$username) jsonResponse('error', 'Username requerido');

    $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE username = ? AND id != ?");
    $stmt->execute([$username, $userId]);
    if ($stmt->fetch()) jsonResponse('error', 'Username ya en uso');

    $pdo->beginTransaction();
    try {
        if ($password) {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE usuarios SET username=?, password_hash=?, activo=? WHERE id=?");
            $stmt->execute([$username, $hash, $activo, $userId]);
        } else {
            $stmt = $pdo->prepare("UPDATE usuarios SET username=?, activo=? WHERE id=?");
            $stmt->execute([$username, $activo, $userId]);
        }

        $stmt = $pdo->prepare("DELETE FROM usuario_roles WHERE usuario_id = ?");
        $stmt->execute([$userId]);
        if ($rolId) {
            $stmt = $pdo->prepare("INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)");
            $stmt->execute([$userId, $rolId]);
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse('error', 'Error al guardar cuenta: ' . $e->getMessage());
    }

    jsonResponse('success', 'Cuenta actualizada');
}

function savePermisos() {
    global $pdo;

    $userId = intval($_POST['usuario_id'] ?? 0);
    if (!$userId) jsonResponse('error', 'usuario_id requerido');

    $permisos = json_decode($_POST['permisos'] ?? '[]', true);
    if (!is_array($permisos)) jsonResponse('error', 'Formato inválido');

    try {
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM usuario_permisos WHERE usuario_id = ?")->execute([$userId]);

        if ($permisos) {
            $stmt = $pdo->prepare("INSERT INTO usuario_permisos (usuario_id, permiso) VALUES (?, ?)");
            foreach ($permisos as $p) {
                $stmt->execute([$userId, $p]);
            }
        }
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        jsonResponse('error', 'Error al guardar permisos. (' . substr($e->getMessage(), 0, 100) . ')');
    }

    jsonResponse('success', 'Permisos guardados');
}

function deleteUsuario() {
    global $pdo;

    $id = intval($_POST['id'] ?? 0);
    if (!$id) jsonResponse('error', 'ID requerido');

    $currentUser = $_SESSION['usuario_id'] ?? null;
    if ($id == $currentUser) jsonResponse('error', 'No puede eliminar su propio usuario.');

    try { $pdo->prepare("DELETE FROM usuario_permisos WHERE usuario_id = ?")->execute([$id]); } catch (PDOException $e) {}
    $pdo->prepare("DELETE FROM usuario_roles WHERE usuario_id = ?")->execute([$id]);
    $pdo->prepare("DELETE FROM user_activity WHERE usuario_id = ?")->execute([$id]);
    $pdo->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$id]);

    jsonResponse('success', 'Usuario eliminado');
}

function getActivity() {
    global $pdo;
    $userId = intval($_GET['usuario_id'] ?? 0);
    if (!$userId) jsonResponse('error', 'usuario_id requerido');

    $stmt = $pdo->prepare("SELECT * FROM user_activity WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 50");
    $stmt->execute([$userId]);
    $activities = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonResponse('success', '', $activities);
}

// ============================================================================
// SOLICITUDES DE REGISTRO
// ============================================================================

function listSolicitudes() {
    global $pdo;
    requirePerm('solicitudes_registro:ver');

    $estado = trim($_GET['estado'] ?? 'pendiente');
    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = min(100, max(1, intval($_GET['per_page'] ?? 20)));
    $offset = ($page - 1) * $perPage;

    $where = 'WHERE 1=1';
    $params = [];
    if ($estado) {
        $where .= ' AND sr.estado = :estado';
        $params[':estado'] = $estado;
    }

    try {
        $countSql = "SELECT COUNT(*) FROM solicitudes_registro sr $where";
        $stmt = $pdo->prepare($countSql);
        $stmt->execute($params);
        $total = $stmt->fetchColumn();

        $sql = "SELECT sr.*,
                       admin_usr.username AS admin_username,
                       CONCAT(adm_e.nombre, ' ', adm_e.apellido) AS admin_nombre,
                       created_usr.username AS usuario_creado_username
                FROM solicitudes_registro sr
                LEFT JOIN usuarios admin_usr ON sr.admin_id = admin_usr.id
                LEFT JOIN empleados adm_e ON admin_usr.empleado_id = adm_e.id
                LEFT JOIN usuarios created_usr ON sr.usuario_creado_id = created_usr.id
                $where
                ORDER BY sr.creado DESC
                LIMIT $perPage OFFSET $offset";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        jsonResponse('error', 'La tabla solicitudes_registro no existe. Ejecute las migraciones SQL.');
    }

    jsonResponse('success', '', [
        'items' => $items,
        'total' => intval($total),
        'page' => $page,
        'per_page' => $perPage,
        'total_pages' => ceil($total / $perPage)
    ]);
}

function getSolicitud() {
    global $pdo;
    requirePerm('solicitudes_registro:ver');

    $id = intval($_GET['id'] ?? 0);
    if (!$id) jsonResponse('error', 'ID requerido');

    try {
        $stmt = $pdo->prepare("SELECT * FROM solicitudes_registro WHERE id = ?");
        $stmt->execute([$id]);
        $sol = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        jsonResponse('error', 'Tabla solicitudes_registro no existe. Ejecute las migraciones SQL.');
    }
    if (!$sol) jsonResponse('error', 'Solicitud no encontrada');

    jsonResponse('success', '', $sol);
}

function aprobarSolicitud() {
    global $pdo;
    requirePerm('solicitudes_registro:aprobar');

    $data = json_decode(file_get_contents('php://input'), true);
    $solId = intval($data['id'] ?? 0);
    $rolId = intval($data['rol_id'] ?? 0);
    $username = trim($data['username'] ?? '');
    $password = $data['password'] ?? '';
    $adminId = $_SESSION['usuario_id'] ?? null;

    if (!$solId) jsonResponse('error', 'ID de solicitud requerido');
    if (!$rolId) jsonResponse('error', 'Debe seleccionar un rol');
    if (!$password || strlen($password) < 6) jsonResponse('error', 'La contraseña debe tener al menos 6 caracteres');

    // Obtener solicitud
    $stmt = $pdo->prepare("SELECT * FROM solicitudes_registro WHERE id = ? AND estado = 'pendiente'");
    $stmt->execute([$solId]);
    $sol = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$sol) jsonResponse('error', 'Solicitud no encontrada o ya procesada');

    // Generar username si está vacío
    if (!$username) {
        $username = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $sol['nombre'] . ($sol['apellido'] ? $sol['apellido'][0] : '')));
    }

    // Verificar username único
    $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonResponse('error', "El username '{$username}' ya está en uso. Elija otro.");
    }

    $pdo->beginTransaction();
    try {
        // 1. Crear empleado
        $stmt = $pdo->prepare("INSERT INTO empleados (nombre, apellido, correo, telefono, rut) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$sol['nombre'], $sol['apellido'], $sol['email'], $sol['telefono'] ?: null, $sol['rut'] ?: null]);
        $empleadoId = $pdo->lastInsertId();

        // 2. Crear usuario
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO usuarios (empleado_id, username, email, password_hash, tipo, activo) VALUES (?, ?, ?, ?, 'empleado', 1)");
        $stmt->execute([$empleadoId, $username, $sol['email'], $hash]);
        $usuarioId = $pdo->lastInsertId();

        // 3. Asignar rol
        $stmt = $pdo->prepare("INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES (?, ?, ?)");
        $stmt->execute([$usuarioId, $rolId, $adminId]);

        // 4. Actualizar solicitud
        $stmt = $pdo->prepare("UPDATE solicitudes_registro SET estado = 'aprobada', admin_id = ?, usuario_creado_id = ?, revisado = NOW() WHERE id = ?");
        $stmt->execute([$adminId, $usuarioId, $solId]);

        // 5. Log de actividad
        if (function_exists('historialInsert')) {
            historialInsert('solicitudes_registro', $solId, 'aprobar', null, null, "Aprobó solicitud de {$sol['nombre']} {$sol['apellido']} ({$sol['email']}) — Usuario creado: {$username}");
        }

        $pdo->commit();
        jsonResponse('success', "Usuario '{$username}' creado exitosamente. La solicitud ha sido aprobada.", ['usuario_id' => $usuarioId, 'username' => $username]);
    } catch (Exception $e) {
        $pdo->rollBack();
        jsonResponse('error', 'Error al crear usuario: ' . $e->getMessage());
    }
}

function rechazarSolicitud() {
    global $pdo;
    requirePerm('solicitudes_registro:rechazar');

    $data = json_decode(file_get_contents('php://input'), true);
    $solId = intval($data['id'] ?? 0);
    $motivo = trim($data['motivo'] ?? '');
    $adminId = $_SESSION['usuario_id'] ?? null;

    if (!$solId) jsonResponse('error', 'ID de solicitud requerido');

    $stmt = $pdo->prepare("UPDATE solicitudes_registro SET estado = 'rechazada', admin_id = ?, motivo_rechazo = ?, revisado = NOW() WHERE id = ? AND estado = 'pendiente'");
    $stmt->execute([$adminId, $motivo ?: null, $solId]);

    if ($stmt->rowCount() === 0) {
        jsonResponse('error', 'Solicitud no encontrada o ya procesada');
    }

    jsonResponse('success', 'Solicitud rechazada.');
}

function solicitudesCount() {
    global $pdo;
    requirePerm('solicitudes_registro:ver');

    try {
        $stmt = $pdo->query("SELECT COUNT(*) FROM solicitudes_registro WHERE estado = 'pendiente'");
        $count = $stmt->fetchColumn();
    } catch (PDOException $e) {
        jsonResponse('success', '', ['pendientes' => 0]);
        return;
    }

    jsonResponse('success', '', ['pendientes' => intval($count)]);
}
