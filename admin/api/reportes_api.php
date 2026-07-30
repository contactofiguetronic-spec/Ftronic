<?php
// ============================================================================
// reportes_api.php — Centro de Control: Datos y Reportes
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();
requirePerm('reportes:ver');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

if ($method !== 'GET' && $method !== 'POST') jsonResponse('error', 'Método no permitido');

function dateRange(): array {
    $desde = $_REQUEST['desde'] ?? date('Y-m-01');
    $hasta = $_REQUEST['hasta'] ?? date('Y-m-t');
    return [$desde, $hasta];
}

function prevRange(string $desde, string $hasta): array {
    $d = new DateTime($desde);
    $h = new DateTime($hasta);
    $diff = $d->diff($h)->days + 1;
    $hEnd = clone $d;
    $hEnd->modify("-1 day");
    $dStart = clone $hEnd;
    $dStart->modify("-" . ($diff - 1) . " days");
    return [$dStart->format('Y-m-d'), $hEnd->format('Y-m-d')];
}

function toFloat($v): float {
    return (float)($v ?? 0);
}

function dateTimeRangeBounds(string $desde, string $hasta): array {
    $from = $desde . ' 00:00:00';
    $h = new DateTime($hasta);
    $h->modify('+1 day');
    $toExclusive = $h->format('Y-m-d') . ' 00:00:00';
    return [$from, $toExclusive];
}

