<?php
require_once '../includes/conexion.php';
requireAuth();

$action = $_REQUEST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

$writeActions = ['insert','update','delete','update_compat','add_compat','delete_compat','filter_for_vehicle','valorizacion_config_save'];
if ($method === 'POST' && in_array($action, $writeActions)) {
    requirePerm('desarme_maestro:editar');
}

// ============================================================================
// GET
// ============================================================================
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;

    try {
        // ── Single record ──────────────────────────────────────────────────
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM desarme_maestro_piezas WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'No encontrado', null, 404);
            $stmtC = $conn->prepare("SELECT * FROM desarme_compatibilidad WHERE maestro_pieza_id = ?");
            $stmtC->execute([$id]);
            $rec['compatibilidades'] = $stmtC->fetchAll();
            jsonResponse('success', 'OK', $rec);
        }

        // ── Action-based GET endpoints ──────────────────────────────────────
        if ($action === 'list_categorias') {
            $stmt = $conn->query("SELECT DISTINCT categoria FROM desarme_maestro_piezas WHERE activo=1 ORDER BY categoria");
            jsonResponse('success', 'OK', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        if ($action === 'list_subsistemas') {
            $cat = $_GET['categoria'] ?? '';
            if ($cat) {
                $stmt = $conn->prepare("SELECT DISTINCT subsistema FROM desarme_maestro_piezas WHERE activo=1 AND categoria=? ORDER BY subsistema");
                $stmt->execute([$cat]);
            } else {
                $stmt = $conn->query("SELECT DISTINCT subsistema FROM desarme_maestro_piezas WHERE activo=1 ORDER BY subsistema");
            }
            jsonResponse('success', 'OK', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        if ($action === 'filter_options') {
            $stmtC = $conn->query("SELECT DISTINCT categoria FROM desarme_maestro_piezas WHERE activo=1 ORDER BY categoria");
            $stmtS = $conn->query("SELECT DISTINCT subsistema FROM desarme_maestro_piezas WHERE activo=1 ORDER BY subsistema");
            jsonResponse('success', 'OK', [
                'categorias' => $stmtC->fetchAll(PDO::FETCH_COLUMN),
                'subsistemas' => $stmtS->fetchAll(PDO::FETCH_COLUMN),
            ]);
        }

        if ($action === 'valorizacion_calcular') {
            $categoria = $_GET['categoria'] ?? '';
            $condicion = $_GET['condicion'] ?? 'bueno';
            $precio_venta = normalizeNullableDecimal($_GET['precio_venta'] ?? null);

            if (!$categoria) jsonResponse('error', 'Categoría requerida', null, 422);

            $stmt = $conn->prepare("SELECT * FROM desarme_valorizacion_config WHERE categoria = ? AND activo = 1");
            $stmt->execute([$categoria]);
            $config = $stmt->fetch();

            if (!$config) {
                jsonResponse('success', 'Sin configuración', ['valor_estimado' => 0, 'configurado' => false]);
                return;
            }

            $factorMap = [
                'bueno' => $config['factor_bueno'],
                'para_reparacion' => $config['factor_para_reparacion'],
                'malo' => $config['factor_malo'],
            ];
            $factor = $factorMap[$condicion] ?? $config['factor_bueno'];
            $precioBase = $precio_venta ?: $config['precio_base'];
            $valorEstimado = round($precioBase * $factor, 0);

            jsonResponse('success', 'OK', [
                'categoria' => $categoria,
                'condicion' => $condicion,
                'precio_base' => $precioBase,
                'factor' => $factor,
                'valor_estimado' => $valorEstimado,
                'configurado' => true,
            ]);
        }

        if ($action === 'valorizacion_config_list') {
            $stmt = $conn->query("SELECT * FROM desarme_valorizacion_config ORDER BY categoria");
            jsonResponse('success', 'OK', $stmt->fetchAll());
        }

        // ── Paginated list ──────────────────────────────────────────────────
        $p = paginationParams();
        $filterCategoria = $_GET['categoria'] ?? '';
        $where = ['1=1'];
        $params = [];

        if ($filterCategoria) { $where[] = 'p.categoria = ?'; $params[] = $filterCategoria; }
        if (isset($_GET['activo']) && $_GET['activo'] !== '') { $where[] = 'p.activo = ?'; $params[] = (int)$_GET['activo']; }

        $whereStr = implode(' AND ', $where);

        $countSql = "SELECT COUNT(DISTINCT p.id) FROM desarme_maestro_piezas p WHERE {$whereStr}";
        $stmtC = $conn->prepare($countSql);
        $stmtC->execute($params);
        $total = (int)$stmtC->fetchColumn();

        $sw = buildSearchWhere(['p.code','p.nombre','p.categoria','p.subsistema'], $p['search'], 'p');
        $allWhere = array_merge([$whereStr], [$sw['where']]);
        $allParams = array_merge($params, $sw['params']);

        $stmt = $conn->prepare(
            "SELECT p.*
             FROM desarme_maestro_piezas p
             WHERE " . implode(' AND ', $allWhere) . "
             ORDER BY p.categoria, p.subsistema, p.code
             LIMIT {$p['per_page']} OFFSET {$p['offset']}"
        );
        $stmt->execute($allParams);
        paginatedResponse($stmt->fetchAll(), $total, $p);

    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }

// ============================================================================
// POST
// ============================================================================
} elseif ($method === 'POST') {

    if ($action === 'filter_for_vehicle') {
        $combustible = $_POST['combustible'] ?? '';
        $traccion = $_POST['traccion'] ?? '';
        $transmision = $_POST['transmision'] ?? '';
        $marca = $_POST['marca'] ?? '';
        $modelo = $_POST['modelo'] ?? '';

        $where = ['p.activo = 1'];
        $params = [];
        $compatJoin = '';

        if ($combustible || $traccion || $transmision || $marca || $modelo) {
            $compatJoin = ' LEFT JOIN desarme_compatibilidad c ON c.maestro_pieza_id = p.id';
            $orConditions = [];
            $orConditions[] = 'NOT EXISTS (SELECT 1 FROM desarme_compatibilidad cc WHERE cc.maestro_pieza_id = p.id)';
            $matchConditions = ['1=1'];
            if ($combustible) { $matchConditions[] = "(c.combustible IS NULL OR c.combustible LIKE ?)"; $params[] = "%{$combustible}%"; }
            if ($traccion) { $matchConditions[] = "(c.traccion IS NULL OR c.traccion LIKE ?)"; $params[] = "%{$traccion}%"; }
            if ($transmision) { $matchConditions[] = "(c.transmision IS NULL OR c.transmision LIKE ?)"; $params[] = "%{$transmision}%"; }
            if ($marca) { $matchConditions[] = "(c.marca IS NULL OR c.marca = ?)"; $params[] = $marca; }
            if ($modelo) { $matchConditions[] = "(c.modelo IS NULL OR c.modelo LIKE ?)"; $params[] = "%{$modelo}%"; }
            $orConditions[] = '(' . implode(' AND ', $matchConditions) . ')';
            $where[] = '(' . implode(' OR ', $orConditions) . ')';
        }

        $whereStr = implode(' AND ', $where);
        $stmt = $conn->prepare(
            "SELECT p.* FROM desarme_maestro_piezas p {$compatJoin}
             WHERE {$whereStr}
             ORDER BY p.categoria, p.subsistema, p.code"
        );
        $stmt->execute($params);
        jsonResponse('success', 'OK', $stmt->fetchAll());

    } elseif ($action === 'insert' || $action === 'update') {
        $id = $_POST['id'] ?? null;
        $code = strtoupper(sanitizeString($_POST['codigo'] ?? $_POST['code'] ?? '', 20));
        $nombre = sanitizeString($_POST['nombre'] ?? '', 200);
        $categoria = sanitizeString($_POST['categoria'] ?? '', 50);
        $subsistema = sanitizeString($_POST['subsistema'] ?? '', 100);
        $tipo = sanitizeString($_POST['tipo'] ?? '', 100);
        $activo = (int)($_POST['activo'] ?? 1);

        requireFields($_POST, ['codigo','nombre','categoria','subsistema']);

        $data = [
            ':code' => $code, ':nombre' => $nombre, ':categoria' => $categoria,
            ':subsistema' => $subsistema, ':tipo' => $tipo, ':activo' => $activo,
        ];

        try {
            $conn->beginTransaction();
            if ($id) {
                $data[':id'] = $id;
                $conn->prepare("UPDATE desarme_maestro_piezas SET code=:code, nombre=:nombre, categoria=:categoria, subsistema=:subsistema, tipo=:tipo, activo=:activo WHERE id=:id")->execute($data);
                $record_id = $id;
            } else {
                $conn->prepare("INSERT INTO desarme_maestro_piezas (code, nombre, categoria, subsistema, tipo, activo) VALUES (:code, :nombre, :categoria, :subsistema, :tipo, :activo)")->execute($data);
                $record_id = (int)$conn->lastInsertId();
            }
            historialInsert('desarme_maestro_piezas', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($data), $conn);
            $conn->commit();
            jsonResponse('success', $id ? 'Actualizado' : 'Creado', ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            if ($e->getCode() == 23000) jsonResponse('error', 'El código ya existe', null, 409);
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            historialInsert('desarme_maestro_piezas', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM desarme_maestro_piezas WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Eliminado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'update_compat' || $action === 'add_compat') {
        $maestro_pieza_id = (int)($_POST['maestro_pieza_id'] ?? 0);
        if (!$maestro_pieza_id) jsonResponse('error', 'maestro_pieza_id requerido', null, 422);
        $compat_id = $_POST['compat_id'] ?? null;
        $combustible = sanitizeString($_POST['combustible'] ?? '', 50);
        $traccion = sanitizeString($_POST['traccion'] ?? '', 50);
        $transmision = sanitizeString($_POST['transmision'] ?? '', 50);
        $tipo_carroceria = sanitizeString($_POST['tipo_carroceria'] ?? '', 100);
        $marca = sanitizeString($_POST['marca'] ?? '', 50);
        $modelo = sanitizeString($_POST['modelo'] ?? '', 100);
        $anio_inicio = normalizeNullableInt($_POST['anio_inicio'] ?? null);
        $anio_fin = normalizeNullableInt($_POST['anio_fin'] ?? null);
        $cilindrada_min = normalizeNullableInt($_POST['cilindrada_min'] ?? null);
        $cilindrada_max = normalizeNullableInt($_POST['cilindrada_max'] ?? null);
        $notas = sanitizeString($_POST['notas'] ?? '', 0);

        try {
            $conn->beginTransaction();
            $data = [
                ':maestro_pieza_id' => $maestro_pieza_id,
                ':combustible' => $combustible ?: null,
                ':traccion' => $traccion ?: null,
                ':transmision' => $transmision ?: null,
                ':tipo_carroceria' => $tipo_carroceria ?: null,
                ':marca' => $marca ?: null,
                ':modelo' => $modelo ?: null,
                ':anio_inicio' => $anio_inicio,
                ':anio_fin' => $anio_fin,
                ':cilindrada_min' => $cilindrada_min,
                ':cilindrada_max' => $cilindrada_max,
                ':notas' => $notas ?: null,
            ];
            if ($compat_id) {
                $data[':id'] = $compat_id;
                $conn->prepare("UPDATE desarme_compatibilidad SET combustible=:combustible, traccion=:traccion, transmision=:transmision, tipo_carroceria=:tipo_carroceria, marca=:marca, modelo=:modelo, anio_inicio=:anio_inicio, anio_fin=:anio_fin, cilindrada_min=:cilindrada_min, cilindrada_max=:cilindrada_max, notas=:notas WHERE id=:id AND maestro_pieza_id=:maestro_pieza_id")->execute($data);
            } else {
                $conn->prepare("INSERT INTO desarme_compatibilidad (maestro_pieza_id, combustible, traccion, transmision, tipo_carroceria, marca, modelo, anio_inicio, anio_fin, cilindrada_min, cilindrada_max, notas) VALUES (:maestro_pieza_id, :combustible, :traccion, :transmision, :tipo_carroceria, :marca, :modelo, :anio_inicio, :anio_fin, :cilindrada_min, :cilindrada_max, :notas)")->execute($data);
            }
            $conn->commit();
            jsonResponse('success', 'Compatibilidad actualizada');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'delete_compat') {
        $compat_id = $_POST['compat_id'] ?? null;
        if (!$compat_id) jsonResponse('error', 'compat_id requerido', null, 422);
        try {
            $conn->prepare("DELETE FROM desarme_compatibilidad WHERE id = ?")->execute([$compat_id]);
            jsonResponse('success', 'Eliminada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } elseif ($action === 'valorizacion_config_save') {
        $id = $_POST['id'] ?? null;
        $categoria = sanitizeString($_POST['categoria'] ?? '', 50);
        $precio_base = normalizeNullableDecimal($_POST['precio_base'] ?? 0);
        $factor_bueno = normalizeNullableDecimal($_POST['factor_bueno'] ?? 1.0);
        $factor_para_reparacion = normalizeNullableDecimal($_POST['factor_para_reparacion'] ?? 0.6);
        $factor_malo = normalizeNullableDecimal($_POST['factor_malo'] ?? 0.3);
        $activo = (int)($_POST['activo'] ?? 1);

        if (!$categoria) jsonResponse('error', 'Categoría requerida', null, 422);

        try {
            $conn->beginTransaction();
            if ($id) {
                $conn->prepare("UPDATE desarme_valorizacion_config SET categoria=?, precio_base=?, factor_bueno=?, factor_para_reparacion=?, factor_malo=?, activo=? WHERE id=?")
                     ->execute([$categoria, $precio_base, $factor_bueno, $factor_para_reparacion, $factor_malo, $activo, $id]);
            } else {
                $conn->prepare("INSERT INTO desarme_valorizacion_config (categoria, precio_base, factor_bueno, factor_para_reparacion, factor_malo, activo) VALUES (?,?,?,?,?,?)")
                     ->execute([$categoria, $precio_base, $factor_bueno, $factor_para_reparacion, $factor_malo, $activo]);
            }
            $conn->commit();
            jsonResponse('success', 'Guardado');
        } catch (PDOException $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            if ($e->getCode() == 23000) jsonResponse('error', 'La categoría ya existe', null, 409);
            jsonResponse('error', $e->getMessage(), null, 500);
        }

    } else {
        jsonResponse('error', 'Acción no válida', null, 400);
    }

} else {
    jsonResponse('error', 'Método no permitido', null, 405);
}
