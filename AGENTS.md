# Figuetronic ERP — AGENTS.md

**Versión:** 2.0.0-fase0 — Julio 2026  
**Última actualización:** 2026-07-25

---

## 1. Información General

| Campo | Valor |
|---|---|
| **Nombre** | Figuetronic ERP — Engineering Laboratory |
| **Tipo** | ERP para taller automotriz |
| **Stack** | PHP 8 + vanilla JS + MySQL 8 (Percona) |
| **Arquitectura** | SPA-like: HTML estáticos + AJAX + PHP REST APIs |
| **Producción** | https://figuetronic.cl/admin/ |
| **BD** | `dagober5_dashboard` — 95 tablas, 109 FKs, 4 triggers |
| **Servidor** | Percona 8.0.46-37, utf8mb4_unicode_ci, InnoDB |

---

## 2. Estructura del Proyecto

```
FtronicSystem/
├── AGENTS.md                    ← Este archivo (documentación principal)
├── README.md                    ← Presentación del proyecto
├── CHANGELOG.md                 ← Historial de cambios
├── .gitignore
├── dagober5_dashboard.sql       ← Dump de referencia (producción)
│
├── admin/
│   ├── .htaccess                ← Router Apache (index.php como entry)
│   ├── index.php                ← Router de sesión (login o dashboard)
│   ├── index.html               ← Redirect fallback → index.php
│   ├── login.html               ← Página de login
│   ├── dashboard.html           ← Dashboard principal
│   ├── admin.html               ← Panel de administración (6 tabs)
│   │
│   ├── api/                     ← 44 endpoints PHP REST
│   │   ├── auth_api.php         ← Login, logout, sesión
│   │   ├── admin_api.php        ← Panel admin (stats, roles, config)
│   │   ├── ejecucion_ot_api.php ← Ejecución de OT (diagnóstico, avances)
│   │   ├── ordenes_trabajo_api.php
│   │   ├── recepcion_unificada_api.php
│   │   ├── presupuestos_api.php
│   │   ├── pagos_api.php
│   │   ├── portal_api.php       ← Portal del cliente
│   │   ├── portal_control_api.php ← Control del portal
│   │   ├── desarme_automotriz_api.php
│   │   ├── desarme_maestro_api.php
│   │   ├── desarme_piezas_api.php
│   │   └── ... (41 archivos total)
│   │
│   ├── js/                      ← 47 módulos JS
│   │   ├── common.js            ← Framework vanillaJS (4049 líneas)
│   │   ├── sidebar-loader.js    ← Cargador dinámico de sidebar
│   │   ├── ejecucion_ot.js      ← Módulo más grande (2163L)
│   │   ├── datos_reportes.js    ← 1325L
│   │   ├── ordenes_trabajo.js   ← 1016L
│   │   └── ... (48 archivos total)
│   │
│   ├── css/                     ← 7 archivos CSS
│   │   ├── tokens.css           ← Variables CSS (colores, espaciado)
│   │   ├── index.css            ← Estilos globales (4648L)
│   │   ├── components.css       ← Componentes reutilizables
│   │   ├── app-shell.css        ← Layout de la app
│   │   ├── ejecucion_ot.css     ← Estilos de ejecución OT
│   │   ├── ficha.css            ← Estilos de ficha
│   │   └── pos.css              ← Estilos del POS
│   │
│   ├── includes/                ← 7 archivos PHP core
│   │   ├── config.php           ← Configuración de entorno
│   │   ├── env.php              ← Resolución de variables de entorno
│   │   ├── conexion.php         ← Conexión PDO + helpers básicos
│   │   ├── auth.php             ← Autenticación y autorización
│   │   ├── helpers.php          ← Funciones centralizadas
│   │   ├── imap_client.php      ← Cliente IMAP para correo
│   │   └── multimedia_compressor.php ← Compresión multimedia
│   │
│   ├── partials/
│   │   └── sidebar.html         ← Sidebar como partial HTML
│   │
│   ├── tools/
│   │   ├── apply_permissions.php
│   │   ├── apply_permissions.py
│   │   └── run_migrations.php
│   │
│   ├── sql/
│   │   └── schema_master.sql    ← Schema completo (95 tablas, 2850L)
│   │
│   ├── vendor/tcpdf/            ← Generación PDFs (vendoreado)
│   ├── uploads/                 ← Archivos subidos (gitignored)
│   └── [38 HTML pages]          ← Páginas de módulos
│
└── public_html/
    ├── index.html               ← Landing page corporativa
    └── assets/
        ├── css/corporate.css
        ├── js/corporate.js
        └── img/ (16 imágenes)
```

