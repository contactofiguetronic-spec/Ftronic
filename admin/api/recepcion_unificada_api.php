<?php
// ============================================================================
// recepcion_unificada_api.php — CRUD transaccional Recepción Unificada
// Crea/actualiza clientes + vehiculos + recepcion en un solo POST
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

// Protección por permiso
$action = $_REQUEST['action'] ?? '';
$writeActions = ['guardar', 'eliminar', 'cambiar_estado'];
if (in_array($action, $writeActions)) {
    requirePerm('recepcion:editar');
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    try {
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM recepcion_unificada WHERE id = ?");
            $stmt->execute([$id]);
            $rec = $stmt->fetch();
            if (!$rec) jsonResponse('error', 'Recepción no encontrada', null, 404);
            $rec['archivos'] = getMultimedia('recepcion_unificada', (int)$id, $conn);

            // Fetch linked client data
            if (!empty($rec['cliente_id'])) {
                $cliStmt = $conn->prepare("SELECT * FROM clientes WHERE id = ?");
                $cliStmt->execute([$rec['cliente_id']]);
                $cli = $cliStmt->fetch();
                if ($cli) {
                    foreach ($cli as $k => $v) {
                        if (strpos($k, 'cliente_') !== 0) {
                            $rec['cliente_' . $k] = $v;
                        }
                    }
                }
            }

            // Fetch linked vehicle data
            if (!empty($rec['vehiculo_id'])) {
                $vehStmt = $conn->prepare("SELECT * FROM vehiculos WHERE id = ?");
                $vehStmt->execute([$rec['vehiculo_id']]);
                $veh = $vehStmt->fetch();
                if ($veh) {
                    foreach ($veh as $k => $v) {
                        if (strpos($k, 'vehiculo_') !== 0 && $k !== 'id' && $k !== 'cliente_id') {
                            $rec['vehiculo_' . $k] = $v;
                        }
                    }
                }
            }

            jsonResponse('success', 'OK', $rec);
        } else {
            $p = paginationParams();
            $sw = buildSearchWhere(['vehiculo_patente','cliente_nombre','numero_orden_interna','asesor_taller','eval_estado_general'], $p['search']);
            $stmtC = $conn->prepare("SELECT COUNT(*) FROM recepcion_unificada WHERE {$sw['where']}");
            $stmtC->execute($sw['params']);
            $total = (int)$stmtC->fetchColumn();
            $stmt = $conn->prepare(
                "SELECT id, folio, cliente_nombre, cliente_apellido, cliente_rut,
                        cliente_telefono, cliente_correo, cliente_domicilio,
                        vehiculo_patente, vehiculo_marca, vehiculo_modelo, vehiculo_color,
                        vehiculo_anio, vehiculo_vin, vehiculo_combustible, vehiculo_kilometraje,
                        vehiculo_cilindrada_motor, vehiculo_transmision, vehiculo_traccion,
                        vehiculo_tipo_carroceria, vehiculo_procedencia, vehiculo_disenoestructural,
                        vehiculo_notas_tecnico,
                        eval_estado_general, eval_motivo_visita, numero_orden_interna,
                        asesor_taller, fecha, hora, foto_frontal, foto_trasera, foto_lateral_izq,
                        foto_lateral_der, foto_superior, creado,
                        foto_frontal AS thumb_url
                 FROM recepcion_unificada
                 WHERE {$sw['where']}
                 ORDER BY id DESC LIMIT {$p['per_page']} OFFSET {$p['offset']}"
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

    // ── DELETE ──────────────────────────────────────────────────────────────
    if ($action === 'delete') {
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        try {
            $conn->beginTransaction();
            // Get vehicle_id to reasign multimedia
            $stmt = $conn->prepare("SELECT vehiculo_id FROM recepcion_unificada WHERE id=?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            $vehiculoId = $row ? $row['vehiculo_id'] : null;
            // Reasign multimedia from recepcion_unificada to vehiculos (keep photos)
            if ($vehiculoId) {
                $conn->prepare(
                    "UPDATE archivos_multimedia SET entidad_tipo='vehiculos', entidad_id=? WHERE entidad_tipo='recepcion_unificada' AND entidad_id=?"
                )->execute([$vehiculoId, $id]);
            } else {
                // No vehicle linked, just remove multimedia records (keep files on disk)
                $conn->prepare("DELETE FROM archivos_multimedia WHERE entidad_tipo='recepcion_unificada' AND entidad_id=?")->execute([$id]);
            }
            historialInsert('recepcion_unificada', $id, 'eliminado', null, null, null, $conn);
            $conn->prepare("DELETE FROM recepcion_unificada WHERE id = ?")->execute([$id]);
            $conn->commit();
            jsonResponse('success', 'Recepción eliminada. Cliente, vehículo y fotos conservados.');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── CREATE / UPDATE ────────────────────────────────────────────────────
    else {
        $id = $_POST['id'] ?? null;

        $clientId = normalizeNullableInt($_POST['cliente_id'] ?? null);
        $vehiculoId = normalizeNullableInt($_POST['vehiculo_id'] ?? null);

        try {
            $conn->beginTransaction();

            // ── 1. CLIENTE ─────────────────────────────────────────────────
            $cliNombre = sanitizeString($_POST['cliente_nombre'] ?? '', 100);
            $cliApellido = sanitizeString($_POST['cliente_apellido'] ?? '', 100);
            $cliTelefono = sanitizeString($_POST['cliente_telefono'] ?? '', 20);
            $cliRut = sanitizeString($_POST['cliente_rut'] ?? '', 12);
            $cliCorreo = sanitizeString($_POST['cliente_correo'] ?? '', 150);
            $cliDomicilio = sanitizeString($_POST['cliente_domicilio'] ?? '', 255);

            if (!empty($cliNombre)) {
                $chkCli = $conn->prepare("SHOW COLUMNS FROM clientes");
                $chkCli->execute();
                $cliCols = [];
                while ($c = $chkCli->fetch()) $cliCols[] = $c['Field'];

                $cliData = ['nombre'=>$cliNombre,'apellido'=>$cliApellido,'telefono'=>$cliTelefono,'rut'=>$cliRut,'correo'=>$cliCorreo];
                if (in_array('domicilio', $cliCols)) $cliData['domicilio'] = $cliDomicilio;

                if ($clientId) {
                    $sets = [];
                    $params = [];
                    foreach ($cliData as $k => $v) { $sets[] = "$k=?"; $params[] = $v; }
                    $params[] = $clientId;
                    $conn->prepare("UPDATE clientes SET " . implode(', ',$sets) . " WHERE id=?")->execute($params);
                } else {
                    $keys = array_keys($cliData);
                    $ph = array_map(fn($k) => "?", $keys);
                    $conn->prepare("INSERT INTO clientes (" . implode(',',$keys) . ") VALUES (" . implode(',',$ph) . ")")->execute(array_values($cliData));
                    $clientId = (int)$conn->lastInsertId();
                }
            }

            // ── 2. VEHÍCULO ───────────────────────────────────────────────
            $vehPatente = sanitizeString($_POST['vehiculo_patente'] ?? '', 20);
            $vehMarca = sanitizeString($_POST['vehiculo_marca'] ?? '', 50);
            $vehModelo = sanitizeString($_POST['vehiculo_modelo'] ?? '', 100);
            $vehAnio = normalizeNullableInt($_POST['vehiculo_anio'] ?? null);
            $vehVin = sanitizeString($_POST['vehiculo_vin'] ?? '', 50);
            $vehColor = sanitizeString($_POST['vehiculo_color'] ?? '', 50);
            $vehCombustible = sanitizeString($_POST['vehiculo_combustible'] ?? '', 50);
            $vehKm = normalizeNullableInt($_POST['vehiculo_kilometraje'] ?? null);
            $vehCilindrada = normalizeNullableInt($_POST['vehiculo_cilindrada_motor'] ?? null);
            $vehTransmision = sanitizeString($_POST['vehiculo_transmision'] ?? '', 50);
            $vehTraccion = sanitizeString($_POST['vehiculo_traccion'] ?? '', 50);
            $vehCarroceria = sanitizeString($_POST['vehiculo_tipo_carroceria'] ?? '', 50);
            $vehProcedencia = sanitizeString($_POST['vehiculo_procedencia'] ?? '', 50);
            $vehDiseno = sanitizeString($_POST['vehiculo_disenoestructural'] ?? '', 50);
            $vehNotasTec = sanitizeString($_POST['vehiculo_notas_tecnico'] ?? '', 500);

            if (!empty($vehPatente)) {
                // Check which columns exist in vehiculos
                $chkVeh = $conn->prepare("SHOW COLUMNS FROM vehiculos");
                $chkVeh->execute();
                $vehCols = [];
                while ($c = $chkVeh->fetch()) $vehCols[] = $c['Field'];

                $vehData = ['patente'=>$vehPatente,'marca'=>$vehMarca,'modelo'=>$vehModelo,'anio'=>$vehAnio,'vin'=>$vehVin,'color'=>$vehColor,'combustible'=>$vehCombustible,'kilometraje'=>$vehKm,'cliente_id'=>$clientId];
                if (in_array('cilindrada_motor', $vehCols)) $vehData['cilindrada_motor'] = $vehCilindrada;
                if (in_array('transmision', $vehCols)) $vehData['transmision'] = $vehTransmision;
                if (in_array('traccion', $vehCols)) $vehData['traccion'] = $vehTraccion;
                if (in_array('tipo_carroceria', $vehCols)) $vehData['tipo_carroceria'] = $vehCarroceria;
                if (in_array('procedencia', $vehCols)) $vehData['procedencia'] = $vehProcedencia;
                if (in_array('disenoestructural', $vehCols)) $vehData['disenoestructural'] = $vehDiseno;
                if (in_array('notas_tecnico', $vehCols)) $vehData['notas_tecnico'] = $vehNotasTec;

                if ($vehiculoId) {
                    $sets = []; $params = [];
                    foreach ($vehData as $k => $v) { $sets[] = "$k=?"; $params[] = $v; }
                    $params[] = $vehiculoId;
                    $conn->prepare("UPDATE vehiculos SET " . implode(', ',$sets) . " WHERE id=?")->execute($params);
                } else {
                    $keys = array_keys($vehData);
                    $ph = array_map(fn($k) => "?", $keys);
                    $conn->prepare("INSERT INTO vehiculos (" . implode(',',$keys) . ") VALUES (" . implode(',',$ph) . ")")->execute(array_values($vehData));
                    $vehiculoId = (int)$conn->lastInsertId();
                }
            }

            // ── 3. INSPECCIÓN VISUAL ──────────────────────────────────────
            $inspFields = [
                'insp_pintura_frontal','insp_pintura_lateral_izq','insp_pintura_lateral_der',
                'insp_pintura_trasera','insp_pintura_techo','insp_parabrisas_del','insp_parabrisas_tras',
                'insp_espejos','insp_focos_del','insp_focos_tras','insp_parachoque_del','insp_parachoque_tras',
                'insp_neumaticos_del','insp_neumaticos_tras',
                'insp_tapiz_piloto','insp_tapiz_copiloto','insp_tapiz_trasero','insp_alfombras',
                'insp_tablero','insp_cinturones',
                'insp_motor_enciende','insp_nivel_aceite','insp_nivel_refrigerante','insp_bateria','insp_correas',
                'insp_rueda_repuesto','insp_gata','insp_chaleco','insp_triangulo','insp_botiquin','insp_extintor',
            ];
            $insp = [];
            foreach ($inspFields as $f) {
                $insp[$f] = sanitizeString($_POST[$f] ?? 'N/A', 10);
            }
            $insp['insp_ralladuras'] = $_POST['insp_ralladuras'] ?? '';
            $insp['insp_abollones'] = $_POST['insp_abollones'] ?? '';
            $insp['insp_observaciones_generales'] = $_POST['insp_observaciones_generales'] ?? '';
            $insp['alerta_pernos_rodados'] = (int)($_POST['alerta_pernos_rodados'] ?? 0);
            $insp['alerta_falla_red'] = (int)($_POST['alerta_falla_red'] ?? 0);

            // ── 4. FOTOS (base64 → disco) ─────────────────────────────────
            $photoFields = ['foto_frontal','foto_trasera','foto_lateral_izq','foto_lateral_der','foto_superior','foto_motor','foto_interior'];
            $dir = UPLOADS_BASE_PATH . 'recepcion_unificada/';
            if (!is_dir($dir)) mkdir($dir, 0755, true);

            $existing = null;
            if ($id) {
                $cols = implode(',', $photoFields);
                $stmtE = $conn->prepare("SELECT $cols FROM recepcion_unificada WHERE id=?");
                $stmtE->execute([$id]);
                $existing = $stmtE->fetch();
            }

            foreach ($photoFields as $pf) {
                $b64 = $_POST[$pf] ?? null;
                if (!empty($b64) && str_starts_with($b64, 'data:image')) {
                    // Decodificar y guardar
                    $parts = explode(',', $b64);
                    $data = base64_decode($parts[1] ?? '');
                    if ($data) {
                        $fname = $pf . '_' . time() . '_' . uniqid() . '.jpg';
                        $path = $dir . $fname;
                        file_put_contents($path, $data);
                        $insp[$pf] = UPLOADS_BASE_URL . 'recepcion_unificada/' . $fname;
                    } else {
                        $insp[$pf] = $existing[$pf] ?? null;
                    }
                } else {
                    $insp[$pf] = $existing[$pf] ?? null;
                }
            }

            // ── 5. EVALUACIÓN + FIRMA ─────────────────────────────────────
            $eval = [
                'eval_estado_general' => sanitizeString($_POST['eval_estado_general'] ?? '', 50),
                'eval_motivo_visita' => $_POST['eval_motivo_visita'] ?? '',
                'eval_firma_cliente' => $_POST['eval_firma_cliente'] ?? null,
            ];

            // Handle firma as file upload (preferred) or base64 (legacy)
            if (!empty($_FILES['firma_archivo']['tmp_name'])) {
                $fdir = UPLOADS_BASE_PATH . 'recepcion_unificada/';
                if (!is_dir($fdir)) @mkdir($fdir, 0755, true);
                $fext = pathinfo($_FILES['firma_archivo']['name'], PATHINFO_EXTENSION) ?: 'png';
                $ffname = 'firma_' . time() . '_' . uniqid() . '.' . $fext;
                if (move_uploaded_file($_FILES['firma_archivo']['tmp_name'], $fdir . $ffname)) {
                    $eval['eval_firma_cliente'] = UPLOADS_BASE_URL . 'recepcion_unificada/' . $ffname;
                }
            } elseif (!empty($eval['eval_firma_cliente']) && str_starts_with($eval['eval_firma_cliente'], 'data:image')) {
                // Legacy: convert base64 data URL to file
                $b64 = $eval['eval_firma_cliente'];
                $parts = explode(',', $b64);
                $data = base64_decode($parts[1] ?? '');
                if ($data) {
                    $fdir = UPLOADS_BASE_PATH . 'recepcion_unificada/';
                    if (!is_dir($fdir)) @mkdir($fdir, 0755, true);
                    $ffname = 'firma_' . time() . '_' . uniqid() . '.png';
                    file_put_contents($fdir . $ffname, $data);
                    $eval['eval_firma_cliente'] = UPLOADS_BASE_URL . 'recepcion_unificada/' . $ffname;
                }
            }

            // ── 6. METADATOS ──────────────────────────────────────────────
            // Verificar si columna 'folio' existe en la tabla
            $hasFolio = false;
            try {
                $chk = $conn->prepare("SHOW COLUMNS FROM recepcion_unificada LIKE 'folio'");
                $chk->execute();
                $hasFolio = $chk->rowCount() > 0;
            } catch (Exception $e) { /* columna no existe */ }

            $folio = $_POST['folio'] ?? null;
            if ($hasFolio && !$folio) {
                $year = date('Y');
                $stmtFolio = $conn->prepare("SELECT COUNT(*) FROM recepcion_unificada WHERE YEAR(fecha) = ?");
                $stmtFolio->execute([$year]);
                $seq = (int)$stmtFolio->fetchColumn() + 1;
                $folio = 'REC-' . $year . '-' . str_pad($seq, 5, '0', STR_PAD_LEFT);
            }

            $meta = [
                'numero_orden_interna' => sanitizeString($_POST['numero_orden_interna'] ?? '', 100),
                'asesor_taller' => sanitizeString($_POST['asesor_taller'] ?? '', 150),
                'forma_llegada' => sanitizeString($_POST['forma_llegada'] ?? '', 100),
                'fecha' => !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d'),
                'hora' => !empty($_POST['hora']) ? $_POST['hora'] : date('H:i:s'),
            ];
            if ($hasFolio && $folio) {
                $meta['folio'] = $folio;
            }

            // ── 7. INSERT / UPDATE ────────────────────────────────────────
            $all = array_merge(
                ['cliente_id'=>$clientId, 'vehiculo_id'=>$vehiculoId],
                // Cliente
                ['cliente_nombre'=>$cliNombre,'cliente_apellido'=>$cliApellido,'cliente_rut'=>$cliRut,
                 'cliente_telefono'=>$cliTelefono,'cliente_correo'=>$cliCorreo,'cliente_domicilio'=>$cliDomicilio],
                // Vehículo
                ['vehiculo_patente'=>$vehPatente,'vehiculo_marca'=>$vehMarca,'vehiculo_modelo'=>$vehModelo,
                 'vehiculo_anio'=>$vehAnio,'vehiculo_vin'=>$vehVin,'vehiculo_color'=>$vehColor,
                 'vehiculo_combustible'=>$vehCombustible,'vehiculo_kilometraje'=>$vehKm,
                 'vehiculo_cilindrada_motor'=>$vehCilindrada,'vehiculo_transmision'=>$vehTransmision,
                 'vehiculo_traccion'=>$vehTraccion,'vehiculo_tipo_carroceria'=>$vehCarroceria,
                 'vehiculo_procedencia'=>$vehProcedencia,'vehiculo_disenoestructural'=>$vehDiseno,
                 'vehiculo_notas_tecnico'=>$vehNotasTec],
                $insp, $eval, $meta
            );

            // Filtrar solo columnas que existen en la tabla
            $chkCols = $conn->prepare("SHOW COLUMNS FROM recepcion_unificada");
            $chkCols->execute();
            $existingCols = [];
            while ($col = $chkCols->fetch()) $existingCols[] = $col['Field'];
            $all = array_intersect_key($all, array_flip($existingCols));

            if ($id) {
                $sets = [];
                $params = [];
                foreach ($all as $k => $v) {
                    $sets[] = "$k=:$k";
                    $params[":$k"] = $v;
                }
                $params[':id'] = $id;
                $conn->prepare("UPDATE recepcion_unificada SET " . implode(', ',$sets) . " WHERE id=:id")->execute($params);
                $record_id = (int)$id;
                $msg = 'Recepción actualizada.';
            } else {
                $keys = array_keys($all);
                $placeholders = array_map(fn($k) => ":$k", $keys);
                $sql = "INSERT INTO recepcion_unificada (" . implode(',',$keys) . ") VALUES (" . implode(',',$placeholders) . ")";
                $conn->prepare($sql)->execute($all);
                $record_id = (int)$conn->lastInsertId();
                $msg = 'Recepción creada exitosamente.';
            }

            // ── DUAL-WRITE INSPECCIÓN NORMALIZADA (Fase0-G) ──────────────
            // Solo si la tabla existe (para no romper en caso de deploy
            // antes de ejecutar la migración). UPSERT por (recepcion_id, campo).
            try {
                $chkInsp = $conn->query("SHOW TABLES LIKE 'recepcion_inspeccion_items'");
                if ($chkInsp && $chkInsp->fetch()) {
                    $seccionMap = [
                        'insp_pintura_frontal'=>'exterior','insp_pintura_lateral_izq'=>'exterior',
                        'insp_pintura_lateral_der'=>'exterior','insp_pintura_trasera'=>'exterior',
                        'insp_pintura_techo'=>'exterior','insp_parabrisas_del'=>'exterior',
                        'insp_parabrisas_tras'=>'exterior','insp_espejos'=>'exterior',
                        'insp_focos_del'=>'exterior','insp_focos_tras'=>'exterior',
                        'insp_parachoque_del'=>'exterior','insp_parachoque_tras'=>'exterior',
                        'insp_neumaticos_del'=>'exterior','insp_neumaticos_tras'=>'exterior',
                        'insp_tapiz_piloto'=>'interior','insp_tapiz_copiloto'=>'interior',
                        'insp_tapiz_trasero'=>'interior','insp_alfombras'=>'interior',
                        'insp_tablero'=>'interior','insp_cinturones'=>'interior',
                        'insp_motor_enciende'=>'motor','insp_nivel_aceite'=>'motor',
                        'insp_nivel_refrigerante'=>'motor','insp_bateria'=>'motor','insp_correas'=>'motor',
                        'insp_rueda_repuesto'=>'seguridad','insp_gata'=>'seguridad',
                        'insp_chaleco'=>'seguridad','insp_triangulo'=>'seguridad',
                        'insp_botiquin'=>'seguridad','insp_extintor'=>'seguridad',
                    ];
                    $sqlUpsert = "INSERT INTO recepcion_inspeccion_items
                        (recepcion_id, campo, valor, seccion, orden)
                        VALUES (:rid, :campo, :valor, :sec, :orden)
                        ON DUPLICATE KEY UPDATE valor = VALUES(valor), seccion = VALUES(seccion)";
                    $stmtUpsert = $conn->prepare($sqlUpsert);
                    $orden = 0;
                    foreach ($inspFields as $idx => $campo) {
                        $orden = $idx + 1;
                        $stmtUpsert->execute([
                            ':rid'   => $record_id,
                            ':campo' => $campo,
                            ':valor' => $insp[$campo] ?? 'N/A',
                            ':sec'   => $seccionMap[$campo] ?? null,
                            ':orden' => $orden,
                        ]);
                    }
                }
            } catch (Exception $e) {
                error_log("Fase0-G dual-write inspeccion error: " . $e->getMessage());
            }

            // Multimedia adicional
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'recepcion_unificada', $record_id, $conn);
            }

            // NOTA: La creación de OT se realiza manualmente desde el JS
            // (confirmación del usuario) vía ordenes_trabajo_api?action=crear_ot_desde_recepcion
            // Esto evita la creación duplicada de OTs que ocurría cuando el PHP auto-creaba
            // Y luego el JS también creaba una segunda OT.

            historialInsert('recepcion_unificada', $record_id, $id ? 'actualizado' : 'creado', null, null, json_encode($all), $conn);
            $conn->commit();
            jsonResponse('success', $msg, ['id' => $record_id]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }
}
?>
