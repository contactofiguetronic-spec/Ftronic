<?php
// ============================================================================
// vehiculos_api.php — CRUD Vehículos + Ficha Completa
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('vehiculos:editar');
}

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $cliente_id = normalizeNullableInt($_GET['cliente_id'] ?? null);

    // ── Acciones especiales para ficha completa ──
    if ($action === 'recepciones' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT id, folio, fecha, hora, eval_estado_general, eval_motivo_visita,
                        numero_orden_interna, asesor_taller, foto_frontal, foto_trasera,
                        foto_lateral_izq, foto_lateral_der, foto_superior, foto_motor, foto_interior,
                        vehiculo_kilometraje, insp_observaciones_generales, creado
                 FROM recepcion_unificada WHERE vehiculo_id = ? ORDER BY fecha DESC, creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'trabajos' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT ot.id, ot.estado, ot.vigencia, ot.trabajo_ejecutar, ot.creado,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
                 FROM orden_trabajo ot
                 LEFT JOIN clientes c ON ot.cliente_id = c.id
                 WHERE ot.vehiculo_id = ? ORDER BY ot.creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'presupuestos' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT id, estado, fecha, valor_total, requisito, creado
                 FROM presupuesto WHERE vehiculo_id = ? ORDER BY creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'notas' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT * FROM vehiculo_notas WHERE vehiculo_id = ? ORDER BY creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'tecnico_multimedia' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT * FROM archivos_multimedia WHERE entidad_tipo = 'vehiculos' AND entidad_id = ? ORDER BY creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Lectura normal ──
    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT v.*, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
                 FROM vehiculos v
                 LEFT JOIN clientes c ON v.cliente_id = c.id
                 WHERE v.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('vehiculos', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } elseif ($cliente_id) {
            $stmt = $conn->prepare(
                "SELECT id, marca, modelo, anio, patente, color, combustible, kilometraje
                 FROM vehiculos WHERE cliente_id = ? ORDER BY creado DESC"
            );
            $stmt->execute([$cliente_id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['v.patente','v.marca','v.modelo','v.vin','c.nombre','c.apellido'], $p['search']);
            $countSql = "SELECT COUNT(*) FROM vehiculos v LEFT JOIN clientes c ON v.cliente_id = c.id WHERE {$sw['where']}";
            $stmtC = $conn->prepare($countSql);
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT v.id, v.marca, v.modelo, v.anio, v.patente, v.vin, v.color, v.combustible,
                        v.kilometraje, v.cilindrada_motor, v.transmision, v.traccion,
                        v.tipo_carroceria, v.procedencia, v.disenoestructural, v.notas_tecnico, v.creado,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        COALESCE(
                            (SELECT foto_frontal FROM recepcion_unificada WHERE vehiculo_id=v.id AND foto_frontal IS NOT NULL AND foto_frontal != '' ORDER BY id DESC LIMIT 1),
                            (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='vehiculos' AND entidad_id=v.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1)
                        ) AS thumb_url
                 FROM vehiculos v
                 LEFT JOIN clientes c ON v.cliente_id = c.id
                 WHERE {$sw['where']}
                 ORDER BY v.creado DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
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
            deleteMultimedia('vehiculos', (int)$id, $conn);
            $conn->prepare("DELETE FROM vehiculo_notas WHERE vehiculo_id = ?")->execute([$id]);
            historialInsert('vehiculos', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM vehiculos WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Upload multimedia standalone ──
    elseif ($action === 'upload_media') {
        $id = (int)($_POST['id'] ?? 0);
        $module = sanitizeString($_POST['module'] ?? 'vehiculo', 50);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        if (empty($_FILES['archivos']['name'][0])) jsonResponse('error', 'No hay archivos para subir', null, 422);
        try {
            $entidadTipo = $module === 'apoyo_tecnico' ? 'apoyo_tecnico' : 'vehiculos';
            $count = uploadMultimedia($_FILES['archivos'], $entidadTipo, $id, $conn);
            jsonResponse('success', "$count archivo(s) subido(s)", ['count' => $count]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── Guardar nota técnica ──
    elseif ($action === 'save_nota') {
        $vehiculo_id = normalizeNullableInt($_POST['vehiculo_id'] ?? null);
        if (!$vehiculo_id) jsonResponse('error', 'vehiculo_id requerido', null, 422);
        $nota_id = $_POST['nota_id'] ?? null;
        $titulo = sanitizeString($_POST['titulo'] ?? '', 255);
        $contenido = $_POST['contenido'] ?? '';
        $categoria = sanitizeString($_POST['categoria'] ?? 'general', 50);
        if (!$titulo) jsonResponse('error', 'Título requerido', null, 422);
        try {
            if ($nota_id) {
                $conn->prepare("UPDATE vehiculo_notas SET titulo=?, contenido=?, categoria=?, actualizado=NOW() WHERE id=? AND vehiculo_id=?")
                    ->execute([$titulo, $contenido, $categoria, $nota_id, $vehiculo_id]);
            } else {
                $conn->prepare("INSERT INTO vehiculo_notas (vehiculo_id, titulo, contenido, categoria) VALUES (?,?,?,?)")
                    ->execute([$vehiculo_id, $titulo, $contenido, $categoria]);
                $nota_id = (int)$conn->lastInsertId();
            }
            jsonResponse('success', 'Nota guardada', ['id' => $nota_id]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
    }

    // ── Eliminar nota ──
    elseif ($action === 'delete_nota') {
        $nota_id = $_POST['nota_id'] ?? null;
        if (!$nota_id) jsonResponse('error', 'nota_id requerido', null, 422);
        try {
            $conn->prepare("DELETE FROM vehiculo_notas WHERE id = ?")->execute([$nota_id]);
            jsonResponse('success', 'Nota eliminada');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
    }

    // ── Crear/Actualizar vehículo ──
    else {
        $id         = $_POST['id'] ?? null;
        $cliente_id = normalizeNullableInt($_POST['cliente_id'] ?? null);

        requireFields($_POST, ['cliente_id']);

        $data = [
            ':cliente_id'       => $cliente_id,
            ':marca'            => sanitizeString($_POST['marca'] ?? '', 50),
            ':modelo'           => sanitizeString($_POST['modelo'] ?? '', 100),
            ':anio'             => normalizeNullableInt($_POST['anio'] ?? null),
            ':patente'          => strtoupper(sanitizeString($_POST['patente'] ?? '', 20)) ?: null,
            ':vin'              => sanitizeString($_POST['vin'] ?? '', 50) ?: null,
            ':color'            => sanitizeString($_POST['color'] ?? '', 50),
            ':combustible'      => sanitizeString($_POST['combustible'] ?? '', 50),
            ':kilometraje'      => normalizeNullableInt($_POST['kilometraje'] ?? null),
            ':cilindrada_motor' => normalizeNullableInt($_POST['cilindrada_motor'] ?? null),
            ':transmision'      => sanitizeString($_POST['transmision'] ?? '', 50),
            ':traccion'         => sanitizeString($_POST['traccion'] ?? '', 50),
            ':tipo_carroceria'  => sanitizeString($_POST['tipo_carroceria'] ?? '', 50),
            ':procedencia'      => sanitizeString($_POST['procedencia'] ?? '', 100),
            ':disenoestructural'=> sanitizeString($_POST['disenoestructural'] ?? '', 100),
            ':notas_tecnico'    => $_POST['notas_tecnico'] ?? null,
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE vehiculos SET
                    cliente_id=:cliente_id, marca=:marca, modelo=:modelo, anio=:anio,
                    patente=:patente, vin=:vin, color=:color, combustible=:combustible,
                    kilometraje=:kilometraje, cilindrada_motor=:cilindrada_motor,
                    transmision=:transmision, traccion=:traccion, tipo_carroceria=:tipo_carroceria,
                    procedencia=:procedencia, disenoestructural=:disenoestructural,
                    notas_tecnico=:notas_tecnico
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO vehiculos
                    (cliente_id, marca, modelo, anio, patente, vin, color, combustible,
                     kilometraje, cilindrada_motor, transmision, traccion, tipo_carroceria,
                     procedencia, disenoestructural, notas_tecnico)
                    VALUES
                    (:cliente_id, :marca, :modelo, :anio, :patente, :vin, :color, :combustible,
                     :kilometraje, :cilindrada_motor, :transmision, :traccion, :tipo_carroceria,
                     :procedencia, :disenoestructural, :notas_tecnico)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'vehiculos', $record_id, $conn);
            }
            historialInsert('vehiculos', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, [
                'id' => $record_id,
                'patente' => $_POST['patente'] ?? '',
                'marca' => $_POST['marca'] ?? '',
                'modelo' => $_POST['modelo'] ?? ''
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
