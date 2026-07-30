<?php
// ============================================================================
// ejecucion_ot_api.php
// Módulo Ejecución de OT — Dashboard Operacional Unificado
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

// Protección por permiso
$action = $_REQUEST['action'] ?? '';
$writeActions = ['clock_in', 'clock_out'];
if (in_array($action, $writeActions)) {
    requirePerm('ejecucion_ot:editar');
}

try {
    switch ($action) {

        // ─── LISTADOS ───────────────────────────────────────────────────────
        case 'listar_pendientes':
            $empleadoId = isset($_GET['empleado_id']) ? (int)$_GET['empleado_id'] : 0;
            listarOts($empleadoId, 'pendiente');
            break;

        case 'listar_en_progreso':
            $empleadoId = isset($_GET['empleado_id']) ? (int)$_GET['empleado_id'] : 0;
            listarOts($empleadoId, 'en_progreso');
            break;

        case 'listar_todas_asignadas':
            $empleadoId = isset($_GET['empleado_id']) ? (int)$_GET['empleado_id'] : 0;
            listarOts($empleadoId, null);
            break;

        case 'listar_todas':
            listarTodas();
            break;

        // ─── CARGA ──────────────────────────────────────────────────────────
        case 'cargar_ot':
            $otId = (int)($_GET['ot_id'] ?? 0);
            cargarOt($otId);
            break;

        // ─── CLOCK ──────────────────────────────────────────────────────────
        case 'clock_in':
            $otId = (int)($_POST['ot_id'] ?? 0);
            clockIn($otId);
            break;

        case 'clock_out':
            $otId = (int)($_POST['ot_id'] ?? 0);
            clockOut($otId);
            break;

        // ─── CHECKLIST ITEMS ────────────────────────────────────────────────
        case 'actualizar_item_estado':
            actualizarItemEstado();
            break;

        case 'guardar_labores':
            guardarLabores();
            break;

        case 'agregar_imprevisto':
            agregarImprevisto();
            break;

        case 'agregar_servicio_item':
            agregarServicioItem();
            break;

        case 'agregar_repuesto_item':
            agregarRepuestoItem();
            break;

        case 'agregar_servicio_rapido':
            agregarServicioRapido();
            break;

        case 'eliminar_item_imprevisto':
            eliminarItemImprevisto();
            break;

        // ─── MULTIMEDIA POR ITEM ────────────────────────────────────────────
        case 'agregar_item_foto':
            agregarItemFoto();
            break;

        case 'eliminar_item_foto':
            eliminarItemFoto();
            break;

        // ─── REPUESTOS ──────────────────────────────────────────────────────
        case 'solicitar_repuesto':
            solicitarRepuesto();
            break;

        case 'listar_repuestos_ot':
            $otId = (int)($_GET['ot_id'] ?? 0);
            listarRepuestosOt($otId);
            break;

        case 'actualizar_repuesto':
            actualizarRepuesto();
            break;

        case 'eliminar_repuesto_solicitado':
            eliminarRepuestoSolicitado();
            break;

        case 'crear_oc_desde_repuesto':
            // La creación de OC vive ahora en orden_compra_api.php para
            // soportar el nuevo flujo con folio, solicitante, origen, etc.
            jsonResponse('info', 'Esta acción fue migrada a orden_compra_api.php', null, 410);
            break;

        case 'solicitar_compra_ot':
            // Crea una OC genérica a partir de la OT (insumo/repuesto/
            // herramienta/accesorio) sin necesidad de un ot_repuestos_solicitados.
            $otId = (int)($_POST['ot_id'] ?? 0);
            $solicitanteId = (int)($_POST['solicitante_empleado_id'] ?? 0);
            if (!$otId) jsonResponse('error', 'ot_id requerido', null, 422);
            $items = json_decode($_POST['items_json'] ?? '[]', true) ?? [];
            if (empty($items)) jsonResponse('error', 'Debe incluir al menos un ítem', null, 422);
            try {
                $conn = $GLOBALS['conn'];
                $conn->beginTransaction();
                $conn->prepare(
                    "INSERT INTO orden_compra (fecha_emision, estado, subtotal, impuesto, descuento, total, observaciones, solicitante_empleado_id, origen_tipo, origen_id)
                     VALUES (CURDATE(), 'solicitado', 0, 0, 0, 0, ?, ?, 'ejecucion_ot', ?)"
                )->execute([
                    'Solicitud manual desde la ejecución de la OT #' . $otId,
                    $solicitanteId ?: null,
                    $otId,
                ]);
                $ocId = (int)$conn->lastInsertId();
                $conn->prepare("UPDATE orden_compra SET folio = CONCAT('OC-', LPAD(id,5,'0')) WHERE id = ?")->execute([$ocId]);
                $stmtItem = $conn->prepare(
                    "INSERT INTO orden_compra_items (orden_compra_id, producto_tipo, producto_id, nombre, cantidad_solicitada, cantidad_recibida, valor_unitario, descripcion)
                     VALUES (?, ?, NULL, ?, ?, 0, ?, ?)"
                );
                foreach ($items as $it) {
                    $stmtItem->execute([
                        $ocId,
                        $it['producto_tipo'] ?? 'otro',
                        $it['nombre'] ?? '',
                        (int)($it['cantidad_solicitada'] ?? 1),
                        (float)($it['valor_unitario'] ?? 0),
                        $it['descripcion'] ?? '',
                    ]);
                }
                historialInsert('orden_compra', $ocId, 'creado', null, null, 'Solicitud OT #' . $otId, $conn);
                $conn->commit();
                jsonResponse('success', 'Solicitud de OC registrada', ['id' => $ocId, 'folio' => 'OC-' . str_pad($ocId,5,'0')]);
            } catch (Exception $e) {
                if ($conn->inTransaction()) $conn->rollBack();
                jsonResponse('error', $e->getMessage(), null, 500);
            }
            break;

        // ─── ETAPAS ─────────────────────────────────────────────────────────
        case 'cargar_etapas':
            $otId = (int)($_GET['ot_id'] ?? 0);
            cargarEtapas($otId);
            break;

        case 'agregar_etapa':
            agregarEtapa();
            break;

        case 'actualizar_etapa':
            actualizarEtapa();
            break;

        case 'reordenar_etapas':
            reordenarEtapas();
            break;

        case 'eliminar_etapa':
            eliminarEtapa();
            break;

        // ─── DIAGNÓSTICO ────────────────────────────────────────────────────
        case 'diagnostico_vinculado':
            $otId = (int)($_GET['ot_id'] ?? $_POST['ot_id'] ?? 0);
            diagnosticoVinculado($otId);
            break;

        case 'guardar_diagnostico':
            guardarDiagnostico();
            break;

        // ─── AUDIO ──────────────────────────────────────────────────────────
        case 'subir_nota_voz':
            subirNotaVoz();
            break;

        case 'eliminar_evidencia_item':
            eliminarEvidenciaItem();
            break;

        case 'guardar_notas':
            guardarNotas();
            break;

        case 'agregar_comentario_cliente':
            agregarComentarioCliente();
            break;

        // ─────────────────────────────────────────────────────────────────────
        default:
            jsonResponse('error', 'Acción no válida: ' . htmlspecialchars($action));
    }
} catch (Throwable $e) {
    error_log('ejecucion_ot_api error: ' . $e->getMessage());
    $msg = (defined('APP_ENV') && APP_ENV === 'development') ? $e->getMessage() : 'Error interno del servidor';
    jsonResponse('error', $msg);
}

// ============================================================================
// IMPLEMENTACIÓN
// ============================================================================

