<?php
// ============================================================================
// pdf_api.php — Generación de PDFs (HTML premium → print-to-PDF)
// ============================================================================
// GET ?type=presupuesto&id=123
// GET ?type=orden&id=123
// GET ?type=venta&id=123
// GET ?type=recepcion_unificada&id=123
// ============================================================================

// Intentar cargar TCPDF como fallback; si falla, usar HTML→print
$useTCPDF = false;
if (@is_file(__DIR__ . '/../vendor/tcpdf/tcpdf.php')) {
    @require_once __DIR__ . '/../vendor/tcpdf/tcpdf.php';
    $useTCPDF = class_exists('TCPDF', false);
}

require_once __DIR__ . '/../includes/conexion.php';
requireAuth();

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-cache, no-store, must-revalidate');

$type = $_GET['type'] ?? '';
$id   = (int)($_GET['id'] ?? 0);

if (!$type || !$id) {
    http_response_code(400);
    echo 'Parámetros requeridos: type, id';
    exit;
}

// ============================================================================
// COMPANY DATA
// ============================================================================
$C = [
    'name'     => 'FIGUETRONIC SPA',
    'rut'      => '78419845-6',
    'address'  => 'Baldomero Lillo 364',
    'phone'    => '+56.995183457',
    'city'     => 'Santiago',
    'commune'  => 'Padre Hurtado',
    'business' => 'SERVICIO DE ELECTRÓNICA AUTOMOTRIZ',
    'email'    => 'info@figuetronic.cl',
];

