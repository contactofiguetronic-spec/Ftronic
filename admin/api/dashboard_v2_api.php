<?php
// ============================================================================
// dashboard_v2_api.php — Dashboard con métricas financieras y operacionales
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? 'resumen';

if ($method !== 'GET') jsonResponse('error', 'Método no permitido');

try {
    if ($action === 'resumen') {
        // ── Ventas directas del mes (tabla ventas) ──
        $ventasMes = $conn->query(
            "SELECT COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total,
                    COUNT(*) AS cantidad
             FROM ventas
             WHERE MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())"
        )->fetch();

        // ── OTs finalizadas este mes SIN presupuesto vinculado (trabajo directo) ──
        $otsMes = $conn->query(
            "SELECT COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS total,
                    COUNT(DISTINCT ot.id) AS cantidad
             FROM orden_trabajo ot
             INNER JOIN orden_trabajo_items oti ON ot.id = oti.orden_trabajo_id
             LEFT JOIN presupuesto pv ON ot.presupuesto_id = pv.id
             WHERE ot.estado IN ('finalizado','entregado','facturado')
               AND (ot.presupuesto_id IS NULL OR pv.estado != 'pagado')
               AND MONTH(ot.creado) = MONTH(CURDATE()) AND YEAR(ot.creado) = YEAR(CURDATE())"
        )->fetch();

        // ── Presupuestos pagados este mes ──
        $presupuestosPagadosMes = $conn->query(
            "SELECT COALESCE(SUM(COALESCE(valor_total, 0)), 0) AS total,
                    COUNT(*) AS cantidad
             FROM presupuesto
             WHERE estado = 'pagado'
               AND MONTH(creado) = MONTH(CURDATE()) AND YEAR(creado) = YEAR(CURDATE())"
        )->fetch();

        // ── Total ventas del mes (ventas + OTs + pptos pagados) ──
        $totalVentasMes = (float)$ventasMes['total'] + (float)$otsMes['total'] + (float)$presupuestosPagadosMes['total'];

        // ── Ventas mes anterior (para variación) ──
        $ventasMesAnt = $conn->query(
            "SELECT COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0)
             FROM ventas
             WHERE MONTH(fecha) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
               AND YEAR(fecha) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))"
        )->fetchColumn();
        $otsMesAnt = $conn->query(
            "SELECT COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0)
             FROM orden_trabajo ot
             INNER JOIN orden_trabajo_items oti ON ot.id = oti.orden_trabajo_id
             LEFT JOIN presupuesto pv ON ot.presupuesto_id = pv.id
             WHERE ot.estado IN ('finalizado','entregado','facturado')
               AND (ot.presupuesto_id IS NULL OR pv.estado != 'pagado')
               AND MONTH(ot.creado) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
               AND YEAR(ot.creado) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))"
        )->fetchColumn();
        $pptosMesAnt = $conn->query(
            "SELECT COALESCE(SUM(COALESCE(valor_total, 0)), 0)
             FROM presupuesto
             WHERE estado = 'pagado'
               AND MONTH(creado) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
               AND YEAR(creado) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))"
        )->fetchColumn();
        $totalMesAnt = (float)$ventasMesAnt + (float)$otsMesAnt + (float)$pptosMesAnt;

        // Compras del mes
        $comprasMes = $conn->query(
            "SELECT COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total,
                    COUNT(*) AS cantidad
             FROM compras
             WHERE MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())"
        )->fetch();

        // OT activas
        $otActivas = $conn->query(
            "SELECT COUNT(*) FROM orden_trabajo WHERE estado NOT IN ('finalizado','entregado','facturado')"
        )->fetchColumn();

        // OT por estado
        $otPorEstado = $conn->query(
            "SELECT estado, COUNT(*) AS cantidad FROM orden_trabajo GROUP BY estado ORDER BY cantidad DESC"
        )->fetchAll();

        // Presupuestos del mes
        $presupuestosMes = $conn->query(
            "SELECT COUNT(*) AS cantidad,
                    COALESCE(SUM(COALESCE(valor_total, 0)), 0) AS total
             FROM presupuesto
             WHERE MONTH(creado) = MONTH(CURDATE()) AND YEAR(creado) = YEAR(CURDATE())"
        )->fetch();

        // Tasa de conversión presupuesto → OT
        $conversion = $conn->query(
            "SELECT
                (SELECT COUNT(*) FROM presupuesto WHERE MONTH(creado)=MONTH(CURDATE()) AND YEAR(creado)=YEAR(CURDATE())) AS total_presupuestos,
                (SELECT COUNT(*) FROM orden_trabajo WHERE presupuesto_id IS NOT NULL AND MONTH(creado)=MONTH(CURDATE()) AND YEAR(creado)=YEAR(CURDATE())) AS convertidos"
        )->fetch();

        // Saldo cuentas bancarias
        $cuentas = $conn->query(
            "SELECT id, nombre, banco, COALESCE(saldo, 0) AS saldo FROM cuentas_bancarias ORDER BY nombre"
        )->fetchAll();

        // Alertas de stock
        $alertasStock = $conn->query(
            "(SELECT nombre, stock, stock_minimo, 'articulo' AS tipo FROM articulos WHERE stock <= stock_minimo)
             UNION ALL
             (SELECT nombre, stock, stock_minimo, 'insumo' AS tipo FROM insumos WHERE stock <= stock_minimo)
             ORDER BY stock ASC LIMIT 10"
        )->fetchAll();

        // Cuentas por cobrar (ventas pendientes)
        $porCobrar = $conn->query(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total
             FROM ventas WHERE estado_pago = 'pendiente'"
        )->fetch();

        // Cuentas por pagar (compras pendientes)
        $porPagar = $conn->query(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total
             FROM compras WHERE estado_pago = 'Pendiente'"
        )->fetch();

        // Flujo de caja del mes
        $ingresosMes = $conn->query(
            "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
             WHERE tipo = 'ingreso' AND MONTH(fecha)=MONTH(CURDATE()) AND YEAR(fecha)=YEAR(CURDATE())"
        )->fetchColumn();

        $egresosMes = $conn->query(
            "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
             WHERE tipo = 'egreso' AND MONTH(fecha)=MONTH(CURDATE()) AND YEAR(fecha)=YEAR(CURDATE())"
        )->fetchColumn();

        // Compras rápidas del mes
        $comprasRapidasMes = $conn->query(
            "SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS cantidad
             FROM compras_rapidas
             WHERE MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())"
        )->fetch();

        jsonResponse('success', 'OK', [
            'ventas_mes' => [
                'total' => $totalVentasMes,
                'cantidad' => (int)$ventasMes['cantidad'] + (int)$otsMes['cantidad'] + (int)$presupuestosPagadosMes['cantidad'],
                'variacion' => $totalMesAnt ? round((($totalVentasMes - $totalMesAnt) / $totalMesAnt) * 100, 1) : 0,
                'desglose' => [
                    'ventas_directas' => (float)$ventasMes['total'],
                    'ventas_directas_cantidad' => (int)$ventasMes['cantidad'],
                    'ots_trabajos' => (float)$otsMes['total'],
                    'ots_trabajos_cantidad' => (int)$otsMes['cantidad'],
                    'presupuestos_pagados' => (float)$presupuestosPagadosMes['total'],
                    'presupuestos_pagados_cantidad' => (int)$presupuestosPagadosMes['cantidad'],
                ],
            ],
            'compras_mes' => [
                'total' => (float)$comprasMes['total'],
                'cantidad' => (int)$comprasMes['cantidad'],
            ],
            'utilidad_bruta' => $totalVentasMes - (float)$comprasMes['total'],
            'ot_activas' => (int)$otActivas,
            'ot_por_estado' => $otPorEstado,
            'presupuestos_mes' => [
                'cantidad' => (int)$presupuestosMes['cantidad'],
                'total' => (float)$presupuestosMes['total'],
            ],
            'conversion_presupuestos' => [
                'total' => (int)$conversion['total_presupuestos'],
                'convertidos' => (int)$conversion['convertidos'],
                'tasa' => $conversion['total_presupuestos'] > 0
                    ? round(($conversion['convertidos'] / $conversion['total_presupuestos']) * 100, 1)
                    : 0,
            ],
            'cuentas_bancarias' => $cuentas,
            'alertas_stock' => $alertasStock,
            'por_cobrar' => [
                'cantidad' => (int)$porCobrar['cantidad'],
                'total' => (float)$porCobrar['total'],
            ],
            'por_pagar' => [
                'cantidad' => (int)$porPagar['cantidad'],
                'total' => (float)$porPagar['total'],
            ],
            'flujo_caja' => [
                'ingresos' => (float)$ingresosMes,
                'egresos' => (float)$egresosMes,
                'balance' => (float)$ingresosMes - (float)$egresosMes,
            ],
            'compras_rapidas_mes' => [
                'total' => (float)($comprasRapidasMes['total'] ?? 0),
                'cantidad' => (int)($comprasRapidasMes['cantidad'] ?? 0),
            ],
        ]);
    }

    elseif ($action === 'ventas_por_periodo') {
        $meses = (int)($_GET['meses'] ?? 12);
        $rows = $conn->query(
            "SELECT DATE_FORMAT(fecha, '%Y-%m') AS periodo,
                    COUNT(*) AS cantidad,
                    COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total
             FROM ventas
             WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL {$meses} MONTH)
             GROUP BY periodo ORDER BY periodo ASC"
        )->fetchAll();

        // OTs finalizadas por mes (sin presupuesto pagado vinculado)
        $otsRows = $conn->query(
            "SELECT DATE_FORMAT(ot.creado, '%Y-%m') AS periodo,
                    COUNT(DISTINCT ot.id) AS cantidad,
                    COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS total
             FROM orden_trabajo ot
             INNER JOIN orden_trabajo_items oti ON ot.id = oti.orden_trabajo_id
             LEFT JOIN presupuesto pv ON ot.presupuesto_id = pv.id
             WHERE ot.estado IN ('finalizado','entregado','facturado')
               AND (ot.presupuesto_id IS NULL OR pv.estado != 'pagado')
               AND ot.creado >= DATE_SUB(CURDATE(), INTERVAL {$meses} MONTH)
             GROUP BY periodo ORDER BY periodo ASC"
        )->fetchAll();

        // Presupuestos pagados por mes
        $pptosRows = $conn->query(
            "SELECT DATE_FORMAT(creado, '%Y-%m') AS periodo,
                    COUNT(*) AS cantidad,
                    COALESCE(SUM(COALESCE(valor_total, 0)), 0) AS total
             FROM presupuesto
             WHERE estado = 'pagado'
               AND creado >= DATE_SUB(CURDATE(), INTERVAL {$meses} MONTH)
             GROUP BY periodo ORDER BY periodo ASC"
        )->fetchAll();

        // Merge all into unified timeline
        $merged = [];
        foreach ($rows as $r) $merged[$r['periodo']] = ['periodo'=>$r['periodo'], 'cantidad'=>(int)$r['cantidad'], 'total'=>(float)$r['total']];
        foreach ($otsRows as $r) {
            if (!isset($merged[$r['periodo']])) $merged[$r['periodo']] = ['periodo'=>$r['periodo'], 'cantidad'=>0, 'total'=>0];
            $merged[$r['periodo']]['cantidad'] += (int)$r['cantidad'];
            $merged[$r['periodo']]['total'] += (float)$r['total'];
        }
        foreach ($pptosRows as $r) {
            if (!isset($merged[$r['periodo']])) $merged[$r['periodo']] = ['periodo'=>$r['periodo'], 'cantidad'=>0, 'total'=>0];
            $merged[$r['periodo']]['cantidad'] += (int)$r['cantidad'];
            $merged[$r['periodo']]['total'] += (float)$r['total'];
        }
        ksort($merged);
        jsonResponse('success', 'OK', array_values($merged));
    }

    elseif ($action === 'gastos_por_categoria') {
        $rows = $conn->query(
            "SELECT COALESCE(c.nombre, 'Sin categoría') AS categoria,
                    COUNT(*) AS cantidad,
                    COALESCE(SUM(COALESCE(cmp.valor_total, cmp.valor, 0)), 0) AS total
             FROM compras cmp
             LEFT JOIN proveedores c ON cmp.proveedor_id = c.id
             WHERE MONTH(cmp.fecha) = MONTH(CURDATE()) AND YEAR(cmp.fecha) = YEAR(CURDATE())
             GROUP BY c.nombre ORDER BY total DESC"
        )->fetchAll();
        jsonResponse('success', 'OK', $rows);
    }

    elseif ($action === 'productividad_tecnicos') {
        $rows = $conn->query(
            "SELECT e.id, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS nombre,
                    COUNT(ot.id) AS ordenes_completadas,
                    COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS valor_generado
             FROM empleados e
             LEFT JOIN orden_trabajo ot ON e.id = ot.asignado_empleado_id AND ot.estado IN ('finalizado','entregado','facturado')
             LEFT JOIN orden_trabajo_items oti ON ot.id = oti.orden_trabajo_id
             WHERE MONTH(ot.creado) = MONTH(CURDATE()) AND YEAR(ot.creado) = YEAR(CURDATE())
             GROUP BY e.id ORDER BY ordenes_completadas DESC"
        )->fetchAll();
        jsonResponse('success', 'OK', $rows);
    }

    else {
        jsonResponse('error', 'Acción no válida');
    }
} catch (Exception $e) {
    jsonResponse('error', $e->getMessage(), null, 500);
}