function listarOts(int $empleadoId, ?string $estado): void
{
    if ($empleadoId <= 0) jsonResponse('error', 'empleado_id requerido');
    $sql = "SELECT ot.id, ot.estado, ot.fecha, ot.hora_inicio_procesos, ot.hora_fin_procesos,
                   ot.descripcion_problema, ot.prioridad, ot.recepcion_id, ot.vehiculo_id,
                   ru.vehiculo_patente, ru.vehiculo_marca, ru.vehiculo_modelo, ru.vehiculo_anio,
                   ru.cliente_nombre, ru.cliente_apellido, ru.cliente_telefono,
                   v.patente AS veh_patente, v.marca AS veh_marca, v.modelo AS veh_modelo, v.anio AS veh_anio,
                   c.nombre AS cli_nombre, c.apellido AS cli_apellido, c.telefono AS cli_telefono
            FROM orden_trabajo ot
            LEFT JOIN recepcion_unificada ru ON ru.id = ot.recepcion_id
            LEFT JOIN vehiculos v ON v.id = ot.vehiculo_id
            LEFT JOIN clientes  c ON c.id = ot.cliente_id
            WHERE ot.asignado_empleado_id = :emp";
    $params = [':emp' => $empleadoId];
    if ($estado === 'pendiente') {
        $sql .= " AND ot.estado = 'abierta'";
    } elseif ($estado === 'en_progreso') {
        $sql .= " AND ot.estado IN ('proceso','en_progreso','diagnostico')";
    } else {
        $sql .= " AND ot.estado IN ('abierta','proceso','en_progreso','diagnostico')";
    }
    $sql .= " ORDER BY (ot.estado IN ('proceso','en_progreso','diagnostico')) DESC, ot.fecha DESC, ot.id DESC";
    $stmt = $GLOBALS['conn']->prepare($sql);
    $stmt->execute($params);
    jsonResponse('success', 'OK', $stmt->fetchAll());
}

function listarTodas(): void
{
    $sql = "SELECT ot.id, ot.estado, ot.fecha, ot.hora_inicio_procesos, ot.hora_fin_procesos,
                   ot.descripcion_problema, ot.prioridad, ot.recepcion_id, ot.vehiculo_id,
                   ot.asignado_empleado_id,
                   ru.vehiculo_patente, ru.vehiculo_marca, ru.vehiculo_modelo, ru.vehiculo_anio,
                   ru.cliente_nombre, ru.cliente_apellido, ru.cliente_telefono,
                   v.patente AS veh_patente, v.marca AS veh_marca, v.modelo AS veh_modelo, v.anio AS veh_anio,
                   c.nombre AS cli_nombre, c.apellido AS cli_apellido, c.telefono AS cli_telefono,
                   e.nombre AS emp_nombre, e.apellido AS emp_apellido
            FROM orden_trabajo ot
            LEFT JOIN recepcion_unificada ru ON ru.id = ot.recepcion_id
            LEFT JOIN vehiculos v ON v.id = ot.vehiculo_id
            LEFT JOIN clientes  c ON c.id = ot.cliente_id
            LEFT JOIN empleados e ON e.id = ot.asignado_empleado_id
            WHERE ot.estado IN ('abierta','proceso','en_progreso','diagnostico','finalizado')
            ORDER BY FIELD(ot.estado, 'proceso','diagnostico','abierta','finalizado'),
                     ot.fecha DESC, ot.id DESC";
    $stmt = $GLOBALS['conn']->prepare($sql);
    $stmt->execute();
    jsonResponse('success', 'OK', $stmt->fetchAll());
}

