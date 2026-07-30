<?php
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso — escritura: delete + cualquier POST
$writeActions = ['delete'];
if (in_array($action, $writeActions) || $_SERVER['REQUEST_METHOD'] === 'POST') {
    requirePerm('zonas_taller:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM zonas_taller WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('zonas_taller', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['nombre', 'descripcion'], $p['search']);
            $countSql = "SELECT COUNT(*) FROM zonas_taller WHERE {$sw['where']}";
            $stmtC = $conn->prepare($countSql);
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT z.*,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='zonas_taller' AND entidad_id=z.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM zonas_taller z
                 WHERE {$sw['where']}
                 ORDER BY z.nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($sw['params']);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
} elseif ($method === 'POST') {
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            historialInsert('zonas_taller', $id, 'eliminado', null, null, null, $conn);
            deleteMultimedia('zonas_taller', (int)$id, $conn);
            $conn->prepare("DELETE FROM zonas_taller WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id          = $_POST['id'] ?? null;
        $nombre      = sanitizeString($_POST['nombre'] ?? '', 100);
        $descripcion = sanitizeString($_POST['descripcion'] ?? '', 0);

        requireFields($_POST, ['nombre']);

        $data = [
            ':nombre'      => $nombre,
            ':descripcion' => $descripcion ?: null,
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE zonas_taller SET nombre=:nombre, descripcion=:descripcion WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO zonas_taller (nombre, descripcion) VALUES (:nombre, :descripcion)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Zona creada exitosamente.';
            }

            historialInsert('zonas_taller', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'zonas_taller', $record_id, $conn);
            }

            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
