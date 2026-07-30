<?php
// ============================================================================
// agenda_api.php — Agenda del Taller: gestión interna de slots y visitas
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['crear_slot', 'actualizar_slot', 'eliminar_slot', 'asignar_visita', 'desasignar_visita', 'crear_visita', 'marcar_estado', 'aprobar_solicitud', 'rechazar_solicitud'];
if (in_array($action, $writeActions)) {
    requirePerm('agenda:editar');
}

if ($method === 'GET') {

    // ── CALENDARIO: slots por mes ──
    if ($action === 'calendario' || $action === '') {
        try {
            $year = (int)($_GET['year'] ?? date('Y'));
            $month = (int)($_GET['month'] ?? date('m'));
            $firstDay = sprintf('%04d-%02d-01', $year, $month);
            $lastDay = date('Y-m-t', strtotime($firstDay));

            $stmt = $conn->prepare("
                SELECT s.*, 
                       v.folio AS visita_folio, v.cliente_nombre, v.cliente_apellido,
                       v.vehiculo_patente, v.motivo, v.estado AS visita_estado, v.prioridad,
                       sv.cliente_nombre AS solicitud_cliente, sv.motivo AS solicitud_motivo,
                       sv.estado AS solicitud_estado
                FROM agenda_slots s
                LEFT JOIN visitas_taller v ON s.visita_id = v.id
                LEFT JOIN solicitudes_visita sv ON v.solicitud_id = sv.id
                WHERE s.fecha BETWEEN ? AND ?
                ORDER BY s.fecha, s.hora_inicio
            ");
            $stmt->execute([$firstDay, $lastDay]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── DISPONIBILIDAD: slots libres para una fecha ──
    elseif ($action === 'disponibilidad') {
        try {
            $fecha = $_GET['fecha'] ?? date('Y-m-d');
            $stmt = $conn->prepare("
                SELECT id, fecha, hora_inicio, hora_fin, estado, visita_id
                FROM agenda_slots
                WHERE fecha = ?
                ORDER BY hora_inicio
            ");
            $stmt->execute([$fecha]);
            $slots = $stmt->fetchAll();

            foreach ($slots as &$s) {
                $s['disponible'] = ($s['estado'] === 'disponible');
            }

            jsonResponse('success', 'OK', $slots);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── RESUMEN / KPIs ──
    elseif ($action === 'resumen') {
        try {
            $hoy = date('Y-m-d');
            $semanaInicio = date('Y-m-d', strtotime('monday this week'));
            $semanaFin = date('Y-m-d', strtotime('sunday this week'));

            $totalSlots = $conn->prepare("SELECT COUNT(*) FROM agenda_slots WHERE fecha = ?");
            $totalSlots->execute([$hoy]);
            $slotsHoy = (int)$totalSlots->fetchColumn();

            $ocupadosHoy = $conn->prepare("SELECT COUNT(*) FROM agenda_slots WHERE fecha = ? AND estado IN ('reservado','confirmado')");
            $ocupadosHoy->execute([$hoy]);
            $ocupados = (int)$ocupadosHoy->fetchColumn();

            $solicitudesPend = (int)$conn->query("SELECT COUNT(*) FROM solicitudes_visita WHERE estado = 'pendiente'")->fetchColumn();

            $visitasSemana = $conn->prepare("SELECT COUNT(*) FROM agenda_slots WHERE fecha BETWEEN ? AND ? AND estado IN ('reservado','confirmado')");
            $visitasSemana->execute([$semanaInicio, $semanaFin]);
            $visitasSem = (int)$visitasSemana->fetchColumn();

            jsonResponse('success', 'OK', [
                'slots_hoy' => $slotsHoy,
                'ocupados_hoy' => $ocupados,
                'disponibles_hoy' => $slotsHoy - $ocupados,
                'solicitudes_pendientes' => $solicitudesPend,
                'visitas_semana' => $visitasSem,
            ]);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── SOLICITUDES PENDIENTES ──
    elseif ($action === 'solicitudes') {
        try {
            $estado = $_GET['estado'] ?? 'pendiente';
            $stmt = $conn->prepare("
                SELECT sv.*,
                       a.fecha AS slot_fecha, a.hora_inicio AS slot_hora
                FROM solicitudes_visita sv
                LEFT JOIN agenda_slots a ON sv.slot_id = a.id
                WHERE sv.estado = ?
                ORDER BY sv.creado DESC
            ");
            $stmt->execute([$estado]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── DETALLE SOLICITUD ──
    elseif ($action === 'detalle_solicitud') {
        try {
            $id = (int)($_GET['id'] ?? 0);
            if (!$id) jsonResponse('error', 'ID requerido', null, 422);

            $stmt = $conn->prepare("SELECT * FROM solicitudes_visita WHERE id = ?");
            $stmt->execute([$id]);
            $sol = $stmt->fetch();
            if (!$sol) jsonResponse('error', 'Solicitud no encontrada', null, 404);

            // Multimedia
            $sol['archivos'] = getMultimedia('solicitudes_visita', $id, $conn);
            $sol['notas_voz'] = json_decode($sol['notas_voz'] ?? '[]', true);

            jsonResponse('success', 'OK', $sol);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── DETALLE VISITA ──
    elseif ($action === 'detalle_visita') {
        try {
            $id = (int)($_GET['id'] ?? 0);
            if (!$id) jsonResponse('error', 'ID requerido', null, 422);

            $stmt = $conn->prepare("
                SELECT v.*, s.fecha AS slot_fecha, s.hora_inicio AS slot_hora, s.hora_fin AS slot_hora_fin
                FROM visitas_taller v
                JOIN agenda_slots s ON v.slot_id = s.id
                WHERE v.id = ?
            ");
            $stmt->execute([$id]);
            $visita = $stmt->fetch();
            if (!$visita) jsonResponse('error', 'Visita no encontrada', null, 404);

            $visita['archivos'] = getMultimedia('visitas_taller', $id, $conn);

            jsonResponse('success', 'OK', $visita);
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── BLOQUES HORARIOS ──
    elseif ($action === 'bloques') {
        $stmt = $conn->query("SELECT * FROM agenda_bloques ORDER BY dia_semana, hora_apertura");
        jsonResponse('success', 'OK', $stmt->fetchAll());
    }

} elseif ($method === 'POST') {

    // ── GENERAR SLOTS para un mes ──
    if ($action === 'generar_slots') {
        try {
            $year = (int)($_POST['year'] ?? date('Y'));
            $month = (int)($_POST['month'] ?? date('m'));
            $firstDay = sprintf('%04d-%02d-01', $year, $month);
            $daysInMonth = (int)date('t', strtotime($firstDay));
            $generados = 0;

            $conn->beginTransaction();

            for ($d = 1; $d <= $daysInMonth; $d++) {
                $fecha = sprintf('%04d-%02d-%02d', $year, $month, $d);
                $diaSemana = (int)date('w', strtotime($fecha));

                $bloque = $conn->prepare("SELECT * FROM agenda_bloques WHERE dia_semana = ? AND activo = 1");
                $bloque->execute([$diaSemana]);
                $bloqueData = $bloque->fetch();
                if (!$bloqueData) continue;

                $apertura = new DateTime($bloqueData['hora_apertura']);
                $cierre = new DateTime($bloqueData['hora_cierre']);
                $intervalo = (int)$bloqueData['intervalo_minutos'];

                while ($apertura < $cierre) {
                    $horaFin = clone $apertura;
                    $horaFin->modify("+{$intervalo} minutes");
                    if ($horaFin > $cierre) break;

                    $check = $conn->prepare("SELECT id FROM agenda_slots WHERE fecha = ? AND hora_inicio = ?");
                    $check->execute([$fecha, $apertura->format('H:i:s')]);
                    if (!$check->fetch()) {
                        $ins = $conn->prepare("INSERT INTO agenda_slots (fecha, hora_inicio, hora_fin, estado) VALUES (?, ?, ?, 'disponible')");
                        $ins->execute([$fecha, $apertura->format('H:i:s'), $horaFin->format('H:i:s')]);
                        $generados++;
                    }

                    $apertura = clone $horaFin;
                }
            }

            $conn->commit();
            jsonResponse('success', "Slots generados: {$generados}", ['generados' => $generados]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── ASIGNAR SOLICITUD a un slot ──
    if ($action === 'asignar_solicitud') {
        $solId = (int)($_POST['solicitud_id'] ?? 0);
        $slotId = (int)($_POST['slot_id'] ?? 0);
        if (!$solId || !$slotId) jsonResponse('error', 'Solicitud y slot requeridos', null, 422);

        try {
            $conn->beginTransaction();

            // Verificar solicitud
            $sol = $conn->prepare("SELECT * FROM solicitudes_visita WHERE id = ?");
            $sol->execute([$solId]);
            $solicitud = $sol->fetch();
            if (!$solicitud) jsonResponse('error', 'Solicitud no encontrada', null, 404);

            // Verificar slot disponible
            $slot = $conn->prepare("SELECT * FROM agenda_slots WHERE id = ? AND estado = 'disponible'");
            $slot->execute([$slotId]);
            $slotData = $slot->fetch();
            if (!$slotData) jsonResponse('error', 'Slot no disponible', null, 409);

            // Crear visita
            $visita = $conn->prepare("
                INSERT INTO visitas_taller (slot_id, solicitud_id, cliente_nombre, cliente_apellido,
                    cliente_telefono, cliente_correo, vehiculo_patente, vehiculo_marca, vehiculo_modelo,
                    vehiculo_anio, motivo, notas)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $visita->execute([
                $slotId, $solId,
                $solicitud['cliente_nombre'], $solicitud['cliente_apellido'],
                $solicitud['cliente_telefono'], $solicitud['cliente_correo'],
                $solicitud['vehiculo_patente'], $solicitud['vehiculo_marca'],
                $solicitud['vehiculo_modelo'], $solicitud['vehiculo_anio'],
                $solicitud['motivo'], $solicitud['observaciones']
            ]);
            $visitaId = (int)$conn->lastInsertId();

            // Actualizar slot
            $conn->prepare("UPDATE agenda_slots SET estado = 'reservado', visita_id = ? WHERE id = ?")->execute([$visitaId, $slotId]);

            // Actualizar solicitud
            $conn->prepare("UPDATE solicitudes_visita SET estado = 'asignada', slot_id = ? WHERE id = ?")->execute([$slotId, $solId]);

            historialInsert('visitas_taller', $visitaId, 'creado', null, null, "Asignada desde solicitud #{$solId}", $conn);
            $conn->commit();

            jsonResponse('success', 'Visita asignada al slot', ['visita_id' => $visitaId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── CONFIRMAR VISITA ──
    if ($action === 'confirmar') {
        $visitaId = (int)($_POST['visita_id'] ?? 0);
        if (!$visitaId) jsonResponse('error', 'Visita requerida', null, 422);

        try {
            $conn->prepare("UPDATE visitas_taller SET estado = 'confirmado' WHERE id = ? AND estado = 'reservado'")->execute([$visitaId]);
            $conn->prepare("UPDATE agenda_slots SET estado = 'confirmado' WHERE visita_id = ? AND estado = 'reservado'")->execute([$visitaId]);
            jsonResponse('success', 'Visita confirmada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── RECHAZAR SOLICITUD ──
    if ($action === 'rechazar_solicitud') {
        $solId = (int)($_POST['solicitud_id'] ?? 0);
        $motivo = trim($_POST['motivo'] ?? '');
        if (!$solId) jsonResponse('error', 'ID requerido', null, 422);

        try {
            $conn->prepare("UPDATE solicitudes_visita SET estado = 'rechazada', motivo_rechazo = ? WHERE id = ?")->execute([$motivo, $solId]);
            jsonResponse('success', 'Solicitud rechazada');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── CANCELAR SLOT ──
    if ($action === 'cancelar_slot') {
        $slotId = (int)($_POST['slot_id'] ?? 0);
        if (!$slotId) jsonResponse('error', 'Slot requerido', null, 422);

        try {
            $conn->beginTransaction();
            $conn->prepare("UPDATE agenda_slots SET estado = 'cancelado', visita_id = NULL WHERE id = ?")->execute([$slotId]);
            // Also cancel linked visit if exists
            $conn->prepare("UPDATE visitas_taller SET estado = 'cancelado' WHERE slot_id = ? AND estado NOT IN ('finalizado','cancelado')")->execute([$slotId]);
            $conn->commit();
            jsonResponse('success', 'Slot cancelado');
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── CREAR VISITA DIRECTA (sin solicitud) ──
    if ($action === 'crear_visita') {
        $slotId = (int)($_POST['slot_id'] ?? 0);
        $clienteId = (int)($_POST['cliente_id'] ?? 0);
        $vehiculoId = (int)($_POST['vehiculo_id'] ?? 0);
        $motivo = sanitizeString($_POST['motivo'] ?? '', 255);
        $notas = $_POST['notas'] ?? '';

        if (!$slotId || !$clienteId || !$motivo) {
            jsonResponse('error', 'Campos requeridos: horario, cliente, motivo', null, 422);
        }

        try {
            $conn->beginTransaction();

            $slot = $conn->prepare("SELECT * FROM agenda_slots WHERE id = ? AND estado = 'disponible'");
            $slot->execute([$slotId]);
            $slotData = $slot->fetch();
            if (!$slotData) jsonResponse('error', 'Slot no disponible', null, 409);

            // Fetch client data
            $cli = $conn->prepare("SELECT * FROM clientes WHERE id = ?");
            $cli->execute([$clienteId]);
            $cliRow = $cli->fetch();
            if (!$cliRow) jsonResponse('error', 'Cliente no encontrado', null, 404);

            // Fetch vehicle data if provided
            $vehRow = null;
            if ($vehiculoId) {
                $veh = $conn->prepare("SELECT * FROM vehiculos WHERE id = ? AND cliente_id = ?");
                $veh->execute([$vehiculoId, $clienteId]);
                $vehRow = $veh->fetch();
            }

            $nombre = $cliRow['nombre'] ?? '';
            $apellido = $cliRow['apellido'] ?? '';
            $telefono = $cliRow['telefono'] ?? '';
            $correo = $cliRow['correo'] ?? '';
            $patente = $vehRow['patente'] ?? '';
            $marca = $vehRow['marca'] ?? '';
            $modelo = $vehRow['modelo'] ?? '';
            $anio = $vehRow['anio'] ?? '';

            $visita = $conn->prepare("
                INSERT INTO visitas_taller (slot_id, cliente_id, cliente_nombre, cliente_apellido,
                    cliente_telefono, cliente_correo, vehiculo_id, vehiculo_patente, vehiculo_marca,
                    vehiculo_modelo, vehiculo_anio, motivo, notas, prioridad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $visita->execute([
                $slotId, $clienteId, $nombre, $apellido, $telefono, $correo,
                $vehiculoId ?: null, $patente, $marca, $modelo, $anio, $motivo, $notas, 'normal'
            ]);
            $visitaId = (int)$conn->lastInsertId();

            $conn->prepare("UPDATE agenda_slots SET estado = 'reservado', visita_id = ? WHERE id = ?")->execute([$visitaId, $slotId]);

            historialInsert('visitas_taller', $visitaId, 'creado', null, null, "Visita directa", $conn);
            $conn->commit();

            jsonResponse('success', 'Visita creada', ['visita_id' => $visitaId]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }

    // ── ACTUALIZAR BLOQUE HORARIO ──
    if ($action === 'actualizar_bloque') {
        $bloqueId = (int)($_POST['id'] ?? 0);
        $apertura = $_POST['hora_apertura'] ?? '';
        $cierre = $_POST['hora_cierre'] ?? '';
        $intervalo = (int)($_POST['intervalo_minutos'] ?? 30);
        $activo = isset($_POST['activo']) ? (int)$_POST['activo'] : 1;

        try {
            if ($bloqueId) {
                $conn->prepare("UPDATE agenda_bloques SET hora_apertura=?, hora_cierre=?, intervalo_minutos=?, activo=? WHERE id=?")
                    ->execute([$apertura, $cierre, $intervalo, $activo, $bloqueId]);
            } else {
                $dia = (int)($_POST['dia_semana'] ?? 0);
                $conn->prepare("INSERT INTO agenda_bloques (dia_semana, hora_apertura, hora_cierre, intervalo_minutos, activo) VALUES (?,?,?,?,?)")
                    ->execute([$dia, $apertura, $cierre, $intervalo, $activo]);
            }
            jsonResponse('success', 'Bloque actualizado');
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
        exit;
    }
}

jsonResponse('error', 'Método no soportado', null, 405);
