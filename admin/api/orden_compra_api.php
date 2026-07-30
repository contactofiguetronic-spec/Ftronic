<?php
// ============================================================================
// orden_compra_api.php — Gestión de Solicitudes de Compra (flujo completo)
// solicitud → cotización → validación → asignación → ejecución → finalización
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['crear', 'actualizar', 'cambiar_estado', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('orden_compra:editar');
}

$ESTADOS_VALIDOS = ['solicitado','en_cotizacion','aprobada','asignada','en_proceso','recibida_parcial','recibida','cancelada'];

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT oc.*, p.nombre AS proveedor_nombre, p.rut AS proveedor_rut,
                        p.contacto_nombre AS proveedor_contacto, p.telefono AS proveedor_telefono,
                        p.correo AS proveedor_email, p.direccion AS proveedor_direccion,
                        s.nombre AS solicitante_nombre, s.apellido AS solicitante_apellido,
                        a.nombre AS asignado_nombre, a.apellido AS asignado_apellido
                 FROM orden_compra oc
                 LEFT JOIN proveedores p ON oc.proveedor_id = p.id
                 LEFT JOIN empleados s ON oc.solicitante_empleado_id = s.id
                 LEFT JOIN empleados a ON oc.asignado_empleado_id = a.id
                 WHERE oc.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $stmtItems = $conn->prepare("SELECT * FROM orden_compra_items WHERE orden_compra_id = ? ORDER BY id");
            $stmtItems->execute([$id]);
            $rec['items'] = $stmtItems->fetchAll();
            $rec['archivos'] = getMultimedia('orden_compra', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['oc.folio','oc.id','p.nombre','oc.estado','oc.fecha_emision'], $p['search']);
            $whereEstado = '';
            $params = $sw['params'];
            if (!empty($_GET['estado'])) {
                $whereEstado = " AND oc.estado = ?";
                $params[] = $_GET['estado'];
            }
            if (!empty($_GET['origen_tipo'])) {
                $whereEstado .= " AND oc.origen_tipo = ?";
                $params[] = $_GET['origen_tipo'];
            }
            $stmtC = $conn->prepare(
                "SELECT COUNT(*) FROM orden_compra oc
                 LEFT JOIN proveedores p ON oc.proveedor_id = p.id
                 WHERE {$sw['where']} {$whereEstado}"
            );
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT oc.id, oc.folio, oc.fecha_emision, oc.fecha_entrega_estimada, oc.estado, oc.created_at AS creado,
                        oc.subtotal, oc.impuesto, oc.descuento, oc.total, oc.observaciones,
                        oc.proveedor_id, oc.origen_tipo,
                        p.nombre AS proveedor_nombre,
                        s.nombre AS solicitante_nombre, s.apellido AS solicitante_apellido,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia
                          WHERE entidad_tipo='orden_compra' AND entidad_id=oc.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM orden_compra oc
                 LEFT JOIN proveedores p ON oc.proveedor_id = p.id
                 LEFT JOIN empleados s ON oc.solicitante_empleado_id = s.id
                 WHERE {$sw['where']} {$whereEstado}
                 ORDER BY oc.created_at DESC, oc.id DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($params);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

