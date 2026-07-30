<?php
// ============================================================================
// solicitudes_api.php — Solicitud de Visita: endpoint público para clientes
// ============================================================================
require_once '../includes/conexion.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// ── GET: Disponibilidad pública (solo slots disponibles) ──
if ($method === 'GET') {

    // ── CALENDARIO PÚBLICO: meses disponibles ──
    if ($action === 'calendario' || $action === '') {
        try {
            $year = (int)($_GET['year'] ?? date('Y'));
            $month = (int)($_GET['month'] ?? date('m'));
            $firstDay = sprintf('%04d-%02d-01', $year, $month);
            $lastDay = date('Y-m-t', strtotime($firstDay));

            // Obtener días con al menos 1 slot disponible
            $stmt = $conn->prepare("
                SELECT s.fecha, COUNT(*) AS disponibles
                FROM agenda_slots s
                WHERE s.fecha BETWEEN ? AND ? AND s.estado = 'disponible'
                GROUP BY s.fecha
                ORDER BY s.fecha
            ");
            $stmt->execute([$firstDay, $lastDay]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── SLOTS DISPONIBLES para una fecha ──
    elseif ($action === 'slots') {
        try {
            $fecha = $_GET['fecha'] ?? date('Y-m-d');
            $stmt = $conn->prepare("
                SELECT id, fecha, hora_inicio, hora_fin
                FROM agenda_slots
                WHERE fecha = ? AND estado = 'disponible'
                ORDER BY hora_inicio
            ");
            $stmt->execute([$fecha]);
            jsonResponse('success', 'OK', $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse('error', $e->getMessage(), null, 500);
        }
    }

    // ── CONFIRMAR ENVÍO (check si slot sigue libre) ──
    elseif ($action === 'verificar_slot') {
        $slotId = (int)($_GET['slot_id'] ?? 0);
        $stmt = $conn->prepare("SELECT id, estado FROM agenda_slots WHERE id = ?");
        $stmt->execute([$slotId]);
        $slot = $stmt->fetch();
        jsonResponse('success', 'OK', [
            'disponible' => $slot && $slot['estado'] === 'disponible',
            'estado' => $slot['estado'] ?? 'no_existe',
        ]);
    }
}

// ── POST: Enviar solicitud ──
elseif ($method === 'POST') {

    if ($action === 'enviar' || $action === '') {
        $nombre    = trim($_POST['cliente_nombre'] ?? '');
        $apellido  = trim($_POST['cliente_apellido'] ?? '');
        $telefono  = trim($_POST['cliente_telefono'] ?? '');
        $correo    = trim($_POST['cliente_correo'] ?? '');
        $rut       = trim($_POST['cliente_rut'] ?? '');
        $patente   = strtoupper(trim($_POST['vehiculo_patente'] ?? ''));
        $marca     = trim($_POST['vehiculo_marca'] ?? '');
        $modelo    = trim($_POST['vehiculo_modelo'] ?? '');
        $anio      = trim($_POST['vehiculo_anio'] ?? '');
        $motivo    = trim($_POST['motivo'] ?? '');
        $slotId    = (int)($_POST['slot_id'] ?? 0);
        $fechaSol  = $_POST['fecha_solicitada'] ?? null;
        $horaSol   = $_POST['hora_solicitada'] ?? null;
        $obs       = trim($_POST['observaciones'] ?? '');

        // Validaciones
        if (empty($nombre)) jsonResponse('error', 'Nombre requerido', null, 422);
        if (empty($telefono)) jsonResponse('error', 'Teléfono requerido', null, 422);
        if (empty($marca)) jsonResponse('error', 'Marca del vehículo requerida', null, 422);
        if (empty($modelo)) jsonResponse('error', 'Modelo del vehículo requerido', null, 422);
        if (empty($anio)) jsonResponse('error', 'Año del vehículo requerido', null, 422);
        if (empty($motivo)) jsonResponse('error', 'Motivo de la visita requerido', null, 422);

        try {
            $conn->beginTransaction();

            // Verificar slot si se especificó
            if ($slotId) {
                $chk = $conn->prepare("SELECT id, estado, fecha, hora_inicio FROM agenda_slots WHERE id = ?");
                $chk->execute([$slotId]);
                $slotChk = $chk->fetch();
                if (!$slotChk || $slotChk['estado'] !== 'disponible') {
                    $conn->rollBack();
                    jsonResponse('error', 'El horario seleccionado ya no está disponible. Por favor elija otro.', null, 409);
                    exit;
                }
                $fechaSol = $fechaSol ?: $slotChk['fecha'];
                $horaSol = $horaSol ?: $slotChk['hora_inicio'];
            }

            // Recoger notas de voz del JSON
            $notasVoz = null;
            if (!empty($_POST['notas_voz'])) {
                $notasVoz = $_POST['notas_voz'];
                json_decode($notasVoz); // validate JSON
                if (json_last_error() !== JSON_ERROR_NONE) $notasVoz = null;
            }

            $stmt = $conn->prepare("
                INSERT INTO solicitudes_visita (
                    cliente_nombre, cliente_apellido, cliente_telefono, cliente_correo, cliente_rut,
                    vehiculo_patente, vehiculo_marca, vehiculo_modelo, vehiculo_anio,
                    motivo, fecha_solicitada, hora_solicitada, observaciones, slot_id, notas_voz
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $nombre, $apellido, $telefono, $correo, $rut,
                $patente, $marca, $modelo, $anio,
                $motivo, $fechaSol, $horaSol, $obs, $slotId ?: null, $notasVoz
            ]);
            $solId = (int)$conn->lastInsertId();

            // Subir archivos multimedia si existen
            if (!empty($_FILES['archivos']['name'][0])) {
                uploadMultimedia($_FILES['archivos'], 'solicitudes_visita', $solId, $conn);
            }

            // Obtener folio
            $folioRow = $conn->prepare("SELECT folio FROM solicitudes_visita WHERE id = ?");
            $folioRow->execute([$solId]);
            $folio = $folioRow->fetchColumn();

            $conn->commit();
            jsonResponse('success', 'Solicitud enviada exitosamente', [
                'id' => $solId,
                'folio' => $folio,
            ]);
        } catch (Exception $e) {
            if ($conn->inTransaction()) $conn->rollBack();
            jsonResponse('error', 'Error al procesar: ' . $e->getMessage(), null, 500);
        }
        exit;
    }
}

jsonResponse('error', 'Método no soportado', null, 405);
