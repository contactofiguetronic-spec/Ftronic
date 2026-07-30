<?php
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso — escritura: delete + cualquier POST
$writeActions = ['delete'];
if (in_array($action, $writeActions) || $_SERVER['REQUEST_METHOD'] === 'POST') {
    requirePerm('inventario_taller:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT it.*, zt.nombre AS zona_nombre
                 FROM inventario_taller it
                 LEFT JOIN zonas_taller zt ON it.zona_taller_id = zt.id
                 WHERE it.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('inventario_taller', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['it.nombre', 'it.identificacion', 'it.categoria', 'zt.nombre'], $p['search'], 'it');
            $countSql = "SELECT COUNT(*) FROM inventario_taller it LEFT JOIN zonas_taller zt ON it.zona_taller_id = zt.id WHERE {$sw['where']}";
            $stmtC = $conn->prepare($countSql);
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT it.id, it.identificacion, it.nombre, it.zona_taller_id, it.categoria,
                        it.detalles, it.utilidad, it.precio_avaluado, it.creado,
                        zt.nombre AS zona_nombre,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='inventario_taller' AND entidad_id=it.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM inventario_taller it
                 LEFT JOIN zonas_taller zt ON it.zona_taller_id = zt.id
                 WHERE {$sw['where']}
                 ORDER BY it.creado DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
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
            historialInsert('inventario_taller', $id, 'eliminado', null, null, null, $conn);
            deleteMultimedia('inventario_taller', (int)$id, $conn);
            $conn->prepare("DELETE FROM inventario_taller WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id              = $_POST['id'] ?? null;
        $nombre          = sanitizeString($_POST['nombre'] ?? '', 150);
        $zona_taller_id  = normalizeNullableInt($_POST['zona_taller_id'] ?? null);
        $categoria       = sanitizeString($_POST['categoria'] ?? '', 100);
        $detalles        = sanitizeString($_POST['detalles'] ?? '', 0);
        $utilidad        = sanitizeString($_POST['utilidad'] ?? '', 0);
        $precio_avaluado = normalizeNullableDecimal($_POST['precio_avaluado'] ?? null) ?? 0;

        requireFields($_POST, ['nombre']);

        $data = [
            ':nombre'          => $nombre,
            ':zona_taller_id'  => $zona_taller_id,
            ':categoria'       => $categoria ?: null,
            ':detalles'        => $detalles ?: null,
            ':utilidad'        => $utilidad ?: null,
            ':precio_avaluado' => $precio_avaluado,
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE inventario_taller SET
                        nombre=:nombre, zona_taller_id=:zona_taller_id, categoria=:categoria,
                        detalles=:detalles, utilidad=:utilidad, precio_avaluado=:precio_avaluado
                        WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO inventario_taller
                        (nombre, zona_taller_id, categoria, detalles, utilidad, precio_avaluado)
                        VALUES
                        (:nombre, :zona_taller_id, :categoria, :detalles, :utilidad, :precio_avaluado)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                // Obtener identificación generada por trigger
                $stmtId = $conn->prepare("SELECT identificacion FROM inventario_taller WHERE id = ?");
                $stmtId->execute([$record_id]);
                $identificacion = $stmtId->fetchColumn();
                $msg = 'Artículo inventariado exitosamente.';
            }

            historialInsert('inventario_taller', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'inventario_taller', $record_id, $conn);
            }

            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id, 'identificacion' => $identificacion ?? null]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
