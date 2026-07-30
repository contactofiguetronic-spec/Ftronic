<?php
// ============================================================================
// clientes_api.php — CRUD Clientes + Ficha Completa
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar', 'actualizar_documento'];
if (in_array($action, $writeActions)) {
    requirePerm('clientes:editar');
}

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;

    // ── Listar simple (para selects/dropdowns) ──
    if ($action === 'listar') {
        try {
            $stmt = $conn->prepare("SELECT id, nombre, apellido, rut, telefono, correo FROM clientes ORDER BY nombre ASC, apellido ASC");
            $stmt->execute();
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Acciones especiales para ficha completa ──
    if ($action === 'vehiculos' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT id, marca, modelo, anio, patente, vin, color, combustible, kilometraje,
                        cilindrada_motor, transmision, traccion, tipo_carroceria,
                        procedencia, disenoestructural, notas_tecnico, creado
                 FROM vehiculos WHERE cliente_id = ? ORDER BY creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'recepciones' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT r.id, r.folio, r.fecha, r.hora, r.eval_estado_general, r.eval_motivo_visita,
                        r.numero_orden_interna, r.asesor_taller, r.vehiculo_patente,
                        r.vehiculo_marca, r.vehiculo_modelo, r.foto_frontal, r.creado
                 FROM recepcion_unificada r WHERE r.cliente_id = ? ORDER BY r.fecha DESC, r.creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'presupuestos' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT p.id, p.estado, p.fecha, p.valor_total, p.requisito,
                        v.patente, v.marca, v.modelo, p.creado
                 FROM presupuesto p
                 LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
                 WHERE p.cliente_id = ? ORDER BY p.creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'ordenes_trabajo' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT ot.id, ot.estado, ot.vigencia, ot.trabajo_ejecutar,
                        v.patente, v.marca, v.modelo, ot.creado
                 FROM orden_trabajo ot
                 LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
                 WHERE ot.cliente_id = ? ORDER BY ot.creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'ventas' && $id) {
        try {
            $stmt = $conn->prepare(
                "SELECT id, nombre, valor, valor_total, forma_pago, estado_pago, fecha, numero_documento, creado
                 FROM ventas WHERE cliente_id = ? ORDER BY creado DESC"
            );
            $stmt->execute([$id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'resumen' && $id) {
        try {
            $resumen = [];
            // Vehículos
            $stmt = $conn->prepare("SELECT COUNT(*) FROM vehiculos WHERE cliente_id = ?");
            $stmt->execute([$id]);
            $resumen['vehiculos'] = (int)$stmt->fetchColumn();
            // Recepciones
            $stmt = $conn->prepare("SELECT COUNT(*) FROM recepcion_unificada WHERE cliente_id = ?");
            $stmt->execute([$id]);
            $resumen['recepciones'] = (int)$stmt->fetchColumn();
            // Presupuestos
            $stmt = $conn->prepare("SELECT COUNT(*) FROM presupuesto WHERE cliente_id = ?");
            $stmt->execute([$id]);
            $resumen['presupuestos'] = (int)$stmt->fetchColumn();
            // OTs
            $stmt = $conn->prepare("SELECT COUNT(*) FROM orden_trabajo WHERE cliente_id = ?");
            $stmt->execute([$id]);
            $resumen['ordenes_trabajo'] = (int)$stmt->fetchColumn();
            // Ventas total
            $stmt = $conn->prepare("SELECT COALESCE(SUM(valor),0) FROM ventas WHERE cliente_id = ?");
            $stmt->execute([$id]);
            $resumen['total_ventas'] = (float)$stmt->fetchColumn();
            jsonResponse('success', 'OK', $resumen);
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Lectura normal ──
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM clientes WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('clientes', (int)$id, $conn);
            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['nombre','apellido','rut','telefono'], $p['search']);
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM clientes WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT cl.id, cl.nombre, cl.apellido, cl.rut, cl.telefono, cl.correo, cl.creado,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='clientes' AND entidad_id=cl.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM clientes cl WHERE {$sw['where']}
                 ORDER BY cl.creado DESC, cl.nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
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

    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            deleteMultimedia('clientes', (int)$id, $conn);
            historialInsert('clientes', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM clientes WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id      = $_POST['id'] ?? null;
        $nombre  = sanitizeString($_POST['nombre']  ?? '', 100);
        $apellido = sanitizeString($_POST['apellido'] ?? '', 100);
        $rut     = sanitizeString($_POST['rut']     ?? '', 12);
        $telefono = sanitizeString($_POST['telefono'] ?? '', 20);
        $correo  = sanitizeString($_POST['correo']  ?? '', 150);

        requireFields($_POST, ['nombre']);
        if ($correo && !validateEmail($correo)) jsonResponse('error', 'Email inválido', null, 422);

        $data = [
            ':nombre'             => $nombre,
            ':apellido'           => $apellido,
            ':rut'                => $rut ?: null,
            ':telefono'           => sanitizeString($_POST['telefono'] ?? '', 20),
            ':correo'             => $correo ?: null,
            ':domicilio'          => sanitizeString($_POST['domicilio'] ?? '', 255),
            ':banco'              => sanitizeString($_POST['banco'] ?? '', 100),
            ':cuentabancaria'     => sanitizeString($_POST['cuentabancaria'] ?? '', 50),
            ':facebook'           => sanitizeString($_POST['facebook'] ?? '', 150),
            ':instagram'          => sanitizeString($_POST['instagram'] ?? '', 150),
            ':detalles_personales'=> $_POST['detalles_personales'] ?? '',
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE clientes SET
                    nombre=:nombre, apellido=:apellido, rut=:rut, telefono=:telefono,
                    correo=:correo, domicilio=:domicilio, banco=:banco,
                    cuentabancaria=:cuentabancaria, facebook=:facebook, instagram=:instagram,
                    detalles_personales=:detalles_personales
                    WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO clientes
                    (nombre, apellido, rut, telefono, correo, domicilio, banco,
                     cuentabancaria, facebook, instagram, detalles_personales)
                    VALUES
                    (:nombre, :apellido, :rut, :telefono, :correo, :domicilio, :banco,
                     :cuentabancaria, :facebook, :instagram, :detalles_personales)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'clientes', $record_id, $conn);
            }
            historialInsert('clientes', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, [
                'id' => $record_id,
                'nombre' => $nombre,
                'apellido' => $apellido,
                'rut' => $rut,
                'telefono' => $_POST['telefono'] ?? ''
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
