<?php
// ============================================================================
// helpers.php — Funciones centralizadas para todos los módulos API
// ============================================================================
// Requerido por conexion.php. No invocar directamente desde los _api.php.
// ============================================================================

// ============================================================================
// UTILIDADES: RUT, strings, etc
// ============================================================================

if (!function_exists('limpiarRut')) {
    /**
     * Limpia un RUT chileno: quita puntos, guiones, espacios y retorna solo dígitos + dV.
     */
    function limpiarRut(string $rut): string
    {
        $rut = preg_replace('/[\s.\-]/', '', trim($rut));
        return strtoupper($rut);
    }
}

// ============================================================================
// CONFIGURACIÓN DEL SISTEMA (lee de tabla config_sistema)
// ============================================================================

if (!function_exists('getConfig')) {
    /**
     * Lee un valor de configuración del sistema desde la BD.
     * Usa caché estático para evitar queries repetidas.
     */
    function getConfig(string $clave, $default = null)
    {
        global $pdo;
        static $cache = null;

        if ($cache === null) {
            $cache = [];
            try {
                if (!$pdo) return $default;
                $stmt = $pdo->query("SELECT clave, valor, tipo FROM config_sistema");
                while ($row = $stmt->fetch()) {
                    $cache[$row['clave']] = $row;
                }
            } catch (Exception $e) {
                return $default;
            }
        }

        if (!isset($cache[$clave])) return $default;
        $row = $cache[$clave];
        $val = $row['valor'];

        return match ($row['tipo']) {
            'int'  => (int)$val,
            'bool' => (bool)intval($val),
            'json' => json_decode($val, true),
            default => $val,
        };
    }
}

if (!function_exists('setConfig')) {
    /**
     * Actualiza un valor de configuración del sistema en la BD.
     */
    function setConfig(string $clave, $valor): bool
    {
        global $pdo;
        try {
            if (!$pdo) return false;
            $stmt = $pdo->prepare("UPDATE config_sistema SET valor = ? WHERE clave = ?");
            return $stmt->execute([(string)$valor, $clave]);
        } catch (Exception $e) {
            return false;
        }
    }
}

if (!function_exists('getAllConfig')) {
    /**
     * Retorna todas las configuraciones del sistema.
     */
    function getAllConfig(): array
    {
        global $pdo;
        try {
            if (!$pdo) return [];
            $stmt = $pdo->query("SELECT * FROM config_sistema ORDER BY grupo, clave");
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            return [];
        }
    }
}

if (!function_exists('authConfig')) {
    /**
     * Helper para leer configuraciones del grupo auth con prefijo automático.
     */
    function authConfig(string $clave, $default = null)
    {
        return getConfig('auth_' . $clave, $default);
    }
}

// ============================================================================
// MULTIMEDIA: Subida de archivos
// ============================================================================

