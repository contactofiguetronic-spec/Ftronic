<?php
// ============================================================================
// ventas_api.php — CRUD Ventas
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('ventas:editar');
}

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $fuente = $_GET['fuente'] ?? null;
    try {
        if ($id && $fuente) {
            $rec = null;
            if ($fuente === 'venta') {
                $stmt = $conn->prepare(
                    "SELECT v.*, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                            'venta' AS fuente
                     FROM ventas v
                     LEFT JOIN clientes c ON v.cliente_id = c.id
                     WHERE v.id = ?"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
                if ($rec) $rec['archivos'] = getMultimedia('ventas', (int)$id, $conn);
            } elseif ($fuente === 'presupuesto') {
                $stmt = $conn->prepare(
                    "SELECT pv.*, CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre,
                            v.patente AS vehiculo_patente, 'presupuesto' AS fuente
                     FROM presupuesto pv
                     LEFT JOIN clientes c ON pv.cliente_id = c.id
                     LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
                     WHERE pv.id = ?"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
            }
            if ($rec) jsonResponse('success', 'OK', $rec);
            jsonResponse('error', 'No encontrado', null, 404);
        } elseif (!$id) {
            $p = paginationParams();
            $search = $p['search'];
            $per_page = (int)$p['per_page'];
            $page = (int)$p['page'];

            $allItems = [];

            // 1) Ventas directas (manuales + POS)
            $whereV = "1=1";
            $paramsV = [];
            if ($search) {
                $like = '%' . $search . '%';
                $whereV = "(v.nombre LIKE ? OR v.numero_documento LIKE ? OR v.descripcion LIKE ? OR c.nombre LIKE ?)";
                $paramsV = [$like, $like, $like, $like];
            }
            $stmtV = $conn->prepare(
                "SELECT v.id, v.nombre, v.fecha, v.valor, v.valor_total, v.forma_pago,
                        v.estado_pago, v.numero_documento, v.descripcion, v.creado,
                        CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre,
                        'venta' AS fuente,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='ventas' AND entidad_id=v.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM ventas v
                 LEFT JOIN clientes c ON v.cliente_id = c.id
                 WHERE {$whereV}
                 ORDER BY v.creado DESC, v.id DESC"
            );
            $stmtV->execute($paramsV);
            foreach ($stmtV->fetchAll() as $row) $allItems[] = $row;

            // 2) Presupuestos pagados (trabajos/OTs cobrados)
            $whereP = "pv.estado = 'pagado'";
            $paramsP = [];
            if ($search) {
                $like = '%' . $search . '%';
                $whereP = "pv.estado = 'pagado' AND (pv.id LIKE ? OR CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) LIKE ? OR v.patente LIKE ?)";
                $paramsP = [$like, $like, $like];
            }
            $stmtP = $conn->prepare(
                "SELECT pv.id, CONCAT('Presupuesto #', pv.id) AS nombre, pv.fecha,
                        pv.valor_total AS valor, pv.valor_total, 'Transferencia' AS forma_pago,
                        'Pagado' AS estado_pago, NULL AS numero_documento, pv.observaciones AS descripcion,
                        pv.creado,
                        CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre,
                        'presupuesto' AS fuente,
                        NULL AS thumb_url
                 FROM presupuesto pv
                 LEFT JOIN clientes c ON pv.cliente_id = c.id
                 LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
                 WHERE {$whereP}
                 ORDER BY pv.fecha DESC, pv.creado DESC"
            );
            $stmtP->execute($paramsP);
            foreach ($stmtP->fetchAll() as $row) $allItems[] = $row;

            // Ordenar todo por fecha/creado DESC
            usort($allItems, function ($a, $b) {
                $fa = $a['creado'] ?? $a['fecha'] ?? '';
                $fb = $b['creado'] ?? $b['fecha'] ?? '';
                return strcmp($fb, $fa);
            });

            $total = count($allItems);
            $offset = ($page - 1) * $per_page;
            $items = array_slice($allItems, $offset, $per_page);

            paginatedResponse($items, $total, $p);
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
            historialInsert('ventas', $id, 'eliminado', null, null, null, $conn);
            deleteMultimedia('ventas', (int)$id, $conn);
            $conn->prepare("DELETE FROM ventas WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'crear_desde_ot') {
        $otId = (int)($_POST['ot_id'] ?? 0);
        if (!$otId) jsonResponse('error', 'ot_id requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM orden_trabajo WHERE id = ?");
            $stmt->execute([$otId]);
            $ot = $stmt->fetch();
            if (!$ot) jsonResponse('error', 'OT no encontrada', null, 404);

            $stmtItems = $conn->prepare("SELECT * FROM orden_trabajo_items WHERE orden_trabajo_id = ?");
            $stmtItems->execute([$otId]);
            $items = $stmtItems->fetchAll();

            $total = 0;
            $descripcion = $ot['trabajo_ejecutar'] ?? '';
            foreach ($items as $item) {
                $total += $item['cantidad'] * $item['valor_unitario'];
                $descripcion .= "\n- " . $item['nombre'] . ' x' . $item['cantidad'] . ': $' . number_format($item['valor_unitario'], 0, ',', '.');
            }

            $nombreVenta = 'Venta OT #' . $otId;
            if (!empty($ot['vehiculo_id'])) {
                $stmtVeh = $conn->prepare("SELECT patente FROM vehiculos WHERE id = ?");
                $stmtVeh->execute([$ot['vehiculo_id']]);
                $veh = $stmtVeh->fetch();
                if ($veh) $nombreVenta .= ' - ' . $veh['patente'];
            }

            $iva = round($total * 0.19, 2);
            $valorTotal = $total + $iva;

            $stmtV = $conn->prepare(
                "INSERT INTO ventas (nombre, cliente_id, presupuesto_id, orden_trabajo_id, fecha, descripcion, valor, valor_total, estado_pago)
                 VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, 'pendiente')"
            );
            $stmtV->execute([
                $nombreVenta,
                $ot['cliente_id'],
                $ot['presupuesto_id'],
                $otId,
                $descripcion,
                $total,
                $valorTotal,
            ]);
            $ventaId = (int)$conn->lastInsertId();
            $conn->prepare("UPDATE orden_trabajo SET estado = 'vendida' WHERE id = ?")->execute([$otId]);
            historialInsert('ventas', $ventaId, 'creado', null, null, 'Creado desde OT #' . $otId, $conn);
            $conn->commit();
            jsonResponse('success', 'Venta creada desde OT', ['id' => $ventaId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'registrar_pago') {
        requireFields($_POST, ['entidad_id', 'monto', 'fecha', 'forma_pago']);
        try {
            $conn->beginTransaction();
            $stmtChk = $conn->prepare("SELECT id FROM pagos WHERE entidad_tipo='venta' AND entidad_id=? AND monto=? AND fecha=?");
            $stmtChk->execute([$_POST['entidad_id'], $_POST['monto'], $_POST['fecha']]);
            if ($stmtChk->fetch()) {
                $conn->rollBack();
                jsonResponse('error', 'Ya existe un pago registrado para esta venta con el mismo monto y fecha.', null, 409);
            }
            $stmt = $conn->prepare("INSERT INTO pagos (entidad_tipo, entidad_id, monto, fecha, forma_pago, observacion) VALUES ('venta', :entidad_id, :monto, :fecha, :forma_pago, :observacion)");
            $stmt->execute([
                ':entidad_id' => $_POST['entidad_id'],
                ':monto'      => $_POST['monto'],
                ':fecha'      => $_POST['fecha'],
                ':forma_pago' => $_POST['forma_pago'],
                ':observacion'=> $_POST['observacion'] ?? ''
            ]);
            $pagoId = (int)$conn->lastInsertId();
            $stmtCb = $conn->prepare("SELECT cuenta_bancaria_id FROM ventas WHERE id=?");
            $stmtCb->execute([$_POST['entidad_id']]);
            $cbRow = $stmtCb->fetch();
            $cuentaId = $cbRow ? (int)$cbRow['cuenta_bancaria_id'] : null;
            registrarMovimientoCaja('ingreso', (float)$_POST['monto'], 'venta_pago', (int)$_POST['entidad_id'], $_POST['fecha'], $_POST['forma_pago'], 'Pago de venta #' . $_POST['entidad_id'], $conn, $cuentaId);
            historialInsert('pagos', $pagoId, 'creado', null, null, 'Pago registrado para venta #' . $_POST['entidad_id'], $conn);
            // Auto-actualizar estado_pago si el total pagado cubre el valor
            $stmtT = $conn->prepare("SELECT valor, COALESCE(SUM(p.monto),0) AS pagado FROM ventas v LEFT JOIN pagos p ON p.entidad_tipo='venta' AND p.entidad_id=v.id WHERE v.id=? GROUP BY v.id");
            $stmtT->execute([$_POST['entidad_id']]);
            $row = $stmtT->fetch();
            if ($row && (float)$row['pagado'] >= (float)$row['valor']) {
                $conn->prepare("UPDATE ventas SET estado_pago='Pagado' WHERE id=?")->execute([$_POST['entidad_id']]);
                deducirStockVenta((int)$_POST['entidad_id'], $conn);
            }
            $conn->commit();
            jsonResponse('success', 'Pago registrado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id                 = $_POST['id'] ?? null;
        $nombre             = sanitizeString($_POST['nombre'] ?? '', 255);
        $cliente_id         = normalizeNullableInt($_POST['cliente_id'] ?? null);
        $fecha              = $_POST['fecha'] ?? null;
        $forma_pago         = sanitizeString($_POST['forma_pago'] ?? '', 100);
        $cuenta_bancaria_id = normalizeNullableInt($_POST['cuenta_bancaria_id'] ?? null);
        $valor              = normalizeNullableDecimal($_POST['valor'] ?? null);
        $numero_documento   = sanitizeString($_POST['numero_documento'] ?? '', 100);
        $descripcion        = $_POST['descripcion'] ?? '';
        $estado_pago        = sanitizeString($_POST['estado_pago'] ?? 'pendiente', 50);
        $fecha_vencimiento  = $_POST['fecha_vencimiento'] ?? null;

        requireFields($_POST, ['nombre', 'fecha', 'valor']);

        $iva = round($valor * 0.19, 2);
        $valorTotal = $valor + $iva;

        $data = [
            ':nombre'             => $nombre,
            ':cliente_id'         => $cliente_id,
            ':fecha'              => $fecha,
            ':forma_pago'         => $forma_pago,
            ':cuenta_bancaria_id' => $cuenta_bancaria_id,
            ':valor'              => $valor,
            ':valor_total'        => $valorTotal,
            ':numero_documento'   => $numero_documento,
            ':descripcion'        => $descripcion,
            ':estado_pago'        => $estado_pago,
            ':fecha_vencimiento'  => $fecha_vencimiento,
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE ventas SET 
                        nombre=:nombre, cliente_id=:cliente_id, fecha=:fecha, 
                        forma_pago=:forma_pago, cuenta_bancaria_id=:cuenta_bancaria_id, 
                        valor=:valor, valor_total=:valor_total, numero_documento=:numero_documento, 
                        descripcion=:descripcion, estado_pago=:estado_pago, fecha_vencimiento=:fecha_vencimiento
                        WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO ventas 
                        (nombre, cliente_id, fecha, forma_pago, cuenta_bancaria_id, valor, valor_total, numero_documento, descripcion, estado_pago, fecha_vencimiento) 
                        VALUES 
                        (:nombre, :cliente_id, :fecha, :forma_pago, :cuenta_bancaria_id, :valor, :valor_total, :numero_documento, :descripcion, :estado_pago, :fecha_vencimiento)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'ventas', $record_id, $conn);
            }

            historialInsert('ventas', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
?>