function cargarOt(int $otId): void
{
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $conn = $GLOBALS['conn'];

    $stmt = $conn->prepare(
        "SELECT ot.*, ot.hora_inicio_procesos AS hora_inicio, ot.hora_fin_procesos AS hora_fin,
                v.patente, v.marca, v.modelo, v.anio, v.color, v.vin, v.combustible,
                v.kilometraje AS vehiculo_kilometraje,
                c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.rut AS cliente_rut,
                c.telefono AS cliente_telefono, c.correo AS cliente_correo,
                ru.vehiculo_kilometraje AS recep_kilometraje, ru.insp_observaciones_generales,
                ru.alerta_pernos_rodados, ru.alerta_falla_red
         FROM orden_trabajo ot
         LEFT JOIN vehiculos v ON v.id = ot.vehiculo_id
         LEFT JOIN clientes  c ON c.id = ot.cliente_id
         LEFT JOIN recepcion_unificada ru ON ru.id = ot.recepcion_id
         WHERE ot.id = :id LIMIT 1"
    );
    $stmt->execute([':id' => $otId]);
    $ot = $stmt->fetch();
    if (!$ot) jsonResponse('error', 'OT no encontrada');

    // Items del checklist con multimedia
    $items = [];
    try {
        $itemsStmt = $conn->prepare(
            "SELECT * FROM orden_trabajo_items WHERE orden_trabajo_id = :id ORDER BY es_imprevisto, id"
        );
        $itemsStmt->execute([':id' => $otId]);
        $items = $itemsStmt->fetchAll();
        $ejecStmt = $conn->prepare(
            "SELECT ce.id AS ejecucion_id, ce.nombre AS checklist_nombre, ce.estado AS checklist_estado,
                    ce.porcentaje_completado
             FROM checklist_ejecucion ce
             WHERE ce.ot_item_id = :oti LIMIT 1"
        );
        $pasosStmt = $conn->prepare(
            "SELECT cep.id, cep.plantilla_paso_id, cep.orden, cep.titulo, cep.descripcion,
                    cep.completado, cep.notas, cep.completado_por, cep.completado_en
             FROM checklist_ejecucion_pasos cep
             WHERE cep.ejecucion_id = :eid
             ORDER BY cep.orden"
        );
        $pasoFotosStmt = $conn->prepare(
            "SELECT id, ruta_archivo, nombre_original, creado
             FROM checklist_paso_fotos WHERE paso_id = :pid ORDER BY creado ASC"
        );
        $pasoVozStmt = $conn->prepare(
            "SELECT id, ruta_archivo, nombre_original, duracion_segundos, creado
             FROM checklist_paso_notas_voz WHERE paso_id = :pid ORDER BY creado ASC"
        );
        $pasoVideoStmt = $conn->prepare(
            "SELECT id, ruta_archivo, nombre_original, duracion_segundos, thumbnail_url, creado
             FROM checklist_paso_videos WHERE paso_id = :pid ORDER BY creado ASC"
        );
        foreach ($items as &$it) {
            $it['es_imprevisto']  = (int)$it['es_imprevisto'];
            $it['completado']     = (int)$it['completado'];
            $it['cantidad']       = (int)$it['cantidad'];
            $it['valor_unitario'] = (int)$it['valor_unitario'];
            $it['fotos']    = getMultimedia('ot_item_foto', (int)$it['id'], $conn);
            $it['audios']   = getMultimedia('ot_item_audio', (int)$it['id'], $conn);
            $it['evidencias'] = array_merge($it['fotos'], $it['audios']);
            // Checklist del servicio (si existe plantilla vinculada)
            $it['checklist'] = null;
            if ($it['tipo'] === 'servicio') {
                try {
                    $ejecStmt->execute([':oti' => (int)$it['id']]);
                    $ejec = $ejecStmt->fetch();
                    if ($ejec) {
                        $pasosStmt->execute([':eid' => (int)$ejec['ejecucion_id']]);
                        $pasos = $pasosStmt->fetchAll();
                        foreach ($pasos as &$pa) {
                            $pa['completado'] = (int)$pa['completado'];
                            // Load fotos and voice notes per step
                            $pasoFotosStmt->execute([':pid' => (int)$pa['id']]);
                            $pa['fotos'] = $pasoFotosStmt->fetchAll();
                            $pasoVozStmt->execute([':pid' => (int)$pa['id']]);
                            $pa['notas_voz'] = $pasoVozStmt->fetchAll();
                            $pasoVideoStmt->execute([':pid' => (int)$pa['id']]);
                            $pa['videos'] = $pasoVideoStmt->fetchAll();
                        }
                        unset($pa);
                        $it['checklist'] = [
                            'ejecucion_id' => (int)$ejec['ejecucion_id'],
                            'nombre'       => $ejec['checklist_nombre'],
                            'estado'       => $ejec['checklist_estado'],
                            'porcentaje'   => (int)$ejec['porcentaje_completado'],
                            'pasos'        => $pasos,
                        ];
                    }
                } catch (Throwable $e) {
                    error_log('cargar_ot checklist item ' . $it['id'] . ': ' . $e->getMessage());
                }
            }
        }
        unset($it);
    } catch (Throwable $e) { error_log('cargar_ot items: ' . $e->getMessage()); }

    // Multimedia de OT
    $fotos = [];
    $notasVoz = [];
    try {
        $multimedias = getMultimedia('orden_trabajo', $otId, $conn);
        $fotos     = array_values(array_filter($multimedias, fn($m) => $m['tipo_archivo'] === 'foto'));
        $notasVoz  = array_values(array_filter($multimedias, fn($m) => $m['tipo_archivo'] === 'nota_voz'));
    } catch (Throwable $e) { error_log('cargar_ot multimedia: ' . $e->getMessage()); }

    // Recepción (entity_tipo = 'recepcion_unificada' en archivos_multimedia)
    $recepcion = null;
    $recepFotos = [];
    $recepNotasVoz = [];
    if (!empty($ot['recepcion_id'])) {
        try {
            $recepMult = getMultimedia('recepcion_unificada', (int)$ot['recepcion_id'], $conn);
            $recepFotos    = array_values(array_filter($recepMult, fn($m) => $m['tipo_archivo'] === 'foto'));
            $recepNotasVoz = array_values(array_filter($recepMult, fn($m) => $m['tipo_archivo'] === 'nota_voz'));
            $rStmt = $conn->prepare("SELECT * FROM recepcion_unificada WHERE id = :id");
            $rStmt->execute([':id' => (int)$ot['recepcion_id']]);
            $recepcion = $rStmt->fetch();
        } catch (Throwable $e) { error_log('cargar_ot recepcion: ' . $e->getMessage()); }
    }

    // Inspección visual — los datos viven en recepcion_unificada (columnas insp_*)
    $inspeccion = null;
    if (!empty($ot['recepcion_id'])) {
        try {
            $iStmt = $conn->prepare(
                "SELECT insp_pintura_frontal, insp_pintura_lateral_izq, insp_pintura_lateral_der,
                        insp_pintura_trasera, insp_pintura_techo, insp_parabrisas_del, insp_parabrisas_tras,
                        insp_espejos, insp_focos_del, insp_focos_tras, insp_parachoque_del, insp_parachoque_tras,
                        insp_neumaticos_del, insp_neumaticos_tras, insp_tapiz_piloto, insp_tapiz_copiloto,
                        insp_tapiz_trasero, insp_alfombras, insp_tablero, insp_cinturones,
                        insp_motor_enciende, insp_nivel_aceite, insp_nivel_refrigerante, insp_bateria,
                        insp_correas, insp_rueda_repuesto, insp_gata, insp_chaleco, insp_triangulo,
                        insp_botiquin, insp_extintor, insp_ralladuras, insp_abollones, insp_observaciones_generales
                 FROM recepcion_unificada WHERE id = :rid LIMIT 1"
            );
            $iStmt->execute([':rid' => (int)$ot['recepcion_id']]);
            $inspeccion = $iStmt->fetch();
            if ($inspeccion && !array_filter($inspeccion)) $inspeccion = null;
        } catch (Throwable $e) { error_log('cargar_ot inspeccion: ' . $e->getMessage()); }
    }

    // Repuestos solicitados
    $repuestos = [];
    try {
        $repStmt = $conn->prepare(
            "SELECT r.*, a.nombre AS articulo_nombre, i.nombre AS insumo_nombre,
                    e.nombre AS emp_nombre, e.apellido AS emp_apellido
             FROM ot_repuestos_solicitados r
             LEFT JOIN articulos a ON a.id = r.articulo_id
             LEFT JOIN insumos   i ON i.id = r.insumo_id
             LEFT JOIN empleados e ON e.id = r.solicitado_por
             WHERE r.ot_id = :id
             ORDER BY r.creado DESC"
        );
        $repStmt->execute([':id' => $otId]);
        $repuestos = $repStmt->fetchAll();
    } catch (Throwable $e) { error_log('cargar_ot repuestos: ' . $e->getMessage()); }

    // Apoyo técnico (busca por marca+modelo, tolerante a errores)
    $apoyo = [];
    if (!empty($ot['vehiculo_id'])) {
        try {
            $marca = $ot['marca'] ?? null;
            $modelo = $ot['modelo'] ?? null;
            if ($marca && $modelo) {
                $aStmt = $conn->prepare(
                    "SELECT a.* FROM apoyo_tecnico a
                     WHERE a.vehiculo_marca = :marca
                       AND a.vehiculo_modelo = :modelo
                     ORDER BY a.nombre"
                );
                $aStmt->execute([':marca' => $marca, ':modelo' => $modelo]);
                $apoyo = $aStmt->fetchAll();
                foreach ($apoyo as &$a) {
                    $a['archivos'] = getMultimedia('apoyo_tecnico', (int)$a['id'], $conn);
                }
                unset($a);
            }
            // Also load files uploaded from vehicle module (entidad_tipo='apoyo_tecnico', entidad_id=vehiculo_id)
            $vehApoyoStmt = $conn->prepare(
                "SELECT * FROM archivos_multimedia
                 WHERE entidad_tipo = 'apoyo_tecnico' AND entidad_id = :vid
                 ORDER BY creado DESC"
            );
            $vehApoyoStmt->execute([':vid' => (int)$ot['vehiculo_id']]);
            $vehApoyoFiles = $vehApoyoStmt->fetchAll();
            if (!empty($vehApoyoFiles)) {
                // Create a virtual apoyo entry for vehicle-level files if not already linked
                $existingApoyoIds = array_column($apoyo, 'id');
                $foundLinked = false;
                foreach ($apoyo as &$a) {
                    $aFiles = $a['archivos'] ?? [];
                    foreach ($vehApoyoFiles as $vf) {
                        $alreadyLinked = false;
                        foreach ($aFiles as $af) { if ($af['id'] == $vf['id']) { $alreadyLinked = true; break; } }
                        if (!$alreadyLinked) $a['archivos'][] = $vf;
                    }
                }
                unset($a);
                // If no apoyo records match, create a virtual entry for vehicle files
                if (empty($apoyo) && !empty($vehApoyoFiles)) {
                    $apoyo[] = [
                        'id' => 0,
                        'nombre' => 'Apoyo del Vehículo',
                        'vehiculo_marca' => $marca,
                        'vehiculo_modelo' => $modelo,
                        'archivos' => $vehApoyoFiles,
                        '_virtual' => true,
                    ];
                }
            }
        } catch (Throwable $e) { error_log('cargar_ot apoyo: ' . $e->getMessage()); }
    }

    // Etapas (puede fallar si tabla no existe aún)
    $etapas = [];
    try {
        // Verificar que la tabla existe
        $tableCheck = $conn->query("SHOW TABLES LIKE 'ot_etapas'")->fetch();
        if ($tableCheck) {
            $etapasStmt = $conn->prepare(
                "SELECT * FROM ot_etapas WHERE orden_trabajo_id = :id ORDER BY orden ASC"
            );
            $etapasStmt->execute([':id' => $otId]);
            $etapas = $etapasStmt->fetchAll();
        }
    } catch (Throwable $e) { error_log('cargar_ot etapas: ' . $e->getMessage()); }

    // Diagnóstico vinculado
    $diagnostico = null;
    try {
        $diagStmt = $conn->prepare(
            "SELECT id, causa_raiz, diagnostico_final, recomendaciones, estado
             FROM diagnosticos WHERE ot_id = :ot_id ORDER BY fecha DESC LIMIT 1"
        );
        $diagStmt->execute([':ot_id' => $otId]);
        $diagnostico = $diagStmt->fetch();
    } catch (Throwable $e) { error_log('cargar_ot diagnostico: ' . $e->getMessage()); }

    // Notas de la OT
    $notas = $ot['notas_adicionales'] ?? '';

    jsonResponse('success', 'OK', [
        'ot'         => $ot,
        'items'      => $items,
        'fotos'      => $fotos,
        'notas_voz'  => $notasVoz,
        'recepcion'  => $recepcion,
        'recep_fotos'      => $recepFotos,
        'recep_notas_voz'  => $recepNotasVoz,
        'inspeccion' => $inspeccion,
        'repuestos'  => $repuestos,
        'apoyo'      => $apoyo,
        'etapas'     => $etapas,
        'diagnostico' => $diagnostico,
        'notas'      => $notas,
    ]);
}