elseif ($method === 'POST') {

    // ── Eliminar ──
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            historialInsert('orden_compra', (int)$id, 'eliminado', null, null, null, $conn);
            deleteMultimedia('orden_compra', (int)$id, $conn);
            $conn->prepare("DELETE FROM orden_compra_items WHERE orden_compra_id = ?")->execute([$id]);
            $conn->prepare("DELETE FROM orden_compra WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Orden de compra eliminada');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Cambiar estado ──
    elseif ($action === 'update_estado') {
        $id = $_POST['id'] ?? null;
        $estado = $_POST['estado'] ?? '';
        if (!$id || !$estado) jsonResponse('error', 'ID y estado requeridos', null, 422);
        $allowed = ['solicitado','en_cotizacion','aprobada','asignada','en_proceso','recibida_parcial','recibida','cancelada'];
        if (!in_array($estado, $allowed)) jsonResponse('error', 'Estado no válido', null, 422);
        try {
            $conn->beginTransaction();
            $conn->prepare("UPDATE orden_compra SET estado = ? WHERE id = ?")->execute([$estado, $id]);
            historialInsert('orden_compra', (int)$id, 'actualizado', 'estado', null, $estado, $conn);
            if (in_array($estado, ['recibida', 'recibida_parcial'])) {
                $items = json_decode($_POST['items'] ?? '[]', true) ?? [];
                foreach ($items as $item) {
                    $cantRecibida = (int)($item['cantidad_recibida'] ?? 0);
                    if ($cantRecibida > 0 && !empty($item['id'])) {
                        $conn->prepare("UPDATE orden_compra_items SET cantidad_recibida = ? WHERE id = ?")
                             ->execute([$cantRecibida, $item['id']]);
                        if (!empty($item['producto_tipo']) && !empty($item['producto_id']) && $item['producto_id']) {
                            if ($item['producto_tipo'] === 'articulo') {
                                $conn->prepare("UPDATE articulos SET stock = COALESCE(stock,0) + ? WHERE id = ?")
                                     ->execute([$cantRecibida, $item['producto_id']]);
                                registrarMovimientoStock('articulo', (int)$item['producto_id'], 'entrada', $cantRecibida, 'orden_compra', (int)$id, 'Recepción OC #' . $id, $conn);
                            } elseif ($item['producto_tipo'] === 'insumo') {
                                $conn->prepare("UPDATE insumos SET stock = COALESCE(stock,0) + ? WHERE id = ?")
                                     ->execute([$cantRecibida, $item['producto_id']]);
                                registrarMovimientoStock('insumo', (int)$item['producto_id'], 'entrada', $cantRecibida, 'orden_compra', (int)$id, 'Recepción OC #' . $id, $conn);
                            }
                        }
                    }
                }
            }
            $conn->commit();
            jsonResponse('success', 'Estado actualizado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Guardar cotización / análisis ──
    elseif ($action === 'guardar_cotizacion') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $cotizacion = $_POST['cotizacion'] ?? '';
        try {
            $conn->prepare("UPDATE orden_compra SET cotizacion = ? WHERE id = ?")->execute([$cotizacion, $id]);
            historialInsert('orden_compra', $id, 'cotizado', null, null, mb_substr($cotizacion, 0, 200), $conn);
            jsonResponse('success', 'Cotización guardada');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
    }

    // ── Asignar responsable (crea tarea en módulo Tareas) ──
    elseif ($action === 'asignar') {
        $id = (int)($_POST['id'] ?? 0);
        $asignadoId = (int)($_POST['asignado_empleado_id'] ?? 0);
        if (!$id || !$asignadoId) jsonResponse('error', 'ID y empleado responsable requeridos', null, 422);
        try {
            $conn->beginTransaction();
            // Datos de la OC
            $stmtOC = $conn->prepare("SELECT oc.*, p.nombre AS proveedor_nombre, p.contacto_nombre, p.correo, p.telefono
                                       FROM orden_compra oc LEFT JOIN proveedores p ON oc.proveedor_id = p.id WHERE oc.id = ?");
            $stmtOC->execute([$id]);
            $oc = $stmtOC->fetch();
            if (!$oc) { $conn->rollBack(); jsonResponse('error', 'OC no encontrada', null, 404); }

            // Items
            $stmtIt = $conn->prepare("SELECT * FROM orden_compra_items WHERE orden_compra_id = ? ORDER BY id");
            $stmtIt->execute([$id]);
            $items = $stmtIt->fetchAll();

            $conn->prepare("UPDATE orden_compra SET asignado_empleado_id = ?, estado = 'asignada' WHERE id = ?")
                 ->execute([$asignadoId, $id]);

            // Construir descripción de la tarea
            $lineas = [];
            $lineas[] = "Se solicita gestionar la compra de la Orden de Compra {$oc['folio']}.";
            $lineas[] = "Proveedor sugerido: " . ($oc['proveedor_nombre'] ?: 'Por definir') .
                        ($oc['contacto_nombre'] ? " (Contacto: {$oc['contacto_nombre']})" : '') .
                        ($oc['correo'] ? " | Correo: {$oc['correo']}" : '') .
                        ($oc['telefono'] ? " | Tel: {$oc['telefono']}" : '');
            $lineas[] = "Forma de pago / coordinación: " . ($oc['forma_pago'] ? ucfirst(str_replace('_',' ', $oc['forma_pago'])) : 'Por definir') .
                        ($oc['cuenta_bancaria_id'] ? " (cuenta #{$oc['cuenta_bancaria_id']})" : '');
            if ($oc['cotizacion']) $lineas[] = "Cotización / análisis: " . $oc['cotizacion'];
            $lineas[] = "Ítems a adquirir:";
            foreach ($items as $it) {
                $lineas[] = "- {$it['cantidad_solicitada']} x {$it['nombre']}" .
                            ($it['valor_unitario'] > 0 ? " (valor unit. estimado: $" . number_format($it['valor_unitario'],0,',','.') . ")" : '') .
                            ($it['descripcion'] ? " — {$it['descripcion']}" : '');
            }
            if ($oc['observaciones']) $lineas[] = "Observaciones: " . $oc['observaciones'];
            $lineas[] = "Al finalizar, registrar la recepción y el gasto asociado a la OC {$oc['folio']}.";
            $detalles = implode("\n", $lineas);

            $primer = $items[0]['nombre'] ?? 'compra';
            $nombreTarea = "Gestionar compra {$oc['folio']} — " . mb_substr($primer, 0, 60);

            // Generar folio TAR
            $stmtMax = $conn->query("SELECT COALESCE(MAX(id),0)+1 AS nex FROM tareas_diarias");
            $nextTarea = (int)$stmtMax->fetchColumn();
            $folioTarea = 'TAR-' . str_pad($nextTarea, 5, '0', STR_PAD_LEFT);

            $conn->prepare(
                "INSERT INTO tareas_diarias (folio, nombre, asignado_empleado_id, fecha, estado, detalles, prioridad, creado)
                 VALUES (?, ?, ?, CURDATE(), 'pendiente', ?, 'alta', NOW())"
            )->execute([$folioTarea, $nombreTarea, $asignadoId, $detalles]);

            $tareaId = (int)$conn->lastInsertId();
            $conn->prepare("UPDATE orden_compra SET tarea_id = ? WHERE id = ?")->execute([$tareaId, $id]);
            historialInsert('orden_compra', $id, 'asignada', 'asignado_empleado_id', null, "Empleado #{$asignadoId} | Tarea {$folioTarea}", $conn);

            $conn->commit();
            jsonResponse('success', "Responsable asignado. Tarea {$folioTarea} creada.", ['tarea_id' => $tareaId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Finalizar (registrar gasto en cuenta bancaria) ──
    elseif ($action === 'finalizar') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmtOC = $conn->prepare("SELECT * FROM orden_compra WHERE id = ?");
            $stmtOC->execute([$id]);
            $oc = $stmtOC->fetch();
            if (!$oc) { $conn->rollBack(); jsonResponse('error', 'OC no encontrada', null, 404); }

            $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? $oc['cuenta_bancaria_id'] ?? 0);
            $formaPago = $_POST['forma_pago'] ?? $oc['forma_pago'] ?? null;
            $monto = (float)($_POST['total'] ?? $oc['total'] ?? 0);

            if ($cuentaId > 0 && $monto > 0) {
                $conn->prepare("UPDATE orden_compra SET cuenta_bancaria_id = ?, forma_pago = ?, fecha_pago = CURDATE(), estado = 'recibida' WHERE id = ?")
                     ->execute([$cuentaId, $formaPago, $id]);
                registrarMovimientoCaja('egreso', $monto, 'orden_compra', $id, null, $formaPago, "Pago OC {$oc['folio']}", $conn, $cuentaId);
                historialInsert('orden_compra', $id, 'finalizada', null, null, "Gasto $" . number_format($monto,0,',','.') . " en cuenta #{$cuentaId}", $conn);
            } else {
                $conn->prepare("UPDATE orden_compra SET estado = 'recibida' WHERE id = ?")->execute([$id]);
                historialInsert('orden_compra', $id, 'finalizada', null, null, 'Sin cuenta asociada', $conn);
            }

            // Marcar tarea enlazada como completada
            if ($oc['tarea_id']) {
                $conn->prepare("UPDATE tareas_diarias SET estado = 'completada' WHERE id = ?")->execute([$oc['tarea_id']]);
            }

            $conn->commit();
            jsonResponse('success', 'Orden de compra finalizada y gasto registrado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Crear OC genérica (desde ejecucion_ot, tarea, o manual) ──
    elseif ($action === 'crear_oc') {
        $origenTipo = sanitizeString($_POST['origen_tipo'] ?? 'manual', 50);
        $origenId   = (int)($_POST['origen_id'] ?? 0);
        $solicitanteId = (int)($_POST['solicitante_empleado_id'] ?? 0);
        $proveedorId = (int)($_POST['proveedor_id'] ?? 0);
        $observaciones = $_POST['observaciones'] ?? '';
        $items = json_decode($_POST['items_json'] ?? '[]', true) ?? [];
        if (empty($items)) jsonResponse('error', 'Debe incluir al menos un ítem', null, 422);
        try {
            $conn->beginTransaction();
            $conn->prepare(
                "INSERT INTO orden_compra (proveedor_id, fecha_emision, estado, subtotal, impuesto, descuento, total, observaciones, solicitante_empleado_id, origen_tipo, origen_id)
                 VALUES (?, CURDATE(), 'solicitado', 0, 0, 0, 0, ?, ?, ?, ?)"
            )->execute([$proveedorId ?: null, $observaciones, $solicitanteId ?: null, $origenTipo, $origenId ?: null]);
            $ocId = (int)$conn->lastInsertId();
            $conn->prepare("UPDATE orden_compra SET folio = CONCAT('OC-', LPAD(id,5,'0')) WHERE id = ?")->execute([$ocId]);

            $stmtItem = $conn->prepare(
                "INSERT INTO orden_compra_items (orden_compra_id, producto_tipo, producto_id, nombre, cantidad_solicitada, cantidad_recibida, valor_unitario, descripcion)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
            );
            foreach ($items as $it) {
                $stmtItem->execute([
                    $ocId,
                    $it['producto_tipo'] ?? 'otro',
                    !empty($it['producto_id']) ? (int)$it['producto_id'] : null,
                    $it['nombre'] ?? '',
                    (int)($it['cantidad_solicitada'] ?? 1),
                    (float)($it['valor_unitario'] ?? 0),
                    $it['descripcion'] ?? '',
                ]);
            }
            historialInsert('orden_compra', $ocId, 'creado', null, null, "Creada desde {$origenTipo}", $conn);
            $conn->commit();
            jsonResponse('success', "OC creada", ['id' => $ocId, 'folio' => 'OC-' . str_pad($ocId,5,'0',STR_PAD_LEFT)]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Crear desde solicitud (flujo diagnóstico) ──
    elseif ($action === 'crear_desde_solicitud') {
        $solicitudId = (int)($_POST['solicitud_id'] ?? 0);
        $proveedorId = (int)($_POST['proveedor_id'] ?? 0);
        if (!$solicitudId) jsonResponse('error', 'solicitud_id requerido', null, 422);
        try {
            $stmtSol = $conn->prepare("SELECT * FROM solicitudes_compra WHERE id = ?");
            $stmtSol->execute([$solicitudId]);
            $sol = $stmtSol->fetch();
            if (!$sol) jsonResponse('error', 'Solicitud no encontrada', null, 404);

            if (!$proveedorId) {
                $stmtSug = $conn->prepare(
                    "SELECT pa.proveedor_id FROM proveedor_articulos pa
                     JOIN articulos a ON pa.articulo_id = a.id
                     WHERE a.nombre LIKE ? ORDER BY pa.precio_referencia ASC LIMIT 1"
                );
                $stmtSug->execute(['%' . $sol['nombre_repuesto'] . '%']);
                $proveedorId = (int)$stmtSug->fetchColumn();
            }

            $conn->beginTransaction();
            $observaciones = "Generada desde Solicitud #{$solicitudId}";
            if ($sol['motivo']) $observaciones .= "\nMotivo: " . $sol['motivo'];
            $conn->prepare(
                "INSERT INTO orden_compra (proveedor_id, fecha_emision, estado, subtotal, impuesto, descuento, total, observaciones, solicitante_empleado_id, origen_tipo, origen_id, solicitud_id)
                 VALUES (?, CURDATE(), 'solicitado', 0, 0, 0, 0, ?, ?, 'diagnostico', ?, ?)"
            )->execute([$proveedorId ?: null, $observaciones, $sol['empleado_id'] ?: null, $sol['ot_id'] ?: null, $solicitudId]);
            $ocId = (int)$conn->lastInsertId();
            $conn->prepare("UPDATE orden_compra SET folio = CONCAT('OC-', LPAD(id,5,'0')) WHERE id = ?")->execute([$ocId]);
            $conn->prepare(
                "INSERT INTO orden_compra_items (orden_compra_id, producto_tipo, producto_id, nombre, cantidad_solicitada, cantidad_recibida, valor_unitario)
                 VALUES (?, 'articulo', NULL, ?, ?, 0, 0)"
            )->execute([$ocId, $sol['nombre_repuesto'], (int)$sol['cantidad']]);
            $conn->prepare("UPDATE solicitudes_compra SET estado = 'en_proceso', orden_compra_id = ? WHERE id = ?")
                 ->execute([$ocId, $solicitudId]);
            $conn->commit();
            jsonResponse('success', "OC #{$ocId} creada desde solicitud", ['id' => $ocId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Crear desde repuesto solicitado en Ejecución de OT ──
    elseif ($action === 'crear_desde_repuesto') {
        $repuestoId = (int)($_POST['repuesto_id'] ?? 0);
        if (!$repuestoId) jsonResponse('error', 'repuesto_id requerido', null, 422);
        try {
            $stmt = $conn->prepare(
                "SELECT r.*, a.nombre AS art_nombre, i.nombre AS ins_nombre
                 FROM ot_repuestos_solicitados r
                 LEFT JOIN articulos a ON r.articulo_id = a.id
                 LEFT JOIN insumos i ON r.insumo_id = i.id
                 WHERE r.id = :id FOR UPDATE"
            );
            $stmt->execute([':id' => $repuestoId]);
            $r = $stmt->fetch();
            if (!$r) jsonResponse('error', 'Solicitud no encontrada', null, 404);

            $nombre = $r['art_nombre'] ?? $r['ins_nombre'] ?? 'Repuesto #' . $repuestoId;
            $productoTipo = $r['articulo_id'] ? 'articulo' : ($r['insumo_id'] ? 'insumo' : 'otro');
            $productoId = $r['articulo_id'] ?? $r['insumo_id'] ?? null;
            $obs = "OC desde solicitud de repuesto (OT #{$r['ot_id']}). " . ($r['observacion'] ?? '');

            $conn->beginTransaction();
            $conn->prepare(
                "INSERT INTO orden_compra (proveedor_id, fecha_emision, estado, subtotal, impuesto, descuento, total, observaciones, solicitante_empleado_id, origen_tipo, origen_id)
                 VALUES (NULL, CURDATE(), 'solicitado', 0, 0, 0, 0, ?, ?, 'ejecucion_ot', ?)"
            )->execute([$obs, $r['solicitado_por'] ?: null, (int)$r['ot_id']]);
            $ocId = (int)$conn->lastInsertId();
            $conn->prepare("UPDATE orden_compra SET folio = CONCAT('OC-', LPAD(id,5,'0')) WHERE id = ?")->execute([$ocId]);
            $conn->prepare(
                "INSERT INTO orden_compra_items (orden_compra_id, producto_tipo, producto_id, nombre, cantidad_solicitada, cantidad_recibida, valor_unitario)
                 VALUES (?, ?, ?, ?, ?, 0, 0)"
            )->execute([$ocId, $productoTipo, $productoId, $nombre, (int)$r['cantidad']]);
            $conn->prepare("UPDATE ot_repuestos_solicitados SET oc_id = ? WHERE id = ?")->execute([$ocId, $repuestoId]);
            $conn->commit();
            jsonResponse('success', 'OC creada', ['oc_id' => $ocId, 'folio' => 'OC-' . str_pad($ocId,5,'0',STR_PAD_LEFT)]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Insert / Update (formulario completo) ──
    else {
        $id = $_POST['id'] ?? null;
        requireFields($_POST, ['proveedor_id', 'fecha_emision']);

        $total = normalizeNullableDecimal($_POST['total'] ?? null);
        $subtotal = normalizeNullableDecimal($_POST['subtotal'] ?? null);
        $impuesto = normalizeNullableDecimal($_POST['impuesto'] ?? null) ?? 0;
        $descuento = normalizeNullableDecimal($_POST['descuento'] ?? null) ?? 0;
        if (!$subtotal && $total) $subtotal = $total + $descuento - $impuesto;

        $data = [
            ':proveedor_id'          => (int)$_POST['proveedor_id'],
            ':fecha_emision'         => $_POST['fecha_emision'],
            ':fecha_entrega_estimada'=> $_POST['fecha_entrega_estimada'] ?: null,
            ':estado'                => sanitizeString($_POST['estado'] ?? 'solicitado', 30),
            ':subtotal'              => $subtotal,
            ':impuesto'              => $impuesto,
            ':descuento'             => $descuento,
            ':total'                 => $total,
            ':observaciones'         => $_POST['observaciones'] ?? '',
            ':cuenta_bancaria_id'    => !empty($_POST['cuenta_bancaria_id']) ? (int)$_POST['cuenta_bancaria_id'] : null,
            ':forma_pago'            => !empty($_POST['forma_pago']) ? sanitizeString($_POST['forma_pago'], 50) : null,
            ':cotizacion'            => $_POST['cotizacion'] ?? null,
            ':solicitante_empleado_id' => !empty($_POST['solicitante_empleado_id']) ? (int)$_POST['solicitante_empleado_id'] : null,
        ];

        // validar estado
        if (!in_array($data[':estado'], $ESTADOS_VALIDOS)) $data[':estado'] = 'solicitado';

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE orden_compra SET
                    proveedor_id=:proveedor_id, fecha_emision=:fecha_emision,
                    fecha_entrega_estimada=:fecha_entrega_estimada, estado=:estado,
                    subtotal=:subtotal, impuesto=:impuesto, descuento=:descuento,
                    total=:total, observaciones=:observaciones,
                    cuenta_bancaria_id=:cuenta_bancaria_id, forma_pago=:forma_pago,
                    cotizacion=:cotizacion, solicitante_empleado_id=:solicitante_empleado_id
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO orden_compra
                    (proveedor_id, fecha_emision, fecha_entrega_estimada, estado,
                     subtotal, impuesto, descuento, total, observaciones, cuenta_bancaria_id, forma_pago, cotizacion, solicitante_empleado_id)
                    VALUES
                    (:proveedor_id, :fecha_emision, :fecha_entrega_estimada, :estado,
                     :subtotal, :impuesto, :descuento, :total, :observaciones, :cuenta_bancaria_id, :forma_pago, :cotizacion, :solicitante_empleado_id)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $conn->prepare("UPDATE orden_compra SET folio = CONCAT('OC-', LPAD(id,5,'0')) WHERE id = ?")->execute([$record_id]);
                $msg = 'Guardado exitosamente.';
            }

            // Sincronizar items
            $items = json_decode($_POST['items_json'] ?? '[]', true) ?? [];
            $conn->prepare("DELETE FROM orden_compra_items WHERE orden_compra_id = ?")->execute([$record_id]);
            if (!empty($items)) {
                $stmtItem = $conn->prepare(
                    "INSERT INTO orden_compra_items (orden_compra_id, producto_tipo, producto_id, nombre, cantidad_solicitada, cantidad_recibida, valor_unitario, descripcion)
                     VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
                );
                foreach ($items as $item) {
                    $stmtItem->execute([
                        $record_id,
                        $item['producto_tipo'] ?? 'otro',
                        !empty($item['producto_id']) ? (int)$item['producto_id'] : null,
                        $item['nombre'] ?? '',
                        (int)($item['cantidad_solicitada'] ?? 1),
                        (float)($item['valor_unitario'] ?? 0),
                        $item['descripcion'] ?? '',
                    ]);
                }
            }

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'orden_compra', $record_id, $conn);
            }

            historialInsert('orden_compra', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}

jsonResponse('error', 'Acción no reconocida', null, 400);
