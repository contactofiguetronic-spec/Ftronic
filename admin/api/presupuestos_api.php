<?php
// ============================================================================
// presupuesto_api.php — CRUD Presupuestos
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

// Protección por permiso
$action = $_REQUEST['action'] ?? '';
$writeActions = ['guardar', 'agregar_item', 'actualizar_item', 'eliminar_item', 'verificar', 'aprobar', 'rechazar', 'confirmar', 'pagar', 'marcar_pagado', 'eliminar_pago', 'agregar_pago', 'convertir_a_venta'];
if (in_array($action, $writeActions)) {
    requirePerm('presupuestos:editar');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT p.*,
                        v.patente, v.marca, v.modelo,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono
                 FROM presupuesto p
                 LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON p.cliente_id  = c.id
                 WHERE p.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('presupuesto', (int)$id, $conn);
            // Incluir items normalizados
            $stmtItems = $conn->prepare("SELECT * FROM presupuesto_items WHERE presupuesto_id = ? ORDER BY id");
            $stmtItems->execute([$id]);
            $rec['items_list'] = $stmtItems->fetchAll();
            jsonResponse('success', 'OK', $rec);
        } elseif (isset($_GET['pagos'])) {
            $pptoId = (int)($_GET['presupuesto_id'] ?? 0);
            if (!$pptoId) jsonResponse('error', 'presupuesto_id requerido', null, 422);
            $stmt = $conn->prepare("SELECT * FROM pagos WHERE entidad_tipo = 'presupuesto' AND entidad_id = ? ORDER BY fecha DESC, id DESC");
            $stmt->execute([$pptoId]);
            jsonResponse('success', 'OK', $stmt->fetchAll());

        // ── DATOS DESDE OT ──
        } elseif ($action === 'ot_data_for_presupuesto') {
            $otId = (int)($_GET['ot_id'] ?? 0);
            if (!$otId) jsonResponse('error', 'ot_id requerido', null, 422);
            try {
                // Obtener OT con diagnóstico vinculado
                $stmt = $conn->prepare(
                    "SELECT ot.*,
                            v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio,
                            c.id AS cliente_id, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                            c.rut AS cliente_rut, c.telefono AS cliente_telefono
                     FROM orden_trabajo ot
                     LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
                     LEFT JOIN clientes  c ON ot.cliente_id  = c.id
                     WHERE ot.id = ?"
                );
                $stmt->execute([$otId]);
                $ot = $stmt->fetch();
                if (!$ot) jsonResponse('error', 'OT no encontrada', null, 404);

                $presupuestoItems = [];

                // Fuente ÚNICA de verdad: orden_trabajo_items
                // (diagnostico_repuestos y diagnostico_servicios son LEGACY — sin uso)
                try {
                    $stmtItems = $conn->prepare("SELECT * FROM orden_trabajo_items WHERE orden_trabajo_id = ? ORDER BY es_imprevisto, seccion, id");
                    $stmtItems->execute([$otId]);
                    foreach ($stmtItems->fetchAll() as $item) {
                        if (($item['seccion'] ?? '') === 'repuesto_cliente') continue;
                        $presupuestoItems[] = [
                            'tipo' => $item['tipo'] === 'insumo' ? 'articulo' : ($item['tipo'] ?? 'servicio'),
                            'id' => $item['item_id'] ?? null,
                            'nombre' => $item['nombre'],
                            'detalle' => $item['detalle'] ?? '',
                            'cantidad' => (int)($item['cantidad'] ?? 1),
                            'valor' => (float)($item['valor_unitario'] ?? 0),
                            'descuento' => 0,
                            '_origen' => 'ot_item',
                            '_es_imprevisto' => (int)($item['es_imprevisto'] ?? 0),
                            '_labores' => $item['labores_realizadas'] ?? '',
                            '_duracion_min' => $item['duracion_minutos'] ?? null,
                        ];
                    }
                } catch (Exception $e) {}

                jsonResponse('success', 'OK', [
                    'ot_id' => $otId,
                    'cliente' => [
                        'id' => $ot['cliente_id'],
                        'nombre' => $ot['cliente_nombre'],
                        'apellido' => $ot['cliente_apellido'],
                        'rut' => $ot['cliente_rut'],
                        'telefono' => $ot['cliente_telefono']
                    ],
                    'vehiculo' => [
                        'id' => $ot['vehiculo_id'],
                        'patente' => $ot['patente'],
                        'marca' => $ot['marca'],
                        'modelo' => $ot['modelo'],
                        'anio' => $ot['anio']
                    ],
                    'descripcion' => $ot['descripcion_problema'] ?? $ot['trabajo_ejecutar'] ?? '',
                    'items' => $presupuestoItems,
                    '-items_count' => count($presupuestoItems),
                ]);
            } catch (Exception $e) {
                jsonResponse('error', $e->getMessage(), null, 500);
            }

        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['v.patente','c.nombre','c.apellido'], $p['search']);
            $stmtC = $conn->prepare(
                "SELECT COUNT(*) FROM presupuesto p
                 LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON p.cliente_id  = c.id
                 WHERE {$sw['where']}"
            );
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT p.id, p.fecha, p.valor_total, p.vigencia, p.estado AS estado, p.creado,
                        v.patente, v.marca, v.modelo,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='presupuesto' AND entidad_id=p.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM presupuesto p
                 LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON p.cliente_id  = c.id
                 WHERE {$sw['where']}
                 ORDER BY p.creado DESC
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
            // Eliminar items y pagos asociados
            $conn->prepare("DELETE FROM presupuesto_items WHERE presupuesto_id = ?")->execute([$id]);
            $conn->prepare("DELETE FROM pagos WHERE entidad_tipo = 'presupuesto' AND entidad_id = ?")->execute([$id]);
            historialInsert('presupuesto', (int)$id, 'eliminado', null, 'Registro eliminado', null, $conn);
            deleteMultimedia('presupuesto', (int)$id, $conn);
            $conn->prepare("DELETE FROM presupuesto WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'update_estado') {
        $id = $_POST['id'] ?? null;
        $estado = $_POST['estado'] ?? '';
        if (!$id || !$estado) jsonResponse('error', 'ID y estado requeridos', null, 422);
        $allowed = ['borrador', 'pendiente', 'aprobado', 'rechazado', 'vencido', 'convertido'];
        if (!in_array($estado, $allowed)) jsonResponse('error', 'Estado no válido', null, 422);
        try {
            $conn->prepare("UPDATE presupuesto SET estado = ? WHERE id = ?")->execute([$estado, $id]);
            historialInsert('presupuesto', (int)$id, 'actualizado', 'estado', null, $estado, $conn);
            jsonResponse('success', 'Estado actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'registrar_pago') {
        $id = (int)($_POST['presupuesto_id'] ?? 0);
        $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $monto = (float)($_POST['monto'] ?? 0);
        $formaPago = sanitizeString($_POST['forma_pago'] ?? '', 50);
        $observacion = $_POST['observacion'] ?? '';
        if (!$id) jsonResponse('error', 'Presupuesto requerido', null, 422);
        if ($monto <= 0) jsonResponse('error', 'El monto debe ser mayor a 0', null, 422);
        try {
            $conn->beginTransaction();
            // Get presupuesto
            $stmt = $conn->prepare("SELECT * FROM presupuesto WHERE id = ?");
            $stmt->execute([$id]);
            $ppto = $stmt->fetch();
            if (!$ppto) jsonResponse('error', 'Presupuesto no encontrado', null, 404);

            // Calculate total pagado
            $stmtPag = $conn->prepare("SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE entidad_tipo = 'presupuesto' AND entidad_id = ?");
            $stmtPag->execute([$id]);
            $totalPagado = (float)$stmtPag->fetchColumn();
            $saldoPendiente = (float)($ppto['valor_total'] ?? 0) - $totalPagado;

            if ($monto > $saldoPendiente) jsonResponse('error', 'El monto excede el saldo pendiente ($' . number_format($saldoPendiente, 0, ',', '.') . ')', null, 422);

            // Check duplicate payment
            $stmtChk = $conn->prepare("SELECT id FROM pagos WHERE entidad_tipo='presupuesto' AND entidad_id=? AND monto=? AND fecha=CURDATE()");
            $stmtChk->execute([$id, $monto]);
            if ($stmtChk->fetch()) {
                $conn->rollBack();
                jsonResponse('error', 'Ya existe un pago registrado para este presupuesto con el mismo monto hoy.', null, 409);
            }

            // Register payment
            $stmtPago = $conn->prepare(
                "INSERT INTO pagos (entidad_tipo, entidad_id, monto, fecha, forma_pago, observacion, cuenta_bancaria_id)
                 VALUES ('presupuesto', ?, ?, CURDATE(), ?, ?, ?)"
            );
            $stmtPago->execute([$id, $monto, $formaPago, $observacion, $cuentaId > 0 ? $cuentaId : null]);
            $pagoId = (int)$conn->lastInsertId();

            // Guardar comprobante adjunto si se envió
            if (!empty($_FILES['comprobante']['name'])) {
                uploadMultimedia(['name' => [$_FILES['comprobante']['name']], 'type' => [$_FILES['comprobante']['type']], 'tmp_name' => [$_FILES['comprobante']['tmp_name']], 'error' => [$_FILES['comprobante']['error']], 'size' => [$_FILES['comprobante']['size']]], 'pago', $pagoId, $conn);
            }

            // Registrar en movimientos_caja y actualizar saldo (consistente con pagos_api)
            if ($cuentaId > 0) {
                registrarMovimientoCaja('ingreso', $monto, 'presupuesto', $pagoId, date('Y-m-d'), $formaPago, "Pago presupuesto #{$id}", $conn, $cuentaId);
            }

            // Check if fully paid — marcar como pagado y deducir stock
            $nuevoTotalPagado = $totalPagado + $monto;
            if ($nuevoTotalPagado >= (float)($ppto['valor_total'] ?? 0)) {
                $conn->prepare("UPDATE presupuesto SET estado = 'pagado' WHERE id = ?")->execute([$id]);
                // Deducir stock de artículos del presupuesto
                try { deducirStockPresupuesto($id, $conn); } catch (Exception $e) { /* log pero no falla el pago */ }
            }

            historialInsert('presupuesto', $id, 'actualizado', null, null, 'Pago registrado: $' . number_format($monto, 0, ',', '.'), $conn);
            $conn->commit();
            jsonResponse('success', 'Pago registrado', ['id' => $pagoId, 'total_pagado' => $nuevoTotalPagado, 'saldo_pendiente' => $saldoPendiente - $monto]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'convertir_a_ot') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            // Obtener presupuesto
            $stmt = $conn->prepare("SELECT * FROM presupuesto WHERE id = ?");
            $stmt->execute([$id]);
            $presup = $stmt->fetch();
            if (!$presup) jsonResponse('error', 'Presupuesto no encontrado', null, 404);

            // Obtener items del presupuesto
            $stmtItems = $conn->prepare("SELECT * FROM presupuesto_items WHERE presupuesto_id = ?");
            $stmtItems->execute([$id]);
            $items = $stmtItems->fetchAll();

            // Crear OT
            $stmtOt = $conn->prepare(
                "INSERT INTO orden_trabajo (vehiculo_id, cliente_id, presupuesto_id, estado, evaluacion, trabajo_ejecutar, observaciones)
                 VALUES (?, ?, ?, 'abierta', ?, ?, ?)"
            );
            $stmtOt->execute([
                $presup['vehiculo_id'],
                $presup['cliente_id'],
                $id,
                $presup['requisito'] ?? '',
                $presup['detalle_trabajos'] ?? '',
                $presup['observaciones'] ?? '',
            ]);
            $otId = (int)$conn->lastInsertId();

            // Copiar items a OT
            if (!empty($items)) {
                $stmtItem = $conn->prepare(
                    "INSERT INTO orden_trabajo_items (orden_trabajo_id, tipo, seccion, item_id, nombre, detalle, cantidad, valor_unitario, estado_item)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')"
                );
                foreach ($items as $item) {
                    $tipo = $item['tipo'] ?? 'servicio';
                    $seccion = $tipo === 'servicio' ? 'servicio' : 'repuesto_taller';
                    $stmtItem->execute([
                        $otId,
                        $tipo,
                        $seccion,
                        $item['item_id'],
                        $item['nombre'],
                        $item['detalle'],
                        $item['cantidad'],
                        $item['valor_unitario'],
                    ]);
                }
            }

            // Marcar presupuesto como convertido
            $conn->prepare("UPDATE presupuesto SET estado = 'convertido', convertido_a_ot = ? WHERE id = ?")->execute([$otId, $id]);

            historialInsert('presupuesto', (int)$id, 'actualizado', 'estado', 'pendiente', 'convertido', $conn);
            historialInsert('orden_trabajo', $otId, 'creado', null, null, 'Creado desde presupuesto #' . $id, $conn);

            $conn->commit();
            jsonResponse('success', 'OT creada exitosamente', ['id' => $otId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'verificar') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE presupuesto SET verificado = 1 WHERE id = ?")->execute([$id]);
            historialInsert('presupuesto', $id, 'actualizado', 'verificado', '0', '1', $conn);
            jsonResponse('success', 'Presupuesto verificado');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
    } elseif ($action === 'convertir_ot_a_presupuesto') {
        $otId = (int)($_POST['ot_id'] ?? 0);
        if (!$otId) jsonResponse('error', 'ot_id requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmtOt = $conn->prepare("SELECT * FROM orden_trabajo WHERE id = ?");
            $stmtOt->execute([$otId]);
            $ot = $stmtOt->fetch();
            if (!$ot) jsonResponse('error', 'OT no encontrada', null, 404);

            if (!empty($ot['presupuesto_id'])) {
                jsonResponse('error', 'Esta OT ya tiene un presupuesto #' . $ot['presupuesto_id'], null, 409);
            }

            $total = 0;
            $itemsPpto = [];

            // Fuente ÚNICA de verdad: orden_trabajo_items
            // (diagnostico_repuestos y diagnostico_servicios son LEGACY — sin uso)
            $stmtItems = $conn->prepare("SELECT * FROM orden_trabajo_items WHERE orden_trabajo_id = ?");
            $stmtItems->execute([$otId]);
            foreach ($stmtItems->fetchAll() as $item) {
                $sub = ($item['cantidad'] ?? 1) * ($item['valor_unitario'] ?? 0);
                $total += $sub;
                $itemsPpto[] = [
                    'tipo' => $item['tipo'] === 'insumo' ? 'articulo' : ($item['tipo'] ?? 'servicio'),
                    'item_id' => $item['item_id'],
                    'nombre' => $item['nombre'],
                    'detalle' => $item['detalle'] ?? '',
                    'cantidad' => $item['cantidad'] ?? 1,
                    'valor_unitario' => $item['valor_unitario'] ?? 0,
                ];
            }

            // Create presupuesto
            $descripcion = $ot['descripcion_problema'] ?? $ot['trabajo_ejecutar'] ?? '';
            $stmtPpto = $conn->prepare(
                "INSERT INTO presupuesto (vehiculo_id, cliente_id, ot_id, estado, requisito, observaciones, valor_total, fecha, vigencia)
                 VALUES (?, ?, ?, 'borrador', ?, ?, ?, CURDATE(), 30)"
            );
            $stmtPpto->execute([
                $ot['vehiculo_id'],
                $ot['cliente_id'],
                $otId,
                $ot['evaluacion'] ?? '',
                $descripcion ? 'Generado desde OT #' . $otId . ': ' . $descripcion : 'Generado desde OT #' . $otId,
                $total,
            ]);
            $pptoId = (int)$conn->lastInsertId();

            // Insert items
            if (!empty($itemsPpto)) {
                $stmtItem = $conn->prepare(
                    "INSERT INTO presupuesto_items (presupuesto_id, tipo, item_id, nombre, detalle, cantidad, valor_unitario)
                     VALUES (?, ?, ?, ?, ?, ?, ?)"
                );
                foreach ($itemsPpto as $item) {
                    if (empty(trim($item['nombre'] ?? ''))) continue;
                    $stmtItem->execute([
                        $pptoId,
                        $item['tipo'],
                        $item['item_id'],
                        $item['nombre'],
                        $item['detalle'],
                        $item['cantidad'],
                        $item['valor_unitario'],
                    ]);
                }
            }

            // Link OT → presupuesto
            $conn->prepare("UPDATE orden_trabajo SET presupuesto_id = ? WHERE id = ?")->execute([$pptoId, $otId]);

            historialInsert('presupuesto', $pptoId, 'creado', null, null, 'Generado desde OT #' . $otId, $conn);
            historialInsert('orden_trabajo', $otId, 'actualizado', 'presupuesto_id', null, $pptoId, $conn);
            $conn->commit();
            jsonResponse('success', 'Presupuesto #' . $pptoId . ' creado desde OT', ['id' => $pptoId, 'ot_id' => $otId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'create_inline_servicio') {
        requireFields($_POST, ['nombre', 'valor_trabajo']);
        try {
            $conn->prepare("INSERT INTO trabajos_servicios
                (nombre, descripcion, tipo, tiempo_implementar, valor_trabajo)
                VALUES (?, ?, ?, ?, ?)")
                ->execute([
                    sanitizeString($_POST['nombre'] ?? '', 150),
                    $_POST['descripcion'] ?? '',
                    sanitizeString($_POST['tipo'] ?? '', 50),
                    sanitizeString($_POST['tiempo_implementar'] ?? '', 50),
                    normalizeNullableDecimal($_POST['valor_trabajo'] ?? 0)
                ]);
            $newId = (int)$conn->lastInsertId();
            jsonResponse('success', 'Servicio creado', [
                'id' => $newId,
                'nombre' => $_POST['nombre'] ?? '',
                'tipo' => $_POST['tipo'] ?? '',
                'valor_trabajo' => $_POST['valor_trabajo'] ?? 0
            ]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'create_inline_articulo') {
        requireFields($_POST, ['nombre']);
        try {
            $conn->prepare("INSERT INTO articulos
                (nombre, tipo, marca, valor_venta, stock, detalles)
                VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([
                    sanitizeString($_POST['nombre'] ?? '', 150),
                    sanitizeString($_POST['tipo'] ?? '', 50),
                    sanitizeString($_POST['marca'] ?? '', 100),
                    normalizeNullableDecimal($_POST['valor_venta'] ?? 0),
                    normalizeNullableInt($_POST['stock'] ?? 0),
                    $_POST['detalles'] ?? ''
                ]);
            $newId = (int)$conn->lastInsertId();
            jsonResponse('success', 'Artículo creado', [
                'id' => $newId,
                'nombre' => $_POST['nombre'] ?? '',
                'tipo' => $_POST['tipo'] ?? '',
                'marca' => $_POST['marca'] ?? '',
                'valor_venta' => $_POST['valor_venta'] ?? 0
            ]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id = $_POST['id'] ?? null;
        requireFields($_POST, ['cliente_id']);

        $data = [
            ':vehiculo_id'       => normalizeNullableInt($_POST['vehiculo_id'] ?? null),
            ':cliente_id'        => normalizeNullableInt($_POST['cliente_id']  ?? null),
            ':fecha'             => $_POST['fecha']             ?: date('Y-m-d'),
            ':vigencia'          => normalizeNullableInt($_POST['vigencia'] ?? null) ?? 30,
            ':requisito'         => $_POST['requisito']         ?? '',
            ':items_json'        => $_POST['items_json']        ?? '[]',
            ':observaciones'     => $_POST['observaciones']     ?? '',
        ];

        // Cálculo seguro de totales e IVA (19%) en backend
        $valorNeto = normalizeNullableDecimal($_POST['valor'] ?? null) ?? 0;
        $descGlobal = normalizeNullableDecimal($_POST['descuento_global'] ?? null) ?? 0;
        $descPct = normalizeNullableDecimal($_POST['descuento_pct'] ?? null) ?? 0;
        $descGlobalFromPct = round($valorNeto * ($descPct / 100), 2);
        $descGlobalTotal = $descGlobal + $descGlobalFromPct;
        $iva = round($valorNeto * 0.19, 2);
        
        $data[':valor'] = $valorNeto;
        $data[':impuesto'] = $iva;
        $data[':descuento'] = normalizeNullableDecimal($_POST['descuento'] ?? null) ?? 0;
        $data[':descuento_global'] = $descGlobal;
        $data[':descuento_pct'] = $descPct;
        $data[':valor_total'] = round($valorNeto + $iva - $descGlobalTotal, 2);

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE presupuesto SET
                    vehiculo_id=:vehiculo_id, cliente_id=:cliente_id, fecha=:fecha,
                    vigencia=:vigencia, requisito=:requisito,
                    items_json=:items_json,
                    valor=:valor, impuesto=:impuesto, descuento=:descuento, valor_total=:valor_total,
                    descuento_global=:descuento_global, descuento_pct=:descuento_pct,
                    observaciones=:observaciones WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO presupuesto
                    (vehiculo_id, cliente_id, fecha, vigencia, requisito, items_json,
                     valor, impuesto, descuento, valor_total, descuento_global, descuento_pct, observaciones)
                    VALUES
                    (:vehiculo_id, :cliente_id, :fecha, :vigencia, :requisito, :items_json,
                     :valor, :impuesto, :descuento, :valor_total, :descuento_global, :descuento_pct, :observaciones)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }

            // Sincronizar items normalizados (presupuesto_items)
            $itemsJson = $_POST['items_json'] ?? '[]';
            $items = json_decode($itemsJson, true) ?? [];
            $conn->prepare("DELETE FROM presupuesto_items WHERE presupuesto_id = ?")->execute([$record_id]);
            if (!empty($items)) {
                $stmtItem = $conn->prepare(
                    "INSERT INTO presupuesto_items (presupuesto_id, tipo, item_id, nombre, detalle, cantidad, valor_unitario, descuento)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                );
                foreach ($items as $item) {
                    $stmtItem->execute([
                        $record_id,
                        in_array($item['tipo'] ?? '', ['servicio','articulo']) ? $item['tipo'] : 'servicio',
                        $item['id'] ?? null,
                        $item['nombre'] ?? '',
                        $item['detalle'] ?? '',
                        (int)($item['cantidad'] ?? 1),
                        (float)($item['valor'] ?? 0),
                        (float)($item['descuento'] ?? 0),
                    ]);
                }
            }

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'presupuesto', $record_id, $conn);
            }

            historialInsert('presupuesto', $record_id, $id ? 'actualizado' : 'creado', null, null, $itemsJson, $conn);

            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
