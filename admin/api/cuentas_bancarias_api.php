<?php
// ============================================================================
// cuentas_bancarias_api.php — CRUD + Dashboard Financiero Cuentas Bancarias
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

// Protección por permiso
$action = $_REQUEST['action'] ?? '';
$writeActions = ['guardar', 'eliminar', 'agregar_movimiento'];
if (in_array($action, $writeActions)) {
    requirePerm('cuentas_bancarias:editar');
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {

    // ── RESUMEN DASHBOARD ──
    if ($action === 'resumen') {
        try {
            // Total saldos
            $stmt = $conn->query("SELECT COALESCE(SUM(saldo), 0) AS total_saldos FROM cuentas_bancarias");
            $totalSaldos = (float)$stmt->fetchColumn();

            // Ingresos del mes actual
            $stmt = $conn->prepare("
                SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
                WHERE tipo = 'ingreso' AND MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())
            ");
            $stmt->execute();
            $ingresosMes = (float)$stmt->fetchColumn();

            // Egresos del mes actual
            $stmt = $conn->prepare("
                SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
                WHERE tipo = 'egreso' AND MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())
            ");
            $stmt->execute();
            $egresosMes = (float)$stmt->fetchColumn();

            // Ingresos del mes anterior
            $stmt = $conn->prepare("
                SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
                WHERE tipo = 'ingreso' AND MONTH(fecha) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(fecha) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
            ");
            $stmt->execute();
            $ingresosMesAnterior = (float)$stmt->fetchColumn();

            // Egresos del mes anterior
            $stmt = $conn->prepare("
                SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
                WHERE tipo = 'egreso' AND MONTH(fecha) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)) AND YEAR(fecha) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
            ");
            $stmt->execute();
            $egresosMesAnterior = (float)$stmt->fetchColumn();

            // Total cuentas activas
            $stmt = $conn->query("SELECT COUNT(*) FROM cuentas_bancarias");
            $totalCuentas = (int)$stmt->fetchColumn();

            // Movimientos hoy
            $stmt = $conn->prepare("
                SELECT COUNT(*) FROM movimientos_caja WHERE fecha = CURRENT_DATE()
            ");
            $stmt->execute();
            $movimientosHoy = (int)$stmt->fetchColumn();

            // Últimos 5 movimientos
            $stmt = $conn->query("
                SELECT mc.*, cb.nombre AS cuenta_nombre, cb.banco AS cuenta_banco
                FROM movimientos_caja mc
                LEFT JOIN cuentas_bancarias cb ON mc.cuenta_bancaria_id = cb.id
                ORDER BY mc.created_at DESC LIMIT 5
            ");
            $ultimosMovimientos = $stmt->fetchAll();

            jsonResponse('success', 'OK', [
                'total_saldos'        => $totalSaldos,
                'ingresos_mes'        => $ingresosMes,
                'egresos_mes'         => $egresosMes,
                'balance_mes'         => $ingresosMes - $egresosMes,
                'ingresos_mes_anterior' => $ingresosMesAnterior,
                'egresos_mes_anterior'  => $egresosMesAnterior,
                'balance_mes_anterior'  => $ingresosMesAnterior - $egresosMesAnterior,
                'total_cuentas'       => $totalCuentas,
                'movimientos_hoy'     => $movimientosHoy,
                'ultimos_movimientos' => $ultimosMovimientos,
            ]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── ESTADISTICAS MENSUALES (para gráficos) ──
    if ($action === 'estadisticas') {
        try {
            $meses = (int)($_GET['meses'] ?? 6);
            $data = [];
            for ($i = $meses - 1; $i >= 0; $i--) {
                $fechaRef = date('Y-m-d', strtotime("-{$i} months"));
                $mes = (int)date('m', strtotime($fechaRef));
                $anio = (int)date('Y', strtotime($fechaRef));
                $mesLabel = date('M Y', strtotime($fechaRef));

                $stmt = $conn->prepare("
                    SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
                    WHERE tipo = 'ingreso' AND MONTH(fecha) = ? AND YEAR(fecha) = ?
                ");
                $stmt->execute([$mes, $anio]);
                $ingresos = (float)$stmt->fetchColumn();

                $stmt = $conn->prepare("
                    SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja
                    WHERE tipo = 'egreso' AND MONTH(fecha) = ? AND YEAR(fecha) = ?
                ");
                $stmt->execute([$mes, $anio]);
                $egresos = (float)$stmt->fetchColumn();

                $data[] = [
                    'mes'      => $mesLabel,
                    'ingresos' => $ingresos,
                    'egresos'  => $egresos,
                    'balance'  => $ingresos - $egresos,
                ];
            }
            jsonResponse('success', 'OK', $data);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── MOVIMIENTOS (por cuenta o todos) ──
    if ($action === 'movimientos') {
        try {
            $cuentaId = $_GET['cuenta_id'] ?? null;
            $tipo     = $_GET['tipo'] ?? null;
            $fechaDesde = $_GET['fecha_desde'] ?? null;
            $fechaHasta = $_GET['fecha_hasta'] ?? null;
            $p = paginationParams(20);

            $where = ['1=1'];
            $params = [];

            if ($cuentaId) {
                $where[] = 'mc.cuenta_bancaria_id = ?';
                $params[] = (int)$cuentaId;
            }
            if ($tipo && in_array($tipo, ['ingreso', 'egreso', 'transferencia'])) {
                $where[] = 'mc.tipo = ?';
                $params[] = $tipo;
            }
            if ($fechaDesde) {
                $where[] = 'mc.fecha >= ?';
                $params[] = $fechaDesde;
            }
            if ($fechaHasta) {
                $where[] = 'mc.fecha <= ?';
                $params[] = $fechaHasta;
            }

            $whereSQL = implode(' AND ', $where);

            $stmtC = $conn->prepare("SELECT COUNT(*) FROM movimientos_caja mc WHERE {$whereSQL}");
            $stmtC->execute($params);
            $total = (int)$stmtC->fetchColumn();

            $stmt = $conn->prepare("
                SELECT mc.*, cb.nombre AS cuenta_nombre, cb.banco AS cuenta_banco
                FROM movimientos_caja mc
                LEFT JOIN cuentas_bancarias cb ON mc.cuenta_bancaria_id = cb.id
                WHERE {$whereSQL}
                ORDER BY mc.fecha DESC, mc.id DESC
                LIMIT {$p['per_page']} OFFSET {$p['offset']}
            ");
            $stmt->execute($params);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── LISTAR / OBTENER POR ID (CRUD estándar) ──
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM cuentas_bancarias WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('cuentas_bancarias', (int)$id, $conn);

            // Agregar saldos calculados
            $stmt = $conn->prepare("
                SELECT 
                    COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS total_ingresos,
                    COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) AS total_egresos
                FROM movimientos_caja WHERE cuenta_bancaria_id = ?
            ");
            $stmt->execute([$id]);
            $saldos = $stmt->fetch();
            $rec['total_ingresos'] = (float)$saldos['total_ingresos'];
            $rec['total_egresos'] = (float)$saldos['total_egresos'];

            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['nombre', 'banco', 'tipo', 'detalles'], $p['search']);
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM cuentas_bancarias WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            
            $stmt = $conn->prepare(
                "SELECT * FROM cuentas_bancarias 
                 WHERE {$sw['where']}
                 ORDER BY nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($sw['params']);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

// ── POST ─────────────────────────────────────────────────────────────────────
elseif ($method === 'POST') {

    // ── ELIMINAR ──
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            deleteMultimedia('cuentas_bancarias', (int)$id, $conn);
            historialInsert('cuentas_bancarias', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM cuentas_bancarias WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── REGISTRAR MOVIMIENTO MANUAL ──
    if ($action === 'registrar_movimiento') {
        $cuentaId  = (int)($_POST['cuenta_bancaria_id'] ?? 0);
        $tipo      = sanitizeString($_POST['tipo'] ?? '', 20);
        $monto     = (float)($_POST['monto'] ?? 0);
        $concepto  = $_POST['concepto'] ?? '';
        $fecha     = $_POST['fecha'] ?? date('Y-m-d');

        if (!$cuentaId || !$monto || $monto <= 0) jsonResponse('error', 'Cuenta y monto requeridos', null, 422);
        if (!in_array($tipo, ['ingreso', 'egreso', 'transferencia'])) jsonResponse('error', 'Tipo inválido', null, 422);

        try {
            $conn->beginTransaction();

            // Verificar que la cuenta existe
            $stmt = $conn->prepare("SELECT saldo FROM cuentas_bancarias WHERE id = ?");
            $stmt->execute([$cuentaId]);
            $cuenta = $stmt->fetch();
            if (!$cuenta) jsonResponse('error', 'Cuenta no encontrada', null, 404);

            // Registrar movimiento
            $stmt = $conn->prepare("
                INSERT INTO movimientos_caja (cuenta_bancaria_id, fecha, tipo, monto, entidad_tipo, concepto)
                VALUES (?, ?, ?, ?, 'ajuste', ?)
            ");
            $stmt->execute([$cuentaId, $fecha, $tipo, $monto, $concepto]);
            $movId = (int)$conn->lastInsertId();

            // Actualizar saldo
            $signo = ($tipo === 'ingreso') ? '+' : '-';
            $nuevoSaldo = (float)$cuenta['saldo'] + ($tipo === 'ingreso' ? $monto : -$monto);
            $conn->prepare("UPDATE cuentas_bancarias SET saldo = ? WHERE id = ?")->execute([$nuevoSaldo, $cuentaId]);

            historialInsert('cuentas_bancarias', $cuentaId, 'actualizado', 'saldo', $cuenta['saldo'], $nuevoSaldo, $conn);
            $conn->commit();

            jsonResponse('success', 'Movimiento registrado', [
                'id' => $movId,
                'nuevo_saldo' => $nuevoSaldo,
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── TRANSFERIR ENTRE CUENTAS ──
    if ($action === 'transferir') {
        $cuentaOrigen  = (int)($_POST['cuenta_origen_id'] ?? 0);
        $cuentaDestino = (int)($_POST['cuenta_destino_id'] ?? 0);
        $monto         = (float)($_POST['monto'] ?? 0);
        $concepto      = $_POST['concepto'] ?? '';
        $fecha         = $_POST['fecha'] ?? date('Y-m-d');

        if (!$cuentaOrigen || !$cuentaDestino || $cuentaOrigen === $cuentaDestino) jsonResponse('error', 'Cuentas origen y destino diferentes requeridas', null, 422);
        if ($monto <= 0) jsonResponse('error', 'Monto requerido', null, 422);

        try {
            $conn->beginTransaction();

            $stmt = $conn->prepare("SELECT id, saldo, nombre FROM cuentas_bancarias WHERE id IN (?, ?)");
            $stmt->execute([$cuentaOrigen, $cuentaDestino]);
            $cuentas = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

            if (!isset($cuentas[$cuentaOrigen]) || !isset($cuentas[$cuentaDestino])) jsonResponse('error', 'Una o ambuentas no encontradas', null, 404);

            $saldoOrigen = (float)$cuentas[$cuentaOrigen]['saldo'];
            if ($saldoOrigen < $monto) jsonResponse('error', 'Saldo insuficiente en cuenta origen ($' . number_format($saldoOrigen, 0, ',', '.') . ')', null, 422);

            // Egreso en origen
            registrarMovimientoCaja('egreso', $monto, 'transferencia', null, $fecha, null, "Transferencia a {$cuentas[$cuentaDestino]['nombre']}: {$concepto}", $conn, $cuentaOrigen);
            // Ingreso en destino
            registrarMovimientoCaja('ingreso', $monto, 'transferencia', null, $fecha, null, "Transferencia desde {$cuentas[$cuentaOrigen]['nombre']}: {$concepto}", $conn, $cuentaDestino);

            $conn->commit();
            jsonResponse('success', 'Transferencia realizada', [
                'saldo_origen' => $saldoOrigen - $monto,
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── ELIMINAR MOVIMIENTO (anular con motivo) ──
    if ($action === 'eliminar_movimiento') {
        $movId  = (int)($_POST['movimiento_id'] ?? 0);
        $motivo = trim($_POST['motivo'] ?? '');
        if (!$movId) jsonResponse('error', 'ID requerido', null, 422);
        if (empty($motivo)) jsonResponse('error', 'El motivo es obligatorio', null, 422);

        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM movimientos_caja WHERE id = ?");
            $stmt->execute([$movId]);
            $mov = $stmt->fetch();
            if (!$mov) jsonResponse('error', 'Movimiento no encontrado', null, 404);
            if ($mov['anulado']) jsonResponse('error', 'Este movimiento ya fue anulado', null, 409);

            // Revertir saldo
            $signo = ($mov['tipo'] === 'ingreso') ? '-' : '+';
            $conn->prepare("UPDATE cuentas_bancarias SET saldo = saldo {$signo} {$mov['monto']} WHERE id = {$mov['cuenta_bancaria_id']}");

            // Marcar como anulado
            $conn->prepare("UPDATE movimientos_caja SET anulado = 1, motivo_anulacion = ? WHERE id = ?")->execute([$motivo, $movId]);

            historialInsert('cuentas_bancarias', $mov['cuenta_bancaria_id'], 'anulado_movimiento', $movId, $mov['monto'], $motivo, $conn);
            $conn->commit();

            $stmtSaldo = $conn->prepare("SELECT saldo FROM cuentas_bancarias WHERE id = ?");
            $stmtSaldo->execute([$mov['cuenta_bancaria_id']]);
            $nuevoSaldo = (float)$stmtSaldo->fetchColumn();
            jsonResponse('success', 'Movimiento anulado. Saldo actualizado.', ['nuevo_saldo' => $nuevoSaldo]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── EDITAR MOVIMIENTO (con motivo) ──
    if ($action === 'editar_movimiento') {
        $movId    = (int)($_POST['movimiento_id'] ?? 0);
        $motivo   = trim($_POST['motivo'] ?? '');
        $monto    = (float)($_POST['monto'] ?? 0);
        $fecha    = $_POST['fecha'] ?? '';
        $concepto = $_POST['concepto'] ?? '';
        if (!$movId) jsonResponse('error', 'ID requerido', null, 422);
        if (empty($motivo)) jsonResponse('error', 'El motivo es obligatorio', null, 422);
        if ($monto <= 0) jsonResponse('error', 'El monto debe ser mayor a 0', null, 422);

        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM movimientos_caja WHERE id = ?");
            $stmt->execute([$movId]);
            $mov = $stmt->fetch();
            if (!$mov) jsonResponse('error', 'Movimiento no encontrado', null, 404);
            if ($mov['anulado']) jsonResponse('error', 'No se puede editar un movimiento anulado', null, 409);

            $montoAnterior = (float)$mov['monto'];
            $diff = $monto - $montoAnterior;

            // Ajustar saldo según diferencia
            if ($diff != 0) {
                $signo = ($mov['tipo'] === 'ingreso') ? '+' : '-';
                $conn->prepare("UPDATE cuentas_bancarias SET saldo = saldo {$signo} {$diff} WHERE id = {$mov['cuenta_bancaria_id']}");
            }

            // Actualizar movimiento
            $conn->prepare("UPDATE movimientos_caja SET monto = ?, fecha = ?, concepto = ? WHERE id = ?")
                ->execute([$monto, $fecha, $concepto, $movId]);

            historialInsert('cuentas_bancarias', $mov['cuenta_bancaria_id'], 'editado_movimiento', $movId, $montoAnterior, "Motivo: {$motivo}. Monto: \${$montoAnterior} → \${$monto}", $conn);
            $conn->commit();

            $stmtSaldo = $conn->prepare("SELECT saldo FROM cuentas_bancarias WHERE id = ?");
            $stmtSaldo->execute([$mov['cuenta_bancaria_id']]);
            $nuevoSaldo = (float)$stmtSaldo->fetchColumn();
            jsonResponse('success', 'Movimiento actualizado. Saldo ajustado.', ['nuevo_saldo' => $nuevoSaldo]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── CREAR / ACTUALIZAR (CRUD estándar) ──
    $id           = $_POST['id'] ?? null;
    $nombre       = sanitizeString($_POST['nombre'] ?? '', 100);
    $banco        = sanitizeString($_POST['banco'] ?? '', 100);
    $tipo         = sanitizeString($_POST['tipo'] ?? $_POST['tipo_cuenta'] ?? '', 50);
    $numeroCuenta = sanitizeString($_POST['numero_cuenta'] ?? '', 50);
    $saldo        = normalizeNullableDecimal($_POST['saldo'] ?? $_POST['saldo_inicial'] ?? null);
    $detalles     = $_POST['detalles'] ?? '';

    requireFields($_POST, ['nombre', 'banco']);

    $data = [
        ':nombre'        => $nombre,
        ':banco'         => $banco,
        ':tipo'          => $tipo,
        ':numero_cuenta' => $numeroCuenta,
        ':saldo'         => $saldo,
        ':detalles'      => $detalles,
    ];

    try {
        $conn->beginTransaction();
        if ($id) {
            $sql = "UPDATE cuentas_bancarias SET 
                    nombre=:nombre, banco=:banco, tipo=:tipo, numero_cuenta=:numero_cuenta, saldo=:saldo, detalles=:detalles 
                    WHERE id=:id";
            $data[':id'] = $id;
            $conn->prepare($sql)->execute($data);
            $record_id = $id;
            $msg = 'Actualizado exitosamente.';
        } else {
            $sql = "INSERT INTO cuentas_bancarias 
                    (nombre, banco, tipo, numero_cuenta, saldo, detalles) 
                    VALUES 
                    (:nombre, :banco, :tipo, :numero_cuenta, :saldo, :detalles)";
            $conn->prepare($sql)->execute($data);
            $record_id = (int)$conn->lastInsertId();
            $msg = 'Guardado exitosamente.';
        }

        if (!empty($_FILES['archivos']['name'][0])) {
            uploadMultimedia($_FILES['archivos'], 'cuentas_bancarias', $record_id, $conn);
        }

        historialInsert('cuentas_bancarias', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
        $conn->commit();
        jsonResponse('success', $msg, ['id' => $record_id]);
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}
?>
