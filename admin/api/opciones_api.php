<?php
// opciones_api.php
// API centralizada para obtener datos de tablas vinculadas y opciones dinámicas
require_once '../includes/conexion.php';
requireAuth();

$action = $_GET['action'] ?? '';

// Protección por permiso
$writeActions = ['add_opcion', 'edit_opcion', 'delete_opcion', 'delete_media'];
if (in_array($action, $writeActions)) {
    requirePerm('opciones:editar');
}

switch ($action) {
    case 'linked':
        // Obtener registros de una tabla vinculada para llenar selects
        $tabla = $_GET['tabla'] ?? '';
        $allowed = [
            'clientes' => "SELECT id, CONCAT(nombre,' ',apellido,' (',rut,')') AS display_name FROM clientes ORDER BY nombre",
            'vehiculos' => "SELECT id, CONCAT(marca,' ',modelo,' - ',patente) AS display_name FROM vehiculos ORDER BY marca",
            'empleados' => "SELECT id, CONCAT(nombre,' ',apellido) AS display_name FROM empleados ORDER BY nombre",
            'proveedores' => "SELECT id, nombre AS display_name FROM proveedores ORDER BY nombre",
            'cuentas_bancarias' => "SELECT id, CONCAT(COALESCE(nombre,'') ,' - ', COALESCE(banco,'')) AS display_name FROM cuentas_bancarias ORDER BY nombre",
            'recepcion_unificada' => "SELECT id, CONCAT('#',id,' - ',COALESCE(vehiculo_patente,''),' - ',COALESCE(cliente_nombre,'')) AS display_name FROM recepcion_unificada ORDER BY id DESC",
            'inspeccion_visual' => "SELECT iv.id, CONCAT('#',iv.id,' - ',COALESCE(v.marca,''),' ',COALESCE(v.modelo,'')) AS display_name FROM inspeccion_visual iv LEFT JOIN vehiculos v ON iv.vehiculo_id=v.id ORDER BY iv.id DESC",
            'trabajos_servicios' => "SELECT id, nombre AS display_name FROM trabajos_servicios ORDER BY nombre",
            'articulos' => "SELECT id, nombre AS display_name FROM articulos ORDER BY nombre",
            'insumos' => "SELECT id, nombre AS display_name FROM insumos ORDER BY nombre",
            'compras' => "SELECT id, nombre AS display_name FROM compras ORDER BY id DESC",
            'ventas' => "SELECT id, nombre AS display_name FROM ventas ORDER BY id DESC",
            'orden_compra' => "SELECT oc.id, CONCAT('#',oc.id,' - ',p.nombre) AS display_name FROM orden_compra oc LEFT JOIN proveedores p ON oc.proveedor_id=p.id ORDER BY oc.id DESC",
            'zonas_taller' => "SELECT id, nombre AS display_name FROM zonas_taller ORDER BY nombre"
        ];
        if (!isset($allowed[$tabla])) {
            jsonResponse("error", "Tabla no permitida");
        }
        try {
            $stmt = $conn->query($allowed[$tabla]);
            jsonResponse("success", "OK", $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'opciones':
        // Obtener opciones dinámicas de una categoría
        $categoria = $_GET['categoria'] ?? '';
        if (!$categoria) jsonResponse("error", "Categoría requerida");
        try {
            $stmt = $conn->prepare("SELECT valor FROM opciones_listas WHERE categoria=? ORDER BY valor");
            $stmt->execute([$categoria]);
            $opciones = array_column($stmt->fetchAll(), 'valor');
            jsonResponse("success", "OK", $opciones);
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'add_opcion':
        // Agregar nueva opción dinámica
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse("error", "Método no permitido");
        $categoria = $_POST['categoria'] ?? '';
        $valor = $_POST['valor'] ?? '';
        if (!$categoria || !$valor) jsonResponse("error", "Categoría y valor requeridos");
        try {
            $stmt = $conn->prepare("INSERT IGNORE INTO opciones_listas (categoria, valor) VALUES (?, ?)");
            $stmt->execute([$categoria, $valor]);
            jsonResponse("success", "Opción agregada");
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'edit_opcion':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse("error", "Método no permitido");
        $id = $_POST['id'] ?? null;
        $valor = $_POST['valor'] ?? '';
        if (!$id || !$valor) jsonResponse("error", "ID y valor requeridos");
        try {
            $stmt = $conn->prepare("UPDATE opciones_listas SET valor=? WHERE id=?");
            $stmt->execute([$valor, $id]);
            jsonResponse("success", "Opción actualizada");
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'delete_opcion':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse("error", "Método no permitido");
        $id = $_POST['id'] ?? null;
        if (!$id) jsonResponse("error", "ID requerido");
        try {
            $conn->prepare("DELETE FROM opciones_listas WHERE id=?")->execute([$id]);
            jsonResponse("success", "Opción eliminada");
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'list_opciones':
        $categoria = $_GET['categoria'] ?? '';
        if (!$categoria) jsonResponse("error", "Categoría requerida");
        try {
            $stmt = $conn->prepare("SELECT id, valor FROM opciones_listas WHERE categoria=? ORDER BY valor");
            $stmt->execute([$categoria]);
            jsonResponse("success", "OK", $stmt->fetchAll());
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'delete_media':
        // Eliminar un archivo multimedia individual
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse("error", "Método no permitido");
        $media_id = $_POST['media_id'] ?? null;
        if (!$media_id) jsonResponse("error", "ID requerido");
        try {
            $stmt = $conn->prepare("SELECT ruta_archivo FROM archivos_multimedia WHERE id=?");
            $stmt->execute([$media_id]);
            $archivo = $stmt->fetch();
            if ($archivo && file_exists($archivo['ruta_archivo'])) {
                unlink($archivo['ruta_archivo']);
            }
            $conn->prepare("DELETE FROM archivos_multimedia WHERE id=?")->execute([$media_id]);
            jsonResponse("success", "Archivo eliminado");
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    case 'list_media':
        // Listar multimedia por módulo y (opcionalmente) por ID de vehículo asociado u ot_id
        $modulo = $_GET['module'] ?? '';
        $vehiculoId = $_GET['vehiculo_id'] ?? null;
        if (!$modulo) jsonResponse("error", "Módulo requerido");
        try {
            $results = [];
            if ($modulo === 'apoyo_tecnico' && $vehiculoId) {
                // Archivos subidos desde la ficha del vehículo se guardan con
                // entidad_tipo='apoyo_tecnico' y entidad_id = vehiculo_id.
                // También incluimos archivos de apoyo_tecnico global cuyos registros
                // coincidan con marca/modelo del vehículo.
                $stmtVeh = $conn->prepare("SELECT marca, modelo FROM vehiculos WHERE id = ?");
                $stmtVeh->execute([(int)$vehiculoId]);
                $veh = $stmtVeh->fetch();

                $stmt = $conn->prepare("
                    SELECT * FROM archivos_multimedia
                    WHERE entidad_tipo = ? AND entidad_id = ?
                    ORDER BY creado DESC
                ");
                $stmt->execute([$modulo, (int)$vehiculoId]);
                $results = $stmt->fetchAll();

                if ($veh) {
                    $stmt2 = $conn->prepare("
                        SELECT am.* FROM archivos_multimedia am
                        JOIN apoyo_tecnico at ON am.entidad_id = at.id
                        WHERE am.entidad_tipo = 'apoyo_tecnico'
                          AND at.vehiculo_marca = ? AND at.vehiculo_modelo = ?
                        ORDER BY am.creado DESC
                    ");
                    $stmt2->execute([$veh['marca'], $veh['modelo']]);
                    $existingIds = array_column($results, 'id');
                    foreach ($stmt2->fetchAll() as $row) {
                        if (!in_array($row['id'], $existingIds)) $results[] = $row;
                    }
                }
            } else {
                $stmt = $conn->prepare("SELECT * FROM archivos_multimedia WHERE entidad_tipo = ? ORDER BY creado DESC");
                $stmt->execute([$modulo]);
                $results = $stmt->fetchAll();
            }
            jsonResponse("success", "OK", $results);
        } catch (Exception $e) {
            jsonResponse("error", $e->getMessage());
        }
        break;

    default:
        jsonResponse("error", "Acción no válida");
}
?>