---

## 3. Convenciones de Código

### 3.1 APIs PHP

```php
<?php
require_once '../includes/conexion.php'; // Carga config → env → PDO → auth → helpers
requireAuth(); // Verifica sesión activa

$action = $_REQUEST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// GET = lectura
if ($method === 'GET') {
    if ($action === 'listar') {
        // Paginación: retorna {data: {items, total, page, per_page, total_pages}}
        $page = (int)($_GET['page'] ?? 1);
        $perPage = (int)($_GET['per_page'] ?? 20);
        // ...
        jsonResponse('success', 'OK', $data);
    }
}

// POST = escritura
if ($method === 'POST') {
    requirePerm('modulo:editar'); // Verificar permiso
    requireFields(['campo1', 'campo2']); // Validar entrada
    $campo1 = sanitizeString($_POST['campo1']); // Limpiar
    
    try {
        $conn->beginTransaction();
        // ... queries ...
        historialInsert('modulo', $id, 'crear', $datos); // Auditoría
        $conn->commit();
        jsonResponse('success', 'Guardado', $result);
    } catch (Exception $e) {
        $conn->rollBack();
        jsonResponse('error', 'Error: ' . $e->getMessage(), null, 500);
    }
}
```

**Reglas API:**
- SIEMPRE usar `jsonResponse()` — NUNCA `echo json_encode()` directo
- SIEMPRE usar `requireAuth()` al inicio (excepto auth_api login, portal_api)
- SIEMPRE usar `requireFields()` para validación
- SIEMPRE usar `sanitizeString()` para limpieza
- SIEMPRE usar `historialInsert()` para auditoría
- SIEMPRE usar transacciones para operaciones multi-tabla
- `$conn` y `$pdo` son el mismo objeto PDO (alias)

### 3.2 JavaScript

```javascript
const API_ROOT = '/admin/api/';
const API = API_ROOT + 'mi_modulo_api.php';

// Helper de ID
const el = id => document.getElementById(id); // No redefinir

// POST con FormData
async function guardar() {
    const fd = new FormData();
    fd.append('campo', value);
    const r = await apiFetch(`${API}?action=guardar`, fd);
    if (r.status === 'success') showSuccess('Guardado');
}

// GET directo
async function cargar() {
    const r = await fetch(`${API}?action=listar&page=1`);
    const data = await r.json();
}

// Utilidades globales (de common.js)
escapeHtml(text)           // Protección XSS — SIEMPRE usar
formatMoney(amount)        // Peso chileno: $1.234.567
showToast(msg, type)       // Notificaciones
showSuccess(msg) / showError(msg) / showInfo(msg)
setButtonLoading(btn, bool) // Estados de botón
DraftManager               // Auto-guardado en localStorage
setupReactiveRefresh(fn)   // Recarga al volver a pestaña
loadDynamicOptions(id, cat) // Poblar selects desde config_sistema
loadLinkedSelect(id, tabla) // Poblar selects desde tablas
```

**Reglas JS:**
- SIEMPRE usar `apiFetch()` para POST — NUNCA para GET
- SIEMPRE usar `fetch()` directo para GET (Mod_Security bloquea POST en GET)
- SIEMPRE usar `escapeHtml()` en contenido dinámico
- NUNCA usar `escHtml()` — la función se llama `escapeHtml()`
- NUNCA redefinir `const el` localmente

### 3.3 CSS

- `tokens.css` — Variables CSS (colores, espaciado, tipografía)
- `index.css` — Estilos globales y utilidades
- `components.css` — Componentes reutilizables (botones, forms, cards)
- `app-shell.css` — Layout de la aplicación (sidebar, header, main)
- Módulos específicos: `ejecucion_ot.css`, `ficha.css`, `pos.css`

### 3.4 Base de Datos

**Schema:** `admin/sql/schema_master.sql` (95 tablas, idempotente)

**Stored Procedures de idempotencia:**
```sql
AddColumnIFNotExists(tableName, columnName, columnDefinition)
AddIndexIFNotExists(tableName, indexName, columnList)
```

