<?php
// ============================================================================
// trabajos_servicios_api.php — CRUD Trabajos y Servicios
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('trabajos_servicios:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM trabajos_servicios WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('trabajos_servicios', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['nombre', 'tipo', 'descripcion'], $p['search']);
            
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM trabajos_servicios WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT id, nombre, descripcion, tipo, tiempo_implementar, valor_trabajo
                 FROM trabajos_servicios WHERE {$sw['where']}
                 ORDER BY nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
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
            historialInsert('trabajos_servicios', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM trabajos_servicios WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id = $_POST['id'] ?? null;
        requireFields($_POST, ['nombre', 'valor_trabajo']);

        $data = [
            ':nombre'             => sanitizeString($_POST['nombre'] ?? '', 150),
            ':descripcion'        => $_POST['descripcion'] ?? '',
            ':tipo'               => sanitizeString($_POST['tipo'] ?? '', 50),
            ':tiempo_implementar' => sanitizeString($_POST['tiempo_implementar'] ?? '', 50),
            ':valor_trabajo'      => normalizeNullableDecimal($_POST['valor_trabajo'] ?? 0),
        ];

        try {
            if ($id) {
                $sql = "UPDATE trabajos_servicios SET
                    nombre=:nombre, descripcion=:descripcion, tipo=:tipo,
                    tiempo_implementar=:tiempo_implementar, valor_trabajo=:valor_trabajo
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO trabajos_servicios
                    (nombre, descripcion, tipo, tiempo_implementar, valor_trabajo)
                    VALUES
                    (:nombre, :descripcion, :tipo, :tiempo_implementar, :valor_trabajo)";
                $conn->prepare($sql)->execute($data);
                $msg = 'Guardado exitosamente.';
            }
            historialInsert('trabajos_servicios', $id ?? $conn->lastInsertId(), $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            jsonResponse('success', $msg);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
