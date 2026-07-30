# Changelog — Figuetronic ERP

Todas las versiones notables de este proyecto están documentadas en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-1.0.0/), y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [2.0.0-fase0] — 2026-07-25

### Corregido (bugs críticos)
- **POS: error SQL `stock_actual` no existe** — `pos_api.php` corregido a columna real `stock`
- **Dead UI: `btnHabilitarDiagnostico`** — Eliminado de HTML + JS (siempre oculto)
- **`saldo` denormalizado: SQL injection risk** — `registrarMovimientoCaja()` ahora usa prepared statement; nuevo helper `getSaldoCuenta()` calcula desde `movimientos_caja`

### Refactorizado
- **Columnas muertas en `presupuesto`** — `detalle_trabajos`, `detalle_articulos`, `detalle_servicios`, `servicios_json`, `articulos_json` marcadas LEGACY; `presupuestos_api.php` ya no escribe a ellas; `portal_api.php` refactorizado para preferir `items_json` como fuente única
- **Campos CRM eliminados de recepción** — `cliente_banco`, `cliente_cuentabancaria`, `cliente_facebook`, `cliente_instagram`, `cliente_detalles_personales` removidos del wizard y del API
- **Normalización checklist de inspección** — Nueva tabla `recepcion_inspeccion_items` creada con FK a recepción, dual-write en `recepcion_unificada_api.php`; permite agregar ítems sin ALTER TABLE

### Schema
- TABLA NUEVA: `recepcion_inspeccion_items (id, recepcion_id, campo, valor, seccion, orden)`
- MIGRACIONES CREADAS (DROP, ejecución manual futura):
  - `2026_07_25_fase0c_drop_presupuesto_legacy.sql`
  - `2026_07_25_fase0f_drop_recepcion_crm.sql`
  - `2026_07_25_fase0p_drop_saldo_columna.sql`
- COLUMNA NUEVA ya en producción: `recepcion_inspeccion_items` (migración `2026_07_25_fase0g_crear_inspeccion_normalizada.sql` ejecutada)

---

## [2.0.0-iter7] — 2026-07-25

### Corregido
- **`tipo='repuesto'` inválido en ENUM** — `agregarRepuestoItem()` ahora escribe `tipo='articulo'` + `seccion='repuesto_taller'`; JS alineado para filtrar por `tipo='articulo'` con `seccion.startsWith('repuesto')`

### Eliminado
- **Lecturas muertas de `diagnostico_repuestos` y `diagnostico_servicios`** en `presupuestos_api.php`:
  - `ot_data_for_presupuesto` (L48-203): eliminados 4 queries + fuzzy matcher — siempre lee `orden_trabajo_items`
  - `convertir_ot_a_presupuesto` (L406-515): eliminados 2 queries — siempre lee `orden_trabajo_items`
- **Dead actions** de `ordenes_trabajo_api.php`: `agregar_item_desde_diagnostico`, `agregar_items_desde_diagnostico` eliminadas de `$writeActions`
- **DELETE cascade** en `ordenes_trabajo_api.php`: eliminados `DELETE FROM diagnostico_repuestos` y `DELETE FROM diagnostico_servicios`
- **2 tablas marcadas LEGACY** en `schema_master.sql`: `diagnostico_repuestos`, `diagnostico_servicios`

### Migración
- `2026_07_25_consolidar_items_diagnostico.sql` — Fix datos huérfanos `tipo='repuesto'` → `tipo='articulo'` (0 filas afectadas en producción)

---

## [2.0.0-iter6] — 2026-07-25

### Corregido
- **Doble creación de OT** — Eliminado auto-INSERT en `recepcion_unificada_api.php` que creaba OT automáticamente + confirmación JS que creaba una segunda OT
- **Pago de presupuestos incompleto** — `presupuestos_api.registrar_pago` ahora registra en `movimientos_caja` y deduce stock al pagar completamente
- **`registrarPago()` faltante en ventas.js** — Función implementada (antes solo existía en `compras.js`, causaba error en ventas.html)
- **`completado` vs `estado_item` desincronizados** — `toggle_item_completado` ahora actualiza ambos campos simultáneamente
- **`validateForm()` definida 2 veces** — Consolidada en una sola definición que soporta: required, minLength, maxLength, pattern, custom, type (email, rut)