**Triggers auto-folios:**
- `trg_desarme_folio` → `DES-YYYY-NNNNN`
- `generar_folio_recepcion` → `REC-XXXX`
- `trg_solicitud_folio` → `SOL-XXXX`
- `trg_visita_folio` → `VIS-XXXX`

**Convenciones SQL:**
- SIEMPRE usar `CREATE TABLE IF NOT EXISTS`
- SIEMPRE usar `SET FOREIGN_KEY_CHECKS = 0` al inicio
- SIEMPRE usar `SET FOREIGN_KEY_CHECKS = 1` al final
- NUNCA reusar un placeholder `:id` en un mismo `prepare()` — usar `:id1`, `:id2`
  (PDO con `ATTR_EMULATE_PREPARES=false` falla con HY093)

---

## 4. Sistema de Autenticación y Permisos (RBAC)

### Roles por defecto
| Nivel | Nombre | Permisos |
|---|---|---|
| 1 | Administrador | Todos (159) |
| 2 | Gerente | Todos excepto config/permisos admin |
| 3 | Recepcionista | 26 permisos |
| 4 | Técnico | 24 permisos |
| 5 | Vendedor | 25 permisos |
| 6 | Solo Lectura | 54 permisos (lectura) |

### Permisos admin
- `admin:panel` — Acceder al panel de administración
- `admin:roles` — Gestionar roles del sistema
- `admin:permisos` — Gestionar permisos de usuarios
- `admin:config` — Modificar configuración del sistema
- `admin:auditoria` — Ver registro de actividad
- `admin:sesiones` — Gestionar sesiones activas

### UIController (frontend)
Módulo en `common.js` que controla visibilidad/habilitación de elementos DOM:
- `data-perm="modulo:accion"` — Oculta si no tiene permiso
- `data-perm-disable="modulo:acc"` — Deshabilita si no tiene permiso
- `data-perm-page="admin.html"` — Oculta item del sidebar si no puede acceder
- `data-perm-tab="tabId"` — Oculta tab si no tiene permiso
- `data-perm-field="campo"` — Oculta campo del form si no tiene permiso
- Niveles 1-2 (Admin/Gerente) ven todo sin restricción

### Generar permisos para módulo nuevo
```bash
python3 admin/tools/apply_permissions.py nombre_modulo "Categoría" "ver,crear,editar,eliminar"
php admin/tools/apply_permissions.php?modulo=nombre_modulo&categoria=Categoría&acciones=ver,crear,editar,eliminar
```

---

## 5. Flujo de Negocio

```
Recepción → Orden de Trabajo → Diagnóstico → Presupuesto → Pagos/Ventas → Cuentas Bancarias
```

### Relaciones clave
- `recepcion_unificada` → `clientes` + `vehiculos` (auto-crea OT)
- `orden_trabajo` → recepcion, vehiculos, clientes, empleados, orden_compra
- `ejecucion_ot_api` maneja diagnóstico + avances (NO diagnosticos_api)
- `presupuesto` se auto-genera **únicamente** desde `orden_trabajo_items` (fuente única de verdad)
- Eliminar OT en cascada: diagnosticos → pruebas → fotos → orden_trabajo_items
- `agenda_slots` ↔ `visitas_taller` ↔ `solicitudes_visita` (FKs circulares diferidos)

### Módulo Desarme (en desarrollo)
- `desarme_automotriz` — Flujo operativo: Recepción → Descontaminación → Desarme → Preparación → Publicación
- `desarme_maestro` — Catálogo maestro de piezas con compatibilidad vehicular
- `desarme_piezas_api` — CRUD de piezas extraídas, publicación a inventario
- **Estado:** Implementado con grupo de piezas y galería multimedia

---

## 6. Tablas de la Base de Datos (95 tablas)

