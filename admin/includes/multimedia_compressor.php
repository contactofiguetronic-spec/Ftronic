<?php
// ============================================================================
// multimedia_compressor.php — Compresión y optimización de archivos multimedia
// Usa FFmpeg (shell_exec) para comprimir videos, fotos y audio post-upload.
// Ejecuta en background (fire-and-forget) para no bloquear la respuesta HTTP.
// ============================================================================

if (!function_exists('ffmpegAvailable')) {
    /**
     * Cachea si ffmpeg está disponible y, sobre todo, si no cuelga.
     * En algunos hosts ffmpeg no existe y exec() se bloquea; lo detectamos
     * con un timeout corto la primera vez y lo guardamos.
     */
    $_ffmpegOk = null;
    function ffmpegAvailable(): bool
    {
        global $_ffmpegOk;
        if ($_ffmpegOk !== null) return $_ffmpegOk;
        $cmd = sprintf('timeout 8 ffmpeg -version >/dev/null 2>&1; echo $?');
        exec($cmd, $out, $rc);
        $_ffmpegOk = ($rc === 0 && ($out[0] ?? '') === '0');
        return $_ffmpegOk;
    }
}

if (!function_exists('compressVideo')) {
    /**
     * Comprime un video: máx 720p, H.264 CRF 30, AAC mono 64kbps.
     * Genera thumbnail automático.
     * Retorna la ruta del archivo comprimido (sobrescribe el original).
     */
    function compressVideo(string $inputPath, ?string $outputPath = null): array
    {
        if (!file_exists($inputPath)) return ['ok' => false, 'error' => 'Archivo no encontrado'];
        if (!ffmpegAvailable()) return ['ok' => false, 'error' => 'ffmpeg no disponible'];

        $outputPath = $outputPath ?: $inputPath;
        $tmpOutput  = $outputPath . '.tmp.mp4';

        // FFmpeg: escalar a 720p máx, manteniendo aspect ratio
        $cmd = sprintf(
            'ffmpeg -y -i %s -vf "scale=\'min(1280,iw)\':\'min(720,ih)\':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" '
            . '-c:v libx264 -preset fast -crf 30 -c:a aac -ac 1 -b:a 64k '
            . '-movflags +faststart -pix_fmt yuv420p '
            . '%s 2>&1',
            escapeshellarg($inputPath),
            escapeshellarg($tmpOutput)
        );

        exec($cmd, $output, $returnVar);

        if ($returnVar === 0 && file_exists($tmpOutput) && filesize($tmpOutput) > 0) {
            $origSize = filesize($inputPath);
            $newSize  = filesize($tmpOutput);
            rename($tmpOutput, $outputPath);

            // Generar thumbnail desde el archivo comprimido
            $thumbPath = preg_replace('/\.[^.]+$/', '_thumb.jpg', $outputPath);
            generateVideoThumbnail($outputPath, $thumbPath);

            return [
                'ok'        => true,
                'orig_size' => $origSize,
                'new_size'  => $newSize,
                'reduction' => $origSize > 0 ? round((1 - $newSize / $origSize) * 100) : 0,
                'thumbnail' => file_exists($thumbPath) ? $thumbPath : null,
            ];
        }

        // Si falla, limpiar tmp y devolver original
        if (file_exists($tmpOutput)) @unlink($tmpOutput);
        return ['ok' => false, 'error' => 'FFmpeg falló', 'output' => implode("\n", array_slice($output, -5))];
    }
}

