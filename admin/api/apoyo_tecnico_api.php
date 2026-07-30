<?php
// ============================================================================
// apoyo_tecnico_api.php — CRUD Base de Conocimiento / Apoyo Técnico
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso — escritura: delete + update_estado + cualquier POST
$writeActions = ['delete', 'update_estado'];
if (in_array($action, $writeActions) || $_SERVER['REQUEST_METHOD'] === 'POST') {
    requirePerm('apoyo_tecnico:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $modo = $_GET['modo'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM apoyo_tecnico WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('apoyo_tecnico', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $whereExtra = '';
            $paramsExtra = [];
            if ($modo && in_array($modo, ['conocimiento', 'soporte'])) {
                $whereExtra = ' AND modo = ?';
                $paramsExtra[] = $modo;
            }
            $sw = buildSearchWhere(['nombre', 'vehiculo_marca', 'vehiculo_modelo', 'tipo', 'descripcion', 'responsable'], $p['search']);
            $fullWhere = $sw['where'] . $whereExtra;
            $fullParams = array_merge($sw['params'], $paramsExtra);

            $stmtC = $conn->prepare("SELECT COUNT(*) FROM apoyo_tecnico WHERE {$fullWhere}");
            $stmtC->execute($fullParams);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT id, nombre, vehiculo_marca, vehiculo_modelo, tipo, descripcion, modo, ot_id, proveedor_id, estado, prioridad, responsable, creado
                 FROM apoyo_tecnico WHERE {$fullWhere}
                 ORDER BY FIELD(prioridad, 'alta', 'normal', 'baja'), creado DESC, id DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($fullParams);
            $items = $stmt->fetchAll();
            // Attach first photo for each record (card thumbnails)
            if ($items) {
                $ids = array_column($items, 'id');
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $mStmt = $conn->prepare(
                    "SELECT entidad_id, ruta_archivo, tipo_archivo FROM archivos_multimedia
                     WHERE entidad_tipo = 'apoyo_tecnico' AND entidad_id IN ({$placeholders})
                     AND tipo_archivo = 'foto' ORDER BY creado ASC"
                );
                $mStmt->execute($ids);
                $mediaMap = [];
                foreach ($mStmt->fetchAll() as $m) {
                    if (!isset($mediaMap[$m['entidad_id']])) $mediaMap[$m['entidad_id']] = $m;
                }
                foreach ($items as &$item) {
                    $item['archivos'] = isset($mediaMap[$item['id']]) ? [$mediaMap[$item['id']]] : [];
                }
                unset($item);
            }
            paginatedResponse($items, $total, $p);
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
            deleteMultimedia('apoyo_tecnico', (int)$id, $conn);
            historialInsert('apoyo_tecnico', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM apoyo_tecnico WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'update_estado') {
        $id = (int)($_POST['id'] ?? 0);
        $estado = $_POST['estado'] ?? '';
        if (!$id || !$estado) jsonResponse('error', 'ID y estado requeridos', null, 422);
        $allowed = ['borrador', 'pendiente', 'en_proceso', 'resuelto', 'cerrado'];
        if (!in_array($estado, $allowed)) jsonResponse('error', 'Estado no válido', null, 422);
        try {
            $conn->prepare("UPDATE apoyo_tecnico SET estado = ? WHERE id = ?")->execute([$estado, $id]);
            historialInsert('apoyo_tecnico', $id, 'actualizado', 'estado', null, $estado, $conn);
            jsonResponse('success', 'Estado actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id = $_POST['id'] ?? null;
        requireFields($_POST, ['nombre']);

        $data = [
            ':nombre'           => sanitizeString($_POST['nombre'] ?? '', 255),
            ':vehiculo_marca'   => sanitizeString($_POST['vehiculo_marca'] ?? $_POST['marca'] ?? '', 100),
            ':vehiculo_modelo'  => sanitizeString($_POST['vehiculo_modelo'] ?? $_POST['modelo'] ?? '', 100),
            ':vehiculo_id'      => normalizeNullableInt($_POST['vehiculo_id'] ?? null),
            ':tipo'             => sanitizeString($_POST['tipo'] ?? '', 100),
            ':descripcion'      => $_POST['descripcion'] ?? '',
            ':modo'             => in_array($_POST['modo'] ?? '', ['conocimiento', 'soporte']) ? $_POST['modo'] : 'conocimiento',
            ':ot_id'            => normalizeNullableInt($_POST['ot_id'] ?? null),
            ':proveedor_id'     => normalizeNullableInt($_POST['proveedor_id'] ?? null),
            ':estado'           => in_array($_POST['estado'] ?? '', ['borrador','pendiente','en_proceso','resuelto','cerrado']) ? $_POST['estado'] : 'borrador',
            ':prioridad'        => in_array($_POST['prioridad'] ?? '', ['baja','normal','alta']) ? $_POST['prioridad'] : 'normal',
            ':responsable'      => sanitizeString($_POST['responsable'] ?? '', 150),
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE apoyo_tecnico SET
                    nombre=:nombre, vehiculo_marca=:vehiculo_marca,
                    vehiculo_modelo=:vehiculo_modelo, vehiculo_id=:vehiculo_id, tipo=:tipo, descripcion=:descripcion,
                    modo=:modo, ot_id=:ot_id, proveedor_id=:proveedor_id,
                    estado=:estado, prioridad=:prioridad, responsable=:responsable
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO apoyo_tecnico
                    (nombre, vehiculo_marca, vehiculo_modelo, vehiculo_id, tipo, descripcion, modo, ot_id, proveedor_id, estado, prioridad, responsable)
                    VALUES
                    (:nombre, :vehiculo_marca, :vehiculo_modelo, :vehiculo_id, :tipo, :descripcion, :modo, :ot_id, :proveedor_id, :estado, :prioridad, :responsable)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'apoyo_tecnico', $record_id, $conn);
            }
            historialInsert('apoyo_tecnico', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
