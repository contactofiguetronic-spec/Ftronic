<?php
/**
 * API de Correo Electronico — IMAP sync + SMTP send + CRUD
 * Endpoints: listar, ver, unread_count, cuentas, sincronizar, marcar_leido, marcar_flagged, responder, configurar_cuenta
 */
require_once '../includes/conexion.php';
requireAuth();
require_once '../includes/imap_client.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_REQUEST['action'] ?? '';

// Protección por permiso
$writeActions = ['sincronizar', 'marcar_leido', 'marcar_flagged', 'responder', 'configurar_cuenta'];
if (in_array($action, $writeActions)) {
    requirePerm('correo:editar');
}

// ── GET: Lectura ──
if ($method === 'GET') {

    // ── Bandeja de entrada paginada ──
    if ($action === 'listar') {
        $cuentaId = (int)($_GET['cuenta_id'] ?? 0);
        $leido = $_GET['leido'] ?? '';
        $busqueda = trim($_GET['busqueda'] ?? '');
        $fechaDesde = $_GET['fecha_desde'] ?? '';
        $fechaHasta = $_GET['fecha_hasta'] ?? '';
        $pagination = paginationParams();
        $page = $pagination['page'];
        $perPage = $pagination['per_page'];
        $offset = $pagination['offset'];

        $where = ['1=1'];
        $params = [];

        if ($cuentaId > 0) { $where[] = 'm.cuenta_id = ?'; $params[] = $cuentaId; }
        if ($leido === '0') { $where[] = 'm.leido = 0'; }
        if ($leido === '1') { $where[] = 'm.leido = 1'; }
        if (!empty($busqueda)) {
            $where[] = '(m.asunto LIKE ? OR m.remitente_nombre LIKE ? OR m.remitente_email LIKE ? OR m.body_text LIKE ?)';
            $search = "%$busqueda%";
            $params = array_merge($params, [$search, $search, $search, $search]);
        }
        if (!empty($fechaDesde)) { $where[] = 'm.fecha_envio >= ?'; $params[] = $fechaDesde; }
        if (!empty($fechaHasta)) { $where[] = 'm.fecha_envio <= ?'; $params[] = $fechaHasta . ' 23:59:59'; }

        $whereSql = implode(' AND ', $where);

        $countStmt = $conn->prepare("SELECT COUNT(*) FROM correo_mensajes m WHERE $whereSql");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $sql = "SELECT m.*, c.email AS cuenta_email
                FROM correo_mensajes m
                JOIN correo_cuentas c ON c.id = m.cuenta_id
                WHERE $whereSql
                ORDER BY m.fecha_envio DESC
                LIMIT ? OFFSET ?";
        $params[] = $perPage;
        $params[] = $offset;
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($items as &$item) {
            $item['destinatarios'] = json_decode($item['destinatarios'] ?? '[]', true);
            if (!empty($item['body_html'])) {
                $item['preview'] = mb_strimwidth(strip_tags($item['body_html']), 0, 120, '...');
            } else {
                $item['preview'] = mb_strimwidth($item['body_text'] ?? '', 0, 120, '...');
            }
        }

        jsonResponse('success', 'OK', [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => (int)ceil($total / $perPage),
        ]);
    }

    // ── Ver mensaje completo ──
    if ($action === 'ver') {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);

        $stmt = $conn->prepare("SELECT m.*, c.email AS cuenta_email, c.nombre_visible AS cuenta_nombre
            FROM correo_mensajes m JOIN correo_cuentas c ON c.id = m.cuenta_id WHERE m.id = ?");
        $stmt->execute([$id]);
        $msg = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$msg) jsonResponse('error', 'Mensaje no encontrado', null, 404);

        // Marcar como leido
        if (!$msg['leido']) {
            $conn->prepare("UPDATE correo_mensajes SET leido = 1 WHERE id = ?")->execute([$id]);
            $msg['leido'] = 1;
        }

        $msg['destinatarios'] = json_decode($msg['destinatarios'] ?? '[]', true);

        // Adjuntos
        $adjStmt = $conn->prepare("SELECT * FROM correo_adjuntos WHERE mensaje_id = ?");
        $adjStmt->execute([$id]);
        $msg['adjuntos'] = $adjStmt->fetchAll(PDO::FETCH_ASSOC);

        // Hilo: buscar respuestas a este mensaje
        $threadStmt = $conn->prepare("SELECT id, remitente_nombre, remitente_email, asunto, fecha_envio, leido
            FROM correo_mensajes WHERE in_reply_to = ? ORDER BY fecha_envio ASC");
        $threadStmt->execute([$msg['message_id']]);
        $msg['respuestas'] = $threadStmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse('success', 'OK', $msg);
    }

    // ── Conteo de no-leidos ──
    if ($action === 'unread_count') {
        $stmt = $conn->prepare("SELECT c.id, c.email, c.nombre_visible,
            (SELECT COUNT(*) FROM correo_mensajes m WHERE m.cuenta_id = c.id AND m.leido = 0) AS no_leidos
            FROM correo_cuentas c WHERE c.activa = 1");
        $stmt->execute();
        $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $total = array_sum(array_column($cuentas, 'no_leidos'));
        jsonResponse('success', 'OK', ['cuentas' => $cuentas, 'total' => $total]);
    }

    // ── Listar cuentas ──
    if ($action === 'cuentas') {
        $stmt = $conn->prepare("SELECT id, email, nombre_visible, activa, ultima_sync,
            imap_host, imap_port, smtp_host, smtp_port FROM correo_cuentas ORDER BY email");
        $stmt->execute();
        jsonResponse('success', 'OK', $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    jsonResponse('error', 'Acción no válida', null, 400);
}

// ── POST: Escritura ──
elseif ($method === 'POST') {

    // ── Sincronizar correo via IMAP ──
    if ($action === 'sincronizar') {
        $cuentaId = (int)($_POST['cuenta_id'] ?? 0);

        $sql = "SELECT * FROM correo_cuentas WHERE activa = 1";
        $params = [];
        if ($cuentaId > 0) { $sql .= " AND id = ?"; $params[] = $cuentaId; }
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $cuentas = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($cuentas)) jsonResponse('error', 'No hay cuentas activas', null, 404);

        $synced = 0;
        $errors = [];

        foreach ($cuentas as $cuenta) {
            try {
                $password = decryptValue($cuenta['password_encrypted']);
                if (empty($password)) { $errors[] = "{$cuenta['email']}: password no descifrable"; continue; }

                $imap = new ImapClient($cuenta['imap_host'], $cuenta['imap_port'], $cuenta['email'], $password);
                $imap->connect();
                $imap->login();
                $imap->selectFolder('INBOX');

                $lastUid = (int)($cuenta['last_uid'] ?: 0);
                $newUids = $lastUid > 0 ? $imap->searchSinceUid((string)$lastUid) : $imap->searchAll();

                // Limitar a ultimos 100 mensajes en primera sync
                if ($lastUid === 0 && count($newUids) > 100) {
                    $newUids = array_slice($newUids, -100);
                }

                $maxUid = $lastUid;
                foreach ($newUids as $uid) {
                    $infos = $imap->getMessagesInfo([$uid]);
                    if (empty($infos)) continue;
                    $info = $infos[0];

                    // Verificar duplicado
                    $chk = $conn->prepare("SELECT id FROM correo_mensajes WHERE cuenta_id = ? AND uid = ?");
                    $chk->execute([$cuenta['id'], (string)$uid]);
                    if ($chk->fetch()) continue;

                    // Obtener body completo
                    $bodyData = $imap->getMessageBody($uid);
                    $rawBody = $bodyData['body'] ?? '';
                    $parsed = parseMimeMessage($rawBody);

                    $asunto = $info['subject'] ?: '(sin asunto)';
                    $bodyHtml = !empty($parsed['html']) ? sanitizeEmailHtml($parsed['html']) : '';
                    $bodyText = !empty($parsed['text']) ? sanitizeEmailText($parsed['text']) : '';
                    if (empty($bodyText) && !empty($bodyHtml)) $bodyText = sanitizeEmailText($bodyHtml);

                    $destinatarios = array_merge(
                        array_map(fn($a) => ['nombre' => $a['nombre'], 'email' => $a['email'], 'tipo' => 'to'], $info['to'] ?? []),
                        array_map(fn($a) => ['nombre' => $a['nombre'], 'email' => $a['email'], 'tipo' => 'cc'], $info['cc'] ?? [])
                    );

                    $fechaEnvio = parseEmailDate($info['date'] ?? '');

                    $ins = $conn->prepare("INSERT IGNORE INTO correo_mensajes
                        (cuenta_id, uid, message_id, in_reply_to, thread_references, direction,
                         remitente_nombre, remitente_email, destinatarios, asunto,
                         body_text, body_html, fecha_envio, tiene_adjuntos, leido)
                        VALUES (?, ?, ?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, 0)");
                    $ins->execute([
                        $cuenta['id'],
                        (string)$uid,
                        $info['message_id'] ?: null,
                        $info['in_reply_to'] ?: null,
                        $info['references'] ?: null,
                        $info['from']['nombre'] ?? '',
                        $info['from']['email'] ?? '',
                        json_encode($destinatarios, JSON_UNESCAPED_UNICODE),
                        $asunto,
                        $bodyText,
                        $bodyHtml,
                        $fechaEnvio ?: date('Y-m-d H:i:s'),
                        !empty($parsed['attachments']) ? 1 : 0,
                    ]);
                    $msgId = (int)$conn->lastInsertId();

                    // Guardar adjuntos
                    if (!empty($parsed['attachments'])) {
                        $attachDir = "../uploads/correo/{$cuenta['id']}/$msgId";
                        if (!is_dir($attachDir)) mkdir($attachDir, 0755, true);

                        foreach ($parsed['attachments'] as $att) {
                            $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $att['filename']);
                            $filepath = "$attachDir/$safeName";
                            file_put_contents($filepath, $att['content']);

                            $conn->prepare("INSERT INTO correo_adjuntos (mensaje_id, filename, mime_type, size_bytes, disk_path)
                                VALUES (?, ?, ?, ?, ?)")->execute([
                                $msgId, $att['filename'], $att['mime_type'] ?? '', strlen($att['content']), $filepath
                            ]);
                        }
                    }

                    // Auto-vincular a cliente
                    $emailRemitente = $info['from']['email'] ?? '';
                    if (!empty($emailRemitente)) {
                        $cliStmt = $conn->prepare("SELECT id FROM clientes WHERE correo = ? LIMIT 1");
                        $cliStmt->execute([$emailRemitente]);
                        $cliRow = $cliStmt->fetch(PDO::FETCH_ASSOC);
                        if ($cliRow) {
                            $conn->prepare("UPDATE correo_mensajes SET cliente_id = ? WHERE id = ?")->execute([$cliRow['id'], $msgId]);
                        }
                    }

                    if ((int)$uid > $maxUid) $maxUid = (int)$uid;
                    $synced++;
                }

                $imap->disconnect();

                // Actualizar watermark
                if ($maxUid > $lastUid) {
                    $conn->prepare("UPDATE correo_cuentas SET last_uid = ?, ultima_sync = NOW() WHERE id = ?")
                        ->execute([(string)$maxUid, $cuenta['id']]);
                } else {
                    $conn->prepare("UPDATE correo_cuentas SET ultima_sync = NOW() WHERE id = ?")
                        ->execute([$cuenta['id']]);
                }

            } catch (Exception $e) {
                $errors[] = "{$cuenta['email']}: " . $e->getMessage();
            }
        }

        jsonResponse('success', 'Sincronización completada', ['synced' => $synced, 'errors' => $errors]);
    }

    // ── Marcar leido / no-leido ──
    if ($action === 'marcar_leido') {
        $id = (int)($_POST['id'] ?? 0);
        $leido = (int)($_POST['leido'] ?? 1);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $conn->prepare("UPDATE correo_mensajes SET leido = ? WHERE id = ?")->execute([$leido ? 1 : 0, $id]);
        jsonResponse('success', 'OK');
    }

    // ── Marcar flaggeado ──
    if ($action === 'marcar_flagged') {
        $id = (int)($_POST['id'] ?? 0);
        $flagged = (int)($_POST['flaggeado'] ?? 1);
        if (!$id) jsonResponse('error', 'ID requerido', null, 422);
        $conn->prepare("UPDATE correo_mensajes SET flaggeado = ? WHERE id = ?")->execute([$flagged ? 1 : 0, $id]);
        jsonResponse('success', 'OK');
    }

    // �─ Responder correo via SMTP ──
    if ($action === 'responder') {
        $mensajeId = (int)($_POST['mensaje_id'] ?? 0);
        $cuentaId = (int)($_POST['cuenta_id'] ?? 0);
        $bodyHtml = trim($_POST['body'] ?? '');
        $replyTo = trim($_POST['reply_to'] ?? '');

        if (!$mensajeId || !$cuentaId || empty($bodyHtml)) {
            jsonResponse('error', 'Datos incompletos', null, 422);
        }

        // Obtener cuenta
        $cStmt = $conn->prepare("SELECT * FROM correo_cuentas WHERE id = ?");
        $cStmt->execute([$cuentaId]);
        $cuenta = $cStmt->fetch(PDO::FETCH_ASSOC);
        if (!$cuenta) jsonResponse('error', 'Cuenta no encontrada', null, 404);

        // Obtener mensaje original
        $mStmt = $conn->prepare("SELECT * FROM correo_mensajes WHERE id = ?");
        $mStmt->execute([$mensajeId]);
        $original = $mStmt->fetch(PDO::FETCH_ASSOC);
        if (!$original) jsonResponse('error', 'Mensaje no encontrado', null, 404);

        $destEmail = $replyTo ?: $original['remitente_email'];
        $destName = $original['remitente_nombre'];
        $subject = 'Re: ' . preg_replace('/^Re:\s*/i', '', $original['asunto']);

        try {
            require_once '../vendor/phpmailer/src/Exception.php';
            require_once '../vendor/phpmailer/src/PHPMailer.php';
            require_once '../vendor/phpmailer/src/SMTP.php';

            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = $cuenta['smtp_host'];
            $mail->SMTPAuth = true;
            $mail->Username = $cuenta['email'];
            $mail->Password = decryptValue($cuenta['password_encrypted']);
            $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port = (int)$cuenta['smtp_port'];
            $mail->CharSet = 'UTF-8';

            $mail->setFrom($cuenta['email'], $cuenta['nombre_visible'] ?: $cuenta['email']);
            $mail->addAddress($destEmail, $destName);
            $mail->addReplyTo($cuenta['email'], $cuenta['nombre_visible']);

            // In-Reply-To y References para threading
            if (!empty($original['message_id'])) {
                $mail->addCustomHeader('In-Reply-To', "<{$original['message_id']}>");
                $ref = $original['message_id'];
                if (!empty($original['thread_references'])) $ref = $original['thread_references'] . " <$original[message_id]>";
                $mail->addCustomHeader('References', "<$ref>");
            }

            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $bodyHtml;
            $mail->AltBody = strip_tags($bodyHtml);

            // Adjuntos del formulario
            if (!empty($_FILES['archivos']['name'][0])) {
                foreach ($_FILES['archivos']['tmp_name'] as $i => $tmp) {
                    if (!empty($tmp)) {
                        $mail->addAttachment($tmp, $_FILES['archivos']['name'][$i]);
                    }
                }
            }

            $mail->send();

            // Guardar en BD
            $destJson = json_encode([['nombre' => $destName, 'email' => $destEmail, 'tipo' => 'to']]);
            $conn->prepare("INSERT INTO correo_enviados (cuenta_id, mensaje_padre_id, remitente, destinatarios, asunto, body_html, estado)
                VALUES (?, ?, ?, ?, ?, ?, 'enviado')")->execute([
                $cuentaId, $mensajeId, $cuenta['email'], $destJson, $subject, $bodyHtml
            ]);

            // Marcar original como respondido
            $conn->prepare("UPDATE correo_mensajes SET leido = 1 WHERE id = ?")->execute([$mensajeId]);

            jsonResponse('success', 'Respuesta enviada correctamente');

        } catch (Exception $e) {
            $conn->prepare("INSERT INTO correo_enviados (cuenta_id, mensaje_padre_id, remitente, destinatarios, asunto, body_html, estado, error_msg)
                VALUES (?, ?, ?, ?, ?, ?, 'error', ?)")->execute([
                $cuentaId, $mensajeId, $cuenta['email'], json_encode([['email' => $destEmail]]), $subject, $bodyHtml, $e->getMessage()
            ]);
            jsonResponse('error', 'Error al enviar: ' . $e->getMessage(), null, 500);
        }
    }

    // ── Configurar cuenta ──
    if ($action === 'configurar_cuenta') {
        $id = (int)($_POST['id'] ?? 0);
        $email = trim($_POST['email'] ?? '');
        $password = trim($_POST['password'] ?? '');
        $imapHost = trim($_POST['imap_host'] ?? '');
        $imapPort = (int)($_POST['imap_port'] ?? 993);
        $smtpHost = trim($_POST['smtp_host'] ?? '');
        $smtpPort = (int)($_POST['smtp_port'] ?? 465);
        $nombreVisible = trim($_POST['nombre_visible'] ?? '');

        if (empty($email)) jsonResponse('error', 'Email requerido', null, 422);
        if (empty($imapHost)) jsonResponse('error', 'Host IMAP requerido', null, 422);
        if (empty($smtpHost)) jsonResponse('error', 'Host SMTP requerido', null, 422);

        $encPassword = encryptValue($password);

        if ($id > 0) {
            $sql = "UPDATE correo_cuentas SET email = ?, imap_host = ?, imap_port = ?, smtp_host = ?, smtp_port = ?, nombre_visible = ?";
            $params = [$email, $imapHost, $imapPort, $smtpHost, $smtpPort, $nombreVisible];
            if (!empty($password)) { $sql .= ", password_encrypted = ?"; $params[] = $encPassword; }
            $sql .= " WHERE id = ?";
            $params[] = $id;
            $conn->prepare($sql)->execute($params);
        } else {
            if (empty($password)) jsonResponse('error', 'Password requerido para nueva cuenta', null, 422);
            $conn->prepare("INSERT INTO correo_cuentas (email, password_encrypted, imap_host, imap_port, smtp_host, smtp_port, nombre_visible)
                VALUES (?, ?, ?, ?, ?, ?, ?)")->execute([$email, $encPassword, $imapHost, $imapPort, $smtpHost, $smtpPort, $nombreVisible]);
        }

        jsonResponse('success', 'Cuenta configurada correctamente');
    }

    // ── Descargar adjunto ──
    if ($action === 'adjunto_descargar') {
        $adjId = (int)($_POST['adjunto_id'] ?? 0);
        if (!$adjId) jsonResponse('error', 'ID requerido', null, 422);

        $stmt = $conn->prepare("SELECT * FROM correo_adjuntos WHERE id = ?");
        $stmt->execute([$adjId]);
        $adj = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$adj || !file_exists($adj['disk_path'])) jsonResponse('error', 'Adjunto no encontrado', null, 404);

        header('Content-Type: ' . ($adj['mime_type'] ?: 'application/octet-stream'));
        header('Content-Disposition: attachment; filename="' . $adj['filename'] . '"');
        header('Content-Length: ' . $adj['size_bytes']);
        readfile($adj['disk_path']);
        exit;
    }

    jsonResponse('error', 'Acción no válida', null, 400);
}

