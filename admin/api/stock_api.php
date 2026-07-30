<?php
// ============================================================================
// stock_api.php — Control de inventario y movimientos de stock
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();
requirePerm('inventario_taller:ver');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

if ($method === 'GET') {
    if ($action === 'movimientos') {
        $productoTipo = $_GET['producto_tipo'] ?? '';
        $productoId = $_GET['producto_id'] ?? null;
        try {
            $sql = "SELECT * FROM movimientos_stock WHERE 1=1";
            $params = [];
            if ($productoTipo) { $sql .= " AND producto_tipo = ?"; $params[] = $productoTipo; }
            if ($productoId) { $sql .= " AND producto_id = ?"; $params[] = (int)$productoId; }
            $sql .= " ORDER BY created_at DESC LIMIT 100";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'alertas_stock') {
        try {
            $articulos = $conn->query(
                "SELECT id, nombre, stock, stock_minimo, 'articulo' AS tipo FROM articulos WHERE stock <= stock_minimo ORDER BY stock ASC"
            )->fetchAll();
            $insumos = $conn->query(
                "SELECT id, nombre, stock, stock_minimo, 'insumo' AS tipo FROM insumos WHERE stock <= stock_minimo ORDER BY stock ASC"
            )->fetchAll();
            jsonResponse('success', 'OK', array_merge($articulos, $insumos));
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } elseif ($action === 'ajuste') {
        // GET para obtener formulario de ajuste (o datos de producto)
        $id = $_GET['id'] ?? null;
        $tipo = $_GET['tipo'] ?? 'articulo';
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $table = ($tipo === 'insumo') ? 'insumos' : 'articulos';
        try {
            $stmt = $conn->prepare("SELECT id, nombre, stock, stock_minimo FROM {$table} WHERE id = ?");
            $stmt->execute([$id]);
            $item = $stmt->fetch();
            if (!$item) jsonResponse('error', 'No encontrado', null, 404);
            $item['tipo'] = $tipo;
            jsonResponse('success', 'OK', $item);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        jsonResponse('error', 'Acción no válida');
    }
}

elseif ($method === 'POST') {
    if ($action === 'registrar_ajuste') {
        $tipo = $_POST['producto_tipo'] ?? '';
        $id = (int)($_POST['producto_id'] ?? 0);
        $cantidad = (int)($_POST['cantidad'] ?? 0);
        $tipoMov = $_POST['tipo_movimiento'] ?? 'ajuste';
        $obs = $_POST['observacion'] ?? '';
        if (!$tipo || !$id) jsonResponse('error', 'Datos incompletos', null, 422);
        if ($cantidad == 0) jsonResponse('error', 'La cantidad no puede ser 0', null, 422);
        try {
            $conn->beginTransaction();
            registrarMovimientoStock($tipo, $id, $tipoMov, $cantidad, 'ajuste_manual', null, $obs, $conn);
            historialInsert('stock_' . $tipo, $id, 'actualizado', 'stock', null, "Ajuste: {$tipoMov} {$cantidad} unidades", $conn);
            $conn->commit();
            jsonResponse('success', 'Stock actualizado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        jsonResponse('error', 'Acción no válida');
    }
}
