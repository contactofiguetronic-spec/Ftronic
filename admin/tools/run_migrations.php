<?php
// ============================================================================
// run_migrations.php — Ejecuta migraciones pendientes desde el navegador
// ⚠️  ELIMINAR DESPUÉS DE USAR (seguridad)
// ============================================================================

require_once __DIR__ . '/includes/conexion.php';
requireAuth();

// Solo admin nivel 1
$u = currentUser();
if (!$u || ($u['nivel'] ?? 99) > 1) {
    http_response_code(403);
    echo "Solo administradores pueden ejecutar esto.";
    exit;
}

$results = [];

function runMigration($pdo, $name, $sql) {
    $statements = array_filter(array_map('trim', explode(';', $sql)));
    $ok = 0;
    $fail = 0;
    $errors = [];
    foreach ($statements as $stmt) {
        if (empty($stmt) || str_starts_with($stmt, '--')) continue;
        try {
            $pdo->exec($stmt);
            $ok++;
        } catch (PDOException $e) {
            // Ignorar Duplicate Key y Table exists
            if (in_array($e->getCode(), ['23000', '42S01', 'HY000'])) {
                $ok++;
            } else {
                $fail++;
                $errors[] = substr($e->getMessage(), 0, 200);
            }
        }
    }
    return ['name' => $name, 'ok' => $ok, 'fail' => $fail, 'errors' => $errors];
}

// ── MIGRACIÓN 1: usuario_permisos ──
$sql1 = "
CREATE TABLE IF NOT EXISTS usuario_permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    permiso VARCHAR(100) NOT NULL,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuario_permiso (usuario_id, permiso),
    KEY idx_up_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";
$results[] = runMigration($pdo, '1. Tabla usuario_permisos', $sql1);

