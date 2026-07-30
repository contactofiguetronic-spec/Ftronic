<?php
// ============================================================================
// pagos_api.php — Pagos de presupuestos verificados
// Flujo: Presupuesto verificado → Pago (contado/cuotas) → Conciliación
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

// Protección por permiso
$action = $_REQUEST['action'] ?? '';
$writeActions = ['guardar', 'conciliar', 'eliminar', 'rechazar'];
if (in_array($action, $writeActions)) {
    requirePerm('pagos:editar');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;

    // ── Detalle de pago ──
    if ($id) {
        try {
            $stmt = $conn->prepare(
                "SELECT p.*,
                        pv.valor_total AS ppto_total, pv.estado AS ppto_estado,
                        pv.vehiculo_id, pv.cliente_id, pv.ot_id,
                        v.patente, v.marca, v.modelo,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        cb.nombre AS cuenta_nombre, cb.numero_cuenta, cb.banco
                 FROM pagos p
                 LEFT JOIN presupuesto pv ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pv.id
                 LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
                 LEFT JOIN clientes c ON pv.cliente_id = c.id
                 LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
                 WHERE p.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            jsonResponse('success', 'OK', $rec);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Presupuestos verificados pendientes de pago ──
    if ($action === 'presupuestos_verificados') {
        try {
            $stmt = $conn->query(
                "SELECT pv.id, pv.fecha, pv.valor_total, pv.estado, pv.verificado,
                        v.patente, v.marca, v.modelo,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        pv.ot_id,
                        (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE entidad_tipo='presupuesto' AND entidad_id=pv.id) AS total_pagado
                 FROM presupuesto pv
                 LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
                 LEFT JOIN clientes c ON pv.cliente_id = c.id
                 WHERE pv.verificado = 1
                   AND pv.estado NOT IN ('pagado','rechazado','convertido')
                 ORDER BY pv.fecha DESC"
            );
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Resumen de pagos ──
    if ($action === 'resumen') {
        try {
            $mes = (int)($_GET['mes'] ?? date('m'));
            $anio = (int)($_GET['anio'] ?? date('Y'));
            $stmt = $conn->prepare(
                "SELECT
                    COUNT(*) AS total_pagos,
                    COALESCE(SUM(monto), 0) AS monto_total,
                    COALESCE(SUM(CASE WHEN tipo_pago = 'contado' THEN monto ELSE 0 END), 0) AS contado,
                    COALESCE(SUM(CASE WHEN tipo_pago = 'cuotas' THEN monto ELSE 0 END), 0) AS cuotas
                 FROM pagos
                 WHERE MONTH(fecha) = ? AND YEAR(fecha) = ?"
            );
            $stmt->execute([$mes, $anio]);
            jsonResponse('success', 'OK', $stmt->fetch());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Cuentas bancarias ──
    if ($action === 'cuentas') {
        try {
            $stmt = $conn->query("SELECT id, nombre, banco, numero_cuenta, saldo FROM cuentas_bancarias ORDER BY nombre");
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Listado pagos a plazos ──
    if ($action === 'listar_plazos') {
        try {
            $p = paginationParams();
            $search = $p['search'];
            $where = "1=1";
            $params = [];

            if ($search) {
                $like = '%' . $search . '%';
                $where = "(pp.concepto LIKE ? OR pp.descripcion LIKE ? OR pp.receptor LIKE ?)";
                $params = [$like, $like, $like];
            }

            $stmtC = $conn->prepare("SELECT COUNT(*) FROM pagos_plazos pp WHERE {$where}");
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT pp.*, cb.nombre AS cuenta_nombre, cb.banco
                 FROM pagos_plazos pp
                 LEFT JOIN cuentas_bancarias cb ON pp.cuenta_bancaria_id = cb.id
                 WHERE {$where}
                 ORDER BY pp.fecha_pago DESC, pp.id DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($params);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── KPIs pagos a plazos ──
    if ($action === 'resumen_plazos') {
        try {
            $mes = (int)($_GET['mes'] ?? date('m'));
            $anio = (int)($_GET['anio'] ?? date('Y'));
            $stmt = $conn->prepare(
                "SELECT
                    COUNT(*) AS total_plazos,
                    COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN monto ELSE 0 END), 0) AS total_pendiente,
                    COALESCE(SUM(CASE WHEN estado = 'pagado' AND MONTH(fecha_ejecucion) = ? AND YEAR(fecha_ejecucion) = ? THEN monto ELSE 0 END), 0) AS pagado_mes,
                    COALESCE(SUM(CASE WHEN estado = 'pendiente' AND fecha_pago <= CURDATE() THEN monto ELSE 0 END), 0) AS vencido
                 FROM pagos_plazos"
            );
            $stmt->execute([$mes, $anio]);
            jsonResponse('success', 'OK', $stmt->fetch());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Listado pagos directos ──
    if ($action === 'listar_directos') {
        try {
            $p = paginationParams();
            $search = $p['search'];
            $where = "p.entidad_tipo = 'directo'";
            $params = [];

            if ($search) {
                $like = '%' . $search . '%';
                $where .= " AND (p.observacion LIKE ? OR p.concepto LIKE ? OR p.receptor LIKE ?)";
                $params = [$like, $like, $like];
            }

            $stmtC = $conn->prepare("SELECT COUNT(*) FROM pagos p WHERE {$where}");
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare(
                "SELECT p.id, p.monto, p.fecha, p.forma_pago, p.observacion, p.concepto, p.receptor,
                        cb.nombre AS cuenta_nombre, cb.banco
                 FROM pagos p
                 LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
                 WHERE {$where}
                 ORDER BY p.fecha DESC, p.id DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($params);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── KPIs pagos directos ──
    if ($action === 'resumen_directos') {
        try {
            $mes = (int)($_GET['mes'] ?? date('m'));
            $anio = (int)($_GET['anio'] ?? date('Y'));
            $hoy = date('Y-m-d');
            $stmt = $conn->prepare(
                "SELECT
                    COUNT(*) AS total_pagos,
                    COALESCE(SUM(monto), 0) AS monto_total,
                    COALESCE(SUM(CASE WHEN fecha = ? THEN monto ELSE 0 END), 0) AS pagados_hoy
                 FROM pagos
                 WHERE entidad_tipo = 'directo' AND MONTH(fecha) = ? AND YEAR(fecha) = ?"
            );
            $stmt->execute([$hoy, $mes, $anio]);
            jsonResponse('success', 'OK', $stmt->fetch());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Listado paginado de pagos (presupuestos) ──
    try {
        $p = paginationParams();
        $search = $p['search'];
        $where = "p.entidad_tipo = 'presupuesto'";
        $params = [];

        if ($search) {
            $like = '%' . $search . '%';
            $where .= " AND (v.patente LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ? OR pv.id LIKE ?)";
            $params = [$like, $like, $like, $like];
        }

        $stmtC = $conn->prepare(
            "SELECT COUNT(*) FROM pagos p
             LEFT JOIN presupuesto pv ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pv.id
             LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
             LEFT JOIN clientes c ON pv.cliente_id = c.id
             WHERE {$where}"
        );
        $stmtC->execute($params);
        $total = (int)$stmtC->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT p.id, p.monto, p.fecha, p.forma_pago, p.observacion, p.tipo_pago, p.numero_cuotas,
                    pv.id AS ppto_id, pv.valor_total AS ppto_total,
                    v.patente, v.marca,
                    c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                    cb.nombre AS cuenta_nombre, cb.banco
             FROM pagos p
             LEFT JOIN presupuesto pv ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pv.id
             LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
             LEFT JOIN clientes c ON pv.cliente_id = c.id
             LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
             WHERE {$where}
             ORDER BY p.fecha DESC, p.id DESC
             LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute($params);
        paginatedResponse($stmt->fetchAll(), $total, $p);
    } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
    exit;
}

elseif ($method === 'POST') {

    // ── Registrar pago ──
    if ($action === 'registrar_pago') {
        $pptoId = (int)($_POST['presupuesto_id'] ?? 0);
        $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $monto = (float)($_POST['monto'] ?? 0);
        $formaPago = sanitizeString($_POST['forma_pago'] ?? 'efectivo', 50);
        $tipoPago = sanitizeString($_POST['tipo_pago'] ?? 'contado', 20);
        $numeroCuotas = (int)($_POST['numero_cuotas'] ?? 1);
        $cuotasJson = $_POST['cuotas_json'] ?? null;
        $observacion = $_POST['observacion'] ?? '';

        if (!$pptoId || !$monto || $monto <= 0) jsonResponse('error', 'Presupuesto y monto requeridos', null, 422);

        try {
            $conn->beginTransaction();

            // Get presupuesto
            $stmt = $conn->prepare("SELECT * FROM presupuesto WHERE id = ?");
            $stmt->execute([$pptoId]);
            $ppto = $stmt->fetch();
            if (!$ppto) jsonResponse('error', 'Presupuesto no encontrado', null, 404);
            if (!$ppto['verificado']) jsonResponse('error', 'El presupuesto debe estar verificado', null, 422);

            // Calculate total pagado
            $stmtPag = $conn->prepare("SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE entidad_tipo = 'presupuesto' AND entidad_id = ?");
            $stmtPag->execute([$pptoId]);
            $totalPagado = (float)$stmtPag->fetchColumn();
            $saldoPendiente = (float)$ppto['valor_total'] - $totalPagado;

            if ($monto > $saldoPendiente + 0.01) jsonResponse('error', 'El monto excede el saldo pendiente ($' . number_format($saldoPendiente, 0, ',', '.') . ')', null, 422);

            // Register payment
            $stmtPago = $conn->prepare(
                "INSERT INTO pagos (entidad_tipo, entidad_id, monto, fecha, forma_pago, observacion, cuenta_bancaria_id, tipo_pago, numero_cuotas, cuotas_json)
                 VALUES ('presupuesto', ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?)"
            );
            $stmtPago->execute([$pptoId, $monto, $formaPago, $observacion, $cuentaId ?: null, $tipoPago, $numeroCuotas, $cuotasJson]);
            $pagoId = (int)$conn->lastInsertId();

            // Registrar movimiento en caja
            registrarMovimientoCaja('ingreso', $monto, 'presupuesto', $pagoId, date('Y-m-d'), $formaPago, "Pago presupuesto #{$pptoId}", $conn, $cuentaId ?: null);

            // Check if fully paid
            $nuevoTotalPagado = $totalPagado + $monto;
            if ($nuevoTotalPagado >= (float)$ppto['valor_total'] - 0.01) {
                $conn->prepare("UPDATE presupuesto SET estado = 'pagado' WHERE id = ?")->execute([$pptoId]);
                deducirStockPresupuesto($pptoId, $conn);
            }

            historialInsert('presupuesto', $pptoId, 'actualizado', null, null, 'Pago registrado: $' . number_format($monto, 0, ',', '.'), $conn);
            $conn->commit();

            $saldoRestante = $saldoPendiente - $monto;
            jsonResponse('success', 'Pago registrado exitosamente', [
                'id' => $pagoId,
                'total_pagado' => $nuevoTotalPagado,
                'saldo_pendiente' => $saldoRestante,
                'pagado_total' => $nuevoTotalPagado >= (float)$ppto['valor_total'] - 0.01,
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Registrar pago directo ──
    if ($action === 'registrar_pago_directo') {
        $concepto = sanitizeString($_POST['concepto'] ?? '', 150);
        $monto = (float)($_POST['monto'] ?? 0);
        $fechaPago = $_POST['fecha_pago'] ?? date('Y-m-d');
        $formaPago = sanitizeString($_POST['forma_pago'] ?? 'efectivo', 50);
        $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $receptor = sanitizeString($_POST['receptor'] ?? '', 150);
        $observacion = $_POST['observacion'] ?? '';

        if (!$concepto || !$monto || $monto <= 0) jsonResponse('error', 'Concepto y monto requeridos', null, 422);
        if (!$cuentaId) jsonResponse('error', 'Seleccione una cuenta bancaria', null, 422);

        try {
            $conn->beginTransaction();

            $stmt = $conn->prepare(
                "INSERT INTO pagos (entidad_tipo, entidad_id, monto, fecha, forma_pago, observacion, cuenta_bancaria_id, concepto, receptor)
                 VALUES ('directo', NULL, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([$monto, $fechaPago, $formaPago, $observacion, $cuentaId, $concepto, $receptor]);
            $pagoId = (int)$conn->lastInsertId();

            // Deduct from account
            registrarMovimientoCaja('egreso', $monto, 'pago_directo', $pagoId, $fechaPago, $formaPago, "Pago: {$concepto}", $conn, $cuentaId);

            historialInsert('pagos', $pagoId, 'creado', null, "Pago directo registrado: {$concepto} — $" . number_format($monto, 0, ',', '.'), null, $conn);
            $conn->commit();
            jsonResponse('success', 'Pago registrado exitosamente', ['id' => $pagoId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Editar pago directo ──
    if ($action === 'editar_pago_directo') {
        $id = (int)($_POST['id'] ?? 0);
        $concepto = sanitizeString($_POST['concepto'] ?? '', 150);
        $monto = (float)($_POST['monto'] ?? 0);
        $fechaPago = $_POST['fecha_pago'] ?? date('Y-m-d');
        $formaPago = sanitizeString($_POST['forma_pago'] ?? 'efectivo', 50);
        $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $receptor = sanitizeString($_POST['receptor'] ?? '', 150);
        $observacion = $_POST['observacion'] ?? '';

        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        if (!$concepto || !$monto || $monto <= 0) jsonResponse('error', 'Concepto y monto requeridos', null, 422);

        try {
            $conn->beginTransaction();

            // Get current payment
            $stmt = $conn->prepare("SELECT * FROM pagos WHERE id = ? AND entidad_tipo = 'directo'");
            $stmt->execute([$id]);
            $pagoActual = $stmt->fetch();
            if (!$pagoActual) jsonResponse('error', 'Pago no encontrado', null, 404);

            // Revert old account deduction
            if ($pagoActual['cuenta_bancaria_id']) {
                registrarMovimientoCaja('ingreso', (float)$pagoActual['monto'], 'pago_directo_revert', $id, $pagoActual['fecha'], null, "Reversión pago #{$id}", $conn, (int)$pagoActual['cuenta_bancaria_id']);
            }

            // Update payment
            $conn->prepare(
                "UPDATE pagos SET concepto = ?, observacion = ?, monto = ?, fecha = ?, forma_pago = ?, cuenta_bancaria_id = ?, receptor = ? WHERE id = ?"
            )->execute([$concepto, $observacion, $monto, $fechaPago, $formaPago, $cuentaId, $receptor, $id]);

            // Apply new account deduction
            if ($cuentaId) {
                registrarMovimientoCaja('egreso', $monto, 'pago_directo', $id, $fechaPago, $formaPago, "Pago: {$concepto}", $conn, $cuentaId);
            }

            $conn->commit();
            jsonResponse('success', 'Pago actualizado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Eliminar pago directo ──
    if ($action === 'eliminar_pago_directo') {
        $id = (int)($_POST['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM pagos WHERE id = ? AND entidad_tipo = 'directo'");
            $stmt->execute([$id]);
            $pago = $stmt->fetch();
            if (!$pago) jsonResponse('error', 'Pago no encontrado', null, 404);

            // Revert account balance
            if ($pago['cuenta_bancaria_id']) {
                registrarMovimientoCaja('ingreso', (float)$pago['monto'], 'pago_directo_revert', $id, $pago['fecha'], null, "Reversión pago #{$id}: {$pago['concepto']}", $conn, (int)$pago['cuenta_bancaria_id']);
            }

            $conn->prepare("DELETE FROM pagos WHERE id = ?")->execute([$id]);
            historialInsert('pagos', $id, 'eliminado', null, "Pago directo eliminado: {$pago['concepto']}", null, $conn);
            $conn->commit();
            jsonResponse('success', 'Pago eliminado y saldo revertido');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Registrar pago a plazos ──
    if ($action === 'registrar_plazo') {
        $concepto = sanitizeString($_POST['concepto'] ?? '', 100);
        $descripcion = sanitizeString($_POST['descripcion'] ?? '', 255);
        $monto = (float)($_POST['monto'] ?? 0);
        $fechaPago = $_POST['fecha_pago'] ?? '';
        $cuentaId = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $receptor = sanitizeString($_POST['receptor'] ?? '', 150);
        $observacion = $_POST['observacion'] ?? '';

        if (!$concepto || !$monto || $monto <= 0 || !$fechaPago) {
            jsonResponse('error', 'Concepto, monto y fecha de pago requeridos', null, 422);
        }

        try {
            $conn->prepare(
                "INSERT INTO pagos_plazos (concepto, descripcion, monto, fecha_pago, cuenta_bancaria_id, receptor, observacion)
                 VALUES (?, ?, ?, ?, ?, ?, ?)"
            )->execute([$concepto, $descripcion, $monto, $fechaPago, $cuentaId ?: null, $receptor, $observacion]);
            $plazoId = (int)$conn->lastInsertId();
            jsonResponse('success', 'Pago a plazos registrado', ['id' => $plazoId]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Procesar pagos a plazos vencidos ──
    if ($action === 'procesar_plazos') {
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare(
                "SELECT pp.*, cb.saldo AS cuenta_saldo
                 FROM pagos_plazos pp
                 LEFT JOIN cuentas_bancarias cb ON pp.cuenta_bancaria_id = cb.id
                 WHERE pp.estado = 'pendiente' AND pp.fecha_pago <= CURDATE()
                 ORDER BY pp.fecha_pago ASC"
            );
            $stmt->execute();
            $pendientes = $stmt->fetchAll();

            $procesados = 0;
            $errores = [];
            foreach ($pendientes as $pp) {
                if (!$pp['cuenta_bancaria_id']) {
                    $errores[] = "{$pp['concepto']} #{$pp['id']}: sin cuenta bancaria";
                    continue;
                }
                $saldoActual = (float)$pp['cuenta_saldo'];
                if ($saldoActual < (float)$pp['monto']) {
                    $errores[] = "{$pp['concepto']} #{$pp['id']}: saldo insuficiente (" . number_format($saldoActual, 0, ',', '.') . ")";
                    continue;
                }
                $conn->prepare("UPDATE pagos_plazos SET estado = 'pagado', fecha_ejecucion = CURDATE() WHERE id = ?")
                    ->execute([$pp['id']]);
                // registrarMovimientoCaja registra en movimientos_caja Y actualiza saldo
                registrarMovimientoCaja('egreso', (float)$pp['monto'], 'pago_plazo', (int)$pp['id'], null, null, "Pago plazo: {$pp['concepto']} — {$pp['receptor']}", $conn, (int)$pp['cuenta_bancaria_id']);
                $procesados++;
            }

            $conn->commit();
            $msg = "$procesados pago(s) procesado(s)";
            if ($errores) $msg .= ". " . count($errores) . " con errores: " . implode('; ', array_slice($errores, 0, 3));
            jsonResponse('success', $msg, ['procesados' => $procesados, 'errores' => $errores]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Cancelar pago a plazos ──
    if ($action === 'cancelar_plazo') {
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE pagos_plazos SET estado = 'cancelado' WHERE id = ? AND estado = 'pendiente'")->execute([$id]);
            jsonResponse('success', 'Pago cancelado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Elimar plazo ──
    if ($action === 'eliminar_plazo') {
        $id = (int)($_POST['id'] ?? 0);
        if ($id <= 0) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("DELETE FROM pagos_plazos WHERE id = ?")->execute([$id]);
            jsonResponse('success', 'Eliminado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Eliminar pago ──
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM pagos WHERE id = ?");
            $stmt->execute([$id]);
            $pago = $stmt->fetch();
            if (!$pago) jsonResponse('error', 'Pago no encontrado', null, 404);

            // Revert account balance
            if ($pago['cuenta_bancaria_id']) {
                $stmtCb = $conn->prepare("SELECT saldo FROM cuentas_bancarias WHERE id = ?");
                $stmtCb->execute([$pago['cuenta_bancaria_id']]);
                $saldoActual = (float)$stmtCb->fetchColumn();
                $conn->prepare("UPDATE cuentas_bancarias SET saldo = ? WHERE id = ?")
                    ->execute([$saldoActual - $pago['monto'], $pago['cuenta_bancaria_id']]);
            }

            // Revert movimientos_caja entry
            $conn->prepare("DELETE FROM movimientos_caja WHERE entidad_tipo = ? AND entidad_id = ?")
                ->execute([$pago['entidad_tipo'], $id]);

            // Revert presupuesto status if it was pagado
            if ($pago['entidad_tipo'] === 'presupuesto') {
                $conn->prepare("UPDATE presupuesto SET estado = 'borrador' WHERE id = ? AND estado = 'pagado'")
                    ->execute([$pago['entidad_id']]);
            }

            $conn->prepare("DELETE FROM pagos WHERE id = ?")->execute([$id]);
            historialInsert('pagos', (int)$id, 'eliminado', null, 'Pago eliminado', null, $conn);
            $conn->commit();
            jsonResponse('success', 'Pago eliminado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    jsonResponse('error', 'Acción no reconocida', null, 400);
    exit;
}

jsonResponse('error', 'Método no soportado', null, 405);
