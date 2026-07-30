<?php
// ============================================================================
// historial_api.php — Historial de cambios (auditoría)
// GET ?entidad_tipo=orden_compra&entidad_id=123
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();
requirePerm('usuarios:ver');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse('error', 'Método no permitido', null, 405);
}

$entidadTipo = sanitizeString($_GET['entidad_tipo'] ?? '', 50);
$entidadId   = (int)($_GET['entidad_id'] ?? 0);

if (!$entidadTipo || !$entidadId) {
    jsonResponse('error', 'entidad_tipo y entidad_id requeridos', null, 422);
}

try {
    $stmt = $conn->prepare(
        "SELECT id, entidad_tipo, entidad_id, accion, campo_modificado,
                valor_anterior, valor_nuevo, created_at
         FROM historial_cambios
         WHERE entidad_tipo = ? AND entidad_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 200"
    );
    $stmt->execute([$entidadTipo, $entidadId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['detalle'] = $r['valor_nuevo'];
    }
    jsonResponse('success', 'OK', $rows);
} catch (Exception $e) {
    jsonResponse('error', $e->getMessage(), null, 500);
}
