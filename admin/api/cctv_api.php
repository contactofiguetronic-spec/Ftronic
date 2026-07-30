<?php
// cctv_api.php — Módulo CCTV (Dahua): dispositivos, cámaras, proxy snapshot, acceso nube
require_once '../includes/conexion.php';
requireAuth();

// Auto-migración: agregar columnas ip_publica y puerto_sdk si no existen (idempotente)
function cctvAutoMigrate(PDO $conn): void {
    $columns = ['ip_publica' => "VARCHAR(50) DEFAULT NULL AFTER ip_local",
                'puerto_sdk' => "INT NOT NULL DEFAULT 37777 AFTER puerto_rtsp"];
    foreach ($columns as $col => $def) {
        try {
            $exists = $conn->query("SHOW COLUMNS FROM cctv_dispositivos LIKE '{$col}'")->fetch();
            if (!$exists) {
                $conn->exec("ALTER TABLE cctv_dispositivos ADD COLUMN {$col} {$def}");
                error_log("[CCTV] Migración: columna {$col} creada");
            }
        } catch (Exception $e) {
            error_log("[CCTV] Migración {$col}: " . $e->getMessage());
        }
    }
}
cctvAutoMigrate($conn);

$action = $_REQUEST['action'] ?? '';

switch ($action) {
    case 'dispositivos':            requirePerm('cctv:ver');     handleListarDispositivos($conn); break;
    case 'camaras':                 requirePerm('cctv:ver');     handleListarCamaras($conn); break;
    case 'estado':                  requirePerm('cctv:ver');     handleEstado($conn); break;
    case 'nube_url':                requirePerm('cctv:acceder'); handleNubeUrl($conn); break;
    case 'snapshot':                requirePerm('cctv:acceder'); handleSnapshot($conn); break;
    case 'stream':                  requirePerm('cctv:acceder'); handleStream($conn); break;
    case 'guardar_dispositivo':     requirePerm('cctv:config');  handleGuardarDispositivo($conn); break;
    case 'eliminar_dispositivo':    requirePerm('cctv:eliminar');handleEliminarDispositivo($conn); break;
    case 'guardar_camara':          requirePerm('cctv:config');  handleGuardarCamara($conn); break;
    case 'eliminar_camara':         requirePerm('cctv:eliminar');handleEliminarCamara($conn); break;
    case 'ptz':                     requirePerm('cctv:config');  handlePtz($conn); break;
    case 'dolynk_save':             requirePerm('cctv:config');  handleDolynkSave($conn); break;
    case 'dolynk_config':           requirePerm('cctv:config');  handleDolynkConfig($conn); break;
    case 'dolynk_stream':           requirePerm('cctv:acceder'); handleDolynkStream($conn); break;
    case 'dolynk_hls':              requirePerm('cctv:acceder'); handleDolynkHls($conn); break;
    case 'dolynk_snapshot':         requirePerm('cctv:acceder'); handleDolynkSnapshot($conn); break;
    case 'dolynk_ptz':             requirePerm('cctv:config');  handleDolynkPtz($conn); break;
    case 'dolynk_add':             requirePerm('cctv:config');  handleDolynkAdd($conn); break;
    case 'dolynk_bindinfo':         requirePerm('cctv:ver');     handleDolynkBindInfo($conn); break;
    case 'debug_dvr':               requirePerm('cctv:ver');     handleDebugDvr($conn); break;
    default: jsonResponse('error', 'Acción no válida: ' . htmlspecialchars($action));
}

/* ════════════════════════════════════════════════════════════
   LISTADOS
   ════════════════════════════════════════════════════════════ */

