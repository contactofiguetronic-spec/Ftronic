<?php
// ============================================================================
// auth_api.php — API de autenticación (login, logout, sesión actual)
// Figuetronic ERP — Julio 2026
// ============================================================================

require_once __DIR__ . '/../includes/conexion.php';
require_once __DIR__ . '/../includes/auth.php';

$action = $_REQUEST['action'] ?? '';

switch ($action) {

    // ─────────────────────────────────────────────
    // CHECK REGISTRATION (público, GET)
    // ─────────────────────────────────────────────
    case 'check_registration':
        $allowReg = getConfig('auth_allow_registration', '0');
        jsonResponse('success', '', ['enabled' => $allowReg === '1']);
        break;

    // ─────────────────────────────────────────────
    // LOGIN
    // ─────────────────────────────────────────────
    case 'login':
        $data = json_decode(file_get_contents('php://input'), true);
        $username = trim($data['username'] ?? $_POST['username'] ?? '');
        $password = $data['password'] ?? $_POST['password'] ?? '';

        if ($username === '' || $password === '') {
            jsonResponse('error', 'Usuario y contraseña son requeridos.', null, 400);
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $result = doLogin($username, $password, $ip, $ua);

        if ($result['ok']) {
            jsonResponse('success', 'Sesión iniciada correctamente.', $result['usuario']);
        } else {
            jsonResponse('error', $result['message'], null, 401);
        }
        break;

    // ─────────────────────────────────────────────
    // LOGOUT
    // ─────────────────────────────────────────────
    case 'logout':
        doLogout();
        jsonResponse('success', 'Sesión cerrada.');
        break;

    // ─────────────────────────────────────────────
    // SESIÓN ACTUAL (verificar si está logueado)
    // ─────────────────────────────────────────────
    case 'me':
        if (session_status() !== PHP_SESSION_ACTIVE) session_start();
        if (empty($_SESSION['usuario_id'])) {
            jsonResponse('error', 'No hay sesión activa.', null, 401);
        }
        // Refrescar timestamp de actividad
        $_SESSION['ultimo_activo'] = date('Y-m-d H:i:s');
        jsonResponse('success', 'Sesión activa.', currentUser());
        break;

    // ─────────────────────────────────────────────
    // CAMBIAR CONTRASEÑA
    // ─────────────────────────────────────────────
    case 'change_password':
        requireAuth();
        $data = json_decode(file_get_contents('php://input'), true);
        $current = $data['current_password'] ?? '';
        $newPass = $data['new_password'] ?? '';
        $confirm = $data['confirm_password'] ?? '';

        if ($current === '' || $newPass === '') {
            jsonResponse('error', 'Contraseña actual y nueva contraseña son requeridas.', null, 400);
        }
        if ($newPass !== $confirm) {
            jsonResponse('error', 'Las contraseñas nuevas no coinciden.', null, 400);
        }
        if (strlen($newPass) < 6) {
            jsonResponse('error', 'La contraseña debe tener al menos 6 caracteres.', null, 400);
        }

        $uid = $_SESSION['usuario_id'];
        $stmt = $conn->prepare("SELECT password_hash FROM usuarios WHERE id = ?");
        $stmt->execute([$uid]);
        $row = $stmt->fetch();

        if (!$row || !password_verify($current, $row['password_hash'])) {
            jsonResponse('error', 'La contraseña actual es incorrecta.', null, 403);
        }

        $hash = password_hash($newPass, PASSWORD_BCRYPT);
        $conn->prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?")->execute([$hash, $uid]);

        jsonResponse('success', 'Contraseña actualizada correctamente.');
        break;

    // ─────────────────────────────────────────────
    // ACTIVIDAD RECIENTE
    // ─────────────────────────────────────────────
    case 'activity':
        requireAuth();
        requirePerm('usuarios:ver');
        $limit = (int)($_GET['limit'] ?? 50);
        $limit = max(1, min(200, $limit));

        $stmt = $conn->prepare("
            SELECT ua.id, ua.accion, ua.entidad, ua.entidad_id, ua.detalle, ua.ip, ua.fecha,
                   u.username, u.email
            FROM user_activity ua
            LEFT JOIN usuarios u ON ua.usuario_id = u.id
            ORDER BY ua.fecha DESC
            LIMIT " . (int)$limit
        );
        $stmt->execute();
        jsonResponse('success', 'Actividad reciente.', $stmt->fetchAll());
        break;

    // ─────────────────────────────────────────────
    // SOLICITAR REGISTRO (público, sin auth)
    // ─────────────────────────────────────────────
    case 'solicitar_registro':
        // Verificar si el registro está habilitado
        $allowReg = getConfig('auth_allow_registration', '0');
        if ($allowReg !== '1') {
            jsonResponse('error', 'El registro de nuevas cuentas no está habilitado actualmente.', null, 403);
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data) $data = $_POST;

        $nombre   = trim($data['nombre'] ?? '');
        $apellido = trim($data['apellido'] ?? '');
        $email    = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $telefono = trim($data['telefono'] ?? '');
        $rut      = trim($data['rut'] ?? '');
        $empresa  = trim($data['empresa'] ?? '');
        $motivo   = trim($data['motivo'] ?? '');

        // Validaciones básicas
        if ($nombre === '' || $apellido === '' || $email === '' || $password === '') {
            jsonResponse('error', 'Nombre, apellido, email y contraseña son requeridos.', null, 400);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse('error', 'El formato del email no es válido.', null, 400);
        }

        $minLen = (int)getConfig('auth_password_min_length', 6);
        if (strlen($password) < $minLen) {
            jsonResponse('error', "La contraseña debe tener al menos {$minLen} caracteres.", null, 400);
        }

        // Verificar email no exista en usuarios activos
        $stmt = $conn->prepare("SELECT id FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1");
        $stmt->execute([$email]);
        $emailExists = $stmt->fetch() !== false;

        // Verificar no haya solicitud pendiente con este email
        $stmt = $conn->prepare("SELECT id FROM solicitudes_registro WHERE email = ? AND estado = 'pendiente' LIMIT 1");
        $stmt->execute([$email]);
        $pendingExists = $stmt->fetch() !== false;

        if ($emailExists || $pendingExists) {
            jsonResponse('success', 'Si el email es válido, recibirá una notificación cuando su solicitud sea revisada.', null, 200);
        }

        // Insertar solicitud
        $stmt = $conn->prepare("
            INSERT INTO solicitudes_registro (nombre, apellido, email, telefono, rut, empresa, motivo, campos_extra)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $nombre, $apellido, $email,
            $telefono ?: null, $rut ?: null, $empresa ?: null,
            $motivo ?: null,
            json_encode(array_filter(['telefono' => $telefono, 'rut' => $rut, 'empresa' => $empresa, 'motivo' => $motivo]))
        ]);

        jsonResponse('success', 'Solicitud de registro enviada correctamente. El administrador revisará su solicitud y le notificará por email.');
        break;

    default:
        jsonResponse('error', 'Acción no válida: ' . $action, null, 400);
}
