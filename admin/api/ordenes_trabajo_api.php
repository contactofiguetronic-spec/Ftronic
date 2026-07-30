<?php
// ============================================================================
// ordenes_trabajo_api.php — OT del nuevo flujo: Recepción → OT → Diagnóstico
// Solo se crea OT desde Recepción. Sin ventas, sin insumos en cierre.
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

// ── Helper: cascade delete checklists, pasos, fotos, voz, videos de items de OT ──
function cascadeDeleteOtItems(array $itemIds, $conn): void
{
    if (empty($itemIds)) return;
    $placeholders = implode(',', array_fill(0, count($itemIds), '?'));

    // Obtener ejecucion_ids de estos items
    $ejStmt = $conn->prepare("SELECT id FROM checklist_ejecucion WHERE ot_item_id IN ($placeholders)");
    $ejStmt->execute($itemIds);
    $ejecucionIds = $ejStmt->fetchAll(PDO::FETCH_COLUMN);

    if (!empty($ejecucionIds)) {
        $ejPH = implode(',', array_fill(0, count($ejecucionIds), '?'));

        // Obtener paso_ids
        $paStmt = $conn->prepare("SELECT id FROM checklist_ejecucion_pasos WHERE ejecucion_id IN ($ejPH)");
        $paStmt->execute($ejecucionIds);
        $pasoIds = $paStmt->fetchAll(PDO::FETCH_COLUMN);

        if (!empty($pasoIds)) {
            $paPH = implode(',', array_fill(0, count($pasoIds), '?'));

            // Borrar archivos físicos de fotos, voz y videos
            $mediaTables = ['checklist_paso_fotos', 'checklist_paso_notas_voz', 'checklist_paso_videos'];
            foreach ($mediaTables as $table) {
                $col = ($table === 'checklist_paso_fotos') ? 'ruta_archivo' : 'ruta_archivo';
                $mStmt = $conn->prepare("SELECT $col FROM $table WHERE paso_id IN ($paPH)");
                $mStmt->execute($pasoIds);
                $mediaFiles = $mStmt->fetchAll(PDO::FETCH_COLUMN);
                foreach ($mediaFiles as $f) {
                    $fullPath = $_SERVER['DOCUMENT_ROOT'] . parse_url($f, PHP_URL_PATH);
                    if (!empty($f) && file_exists($fullPath)) @unlink($fullPath);
                }
            }
            // Borrar registros de multimedia de pasos
            $conn->prepare("DELETE FROM checklist_paso_fotos WHERE paso_id IN ($paPH)")->execute($pasoIds);
            $conn->prepare("DELETE FROM checklist_paso_notas_voz WHERE paso_id IN ($paPH)")->execute($pasoIds);
            $conn->prepare("DELETE FROM checklist_paso_videos WHERE paso_id IN ($paPH)")->execute($pasoIds);
            $conn->prepare("DELETE FROM checklist_ejecucion_pasos WHERE ejecucion_id IN ($ejPH)")->execute($ejecucionIds);
        } else {
            $conn->prepare("DELETE FROM checklist_ejecucion_pasos WHERE ejecucion_id IN ($ejPH)")->execute($ejecucionIds);
        }
        $conn->prepare("DELETE FROM checklist_ejecucion WHERE id IN ($ejPH)")->execute($ejecucionIds);
    }

    // Borrar evidencias del item (fotos/audio subidas al item)
    $conn->prepare("DELETE FROM archivos_multimedia WHERE entidad_tipo = 'ot_item_foto' AND entidad_id IN ($placeholders)")->execute($itemIds);
    $conn->prepare("DELETE FROM archivos_multimedia WHERE entidad_tipo = 'ot_item_audio' AND entidad_id IN ($placeholders)")->execute($itemIds);
}

