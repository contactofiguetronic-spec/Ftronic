<?php
/**
 * portal_control_api.php — API del módulo Portal Control
 *
 * Endpoints:
 *   GET  ?action=config                          Obtener toda la configuración
 *   GET  ?action=config_seccion&seccion=X        Configuración agrupada por sección
 *   POST ?action=save_config                     Guardar configuración (JSON body)
 *   GET  ?action=ots&page=N&per_page=N&search=X  Listar OTs con su estado de portal
 *   GET  ?action=ot_detalle&ot_id=X              Detalle completo de OT para gestión
 *   GET  ?action=ot_comentarios&ot_id=X          Comentarios de una OT
 *   POST ?action=ot_responder                    Técnico responde al cliente
 *   POST ?action=ot_publicar_avance              Publicar avance en la OT
 *   GET  ?action=ot_avances&ot_id=X              Avances de una OT
 *   POST ?action=ot_eliminar_avance              Eliminar un avance
 *   POST ?action=ot_eliminar_comentario          Eliminar un comentario
 *   GET  ?action=ot_multimedia&ot_id=X           Multimedia de una OT
 *   POST ?action=ot_eliminar_multimedia          Eliminar multimedia
 *   POST ?action=ot_permiso                      Override de permiso por OT
 *   GET  ?action=ot_permisos&ot_id=X             Permisos override de una OT
 *   POST ?action=ot_publicar_todo                Publicar avance a múltiples OTs
 *   GET  ?action=stats                           Estadísticas del portal
 *   GET  ?action=clientes_recientes              Clientes con actividad reciente
 */

require_once '../includes/conexion.php';

$action = $_REQUEST['action'] ?? '';
requireAuth();
requirePerm('portal_control:ver');

switch ($action) {
    case 'config':                   handleGetConfig($pdo); break;
    case 'config_seccion':           handleGetConfigSeccion($pdo); break;
    case 'save_config':              handleSaveConfig($pdo); break;
    case 'ots':                      handleListarOts($pdo); break;
    case 'ot_detalle':               handleOtDetalle($pdo); break;
    case 'ot_comentarios':           handleOtComentarios($pdo); break;
    case 'ot_responder':             handleOtResponder($pdo); break;
    case 'ot_publicar_avance':       handlePublicarAvance($pdo); break;
    case 'ot_avances':               handleOtAvances($pdo); break;
    case 'ot_eliminar_avance':       handleEliminarAvance($pdo); break;
    case 'ot_eliminar_comentario':   handleEliminarComentario($pdo); break;
    case 'ot_multimedia':            handleOtMultimedia($pdo); break;
    case 'ot_eliminar_multimedia':   handleEliminarMultimedia($pdo); break;
    case 'ot_permiso':               handleOtPermiso($pdo); break;
    case 'ot_permisos':              handleOtPermisos($pdo); break;
    case 'ot_publicar_todo':         handlePublicarTodo($pdo); break;
    case 'stats':                    handleStats($pdo); break;
    case 'clientes_recientes':       handleClientesRecientes($pdo); break;
    default:                         jsonResponse('error', 'Acción no válida: ' . htmlspecialchars($action));
}

/* ════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ════════════════════════════════════════════════════════════ */

