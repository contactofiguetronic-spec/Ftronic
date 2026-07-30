<?php
/**
 * portal_api.php — API pública para el Portal de Clientes (v2 escalable)
 *
 * Endpoints:
 *   GET  ?action=search&q=<rut|ot>         Buscar OT(s) por RUT o folio_ot
 *   GET  ?action=ejecucion&ot_id=X         Datos completos de ejecución (items, checklists, media, etapas)
 *   GET  ?action=timeline&ot_id=X          Timeline combinada de todos los eventos
 *   GET  ?action=avances&ot_id=X           Avances/progreso de la OT
 *   GET  ?action=comentarios&ot_id=X       Comentarios de la OT
 *   POST ?action=comentar                  Publicar comentario (cliente)
 *   POST ?action=subir_interaccion         Subir archivo (foto/video/nota_voz)
 *   GET  ?action=multimedia&ot_id=X        Multimedia categorizada de la OT
 *   GET  ?action=servicios&ot_id=X         Servicios/checklist de la OT
 *   GET  ?action=presupuesto_detallado&ot_id=X  Presupuesto con items
 *   GET  ?action=updates&ot_id=X&last_id=Y Polling para nuevos comentarios/avances
 *   GET  ?action=config&ot_id=X            Configuración del portal para una OT
 */

require_once '../includes/conexion.php';

$action = $_REQUEST['action'] ?? '';

/**
 * Devuelve la configuración efectiva del portal para una OT específica.
 * Combina la configuración global (portal_config) con los overrides por OT (portal_ot_permisos).
 * Devuelve array asociativo clave => valor (strings para no-bool, bools para flags).
 */
function getPortalConfig(PDO $conn, ?int $otId = null): array
{
    $config = [];
    try {
        $stmt = $conn->query("SELECT clave, valor FROM portal_config");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $config[$r['clave']] = $r['valor'];
        }
        // Booleanos
        foreach ($config as $k => &$v) {
            if (in_array($k, ['titulo_portal','subtitulo_portal','mensaje_bienvenida','color_primario'])) continue;
            $v = ($v === '1' || $v === 'true');
        }
        if ($otId) {
            $stmt = $conn->prepare("SELECT clave, valor FROM portal_ot_permisos WHERE ot_id = :id");
            $stmt->execute([':id' => $otId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $v = $r['valor'];
                if (in_array($r['clave'], ['titulo_portal','subtitulo_portal','mensaje_bienvenida','color_primario'])) {
                    $config[$r['clave']] = $v;
                } else {
                    $config[$r['clave']] = ($v === '1' || $v === 'true');
                }
            }
        }
    } catch (Throwable $e) { /* tabla aún no creada */ }
    return $config;
}

/**
 * Helper: retorna valor string con fallback
 */
function cfgStr(array $cfg, string $key, string $default = ''): string
{
    $v = $cfg[$key] ?? $default;
    return is_string($v) ? $v : $default;
}

/**
 * Helper: retorna bool con fallback
 */
function cfgBool(array $cfg, string $key, bool $default = true): bool
{
    $v = $cfg[$key] ?? null;
    if ($v === null) return $default;
    return ($v === true || $v === '1' || $v === 'true');
}

switch ($action) {
    case 'search':          handleSearch($pdo); break;
    case 'ejecucion':       handleEjecucion($pdo); break;
    case 'timeline':        handleTimeline($pdo); break;
    case 'avances':         handleAvances($pdo); break;
    case 'comentarios':     handleComentarios($pdo); break;
    case 'comentar':        handleComentar($pdo); break;
    case 'subir_interaccion': handleSubirInteraccion($pdo); break;
    case 'multimedia':      handleMultimedia($pdo); break;
    case 'servicios':       handleServicios($pdo); break;
    case 'presupuesto_detallado': handlePresupuestoDetallado($pdo); break;
    case 'updates':         handleUpdates($pdo); break;
    case 'config':          handleConfig($pdo); break;
    case 'solicitar_visita': handleSolicitarVisita($pdo); break;
    default: jsonResponse('error', 'Acción no válida');
}

/* ════════════════════════════════════════════════════════════
   SEARCH — Retorno enriquecido con resumen de ejecución
   ════════════════════════════════════════════════════════════ */