jsonResponse('error', 'Método no soportado', null, 405);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — Parseo MIME
// ═══════════════════════════════════════════════════════════════════════════

function parseMimeMessage(string $rawBody): array {
    $result = ['html' => '', 'text' => '', 'attachments' => []];
    if (empty($rawBody)) return $result;

    $boundary = extractBoundary($rawBody);
    if (!$boundary) {
        $result['text'] = $rawBody;
        return $result;
    }

    $parts = splitMimeParts($rawBody, $boundary);
    foreach ($parts as $part) {
        $headers = extractPartHeaders($part);
        $contentType = $headers['content-type'] ?? 'text/plain';
        $transferEncoding = $headers['content-transfer-encoding'] ?? '7bit';
        $contentDisposition = $headers['content-disposition'] ?? '';
        $filename = extractFilename($headers);
        $body = extractPartBody($part);

        if ($transferEncoding === 'base64') $body = base64_decode($body);
        elseif ($transferEncoding === 'quoted-printable') $body = quoted_printable_decode($body);

        if (str_contains($contentDisposition, 'attachment') || (!empty($filename) && !str_contains($contentType, 'text/'))) {
            $result['attachments'][] = [
                'filename' => $filename ?: 'adjunto_' . time(),
                'mime_type' => strtok($contentType, ';'),
                'content' => $body,
            ];
        } elseif (str_contains($contentType, 'text/html')) {
            $result['html'] .= $body;
        } elseif (str_contains($contentType, 'text/plain')) {
            $result['text'] .= $body;
        }
    }

    return $result;
}

