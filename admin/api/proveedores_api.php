<?php
// ============================================================================
// proveedores_api.php — CRUD Proveedores
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['guardar', 'eliminar'];
if (in_array($action, $writeActions)) {
    requirePerm('proveedores:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;

    // ── Artículos del proveedor ──
    if ($action === 'articulos' && isset($_GET['proveedor_id'])) {
        try {
            $pid = (int)$_GET['proveedor_id'];
                $stmt = $conn->prepare(
                    "SELECT ap.id, ap.articulo_id, ap.precio_costo, ap.tiempo_entrega, ap.notas,
                            a.nombre, a.stock, a.valor_venta
                     FROM articulo_proveedor ap
                     JOIN articulos a ON ap.articulo_id = a.id
                     WHERE ap.proveedor_id = ?
                     ORDER BY a.nombre ASC"
                );
                $stmt->execute([$pid]);
                jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    // ── Buscar artículos por nombre (auto-sugerir) ──
    if ($action === 'buscar_articulo') {
        try {
            $q = '%' . ($_GET['q'] ?? '') . '%';
            $stmt = $conn->prepare(
                "SELECT a.id, a.nombre, a.stock, a.valor_venta,
                        (SELECT COUNT(*) FROM articulo_proveedor WHERE articulo_id = a.id) AS num_proveedores
                 FROM articulos a
                 WHERE a.nombre LIKE ?
                 ORDER BY a.nombre ASC LIMIT 20"
            );
            $stmt->execute([$q]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM proveedores WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $rec['archivos'] = getMultimedia('proveedores', (int)$id, $conn);
            // Artículos asociados (resiliente si la tabla no existe aún)
            try {
             $stmtArt = $conn->prepare(
                    "SELECT ap.id, ap.articulo_id, ap.precio_costo, ap.tiempo_entrega, ap.notas,
                            a.nombre, a.stock, a.valor_venta
                     FROM articulo_proveedor ap
                     JOIN articulos a ON ap.articulo_id = a.id
                     WHERE ap.proveedor_id = ?
                     ORDER BY a.nombre ASC"
                );
                $stmtArt->execute([$id]);
                $rec['articulos'] = $stmtArt->fetchAll();
            } catch (Exception $eArt) {
                $rec['articulos'] = [];
            }
            jsonResponse('success', 'OK', $rec);
        } else {
            $p  = paginationParams();
            $sw = buildSearchWhere(['nombre','rut','rubro','contacto_nombre'], $p['search']);
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM proveedores WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT pr.id, pr.nombre, pr.rut, pr.rubro, pr.telefono, pr.correo, pr.contacto_nombre, pr.creado,
                        (SELECT COALESCE(ruta_thumbnail, ruta_archivo) FROM archivos_multimedia WHERE entidad_tipo='proveedores' AND entidad_id=pr.id AND tipo_archivo='foto' ORDER BY id ASC LIMIT 1) AS thumb_url
                 FROM proveedores pr WHERE {$sw['where']}
                 ORDER BY pr.creado DESC, pr.nombre ASC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
            );
            $stmt->execute($sw['params']);
            paginatedResponse($stmt->fetchAll(), $total, $p);
        }
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

elseif ($method === 'POST') {
         // ── Agregar artículo al proveedor ──
        if ($action === 'add_articulo') {
            $proveedorId = (int)($_POST['proveedor_id'] ?? 0);
            $articuloId = (int)($_POST['articulo_id'] ?? 0);
            $precio = (float)($_POST['precio_costo'] ?? 0);
        $tiempo = sanitizeString($_POST['tiempo_entrega'] ?? '', 50);
        $notas = sanitizeString($_POST['notas'] ?? '', 255);
        if (!$proveedorId || !$articuloId) jsonResponse('error', 'proveedor_id y articulo_id requeridos', null, 422);
        try {
            $conn->prepare(
                "INSERT INTO articulo_proveedor (proveedor_id, articulo_id, precio_costo, tiempo_entrega, notas)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE precio_costo = VALUES(precio_costo),
                                         tiempo_entrega = VALUES(tiempo_entrega),
                                         notas = VALUES(notas)"
            )->execute([$proveedorId, $articuloId, $precio ?: null, $tiempo ?: null, $notas ?: null]);
                jsonResponse('success', 'Artículo asociado', ['id' => (int)$conn->lastInsertId()]);
            } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
            exit;
        }

        // ── Eliminar asociación proveedor-artículo ──
        if ($action === 'delete_articulo') {
            $id = (int)($_POST['id'] ?? 0);
            if (!$id) jsonResponse('error', 'ID requerido', null, 422);
            try {
                $conn->prepare("DELETE FROM articulo_proveedor WHERE id = ?")->execute([$id]);
                jsonResponse('success', 'Artículo desasociado');
        } catch (Exception $e) { jsonResponse('error', $e->getMessage(), null, 500); }
        exit;
    }

    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            deleteMultimedia('proveedores', (int)$id, $conn);
            historialInsert('proveedores', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM proveedores WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado correctamente');
        } catch (Exception $e) {
            $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        $id     = $_POST['id'] ?? null;
        $rut    = sanitizeString($_POST['rut']    ?? '', 12);
        $correo = sanitizeString($_POST['correo'] ?? '', 150);

        requireFields($_POST, ['nombre']);
        if (!validateRutCL($rut))    jsonResponse('error', 'RUT inválido', null, 422);
        if (!validateEmail($correo)) jsonResponse('error', 'Email inválido', null, 422);

        $data = [
            ':nombre'            => sanitizeString($_POST['nombre'] ?? '', 100),
            ':rut'               => $rut ?: null,
            ':rubro'             => sanitizeString($_POST['rubro'] ?? '', 100),
            ':telefono'          => sanitizeString($_POST['telefono'] ?? '', 20),
            ':correo'            => $correo ?: null,
            ':direccion'         => sanitizeString($_POST['direccion'] ?? '', 255),
            ':sitio_web'         => sanitizeString($_POST['sitio_web'] ?? '', 255),
            ':contacto_nombre'   => sanitizeString($_POST['contacto_nombre'] ?? '', 100),
            ':contacto_telefono' => sanitizeString($_POST['contacto_telefono'] ?? '', 20),
            ':observaciones'     => $_POST['observaciones'] ?? '',
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $sql = "UPDATE proveedores SET
                    nombre=:nombre, rut=:rut, rubro=:rubro, telefono=:telefono,
                    correo=:correo, direccion=:direccion, sitio_web=:sitio_web,
                    contacto_nombre=:contacto_nombre, contacto_telefono=:contacto_telefono,
                    observaciones=:observaciones WHERE id=:id";
                $data[':id'] = $id;
                $conn->prepare($sql)->execute($data);
                $record_id = $id;
                $msg = 'Actualizado exitosamente.';
            } else {
                $sql = "INSERT INTO proveedores
                    (nombre, rut, rubro, telefono, correo, direccion, sitio_web,
                     contacto_nombre, contacto_telefono, observaciones)
                    VALUES
                    (:nombre, :rut, :rubro, :telefono, :correo, :direccion, :sitio_web,
                     :contacto_nombre, :contacto_telefono, :observaciones)";
                $conn->prepare($sql)->execute($data);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Guardado exitosamente.';
            }
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'proveedores', $record_id, $conn);
            }
            historialInsert('proveedores', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}