if (!function_exists('generateVideoThumbnail')) {
    /**
     * Extrae un thumbnail del video en el segundo 1 (o duration/4 si es más corto).
     */
    function generateVideoThumbnail(string $videoPath, string $thumbPath): bool
    {
        if (!file_exists($videoPath)) return false;
        if (!ffmpegAvailable()) return false;

        // Obtener duración
        $duration = 1;
        $probe = sprintf('ffprobe -v error -show_entries format=duration -of csv=p=0 %s 2>&1', escapeshellarg($videoPath));
        $durOutput = [];
        exec($probe, $durOutput);
        if (!empty($durOutput[0]) && is_numeric($durOutput[0])) {
            $duration = (float)$durOutput[0];
        }

        $seek = max(0.5, $duration / 4);

        $cmd = sprintf(
            'ffmpeg -y -ss %.1f -i %s -vframes 1 -q:v 3 -vf "scale=\'min(480,iw)\':\'min(360,ih)\':force_original_aspect_ratio=decrease" %s 2>&1',
            $seek,
            escapeshellarg($videoPath),
            escapeshellarg($thumbPath)
        );

        exec($cmd, $output, $returnVar);
        return $returnVar === 0 && file_exists($thumbPath);
    }
}

if (!function_exists('compressAudio')) {
    /**
     * Comprime audio: convierte a MP3 mono 48kbps con normalización de volumen.
     * Retorna la ruta del archivo comprimido.
     */
    function compressAudio(string $inputPath, ?string $outputPath = null): array
    {
        if (!file_exists($inputPath)) return ['ok' => false, 'error' => 'Archivo no encontrado'];

        $outputPath = $outputPath ?: $inputPath;
        $tmpOutput  = $outputPath . '.tmp.mp3';

        $cmd = sprintf(
            'ffmpeg -y -i %s -ac 1 -ar 22050 -b:a 48k -af "loudnorm=I=-16:TP=-1.5:LRA=11" %s 2>&1',
            escapeshellarg($inputPath),
            escapeshellarg($tmpOutput)
        );

        exec($cmd, $output, $returnVar);

        if ($returnVar === 0 && file_exists($tmpOutput) && filesize($tmpOutput) > 0) {
            $origSize = filesize($inputPath);
            $newSize  = filesize($tmpOutput);
            rename($tmpOutput, $outputPath);
            return [
                'ok'        => true,
                'orig_size' => $origSize,
                'new_size'  => $newSize,
                'reduction' => $origSize > 0 ? round((1 - $newSize / $origSize) * 100) : 0,
            ];
        }

        if (file_exists($tmpOutput)) @unlink($tmpOutput);
        return ['ok' => false, 'error' => 'FFmpeg falló'];
    }
}

if (!function_exists('gdCreateImage')) {
    /**
     * Abre una imagen desde disco usando GD según su tipo mime.
     * Retorna un resource/GdImage o null.
     */
    function gdCreateImage(string $path): ?GdImage
    {
        if (!extension_loaded('gd')) return null;
        $mime = mime_content_type($path);
        return match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png'  => @imagecreatefrompng($path),
            'image/gif'  => @imagecreatefromgif($path),
            'image/webp' => (function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : null),
            'image/bmp'  => (function_exists('imagecreatefrombmp') ? @imagecreatefrombmp($path) : null),
            default      => null,
        };
    }
}

if (!function_exists('generateImageThumbnail')) {
    /**
     * Genera una miniatura pequeña (máx 400px ancho) a partir de una imagen.
     * Usa GD (disponible en producción). Si falla, intenta con ffmpeg.
     * Retorna la ruta del thumbnail o null si falla.
     */
    function generateImageThumbnail(string $imagePath, ?string $thumbPath = null): ?string
    {
        if (!file_exists($imagePath)) return null;
        $thumbPath = $thumbPath ?: preg_replace('/\.[^.]+$/', '_thumb.jpg', $imagePath);

        // Método 1: GD
        if (extension_loaded('gd')) {
            $src = gdCreateImage($imagePath);
            if ($src) {
                $sw = imagesx($src);
                $sh = imagesy($src);
                $max = 400;
                $ratio = min(1, $max / max($sw, $sh));
                $dw = max(1, (int)round($sw * $ratio));
                $dh = max(1, (int)round($sh * $ratio));
                $dst = imagecreatetruecolor($dw, $dh);
                // Preservar transparencia para PNG/GIF
                if (in_array(mime_content_type($imagePath), ['image/png', 'image/gif'])) {
                    imagecolortransparent($dst, imagecolorallocatealpha($dst, 0, 0, 0, 127));
                    imagealphablending($dst, false);
                    imagesavealpha($dst, true);
                }
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $dw, $dh, $sw, $sh);
                if (imagejpeg($dst, $thumbPath, 82)) {
                    imagedestroy($src);
                    imagedestroy($dst);
                    return $thumbPath;
                }
                imagedestroy($src);
                imagedestroy($dst);
            }
        }

        // Método 2: ffmpeg (fallback si existe)
        $cmd = sprintf(
            'ffmpeg -y -i %s -vf "scale=\'min(400,iw)\':\'min(400,ih)\':force_original_aspect_ratio=decrease" -q:v 5 %s 2>&1',
            escapeshellarg($imagePath),
            escapeshellarg($thumbPath)
        );
        exec($cmd, $output, $returnVar);
        return ($returnVar === 0 && file_exists($thumbPath) && filesize($thumbPath) > 0) ? $thumbPath : null;
    }
}

