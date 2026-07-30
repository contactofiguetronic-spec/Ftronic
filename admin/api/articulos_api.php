<?php
// ============================================================================
// articulos_api.php — CRUD Artículos (inventario de repuestos)
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('articulos:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    // ── Proveedores del artículo ──
    if ($action === 'proveedores' && isset($_GET['articulo_id'])) {
        try {
            $aid = (int)$_GET['articulo_id'];
            $stmt = $conn->prepare(
                "SELECT p.id, p.nombre, ap.precio_costo, ap.tiempo_entrega
                 FROM articulo_proveedor ap
                 JOIN proveedores p ON ap.proveedor_id = p.id
                 WHERE ap.articulo_id = ?
                 ORDER BY p.nombre ASC"
            );
            $stmt->execute([$aid]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT a.*, p.nombre AS proveedor_nombre
                 FROM articulos a LEFT JOIN proveedores p ON a.proveedor_id = p.id
                 WHERE a.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('articulos', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['a.nombre','a.tipo','a.marca'], $p['search']);
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM articulos a WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT a.id, a.nombre, a.tipo, a.marca, a.stock, a.valor_venta,
                        p.nombre AS proveedor_nombre,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='articulos' AND entidad_id=a.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM articulos a
                 LEFT JOIN proveedores p ON a.proveedor_id = p.id
                 WHERE {$sw['where']}
                 ORDER BY a.nombre ASC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
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
            historialInsert('articulos', $id, 'eliminado', null, null, null, $conn);
            deleteMultimedia('articulos', (int)$id, $conn);
            $conn->prepare("DELETE FROM articulos WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id = $_POST['id'] ?? null;
        $hasFiles = !empty($_FILES['archivos']['name'][0]);

        // File-only upload (no form fields) — just upload multimedia
        if ($hasFiles && $id && empty($_POST['nombre'])) {
            try {
                $conn->beginTransaction();
                uploadMultimedia($_FILES['archivos'], 'articulos', (int)$id, $conn);
                $conn->commit();
                jsonResponse('success', 'Imágenes subidas correctamente', ['id' => (int)$id]);
            } catch (Exception $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                jsonResponse('error', $e->getMessage(), null, 500);
            }
            exit;
        }

        requireFields($_POST, ['nombre']);
        $data = [
            ':nombre'           => sanitizeString($_POST['nombre'] ?? '', 150),
            ':tipo'             => sanitizeString($_POST['tipo']   ?? '', 50),
            ':marca'            => sanitizeString($_POST['marca']  ?? '', 100),
            ':valor_referencia' => normalizeNullableDecimal($_POST['valor_referencia'] ?? null),
            ':valor_compra'     => normalizeNullableDecimal($_POST['valor_compra']     ?? null),
            ':valor_venta'      => normalizeNullableDecimal($_POST['valor_venta']      ?? null),
            ':stock'            => normalizeNullableInt($_POST['stock_actual'] ?? $_POST['stock'] ?? null) ?? 0,
            ':stock_minimo'     => normalizeNullableInt($_POST['stock_minimo'] ?? null) ?? 5,
            ':ubicacion'        => sanitizeString($_POST['ubicacion'] ?? '', 100),
            ':detalles'         => $_POST['detalles'] ?? '',
        ];
        try {
            $conn->beginTransaction();
            // Leer stock anterior ANTES del update
            $oldStock = 0;
            if ($id) {
                $stmtOld = $conn->prepare("SELECT stock FROM articulos WHERE id = ?");
                $stmtOld->execute([$id]);
                $oldStock = (int)$stmtOld->fetchColumn();
            }
            if ($id) {
                $sql = "UPDATE articulos SET
                    nombre=:nombre, tipo=:tipo, marca=:marca,
                    valor_referencia=:valor_referencia, valor_compra=:valor_compra,
                    valor_venta=:valor_venta, stock=:stock, stock_minimo=:stock_minimo,
                    ubicacion=:ubicacion, detalles=:detalles
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO articulos
                    (nombre, tipo, marca, valor_referencia, valor_compra, valor_venta, stock, stock_minimo, ubicacion, detalles)
                    VALUES
                    (:nombre, :tipo, :marca, :valor_referencia, :valor_compra, :valor_venta, :stock, :stock_minimo, :ubicacion, :detalles)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }
            // Registrar movimiento de stock si cambió
            $stockActual = (int)($_POST['stock_actual'] ?? $_POST['stock'] ?? 0);
            if ($id) {
                $diff = $stockActual - $oldStock;
                if ($diff !== 0) {
                    $tipo = $diff > 0 ? 'entrada' : 'salida';
                    registrarMovimientoStock('articulo', $record_id, $tipo, abs($diff), 'ajuste_manual', null, 'Ajuste desde formulario', $conn);
                }
            } elseif ($stockActual > 0) {
                registrarMovimientoStock('articulo', $record_id, 'entrada', $stockActual, 'creacion', null, 'Stock inicial', $conn);
            }

            historialInsert('articulos', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'articulos', $record_id, $conn);
            }
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}