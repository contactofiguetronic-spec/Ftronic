# Figuetronic ERP (FtronicSystem)

ERP en PHP + vanilla JS para taller automotriz. SPA-like: páginas HTML estáticas llaman a APIs PHP REST vía AJAX. Sin frameworks JS, sin build step, sin bundler. CSS light theme con custom properties.

## Resumen del proyecto

- **Raíz de la app:** `admin/` (todo el código vive aquí)
- **URL producción:** https://figuetronic.cl/admin/
- **BD:** MySQL 8 (Percona) — `dagober5_dashboard`, charset `utf8mb4_unicode_ci` — **95 tablas** (schema completo en `admin/sql/schema_master.sql`)
- **Documentación:** Ver `AGENTS.md` para convenciones, estructura y reglas del proyecto

## Arquitectura

```
admin/
  index.php         Router de entrada (sesión → login o dashboard)
  index.html        Redirect fallback → index.php (bypass proxy cache)
  dashboard.html    Dashboard principal del ERP
  login.html        Página de login
  admin.html        Panel de Administración Avanzada (6 tabs)
  api/              44 Endpoints PHP REST (uno por módulo, *_api.php)
  includes/         config.php, conexion.php, env.php, auth.php, helpers.php,
                    imap_client.php, multimedia_compressor.php
  js/               47 Módulos Vanilla JS + common.js (utilidades globales)
  css/              tokens.css, index.css, components.css, app-shell.css
                    + ejecucion_ot.css, ficha.css, pos.css
  sql/              schema_master.sql (95 tablas, 109 FKs, 4 triggers)
  vendor/tcpdf/     Generación de PDFs (vendoreado, no via composer)
  uploads/          Archivos subidos (datos de usuario — nunca subir a prod)
  partials/         sidebar.html (partial HTML del sidebar)
  tools/            apply_permissions.php/.py, run_migrations.php
```

### Patrón de módulo (estricto)
- **Página HTML** → `admin/<modulo>.html`
- **Módulo JS** → `admin/js/<modulo>.js`
- **API PHP** → `admin/api/<modulo>_api.php`

### Archivos especiales (no siguen el patrón)
- `index.php` → Router de sesión (no tiene .html/.js/.api)
- `admin.html/js/api` → Panel de administración (nombre fijo, no paramétrico)
- `common.js` → Utilidades globales compartidas (NO es un módulo)

## Cómo clonar/reconstruir

1. `git clone <repo>` → `$PROJECT`
2. `cd FtronicSystem/` (es el directorio limpio)
3. Copiar todo `admin/` a `admin/` del repo (sobrescribir si es necesario)
4. Copiar todo `public_html/` a la raíz (sobrescribir si es necesario)

NOTA: No ejecutar ningún `npm install`, `composer install` ni `git submodule`.

## Sistema de Login y Autenticación

### Flujo de acceso
```
https://figuetronic.cl/admin/
  → index.php (verifica sesión via PHP session)
    → Sin sesión: sirve login.html (readfile)
    → Con sesión válida: redirect a dashboard.html
  → login.html (form → auth_api.php?action=login)
  → dashboard.html (SPA con sidebar + contenido dinámico)
```

## Sistema de Permisos (RBAC)

### 6 roles por defecto
| Nivel | Nombre | Permisos |
|-------|--------|----------|
| 1 | Administrador | Todos (159) |
| 2 | Gerente | Todos excepto config/permisos admin |
| 3 | Recepcionista | 26 permisos |
| 4 | Técnico | 24 permisos |
| 5 | Vendedor | 25 permisos |
| 6 | Solo Lectura | 54 permisos (lectura) |

### Generación automática de permisos
```bash
# Python (recomendado)
python3 admin/apply_permissions.py portal_control "Comunicación" "ver,config,responder,avances,eliminar"

# PHP
php admin/apply_permissions.php?modulo=portal_control&categoria=Comunicación&acciones=ver,config,responder,avances,eliminar
```

## Base de datos

- **95 tablas** en producción (schema completo en `admin/sql/schema_master.sql`)
- Migraciones idempotentes: `IF NOT EXISTS`, stored procs `AddColumnIFNotExists()` / `AddIndexIFNotExists()`
- Triggers auto-generan folios: `DES-YYYY-NNNNN`, `REC-XXXX`, `SOL-XXXX`, `VIS-XXXX`
- **PELIGRO:** `config.php` contiene `DB_PASS` hardcodeado como default — nunca subir credenciales reales a este archivo

## Convenciones clave

- `jsonResponse()` — nunca `echo json_encode()` directo
- `requireAuth()` al inicio de toda API protegida
- `escapeHtml()` en todo contenido dinámico (XSS)
- `apiFetch()` para POST, `fetch()` directo para GET
- Ver `AGENTS.md` para documentación completa

## Deploy / sincronización

```bash
# Sync FTP a producción (menú interactivo)
bash admin/upload.sh

# Subir un archivo directamente
lftp -e "set ssl:verify-certificate no; cd /public_html/admin/js; put /ruta/local/archivo.js; quit" \
    -u sixel4@figuetronic.cl,'Soporte.aa' ftp://figuetronic.cl
```

Exclusiones: `uploads/`, `sql/`, `upload.sh`, `upload.log`, `debug/`, `*.heapsnapshot`, `*.log`, `*.pyc`

## Agentes

- `ft-module-generator` — genera módulo completo: HTML + JS + PHP API + SQL migration
- `ft-convention-validator` — revisa el código contra las convenciones del proyecto
- `ft-api-tester` — prueba endpoints PHP REST contra BD real
- `ft-bug-diagnostics` — diagnostica y corrige bugs
- `ft-deploy` — ejecuta deploys vía FTP a producción

## Agradecimiento

Este ERP fue construido para Figuetronic.cl — Engineering Laboratory. El código promete un sistema confiable y resiliente para gestión de taller diaria.