if (!function_exists('compressImage')) {
    /**
     * Comprime imagen con GD: redimensiona a máx 1600px ancho, JPEG quality 82,
     * y genera una miniatura (<=400px) devuelta en 'thumbnail'.
     * Fallback a ffmpeg si GD no está disponible.
     */
    function compressImage(string $inputPath, ?string $outputPath = null): array
    {
        if (!file_exists($inputPath)) return ['ok' => false, 'error' => 'Archivo no encontrado'];

        $origSize  = filesize($inputPath);
        $outputPath = $outputPath ?: $inputPath;
        $thumbnail  = null;
        $ok = false;

        if (extension_loaded('gd')) {
            $src = gdCreateImage($inputPath);
            if ($src) {
                $sw = imagesx($src);
                $sh = imagesy($src);
                $max = 1600;
                $ratio = min(1, $max / max($sw, $sh));
                $dw = max(1, (int)round($sw * $ratio));
                $dh = max(1, (int)round($sh * $ratio));
                $dst = imagecreatetruecolor($dw, $dh);
                if (in_array(mime_content_type($inputPath), ['image/png', 'image/gif'])) {
                    imagecolortransparent($dst, imagecolorallocatealpha($dst, 0, 0, 0, 127));
                    imagealphablending($dst, false);
                    imagesavealpha($dst, true);
                }
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $dw, $dh, $sw, $sh);
                $ext = strtolower(pathinfo($inputPath, PATHINFO_EXTENSION));
                if (in_array($ext, ['png', 'gif'])) {
                    $ok = imagepng($dst, $outputPath, 8);
                } else {
                    $ok = imagejpeg($dst, $outputPath, 82);
                }
                imagedestroy($src);
                imagedestroy($dst);
            }
        }

        // Fallback ffmpeg
        if (!$ok) {
            $tmpOutput = $outputPath . '.tmp.jpg';
            $cmd = sprintf(
                'ffmpeg -y -i %s -vf "scale=\'min(1600,iw)\':\'min(1600,ih)\':force_original_aspect_ratio=decrease" -q:v 4 %s 2>&1',
                escapeshellarg($inputPath),
                escapeshellarg($tmpOutput)
            );
            exec($cmd, $output, $returnVar);
            if ($returnVar === 0 && file_exists($tmpOutput) && filesize($tmpOutput) > 0) {
                rename($tmpOutput, $outputPath);
                $ok = true;
            } elseif (file_exists($tmpOutput)) {
                @unlink($tmpOutput);
            }
        }

        if ($ok) {
            $newSize = filesize($outputPath);
            $thumbnail = generateImageThumbnail($outputPath);
            return [
                'ok'        => true,
                'orig_size' => $origSize,
                'new_size'  => $newSize,
                'reduction' => $origSize > 0 ? round((1 - $newSize / $origSize) * 100) : 0,
                'thumbnail' => $thumbnail,
            ];
        }

        return ['ok' => false, 'error' => 'No se pudo comprimir'];
    }
}