if (!function_exists('uploadMultimedia')) {
    /**
     * Procesa el array $_FILES['archivos'] y guarda los archivos en disco y BD.
     *
     * @param array         $files        El array $_FILES['archivos']
     * @param string        $entidad_tipo Nombre de la entidad (ej: 'clientes')
     * @param int           $entidad_id   ID del registro al que pertenecen los archivos
     * @param PDO           $conn         Conexión PDO activa (dentro de transacción)
     * @param array|null    $campo_keys   Array paralelo a $files: id/name del campo
     *                                    del formulario asociado a cada archivo.
     *                                    null = comportamiento legacy (sin campo_key).
     * @return int Cantidad de archivos guardados exitosamente
     */
    function uploadMultimedia(array $files, string $entidad_tipo, int $entidad_id, PDO $conn, ?array $campo_keys = null): int
    {
        if (empty($files['name'][0])) return 0;

        $dir = UPLOADS_BASE_PATH . $entidad_tipo . '/';
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $count = 0;
        $total = count($files['name']);

        for ($i = 0; $i < $total; $i++) {
            if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;

            $fname = basename($files['name'][$i]);
            $ftmp  = $files['tmp_name'][$i];
            $ftype = $files['type'][$i];
            $fsize = $files['size'][$i];

            // Validar extensión permitida
            $ext = strtolower(pathinfo($fname, PATHINFO_EXTENSION));
            $allowed = ['jpg','jpeg','png','gif','webp','mp4','mov','avi','mp3','wav','ogg','webm','pdf','doc','docx','xls','xlsx'];
            if (!in_array($ext, $allowed)) continue;

            $uname = time() . '_' . uniqid() . '_' . $fname;
            $path  = $dir . $uname;

            $tipo = 'documento';
            if (str_starts_with($ftype, 'image/'))  $tipo = 'foto';
            elseif (str_starts_with($ftype, 'video/')) $tipo = 'video';
            elseif (str_starts_with($ftype, 'audio/')) $tipo = 'nota_voz';

            // campo_key: id/name del campo del formulario. Vacío → null en BD.
            $campo_key = null;
            if ($campo_keys !== null && isset($campo_keys[$i])) {
                $ck = trim((string)$campo_keys[$i]);
                if ($ck !== '' && strlen($ck) <= 64) {
                    $campo_key = $ck;
    }
}

// Cargar compresor multimedia (FFmpeg)
require_once __DIR__ . '/multimedia_compressor.php';

            if (move_uploaded_file($ftmp, $path)) {
                $conn->prepare(
                    "INSERT INTO archivos_multimedia
                     (entidad_tipo, entidad_id, campo_key, tipo_archivo, ruta_archivo, nombre_original, tamanio_bytes)
                     VALUES (:tipo_e, :id_e, :campo_key, :tipo_a, :ruta, :orig, :size)"
                )->execute([
                    ':tipo_e'    => $entidad_tipo,
                    ':id_e'      => $entidad_id,
                    ':campo_key' => $campo_key,
                    ":tipo_a"    => $tipo,
                    ":ruta"      => UPLOADS_BASE_URL . $entidad_tipo . '/' . $uname,
                    ":orig"      => $fname,
                    ":size"      => $fsize,
                ]);
                // Comprimir multimedia en background (no bloquea respuesta)
                if (in_array($tipo, ['foto', 'video', 'nota_voz']) && function_exists('compressAsync')) {
                    $fileUrl = UPLOADS_BASE_URL . $entidad_tipo . '/' . $uname;
                    compressAsync($path, $fileUrl);
                }
                // Generar thumbnail de imagen de forma síncrona (GD, sin exec)
                // Necesario porque en producción exec/nohup php suele estar deshabilitado.
                if ($tipo === 'foto' && function_exists('generateImageThumbnail')) {
                    $thumbAbs = @generateImageThumbnail($path);
                    if ($thumbAbs && @file_exists($thumbAbs)) {
                        $thumbRel = str_replace(UPLOADS_BASE_PATH, UPLOADS_BASE_URL, $thumbAbs);
                        $fileUrl = UPLOADS_BASE_URL . $entidad_tipo . '/' . $uname;
                        $conn->prepare("UPDATE archivos_multimedia SET ruta_thumbnail = ? WHERE ruta_archivo = ?")
                             ->execute([$thumbRel, $fileUrl]);
                    }
                }
                $count++;
            }
        }
        return $count;
    }
}

// ============================================================================
// MULTIMEDIA: Eliminación de archivos
// ============================================================================

if (!function_exists('deleteMultimedia')) {
    /**
     * Elimina todos los archivos físicos y registros de BD asociados a una entidad.
     *
     * @param string $entidad_tipo Nombre de la entidad
     * @param int    $entidad_id   ID del registro
     * @param PDO    $conn         Conexión PDO activa (dentro de transacción)
     */
    function deleteMultimedia(string $entidad_tipo, int $entidad_id, PDO $conn): void
    {
        $stmt = $conn->prepare(
            "SELECT ruta_archivo FROM archivos_multimedia
             WHERE entidad_tipo = ? AND entidad_id = ?"
        );
        $stmt->execute([$entidad_tipo, $entidad_id]);

        foreach ($stmt->fetchAll() as $archivo) {
            if (!empty($archivo['ruta_archivo']) && file_exists($archivo['ruta_archivo'])) {
                @unlink($archivo['ruta_archivo']);
            }
        }

        $conn->prepare(
            "DELETE FROM archivos_multimedia WHERE entidad_tipo = ? AND entidad_id = ?"
        )->execute([$entidad_tipo, $entidad_id]);
    }
}

