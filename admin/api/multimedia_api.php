<?php
// ============================================================================
// multimedia_api.php — API genérica para archivos multimedia por campo
// ============================================================================
// Endpoints (todas devuelven JSON estandarizado vía jsonResponse):
//   GET  ?action=listar&entidad_tipo=X&entidad_id=Y[&campo_key=Z][&tipo=T]
//   POST ?action=subir    (multipart: archivos[] + campo_keys[] paralelos +
//                          entidad_tipo + entidad_id)
//   POST ?action=eliminar&id=N
// ============================================================================

require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['subir', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('multimedia:editar');
}

try {
    switch ($action) {
        case 'listar':
            listarArchivos();
            break;
        case 'subir':
            subirArchivos();
            break;
        case 'eliminar':
            eliminarArchivo();
            break;
        default:
            jsonResponse('error', 'Acción no válida: ' . htmlspecialchars($action));
    }
} catch (Throwable $e) {
    error_log('multimedia_api error: ' . $e->getMessage());
    $msg = (defined('APP_ENV') && APP_ENV === 'development') ? $e->getMessage() : 'Error interno del servidor';
    jsonResponse('error', $msg);
}

// ============================================================================
// IMPLEMENTACIÓN
// ============================================================================

function listarArchivos(): void
{
    $entidad_tipo = trim($_GET['entidad_tipo'] ?? '');
    $entidad_id   = (int)($_GET['entidad_id'] ?? 0);
    $campo_key    = isset($_GET['campo_key']) ? trim((string)$_GET['campo_key']) : null;
    $tipo         = isset($_GET['tipo']) ? trim((string)$_GET['tipo']) : null;

    if ($entidad_tipo === '' || $entidad_id <= 0) {
        jsonResponse('error', 'entidad_tipo y entidad_id son requeridos', null, 422);
    }

    $sql = "SELECT id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes, campo_key, creado
            FROM archivos_multimedia
            WHERE entidad_tipo = ? AND entidad_id = ?";
    $params = [$entidad_tipo, $entidad_id];

    if ($campo_key !== null && $campo_key !== '') {
        $sql .= " AND campo_key = ?";
        $params[] = $campo_key;
    }
    if ($tipo !== null && $tipo !== '') {
        $sql .= " AND tipo_archivo = ?";
        $params[] = $tipo;
    }
    $sql .= " ORDER BY creado ASC, id ASC";

    $stmt = $GLOBALS['conn']->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    jsonResponse('success', 'OK', $rows);
}

function subirArchivos(): void
{
    $entidad_tipo = trim($_REQUEST['entidad_tipo'] ?? '');
    $entidad_id   = (int)($_REQUEST['entidad_id'] ?? 0);

    if ($entidad_tipo === '' || $entidad_id <= 0) {
        jsonResponse('error', 'entidad_tipo y entidad_id son requeridos', null, 422);
    }
    if (empty($_FILES['archivos']['name'][0])) {
        jsonResponse('error', 'No hay archivos para subir', null, 422);
    }

    // campo_keys[]: array paralelo a archivos[]. Lo normalizamos a array plano.
    $campo_keys = null;
    if (isset($_REQUEST['campo_keys'])) {
        $raw = $_REQUEST['campo_keys'];
        if (is_array($raw)) {
            $campo_keys = array_map(static function ($v) {
                return is_string($v) ? $v : (string)$v;
            }, $raw);
        } elseif (is_string($raw) && $raw !== '') {
            // Soporta un único valor como string (compatibilidad).
            $campo_keys = [$raw];
        }
    }

    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $count = uploadMultimedia($_FILES['archivos'], $entidad_tipo, $entidad_id, $conn, $campo_keys);
        $conn->commit();
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        throw $e;
    }

    if ($count > 0) {
        try {
            historialInsert('archivo_multimedia', $entidad_id, 'subida', null, null, "$count archivo(s)");
        } catch (Throwable $e) { /* noop */ }
    }

    // Devolver los archivos recién subidos para que el frontend los renderice.
    $stmt = $conn->prepare(
        "SELECT id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes, campo_key, creado
         FROM archivos_multimedia
         WHERE entidad_tipo = ? AND entidad_id = ?
         ORDER BY id DESC LIMIT ?"
    );
    $stmt->bindValue(1, $entidad_tipo);
    $stmt->bindValue(2, $entidad_id, PDO::PARAM_INT);
    $stmt->bindValue(3, $count, PDO::PARAM_INT);
    $stmt->execute();
    $archivos = $stmt->fetchAll();

    jsonResponse('success', "Subidos: $count", ['subidos' => $count, 'archivos' => $archivos]);
}

function eliminarArchivo(): void
{
    $id = (int)($_REQUEST['id'] ?? 0);
    if ($id <= 0) {
        jsonResponse('error', 'id requerido', null, 422);
    }

    $conn = $GLOBALS['conn'];
    $stmt = $conn->prepare("SELECT ruta_archivo, entidad_tipo, entidad_id FROM archivos_multimedia WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row) {
        jsonResponse('error', 'Archivo no encontrado', null, 404);
    }

    $conn->beginTransaction();
    try {
        // Try to delete the physical file (ruta_archivo is a web path like /admin/uploads/...)
        if (!empty($row['ruta_archivo'])) {
            $fsPath = $_SERVER['DOCUMENT_ROOT'] . $row['ruta_archivo'];
            if (file_exists($fsPath)) {
                @unlink($fsPath);
            }
        }
        $conn->prepare("DELETE FROM archivos_multimedia WHERE id = ?")->execute([$id]);
        historialInsert('archivo_multimedia', (int)$row['entidad_id'], 'eliminado', null, null, $row['ruta_archivo'], $conn);
        $conn->commit();
    } catch (Throwable $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        throw $e;
    }

    jsonResponse('success', 'Archivo eliminado');
}
