<?php
// ============================================================================
// tareas_diarias_api.php — CRUD Tareas Diarias (Blog Social)
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso — escritura: delete + acciones explícitas + cualquier POST
$writeActions = ['delete', 'add_comment', 'delete_comment', 'add_avance', 'delete_avance', 'update_status'];
if (in_array($action, $writeActions) || $_SERVER['REQUEST_METHOD'] === 'POST') {
    requirePerm('tareas_diarias:editar');
}

// -- GET -----------------------------------------------------------------------
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $statusFilter = $_GET['estado'] ?? null;
    $priorityFilter = $_GET['prioridad'] ?? null;
    $statsTareaId = $_GET['tarea_id'] ?? null;

    try {
        // ── STATS ENDPOINT ──
        if ($statsTareaId) {
            $stmt = $conn->prepare("SELECT id FROM tareas_diarias WHERE id = ?");
            $stmt->execute([$statsTareaId]);
            if (!$stmt->fetch()) jsonResponse('error', 'No encontrado', null, 404);

            $stmtA = $conn->prepare("SELECT COUNT(*) FROM tarea_avances WHERE tarea_id = ?");
            $stmtA->execute([$statsTareaId]);
            $totalAvances = (int)$stmtA->fetchColumn();

            $stmtC = $conn->prepare("SELECT COUNT(*) FROM tarea_comentarios WHERE tarea_id = ?");
            $stmtC->execute([$statsTareaId]);
            $totalComentarios = (int)$stmtC->fetchColumn();

            $stmtM = $conn->prepare("SELECT COUNT(*) FROM archivos_multimedia WHERE entidad_tipo = 'tareas_diarias' AND entidad_id = ?");
            $stmtM->execute([$statsTareaId]);
            $totalArchivos = (int)$stmtM->fetchColumn();

            $stmtP = $conn->prepare("SELECT porcentaje FROM tarea_avances WHERE tarea_id = ? ORDER BY id DESC LIMIT 1");
            $stmtP->execute([$statsTareaId]);
            $ultimoPorcentaje = $stmtP->fetchColumn();

            jsonResponse('success', 'OK', [
                'total_avances' => $totalAvances,
                'total_comentarios' => $totalComentarios,
                'total_archivos' => $totalArchivos,
                'ultimo_porcentaje' => $ultimoPorcentaje !== false ? (int)$ultimoPorcentaje : null,
            ]);
        }

        // ── SINGLE TASK ──
        elseif ($id) {
            $stmt = $conn->prepare(
                "SELECT td.*,
                        CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS empleado_nombre,
                        e.apellido AS empleado_apellido
                 FROM tareas_diarias td
                 LEFT JOIN empleados e ON td.asignado_empleado_id = e.id
                 WHERE td.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);

            // Comments
            $stmtC = $conn->prepare(
                "SELECT tc.*, CONCAT(COALESCE(e.nombre,''), ' ', COALESCE(e.apellido,'')) AS autor_empleado
                 FROM tarea_comentarios tc
                 LEFT JOIN empleados e ON tc.empleado_id = e.id
                 WHERE tc.tarea_id = ? ORDER BY tc.creado ASC"
            );
            $stmtC->execute([$id]);
            $comments = $stmtC->fetchAll();
            foreach ($comments as &$c) {
                $c['archivos'] = getMultimedia('tarea_comentario', (int)$c['id'], $conn);
            }
            unset($c);
            $rec['comentarios'] = $comments;

            // Avances
            $stmtA = $conn->prepare(
                "SELECT ta.*, CONCAT(COALESCE(e.nombre,''), ' ', COALESCE(e.apellido,'')) AS autor_empleado
                 FROM tarea_avances ta
                 LEFT JOIN empleados e ON ta.empleado_id = e.id
                 WHERE ta.tarea_id = ? ORDER BY ta.creado DESC"
            );
            $stmtA->execute([$id]);
            $avances = $stmtA->fetchAll();
            foreach ($avances as &$a) {
                $a['archivos'] = getMultimedia('tarea_avance', (int)$a['id'], $conn);
            }
            unset($a);
            $rec['avances'] = $avances;

            // Multimedia
            $rec['archivos'] = getMultimedia('tareas_diarias', (int)$id, $conn);

            jsonResponse('success', 'OK', $rec);
        }

        // ── LIST ──
        else {
            $p = paginationParams();
            $conditions = ['1=1'];
            $params = [];

            if ($statusFilter) {
                $conditions[] = 'td.estado = ?';
                $params[] = $statusFilter;
            }
            if ($priorityFilter) {
                $conditions[] = 'td.prioridad = ?';
                $params[] = $priorityFilter;
            }

            $whereExtra = implode(' AND ', $conditions);
            $sw = buildSearchWhere(['td.nombre', 'td.folio', 'td.detalles', 'td.proceso', 'td.tipo', 'td.estado', 'e.nombre', 'e.apellido'], $p['search']);
            $fullWhere = "({$whereExtra}) AND {$sw['where']}";
            $allParams = array_merge($params, $sw['params']);

            $stmtC = $conn->prepare(
                "SELECT COUNT(*)
                 FROM tareas_diarias td
                 LEFT JOIN empleados e ON td.asignado_empleado_id = e.id
                 WHERE {$fullWhere}"
            );
            $stmtC->execute($allParams);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT td.id, td.folio, td.nombre, td.asignado_empleado_id, td.fecha, td.proceso,
                        td.tipo, td.prioridad, td.estado, td.detalles, td.creado,
                        e.nombre AS empleado_nombre, e.apellido AS empleado_apellido,
                        (SELECT COUNT(*) FROM tarea_comentarios WHERE tarea_id = td.id) AS total_comentarios,
                        (SELECT COUNT(*) FROM tarea_avances WHERE tarea_id = td.id) AS total_avances
                 FROM tareas_diarias td
                 LEFT JOIN empleados e ON td.asignado_empleado_id = e.id
                 WHERE {$fullWhere}
                 ORDER BY
                    FIELD(td.prioridad, 'urgente', 'alta', 'normal', 'baja'),
                    td.creado DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($allParams);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

// -- POST -----------------------------------------------------------------------
elseif ($method === 'POST') {

    // ── DELETE TASK ──────────────────────────────────────────────────────
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            deleteMultimedia('tareas_diarias', (int)$id, $conn);
            historialInsert('tareas_diarias', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM tarea_comentarios WHERE tarea_id = ?")->execute([$id]);
            $conn->prepare("DELETE FROM tarea_avances WHERE tarea_id = ?")->execute([$id]);
            $conn->prepare("DELETE FROM tareas_diarias WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── ADD COMMENT ──────────────────────────────────────────────────────
    elseif ($action === 'add_comment') {
        $tareaId = normalizeNullableInt($_POST['tarea_id'] ?? null);
        $empleadoId = normalizeNullableInt($_POST['empleado_id'] ?? null);
        $comentario = $_POST['comentario'] ?? '';
        if (!$tareaId || empty(trim($comentario))) jsonResponse('error', 'Tarea y comentario requeridos', null, 422);

        try {
            $autorNombre = sanitizeString($_POST['autor_nombre'] ?? 'Anónimo', 100);
            $stmt = $conn->prepare(
                "INSERT INTO tarea_comentarios (tarea_id, empleado_id, autor_nombre, comentario)
                 VALUES (?, ?, ?, ?)"
            );
            $stmt->execute([$tareaId, $empleadoId, $autorNombre, $comentario]);
            $commentId = (int)$conn->lastInsertId();
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'tarea_comentario', $commentId, $conn);
            }
            historialInsert('tareas_diarias', $tareaId, 'comentario', null, null, $comentario, $conn);
            jsonResponse('success', 'Comentario agregado', ['id' => $commentId]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── DELETE COMMENT ───────────────────────────────────────────────────
    elseif ($action === 'delete_comment') {
        $commentId = normalizeNullableInt($_POST['comment_id'] ?? null);
        if (!$commentId) jsonResponse('error', 'ID requerido', null, 422);
        try {
            deleteMultimedia('tarea_comentario', (int)$commentId, $conn);
            $conn->prepare("DELETE FROM tarea_comentarios WHERE id = ?")->execute([$commentId]);
            jsonResponse('success', 'Comentario eliminado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── ADD AVANCE ───────────────────────────────────────────────────────
    elseif ($action === 'add_avance') {
        $tareaId = normalizeNullableInt($_POST['tarea_id'] ?? null);
        $empleadoId = normalizeNullableInt($_POST['empleado_id'] ?? null);
        $descripcion = $_POST['descripcion'] ?? '';
        if (!$tareaId || empty(trim($descripcion))) jsonResponse('error', 'Tarea y descripción requeridos', null, 422);

        try {
            $titulo = sanitizeString($_POST['titulo'] ?? '', 255);
            $porcentaje = normalizeNullableInt($_POST['porcentaje'] ?? null);
            $stmt = $conn->prepare(
                "INSERT INTO tarea_avances (tarea_id, empleado_id, titulo, descripcion, porcentaje)
                 VALUES (?, ?, ?, ?, ?)"
            );
            $stmt->execute([$tareaId, $empleadoId, $titulo, $descripcion, $porcentaje]);
            $avanceId = (int)$conn->lastInsertId();

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'tarea_avance', $avanceId, $conn);
            }

            // Auto-update status
            $conn->prepare("UPDATE tareas_diarias SET estado = 'en_progreso' WHERE id = ? AND estado = 'pendiente'")->execute([$tareaId]);

            historialInsert('tareas_diarias', $tareaId, 'avance', null, null, $descripcion, $conn);
            jsonResponse('success', 'Avance registrado', ['id' => $avanceId]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── DELETE AVANCE ────────────────────────────────────────────────────
    elseif ($action === 'delete_avance') {
        $avanceId = normalizeNullableInt($_POST['avance_id'] ?? null);
        if (!$avanceId) jsonResponse('error', 'ID requerido', null, 422);
        try {
            deleteMultimedia('tarea_avance', (int)$avanceId, $conn);
            $conn->prepare("DELETE FROM tarea_avances WHERE id = ?")->execute([$avanceId]);
            jsonResponse('success', 'Avance eliminado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── QUICK STATUS UPDATE ──────────────────────────────────────────────
    elseif ($action === 'update_status') {
        $id = normalizeNullableInt($_POST['id'] ?? null);
        $estado = sanitizeString($_POST['estado'] ?? '', 50);
        if (!$id || empty($estado)) jsonResponse('error', 'ID y estado requeridos', null, 422);
        try {
            $conn->prepare("UPDATE tareas_diarias SET estado = ? WHERE id = ?")->execute([$estado, $id]);
            historialInsert('tareas_diarias', $id, 'status_cambiado', null, null, $estado, $conn);
            jsonResponse('success', 'Estado actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── CREATE / UPDATE TASK ─────────────────────────────────────────────
    else {
        $id                   = $_POST['id'] ?? null;
        $nombre               = sanitizeString($_POST['nombre'] ?? '', 255);
        $asignado_empleado_id = normalizeNullableInt($_POST['asignado_empleado_id'] ?? null);
        $fecha                = $_POST['fecha'] ?? null;
        $proceso              = sanitizeString($_POST['proceso'] ?? '', 100);
        $tipo                 = sanitizeString($_POST['tipo'] ?? '', 100);
        $prioridad            = sanitizeString($_POST['prioridad'] ?? 'normal', 20);
        $estado               = sanitizeString($_POST['estado'] ?? 'pendiente', 50);
        $detalles             = $_POST['detalles'] ?? '';
        $observaciones        = $_POST['observaciones'] ?? '';

        requireFields($_POST, ['nombre']);

        // Auto-generate folio on insert
        $folio = null;
        if (!$id) {
            $stmtFolio = $conn->query("SELECT COALESCE(MAX(CAST(SUBSTRING(folio, 5) AS UNSIGNED)), 0) + 1 AS next_num FROM tareas_diarias WHERE folio LIKE 'TAR-%'");
            $nextNum = (int)$stmtFolio->fetchColumn();
            $folio = 'TAR-' . str_pad($nextNum, 5, '0', STR_PAD_LEFT);
        }

        $data = [
            ':nombre'               => $nombre,
            ':asignado_empleado_id' => $asignado_empleado_id,
            ':fecha'                => $fecha,
            ':proceso'              => $proceso,
            ':tipo'                 => $tipo,
            ':prioridad'            => $prioridad,
            ':estado'               => $estado,
            ':detalles'             => $detalles,
            ':observaciones'        => $observaciones,
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE tareas_diarias SET
                    nombre=:nombre, asignado_empleado_id=:asignado_empleado_id,
                    fecha=:fecha, proceso=:proceso, tipo=:tipo, prioridad=:prioridad,
                    estado=:estado, detalles=:detalles, observaciones=:observaciones
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO tareas_diarias
                    (folio, nombre, asignado_empleado_id, fecha, proceso, tipo, prioridad, estado, detalles, observaciones)
                    VALUES
                    (:folio, :nombre, :asignado_empleado_id, :fecha, :proceso, :tipo, :prioridad, :estado, :detalles, :observaciones)";
                $data[':folio'] = $folio;
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }

            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'tareas_diarias', $record_id, $conn);
            }

            historialInsert('tareas_diarias', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id, 'folio' => $folio]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
