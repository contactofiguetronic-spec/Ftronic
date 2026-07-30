<?php
/**
 * nav_counts_api.php — Lightweight endpoint for nav item badges
 * Returns counts for sidebar items. Called every 60s by common.js loadNavCounts().
 * GET only, no auth (same as other endpoints), lightweight queries.
 */
require_once '../includes/conexion.php';
requireAuth();

header('Content-Type: application/json; charset=utf-8');

try {
    // ── Clientes ────────────────────────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM clientes WHERE activo=1 OR activo IS NULL");
    $clientes = (int)$stmt->fetchColumn();

    // ── Vehículos ───────────────────────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM vehiculos");
    $vehiculos = (int)$stmt->fetchColumn();

    // ── Órdenes de Trabajo abiertas ─────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM orden_trabajo WHERE estado IN ('pendiente','en_proceso','diagnostico')");
    $ots = (int)$stmt->fetchColumn();

    // ── Recepciones hoy ─────────────────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM recepcion_unificada WHERE DATE(creado) = CURDATE()");
    $recepciones = (int)$stmt->fetchColumn();

    // ── Presupuestos pendientes ─────────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM presupuesto WHERE estado IN ('pendiente','en_espera')");
    $presupuestos = (int)$stmt->fetchColumn();

    // ── Pagos pendientes (hoy) ──────────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM pagos WHERE DATE(creado) = CURDATE()");
    $pagos = (int)$stmt->fetchColumn();

    // ── Tareas pendientes ───────────────────────────────────────────
    $stmt = $conn->query("SELECT COUNT(*) FROM tareas_diarias WHERE estado != 'completado'");
    $tareas = (int)$stmt->fetchColumn();

    // ── Artículos con stock bajo (opcional) ─────────────────────────
    // (just a placeholder — real stock check would need stock table)
    $articulos = 0;

    echo json_encode([
        'success' => true,
        'data' => [
            'clientes' => $clientes,
            'vehiculos' => $vehiculos,
            'ots' => $ots,
            'recepciones' => $recepciones,
            'presupuestos' => $presupuestos,
            'pagos' => $pagos,
            'tareas' => $tareas > 0 ? $tareas : 0,
            'articulos' => $articulos,
        ]
    ]);
} catch (Exception $e) {
    if (APP_ENV !== 'production') {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Error al obtener conteos']);
    }
}