<?php
// ============================================================================
// pos_api.php — Punto de Venta: búsqueda de items + confirmar venta rápida
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['confirmar_venta'];
if (in_array($action, $writeActions)) {
    requirePerm('pos:editar');
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // ── BUSCAR ARTÍCULOS Y SERVICIOS ──
    if ($action === 'buscar') {
        $q = $_GET['q'] ?? '';
        $results = [];

        // Buscar artículos
        try {
            $sqlA = "SELECT id, nombre, valor_venta AS precio, 'articulo' AS tipo, stock
                     FROM articulos";
            $paramsA = [];
            if ($q) {
                $sqlA .= " WHERE (nombre LIKE ? OR tipo LIKE ? OR marca LIKE ?)";
                $like = '%' . $q . '%';
                $paramsA = [$like, $like, $like];
            }
            $sqlA .= " ORDER BY nombre LIMIT 100";
            $stmtA = $conn->prepare($sqlA);
            $stmtA->execute($paramsA);
            $results = array_merge($results, $stmtA->fetchAll());
        } catch (Exception $e) {}

        // Buscar servicios/trabajos
        try {
            $sqlS = "SELECT id, nombre, valor_trabajo AS precio, 'servicio' AS tipo, NULL AS stock
                     FROM trabajos_servicios";
            $paramsS = [];
            if ($q) {
                $sqlS .= " WHERE (nombre LIKE ? OR tipo LIKE ? OR descripcion LIKE ?)";
                $like = '%' . $q . '%';
                $paramsS = [$like, $like, $like];
            }
            $sqlS .= " ORDER BY nombre LIMIT 100";
            $stmtS = $conn->prepare($sqlS);
            $stmtS->execute($paramsS);
            $results = array_merge($results, $stmtS->fetchAll());
        } catch (Exception $e) {}

        jsonResponse('success', 'OK', $results);
    }

    // ── CUENTAS BANCARIAS ──
    elseif ($action === 'cuentas') {
        $stmt = $conn->query("SELECT id, nombre, banco, saldo FROM cuentas_bancarias ORDER BY nombre");
        jsonResponse('success', 'OK', $stmt->fetchAll());
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // ── CONFIRMAR VENTA ──
    if ($action === 'confirmar_venta') {
        $itemsJson = $_POST['items_json'] ?? '[]';
        $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $formaPago = sanitizeString($_POST['forma_pago'] ?? 'efectivo');
        $clienteId = normalizeNullableInt($_POST['cliente_id'] ?? null);
        $observacion = sanitizeString($_POST['observacion'] ?? '', 500);

        $items = json_decode($itemsJson, true);
        if (!$items || !count($items)) jsonResponse('error', 'Debe agregar al menos un ítem', null, 422);
        if (!$cuentaId) jsonResponse('error', 'Seleccione una cuenta bancaria', null, 422);

        try {
            $conn->beginTransaction();

            // Calcular totales
            $subtotal = 0;
            foreach ($items as $it) {
                $subtotal += ((float)($it['precio'] ?? 0)) * ((int)($it['cantidad'] ?? 1));
            }
            $iva = round($subtotal * 0.19);
            $total = $subtotal + $iva;

            // Crear venta
            $stmtV = $conn->prepare(
                "INSERT INTO ventas (nombre, cliente_id, fecha, forma_pago, cuenta_bancaria_id, valor, impuesto, valor_total, estado_pago, descripcion, creado)
                 VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, 'Pagado', ?, NOW())"
            );
            $nombre = 'Venta POS #' . date('Ymd-His');
            $stmtV->execute([
                $nombre,
                $clienteId,
                $formaPago,
                $cuentaId,
                $subtotal,
                $iva,
                $total,
                $observacion,
            ]);
            $ventaId = (int)$conn->lastInsertId();

            // Registrar pago
            $stmtP = $conn->prepare(
                "INSERT INTO pagos (entidad_tipo, entidad_id, monto, fecha, forma_pago, cuenta_bancaria_id, tipo_pago, observacion, creado)
                 VALUES ('venta', ?, ?, CURDATE(), ?, ?, 'contado', ?, NOW())"
            );
            $stmtP->execute([$ventaId, $total, $formaPago, $cuentaId, $observacion]);
            $pagoId = (int)$conn->lastInsertId();

            // Actualizar saldo cuenta
            $conn->prepare("UPDATE cuentas_bancarias SET saldo = saldo + ?, actualizado = NOW() WHERE id = ?")->execute([$total, $cuentaId]);

            // Registrar movimiento de caja
            $conn->prepare(
                "INSERT INTO movimientos_caja (cuenta_bancaria_id, fecha, tipo, monto, entidad_tipo, entidad_id, concepto, conciliado, creado)
                 VALUES (?, CURDATE(), 'ingreso', ?, 'venta', ?, ?, 0, NOW())"
            )->execute([$cuentaId, $total, $ventaId, 'Venta POS #' . $ventaId]);

            // Descontar stock de artículos
            foreach ($items as $it) {
                if (($it['tipo'] ?? '') === 'articulo' && !empty($it['id'])) {
                    $cant = (int)($it['cantidad'] ?? 1);
                    $conn->prepare("UPDATE articulos SET stock = GREATEST(0, stock - ?) WHERE id = ?")->execute([$cant, $it['id']]);
                }
            }

            historialInsert('ventas', $ventaId, 'creado', null, null, 'Venta POS: ' . $total, $conn);
            $conn->commit();

            jsonResponse('success', 'Venta registrada exitosamente', [
                'venta_id' => $ventaId,
                'pago_id' => $pagoId,
                'total' => $total,
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