try {
    [$desde, $hasta] = dateRange();
    [$desdeDT, $hastaDTExclusive] = dateTimeRangeBounds($desde, $hasta);

    // ════════════════════════════════════════════════════════════════════
    // RESUMEN GENERAL
    // ════════════════════════════════════════════════════════════════════
    if ($action === 'resumen_general') {
        // Ingresos = pagos de presupuestos (cobros a clientes)
        $ventas = $conn->prepare(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(p.monto), 0) AS total
             FROM pagos p
             WHERE p.entidad_tipo = 'presupuesto' AND p.fecha BETWEEN ? AND ?"
        );
        $ventas->execute([$desde, $hasta]);
        $ventasData = $ventas->fetch();

        $compras = $conn->prepare(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total
             FROM compras WHERE fecha BETWEEN ? AND ?"
        );
        $compras->execute([$desde, $hasta]);
        $comprasData = $compras->fetch();

        $comprasRap = $conn->prepare(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(valor), 0) AS total
             FROM compras_rapidas WHERE fecha BETWEEN ? AND ?"
        );
        $comprasRap->execute([$desde, $hasta]);
        $comprasRapData = $comprasRap->fetch();

        $ots = $conn->prepare(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN estado = 'finalizado' THEN 1 ELSE 0 END) AS completadas,
                SUM(CASE WHEN estado IN ('abierta','proceso','en_progreso','diagnostico') THEN 1 ELSE 0 END) AS activas
             FROM orden_trabajo WHERE creado >= ? AND creado < ?"
        );
        $ots->execute([$desdeDT, $hastaDTExclusive]);
        $otsData = $ots->fetch();

        $presupuestos = $conn->prepare(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(COALESCE(valor_total, 0)), 0) AS total
               FROM presupuesto WHERE creado >= ? AND creado < ?"
        );
           $presupuestos->execute([$desdeDT, $hastaDTExclusive]);
        $presData = $presupuestos->fetch();

        $recepciones = $conn->prepare(
            "SELECT COUNT(*) FROM recepcion_unificada WHERE fecha BETWEEN ? AND ?"
        );
        $recepciones->execute([$desde, $hasta]);
        $recepcionesCount = (int)$recepciones->fetchColumn();

        $tareas = $conn->prepare(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN estado='pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN estado='en_progreso' THEN 1 ELSE 0 END) AS en_progreso,
                SUM(CASE WHEN estado='completada' THEN 1 ELSE 0 END) AS completadas,
                SUM(CASE WHEN estado='detenida' THEN 1 ELSE 0 END) AS detenidas
             FROM tareas_diarias WHERE fecha BETWEEN ? AND ?"
        );
        $tareas->execute([$desde, $hasta]);
        $tareasData = $tareas->fetch();

        $clientesNuevos = $conn->prepare("SELECT COUNT(*) FROM clientes WHERE creado >= ? AND creado < ?");
        $clientesNuevos->execute([$desdeDT, $hastaDTExclusive]);
        $clientesNuevosCount = (int)$clientesNuevos->fetchColumn();

        $clientesTotal = (int)$conn->query("SELECT COUNT(*) FROM clientes")->fetchColumn();
        $vehiculosTotal = (int)$conn->query("SELECT COUNT(*) FROM vehiculos")->fetchColumn();

        // Por cobrar: presupuestos verificados con saldo pendiente
        $porCobrarData = $conn->query(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(
                COALESCE(valor_total, 0) - (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE entidad_tipo='presupuesto' AND entidad_id=presupuesto.id)
             ), 0) AS total
             FROM presupuesto
             WHERE verificado = 1
             AND COALESCE(valor_total, 0) > (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE entidad_tipo='presupuesto' AND entidad_id=presupuesto.id)"
        )->fetch();

        $porPagarData = $conn->query(
            "SELECT COUNT(*) AS cantidad, COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total
             FROM compras WHERE estado_pago = 'Pendiente'"
        )->fetch();

        // Trend — compare vs previous period
        [$prevDesde, $prevHasta] = prevRange($desde, $hasta);
        $prevVentas = $conn->prepare("SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.entidad_tipo = 'presupuesto' AND p.fecha BETWEEN ? AND ?");
        $prevVentas->execute([$prevDesde, $prevHasta]);
        $prevVentasTotal = (float)$prevVentas->fetchColumn();

        $prevCompras = $conn->prepare("SELECT COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) FROM compras WHERE fecha BETWEEN ? AND ?");
        $prevCompras->execute([$prevDesde, $prevHasta]);
        $prevComprasTotal = (float)$prevCompras->fetchColumn();

        $ventasTotal = toFloat($ventasData['total']);
        $comprasTotal = toFloat($comprasData['total']);
        $rapidasTotal = toFloat($comprasRapData['total']);

        jsonResponse('success', 'OK', [
            'ventas_cantidad' => (int)$ventasData['cantidad'],
            'ventas_total' => $ventasTotal,
            'ventas_trend' => $prevVentasTotal > 0 ? round(($ventasTotal - $prevVentasTotal) / $prevVentasTotal * 100, 1) : 0,
            'compras_cantidad' => (int)$comprasData['cantidad'],
            'compras_total' => $comprasTotal,
            'compras_trend' => $prevComprasTotal > 0 ? round(($comprasTotal - $prevComprasTotal) / $prevComprasTotal * 100, 1) : 0,
            'rapidas_cantidad' => (int)$comprasRapData['cantidad'],
            'rapidas_total' => $rapidasTotal,
            'utilidad_bruta' => $ventasTotal - $comprasTotal - $rapidasTotal,
            'ots_total' => (int)$otsData['total'],
            'ots_completadas' => (int)$otsData['completadas'],
            'ots_activas' => (int)$otsData['activas'],
            'presupuestos_cantidad' => (int)$presData['cantidad'],
            'presupuestos_total' => toFloat($presData['total']),
            'recepciones' => $recepcionesCount,
            'tareas_total' => (int)$tareasData['total'],
            'tareas_pendientes' => (int)$tareasData['pendientes'],
            'tareas_en_progreso' => (int)$tareasData['en_progreso'],
            'tareas_completadas' => (int)$tareasData['completadas'],
            'tareas_detenidas' => (int)$tareasData['detenidas'],
            'clientes_nuevos' => $clientesNuevosCount,
            'clientes_total' => $clientesTotal,
            'vehiculos_total' => $vehiculosTotal,
            'por_cobrar_cantidad' => (int)$porCobrarData['cantidad'],
            'por_cobrar_total' => toFloat($porCobrarData['total']),
            'por_pagar_cantidad' => (int)$porPagarData['cantidad'],
            'por_pagar_total' => toFloat($porPagarData['total']),
            'rango' => ['desde' => $desde, 'hasta' => $hasta],
        ]);

    // ════════════════════════════════════════════════════════════════════
    // CLIENTES
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'clientes_resumen') {
        $total = (int)$conn->query("SELECT COUNT(*) FROM clientes")->fetchColumn();
        $conVehiculos = (int)$conn->query("SELECT COUNT(DISTINCT cliente_id) FROM vehiculos")->fetchColumn();
        $conComprasQ = $conn->prepare("SELECT COUNT(DISTINCT pr.cliente_id) FROM pagos p JOIN presupuesto pr ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pr.id WHERE p.fecha BETWEEN ? AND ?");
        $conComprasQ->execute([$desde, $hasta]);
        $conCompras = (int)$conComprasQ->fetchColumn();

        $ultimasVisitas = $conn->prepare(
            "SELECT r.id, r.folio, r.fecha, r.eval_motivo_visita, r.eval_estado_general,
                    c.id AS cliente_id, CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre
             FROM recepcion_unificada r
             JOIN clientes c ON r.cliente_id = c.id
             WHERE r.fecha BETWEEN ? AND ?
             ORDER BY r.fecha DESC LIMIT 10"
        );
        $ultimasVisitas->execute([$desde, $hasta]);

        $topClientes = $conn->prepare(
            "SELECT c.id, CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS nombre,
                    COUNT(v.id) AS visitas,
                    COALESCE(SUM(p.monto), 0) AS total_compras
             FROM clientes c
             LEFT JOIN recepcion_unificada v ON c.id = v.cliente_id AND v.fecha BETWEEN ? AND ?
             LEFT JOIN pagos p ON p.entidad_tipo = 'presupuesto' AND p.fecha BETWEEN ? AND ?
             LEFT JOIN presupuesto pr ON p.entidad_id = pr.id AND pr.cliente_id = c.id
             GROUP BY c.id ORDER BY total_compras DESC LIMIT 10"
        );
        $topClientes->execute([$desde, $hasta, $desde, $hasta]);

        jsonResponse('success', 'OK', [
            'total' => $total,
            'con_vehiculos' => $conVehiculos,
            'con_compras_rango' => $conCompras,
            'ultimas_visitas' => $ultimasVisitas->fetchAll(),
            'top_clientes' => $topClientes->fetchAll(),
            'rango' => ['desde' => $desde, 'hasta' => $hasta],
        ]);

    } elseif ($action === 'clientes_lista') {
        $p = paginationParams();
        $sw = buildSearchWhere(['c.nombre', 'c.apellido', 'c.rut', 'c.correo'], $p['search']);
        $countQ = $conn->prepare("SELECT COUNT(*) FROM clientes c WHERE {$sw['where']}");
        $countQ->execute($sw['params']);
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT c.*,
                    (SELECT COUNT(*) FROM vehiculos WHERE cliente_id = c.id) AS vehiculos,
                    (SELECT COUNT(*) FROM recepcion_unificada WHERE cliente_id = c.id) AS visitas,
                    (SELECT COUNT(*) FROM pagos p JOIN presupuesto pr ON p.entidad_tipo='presupuesto' AND p.entidad_id=pr.id WHERE pr.cliente_id = c.id) AS ventas_count,
                    (SELECT COALESCE(SUM(p.monto), 0) FROM pagos p JOIN presupuesto pr ON p.entidad_tipo='presupuesto' AND p.entidad_id=pr.id WHERE pr.cliente_id = c.id) AS ventas_total
             FROM clientes c WHERE {$sw['where']}
             ORDER BY c.nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute($sw['params']);
        paginatedResponse($stmt->fetchAll(), $total, $p);

    // ════════════════════════════════════════════════════════════════════
    // EMPLEADOS
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'empleados_resumen') {
        $total = (int)$conn->query("SELECT COUNT(*) FROM empleados")->fetchColumn();

        $tareasCompletadas = $conn->prepare(
            "SELECT COUNT(*) FROM tareas_diarias WHERE estado = 'completada' AND fecha BETWEEN ? AND ?"
        );
        $tareasCompletadas->execute([$desde, $hasta]);

        $otsTecnicos = $conn->prepare(
            "SELECT e.id, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS nombre,
                    COUNT(ot.id) AS total_ots,
                    SUM(CASE WHEN ot.estado = 'finalizado' THEN 1 ELSE 0 END) AS completadas,
                    COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS valor_generado
               FROM empleados e
               LEFT JOIN orden_trabajo ot ON e.id = ot.asignado_empleado_id AND ot.creado >= ? AND ot.creado < ?
             LEFT JOIN orden_trabajo_items oti ON ot.id = oti.orden_trabajo_id
             GROUP BY e.id ORDER BY total_ots DESC"
        );
           $otsTecnicos->execute([$desdeDT, $hastaDTExclusive]);

        $tareasPorEmp = $conn->prepare(
            "SELECT e.id, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS nombre,
                    COUNT(td.id) AS total_tareas,
                    SUM(CASE WHEN td.estado='completada' THEN 1 ELSE 0 END) AS completadas
             FROM empleados e
             LEFT JOIN tareas_diarias td ON e.id = td.asignado_empleado_id AND td.fecha BETWEEN ? AND ?
             GROUP BY e.id ORDER BY total_tareas DESC"
        );
        $tareasPorEmp->execute([$desde, $hasta]);

        jsonResponse('success', 'OK', [
            'total' => $total,
            'tareas_completadas' => (int)$tareasCompletadas->fetchColumn(),
            'rendimiento_tecnicos' => $otsTecnicos->fetchAll(),
            'tareas_por_empleado' => $tareasPorEmp->fetchAll(),
            'rango' => ['desde' => $desde, 'hasta' => $hasta],
        ]);

    // ════════════════════════════════════════════════════════════════════
    // FINANZAS
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'ventas_por_rango') {
        $p = paginationParams();
        $sw = buildSearchWhere(['c.nombre', 'c.apellido', 'p.observacion'], $p['search']);
        $countQ = $conn->prepare(
            "SELECT COUNT(*) FROM pagos p
             JOIN presupuesto pr ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pr.id
             LEFT JOIN clientes c ON pr.cliente_id = c.id
             WHERE p.fecha BETWEEN ? AND ? AND {$sw['where']}"
        );
        $countQ->execute(array_merge([$desde, $hasta], $sw['params']));
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT p.id, p.monto, p.fecha, p.forma_pago, p.tipo_pago,
                    CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre,
                    pr.valor_total, pr.id AS presupuesto_id,
                    cb.nombre AS cuenta_nombre
             FROM pagos p
             JOIN presupuesto pr ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pr.id
             LEFT JOIN clientes c ON pr.cliente_id = c.id
             LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
             WHERE p.fecha BETWEEN ? AND ? AND {$sw['where']}
             ORDER BY p.fecha DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute(array_merge([$desde, $hasta], $sw['params']));
        paginatedResponse($stmt->fetchAll(), $total, $p);

    } elseif ($action === 'compras_por_rango') {
        $p = paginationParams();
        $sw = buildSearchWhere(['cmp.nombre', 'cmp.numero_documento', 'cmp.descripcion'], $p['search']);
        $countQ = $conn->prepare(
            "SELECT COUNT(*) FROM compras cmp
             LEFT JOIN proveedores pr ON cmp.proveedor_id = pr.id
             WHERE cmp.fecha BETWEEN ? AND ? AND {$sw['where']}"
        );
        $countQ->execute(array_merge([$desde, $hasta], $sw['params']));
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT cmp.*, pr.nombre AS proveedor_nombre, cb.nombre AS cuenta_nombre
             FROM compras cmp
             LEFT JOIN proveedores pr ON cmp.proveedor_id = pr.id
             LEFT JOIN cuentas_bancarias cb ON cmp.cuenta_bancaria_id = cb.id
             WHERE cmp.fecha BETWEEN ? AND ? AND {$sw['where']}
             ORDER BY cmp.fecha DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute(array_merge([$desde, $hasta], $sw['params']));
        paginatedResponse($stmt->fetchAll(), $total, $p);

    } elseif ($action === 'compras_rapidas_por_rango') {
        $p = paginationParams();
        $sw = buildSearchWhere(['cr.nombre', 'cr.lugar_compra', 'cr.detalle'], $p['search']);
        $countQ = $conn->prepare(
            "SELECT COUNT(*) FROM compras_rapidas cr
             LEFT JOIN empleados e ON cr.empleado_responsable_id = e.id
             WHERE cr.fecha BETWEEN ? AND ? AND {$sw['where']}"
        );
        $countQ->execute(array_merge([$desde, $hasta], $sw['params']));
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT cr.*, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS empleado_nombre,
                    cb.nombre AS cuenta_nombre
             FROM compras_rapidas cr
             LEFT JOIN empleados e ON cr.empleado_responsable_id = e.id
             LEFT JOIN cuentas_bancarias cb ON cr.cuenta_bancaria_id = cb.id
             WHERE cr.fecha BETWEEN ? AND ? AND {$sw['where']}
             ORDER BY cr.fecha DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute(array_merge([$desde, $hasta], $sw['params']));
        paginatedResponse($stmt->fetchAll(), $total, $p);

    } elseif ($action === 'cuentas_detalle') {
        $cuentas = $conn->query(
            "SELECT id, nombre, banco, tipo, COALESCE(saldo, 0) AS saldo FROM cuentas_bancarias ORDER BY nombre"
        )->fetchAll();

        $movs = $conn->prepare(
            "SELECT cuenta_bancaria_id,
                    COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS ingresos,
                    COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) AS egresos
             FROM movimientos_caja
             WHERE fecha BETWEEN ? AND ?
             GROUP BY cuenta_bancaria_id"
        );
        $movs->execute([$desde, $hasta]);
        $movMap = [];
        foreach ($movs->fetchAll() as $m) {
            $movMap[(int)$m['cuenta_bancaria_id']] = [
                'ingresos' => (float)$m['ingresos'],
                'egresos' => (float)$m['egresos'],
            ];
        }

        foreach ($cuentas as &$cta) {
            $agg = $movMap[(int)$cta['id']] ?? ['ingresos' => 0.0, 'egresos' => 0.0];
            $cta['ingresos_rango'] = $agg['ingresos'];
            $cta['egresos_rango'] = $agg['egresos'];

            $cta['balance_rango'] = $cta['ingresos_rango'] - $cta['egresos_rango'];
        }
        unset($cta);
        jsonResponse('success', 'OK', $cuentas);

    } elseif ($action === 'flujo_caja_rango') {
        $stmt = $conn->prepare(
            "SELECT fecha, tipo, SUM(monto) AS total
             FROM movimientos_caja
             WHERE fecha BETWEEN ? AND ?
             GROUP BY fecha, tipo ORDER BY fecha ASC"
        );
        $stmt->execute([$desde, $hasta]);
        $rows = $stmt->fetchAll();

        $dias = [];
        foreach ($rows as $r) {
            $f = $r['fecha'];
            if (!isset($dias[$f])) $dias[$f] = ['fecha' => $f, 'ingresos' => 0, 'egresos' => 0];
            if ($r['tipo'] === 'ingreso') $dias[$f]['ingresos'] = (float)$r['total'];
            else $dias[$f]['egresos'] = (float)$r['total'];
        }
        ksort($dias);
        jsonResponse('success', 'OK', array_values($dias));

    } elseif ($action === 'ventas_por_cliente') {
        $stmt = $conn->prepare(
            "SELECT c.id, CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre,
                    COUNT(p.id) AS cantidad_ventas,
                    COALESCE(SUM(p.monto), 0) AS total_ventas
             FROM pagos p
             JOIN presupuesto pr ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pr.id
             JOIN clientes c ON pr.cliente_id = c.id
             WHERE p.fecha BETWEEN ? AND ?
             GROUP BY c.id ORDER BY total_ventas DESC LIMIT 20"
        );
        $stmt->execute([$desde, $hasta]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'por_cobrar_detalle') {
        $stmt = $conn->prepare(
            "SELECT pr.id, CONCAT('Ppto #', pr.id) AS nombre, pr.fecha, pr.valor_total,
                    COALESCE(pr.valor_total, 0) - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.entidad_tipo='presupuesto' AND p.entidad_id=pr.id), 0) AS saldo_pendiente,
                    CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre
             FROM presupuesto pr
             LEFT JOIN clientes c ON pr.cliente_id = c.id
             WHERE pr.verificado = 1
             AND COALESCE(pr.valor_total, 0) > COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.entidad_tipo='presupuesto' AND p.entidad_id=pr.id), 0)
             ORDER BY pr.fecha ASC"
        );
        $stmt->execute();
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'por_pagar_detalle') {
        $stmt = $conn->prepare(
            "SELECT cmp.id, cmp.nombre, cmp.fecha, cmp.valor_total, cmp.valor, cmp.estado_pago,
                    cmp.fecha_vencimiento, cmp.numero_documento, pr.nombre AS proveedor_nombre
             FROM compras cmp
             LEFT JOIN proveedores pr ON cmp.proveedor_id = pr.id
             WHERE cmp.estado_pago = 'Pendiente'
             ORDER BY cmp.fecha_vencimiento ASC"
        );
        $stmt->execute();
        jsonResponse('success', 'OK', $stmt->fetchAll());

    // ════════════════════════════════════════════════════════════════════
    // OPERACIONES
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'ots_por_estado') {
        $stmt = $conn->prepare(
            "SELECT estado, COUNT(*) AS cantidad
             FROM orden_trabajo
             WHERE creado >= ? AND creado < ?
             GROUP BY estado ORDER BY cantidad DESC"
        );
        $stmt->execute([$desdeDT, $hastaDTExclusive]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'ots_detalle') {
        $p = paginationParams();
        $sw = buildSearchWhere(['ot.estado', 'ot.trabajo_ejecutar', 'ot.servicio_ejecutar'], $p['search']);
        $countQ = $conn->prepare(
            "SELECT COUNT(*) FROM orden_trabajo ot WHERE ot.creado >= ? AND ot.creado < ? AND {$sw['where']}"
        );
        $countQ->execute(array_merge([$desdeDT, $hastaDTExclusive], $sw['params']));
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT ot.*,
                    CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS tecnico_nombre,
                    CONCAT(c.nombre, ' ', COALESCE(c.apellido, '')) AS cliente_nombre,
                    vh.patente, vh.marca, vh.modelo
             FROM orden_trabajo ot
             LEFT JOIN empleados e ON ot.asignado_empleado_id = e.id
             LEFT JOIN clientes c ON ot.cliente_id = c.id
             LEFT JOIN vehiculos vh ON ot.vehiculo_id = vh.id
               WHERE ot.creado >= ? AND ot.creado < ? AND {$sw['where']}
             ORDER BY ot.creado DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
           $stmt->execute(array_merge([$desdeDT, $hastaDTExclusive], $sw['params']));
        paginatedResponse($stmt->fetchAll(), $total, $p);

    } elseif ($action === 'productividad_tecnicos') {
        $stmt = $conn->prepare(
            "SELECT e.id, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS nombre,
                    COUNT(ot.id) AS ordenes_completadas,
                    COUNT(ot2.id) AS ordenes_totales,
                    COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS valor_generado
             FROM empleados e
             LEFT JOIN orden_trabajo ot ON e.id = ot.asignado_empleado_id
                     AND ot.estado = 'finalizado'
                     AND ot.creado >= ? AND ot.creado < ?
             LEFT JOIN orden_trabajo ot2 ON e.id = ot2.asignado_empleado_id
                     AND ot2.creado >= ? AND ot2.creado < ?
             LEFT JOIN orden_trabajo_items oti ON ot.id = oti.orden_trabajo_id
             GROUP BY e.id ORDER BY ordenes_completadas DESC"
        );
          $stmt->execute([$desdeDT, $hastaDTExclusive, $desdeDT, $hastaDTExclusive]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'presupuestos_conversion') {
        $stmt = $conn->prepare(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN convertido_a_ot = 1 THEN 1 ELSE 0 END) AS convertidos,
                COALESCE(SUM(COALESCE(valor_total, 0)), 0) AS monto_total,
                COALESCE(SUM(CASE WHEN convertido_a_ot = 1 THEN COALESCE(valor_total, 0) ELSE 0 END), 0) AS monto_convertido
             FROM presupuesto WHERE creado >= ? AND creado < ?"
        );
        $stmt->execute([$desdeDT, $hastaDTExclusive]);
        jsonResponse('success', 'OK', $stmt->fetch());

    } elseif ($action === 'trabajos_top') {
        $stmt = $conn->prepare(
            "SELECT ts.nombre, ts.tipo, COUNT(*) AS frecuencia,
                    COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS valor_total
             FROM orden_trabajo_items oti
             JOIN orden_trabajo ot ON oti.orden_trabajo_id = ot.id
             JOIN trabajos_servicios ts ON oti.item_id = ts.id AND oti.tipo = 'trabajo'
               WHERE ot.creado >= ? AND ot.creado < ?
             GROUP BY ts.id ORDER BY frecuencia DESC LIMIT 15"
        );
           $stmt->execute([$desdeDT, $hastaDTExclusive]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    // ════════════════════════════════════════════════════════════════════
    // INVENTARIO
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'stock_estado') {
        $articulos = $conn->query(
            "SELECT a.*, pr.nombre AS proveedor_nombre
             FROM articulos a LEFT JOIN proveedores pr ON a.proveedor_id = pr.id
             ORDER BY a.stock ASC"
        )->fetchAll();

        $insumos = $conn->query(
            "SELECT i.*, pr.nombre AS proveedor_nombre
             FROM insumos i LEFT JOIN proveedores pr ON i.proveedor_id = pr.id
             ORDER BY i.stock ASC"
        )->fetchAll();

        $normalize = function($items, $tipo) {
            return array_map(function($i) use ($tipo) {
                return [
                    'codigo' => $i['codigo'] ?? '',
                    'descripcion' => $i['nombre'] ?? ($i['descripcion'] ?? ''),
                    'tipo' => $tipo,
                    'stock_actual' => (int)($i['stock'] ?? 0),
                    'stock_minimo' => (int)($i['stock_minimo'] ?? 5),
                    'stock_maximo' => (int)($i['stock_maximo'] ?? 0),
                    'precio' => (float)(($tipo === 'articulo' ? ($i['valor_venta'] ?? 0) : ($i['precio'] ?? 0))),
                    'proveedor' => $i['proveedor_nombre'] ?? '',
                ];
            }, $items);
        };

        $allStock = array_merge($normalize($articulos, 'articulo'), $normalize($insumos, 'insumo'));
        jsonResponse('success', 'OK', $allStock);

    } elseif ($action === 'movimientos_stock_rango') {
        $p = paginationParams();
        $countQ = $conn->prepare(
            "SELECT COUNT(*) FROM movimientos_stock WHERE created_at >= ? AND created_at < ?"
        );
        $countQ->execute([$desdeDT, $hastaDTExclusive]);
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT ms.*,
                    CASE WHEN ms.producto_tipo = 'articulo' THEN a.nombre ELSE i.nombre END AS producto_nombre
             FROM movimientos_stock ms
             LEFT JOIN articulos a ON ms.producto_tipo = 'articulo' AND ms.producto_id = a.id
             LEFT JOIN insumos i ON ms.producto_tipo = 'insumo' AND ms.producto_id = i.id
               WHERE ms.created_at >= ? AND ms.created_at < ?
             ORDER BY ms.created_at DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
           $stmt->execute([$desdeDT, $hastaDTExclusive]);
        paginatedResponse($stmt->fetchAll(), $total, $p);

    } elseif ($action === 'articulos_top') {
        $stmt = $conn->prepare(
            "SELECT a.nombre, a.marca, a.valor_venta,
                    COALESCE(SUM(oti.cantidad), 0) AS vendidos,
                    COALESCE(SUM(oti.cantidad * oti.valor_unitario), 0) AS ingreso_total
             FROM orden_trabajo_items oti
             JOIN orden_trabajo ot ON oti.orden_trabajo_id = ot.id
             JOIN articulos a ON oti.item_id = a.id
               WHERE oti.tipo = 'articulo' AND ot.creado >= ? AND ot.creado < ?
             GROUP BY a.id ORDER BY vendidos DESC LIMIT 15"
        );
           $stmt->execute([$desdeDT, $hastaDTExclusive]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    // ════════════════════════════════════════════════════════════════════
    // TAREAS DIARIAS
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'tareas_por_estado') {
        $stmt = $conn->prepare(
            "SELECT estado, prioridad, COUNT(*) AS cantidad
             FROM tareas_diarias WHERE fecha BETWEEN ? AND ?
             GROUP BY estado, prioridad ORDER BY
                FIELD(estado, 'pendiente','en_progreso','detenida','completada','cancelada')"
        );
        $stmt->execute([$desde, $hasta]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'tareas_por_empleado') {
        $stmt = $conn->prepare(
            "SELECT e.id, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS nombre,
                    COUNT(td.id) AS total_tareas,
                    SUM(CASE WHEN td.estado='completada' THEN 1 ELSE 0 END) AS completadas,
                    SUM(CASE WHEN td.estado='en_progreso' THEN 1 ELSE 0 END) AS en_progreso,
                    SUM(CASE WHEN td.estado='pendiente' THEN 1 ELSE 0 END) AS pendientes
             FROM tareas_diarias td
             LEFT JOIN empleados e ON td.asignado_empleado_id = e.id
             WHERE td.fecha BETWEEN ? AND ?
             GROUP BY e.id ORDER BY total_tareas DESC"
        );
        $stmt->execute([$desde, $hasta]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'tareas_detalle') {
        $p = paginationParams();
        $estado = $_GET['estado'] ?? '';
        $empleadoId = normalizeNullableInt($_GET['empleado_id'] ?? null);

        $conditions = ['td.fecha BETWEEN ? AND ?'];
        $params = [$desde, $hasta];

        if ($estado) { $conditions[] = 'td.estado = ?'; $params[] = $estado; }
        if ($empleadoId) { $conditions[] = 'td.asignado_empleado_id = ?'; $params[] = $empleadoId; }

        $whereExtra = implode(' AND ', $conditions);
        $sw = buildSearchWhere(['td.nombre', 'td.proceso', 'td.tipo'], $p['search']);
        $fullWhere = "({$whereExtra}) AND {$sw['where']}";
        $allParams = array_merge($params, $sw['params']);

        $countQ = $conn->prepare("SELECT COUNT(*) FROM tareas_diarias td WHERE {$fullWhere}");
        $countQ->execute($allParams);
        $total = (int)$countQ->fetchColumn();

        $stmt = $conn->prepare(
            "SELECT td.*,
                    CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS empleado_nombre,
                    (SELECT COUNT(*) FROM tarea_comentarios WHERE tarea_id = td.id) AS total_comentarios,
                    (SELECT COUNT(*) FROM tarea_avances WHERE tarea_id = td.id) AS total_avances
             FROM tareas_diarias td
             LEFT JOIN empleados e ON td.asignado_empleado_id = e.id
             WHERE {$fullWhere}
             ORDER BY td.fecha DESC, td.creado DESC
             LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute($allParams);
        paginatedResponse($stmt->fetchAll(), $total, $p);

    // ════════════════════════════════════════════════════════════════════
    // EVOLUCIÓN TEMPORAL
    // ════════════════════════════════════════════════════════════════════
    } elseif ($action === 'evolucion_ventas_compras') {
        $meses = (int)($_GET['meses'] ?? 12);
        // Ingresos = pagos de presupuestos
        $ventas = $conn->prepare(
            "SELECT DATE_FORMAT(p.fecha, '%Y-%m') AS periodo,
                    COALESCE(SUM(p.monto), 0) AS total
             FROM pagos p
             WHERE p.entidad_tipo = 'presupuesto' AND p.fecha >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
             GROUP BY periodo ORDER BY periodo"
        );
        $ventas->execute([$meses]);

        $compras = $conn->prepare(
            "SELECT DATE_FORMAT(fecha, '%Y-%m') AS periodo,
                    COALESCE(SUM(COALESCE(valor_total, valor, 0)), 0) AS total
             FROM compras WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
             GROUP BY periodo ORDER BY periodo"
        );
        $compras->execute([$meses]);

        jsonResponse('success', 'OK', [
            'ventas' => $ventas->fetchAll(),
            'compras' => $compras->fetchAll(),
        ]);

    } elseif ($action === 'distribucion_gastos') {
        $stmt = $conn->prepare(
            "SELECT COALESCE(pr.nombre, 'Sin proveedor') AS categoria,
                    COUNT(*) AS cantidad,
                    COALESCE(SUM(COALESCE(cmp.valor_total, cmp.valor, 0)), 0) AS total
             FROM compras cmp
             LEFT JOIN proveedores pr ON cmp.proveedor_id = pr.id
             WHERE cmp.fecha BETWEEN ? AND ?
             GROUP BY pr.nombre ORDER BY total DESC"
        );
        $stmt->execute([$desde, $hasta]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'distribucion_ventas') {
        $stmt = $conn->prepare(
            "SELECT COALESCE(c.nombre, 'Sin cliente') AS categoria,
                    COUNT(*) AS cantidad,
                    COALESCE(SUM(p.monto), 0) AS total
             FROM pagos p
             JOIN presupuesto pr ON p.entidad_tipo = 'presupuesto' AND p.entidad_id = pr.id
             LEFT JOIN clientes c ON pr.cliente_id = c.id
             WHERE p.fecha BETWEEN ? AND ?
             GROUP BY c.nombre ORDER BY total DESC LIMIT 10"
        );
        $stmt->execute([$desde, $hasta]);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'inventario_taller_todos') {
        $stmt = $conn->prepare(
            "SELECT it.id, it.identificacion, it.nombre, it.categoria, it.utilidad,
                    it.precio_avaluado, it.detalles, it.creado,
                    zt.nombre AS zona_nombre,
                    (SELECT COUNT(*) FROM archivos_multimedia WHERE entidad_tipo='inventario_taller' AND entidad_id=it.id) AS media_count
             FROM inventario_taller it
             LEFT JOIN zonas_taller zt ON it.zona_taller_id = zt.id
             ORDER BY it.nombre ASC"
        );
        $stmt->execute();
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } else {
        jsonResponse('error', 'Acción no válida: ' . $action);
    }

} catch (Exception $e) {
    jsonResponse('error', $e->getMessage(), null, 500);
}
