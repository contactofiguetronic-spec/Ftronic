<?php
// ============================================================================
// empleados_api.php — CRUD Empleados
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar', 'foto'];
if (in_array($action, $writeActions)) {
    requirePerm('empleados:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;

    // ── Datos de cuenta de usuario vinculada ──
    if ($action === 'usuario_data' && $id) {
        $stmt = $conn->prepare("
            SELECT u.id AS usuario_id, u.username, u.email, u.activo, u.ultimo_acceso,
                   ur.rol_id, r.nombre AS rol_nombre, r.nivel AS rol_nivel, r.color AS rol_color
            FROM usuarios u
            LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id AND ur.activo = 1
            LEFT JOIN roles r ON ur.rol_id = r.id
            WHERE u.empleado_id = ? AND u.tipo = 'empleado'
            LIMIT 1
        ");
        $stmt->execute([$id]);
        jsonResponse('success', 'OK', $stmt->fetch() ?: null);
    }

    // ── Lista de roles disponibles ──
    if ($action === 'roles') {
        $stmt = $conn->prepare("SELECT id, nombre, nivel, color, icono FROM roles WHERE activo = 1 ORDER BY nivel ASC");
        $stmt->execute();
        jsonResponse('success', 'OK', $stmt->fetchAll());
    }

    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM empleados WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('empleados', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['nombre','apellido','rut','cargo'], $p['search']);
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM empleados WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT em.id, em.nombre, em.apellido, em.rut, em.cargo, em.telefono, em.correo, em.creado,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='empleados' AND entidad_id=em.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM empleados em WHERE {$sw['where']}
                 ORDER BY em.creado DESC, em.nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($sw['params']);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

elseif ($method === 'POST') {
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            deleteMultimedia('empleados', (int)$id, $conn);
            historialInsert('empleados', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM empleados WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id     = $_POST['id'] ?? null;
        $rut    = sanitizeString($_POST['rut']    ?? '', 12);
        $correo = sanitizeString($_POST['correo'] ?? '', 150);

        requireFields($_POST, ['nombre']);
        if (!validateRutCL($rut))    jsonResponse('error', 'RUT inválido', null, 422);
        if (!validateEmail($correo)) jsonResponse('error', 'Email inválido', null, 422);

        $data = [
            ':nombre'              => sanitizeString($_POST['nombre'] ?? '', 100),
            ':apellido'            => sanitizeString($_POST['apellido'] ?? '', 100),
            ':rut'                 => $rut ?: null,
            ':telefono'            => sanitizeString($_POST['telefono'] ?? '', 20),
            ':correo'              => $correo ?: null,
            ':direccion'           => $_POST['direccion'] ?? '',
            ':cargo'               => sanitizeString($_POST['cargo'] ?? '', 100),
            ':sueldo'              => normalizeNullableDecimal($_POST['sueldo'] ?? null),
            ':fechaingreso'        => $_POST['fechaingreso'] ?? null,
            ':fecha_nacimiento'    => $_POST['fecha_nacimiento'] ?? null,
            ':banco'               => sanitizeString($_POST['banco'] ?? '', 100),
            ':cuentabancaria'      => sanitizeString($_POST['cuentabancaria'] ?? '', 50),
            ':facebook'            => sanitizeString($_POST['facebook'] ?? '', 150),
            ':instagram'           => sanitizeString($_POST['instagram'] ?? '', 150),
            ':descripcionlaboral'  => $_POST['descripcionlaboral'] ?? '',
            ':detalles_personales' => $_POST['detalles_personales'] ?? '',
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE empleados SET
                    nombre=:nombre, apellido=:apellido, rut=:rut, telefono=:telefono,
                    correo=:correo, direccion=:direccion, cargo=:cargo, sueldo=:sueldo,
                    fechaingreso=:fechaingreso, fecha_nacimiento=:fecha_nacimiento,
                    banco=:banco, cuentabancaria=:cuentabancaria,
                    facebook=:facebook, instagram=:instagram,
                    descripcionlaboral=:descripcionlaboral, detalles_personales=:detalles_personales
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO empleados
                    (nombre, apellido, rut, telefono, correo, direccion, cargo, sueldo,
                     fechaingreso, fecha_nacimiento, banco, cuentabancaria,
                     facebook, instagram, descripcionlaboral, detalles_personales)
                    VALUES
                    (:nombre, :apellido, :rut, :telefono, :correo, :direccion, :cargo, :sueldo,
                     :fechaingreso, :fecha_nacimiento, :banco, :cuentabancaria,
                     :facebook, :instagram, :descripcionlaboral, :detalles_personales)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'empleados', $record_id, $conn);
            }
            historialInsert('empleados', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);

            // ── Gestionar cuenta de usuario vinculada ──
            $username = trim($_POST['username'] ?? '');
            $password = $_POST['password'] ?? '';
            $rolId    = normalizeNullableInt($_POST['rol_select'] ?? null);
            $uActivo  = $_POST['usuario_activo'] ?? '1';

            if ($username !== '') {
                // Verificar que el username no esté en uso por OTRO usuario
                $stmtChk = $conn->prepare("SELECT id, empleado_id FROM usuarios WHERE username = ? LIMIT 1");
                $stmtChk->execute([$username]);
                $existing = $stmtChk->fetch();

                if ($existing && (int)$existing['empleado_id'] !== (int)$record_id) {
                    $conn->rollBack();
                    jsonResponse('error', "El nombre de usuario '{$username}' ya está en uso por otro empleado.", null, 422);
                }

                if ($existing) {
                    // Actualizar usuario existente
                    $uFields = ['activo' => $uActivo ? 1 : 0];
                    if ($password !== '' && strlen($password) >= 6) {
                        $uFields['password_hash'] = password_hash($password, PASSWORD_BCRYPT);
                    }
                    $setClauses = [];
                    $uParams = [];
                    foreach ($uFields as $k => $v) {
                        $setClauses[] = "{$k} = ?";
                        $uParams[] = $v;
                    }
                    $uParams[] = $existing['id'];
                    $conn->prepare("UPDATE usuarios SET " . implode(', ', $setClauses) . " WHERE id = ?")->execute($uParams);
                    $usuarioId = $existing['id'];
                } else {
                    // Crear nuevo usuario
                    if ($password === '' || strlen($password) < 6) {
                        $conn->rollBack();
                        jsonResponse('error', 'La contraseña debe tener al menos 6 caracteres.', null, 422);
                    }
                    $hash = password_hash($password, PASSWORD_BCRYPT);
                    $correo = $data[':correo'] ?? '';
                    $conn->prepare("INSERT INTO usuarios (username, password_hash, email, tipo, empleado_id, activo) VALUES (?, ?, ?, 'empleado', ?, ?)")
                         ->execute([$username, $hash, $correo ?: null, $record_id, $uActivo ? 1 : 0]);
                    $usuarioId = (int)$conn->lastInsertId();
                }

                // Asignar rol
                if ($rolId) {
                    $conn->prepare("INSERT INTO usuario_roles (usuario_id, rol_id, activo) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE activo = 1")
                         ->execute([$usuarioId, $rolId]);
                } else {
                    $conn->prepare("DELETE FROM usuario_roles WHERE usuario_id = ?")->execute([$usuarioId]);
                }
            }

            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}