if (!function_exists('compressMultimedia')) {
    /**
     * Detecta tipo de archivo y aplica la compresión adecuada.
     * Retorna array con resultado de la operación.
     */
    function compressMultimedia(string $filePath): array
    {
        if (!file_exists($filePath)) return ['ok' => false, 'error' => 'Archivo no encontrado'];

        $mime = mime_content_type($filePath) ?: '';

        // Video
        if (strpos($mime, 'video/') === 0) {
            return array_merge(['type' => 'video'], compressVideo($filePath));
        }

        // Audio
        if (strpos($mime, 'audio/') === 0) {
            return array_merge(['type' => 'audio'], compressAudio($filePath));
        }

        // Imagen
        if (strpos($mime, 'image/') === 0) {
            return array_merge(['type' => 'image'], compressImage($filePath));
        }

        return ['ok' => false, 'error' => 'Tipo no soportado: ' . $mime];
    }
}

if (!function_exists('compressAsync')) {
    /**
     * Ejecuta compresión en background (fire-and-forget).
     * No bloquea la respuesta HTTP.
     * $fileUrl: ruta_archivo del registro en BD (para guardar thumbnail_url después).
     */
    function compressAsync(string $filePath, ?string $fileUrl = null): void
    {
        if (!file_exists($filePath)) return;

        $compressedDir = dirname($filePath) . '/.compressed_log';
        if (!is_dir($compressedDir)) @mkdir($compressedDir, 0755, true);

        $logFile = $compressedDir . '/' . basename($filePath) . '.log';

        $escapedPath = escapeshellarg($filePath);
        $escapedLog  = escapeshellarg($logFile);

        // Construir script PHP inline que comprime y guarda thumbnail en DB
        $phpScript = sprintf(
            'require_once %s; $r = compressMultimedia(%s); if ($r[\"ok\"] && isset($r[\"thumbnail\"]) && %s) { $thumbRel = str_replace(%s, %s, $r[\"thumbnail\"]); saveArchivoThumbnail(%s, $thumbRel); }',
            escapeshellarg(__DIR__ . '/multimedia_compressor.php'),
            $escapedPath,
            var_export($fileUrl !== null, true),
            var_export(UPLOADS_BASE_PATH, true),
            var_export(UPLOADS_BASE_URL, true),
            var_export($fileUrl, true)
        );

        $cmd = sprintf(
            'nohup php -r %s > %s 2>&1 &',
            escapeshellarg($phpScript),
            $escapedLog
        );

        exec($cmd);
    }
}

if (!function_exists('saveThumbnailUrl')) {
    /**
     * Guarda la URL del thumbnail en la tabla checklist_paso_videos.
     * Se llama después de comprimir un video en background.
     */
    function saveThumbnailUrl(string $videoUrl, string $thumbUrl): void
    {
        try {
            require_once __DIR__ . '/conexion.php';
            $conn->prepare(
                "UPDATE checklist_paso_videos SET thumbnail_url = ? WHERE ruta_archivo = ?"
            )->execute([$thumbUrl, $videoUrl]);
        } catch (Throwable $e) {
            error_log('saveThumbnailUrl error: ' . $e->getMessage());
        }
    }
}

if (!function_exists('saveArchivoThumbnail')) {
    /**
     * Guarda la URL de la miniatura en archivos_multimedia.
     * Se llama después de comprimir una foto/video en background.
     */
    function saveArchivoThumbnail(string $archivoUrl, string $thumbUrl): void
    {
        try {
            require_once __DIR__ . '/conexion.php';
            $stmt = $conn->prepare(
                "UPDATE archivos_multimedia SET ruta_thumbnail = ? WHERE ruta_archivo = ?"
            );
            $stmt->execute([$thumbUrl, $archivoUrl]);
            if ($stmt->rowCount() === 0) {
                // También intentar por coincidencia parcial si la ruta es relativa
                $like = '%' . basename($archivoUrl);
                $conn->prepare(
                    "UPDATE archivos_multimedia SET ruta_thumbnail = ? WHERE ruta_archivo LIKE ? AND ruta_thumbnail IS NULL"
                )->execute([$thumbUrl, $like]);
            }
        } catch (Throwable $e) {
            error_log('saveArchivoThumbnail error: ' . $e->getMessage());
        }
    }
}