// ── MIGRACIÓN 2: solicitudes_registro ──
$sql2 = "
CREATE TABLE IF NOT EXISTS solicitudes_registro (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    telefono VARCHAR(20) DEFAULT NULL,
    rut VARCHAR(20) DEFAULT NULL,
    empresa VARCHAR(150) DEFAULT NULL,
    motivo TEXT DEFAULT NULL,
    campos_extra JSON DEFAULT NULL,
    estado ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
    admin_id INT DEFAULT NULL,
    motivo_rechazo TEXT DEFAULT NULL,
    usuario_creado_id INT DEFAULT NULL,
    creado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revisado DATETIME DEFAULT NULL,
    KEY idx_sr_estado (estado),
    KEY idx_sr_creado (creado),
    KEY idx_sr_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";
$results[] = runMigration($pdo, '2. Tabla solicitudes_registro', $sql2);

// ── MIGRACIÓN 3: configs de registro ──
$sql3 = "
INSERT INTO config_sistema (clave, valor, tipo, grupo, descripcion, min_valor, max_valor) VALUES
('registro_campos_obligatorios', '[\"nombre\",\"apellido\",\"email\",\"password\"]', 'json', 'registro', 'Campos obligatorios en formulario de registro publico', NULL, NULL),
('registro_campos_visibles', '[\"nombre\",\"apellido\",\"email\",\"telefono\",\"rut\",\"empresa\",\"motivo\"]', 'json', 'registro', 'Campos visibles en formulario de registro publico', NULL, NULL),
('registro_approval_required', '1', 'bool', 'registro', 'Requiere aprobacion de admin para activar cuenta', NULL, NULL),
('registro_default_role', '6', 'int', 'registro', 'Rol asignado por defecto al aprobar (6=Solo Lectura)', NULL, NULL)
ON DUPLICATE KEY UPDATE actualizado = NOW();
";
$results[] = runMigration($pdo, '3. Configs de registro', $sql3);

// ── MIGRACIÓN 4: permisos de solicitudes ──
$sql4 = "
INSERT IGNORE INTO permisos (modulo, accion, campo, tipo, descripcion, categoria) VALUES
('solicitudes_registro', 'ver', NULL, 'accion', 'Ver solicitudes de registro', 'Sistema'),
('solicitudes_registro', 'aprobar', NULL, 'accion', 'Aprobar solicitudes de registro', 'Sistema'),
('solicitudes_registro', 'rechazar', NULL, 'accion', 'Rechazar solicitudes de registro', 'Sistema');
";
$results[] = runMigration($pdo, '4. Permisos solicitudes_registro', $sql4);

// ── MIGRACIÓN 5: asignar permisos a roles ──
$sql5 = "
INSERT INTO role_permisos (rol_id, permiso_id, activo)
SELECT 1, p.id, 1 FROM permisos p
WHERE p.modulo = 'solicitudes_registro'
ON DUPLICATE KEY UPDATE activo = 1;

INSERT INTO role_permisos (rol_id, permiso_id, activo)
SELECT 2, p.id, 1 FROM permisos p
WHERE p.modulo = 'solicitudes_registro' AND p.accion IN ('ver', 'aprobar')
ON DUPLICATE KEY UPDATE activo = 1;
";
$results[] = runMigration($pdo, '5. Permisos para roles', $sql5);

// ── MIGRACIÓN 6: Fix ENUM tipo ──
$sql6 = "ALTER TABLE usuarios MODIFY COLUMN tipo ENUM('empleado', 'cliente', 'admin') NOT NULL DEFAULT 'empleado';";
$results[] = runMigration($pdo, '6. Fix ENUM tipo usuario', $sql6);

// ── Verificar tablas ──
$tables = [];
$check = $pdo->query("SHOW TABLES LIKE '%'");
while ($row = $check->fetch(PDO::FETCH_NUM)) {
    $tables[] = $row[0];
}
$hasUsuarioPermisos = in_array('usuario_permisos', $tables);
$hasSolicitudes = in_array('solicitudes_registro', $tables);

?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Migraciones — Figuetronic ERP</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, sans-serif; padding: 24px; background: #f5f5f5; }
        .card { background: #fff; border-radius: 12px; padding: 24px; max-width: 700px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        h1 { font-size: 1.2rem; margin-bottom: 20px; }
        .mig { padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e5e7eb; }
        .mig.ok { background: #f0fdf4; border-color: #bbf7d0; }
        .mig.partial { background: #fef3c7; border-color: #fde68a; }
        .mig.fail { background: #fef2f2; border-color: #fecaca; }
        .mig-title { font-weight: 600; font-size: 0.9rem; }
        .mig-detail { font-size: 0.8rem; color: #666; margin-top: 4px; }
        .mig-errors { font-size: 0.75rem; color: #991b1b; margin-top: 4px; }
        .status { padding: 16px; border-radius: 8px; margin-top: 16px; font-weight: 600; }
        .status.green { background: #dcfce7; color: #166534; }
        .status.yellow { background: #fef3c7; color: #92400E; }
        a { color: #4B7BEC; }
    </style>
</head>
<body>
    <div class="card">
        <h1>⚙️ Migraciones de Base de Datos</h1>
        <?php foreach ($results as $r): ?>
        <div class="mig <?= $r['fail'] > 0 ? 'partial' : 'ok' ?>">
            <div class="mig-title"><?= htmlspecialchars($r['name']) ?></div>
            <div class="mig-detail">Statements OK: <?= $r['ok'] ?> | Fallidos: <?= $r['fail'] ?></div>
            <?php if ($r['errors']): ?>
            <div class="mig-errors"><?= htmlspecialchars(implode(' | ', $r['errors'])) ?></div>
            <?php endif; ?>
        </div>
        <?php endforeach; ?>

        <div class="status <?= ($hasUsuarioPermisos && $hasSolicitudes) ? 'green' : 'yellow' ?>">
            <?php if ($hasUsuarioPermisos && $hasSolicitudes): ?>
                ✅ Todas las tablas creadas correctamente. Puedes cerrar esta página.
            <?php else: ?>
                ⚠️ Tablas faltantes: <?= !$hasUsuarioPermisos ? 'usuario_permisos ' : '' ?><?= !$hasSolicitudes ? 'solicitudes_registro' : '' ?>
            <?php endif; ?>
        </div>

        <p style="margin-top:16px;font-size:0.8rem;color:#666;">
            <a href="dashboard.html">← Volver al ERP</a> | <strong>⚠️ Eliminar este archivo después de usar</strong>
        </p>
    </div>
</body>
</html>