// ============================================================================
// MULTIMEDIA: Obtener archivos de una entidad
// ============================================================================

if (!function_exists('getMultimedia')) {
    /**
     * Retorna array con los archivos multimedia de una entidad.
     */
    function getMultimedia(string $entidad_tipo, int $entidad_id, PDO $conn): array
    {
        $stmt = $conn->prepare(
            "SELECT id, tipo_archivo, ruta_archivo, ruta_thumbnail, nombre_original
             FROM archivos_multimedia
             WHERE entidad_tipo = ? AND entidad_id = ?
             ORDER BY creado ASC"
        );
        $stmt->execute([$entidad_tipo, $entidad_id]);
        return $stmt->fetchAll();
    }
}

// ============================================================================
// VALIDACIONES
// ============================================================================

if (!function_exists('validateRutCL')) {
    /**
     * Valida RUT chileno (con o sin puntos, con o sin guión).
     * Retorna true si el RUT es válido.
     */
    function validateRutCL(string $rut): bool
    {
        $rut = trim($rut);
        if (empty($rut)) return true; // Campo opcional → vacío es válido

        // Limpiar: quitar puntos, espacios; normalizar guión
        $rut = strtoupper(str_replace(['.', ' '], '', $rut));

        // Separar número del dígito verificador
        if (strpos($rut, '-') !== false) {
            [$num, $dv] = explode('-', $rut, 2);
        } else {
            $dv  = substr($rut, -1);
            $num = substr($rut, 0, -1);
        }

        if (!ctype_digit($num) || $num < 1000000) return false;

        // Calcular dígito verificador
        $sum  = 0;
        $mult = 2;
        foreach (array_reverse(str_split($num)) as $digit) {
            $sum  += $digit * $mult;
            $mult  = ($mult === 7) ? 2 : $mult + 1;
        }
        $rest     = 11 - ($sum % 11);
        $expected = match ($rest) {
            11 => '0',
            10 => 'K',
            default => (string)$rest,
        };

        return $dv === $expected;
    }
}

if (!function_exists('validateEmail')) {
    /**
     * Valida formato de email. Vacío es válido (campo opcional).
     */
    function validateEmail(string $email): bool
    {
        if (empty(trim($email))) return true;
        return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false;
    }
}

if (!function_exists('sanitizeString')) {
    /**
     * Elimina espacios extra y trunca al máximo indicado.
     */
    function sanitizeString(?string $value, int $maxLen = 255): string
    {
        if ($value === null) return '';
        return substr(trim($value), 0, $maxLen);
    }
}

// ============================================================================
// ENCRYPT / DECRYPT — para passwords de correo
// ============================================================================

if (!function_exists('encryptValue')) {
    function encryptValue(string $plaintext): string {
        $key = getenv('FTRONIC_CRYPTO_KEY') ?: 'figuetronic_default_key_2026!';
        $iv = random_bytes(16);
        $encrypted = openssl_encrypt($plaintext, 'AES-256-CBC', hash('sha256', $key, true), 0, $iv);
        return base64_encode($iv . '::' . $encrypted);
    }
}

if (!function_exists('decryptValue')) {
    function decryptValue(string $ciphertext): string {
        $key = getenv('FTRONIC_CRYPTO_KEY') ?: 'figuetronic_default_key_2026!';
        $decoded = base64_decode($ciphertext);
        if ($decoded === false || !str_contains($decoded, '::')) return '';
        [$iv, $encrypted] = explode('::', $decoded, 2);
        return openssl_decrypt($encrypted, 'AES-256-CBC', hash('sha256', $key, true), 0, $iv) ?: '';
    }
}

// ============================================================================
// EMAIL HTML SANITIZER
// ============================================================================

