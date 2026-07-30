<?php
require_once '../includes/conexion.php';
requireAuth();

$action = $_REQUEST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$writeActions = ['insert','update','delete','update_preparacion','publicar','despublicar','crear_kit','agregar_kit_item','quitar_kit_item','orphan_part','crear_grupo','guardar_grupo','eliminar_grupo','asignar_grupo','deshabilitar_pieza','habilitar_pieza'];

if ($method === 'POST') {
    requirePerm('desarme_automotriz:editar');
}

if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    $desarme_id = $_GET['desarme_id'] ?? null;

    // ── GET: listar fotos multimedia de una pieza ──
    if ($action === 'listar_fotos') {
        $item_id = (int)($_GET['item_id'] ?? 0);
        if (!$item_id) jsonResponse('error', 'item_id requerido', null, 422);
        try {
            $stmt = $conn->prepare(
                "SELECT * FROM archivos_multimedia
                 WHERE entidad_tipo = 'desarme_pieza' AND entidad_id = ?
                 ORDER BY campo_key, id"
            );
            $stmt->execute([$item_id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── GET: listar hijos de un grupo ──
    if ($action === 'listar_hijos_grupo') {
        $padre_id = (int)($_GET['padre_id'] ?? 0);
        if (!$padre_id) jsonResponse('error', 'padre_id requerido', null, 422);
        try {
            $stmt = $conn->prepare(
                "SELECT di.*, p.code AS master_code, p.nombre AS master_nombre
                 FROM desarme_items di
                 LEFT JOIN desarme_maestro_piezas p ON di.maestro_pieza_id = p.id
                 JOIN desarme_items_grupo dig ON dig.id_hijo = di.id
                 WHERE dig.id_padre = ?
                 ORDER BY di.categoria, di.nombre_pieza"
            );
            $stmt->execute([$padre_id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── GET: piezas deshabilitadas para un desarme ──
    if ($action === 'listar_deshabilitadas') {
        $desarme_id = (int)($_GET['desarme_id'] ?? 0);
        if (!$desarme_id) jsonResponse('error', 'desarme_id requerido', null, 422);
        try {
            $stmt = $conn->prepare(
                "SELECT dpd.maestro_pieza_id, dpd.motivo, p.code, p.nombre, p.categoria
                 FROM desarme_piezas_deshabilitadas dpd
                 JOIN desarme_maestro_piezas p ON dpd.maestro_pieza_id = p.id
                 WHERE dpd.desarme_id = ?"
            );
            $stmt->execute([$desarme_id]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── GET: obtener pieza por ID (con hijos si es grupo) ──
    if ($id) {
        try {
            $stmt = $conn->prepare(
                "SELECT di.*,
                        p.code AS master_code, p.nombre AS master_nombre,
                        p.categoria AS master_categoria, p.subsistema AS master_subsistema,
                        art.stock AS articulo_stock, art.valor_venta AS articulo_precio
                 FROM desarme_items di
                 LEFT JOIN desarme_maestro_piezas p ON di.maestro_pieza_id = p.id
                 LEFT JOIN articulos art ON di.articulo_id = art.id
                 WHERE di.id = ?"
            );
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);

            $stmtP = $conn->prepare("SELECT * FROM desarme_preparacion WHERE desarme_item_id = ?");
            $stmtP->execute([$id]);
            $rec['preparacion'] = $stmtP->fetch();

            // Si es grupo, incluir hijos
            if ($rec['es_grupo']) {
                $stmtH = $conn->prepare(
                    "SELECT di.*, p.code AS master_code
                     FROM desarme_items di
                     LEFT JOIN desarme_maestro_piezas p ON di.maestro_pieza_id = p.id
                     JOIN desarme_items_grupo dig ON dig.id_hijo = di.id
                     WHERE dig.id_padre = ?"
                );
                $stmtH->execute([$id]);
                $rec['hijos'] = $stmtH->fetchAll();
            }

            jsonResponse('success', 'OK', $rec);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── GET: listar piezas por desarme_id ──
    if ($desarme_id) {
        $filterFase = $_GET['fase'] ?? '';
        $filterCategoria = $_GET['categoria'] ?? '';
        $where = ['di.desarme_id = ?', 'di.es_grupo = 0'];
        $params = [$desarme_id];
        if ($filterFase) { $where[] = 'di.fase = ?'; $params[] = $filterFase; }
        if ($filterCategoria) { $where[] = 'di.categoria = ?'; $params[] = $filterCategoria; }
        $whereStr = implode(' AND ', $where);

        try {
            $stmt = $conn->prepare(
                "SELECT di.*, p.code AS master_code
                 FROM desarme_items di
                 LEFT JOIN desarme_maestro_piezas p ON di.maestro_pieza_id = p.id
                 WHERE {$whereStr}
                 ORDER BY di.categoria, di.nombre_pieza"
            );
            $stmt->execute($params);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    } else {
        jsonResponse('error', 'Parámetro requerido', null, 422);
    }

} elseif ($method === 'POST') {

    // ══════════════════════════════════════════════════════════════
    // INSERT — pieza individual
    // ══════════════════════════════════════════════════════════════
    if ($action === 'insert') {
        $desarme_id = (int)($_POST['desarme_id'] ?? 0);
        $maestro_pieza_id = normalizeNullableInt($_POST['maestro_pieza_id'] ?? null);
        $nombre_pieza = sanitizeString($_POST['nombre_pieza'] ?? '', 200);
        $code_pieza = sanitizeString($_POST['code_pieza'] ?? '', 20);
        $categoria = sanitizeString($_POST['categoria'] ?? '', 50);
        $subsistema = sanitizeString($_POST['subsistema'] ?? '', 100);
        $estado_pieza = sanitizeString($_POST['estado_pieza'] ?? 'no_verificado', 30);
        $numero_serie = sanitizeString($_POST['numero_serie'] ?? '', 200);
        $numero_parte = sanitizeString($_POST['numero_parte_fabricante'] ?? '', 200);
        $codigo_barras = sanitizeString($_POST['codigo_barras'] ?? '', 200);
        $ubicacion_vehiculo = sanitizeString($_POST['ubicacion_vehiculo'] ?? '', 200);
        $notas_tecnico = sanitizeString($_POST['notas_tecnico'] ?? '', 0);
        $tiempo_extraccion = normalizeNullableInt($_POST['tiempo_extraccion_min'] ?? null);

        if (!$desarme_id || !$nombre_pieza) jsonResponse('error', 'Datos requeridos', null, 422);

        // Auto-fill from master if available
        if ($maestro_pieza_id && !$categoria) {
            $stmtM = $conn->prepare("SELECT categoria, subsistema, code FROM desarme_maestro_piezas WHERE id = ?");
            $stmtM->execute([$maestro_pieza_id]);
            $master = $stmtM->fetch();
            if ($master) {
                $categoria = $master['categoria'];
                $subsistema = $master['subsistema'];
                $code_pieza = $master['code'];
            }
        }

        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare(
                "INSERT INTO desarme_items (desarme_id, maestro_pieza_id, nombre_pieza, code_pieza, categoria, subsistema, estado_pieza, numero_serie, numero_parte_fabricante, codigo_barras, ubicacion_vehiculo, notas_tecnico, tiempo_extraccion_min, es_grupo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
            );
            $stmt->execute([$desarme_id, $maestro_pieza_id, $nombre_pieza, $code_pieza ?: null, $categoria ?: null, $subsistema ?: null, $estado_pieza, $numero_serie ?: null, $numero_parte ?: null, $codigo_barras ?: null, $ubicacion_vehiculo ?: null, $notas_tecnico ?: null, $tiempo_extraccion]);
            $record_id = (int)$conn->lastInsertId();

            // Handle photos via multimedia system
            if (!empty($_FILES['archivos']['name'][0])) {
                require_once __DIR__ . '/../includes/helpers.php';
                $campo_keys = $_POST['campo_keys'] ?? null;
                uploadMultimedia($_FILES['archivos'], 'desarme_pieza', $record_id, $conn, $campo_keys);
            }

            // History
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'pieza_extraida', ?, ?)")
                 ->execute([$desarme_id, "Pieza extraída: {$nombre_pieza}" . ($code_pieza ? " ({$code_pieza})" : ''), $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Pieza registrada', ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // UPDATE — pieza individual
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'update') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $nombre_pieza = sanitizeString($_POST['nombre_pieza'] ?? '', 200);
        $code_pieza = sanitizeString($_POST['code_pieza'] ?? '', 20);
        $categoria = sanitizeString($_POST['categoria'] ?? '', 50);
        $estado_pieza = sanitizeString($_POST['estado_pieza'] ?? 'no_verificado', 30);
        $numero_serie = sanitizeString($_POST['numero_serie'] ?? '', 200);
        $numero_parte = sanitizeString($_POST['numero_parte_fabricante'] ?? '', 200);
        $codigo_barras = sanitizeString($_POST['codigo_barras'] ?? '', 200);
        $ubicacion_vehiculo = sanitizeString($_POST['ubicacion_vehiculo'] ?? '', 200);
        $notas_tecnico = sanitizeString($_POST['notas_tecnico'] ?? '', 0);

        try {
            $conn->prepare("UPDATE desarme_items SET nombre_pieza=?, code_pieza=?, categoria=?, estado_pieza=?, numero_serie=?, numero_parte_fabricante=?, codigo_barras=?, ubicacion_vehiculo=?, notas_tecnico=? WHERE id=?")
                 ->execute([$nombre_pieza ?: null, $code_pieza ?: null, $categoria ?: null, $estado_pieza, $numero_serie ?: null, $numero_parte ?: null, $codigo_barras ?: null, $ubicacion_vehiculo ?: null, $notas_tecnico ?: null, $id]);

            // Handle new photos via multimedia system
            if (!empty($_FILES['archivos']['name'][0])) {
                require_once __DIR__ . '/../includes/helpers.php';
                $campo_keys = $_POST['campo_keys'] ?? null;
                uploadMultimedia($_FILES['archivos'], 'desarme_pieza', (int)$id, $conn, $campo_keys);
            }

            jsonResponse('success', 'Actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // DELETE — pieza individual
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmtD = $conn->prepare("SELECT desarme_id, nombre_pieza FROM desarme_items WHERE id = ?");
            $stmtD->execute([$id]);
            $item = $stmtD->fetch();
            if ($item) {
                $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'pieza_eliminada', ?, ?)")
                     ->execute([$item['desarme_id'], "Pieza eliminada: {$item['nombre_pieza']}", $_SESSION['usuario_id'] ?? null]);
            }
            // Also delete multimedia
            $conn->prepare("DELETE FROM archivos_multimedia WHERE entidad_tipo = 'desarme_pieza' AND entidad_id = ?")->execute([$id]);
            $conn->prepare("DELETE FROM desarme_items WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminada');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // UPDATE_PREPARACION
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'update_preparacion') {
        $desarme_item_id = (int)($_POST['desarme_item_id'] ?? 0);
        if (!$desarme_item_id) jsonResponse('error', 'desarme_item_id requerido', null, 422);

        $inspeccion_visual = (int)($_POST['inspeccion_visual'] ?? 0);
        $prueba_funcionamiento = (int)($_POST['prueba_funcionamiento'] ?? 0);
        $limpieza_realizada = (int)($_POST['limpieza_realizada'] ?? 0);
        $reparacion_necesaria = (int)($_POST['reparacion_necesaria'] ?? 0);
        $resultado = sanitizeString($_POST['resultado_inspeccion'] ?? 'aprobado', 30);
        $especificaciones = sanitizeString($_POST['especificaciones_tecnicas'] ?? '', 0);
        $precio_estimado = normalizeNullableDecimal($_POST['precio_estimado'] ?? null);
        $precio_venta = normalizeNullableDecimal($_POST['precio_venta'] ?? null);
        $notas = sanitizeString($_POST['notas'] ?? '', 0);

        try {
            $conn->beginTransaction();
            // Upsert
            $stmt = $conn->prepare("SELECT id FROM desarme_preparacion WHERE desarme_item_id = ?");
            $stmt->execute([$desarme_item_id]);
            $exists = $stmt->fetch();

            if ($exists) {
                $conn->prepare("UPDATE desarme_preparacion SET inspeccion_visual=?, prueba_funcionamiento=?, limpieza_realizada=?, reparacion_necesaria=?, resultado_inspeccion=?, especificaciones_tecnicas=?, precio_estimado=?, precio_venta=?, notas=?, fecha_inspeccion=NOW() WHERE id=?")
                     ->execute([$inspeccion_visual, $prueba_funcionamiento, $limpieza_realizada, $reparacion_necesaria, $resultado, $especificaciones ?: null, $precio_estimado, $precio_venta, $notas ?: null, $exists['id']]);
            } else {
                $conn->prepare("INSERT INTO desarme_preparacion (desarme_item_id, inspeccion_visual, prueba_funcionamiento, limpieza_realizada, reparacion_necesaria, resultado_inspeccion, especificaciones_tecnicas, precio_estimado, precio_venta, notas, inspector_id, fecha_inspeccion) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())")
                     ->execute([$desarme_item_id, $inspeccion_visual, $prueba_funcionamiento, $limpieza_realizada, $reparacion_necesaria, $resultado, $especificaciones ?: null, $precio_estimado, $precio_venta, $notas ?: null, $_SESSION['usuario_id'] ?? null]);
            }

            // Update item phase
            $newPhase = $resultado === 'rechazado' ? 'extraida' : 'preparada';
            $conn->prepare("UPDATE desarme_items SET fase = ?, precio_venta = ? WHERE id = ?")->execute([$newPhase, $precio_venta, $desarme_item_id]);

            $conn->commit();
            jsonResponse('success', 'Preparación guardada');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // PUBLICAR
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'publicar') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT di.*, dp.precio_venta, dp.especificaciones_tecnicas
                                     FROM desarme_items di
                                     LEFT JOIN desarme_preparacion dp ON dp.desarme_item_id = di.id
                                     WHERE di.id = ?");
            $stmt->execute([$id]);
            $item = $stmt->fetch();
            if (!$item) jsonResponse('error', 'Pieza no encontrada', null, 404);

            $precio = $item['precio_venta'] ?? $item['precio_estimado'] ?? 0;
            $detalles = ($item['especificaciones_tecnicas'] ?? '') .
                        "\n\nCódigo Maestro: " . ($item['code_pieza'] ?? 'N/A') .
                        "\nCategoría: " . ($item['categoria'] ?? '') .
                        "\nSubsistema: " . ($item['subsistema'] ?? '') .
                        "\nNúmero de Serie: " . ($item['numero_serie'] ?? 'N/A') .
                        "\nNúmero de Parte: " . ($item['numero_parte_fabricante'] ?? 'N/A');

            $stmtA = $conn->prepare(
                "INSERT INTO articulos (nombre, tipo, marca, valor_venta, stock, stock_minimo, ubicacion, detalles)
                 VALUES (?, 'Repuesto', 'Desarme', ?, 1, 0, 'Desarme Automotriz', ?)"
            );
            $stmtA->execute([$item['nombre_pieza'], $precio, $detalles]);
            $articulo_id = (int)$conn->lastInsertId();

            $conn->prepare("UPDATE desarme_items SET articulo_id=?, estado_publicacion='publicada', fase='publicada' WHERE id=?")->execute([$articulo_id, $id]);

            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'pieza_publicada', ?, ?)")
                 ->execute([$item['desarme_id'], "Pieza publicada a venta: {$item['nombre_pieza']} (Art. #{$articulo_id})", $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Pieza publicada', ['articulo_id' => $articulo_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // DESPUBLICAR
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'despublicar') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->prepare("UPDATE desarme_items SET estado_publicacion='no_publicado', fase='preparada' WHERE id=?")->execute([$id]);
            jsonResponse('success', 'Despublicada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // CREAR_GRUPO — crea padre + hijos + vincula en puente
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'crear_grupo') {
        $desarme_id = (int)($_POST['desarme_id'] ?? 0);
        $nombre_grupo = sanitizeString($_POST['nombre_grupo'] ?? '', 200);
        $categoria = sanitizeString($_POST['categoria'] ?? '', 50);
        $hijos = $_POST['hijos'] ?? []; // [{maestro_pieza_id, nombre, code, subsistema, estado}]

        if (!$desarme_id || !$nombre_grupo) jsonResponse('error', 'Datos requeridos', null, 422);
        if (!is_array($hijos) || count($hijos) === 0) jsonResponse('error', 'Debe incluir al menos una pieza', null, 422);

        try {
            $conn->beginTransaction();

            // 1. Crear padre (es_grupo=1)
            $stmtP = $conn->prepare(
                "INSERT INTO desarme_items (desarme_id, nombre_pieza, code_pieza, categoria, estado_pieza, es_grupo, nombre_grupo)
                 VALUES (?, ?, NULL, ?, 'no_verificado', 1, ?)"
            );
            $stmtP->execute([$desarme_id, $nombre_grupo, $categoria ?: null, $nombre_grupo]);
            $padre_id = (int)$conn->lastInsertId();

            // 2. Crear hijos y vincular
            $hijos_creados = [];
            foreach ($hijos as $h) {
                $h_nombre = sanitizeString($h['nombre'] ?? '', 200);
                $h_code = sanitizeString($h['code'] ?? '', 20);
                $h_categoria = sanitizeString($h['categoria'] ?? $categoria, 50);
                $h_subsistema = sanitizeString($h['subsistema'] ?? '', 100);
                $h_estado = sanitizeString($h['estado'] ?? 'no_verificado', 30);
                $h_maestro = normalizeNullableInt($h['maestro_pieza_id'] ?? null);

                $stmtH = $conn->prepare(
                    "INSERT INTO desarme_items (desarme_id, maestro_pieza_id, nombre_pieza, code_pieza, categoria, subsistema, estado_pieza, es_grupo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
                );
                $stmtH->execute([$desarme_id, $h_maestro, $h_nombre, $h_code ?: null, $h_categoria ?: null, $h_subsistema ?: null, $h_estado]);
                $hijo_id = (int)$conn->lastInsertId();

                $conn->prepare("INSERT INTO desarme_items_grupo (id_padre, id_hijo) VALUES (?, ?)")->execute([$padre_id, $hijo_id]);
                $hijos_creados[] = ['id' => $hijo_id, 'nombre' => $h_nombre, 'code' => $h_code];
            }

            // History
            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'grupo_creado', ?, ?)")
                 ->execute([$desarme_id, "Grupo creado: {$nombre_grupo} (" . count($hijos_creados) . " piezas)", $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Grupo registrado', ['padre_id' => $padre_id, 'hijos' => $hijos_creados]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // GUARDAR_GRUPO — actualiza metadatos del padre
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'guardar_grupo') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $nombre_grupo = sanitizeString($_POST['nombre_grupo'] ?? '', 200);
        $categoria = sanitizeString($_POST['categoria'] ?? '', 50);
        $notas_tecnico = sanitizeString($_POST['notas_tecnico'] ?? '', 0);

        try {
            $conn->prepare("UPDATE desarme_items SET nombre_grupo=?, categoria=?, notas_tecnico=? WHERE id=? AND es_grupo=1")
                 ->execute([$nombre_grupo ?: null, $categoria ?: null, $notas_tecnico ?: null, $id]);
            jsonResponse('success', 'Grupo actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // ELIMINAR_GRUPO — elimina padre, libera hijos (quedan como piezas individuales)
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'eliminar_grupo') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            // Verificar que es grupo
            $stmt = $conn->prepare("SELECT desarme_id, nombre_grupo FROM desarme_items WHERE id = ? AND es_grupo = 1");
            $stmt->execute([$id]);
            $grupo = $stmt->fetch();
            if (!$grupo) jsonResponse('error', 'Grupo no encontrado', null, 404);

            // Los hijos se desvinculan por CASCADE en la FK de desarme_items_grupo
            $conn->prepare("DELETE FROM desarme_items WHERE id = ?")->execute([$id]);

            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'grupo_eliminado', ?, ?)")
                 ->execute([$grupo['desarme_id'], "Grupo eliminado: {$grupo['nombre_grupo']}", $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Grupo eliminado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // ASIGNAR_GRUPO — vincula pieza existente a un grupo padre
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'asignar_grupo') {
        $padre_id = (int)($_POST['padre_id'] ?? 0);
        $hijo_id = (int)($_POST['hijo_id'] ?? 0);
        if (!$padre_id || !$hijo_id) jsonResponse('error', 'Datos requeridos', null, 422);
        try {
            $conn->prepare("INSERT IGNORE INTO desarme_items_grupo (id_padre, id_hijo) VALUES (?, ?)")->execute([$padre_id, $hijo_id]);
            jsonResponse('success', 'Pieza asignada al grupo');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // KITS
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'crear_kit') {
        $desarme_id = (int)($_POST['desarme_id'] ?? 0);
        $nombre = sanitizeString($_POST['nombre'] ?? '', 200);
        $descripcion = sanitizeString($_POST['descripcion'] ?? '', 0);
        $precio_kit = normalizeNullableDecimal($_POST['precio_kit'] ?? null);
        if (!$desarme_id || !$nombre) jsonResponse('error', 'Datos requeridos', null, 422);
        try {
            $stmt = $conn->prepare("INSERT INTO desarme_kits (nombre, descripcion, precio_kit, desarme_id) VALUES (?,?,?,?)");
            $stmt->execute([$nombre, $descripcion ?: null, $precio_kit, $desarme_id]);
            jsonResponse('success', 'Kit creado', ['id' => (int)$conn->lastInsertId()]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'agregar_kit_item') {
        $kit_id = (int)($_POST['kit_id'] ?? 0);
        $desarme_item_id = (int)($_POST['desarme_item_id'] ?? 0);
        if (!$kit_id || !$desarme_item_id) jsonResponse('error', 'Datos requeridos', null, 422);
        try {
            $conn->prepare("INSERT IGNORE INTO desarme_kit_items (kit_id, desarme_item_id) VALUES (?, ?)")->execute([$kit_id, $desarme_item_id]);
            jsonResponse('success', 'Agregado al kit');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'quitar_kit_item') {
        $kit_id = (int)($_POST['kit_id'] ?? 0);
        $desarme_item_id = (int)($_POST['desarme_item_id'] ?? 0);
        if (!$kit_id || !$desarme_item_id) jsonResponse('error', 'Datos requeridos', null, 422);
        try {
            $conn->prepare("DELETE FROM desarme_kit_items WHERE kit_id=? AND desarme_item_id=?")->execute([$kit_id, $desarme_item_id]);
            jsonResponse('success', 'Removido del kit');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // ORPHAN_PART — crear maestro desde pieza extraída
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'orphan_part') {
        $desarme_item_id = (int)($_POST['desarme_item_id'] ?? 0);
        if (!$desarme_item_id) jsonResponse('error', 'desarme_item_id requerido', null, 422);
        try {
            $conn->beginTransaction();
            $stmt = $conn->prepare("SELECT * FROM desarme_items WHERE id = ?");
            $stmt->execute([$desarme_item_id]);
            $item = $stmt->fetch();
            if (!$item) jsonResponse('error', 'Pieza no encontrada', null, 404);

            $prefix = strtoupper(substr($item['categoria'] ?? 'GEN', 0, 3));
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM desarme_maestro_piezas WHERE code LIKE ?");
            $stmtC->execute([$prefix . '-%']);
            $nextNum = (int)$stmtC->fetchColumn() + 1;
            $code = $prefix . '-' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);

            $conn->prepare("INSERT INTO desarme_maestro_piezas (code, nombre, categoria, subsistema, tipo) VALUES (?, ?, ?, ?, 'Personalizado')")
                 ->execute([$code, $item['nombre_pieza'], $item['categoria'] ?? 'General', $item['subsistema'] ?? 'General']);
            $master_id = (int)$conn->lastInsertId();

            $conn->prepare("UPDATE desarme_items SET maestro_pieza_id=?, code_pieza=? WHERE id=?")->execute([$master_id, $code, $desarme_item_id]);

            $conn->prepare("INSERT INTO desarme_historial (desarme_id, accion, detalle, usuario_id) VALUES (?, 'pieza_huerfana_creada', ?, ?)")
                 ->execute([$item['desarme_id'], "Nueva pieza maestra creada: {$code} - {$item['nombre_pieza']}", $_SESSION['usuario_id'] ?? null]);

            $conn->commit();
            jsonResponse('success', 'Pieza maestra creada', ['master_id' => $master_id, 'code' => $code]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    // ══════════════════════════════════════════════════════════════
    // DESHABILITAR / HABILITAR pieza para este desarme
    // ══════════════════════════════════════════════════════════════
    } elseif ($action === 'deshabilitar_pieza') {
        $desarme_id = (int)($_POST['desarme_id'] ?? 0);
        $maestro_pieza_id = (int)($_POST['maestro_pieza_id'] ?? 0);
        $motivo = sanitizeString($_POST['motivo'] ?? '', 200);
        if (!$desarme_id || !$maestro_pieza_id) jsonResponse('error', 'Datos requeridos', null, 422);
        try {
            $conn->prepare("INSERT IGNORE INTO desarme_piezas_deshabilitadas (desarme_id, maestro_pieza_id, motivo) VALUES (?, ?, ?)")
                 ->execute([$desarme_id, $maestro_pieza_id, $motivo ?: null]);
            jsonResponse('success', 'Pieza deshabilitada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'habilitar_pieza') {
        $desarme_id = (int)($_POST['desarme_id'] ?? 0);
        $maestro_pieza_id = (int)($_POST['maestro_pieza_id'] ?? 0);
        if (!$desarme_id || !$maestro_pieza_id) jsonResponse('error', 'Datos requeridos', null, 422);
        try {
            $conn->prepare("DELETE FROM desarme_piezas_deshabilitadas WHERE desarme_id = ? AND maestro_pieza_id = ?")
                 ->execute([$desarme_id, $maestro_pieza_id]);
            jsonResponse('success', 'Pieza habilitada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } else {
        jsonResponse('error', 'Acción no válida', null, 400);
    }
} else {
    jsonResponse('error', 'Método no permitido', null, 405);
}