function handleSearch(PDO $conn): void
{
    $q = trim($_GET['q'] ?? '');
    if (!$q) jsonResponse('error', 'Debe ingresar un RUT o número de OT');

    $isOtNumber = preg_match('/^OT-\d+$/i', $q);

    try {
        if ($isOtNumber) {
            $likeQ = $q;
            if (!str_starts_with(strtoupper($q), 'OT-')) $likeQ = 'OT-' . str_pad($q, 5, '0', STR_PAD_LEFT);
            $stmt = $conn->prepare("
                SELECT ot.*,
                       c.id AS cliente_id, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                       c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo,
                       v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio, v.color,
                       e.id AS empleado_id, e.nombre AS empleado_nombre
                FROM orden_trabajo ot
                LEFT JOIN clientes c ON ot.cliente_id = c.id
                LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
                LEFT JOIN empleados e ON ot.asignado_empleado_id = e.id
                WHERE ot.folio_ot LIKE :q LIMIT 1
            ");
            $stmt->execute([':q' => $likeQ]);
        } else {
            $rut = preg_replace('/[\s.\-]/', '', $q);
            $stmt = $conn->prepare("
                SELECT ot.*,
                       c.id AS cliente_id, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                       c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo,
                       v.id AS vehiculo_id, v.patente, v.marca, v.modelo, v.anio, v.color,
                       e.id AS empleado_id, e.nombre AS empleado_nombre
                FROM orden_trabajo ot
                JOIN clientes c ON ot.cliente_id = c.id
                LEFT JOIN vehiculos v ON ot.vehiculo_id = v.id
                LEFT JOIN empleados e ON ot.asignado_empleado_id = e.id
                WHERE REPLACE(REPLACE(c.rut, '.', ''), '-', '') = :rut
                ORDER BY ot.creado DESC LIMIT 10
            ");
            $stmt->execute([':rut' => $rut]);
        }

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if (empty($rows)) jsonResponse('error', 'No se encontraron resultados');

        $otRow = $rows[0];
        $otId = $otRow['id'];
        $cfg = getPortalConfig($conn, $otId);

        $result = buildOtResponse($conn, $otRow, $cfg);

        // Si hay múltiples OTs (búsqueda por RUT), incluir resumen
        if (count($rows) > 1) {
            $result['ots_adicionales'] = array_map(fn($r) => [
                'id' => $r['id'],
                'folio_ot' => $r['folio_ot'],
                'estado' => cfgBool($cfg, 'mostrar_estado_ot') ? $r['estado'] : null,
                'fecha' => cfgBool($cfg, 'mostrar_fecha_ingreso') ? ($r['fecha'] ?? $r['creado']) : null,
                'vehiculo' => $r['marca'] . ' ' . $r['modelo'],
                'patente' => $r['patente'],
            ], array_slice($rows, 1));
        }

        jsonResponse('success', 'OT encontrada', $result);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al buscar: ' . $e->getMessage(), null, 500);
    }
}

/**
 * Construye el array de respuesta para una OT, reutilizable por search y ejecucion
 */
function buildOtResponse(PDO $conn, array $otRow, array $cfg): array
{
    $otId = $otRow['id'];
    $result = [];

    // Cliente
    if (cfgBool($cfg, 'mostrar_datos_cliente')) {
        $result['cliente'] = [
            'id' => $otRow['cliente_id'],
            'nombre' => $otRow['cliente_nombre'] ?? null,
            'apellido' => $otRow['cliente_apellido'] ?? null,
            'rut' => $otRow['cliente_rut'] ?? null,
            'telefono' => $otRow['cliente_telefono'] ?? null,
            'correo' => $otRow['cliente_correo'] ?? null,
        ];
    } else {
        $result['cliente'] = null;
    }

    // Vehículo
    $result['vehiculo'] = cfgBool($cfg, 'mostrar_datos_vehiculo') ? [
        'id' => $otRow['vehiculo_id'],
        'patente' => cfgBool($cfg, 'mostrar_patente') ? $otRow['patente'] : null,
        'marca' => $otRow['marca'],
        'modelo' => $otRow['modelo'],
        'anio' => $otRow['anio'],
        'color' => $otRow['color'],
    ] : null;

    // Técnico
    $result['empleado'] = cfgBool($cfg, 'mostrar_tecnico_asignado') ? [
        'id' => $otRow['empleado_id'],
        'nombre' => $otRow['empleado_nombre'] ?? null,
    ] : null;

    // Config
    $result['config'] = $cfg;

    // OT
    $result['ot'] = [
        'id' => $otRow['id'],
        'folio_ot' => $otRow['folio_ot'],
        'estado' => cfgBool($cfg, 'mostrar_estado_ot') ? $otRow['estado'] : null,
        'fecha' => cfgBool($cfg, 'mostrar_fecha_ingreso') ? ($otRow['fecha'] ?? $otRow['creado']) : null,
        'creado' => $otRow['creado'],
        'descripcion_problema' => $otRow['descripcion_problema'] ?? null,
        'hora_inicio_procesos' => $otRow['hora_inicio_procesos'] ?? null,
        'hora_fin_procesos' => $otRow['hora_fin_procesos'] ?? null,
        'total_horas' => $otRow['total_horas'] ?? null,
    ];

    // Diagnósticos
    $result['diagnosticos'] = [];
    if (cfgBool($cfg, 'mostrar_diagnosticos')) {
        $stmt = $conn->prepare("
            SELECT id, folio, fecha, diagnostico_final, problema_principal, causa_raiz, recomendaciones, estado
            FROM diagnosticos WHERE ot_id = :ot_id ORDER BY creado DESC LIMIT 3
        ");
        $stmt->execute([':ot_id' => $otId]);
        $diags = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if (!cfgBool($cfg, 'mostrar_diagnostico_detalle', true)) {
            foreach ($diags as &$d) { $d['diagnostico_final'] = null; $d['problema_principal'] = null; $d['causa_raiz'] = null; }
        }
        $result['diagnosticos'] = $diags;
    }

    // Presupuesto
    $result['presupuesto'] = null;
    $result['presupuesto_items'] = [];
    if (cfgBool($cfg, 'mostrar_presupuesto')) {
        $stmt = $conn->prepare("
            SELECT id, estado, valor, valor_total, descuento, impuesto, fecha, creado, observaciones
            FROM presupuesto WHERE ot_id = :ot_id ORDER BY creado DESC LIMIT 1
        ");
        $stmt->execute([':ot_id' => $otId]);
        $ppto = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if ($ppto) {
            if (!cfgBool($cfg, 'mostrar_presupuesto_estado', true)) $ppto['estado'] = null;
            if (!cfgBool($cfg, 'mostrar_presupuesto_total', true)) { $ppto['valor'] = null; $ppto['valor_total'] = null; }
            $result['presupuesto'] = $ppto;
            if (cfgBool($cfg, 'mostrar_presupuesto_items', true)) {
                $stmtI = $conn->prepare("SELECT id, tipo, nombre, detalle, cantidad, valor_unitario, descuento FROM presupuesto_items WHERE presupuesto_id = :pid ORDER BY id ASC");
                $stmtI->execute([':pid' => $ppto['id']]);
                $result['presupuesto_items'] = $stmtI->fetchAll(PDO::FETCH_ASSOC) ?: [];
                if (empty($result['presupuesto_items'])) $result['presupuesto_items'] = extractItemsFromJson($ppto);
            }
        }
    }

    // Servicios/checklist con resumen de progreso
    $result['servicios'] = [];
    $result['progreso'] = ['total' => 0, 'completados' => 0, 'en_proceso' => 0, 'pendientes' => 0, 'porcentaje' => 0];
    if (cfgBool($cfg, 'mostrar_servicios')) {
        $stmt = $conn->prepare("
            SELECT oti.id, oti.tipo, oti.nombre, oti.detalle, oti.estado_item, oti.completado, oti.cantidad, oti.valor_unitario, oti.es_imprevisto
            FROM orden_trabajo_items oti
            WHERE oti.orden_trabajo_id = :ot_id ORDER BY oti.id ASC
        ");
        $stmt->execute([':ot_id' => $otId]);
        $svcs = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if (!cfgBool($cfg, 'mostrar_servicios_detalle', true)) {
            foreach ($svcs as &$s) { $s['detalle'] = null; }
        }
        $result['servicios'] = $svcs;

        // Calcular progreso
        $total = count($svcs);
        $done = 0; $proc = 0;
        foreach ($svcs as $s) {
            $est = $s['estado_item'] ?? ($s['completado'] ? 'completado' : 'pendiente');
            if ($est === 'completado') $done++;
            elseif ($est === 'en_proceso') $proc++;
        }
        $result['progreso'] = [
            'total' => $total,
            'completados' => $done,
            'en_proceso' => $proc,
            'pendientes' => $total - $done - $proc,
            'porcentaje' => $total > 0 ? round(($done / $total) * 100) : 0,
        ];
    }

    // Avances recientes
    $result['avances'] = [];
    if (cfgBool($cfg, 'mostrar_avances')) {
        $stmt = $conn->prepare("
            SELECT a.id, a.titulo, a.descripcion, a.porcentaje, a.creado,
                   e.nombre AS autor_nombre
            FROM ot_avances a
            LEFT JOIN empleados e ON a.autor_empleado_id = e.id
            WHERE a.ot_id = :ot_id ORDER BY a.creado DESC LIMIT 5
        ");
        $stmt->execute([':ot_id' => $otId]);
        $result['avances'] = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    // Etapas de ejecución
    $result['etapas'] = [];
    try {
        $stmt = $conn->prepare("SELECT id, nombre, orden, estado, fecha_inicio, fecha_fin, notas FROM ot_etapas WHERE orden_trabajo_id = :ot_id ORDER BY orden ASC");
        $stmt->execute([':ot_id' => $otId]);
        $result['etapas'] = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {}

    // Contar multimedia total
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) FROM archivos_multimedia WHERE entidad_tipo = 'orden_trabajo' AND entidad_id = :ot_id");
        $stmt->execute([':ot_id' => $otId]);
        $result['multimedia_count'] = (int)$stmt->fetchColumn();
    } catch (Throwable $e) {
        $result['multimedia_count'] = 0;
    }

    // Comentarios sin leer
    $stmt = $conn->prepare("SELECT COUNT(*) FROM ot_comentarios WHERE ot_id = :ot_id AND leido = 0 AND autor_tipo != 'cliente'");
    $stmt->execute([':ot_id' => $otId]);
    $result['comentarios_sin_leer'] = (int)$stmt->fetchColumn();

    return $result;
}

/* ════════════════════════════════════════════════════════════
   EJECUCION — Datos completos de ejecución para el cliente
   Items con checklists, pasos, fotos, audios, videos
   ════════════════════════════════════════════════════════════ */
function handleEjecucion(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    $cfg = getPortalConfig($conn, $otId);

    try {
        // Items de la OT con checklist anidado
        $stmt = $conn->prepare("
            SELECT oti.id, oti.tipo, oti.nombre, oti.detalle, oti.estado_item, oti.completado,
                   oti.cantidad, oti.valor_unitario, oti.es_imprevisto, oti.labores_realizadas,
                   oti.seccion
            FROM orden_trabajo_items oti
            WHERE oti.orden_trabajo_id = :ot_id
            ORDER BY oti.es_imprevisto ASC, oti.id ASC
        ");
        $stmt->execute([':ot_id' => $otId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // Para cada item, cargar checklist + multimedia
        foreach ($items as &$item) {
            $itemId = $item['id'];
            $item['checklist'] = null;
            $item['fotos'] = [];
            $item['audios'] = [];

            // Checklist ejecución (si es servicio)
            if ($item['tipo'] === 'servicio') {
                try {
                    $stmtCe = $conn->prepare("
                        SELECT ce.id, ce.nombre, ce.estado, ce.porcentaje_completado
                        FROM checklist_ejecucion ce
                        WHERE ce.ot_item_id = :item_id LIMIT 1
                    ");
                    $stmtCe->execute([':item_id' => $itemId]);
                    $ce = $stmtCe->fetch(PDO::FETCH_ASSOC);
                    if ($ce) {
                        // Pasos del checklist
                        $stmtPasos = $conn->prepare("
                            SELECT cep.id, cep.orden, cep.titulo, cep.descripcion, cep.completado,
                                   cep.notas, cep.completado_por, cep.completado_en
                            FROM checklist_ejecucion_pasos cep
                            WHERE cep.ejecucion_id = :ej_id
                            ORDER BY cep.orden ASC
                        ");
                        $stmtPasos->execute([':ej_id' => $ce['id']]);
                        $pasos = $stmtPasos->fetchAll(PDO::FETCH_ASSOC) ?: [];

                        // Fotos por paso
                        foreach ($pasos as &$paso) {
                            $paso['fotos'] = [];
                            $paso['videos'] = [];
                            $paso['notas_voz'] = [];
                            try {
                                $stmtF = $conn->prepare("SELECT id, ruta_archivo, nombre_original FROM checklist_paso_fotos WHERE paso_id = :pid");
                                $stmtF->execute([':pid' => $paso['id']]);
                                $paso['fotos'] = $stmtF->fetchAll(PDO::FETCH_ASSOC) ?: [];
                                $stmtV = $conn->prepare("SELECT id, ruta_archivo, nombre_original FROM checklist_paso_videos WHERE paso_id = :pid");
                                $stmtV->execute([':pid' => $paso['id']]);
                                $paso['videos'] = $stmtV->fetchAll(PDO::FETCH_ASSOC) ?: [];
                                $stmtA = $conn->prepare("SELECT id, ruta_archivo, nombre_original, duracion_segundos FROM checklist_paso_notas_voz WHERE paso_id = :pid");
                                $stmtA->execute([':pid' => $paso['id']]);
                                $paso['notas_voz'] = $stmtA->fetchAll(PDO::FETCH_ASSOC) ?: [];
                            } catch (Throwable $e) {}
                        }
                        $ce['pasos'] = $pasos;
                        $item['checklist'] = $ce;
                    }
                } catch (Throwable $e) {}
            }

            // Multimedia del item (fotos y audios)
            try {
                $stmtFi = $conn->prepare("
                    SELECT id, tipo_archivo, ruta_archivo, nombre_original, creado
                    FROM archivos_multimiento
                    WHERE entidad_tipo = 'ot_item_foto' AND entidad_id = :item_id
                    ORDER BY creado DESC
                ");
                // Typo fix: archivos_multimedia (not multimiento)
                $stmtFi = $conn->prepare("
                    SELECT id, tipo_archivo, ruta_archivo, nombre_original, creado
                    FROM archivos_multimedia
                    WHERE entidad_tipo IN ('ot_item_foto', 'ot_item_audio')
                      AND entidad_id = :item_id
                    ORDER BY creado DESC
                ");
                $stmtFi->execute([':item_id' => $itemId]);
                $media = $stmtFi->fetchAll(PDO::FETCH_ASSOC) ?: [];
                foreach ($media as $m) {
                    if ($m['tipo_archivo'] === 'nota_voz' || str_contains($m['tipo_archivo'], 'audio')) {
                        $item['audios'][] = $m;
                    } else {
                        $item['fotos'][] = $m;
                    }
                }
            } catch (Throwable $e) {}
        }

        jsonResponse('success', 'Ejecución obtenida', $items);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener ejecución: ' . $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   TIMELINE — Eventos combinados de la OT
   ════════════════════════════════════════════════════════════ */
function handleTimeline(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $events = [];

        // OT creada
        $stmt = $conn->prepare("SELECT id, folio_ot, estado, creado, fecha FROM orden_trabajo WHERE id = :id");
        $stmt->execute([':id' => $otId]);
        $ot = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($ot) {
            $events[] = [
                'tipo' => 'ot_creada',
                'icono' => 'fa-clipboard-check',
                'titulo' => 'Orden de Trabajo creada',
                'descripcion' => 'Ingreso del vehículo al taller',
                'fecha' => $ot['creado'],
                'estado' => 'completado',
            ];
            if ($ot['hora_inicio_procesos']) {
                $events[] = [
                    'tipo' => 'inicio_procesos',
                    'icono' => 'fa-play-circle',
                    'titulo' => 'Trabajo iniciado',
                    'descripcion' => 'El técnico comenzó el servicio',
                    'fecha' => $ot['hora_inicio_procesos'],
                    'estado' => 'completado',
                ];
            }
        }

        // Diagnósticos
        $stmt = $conn->prepare("SELECT id, folio, fecha, estado, diagnostico_final FROM diagnosticos WHERE ot_id = :ot_id ORDER BY creado ASC");
        $stmt->execute([':ot_id' => $otId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $d) {
            $events[] = [
                'tipo' => 'diagnostico',
                'icono' => 'fa-stethoscope',
                'titulo' => 'Diagnóstico ' . ($d['folio'] ?? ''),
                'descripcion' => $d['diagnostico_final'] ?: 'Diagnóstico realizado',
                'fecha' => $d['fecha'],
                'estado' => $d['estado'] === 'completado' ? 'completado' : 'en_proceso',
            ];
        }

        // Etapas
        try {
            $stmt = $conn->prepare("SELECT nombre, estado, fecha_inicio, fecha_fin FROM ot_etapas WHERE orden_trabajo_id = :ot_id ORDER BY orden ASC");
            $stmt->execute([':ot_id' => $otId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $e) {
                $events[] = [
                    'tipo' => 'etapa',
                    'icono' => 'fa-flag-checkered',
                    'titulo' => $e['nombre'],
                    'descripcion' => $e['estado'] === 'completado' ? 'Completada' : ($e['estado'] === 'en_curso' ? 'En curso' : 'Pendiente'),
                    'fecha' => $e['fecha_inicio'] ?? $e['fecha_fin'],
                    'estado' => $e['estado'] === 'completado' ? 'completado' : ($e['estado'] === 'en_curso' ? 'en_proceso' : 'pendiente'),
                ];
            }
        } catch (Throwable $e) {}

        // Avances
        $stmt = $conn->prepare("SELECT titulo, descripcion, porcentaje, creado FROM ot_avances WHERE ot_id = :ot_id ORDER BY creado ASC");
        $stmt->execute([':ot_id' => $otId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $a) {
            $events[] = [
                'tipo' => 'avance',
                'icono' => 'fa-chart-line',
                'titulo' => $a['titulo'] ?: 'Avance',
                'descripcion' => $a['descripcion'] ?: ($a['porcentaje'] != null ? $a['porcentaje'] . '% completado' : ''),
                'fecha' => $a['creado'],
                'estado' => 'completado',
                'porcentaje' => $a['porcentaje'],
            ];
        }

        // Finalización
        if ($ot && $ot['hora_fin_procesos']) {
            $events[] = [
                'tipo' => 'finalizada',
                'icono' => 'fa-check-circle',
                'titulo' => 'Trabajo finalizado',
                'descripcion' => 'Servicio completado',
                'fecha' => $ot['hora_fin_procesos'],
                'estado' => 'completado',
            ];
        }

        // Ordenar por fecha
        usort($events, fn($a, $b) => strtotime($a['fecha'] ?? '1970-01-01') - strtotime($b['fecha'] ?? '1970-01-01'));

        jsonResponse('success', 'Timeline obtenida', $events);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener timeline', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   AVANCES — Progreso de la OT (mejorado, sin N+1)
   ════════════════════════════════════════════════════════════ */
function handleAvances(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $stmt = $conn->prepare("
            SELECT a.id, a.titulo, a.descripcion, a.porcentaje, a.creado,
                   e.nombre AS autor_nombre
            FROM ot_avances a
            LEFT JOIN empleados e ON a.autor_empleado_id = e.id
            WHERE a.ot_id = :ot_id
            ORDER BY a.creado DESC LIMIT 50
        ");
        $stmt->execute([':ot_id' => $otId]);
        $avances = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        // Multimedia de TODOS los avances en una sola query (sin N+1)
        if (!empty($avances)) {
            $avIds = array_column($avances, 'id');
            $placeholders = implode(',', array_fill(0, count($avIds), '?'));
            $stmtMed = $conn->prepare("
                SELECT entidad_id AS avance_id, id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes
                FROM archivos_multimedia
                WHERE entidad_tipo = 'ot_avances' AND entidad_id IN ($placeholders)
            ");
            $stmtMed->execute($avIds);
            $mediaByAvance = [];
            foreach ($stmtMed->fetchAll(PDO::FETCH_ASSOC) as $m) {
                $mediaByAvance[$m['avance_id']][] = $m;
            }
            foreach ($avances as &$av) {
                $av['multimedia'] = $mediaByAvance[$av['id']] ?? [];
            }
        }

        jsonResponse('success', 'Avances obtenidos', $avances);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener avances', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   COMENTARIOS
   ════════════════════════════════════════════════════════════ */
function handleComentarios(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $conn->prepare("UPDATE ot_comentarios SET leido = 1 WHERE ot_id = :ot_id AND autor_tipo != 'cliente' AND leido = 0")->execute([':ot_id' => $otId]);
        $stmt = $conn->prepare("SELECT id, autor_tipo, autor_nombre, mensaje, creado, leido FROM ot_comentarios WHERE ot_id = :ot_id ORDER BY creado ASC LIMIT 100");
        $stmt->execute([':ot_id' => $otId]);
        jsonResponse('success', 'Comentarios obtenidos', $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener comentarios', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   COMENTAR
   ════════════════════════════════════════════════════════════ */
function handleComentar(PDO $conn): void
{
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $otId = (int)($input['ot_id'] ?? 0);
    $mensaje = trim($input['mensaje'] ?? '');
    $nombre = trim($input['nombre'] ?? 'Cliente');

    if (!$otId) jsonResponse('error', 'ot_id requerido');
    if (!$mensaje) jsonResponse('error', 'El mensaje es obligatorio');

    $cfg = getPortalConfig($conn, $otId);
    if (!cfgBool($cfg, 'mostrar_chat')) jsonResponse('error', 'El chat no está habilitado');
    if (!cfgBool($cfg, 'permitir_enviar_mensajes')) jsonResponse('error', 'Los mensajes están deshabilitados');

    try {
        $stmt = $conn->prepare("SELECT id FROM orden_trabajo WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $otId]);
        if (!$stmt->fetch()) jsonResponse('error', 'OT no encontrada');

        $stmt = $conn->prepare("INSERT INTO ot_comentarios (ot_id, autor_tipo, autor_nombre, mensaje) VALUES (:ot_id, 'cliente', :nombre, :mensaje)");
        $stmt->execute([':ot_id' => $otId, ':nombre' => $nombre ?: 'Cliente', ':mensaje' => $mensaje]);
        jsonResponse('success', 'Comentario enviado', ['id' => $conn->lastInsertId()]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al enviar comentario', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   SUBIR INTERACCIÓN
   ════════════════════════════════════════════════════════════ */
function handleSubirInteraccion(PDO $conn): void
{
    $otId = (int)($_POST['ot_id'] ?? 0);
    $tipo = $_POST['tipo'] ?? 'foto';
    $nombre = trim($_POST['nombre'] ?? 'Cliente');
    $mensaje = trim($_POST['mensaje'] ?? '');

    if (!$otId) jsonResponse('error', 'ot_id requerido');
    if (!isset($_FILES['archivo'])) jsonResponse('error', 'Archivo requerido');

    $cfg = getPortalConfig($conn, $otId);
    if (!cfgBool($cfg, 'mostrar_chat')) jsonResponse('error', 'El chat no está habilitado');
    $tipoPermKey = ['foto' => 'permitir_subir_fotos', 'video' => 'permitir_subir_videos', 'nota_voz' => 'permitir_grabar_audio'];
    if (!cfgBool($cfg, $tipoPermKey[$tipo] ?? 'permitir_subir_fotos')) jsonResponse('error', 'Subir ' . $tipo . ' está deshabilitado');

    $allowedTypes = [
        'foto' => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        'video' => ['video/mp4', 'video/webm', 'video/quicktime'],
        'nota_voz' => ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4'],
    ];

    $file = $_FILES['archivo'];
    $mime = mime_content_type($file['tmp_name']);
    if (!in_array($mime, $allowedTypes[$tipo] ?? [])) jsonResponse('error', 'Tipo no permitido: ' . $mime);
    if ($file['size'] > 50 * 1024 * 1024) jsonResponse('error', 'Excede 50MB');

    try {
        $stmt = $conn->prepare("SELECT id FROM orden_trabajo WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $otId]);
        if (!$stmt->fetch()) jsonResponse('error', 'OT no encontrada');

        $uploadDir = '../uploads/portal/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'bin';
        $filename = 'portal_' . $otId . '_' . $tipo . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $dbPath = 'uploads/portal/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) jsonResponse('error', 'Error al guardar');

        $stmt = $conn->prepare("INSERT INTO ot_interacciones_cliente (ot_id, tipo, mensaje, ruta_archivo, nombre_original, tamanio_bytes) VALUES (:ot_id, :tipo, :mensaje, :ruta, :nombre, :tamanio)");
        $stmt->execute([':ot_id' => $otId, ':tipo' => $tipo, ':mensaje' => $mensaje, ':ruta' => $dbPath, ':nombre' => $file['name'], ':tamanio' => $file['size']]);
        $interId = $conn->lastInsertId();

        $stmt = $conn->prepare("INSERT INTO archivos_multimedia (entidad_tipo, entidad_id, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes) VALUES ('ot_interacciones', :id, :tipo, :ruta, :nombre, :tamanio)");
        $stmt->execute([':id' => $interId, ':tipo' => $tipo === 'nota_voz' ? 'nota_voz' : ($tipo === 'video' ? 'video' : 'foto'), ':ruta' => $dbPath, ':nombre' => $file['name'], ':tamanio' => $file['size']]);

        $msgs = ['foto' => 'Foto compartida', 'video' => 'Video compartido', 'nota_voz' => 'Nota de voz compartida'];
        $stmt = $conn->prepare("INSERT INTO ot_comentarios (ot_id, autor_tipo, autor_nombre, mensaje) VALUES (:ot_id, 'cliente', :nombre, :mensaje)");
        $stmt->execute([':ot_id' => $otId, ':nombre' => $nombre ?: 'Cliente', ':mensaje' => $msgs[$tipo] ?? 'Archivo compartido']);

        jsonResponse('success', 'Archivo subido', ['id' => $interId, 'ruta' => $dbPath]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al subir archivo', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   MULTIMEDIA — Categorizada con filtros de config
   ════════════════════════════════════════════════════════════ */
function handleMultimedia(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    $cfg = getPortalConfig($conn, $otId);

    try {
        $servicioMedia = $recepMedia = $clienteMedia = [];

        // Fotos/videos de servicios
        if (cfgBool($cfg, 'mostrar_fotos_servicios', true)) {
            $stmt = $conn->prepare("
                SELECT am.id, am.tipo_archivo, am.ruta_archivo, am.nombre_original, am.tamanio_bytes, am.creado, 'servicio' AS origen
                FROM archivos_multimedia am
                WHERE am.entidad_tipo IN ('ot_item_foto', 'ot_item_video')
                  AND am.entidad_id IN (SELECT oti.id FROM orden_trabajo_items oti WHERE oti.orden_trabajo_id = :ot_id)
                ORDER BY am.creado DESC LIMIT 30
            ");
            $stmt->execute([':ot_id' => $otId]);
            $servicioMedia = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        // Fotos de recepción
        if (cfgBool($cfg, 'mostrar_fotos_recepcion', true)) {
            $stmt = $conn->prepare("
                SELECT am.id, am.tipo_archivo, am.ruta_archivo, am.nombre_original, am.tamanio_bytes, am.creado, 'recepcion' AS origen
                FROM archivos_multimedia am
                WHERE am.entidad_tipo = 'recepcion_unificada'
                  AND am.entidad_id IN (SELECT ot.recepcion_id FROM orden_trabajo ot WHERE ot.id = :ot_id AND ot.recepcion_id IS NOT NULL)
                ORDER BY am.creado DESC LIMIT 10
            ");
            $stmt->execute([':ot_id' => $otId]);
            $recepMedia = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        // Multimedia del cliente
        if (cfgBool($cfg, 'mostrar_fotos_cliente', true)) {
            $stmt = $conn->prepare("
                SELECT id, tipo AS tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes, creado
                FROM ot_interacciones_cliente WHERE ot_id = :ot_id
                ORDER BY creado DESC LIMIT 20
            ");
            $stmt->execute([':ot_id' => $otId]);
            $clienteMedia = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        }

        // Filtrar por tipo si las config lo piden
        $all = array_merge($servicioMedia, $recepMedia, $clienteMedia);
        if (!cfgBool($cfg, 'mostrar_videos', true)) $all = array_filter($all, fn($m) => !str_contains($m['tipo_archivo'] ?? '', 'video'));
        if (!cfgBool($cfg, 'mostrar_audios', true)) $all = array_filter($all, fn($m) => !str_contains($m['tipo_archivo'] ?? '', 'nota_voz') && !str_contains($m['tipo_archivo'] ?? '', 'audio'));

        jsonResponse('success', 'Multimedia obtenida', [
            'servicios' => $servicioMedia,
            'recepcion' => $recepMedia,
            'cliente' => $clienteMedia,
        ]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener multimedia', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   SERVICIOS
   ════════════════════════════════════════════════════════════ */
function handleServicios(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $stmt = $conn->prepare("SELECT oti.id, oti.tipo, oti.nombre, oti.detalle, oti.estado_item, oti.cantidad, oti.valor_unitario, oti.es_imprevisto FROM orden_trabajo_items oti WHERE oti.orden_trabajo_id = :ot_id ORDER BY oti.id ASC");
        $stmt->execute([':ot_id' => $otId]);
        jsonResponse('success', 'Servicios obtenidos', $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener servicios', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   PRESUPUESTO DETALLADO
   ════════════════════════════════════════════════════════════ */
function handlePresupuestoDetallado(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $stmt = $conn->prepare("SELECT id, estado, valor, valor_total, descuento, impuesto, fecha, creado, observaciones FROM presupuesto WHERE ot_id = :ot_id ORDER BY creado DESC LIMIT 1");
        $stmt->execute([':ot_id' => $otId]);
        $ppto = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$ppto) jsonResponse('success', 'Sin presupuesto', ['presupuesto' => null, 'items' => []]);

        $stmtI = $conn->prepare("SELECT id, tipo, nombre, detalle, cantidad, valor_unitario, descuento FROM presupuesto_items WHERE presupuesto_id = :pid ORDER BY id ASC");
        $stmtI->execute([':pid' => $ppto['id']]);
        $items = $stmtI->fetchAll(PDO::FETCH_ASSOC) ?: [];
        if (empty($items)) $items = extractItemsFromJson($ppto);

        jsonResponse('success', 'Presupuesto obtenido', ['presupuesto' => $ppto, 'items' => $items]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error al obtener presupuesto', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   UPDATES — Polling para nuevos comentarios/avances
   ════════════════════════════════════════════════════════════ */
function handleUpdates(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    $lastId = (int)($_GET['last_id'] ?? 0);
    if (!$otId) jsonResponse('error', 'ot_id requerido');

    try {
        $newComments = 0;
        $newAvances = 0;

        $stmt = $conn->prepare("SELECT COUNT(*) FROM ot_comentarios WHERE ot_id = :ot_id AND id > :last_id AND autor_tipo != 'cliente'");
        $stmt->execute([':ot_id' => $otId, ':last_id' => $lastId]);
        $newComments = (int)$stmt->fetchColumn();

        $stmt2 = $conn->prepare("SELECT COUNT(*) FROM ot_avances WHERE ot_id = :ot_id AND id > :last_id");
        $stmt2->execute([':ot_id' => $otId, ':last_id' => $lastId]);
        $newAvances = (int)$stmt2->fetchColumn();

        jsonResponse('success', 'Updates', ['nuevos_comentarios' => $newComments, 'nuevos_avances' => $newAvances]);
    } catch (PDOException $e) {
        jsonResponse('error', 'Error', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   CONFIG — Configuración del portal para una OT
   ════════════════════════════════════════════════════════════ */
function handleConfig(PDO $conn): void
{
    $otId = (int)($_GET['ot_id'] ?? 0);
    $cfg = getPortalConfig($conn, $otId ?: null);
    jsonResponse('success', 'Configuración', $cfg);
}

/* ════════════════════════════════════════════════════════════
   SOLICITAR VISITA
   ════════════════════════════════════════════════════════════ */
function handleSolicitarVisita(PDO $conn): void
{
    $nombre = trim($_POST['nombre'] ?? '');
    $telefono = trim($_POST['telefono'] ?? '');
    $correo = trim($_POST['correo'] ?? '');
    $patente = strtoupper(trim($_POST['patente'] ?? ''));
    $vehiculo = trim($_POST['vehiculo'] ?? '');
    $motivo = trim($_POST['motivo'] ?? '');

    if (!$nombre) jsonResponse('error', 'El nombre es obligatorio');
    if (!$telefono) jsonResponse('error', 'El teléfono es obligatorio');
    if (!$patente) jsonResponse('error', 'La patente es obligatoria');
    if (!$motivo) jsonResponse('error', 'El motivo es obligatorio');

    $marca = $modelo = $anio = '';
    if ($vehiculo) {
        $parts = preg_split('/\s+/', $vehiculo);
        if (count($parts) >= 2) {
            $marca = $parts[0];
            $last = end($parts);
            if (preg_match('/^\d{4}$/', $last)) { $modelo = implode(' ', array_slice($parts, 1, -1)); $anio = $last; }
            else { $modelo = implode(' ', array_slice($parts, 1)); }
        } else { $marca = $vehiculo; }
    }

    try {
        $conn->beginTransaction();
        $stmt = $conn->prepare("INSERT INTO solicitudes_visita (cliente_nombre, cliente_telefono, cliente_correo, vehiculo_patente, vehiculo_marca, vehiculo_modelo, vehiculo_anio, motivo, estado) VALUES (:nombre, :telefono, :correo, :patente, :marca, :modelo, :anio, :motivo, 'pendiente')");
        $stmt->execute([':nombre' => $nombre, ':telefono' => $telefono, ':correo' => $correo, ':patente' => $patente, ':marca' => $marca, ':modelo' => $modelo, ':anio' => $anio, ':motivo' => $motivo]);
        $conn->commit();
        jsonResponse('success', 'Solicitud recibida. Nos pondremos en contacto pronto.', ['id' => $conn->lastInsertId()]);
    } catch (PDOException $e) {
        $conn->rollBack();
        jsonResponse('error', 'Error al registrar', null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function extractItemsFromJson(array $ppto): array
{
    $items = [];
    // Fuente primaria: items_json (contiene todos los items unificados)
    if (!empty($ppto['items_json'])) {
        $decoded = json_decode($ppto['items_json'], true);
        if (is_array($decoded)) {
            foreach ($decoded as $d) {
                $items[] = [
                    'tipo' => ($d['tipo'] ?? 'servicio') === 'articulo' ? 'articulo' : 'servicio',
                    'nombre' => $d['nombre'] ?? $d['servicio'] ?? $d['articulo'] ?? 'Ítem',
                    'detalle' => $d['detalle'] ?? '',
                    'cantidad' => (int)($d['cantidad'] ?? 1),
                    'valor_unitario' => (int)($d['valor_unitario'] ?? $d['valor'] ?? 0),
                ];
            }
            if (!empty($items)) return $items;
        }
    }
    // Fallback LEGACY: servicios_json / articulos_json (datos anteriores a Fase0)
    foreach (['servicios_json', 'articulos_json'] as $key) {
        if (!empty($ppto[$key])) {
            $decoded = json_decode($ppto[$key], true);
            if (is_array($decoded)) {
                foreach ($decoded as $d) {
                    $items[] = [
                        'tipo' => $key === 'articulos_json' ? 'articulo' : 'servicio',
                        'nombre' => $d['nombre'] ?? $d['servicio'] ?? $d['articulo'] ?? 'Ítem',
                        'detalle' => $d['detalle'] ?? '',
                        'cantidad' => (int)($d['cantidad'] ?? 1),
                        'valor_unitario' => (int)($d['valor_unitario'] ?? $d['valor'] ?? 0),
                    ];
                }
            }
        }
    }
    return $items;
}