if (!function_exists('sanitizeEmailHtml')) {
    function sanitizeEmailHtml(string $html): string {
        $html = strip_tags($html, '<p><br><b><i><u><a><img><table><tr><td><th><thead><tbody><div><span><ul><ol><li><h1><h2><h3><h4><h5><h6><blockquote><pre><code><hr><strong><em><font><center><dl><dt><dd><style>');
        $html = preg_replace('/style\s*=\s*["\'].*?["\']/is', '', $html);
        $html = preg_replace('/on\w+\s*=\s*["\'].*?["\']/is', '', $html);
        $html = preg_replace('/javascript\s*:/is', '', $html);
        return $html;
    }
}

if (!function_exists('sanitizeEmailText')) {
    function sanitizeEmailText(string $text): string {
        return htmlspecialchars_decode(strip_tags($text), ENT_QUOTES);
    }
}

// ============================================================================
// PAGINACIÓN
// ============================================================================

if (!function_exists('paginationParams')) {
    /**
     * Extrae parámetros de paginación y búsqueda del $_GET.
     * Retorna ['page' => int, 'per_page' => int, 'offset' => int, 'search' => string]
     */
    function paginationParams(int $defaultPerPage = 25): array
    {
        $page     = max(1, (int)($_GET['page']     ?? 1));
        $perPage  = min(200, max(5, (int)($_GET['per_page'] ?? $defaultPerPage)));
        $search   = trim($_GET['search'] ?? '');
        return [
            'page'     => $page,
            'per_page' => $perPage,
            'offset'   => ($page - 1) * $perPage,
            'search'   => $search,
        ];
    }
}

if (!function_exists('paginatedResponse')) {
    /**
     * Envía una respuesta JSON paginada con metadatos de paginación.
     */
    function paginatedResponse(array $items, int $total, array $params): void
    {
        $totalPages = (int)ceil($total / $params['per_page']);
        jsonResponse('success', 'OK', [
            'items'       => $items,
            'total'       => $total,
            'page'        => $params['page'],
            'per_page'    => $params['per_page'],
            'total_pages' => $totalPages,
        ]);
    }
}

if (!function_exists('buildSearchWhere')) {
    /**
     * Construye la cláusula WHERE y los parámetros para búsqueda por texto.
     *
     * @param array  $fields Columnas a buscar (ej: ['nombre','apellido','rut'])
     * @param string $term   Texto a buscar
     * @return array ['where' => string SQL, 'params' => array]
     */
    function buildSearchWhere(array $fields, string $term): array
    {
        if (empty($term) || empty($fields)) {
            return ['where' => '1=1', 'params' => []];
        }
        $like   = '%' . $term . '%';
        $parts  = array_map(fn($f) => "$f LIKE ?", $fields);
        return [
            'where'  => '(' . implode(' OR ', $parts) . ')',
            'params' => array_fill(0, count($fields), $like),
        ];
    }
}

// ============================================================================
// UTILIDADES
// ============================================================================

// ============================================================================
// AUDITORÍA: Historial de cambios
// ============================================================================

