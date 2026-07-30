<?php
// ============================================================================
// checklist_api.php — CRUD Checklists (Plantillas por Servicio + Ejecución)
// Tablas: checklist_plantilla, checklist_plantilla_pasos, checklist_ejecucion,
//         checklist_ejecucion_pasos, checklist_paso_fotos, checklist_paso_notas_voz,
//         checklist_paso_videos
// ============================================================================
require_once __DIR__ . '/../includes/conexion.php';
require_once __DIR__ . '/../includes/multimedia_compressor.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['save_plantilla', 'update_paso', 'add_foto_paso', 'add_nota_voz_paso', 'delete_foto_paso', 'delete_nota_voz_paso', 'add_video_paso', 'delete_video_paso', 'add_paso', 'add_item', 'delete_item', 'toggle_paso', 'toggle_paso_ot'];
if (in_array($action, $writeActions)) {
    requirePerm('ejecucion_ot:editar');
}

// ── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {

    // ── Plantilla por servicio (JS: loadChecklistPlantilla) ──
    if ($action === 'plantilla' && isset($_GET['servicio_id'])) {
        try {
            $sid = (int)$_GET['servicio_id'];
            $stmt = $conn->prepare("SELECT id, servicio_id, nombre, descripcion FROM checklist_plantilla WHERE servicio_id = ? AND activo = 1 LIMIT 1");
            $stmt->execute([$sid]);
            $plantilla = $stmt->fetch();

            $pasos = [];
            if ($plantilla) {
                $stmtP = $conn->prepare("SELECT id, orden, titulo, descripcion, requiere_foto, requiere_nota_voz FROM checklist_plantilla_pasos WHERE checklist_id = ? ORDER BY orden ASC, id ASC");
                $stmtP->execute([$plantilla['id']]);
                $pasos = $stmtP->fetchAll();
            }

            jsonResponse('success', 'OK', ['plantilla' => $plantilla, 'pasos' => $pasos]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Ejecución por diagnostico_servicio_id (JS: openChecklistEjecucion) ──
    if ($action === 'ejecucion' && isset($_GET['diagnostico_servicio_id'])) {
        try {
            $dsId = (int)$_GET['diagnostico_servicio_id'];
            $stmt = $conn->prepare("SELECT id, diagnostico_servicio_id, nombre, estado, porcentaje_completado, creado FROM checklist_ejecucion WHERE diagnostico_servicio_id = ? LIMIT 1");
            $stmt->execute([$dsId]);
            $ejecucion = $stmt->fetch();

            $pasos = [];
            if ($ejecucion) {
                $stmtP = $conn->prepare("SELECT id, orden, titulo, descripcion, completado, notas, completado_por, completado_en FROM checklist_ejecucion_pasos WHERE ejecucion_id = ? ORDER BY orden ASC, id ASC");
                $stmtP->execute([$ejecucion['id']]);
                $pasos = $stmtP->fetchAll();

                foreach ($pasos as &$paso) {
                    $stmtF = $conn->prepare("SELECT id, ruta_archivo, nombre_original, creado FROM checklist_paso_fotos WHERE paso_id = ? ORDER BY creado ASC");
                    $stmtF->execute([$paso['id']]);
                    $paso['fotos'] = $stmtF->fetchAll();

                    $stmtV = $conn->prepare("SELECT id, ruta_archivo, nombre_original, duracion_segundos, creado FROM checklist_paso_notas_voz WHERE paso_id = ? ORDER BY creado ASC");
                    $stmtV->execute([$paso['id']]);
                    $paso['notas_voz'] = $stmtV->fetchAll();

                    $stmtVi = $conn->prepare("SELECT id, ruta_archivo, nombre_original, duracion_segundos, thumbnail_url, creado FROM checklist_paso_videos WHERE paso_id = ? ORDER BY creado ASC");
                    $stmtVi->execute([$paso['id']]);
                    $paso['videos'] = $stmtVi->fetchAll();
                }
                unset($paso);
            }

            jsonResponse('success', 'OK', ['ejecucion' => $ejecucion, 'pasos' => $pasos]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Items de plantilla legacy (trabajos_servicios_checklist_items) ──
    if ($action === 'items' && isset($_GET['servicio_id'])) {
        try {
            $sid = (int)$_GET['servicio_id'];
            $stmt = $conn->prepare(
                "SELECT id, servicio_id, orden, titulo, descripcion, obligatorio
                 FROM trabajos_servicios_checklist_items
                 WHERE servicio_id = ? ORDER BY orden ASC, id ASC"
            );
            $stmt->execute([$sid]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Ejecución legacy por OT (trabajos_servicios_checklist_ejecucion) ──
    if ($action === 'ejecucion_ot' && isset($_GET['ot_id'])) {
        try {
            $otId = (int)$_GET['ot_id'];
            $colsStmt = $conn->prepare("SHOW COLUMNS FROM trabajos_servicios_checklist_ejecucion");
            $colsStmt->execute();
            $cols = array_column($colsStmt->fetchAll(), 'Field');
            $selectCols = array_values(array_intersect($cols, ['id', 'ot_id', 'item_id', 'completado', 'completado_at', 'completado_por_empleado_id', 'observaciones', 'foto_path', 'nota_voz_path', 'duracion_segundos', 'fecha_inicio', 'fecha_fin', 'creado']));
            $sql = "SELECT " . implode(',', $selectCols) . " FROM trabajos_servicios_checklist_ejecucion WHERE ot_id = ? ORDER BY id ASC";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$otId]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Ejecución + plantilla combinados para una OT (legacy) ──
    if ($action === 'ejecucion_full' && isset($_GET['ot_id'])) {
        try {
            $otId = (int)$_GET['ot_id'];
            $stmtItems = $conn->prepare(
                "SELECT ci.id, ci.servicio_id, ci.orden, ci.titulo, ci.descripcion, ci.obligatorio,
                        ts.nombre AS servicio_nombre
                 FROM trabajos_servicios_checklist_items ci
                 JOIN orden_trabajo_items oti ON ci.servicio_id = oti.item_id AND oti.tipo = 'servicio' AND oti.orden_trabajo_id = ?
                 LEFT JOIN trabajos_servicios ts ON ci.servicio_id = ts.id
                 ORDER BY ci.orden ASC, ci.id ASC"
            );
            $stmtItems->execute([$otId]);
            $items = $stmtItems->fetchAll();

            $colsStmt = $conn->prepare("SHOW COLUMNS FROM trabajos_servicios_checklist_ejecucion");
            $colsStmt->execute();
            $cols = array_column($colsStmt->fetchAll(), 'Field');
            $selectCols = array_values(array_intersect($cols, ['id', 'ot_id', 'item_id', 'completado', 'completado_at', 'completado_por_empleado_id', 'observaciones', 'foto_path', 'nota_voz_path', 'duracion_segundos', 'fecha_inicio', 'fecha_fin', 'creado']));
            $sql = "SELECT " . implode(',', $selectCols) . " FROM trabajos_servicios_checklist_ejecucion WHERE ot_id = ?";
            $stmtEj = $conn->prepare($sql);
            $stmtEj->execute([$otId]);
            $ejByItem = [];
            foreach ($stmtEj->fetchAll() as $ej) { $ejByItem[$ej['item_id']] = $ej; }

            $total = count($items);
            $completados = 0;
            foreach ($items as &$item) {
                $ej = $ejByItem[$item['id']] ?? null;
                $item['completado'] = $ej ? (int)$ej['completado'] : 0;
                $item['completado_at'] = $ej['completado_at'] ?? null;
                $item['observaciones'] = $ej['observaciones'] ?? '';
                $item['foto_path'] = $ej['foto_path'] ?? null;
                $item['nota_voz_path'] = $ej['nota_voz_path'] ?? null;
                $item['duracion_segundos'] = $ej['duracion_segundos'] ?? null;
                if ($item['completado']) $completados++;
                unset($item);
            }

            jsonResponse('success', 'OK', [
                'items' => $items, 'total' => $total, 'completados' => $completados,
                'porcentaje' => $total > 0 ? round(($completados / $total) * 100) : 0,
            ]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    jsonResponse('error', 'Acción no válida', null, 400);
}

// ── POST ────────────────────────────────────────────────────────────────────
if ($method === 'POST') {

    // ── Guardar plantilla completa (JS: saveChecklistPlantilla) ──
    if ($action === 'save_plantilla') {
        $servicioId = (int)($_POST['servicio_id'] ?? 0);
        $nombre = sanitizeString($_POST['nombre'] ?? '', 255);
        $descripcion = $_POST['descripcion'] ?? '';
        $pasosJson = $_POST['pasos'] ?? '[]';
        if (!$servicioId || !$nombre) jsonResponse('error', 'servicio_id y nombre requeridos', null, 422);

        try {
            $conn->beginTransaction();

            // Upsert plantilla
            $stmt = $conn->prepare("SELECT id FROM checklist_plantilla WHERE servicio_id = ? AND activo = 1 LIMIT 1");
            $stmt->execute([$servicioId]);
            $plantillaId = $stmt->fetchColumn();

            if ($plantillaId) {
                $conn->prepare("UPDATE checklist_plantilla SET nombre = ?, descripcion = ?, modificado = NOW() WHERE id = ?")
                     ->execute([$nombre, $descripcion, $plantillaId]);
            } else {
                $conn->prepare("INSERT INTO checklist_plantilla (servicio_id, nombre, descripcion) VALUES (?, ?, ?)")
                     ->execute([$servicioId, $nombre, $descripcion]);
                $plantillaId = (int)$conn->lastInsertId();
            }

            // Reemplazar pasos: eliminar existentes y re-insertar
            $conn->prepare("DELETE FROM checklist_plantilla_pasos WHERE checklist_id = ?")->execute([$plantillaId]);

            $pasos = json_decode($pasosJson, true) ?: [];
            $stmtIns = $conn->prepare("INSERT INTO checklist_plantilla_pasos (checklist_id, orden, titulo, descripcion, requiere_foto, requiere_nota_voz) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($pasos as $idx => $p) {
                $stmtIns->execute([
                    $plantillaId,
                    ($idx + 1) * 10,
                    sanitizeString($p['titulo'] ?? '', 255),
                    $p['descripcion'] ?? '',
                    (int)($p['requiere_foto'] ?? 0),
                    (int)($p['requiere_nota_voz'] ?? 0),
                ]);
            }

            $conn->commit();
            jsonResponse('success', 'Checklist guardado');
        } catch (Exception $e) { $conn->rollBack(); jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Actualizar paso de ejecución (JS: update_paso) ──
    if ($action === 'update_paso') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $fields = [];
            $params = [];
            if (isset($_POST['completado'])) {
                $fields[] = 'completado = ?';
                $params[] = (int)$_POST['completado'];
                if ((int)$_POST['completado'] === 1) {
                    $fields[] = 'completado_en = NOW()';
                    if (isset($_POST['completado_por'])) {
                        $fields[] = 'completado_por = ?';
                        $params[] = sanitizeString($_POST['completado_por'], 150);
                    }
                } else {
                    $fields[] = 'completado_en = NULL';
                    $fields[] = 'completado_por = NULL';
                }
            }
            if (isset($_POST['notas'])) {
                $fields[] = 'notas = ?';
                $params[] = $_POST['notas'];
            }
            if (empty($fields)) jsonResponse('error', 'Nada que actualizar', null, 422);
            $params[] = $id;
            $conn->prepare("UPDATE checklist_ejecucion_pasos SET " . implode(',', $fields) . " WHERE id = ?")->execute($params);

            // Actualizar porcentaje de la ejecución padre
            $stmt = $conn->prepare("SELECT ejecucion_id FROM checklist_ejecucion_pasos WHERE id = ?");
            $stmt->execute([$id]);
            $ejId = $stmt->fetchColumn();
            if ($ejId) {
                $conn->prepare("UPDATE checklist_ejecucion e SET porcentaje_completado = (SELECT IFNULL(ROUND(SUM(CASE WHEN completado THEN 100 ELSE 0 END) / COUNT(*)), 0) FROM checklist_ejecucion_pasos WHERE ejecucion_id = e.id), estado = CASE WHEN (SELECT SUM(completado) FROM checklist_ejecucion_pasos WHERE ejecucion_id = e.id) = (SELECT COUNT(*) FROM checklist_ejecucion_pasos WHERE ejecucion_id = e.id) AND (SELECT COUNT(*) FROM checklist_ejecucion_pasos WHERE ejecucion_id = e.id) > 0 THEN 'completado' ELSE 'en_progreso' END WHERE id = ?")->execute([$ejId]);
            }

            jsonResponse('success', 'Paso actualizado');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Subir foto para paso (JS: uploadFotoPaso) ──
    if ($action === 'add_foto_paso') {
        $pasoId = (int)($_POST['paso_id'] ?? 0);
        if (!$pasoId || empty($_FILES['archivo']['name'])) jsonResponse('error', 'paso_id y archivo requeridos', null, 422);
        try {
            $dir = UPLOADS_BASE_PATH . 'checklist/';
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $ext = strtolower(pathinfo($_FILES['archivo']['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg','jpeg','png','gif','webp'])) jsonResponse('error', 'Tipo no permitido', null, 422);
            $fname = 'paso_' . $pasoId . '_' . time() . '_' . uniqid() . '.' . $ext;
            if (!move_uploaded_file($_FILES['archivo']['tmp_name'], $dir . $fname)) jsonResponse('error', 'No se pudo guardar', null, 500);
            $url = UPLOADS_BASE_URL . 'checklist/' . $fname;
            $conn->prepare("INSERT INTO checklist_paso_fotos (paso_id, ruta_archivo, nombre_original) VALUES (?, ?, ?)")
                 ->execute([$pasoId, $url, $_FILES['archivo']['name']]);
            // Comprimir imagen en background
            $fullPath = $dir . $fname;
            compressAsync($fullPath);
            jsonResponse('success', 'Foto subida', ['ruta' => $url]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Subir nota de voz para paso (JS: grabarNotaVoz) ──
    if ($action === 'add_nota_voz_paso') {
        $pasoId = (int)($_POST['paso_id'] ?? 0);
        if (!$pasoId || empty($_FILES['archivo']['name'])) jsonResponse('error', 'paso_id y archivo requeridos', null, 422);
        try {
            $dir = UPLOADS_BASE_PATH . 'checklist/';
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $ext = strtolower(pathinfo($_FILES['archivo']['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['webm','mp3','wav','ogg','m4a'])) jsonResponse('error', 'Tipo de audio no permitido', null, 422);
            $fname = 'voz_' . $pasoId . '_' . time() . '_' . uniqid() . '.' . $ext;
            if (!move_uploaded_file($_FILES['archivo']['tmp_name'], $dir . $fname)) jsonResponse('error', 'No se pudo guardar', null, 500);
            $url = UPLOADS_BASE_URL . 'checklist/' . $fname;
            $duracion = (int)($_POST['duracion_segundos'] ?? 0);
            $conn->prepare("INSERT INTO checklist_paso_notas_voz (paso_id, ruta_archivo, nombre_original, duracion_segundos) VALUES (?, ?, ?, ?)")
                 ->execute([$pasoId, $url, $_FILES['archivo']['name'], $duracion ?: null]);
            // Comprimir audio en background
            $fullPath = $dir . $fname;
            compressAsync($fullPath);
            jsonResponse('success', 'Nota de voz guardada', ['ruta' => $url]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Eliminar foto de paso (JS: deleteFotoPaso) ──
    if ($action === 'delete_foto_paso') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $stmt = $conn->prepare("SELECT ruta_archivo FROM checklist_paso_fotos WHERE id = ?");
            $stmt->execute([$id]);
            $ruta = $stmt->fetchColumn();
            if ($ruta) {
                $file = $_SERVER['DOCUMENT_ROOT'] . parse_url($ruta, PHP_URL_PATH);
                if (file_exists($file)) @unlink($file);
            }
            $conn->prepare("DELETE FROM checklist_paso_fotos WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Foto eliminada');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Eliminar nota de voz (JS: deleteNotaVoz) ──
    if ($action === 'delete_nota_voz_paso') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $stmt = $conn->prepare("SELECT ruta_archivo FROM checklist_paso_notas_voz WHERE id = ?");
            $stmt->execute([$id]);
            $ruta = $stmt->fetchColumn();
            if ($ruta) {
                $file = $_SERVER['DOCUMENT_ROOT'] . parse_url($ruta, PHP_URL_PATH);
                if (file_exists($file)) @unlink($file);
            }
            $conn->prepare("DELETE FROM checklist_paso_notas_voz WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Nota eliminada');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Subir video para paso (JS: uploadVideoPaso) ──
    if ($action === 'add_video_paso') {
        $pasoId = (int)($_POST['paso_id'] ?? 0);
        if (!$pasoId || empty($_FILES['archivo']['name'])) jsonResponse('error', 'paso_id y archivo requeridos', null, 422);
        try {
            $dir = UPLOADS_BASE_PATH . 'checklist/';
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $ext = strtolower(pathinfo($_FILES['archivo']['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, ['mp4','mov','webm','avi','mkv'])) jsonResponse('error', 'Tipo de video no permitido', null, 422);
            $fname = 'video_' . $pasoId . '_' . time() . '_' . uniqid() . '.' . $ext;
            if (!move_uploaded_file($_FILES['archivo']['tmp_name'], $dir . $fname)) jsonResponse('error', 'No se pudo guardar', null, 500);
            $url = UPLOADS_BASE_URL . 'checklist/' . $fname;
            $duracion = (int)($_POST['duracion_segundos'] ?? 0);
            $conn->prepare("INSERT INTO checklist_paso_videos (paso_id, ruta_archivo, nombre_original, duracion_segundos) VALUES (?, ?, ?, ?)")
                 ->execute([$pasoId, $url, $_FILES['archivo']['name'], $duracion ?: null]);
            // Comprimir video en background (720p, H.264 CRF 30) + thumbnail
            $fullPath = $dir . $fname;
            compressAsync($fullPath, $url);
            jsonResponse('success', 'Video guardado', ['ruta' => $url]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Eliminar video de paso (JS: deleteVideoPaso) ──
    if ($action === 'delete_video_paso') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $stmt = $conn->prepare("SELECT ruta_archivo FROM checklist_paso_videos WHERE id = ?");
            $stmt->execute([$id]);
            $ruta = $stmt->fetchColumn();
            if ($ruta) {
                $file = $_SERVER['DOCUMENT_ROOT'] . parse_url($ruta, PHP_URL_PATH);
                if (file_exists($file)) @unlink($file);
            }
            $conn->prepare("DELETE FROM checklist_paso_videos WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Video eliminado');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Agregar paso manual (JS: addPasoManual) ──
    if ($action === 'add_paso') {
        $ejecucionId = (int)($_POST['ejecucion_id'] ?? 0);
        $titulo = sanitizeString($_POST['titulo'] ?? '', 255);
        if (!$ejecucionId || !$titulo) jsonResponse('error', 'ejecucion_id y titulo requeridos', null, 422);
        try {
            $stmt = $conn->prepare("SELECT IFNULL(MAX(orden),0)+10 FROM checklist_ejecucion_pasos WHERE ejecucion_id = ?");
            $stmt->execute([$ejecucionId]);
            $orden = (int)$stmt->fetchColumn();
            $conn->prepare("INSERT INTO checklist_ejecucion_pasos (ejecucion_id, orden, titulo) VALUES (?, ?, ?)")
                 ->execute([$ejecucionId, $orden, $titulo]);
            jsonResponse('success', 'Paso agregado', ['id' => (int)$conn->lastInsertId()]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Legacy: Agregar item a plantilla (trabajos_servicios_checklist_items) ──
    if ($action === 'add_item') {
        $servicioId = (int)($_POST['servicio_id'] ?? 0);
        $titulo = sanitizeString($_POST['titulo'] ?? '', 200);
        $descripcion = $_POST['descripcion'] ?? '';
        $obligatorio = (int)($_POST['obligatorio'] ?? 1);
        if (!$servicioId || !$titulo) jsonResponse('error', 'servicio_id y titulo requeridos', null, 422);
        try {
            $stmt = $conn->prepare("SELECT IFNULL(MAX(orden),0)+10 FROM trabajos_servicios_checklist_items WHERE servicio_id = ?");
            $stmt->execute([$servicioId]);
            $orden = (int)$stmt->fetchColumn();
            $conn->prepare("INSERT INTO trabajos_servicios_checklist_items (servicio_id, orden, titulo, descripcion, obligatorio) VALUES (?, ?, ?, ?, ?)")
                 ->execute([$servicioId, $orden, $titulo, $descripcion, $obligatorio]);
            jsonResponse('success', 'Item agregado', ['id' => (int)$conn->lastInsertId()]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Legacy: Eliminar item de plantilla ──
    if ($action === 'delete_item') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("DELETE FROM trabajos_servicios_checklist_items WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Item eliminado');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Legacy: Toggle paso ejecución por OT ──
    if ($action === 'toggle_paso') {
        $otId = (int)($_POST['ot_id'] ?? 0);
        $itemId = (int)($_POST['item_id'] ?? 0);
        $completado = (int)($_POST['completado'] ?? 0);
        $empleadoId = normalizeNullableInt($_POST['empleado_id'] ?? null);
        $observaciones = sanitizeString($_POST['observaciones'] ?? '', 1000);
        if (!$otId || !$itemId) jsonResponse('error', 'ot_id e item_id requeridos', null, 422);
        try {
            $stmt = $conn->prepare("SELECT id FROM trabajos_servicios_checklist_ejecucion WHERE ot_id = ? AND item_id = ?");
            $stmt->execute([$otId, $itemId]);
            $existing = $stmt->fetchColumn();
            $now = date('Y-m-d H:i:s');
            if ($existing) {
                if ($completado) {
                    $conn->prepare("UPDATE trabajos_servicios_checklist_ejecucion SET completado = 1, completado_at = ?, completado_por_empleado_id = ?, observaciones = ?, fecha_fin = ? WHERE id = ?")
                         ->execute([$now, $empleadoId, $observaciones, $now, $existing]);
                } else {
                    $conn->prepare("UPDATE trabajos_servicios_checklist_ejecucion SET completado = 0, completado_at = NULL, fecha_inicio = NULL, fecha_fin = NULL WHERE id = ?")
                         ->execute([$existing]);
                }
                jsonResponse('success', 'Paso actualizado', ['id' => (int)$existing]);
            } else {
                if ($completado) {
                    $conn->prepare("INSERT INTO trabajos_servicios_checklist_ejecucion (ot_id, item_id, completado, completado_at, completado_por_empleado_id, observaciones, fecha_inicio, fecha_fin) VALUES (?, ?, 1, ?, ?, ?, ?, ?)")
                         ->execute([$otId, $itemId, $now, $empleadoId, $observaciones, $now, $now]);
                } else {
                    $conn->prepare("INSERT INTO trabajos_servicios_checklist_ejecucion (ot_id, item_id, completado) VALUES (?, ?, 0)")
                         ->execute([$otId, $itemId]);
                }
                jsonResponse('success', 'Paso creado', ['id' => (int)$conn->lastInsertId()]);
            }
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Toggle paso de checklist de OT (nuevo sistema checklist_ejecucion_pasos) ──
    if ($action === 'toggle_paso_ot') {
        $pasoId = (int)($_POST['paso_id'] ?? 0);
        $completado = (int)($_POST['completado'] ?? 0);
        if (!$pasoId) jsonResponse('error', 'paso_id requerido', null, 422);
        try {
            $pasoStmt = $conn->prepare(
                "SELECT cep.id, cep.ejecucion_id, cep.completado,
                        ce.ot_item_id, ce.checklist_plantilla_id
                 FROM checklist_ejecucion_pasos cep
                 JOIN checklist_ejecucion ce ON ce.id = cep.ejecucion_id
                 WHERE cep.id = :pid"
            );
            $pasoStmt->execute([':pid' => $pasoId]);
            $paso = $pasoStmt->fetch();
            if (!$paso) jsonResponse('error', 'Paso no encontrado', null, 404);

            $now = date('Y-m-d H:i:s');
            if ($completado) {
                $conn->prepare(
                    "UPDATE checklist_ejecucion_pasos
                     SET completado = 1, completado_en = :now, completado_por = :emp
                     WHERE id = :pid"
                )->execute([
                    ':now' => $now,
                    ':emp' => $_POST['empleado_nombre'] ?? null,
                    ':pid' => $pasoId,
                ]);
            } else {
                $conn->prepare(
                    "UPDATE checklist_ejecucion_pasos
                     SET completado = 0, completado_en = NULL, completado_por = NULL
                     WHERE id = :pid"
                )->execute([':pid' => $pasoId]);
            }

            // Recalcular porcentaje de la ejecución
            $ejecId = $paso['ejecucion_id'];
            $totalStmt = $conn->prepare("SELECT COUNT(*) FROM checklist_ejecucion_pasos WHERE ejecucion_id = :eid");
            $totalStmt->execute([':eid' => $ejecId]);
            $total = (int)$totalStmt->fetchColumn();
            $doneStmt = $conn->prepare("SELECT COUNT(*) FROM checklist_ejecucion_pasos WHERE ejecucion_id = :eid AND completado = 1");
            $doneStmt->execute([':eid' => $ejecId]);
            $done = (int)$doneStmt->fetchColumn();
            $pct = $total > 0 ? round(($done / $total) * 100) : 0;
            $newEstado = $pct >= 100 ? 'completado' : ($pct > 0 ? 'en_progreso' : 'pendiente');

            $conn->prepare(
                "UPDATE checklist_ejecucion
                 SET porcentaje_completado = :pct, estado = :est, modificado = :now
                 WHERE id = :eid"
            )->execute([':pct' => $pct, ':est' => $newEstado, ':now' => $now, ':eid' => $ejecId]);

            jsonResponse('success', $completado ? 'Paso completado' : 'Paso desmarcado', [
                'paso_id'     => $pasoId,
                'completado'  => $completado,
                'porcentaje'  => $pct,
                'estado'      => $newEstado,
                'total'       => $total,
                'completados' => $done,
            ]);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    jsonResponse('error', 'Acción no válida', null, 400);
}

jsonResponse('error', 'Método no permitido', null, 405);