function clockIn(int $otId): void
{
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $empleadoId = isset($_POST['empleado_id']) ? (int)$_POST['empleado_id'] : 0;
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT id, estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if ($ot['estado'] !== 'abierta' && $ot['estado'] !== 'proceso') {
            throw new RuntimeException('Solo se puede iniciar trabajo desde estado abierta o proceso');
        }
        $conn->prepare(
            "UPDATE orden_trabajo
             SET estado = 'proceso',
                 hora_inicio_procesos = COALESCE(hora_inicio_procesos, NOW()),
                 fecha_inicio_trabajo = COALESCE(fecha_inicio_trabajo, CURDATE()),
                 hora_inicio_trabajo = COALESCE(hora_inicio_trabajo, CURTIME()),
                 asignado_empleado_id = COALESCE(:emp, asignado_empleado_id)
             WHERE id = :id"
        )->execute([':id' => $otId, ':emp' => $empleadoId > 0 ? $empleadoId : null]);
        historialInsert('ot', $otId, 'clock_in', 'estado', $ot['estado'], 'proceso', $conn);
        if ($empleadoId > 0) {
            historialInsert('ot', $otId, 'asignado', 'asignado_empleado_id', null, $empleadoId, $conn);
        }
        $conn->commit();
        jsonResponse('success', 'Trabajo iniciado');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function clockOut(int $otId): void
{
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT id, estado, hora_inicio_trabajo, hora_inicio_procesos FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if (!in_array($ot['estado'], ['proceso', 'diagnostico'], true)) {
            throw new RuntimeException('Solo se puede cerrar una OT en proceso o diagnóstico');
        }
        $check = $conn->prepare(
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN estado_item='completado' THEN 1 ELSE 0 END) AS completados,
                    SUM(CASE WHEN es_imprevisto=1 THEN 1 ELSE 0 END) AS imprevistos
             FROM orden_trabajo_items WHERE orden_trabajo_id = :id"
        );
        $check->execute([':id' => $otId]);
        $row = $check->fetch();
        if ((int)$row['total'] === 0) {
            throw new RuntimeException('La OT no tiene ítems en el checklist');
        }
        if ((int)$row['completados'] < (int)$row['total']) {
            throw new RuntimeException('Todos los ítems deben estar completados');
        }

        // Calcular tiempo de la OT
        $horaInicio = $ot['hora_inicio_trabajo'] ?? $ot['hora_inicio_procesos'] ?? null;
        $ahora = date('Y-m-d H:i:s');
        $duracionTotalMin = 0;
        if ($horaInicio) {
            $ini = new DateTime($horaInicio);
            $fin = new DateTime($ahora);
            $duracionTotalMin = round(($fin->getTimestamp() - $ini->getTimestamp()) / 60, 2);
        }

        // Capturar tiempo por cada item completado
        try {
            $conn->prepare(
                "UPDATE orden_trabajo_items
                 SET hora_fin_item = NOW(),
                     duracion_minutos = CASE
                         WHEN :inicio IS NOT NULL THEN ROUND(TIMESTAMPDIFF(SECOND, :inicio2, NOW()) / 60, 2)
                         ELSE NULL
                     END
                 WHERE orden_trabajo_id = :ot AND estado_item = 'completado'"
            )->execute([
                ':inicio'  => $horaInicio,
                ':inicio2' => $horaInicio,
                ':ot'      => $otId,
            ]);
        } catch (Exception $e) {
            error_log('clockOut item time tracking: ' . $e->getMessage());
        }

        $horasTrabajadas = $duracionTotalMin > 0 ? round($duracionTotalMin / 60, 2) : 0;
        $conn->prepare(
            "UPDATE orden_trabajo
             SET estado = 'finalizado',
                 hora_fin_procesos = NOW(),
                 fecha_fin_trabajo = COALESCE(fecha_fin_trabajo, CURDATE()),
                 hora_fin_trabajo = COALESCE(hora_fin_trabajo, CURTIME()),
                 total_horas = :horas
             WHERE id = :id"
        )->execute([':horas' => $horasTrabajadas, ':id' => $otId]);
        historialInsert('ot', $otId, 'clock_out', 'estado', $ot['estado'], 'finalizado', $conn);
        historialInsert('ot', $otId, 'clock_out', 'imprevistos', null, (int)$row['imprevistos'], $conn);
        if ($duracionTotalMin > 0) {
            historialInsert('ot', $otId, 'clock_out', 'duracion_minutos', null, $duracionTotalMin, $conn);
        }
        $conn->commit();
        jsonResponse('success', 'OT cerrada para liquidación', [
            'duracion_minutos' => $duracionTotalMin,
            'items_completados' => (int)$row['completados'],
        ]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function actualizarItemEstado(): void
{
    $itemId = (int)($_POST['item_id'] ?? 0);
    $estado = $_POST['estado_item'] ?? '';
    $labores = $_POST['labores'] ?? null;
    if ($itemId <= 0) jsonResponse('error', 'item_id requerido');
    if (!in_array($estado, ['pendiente', 'en_proceso', 'completado'], true)) {
        jsonResponse('error', 'estado_item inválido');
    }
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare(
            "SELECT i.id, i.estado_item, i.completado, i.orden_trabajo_id, ot.estado AS ot_estado
             FROM orden_trabajo_items i JOIN orden_trabajo ot ON ot.id = i.orden_trabajo_id
             WHERE i.id = :id FOR UPDATE"
        );
        $stmt->execute([':id' => $itemId]);
        $item = $stmt->fetch();
        if (!$item) throw new RuntimeException('Ítem no encontrado');
        if ($item['ot_estado'] === 'finalizado') {
            throw new RuntimeException('La OT está finalizada');
        }
        $completado = $estado === 'completado' ? 1 : 0;
        $laboresClause = '';
        $params = [':e' => $estado, ':c' => $completado, ':id' => $itemId];
        if ($estado === 'completado') {
            $laboresTrim = trim((string)$labores);
            if ($laboresTrim === '') {
                throw new RuntimeException('Debe registrar las labores realizadas para marcar como completado');
            }
            $params[':l'] = $laboresTrim;
            $laboresClause = ', labores_realizadas = :l';
        }
        $conn->prepare(
            "UPDATE orden_trabajo_items SET estado_item = :e, completado = :c $laboresClause WHERE id = :id"
        )->execute($params);
        historialInsert('ot_item', $itemId, 'estado_item', 'estado_item', $item['estado_item'], $estado, $conn);
        if ($estado === 'completado') {
            historialInsert('ot', (int)$item['orden_trabajo_id'], 'item_completado', 'item_id', null, $itemId, $conn);
        }
        $conn->commit();
        jsonResponse('success', 'Estado actualizado');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function guardarLabores(): void
{
    $itemId = (int)($_POST['item_id'] ?? 0);
    $labores = trim((string)($_POST['labores'] ?? ''));
    if ($itemId <= 0) jsonResponse('error', 'item_id requerido');
    if ($labores === '') jsonResponse('error', 'labores requeridas');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare(
            "SELECT i.id, i.estado_item, i.orden_trabajo_id, ot.estado AS ot_estado
             FROM orden_trabajo_items i JOIN orden_trabajo ot ON ot.id = i.orden_trabajo_id
             WHERE i.id = :id FOR UPDATE"
        );
        $stmt->execute([':id' => $itemId]);
        $item = $stmt->fetch();
        if (!$item) throw new RuntimeException('Ítem no encontrado');
        if ($item['ot_estado'] === 'finalizado') {
            throw new RuntimeException('La OT está finalizada');
        }
        $conn->prepare("UPDATE orden_trabajo_items SET labores_realizadas = :l WHERE id = :id")
             ->execute([':l' => $labores, ':id' => $itemId]);
        $archivos = 0;
        if (!empty($_FILES['archivos']['name'][0])) {
            $archivos = uploadMultimedia($_FILES['archivos'], 'ot_item_foto', $itemId, $conn);
        }
        historialInsert('ot_item', $itemId, 'labores', null, null, $labores, $conn);
        $conn->commit();
        jsonResponse('success', 'Labores guardadas', ['archivos_subidos' => $archivos]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function agregarImprevisto(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $itemId = (int)($_POST['item_id'] ?? 0);
    if ($otId <= 0 || $itemId <= 0) jsonResponse('error', 'ot_id e item_id requeridos');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if (!in_array($ot['estado'], ['proceso', 'en_progreso', 'diagnostico'], true)) {
            throw new RuntimeException('Solo se pueden agregar imprevistos en OT en proceso');
        }
        $sStmt = $conn->prepare("SELECT nombre FROM trabajos_servicios WHERE id = :id");
        $sStmt->execute([':id' => $itemId]);
        $srv = $sStmt->fetch();
        if (!$srv) throw new RuntimeException('Servicio no encontrado');
        $conn->prepare(
            "INSERT INTO orden_trabajo_items
             (orden_trabajo_id, tipo, seccion, item_id, nombre, detalle, cantidad, valor_unitario,
              completado, consumido, es_imprevisto, estado_item, item_origen_id)
             VALUES (:ot, 'servicio', 'servicio', :iid, :nom, '', 1, 0,
              0, 0, 1, 'pendiente', :iorig)"
        )->execute([
            ':ot'    => $otId,
            ':iid'   => $itemId,
            ':nom'   => $srv['nombre'],
            ':iorig' => $itemId,
        ]);
        $newId = (int)$conn->lastInsertId();
        historialInsert('ot_item', $newId, 'imprevisto_agregado', null, null, $srv['nombre'], $conn);
        historialInsert('ot', $otId, 'imprevisto_agregado', 'item_id', null, $newId, $conn);
        $conn->commit();
        jsonResponse('success', 'Imprevisto agregado', ['item_id' => $newId]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function agregarServicioItem(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $itemId = (int)($_POST['item_id'] ?? 0);
    $esImprevisto = (int)($_POST['es_imprevisto'] ?? 0);
    if ($otId <= 0 || $itemId <= 0) jsonResponse('error', 'ot_id e item_id requeridos');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if (in_array($ot['estado'], ['finalizado', 'cancelado'], true)) {
            throw new RuntimeException('OT finalizada o cancelada');
        }
        $sStmt = $conn->prepare("SELECT nombre FROM trabajos_servicios WHERE id = :id");
        $sStmt->execute([':id' => $itemId]);
        $srv = $sStmt->fetch();
        if (!$srv) throw new RuntimeException('Servicio no encontrado');
        $conn->prepare(
            "INSERT INTO orden_trabajo_items
             (orden_trabajo_id, tipo, seccion, item_id, nombre, detalle, cantidad, valor_unitario,
              completado, consumido, es_imprevisto, estado_item, item_origen_id)
             VALUES (:ot, 'servicio', 'servicio', :iid, :nom, '', 1, 0,
              0, 0, :imp, 'pendiente', :iorig)"
        )->execute([
            ':ot'    => $otId,
            ':iid'   => $itemId,
            ':nom'   => $srv['nombre'],
            ':imp'   => $esImprevisto,
            ':iorig' => $itemId,
        ]);
        $newItemId = (int)$conn->lastInsertId();

        // Auto-crear checklist ejecución desde plantilla del servicio (o vacío si no hay plantilla)
        try {
            $pStmt = $conn->prepare(
                "SELECT id, nombre FROM checklist_plantilla WHERE servicio_id = :sid AND activo = 1 LIMIT 1"
            );
            $pStmt->execute([':sid' => $itemId]);
            $plantilla = $pStmt->fetch();
            $checklistNombre = $plantilla ? $plantilla['nombre'] : 'Checklist: ' . $srv['nombre'];
            $conn->prepare(
                "INSERT INTO checklist_ejecucion
                 (diagnostico_servicio_id, ot_item_id, checklist_plantilla_id, nombre, estado, porcentaje_completado)
                 VALUES (NULL, :oti, :cpid, :nom, 'pendiente', 0)"
            )->execute([
                ':oti'  => $newItemId,
                ':cpid' => $plantilla ? $plantilla['id'] : null,
                ':nom'  => $checklistNombre,
            ]);
            $ejecId = (int)$conn->lastInsertId();

            // Si hay plantilla, copiar sus pasos
            if ($plantilla) {
                $pasosStmt = $conn->prepare(
                    "SELECT id, orden, titulo, descripcion, requiere_foto, requiere_nota_voz
                     FROM checklist_plantilla_pasos
                     WHERE checklist_id = :cid
                     ORDER BY orden"
                );
                $pasosStmt->execute([':cid' => $plantilla['id']]);
                $pasoInsert = $conn->prepare(
                    "INSERT INTO checklist_ejecucion_pasos
                     (ejecucion_id, plantilla_paso_id, orden, titulo, descripcion, completado)
                     VALUES (:eid, :ppid, :ord, :tit, :desc, 0)"
                );
                while ($paso = $pasosStmt->fetch()) {
                    $pasoInsert->execute([
                        ':eid'  => $ejecId,
                        ':ppid' => $paso['id'],
                        ':ord'  => $paso['orden'],
                        ':tit'  => $paso['titulo'],
                        ':desc' => $paso['descripcion'] ?? '',
                    ]);
                }
            }
        } catch (Throwable $e) {
            error_log('agregarServicioItem checklist auto-create: ' . $e->getMessage());
        }

        $conn->commit();
        jsonResponse('success', 'Servicio agregado', ['item_id' => $newItemId]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function agregarRepuestoItem(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $nombre = sanitizeString($_POST['nombre'] ?? '', 200);
    $seccion = $_POST['seccion'] ?? 'repuesto_taller';
    $cantidad = max(1, (int)($_POST['cantidad'] ?? 1));
    $valor = max(0, (int)($_POST['valor'] ?? 0));
    if ($otId <= 0 || $nombre === '') jsonResponse('error', 'ot_id y nombre requeridos');
    if (!in_array($seccion, ['repuesto_taller', 'repuesto_cliente'], true)) $seccion = 'repuesto_taller';
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if (in_array($ot['estado'], ['finalizado', 'cancelado'], true)) {
            throw new RuntimeException('OT finalizada o cancelada');
        }
        $conn->prepare(
            "INSERT INTO orden_trabajo_items
             (orden_trabajo_id, tipo, seccion, nombre, cantidad, valor_unitario,
              completado, consumido, es_imprevisto, estado_item)
             VALUES (:ot, 'articulo', :sec, :nombre, :cant, :val,
              0, 0, 0, 'pendiente')"
        )->execute([
            ':ot'   => $otId,
            ':sec'  => $seccion,
            ':nombre' => $nombre,
            ':cant' => $cantidad,
            ':val'  => $valor,
        ]);
        $newId = (int)$conn->lastInsertId();
        $conn->commit();
        jsonResponse('success', 'Repuesto agregado', ['item_id' => $newId]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function agregarServicioRapido(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $nombre = sanitizeString($_POST['nombre'] ?? '', 200);
    $descripcion = sanitizeString($_POST['descripcion'] ?? '', 1000);
    $pasosJson = $_POST['pasos'] ?? '[]';
    if ($otId <= 0 || $nombre === '') jsonResponse('error', 'ot_id y nombre requeridos');
    $pasos = json_decode($pasosJson, true);
    if (!is_array($pasos)) $pasos = [];
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if (in_array($ot['estado'], ['finalizado', 'cancelado'], true)) {
            throw new RuntimeException('OT finalizada o cancelada');
        }

        // Crear servicio en trabajos_servicios para que aparezca en el catálogo
        $srvStmt = $conn->prepare(
            "INSERT INTO trabajos_servicios (nombre, descripcion, tipo, valor_trabajo)
             VALUES (:nom, :det, 'Servicio Rápido', 0)"
        );
        $srvStmt->execute([':nom' => $nombre, ':det' => $descripcion]);
        $servicioId = (int)$conn->lastInsertId();

        $conn->prepare(
            "INSERT INTO orden_trabajo_items
             (orden_trabajo_id, tipo, seccion, item_id, nombre, detalle, cantidad, valor_unitario,
              completado, consumido, es_imprevisto, estado_item)
             VALUES (:ot, 'servicio', 'servicio', :iid, :nom, :det, 1, 0,
              0, 0, 0, 'pendiente')"
        )->execute([
            ':ot'   => $otId,
            ':iid'  => $servicioId,
            ':nom'  => $nombre,
            ':det'  => $descripcion,
        ]);
        $newItemId = (int)$conn->lastInsertId();
        historialInsert('ot_item', $newItemId, 'servicio_rapido_creado', null, null, $nombre, $conn);

        // Crear checklist ejecución con los pasos proporcionados
        if (count($pasos) > 0) {
            $conn->prepare(
                "INSERT INTO checklist_ejecucion
                 (diagnostico_servicio_id, ot_item_id, nombre, estado, porcentaje_completado)
                 VALUES (NULL, :oti, :nom, 'pendiente', 0)"
            )->execute([
                ':oti' => $newItemId,
                ':nom' => 'Checklist: ' . $nombre,
            ]);
            $ejecId = (int)$conn->lastInsertId();
            $pasoInsert = $conn->prepare(
                "INSERT INTO checklist_ejecucion_pasos
                 (ejecucion_id, orden, titulo, completado)
                 VALUES (:eid, :ord, :tit, 0)"
            );
            foreach ($pasos as $i => $pasoTitulo) {
                $pasoTitulo = trim((string)$pasoTitulo);
                if ($pasoTitulo === '') continue;
                $pasoInsert->execute([
                    ':eid' => $ejecId,
                    ':ord' => $i + 1,
                    ':tit' => $pasoTitulo,
                ]);
            }
        }

        $conn->commit();
        jsonResponse('success', 'Servicio rápido agregado', ['item_id' => $newItemId, 'servicio_id' => $servicioId]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function eliminarItemImprevisto(): void
{
    $itemId = (int)($_POST['item_id'] ?? 0);
    if ($itemId <= 0) jsonResponse('error', 'item_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare(
            "SELECT i.id, i.es_imprevisto, i.orden_trabajo_id, ot.estado AS ot_estado
             FROM orden_trabajo_items i JOIN orden_trabajo ot ON ot.id = i.orden_trabajo_id
             WHERE i.id = :id FOR UPDATE"
        );
        $stmt->execute([':id' => $itemId]);
        $it = $stmt->fetch();
        if (!$it) throw new RuntimeException('Ítem no encontrado');
        if ((int)$it['es_imprevisto'] !== 1) throw new RuntimeException('Solo se pueden eliminar imprevistos');
        if ($it['ot_estado'] === 'finalizado') throw new RuntimeException('La OT está finalizada');
        $conn->prepare("DELETE FROM orden_trabajo_items WHERE id = :id")->execute([':id' => $itemId]);
        $conn->commit();
        jsonResponse('success', 'Imprevisto eliminado');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

// ─── MULTIMEDIA POR ITEM ───────────────────────────────────────────────────

function agregarItemFoto(): void
{
    $itemId = (int)($_POST['item_id'] ?? 0);
    if ($itemId <= 0) jsonResponse('error', 'item_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare(
            "SELECT i.id, ot.estado FROM orden_trabajo_items i
             JOIN orden_trabajo ot ON ot.id = i.orden_trabajo_id
             WHERE i.id = :id FOR UPDATE"
        );
        $stmt->execute([':id' => $itemId]);
        $it = $stmt->fetch();
        if (!$it) throw new RuntimeException('Ítem no encontrado');
        if ($it['estado'] === 'finalizado') throw new RuntimeException('OT finalizada');
        if (empty($_FILES['archivos']['name'][0])) throw new RuntimeException('Sin archivos');
        $count = uploadMultimedia($_FILES['archivos'], 'ot_item_foto', $itemId, $conn);
        $conn->commit();
        jsonResponse('success', 'Foto agregada', ['archivos_subidos' => $count]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function eliminarItemFoto(): void
{
    $evId = (int)($_POST['evidencia_id'] ?? 0);
    $itemId = (int)($_POST['item_id'] ?? 0);
    if ($evId <= 0 || $itemId <= 0) jsonResponse('error', 'evidencia_id e item_id requeridos');
    $conn = $GLOBALS['conn'];
    $stmt = $conn->prepare(
        "SELECT am.id, am.ruta_archivo
         FROM archivos_multimedia am
         WHERE am.id = :eid AND ((am.entidad_tipo='ot_item_foto' AND am.entidad_id = :iid) OR (am.entidad_tipo='ot_item_audio' AND am.entidad_id = :iid2))"
    );
    $stmt->execute([':eid' => $evId, ':iid' => $itemId, ':iid2' => $itemId]);
    $ev = $stmt->fetch();
    if (!$ev) jsonResponse('error', 'Evidencia no encontrada');
    if (!empty($ev['ruta_archivo']) && file_exists($ev['ruta_archivo'])) {
        @unlink($ev['ruta_archivo']);
    }
    $conn->prepare("DELETE FROM archivos_multimedia WHERE id = :id")->execute([':id' => $evId]);
    jsonResponse('success', 'Evidencia eliminada');
}

// ─── REPUESTOS ─────────────────────────────────────────────────────────────

function solicitarRepuesto(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $articuloId = normalizeNullableInt($_POST['articulo_id'] ?? null);
    $insumoId = normalizeNullableInt($_POST['insumo_id'] ?? null);
    $cantidad = max(1, (int)($_POST['cantidad'] ?? 1));
    $empleadoId = (int)($_POST['empleado_id'] ?? 0);
    $observacion = sanitizeString($_POST['observacion'] ?? null, 500);
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    if (!$articuloId && !$insumoId) jsonResponse('error', 'articulo_id o insumo_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if ($ot['estado'] === 'finalizado') throw new RuntimeException('La OT está finalizada');
        $conn->prepare(
            "INSERT INTO ot_repuestos_solicitados
             (ot_id, articulo_id, insumo_id, cantidad, estado, solicitado_por, observacion)
             VALUES (:ot, :art, :ins, :cant, 'solicitado', :emp, :obs)"
        )->execute([
            ':ot'   => $otId,
            ':art'  => $articuloId,
            ':ins'  => $insumoId,
            ':cant' => $cantidad,
            ':emp'  => $empleadoId > 0 ? $empleadoId : null,
            ':obs'  => $observacion,
        ]);
        $newId = (int)$conn->lastInsertId();
        historialInsert('ot_repuesto', $newId, 'solicitado', null, null, $cantidad, $conn);
        $conn->commit();
        jsonResponse('success', 'Repuesto solicitado', ['id' => $newId]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function listarRepuestosOt(int $otId): void
{
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $stmt = $GLOBALS['conn']->prepare(
        "SELECT r.*, a.nombre AS articulo_nombre, i.nombre AS insumo_nombre,
                e.nombre AS emp_nombre, e.apellido AS emp_apellido
         FROM ot_repuestos_solicitados r
         LEFT JOIN articulos a ON a.id = r.articulo_id
         LEFT JOIN insumos   i ON i.id = r.insumo_id
         LEFT JOIN empleados e ON e.id = r.solicitado_por
         WHERE r.ot_id = :id ORDER BY r.creado DESC"
    );
    $stmt->execute([':id' => $otId]);
    jsonResponse('success', 'OK', $stmt->fetchAll());
}

function actualizarRepuesto(): void
{
    $id = (int)($_POST['id'] ?? 0);
    $estado = $_POST['estado'] ?? '';
    $observacion = sanitizeString($_POST['observacion'] ?? null, 500);
    if ($id <= 0) jsonResponse('error', 'id requerido');
    if (!in_array($estado, ['solicitado', 'entregado', 'rechazado', 'cancelado'], true)) {
        jsonResponse('error', 'estado inválido');
    }
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT id, estado, ot_id FROM ot_repuestos_solicitados WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $id]);
        $r = $stmt->fetch();
        if (!$r) throw new RuntimeException('Solicitud no encontrada');
        $fechaEntrega = in_array($estado, ['entregado', 'rechazado', 'cancelado'], true) ? ' NOW()' : ' NULL';
        $sql = "UPDATE ot_repuestos_solicitados
                 SET estado = :est, observacion = COALESCE(NULLIF(:obs,''), observacion),
                     fecha_entrega = $fechaEntrega
                 WHERE id = :id";
        $conn->prepare($sql)->execute([':est' => $estado, ':obs' => $observacion, ':id' => $id]);
        historialInsert('ot_repuesto', $id, 'estado', 'estado', $r['estado'], $estado, $conn);
        $conn->commit();
        jsonResponse('success', 'Estado del repuesto actualizado');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function eliminarRepuestoSolicitado(): void
{
    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) jsonResponse('error', 'id requerido');
    $conn = $GLOBALS['conn'];
    $stmt = $conn->prepare("SELECT id, ot_id FROM ot_repuestos_solicitados WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $r = $stmt->fetch();
    if (!$r) jsonResponse('error', 'Solicitud no encontrada');
    $conn->prepare("DELETE FROM ot_repuestos_solicitados WHERE id = :id")->execute([':id' => $id]);
    jsonResponse('success', 'Solicitud eliminada');
}

function crearOCDesdeRepuesto(): void
{
    $repuestoId = (int)($_POST['repuesto_id'] ?? 0);
    if ($repuestoId <= 0) jsonResponse('error', 'repuesto_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare(
            "SELECT r.*, a.nombre AS art_nombre, a.codigo AS art_codigo,
                    i.nombre AS ins_nombre, i.codigo AS ins_codigo
             FROM ot_repuestos_solicitados r
             LEFT JOIN articulos a ON a.id = r.articulo_id
             LEFT JOIN insumos i ON i.id = r.insumo_id
             WHERE r.id = :id FOR UPDATE"
        );
        $stmt->execute([':id' => $repuestoId]);
        $r = $stmt->fetch();
        if (!$r) throw new RuntimeException('Solicitud no encontrada');
        $nombre = $r['art_nombre'] ?? $r['ins_nombre'] ?? 'Repuesto #' . $repuestoId;
        $codigo = $r['art_codigo'] ?? $r['ins_codigo'] ?? '';
        $productoTipo = $r['articulo_id'] ? 'articulo' : 'insumo';
        $productoId = $r['articulo_id'] ?? $r['insumo_id'] ?? null;
        $conn->prepare(
            "INSERT INTO orden_compra (proveedor_id, fecha_emision, estado, subtotal, total, observaciones)
             VALUES (NULL, CURDATE(), 'pendiente', 0, 0, ?)"
        )->execute(['OC generada desde solicitud de repuesto: ' . $nombre]);
        $ocId = (int)$conn->lastInsertId();
        $conn->prepare(
            "INSERT INTO orden_compra_items (orden_compra_id, producto_tipo, producto_id, nombre, cantidad_solicitada, valor_unitario)
             VALUES (?, ?, ?, ?, ?, 0)"
        )->execute([$ocId, $productoTipo, $productoId, $nombre . ($codigo ? " ($codigo)" : ''), (int)$r['cantidad']]);
        $conn->prepare("UPDATE ot_repuestos_solicitados SET oc_id = ? WHERE id = ?")
             ->execute([$ocId, $repuestoId]);
        $conn->commit();
        jsonResponse('success', 'OC creada', ['oc_id' => $ocId]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

// ─── ETAPAS ────────────────────────────────────────────────────────────────

function cargarEtapas(int $otId): void
{
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $stmt = $GLOBALS['conn']->prepare(
        "SELECT * FROM ot_etapas WHERE orden_trabajo_id = :id ORDER BY orden ASC"
    );
    $stmt->execute([':id' => $otId]);
    jsonResponse('success', 'OK', $stmt->fetchAll());
}

function agregarEtapa(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $nombre = sanitizeString($_POST['nombre'] ?? '', 200);
    if ($otId <= 0 || $nombre === '') jsonResponse('error', 'ot_id y nombre requeridos');
    $conn = $GLOBALS['conn'];
    $max = $conn->prepare("SELECT COALESCE(MAX(orden), -1) + 1 FROM ot_etapas WHERE orden_trabajo_id = :id");
    $max->execute([':id' => $otId]);
    $orden = (int)$max->fetchColumn();
    $conn->prepare(
        "INSERT INTO ot_etapas (orden_trabajo_id, nombre, orden, estado)
         VALUES (:ot, :nombre, :orden, 'pendiente')"
    )->execute([':ot' => $otId, ':nombre' => $nombre, ':orden' => $orden]);
    jsonResponse('success', 'Etapa agregada', ['id' => (int)$conn->lastInsertId()]);
}

function actualizarEtapa(): void
{
    $id = (int)($_POST['id'] ?? 0);
    $estado = $_POST['estado'] ?? '';
    $nombre = sanitizeString($_POST['nombre'] ?? '', 200);
    if ($id <= 0) jsonResponse('error', 'id requerido');
    if (!in_array($estado, ['pendiente', 'en_curso', 'completado'], true)) {
        jsonResponse('error', 'estado inválido');
    }
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT id, estado FROM ot_etapas WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $id]);
        $et = $stmt->fetch();
        if (!$et) throw new RuntimeException('Etapa no encontrada');
        $fechas = '';
        if ($estado === 'en_curso' && $et['estado'] !== 'en_curso') {
            $fechas = ', fecha_inicio = NOW()';
        } elseif ($estado === 'completado' && $et['estado'] !== 'completado') {
            $fechas = ', fecha_fin = NOW()';
        }
        $sql = "UPDATE ot_etapas SET estado = :estado" . ($nombre ? ", nombre = :nombre" : "") . " $fechas WHERE id = :id";
        $params = [':estado' => $estado, ':id' => $id];
        if ($nombre) $params[':nombre'] = $nombre;
        $conn->prepare($sql)->execute($params);
        $conn->commit();
        jsonResponse('success', 'Etapa actualizada');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function reordenarEtapas(): void
{
    $ordenes = $_POST['orden'] ?? '';
    if (!is_array($ordenes) || empty($ordenes)) jsonResponse('error', 'orden requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("UPDATE ot_etapas SET orden = :orden WHERE id = :id");
        foreach ($ordenes as $i => $id) {
            $stmt->execute([':orden' => $i, ':id' => (int)$id]);
        }
        $conn->commit();
        jsonResponse('success', 'Orden actualizado');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function eliminarEtapa(): void
{
    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) jsonResponse('error', 'id requerido');
    $conn = $GLOBALS['conn'];
    $conn->prepare("DELETE FROM ot_etapas WHERE id = :id")->execute([':id' => $id]);
    jsonResponse('success', 'Etapa eliminada');
}

// ─── DIAGNÓSTICO ───────────────────────────────────────────────────────────

function diagnosticoVinculado(int $otId): void
{
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $stmt = $GLOBALS['conn']->prepare(
        "SELECT id, causa_raiz, diagnostico_final, recomendaciones, estado, fecha AS fecha_creacion
         FROM diagnosticos WHERE ot_id = :ot_id ORDER BY fecha DESC LIMIT 1"
    );
    $stmt->execute([':ot_id' => $otId]);
    $diagnostico = $stmt->fetch(PDO::FETCH_ASSOC);
    jsonResponse('success', 'OK', $diagnostico ?: null);
}

function guardarDiagnostico(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $causa = sanitizeString($_POST['causa_raiz'] ?? '', 2000);
    $final = sanitizeString($_POST['diagnostico_final'] ?? '', 5000);
    $recom = sanitizeString($_POST['recomendaciones'] ?? '', 2000);
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT id, estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        $stmt = $conn->prepare(
            "SELECT id FROM diagnosticos WHERE ot_id = :ot_id ORDER BY fecha DESC LIMIT 1"
        );
        $stmt->execute([':ot_id' => $otId]);
        $existing = $stmt->fetch();
        if ($existing) {
            $conn->prepare(
                "UPDATE diagnosticos SET causa_raiz = :c, diagnostico_final = :d, recomendaciones = :r,
                 estado = CASE WHEN :dchk != '' THEN 'completado' ELSE estado END
                 WHERE id = :id"
            )->execute([
                ':c' => $causa, ':d' => $final, ':r' => $recom, ':dchk' => $final, ':id' => $existing['id']
            ]);
        } else {
            $conn->prepare(
                "INSERT INTO diagnosticos (ot_id, vehiculo_id, cliente_id, causa_raiz, diagnostico_final,
                 recomendaciones, estado, fecha)
                 SELECT :ot, vehiculo_id, cliente_id, :c, :d, :r,
                 CASE WHEN :d2 != '' THEN 'completado' ELSE 'pendiente' END, CURDATE()
                 FROM orden_trabajo WHERE id = :ot2"
            )->execute([
                ':ot' => $otId, ':c' => $causa, ':d' => $final,
                ':r' => $recom, ':d2' => $final, ':ot2' => $otId
            ]);
        }
        $conn->commit();
        jsonResponse('success', 'Diagnóstico guardado');
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

// ─── AUDIO / NOTAS ─────────────────────────────────────────────────────────

function subirNotaVoz(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $itemId = isset($_POST['item_id']) ? (int)$_POST['item_id'] : null;
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->beginTransaction();
    try {
        $stmt = $conn->prepare("SELECT id, estado FROM orden_trabajo WHERE id = :id FOR UPDATE");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch();
        if (!$ot) throw new RuntimeException('OT no encontrada');
        if ($ot['estado'] === 'finalizado') throw new RuntimeException('La OT está finalizada');
        if (empty($_FILES['archivos']['name'][0])) throw new RuntimeException('Sin archivos');
        $entidadTipo = $itemId ? 'ot_item_audio' : 'orden_trabajo';
        $entidadId = $itemId ?: $otId;
        $count = uploadMultimedia($_FILES['archivos'], $entidadTipo, $entidadId, $conn);
        historialInsert('ot', $otId, 'nota_voz_subida', null, null, $count, $conn);
        $conn->commit();
        jsonResponse('success', 'Audio guardado', ['archivos_subidos' => $count]);
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

function eliminarEvidenciaItem(): void
{
    $evId = (int)($_POST['evidencia_id'] ?? 0);
    if ($evId <= 0) jsonResponse('error', 'evidencia_id requerido');
    $conn = $GLOBALS['conn'];
    $stmt = $conn->prepare(
        "SELECT am.id, am.ruta_archivo FROM archivos_multimedia am WHERE am.id = :id"
    );
    $stmt->execute([':id' => $evId]);
    $ev = $stmt->fetch();
    if (!$ev) jsonResponse('error', 'Evidencia no encontrada');
    if (!empty($ev['ruta_archivo']) && file_exists($ev['ruta_archivo'])) {
        @unlink($ev['ruta_archivo']);
    }
    $conn->prepare("DELETE FROM archivos_multimedia WHERE id = :id")->execute([':id' => $evId]);
    jsonResponse('success', 'Evidencia eliminada');
}

function guardarNotas(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $notas = sanitizeString($_POST['notas'] ?? '', 5000);
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    $conn = $GLOBALS['conn'];
    $conn->prepare("UPDATE orden_trabajo SET notas_adicionales = :n WHERE id = :id")
         ->execute([':n' => $notas, ':id' => $otId]);
    jsonResponse('success', 'Notas guardadas');
}

function agregarComentarioCliente(): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $mensaje = sanitizeString($_POST['mensaje'] ?? '', 2000);
    if ($otId <= 0) jsonResponse('error', 'ot_id requerido');
    if (!$mensaje) jsonResponse('error', 'Mensaje requerido');

    $conn = $GLOBALS['conn'];
    $empleado = currentUser();
    $nombre = $empleado ? ($empleado['nombre'] ?? 'Taller') : 'Taller';

    $conn->prepare("
        INSERT INTO ot_comentarios (ot_id, autor_tipo, autor_nombre, autor_empleado_id, mensaje)
        VALUES (:ot_id, 'tecnico', :nombre, :emp_id, :mensaje)
    ")->execute([
        ':ot_id' => $otId,
        ':nombre' => $nombre,
        ':emp_id' => $empleado['id'] ?? null,
        ':mensaje' => $mensaje,
    ]);

    jsonResponse('success', 'Comentario enviado al cliente', ['id' => $conn->lastInsertId()]);
}