### Eliminado
- **Dead code en common.js** (~400 líneas):
  - `registerModule()` — nunca llamado
  - `AudioRecorder` class — nunca instanciada
  - `SPA` object — `init()` retornaba inmediatamente (dead)
  - `loadVehiclesForClient()`, `selectVehiculo()` — nunca llamados
  - `getWizardState()`, `setupFormSidebarToggle()`, `showDeniedMessage()` — nunca llamados
  - `requirePerm()` — alias trivial de `hasPerm()`
- **Funciones duplicadas en clientes.js y vehiculos.js** — `esc()`, `formatMoney()`, `capitalize()` eliminados, se usan los globales de `common.js`
- **12 columnas muertas** de `recepcion_unificada` y `orden_trabajo` en schema_master.sql
- **15 índices duplicados** eliminados de `orden_trabajo`, `presupuesto`, `ventas`, `compras`, etc.
- **8 tablas legacy** marcadas con comentarios LEGACY en schema_master.sql

---

## [2.0.0-iter5] — 2026-07-25

### Agregado
- **Tabla `desarme_items_grupo`** — Puente padre↔hijos para agrupación de piezas extraídas
- **Columnas `es_grupo`, `nombre_grupo`** en `desarme_items` — Identificación de grupos
- **API `desarme_piezas_api.php`** — Nuevas acciones:
  - `crear_grupo` — Crea padre + hijos + vincula en puente (transacción)
  - `guardar_grupo` — Actualiza metadatos del grupo
  - `eliminar_grupo` — Elimina padre, libera hijos (CASCADE)
  - `listar_hijos_grupo` — Devuelve piezas hijas de un grupo
  - `listar_fotos` — Galería multimedia por pieza
- **Galería de fotos por pieza** — Usa `archivos_multimedia` (entidad_tipo=`desarme_pieza`), con upload XHR + progress bars
- **Misiones unificadas** — Lista integrada: piezas pendientes + extraídas + grupos en una sola vista
- **Modal de grupo** — Soporta vista/edición de piezas agrupadas con acceso a galería individual

### Cambiado
- `desarme_piezas_api.php` — Refactorizado: fotos vía `uploadMultimedia()` en vez de `move_uploaded_file` directo
- `desarme_automotriz.js` — `renderMissions()` reescrito para incluir piezas extraídas inline (click → modal editar)
- `desarme_automotriz.html` — Eliminado listado duplicado `#partsList` y `btnNuevaPieza`; pieza huérfana se mantiene
- `desarme_items.foto_1/2/3` — Legacy, se usa `archivos_multimedia` para nuevas fotos

### Migración
- `admin/sql/migrations/2026_07_25_desarme_grupo.sql` — Ejecutada en hosting

---

## [2.0.0] — 2026-07-25

### Creado
- **Nueva versión limpia** basada en código operativo, eliminando implementaciones no usadas y código duplicado
- **Schema SQL completo** (95 tablas, 109 FKs, 4 triggers) generado desde dump de producción (`dagober5_dashboard.sql`)
- **Partial loader para sidebar** — `partials/sidebar.html` + `js/sidebar-loader.js`, reemplaza sidebar inline duplicado en 32 páginas HTML
- **AGENTS.md** — Documentación unificada del proyecto (convenciones, estructura, reglas, bugs, flujos)
- **CHANGELOG.md** — Este archivo de historial de cambios
- **Directorio `admin/tools/`** — Scripts helper movidos desde raíz (`apply_permissions.php/.py`, `run_migrations.php`)

### Eliminado
- **3 APIs muertas**: `diagnosticos_api.php` (1104L), `ot_avances_api.php` (86L), `ot_documentos_api.php` (106L) — ninguna era llamada por código JS activo
- **1 página HTML**: `diagnosticos.html` — stub de redirect a `ejecucion_ot.html`
- **1 script de diagnóstico**: `diagnostico.php` — script de verificación de DB (no diagnóstico vehicular)
- **1 include muerto**: `backfill_thumbnails.php` — script de migración de thumbnails
- **Directorio `js/archive/`** (4 archivos): `crud-module.js`, `diagnosticos.js` (2L stub deprecado), `diagnosticos-patch.js`, `presupuestos_cargar.js` — ninguno referenciado por código activo
- **19 scripts utilitarios de raíz**: `run_sql.sh`, `run_sql_py.py`, `upload.sh`, `upload.log`, `migrate_sidebar.sh`, `sidebar_migration_report.txt`, `cctv_cookies.txt`, `favicon.svg`, `exec_folio_migration.php`, `run_migration.php`, `inject_cctv_sidebar.py`, `inject_desarme_bottomnav.sh`, `inject_desarme_sidebar.sh`, `inject_portal_control_sidebar.py`
- **2 assets duplicados**: `assets/logo.jpeg`, `assets/LOGO1.jpeg`
- **48 archivos SQL de migraciones** individuales + `schema_master_v0_start.sql` + `archive/` + `migrations/` — consolidados en schema maestro completo

