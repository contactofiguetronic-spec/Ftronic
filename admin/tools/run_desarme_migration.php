<?php
// ============================================================================
// run_desarme_migration.php — Ejecuta migración del módulo desarme
// ============================================================================
// Ejecutar una sola vez: https://figuetronic.cl/admin/tools/run_desarme_migration.php
// ELIMINAR después de ejecutar por seguridad.
// ============================================================================

require_once __DIR__ . '/../includes/conexion.php';
requireAuth();
requirePerm('admin:panel');

header('Content-Type: application/json; charset=utf-8');

$migrationFile = __DIR__ . '/../sql/migrations/2026_07_25_desarme_fixes.sql';

if (!file_exists($migrationFile)) {
    jsonResponse('error', 'Archivo de migración no encontrado');
}

$sql = file_get_contents($migrationFile);
$statements = array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== '' && !str_starts_with($s, '--'));

$results = [];
$success = 0;
$errors = 0;

foreach ($statements as $i => $stmt) {
    if (preg_match('/^(SET|--)/', $stmt)) continue;
    try {
        $conn->exec($stmt);
        $results[] = ['ok' => true, 'stmt' => substr($stmt, 0, 80)];
        $success++;
    } catch (PDOException $e) {
        $results[] = ['ok' => false, 'stmt' => substr($stmt, 0, 80), 'error' => $e->getMessage()];
        $errors++;
    }
}

jsonResponse('success', "Migración completada: $success éxitos, $errors errores", [
    'total' => count($statements),
    'success' => $success,
    'errors' => $errors,
    'details' => $results
]);