### Activas (referenciadas en código)
| Tabla | Módulo |
|---|---|
| `clientes` | Clientes |
| `vehiculos` | Vehículos |
| `empleados` | Empleados |
| `usuarios` | Usuarios |
| `roles`, `role_permisos`, `permisos`, `usuario_roles`, `usuario_permisos` | RBAC |
| `recepcion_unificada` | Recepción |
| `orden_trabajo`, `orden_trabajo_items` | Órdenes de Trabajo |
| `diagnosticos`, `diagnostico_pruebas`, `diagnostico_pruebas_fotos`, `diagnostico_repuestos`, `diagnostico_servicios` | Ejecución OT |
| `presupuesto`, `presupuesto_items` | Presupuestos |
| `pagos`, `pagos_plazos` | Pagos |
| `ventas`, `movimientos_caja` | Ventas/Finanzas |
| `cuentas_bancarias` | Cuentas |
| `compras`, `compras_rapidas`, `orden_compra`, `orden_compra_items` | Compras |
| `articulos`, `articulo_proveedor` | Artículos |
| `insumos` | Insumos |
| `inventario_taller`, `movimientos_stock` | Inventario |
| `zonas_taller` | Zonas |
| `trabajos_servicios`, `trabajos_servicios_checklist_*` | Trabajos |
| `tareas_diarias`, `tarea_avances`, `tarea_comentarios` | Tareas |
| `checklist_plantilla`, `checklist_plantilla_pasos`, `checklist_ejecucion`, `checklist_ejecucion_pasos`, `checklist_paso_*` | Checklists |
| `agenda_bloques`, `agenda_slots` | Agenda |
| `solicitudes_visita`, `visitas_taller` | Solicitudes |
| `apoyo_tecnico` | Apoyo Técnico |
| `proveedores`, `proveedor_articulos` | Proveedores |
| `correo_cuentas`, `correo_mensajes`, `correo_adjuntos`, `correo_enviados` | Correo |
| `portal_config`, `portal_ot_permisos` | Portal |
| `cctv_dispositivos`, `cctv_camaras` | CCTV |
| `config_sistema` | Configuración |
| `historial_cambios`, `user_activity` | Auditoría |
| `desarme_vehiculo`, `desarme_items`, `desarme_items_grupo`, `desarme_maestro_piezas`, `desarme_compatibilidad`, `desarme_descontaminacion`, `desarme_preparacion`, `desarme_historial`, `desarme_kits`, `desarme_kit_items` | Desarme |
| `ot_avances`, `ot_comentarios`, `ot_documentos`, `ot_etapas`, `ot_repuestos_solicitados`, `ot_interacciones_cliente` | OT auxiliares |
| `opciones_listas` | Opciones dinámicas |
| `archivos_multimedia` | Multimedia |
| `solicitudes_compra`, `solicitudes_registro` | Solicitudes aux |

### Tablas huérfanas (0 datos, no referenciadas)
| Tabla | Razón |
|---|---|
| `checkin` | Reemplazada por `recepcion_unificada` |
| `recepcion_ingreso` | Reemplazada por `recepcion_unificada` |
| `inspeccion_visual` | Referenciada por `opciones_api.php` — NO eliminar |
| `user_sesiones` | Tabla de sesiones no utilizada |

---

## 7. Agentes Disponibles

| Agente | Propósito |
|---|---|
| `ft-module-generator` | Genera módulo completo: HTML + JS + PHP API + SQL migration |
| `ft-convention-validator` | Revisa código contra convenciones del proyecto |
| `ft-api-tester` | Prueba endpoints PHP REST contra BD real |
| `ft-bug-diagnostics` | Diagnostica y corrige bugs conocidos |
| `ft-deploy` | Ejecuta deploys vía FTP a producción |

**Scripts helper en `admin/tools/`:**
- `apply_permissions.php/.py` — Genera permisos y roles automáticamente
- `run_migrations.php` — Ejecuta migraciones SQL

---

## 8. Reglas Estrictas (QUÉ NO hacer)

- No usar `echo json_encode()` directo — siempre `jsonResponse()`
- No agregar frameworks JS ni dependencias npm — vanilla JS por diseño
- No usar composer — TCPDF vendoreado en `vendor/tcpdf/`
- No saltar `escapeHtml()` en contenido dinámico (XSS)
- No usar `escHtml()` — la función se llama `escapeHtml()`
- No crear migraciones sin `IF NOT EXISTS` / guardias idempotentes
- No modificar contenido de `uploads/` — datos de usuario en producción
- No commitear `includes/env.local.php`, `upload.log` ni `*.heapsnapshot`
- No redefinir `const el` localmente — ya existe en `common.js`
- No usar `apiFetch()` para endpoints GET — usar `fetch()` directo
- No crear `index.html` estático sin passthrough a `index.php`
- No reusar un placeholder con nombre (`:id`) varias veces en un mismo `prepare()`
- No crear módulos sin permisos — toda migración SQL debe incluir permisos + roles
- **`orden_trabajo_items` NO tiene columna `estado`** — se llama `estado_item`
- No redefinir `esc()`, `formatMoney()`, `capitalize()` — ya existen globales en `common.js`