// Protección por permiso
$action = $_REQUEST['action'] ?? '';
$writeActions = ['guardar', 'eliminar', 'agregar_item', 'actualizar_item', 'eliminar_item', 'cambiar_estado', 'duplicar', 'asignar_empleado', 'guardar_inspeccion'];
if (in_array($action, $writeActions)) {
    requirePerm('ordenes_trabajo:editar');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $id = $_GET['id'] ?? null;

    try {
        // ── KPIS ──
        if ($action === 'kpis') {
            $stmt = $conn->query(
                "SELECT
                    (SELECT COUNT(*) FROM orden_trabajo WHERE estado = 'abierta') AS pendientes,
                    (SELECT COUNT(*) FROM orden_trabajo WHERE estado IN ('proceso','diagnostico')) AS en_diagnostico,
                    (SELECT COUNT(*) FROM orden_trabajo WHERE presupuesto_id IS NOT NULL AND estado != 'cancelado') AS con_presupuesto,
                    (SELECT COUNT(*) FROM presupuesto WHERE estado = 'pagado' AND MONTH(creado) = MONTH(CURDATE()) AND YEAR(creado) = YEAR(CURDATE())) AS pagadas_mes
                "
            );
            jsonResponse('success', 'OK', $stmt->fetch());
        }

        // ── RECEPCIONES (paginadas, con flag has_ot) ──
        elseif ($action === 'recepciones_abiertas') {
            $p = paginationParams(50);
            $estado = $_GET['estado'] ?? 'all'; // all|sin_ot|con_ot
            $where = '1=1';
            $params = [];

            if ($estado === 'sin_ot') {
                $where .= ' AND ot.id IS NULL';
            } elseif ($estado === 'con_ot') {
                $where .= ' AND ot.id IS NOT NULL';
            }

            if (!empty($p['search'])) {
                $like = '%' . $p['search'] . '%';
                $where .= " AND (
                    ru.folio LIKE ? OR
                    ru.vehiculo_patente LIKE ? OR
                    ru.vehiculo_marca LIKE ? OR
                    ru.vehiculo_modelo LIKE ? OR
                    ru.cliente_nombre LIKE ? OR
                    ru.cliente_apellido LIKE ? OR
                    ru.cliente_rut LIKE ? OR
                    ru.eval_motivo_visita LIKE ?
                )";
                $params = array_merge($params, [$like, $like, $like, $like, $like, $like, $like, $like]);
            }

            $stmtC = $conn->prepare(
                "SELECT COUNT(*)
                 FROM recepcion_unificada ru
                 LEFT JOIN orden_trabajo ot ON ru.id = ot.recepcion_id
                 WHERE {$where}"
            );
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT ru.id, ru.folio, ru.fecha, ru.hora,
                        ru.eval_estado_general, ru.eval_motivo_visita,
                        ru.vehiculo_id, ru.vehiculo_patente AS patente, ru.vehiculo_marca AS marca,
                        ru.vehiculo_modelo AS modelo, ru.vehiculo_anio AS anio, ru.vehiculo_color AS color,
                        ru.vehiculo_kilometraje AS kilometraje,
                        ru.cliente_id, ru.cliente_nombre, ru.cliente_apellido,
                        ru.cliente_rut, ru.cliente_telefono,
                        ot.id AS ot_id
                 FROM recepcion_unificada ru
                 LEFT JOIN orden_trabajo ot ON ru.id = ot.recepcion_id
                 WHERE {$where}
                 ORDER BY ru.fecha DESC, ru.hora DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
            foreach ($rows as &$r) {
                $r['has_ot'] = !empty($r['ot_id']);
            }
            paginatedResponse($rows, $total, $p);
        }

        // ── DETALLE RECEPCIÓN ──
        elseif ($action === 'detalle_recepcion') {
            $id = (int)($_GET['id'] ?? 0);
            if (!$id) jsonResponse('error', 'ID requerido', null, 422);
            $stmt = $conn->prepare("SELECT * FROM recepcion_unificada WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            // Check linked OT
            $stmtOt = $conn->prepare("SELECT id FROM orden_trabajo WHERE recepcion_id = ? LIMIT 1");
            $stmtOt->execute([$id]);
            $otRow = $stmtOt->fetch();
            $rec['has_ot'] = !empty($otRow);
            $rec['ot_id']  = $otRow ? (int)$otRow['id'] : null;
            jsonResponse('success', 'OK', $rec);
        }

        // ── CHECK OT BY RECEPCIÓN ──
        elseif ($action === 'check_by_recepcion') {
            $recepcionId = (int)($_GET['recepcion_id'] ?? 0);
            $stmt = $conn->prepare("SELECT id FROM orden_trabajo WHERE recepcion_id = ? LIMIT 1");
            $stmt->execute([$recepcionId]);
            $exists = $stmt->fetch();
            jsonResponse('success', 'OK', ['exists' => (bool)$exists, 'ot_id' => $exists ? (int)$exists['id'] : null]);
        }

        // ── DETALLE ──
        elseif ($id || $action === 'detalle') {
            if ($action === 'detalle') $id = $_GET['id'] ?? null;
            if (!$id) jsonResponse('error', 'ID requerido', null, 422);

            $stmt = $conn->prepare(
                "SELECT ot.*,
                        v.patente, v.marca, v.modelo, v.anio, v.color, v.kilometraje, v.combustible, v.vin, v.cilindrada_motor,
                        c.id AS cliente_id_ref, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo, c.domicilio AS cliente_domicilio,
                        e.nombre AS empleado_nombre, e.apellido AS empleado_apellado,
                        e2.nombre AS tecnico_nombre, e2.apellido AS tecnico_apellido,
                        pv.id AS presupuesto_id_ref, pv.valor_total AS presupuesto_total, pv.fecha AS presupuesto_fecha, pv.estado AS presupuesto_estado,
                        ru.id AS recepcion_id_ref, ru.folio AS recepcion_folio, ru.fecha AS recepcion_fecha, ru.hora AS recepcion_hora,
                        ru.eval_motivo_visita, ru.eval_analisis_tecnico, ru.eval_estado_general,
                        ru.eval_condiciones_exteriores, ru.eval_condiciones_interiores, ru.eval_detalles_danos,
                        ru.vehiculo_kilometraje AS recepcion_km, ru.asesor_taller,
                        ru.foto_frontal, ru.foto_trasera, ru.foto_lateral_izq, ru.foto_lateral_der,
                        ru.foto_superior, ru.foto_motor, ru.foto_interior
                 FROM orden_trabajo ot
                 LEFT JOIN vehiculos  v ON ot.vehiculo_id = v.id
                 LEFT JOIN clientes   c ON ot.cliente_id  = c.id
                 LEFT JOIN empleados  e ON ot.asignado_empleado_id = e.id
                 LEFT JOIN empleados  e2 ON ot.tecnico_id = e2.id
                 LEFT JOIN presupuesto pv ON ot.presupuesto_id = pv.id
                 LEFT JOIN recepcion_unificada ru ON ot.recepcion_id = ru.id
                 WHERE ot.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);

            // Items de la OT (servicios, repuestos, insumos)
            $stmtItems = $conn->prepare("SELECT * FROM orden_trabajo_items WHERE orden_trabajo_id = ? ORDER BY seccion, id");
            $stmtItems->execute([$id]);
            $rec['items_list'] = $stmtItems->fetchAll();

            // Multimedia adjunta a la OT
            $rec['archivos'] = getMultimedia('orden_trabajo', (int)$id, $conn);

            // Multimedia de la recepción vinculada (fotos de ingreso, audios de síntomas)
            if (!empty($rec['recepcion_id_ref'])) {
                $rec['archivos_recepcion'] = getMultimedia('recepcion_unificada', (int)$rec['recepcion_id_ref'], $conn);
            }

            jsonResponse('success', 'OK', $rec);
        }

        // ── LISTAR ──
        elseif ($action === '' || $action === 'listar') {
            $p = paginationParams();
            $estadoFilter = $_GET['estado'] ?? '';
            $where = "1=1";
            $params = [];

            if ($estadoFilter) {
                $where = "ot.estado = ?";
                $params[] = $estadoFilter;
            }

            $search = $p['search'];
            if ($search) {
                $like = '%' . $search . '%';
                $where .= " AND (v.patente LIKE ? OR v.marca LIKE ? OR v.modelo LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ? OR c.rut LIKE ? OR ot.descripcion_problema LIKE ? OR ot.id LIKE ?)";
                $params = array_merge($params, [$like, $like, $like, $like, $like, $like, $like, $like]);
            }

            $stmtC = $conn->prepare(
                "SELECT COUNT(*) FROM orden_trabajo ot
                 LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON ot.cliente_id  = c.id
                 WHERE {$where}"
            );
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT ot.id, ot.estado, ot.fecha, ot.creado, ot.descripcion_problema, ot.prioridad, ot.asignado_empleado_id,
                        ot.vehiculo_id, ot.cliente_id,
                        v.patente, v.marca, v.modelo,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        e.nombre AS empleado_nombre, e.apellido AS empleado_apellido,
                        (SELECT COUNT(*) FROM orden_trabajo_items WHERE orden_trabajo_id = ot.id AND completado = 0) AS items_pendientes,
                        ot.presupuesto_id
                 FROM orden_trabajo ot
                 LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON ot.cliente_id  = c.id
                 LEFT JOIN empleados e ON ot.asignado_empleado_id = e.id
                 WHERE {$where}
                 ORDER BY ot.creado DESC
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

    // ── ELIMINAR ──
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            // Clean up diagnostico subtables if a linked diagnostico exists
            $stmtD = $conn->prepare("SELECT id FROM diagnosticos WHERE ot_id = ?");
            $stmtD->execute([$id]);
            $diagIds = $stmtD->fetchAll(PDO::FETCH_COLUMN);
            foreach ($diagIds as $did) {
                $conn->prepare("DELETE FROM diagnostico_pruebas_fotos WHERE prueba_id IN (SELECT id FROM diagnostico_pruebas WHERE diagnostico_id = ?)")->execute([$did]);
                $conn->prepare("DELETE FROM diagnostico_pruebas WHERE diagnostico_id = ?")->execute([$did]);
                // diagnostico_repuestos y diagnostico_servicios: LEGACY — sin datos
                $conn->prepare("DELETE FROM diagnosticos WHERE id = ?")->execute([$did]);
            }
            $conn->prepare("DELETE FROM orden_trabajo_items WHERE orden_trabajo_id = ?")->execute([$id]);
            historialInsert('orden_trabajo', (int)$id, 'eliminado', null, 'Registro eliminado', null, $conn);
            $conn->prepare("DELETE FROM orden_trabajo WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── CAMBIAR ESTADO ──
    } elseif ($action === 'update_estado' || $action === 'cambiar_estado') {
        $id = $_POST['id'] ?? null;
        $estado = $_POST['estado'] ?? '';
        if (!$id || !$estado) jsonResponse('error', 'ID y estado requeridos', null, 422);
        $allowed = ['abierta', 'proceso', 'diagnostico', 'finalizado', 'cancelado'];
        if (!in_array($estado, $allowed)) jsonResponse('error', 'Estado no válido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetchColumn();
            $conn->prepare("UPDATE orden_trabajo SET estado = ? WHERE id = ?")->execute([$estado, $id]);
            historialInsert('orden_trabajo', (int)$id, 'actualizado', 'estado', $old, $estado, $conn);
            $conn->commit();
            jsonResponse('success', 'Estado actualizado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── ASIGNAR TÉCNICO ──
    } elseif ($action === 'asignar') {
        $id = (int)($_POST['id'] ?? 0);
        $empleadoId = isset($_POST['asignado_empleado_id']) ? (int)$_POST['asignado_empleado_id'] : (isset($_POST['empleado_id']) ? (int)$_POST['empleado_id'] : null);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT asignado_empleado_id FROM orden_trabajo WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetchColumn();
            $conn->prepare("UPDATE orden_trabajo SET asignado_empleado_id = ? WHERE id = ?")->execute([$empleadoId, $id]);
            historialInsert('orden_trabajo', $id, 'actualizado', 'asignado_empleado_id', $old, $empleadoId, $conn);
            $conn->commit();
            jsonResponse('success', 'Técnico asignado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

        // ── ACTUALIZAR DATOS OT (descripción, repuestos, notas, empleado, etc.) ──
    } elseif ($action === 'update_datos') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        // Congelamiento: verificar que la OT no esté finalizada
        $stmtFreeze = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = ?");
        $stmtFreeze->execute([$id]);
        $otEstado = $stmtFreeze->fetchColumn();
        if (in_array($otEstado, ['finalizado', 'cancelado'], true)) {
            jsonResponse('error', 'La OT está finalizada o cancelada. No se pueden modificar datos.', null, 403);
        }
        try {
            $conn->beginTransaction();
            $fecha = $_POST['fecha'] ?? null;
            if ($fecha === '') $fecha = null;
            $descripcionProblema = sanitizeString($_POST['descripcion_problema'] ?? '');
            $procedimientoTecnico = sanitizeString($_POST['procedimiento_tecnico'] ?? '');
            $notasAdicionales = sanitizeString($_POST['notas_adicionales'] ?? '');
            $asignadoEmpleadoId = normalizeNullableInt($_POST['asignado_empleado_id'] ?? null);
            $repuestosCliente = sanitizeString($_POST['repuestos_cliente'] ?? '');
            $comentariosEmpleado = sanitizeString($_POST['comentarios_empleado'] ?? '');

            $conn->prepare(
                "UPDATE orden_trabajo SET
                    fecha = ?,
                    descripcion_problema = ?,
                    procedimiento_tecnico = ?,
                    notas_adicionales = ?,
                    asignado_empleado_id = ?,
                    repuestos_cliente = ?,
                    comentarios_empleado = ?
                 WHERE id = ?"
            )->execute([
                $fecha,
                $descripcionProblema,
                $procedimientoTecnico,
                $notasAdicionales,
                $asignadoEmpleadoId,
                $repuestosCliente,
                $comentariosEmpleado,
                $id,
            ]);

            // Items: siempre guardar (permite modificar items en cualquier estado)
            $itemsJson = $_POST['items_json'] ?? null;
            if ($itemsJson) {
                $items = json_decode($itemsJson, true);
                if (is_array($items) && !empty($items)) {
                    // Obtener IDs actuales de items para detectar eliminados
                    $currentIdsStmt = $conn->prepare("SELECT id FROM orden_trabajo_items WHERE orden_trabajo_id = ? AND seccion IN ('repuesto_taller','servicio')");
                    $currentIdsStmt->execute([$id]);
                    $currentItemIds = $currentIdsStmt->fetchAll(PDO::FETCH_COLUMN);
                    $newItemIds = array_values(array_filter(array_map(fn($it) => (int)($it['id'] ?? 0), $items)));
                    $removedIds = array_values(array_diff($currentItemIds, $newItemIds));

                    // Cascade delete: checklists, pasos, fotos, voz, videos de items eliminados
                    if (!empty($removedIds)) {
                        cascadeDeleteOtItems($removedIds, $conn);
                    }

                    $conn->prepare("DELETE FROM orden_trabajo_items WHERE orden_trabajo_id = ? AND seccion IN ('repuesto_taller','servicio')")->execute([$id]);
                    $stmtItem = $conn->prepare(
                        "INSERT INTO orden_trabajo_items (orden_trabajo_id, tipo, seccion, item_id, nombre, detalle, cantidad, valor_unitario, completado)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
                    );
                    foreach ($items as $item) {
                        $tipo = $item['tipo'] ?? 'servicio';
                        $seccion = $item['seccion'] ?? ($tipo === 'servicio' ? 'servicio' : 'repuesto_taller');
                        $stmtItem->execute([
                            $id,
                            $tipo,
                            $seccion,
                            $item['item_id'] ?? null,
                            $item['nombre'] ?? '',
                            $item['detalle'] ?? '',
                            $item['cantidad'] ?? 1,
                            $item['valor_unitario'] ?? 0,
                        ]);
                        $newItemId = (int)$conn->lastInsertId();
                        // Auto-crear checklist ejecución para servicios
                        if ($tipo === 'servicio' && !empty($item['item_id'])) {
                            try {
                                $pStmt = $conn->prepare(
                                    "SELECT id, nombre FROM checklist_plantilla WHERE servicio_id = ? AND activo = 1 LIMIT 1"
                                );
                                $pStmt->execute([$item['item_id']]);
                                $plantilla = $pStmt->fetch();
                                $checklistNombre = $plantilla ? $plantilla['nombre'] : 'Checklist: ' . ($item['nombre'] ?? '');
                                $conn->prepare(
                                    "INSERT INTO checklist_ejecucion
                                     (diagnostico_servicio_id, ot_item_id, checklist_plantilla_id, nombre, estado, porcentaje_completado)
                                     VALUES (NULL, ?, ?, ?, 'pendiente', 0)"
                                )->execute([$newItemId, $plantilla ? $plantilla['id'] : null, $checklistNombre]);
                                $ejecId = (int)$conn->lastInsertId();
                                if ($plantilla) {
                                    $pasosStmt = $conn->prepare(
                                        "SELECT id, orden, titulo, descripcion FROM checklist_plantilla_pasos WHERE checklist_id = ? ORDER BY orden"
                                    );
                                    $pasosStmt->execute([$plantilla['id']]);
                                    $pasoInsert = $conn->prepare(
                                        "INSERT INTO checklist_ejecucion_pasos (ejecucion_id, plantilla_paso_id, orden, titulo, descripcion, completado) VALUES (?, ?, ?, ?, ?, 0)"
                                    );
                                    while ($paso = $pasosStmt->fetch()) {
                                        $pasoInsert->execute([$ejecId, $paso['id'], $paso['orden'], $paso['titulo'], $paso['descripcion'] ?? '']);
                                    }
                                }
                            } catch (Throwable $e) {
                                error_log('orden_trabajo create checklist auto-create: ' . $e->getMessage());
                            }
                        }
                    }
                } else {
                    // Items vacíos: eliminar todos los items actuales
                    $currentIdsStmt = $conn->prepare("SELECT id FROM orden_trabajo_items WHERE orden_trabajo_id = ? AND seccion IN ('repuesto_taller','servicio')");
                    $currentIdsStmt->execute([$id]);
                    $currentItemIds = $currentIdsStmt->fetchAll(PDO::FETCH_COLUMN);
                    if (!empty($currentItemIds)) {
                        cascadeDeleteOtItems($currentItemIds, $conn);
                    }
                    $conn->prepare("DELETE FROM orden_trabajo_items WHERE orden_trabajo_id = ? AND seccion IN ('repuesto_taller','servicio')")->execute([$id]);
                }
            }

            historialInsert('orden_trabajo', $id, 'actualizado', null, null, 'Datos OT actualizados', $conn);

            // Subir archivos multimedia si se adjuntaron
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'orden_trabajo', $id, $conn);
            }

            $conn->commit();
            jsonResponse('success', 'Datos guardados');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── ELIMINAR MULTIMEDIA OT ──
    } elseif ($action === 'delete_multimedia') {
        $archivoId = (int)($_POST['archivo_id'] ?? 0);
        if (!$archivoId) jsonResponse('error', 'archivo_id requerido', null, 422);
        try {
            $stmt = $conn->prepare("SELECT ruta_archivo FROM archivos_multimedia WHERE id = ? AND entidad_tipo = 'orden_trabajo'");
            $stmt->execute([$archivoId]);
            $archivo = $stmt->fetch();
            if ($archivo && file_exists($_SERVER['DOCUMENT_ROOT'] . parse_url($archivo['ruta_archivo'], PHP_URL_PATH))) {
                @unlink($_SERVER['DOCUMENT_ROOT'] . parse_url($archivo['ruta_archivo'], PHP_URL_PATH));
            }
            $conn->prepare("DELETE FROM archivos_multimedia WHERE id = ?")->execute([$archivoId]);
            jsonResponse('success', 'Archivo eliminado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── CREAR OT DESDE RECEPCIÓN ──
    } elseif ($action === 'crear_ot_desde_recepcion') {
        $recepcionId = (int)($_POST['recepcion_id'] ?? 0);
        if (!$recepcionId) jsonResponse('error', 'recepcion_id requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM recepcion_unificada WHERE id = ?");
            $stmt->execute([$recepcionId]);
            $recep = $stmt->fetch();
            if (!$recep) jsonResponse('error', 'Recepción no encontrada', null, 404);

            // Check if OT already exists
            $chk = $conn->prepare("SELECT id FROM orden_trabajo WHERE recepcion_id = ?");
            $chk->execute([$recepcionId]);
            if ($chk->fetch()) jsonResponse('error', 'Ya existe una OT para esta recepción', null, 409);

            $vehiculoId = $recep['vehiculo_id'] ?? null;
            $clienteId = $recep['cliente_id'] ?? null;
            $evaluacion = trim(($recep['eval_estado_general'] ?? '') . "\n" . ($recep['eval_motivo_visita'] ?? ''));

            $stmtOt = $conn->prepare(
                "INSERT INTO orden_trabajo (vehiculo_id, cliente_id, recepcion_id, estado, evaluacion, descripcion_problema, fecha, prioridad)
                 VALUES (?, ?, ?, 'abierta', ?, ?, CURDATE(), 'normal')"
            );
            $stmtOt->execute([
                $vehiculoId,
                $clienteId,
                $recepcionId,
                $evaluacion,
                $recep['eval_motivo_visita'] ?? '',
            ]);
            $otId = (int)$conn->lastInsertId();
            historialInsert('orden_trabajo', $otId, 'creado', null, null, 'Creado desde recepción #' . $recepcionId, $conn);
            historialInsert('recepcion_unificada', $recepcionId, 'actualizado', null, null, 'OT #' . $otId . ' creada', $conn);
            $conn->commit();
            jsonResponse('success', 'OT creada desde recepción', ['id' => $otId, 'recepcion_id' => $recepcionId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── FINALIZAR DIAGNÓSTICO ──
    } elseif ($action === 'finalizar_diagnostico') {
        $otId = (int)($_POST['id'] ?? 0);
        $diagnosticoFinal = sanitizeString($_POST['diagnostico_final'] ?? '');
        $diagnosticoId = normalizeNullableInt($_POST['diagnostico_id'] ?? null);
        if (!$otId) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $conn->prepare("UPDATE orden_trabajo SET diagnostico_final = ?, diagnostico_finalizado = 1, diagnostico_id = ?, estado = 'finalizado' WHERE id = ?")
                ->execute([$diagnosticoFinal, $diagnosticoId, $otId]);
            historialInsert('orden_trabajo', $otId, 'actualizado', 'diagnostico_finalizado', '0', '1', $conn);
            $conn->commit();
            jsonResponse('success', 'Diagnóstico finalizado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── ACTUALIZAR ITEMS DE LA OT ──
    } elseif ($action === 'update_items') {
        $otId = (int)($_POST['id'] ?? 0);
        $itemsJson = $_POST['items_json'] ?? '[]';
        if (!$otId) jsonResponse('error', 'ID requerido', null, 422);
        $items = json_decode($itemsJson, true);
        if (!is_array($items)) $items = [];
        try {
            $conn->beginTransaction();

            // Cascade delete items eliminados
            $currentIdsStmt = $conn->prepare("SELECT id FROM orden_trabajo_items WHERE orden_trabajo_id = ?");
            $currentIdsStmt->execute([$otId]);
            $currentItemIds = $currentIdsStmt->fetchAll(PDO::FETCH_COLUMN);
            $newItemIds = array_values(array_filter(array_map(fn($it) => (int)($it['id'] ?? 0), $items)));
            $removedIds = array_values(array_diff($currentItemIds, $newItemIds));
            if (!empty($removedIds)) {
                cascadeDeleteOtItems($removedIds, $conn);
            }

            $conn->prepare("DELETE FROM orden_trabajo_items WHERE orden_trabajo_id = ?")->execute([$otId]);
            if (!empty($items)) {
                $stmt = $conn->prepare(
                    "INSERT INTO orden_trabajo_items (orden_trabajo_id, tipo, seccion, item_id, nombre, detalle, cantidad, valor_unitario, completado)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                foreach ($items as $item) {
                    $tipo = $item['tipo'] ?? 'servicio';
                    $seccion = $item['seccion'] ?? ($tipo === 'servicio' ? 'servicio' : 'repuesto_taller');
                    $stmt->execute([
                        $otId,
                        $tipo,
                        $seccion,
                        $item['item_id'] ?? null,
                        $item['nombre'] ?? '',
                        $item['detalle'] ?? '',
                        $item['cantidad'] ?? 1,
                        $item['valor_unitario'] ?? 0,
                        $item['completado'] ?? 0,
                    ]);
                    $newItemId = (int)$conn->lastInsertId();
                    // Auto-crear checklist ejecución para servicios si no existe
                    if ($tipo === 'servicio' && !empty($item['item_id'])) {
                        try {
                            $ejecCheck = $conn->prepare("SELECT id FROM checklist_ejecucion WHERE ot_item_id = ? LIMIT 1");
                            $ejecCheck->execute([$newItemId]);
                            if (!$ejecCheck->fetch()) {
                                $pStmt = $conn->prepare(
                                    "SELECT id, nombre FROM checklist_plantilla WHERE servicio_id = ? AND activo = 1 LIMIT 1"
                                );
                                $pStmt->execute([$item['item_id']]);
                                $plantilla = $pStmt->fetch();
                                $checklistNombre = $plantilla ? $plantilla['nombre'] : 'Checklist: ' . ($item['nombre'] ?? '');
                                $conn->prepare(
                                    "INSERT INTO checklist_ejecucion
                                     (diagnostico_servicio_id, ot_item_id, checklist_plantilla_id, nombre, estado, porcentaje_completado)
                                     VALUES (NULL, ?, ?, ?, 'pendiente', 0)"
                                )->execute([$newItemId, $plantilla ? $plantilla['id'] : null, $checklistNombre]);
                                $ejecId = (int)$conn->lastInsertId();
                                if ($plantilla) {
                                    $pasosStmt = $conn->prepare(
                                        "SELECT id, orden, titulo, descripcion FROM checklist_plantilla_pasos WHERE checklist_id = ? ORDER BY orden"
                                    );
                                    $pasosStmt->execute([$plantilla['id']]);
                                    $pasoInsert = $conn->prepare(
                                        "INSERT INTO checklist_ejecucion_pasos (ejecucion_id, plantilla_paso_id, orden, titulo, descripcion, completado) VALUES (?, ?, ?, ?, ?, 0)"
                                    );
                                    while ($paso = $pasosStmt->fetch()) {
                                        $pasoInsert->execute([$ejecId, $paso['id'], $paso['orden'], $paso['titulo'], $paso['descripcion'] ?? '']);
                                    }
                                }
                            }
                        } catch (Throwable $e) {
                            error_log('orden_trabajo update checklist auto-create: ' . $e->getMessage());
                        }
                    }
                }
            }
            historialInsert('orden_trabajo', $otId, 'actualizado', null, null, count($items) . ' items actualizados', $conn);
            $conn->commit();
            jsonResponse('success', 'Items actualizados');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── TOGGLE ITEM COMPLETADO ──
    } elseif ($action === 'toggle_item_completado') {
        $itemId = (int)(($_POST['item_id'] ?? $_POST['id']) ?? 0);
        $completado = isset($_POST['completado']) ? (int)$_POST['completado'] : null;
        if (!$itemId) jsonResponse('error', 'item_id requerido', null, 422);
        try {
            if ($completado !== null) {
                $estadoItem = $completado ? 'completado' : 'pendiente';
                $conn->prepare("UPDATE orden_trabajo_items SET completado = ?, estado_item = ? WHERE id = ?")->execute([$completado, $estadoItem, $itemId]);
            } else {
                $conn->prepare("UPDATE orden_trabajo_items SET completado = NOT completado, estado_item = CASE WHEN completado = 0 THEN 'completado' ELSE 'pendiente' END WHERE id = ?")->execute([$itemId]);
            }
            $stmt = $conn->prepare("SELECT completado, estado_item FROM orden_trabajo_items WHERE id = ?");
            $stmt->execute([$itemId]);
            $nuevo = $stmt->fetch();
            jsonResponse('success', $nuevo['completado'] ? 'Marcado como completado' : 'Marcado como pendiente', ['completado' => (int)$nuevo['completado'], 'estado_item' => $nuevo['estado_item']]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── ACTUALIZAR PRIORIDAD ──
    } elseif ($action === 'update_prioridad') {
        $id = (int)($_POST['id'] ?? 0);
        $prioridad = $_POST['prioridad'] ?? '';
        if (!$id || !in_array($prioridad, ['baja','normal','alta','urgente'])) jsonResponse('error', 'ID y prioridad válida requeridos', null, 422);
        try {
            $conn->prepare("UPDATE orden_trabajo SET prioridad = ? WHERE id = ?")->execute([$prioridad, $id]);
            jsonResponse('success', 'Prioridad actualizada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── CREAR OT RÁPIDA ──
    } elseif ($action === 'crear_ot_rapida') {
        $vehiculoId = normalizeNullableInt($_POST['vehiculo_id'] ?? null);
        $clienteId = normalizeNullableInt($_POST['cliente_id'] ?? null);
        if (!$vehiculoId || !$clienteId) jsonResponse('error', 'vehiculo_id y cliente_id requeridos', null, 422);
        try {
            $conn->beginTransaction();
            $stmtOt = $conn->prepare(
                "INSERT INTO orden_trabajo (vehiculo_id, cliente_id, estado, fecha, prioridad)
                 VALUES (?, ?, 'abierta', CURDATE(), 'normal')"
            );
            $stmtOt->execute([$vehiculoId, $clienteId]);
            $otId = (int)$conn->lastInsertId();
            historialInsert('orden_trabajo', $otId, 'creado', null, null, 'OT rápida creada desde diagnóstico', $conn);
            $conn->commit();
            jsonResponse('success', 'OT rápida creada', ['id' => $otId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── ELIMINAR ITEM ──
    } elseif ($action === 'delete_item') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("DELETE FROM orden_trabajo_items WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Item eliminado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── INICIAR TRABAJO ──
    } elseif ($action === 'iniciar_trabajo') {
        $id = (int)($_POST['id'] ?? 0);
        $tecnicoId = normalizeNullableInt($_POST['tecnico_id'] ?? null);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare(
                "UPDATE orden_trabajo
                 SET fecha_inicio_trabajo = COALESCE(fecha_inicio_trabajo, CURDATE()),
                     hora_inicio_trabajo = COALESCE(hora_inicio_trabajo, CURTIME()),
                     tecnico_id = ?,
                     asignado_empleado_id = COALESCE(asignado_empleado_id, ?),
                     estado = 'proceso'
                 WHERE id = ?"
            );
            $stmt->execute([$tecnicoId, $tecnicoId, $id]);
            historialInsert('orden_trabajo', $id, 'actualizado', 'estado', 'abierta', 'proceso', $conn);
            historialInsert('orden_trabajo', $id, 'inicio_trabajo', null, null, json_encode(['fecha' => date('Y-m-d'), 'hora' => date('H:i:s'), 'tecnico_id' => $tecnicoId]), $conn);
            $conn->commit();
            jsonResponse('success', 'Trabajo iniciado', ['id' => $id, 'fecha' => date('Y-m-d'), 'hora' => date('H:i:s')]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── FINALIZAR TRABAJO (cierra OT para liquidación) ──
    } elseif ($action === 'finalizar_trabajo') {
        $id = (int)($_POST['id'] ?? 0);
        $observacionFinal = sanitizeString($_POST['observacion_final'] ?? '', 1000);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            // Verificar que la OT exista y esté en estado válido
            $stmt = $conn->prepare("SELECT estado, fecha_inicio_trabajo, hora_inicio_trabajo FROM orden_trabajo WHERE id = ?");
            $stmt->execute([$id]);
            $ot = $stmt->fetch();
            if (!$ot) jsonResponse('error', 'OT no encontrada', null, 404);
            if (!in_array($ot['estado'], ['proceso', 'diagnostico'], true)) {
                jsonResponse('error', 'Solo se puede finalizar una OT en proceso o diagnóstico');
            }

            // Verificar que todos los ítems estén completados
            $checkItems = $conn->prepare(
                "SELECT COUNT(*) AS total,
                        SUM(CASE WHEN estado_item='completado' THEN 1 ELSE 0 END) AS completados
                 FROM orden_trabajo_items WHERE orden_trabajo_id = ?"
            );
            $checkItems->execute([$id]);
            $itemsRow = $checkItems->fetch();
            if ((int)$itemsRow['total'] === 0) {
                jsonResponse('error', 'La OT no tiene ítems en el checklist');
            }
            if ((int)$itemsRow['completados'] < (int)$itemsRow['total']) {
                jsonResponse('error', 'Todos los ítems deben estar completados para finalizar');
            }

            $conn->prepare(
                "UPDATE orden_trabajo
                 SET estado = 'finalizado',
                     fecha_fin = NOW(),
                     fecha_fin_trabajo = COALESCE(fecha_fin_trabajo, CURDATE()),
                     hora_fin_trabajo = COALESCE(hora_fin_trabajo, CURTIME()),
                     hora_fin_procesos = NOW(),
                     notas_adicionales = CONCAT(COALESCE(notas_adicionales,''), IF(? != '', CONCAT('\n[Cierre] ', ?), ''))
                 WHERE id = ?"
            )->execute([$observacionFinal, $observacionFinal, $id]);

            historialInsert('orden_trabajo', $id, 'actualizado', 'estado', $ot['estado'], 'finalizado', $conn);
            historialInsert('orden_trabajo', $id, 'cierre_trabajo', null, null,
                json_encode(['fecha_fin' => date('Y-m-d'), 'hora_fin' => date('H:i:s')]), $conn);
            $conn->commit();
            jsonResponse('success', 'Trabajo finalizado — OT lista para liquidación', [
                'id' => $id,
                'estado' => 'finalizado',
                'fecha_fin' => date('Y-m-d'),
                'hora_fin' => date('H:i:s')
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── AGREGAR REPUESTO DEL CLIENTE (con foto) ──
    } elseif ($action === 'add_repuesto_cliente') {
        $otId = (int)($_POST['ot_id'] ?? 0);
        $descripcion = sanitizeString($_POST['descripcion'] ?? '', 500);
        if (!$otId || !$descripcion) jsonResponse('error', 'OT y descripción requeridos', null, 422);
        try {
            $conn->beginTransaction();
            $fotoPath = null;
            if (!empty($_FILES['foto']['name']) && $_FILES['foto']['error'] === UPLOAD_ERR_OK) {
                $dir = UPLOADS_BASE_PATH . 'ot_repuestos_cliente/';
                if (!is_dir($dir)) mkdir($dir, 0755, true);
                $ext = strtolower(pathinfo($_FILES['foto']['name'], PATHINFO_EXTENSION));
                if (!in_array($ext, ['jpg','jpeg','png','gif','webp'])) $ext = 'jpg';
                $fname = 'repcli_' . $otId . '_' . time() . '_' . uniqid() . '.' . $ext;
                if (move_uploaded_file($_FILES['foto']['tmp_name'], $dir . $fname)) {
                    $fotoPath = UPLOADS_BASE_URL . 'ot_repuestos_cliente/' . $fname;
                }
            }
            $stmtCurrent = $conn->prepare("SELECT repuestos_cliente FROM orden_trabajo WHERE id = ?");
            $stmtCurrent->execute([$otId]);
            $current = $stmtCurrent->fetchColumn() ?: '';
            $entry = json_encode([
                'descripcion' => $descripcion,
                'foto' => $fotoPath,
                'creado' => date('Y-m-d H:i:s'),
            ], JSON_UNESCAPED_UNICODE);
            $new = trim($current) ? $current . "\n" . $entry : $entry;
            $conn->prepare("UPDATE orden_trabajo SET repuestos_cliente = ? WHERE id = ?")->execute([$new, $otId]);
            historialInsert('orden_trabajo', $otId, 'actualizado', 'repuesto_cliente', null, $descripcion, $conn);
            $conn->commit();
            jsonResponse('success', 'Repuesto del cliente agregado', ['foto' => $fotoPath]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ── AGREGAR REPUESTO A ORDEN DE TRABAJO ──
    } elseif ($action === 'add_item_ot') {
        $otId = (int)($_POST['ot_id'] ?? 0);
        $seccion = $_POST['seccion'] ?? 'repuesto_taller'; // repuesto_taller | repuesto_cliente | servicio
        $nombre = sanitizeString($_POST['nombre'] ?? '', 255);
        $cantidad = (int)($_POST['cantidad'] ?? 1);
        $detalle = sanitizeString($_POST['detalle'] ?? '', 500);
        $valorUnitario = (float)($_POST['valor_unitario'] ?? 0);
        $itemId = normalizeNullableInt($_POST['item_id'] ?? null);
        if (!$otId || !$nombre) jsonResponse('error', 'OT y nombre requeridos', null, 422);
        try {
            $stmt = $conn->prepare(
                "INSERT INTO orden_trabajo_items (orden_trabajo_id, tipo, item_id, nombre, detalle, cantidad, valor_unitario, seccion)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([$otId, $seccion === 'servicio' ? 'servicio' : 'articulo', $itemId, $nombre, $detalle, $cantidad, $valorUnitario, $seccion]);
            $newId = (int)$conn->lastInsertId();
            historialInsert('orden_trabajo', $otId, 'item_agregado', $seccion, null, $nombre, $conn);
            jsonResponse('success', 'Item agregado', ['id' => $newId]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } else {
        jsonResponse('error', 'Acción no reconocida: ' . $action, null, 400);
    }
}
