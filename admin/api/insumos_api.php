<?php
// ============================================================================
// insumos_api.php — CRUD Insumos
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('insumos:editar');
}

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT i.*, p.nombre AS proveedor_nombre
                 FROM insumos i
                 LEFT JOIN proveedores p ON i.proveedor_id = p.id
                 WHERE i.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('insumos', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['i.nombre', 'i.formato', 'p.nombre'], $p['search']);
            $countSql = "SELECT COUNT(*) FROM insumos i LEFT JOIN proveedores p ON i.proveedor_id = p.id WHERE {$sw['where']}";
            $stmtC = $conn->prepare($countSql);
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            
            $stmt = $conn->prepare(
                "SELECT i.id, i.nombre, i.proveedor_id, i.formato, i.valor_compra, 
                        i.valor_venta, i.stock, i.stock_minimo, i.ubicacion, i.creado,
                        p.nombre AS proveedor_nombre,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='insumos' AND entidad_id=i.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM insumos i
                 LEFT JOIN proveedores p ON i.proveedor_id = p.id
                 WHERE {$sw['where']}
                 ORDER BY i.nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($sw['params']);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

// ── POST ─────────────────────────────────────────────────────────────────────
elseif ($method === 'POST') {
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            historialInsert('insumos', $id, 'eliminado', null, null, null, $conn);
            deleteMultimedia('insumos', (int)$id, $conn);
            $conn->prepare("DELETE FROM insumos WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id           = $_POST['id'] ?? null;
        $nombre       = sanitizeString($_POST['nombre'] ?? '', 150);
        $proveedor_id = normalizeNullableInt($_POST['proveedor_id'] ?? null);
        $formato      = sanitizeString($_POST['formato'] ?? '', 50);
        $valor_compra = normalizeNullableDecimal($_POST['valor_compra'] ?? null);
        $valor_venta  = normalizeNullableDecimal($_POST['valor_venta'] ?? null);
        $stock        = normalizeNullableInt($_POST['stock_actual'] ?? $_POST['stock'] ?? null) ?? 0;
        $stock_minimo = normalizeNullableInt($_POST['stock_minimo'] ?? null) ?? 0;

        requireFields($_POST, ['nombre']);

        $data = [
            ':nombre'       => $nombre,
            ':proveedor_id' => $proveedor_id,
            ':formato'      => $formato,
            ':valor_compra' => $valor_compra,
            ':valor_venta'  => $valor_venta,
            ':stock'        => $stock,
            ':stock_minimo' => $stock_minimo,
        ];

        try {
            $conn->beginTransaction();
            // Leer stock anterior ANTES del update para detectar cambios
            $stockActual = (int)($_POST['stock_actual'] ?? $_POST['stock'] ?? 0);
            $oldStock = 0;
            if ($id) {
                $stmtOld = $conn->prepare("SELECT stock FROM insumos WHERE id = ?");
                $stmtOld->execute([$id]);
                $oldStock = (int)$stmtOld->fetchColumn();
            }

            if ($id) {
                $sql = "UPDATE insumos SET 
                        nombre=:nombre, proveedor_id=:proveedor_id, formato=:formato, 
                        valor_compra=:valor_compra, valor_venta=:valor_venta, 
                        stock=:stock, stock_minimo=:stock_minimo
                        WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO insumos 
                        (nombre, proveedor_id, formato, valor_compra, valor_venta, stock, stock_minimo) 
                        VALUES 
                        (:nombre, :proveedor_id, :formato, :valor_compra, :valor_venta, :stock, :stock_minimo)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }

            // Registrar movimiento de stock si cambió
            if ($id) {
                $diff = $stockActual - $oldStock;
                if ($diff !== 0) {
                    $tipo = $diff > 0 ? 'entrada' : 'salida';
                    registrarMovimientoStock('insumo', $record_id, $tipo, abs($diff), 'ajuste_manual', null, 'Ajuste desde formulario', $conn);
                }
            } elseif ($stockActual > 0) {
                registrarMovimientoStock('insumo', $record_id, 'entrada', $stockActual, 'creacion', null, 'Stock inicial', $conn);
            }

            historialInsert('insumos', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'insumos', $record_id, $conn);
            }

            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
?>