---

## 9. Bugs Conocidos

### Desarme (resueltos en v2.0.0-iter5)
1. ~~**ENUM `motivo_desarme` no coincide**~~ — Resuelto: ENUM extendido en migración 2026_07_25_desarme_fixes
2. ~~**`add_compat` no existe en PHP**~~ — Resuelto: alias agregado en desarme_maestro_api.php
3. ~~**`pieza_id` vs `maestro_pieza_id`**~~ — Resuelto: JS usa `maestro_pieza_id`
4. ~~**`codigo` vs `code`**~~ — Resuelto: JS usa `rec.code`
5. ~~**Stats endpoint inalcanzable**~~ — Resuelto: movido a bloque GET

### Ejecución OT
- `hora_fin_item` / `duracion_minutos` no en schema_master — tracking de tiempo por item falla

### General
- `opciones_api.php:19` — Referencia a tabla huérfana `inspeccion_visual`

### v2.0.0-iter6 — Corregidos
1. ~~**Doble creación de OT**~~ — Resuelto: eliminado auto-INSERT en `recepcion_unificada_api.php`, la OT se crea solo desde el JS con confirmación del usuario
2. ~~**Pago de presupuestos sin movimientos_caja**~~ — Resuelto: `presupuestos_api.registrar_pago` ahora llama a `registrarMovimientoCaja()` y `deducirStockPresupuesto()`
3. ~~**`registrarPago()` faltante en ventas.js**~~ — Resuelto: función implementada, antes solo existía en `compras.js`
4. ~~**`completado` vs `estado_item` desincronizados**~~ — Resuelto: `toggle_item_completado` ahora actualiza ambos campos simultáneamente
5. ~~**`validateForm()` definida 2 veces**~~ — Resuelto: consolidada en una sola función que soporta ambos patrones de llamada
6. ~~**Dead code en common.js**~~ — Resuelto: eliminados `registerModule`, `AudioRecorder`, `SPA` (muerto), `loadVehiclesForClient`, `selectVehiculo`, `getWizardState`, `setupFormSidebarToggle`, `showDeniedMessage` (~400 líneas)
7. ~~**Funciones duplicadas en clientes.js/vehiculos.js**~~ — Resuelto: `esc()`, `formatMoney()`, `capitalize()` eliminados, se usan los globales de `common.js`
8. ~~**Columnas muertas en schema**~~ — Resuelto: eliminadas 12 columnas sin uso de `recepcion_unificada` y `orden_trabajo`
9. ~~**15 índices duplicados**~~ — Resuelto: eliminados de `orden_trabajo`, `presupuesto`, `ventas`, `compras`, etc.
10. ~~**Tablas legacy sin comentar**~~ — Resuelto: 8 tablas huérfanas marcadas con comentarios LEGACY

### v2.0.0-iter7 — Consolidación Items Diagnóstico
11. ~~**`diagnostico_repuestos` y `diagnostico_servicios` sin uso**~~ — Resuelto: eliminadas lecturas muertas de `presupuestos_api.php` (ot_data_for_presupuesto y convertir_ot_a_presupuesto), eliminadas dead actions de `ordenes_trabajo_api.php`, tablas marcadas LEGACY
12. ~~**`tipo='repuesto'` inválido en ENUM**~~ — Resuelto: `agregarRepuestoItem()` ahora escribe `tipo='articulo'` + `seccion='repuesto_taller'`; JS alineado para filtrar por `tipo='articulo'` con `seccion.startsWith('repuesto')`
- `opciones_api.php:19` — Referencia a tabla huérfana `inspeccion_visual`

