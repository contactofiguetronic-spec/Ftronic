<?php
// ============================================================================
// ingresos_api.php — Ingresos y Cobros: SOLO pagos de presupuestos (clientes)
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$action = $_REQUEST['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // ── LISTAR INGRESOS (solo pagos de presupuestos) ──
    if ($action === '' || $action === 'listar') {
        try {
            $p = paginationParams(20);
            $fechaDesde = $_GET['fecha_desde'] ?? '';
            $fechaHasta = $_GET['fecha_hasta'] ?? '';
            $where = "p.entidad_tipo = 'presupuesto'";
            $params = [];

            if ($fechaDesde) { $where .= " AND p.fecha >= ?"; $params[] = $fechaDesde; }
            if ($fechaHasta) { $where .= " AND p.fecha <= ?"; $params[] = $fechaHasta; }

            if (!empty($p['search'])) {
                $like = '%' . $p['search'] . '%';
                $where .= " AND (CAST(p.id AS CHAR) LIKE ? OR CAST(p.entidad_id AS CHAR) LIKE ?)";
                $params = array_merge($params, [$like, $like]);
            }

            $stmtC = $conn->prepare("SELECT COUNT(*) FROM pagos p WHERE {$where}");
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $sql = "SELECT p.id, p.monto, p.fecha, p.forma_pago, p.tipo_pago, p.entidad_tipo, p.entidad_id,
                           p.observacion, p.creado, p.cuenta_bancaria_id
                    FROM pagos p
                    WHERE {$where}
                    ORDER BY p.fecha DESC, p.id DESC
                    LIMIT {$p['per_page']} OFFSET {$p['offset']}";
            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            if (!empty($rows)) {
                $pptoIds = array_filter(array_map(fn($r) => (int)$r['entidad_id'], $rows));
                $cuentaIds = array_filter(array_map(fn($r) => (int)$r['cuenta_bancaria_id'], $rows));

                $pptoMap = [];
                $cuentaMap = [];

                if ($pptoIds) {
                    $ph = implode(',', array_fill(0, count($pptoIds), '?'));
                    $s = $conn->prepare("SELECT pr.id, pr.valor_total, pr.cliente_id, pr.vehiculo_id,
                                                c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                                                v.patente, v.marca
                                         FROM presupuesto pr
                                         LEFT JOIN clientes c ON pr.cliente_id = c.id
                                         LEFT JOIN vehiculos v ON pr.vehiculo_id = v.id
                                         WHERE pr.id IN ({$ph})");
                    $s->execute(array_values($pptoIds));
                    while ($r = $s->fetch()) $pptoMap[$r['id']] = $r;
                }
                if ($cuentaIds) {
                    $ph = implode(',', array_fill(0, count($cuentaIds), '?'));
                    $s = $conn->prepare("SELECT id, nombre, banco FROM cuentas_bancarias WHERE id IN ({$ph})");
                    $s->execute(array_values($cuentaIds));
                    while ($r = $s->fetch()) $cuentaMap[$r['id']] = $r;
                }

                foreach ($rows as &$row) {
                    $ref = $pptoMap[$row['entidad_id']] ?? null;
                    $row['cliente_nombre'] = $ref['cliente_nombre'] ?? null;
                    $row['cliente_apellido'] = $ref['cliente_apellido'] ?? null;
                    $row['patente'] = $ref['patente'] ?? null;
                    $row['marca'] = $ref['marca'] ?? null;
                    $row['ppto_id'] = $row['entidad_id'];
                    $cuenta = $cuentaMap[$row['cuenta_bancaria_id']] ?? null;
                    $row['cuenta_nombre'] = $cuenta['nombre'] ?? null;
                    $row['banco'] = $cuenta['banco'] ?? null;
                    unset($row['cuenta_bancaria_id']);
                }
            }

            paginatedResponse($rows, $total, $p);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── RESUMEN / KPIs (solo pagos de presupuestos) ──
    elseif ($action === 'resumen') {
        $sql = "SELECT
                    COUNT(*) AS total_ingresos,
                    COALESCE(SUM(monto), 0) AS monto_total,
                    COALESCE(SUM(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN monto ELSE 0 END), 0) AS mes_actual,
                    COUNT(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN 1 END) AS mes_actual_count
                FROM pagos
                WHERE entidad_tipo = 'presupuesto'";
        $stmt = $conn->query($sql);
        jsonResponse('success', 'OK', $stmt->fetch());
    }

    // ── DETALLE ──
    elseif ($action === 'detalle') {
        try {
            $id = (int)($_GET['id'] ?? 0);
            if (!$id) jsonResponse('error', 'ID requerido', null, 422);

            $stmt = $conn->prepare("SELECT p.* FROM pagos p WHERE p.id = ? AND p.entidad_tipo = 'presupuesto'");
            $stmt->execute([$id]);
            $pago = $stmt->fetch();
            if (!$pago) jsonResponse('error', 'Pago no encontrado', null, 404);

            $s = $conn->prepare("SELECT pr.valor_total, pr.id AS ppto_id,
                                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.rut,
                                        v.patente, v.marca, v.modelo
                                 FROM presupuesto pr
                                 LEFT JOIN clientes c ON pr.cliente_id = c.id
                                 LEFT JOIN vehiculos v ON pr.vehiculo_id = v.id
                                 WHERE pr.id = ?");
            $s->execute([$pago['entidad_id']]);
            $ref = $s->fetch();

            $cb = null;
            if ($pago['cuenta_bancaria_id']) {
                $s = $conn->prepare("SELECT nombre, banco FROM cuentas_bancarias WHERE id = ?");
                $s->execute([$pago['cuenta_bancaria_id']]);
                $cb = $s->fetch();
            }

            $pago['cliente_nombre'] = $ref['cliente_nombre'] ?? null;
            $pago['cliente_apellido'] = $ref['cliente_apellido'] ?? null;
            $pago['rut'] = $ref['rut'] ?? null;
            $pago['patente'] = $ref['patente'] ?? null;
            $pago['marca'] = $ref['marca'] ?? null;
            $pago['modelo'] = $ref['modelo'] ?? null;
            $pago['ppto_id'] = $pago['entidad_id'];
            $pago['cuenta_nombre'] = $cb['nombre'] ?? null;
            $pago['banco'] = $cb['banco'] ?? null;

            jsonResponse('success', 'OK', $pago);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
