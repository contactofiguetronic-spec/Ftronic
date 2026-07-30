<?php
// ============================================================================
// compras_rapidas_api.php — CRUD Compras Rápidas
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('compras_rapidas:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare(
                "SELECT cr.*,
                        CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS empleado_nombre,
                        cb.nombre AS cuenta_nombre,
                        p.nombre AS proveedor_nombre
                 FROM compras_rapidas cr
                 LEFT JOIN empleados e ON cr.empleado_responsable_id = e.id
                 LEFT JOIN cuentas_bancarias cb ON cr.cuenta_bancaria_id = cb.id
                 LEFT JOIN proveedores p ON cr.proveedor_id = p.id
                 WHERE cr.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('compras_rapidas', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['cr.nombre', 'cr.lugar_compra', 'cr.detalle', 'e.nombre'], $p['search'], 'cr.');
            $stmtC = $conn->prepare(
                "SELECT COUNT(*)
                 FROM compras_rapidas cr
                 LEFT JOIN empleados e ON cr.empleado_responsable_id = e.id
                 WHERE {$sw['where']}"
            );
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT cr.id, cr.fecha, cr.nombre, cr.lugar_compra, cr.detalle, cr.valor,
                        cr.tipo_pago, cr.creado, cr.proveedor_id,
                        CONCAT(e.nombre, ' ', COALESCE(e.apellido, '')) AS empleado_nombre,
                        cb.nombre AS cuenta_nombre,
                        p.nombre AS proveedor_nombre
                 FROM compras_rapidas cr
                 LEFT JOIN empleados e ON cr.empleado_responsable_id = e.id
                 LEFT JOIN cuentas_bancarias cb ON cr.cuenta_bancaria_id = cb.id
                 LEFT JOIN proveedores p ON cr.proveedor_id = p.id
                 WHERE {$sw['where']}
                 ORDER BY cr.fecha DESC, cr.creado DESC
                 LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($sw['params']);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

elseif ($method === 'POST') {
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
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
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id = $_POST['id'] ?? null;

        requireFields($_POST, ['nombre', 'valor']);

        $fecha = $_POST['fecha'] ?? date('Y-m-d');
        $valor = normalizeNullableDecimal($_POST['valor'] ?? 0);
        if ($valor <= 0) jsonResponse('error', 'El valor debe ser mayor a 0', null, 422);

        $data = [
            ':fecha'                    => $fecha,
            ':nombre'                   => sanitizeString($_POST['nombre'] ?? '', 150),
            ':lugar_compra'             => sanitizeString($_POST['lugar_compra'] ?? '', 150),
            ':detalle'                  => $_POST['detalle'] ?? '',
            ':valor'                    => $valor,
            ':empleado_responsable_id'  => normalizeNullableInt($_POST['empleado_responsable_id'] ?? null),
            ':proveedor_id'             => normalizeNullableInt($_POST['proveedor_id'] ?? null),
            ':tipo_pago'                => sanitizeString($_POST['tipo_pago'] ?? 'Efectivo', 50),
            ':cuenta_bancaria_id'       => normalizeNullableInt($_POST['cuenta_bancaria_id'] ?? null),
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE compras_rapidas SET
                    fecha=:fecha, nombre=:nombre, lugar_compra=:lugar_compra,
                    detalle=:detalle, valor=:valor,
                    empleado_responsable_id=:empleado_responsable_id,
                    proveedor_id=:proveedor_id,
                    tipo_pago=:tipo_pago, cuenta_bancaria_id=:cuenta_bancaria_id
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO compras_rapidas
                    (fecha, nombre, lugar_compra, detalle, valor,
                     empleado_responsable_id, proveedor_id, tipo_pago, cuenta_bancaria_id)
                    VALUES
                    (:fecha, :nombre, :lugar_compra, :detalle, :valor,
                     :empleado_responsable_id, :proveedor_id, :tipo_pago, :cuenta_bancaria_id)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
        $cuentaId = normalizeNullableInt($_POST['cuenta_bancaria_id'] ?? null);
        if (!$cuentaId) {
            // Fallback: use first available account
            $stmtDefault = $conn->query("SELECT id FROM cuentas_bancarias ORDER BY id ASC LIMIT 1");
            $defaultRow = $stmtDefault->fetch();
            $cuentaId = $defaultRow ? (int)$defaultRow['id'] : null;
        }
        if ($cuentaId && $valor > 0) {
            registrarMovimientoCaja('egreso', $valor, 'compra_rapida', $record_id, $fecha, $_POST['tipo_pago'] ?? 'Efectivo', 'Compra rápida: ' . ($_POST['nombre'] ?? ''), $conn, $cuentaId);
        }
            }
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'compras_rapidas', $record_id, $conn);
            }
            historialInsert('compras_rapidas', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
