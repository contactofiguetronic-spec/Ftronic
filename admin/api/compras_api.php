<?php
// ============================================================================
// compras_api.php — CRUD Egresos (dinero que sale)
// Fuentes: compras manuales, compras rápidas, pagos directos, pagos a plazos,
//          órdenes de compra recibidas
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('compras:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $fuente = $_GET['fuente'] ?? null;

    // ── Detalle por ID ──
    if ($id && $fuente) {
        try {
            $rec = null;
            if ($fuente === 'manual') {
                $stmt = $conn->prepare(
                    "SELECT c.*, p.nombre AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                            'manual' AS fuente
                     FROM compras c
                     LEFT JOIN proveedores p ON c.proveedor_id = p.id
                     LEFT JOIN cuentas_bancarias cb ON c.cuenta_bancaria_id = cb.id
                     WHERE c.id = ?"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
                if ($rec) $rec['archivos'] = getMultimedia('compras', (int)$id, $conn);
            } elseif ($fuente === 'rapida') {
                $stmt = $conn->prepare(
                    "SELECT cr.*, CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS empleado_nombre,
                            cb.nombre AS cuenta_nombre, cb.banco, p.nombre AS proveedor_nombre,
                            'rapida' AS fuente
                     FROM compras_rapidas cr
                     LEFT JOIN empleados e ON cr.empleado_responsable_id = e.id
                     LEFT JOIN cuentas_bancarias cb ON cr.cuenta_bancaria_id = cb.id
                     LEFT JOIN proveedores p ON cr.proveedor_id = p.id
                     WHERE cr.id = ?"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
                if ($rec) $rec['archivos'] = getMultimedia('compras_rapidas', (int)$id, $conn);
            } elseif ($fuente === 'pago_directo') {
                $stmt = $conn->prepare(
                    "SELECT pg.*, cb.nombre AS cuenta_nombre, cb.banco,
                            'pago_directo' AS fuente
                     FROM pagos pg
                     LEFT JOIN cuentas_bancarias cb ON pg.cuenta_bancaria_id = cb.id
                     WHERE pg.id = ? AND pg.entidad_tipo = 'directo'"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
            } elseif ($fuente === 'pago_plazo') {
                $stmt = $conn->prepare(
                    "SELECT pp.*, cb.nombre AS cuenta_nombre, cb.banco,
                            'pago_plazo' AS fuente
                     FROM pagos_plazos pp
                     LEFT JOIN cuentas_bancarias cb ON pp.cuenta_bancaria_id = cb.id
                     WHERE pp.id = ?"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
            } elseif ($fuente === 'orden_compra') {
                $stmt = $conn->prepare(
                    "SELECT oc.*, pr.nombre AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                            'orden_compra' AS fuente
                     FROM orden_compra oc
                     LEFT JOIN proveedores pr ON oc.proveedor_id = pr.id
                     LEFT JOIN cuentas_bancarias cb ON oc.cuenta_bancaria_id = cb.id
                     WHERE oc.id = ?"
                );
                $stmt->execute([$id]);
                $rec = $stmt->fetch();
                if ($rec) {
                    $stmtItems = $conn->prepare("SELECT * FROM orden_compra_items WHERE orden_compra_id = ? ORDER BY id");
                    $stmtItems->execute([$id]);
                    $rec['items'] = $stmtItems->fetchAll();
                    $rec['archivos'] = getMultimedia('orden_compra', (int)$id, $conn);
                }
            }
            if ($rec) jsonResponse('success', 'OK', $rec);
            jsonResponse('error', 'No encontrado', null, 404);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Listado unificado de EGRESOS ──
    try {
        $p = paginationParams();
        $search = $p['search'];
        $per_page = (int)$p['per_page'];
        $page = (int)$p['page'];

        $allItems = [];

        // 1) Compras manuales
        $whereManual = "1=1";
        $paramsManual = [];
        if ($search) {
            $like = '%' . $search . '%';
            $whereManual = "(c.nombre LIKE ? OR c.numero_documento LIKE ? OR p.nombre LIKE ?)";
            $paramsManual = [$like, $like, $like];
        }
        $stmtM = $conn->prepare(
            "SELECT c.id, c.nombre, c.fecha, c.valor, c.forma_pago, c.numero_documento,
                    c.estado_pago, c.fecha_vencimiento, c.descripcion, c.creado,
                    p.nombre AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                    'manual' AS fuente
             FROM compras c
             LEFT JOIN proveedores p ON c.proveedor_id = p.id
             LEFT JOIN cuentas_bancarias cb ON c.cuenta_bancaria_id = cb.id
             WHERE {$whereManual}
             ORDER BY c.fecha DESC, c.creado DESC"
        );
        $stmtM->execute($paramsManual);
        foreach ($stmtM->fetchAll() as $row) $allItems[] = $row;

        // 2) Compras rápidas
        $whereRapida = "1=1";
        $paramsRapida = [];
        if ($search) {
            $like = '%' . $search . '%';
            $whereRapida = "(cr.nombre LIKE ? OR cr.lugar_compra LIKE ? OR cr.detalle LIKE ? OR pr.nombre LIKE ?)";
            $paramsRapida = [$like, $like, $like, $like];
        }
        $stmtR = $conn->prepare(
            "SELECT cr.id, cr.nombre, cr.fecha, cr.valor, cr.tipo_pago AS forma_pago,
                    NULL AS numero_documento,
                    'Pagado' AS estado_pago, NULL AS fecha_vencimiento, cr.detalle AS descripcion, cr.creado,
                    pr.nombre AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                    'rapida' AS fuente
             FROM compras_rapidas cr
             LEFT JOIN proveedores pr ON cr.proveedor_id = pr.id
             LEFT JOIN cuentas_bancarias cb ON cr.cuenta_bancaria_id = cb.id
             WHERE {$whereRapida}
             ORDER BY cr.fecha DESC, cr.creado DESC"
        );
        $stmtR->execute($paramsRapida);
        foreach ($stmtR->fetchAll() as $row) $allItems[] = $row;

        // 3) Pagos directos (egresos)
        $whereDirecto = "pg.entidad_tipo = 'directo'";
        $paramsDirecto = [];
        if ($search) {
            $like = '%' . $search . '%';
            $whereDirecto = "pg.entidad_tipo = 'directo' AND (pg.concepto LIKE ? OR pg.receptor LIKE ? OR pg.observacion LIKE ?)";
            $paramsDirecto = [$like, $like, $like];
        }
        $stmtD = $conn->prepare(
            "SELECT pg.id, pg.concepto AS nombre, pg.fecha, pg.monto AS valor, pg.forma_pago,
                    NULL AS numero_documento, 'Pagado' AS estado_pago, NULL AS fecha_vencimiento,
                    pg.observacion AS descripcion, pg.creado,
                    pg.receptor AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                    'pago_directo' AS fuente
             FROM pagos pg
             LEFT JOIN cuentas_bancarias cb ON pg.cuenta_bancaria_id = cb.id
             WHERE {$whereDirecto}
             ORDER BY pg.fecha DESC, pg.creado DESC"
        );
        $stmtD->execute($paramsDirecto);
        foreach ($stmtD->fetchAll() as $row) $allItems[] = $row;

        // 4) Pagos a plazos
        $wherePlazo = "1=1";
        $paramsPlazo = [];
        if ($search) {
            $like = '%' . $search . '%';
            $wherePlazo = "(pp.concepto LIKE ? OR pp.receptor LIKE ? OR pp.observacion LIKE ?)";
            $paramsPlazo = [$like, $like, $like];
        }
        $stmtP = $conn->prepare(
            "SELECT pp.id, pp.concepto AS nombre, pp.fecha_pago AS fecha, pp.monto AS valor,
                    NULL AS forma_pago, NULL AS numero_documento,
                    CASE pp.estado WHEN 'pagado' THEN 'Pagado' WHEN 'pendiente' THEN 'Pendiente' ELSE 'Cancelado' END AS estado_pago,
                    pp.fecha_pago AS fecha_vencimiento, pp.descripcion, pp.creado,
                    pp.receptor AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                    'pago_plazo' AS fuente
             FROM pagos_plazos pp
             LEFT JOIN cuentas_bancarias cb ON pp.cuenta_bancaria_id = cb.id
             WHERE {$wherePlazo}
             ORDER BY pp.fecha_pago DESC, pp.creado DESC"
        );
        $stmtP->execute($paramsPlazo);
        foreach ($stmtP->fetchAll() as $row) $allItems[] = $row;

        // 5) Órdenes de compra recibidas/completadas
        $whereOC = "oc.estado IN ('recibida','recibida_parcial','completada')";
        $paramsOC = [];
        if ($search) {
            $like = '%' . $search . '%';
            $whereOC = "oc.estado IN ('recibida','recibida_parcial','completada') AND (oc.folio LIKE ? OR pr.nombre LIKE ? OR oc.observaciones LIKE ?)";
            $paramsOC = [$like, $like, $like];
        }
        $stmtOC = $conn->prepare(
            "SELECT oc.id, COALESCE(oc.folio, CONCAT('OC-', LPAD(oc.id, 5, '0'))) AS nombre,
                    oc.fecha_emision AS fecha, oc.total AS valor, NULL AS forma_pago,
                    NULL AS numero_documento,
                    CASE oc.estado WHEN 'recibida' THEN 'Recibida' WHEN 'recibida_parcial' THEN 'Parcial' ELSE 'Completada' END AS estado_pago,
                    oc.fecha_entrega_estimada AS fecha_vencimiento,                     oc.observaciones AS descripcion, oc.created_at AS creado,
                    pr.nombre AS proveedor_nombre, cb.nombre AS cuenta_nombre, cb.banco,
                    'orden_compra' AS fuente
             FROM orden_compra oc
             LEFT JOIN proveedores pr ON oc.proveedor_id = pr.id
             LEFT JOIN cuentas_bancarias cb ON oc.cuenta_bancaria_id = cb.id
             WHERE {$whereOC}
             ORDER BY oc.fecha_emision DESC, oc.created_at DESC"
        );
        $stmtOC->execute($paramsOC);
        foreach ($stmtOC->fetchAll() as $row) $allItems[] = $row;

        // Ordenar todo por fecha DESC
        usort($allItems, function ($a, $b) {
            $fa = $a['fecha'] ?? $a['creado'] ?? '';
            $fb = $b['fecha'] ?? $b['creado'] ?? '';
            return strcmp($fb, $fa);
        });

        // Paginación manual
        $total = count($allItems);
        $offset = ($page - 1) * $per_page;
        $items = array_slice($allItems, $offset, $per_page);

        paginatedResponse($items, $total, $p);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
    exit;
}

elseif ($method === 'POST') {

    // ── Eliminar compra manual ──
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        $fuente = $_POST['fuente'] ?? 'manual';
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);

        try {
            $conn->beginTransaction();

            if ($fuente === 'rapida') {
                // Revert movimientos_caja
                $stmtMov = $conn->prepare("SELECT cuenta_bancaria_id, valor, fecha, tipo_pago FROM compras_rapidas WHERE id = ?");
                $stmtMov->execute([$id]);
                $cr = $stmtMov->fetch();
                if ($cr && $cr['cuenta_bancaria_id']) {
                    registrarMovimientoCaja('ingreso', (float)$cr['valor'], 'compra_rapida_revert', (int)$id, $cr['fecha'], $cr['tipo_pago'], 'Reversión compra rápida #' . $id, $conn, (int)$cr['cuenta_bancaria_id']);
                }
                deleteMultimedia('compras_rapidas', (int)$id, $conn);
                historialInsert('compras_rapidas', $id, 'eliminado', null, null, null, $conn);
                $conn->prepare("DELETE FROM compras_rapidas WHERE id = ?")->execute([$id]);
            } else {
                // Manual: revert pagos y movimientos
                $stmtCb = $conn->prepare("SELECT cuenta_bancaria_id FROM compras WHERE id=?");
                $stmtCb->execute([$id]);
                $cbRow = $stmtCb->fetch();
                $cuentaId = $cbRow ? (int)$cbRow['cuenta_bancaria_id'] : null;
                if ($cuentaId) {
                    $stmtPagos = $conn->prepare("SELECT monto, fecha, forma_pago FROM pagos WHERE entidad_tipo='compra' AND entidad_id=?");
                    $stmtPagos->execute([$id]);
                    $pagos = $stmtPagos->fetchAll();
                    foreach ($pagos as $pago) {
                        registrarMovimientoCaja('ingreso', (float)$pago['monto'], 'compra_pago_revertido', (int)$id, $pago['fecha'], $pago['forma_pago'], 'Reversión por eliminación de compra #' . $id, $conn, $cuentaId);
                    }
                    $conn->prepare("DELETE FROM pagos WHERE entidad_tipo='compra' AND entidad_id=?")->execute([$id]);
                }
                historialInsert('compras', $id, 'eliminado', null, null, null, $conn);
                deleteMultimedia('compras', (int)$id, $conn);
                $conn->prepare("DELETE FROM compras WHERE id = ?")->execute([$id]);
            }

            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Registrar pago parcial ──
    if ($action === 'registrar_pago') {
        requireFields($_POST, ['entidad_id', 'monto', 'fecha', 'forma_pago']);
        try {
            $conn->beginTransaction();
            // Verificar duplicado
            $stmtChk = $conn->prepare("SELECT id FROM pagos WHERE entidad_tipo='compra' AND entidad_id=? AND monto=? AND fecha=?");
            $stmtChk->execute([$_POST['entidad_id'], $_POST['monto'], $_POST['fecha']]);
            if ($stmtChk->fetch()) {
                $conn->rollBack();
                jsonResponse('error', 'Ya existe un pago registrado para esta compra con el mismo monto y fecha.', null, 409);
            }
            $stmt = $conn->prepare("INSERT INTO pagos (entidad_tipo, entidad_id, monto, fecha, forma_pago, observacion) VALUES ('compra', :entidad_id, :monto, :fecha, :forma_pago, :observacion)");
            $stmt->execute([
                ':entidad_id' => $_POST['entidad_id'],
                ':monto'      => $_POST['monto'],
                ':fecha'      => $_POST['fecha'],
                ':forma_pago' => $_POST['forma_pago'],
                ':observacion'=> $_POST['observacion'] ?? ''
            ]);
            $pagoId = (int)$conn->lastInsertId();
            $stmtCb = $conn->prepare("SELECT cuenta_bancaria_id FROM compras WHERE id=?");
            $stmtCb->execute([$_POST['entidad_id']]);
            $cbRow = $stmtCb->fetch();
            $cuentaId = $cbRow ? (int)$cbRow['cuenta_bancaria_id'] : null;
            registrarMovimientoCaja('egreso', (float)$_POST['monto'], 'compra_pago', (int)$_POST['entidad_id'], $_POST['fecha'], $_POST['forma_pago'], 'Pago de compra #' . $_POST['entidad_id'], $conn, $cuentaId);
            historialInsert('pagos', $pagoId, 'creado', null, null, 'Pago registrado para compra #' . $_POST['entidad_id'], $conn);
            // Auto-actualizar estado_pago
            $stmtT = $conn->prepare("SELECT valor, COALESCE(SUM(p.monto),0) AS pagado FROM compras c LEFT JOIN pagos p ON p.entidad_tipo='compra' AND p.entidad_id=c.id WHERE c.id=? GROUP BY c.id");
            $stmtT->execute([$_POST['entidad_id']]);
            $row = $stmtT->fetch();
            if ($row && (float)$row['pagado'] >= (float)$row['valor']) {
                $conn->prepare("UPDATE compras SET estado_pago='Pagado' WHERE id=?")->execute([$_POST['entidad_id']]);
            } elseif ($row && (float)$row['pagado'] > 0) {
                $conn->prepare("UPDATE compras SET estado_pago='Parcial' WHERE id=?")->execute([$_POST['entidad_id']]);
            }
            $conn->commit();
            jsonResponse('success', 'Pago registrado correctamente');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── Insert / Update compra manual ──
    $id = $_POST['id'] ?? null;
    requireFields($_POST, ['nombre', 'valor']);

    $data = [
        ':nombre'             => sanitizeString($_POST['nombre'] ?? '', 150),
        ':proveedor_id'       => normalizeNullableInt($_POST['proveedor_id'] ?? null),
        ':fecha'              => $_POST['fecha'] ?: null,
        ':forma_pago'         => sanitizeString($_POST['forma_pago'] ?? '', 50),
        ':cuenta_bancaria_id' => normalizeNullableInt($_POST['cuenta_bancaria_id'] ?? null),
        ':valor'              => normalizeNullableDecimal($_POST['valor'] ?? null),
        ':numero_documento'   => sanitizeString($_POST['numero_documento'] ?? '', 100),
        ':descripcion'        => $_POST['descripcion'] ?? '',
        ':estado_pago'        => sanitizeString($_POST['estado_pago'] ?? 'Pendiente', 50),
        ':fecha_vencimiento'  => $_POST['fecha_vencimiento'] ?: null,
    ];

    try {
        $conn->beginTransaction();
        if ($id) {
            $sql = "UPDATE compras SET
                nombre=:nombre, proveedor_id=:proveedor_id, fecha=:fecha,
                forma_pago=:forma_pago, cuenta_bancaria_id=:cuenta_bancaria_id,
                valor=:valor, numero_documento=:numero_documento, descripcion=:descripcion,
                estado_pago=:estado_pago, fecha_vencimiento=:fecha_vencimiento
                WHERE id=:id";
            $data[':id'] = $id;
            $conn->prepare($sql)->execute($data);
            $record_id = $id;
            $msg = 'Actualizado exitosamente.';
        } else {
            $sql = "INSERT INTO compras
                (nombre, proveedor_id, fecha, forma_pago, cuenta_bancaria_id,
                 valor, numero_documento, descripcion, estado_pago, fecha_vencimiento)
                VALUES
                (:nombre, :proveedor_id, :fecha, :forma_pago, :cuenta_bancaria_id,
                 :valor, :numero_documento, :descripcion, :estado_pago, :fecha_vencimiento)";
            $conn->prepare($sql)->execute($data);
            $record_id = (int)$conn->lastInsertId();
            $msg = 'Guardado exitosamente.';
        }
        if (!empty($_FILES['archivos']['name'][0])) {
            uploadMultimedia($_FILES['archivos'], 'compras', $record_id, $conn);
        }
        historialInsert('compras', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
        $conn->commit();
        jsonResponse('success', $msg, ['id' => $record_id]);
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', $e->getMessage(), null, 500);
    }
    exit;
}

jsonResponse('error', 'Método no soportado', null, 405);