// ============================================================================
// FETCH DATA
// ============================================================================
$data = null;
try {
    switch ($type) {
        case 'presupuesto':
            $stmt = $conn->prepare(
                "SELECT p.*,
                        v.patente, v.marca, v.modelo,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo
                 FROM presupuesto p
                 LEFT JOIN vehiculos v ON p.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON p.cliente_id  = c.id
                 WHERE p.id = ?"
            );
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Presupuesto no encontrado'; exit; }
            $stmtItems = $conn->prepare("SELECT * FROM presupuesto_items WHERE presupuesto_id = ? ORDER BY id");
            $stmtItems->execute([$id]);
            $data['items'] = $stmtItems->fetchAll();
            break;

        case 'orden':
        case 'orden_trabajo':
            $stmt = $conn->prepare(
                "SELECT ot.*,
                        v.patente, v.marca, v.modelo, v.color, v.anio, v.kilometraje, v.combustible,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo, c.domicilio AS cliente_domicilio,
                        e.nombre AS empleado_nombre, e.apellido AS empleado_apellido
                 FROM orden_trabajo ot
                 LEFT JOIN vehiculos  v ON ot.vehiculo_id = v.id
                 LEFT JOIN clientes   c ON ot.cliente_id  = c.id
                 LEFT JOIN empleados  e ON ot.asignado_empleado_id = e.id
                 WHERE ot.id = ?"
            );
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Orden de trabajo no encontrada'; exit; }
            $stmtItems = $conn->prepare("SELECT * FROM orden_trabajo_items WHERE orden_trabajo_id = ? ORDER BY id");
            $stmtItems->execute([$id]);
            $data['items'] = $stmtItems->fetchAll();
            break;

        case 'venta':
        case 'factura':
            $stmt = $conn->prepare(
                "SELECT ve.*,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.domicilio AS cliente_domicilio
                 FROM ventas ve
                 LEFT JOIN clientes c ON ve.cliente_id = c.id
                 WHERE ve.id = ?"
            );
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Venta no encontrada'; exit; }
            break;

        case 'recepcion_unificada':
            $stmt = $conn->prepare("SELECT * FROM recepcion_unificada WHERE id = ?");
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Recepción no encontrada'; exit; }
            break;

        case 'vehiculo':
        case 'vehiculos':
            $stmt = $conn->prepare(
                "SELECT v.*,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono, c.correo AS cliente_correo
                 FROM vehiculos v
                 LEFT JOIN clientes c ON v.cliente_id = c.id
                 WHERE v.id = ?"
            );
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Vehículo no encontrado'; exit; }
            // Get receptions
            $stmtRec = $conn->prepare("SELECT id, folio, fecha, eval_estado_general, eval_motivo_visita FROM recepcion_unificada WHERE vehiculo_id = ? ORDER BY fecha DESC LIMIT 10");
            $stmtRec->execute([$id]);
            $data['recepciones'] = $stmtRec->fetchAll();
            // Get work orders
            $stmtOT = $conn->prepare("SELECT id, estado, creado FROM orden_trabajo WHERE vehiculo_id = ? ORDER BY creado DESC LIMIT 10");
            $stmtOT->execute([$id]);
            $data['ordenes_trabajo'] = $stmtOT->fetchAll();
            break;

        case 'diagnostico':
        case 'diagnosticos':
            $stmt = $conn->prepare(
                "SELECT d.*,
                        v.patente, v.marca, v.modelo, v.anio, v.color, v.vin,
                        v.kilometraje, v.combustible,
                        c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
                        c.rut AS cliente_rut, c.telefono AS cliente_telefono,
                        c.correo AS cliente_correo
                 FROM diagnosticos d
                 LEFT JOIN vehiculos v ON d.vehiculo_id = v.id
                 LEFT JOIN clientes  c ON d.cliente_id  = c.id
                 WHERE d.id = ?"
            );
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Diagnóstico no encontrado'; exit; }
            break;

        case 'orden_compra':
        case 'ordenes_compra':
            $stmt = $conn->prepare(
                "SELECT oc.*, p.nombre AS proveedor_nombre,
                        p.rut AS proveedor_rut, p.contacto_nombre AS proveedor_contacto,
                        p.telefono AS proveedor_telefono, p.correo AS proveedor_email,
                        p.direccion AS proveedor_direccion, p.rubro AS proveedor_giro
                 FROM orden_compra oc
                 LEFT JOIN proveedores p ON oc.proveedor_id = p.id
                 WHERE oc.id = ?"
            );
            $stmt->execute([$id]);
            $data = $stmt->fetch();
            if (!$data) { http_response_code(404); echo 'Orden de compra no encontrada'; exit; }
            $stmtItems = $conn->prepare("SELECT * FROM orden_compra_items WHERE orden_compra_id = ? ORDER BY id");
            $stmtItems->execute([$id]);
            $data['items'] = $stmtItems->fetchAll();
            break;

        default:
            http_response_code(400);
            echo 'Tipo no válido: ' . htmlspecialchars($type);
            exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo 'Error DB: ' . $e->getMessage();
    exit;
}

// ============================================================================
// HELPERS
// ============================================================================
function f($v) { return htmlspecialchars((string)($v ?: ''), ENT_QUOTES, 'UTF-8'); }
function money($v) { return number_format((float)($v ?: 0), 0, ',', '.'); }
function fechaLinda($d) {
    if (!$d) return 'N/A';
    try { return (new DateTime($d))->format('d \d\e F \d\e Y'); } catch(e) { return $d; }
}

function getLogoPath() {
    $paths = [
        dirname(__DIR__) . '/assets/logo.jpeg',
        dirname(__DIR__) . '/assets/logo.jpg',
        dirname(__DIR__) . '/assets/logo.png',
    ];
    foreach ($paths as $p) {
        if (file_exists($p)) return $p;
    }
    return null;
}

function logoDataUri() {
    $path = getLogoPath();
    if (!$path) return '';
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $mime = match($ext) { 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', default => 'image/jpeg' };
    return 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($path));
}

function imgToBase64($url) {
    if (!$url || str_starts_with($url, 'data:')) return $url;
    // Handle full URLs — extract path only
    if (preg_match('#^https?://[^/]+(/.+)$#', $url, $m)) {
        $url = $m[1];
    }
    // DB stores URLs like /admin/uploads/... but __DIR__ is already admin/
    // Strip leading /admin/ if present to avoid double path
    $clean = preg_replace('#^/admin/#', '/', $url);
    $fullPath = dirname(__DIR__) . $clean;
    if (!file_exists($fullPath)) {
        // Fallback: try original path
        $fullPath = dirname(__DIR__) . '/' . ltrim($url, '/');
    }
    if (file_exists($fullPath)) {
        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        $mime = match($ext) { 'jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','gif'=>'image/gif','webp'=>'image/webp', default=>'image/jpeg' };
        return 'data:' . $mime . ';base64,' . base64_encode(file_get_contents($fullPath));
    }
    return '';
}

// ============================================================================
// DESIGN SYSTEM — UNIFIED MODERN CSS
// ============================================================================
$logo = logoDataUri();
$fechaActual = date('d/m/Y');
$horaActual  = date('H:i');

$CSS = '
<style>
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap");

@page {
    size: A4 portrait;
    margin: 12mm 10mm 15mm 10mm;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1a1a2e;
    background: #fff;
    font-size: 9px;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}

/* ── HEADER ── */
.doc-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%);
    border-radius: 12px;
    color: #fff;
    margin-bottom: 10px;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.25);
    position: relative;
    overflow: hidden;
}
.doc-header::before {
    content: "";
    position: absolute;
    top: -50%;
    right: -20%;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%);
    border-radius: 50%;
}
.doc-header::after {
    content: "";
    position: absolute;
    bottom: -30%;
    left: 10%;
    width: 150px;
    height: 150px;
    background: radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%);
    border-radius: 50%;
}
.doc-logo { width: 55px; height: 55px; border-radius: 10px; object-fit: contain; background: rgba(255,255,255,0.1); padding: 4px; flex-shrink: 0; position: relative; z-index: 1; }
.doc-company { flex: 1; position: relative; z-index: 1; }
.doc-company-name { font-size: 16px; font-weight: 800; letter-spacing: 1px; }
.doc-company-rut { font-size: 8px; opacity: 0.7; margin-top: 1px; }
.doc-company-detail { font-size: 7.5px; opacity: 0.6; margin-top: 1px; }
.doc-badge {
    position: relative; z-index: 1;
    background: rgba(255,255,255,0.12);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.15);
    padding: 8px 14px;
    border-radius: 8px;
    text-align: center;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
}
.doc-badge-id { font-size: 14px; font-weight: 900; color: #60a5fa; }

/* ── TITLE BAR ── */
.doc-title-bar {
    background: linear-gradient(90deg, #eff6ff, #f0fdf4);
    border-left: 4px solid #2563eb;
    border-radius: 0 8px 8px 0;
    padding: 10px 16px;
    margin-bottom: 10px;
}
.doc-title { font-size: 16px; font-weight: 900; color: #1e3a5f; text-transform: uppercase; letter-spacing: 3px; }
.doc-subtitle { font-size: 8px; color: #64748b; font-style: italic; margin-top: 2px; }

/* ── SECTION ── */
.section { margin-bottom: 8px; page-break-inside: avoid; }
.section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: linear-gradient(135deg, #1e3a5f, #2563eb);
    color: #fff;
    border-radius: 6px 6px 0 0;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
}
.section-header.green { background: linear-gradient(135deg, #065f46, #10b981); }
.section-header.amber { background: linear-gradient(135deg, #92400e, #f59e0b); }
.section-header.red { background: linear-gradient(135deg, #991b1b, #ef4444); }
.section-header.purple { background: linear-gradient(135deg, #581c87, #a855f7); }
.section-header i { font-size: 10px; }
.section-body {
    border: 1px solid #e2e8f0;
    border-top: none;
    border-radius: 0 0 6px 6px;
    padding: 8px 10px;
    background: #fff;
}

/* ── INFO GRID ── */
.info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 12px; }
.info-grid.cols-2 { grid-template-columns: 1fr 1fr; }
.info-item { padding: 4px 0; }
.info-label { font-size: 7px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.info-value { font-size: 9px; font-weight: 600; color: #1a1a2e; margin-top: 1px; }
.info-value.highlight { color: #2563eb; font-size: 11px; font-weight: 800; }

/* ── TABLE ── */
.data-table { width: 100%; border-collapse: collapse; font-size: 8px; }
.data-table thead th {
    background: linear-gradient(135deg, #1e3a5f, #2563eb);
    color: #fff;
    padding: 6px 8px;
    font-size: 7px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
}
.data-table tbody td {
    padding: 6px 8px;
    border-bottom: 1px solid #f1f5f9;
}
.data-table tbody tr:nth-child(even) { background: #f8fafc; }
.data-table tbody tr:hover { background: #eff6ff; }
.data-table tbody tr:last-child td { border-bottom: 2px solid #2563eb; }
.badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 7px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}
.badge.srv { background: #dbeafe; color: #1d4ed8; }
.badge.art { background: #d1fae5; color: #059669; }
.text-right { text-align: right; }

/* ── TOTALS ── */
.totals-box {
    display: flex;
    justify-content: flex-end;
    margin: 8px 0;
}
.totals-inner { width: 240px; }
.total-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 9px;
}
.total-label { color: #64748b; }
.total-value { font-weight: 700; color: #1a1a2e; }
.total-row.grand {
    border-top: 2px solid #2563eb;
    margin-top: 4px;
    padding-top: 6px;
    font-size: 13px;
    font-weight: 900;
}
.total-row.grand .total-value { color: #059669; font-size: 14px; }
.total-row.deduct .total-value { color: #dc2626; }

/* ── TEXT BLOCK ── */
.text-block {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 8.5px;
    white-space: pre-wrap;
    line-height: 1.5;
    color: #334155;
}

/* ── INSPECTION ── */
.insp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.insp-table { width: 100%; border-collapse: collapse; font-size: 7.5px; }
.insp-table td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }
.insp-table td:first-child { font-weight: 600; color: #475569; width: 65%; }
.insp-table td:last-child { text-align: center; width: 35%; }
.insp-ok { color: #16a34a; font-weight: 800; }
.insp-bad { color: #dc2626; font-weight: 800; }
.insp-na { color: #94a3b8; }
.insp-other { color: #d97706; font-weight: 600; }

/* ── PHOTOS ── */
.photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
}
.photo-card {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    transition: box-shadow 0.2s;
}
.photo-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.photo-card img {
    width: 100%;
    height: 120px;
    object-fit: contain;
    display: block;
    background: #f8fafc;
}
.photo-card .photo-label {
    background: linear-gradient(135deg, #1e3a5f, #2563eb);
    color: #fff;
    font-size: 6.5px;
    font-weight: 700;
    padding: 4px 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
}
.photo-placeholder {
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
    color: #cbd5e1;
    font-size: 7px;
    font-style: italic;
    border-bottom: 1px solid #f1f5f9;
}

/* ── SIGNATURES ── */
.sig-area {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-top: 20px;
}
.sig-box { flex: 1; text-align: center; }
.sig-line { border-top: 2px solid #1e3a5f; margin-top: 30px; margin-bottom: 4px; }
.sig-label { font-size: 8px; font-weight: 700; color: #1e3a5f; }
.sig-name { font-size: 7px; color: #64748b; margin-top: 2px; }

/* ── FOOTER ── */
.doc-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 2px solid #1e3a5f;
    margin-top: 12px;
    font-size: 7px;
    color: #94a3b8;
}

/* ── NOTE BOX ── */
.note-box {
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 8px;
    color: #92400e;
    margin-top: 8px;
}
.note-box strong { color: #78350f; }

/* ── COPY BADGE ── */
.copy-badge {
    text-align: center;
    padding: 6px;
    background: linear-gradient(135deg, #1e3a5f, #2563eb);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 3px;
    text-transform: uppercase;
    border-radius: 8px;
    margin-bottom: 8px;
}

/* ── WATERMARK ── */
.watermark {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 60px;
    font-weight: 900;
    color: rgba(0,0,0,0.03);
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
    letter-spacing: 10px;
}

/* ── TERMS ── */
.terms-box {
    font-size: 7.5px;
    color: #475569;
    line-height: 1.6;
    margin-top: 8px;
}
.terms-box strong { color: #1e3a5f; }

/* ── PRINT ── */
@media print {
    body { margin: 0; }
    .no-print { display: none !important; }
}
</style>
';

// ============================================================================
// HTML GENERATORS
// ============================================================================

function htmlHeader($docType, $docId, $folio = null) {
    global $C, $logo;
    $badgeId = $folio ?: $docId;
    $badgeLabel = strtoupper(str_replace('_', ' ', $docType));
    $logoHtml = $logo ? '<img src="' . $logo . '" class="doc-logo" alt="Logo">' : '';
    $name = $C['name'];
    $rut = $C['rut'];
    $addr = $C['address'];
    $commune = $C['commune'];
    $city = $C['city'];
    $phone = $C['phone'];
    $biz = $C['business'];
    return <<<HTML
<div class="doc-header">
    {$logoHtml}
    <div class="doc-company">
        <div class="doc-company-name">{$name}</div>
        <div class="doc-company-rut">RUT: {$rut}</div>
        <div class="doc-company-detail">{$addr}, {$commune}, {$city} | Tel: {$phone}</div>
        <div class="doc-company-detail" style="color:#f87171;margin-top:2px;">{$biz}</div>
    </div>
    <div class="doc-badge">
        <div class="doc-badge-id">{$badgeId}</div>
        <div>{$badgeLabel}</div>
    </div>
</div>
HTML;
}

function htmlSection($title, $body, $icon = 'fa-folder-open', $colorClass = '') {
    $cc = $colorClass ? " {$colorClass}" : '';
    return <<<HTML
<div class="section">
    <div class="section-header{$cc}"><i class="fas {$icon}"></i> {$title}</div>
    <div class="section-body">{$body}</div>
</div>
HTML;
}

function htmlInfoGrid($items, $cols = 3) {
    $cc = $cols === 2 ? ' cols-2' : '';
    $html = "<div class=\"info-grid{$cc}\">";
    foreach ($items as $label => $value) {
        $highlight = $value['highlight'] ?? false;
        $cls = $highlight ? ' info-value highlight' : ' info-value';
        $val = $highlight ? $value['value'] : f($value['value'] ?? $value);
        $html .= "<div class=\"info-item\"><div class=\"info-label\">" . f($label) . "</div><div class=\"{$cls}\">{$val}</div></div>";
    }
    $html .= '</div>';
    return $html;
}

function htmlFooter($docType, $docId) {
    global $C;
    $name = $C['name'];
    $rut = $C['rut'];
    $server = $_SERVER['SERVER_NAME'] ?? 'figuetronic.cl';
    $fecha = $GLOBALS['fechaActual'];
    return <<<HTML
<div class="doc-footer">
    <span>{$name} — {$rut}</span>
    <span>{$server}</span>
    <span>{$docType} N° {$docId} | {$fecha}</span>
</div>
HTML;
}

function htmlSignature($signatures) {
    $html = '<div class="sig-area">';
    foreach ($signatures as $s) {
        $html .= <<<HTML
<div class="sig-box">
    <div class="sig-line"></div>
    <div class="sig-label">{$s['label']}</div>
    <div class="sig-name">{$s['name']}</div>
</div>
HTML;
    }
    $html .= '</div>';
    return $html;
}

function inspIcon($val) {
    if (!$val) return '<span class="insp-na">—</span>';
    $v = strtolower(trim($val));
    if (in_array($v, ['bueno','bien','ok','excelente','1','si','sí'])) return '<span class="insp-ok">●</span>';
    if (in_array($v, ['malo','regular','dañado','danado','0','no'])) return '<span class="insp-bad">●</span>';
    if (in_array($v, ['n/a','na','no aplica'])) return '<span class="insp-na">N/A</span>';
    return '<span class="insp-other">' . f($val) . '</span>';
}

function photoCell($label, $src) {
    if ($src) {
        return <<<HTML
<div class="photo-card">
    <img src="{$src}" alt="{$label}">
    <div class="photo-label">{$label}</div>
</div>
HTML;
    }
    return <<<HTML
<div class="photo-card">
    <div class="photo-placeholder">Sin foto</div>
    <div class="photo-label">{$label}</div>
</div>
HTML;
}

// ============================================================================
// BUILD DOCUMENTS
// ============================================================================
$html = '';

switch ($type) {

    // ====================================================================
    // PRESUPUESTO
    // ====================================================================
    case 'presupuesto':
        $cli = trim(f($data['cliente_nombre'] ?? '') . ' ' . f($data['cliente_apellido'] ?? ''));
        $veh = trim(f($data['marca'] ?? '') . ' ' . f($data['modelo'] ?? ''));
        $items = $data['items'] ?? [];
        $neto = (float)($data['valor'] ?? 0);
        $iva = (float)($data['impuesto'] ?? 0);
        $total = (float)($data['valor_total'] ?? 0);

        // Compute discounts from source data
        $subtotalItems = 0;
        $descItems = 0;
        foreach ($items as $it) {
            $sub = (float)($it['valor_unitario'] ?? 0) * (int)($it['cantidad'] ?? 1);
            $subtotalItems += $sub;
            $descItems += $sub * ((float)($it['descuento'] ?? 0) / 100);
        }
        $descGlobalFixed = (float)($data['descuento_global'] ?? 0);
        $descGlobalPct = (float)($data['descuento_pct'] ?? 0);
        $descGlobalFromPct = $neto * ($descGlobalPct / 100);
        $descGlobalTotal = $descGlobalFixed + $descGlobalFromPct;
        $descTotal = $descItems + $descGlobalTotal;

        // Items table
        $tableHtml = '';
        if (!empty($items)) {
            $tableHtml = '<table class="data-table"><thead><tr><th>Ítem</th><th>Detalle</th><th class="text-right">Cant</th><th class="text-right">P.Unit</th><th class="text-right">Dcto</th><th class="text-right">Subtotal</th></tr></thead><tbody>';
            foreach ($items as $it) {
                $sub = (float)($it['valor_unitario'] ?? 0) * (int)($it['cantidad'] ?? 1);
                $dctoItem = $sub * ((float)($it['descuento'] ?? 0) / 100);
                $netoItem = $sub - $dctoItem;
                $badge = ($it['tipo'] ?? '') === 'servicio' ? '<span class="badge srv">SRV</span>' : '<span class="badge art">ART</span>';
                $tableHtml .= "<tr><td>{$badge} " . f($it['nombre'] ?? '') . "</td><td>" . f($it['detalle'] ?? '') . "</td><td class='text-right'>" . ($it['cantidad'] ?? 1) . "</td><td class='text-right'>$" . money($it['valor_unitario'] ?? 0) . "</td><td class='text-right'>" . (!empty($it['descuento']) ? $it['descuento'] . '%' : '—') . "</td><td class='text-right' style='font-weight:700'>$" . money($netoItem) . "</td></tr>";
            }
            $tableHtml .= '</tbody></table>';
        }

        // Totals
        $totalsHtml = '<div class="totals-box"><div class="totals-inner">';
        $totalsHtml .= '<div class="total-row"><span class="total-label">Subtotal Ítems:</span><span class="total-value">$' . money($subtotalItems) . '</span></div>';
        if ($descItems > 0) $totalsHtml .= '<div class="total-row deduct"><span class="total-label">Dcto. Ítems:</span><span class="total-value">-$' . money($descItems) . '</span></div>';
        $totalsHtml .= '<div class="total-row"><span class="total-label">Neto:</span><span class="total-value">$' . money($neto) . '</span></div>';
        $totalsHtml .= '<div class="total-row deduct"><span class="total-label">IVA 19%:</span><span class="total-value">$' . money($iva) . '</span></div>';
        if ($descGlobalTotal > 0) {
            $dctoLabel = 'Descuento Global';
            if ($descGlobalFixed > 0 && $descGlobalPct > 0) $dctoLabel .= ' (' . money($descGlobalFixed) . ' + ' . $descGlobalPct . '%)';
            elseif ($descGlobalPct > 0) $dctoLabel .= ' (' . $descGlobalPct . '%)';
            $totalsHtml .= '<div class="total-row deduct"><span class="total-label">' . $dctoLabel . ':</span><span class="total-value">-$' . money($descGlobalTotal) . '</span></div>';
        }
        $totalsHtml .= '<div class="total-row grand"><span class="total-label">TOTAL:</span><span class="total-value">$' . money($total) . '</span></div>';
        $totalsHtml .= '</div></div>';

        // PAGE 1: ORIGINAL
        $p1 = '<div class="watermark">ORIGINAL</div>';
        $p1 .= htmlHeader('Presupuesto', $data['id']);
        $p1 .= '<div class="doc-title-bar"><div class="doc-title">Presupuesto — Original</div><div class="doc-subtitle">Documento profesional de cotización de servicios</div></div>';
        $p1 .= htmlSection('Información del Presupuesto', htmlInfoGrid([
            'N° Presupuesto' => ['value' => $data['id'], 'highlight' => true],
            'Fecha de Emisión' => $fechaActual,
            'Vigencia' => ($data['vigencia'] ?? 30) . ' días',
            'Estado' => strtoupper($data['estado'] ?? 'borrador'),
        ]), 'fa-hashtag');
        $p1 .= htmlSection('Datos del Cliente', htmlInfoGrid([
            'Cliente' => $cli ?: 'N/A',
            'RUT' => $data['cliente_rut'] ?? 'N/A',
            'Teléfono' => $data['cliente_telefono'] ?? 'N/A',
        ]), 'fa-user', 'green');
        $p1 .= htmlSection('Vehículo', htmlInfoGrid([
            'Marca / Modelo' => $veh ?: 'N/A',
            'Patente' => $data['patente'] ?? 'N/A',
        ]), 'fa-car');

        if (!empty($data['requisito'])) {
            $p1 .= htmlSection('Requisitos del Cliente', '<div class="text-block">' . f($data['requisito']) . '</div>', 'fa-clipboard-list', 'amber');
        }

        $p1 .= htmlSection('Detalle de Ítems', $tableHtml, 'fa-list-alt');
        $p1 .= $totalsHtml;

        if (!empty($data['observaciones'])) {
            $p1 .= htmlSection('Condiciones y Observaciones', '<div class="text-block">' . f($data['observaciones']) . '</div>', 'fa-sticky-note');
        }

        $p1 .= '<div class="note-box"><strong>Nota:</strong> Este presupuesto tiene una vigencia de ' . ($data['vigencia'] ?? 30) . ' días. Precios sujetos a cambio sin previo aviso.</div>';

        $p1 .= htmlSignature([
            ['label' => 'Autorizado por', 'name' => $C['name']],
            ['label' => 'Aceptado por Cliente', 'name' => $cli ?: '_______________'],
        ]);

        $p1 .= htmlFooter('Presupuesto', $data['id']);

        // PAGE 2: COPIA CLIENTE
        $p2 = '<div class="watermark">COPIA CLIENTE</div>';
        $p2 .= '<div class="copy-badge">Copia Cliente</div>';
        $p2 .= htmlHeader('Presupuesto', $data['id']);
        $p2 .= '<div class="doc-title-bar"><div class="doc-title">Presupuesto — Copia Cliente</div><div class="doc-subtitle">Para entrega al cliente — ' . $fechaActual . '</div></div>';
        $p2 .= htmlSection('Resumen', htmlInfoGrid([
            'N° Presupuesto' => ['value' => $data['id'], 'highlight' => true],
            'Fecha' => $fechaActual,
            'Vigencia' => ($data['vigencia'] ?? 30) . ' días',
        ]), 'fa-hashtag');
        $p2 .= htmlSection('Cliente y Vehículo', htmlInfoGrid([
            'Cliente' => $cli ?: 'N/A',
            'Vehículo' => $veh . ' — ' . ($data['patente'] ?? ''),
        ], 2), 'fa-user');
        $p2 .= htmlSection('Detalle de Ítems', $tableHtml, 'fa-list-alt');
        $p2 .= $totalsHtml;
        $p2 .= '<div class="note-box"><strong>Importante:</strong> Para aprobar, firme y devuelva al taller.</div>';
        $p2 .= htmlSignature([
            ['label' => 'Acepto el Presupuesto', 'name' => 'Firma del Cliente'],
            ['label' => 'Fecha de Aceptación', 'name' => '___/___/______'],
        ]);
        $p2 .= '<div style="text-align:center;font-size:8px;color:#94a3b8;margin-top:16px;">Este documento es una copia para el cliente.<br>El original queda en poder del taller.</div>';
        $p2 .= htmlFooter('Presupuesto', $data['id']);

        $html = '<div style="page-break-after:always;">' . $p1 . '</div>' . $p2;
        break;

    // ====================================================================
    // ORDEN DE TRABAJO
    // ====================================================================
    case 'orden':
    case 'orden_trabajo':
        // Fetch avances
        $avances = [];
        try {
            $stmtAv = $conn->prepare(
                "SELECT a.*, e.nombre AS autor_nombre, e.apellido AS autor_apellido
                 FROM ot_avances a LEFT JOIN empleados e ON a.autor_empleado_id = e.id
                 WHERE a.ot_id = ? ORDER BY a.creado DESC"
            );
            $stmtAv->execute([$id]);
            $avances = $stmtAv->fetchAll();
            foreach ($avances as &$av) {
                $av['archivos_list'] = getMultimedia('ot_avances', (int)$av['id'], $conn);
            }
        } catch (Exception $e) { $avances = []; }

        // Fetch documentos
        $documentos = [];
        try {
            $stmtDoc = $conn->prepare("SELECT * FROM ot_documentos WHERE ot_id = ? ORDER BY creado DESC");
            $stmtDoc->execute([$id]);
            $documentos = $stmtDoc->fetchAll();
        } catch (Exception $e) { $documentos = []; }

        $emp = trim(f($data['empleado_nombre'] ?? '') . ' ' . f($data['empleado_apellido'] ?? ''));
        $cli = trim(f($data['cliente_nombre'] ?? '') . ' ' . f($data['cliente_apellido'] ?? ''));
        $items = $data['items'] ?? [];
        $srv = array_filter($items, fn($i) => ($i['tipo'] ?? '') === 'servicio');
        $art = array_filter($items, fn($i) => ($i['tipo'] ?? '') === 'articulo');

        $vehDesc = !empty($data['patente']) ? f($data['marca'] ?? '') . ' ' . f($data['modelo'] ?? '') . ' — ' . f($data['patente']) : 'N/A';

        $prioMap = ['urgente' => '🔴 URGENTE', 'alta' => '🟠 ALTA', 'normal' => '🔵 NORMAL', 'baja' => '⚪ BAJA'];
        $prioLabel = $prioMap[$data['prioridad'] ?? 'normal'] ?? 'NORMAL';

        $html .= htmlHeader('Orden de Trabajo', $data['id']);
        $html .= '<div class="doc-title-bar"><div class="doc-title">Orden de Trabajo</div><div class="doc-subtitle">Instrucción de trabajo para reparación y mantenimiento vehicular</div></div>';

        $infoOt = [
            'N° Orden' => ['value' => $data['id'], 'highlight' => true],
            'Fecha' => fechaLinda($data['creado'] ?? $fechaActual),
            'Estado' => strtoupper($data['estado'] ?? 'Pendiente'),
            'Prioridad' => $prioLabel,
            'Técnico Asignado' => $emp ?: 'Por asignar',
        ];
        if (!empty($data['fecha_limite'])) $infoOt['Fecha Límite'] = fechaLinda($data['fecha_limite']);
        if (!empty($data['total_horas'])) $infoOt['Horas Estimadas'] = $data['total_horas'] . ' hrs';
        $html .= htmlSection('Información de la Orden', htmlInfoGrid($infoOt, 3), 'fa-hashtag');

        $html .= htmlSection('Cliente y Vehículo', htmlInfoGrid([
            'Cliente' => $cli,
            'RUT' => $data['cliente_rut'] ?? '',
            'Contacto' => $data['cliente_telefono'] ?? '',
            'Email' => $data['cliente_correo'] ?? '',
            'Vehículo' => $vehDesc,
            'Año' => $data['anio'] ?? '',
            'Kilometraje' => ($data['kilometraje'] ?? '') . ' km',
            'Combustible' => $data['combustible'] ?? '',
            'Color' => $data['color'] ?? '',
        ], 3), 'fa-user', 'green');

        if (!empty($data['evaluacion'])) {
            $html .= htmlSection('Evaluación / Diagnóstico', '<div class="text-block">' . f($data['evaluacion']) . '</div>', 'fa-stethoscope', 'purple');
        }

        if (!empty($data['trabajo_ejecutar'])) {
            $html .= htmlSection('Trabajo a Ejecutar', '<div class="text-block">' . f($data['trabajo_ejecutar']) . '</div>', 'fa-wrench');
        }

        if (!empty($data['procedimiento'])) {
            $html .= htmlSection('Procedimiento Técnico', '<div class="text-block">' . f($data['procedimiento']) . '</div>', 'fa-cogs');
        }

        if (!empty($srv)) {
            $t = '<table class="data-table"><thead><tr><th>Servicio</th><th>Detalle</th><th class="text-right">Cant.</th><th class="text-right">Valor Unit.</th><th class="text-right">Subtotal</th></tr></thead><tbody>';
            $totalSrv = 0;
            foreach ($srv as $it) {
                $sub = (float)($it['valor_unitario'] ?? 0) * (int)($it['cantidad'] ?? 1);
                $totalSrv += $sub;
                $t .= '<tr><td>' . f($it['nombre'] ?? '') . '</td><td>' . f($it['detalle'] ?? '') . '</td><td class="text-right">' . ($it['cantidad'] ?? 1) . '</td><td class="text-right">$' . money($it['valor_unitario'] ?? 0) . '</td><td class="text-right" style="font-weight:700">$' . money($sub) . '</td></tr>';
            }
            $t .= '<tr><td colspan="4" style="text-align:right;font-weight:700;border-bottom:2px solid #2563eb">Total Servicios</td><td class="text-right" style="font-weight:800;border-bottom:2px solid #2563eb">$' . money($totalSrv) . '</td></tr>';
            $t .= '</tbody></table>';
            $html .= htmlSection('Servicios', $t, 'fa-cog', 'green');
        }

        if (!empty($art)) {
            $t = '<table class="data-table"><thead><tr><th>Artículo</th><th>Detalle</th><th class="text-right">Cant.</th><th class="text-right">Valor Unit.</th><th class="text-right">Subtotal</th></tr></thead><tbody>';
            $totalArt = 0;
            foreach ($art as $it) {
                $sub = (float)($it['valor_unitario'] ?? 0) * (int)($it['cantidad'] ?? 1);
                $totalArt += $sub;
                $t .= '<tr><td>' . f($it['nombre'] ?? '') . '</td><td>' . f($it['detalle'] ?? '') . '</td><td class="text-right">' . ($it['cantidad'] ?? 1) . '</td><td class="text-right">$' . money($it['valor_unitario'] ?? 0) . '</td><td class="text-right" style="font-weight:700">$' . money($sub) . '</td></tr>';
            }
            $t .= '<tr><td colspan="4" style="text-align:right;font-weight:700;border-bottom:2px solid #2563eb">Total Artículos</td><td class="text-right" style="font-weight:800;border-bottom:2px solid #2563eb">$' . money($totalArt) . '</td></tr>';
            $t .= '</tbody></table>';
            $html .= htmlSection('Repuestos / Artículos', $t, 'fa-boxes');
        }

        // Repuestos del Cliente
        $repClienteRaw = $data['repuestos_cliente'] ?? '';
        $repCliente = [];
        if ($repClienteRaw) {
            $parsed = json_decode($repClienteRaw, true);
            if (is_array($parsed)) $repCliente = $parsed;
            else if (trim($repClienteRaw)) $repCliente = [['descripcion' => trim($repClienteRaw), 'cantidad' => 1, 'marca' => '', 'modelo' => '', 'notas' => '']];
        }
        if (!empty($repCliente)) {
            $t = '<table class="data-table"><thead><tr><th>Repuesto</th><th class="text-right">Cant.</th><th>Marca</th><th>Modelo</th><th>Notas</th></tr></thead><tbody>';
            foreach ($repCliente as $rc) {
                $t .= '<tr><td>' . f($rc['descripcion'] ?? '') . '</td><td class="text-right">' . ($rc['cantidad'] ?? 1) . '</td><td>' . f($rc['marca'] ?? '') . '</td><td>' . f($rc['modelo'] ?? '') . '</td><td>' . f($rc['notas'] ?? '') . '</td></tr>';
            }
            $t .= '</tbody></table>';
            $html .= htmlSection('Repuestos del Cliente (para instalar)', $t, 'fa-user-cog', 'orange');
        }

        // Total general
        $totalGeneral = 0;
        foreach ($items as $it) $totalGeneral += (float)($it['valor_unitario'] ?? 0) * (int)($it['cantidad'] ?? 1);
        if ($totalGeneral > 0) {
            $html .= '<div class="totals-box"><div class="totals-inner">';
            $html .= '<div class="total-row grand"><span class="total-label">TOTAL ESTIMADO:</span><span class="total-value">$' . money($totalGeneral) . '</span></div>';
            $html .= '</div></div>';
        }

        // Avances timeline
        if (!empty($avances)) {
            $avHtml = '<table class="data-table"><thead><tr><th>Fecha</th><th>Título</th><th>Avance</th><th class="text-right">Progreso</th><th>Autor</th></tr></thead><tbody>';
            foreach ($avances as $av) {
                $autor = trim(f($av['autor_nombre'] ?? '') . ' ' . f($av['autor_apellido'] ?? ''));
                $avHtml .= '<tr>';
                $avHtml .= '<td>' . f($av['creado'] ?? '') . '</td>';
                $avHtml .= '<td style="font-weight:600">' . f($av['titulo'] ?? 'Avance') . '</td>';
                $avHtml .= '<td>' . f($av['descripcion'] ?? '') . '</td>';
                $avHtml .= '<td class="text-right" style="font-weight:700;color:#2563eb">' . ($av['porcentaje'] ?? 0) . '%</td>';
                $avHtml .= '<td>' . ($autor ?: '—') . '</td>';
                $avHtml .= '</tr>';
            }
            $avHtml .= '</tbody></table>';
            $html .= htmlSection('Avances / Bitácora', $avHtml, 'fa-chart-line', 'green');
        }

        // Documentos técnicos
        if (!empty($documentos)) {
            $docHtml = '<table class="data-table"><thead><tr><th>Título</th><th>Tipo</th><th>Descripción</th></tr></thead><tbody>';
            foreach ($documentos as $doc) {
                $docHtml .= '<tr>';
                $docHtml .= '<td style="font-weight:600">' . f($doc['titulo'] ?? '') . '</td>';
                $docHtml .= '<td>' . f($doc['tipo'] ?? '') . '</td>';
                $docHtml .= '<td>' . f($doc['descripcion'] ?? '') . '</td>';
                $docHtml .= '</tr>';
            }
            $docHtml .= '</tbody></table>';
            $html .= htmlSection('Documentos Técnicos de Apoyo', $docHtml, 'fa-file-alt', 'amber');
        }

        foreach (['insumos_utilizados' => ['Insumos Utilizados', 'fa-pump-soap'],
                   'repuestos_pendientes' => ['Repuestos Pendientes', 'fa-hourglass-half'],
                   'avance_notas' => ['Notas de Avance', 'fa-sticky-note'],
                   'info_tecnica' => ['Información Técnica', 'fa-microchip'],
                   'observaciones' => ['Observaciones', 'fa-comment']] as $key => $meta) {
            if (!empty($data[$key])) {
                $html .= htmlSection($meta[0], '<div class="text-block">' . f($data[$key]) . '</div>', $meta[1]);
            }
        }

        $html .= htmlSection('Autorización', htmlSignature([
            ['label' => 'Autorizado por', 'name' => 'Gerente Taller'],
            ['label' => 'Cliente Conforme', 'name' => $cli ?: '_______________'],
            ['label' => 'Técnico Responsable', 'name' => $emp ?: '_______________'],
        ]), 'fa-signature');

        $html .= htmlFooter('Orden de Trabajo', $data['id']);
        break;

    // ====================================================================
    // VENTA / FACTURA
    // ====================================================================
    case 'venta':
    case 'factura':
        $cli = trim(f($data['cliente_nombre'] ?? '') . ' ' . f($data['cliente_apellido'] ?? ''));
        $total = (float)($data['valor_total'] ?? $data['total'] ?? 0);

        $html .= htmlHeader('Factura de Venta', $data['id']);
        $html .= '<div class="doc-title-bar"><div class="doc-title">Factura de Venta</div><div class="doc-subtitle">Comprobante de venta de bienes y/o servicios</div></div>';

        $html .= htmlSection('Información de la Venta', htmlInfoGrid([
            'N° Factura' => ['value' => $data['id'] ?? 'N/A', 'highlight' => true],
            'Fecha' => $fechaActual,
            'Forma de Pago' => $data['forma_pago'] ?? 'Efectivo',
        ]), 'fa-hashtag');

        $html .= htmlSection('Datos del Cliente', htmlInfoGrid([
            'Cliente' => $cli,
            'RUT' => $data['cliente_rut'] ?? 'N/A',
            'Dirección' => $data['cliente_domicilio'] ?? 'N/A',
            'Teléfono' => $data['cliente_telefono'] ?? 'N/A',
        ]), 'fa-user', 'green');

        if (!empty($data['descripcion'])) {
            $html .= htmlSection('Detalle de la Venta', '<div class="text-block">' . f($data['descripcion']) . '</div>', 'fa-file-alt');
        }

        $html .= '<div class="totals-box"><div class="totals-inner">';
        $html .= '<div class="total-row"><span class="total-label">Subtotal Neto:</span><span class="total-value">$' . money($data['valor'] ?? $data['subtotal'] ?? 0) . '</span></div>';
        $html .= '<div class="total-row deduct"><span class="total-label">IVA 19%:</span><span class="total-value">$' . money($data['impuesto'] ?? 0) . '</span></div>';
        $html .= '<div class="total-row deduct"><span class="total-label">Descuento:</span><span class="total-value">-$' . money($data['descuento'] ?? 0) . '</span></div>';
        $html .= '<div class="total-row grand"><span class="total-label">TOTAL A PAGAR:</span><span class="total-value">$' . money($total) . '</span></div>';
        $html .= '</div></div>';

        $html .= htmlSection('Términos y Condiciones', '<div class="terms-box">• Factura válida con los datos completos de la empresa emisora.<br>• El pago debe efectuarse dentro del plazo convenido.<br>• Los productos se garantizan conforme a especificaciones técnicas.<br>• Cambios y devoluciones sujetos a políticas de la empresa.</div>', 'fa-gavel');

        $html .= htmlSignature([
            ['label' => 'Autorizado por', 'name' => $C['name']],
            ['label' => 'Cliente Conforme', 'name' => $cli ?: '_______________'],
        ]);

        $html .= htmlFooter('Factura', $data['id'] ?? 'N/A');
        break;

    // ====================================================================
    // RECEPCIÓN UNIFICADA
    // ====================================================================
    case 'recepcion_unificada':
        $folio = $data['folio'] ?? 'REC-' . str_pad($data['id'] ?? 0, 5, '0', STR_PAD_LEFT);
        $fecha = $data['fecha'] ?: $fechaActual;
        $hora = $data['hora'] ?: $horaActual;

        $inspExterior = [
            ['Pintura Frontal', $data['insp_pintura_frontal'] ?? null],
            ['Pintura Lat. Izq.', $data['insp_pintura_lateral_izq'] ?? null],
            ['Pintura Lat. Der.', $data['insp_pintura_lateral_der'] ?? null],
            ['Pintura Trasera', $data['insp_pintura_trasera'] ?? null],
            ['Pintura Techo', $data['insp_pintura_techo'] ?? null],
            ['Parabrisas Del.', $data['insp_parabrisas_del'] ?? null],
            ['Parabrisas Tras.', $data['insp_parabrisas_tras'] ?? null],
            ['Espejos', $data['insp_espejos'] ?? null],
            ['Focos Delanteros', $data['insp_focos_del'] ?? null],
            ['Focos Traseros', $data['insp_focos_tras'] ?? null],
            ['Parachoques Del.', $data['insp_parachoque_del'] ?? null],
            ['Parachoques Tras.', $data['insp_parachoque_tras'] ?? null],
            ['Neumáticos Del.', $data['insp_neumaticos_del'] ?? null],
            ['Neumáticos Tras.', $data['insp_neumaticos_tras'] ?? null],
        ];
        $inspInterior = [
            ['Tapiz Piloto', $data['insp_tapiz_piloto'] ?? null],
            ['Tapiz Copiloto', $data['insp_tapiz_copiloto'] ?? null],
            ['Tapiz Trasero', $data['insp_tapiz_trasero'] ?? null],
            ['Alfombras', $data['insp_alfombras'] ?? null],
            ['Tablero', $data['insp_tablero'] ?? null],
            ['Cinturones', $data['insp_cinturones'] ?? null],
        ];
        $inspMotor = [
            ['Motor Enciende', $data['insp_motor_enciende'] ?? null],
            ['Nivel Aceite', $data['insp_nivel_aceite'] ?? null],
            ['Nivel Refrigerante', $data['insp_nivel_refrigerante'] ?? null],
            ['Batería', $data['insp_bateria'] ?? null],
            ['Correas', $data['insp_correas'] ?? null],
            ['Rueda Repuesto', $data['insp_rueda_repuesto'] ?? null],
            ['Gata / Llaves', $data['insp_gata'] ?? null],
            ['Chaleco', $data['insp_chaleco'] ?? null],
            ['Triángulo', $data['insp_triangulo'] ?? null],
            ['Botiquín', $data['insp_botiquin'] ?? null],
            ['Extintor', $data['insp_extintor'] ?? null],
        ];

        $inspTable = function($rows) {
            $html = '<table class="insp-table">';
            foreach ($rows as $r) {
                $html .= '<tr><td>' . f($r[0]) . '</td><td>' . inspIcon($r[1]) . '</td></tr>';
            }
            $html .= '</table>';
            return $html;
        };

        // Photos — only show section if at least one photo exists
        $photoKeys = [
            'foto_superior' => 'Superior', 'foto_frontal' => 'Frontal', 'foto_interior' => 'Interior',
            'foto_lateral_izq' => 'Lateral Izq.', 'foto_motor' => 'Motor', 'foto_lateral_der' => 'Lateral Der.',
            'foto_trasera' => 'Trasera',
        ];
        $photoHtml = '';
        foreach ($photoKeys as $key => $label) {
            if (!empty($data[$key])) {
                $b64 = imgToBase64($data[$key]);
                if ($b64) {
                    $photoHtml .= photoCell($label, $b64);
                }
            }
        }

        $buildCopy = function($copyLabel) use ($data, $folio, $fecha, $hora, $inspExterior, $inspInterior, $inspMotor, $inspTable, $photoHtml) {
            $h = '<div class="copy-badge">' . f($copyLabel) . '</div>';
            $h .= htmlHeader('Recepción Vehicular', $folio, $folio);

            $h .= '<div class="doc-title-bar"><div class="doc-title">Recepción Vehicular</div><div class="doc-subtitle">Acta de ingreso y evaluación del vehículo</div></div>';

            $h .= htmlSection('Datos del Registro', htmlInfoGrid([
                'N° Recepción' => ['value' => $data['id'], 'highlight' => true],
                'Fecha' => $fecha,
                'Hora' => $hora,
                'Estado' => $data['eval_estado_general'] ?? 'Pendiente',
                'Orden Interna' => $data['numero_orden_interna'] ?? '',
                'Llegada' => $data['forma_llegada'] ?? '',
                'Combustible' => $data['nivel_combustible'] ?? '',
            ]), 'fa-hashtag');

            $h .= '<div class="insp-grid">';
            $h .= '<div>' . htmlSection('Cliente', htmlInfoGrid([
                'Nombre' => trim(f($data['cliente_nombre'] ?? '') . ' ' . f($data['cliente_apellido'] ?? '')),
                'RUT' => $data['cliente_rut'] ?? '',
                'Teléfono' => $data['cliente_telefono'] ?? '',
                'Correo' => $data['cliente_correo'] ?? '',
            ], 2), 'fa-user', 'green') . '</div>';
            $h .= '<div>' . htmlSection('Vehículo', htmlInfoGrid([
                'Marca / Modelo' => trim(f($data['vehiculo_marca'] ?? '') . ' ' . f($data['vehiculo_modelo'] ?? '')),
                'Patente' => $data['vehiculo_patente'] ?? '',
                'Año' => $data['vehiculo_anio'] ?? '',
                'Color' => $data['vehiculo_color'] ?? '',
                'Kilometraje' => ($data['vehiculo_kilometraje'] ?? '') . ' km',
                'Combustible' => $data['vehiculo_combustible'] ?? '',
            ], 2), 'fa-car') . '</div>';
            $h .= '</div>';

            // Inspección
            $h .= '<div class="insp-grid">';
            $h .= '<div>' . htmlSection('Inspección Exterior', $inspTable($inspExterior), 'fa-eye') . '</div>';
            $h .= '<div>' . htmlSection('Interior', $inspTable($inspInterior), 'fa-couch', 'green') . '</div>';
            $h .= '</div>';
            $h .= htmlSection('Motor / Seguridad', $inspTable($inspMotor), 'fa-engine', 'amber');

            // Fotos — only if at least one photo exists
            if ($photoHtml) {
                $photoGrid = '<div class="photo-grid">' . $photoHtml . '</div>';
                $h .= htmlSection('Evidencia Fotográfica del Vehículo', $photoGrid, 'fa-camera', 'purple');
            }

            // Observaciones
            $hasObs = !empty($data['insp_ralladuras']) || !empty($data['insp_abollones']) || !empty($data['insp_observaciones_generales']);
            if ($hasObs) {
                $obsHtml = '<div class="text-block">';
                if (!empty($data['insp_ralladuras'])) $obsHtml .= '<strong style="color:#92400e;">Ralladuras:</strong> ' . f($data['insp_ralladuras']) . '<br>';
                if (!empty($data['insp_abollones'])) $obsHtml .= '<strong style="color:#92400e;">Abollones:</strong> ' . f($data['insp_abollones']) . '<br>';
                if (!empty($data['insp_observaciones_generales'])) $obsHtml .= '<strong style="color:#92400e;">Generales:</strong> ' . f($data['insp_observaciones_generales']);
                $obsHtml .= '</div>';
                $h .= htmlSection('Observaciones', $obsHtml, 'fa-sticky-note', 'amber');
            }

            // Evaluación técnica
            $hasEval = !empty($data['eval_motivo_visita']) || !empty($data['eval_analisis_tecnico']);
            if ($hasEval) {
                $evalHtml = '<div class="text-block">';
                if (!empty($data['eval_motivo_visita'])) $evalHtml .= '<strong style="color:#0f766e;">Motivo:</strong> ' . f($data['eval_motivo_visita']) . '<br>';
                if (!empty($data['eval_analisis_tecnico'])) $evalHtml .= '<strong style="color:#0f766e;">Análisis:</strong> ' . f($data['eval_analisis_tecnico']) . '<br>';
                if (!empty($data['eval_condiciones_exteriores'])) $evalHtml .= '<strong style="color:#0f766e;">Cond. Exteriores:</strong> ' . f($data['eval_condiciones_exteriores']) . '<br>';
                if (!empty($data['eval_condiciones_interiores'])) $evalHtml .= '<strong style="color:#0f766e;">Cond. Interiores:</strong> ' . f($data['eval_condiciones_interiores']) . '<br>';
                if (!empty($data['eval_detalles_danos'])) $evalHtml .= '<strong style="color:#0f766e;">Daños:</strong> ' . f($data['eval_detalles_danos']);
                $evalHtml .= '</div>';
                $h .= htmlSection('Evaluación Técnica', $evalHtml, 'fa-stethoscope', 'green');
            }

            // Firmas (solo copia cliente)
            if (str_contains($copyLabel, 'CLIENTE')) {
                $h .= htmlSection('Firmas de Conformidad', htmlSignature([
                    ['label' => 'Técnico Responsable', 'name' => 'FIGUETRONIC'],
                    ['label' => 'Cliente: ' . f($data['cliente_nombre'] ?? '___________'), 'name' => 'Firma de conformidad'],
                ]), 'fa-signature');
            }

            $h .= '<div class="doc-footer">';
            $h .= '<span>' . $GLOBALS['C']['name'] . ' — Folio: ' . f($folio) . '</span>';
            $h .= '<span>' . $fecha . ' ' . $hora . '</span>';
            $h .= '</div>';

            return $h;
        };

        // PAGE 1: COPIA CLIENTE
        $p1 = '<div class="watermark">COPIA CLIENTE</div>';
        $p1 .= $buildCopy('COPIA CLIENTE');

        // PAGE 2: COPIA NEGOCIO
        $p2 = '<div style="page-break-before:always;"></div>';
        $p2 .= '<div class="watermark">COPIA NEGOCIO</div>';
        $p2 .= $buildCopy('COPIA NEGOCIO');

        $html = '<div style="page-break-after:always;">' . $p1 . '</div>' . $p2;
        break;

    // ====================================================================
    // VEHICULO (Ficha Completa)
    // ====================================================================
    case 'vehiculo':
    case 'vehiculos':
        $cli = trim(f($data['cliente_nombre'] ?? '') . ' ' . f($data['cliente_apellido'] ?? ''));
        $marcaModelo = trim(f($data['marca'] ?? '') . ' ' . f($data['modelo'] ?? ''));
        $folio = 'VEH-' . str_pad($data['id'], 4, '0', STR_PAD_LEFT);
        $fecha = date('d/m/Y');
        $hora = date('H:i');

        $html = htmlHeader('Ficha del Vehículo', $folio, $folio);

        $html .= '<div class="doc-title-bar"><div class="doc-title">Ficha del Vehículo</div><div class="doc-subtitle">Información técnica e historial</div></div>';

        $html .= htmlSection('Datos del Vehículo', htmlInfoGrid([
            'Vehículo' => ['value' => $marcaModelo, 'highlight' => true],
            'Patente' => ['value' => $data['patente'] ?? '', 'highlight' => true],
            'Año' => $data['anio'] ?? '',
            'Color' => $data['color'] ?? '',
            'Kilometraje' => ($data['kilometraje'] ?? '') . ' km',
            'Combustible' => $data['combustible'] ?? '',
            'N° Motor' => $data['numero_motor'] ?? '',
            'N° Chasis' => $data['numero_chasis'] ?? '',
            'Cliente' => $cli,
        ]), 'fa-car');

        // Photos
        $photoKeys = [
            'foto_frontal' => 'Frontal', 'foto_lateral_izq' => 'Lateral Izq.', 'foto_superior' => 'Superior',
            'foto_lateral_der' => 'Lateral Der.', 'foto_trasera' => 'Trasera',
        ];
        $photoHtml = '';
        foreach ($photoKeys as $key => $label) {
            if (!empty($data[$key])) {
                $b64 = imgToBase64($data[$key]);
                if ($b64) {
                    $photoHtml .= photoCell($label, $b64);
                }
            }
        }
        if ($photoHtml) {
            $html .= '<div class="section"><div class="section-header"><i class="fas fa-camera"></i> Fotos del Vehículo</div>';
            $html .= '<div class="photo-grid">' . $photoHtml . '</div></div>';
        }

        // Recepciones
        if (!empty($data['recepciones'])) {
            $recHtml = '<table class="table"><thead><tr><th>ID</th><th>Folio</th><th>Fecha</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>';
            foreach ($data['recepciones'] as $r) {
                $recHtml .= '<tr><td>' . $r['id'] . '</td><td>' . f($r['folio'] ?? '') . '</td><td>' . f($r['fecha'] ?? '') . '</td><td>' . inspIcon($r['eval_estado_general'] ?? '') . '</td><td>' . f($r['eval_motivo_visita'] ?? '') . '</td></tr>';
            }
            $recHtml .= '</tbody></table>';
            $html .= htmlSection('Últimas Recepciones', $recHtml, 'fa-clipboard-list');
        }

        // Órdenes de trabajo
        if (!empty($data['ordenes_trabajo'])) {
            $otHtml = '<table class="table"><thead><tr><th>ID</th><th>Estado</th><th>Creado</th></tr></thead><tbody>';
            foreach ($data['ordenes_trabajo'] as $ot) {
                $otHtml .= '<tr><td>' . $ot['id'] . '</td><td>' . inspIcon($ot['estado'] ?? '') . '</td><td>' . f($ot['creado'] ?? '') . '</td></tr>';
            }
            $otHtml .= '</tbody></table>';
            $html .= htmlSection('Órdenes de Trabajo', $otHtml, 'fa-tools');
        }

        $html .= '<div class="doc-footer">';
        $html .= '<span>' . $GLOBALS['C']['name'] . ' — Folio: ' . f($folio) . '</span>';
        $html .= '<span>' . $fecha . ' ' . $hora . '</span>';
        $html .= '</div>';
        break;

    // ── INFORME DE DIAGNÓSTICO ──────────────────────────────────────────────
    case 'diagnostico':
    case 'diagnosticos':
        $cli = trim(f($data['cliente_nombre'] ?? '') . ' ' . f($data['cliente_apellido'] ?? ''));
        $veh = trim(f($data['marca'] ?? '') . ' ' . f($data['modelo'] ?? ''));
        $folio = $data['folio'] ?? ('DIAG-' . str_pad($data['id'], 4, '0', STR_PAD_LEFT));
        $fecha = $data['fecha'] ?? date('d/m/Y');
        $hora = $data['hora'] ?? '';
        $detalles = json_decode($data['diagnostico_detalles'] ?? '[]', true);
        if (!is_array($detalles)) $detalles = [];

        $html = htmlHeader('Informe de Diagnóstico', $folio, $folio);

        $html .= '<div class="doc-title-bar"><div class="doc-title">Informe de Diagnóstico</div>';
        $html .= '<div class="doc-subtitle">Evaluación técnica y diagnóstico vehicular</div></div>';

        // ── Resumen ──
        $sistema = f($data['sistemas_afectados'] ?? 'no especificado');
        $resumen = 'El vehículo ' . f($veh) . ' (' . f($data['patente'] ?? '') . ')';
        if (!empty($data['kilometraje_actual'])) $resumen .= ', con ' . number_format((int)$data['kilometraje_actual'], 0, ',', '.') . ' km';
        $resumen .= ', presenta inconvenientes relacionados con ' . $sistema . '.';
        if (!empty($data['problema_principal'])) {
            $prob = $data['problema_principal'];
            $resumen .= ' El cliente reporta que ' . strtolower(substr($prob, 0, 1)) . substr($prob, 1) . '.';
        }

        $html .= htmlSection('Resumen', '<p style="font-size:0.95rem;line-height:1.7;">' . f($resumen) . '</p>', 'fa-info-circle');

        // ── Datos del diagnóstico ──
        $html .= htmlSection('Datos del Diagnóstico', htmlInfoGrid([
            'Folio' => ['value' => $folio, 'highlight' => true],
            'Fecha' => $fecha,
            'Hora' => $hora,
            'Técnico' => ['value' => f($data['tecnico'] ?? ''), 'highlight' => true],
            'Kilometraje' => !empty($data['kilometraje_actual']) ? number_format((int)$data['kilometraje_actual'], 0, ',', '.') . ' km' : '—',
            'Estado' => strtoupper(f($data['estado'] ?? '')),
        ]), 'fa-clipboard-check');

        // ── Vehículo y Cliente ──
        $html .= htmlSection('Vehículo y Cliente', htmlInfoGrid([
            'Vehículo' => ['value' => f($veh), 'highlight' => true],
            'Patente' => ['value' => f($data['patente'] ?? ''), 'highlight' => true],
            'Año' => $data['anio'] ?? '—',
            'Color' => $data['color'] ?? '—',
            'VIN' => $data['vin'] ?? '—',
            'Cliente' => ['value' => f($cli), 'highlight' => true],
            'RUT' => $data['cliente_rut'] ?? '—',
            'Teléfono' => $data['cliente_telefono'] ?? '—',
        ]), 'fa-car');

        // ── Pruebas de diagnóstico ──
        if ($detalles) {
            $tblHtml = '<table class="table"><thead><tr>';
            $tblHtml .= '<th>#</th><th>Concepto / Sistema</th><th>Prueba</th><th>Detalle</th><th>Resultado</th>';
            $tblHtml .= '</tr></thead><tbody>';
            foreach ($detalles as $i => $d) {
                $tblHtml .= '<tr>';
                $tblHtml .= '<td style="text-align:center;font-weight:700;">' . ($i + 1) . '</td>';
                $tblHtml .= '<td>' . f($d['concepto'] ?? '') . '</td>';
                $tblHtml .= '<td>' . f($d['prueba'] ?? '') . '</td>';
                $tblHtml .= '<td>' . f($d['detalle'] ?? '') . '</td>';
                $tblHtml .= '<td>' . f($d['resultado'] ?? '') . '</td>';
                $tblHtml .= '</tr>';
            }
            $tblHtml .= '</tbody></table>';
            $html .= htmlSection('Pruebas de Diagnóstico', $tblHtml, 'fa-flask');
        }

        // ── Causa Raíz ──
        if (!empty($data['causa_raiz'])) {
            $html .= htmlSection('Causa Raíz / Diagnóstico Final', '<p style="font-size:0.95rem;line-height:1.7;">' . nl2br(f($data['causa_raiz'])) . '</p>', 'fa-search-plus');
        }

        // ── Recomendaciones ──
        if (!empty($data['recomendaciones'])) {
            $html .= htmlSection('Recomendaciones', '<p style="font-size:0.95rem;line-height:1.7;">' . nl2br(f($data['recomendaciones'])) . '</p>', 'fa-clipboard-list');
        }

        // ── Firmas ──
        $html .= htmlSignature([
            ['label' => 'Técnico Responsable', 'name' => f($data['tecnico'] ?? '')],
            ['label' => 'Cliente', 'name' => $cli],
            ['label' => 'Supervisor / Gerente', 'name' => ''],
        ]);

        // ── Footer ──
        $html .= '<div class="doc-footer">';
        $html .= '<span>' . $GLOBALS['C']['name'] . ' — Folio: ' . f($folio) . '</span>';
        $html .= '<span>' . $fecha . ' ' . $hora . '</span>';
        $html .= '</div>';
        break;

    case 'orden_compra':
    case 'ordenes_compra':
        $prov = f($data['proveedor_nombre'] ?? '—');
        $folio = !empty($data['folio']) ? f($data['folio']) : ('OC-' . str_pad($data['id'], 5, '0', STR_PAD_LEFT));
        $fecha = $data['fecha_emision'] ?? date('d/m/Y');
        $fecha_entrega = $data['fecha_entrega_estimada'] ?? null;
        $estado = strtoupper(f($data['estado'] ?? ''));
        $solicitante = trim(($data['solicitante_nombre'] ?? '') . ' ' . ($data['solicitante_apellido'] ?? ''));
        $asignado = trim(($data['asignado_nombre'] ?? '') . ' ' . ($data['asignado_apellido'] ?? ''));
        $formaPago = $data['forma_pago'] ?? '';

        $html = htmlHeader('Orden de Compra', $folio, $folio);

        $html .= '<div class="doc-title-bar"><div class="doc-title">Orden de Compra</div>';
        $html .= '<div class="doc-subtitle">Solicitud formal de adquisición a proveedor</div></div>';

        // ── Datos de la OC ──
        $datosGrid = [
            'N° OC' => ['value' => $folio, 'highlight' => true],
            'Fecha Emisión' => $fecha,
            'Entrega Estimada' => $fecha_entrega ? date('d/m/Y', strtotime($fecha_entrega)) : '—',
            'Estado' => ['value' => str_replace('_', ' ', $estado), 'highlight' => true],
            'Origen' => ucfirst(str_replace('_', ' ', $data['origen_tipo'] ?? 'manual')),
        ];
        if ($solicitante) $datosGrid['Solicitante'] = $solicitante;
        if ($asignado) $datosGrid['Responsable Asignado'] = $asignado;
        if (!empty($data['tarea_id'])) $datosGrid['Tarea Relacionada'] = 'TAR-' . str_pad($data['tarea_id'], 5, '0', STR_PAD_LEFT);
        if ($formaPago) $datosGrid['Forma de Pago'] = ucfirst(str_replace('_', ' ', $formaPago));
        $html .= htmlSection('Datos de la Orden', htmlInfoGrid($datosGrid), 'fa-file-invoice');

        // ── Datos del Proveedor ──
        $html .= htmlSection('Proveedor', htmlInfoGrid([
            'Razón Social' => ['value' => $prov, 'highlight' => true],
            'RUT' => $data['proveedor_rut'] ?? '—',
            'Contacto' => $data['proveedor_contacto'] ?? '—',
            'Teléfono' => $data['proveedor_telefono'] ?? '—',
            'Email' => $data['proveedor_email'] ?? '—',
            'Dirección' => $data['proveedor_direccion'] ?? '—',
            'Giro' => $data['proveedor_giro'] ?? '—',
        ]), 'fa-truck');

        // ── Items / Productos a comprar ──
        $items = $data['items'] ?? [];
        if ($items) {
            $tblHtml = '<table class="data-table"><thead><tr>';
            $tblHtml .= '<th>#</th><th>Tipo</th><th>Producto</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Valor Unit.</th><th style="text-align:right;">Subtotal</th>';
            $tblHtml .= '</tr></thead><tbody>';
            $totalCalc = 0;
            foreach ($items as $i => $it) {
                $cant = (int)($it['cantidad_solicitada'] ?? 0);
                $valor = (float)($it['valor_unitario'] ?? 0);
                $sub = $cant * $valor;
                $totalCalc += $sub;
                $tipoLabel = ($it['producto_tipo'] ?? 'articulo') === 'insumo' ? 'Insumo' : (($it['producto_tipo'] ?? '') === 'herramienta' ? 'Herramienta' : (($it['producto_tipo'] ?? '') === 'otro' ? 'Otro' : 'Artículo'));
                $tblHtml .= '<tr>';
                $tblHtml .= '<td style="text-align:center;">' . ($i + 1) . '</td>';
                $tblHtml .= '<td><small>' . $tipoLabel . '</small></td>';
                $tblHtml .= '<td>' . f($it['nombre'] ?? '—');
                if (!empty($it['descripcion'])) $tblHtml .= '<br><small style="color:#6b7280;">' . f($it['descripcion']) . '</small>';
                $tblHtml .= '</td>';
                $tblHtml .= '<td style="text-align:center;">' . $cant . '</td>';
                $tblHtml .= '<td style="text-align:right;">$' . number_format($valor, 0, ',', '.') . '</td>';
                $tblHtml .= '<td style="text-align:right;">$' . number_format($sub, 0, ',', '.') . '</td>';
                $tblHtml .= '</tr>';
            }
            $tblHtml .= '</tbody></table>';
            $html .= htmlSection('Productos a Comprar / Cotizar', $tblHtml, 'fa-boxes');

            // ── Totales ──
            $subtotal = $data['subtotal'] ?? $totalCalc;
            $impuesto = $data['impuesto'] ?? 0;
            $descuento = $data['descuento'] ?? 0;
            $total = $data['total'] ?? ($subtotal + $impuesto - $descuento);

            $totalesHtml = '<div class="totals-box"><div class="totals-inner">';
            $totalesHtml .= '<div class="total-row"><span class="total-label">Subtotal:</span><span class="total-value">$' . number_format((float)$subtotal, 0, ',', '.') . '</span></div>';
            if ($descuento > 0) {
                $totalesHtml .= '<div class="total-row deduct"><span class="total-label">Descuento:</span><span class="total-value">-$' . number_format((float)$descuento, 0, ',', '.') . '</span></div>';
            }
            if ($impuesto > 0) {
                $totalesHtml .= '<div class="total-row"><span class="total-label">Impuesto:</span><span class="total-value">$' . number_format((float)$impuesto, 0, ',', '.') . '</span></div>';
            }
            $totalesHtml .= '<div class="total-row grand"><span class="total-label">TOTAL:</span><span class="total-value">$' . number_format((float)$total, 0, ',', '.') . '</span></div>';
            $totalesHtml .= '</div></div>';

            $html .= htmlSection('Resumen de Montos', $totalesHtml, 'fa-calculator');
        }

        // ── Cotización / Análisis ──
        if (!empty($data['cotizacion'])) {
            $html .= htmlSection('Análisis de Cotización', '<p style="font-size:0.95rem;line-height:1.7;">' . nl2br(f($data['cotizacion'])) . '</p>', 'fa-calculator');
        }

        // ── Observaciones ──
        if (!empty($data['observaciones'])) {
            $html .= htmlSection('Observaciones', '<p style="font-size:0.95rem;line-height:1.7;">' . nl2br(f($data['observaciones'])) . '</p>', 'fa-sticky-note');
        }

        // ── Notas para Logística ──
        $coordinacion = '';
        if ($formaPago) $coordinacion .= '<li><strong>Forma de pago:</strong> ' . ucfirst(str_replace('_', ' ', $formaPago));
        if (!empty($data['cuenta_bancaria_id'])) $coordinacion .= ' (cuenta #' . (int)$data['cuenta_bancaria_id'] . ')';
        if ($coordinacion) $coordinacion .= '.</li>';
        if ($asignado) $coordinacion .= '<li><strong>Responsable asignado:</strong> ' . f($asignado) . (isset($data['tarea_id']) ? ' (Tarea TAR-' . str_pad($data['tarea_id'], 5, '0', STR_PAD_LEFT) . ').' : '.') . '</li>';
        $html .= htmlSection('Instrucciones para el Dpto. de Logística', '
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:0.75rem;border-radius:6px;margin-bottom:0.5rem;">
                <strong>📋 Tarea:</strong> Gestionar la búsqueda y cotización de los productos listados con el proveedor <strong>' . $prov . '</strong>.
            </div>
            <ul style="line-height:1.8;">
                <li>Contactar al proveedor para confirmar disponibilidad y precios.</li>
                <li>Solicitar cotización formal y comparar con otras opciones del mercado.</li>
                ' . $coordinacion . '
                <li>Verificar stock disponible y tiempo de entrega.</li>
                <li>Coordinar logística de despacho con el proveedor seleccionado.</li>
                <li>Actualizar el estado de esta orden en el sistema.</li>
            </ul>
        ', 'fa-truck-fast');

        // ── Firmas ──
        $html .= htmlSignature([
            ['label' => 'Solicitante / Taller', 'name' => $solicitante],
            ['label' => 'Aprobado por Gerencia', 'name' => ''],
            ['label' => 'Recibido por Logística', 'name' => $asignado],
        ]);

        // ── Footer ──
        $html .= '<div class="doc-footer">';
        $html .= '<span>' . $GLOBALS['C']['name'] . ' — ' . $folio . '</span>';
        $html .= '<span>Generado: ' . date('d/m/Y H:i') . '</span>';
        $html .= '</div>';
        break;
}

// ============================================================================
// OUTPUT — HTML with print trigger
// ============================================================================
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= f($type) ?> <?= f($id) ?> — <?= f($C['name']) ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <?= $CSS ?>
</head>
<body>
    <?= $html ?>

    <script>
    // Auto-print after fonts load
    document.fonts.ready.then(() => {
        setTimeout(() => {
            window.print();
        }, 600);
    });
    </script>
</body>
</html>
