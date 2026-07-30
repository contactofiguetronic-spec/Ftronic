<?php
require_once '../includes/conexion.php';
requireAuth();

$action = $_REQUEST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$writeActions = ['insert','update','delete','update_descontaminacion','cambiar_estado','create_from_recepcion','iniciar_descontaminacion','completar_descontaminacion','iniciar_desarme','completar_desarme','iniciar_preparacion','completar_preparacion','cancelar','retroceder_fase'];

if ($method === 'POST') {
    requirePerm('desarme_automotriz:editar');
}

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $id = $_GET['id'] ?? null;

    if ($action === 'check_by_recepcion') {
        $recepcionId = normalizeNullableInt($_GET['recepcion_id'] ?? null);
        if (!$recepcionId) jsonResponse('error', 'recepcion_id requerido', null, 422);
        $stmt = $conn->prepare("SELECT COUNT(*) FROM desarme_vehiculo WHERE recepcion_id = ?");
        $stmt->execute([$recepcionId]);
        jsonResponse('success', 'OK', ['exists' => (int)$stmt->fetchColumn() > 0]);
    }

    if ($action === 'stats') {
        try {
            $stats = [];
            $stmt = $conn->query("SELECT estado, COUNT(*) as total FROM desarme_vehiculo GROUP BY estado");
            $stats['por_estado'] = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
            $stmt2 = $conn->query("SELECT motivo_desarme, COUNT(*) as total FROM desarme_vehiculo GROUP BY motivo_desarme");
            $stats['por_motivo'] = $stmt2->fetchAll(PDO::FETCH_KEY_PAIR);
            $stmt3 = $conn->query("SELECT COUNT(*) FROM desarme_vehiculo WHERE DATE(creado) = CURDATE()");
            $stats['hoy'] = (int)$stmt3->fetchColumn();
            jsonResponse('success', 'OK', $stats);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT dv.*,
                        v.marca AS v_marca, v.modelo AS v_modelo, v.anio AS v_anio,
                        v.patente AS v_patente, v.vin AS v_vin, v.color AS v_color,
                        v.combustible AS v_combustible, v.transmision AS v_transmision,
                        v.traccion AS v_traccion, v.kilometraje AS v_kilometraje,
                        v.cilindrada_motor AS v_cilindrada,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono,
                        e.nombre AS tecnico_nombre, e.apellido AS tecnico_apellido
                 FROM desarme_vehiculo dv
                 LEFT JOIN vehiculos v ON dv.vehiculo_id = v.id
                 LEFT JOIN clientes c ON dv.cliente_id = c.id
                 LEFT JOIN empleados e ON dv.tecnico_asignado = e.id
                 WHERE dv.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);

            // Get descontamination items
            $stmtD = $conn->prepare("SELECT * FROM desarme_descontaminacion WHERE desarme_id = ? ORDER BY id");
            $stmtD->execute([$id]);
            $rec['descontaminacion'] = $stmtD->fetchAll();

            // Get extracted parts count
            $stmtP = $conn->prepare("SELECT COUNT(*) FROM desarme_items WHERE desarme_id = ?");
            $stmtP->execute([$id]);
            $rec['total_piezas'] = (int)$stmtP->fetchColumn();

            // Get parts by phase
            $stmtF = $conn->prepare("SELECT fase, COUNT(*) as total FROM desarme_items WHERE desarme_id = ? GROUP BY fase");
            $stmtF->execute([$id]);
            $rec['fases_piezas'] = $stmtF->fetchAll(PDO::FETCH_KEY_PAIR);

            // Get history
            $stmtH = $conn->prepare(
                "SELECT dh.*, u.username AS usuario_nombre
                 FROM desarme_historial dh
                 LEFT JOIN usuarios u ON dh.usuario_id = u.id
                 WHERE dh.desarme_id = ? ORDER BY dh.creado DESC LIMIT 20"
            );
            $stmtH->execute([$id]);
            $rec['historial'] = $stmtH->fetchAll();

            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $filterEstado = $_GET['estado'] ?? '';
            $filterMotivo = $_GET['motivo'] ?? '';

            $where = ['1=1'];
            $params = [];
            if ($filterEstado) { $where[] = 'dv.estado = ?'; $params[] = $filterEstado; }
            if ($filterMotivo) { $where[] = 'dv.motivo_desarme = ?'; $params[] = $filterMotivo; }
            $whereStr = implode(' AND ', $where);

            $countSql = "SELECT COUNT(*) FROM desarme_vehiculo dv WHERE {$whereStr}";
            $stmtC = $conn->prepare($countSql);
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $sw = buildSearchWhere(['dv.folio','v.patente','v.marca','v.modelo','c.nombre','c.rut'], $p['search'], 'dv');
            $allWhere = array_merge([$whereStr], [$sw['where']]);
            $allParams = array_merge($params, $sw['params']);

            $stmt = $conn->prepare(
                "SELECT dv.id, dv.folio, dv.estado, dv.motivo_desarme, dv.motivo_detalle,
                        dv.creado, dv.actualizado,
                        v.marca AS v_marca, v.modelo AS v_modelo, v.anio AS v_anio,
                        v.patente AS v_patente, v.combustible AS v_combustible,
                        v.transmision AS v_transmision, v.traccion AS v_traccion,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        e.nombre AS tecnico_nombre, e.apellido AS tecnico_apellido,
                        (SELECT COUNT(*) FROM desarme_items di WHERE di.desarme_id = dv.id) AS total_piezas,
                        (SELECT COUNT(*) FROM desarme_items di WHERE di.desarme_id = dv.id AND di.fase != 'extraida') AS piezas_procesadas
                 FROM desarme_vehiculo dv
                 LEFT JOIN vehiculos v ON dv.vehiculo_id = v.id
                 LEFT JOIN clientes c ON dv.cliente_id = c.id
                 LEFT JOIN empleados e ON dv.tecnico_asignado = e.id
                 WHERE " . implode(' AND ', $allWhere) . "
                 ORDER BY dv.creado DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($allParams);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }

} elseif ($method === 'POST') {
    if ($action === 'update_descontaminacion') {
        $desarmeId = $_POST['id'] ?? null;
        $descontId = $_POST['descont_id'] ?? null;
        if (!$desarmeId || !$descontId) jsonResponse('error', 'Datos incompletos', null, 422);
        $realizado = isset($_POST['realizado']) ? (int)$_POST['realizado'] : null;
        $litros = $_POST['litros'] ?? null;
        $destino = $_POST['destino'] ?? null;
        try {
            $sets = [];
            $params = [];
            if ($realizado !== null) { $sets[] = 'realizado = ?'; $params[] = $realizado; }
            if ($litros !== null) { $sets[] = 'litros = ?'; $params[] = $litros; }
            if ($destino !== null) { $sets[] = 'destino_disposicion = ?'; $params[] = $destino; }
            if (!empty($sets)) {
                $params[] = $descontId;
                $params[] = $desarmeId;
                $conn->prepare("UPDATE desarme_descontaminacion SET " . implode(', ', $sets) . " WHERE id = ? AND desarme_id = ?")->execute($params);
            }
            jsonResponse('success', 'Actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'insert') {
        $recepcion_id = normalizeNullableInt($_POST['recepcion_id'] ?? null);
        $vehiculo_id = (int)($_POST['vehiculo_id'] ?? 0);
        $cliente_id = normalizeNullableInt($_POST['cliente_id'] ?? null);
        $motivo_desarme = sanitizeString($_POST['motivo_desarme'] ?? 'otro', 30);
        $motivo_detalle = sanitizeString($_POST['motivo_detalle'] ?? '', 0);
        $tecnico_asignado = normalizeNullableInt($_POST['tecnico_asignado'] ?? null);

        if (!$vehiculo_id) jsonResponse('error', 'Vehículo requerido', null, 422);

        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare(
                "INSERT INTO desarme_vehiculo (recepcion_id, vehiculo_id, cliente_id, motivo_desarme, motivo_detalle, tecnico_asignado, estado)
                 VALUES (?, ?, ?, ?, ?, ?, 'recepcion')"
            );
            $stmt->execute([$recepcion_id, $vehiculo_id, $cliente_id, $motivo_desarme, $motivo_detalle ?: null, $tecnico_asignado]);
            $record_id = (int)$conn->lastInsertId();

            // Get folio
            $stmtF = $conn->prepare("SELECT folio FROM desarme_vehiculo WHERE id = ?");
            $stmtF->execute([$record_id]);
            $folio = $stmtF->fetchColumn();

            // Create linked OT
            $stmtOT = $conn->prepare(
                "INSERT INTO orden_trabajo (vehiculo_id, cliente_id, recepcion_id, estado, descripcion_problema, fecha)
                 VALUES (?, ?, ?, 'abierta', ?, CURDATE())"
            );
            $otDesc = "Proceso de desarme vehicular - Motivo: {$motivo_desarme}" . ($motivo_detalle ? " - {$motivo_detalle}" : '');
            $stmtOT->execute([$vehiculo_id, $cliente_id, $recepcion_id, $otDesc]);
            $ot_id = (int)$conn->lastInsertId();

            // Link OT to desarme
            $conn->prepare("UPDATE desarme_vehiculo SET orden_trabajo_id = ? WHERE id = ?")->execute([$ot_id, $record_id]);

            // Create default descontamination items
            $items = ['Batería','Gases de A/C','Fluidos generales'];
            $stmtDC = $conn->prepare("INSERT INTO desarme_descontaminacion (desarme_id, item) VALUES (?, ?)");
            foreach ($items as $item) {
                $stmtDC->execute([$record_id, $item]);
            }

            // History
            historialInsert('desarme_vehiculo', $record_id, 'creado', null, null, json_encode(['motivo'=>$motivo_desarme]), $conn);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'creado', ?, ?)")
                 ->execute([$record_id, "Proceso de desarme iniciado. Motivo: {$motivo_desarme}", $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Desarme creado', ['id' => $record_id, 'folio' => $folio, 'ot_id' => $ot_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            historialInsert('desarme_vehiculo', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM desarme_vehiculo WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'create_from_recepcion') {
        $recepcion_id = normalizeNullableInt($_POST['recepcion_id'] ?? null);
        if (!$recepcion_id) jsonResponse('error', 'Recepción requerida', null, 422);

        try {
            $stmtR = $conn->prepare(
                "SELECT * FROM recepcion_unificada WHERE id = ?"
            );
            $stmtR->execute([$recepcion_id]);
            $rec = $stmtR->fetch();
            if (!$rec) jsonResponse('error', 'Recepción no encontrada', null, 404);

            $vehiculo_id = $rec['vehiculo_id'] ?? null;
            $cliente_id = $rec['cliente_id'] ?? null;

            if (!$vehiculo_id || !$cliente_id) {
                jsonResponse('error', 'La recepción no tiene vehículo o cliente asociado', null, 422);
            }

            $conn->beginTransaction();

            $stmt = $conn->prepare(
                "INSERT INTO desarme_vehiculo (recepcion_id, vehiculo_id, cliente_id, motivo_desarme, motivo_detalle, estado)
                 VALUES (?, ?, ?, 'otro', 'Derivado desde recepción', 'recepcion')"
            );
            $stmt->execute([$recepcion_id, $vehiculo_id, $cliente_id]);
            $record_id = (int)$conn->lastInsertId();

            $stmtF = $conn->prepare("SELECT folio FROM desarme_vehiculo WHERE id = ?");
            $stmtF->execute([$record_id]);
            $folio = $stmtF->fetchColumn();

            $stmtOT = $conn->prepare(
                "INSERT INTO orden_trabajo (vehiculo_id, cliente_id, recepcion_id, estado, descripcion_problema, fecha)
                 VALUES (?, ?, ?, 'abierta', 'Proceso de desarme vehicular - Derivado desde recepción', CURDATE())"
            );
            $stmtOT->execute([$vehiculo_id, $cliente_id, $recepcion_id]);
            $ot_id = (int)$conn->lastInsertId();

            $conn->prepare("UPDATE desarme_vehiculo SET orden_trabajo_id = ? WHERE id = ?")->execute([$ot_id, $record_id]);

            $items = ['Batería','Gases de A/C','Fluidos generales'];
            $stmtDC = $conn->prepare("INSERT INTO desarme_descontaminacion (desarme_id, item) VALUES (?, ?)");
            foreach ($items as $item) {
                $stmtDC->execute([$record_id, $item]);
            }

            historialInsert('desarme_vehiculo', $record_id, 'creado', null, null, json_encode(['motivo'=>'recepcion']), $conn);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'creado', ?, ?)")
                 ->execute([$record_id, "Proceso de desarme iniciado desde recepción #{$rec['folio']}", $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Desarme creado desde recepción', ['id' => $record_id, 'folio' => $folio, 'ot_id' => $ot_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'cambiar_estado') {
        $id = $_POST['id'] ?? null;
        $nuevo_estado = $_POST['estado'] ?? '';
        $valid = ['recepcion','descontaminacion','desarme','preparacion','completado','cancelado'];
        if (!$id || !in_array($nuevo_estado, $valid)) jsonResponse('error', 'Datos inválidos', null, 422);

        try {
            $conn->beginTransaction();
            $timestamp_field = null;
            if ($nuevo_estado === 'descontaminacion') $timestamp_field = 'inicio_descontaminacion';
            elseif ($nuevo_estado === 'desarme') $timestamp_field = 'inicio_desarme';
            elseif ($nuevo_estado === 'preparacion') $timestamp_field = 'inicio_preparacion';
            elseif ($nuevo_estado === 'completado') {
                // Set fin timestamps
                $conn->prepare("UPDATE desarme_vehiculo SET estado=?, fin_descontaminacion=COALESCE(fin_descontaminacion,NOW()), fin_desarme=COALESCE(fin_desarme,NOW()), fin_preparacion=COALESCE(fin_preparacion,NOW()) WHERE id=?")->execute([$nuevo_estado, $id]);
            }

            if ($timestamp_field && $nuevo_estado !== 'completado') {
                $conn->prepare("UPDATE desarme_vehiculo SET estado=?, {$timestamp_field}=NOW() WHERE id=?")->execute([$nuevo_estado, $id]);
            } elseif ($nuevo_estado !== 'completado') {
                $conn->prepare("UPDATE desarme_vehiculo SET estado=? WHERE id=?")->execute([$nuevo_estado, $id]);
            }

            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'estado_cambiado', ?, ?)")
                 ->execute([$id, "Estado cambiado a: {$nuevo_estado}", $_SESSION['usuario_id'] ?? null]);
            $conn->commit();
            jsonResponse('success', 'Estado actualizado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'iniciar_descontaminacion') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE desarme_vehiculo SET estado='descontaminacion', inicio_descontaminacion=NOW() WHERE id=? AND estado='recepcion'")->execute([$id]);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'fase_iniciada', 'Fase de descontaminación iniciada', ?)")
                 ->execute([$id, $_SESSION['usuario_id'] ?? null]);
            jsonResponse('success', 'Descontaminación iniciada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'completar_descontaminacion') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE desarme_vehiculo SET estado='desarme', fin_descontaminacion=NOW(), inicio_desarme=NOW() WHERE id=?")->execute([$id]);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'fase_completada', 'Descontaminación completada - Iniciando desarme', ?)")
                 ->execute([$id, $_SESSION['usuario_id'] ?? null]);
            jsonResponse('success', 'Descontaminación completada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'completar_desarme') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE desarme_vehiculo SET estado='preparacion', fin_desarme=NOW(), inicio_preparacion=NOW() WHERE id=?")->execute([$id]);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'fase_completada', 'Desarme completado - Iniciando preparación', ?)")
                 ->execute([$id, $_SESSION['usuario_id'] ?? null]);
            jsonResponse('success', 'Desarme completado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'completar_preparacion') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE desarme_vehiculo SET estado='completado', fin_preparacion=NOW() WHERE id=?")->execute([$id]);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'fase_completada', 'Preparación completada - Proceso finalizado', ?)")
                 ->execute([$id, $_SESSION['usuario_id'] ?? null]);
             jsonResponse('success', 'Preparación completada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'retroceder_fase') {
        $id = $_POST['id'] ?? null;
        $destino = $_POST['destino'] ?? '';
        if (!$id || !in_array($destino, ['recepcion','descontaminacion','desarme','preparacion','completado'])) {
            jsonResponse('error', 'Datos inválidos', null, 422);
        }
        try {
            $faseLabels = ['recepcion'=>'Recepción','descontaminacion'=>'Descontaminación','desarme'=>'Desarme','preparacion'=>'Preparación','completado'=>'Completado'];
            $conn->prepare("UPDATE desarme_vehiculo SET estado=? WHERE id=?")->execute([$destino, $id]);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'fase_retrocedida', ?, ?)")
                 ->execute([$id, "Fase retrocedida a: " . ($faseLabels[$destino] ?? $destino), $_SESSION['usuario_id'] ?? null]);
            jsonResponse('success', 'Fase retrocedida a ' . ($faseLabels[$destino] ?? $destino));
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'update') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $tecnico_asignado = normalizeNullableInt($_POST['tecnico_asignado'] ?? null);
        $motivo_detalle = sanitizeString($_POST['motivo_detalle'] ?? '', 0);
        $notas_generales = sanitizeString($_POST['notas_generales'] ?? '', 0);

        try {
            $conn->prepare("UPDATE desarme_vehiculo SET tecnico_asignado=?, motivo_detalle=?, notas_generales=? WHERE id=?")
                 ->execute([$tecnico_asignado, $motivo_detalle ?: null, $notas_generales ?: null, $id]);
            jsonResponse('success', 'Actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'cancelar') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE desarme_vehiculo SET estado='cancelado' WHERE id=?")->execute([$id]);
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'cancelado', 'Proceso cancelado', ?)")
                 ->execute([$id, $_SESSION['usuario_id'] ?? null]);
            jsonResponse('success', 'Proceso cancelado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } else {
        jsonResponse('error', 'Acción no válida', null, 400);
    }
} else {
    jsonResponse('error', 'Método no permitido', null, 405);
}