### Movido
- `apply_permissions.php` → `admin/tools/apply_permissions.php`
- `apply_permissions.py` → `admin/tools/apply_permissions.py`
- `run_migrations.php` → `admin/tools/run_migrations.php`

### Cambiado
- **Refactorización de sidebar**: 32 páginas HTML modificadas — sidebar inline (55L) reemplazado por `<aside id="sidebar-mount"></aside>` + `sidebar-loader.js`
- **Limpieza de CSS**: Eliminadas líneas de `tokens.css` y `app-shell.css` del `<head>` en páginas autenticadas (se cargan dinámicamente)
- **Limpieza de `common.js`**: Eliminados registros de `diagnosticos` en `PAGE_PERMISSIONS`, `MODULE_REGISTRY`, `PAGE_TO_MODULE` y `moduleNames`
- **Limpieza de `dashboard.html`**: Eliminado paso "Diagnóstico" del workflow (integrado en Ejecución OT)
- **Limpieza de `admin.html`**: Eliminado "Diagnósticos" del dropdown de filtro de auditoría
- **`.gitignore`**: Modificado para permitir archivos `*.sql` (schema versionado)

### Mantenido (confirmado activo)
- `includes/imap_client.php` — requerido por `correo_api.php` para IMAP
- `includes/multimedia_compressor.php` — requerido por `helpers.php` y `checklist_api.php`
- Módulo desarme completo (automotriz + maestro + piezas) — en desarrollo con bugs conocidos

### Bugs conocidos (pendientes de corrección)
1. **Desarme — ENUM `motivo_desarme`**: DB define `('siniestrado','baja','multa','donacion','otro')` pero HTML ofrece `('dano_total','robo','abandono','junk','otro')`
2. **Desarme — `add_compat` no existe en PHP**: JS envía `action=add_compat` pero PHP solo maneja `update_compat`/`delete_compat`
3. **Desarme — `pieza_id` vs `maestro_pieza_id`**: JS envía `pieza_id` pero PHP lee `maestro_pieza_id`
4. **Desarme — `codigo` vs `code`**: HTML form envía `name="codigo"` pero PHP lee `$_POST['code']`
5. **Desarme — Stats endpoint inalcanzable**: JS llama por GET pero el handler está en el bloque POST
6. **Ejecución OT — `hora_fin_item`/`duracion_minutos`**: Columnas no en schema_master

---

## [1.x] — Historial anterior (antes de la consolidación)

El proyecto fue desarrollado iterativamente desde 2025-2026 con las siguientes fases:

### Fase 1: Módulos base (2025)
- Clientes, vehículos, empleados, artículos, insumos
- Recepción → OT → Diagnóstico → Presupuesto → Pagos
- Login, RBAC (6 roles), auditoría

### Fase 2: Módulos financieros (2025-2026)
- POS, ventas, compras, cuentas bancarias, pagos a plazos
- Orden de compra, compras rápidas
- Reportes y datos consolidados

### Fase 3: Módulos operativos (2026)
- Agenda taller, solicitud de visita
- Tareas diarias, trabajos y servicios
- Apoyo técnico, checklist
- Inventario taller, zonas taller

### Fase 4: Comunicación y portal (2026)
- Correo (IMAP sync + SMTP)
- Portal del cliente (visibilidad de OT)
- Portal control (gestión de permisos de portal)
- CCTV (dispositivos y cámaras)

### Fase 5: Desarme (2026 — en desarrollo)
- Desarme automotriz (flujo de 5 fases)
- Desarme maestro (catálogo de piezas)
- Desarme piezas (CRUD, publicación a inventario)
- **Estado**: Implementado pero con bugs conocidos que requieren corrección

### Consolidación (2026-07-25)
- Creación de FtronicSystem_v2 como versión limpia
- Eliminación de código muerto, migraciones históricas, scripts obsoletos
- Generación de schema SQL completo desde dump de producción
- Documentación unificada (AGENTS.md + README.md + CHANGELOG.md)