if (!function_exists('historialInsert')) {
    /**
     * Registra un cambio en el historial de auditoría.
     */
    function historialInsert(string $entidadTipo, int $entidadId, string $accion, ?string $campo = null, $valorAnterior = null, $valorNuevo = null): void
    {
        $db = $GLOBALS['conn'] ?? null;
        if (!$db) return;
        try {
            $stmt = $db->prepare(
                "INSERT INTO historial_cambios (entidad_tipo, entidad_id, accion, campo_modificado, valor_anterior, valor_nuevo)
                 VALUES (:tipo, :id, :accion, :campo, :anterior, :nuevo)"
            );
            $stmt->execute([
                ':tipo'    => $entidadTipo,
                ':id'      => $entidadId,
                ':accion'  => $accion,
                ':campo'   => $campo,
                ':anterior' => is_array($valorAnterior) ? json_encode($valorAnterior, JSON_UNESCAPED_UNICODE) : (string)$valorAnterior,
                ':nuevo'   => is_array($valorNuevo) ? json_encode($valorNuevo, JSON_UNESCAPED_UNICODE) : (string)$valorNuevo,
            ]);

            // Also log to user_activity for the Usuarios dashboard
            $usuarioId = $_SESSION['usuario_id'] ?? null;
            if ($usuarioId) {
                $detalle = "$entidadTipo#$entidadId: $accion";
                if ($campo) $detalle .= " ($campo)";
                $ip = $_SERVER['REMOTE_ADDR'] ?? '';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $db->prepare("INSERT INTO user_activity (usuario_id, accion, entidad, entidad_id, detalle, ip, user_agent, fecha)
                              VALUES (?, 'cambio', ?, ?, ?, ?, ?, NOW())")
                   ->execute([$usuarioId, $entidadTipo, $entidadId, $detalle, $ip, $ua]);
            }
        } catch (Exception $e) {
            error_log("historialInsert error: " . $e->getMessage());
        }
    }
}

// ============================================================================
// INVENTARIO: Movimientos de stock
// ============================================================================

if (!function_exists('registrarMovimientoStock')) {
    /**
     * Registra un movimiento de stock y actualiza el stock del producto.
     */
    function registrarMovimientoStock(string $productoTipo, int $productoId, string $tipoMovimiento, int $cantidad, ?string $refTipo = null, ?int $refId = null, ?string $obs = null, ?PDO $conn = null): void
    {
        global $conn;
        $db = $conn ?? $conn;
        if (!$db) return;
        try {
            $stmt = $db->prepare(
                "INSERT INTO movimientos_stock (producto_tipo, producto_id, tipo_movimiento, cantidad, referencia_tipo, referencia_id, observacion)
                 VALUES (:tipo, :id, :mov, :cant, :ref_tipo, :ref_id, :obs)"
            );
            $stmt->execute([
                ':tipo'    => $productoTipo,
                ':id'      => $productoId,
                ':mov'     => $tipoMovimiento,
                ':cant'    => $cantidad,
                ':ref_tipo' => $refTipo,
                ':ref_id'  => $refId,
                ':obs'     => $obs,
            ]);
        } catch (Exception $e) {
            error_log("registrarMovimientoStock error: " . $e->getMessage());
        }
    }
}

// ============================================================================
// FINANZAS: Movimientos de caja
// ============================================================================

if (!function_exists('getSaldoCuenta')) {
    /**
     * Calcula el saldo de una cuenta bancaria desde movimientos_caja.
     */
    function getSaldoCuenta(PDO $db, int $cuentaId): float
    {
        $st = $db->prepare(
            "SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto WHEN tipo = 'transferencia' THEN monto ELSE -monto END), 0) AS saldo
             FROM movimientos_caja WHERE cuenta_bancaria_id = :id AND anulado = 0"
        );
        $st->execute([':id' => $cuentaId]);
        return (float)$st->fetchColumn();
    }
}

if (!function_exists('registrarMovimientoCaja')) {
    /**
     * Registra un movimiento en caja y actualiza saldo de la cuenta.
     * @param string $tipo ingreso|egreso|transferencia
     * @param float  $monto
     * @param string $entidadTipo venta|compra|pago|ajuste
     * @param int|null $entidadId
     * @param string|null $fecha
     * @param string|null $formaPago
     * @param string|null $concepto
     * @param PDO|null $conn
     * @param int|null $cuentaId Por defecto 1 si hay cuentas
     */
    function registrarMovimientoCaja(string $tipo, float $monto, string $entidadTipo, ?int $entidadId = null, ?string $fecha = null, ?string $formaPago = null, ?string $concepto = null, ?PDO $conn = null, ?int $cuentaId = null): void
    {
        global $conn;
        $db = $conn ?? $conn;
        if (!$db) return;
        try {
            if (!$cuentaId) {
                $st = $db->query("SELECT id FROM cuentas_bancarias ORDER BY id LIMIT 1");
                $row = $st->fetch();
                $cuentaId = $row ? (int)$row['id'] : 1;
            }
            $fecha = $fecha ?: date('Y-m-d');
            $stmt = $db->prepare(
                "INSERT INTO movimientos_caja (cuenta_bancaria_id, fecha, tipo, monto, entidad_tipo, entidad_id, concepto)
                 VALUES (:cuenta, :fecha, :tipo, :monto, :ent_tipo, :ent_id, :concepto)"
            );
            $stmt->execute([
                ':cuenta'   => $cuentaId,
                ':fecha'    => $fecha,
                ':tipo'     => $tipo,
                ':monto'    => $monto,
                ':ent_tipo' => $entidadTipo,
                ':ent_id'   => $entidadId,
                ':concepto' => $concepto,
            ]);

            // Actualizar saldo denormalizado (LEGACY — se mantiene para consultas rápidas)
            $operador = ($tipo === 'ingreso' || $tipo === 'transferencia') ? '+' : '-';
            $stmtUp = $db->prepare("UPDATE cuentas_bancarias SET saldo = COALESCE(saldo, 0) $operador :monto WHERE id = :id");
            $stmtUp->execute([':monto' => $monto, ':id' => $cuentaId]);
        } catch (Exception $e) {
            error_log("registrarMovimientoCaja error: " . $e->getMessage());
        }
    }
}

// ============================================================================
// STOCK: Deducir automáticamente al finalizar OT
// ============================================================================

if (!function_exists('deducirStockItemsOT')) {
    /**
     * Deducir stock de artículos e insumos usados en una OT y registrar movimientos.
     */
    function deducirStockItemsOT(int $ordenTrabajoId, PDO $conn): void
    {
        // Deduct ARTICLES
        $stmt = $conn->prepare(
            "SELECT oi.item_id, oi.cantidad, a.stock
             FROM orden_trabajo_items oi
             JOIN articulos a ON oi.item_id = a.id
             WHERE oi.orden_trabajo_id = ? AND oi.tipo = 'articulo' AND oi.item_id IS NOT NULL"
        );
        $stmt->execute([$ordenTrabajoId]);
        $items = $stmt->fetchAll();

        foreach ($items as $item) {
            $chk = $conn->prepare(
                "SELECT COUNT(*) FROM movimientos_stock
                 WHERE producto_tipo = 'articulo' AND producto_id = ?
                 AND referencia_tipo = 'orden_trabajo' AND referencia_id = ?"
            );
            $chk->execute([$item['item_id'], $ordenTrabajoId]);
            if ((int)$chk->fetchColumn() > 0) continue;

            $nuevoStock = max(0, (int)$item['stock'] - (int)$item['cantidad']);
            $conn->prepare("UPDATE articulos SET stock = ? WHERE id = ?")->execute([$nuevoStock, $item['item_id']]);
            registrarMovimientoStock('articulo', (int)$item['item_id'], 'salida', (int)$item['cantidad'], 'orden_trabajo', $ordenTrabajoId, 'Uso en OT #' . $ordenTrabajoId, $conn);
        }

        // Deduct INSUMOS based on porcentaje_consumo
        $stmtIns = $conn->prepare(
            "SELECT oi.id, oi.insumo_id, oi.nombre, oi.porcentaje_consumo, ins.stock
             FROM orden_trabajo_items oi
             LEFT JOIN insumos ins ON oi.insumo_id = ins.id
             WHERE oi.orden_trabajo_id = ? AND oi.tipo = 'insumo' AND oi.porcentaje_consumo IS NOT NULL AND oi.porcentaje_consumo > 0"
        );
        $stmtIns->execute([$ordenTrabajoId]);
        $insumos = $stmtIns->fetchAll();

        foreach ($insumos as $ins) {
            if (empty($ins['insumo_id']) || empty($ins['stock'])) continue;

            $chk = $conn->prepare(
                "SELECT COUNT(*) FROM movimientos_stock
                 WHERE producto_tipo = 'insumo' AND producto_id = ?
                 AND referencia_tipo = 'orden_trabajo' AND referencia_id = ?"
            );
            $chk->execute([$ins['insumo_id'], $ordenTrabajoId]);
            if ((int)$chk->fetchColumn() > 0) continue;

            // porcentaje_consumo: 1=mitad, 2=menos_mitad, 3=todo
            $descuento = match((int)$ins['porcentaje_consumo']) {
                3 => (int)$ins['stock'],        // Todo
                1 => max(1, (int)$ins['stock'] / 2),   // Mitad
                2 => max(1, (int)$ins['stock'] / 4),   // Menos de la mitad
                default => 0,
            };
            $descuento = min($descuento, (int)$ins['stock']);
            if ($descuento <= 0) continue;

            $nuevoStock = max(0, (int)$ins['stock'] - $descuento);
            $conn->prepare("UPDATE insumos SET stock = ? WHERE id = ?")->execute([$nuevoStock, $ins['insumo_id']]);
            registrarMovimientoStock('insumo', (int)$ins['insumo_id'], 'salida', $descuento, 'orden_trabajo', $ordenTrabajoId, 'Uso en OT #' . $ordenTrabajoId . ' (' . $ins['nombre'] . ')', $conn);
        }
    }
}

if (!function_exists('deducirStockPresupuesto')) {
    /**
     * Deducir stock de artículos usados en un Presupuesto y registrar movimientos.
     */
    function deducirStockPresupuesto(int $pptoId, PDO $conn): void
    {
        $stmt = $conn->prepare(
            "SELECT pi.item_id, pi.cantidad, a.stock
             FROM presupuesto_items pi
             JOIN articulos a ON pi.item_id = a.id
             WHERE pi.presupuesto_id = ? AND pi.tipo = 'articulo' AND pi.item_id IS NOT NULL"
        );
        $stmt->execute([$pptoId]);
        $items = $stmt->fetchAll();

        foreach ($items as $item) {
            $chk = $conn->prepare(
                "SELECT COUNT(*) FROM movimientos_stock
                 WHERE producto_tipo = 'articulo' AND producto_id = ?
                 AND referencia_tipo = 'presupuesto' AND referencia_id = ?"
            );
            $chk->execute([$item['item_id'], $pptoId]);
            if ((int)$chk->fetchColumn() > 0) continue;

            $nuevoStock = max(0, (int)$item['stock'] - (int)$item['cantidad']);
            $conn->prepare("UPDATE articulos SET stock = ? WHERE id = ?")->execute([$nuevoStock, $item['item_id']]);
            registrarMovimientoStock('articulo', (int)$item['item_id'], 'salida', (int)$item['cantidad'], 'presupuesto', $pptoId, 'Uso en Presupuesto Pagado #' . $pptoId, $conn);
        }
    }
}

if (!function_exists('deducirStockVenta')) {
    /**
     * Deducir stock de artículos usados en una Venta y registrar movimientos.
     */
    function deducirStockVenta(int $ventaId, PDO $conn): void
    {
        // En este sistema, las Ventas no tienen tabla ventas_items.
        // Toman el origen de orden_trabajo o presupuesto.
        $stmtV = $conn->prepare("SELECT orden_trabajo_id, presupuesto_id FROM ventas WHERE id = ?");
        $stmtV->execute([$ventaId]);
        $v = $stmtV->fetch();
        if (!$v) return;

        if (!empty($v['orden_trabajo_id'])) {
            deducirStockItemsOT((int)$v['orden_trabajo_id'], $conn);
        } elseif (!empty($v['presupuesto_id'])) {
            deducirStockPresupuesto((int)$v['presupuesto_id'], $conn);
        }
    }
}

if (!function_exists('requireFields')) {
    /**
     * Verifica que los campos requeridos no estén vacíos.
     * Si falta alguno, envía respuesta de error y termina.
     *
     * @param array  $data   Array asociativo de datos (ej: $_POST)
     * @param array  $fields Lista de claves requeridas
     */
    function requireFields(array $data, array $fields): void
    {
        $missing = [];
        foreach ($fields as $f) {
            if (!isset($data[$f]) || trim((string)$data[$f]) === '') {
                $missing[] = $f;
            }
        }
        if (!empty($missing)) {
            jsonResponse('error', 'Campos requeridos: ' . implode(', ', $missing), null, 422);
        }
    }
}