function handleListarDispositivos(PDO $conn): void {
    try {
        $stmt = $conn->prepare("SELECT * FROM cctv_dispositivos ORDER BY nombre");
        $stmt->execute();
        $disps = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // No exponer la clave; solo indicar si existe
        foreach ($disps as &$d) {
            $d['tiene_clave'] = !empty($d['clave_cifrada']);
            unset($d['usuario'], $d['clave_cifrada']);
        }
        jsonResponse('success', 'Dispositivos', $disps);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

function handleListarCamaras(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    try {
        $sql = "SELECT c.*, d.nombre AS dispositivo_nombre, d.device_id_p2p, d.ip_local, d.portal_web FROM cctv_camaras c INNER JOIN cctv_dispositivos d ON c.dispositivo_id = d.id";
        if ($dispId) {
            $stmt = $conn->prepare($sql . " WHERE c.dispositivo_id = ? ORDER BY c.canal");
            $stmt->execute([$dispId]);
        } else {
            $stmt = $conn->prepare($sql . " ORDER BY d.nombre, c.canal");
            $stmt->execute();
        }
        $camaras = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Enriquecer con ip_publica si la columna existe
        try {
            $hasCol = $conn->query("SHOW COLUMNS FROM cctv_dispositivos LIKE 'ip_publica'")->fetch();
            if ($hasCol && !empty($camaras)) {
                $dispIds = array_unique(array_column($camaras, 'dispositivo_id'));
                $ph = implode(',', array_fill(0, count($dispIds), '?'));
                $stmt2 = $conn->prepare("SELECT id, ip_publica FROM cctv_dispositivos WHERE id IN ($ph)");
                $stmt2->execute($dispIds);
                $ipmap = [];
                while ($row = $stmt2->fetch(PDO::FETCH_ASSOC)) { $ipmap[$row['id']] = $row['ip_publica']; }
                foreach ($camaras as &$cam) { $cam['ip_publica'] = $ipmap[$cam['dispositivo_id']] ?? null; }
            }
        } catch (Exception $e) { /* columna ip_publica no existe aún, ignorar */ }
        jsonResponse('success', 'Cámaras', $camaras);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

function handleEstado(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido');
    try {
        $stmt = $conn->prepare("SELECT id, nombre, ip_local, ip_publica, puerto_http FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado');

        $alcanzable = false;
        $host = !empty($d['ip_publica']) ? $d['ip_publica'] : ($d['ip_local'] ?? '');
        if (!empty($host)) {
            // Detectar DDNS: hostname con puntos → HTTPS:443
            $isDns = strpos($host, '.') !== false;
            $port = $isDns ? 443 : ((int)$d['puerto_http'] ?: 80);
            $fp = @fsockopen($host, $port, $errno, $errstr, 3);
            if ($fp) { $alcanzable = true; fclose($fp); }
        }
        jsonResponse('success', 'Estado', [
            'dispositivo_id' => $dispId,
            'alcanzable'     => $alcanzable,
            'ip_local'       => $d['ip_local'],
            'ip_publica'     => $d['ip_publica'],
        ]);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

function handleNubeUrl(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido');
    try {
        $stmt = $conn->prepare("SELECT nombre, device_id_p2p, portal_web FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado');
        $url = !empty($d['portal_web']) ? $d['portal_web'] : 'https://dhi-dms.com';
        jsonResponse('success', 'URL de acceso', [
            'url'           => $url,
            'nombre'        => $d['nombre'],
            'device_id_p2p' => $d['device_id_p2p'],
        ]);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   HELPER: construir URL base del DVR
   Detecta DDNS automáticamente (hostname con puntos → HTTPS:443).
   Fallback a HTTP con el puerto configurado.
   ════════════════════════════════════════════════════════════ */
function dvrBaseUrl(array $d): string {
    // 1) Si ip_publica es hostname DDNS (contiene puntos), usar HTTPS:443
    $ipPub = $d['ip_publica'] ?? '';
    if (!empty($ipPub) && strpos($ipPub, '.') !== false) {
        return "https://{$ipPub}:443";
    }
    // 2) Si ip_publica es IP directa, usar HTTP con puerto configurado
    if (!empty($ipPub)) {
        $port = (int)($d['puerto_http'] ?: 80);
        return "http://{$ipPub}:{$port}";
    }
    // 3) Si device_id_p2p contiene puntos (es DDNS), usar HTTPS:443
    $p2p = $d['device_id_p2p'] ?? '';
    if (!empty($p2p) && strpos($p2p, '.') !== false) {
        return "https://{$p2p}:443";
    }
    // 4) Fallback: IP local con HTTP
    $host = $d['ip_local'] ?? '';
    if (empty($host)) return '';
    $port = (int)($d['puerto_http'] ?: 80);
    return "http://{$host}:{$port}";
}

/* Helper: construir URL de snapshot/stream para un dispositivo */
function dvrStreamUrl(array $d, string $endpoint, int $canal, int $subtype = 1): string {
    $base = dvrBaseUrl($d);
    if (empty($base)) return '';
    return "{$base}/cgi-bin/{$endpoint}?channel={$canal}&subtype={$subtype}";
}

/* ════════════════════════════════════════════════════════════
   PROXY SNAPSHOT (best-effort, solo si el DVR es alcanzable)
   ════════════════════════════════════════════════════════════ */

function handleSnapshot(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    $canal  = (int)($_GET['canal'] ?? 1);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);

    try {
        $stmt = $conn->prepare("SELECT * FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);

        // Preferir IP pública (port-forward), fallback a IP local
        $base = dvrBaseUrl($d);
        if (empty($base)) {
            jsonResponse('error', 'DVR no expuesto en red local ni pública. Use el acceso por nube Dahua.', null, 409);
        }

        $user = $d['usuario'] ?? '';
        $pass = !empty($d['clave_cifrada']) ? decryptValue($d['clave_cifrada']) : '';
        $url  = "{$base}/cgi-bin/snapshot.cgi?channel={$canal}&subtype=1";

        error_log("[Snapshot] DVR id={$dispId} url={$url} user={$user}");

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 6,
            CURLOPT_CONNECTTIMEOUT=> 4,
            CURLOPT_HTTPAUTH       => CURLAUTH_DIGEST,
            CURLOPT_USERPWD        => "{$user}:{$pass}",
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
        ]);
        $img = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $ctype = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($img === false || $httpCode !== 200 || strpos($ctype ?: '', 'image') === false) {
            error_log("[Snapshot] DVR id={$dispId} canal={$canal} url={$url} http={$httpCode} err={$err} ctype={$ctype}");
            // Fallback: intentar vía tunnel P2P (cloudflared → bridge → dh-p2p → DVR)
            $tunnelUrl = getConfig('cctv_p2p_tunnel_url', '');
            if (!empty($tunnelUrl)) {
                $p2pUrl = rtrim($tunnelUrl, '/') . "/snapshot?channel={$canal}&subtype=1";
                error_log("[Snapshot-P2P] Fallback tunnel: {$p2pUrl}");
                $ch2 = curl_init($p2pUrl);
                curl_setopt_array($ch2, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT        => 20,
                    CURLOPT_CONNECTTIMEOUT=> 8,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => 0,
                ]);
                $img2 = curl_exec($ch2);
                $http2 = (int)curl_getinfo($ch2, CURLINFO_HTTP_CODE);
                $ct2 = curl_getinfo($ch2, CURLINFO_CONTENT_TYPE);
                $err2 = curl_error($ch2);
                curl_close($ch2);
                if ($img2 !== false && $http2 === 200 && strpos($ct2 ?: '', 'image') !== false) {
                    error_log("[Snapshot-P2P] OK canal={$canal} size=" . strlen($img2));
                    header('Content-Type: image/jpeg');
                    header('Cache-Control: no-store, no-cache, must-revalidate');
                    echo $img2;
                    exit;
                }
                error_log("[Snapshot-P2P] También falló: http={$http2} err={$err2}");
            }
            jsonResponse('error', 'No se pudo obtener el snapshot del DVR (no alcanzable o sin CGI). ' . $err, null, 502);
        }

        header('Content-Type: image/jpeg');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        echo $img;
        exit;
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   PROXY MJPEG (video en vivo sin transcodificar, solo si el DVR
   es alcanzable desde el servidor: VPN, IP pública o port-forward)
   ════════════════════════════════════════════════════════════ */

function handleStream(PDO $conn): void {
    $dispId  = (int)($_GET['dispositivo_id'] ?? 0);
    $canal   = (int)($_GET['canal'] ?? 1);
    $subtype = (int)($_GET['subtype'] ?? 1);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);

    try {
        $stmt = $conn->prepare("SELECT * FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);

        // Preferir IP pública (port-forward), fallback a IP local
        $base = dvrBaseUrl($d);
        if (empty($base)) {
            error_log('[Stream] Dispositivo ' . $dispId . ' sin ip_publica ni ip_local');
            jsonResponse('error', 'El DVR no es alcanzable desde el servidor. Configure IP pública/port-forward o use "Abrir en nube Dahua".', null, 409);
        }

        $user = $d['usuario'] ?? '';
        $pass = !empty($d['clave_cifrada']) ? decryptValue($d['clave_cifrada']) : '';
        $url  = "{$base}/cgi-bin/mjpg/video.cgi?channel={$canal}&subtype={$subtype}";

        @ini_set('output_buffering', '0');
        @ini_set('zlib.output_compression', '0');
        ob_end_clean();

        $contentType = 'multipart/x-mixed-replace; boundary=ipcamera';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HEADER         => false,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT        => 0,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_HTTPAUTH       => CURLAUTH_DIGEST | CURLAUTH_BASIC,
            CURLOPT_USERPWD        => "{$user}:{$pass}",
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_HEADERFUNCTION => function ($ch, $hdr) use (&$contentType) {
                if (stripos($hdr, 'Content-Type:') === 0) {
                    $contentType = trim(substr($hdr, 13));
                }
                return strlen($hdr);
            },
            CURLOPT_WRITEFUNCTION => function ($ch, $data) {
                echo $data;
                ob_flush();
                flush();
                return strlen($data);
            },
        ]);
        header('Content-Type: ' . $contentType);
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Connection: close');
        curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        exit;
    } catch (Exception $e) {
        error_log('[Stream] Exception: ' . $e->getMessage());
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   CRUD DISPOSITIVOS
   ════════════════════════════════════════════════════════════ */

function handleGuardarDispositivo(PDO $conn): void {
    $id = $_POST['id'] ?? null;
    requireFields($_POST, ['nombre']);
    $nombre        = sanitizeString($_POST['nombre'] ?? '', 150);
    $tipo          = sanitizeString($_POST['tipo'] ?? 'DVR', 10);
    $p2p           = sanitizeString($_POST['device_id_p2p'] ?? '', 100);
    $usuario       = sanitizeString($_POST['usuario'] ?? '', 100);
    $ip            = sanitizeString($_POST['ip_local'] ?? '', 50);
    $ip_publica    = sanitizeString($_POST['ip_publica'] ?? '', 50);
    $puerto_http   = (int)($_POST['puerto_http'] ?? 80);
    $puerto_rtsp   = (int)($_POST['puerto_rtsp'] ?? 554);
    $puerto_sdk    = (int)($_POST['puerto_sdk'] ?? 37777);
    $modelo        = sanitizeString($_POST['modelo'] ?? '', 100);
    $portal        = sanitizeString($_POST['portal_web'] ?? 'https://dhi-dms.com', 255);
    $notas         = sanitizeString($_POST['notas'] ?? '', 2000);
    $clave         = $_POST['clave'] ?? '';

    try {
        $conn->beginTransaction();
        if ($id) {
            $sql = "UPDATE cctv_dispositivos SET nombre=:nombre, tipo=:tipo, device_id_p2p=:p2p, usuario=:usuario, ip_local=:ip, ip_publica=:ip_pub, puerto_http=:ph, puerto_rtsp=:pr, puerto_sdk=:sdk, modelo=:modelo, portal_web=:portal, notas=:notas";
            $params = [':nombre'=>$nombre, ':tipo'=>$tipo, ':p2p'=>$p2p, ':usuario'=>$usuario, ':ip'=>$ip, ':ip_pub'=>$ip_publica, ':ph'=>$puerto_http, ':pr'=>$puerto_rtsp, ':sdk'=>$puerto_sdk, ':modelo'=>$modelo, ':portal'=>$portal, ':notas'=>$notas, ':id'=>(int)$id];
            if ($clave !== '') { $sql .= ", clave_cifrada=:clave"; $params[':clave'] = encryptValue($clave); }
            $sql .= " WHERE id=:id";
            $conn->prepare($sql)->execute($params);
            $record_id = (int)$id;
            historialInsert('cctv_dispositivos', $record_id, 'actualizado', null, null, json_encode($params), $conn);
            $msg = 'Dispositivo actualizado';
        } else {
            $cols = 'nombre, tipo, device_id_p2p, usuario, ip_local, ip_publica, puerto_http, puerto_rtsp, puerto_sdk, modelo, portal_web, notas';
            $vals = ':nombre, :tipo, :p2p, :usuario, :ip, :ip_pub, :ph, :pr, :sdk, :modelo, :portal, :notas';
            $params = [':nombre'=>$nombre, ':tipo'=>$tipo, ':p2p'=>$p2p, ':usuario'=>$usuario, ':ip'=>$ip, ':ip_pub'=>$ip_publica, ':ph'=>$puerto_http, ':pr'=>$puerto_rtsp, ':sdk'=>$puerto_sdk, ':modelo'=>$modelo, ':portal'=>$portal, ':notas'=>$notas];
            if ($clave !== '') { $cols .= ', clave_cifrada'; $vals .= ', :clave'; $params[':clave'] = encryptValue($clave); }
            $conn->prepare("INSERT INTO cctv_dispositivos ($cols) VALUES ($vals)")->execute($params);
            $record_id = (int)$conn->lastInsertId();
            $msg = 'Dispositivo creado';
        }
        $conn->commit();
        jsonResponse('success', $msg, ['id' => $record_id]);
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

function handleEliminarDispositivo(PDO $conn): void {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) jsonResponse('error', 'id requerido', null, 422);
    try {
        $conn->beginTransaction();
        historialInsert('cctv_dispositivos', $id, 'eliminado', null, null, null, $conn);
        $conn->prepare("DELETE FROM cctv_dispositivos WHERE id = ?")->execute([$id]);
        $conn->commit();
        jsonResponse('success', 'Dispositivo eliminado');
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   CRUD CÁMARAS
   ════════════════════════════════════════════════════════════ */

function handleGuardarCamara(PDO $conn): void {
    $id = $_POST['id'] ?? null;
    requireFields($_POST, ['dispositivo_id', 'nombre', 'canal']);
    $disp     = (int)$_POST['dispositivo_id'];
    $canal    = (int)$_POST['canal'];
    $nombre   = sanitizeString($_POST['nombre'] ?? '', 150);
    $ubicacion= sanitizeString($_POST['ubicacion'] ?? '', 200);
    try {
        $conn->beginTransaction();
        if ($id) {
            $conn->prepare("UPDATE cctv_camaras SET dispositivo_id=:disp, canal=:canal, nombre=:nombre, ubicacion=:ubic WHERE id=:id")
                 ->execute([':disp'=>$disp, ':canal'=>$canal, ':nombre'=>$nombre, ':ubic'=>$ubicacion, ':id'=>(int)$id]);
            $record_id = (int)$id;
            $msg = 'Cámara actualizada';
        } else {
            $conn->prepare("INSERT INTO cctv_camaras (dispositivo_id, canal, nombre, ubicacion) VALUES (:disp, :canal, :nombre, :ubic)")
                 ->execute([':disp'=>$disp, ':canal'=>$canal, ':nombre'=>$nombre, ':ubic'=>$ubicacion]);
            $record_id = (int)$conn->lastInsertId();
            $msg = 'Cámara creada';
        }
        $conn->commit();
        jsonResponse('success', $msg, ['id' => $record_id]);
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

function handleEliminarCamara(PDO $conn): void {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) jsonResponse('error', 'id requerido', null, 422);
    try {
        $conn->prepare("DELETE FROM cctv_camaras WHERE id = ?")->execute([$id]);
        jsonResponse('success', 'Cámara eliminada');
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   PTZ (proxy al CGI Dahua)
   mousedown -> start ; mouseup -> stop
   ════════════════════════════════════════════════════════════ */

function handlePtz(PDO $conn): void {
    $dispId = (int)($_POST['dispositivo_id'] ?? 0);
    $canal  = (int)($_POST['canal'] ?? 1);
    $mov    = $_POST['ptz_action'] ?? '';
    $code   = $_POST['code'] ?? '';
    if (!$dispId || !$code || !in_array($mov, ['start', 'stop'], true)) {
        jsonResponse('error', 'Faltan parámetros (dispositivo_id, code, ptz_action)', null, 422);
    }
    try {
        $stmt = $conn->prepare("SELECT ip_local, ip_publica, puerto_http, usuario, clave_cifrada FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);

        // Preferir IP pública (port-forward), fallback a IP local
        $base = dvrBaseUrl($d);
        if (empty($base)) jsonResponse('error', 'DVR no alcanzable desde el servidor. Configure IP pública/port-forward.', null, 409);

        $user = $d['usuario'] ?? '';
        $pass = !empty($d['clave_cifrada']) ? decryptValue($d['clave_cifrada']) : '';
        $arg1 = (int)($_POST['arg1'] ?? ($mov === 'start' ? 5 : 0));
        $url  = "{$base}/cgi-bin/ptz.cgi?action={$mov}&channel={$canal}&code=" . urlencode($code) . "&arg1={$arg1}&arg2=0&arg3=0";
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 4,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_HTTPAUTH       => CURLAUTH_DIGEST | CURLAUTH_BASIC,
            CURLOPT_USERPWD        => "{$user}:{$pass}",
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
        ]);
        $body   = curl_exec($ch);
        $http   = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);
        if ($body === false || $http !== 200) {
            jsonResponse('error', 'DVR rechazó el comando PTZ: ' . ($err ?: "HTTP {$http}"), null, 502);
        }
        jsonResponse('success', 'PTZ ' . $mov, ['http' => $http, 'code' => $code]);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* ════════════════════════════════════════════════════════════
   DAHUA DoLynk Developer (API cloud) — alternativa a port-forward/VPS
   Devuelve URL de stream del dispositivo sin exponer la IP del DVR.
   Firma HMAC-SHA512 (modo estándar, según demo oficial PHP de DoLynk):
     Auth:     HMAC-SHA512(SK, AccessKey + Timestamp + Nonce + "POST")
     Business: HMAC-SHA512(SK, AccessKey + AppAccessToken + Timestamp + Nonce + "\nPOST\n" + SHA512(body))
   ════════════════════════════════════════════════════════════ */

function dolynkBase(string $region): string {
    $map = [
        'fk' => 'https://open-api-fk.dolynkcloud.com',
        'or' => 'https://open-api-or.dolynkcloud.com',
        'sg' => 'https://open-api-sg.dolynkcloud.com',
    ];
    return $map[$region] ?? 'https://open-api-sg.dolynkcloud.com';
}

function dolynkNonce(): string {
    return bin2hex(random_bytes(16)); // 32 hex chars
}

function dolynkSign(string $sk, string $ak, ?string $appToken, string $ts, string $nonce, ?string $bodyJson): string {
    // Estándar (sin header Sign-Type), según demo oficial PHP de DoLynk:
    //   Auth:     AccessKey + Timestamp + Nonce + "POST"
    //   Business: AccessKey + AppAccessToken + Timestamp + Nonce + "\nPOST\n" + SHA512(body)
    // El body se hashea tal cual se envía (json_encode sin espacios = deleteWhitespace del demo).
    // IMPORTANTE: Si bodyJson es null o vacío, SHA512 debe ser de string vacío "", no de "null"
    $bodyForHash = ($bodyJson === null || $bodyJson === '') ? '' : $bodyJson;
    $factor = $appToken === null
        ? ($ak . $ts . $nonce . 'POST')
        : ($ak . $appToken . $ts . $nonce . "POST\n" . hash('sha512', $bodyForHash));
    return strtoupper(hash_hmac('sha512', $factor, $sk));
}

function dolynkHeaders(string $ak, string $pid, string $ts, string $nonce, string $sign, ?string $appToken): array {
    $h = [
        'Content-Type: application/json',
        'AccessKey: ' . $ak,
        'Timestamp: ' . $ts,
        'Nonce: ' . $nonce,
        'Sign: ' . $sign,
        'ProductId: ' . $pid,
        'X-TraceId-Header: ' . $nonce,
        'Version: V1',
    ];
    if ($appToken !== null) $h[] = 'AppAccessToken: ' . $appToken;
    return $h;
}

function dolynkRequest(PDO $conn, string $path, ?array $body = null): array {
    $ak = getConfig('cctv_dolynk_ak');
    $sk = getConfig('cctv_dolynk_sk');
    $pid = getConfig('cctv_dolynk_pid');
    $region = getConfig('cctv_dolynk_region', 'sg');
    if (!$ak || !$sk || !$pid) {
        error_log('[DoLynk] Faltan credenciales: ak=' . ($ak ? 'OK' : 'NO') . ', sk=' . ($sk ? 'OK' : 'NO') . ', pid=' . ($pid ? 'OK' : 'NO'));
        return ['ok' => false, 'msg' => 'Faltan credenciales DoLynk (AccessKey / SecretKey / ProductId). Configúrelas en la pestaña Configuración del módulo CCTV.'];
    }
    $base = dolynkBase($region);
    error_log('[DoLynk] Request: ' . $base . $path . ' body=' . ($body ? json_encode($body) : 'null'));

    // 1) AppAccessToken (Auth: AccessKey + Timestamp + Nonce + "POST")
    $ts  = (string)(int)(microtime(true) * 1000);
    $nonce = dolynkNonce();
    $signAuth = dolynkSign($sk, $ak, null, $ts, $nonce, null);
    $ch = curl_init($base . '/open-api/api-base/auth/getAppAccessToken');
    curl_setopt_array($ch, [
        CURLOPT_POST       => true,
        CURLOPT_HTTPHEADER => dolynkHeaders($ak, $pid, $ts, $nonce, $signAuth, null),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT    => 12,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return ['ok' => false, 'msg' => 'DoLynk auth curl: ' . $err];
    $json = json_decode($resp, true);
    $appToken = $json['data']['appAccessToken'] ?? null;
    if (!$appToken) return ['ok' => false, 'msg' => 'DoLynk no devolvió AppAccessToken (HTTP ' . $http . '): ' . ($json['msg'] ?? $resp)];

    // 2) Business API (AccessKey + AppAccessToken + Timestamp + Nonce + "\nPOST\n" + SHA512(body))
    $ts2 = (string)(int)(microtime(true) * 1000);
    $nonce2 = dolynkNonce();
    $bodyJson = $body === null ? '' : json_encode($body, JSON_UNESCAPED_SLASHES);
    if ($bodyJson !== '') {
        // DoLynk hashea el body SIN espacios (deleteWhitespace del demo oficial)
        $bodyJson = preg_replace('/\s+/', '', $bodyJson);
    }
    $signBiz = dolynkSign($sk, $ak, $appToken, $ts2, $nonce2, $bodyJson === '' ? null : $bodyJson);
    $ch2 = curl_init($base . $path);
    curl_setopt_array($ch2, [
        CURLOPT_POST       => true,
        CURLOPT_HTTPHEADER => dolynkHeaders($ak, $pid, $ts2, $nonce2, $signBiz, $appToken),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT    => 12,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    if ($body !== null) {
        curl_setopt($ch2, CURLOPT_POSTFIELDS, $bodyJson);
    }
    $resp2 = curl_exec($ch2);
    $http2 = (int)curl_getinfo($ch2, CURLINFO_HTTP_CODE);
    $err2  = curl_error($ch2);
    curl_close($ch2);
    error_log('[DoLynk] Response HTTP=' . $http2 . ' body=' . substr($resp2 ?: 'false', 0, 500));
    if ($resp2 === false) return ['ok' => false, 'msg' => 'DoLynk business curl: ' . $err2];
    $out = json_decode($resp2, true);
    if (!is_array($out)) return ['ok' => false, 'msg' => 'Respuesta DoLynk inválida (HTTP ' . $http2 . '): ' . substr($resp2, 0, 300)];
    if (empty($out['success']) && (string)($out['code'] ?? 0) !== '0' && (string)($out['code'] ?? 0) !== '200') {
        return ['ok' => false, 'msg' => 'DoLynk: ' . ($out['msg'] ?? json_encode($out))];
    }
    return ['ok' => true, 'data' => $out['data'] ?? $out];
}

function handleDolynkSave(PDO $conn): void {
    requireFields($_POST, ['ak', 'sk', 'pid']);
    $rows = [
        'cctv_dolynk_ak'     => [trim($_POST['ak']), 'AccessKey de Dahua DoLynk Developer'],
        'cctv_dolynk_sk'     => [trim($_POST['sk']), 'SecretAccessKey de Dahua DoLynk Developer (sensible)'],
        'cctv_dolynk_pid'    => [trim($_POST['pid']), 'ProductId de Dahua DoLynk Developer'],
        'cctv_dolynk_region' => [trim($_POST['region'] ?? 'sg'), 'Región DoLynk: fk|or|sg'],
    ];
    try {
        $conn->beginTransaction();
        $stmt = $conn->prepare("INSERT INTO config_sistema (clave, valor, tipo, grupo, descripcion) VALUES (?, ?, 'string', 'cctv', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)");
        foreach ($rows as $clave => [$valor, $desc]) {
            $stmt->execute([$clave, $valor, $desc]);
        }
        $conn->commit();
        jsonResponse('success', 'Credenciales DoLynk guardadas');
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

function handleDolynkConfig(PDO $conn): void {
    // No exponer el SecretKey
    jsonResponse('success', 'Config DoLynk', [
        'ak'     => getConfig('cctv_dolynk_ak', ''),
        'pid'    => getConfig('cctv_dolynk_pid', ''),
        'region' => getConfig('cctv_dolynk_region', 'sg'),
        'configured' => !empty(getConfig('cctv_dolynk_ak')) && !empty(getConfig('cctv_dolynk_sk')),
    ]);
}

function handleDolynkStream(PDO $conn): void {
    $dispId  = (int)($_GET['dispositivo_id'] ?? 0);
    $canal   = (int)($_GET['canal'] ?? 1);
    $subtype = (int)($_GET['subtype'] ?? 1);
    $proto   = $_GET['proto'] ?? 'rtsp'; // rtsp | rtsv (requerido por DoLynk)
    if (!in_array($proto, ['rtsp', 'rtsv'], true)) $proto = 'rtsp';
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);
    try {
        $stmt = $conn->prepare("SELECT device_id_p2p FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);
        $deviceId = $d['device_id_p2p'] ?? '';
        if (!$deviceId) jsonResponse('error', 'El dispositivo no tiene Device ID P2P (requerido por DoLynk)', null, 422);
        // Doc DoLynk: deviceId, channelId (0-based), businessType, encryptMode, protoType (requerido)
        $body = [
            'deviceId'     => $deviceId,
            'channelId'    => (string)max(0, $canal - 1),
            'businessType' => 'real',
            'encryptMode'  => 0,
            'protoType'    => $proto,
            'streamType'   => $subtype,
        ];
        $r = dolynkRequest($conn, '/open-api/api-iot/device/createDeviceStreamUrl', $body);
        if (!$r['ok']) jsonResponse('error', $r['msg'], null, 502);
        jsonResponse('success', 'Stream DoLynk', $r['data']);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* Live HLS por nube (crea dirección HLS .m3u8 reproducible en navegador con hls.js).
   Body: deviceId, channelId (0-based string), streamType (0=main, 1=sub).
   Respuesta: data.streamList[].hls + data.streamList[].coverUrl */
function handleDolynkHls(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    $canal  = (int)($_GET['canal'] ?? 1);
    $stream = (int)($_GET['stream_type'] ?? 1);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);
    try {
        $stmt = $conn->prepare("SELECT device_id_p2p FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);
        $deviceId = $d['device_id_p2p'] ?? '';
        if (!$deviceId) jsonResponse('error', 'El dispositivo no tiene Device ID P2P (requerido por DoLynk)', null, 422);
        $body = [
            'deviceId'   => $deviceId,
            'channelId'  => (string)max(0, $canal - 1),
            'streamType' => $stream,
        ];
        $r = dolynkRequest($conn, '/open-api/api-iot/device/createDeviceHlsLive', $body);
        if (!$r['ok']) {
            error_log('[DoLynk HLS] Error: ' . $r['msg']);
            jsonResponse('error', $r['msg'], null, 502);
        }
        jsonResponse('success', 'HLS DoLynk', $r['data']);
    } catch (Exception $e) {
        error_log('[DoLynk HLS] Exception: ' . $e->getMessage());
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* Snapshot por nube (JPEG válido 1 día). Respuesta: data.url */
function handleDolynkSnapshot(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    $canal  = (int)($_GET['canal'] ?? 1);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);
    try {
        $stmt = $conn->prepare("SELECT device_id_p2p FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);
        $deviceId = $d['device_id_p2p'] ?? '';
        if (!$deviceId) jsonResponse('error', 'El dispositivo no tiene Device ID P2P (requerido por DoLynk)', null, 422);
        $body = [
            'deviceId'  => $deviceId,
            'channelId' => (string)max(0, $canal - 1),
        ];
        $r = dolynkRequest($conn, '/open-api/api-iot/device/setDeviceSnapEnhanced', $body);
        if (!$r['ok']) {
            error_log('[DoLynk Snapshot] Error: ' . $r['msg']);
            jsonResponse('error', $r['msg'], null, 502);
        }
        jsonResponse('success', 'Snapshot DoLynk', $r['data']);
    } catch (Exception $e) {
        error_log('[DoLynk Snapshot] Exception: ' . $e->getMessage());
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* PTZ por nube (sin port-forward). operation: 0 up,1 down,2 left,3 right,4 up-left,5 down-left,
   6 up-right,7 down-right,8 zoom in,9 zoom out,10 stop. duration en ms. */
function handleDolynkPtz(PDO $conn): void {
    $dispId   = (int)($_POST['dispositivo_id'] ?? 0);
    $canal    = (int)($_POST['canal'] ?? 1);
    $oper     = $_POST['operation'] ?? '';
    $duration = (int)($_POST['duration'] ?? 1000);
    if (!in_array($oper, ['0','1','2','3','4','5','6','7','8','9','10'], true)) {
        jsonResponse('error', 'operation inválido (0-10)', null, 422);
    }
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);
    try {
        $stmt = $conn->prepare("SELECT device_id_p2p FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);
        $deviceId = $d['device_id_p2p'] ?? '';
        if (!$deviceId) jsonResponse('error', 'El dispositivo no tiene Device ID P2P (requerido por DoLynk)', null, 422);
        $body = [
            'deviceId'      => $deviceId,
            'channelId'     => (string)max(0, $canal - 1),
            'operation'     => (string)$oper,
            'horizontalSpeed' => 0.25,
            'verticalSpeed'   => 0.25,
            'duration'      => $duration,
        ];
        $r = dolynkRequest($conn, '/open-api/api-iot/device/controlMovePTZ', $body);
        if (!$r['ok']) {
            error_log('[DoLynk PTZ] Error: ' . $r['msg']);
            jsonResponse('error', $r['msg'], null, 502);
        }
        jsonResponse('success', 'PTZ DoLynk', $r['data']);
    } catch (Exception $e) {
        error_log('[DoLynk PTZ] Exception: ' . $e->getMessage());
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* Agrega (vincula) el dispositivo al producto DoLynk.
   Requiere que el equipo esté online y alcanzable por la nube DoLynk.
   Body: deviceId, categoryCode (XVR para DH-XVR5104HS-I3),
          devCode (Método 1: "Dolynk_" + Base64(password dispositivo)). */
function handleDolynkAdd(PDO $conn): void {
    $dispId = (int)($_POST['dispositivo_id'] ?? 0);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);
    try {
        $stmt = $conn->prepare("SELECT device_id_p2p, clave_cifrada FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);
        $deviceId = $d['device_id_p2p'] ?? '';
        if (!$deviceId) jsonResponse('error', 'El dispositivo no tiene Device ID P2P (requerido por DoLynk)', null, 422);
        $pass = !empty($d['clave_cifrada']) ? decryptValue($d['clave_cifrada']) : '';
        if (empty($pass)) {
            jsonResponse('error', 'El dispositivo no tiene clave configurada. Edite el dispositivo y configure la clave antes de vincular a DoLynk.', null, 422);
        }
        $devCode = 'Dolynk_' . base64_encode($pass);
        $body = [
            'deviceId'     => $deviceId,
            'categoryCode' => 'XVR',
            'devCode'      => $devCode,
        ];
        $r = dolynkRequest($conn, '/open-api/api-iot/device/addDevice', $body);
        if (!$r['ok']) {
            error_log('[DoLynk Add] Error: ' . $r['msg']);
            jsonResponse('error', $r['msg'], null, 502);
        }
        jsonResponse('success', 'Dispositivo agregado a DoLynk', $r['data']);
    } catch (Exception $e) {
        error_log('[DoLynk Add] Exception: ' . $e->getMessage());
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* Estado de enlace del dispositivo en DoLynk (bindStatus / status). */
function handleDolynkBindInfo(PDO $conn): void {
    $dispId = (int)($_POST['dispositivo_id'] ?? 0);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido', null, 422);
    try {
        $stmt = $conn->prepare("SELECT device_id_p2p FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado', null, 404);
        $deviceId = $d['device_id_p2p'] ?? '';
        if (!$deviceId) jsonResponse('error', 'El dispositivo no tiene Device ID P2P', null, 422);
        $body = ['deviceId' => $deviceId];
        $r = dolynkRequest($conn, '/open-api/api-iot/device/checkDeviceBindInfo', $body);
        if (!$r['ok']) {
            error_log('[DoLynk BindInfo] Error: ' . $r['msg']);
            jsonResponse('error', $r['msg'], null, 502);
        }
        jsonResponse('success', 'Estado de enlace DoLynk', $r['data']);
    } catch (Exception $e) {
        error_log('[DoLynk BindInfo] Exception: ' . $e->getMessage());
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}

/* Debug: mostrar info del dispositivo y probar conexión */
function handleDebugDvr(PDO $conn): void {
    $dispId = (int)($_GET['dispositivo_id'] ?? 0);
    if (!$dispId) jsonResponse('error', 'dispositivo_id requerido');
    try {
        $stmt = $conn->prepare("SELECT id, nombre, device_id_p2p, ip_local, ip_publica, puerto_http, puerto_rtsp, usuario, clave_cifrada FROM cctv_dispositivos WHERE id = ?");
        $stmt->execute([$dispId]);
        $d = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$d) jsonResponse('error', 'Dispositivo no encontrado');

        $base = dvrBaseUrl($d);
        $pass = !empty($d['clave_cifrada']) ? decryptValue($d['clave_cifrada']) : '(sin clave)';

        // Probar conexión HTTPS al DVR
        $testUrl = $base ? "{$base}/cgi-bin/snapshot.cgi?channel=1&subtype=1" : '';
        $testResult = null;
        if ($testUrl) {
            $ch = curl_init($testUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_HTTPAUTH => CURLAUTH_DIGEST,
                CURLOPT_USERPWD => "{$d['usuario']}:{$pass}",
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
            ]);
            $img = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            $ctype = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
            curl_close($ch);
            $testResult = [
                'url' => $testUrl,
                'http' => $httpCode,
                'error' => $err,
                'content_type' => $ctype,
                'size' => $img ? strlen($img) : 0,
                'is_image' => $img ? (strpos($ctype, 'image') !== false) : false,
            ];
        }

        jsonResponse('success', 'Debug DVR', [
            'device' => [
                'id' => $d['id'],
                'nombre' => $d['nombre'],
                'device_id_p2p' => $d['device_id_p2p'],
                'ip_local' => $d['ip_local'],
                'ip_publica' => $d['ip_publica'],
                'puerto_http' => $d['puerto_http'],
                'usuario' => $d['usuario'],
                'tiene_clave' => !empty($d['clave_cifrada']),
                'clave_descifrada_len' => strlen($pass),
            ],
            'dvrBaseUrl' => $base,
            'test_connection' => $testResult,
        ]);
    } catch (Exception $e) {
        jsonResponse('error', $e->getMessage(), null, 500);
    }
}
