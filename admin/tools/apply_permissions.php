<?php
// apply_permissions.php — Script helper para agregar permisos a módulos
// Ejecutar desde línea de comandos o acceder vía navegador (requiere auth admin)
//
// Uso CLI:
//   php apply_permissions.php <modulo> "<Categoria>" [acciones]
//
// Ejemplo:
//   php apply_permissions.php portal_control "Comunicación" "ver,config,responder,avances,eliminar"
//   php apply_permissions.php repuestos "Inventario" "ver,crear,editar,eliminar"

require_once __DIR__ . '/includes/conexion.php';
requireAuth();

// Verificar que sea nivel 1 (Admin)
$currentUser = currentUser();
if (!$currentUser || $currentUser['nivel'] > 1) {
    jsonResponse('error', 'Solo administradores pueden ejecutar este script', null, 403);
}

$modulo = $_REQUEST['modulo'] ?? $argv[1] ?? null;
$categoria = $_REQUEST['categoria'] ?? $argv[2] ?? null;
$acciones = $_REQUEST['acciones'] ?? $argv[3] ?? 'ver,crear,editar,eliminar';

if (!$modulo || !$categoria) {
    jsonResponse('error', 'Uso: ?modulo=<nombre>&categoria=<Categoría>&acciones=ver,crear,editar,eliminar', null, 422);
}

$accionesArr = array_map('trim', explode(',', $acciones));
$resultados = ['creados' => 0, 'asignados' => 0, 'permisos' => []];

try {
    $conn->beginTransaction();

    // 1. Crear permisos
    foreach ($accionesArr as $accion) {
        $stmt = $conn->prepare("
            INSERT IGNORE INTO permisos (modulo, accion, descripcion, categoria)
            VALUES (?, ?, ?, ?)
        ");
        $descripcion = ucfirst($accion) . ' ' . ucfirst(str_replace('_', ' ', $modulo));
        $stmt->execute([$modulo, $accion, $descripcion, $categoria]);
        if ($stmt->rowCount() > 0) {
            $resultados['creados']++;
            $resultados['permisos'][] = "$modulo:$accion";
        }
    }

    // 2. Asignar a roles según nivel
    $asignaciones = [
        1 => $accionesArr,                                    // Admin: todos
        2 => array_diff($accionesArr, ['eliminar']),          // Gerente: todos excepto eliminar
        3 => array_intersect($accionesArr, ['ver', 'crear', 'editar']),  // Recepcionista
        4 => array_intersect($accionesArr, ['ver']),           // Técnico: solo ver
        5 => array_intersect($accionesArr, ['ver', 'crear']), // Vendedor
        6 => array_intersect($accionesArr, ['ver']),           // Solo Lectura
    ];

    foreach ($asignaciones as $nivel => $accsNivel) {
        if (empty($accsNivel)) continue;
        $placeholders = implode(',', array_fill(0, count($accsNivel), '?'));
        $stmt = $conn->prepare("
            INSERT IGNORE INTO role_permisos (rol_id, permiso_id, activo)
            SELECT r.id, p.id, 1
            FROM roles r, permisos p
            WHERE p.modulo = ? AND p.accion IN ($placeholders) AND r.nivel = ?
        ");
        $params = array_merge([$modulo], $accsNivel, [$nivel]);
        $stmt->execute($params);
        $resultados['asignados'] += $stmt->rowCount();
    }

    $conn->commit();

    jsonResponse('success', "Permisos de '$modulo' aplicados correctamente", $resultados);

} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    jsonResponse('error', $e->getMessage(), null, 500);
}