function handleGetConfig(PDO $conn): void
{
    requirePerm('portal_control:config');
    try {
        $stmt = $conn->query("SELECT id, clave, valor, tipo, seccion, etiqueta, descripcion, orden, actualizado FROM portal_config ORDER BY seccion, orden, clave");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Agrupar por sección
        $secciones = [];
        foreach ($rows as $r) {
            $sec = $r['seccion'];
            if (!isset($secciones[$sec])) $secciones[$sec] = [];
            $secciones[$sec][] = $r;
        }

        jsonResponse('success', 'Configuración obtenida', [
            'secciones' => $secciones,
            'items' => $rows,
            'total' => count($rows),
        ]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener configuración', null, 500);
    }
}

function handleGetConfigSeccion(PDO $conn): void
{
    requirePerm('portal_control:config');
    $seccion = $_GET['seccion'] ?? '';
    if (!$seccion) jsonResponse('error', 'Sección requerida');
    try {
        $stmt = $conn->prepare("SELECT id, clave, valor, tipo, seccion, etiqueta, descripcion, orden FROM portal_config WHERE seccion = :s ORDER BY orden, clave");
        $stmt->execute([':s' => $seccion]);
        jsonResponse('success', 'Sección obtenida', $stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener sección', null, 500);
    }
}

function handleSaveConfig(PDO $conn): void
{
    requirePerm('portal_control:config');

    $items = [];

    // Try FormData (items_json)
    $itemsJson = $_POST['items_json'] ?? '';
    if ($itemsJson) {
        $items = json_decode($itemsJson, true) ?: [];
    }

    // Fallback: raw JSON body
    if (empty($items)) {
        $raw = file_get_contents('php://input');
        if ($raw) {
            $input = json_decode($raw, true);
            if (is_array($input)) $items = $input['items'] ?? [];
        }
    }

    // Fallback: $_POST items directly
    if (empty($items) && isset($_POST['items']) && is_array($_POST['items'])) {
        $items = $_POST['items'];
    }

    if (!is_array($items) || empty($items)) {
        jsonResponse('error', 'No se enviaron items para guardar');
    }

    try {
        $conn->beginTransaction();
        $stmt = $conn->prepare("UPDATE portal_config SET valor = :v WHERE clave = :c");
        $count = 0;
        foreach ($items as $it) {
            $clave = $it['clave'] ?? '';
            $valor = (string)($it['valor'] ?? '');
            if (!$clave) continue;
            $stmt->execute([':v' => $valor, ':c' => $clave]);
            $count++;
        }
        $conn->commit();
        jsonResponse('success', "Configuración guardada ($count items)");
    } catch (PDOException $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', 'Error al guardar: ' . $e->getMessage(), null, 500);
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', 'Error inesperado: ' . $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   LISTADO DE OTs
   ════════════════════════════════════════════════════════════ */

function handleListarOts(PDO $conn): void
{
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(50, max(5, (int)($_GET['per_page'] ?? 20)));
    $search = trim($_GET['search'] ?? '');
    $estado = trim($_GET['estado'] ?? '');
    $offset = ($page - 1) * $perPage;

    try {
        $where = "WHERE 1=1";
        $params = [];

        if ($search) {
            $where .= " AND (ot.folio_ot LIKE :s OR c.nombre LIKE :s OR c.apellido LIKE :s OR c.rut LIKE :s OR v.patente LIKE :s)";
            $params[':s'] = "%$search%";
        }
        if ($estado) {
            $where .= " AND ot.estado = :estado";
            $params[':estado'] = $estado;
        }

        // Total
        $stmtTotal = $conn->prepare("
            SELECT COUNT(*) FROM orden_trabajo ot
            LEFT JOIN clientes c ON ot.cliente_id = c.id
            LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
            $where
        ");
        $stmtTotal->execute($params);
        $total = (int)$stmtTotal->fetchColumn();

        // Listado
        $stmt = $conn->prepare("
            SELECT ot.id, ot.folio_ot, ot.estado, ot.creado, ot.fecha,
                   c.id AS cliente_id, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo,
                   v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio,
                   e.nombre AS tecnico_nombre,
                   (SELECT COUNT(*) FROM ot_comentarios WHERE ot_id = ot.id) AS total_comentarios,
                   (SELECT COUNT(*) FROM ot_comentarios WHERE ot_id = ot.id AND autor_tipo = 'cliente' AND leido = 0) AS comentarios_pendientes,
                   (SELECT COUNT(*) FROM ot_avances WHERE ot_id = ot.id) AS total_avances,
                   (SELECT COUNT(*) FROM ot_interacciones_cliente WHERE ot_id = ot.id) AS total_interacciones
            FROM orden_trabajo ot
            LEFT JOIN clientes c ON ot.cliente_id = c.id
            LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
            LEFT JOIN empleados e ON ot.asignado_empleado_id = e.id
            $where
            ORDER BY ot.creado DESC
            LIMIT $offset, $perPage
        ");
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse('success', 'OTs listadas', [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => ceil($total / $perPage),
        ]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

function handleOtDetalle(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $stmt = $conn->prepare("
            SELECT ot.*,
                   c.id AS cliente_id, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                   c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo,
                   v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio, v.color,
                   e.id AS tecnico_id, e.nombre AS tecnico_nombre
            FROM orden_trabajo ot
            LEFT JOIN clientes c ON ot.cliente_id = c.id
            LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
            LEFT JOIN empleados e ON ot.asignado_empleado_id = e.id
            WHERE ot.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$ot) jsonResponse('error', 'OT no encontrada');

        // Permisos override de esta OT
        $stmtP = $conn->prepare("SELECT clave, valor FROM portal_ot_permisos WHERE ot_id = :id");
        $stmtP->execute([':id' => $otId]);
        $permisosOt = $stmtP->fetchAll(PDO::FETCH_KEY_PAIR);

        // Servicios
        $stmtS = $conn->prepare("SELECT id, tipo, nombre, detalle, estado_item, completado, cantidad, valor_unitario FROM orden_trabajo_items WHERE orden_trabajo_id = :id ORDER BY id");
        $stmtS->execute([':id' => $otId]);
        $servicios = $stmtS->fetchAll(PDO::FETCH_ASSOC);

        // Avances
        $stmtA = $conn->prepare("SELECT a.*, e.nombre AS autor_nombre FROM ot_avances a LEFT JOIN empleados e ON a.autor_empleado_id = e.id WHERE a.ot_id = :id ORDER BY a.creado DESC");
        $stmtA->execute([':id' => $otId]);
        $avances = $stmtA->fetchAll(PDO::FETCH_ASSOC);

        // Comentarios
        $stmtC = $conn->prepare("SELECT * FROM ot_comentarios WHERE ot_id = :id ORDER BY creado ASC");
        $stmtC->execute([':id' => $otId]);
        $comentarios = $stmtC->fetchAll(PDO::FETCH_ASSOC);

        // Multimedia
        $stmtM = $conn->prepare("
            SELECT id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes, creado, 'servicio' AS origen
            FROM archivos_multimedia
            WHERE entidad_tipo IN ('ot_item_foto','ot_item_video')
              AND entidad_id IN (SELECT id FROM orden_trabajo_items WHERE orden_trabajo_id = :id1)
            UNION ALL
            SELECT id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes, creado, 'avance' AS origen
            FROM archivos_multimedia
            WHERE entidad_tipo = 'ot_avances' AND entidad_id IN (SELECT id FROM ot_avances WHERE ot_id = :id2)
            UNION ALL
            SELECT id, tipo, ruta_archivo, nombre_original, tamanio_bytes, creado, 'cliente' AS origen
            FROM ot_interacciones_cliente
            WHERE ot_id = :id3
            ORDER BY creado DESC
        ");
        $stmtM->execute([':id1' => $otId, ':id2' => $otId, ':id3' => $otId]);
        $multimedia = $stmtM->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse('success', 'Detalle de OT', [
            'ot' => $ot,
            'permisos' => $permisosOt,
            'servicios' => $servicios,
            'avances' => $avances,
            'comentarios' => $comentarios,
            'multimedia' => $multimedia,
        ]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   COMENTARIOS
   ════════════════════════════════════════════════════════════ */

function handleOtComentarios(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        // Marcar como leídos
        $conn->prepare("UPDATE ot_comentarios SET leido = 1 WHERE ot_id = :id AND autor_tipo = 'cliente'")
             ->execute([':id' => $otId]);

        $stmt = $conn->prepare("SELECT * FROM ot_comentarios WHERE ot_id = :id ORDER BY creado ASC");
        $stmt->execute([':id' => $otId]);
        jsonResponse('success', 'Comentarios', $stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch (PDOException $e) {
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

function handleOtResponder(PDO $conn): void
{
    requirePerm('portal_control:responder');
    $otId = (int)($_POST['ot_id'] ?? 0);
    $mensaje = sanitizeString($_POST['mensaje'] ?? '', 2000);
    if (!$otId || !$mensaje) jsonResponse('error', 'ot_id y mensaje son requeridos');

    try {
        $user = currentUser();
        $stmt = $conn->prepare("
            INSERT INTO ot_comentarios (ot_id, autor_tipo, autor_nombre, autor_empleado_id, mensaje)
            VALUES (:ot, 'tecnico', :nombre, :emp, :msg)
        ");
        $stmt->execute([
            ':ot' => $otId,
            ':nombre' => $user['nombre'] ?? 'Taller',
            ':emp' => $user['id'] ?? null,
            ':msg' => $mensaje,
        ]);
        jsonResponse('success', 'Mensaje enviado al cliente', ['id' => $conn->lastInsertId()]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

function handleEliminarComentario(PDO $conn): void
{
    requirePerm('portal_control:eliminar');
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) jsonResponse('error', 'id requerido');
    $conn->prepare("DELETE FROM ot_comentarios WHERE id = :id")->execute([':id' => $id]);
    jsonResponse('success', 'Comentario eliminado');
}

/* ════════════════════════════════════════════════════════════
   AVANCES
   ════════════════════════════════════════════════════════════ */

function handlePublicarAvance(PDO $conn): void
{
    requirePerm('portal_control:avances');
    $otId = (int)($_POST['ot_id'] ?? 0);
    $titulo = sanitizeString($_POST['titulo'] ?? '', 255);
    $descripcion = sanitizeString($_POST['descripcion'] ?? '', 2000);
    $porcentaje = (int)($_POST['porcentaje'] ?? 0);

    if (!$otId) jsonResponse('error', 'ot_id requerido');
    if (!$titulo) jsonResponse('error', 'Título es requerido');

    try {
        $conn->beginTransaction();
        $user = currentUser();

        $stmt = $conn->prepare("
            INSERT INTO ot_avances (ot_id, titulo, descripcion, porcentaje, autor_empleado_id)
            VALUES (:ot, :tit, :desc, :pct, :emp)
        ");
        $stmt->execute([
            ':ot' => $otId,
            ':tit' => $titulo,
            ':desc' => $descripcion,
            ':pct' => max(0, min(100, $porcentaje)),
            ':emp' => $user['id'] ?? null,
        ]);
        $avanceId = $conn->lastInsertId();

        // Si hay archivos subidos, los asociamos al avance
        if (!empty($_FILES['archivos']['name'][0])) {
            $uploadDir = '../uploads/portal/avances/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            $stmtM = $conn->prepare("
                INSERT INTO archivos_multimedia (entidad_tipo, entidad_id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes)
                VALUES ('ot_avances', :id, :tipo, :ruta, :nombre, :tam)
            ");
            $files = $_FILES['archivos'];
            $count = count($files['name']);
            for ($i = 0; $i < $count; $i++) {
                if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;
                $mime = mime_content_type($files['tmp_name'][$i]);
                $tipo = strpos($mime, 'image/') === 0 ? 'foto' : (strpos($mime, 'video/') === 0 ? 'video' : (strpos($mime, 'audio/') === 0 ? 'nota_voz' : 'documento'));
                $ext = pathinfo($files['name'][$i], PATHINFO_EXTENSION) ?: 'bin';
                $filename = "avance_{$otId}_{$avanceId}_" . time() . "_{$i}.{$ext}";
                $dest = $uploadDir . $filename;
                if (move_uploaded_file($files['tmp_name'][$i], $dest)) {
                    $stmtM->execute([
                        ':id' => $avanceId,
                        ':tipo' => $tipo,
                        ':ruta' => 'uploads/portal/avances/' . $filename,
                        ':nombre' => $files['name'][$i],
                        ':tam' => $files['size'][$i],
                    ]);
                }
            }
        }

        $conn->commit();
        jsonResponse('success', 'Avance publicado', ['id' => $avanceId]);
    } catch (PDOException $e) {
        $conn->rollBack();
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

function handleOtAvances(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');
    $stmt = $conn->prepare("SELECT a.*, e.nombre AS autor_nombre FROM ot_avances a LEFT JOIN empleados e ON a.autor_empleado_id = e.id WHERE a.ot_id = :id ORDER BY a.creado DESC");
    $stmt->execute([':id' => $otId]);
    $avances = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Multimedia por avance
    foreach ($avances as &$a) {
        $stmtM = $conn->prepare("SELECT id, tipo_archivo, ruta_archivo, nombre_original FROM archivos_multimedia WHERE entidad_tipo = 'ot_avances' AND entidad_id = :id");
        $stmtM->execute([':id' => $a['id']]);
        $a['multimedia'] = $stmtM->fetchAll(PDO::FETCH_ASSOC);
    }

    jsonResponse('success', 'Avances', $avances);
}

function handleEliminarAvance(PDO $conn): void
{
    requirePerm('portal_control:eliminar');
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) jsonResponse('error', 'id requerido');

    // Eliminar archivos físicos
    $stmt = $conn->prepare("SELECT ruta_archivo FROM archivos_multimedia WHERE entidad_tipo = 'ot_avances' AND entidad_id = :id");
    $stmt->execute([':id' => $id]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $f) {
        if (!empty($f['ruta_archivo']) && file_exists($f['ruta_archivo'])) @unlink($f['ruta_archivo']);
    }
    $conn->prepare("DELETE FROM archivos_multimedia WHERE entidad_tipo = 'ot_avances' AND entidad_id = :id")->execute([':id' => $id]);
    $conn->prepare("DELETE FROM ot_avances WHERE id = :id")->execute([':id' => $id]);
    jsonResponse('success', 'Avance eliminado');
}

/* ════════════════════════════════════════════════════════════
   MULTIMEDIA
   ════════════════════════════════════════════════════════════ */

function handleOtMultimedia(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    $stmt = $conn->prepare("
        SELECT id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes, creado, 'servicio' AS origen
        FROM archivos_multimedia
        WHERE entidad_tipo IN ('ot_item_foto','ot_item_video')
          AND entidad_id IN (SELECT id FROM orden_trabajo_items WHERE orden_trabajo_id = :id1)
        UNION ALL
        SELECT id, tipo, ruta_archivo, nombre_original, tamanio_bytes, creado, 'cliente' AS origen
        FROM ot_interacciones_cliente
        WHERE ot_id = :id2
        ORDER BY creado DESC
    ");
    $stmt->execute([':id1' => $otId, ':id2' => $otId]);
    jsonResponse('success', 'Multimedia', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function handleEliminarMultimedia(PDO $conn): void
{
    requirePerm('portal_control:eliminar');
    $id = (int)($_POST['id'] ?? 0);
    $tipo = $_POST['tipo'] ?? 'archivos_multimedia';
    if (!$id) jsonResponse('error', 'id requerido');

    if ($tipo === 'ot_interacciones_cliente') {
        $stmt = $conn->prepare("SELECT ruta_archivo FROM ot_interacciones_cliente WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $f = $stmt->fetch();
        if ($f && !empty($f['ruta_archivo']) && file_exists($f['ruta_archivo'])) @unlink($f['ruta_archivo']);
        $conn->prepare("DELETE FROM ot_interacciones_cliente WHERE id = :id")->execute([':id' => $id]);
    } else {
        $stmt = $conn->prepare("SELECT ruta_archivo FROM archivos_multimedia WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $f = $stmt->fetch();
        if ($f && !empty($f['ruta_archivo']) && file_exists($f['ruta_archivo'])) @unlink($f['ruta_archivo']);
        $conn->prepare("DELETE FROM archivos_multimedia WHERE id = :id")->execute([':id' => $id]);
    }
    jsonResponse('success', 'Archivo eliminado');
}

/* ════════════════════════════════════════════════════════════
   PERMISOS POR OT (override)
   ════════════════════════════════════════════════════════════ */

function handleOtPermiso(PDO $conn): void
{
    requirePerm('portal_control:config');
    $otId = (int)($_POST['ot_id'] ?? 0);
    $clave = $_POST['clave'] ?? '';
    $valor = (string)($_POST['valor'] ?? '');
    if (!$otId || !$clave) jsonResponse('error', 'ot_id y clave requeridos');

    try {
        if ($valor === '' || $valor === null) {
            $conn->prepare("DELETE FROM portal_ot_permisos WHERE ot_id = :ot AND clave = :c")
                 ->execute([':ot' => $otId, ':c' => $clave]);
        } else {
            $conn->prepare("
                INSERT INTO portal_ot_permisos (ot_id, clave, valor) VALUES (:ot, :c, :v)
                ON DUPLICATE KEY UPDATE valor = :v2
            ")->execute([':ot' => $otId, ':c' => $clave, ':v' => $valor, ':v2' => $valor]);
        }
        jsonResponse('success', 'Permiso guardado');
    } catch (PDOException $e) {
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

function handleOtPermisos(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');
    $stmt = $conn->prepare("SELECT clave, valor FROM portal_ot_permisos WHERE ot_id = :id");
    $stmt->execute([':id' => $otId]);
    jsonResponse('success', 'Permisos de OT', $stmt->fetchAll(PDO::FETCH_KEY_PAIR));
}

/* ════════════════════════════════════════════════════════════
   PUBLICACIÓN MASIVA
   ════════════════════════════════════════════════════════════ */

function handlePublicarTodo(PDO $conn): void
{
    requirePerm('portal_control:avances');
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $otIds = $input['ot_ids'] ?? [];
    if (is_string($otIds)) $otIds = json_decode($otIds, true) ?: [];
    $titulo = sanitizeString($input['titulo'] ?? '', 255);
    $descripcion = sanitizeString($input['descripcion'] ?? '', 2000);
    $porcentaje = (int)($input['porcentaje'] ?? 0);

    if (empty($otIds) || !is_array($otIds)) jsonResponse('error', 'ot_ids es requerido');
    if (!$titulo) jsonResponse('error', 'Título requerido');

    try {
        $conn->beginTransaction();
        $user = currentUser();
        $stmt = $conn->prepare("INSERT INTO ot_avances (ot_id, titulo, descripcion, porcentaje, autor_empleado_id) VALUES (:ot, :tit, :desc, :pct, :emp)");
        $count = 0;
        foreach ($otIds as $otId) {
            $otId = (int)$otId;
            if (!$otId) continue;
            $stmt->execute([
                ':ot' => $otId, ':tit' => $titulo, ':desc' => $descripcion,
                ':pct' => max(0, min(100, $porcentaje)), ':emp' => $user['id'] ?? null,
            ]);
            $count++;
        }
        $conn->commit();
        jsonResponse('success', "Avance publicado en $count OTs");
    } catch (PDOException $e) {
        $conn->rollBack();
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   ESTADÍSTICAS
   ════════════════════════════════════════════════════════════ */

function handleStats(PDO $conn): void
{
    try {
        $stats = [];

        // OTs activas con portal
        $stmt = $conn->query("SELECT COUNT(*) FROM orden_trabajo WHERE estado NOT IN ('finalizado','entregado','cancelado')");
        $stats['ots_activas'] = (int)$stmt->fetchColumn();

        // Comentarios hoy
        $stmt = $conn->query("SELECT COUNT(*) FROM ot_comentarios WHERE DATE(creado) = CURDATE()");
        $stats['comentarios_hoy'] = (int)$stmt->fetchColumn();

        // Comentarios pendientes (del cliente sin responder)
        $stmt = $conn->query("SELECT COUNT(*) FROM ot_comentarios WHERE autor_tipo = 'cliente' AND leido = 0");
        $stats['comentarios_pendientes'] = (int)$stmt->fetchColumn();

        // Avances esta semana
        $stmt = $conn->query("SELECT COUNT(*) FROM ot_avances WHERE creado >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
        $stats['avances_semana'] = (int)$stmt->fetchColumn();

        // Archivos subidos por clientes
        $stmt = $conn->query("SELECT COUNT(*) FROM ot_interacciones_cliente");
        $stats['archivos_cliente'] = (int)$stmt->fetchColumn();

        // OTs con más interacciones
        $stmt = $conn->query("
            SELECT ot.folio_ot, c.nombre, c.apellido, COUNT(oc.id) AS total
            FROM orden_trabajo ot
            JOIN clientes c ON ot.cliente_id = c.id
            LEFT JOIN ot_comentarios oc ON oc.ot_id = ot.id
            GROUP BY ot.id
            HAVING total > 0
            ORDER BY total DESC
            LIMIT 5
        ");
        $stats['ots_mas_activas'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Actividad por día (últimos 7 días)
        $stmt = $conn->query("
            SELECT DATE(creado) AS dia, COUNT(*) AS total
            FROM ot_comentarios
            WHERE creado >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(creado)
            ORDER BY dia ASC
        ");
        $stats['actividad_diaria'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Configuración habilitada
        $stmt = $conn->query("SELECT seccion, COUNT(*) AS total, SUM(CASE WHEN valor = '1' OR valor = 'true' THEN 1 ELSE 0 END) AS activos FROM portal_config GROUP BY seccion");
        $stats['config_por_seccion'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse('success', 'Estadísticas', $stats);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}

function handleClientesRecientes(PDO $conn): void
{
    $stmt = $conn->query("
        SELECT DISTINCT c.id, c.nombre, c.apellido, c.rut, c.telefono, c.correo,
               (SELECT MAX(creado) FROM ot_comentarios WHERE ot_id IN (SELECT id FROM orden_trabajo WHERE cliente_id = c.id)) AS ultima_interaccion,
               (SELECT COUNT(*) FROM orden_trabajo WHERE cliente_id = c.id) AS total_ots
        FROM clientes c
        WHERE EXISTS (SELECT 1 FROM orden_trabajo ot WHERE ot.cliente_id = c.id)
        ORDER BY ultima_interaccion DESC
        LIMIT 20
    ");
    jsonResponse('success', 'Clientes', $stmt->fetchAll(PDO::FETCH_ASSOC));
}