function extractBoundary(string $rawBody): ?string {
    if (preg_match('/boundary="?([^";\r\n]+)"?/i', $rawBody, $m)) {
        return trim($m[1], '"');
    }
    return null;
}

function splitMimeParts(string $rawBody, string $boundary): array {
    $parts = explode("--$boundary", $rawBody);
    $result = [];
    for ($i = 1; $i < count($parts) - 1; $i++) {
        $trimmed = ltrim($parts[$i], "\r\n");
        $result[] = $trimmed;
    }
    return $result;
}

function extractPartHeaders(string $part): array {
    $headers = [];
    $lines = explode("\r\n", $part);
    foreach ($lines as $line) {
        if (empty(trim($line)) || !str_contains($line, ':')) break;
        [$key, $value] = explode(':', $line, 2);
        $headers[strtolower(trim($key))] = trim($value);
    }
    return $headers;
}

function extractPartBody(string $part): string {
    $lines = explode("\r\n", $part);
    $bodyStart = 0;
    foreach ($lines as $i => $line) {
        if (empty(trim($line)) && $i > 0) { $bodyStart = $i + 1; break; }
    }
    return implode("\r\n", array_slice($lines, $bodyStart));
}

function extractFilename(array $headers): string {
    $cd = $headers['content-disposition'] ?? '';
    if (preg_match('/filename\*?="?([^";\r\n]+)"?/i', $cd, $m)) {
        $name = trim($m[1], '" ');
        if (preg_match("/=\?([^?]+)\?([bq])\?(.+)\?=/i", $name, $enc)) {
            $decoded = $enc[2] === 'b' ? base64_decode($enc[3]) : quoted_printable_decode($enc[3]);
            return @iconv($enc[1], 'UTF-8', $decoded) ?: $decoded;
        }
        return $name;
    }
    return '';
}

function parseEmailDate(string $dateStr): string {
    if (empty($dateStr)) return date('Y-m-d H:i:s');
    $ts = strtotime($dateStr);
    return $ts ? date('Y-m-d H:i:s', $ts) : date('Y-m-d H:i:s');
}