### v2.0.0-fase0 — Limpieza Arquitectónica (Schema)
13. ~~**POS: `stock_actual` no existe**~~ — Resuelto: `pos_api.php` corregido a `stock` (con una sola fila afectada por venta)
14. ~~**`btnHabilitarDiagnostico` dead UI**~~ — Resuelto: eliminado de HTML + JS en `ordenes_trabajo.html`
15. ~~**Columnas muertas `detalle_*/servicios_json/articulos_json` en presupuesto**~~ — Resuelto: deprecadas (no se escriben), marcadas LEGACY en schema; portal refactorizado para preferir `items_json`
16. ~~**Campos CRM en recepción**~~ — Resuelto: eliminados `cliente_banco`, `cliente_cuentabancaria`, `cliente_facebook`, `cliente_instagram`, `cliente_detalles_personales` del wizard; código no los escribe ni lee
17. ~~**`saldo` denormalizado en cuentas_bancarias**~~ — Resuelto parcial: helper `getSaldoCuenta($db,$cuentaId)` creado (calcula desde `movimientos_caja`); UPDATE en `registrarMovimientoCaja()` ahora usa prepared statement; columna marcada LEGACY
18. ~~**31 columnas `insp_*` rígidas**~~ — Resuelto parcial: tabla normalizada `recepcion_inspeccion_items` creada; dual-write en `recepcion_unificada_api.php`; columnas antiguas marcadas LEGACY

### v2.0.0-iter6 — Corregidos
1. ~~**Doble creación de OT**~~ — Resuelto: eliminado auto-INSERT en `recepcion_unificada_api.php`, la OT se crea solo desde el JS con confirmación del usuario
2. ~~**Pago de presupuestos sin movimientos_caja**~~ — Resuelto: `presupuestos_api.registrar_pago` ahora llama a `registrarMovimientoCaja()` y `deducirStockPresupuesto()`
3. ~~**`registrarPago()` faltante en ventas.js**~~ — Resuelto: función implementada, antes solo existía en `compras.js`
4. ~~**`completado` vs `estado_item` desincronizados**~~ — Resuelto: `toggle_item_completado` ahora actualiza ambos campos simultáneamente
5. ~~**`validateForm()` definida 2 veces**~~ — Resuelto: consolidada en una sola función que soporta ambos patrones de llamada
6. ~~**Dead code en common.js**~~ — Resuelto: eliminados `registerModule`, `AudioRecorder`, `SPA` (muerto), `loadVehiclesForClient`, `selectVehiculo`, `getWizardState`, `setupFormSidebarToggle`, `showDeniedMessage` (~400 líneas)
7. ~~**Funciones duplicadas en clientes.js/vehiculos.js**~~ — Resuelto: `esc()`, `formatMoney()`, `capitalize()` eliminados, se usan los globales de `common.js`
8. ~~**Columnas muertas en schema**~~ — Resuelto: eliminadas 12 columnas sin uso de `recepcion_unificada` y `orden_trabajo`
9. ~~**15 índices duplicados**~~ — Resuelto: eliminados de `orden_trabajo`, `presupuesto`, `ventas`, `compras`, etc.
10. ~~**Tablas legacy sin comentar**~~ — Resuelto: 8 tablas huérfanas marcadas con comentarios LEGACY

---

## 10. Despliegue

```bash
# Sync FTP a producción (menú interactivo)
bash admin/upload.sh

# Subir un archivo directamente
lftp -e "set ssl:verify-certificate no; cd /public_html/admin/js; put /ruta/local/archivo.js; quit" \
    -u sixel4@figuetronic.cl,'Soporte.aa' ftp://figuetronic.cl
```

**Exclusiones de upload:** `uploads/`, `sql/`, `upload.sh`, `upload.log`, `debug/`, `*.heapsnapshot`, `*.log`, `*.pyc`

---

## 11. Changelog Rápido

Ver `CHANGELOG.md` para historial completo.

### v2.0.0-iter5 (2026-07-25)
- Nueva tabla `desarme_items_grupo` (puente padre↔hijos)
- Columnas `es_grupo`, `nombre_grupo` en `desarme_items`
- API `desarme_piezas_api.php`: acciones `crear_grupo`, `guardar_grupo`, `eliminar_grupo`, `listar_hijos_grupo`, `listar_fotos`
- Galería de fotos por pieza vía `archivos_multimedia` (entidad_tipo=`desarme_pieza`)
- Misiones de desarme unificadas: piezas pendientes + extraídas + grupos en una sola lista
- Modal de grupo soporta vista/edición de piezas agrupadas
- Eliminado listado duplicado `#partsList`

### v2.0.0 (2026-07-25)
- Nueva versión limpia basada en código operativo
- Schema SQL completo (95 tablas) generado desde dump de producción
- Sidebar refactorizado a partial loader
- Eliminadas 3 APIs muertas, 19 scripts de migración, 3 includes no usados
- Documentación unificada (AGENTS.md + README.md + CHANGELOG.md)
