// common.js - Figuetronic Web Dashboard
const API_ROOT = '/admin/api/';
const el = id => document.getElementById(id);

// ─── MODAL HELPERS (globales, usados por todos los módulos) ─────
function openModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.remove('active');
    document.body.style.overflow = '';
}

// Bloquear visualización del contenido hasta que auth verifique permisos
(function(){
    var s = document.createElement('style');
    s.textContent = 'body:not(.auth-ok) .main-content{visibility:hidden!important;}body:not(.auth-ok) .sidebar{visibility:hidden!important;}';
    document.head.appendChild(s);
})();

// ============================================================================
// AUTH — Sistema de autenticación y permisos
// ============================================================================
window.__user = null;
window.__permissions = [];

(async function _checkAuth() {
    // Saltar auth en páginas que no la requieren
    const page = window.location.pathname.split('/').pop() || 'dashboard.html';
    const publicPages = ['login.html', 'portal.html', 'solicitud_visita.html', 'registro.html'];
    if (publicPages.includes(page)) { document.body.classList.add('auth-ok'); return; }

    try {
        const res = await fetch(API_ROOT + 'auth_api.php?action=me', { credentials: 'same-origin' });
        const data = await res.json();
        if ((data.status === 'success' || data.status === 'ok') && data.data) {
            window.__user = data.data;
            window.__permissions = data.data.permisos || [];
            _renderUserInfo(data.data);
            _applyPermissions();
            if (typeof UIController !== 'undefined') UIController.init();
            // Verificar acceso a la página ANTES de mostrar contenido
            if (typeof UIController !== 'undefined' && !UIController.canAccessPage(page)) {
                // No tiene permiso — redirigir SIN mostrar contenido
                window.location.href = 'dashboard.html';
                return;
            }
            document.body.classList.add('auth-ok');
        } else {
            window.location.href = 'login.html';
        }
    } catch (e) {
        console.warn('Auth check failed:', e);
        setTimeout(async () => {
            try {
                const retry = await fetch(API_ROOT + 'auth_api.php?action=me', { credentials: 'same-origin' });
                const retryData = await retry.json();
                if ((retryData.status === 'success' || retryData.status === 'ok') && retryData.data) {
                    window.__user = retryData.data;
                    window.__permissions = retryData.data.permisos || [];
                    _renderUserInfo(retryData.data);
                    _applyPermissions();
                    if (typeof UIController !== 'undefined') UIController.init();
                    if (typeof UIController !== 'undefined' && !UIController.canAccessPage(page)) {
                        window.location.href = 'dashboard.html';
                        return;
                    }
                    document.body.classList.add('auth-ok');
                } else {
                    window.location.href = 'login.html';
                }
            } catch (e2) {
                window.location.href = 'login.html';
            }
        }, 3000);
    }
})();

function hasPerm(perm) {
    if (!window.__user) return false;
    if (window.__user.nivel == 1) return true; // Admin tiene todo
    return window.__permissions.includes(perm);
}

function _applyPermissions() {
    if (typeof UIController !== 'undefined' && UIController.applyDomPermissions) {
        UIController.applyDomPermissions();
        return;
    }
    document.querySelectorAll('[data-perm]').forEach(el => {
        const needed = el.getAttribute('data-perm');
        if (needed && !hasPerm(needed)) {
            el.style.display = 'none';
        } else if (needed) {
            el.style.display = '';
        }
    });
    document.querySelectorAll('[data-perm-disable]').forEach(el => {
        const needed = el.getAttribute('data-perm-disable');
        if (needed && !hasPerm(needed)) {
            el.disabled = true;
            el.style.opacity = '0.5';
            el.style.pointerEvents = 'none';
        } else if (needed) {
            el.disabled = false;
            el.style.opacity = '';
            el.style.pointerEvents = '';
        }
    });
}

function _renderUserInfo(user) {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;
    const existing = headerRight.querySelector('.header-user');
    if (existing) existing.remove();

    const initials = ((user.nombre || user.username || 'U')[0] + (user.apellido || '')).substring(0, 2).toUpperCase();

    const wrapper = document.createElement('div');
    wrapper.className = 'header-user';
    wrapper.innerHTML = `
        <button class="header-user-trigger" type="button" aria-haspopup="true" aria-expanded="false">
            <div class="header-user-avatar">${escapeHtml(initials)}</div>
            <span class="header-user-name">${escapeHtml(user.nombre || user.username)}</span>
            <i class="fas fa-chevron-down header-user-chevron"></i>
        </button>
        <div class="header-user-dropdown">
            <div class="header-user-dropdown-header">
                <div class="header-user-avatar-lg">${escapeHtml(initials)}</div>
                <div>
                    <div class="header-user-dd-name">${escapeHtml(user.nombre || '')} ${escapeHtml(user.apellido || '')}</div>
                    <div class="header-user-dd-role">${escapeHtml(user.rol || user.tipo)}</div>
                    <div class="header-user-dd-email">${escapeHtml(user.email || '')}</div>
                </div>
            </div>
            <div class="header-user-dropdown-divider"></div>
            <a class="header-user-dropdown-item" href="usuarios.html?action=profile">
                <i class="fas fa-user-pen"></i> Mi perfil
            </a>
            <button class="header-user-dropdown-item" id="headerBtnChangePassword" type="button">
                <i class="fas fa-key"></i> Cambiar contraseña
            </button>
            <div class="header-user-dropdown-divider"></div>
            <button class="header-user-dropdown-item header-user-logout" id="headerBtnLogout" type="button">
                <i class="fas fa-right-from-bracket"></i> Cerrar sesión
            </button>
        </div>
    `;

    const trigger = wrapper.querySelector('.header-user-trigger');
    const dropdown = wrapper.querySelector('.header-user-dropdown');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.header-user-dropdown.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.header-user-trigger[aria-expanded="true"]').forEach(t => t.setAttribute('aria-expanded', 'false'));
        if (!isOpen) {
            dropdown.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
        }
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('open');
    });

    dropdown.addEventListener('click', (e) => e.stopPropagation());

    const logoutBtn = wrapper.querySelector('#headerBtnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            dropdown.classList.remove('open');
            try { await fetch(API_ROOT + 'auth_api.php?action=logout', { method: 'POST' }); } catch(e) {}
            window.location.href = 'login.html';
        });
    }

    const changePwBtn = wrapper.querySelector('#headerBtnChangePassword');
    if (changePwBtn) {
        changePwBtn.addEventListener('click', () => {
            dropdown.classList.remove('open');
            _showChangePasswordModal();
        });
    }

    headerRight.insertBefore(wrapper, headerRight.firstChild);
}

function _showChangePasswordModal() {
    const existing = document.getElementById('changePasswordModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'changePasswordModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
    modal.innerHTML = `
        <div class="modal-box" style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <h3 style="margin:0;font-size:1.1rem;font-weight:600;color:var(--text-primary);"><i class="fas fa-key" style="color:var(--primary);margin-right:8px;"></i>Cambiar contraseña</h3>
                <button class="modal-close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
            </div>
            <form id="changePasswordForm">
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:0.8rem;font-weight:500;color:var(--text-secondary);margin-bottom:4px;">Contraseña actual</label>
                    <input type="password" name="current_password" required placeholder="Ingrese contraseña actual" style="width:100%;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:0.85rem;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:0.8rem;font-weight:500;color:var(--text-secondary);margin-bottom:4px;">Nueva contraseña</label>
                    <input type="password" name="new_password" required placeholder="Mínimo 6 caracteres" minlength="6" style="width:100%;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:0.85rem;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:0.8rem;font-weight:500;color:var(--text-secondary);margin-bottom:4px;">Confirmar contraseña</label>
                    <input type="password" name="confirm_password" required placeholder="Repita la nueva contraseña" minlength="6" style="width:100%;padding:8px 12px;border:1px solid var(--border-color);border-radius:6px;font-size:0.85rem;box-sizing:border-box;">
                </div>
                <div id="changePwError" style="display:none;color:#DC2626;font-size:0.8rem;margin-bottom:12px;"></div>
                <div id="changePwSuccess" style="display:none;color:#059669;font-size:0.8rem;margin-bottom:12px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button type="button" class="modal-close-btn" style="padding:8px 16px;border:1px solid var(--border-color);border-radius:6px;background:#fff;cursor:pointer;font-size:0.85rem;">Cancelar</button>
                    <button type="submit" id="btnChangePw" style="padding:8px 16px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-size:0.85rem;font-weight:500;">Guardar</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const form = modal.querySelector('#changePasswordForm');
    const errorDiv = modal.querySelector('#changePwError');
    const successDiv = modal.querySelector('#changePwSuccess');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        const fd = new FormData(form);
        const current_password = fd.get('current_password');
        const new_password = fd.get('new_password');
        const confirm_password = fd.get('confirm_password');

        if (new_password !== confirm_password) {
            errorDiv.textContent = 'Las contraseñas no coinciden.';
            errorDiv.style.display = 'block';
            return;
        }
        if (new_password.length < 6) {
            errorDiv.textContent = 'Mínimo 6 caracteres.';
            errorDiv.style.display = 'block';
            return;
        }

        const btn = modal.querySelector('#btnChangePw');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        try {
            const res = await fetch(API_ROOT + 'auth_api.php?action=change_password', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password, new_password, confirm_password })
            });
            const data = await res.json();
            if (data.status === 'success') {
                successDiv.textContent = 'Contraseña actualizada correctamente.';
                successDiv.style.display = 'block';
                form.reset();
                setTimeout(() => modal.remove(), 2000);
            } else {
                errorDiv.textContent = data.message || 'Error al cambiar contraseña.';
                errorDiv.style.display = 'block';
            }
        } catch(err) {
            errorDiv.textContent = 'Error de conexión.';
            errorDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar';
        }
    });
}

// ============================================================================
// UI CONTROLLER — Motor de control de interfaz basado en permisos
// ============================================================================
// Atributos soportados:
//   data-perm="mod:accion"        → Oculta elemento si no tiene permiso
//   data-perm-disable="mod:acc"   → Deshabilita elemento si no tiene permiso
//   data-perm-page="file.html"    → Oculta nav-item si no puede acceder
//   data-perm-tab="nombre"        → Oculta tab y su panel
//   data-perm-field="mod:campo"   → Oculta form-group padre
// ============================================================================
window.UIController = {
    // Mapa de permisos por página
    pagePermissions: {
        'dashboard.html':           null,
        'clientes.html':            'clientes:ver',
        'vehiculos.html':           'vehiculos:ver',
        'proveedores.html':         'proveedores:ver',
        'empleados.html':           'empleados:ver',
        'usuarios.html':            'usuarios:ver',
        'admin.html':               'admin:panel',
        'recepcion_unificada.html': 'recepcion:ver',
        'ordenes_trabajo.html':     'ordenes_trabajo:ver',
        'ejecucion_ot.html':        'ejecucion_ot:ver',
        'apoyo_tecnico.html':       'apoyo_tecnico:ver',
        'trabajos_servicios.html':  'trabajos_servicios:ver',
        'articulos.html':           'articulos:ver',
        'insumos.html':             'insumos:ver',
        'tareas_diarias.html':      'tareas_diarias:ver',
        'zonas_taller.html':        'zonas_taller:ver',
        'inventario_taller.html':   'inventario_taller:ver',
        'inventario_traslados.html':'inventario_taller:ver',
        'inventario_asignaciones.html':'inventario_taller:ver',
        'presupuestos.html':        'presupuestos:ver',
        'ingresos.html':            'ingresos:ver',
        'pos.html':                 'pos:ver',
        'pagos.html':               'pagos:ver',
        'cuentas_bancarias.html':   'cuentas_bancarias:ver',
        'orden_compra.html':        'orden_compra:ver',
        'compras.html':             'compras:ver',
        'compras_rapidas.html':     'compras_rapidas:ver',
        'ventas.html':              'ventas:ver',
        'datos_reportes.html':      'reportes:ver',
        'reportes.html':            'reportes:ver',
        'reportes_avanzados.html':  'reportes:ver',
        'correo.html':              'correo:ver',
        'agenda_taller.html':      'agenda:ver',
        'solicitud_visita.html':   null,
        'portal_control.html':     'portal_control:ver',
        'cctv.html':               'cctv:ver',
        'desarme_automotriz.html': 'desarme_automotriz:ver',
        'desarme_maestro.html':    'desarme_maestro:ver',
    },

    // ════════════════════════════════════════════════════════════════════════
    // MODULE_REGISTRY — Mapa maestro de módulos y permisos
    // ════════════════════════════════════════════════════════════════════════
    // Para agregar un nuevo módulo: agregar una entrada aquí + HTML en sidebar
    MODULE_REGISTRY: {
        clientes:            { label: 'Clientes',             page: 'clientes.html',            perms: { ver: 'clientes:ver', crear: 'clientes:crear', editar: 'clientes:editar', eliminar: 'clientes:eliminar' } },
        vehiculos:           { label: 'Vehículos',            page: 'vehiculos.html',           perms: { ver: 'vehiculos:ver', crear: 'vehiculos:crear', editar: 'vehiculos:editar', eliminar: 'vehiculos:eliminar' } },
        proveedores:         { label: 'Proveedores',          page: 'proveedores.html',         perms: { ver: 'proveedores:ver', crear: 'proveedores:crear', editar: 'proveedores:editar', eliminar: 'proveedores:eliminar' } },
        empleados:           { label: 'Empleados',            page: 'empleados.html',           perms: { ver: 'empleados:ver', crear: 'empleados:crear', editar: 'empleados:editar', eliminar: 'empleados:eliminar' } },
        usuarios:            { label: 'Usuarios',             page: 'usuarios.html',            perms: { ver: 'usuarios:ver', crear: 'usuarios:crear', editar: 'usuarios:editar', eliminar: 'usuarios:eliminar' } },
        recepcion:           { label: 'Recepción',            page: 'recepcion_unificada.html', perms: { ver: 'recepcion:ver', crear: 'recepcion:crear', editar: 'recepcion:editar', eliminar: 'recepcion:eliminar' } },
        ordenes_trabajo:     { label: 'Órdenes de Trabajo',   page: 'ordenes_trabajo.html',     perms: { ver: 'ordenes_trabajo:ver', crear: 'ordenes_trabajo:crear', editar: 'ordenes_trabajo:editar', eliminar: 'ordenes_trabajo:eliminar' } },
        ejecucion_ot:        { label: 'Ejecución OT',         page: 'ejecucion_ot.html',        perms: { ver: 'ejecucion_ot:ver', editar: 'ejecucion_ot:editar' } },
        apoyo_tecnico:       { label: 'Apoyo Técnico',        page: 'apoyo_tecnico.html',       perms: { ver: 'apoyo_tecnico:ver', crear: 'apoyo_tecnico:crear', editar: 'apoyo_tecnico:editar', eliminar: 'apoyo_tecnico:eliminar' } },
        trabajos_servicios:  { label: 'Trabajos y Servicios', page: 'trabajos_servicios.html',  perms: { ver: 'trabajos_servicios:ver', crear: 'trabajos_servicios:crear', editar: 'trabajos_servicios:editar', eliminar: 'trabajos_servicios:eliminar' } },
        articulos:           { label: 'Artículos',            page: 'articulos.html',           perms: { ver: 'articulos:ver', crear: 'articulos:crear', editar: 'articulos:editar', eliminar: 'articulos:eliminar' } },
        insumos:             { label: 'Insumos',              page: 'insumos.html',             perms: { ver: 'insumos:ver', crear: 'insumos:crear', editar: 'insumos:editar', eliminar: 'insumos:eliminar' } },
        tareas_diarias:      { label: 'Tareas',               page: 'tareas_diarias.html',      perms: { ver: 'tareas_diarias:ver', crear: 'tareas_diarias:crear', editar: 'tareas_diarias:editar', eliminar: 'tareas_diarias:eliminar' } },
        zonas_taller:        { label: 'Zonas Taller',         page: 'zonas_taller.html',        perms: { ver: 'zonas_taller:ver', crear: 'zonas_taller:crear', editar: 'zonas_taller:editar', eliminar: 'zonas_taller:eliminar' } },
        inventario_taller:   { label: 'Inventario Taller',    page: 'inventario_taller.html',   perms: { ver: 'inventario_taller:ver', crear: 'inventario_taller:crear', editar: 'inventario_taller:editar', eliminar: 'inventario_taller:eliminar' } },
        agenda:              { label: 'Agenda',               page: 'agenda_taller.html',       perms: { ver: 'agenda:ver', crear: 'agenda:crear', editar: 'agenda:editar', eliminar: 'agenda:eliminar' } },
        presupuestos:        { label: 'Presupuestos',         page: 'presupuestos.html',        perms: { ver: 'presupuestos:ver', crear: 'presupuestos:crear', editar: 'presupuestos:editar', eliminar: 'presupuestos:eliminar' } },
        ingresos:            { label: 'Ingresos',             page: 'ingresos.html',            perms: { ver: 'ingresos:ver', crear: 'ingresos:crear', editar: 'ingresos:editar', eliminar: 'ingresos:eliminar' } },
        pos:                 { label: 'POS',                  page: 'pos.html',                 perms: { ver: 'pos:ver', crear: 'pos:crear', editar: 'pos:editar', eliminar: 'pos:eliminar' } },
        pagos:               { label: 'Pagos',                page: 'pagos.html',               perms: { ver: 'pagos:ver', crear: 'pagos:crear', editar: 'pagos:editar', eliminar: 'pagos:eliminar' } },
        cuentas_bancarias:   { label: 'Cuentas Bancarias',    page: 'cuentas_bancarias.html',   perms: { ver: 'cuentas_bancarias:ver', crear: 'cuentas_bancarias:crear', editar: 'cuentas_bancarias:editar', eliminar: 'cuentas_bancarias:eliminar' } },
        orden_compra:        { label: 'Órdenes de Compra',    page: 'orden_compra.html',        perms: { ver: 'orden_compra:ver', crear: 'orden_compra:crear', editar: 'orden_compra:editar', eliminar: 'orden_compra:eliminar' } },
        compras:             { label: 'Compras',              page: 'compras.html',             perms: { ver: 'compras:ver', crear: 'compras:crear', editar: 'compras:editar', eliminar: 'compras:eliminar' } },
        compras_rapidas:     { label: 'Compra Rápida',        page: 'compras_rapidas.html',     perms: { ver: 'compras_rapidas:ver', crear: 'compras_rapidas:crear', editar: 'compras_rapidas:editar' } },
        ventas:              { label: 'Ventas',               page: 'ventas.html',              perms: { ver: 'ventas:ver', crear: 'ventas:crear', editar: 'ventas:editar', eliminar: 'ventas:eliminar' } },
        correo:              { label: 'Correos',              page: 'correo.html',              perms: { ver: 'correo:ver', editar: 'correo:editar' } },
        reportes:            { label: 'Reportes',             page: 'datos_reportes.html',      perms: { ver: 'reportes:ver' } },
        portal_control:      { label: 'Portal Control',       page: 'portal_control.html',      perms: { ver: 'portal_control:ver', config: 'portal_control:config', responder: 'portal_control:responder', avances: 'portal_control:avances', eliminar: 'portal_control:eliminar' } },
        cctv:                { label: 'Cámaras CCTV',          page: 'cctv.html',                perms: { ver: 'cctv:ver', config: 'cctv:config', acceder: 'cctv:acceder', eliminar: 'cctv:eliminar' } },
        desarme_automotriz:  { label: 'Desarme Automotriz',    page: 'desarme_automotriz.html',  perms: { ver: 'desarme_automotriz:ver', crear: 'desarme_automotriz:crear', editar: 'desarme_automotriz:editar', eliminar: 'desarme_automotriz:eliminar', descontaminar: 'desarme_automotriz:descontaminar', desarmar: 'desarme_automotriz:desarmar', inspeccionar: 'desarme_automotriz:inspeccionar', publicar: 'desarme_automotriz:publicar' } },
        desarme_maestro:     { label: 'Biblia Maestra',        page: 'desarme_maestro.html',     perms: { ver: 'desarme_maestro:ver', crear: 'desarme_maestro:crear', editar: 'desarme_maestro:editar', eliminar: 'desarme_maestro:eliminar' } },
    },

    // Obtener permiso de un módulo
    getModulePerm(module, action) {
        const mod = this.MODULE_REGISTRY[module];
        return mod ? (mod.perms[action] || null) : null;
    },

    // Verificar si el usuario tiene permiso en un módulo
    canModule(module, action) {
        const perm = this.getModulePerm(module, action);
        return perm ? hasPerm(perm) : false;
    },

    // Inicializar — se llama después de _checkAuth
    init() {
        this.applyDomPermissions();
        this.filterSidebar();
        this.filterTabs();
        this.filterFormFields();
        this.autoApplyPermissions();
    },

    // Re-apply después de contenido dinámico (después de render AJAX)
    refresh() {
        this.applyDomPermissions();
        this.filterTabs();
        this.filterFormFields();
        this.autoApplyPermissions();
    },

    // Verificar acceso a una página
    canAccessPage(page) {
        if (!window.__user) return false;
        if (window.__user.nivel <= 2) return true; // Admin y gerente ven todo
        const perm = this.pagePermissions[page];
        if (!perm) return true; // Sin restricción definida
        return hasPerm(perm);
    },

    // Verificar permiso genérico
    can(perm) {
        return hasPerm(perm);
    },

    // Aplicar data-perm y data-perm-disable en todo el DOM
    applyDomPermissions() {
        document.querySelectorAll('[data-perm]').forEach(el => {
            const perm = el.getAttribute('data-perm');
            if (perm && !hasPerm(perm)) {
                el.style.display = 'none';
            } else if (perm) {
                el.style.display = '';
            }
        });
        document.querySelectorAll('[data-perm-disable]').forEach(el => {
            const perm = el.getAttribute('data-perm-disable');
            if (perm && !hasPerm(perm)) {
                el.disabled = true;
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none';
                el.setAttribute('title', 'Sin permiso: ' + perm);
            } else if (perm) {
                el.disabled = false;
                el.style.opacity = '';
                el.style.pointerEvents = '';
                el.removeAttribute('title');
            }
        });
    },

    // Ocultar nav-items del sidebar que el usuario no puede acceder
    filterSidebar() {
        document.querySelectorAll('.nav-item[data-perm-page]').forEach(el => {
            const page = el.getAttribute('data-perm-page');
            if (page && !this.canAccessPage(page)) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
            }
        });
        // Ocultar group titles vacíos
        document.querySelectorAll('.nav-group-title').forEach(title => {
            let next = title.nextElementSibling;
            let allHidden = true;
            while (next && !next.classList.contains('nav-group-title') && next.tagName !== 'BUTTON') {
                if (next.classList.contains('nav-item') && next.style.display !== 'none') {
                    allHidden = false;
                    break;
                }
                next = next.nextElementSibling;
            }
            title.style.display = allHidden ? 'none' : '';
        });
    },

    // Ocultar tabs sin permiso
    filterTabs() {
        document.querySelectorAll('[data-perm-tab]').forEach(el => {
            const perm = el.getAttribute('data-perm-tab');
            if (perm && !hasPerm(perm)) {
                el.style.display = 'none';
                const tabName = el.getAttribute('data-tab') || el.dataset.tab;
                if (tabName) {
                    const panelId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
                    const panel = document.getElementById(panelId);
                    if (panel) panel.style.display = 'none';
                }
            } else if (perm) {
                el.style.display = '';
                const tabName = el.getAttribute('data-tab') || el.dataset.tab;
                if (tabName) {
                    const panelId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
                    const panel = document.getElementById(panelId);
                    if (panel) panel.style.display = '';
                }
            }
        });
    },

    // Ocultar campos de formulario sin permiso
    filterFormFields() {
        document.querySelectorAll('[data-perm-field]').forEach(el => {
            const perm = el.getAttribute('data-perm-field');
            if (perm && !hasPerm(perm)) {
                const group = el.closest('.form-group') || el.closest('.form-row') || el;
                group.style.display = 'none';
            } else if (perm) {
                const group = el.closest('.form-group') || el.closest('.form-row') || el;
                group.style.display = '';
            }
        });
    },

    // Mapa página → módulo de permisos
    pageModuleMap: {
        'clientes.html': 'clientes',
        'vehiculos.html': 'vehiculos',
        'proveedores.html': 'proveedores',
        'empleados.html': 'empleados',
        'usuarios.html': 'usuarios',
        'recepcion_unificada.html': 'recepcion',
        'ordenes_trabajo.html': 'ordenes_trabajo',
        'ejecucion_ot.html': 'ejecucion_ot',
        'apoyo_tecnico.html': 'apoyo_tecnico',
        'trabajos_servicios.html': 'trabajos_servicios',
        'presupuestos.html': 'presupuestos',
        'ingresos.html': 'ingresos',
        'pos.html': 'pos',
        'pagos.html': 'pagos',
        'cuentas_bancarias.html': 'cuentas_bancarias',
        'orden_compra.html': 'orden_compra',
        'compras.html': 'compras',
        'compras_rapidas.html': 'compras_rapidas',
        'ventas.html': 'ventas',
        'articulos.html': 'articulos',
        'insumos.html': 'insumos',
        'inventario_taller.html': 'inventario_taller',
        'inventario_traslados.html': 'inventario_taller',
        'inventario_asignaciones.html': 'inventario_taller',
        'tareas_diarias.html': 'tareas_diarias',
        'zonas_taller.html': 'zonas_taller',
        'agenda_taller.html': 'agenda',
        'correo.html': 'correo',
        'reportes.html': 'reportes',
        'reportes_avanzados.html': 'reportes',
        'portal_control.html': 'portal_control',
        'cctv.html': 'cctv',
        'desarme_automotriz.html': 'desarme_automotriz',
        'desarme_maestro.html': 'desarme_maestro',
    },

    // Auto-estructurar interfaz según permisos del usuario
    autoApplyPermissions() {
        const page = window.location.pathname.split('/').pop() || '';
        const module = this.pageModuleMap[page];
        if (!module) return;

        // Sufijos de IDs de botones → permiso requerido
        const actionMap = {
            'delete': ':eliminar',
            'eliminar': ':eliminar',
            'remove': ':eliminar',
            'new': ':crear',
            'nuevo': ':crear',
            'crear': ':crear',
            'add': ':crear',
            'agregar': ':crear',
            'edit': ':editar',
            'editar': ':editar',
            'modificar': ':editar',
            'save': ':editar',
            'guardar': ':editar',
            'update': ':editar',
            'actualizar': ':editar',
            'enviar': ':editar',
            'aprobar': ':editar',
            'rechazar': ':editar',
            'confirmar': ':editar',
            'iniciar': ':editar',
            'finalizar': ':editar',
            'cambiar': ':editar',
            'registrar': ':editar',
            'asignar': ':editar',
            'desasignar': ':editar',
            'solicitar': ':editar',
            'verificar': ':editar',
            'convertir': ':editar',
            'exportar': ':ver',
            'imprimir': ':ver',
            'descargar': ':ver',
        };

        // Clases CSS de botones → permiso requerido
        const classActionMap = {
            'btn-delete': ':eliminar',
            'btn-eliminar': ':eliminar',
            'btn-icon-danger': ':eliminar',
            'btn-new': ':crear',
            'btn-nuevo': ':crear',
            'btn-add': ':crear',
            'btn-agregar': ':crear',
            'btn-edit': ':editar',
            'btn-editar': ':editar',
            'btn-save': ':editar',
            'btn-guardar': ':editar',
            'btn-primary': ':editar',
        };

        // Escanear todos los botones por ID
        document.querySelectorAll('button[id], a.btn[id], input[type=button][id]').forEach(el => {
            const id = (el.id || '').toLowerCase();
            let matched = false;
            for (const [suffix, permSuffix] of Object.entries(actionMap)) {
                if (id.endsWith(suffix) || id.includes('-' + suffix) || id.includes('_' + suffix)) {
                    matched = true;
                    el.style.display = hasPerm(module + permSuffix) ? '' : 'none';
                    return;
                }
            }
        });

        // Escanear por clases CSS
        document.querySelectorAll('button, a.btn, input[type=button]').forEach(el => {
            const classes = el.className.toLowerCase();
            for (const [cls, permSuffix] of Object.entries(classActionMap)) {
                if (classes.includes(cls)) {
                    el.style.display = hasPerm(module + permSuffix) ? '' : 'none';
                    return;
                }
            }
        });

        // Escanear por atributo data-perm-action (para elementos que lo declare explícitamente)
        document.querySelectorAll('[data-perm-action]').forEach(el => {
            const action = el.getAttribute('data-perm-action');
            if (action) {
                el.style.display = hasPerm(module + ':' + action) ? '' : 'none';
            }
        });
    },

    // Redirigir si el usuario no tiene permiso para acceder a esta página
    enforcePageAccess() {
        const page = window.location.pathname.split('/').pop() || 'dashboard.html';
        if (!this.canAccessPage(page)) {
            showToast('No tiene permiso para acceder a esta página.', 'error');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
        }
    },

    // Ocultar botones de acción por permiso (atajo rápido)
    hideAction(perm, container) {
        const scope = container || document;
        scope.querySelectorAll('[data-perm="' + perm + '"]').forEach(el => {
            el.style.display = hasPerm(perm) ? '' : 'none';
        });
    }
};

// ============================================================================
// API FETCH — Wrapper global para POST requests
// ============================================================================
async function apiFetch(url, formData) {
    try {
        const r = await fetch(url, { method: 'POST', body: formData, credentials: 'same-origin' });
        const text = await r.text();
        if (!text) return { status: 'error', message: 'Respuesta vacía del servidor (' + r.status + ')' };
        try { return JSON.parse(text); } catch(e) { return { status: 'error', message: 'Respuesta no válida del servidor: ' + text.substring(0, 200) }; }
    } catch(e) { return { status: 'error', message: 'Error de conexión: ' + e.message }; }
}

// ============================================================================
// REACTIVE REFRESH — Auto-reload data on bfcache/focus
// ============================================================================
const _reactiveCallbacks = [];
let _reactiveReady = false;
function setupReactiveRefresh(fn) {
    if (typeof fn !== 'function') return;
    _reactiveCallbacks.push(fn);
    // Activar tan pronto como se llame setupReactiveRefresh (es señal de que el módulo terminó su setup inicial)
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            _reactiveReady = true;
        });
    });
}
// Solo disparar después de que setupReactiveRefresh haya sido llamado al menos una vez
window.addEventListener('pageshow', (e) => {
    if (!_reactiveReady) return;
    if (e.persisted || (typeof performance !== 'undefined' && performance.getEntriesByType && performance.navigation && performance.navigation.type === 2)) {
        _reactiveCallbacks.forEach(fn => { try { fn(); } catch(err) { console.error('Reactive refresh error:', err); } });
    }
});
window.addEventListener('focus', () => {
    if (!_reactiveReady) return;
    _reactiveCallbacks.forEach(fn => { try { fn(); } catch(err) { console.error('Reactive focus error:', err); } });
});
// En móviles, el evento más confiable es visibilitychange (al volver a la app/tab)
// Se ejecuta inmediatamente para asegurar datos frescos
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _reactiveReady) {
        _reactiveCallbacks.forEach(fn => { try { fn(); } catch(err) { console.error('Reactive visibility error:', err); } });
    }
});

// ============================================================================
// BOTTOM NAV — Highlight active item based on current page
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href === page) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    // Bottom command palette button
    const btnCmd = document.getElementById('btnBottomCmd');
    if (btnCmd) btnCmd.addEventListener('click', () => {
        const btnPalette = document.getElementById('btnCommandPalette');
        if (btnPalette) btnPalette.click();
    });
});

function formatMoney(n) {
  if (n == null || isNaN(n)) return '$0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return sign + '$' + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Funciones compartidas: multimedia, lightbox, selects dinámicos, selects vinculados

// =============================================
// PATCH: ficha-container visibility fix
// Syncs .active class with style.display for all .ficha-container elements
// =============================================
function patchFichaContainerVisibility() {
    document.querySelectorAll('.ficha-container').forEach(fc => {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (m.attributeName === 'style') {
                    const val = fc.style.display;
                    if (val === '' || val === 'block') {
                        fc.classList.add('active');
                    } else if (val === 'none') {
                        fc.classList.remove('active');
                    }
                }
            });
        });
        observer.observe(fc, { attributes: true, attributeFilter: ['style'] });
    });
}

// =============================================
// FICHA PANEL — Open/close ficha + toggle listView
// =============================================
function openFichaPanel(containerId) {
    const fc = document.getElementById(containerId || 'fichaContainer');
    const lv = document.getElementById('listView');
    if (fc) {
        fc.classList.add('active');
        fc.style.display = 'block';
    }
    if (lv) lv.style.display = 'none';
    // Scroll al inicio para mostrar el header de la ficha
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeFichaPanel(containerId) {
    const fc = document.getElementById(containerId || 'fichaContainer');
    const lv = document.getElementById('listView');
    if (fc) {
        fc.classList.remove('active');
        fc.style.display = 'none';
    }
    if (lv) lv.style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    setupMultimediaZones();
    createLightbox();
    setupSidebarToggle();
    setupPanelTabs();
    setupKeyboardShortcuts();
    setActiveNavItem();
    initNavFeatures();
    patchFichaContainerVisibility();
    // Auto-init breadcrumbs if container exists
    if (document.querySelector('.breadcrumbs')) {
        const pageTitle = document.querySelector('.page-title');
        if (pageTitle) {
            Breadcrumbs.auto(null, pageTitle.textContent.trim());
        }
    }

    // Save draft before page unload (skip if record is already saved)
    window.addEventListener('beforeunload', () => {
        // Fix falso positivo draft: si global currentRecordId está definido, skip completo
        if (typeof currentRecordId !== 'undefined' && currentRecordId) return;
        
        const forms = document.querySelectorAll('[data-draft-module]');
        forms.forEach(form => {
            const moduleKey = form.dataset.draftModule;
            if (moduleKey && form.id) {
                const recordId = form.querySelector('[name="record_id"], #record_id');
                if (recordId && recordId.value) return; // Ya existe registro guardado
                const data = DraftManager.captureForm(form);
                // Si data incluye el ID, no lo guardamos como draft
                if (data.record_id || data.id) return;
                
                if (Object.keys(data).length > 0) {
                    DraftManager.save(moduleKey, data);
                }
            }
        });
    });
});

// =============================================
// LIGHTBOX / MEDIA VIEWER
// =============================================
function createLightbox() {
    if (document.getElementById('mediaLightbox')) return;
    const lb = document.createElement('div');
    lb.id = 'mediaLightbox';
    lb.className = 'lightbox-overlay';
    lb.innerHTML = `
        <div class="lightbox-content">
            <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
            <div class="lightbox-body" id="lightboxBody"></div>
        </div>
    `;
    document.body.appendChild(lb);
    lb.addEventListener('click', (e) => {
        if (e.target === lb) closeLightbox();
    });
}

function openLightbox(type, src, name) {
    const body = document.getElementById('lightboxBody');
    const lb = document.getElementById('mediaLightbox');
    if (!body || !lb) return;
    body.innerHTML = '';

    const t = (type || '').toLowerCase();
    const isPdf = t === 'pdf' || (src && /\.pdf(\?|$)/i.test(src));
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (t === 'foto') {
        body.innerHTML = `<img src="${src}" alt="${name}" style="max-width:90vw; max-height:85vh; border-radius:8px;">`;
    } else if (t === 'video') {
        body.innerHTML = `<video src="${src}" controls autoplay style="max-width:90vw; max-height:85vh; border-radius:8px;"></video>`;
    } else if (t === 'nota_voz') {
        body.innerHTML = `
            <div style="text-align:center; padding:3rem;">
                <i class="fas fa-microphone" style="font-size:4rem; color:var(--primary); margin-bottom:1rem;"></i>
                <p style="margin-bottom:1.5rem; color:var(--text-secondary)">${name}</p>
                <audio src="${src}" controls autoplay style="width:100%; max-width:500px;"></audio>
            </div>`;
    } else if (isPdf) {
        _openPdfViewer(src, name);
    } else {
        body.innerHTML = `
            <div style="text-align:center; padding:3rem;">
                <i class="fas fa-file-alt" style="font-size:4rem; color:var(--primary); margin-bottom:1rem;"></i>
                <p style="margin-bottom:1.5rem; color:var(--text-secondary)">${name}</p>
                <a href="${src}" target="_blank" class="btn btn-primary"><i class="fas fa-external-link-alt"></i> Abrir archivo</a>
            </div>`;
    }
    lb.classList.add('active');
}

function closeLightbox() {
    const lb = document.getElementById('mediaLightbox');
    lb.classList.remove('active');
    const body = document.getElementById('lightboxBody');
    body.innerHTML = '';
    window._pdfDoc = null;
    window._pdfPage = 1;
    window._pdfTotal = 0;
}

// ─── PDF Viewer (PDF.js) ───────────────────────────────────────────────
function _loadPdfJs(callback) {
    if (window.pdfjsLib) { callback(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function() {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        callback();
    };
    s.onerror = function() {
        var body = document.getElementById('lightboxBody');
        if (body) body.innerHTML = '<div style="text-align:center;padding:3rem;"><p style="color:var(--text-secondary)">No se pudo cargar el visor de PDF</p><a href="' + window._pdfSrc + '" target="_blank" class="btn btn-primary" style="margin-top:1rem;"><i class="fas fa-external-link-alt"></i> Abrir PDF</a></div>';
    };
    document.head.appendChild(s);
}

function _openPdfViewer(src, name) {
    window._pdfSrc = src;
    window._pdfPage = 1;
    var body = document.getElementById('lightboxBody');
    body.innerHTML = '<div style="text-align:center;padding:4rem;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--primary);"></i><p style="margin-top:1rem;color:var(--text-secondary);">Cargando PDF...</p></div>';
    var lb = document.getElementById('mediaLightbox');
    lb.classList.add('active');

    _loadPdfJs(function() {
        var loadingTask = window.pdfjsLib.getDocument(src);
        loadingTask.promise.then(function(pdf) {
            window._pdfDoc = pdf;
            window._pdfTotal = pdf.numPages;
            _renderPdfPage(1, name);
        }).catch(function(err) {
            body.innerHTML = '<div style="text-align:center;padding:3rem;"><i class="fas fa-exclamation-triangle" style="font-size:2rem;color:var(--danger);"></i><p style="margin-top:1rem;color:var(--text-secondary);">Error al cargar el PDF</p><a href="' + src + '" target="_blank" class="btn btn-primary" style="margin-top:1rem;"><i class="fas fa-external-link-alt"></i> Abrir en nueva pestaña</a></div>';
        });
    });
}

function _renderPdfPage(num, name) {
    var pdf = window._pdfDoc;
    if (!pdf || num < 1 || num > pdf.numPages) return;
    window._pdfPage = num;
    pdf.getPage(num).then(function(page) {
        var scale = (window.innerWidth > 768) ? 1.5 : 1.0;
        var viewport = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.style.borderRadius = '6px';
        page.render({ canvasContext: ctx, viewport: viewport });

        var body = document.getElementById('lightboxBody');
        body.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.8rem;width:100%;height:100%;overflow-y:auto;padding:0.5rem;';
        wrap.appendChild(canvas);

        if (pdf.numPages > 1) {
            var nav = document.createElement('div');
            nav.style.cssText = 'display:flex;align-items:center;gap:0.8rem;position:sticky;bottom:0;background:rgba(0,0,0,0.8);padding:0.6rem 1rem;border-radius:10px;backdrop-filter:blur(8px);';
            nav.innerHTML = '<button onclick="_renderPdfPage(' + (num - 1) + ',\'' + (name||'').replace(/'/g,"\\'") + '\')" ' + (num <= 1 ? 'disabled' : '') + ' style="padding:0.4rem 0.8rem;border-radius:6px;border:none;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:0.8rem;' + (num <= 1 ? 'opacity:0.3;cursor:default;' : '') + '"><i class="fas fa-chevron-left"></i></button>'
                + '<span style="color:rgba(255,255,255,0.8);font-size:0.8rem;white-space:nowrap;">' + num + ' / ' + pdf.numPages + '</span>'
                + '<button onclick="_renderPdfPage(' + (num + 1) + ',\'' + (name||'').replace(/'/g,"\\'") + '\')" ' + (num >= pdf.numPages ? 'disabled' : '') + ' style="padding:0.4rem 0.8rem;border-radius:6px;border:none;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:0.8rem;' + (num >= pdf.numPages ? 'opacity:0.3;cursor:default;' : '') + '"><i class="fas fa-chevron-right"></i></button>'
                + '<a href="' + window._pdfSrc + '" target="_blank" download style="padding:0.4rem 0.8rem;border-radius:6px;background:var(--primary);color:#fff;text-decoration:none;font-size:0.8rem;"><i class="fas fa-download"></i></a>';
            wrap.appendChild(nav);
        } else {
            var dl = document.createElement('div');
            dl.style.cssText = 'position:sticky;bottom:0;padding:0.6rem;';
            dl.innerHTML = '<a href="' + window._pdfSrc + '" target="_blank" download style="padding:0.5rem 1rem;border-radius:6px;background:var(--primary);color:#fff;text-decoration:none;font-size:0.8rem;"><i class="fas fa-download"></i> Descargar</a>';
            wrap.appendChild(dl);
        }
        body.appendChild(wrap);
    });
}

function createToastContainer() {
    if (document.getElementById('toastContainer')) return;
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
}

function showToast(message, type = 'info', timeout = 3500) {
    createToastContainer();
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<strong>${type === 'success' ? 'Éxito' : type === 'error' ? 'Error' : 'Info'}</strong><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, timeout);
}

function showSuccess(message, timeout) { showToast(message, 'success', timeout); }
function showError(message, timeout) { showToast(message, 'error', timeout); }
function showInfo(message, timeout) { showToast(message, 'info', timeout); }

// ============================================================================
// SAFETY CHECK — Prevenir pantalla negra
// ============================================================================
function ensureVisibility() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent && mainContent.style.display === 'none') {
        mainContent.style.display = 'block';
        console.warn('⚠️ Fixed: .main-content was hidden, restored to display:block');
    }
    
    const steps = document.querySelectorAll('[data-step]');
    steps.forEach((step, idx) => {
        if (step.style.display === 'none' && idx === 0) {
            step.style.display = 'block';
            console.warn('⚠️ Fixed: First step was hidden, restored to display:block');
        }
    });
    
    // Remover cualquier spinner/loader que haya fallado
    const spinner = document.querySelector('.loading-overlay, .spinner-overlay, [class*="loader"]');
    if (spinner && spinner.style.display !== 'none') {
        const timeout = setTimeout(() => {
            if (spinner.parentElement) spinner.remove();
            console.warn('⚠️ Fixed: Removed stuck loader after timeout');
        }, 8000);
        spinner.dataset.safetyTimeout = timeout;
    }
}

function setButtonLoading(button, loading, text = null) {
    if (!button) return;
    if (loading) {
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text || 'Cargando...'}`;
        button.disabled = true;
    } else {
        button.innerHTML = button.dataset.originalText || button.innerHTML;
        button.disabled = false;
    }
}

// =============================================
// MULTIMEDIA UPLOAD ZONES
// =============================================
function setupMultimediaZones() {
    const uploadZones = document.querySelectorAll('.upload-zone');
    uploadZones.forEach(zone => {
        if (zone.dataset.initialized || zone.dataset.skipMultimedia) return;
        zone.dataset.initialized = 'true';

        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx';
        input.style.display = 'none';
        input.className = 'upload-file-input';
        zone.appendChild(input);

        zone.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') input.click();
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--primary)';
            zone.style.background = 'rgba(59,130,246,0.08)';
        });

        zone.addEventListener('dragleave', () => {
            zone.style.borderColor = '';
            zone.style.background = '';
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = '';
            zone.style.background = '';
            // Merge dropped files with input
            const dt = new DataTransfer();
            if (input.files) Array.from(input.files).forEach(f => dt.items.add(f));
            Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
            input.files = dt.files;
            renderNewFilePreviews(input.files, zone);
        });

        input.addEventListener('change', () => {
            // Acumular archivos: merge con los existentes
            if (input._prevFiles && input._prevFiles.length) {
                const dt = new DataTransfer();
                Array.from(input._prevFiles).forEach(f => dt.items.add(f));
                Array.from(input.files).forEach(f => dt.items.add(f));
                input.files = dt.files;
            }
            input._prevFiles = input.files;
            renderNewFilePreviews(input.files, zone);
        });
    });
}

function setupSidebarToggle() {
    const toggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const appShell = document.querySelector('.app-shell');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    if (!toggle || !sidebar) return;

    // Desktop collapse toggle
    if (collapseBtn && appShell) {
        // Restore saved state
        const saved = localStorage.getItem('figue:sidebar:compact');
        if (saved === 'true' && window.innerWidth > 768) {
            appShell.classList.add('sidebar-compact');
        }
        collapseBtn.addEventListener('click', () => {
            if (window.innerWidth <= 768) return;
            const isCompact = appShell.classList.toggle('sidebar-compact');
            localStorage.setItem('figue:sidebar:compact', isCompact);
            // Reset groups when toggling compact mode
            if (isCompact) {
                // Expand all groups in compact mode
                document.querySelectorAll('.nav-group-title.collapsed').forEach(t => {
                    t.classList.remove('collapsed');
                });
                document.querySelectorAll('.nav-item[style*="display: none"]').forEach(item => {
                    item.style.display = '';
                });
            } else {
                // Re-apply saved group states
                setupNavGroups();
            }
        });
        // Auto-collapse on small desktop (<= 1280px) if not explicitly set
        if (!localStorage.getItem('figue:sidebar:compact')) {
            if (window.innerWidth <= 1280 && window.innerWidth > 768) {
                appShell.classList.add('sidebar-compact');
                localStorage.setItem('figue:sidebar:compact', 'true');
            }
        }
    }

    // Mobile overlay
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);
    }
    function openSidebar() {
        sidebar.classList.add('mobile-active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeSidebar() {
        sidebar.classList.remove('mobile-active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            if (sidebar.classList.contains('mobile-active')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        }
    });
    overlay.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });
    sidebar.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) closeSidebar();
        });
    });
}

function openMobileSidebar() {
    const sb = document.querySelector('.form-sidebar');
    if (sb && window.innerWidth <= 768) {
        sb.classList.add('mobile-open');
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileSidebar() {
    const sb = document.querySelector('.form-sidebar');
    if (sb) {
        sb.classList.remove('mobile-open');
        document.body.style.overflow = '';
    }
}

function renderSkeletonCards(container, count = 6) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'skeleton-card animate-fade-in-up';
        sk.innerHTML = '<div class="sk-thumb"></div><div class="sk-line"></div><div class="sk-line short"></div>';
        container.appendChild(sk);
    }
}

/**
 * Render an empty state with optional CTA
 * @param {HTMLElement} container
 * @param {object} opts - { icon, title, description, btnText, btnAction }
 */
function renderEmptyState(container, opts = {}) {
    const icon = opts.icon || 'fas fa-inbox';
    const title = opts.title || 'Sin registros';
    const desc = opts.description || '';
    const btnText = opts.btnText || '';
    const btnAction = opts.btnAction || null;
    container.innerHTML = `
        <div class="empty-state animate-fade-in-up">
            <i class="${icon}"></i>
            <p><strong>${escapeHtml(title)}</strong></p>
            ${desc ? `<p style="font-size:0.82rem;color:var(--text-tertiary);margin-top:0.3rem;">${escapeHtml(desc)}</p>` : ''}
            ${btnText && btnAction ? `<button class="btn btn-sm btn-primary" style="margin-top:0.75rem;" id="_emptyCtaBtn">${btnText}</button>` : ''}
        </div>`;
    if (btnAction) {
        const btn = container.querySelector('#_emptyCtaBtn');
        if (btn) btn.addEventListener('click', btnAction);
    }
}

const DraftBanner = {
    show(moduleKey, onRestore, onDiscard) {
        let banner = document.getElementById('draftBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'draftBanner';
            banner.className = 'draft-banner';
            banner.innerHTML = `<i class="fas fa-history"></i><span id="draftBannerMsg">Borrador detectado</span>
                <button id="btnDraftRestore">Restaurar</button>
                <button id="btnDraftDiscard" class="btn-discard">Descartar</button>`;
            document.body.appendChild(banner);
            document.getElementById('btnDraftRestore').addEventListener('click', () => {
                banner.classList.remove('visible');
                if (onRestore) onRestore();
            });
            document.getElementById('btnDraftDiscard').addEventListener('click', () => {
                banner.classList.remove('visible');
                DraftManager.clear(moduleKey);
                if (onDiscard) onDiscard();
            });
        }
        const draft = DraftManager.load(moduleKey);
        if (draft && !draft._recordId) {
            const ago = draft._savedAt ? Math.round((Date.now() - draft._savedAt) / 60000) : '?';
            document.getElementById('draftBannerMsg').textContent = `Borrador detectado (${ago} min atrás)`;
            banner.classList.remove('auto-dismiss');
            banner.classList.add('visible');
            // Auto-dismiss after 8 seconds
            setTimeout(() => { banner.classList.add('auto-dismiss'); }, 100);
            // Fully hide after animation ends
            setTimeout(() => { banner.classList.remove('visible', 'auto-dismiss'); }, 8100);
        }
    },
    hide() {
        const b = document.getElementById('draftBanner');
        if (b) b.classList.remove('visible');
    }
};

// ============================================================================
// NAVSTATE — History API + popstate + wizard URL state
// ============================================================================
const NavState = {
    _callbacks: {},

    /** Push a module page into history */
    pushModule(module, title) {
        const url = module + '.html';
        history.pushState({ type: 'module', module }, title || module, url);
    },

    /** Push a record detail/edit into history */
    pushRecord(module, id, title) {
        const url = `${module}.html?id=${id}`;
        history.pushState({ type: 'record', module, id }, title || `${module} #${id}`, url);
    },

    /** Push wizard step into history (replaces to avoid back-button spam) */
    pushWizard(module, step, extra = {}) {
        const params = new URLSearchParams(window.location.search);
        params.set('step', step);
        if (extra.id) params.set('id', extra.id);
        const url = `${module}.html?${params.toString()}`;
        history.replaceState({ type: 'wizard', module, step, ...extra }, '', url);
    },

    /** Read current state from URL */
    get() {
        const params = new URLSearchParams(window.location.search);
        const module = window.location.pathname.split('/').pop().replace('.html', '');
        return {
            module,
            id: params.get('id') || null,
            step: params.get('step') ? parseInt(params.get('step')) : null,
            params
        };
    },

    /** Register a popstate handler for a specific type */
    onPop(type, fn) {
        if (!this._callbacks[type]) this._callbacks[type] = [];
        this._callbacks[type].push(fn);
    },

    /** Handle popstate events */
    handlePop(e) {
        const state = e.state || {};
        const type = state.type || 'module';
        const cbs = this._callbacks[type] || [];
        cbs.forEach(fn => fn(state));
        // Also call 'all' handlers
        (this._callbacks['all'] || []).forEach(fn => fn(state));
    },

    /** Parse search params helper */
    getParam(key) {
        return new URLSearchParams(window.location.search).get(key);
    },

    /** Set URL param without navigation */
    setParam(key, value) {
        const params = new URLSearchParams(window.location.search);
        if (value === null || value === undefined) params.delete(key);
        else params.set(key, value);
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        history.replaceState({ ...history.state }, '', newUrl);
    }
};

// Popstate listener
window.addEventListener('popstate', (e) => {
    // 1. Close mobile sidebar first to prevent the "back button" from just closing the sidebar 
    // while keeping the URL state (which feels like a broken back button)
    closeMobileSidebar();
    
    // 2. Handle state callbacks
    NavState.handlePop(e);
});

// ============================================================================
// GLOBAL KEYBOARD SHORTCUTS
// ============================================================================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Skip if user is typing in an input/textarea/select
        const tag = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        const isContentEditable = e.target.isContentEditable;

        // Escape — close everything
        if (e.key === 'Escape') {
            // Close lightbox
            const lb = document.getElementById('mediaLightbox');
            if (lb && lb.classList.contains('active')) { closeLightbox(); e.preventDefault(); return; }
            // Close options manager
            const om = document.querySelector('.options-overlay');
            if (om) { om.remove(); e.preventDefault(); return; }
            // Close mobile sidebar
            const fs = document.querySelector('.form-sidebar.mobile-open');
            if (fs) { closeMobileSidebar(); e.preventDefault(); return; }
            // Close nav sidebar (already handled in setupSidebarToggle)
            return;
        }

        // Shortcuts that don't work when typing
        if (isInput || isContentEditable) return;

        // N — Nuevo registro
        if (e.key === 'n' || e.key === 'N') {
            const btnNuevo = document.getElementById('btnNuevo');
            if (btnNuevo && !btnNuevo.disabled) {
                btnNuevo.click();
                e.preventDefault();
            }
            return;
        }

        // / — Focus search (forward slash)
        if (e.key === '/') {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
                e.preventDefault();
            }
            return;
        }

        // Ctrl+S — Submit active form
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            const form = document.querySelector('.form-sidebar.mobile-open #dataForm, #dataForm');
            if (form) {
                form.dispatchEvent(new Event('submit', { cancelable: true }));
                e.preventDefault();
            }
            return;
        }

        // ← → — Wizard navigation (for presupuestos)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const wizard = document.querySelector('.wizard-progress');
            if (!wizard) return;
            const btn = e.key === 'ArrowLeft' ? document.getElementById('btnPrev') : document.getElementById('btnNext');
            if (btn && btn.style.display !== 'none') {
                btn.click();
                e.preventDefault();
            }
        }
    });
}

// ============================================================================
// BREADCRUMBS
// ============================================================================
const Breadcrumbs = {
    /**
     * Render breadcrumb trail
     * @param {Array} items — Array of { label, url? } or strings
     * @param {HTMLElement|string} container — Element or selector to render into
     */
    render(items, container) {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) return;
        el.innerHTML = items.map((item, i) => {
            const label = typeof item === 'string' ? item : item.label;
            const url = typeof item === 'string' ? null : item.url;
            const isLast = i === items.length - 1;
            if (isLast) return `<span class="current">${label}</span>`;
            if (url) return `<a href="${url}">${label}</a><span class="sep">›</span>`;
            return `<span>${label}</span><span class="sep">›</span>`;
        }).join('');
    },

    /**
     * Update the last crumb (current page title)
     */
    update(title) {
        const el = document.querySelector('.breadcrumbs');
        if (!el) return;
        const current = el.querySelector('.current');
        if (current) current.textContent = title;
    },

    /**
     * Auto-init from the page title
     */
    auto(moduleName, moduleLabel) {
        const container = document.querySelector('.breadcrumbs');
        if (!container) return;
        this.render([
            { label: 'Inicio', url: 'dashboard.html' },
            { label: moduleLabel || moduleName }
        ], container);
    }
};

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================
const FocusTrap = {
    _active: null,
    _lastFocused: null,

    /**
     * Trap focus within an element
     * @param {HTMLElement} el
     */
    trap(el) {
        this.release();
        this._active = el;
        this._lastFocused = document.activeElement;
        // Focus first focusable element
        const first = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (first) first.focus();
        el.addEventListener('keydown', this._handler);
    },

    _handler(e) {
        if (e.key !== 'Tab') return;
        const focusable = FocusTrap._active.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    },

    /**
     * Release focus trap
     */
    release() {
        if (this._active) {
            this._active.removeEventListener('keydown', this._handler);
            if (this._lastFocused && this._lastFocused.focus) {
                this._lastFocused.focus();
            }
        }
        this._active = null;
        this._lastFocused = null;
    }
};

// ============================================================================
// DYNAMIC SIDEBAR ACTIVE STATE
// ============================================================================
function setActiveNavItem() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href');
        item.classList.toggle('active', href === currentPage);
    });
}

// ============================================================================
// NAV COUNTS — lightweight polling for sidebar badges
// ============================================================================
function loadNavCounts() {
    const api = API_ROOT + 'nav_counts_api.php';
    fetch(api)
        .then(r => r.json())
        .then(d => {
            if (!d.success || !d.data) return;
            const c = d.data;

            // Update sidebar badges
            Object.keys(c).forEach(key => {
                const el = document.getElementById('nav-count-' + key);
                if (!el) return;
                const val = parseInt(c[key]) || 0;
                if (val > 0) {
                    el.textContent = val;
                    el.style.display = 'inline';
                } else {
                    el.textContent = '';
                    el.style.display = 'none';
                }
            });

            // Update bottom nav badge dots
            const bnMap = {
                'ots': 'ordenes_trabajo.html',
                'recepciones': 'recepcion_unificada.html',
                'presupuestos': 'presupuestos.html',
                'pagos': 'pagos.html',
                'clientes': 'clientes.html',
                'tareas': 'tareas_diarias.html',
            };
            Object.keys(bnMap).forEach(key => {
                const href = bnMap[key];
                const val = parseInt(c[key]) || 0;
                const bnItems = document.querySelectorAll('.bottom-nav-item');
                let target = null;
                bnItems.forEach(item => {
                    if (item.getAttribute('href') === href) target = item;
                });
                if (!target) return;
                let dot = target.querySelector('.nav-badge-dot');
                if (val > 0) {
                    if (!dot) {
                        dot = document.createElement('span');
                        dot.className = 'nav-badge-dot';
                        target.appendChild(dot);
                    }
                    if (val > 99) {
                        dot.textContent = '99+';
                        dot.classList.add('count');
                    } else if (val > 1) {
                        dot.textContent = val > 9 ? '9+' : val;
                        dot.classList.add('count');
                    } else {
                        dot.textContent = '';
                        dot.classList.remove('count');
                    }
                } else {
                    if (dot) dot.remove();
                }
            });
        })
        .catch(() => {}); // silent fail
}

// Start polling on DOMContentLoaded
let _navCountsInterval = null;
document.addEventListener('DOMContentLoaded', () => {
    // Skip on public pages (no sidebar = no session required)
    if (!document.querySelector('.sidebar, .nav-menu')) return;
    loadNavCounts();
    _navCountsInterval = setInterval(loadNavCounts, 60000);
});
// Also reload on pageshow/focus
window.addEventListener('pageshow', () => {
    if (!document.querySelector('.sidebar, .nav-menu')) return;
    loadNavCounts();
});
window.addEventListener('focus', () => {
    if (!document.querySelector('.sidebar, .nav-menu')) return;
    loadNavCounts();
    if (_navCountsInterval) {
        clearInterval(_navCountsInterval);
        _navCountsInterval = setInterval(loadNavCounts, 60000);
    }
});

// ============================================================================
// COLLAPSIBLE NAV GROUPS
// ============================================================================
function setupNavGroups() {
    const nav = document.querySelector('.nav-menu');
    if (!nav) return;
    const groups = nav.querySelectorAll('.nav-group-title');
    if (!groups.length) return;

    groups.forEach((title, idx) => {
        // Add chevron if not present
        if (!title.querySelector('.group-chevron')) {
            const chevron = document.createElement('i');
            chevron.className = 'fas fa-chevron-down group-chevron';
            title.appendChild(chevron);
        }

        // Find items between this title and the next title (or end of nav)
        const items = [];
        let el = title.nextElementSibling;
        const nextTitle = groups[idx + 1];
        while (el) {
            if (el === nextTitle) break;
            if (el.classList.contains('nav-item')) {
                items.push(el);
            }
            el = el.nextElementSibling;
        }

        // Restore saved state
        const savedKey = 'figue:navgroup:' + idx;
        const saved = localStorage.getItem(savedKey);
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const hasActive = items.some(item => item.classList.contains('active'));

        if (hasActive) {
            // Keep expanded if active page is in this group
            title.classList.remove('collapsed');
            items.forEach(item => item.style.display = '');
            localStorage.setItem(savedKey, 'expanded');
        } else if (saved === 'collapsed') {
            title.classList.add('collapsed');
            items.forEach(item => item.style.display = 'none');
        }

        // Click handler
        title.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) return; // don't collapse on mobile
            const isCompact = document.querySelector('.app-shell.sidebar-compact');
            if (isCompact) return; // don't collapse in compact mode

            const wasCollapsed = title.classList.toggle('collapsed');
            items.forEach(item => {
                item.style.display = wasCollapsed ? 'none' : '';
            });
            localStorage.setItem(savedKey, wasCollapsed ? 'collapsed' : 'expanded');
        });
    });
}

// ============================================================================
// SIDEBAR SEARCH / FILTER
// ============================================================================
function setupNavSearch() {
    const wrap = document.querySelector('.nav-search-wrap');
    if (!wrap) return;
    const input = wrap.querySelector('input');
    if (!input) return;
    const emptyMsg = wrap.nextElementSibling?.classList.contains('nav-search-empty')
        ? wrap.nextElementSibling : null;

    const allNavItems = document.querySelectorAll('.nav-item');
    const allGroups = document.querySelectorAll('.nav-group-title');

    // Get items per group for filtering
    function getItemsPerGroup() {
        const result = [];
        allGroups.forEach((g, idx) => {
            const items = [];
            let el = g.nextElementSibling;
            const next = allGroups[idx + 1];
            while (el) {
                if (el === next) break;
                if (el.classList.contains('nav-item')) items.push(el);
                el = el.nextElementSibling;
            }
            result.push({ title: g, items });
        });
        return result;
    }

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const q = input.value.trim().toLowerCase();
            let anyVisible = false;

            if (!q) {
                // Reset all
                allNavItems.forEach(item => item.style.display = '');
                allGroups.forEach(g => {
                    g.style.display = '';
                    // Restore collapse state if saved
                });
                if (emptyMsg) emptyMsg.classList.remove('visible');
                // Restore group collapse states
                setupNavGroups();
                return;
            }

            const groupsData = getItemsPerGroup();
            let totalVisible = 0;

            groupsData.forEach(({ title, items }) => {
                let groupHasVisible = false;
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const matches = text.includes(q);
                    item.style.display = matches ? '' : 'none';
                    if (matches) {
                        groupHasVisible = true;
                        totalVisible++;
                    }
                });
                title.style.display = groupHasVisible ? '' : 'none';
                if (groupHasVisible) anyVisible = true;

                // Expand group if it has matches and is collapsed
                if (groupHasVisible && title.classList.contains('collapsed')) {
                    title.classList.remove('collapsed');
                    items.forEach(item => item.style.display = '');
                }
            });

            if (emptyMsg) {
                emptyMsg.classList.toggle('visible', totalVisible === 0);
            }

            // Un-collapse any group that has matches
        }, 150); // debounce 150ms
    });

    // Clear on Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            input.dispatchEvent(new Event('input'));
            input.blur();
        }
    });
}

// Called from DOMContentLoaded and setupSidebarToggle
function initNavFeatures() {
    setupNavGroups();
    setupNavSearch();
}

// ============================================================================
// FORM VALIDATION UTILITIES
// ============================================================================
/**
 * Show error state on a form field
 * @param {HTMLElement} input - The input/select/textarea element
 * @param {string} message - Error message to display
 */
function showFieldError(input, message) {
    input.classList.add('field-error');
    input.classList.remove('field-success');
    const group = input.closest('.form-group');
    if (group) group.classList.add('has-error');
    // Find or create .form-error element
    let errEl = input.parentElement?.querySelector('.form-error');
    if (!errEl && group) {
        errEl = group.querySelector('.form-error');
    }
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'form-error';
        if (group) {
            group.appendChild(errEl);
        } else {
            input.parentElement?.appendChild(errEl);
        }
    }
    errEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + escapeHtml(message);
    errEl.classList.add('visible');
}

/**
 * Clear error state from a form field
 */
function clearFieldError(input) {
    input.classList.remove('field-error');
    const group = input.closest('.form-group');
    if (group) group.classList.remove('has-error');
    const errEl = group ? group.querySelector('.form-error') : input.parentElement?.querySelector('.form-error');
    if (errEl) {
        errEl.classList.remove('visible');
        errEl.innerHTML = '';
    }
}

/**
 * Clear all errors in a form
 */
function clearAllFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach(el => {
        el.classList.remove('field-error');
    });
    form.querySelectorAll('.has-error').forEach(el => {
        el.classList.remove('has-error');
    });
    form.querySelectorAll('.form-error.visible').forEach(el => {
        el.classList.remove('visible');
        el.innerHTML = '';
    });
}

/**
 * Set success state on a field
 */
function showFieldSuccess(input) {
    input.classList.remove('field-error');
    input.classList.add('field-success');
    const group = input.closest('.form-group');
    if (group) group.classList.remove('has-error');
}

/**
 * Validate a single field against rules
 * @param {HTMLElement} input
 * @param {object} rules - { required?: bool, minLength?: number, maxLength?: number, pattern?: RegExp, message?: string }
 * @returns {boolean} - true if valid
 */
function validateField(input, rules) {
    clearFieldError(input);
    const val = (input.value || '').trim();
    if (rules.required && !val) {
        showFieldError(input, rules.message || 'Este campo es obligatorio');
        return false;
    }
    if (rules.minLength && val.length < rules.minLength) {
        showFieldError(input, rules.message || `Mínimo ${rules.minLength} caracteres`);
        return false;
    }
    if (rules.maxLength && val.length > rules.maxLength) {
        showFieldError(input, rules.message || `Máximo ${rules.maxLength} caracteres`);
        return false;
    }
    if (rules.pattern && val && !rules.pattern.test(val)) {
        showFieldError(input, rules.message || 'Formato inválido');
        return false;
    }
    if (rules.custom && !rules.custom(val, input)) {
        showFieldError(input, rules.message || 'Valor inválido');
        return false;
    }
    showFieldSuccess(input);
    return true;
}

/**
 * Validador de formularios genérico (consolidado)
 * @param {string|HTMLElement} form - form ID or form element
 * @param {object} rules - { fieldId: { required, minLength, maxLength, pattern, custom, type: 'email'|'rut' } }
 * @returns {boolean} - true if all fields valid
 */
function validateForm(form, rules) {
    const formEl = typeof form === 'string' ? document.getElementById(form) : form;
    if (!formEl) return true;
    clearAllFieldErrors(formEl);
    let valid = true;
    for (const fieldId in rules) {
        const input = formEl.querySelector(`[name="${fieldId}"]`) || document.getElementById(fieldId);
        if (!input) continue;
        const val = input.value.trim();
        const rule = rules[fieldId];
        let fieldValid = true;
        if (rule.required && val === '') {
            markFieldError(input, `El campo ${fieldId} es requerido`);
            fieldValid = false;
        } else if (val !== '') {
            if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
                markFieldError(input, 'Email inválido');
                fieldValid = false;
            } else if (rule.type === 'rut' && !validateRutCL(val)) {
                markFieldError(input, 'RUT inválido');
                fieldValid = false;
            } else if (rule.minLength && val.length < rule.minLength) {
                markFieldError(input, `Mínimo ${rule.minLength} caracteres`);
                fieldValid = false;
            } else if (rule.maxLength && val.length > rule.maxLength) {
                markFieldError(input, `Máximo ${rule.maxLength} caracteres`);
                fieldValid = false;
            } else if (rule.pattern && !rule.pattern.test(val)) {
                markFieldError(input, rule.patternMessage || 'Formato inválido');
                fieldValid = false;
            } else if (rule.custom && !rule.custom(val)) {
                markFieldError(input, rule.customMessage || 'Valor inválido');
                fieldValid = false;
            } else {
                markFieldOk(input);
            }
        }
        if (!fieldValid) valid = false;
    }
    if (!valid) {
        const firstError = formEl.querySelector('.field-error');
        if (firstError) firstError.focus();
    }
    return valid;
}

function renderNewFilePreviews(files, zone) {
    const container = zone.closest('.multimedia-area') || zone.closest('.upload-zone') || zone.parentElement;
    if (!container) return;
    let grid = container.querySelector('.new-preview-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'preview-grid new-preview-grid';
        grid.style.marginTop = '1rem';
        zone.parentNode.insertBefore(grid, zone.nextSibling);
    }
    grid.innerHTML = '';

    Array.from(files).forEach(file => {
        const item = document.createElement('div');
        item.className = 'preview-item';

        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            item.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            item.innerHTML = `<div class="preview-icon"><i class="fas fa-video"></i><span>${file.name}</span></div>`;
        } else if (file.type.startsWith('audio/')) {
            item.innerHTML = `<div class="preview-icon"><i class="fas fa-microphone"></i><span>${file.name}</span></div>`;
        } else {
            item.innerHTML = `<div class="preview-icon"><i class="fas fa-file"></i><span>${file.name}</span></div>`;
        }
        grid.appendChild(item);
    });
}

// Render existing media from server with lightbox click, delete button
function renderExistingMedia(archivos, containerId, gridId, apiModule) {
    const container = document.getElementById(containerId);
    const grid = document.getElementById(gridId);
    if (!archivos || archivos.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    grid.innerHTML = '';

    archivos.forEach(a => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.style.position = 'relative';

        if (a.tipo_archivo === 'foto') {
            const thumbSrc = a.ruta_thumbnail || a.ruta_archivo;
            item.innerHTML = `<img src="${escapeHtml(thumbSrc)}" title="${escapeHtml(a.nombre_original)}" loading="lazy" style="cursor:pointer;">`;
            item.querySelector('img').addEventListener('click', () => openLightbox('foto', a.ruta_archivo, a.nombre_original));
        } else if (a.tipo_archivo === 'video') {
            item.innerHTML = `<div class="preview-icon" style="cursor:pointer;"><i class="fas fa-play-circle" style="font-size:2rem;"></i><span>${a.nombre_original}</span></div>`;
            item.addEventListener('click', () => openLightbox('video', a.ruta_archivo, a.nombre_original));
        } else if (a.tipo_archivo === 'nota_voz') {
            item.innerHTML = `<div class="preview-icon" style="cursor:pointer;"><i class="fas fa-microphone"></i><span>${a.nombre_original}</span></div>`;
            item.addEventListener('click', () => openLightbox('nota_voz', a.ruta_archivo, a.nombre_original));
        } else {
            item.innerHTML = `<div class="preview-icon" style="cursor:pointer;"><i class="fas fa-file-alt"></i><span>${a.nombre_original}</span></div>`;
            item.addEventListener('click', () => openLightbox('documento', a.ruta_archivo, a.nombre_original));
        }

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'media-delete-btn';
        delBtn.innerHTML = '<i class="fas fa-times"></i>';
        delBtn.title = 'Eliminar archivo';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('¿Eliminar este archivo?')) return;
            const fd = new FormData();
            fd.append('media_id', a.id);
            try {
                const res = await fetch(API_ROOT + 'opciones_api.php?action=delete_media', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.status === 'success') {
                    item.remove();
                    if (grid.children.length === 0) container.style.display = 'none';
                }
            } catch (err) { console.error(err); }
        });
        item.appendChild(delBtn);
        grid.appendChild(item);
    });
}

// =============================================
// LINKED SELECT LOADERS (Cargar datos de otra tabla)
// =============================================
async function loadLinkedSelect(selectId, tabla, selectedValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    try {
        const res = await fetch(`${API_ROOT}opciones_api.php?action=linked&tabla=${tabla}`);
        const data = await res.json();
        if (data.status === 'success') {
            const firstOpt = sel.options[0];
            sel.innerHTML = '';
            if (firstOpt) sel.appendChild(firstOpt);
            data.data.forEach(item => {
                const opt = new Option(item.display_name, item.id);
                sel.appendChild(opt);
            });
            if (selectedValue) sel.value = selectedValue;
        }
    } catch (err) { console.error(`Error loading ${tabla}:`, err); }
}

async function loadDynamicOptions(selectId, categoria, selectedValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    try {
        const res = await fetch(`${API_ROOT}opciones_api.php?action=opciones&categoria=${encodeURIComponent(categoria)}`);
        const data = await res.json();
        if (data.status === 'success') {
            const firstOpt = sel.options[0];
            sel.innerHTML = '';
            if (firstOpt) sel.appendChild(firstOpt);
            data.data.forEach(val => {
                sel.appendChild(new Option(val, val));
            });
            if (selectedValue) {
                let found = false;
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === selectedValue) { found = true; break; }
                }
                if (!found) sel.appendChild(new Option(selectedValue, selectedValue));
                sel.value = selectedValue;
            }
        } else {
            console.error(`Error loading ${categoria}: ${data.message}`);
        }
    } catch (err) { console.error(`Error loading ${categoria}:`, err); }
}

// Devuelve un FormData basado en el formulario pero sin campos con valores vacíos ('')
function prepareSanitizedFormData(form) {
    if (!form) return new FormData();
    const fd = new FormData(form);
    // Recorre y elimina entradas vacías para evitar enviar '' en columnas integer
    for (const key of Array.from(fd.keys())) {
        const val = fd.get(key);
        if (val === '' || val === null) fd.delete(key);
    }
    return fd;
}

// ============================================================================
// UPLOAD WITH PROGRESS — Reemplaza fetch() para uploads con barra de progreso
// ============================================================================
function _ensureUploadOverlay() {
    if (document.getElementById('uploadProgressOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'uploadProgressOverlay';
    overlay.className = 'upload-progress-overlay';
    overlay.innerHTML = `
        <div class="upload-progress-card">
            <div class="upload-progress-icon"><i class="fas fa-cloud-upload-alt"></i></div>
            <div class="upload-progress-title">Subiendo archivos...</div>
            <div class="upload-progress-subtitle" id="uploadProgressSubtitle">Preparando envío</div>
            <div class="upload-progress-bar-track"><div class="upload-progress-bar-fill" id="uploadProgressBar"></div></div>
            <div class="upload-progress-percent" id="uploadProgressPercent">0%</div>
            <div class="upload-progress-detail" id="uploadProgressDetail"></div>
        </div>`;
    document.body.appendChild(overlay);
}

function _showUploadOverlay(fileCount) {
    _ensureUploadOverlay();
    const overlay = document.getElementById('uploadProgressOverlay');
    const sub = document.getElementById('uploadProgressSubtitle');
    const bar = document.getElementById('uploadProgressBar');
    const pct = document.getElementById('uploadProgressPercent');
    const det = document.getElementById('uploadProgressDetail');
    sub.textContent = fileCount ? `Subiendo ${fileCount} archivo${fileCount > 1 ? 's' : ''}...` : 'Subiendo...';
    bar.style.width = '0%';
    pct.textContent = '0%';
    det.textContent = '';
    overlay.classList.add('active');
}

function _updateUploadOverlay(loaded, total) {
    const bar = document.getElementById('uploadProgressBar');
    const pct = document.getElementById('uploadProgressPercent');
    const det = document.getElementById('uploadProgressDetail');
    if (!bar) return;
    const pctNum = total > 0 ? Math.round((loaded / total) * 100) : 0;
    bar.style.width = pctNum + '%';
    pct.textContent = pctNum + '%';
    if (total > 0) {
        const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
        const totalMB = (total / (1024 * 1024)).toFixed(1);
        det.textContent = `${loadedMB} MB / ${totalMB} MB`;
    }
}

function _hideUploadOverlay() {
    const overlay = document.getElementById('uploadProgressOverlay');
    if (overlay) {
        const bar = document.getElementById('uploadProgressBar');
        if (bar) bar.style.width = '100%';
        const pct = document.getElementById('uploadProgressPercent');
        if (pct) pct.textContent = '100%';
        setTimeout(() => overlay.classList.remove('active'), 400);
    }
}

/**
 * Sube un FormData con barra de progreso visual.
 * Retorna Promise<{status, data, message}> igual que fetch.
 * @param {string} url - Endpoint POST
 * @param {FormData} formData - Datos a enviar
 * @param {object} [opts] - Opciones extra: { method, onProgress }
 */
function uploadWithProgress(url, formData, opts = {}) {
    return new Promise((resolve, reject) => {
        // Contar archivos para el mensaje
        let fileCount = 0;
        for (const key of formData.keys()) {
            if (formData.get(key) instanceof File) fileCount++;
        }
        _showUploadOverlay(fileCount);

        const xhr = new XMLHttpRequest();
        xhr.open(opts.method || 'POST', url, true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                _updateUploadOverlay(e.loaded, e.total);
            }
        };

        xhr.onload = () => {
            _hideUploadOverlay();
            try {
                const json = JSON.parse(xhr.responseText);
                resolve(json);
            } catch (err) {
                resolve({ status: 'error', message: 'Respuesta inválida del servidor' });
            }
        };

        xhr.onerror = () => {
            _hideUploadOverlay();
            reject(new Error('Error de conexión'));
        };

        xhr.ontimeout = () => {
            _hideUploadOverlay();
            reject(new Error('Tiempo de espera agotado'));
        };

        xhr.timeout = 300000; // 5 minutos
        xhr.send(formData);
    });
}

// ============================================================================
// AUTO-GUARDADO (DRAFT) — Persiste formularios en localStorage
// ============================================================================
const DraftManager = {
    /**
     * Guarda el estado de un formulario en localStorage.
     * @param {string} moduleKey - Identificador del módulo (ej: 'recepcion_unificada')
     * @param {object} data - Datos a guardar
     */
    save(moduleKey, data) {
        try {
            data._savedAt = Date.now();
            localStorage.setItem('draft_' + moduleKey, JSON.stringify(data));
        } catch (e) { /* localStorage lleno o no disponible */ }
    },

    /**
     * Recupera un borrador guardado.
     * @param {string} moduleKey
     * @param {number} [maxAge=3600000] - Tiempo máximo de validez (default 1 hora)
     * @returns {object|null}
     */
    load(moduleKey, maxAge = 3600000) {
        try {
            const raw = localStorage.getItem('draft_' + moduleKey);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Date.now() - (data._savedAt || 0) > maxAge) {
                localStorage.removeItem('draft_' + moduleKey);
                return null;
            }
            return data;
        } catch (e) { return null; }
    },

    /**
     * Elimina un borrador.
     */
    clear(moduleKey) {
        localStorage.removeItem('draft_' + moduleKey);
    },

    /**
     * Verifica si existe un borrador.
     */
    has(moduleKey) {
        return !!localStorage.getItem('draft_' + moduleKey);
    },

    /**
     * Captura todos los valores de un formulario (inputs, selects, textareas).
     * Excluye campos ocultos como id, csrf, etc.
     */
    captureForm(formEl) {
        if (!formEl) return {};
        const data = {};
        const fields = formEl.querySelectorAll('input, select, textarea');
        fields.forEach(f => {
            if (!f.name && !f.id) return;
            const key = f.name || f.id;
            if (['hidden'].includes(f.type) && !f.dataset.draftSave) return;
            if (f.type === 'file') return;
            if (f.type === 'checkbox') { data[key] = f.checked; return; }
            if (f.type === 'radio') { if (f.checked) data[key] = f.value; return; }
            data[key] = f.value;
        });
        return data;
    },

    /**
     * Restaura valores de un formulario desde un objeto.
     */
    restoreForm(formEl, data) {
        if (!formEl || !data) return;
        Object.entries(data).forEach(([key, val]) => {
            if (key.startsWith('_')) return; // skip meta
            const f = formEl.querySelector(`[name="${key}"], #${key}`);
            if (!f) return;
            if (f.type === 'checkbox') { f.checked = val; return; }
            if (f.type === 'radio') { f.checked = (f.value === val); return; }
            f.value = val;
        });
    },

    /**
     * Inicia auto-guardado periódico de un formulario.
     * @param {string} moduleKey
     * @param {HTMLFormElement} formEl
     * @param {object} [extraData] - Datos adicionales (items, step, etc.)
     * @returns {number} interval ID (para cancelar con clearInterval)
     */
    startAutoSave(moduleKey, formEl, extraData = {}) {
        let lastSavedState = null;
        
        const shouldSave = () => {
            const formData = this.captureForm(formEl);
            const currentState = JSON.stringify({ ...formData, ...extraData });
            if (currentState !== lastSavedState) {
                lastSavedState = currentState;
                return true;
            }
            return false;
        };
        
        const interval = setInterval(() => {
            if (shouldSave()) {
                const formData = this.captureForm(formEl);
                this.save(moduleKey, { ...formData, ...extraData });
            }
        }, 5000); // cada 5 segundos
        
        // También guardar al cambiar cualquier campo
        const handler = () => {
            if (shouldSave()) {
                const formData = this.captureForm(formEl);
                this.save(moduleKey, { ...formData, ...extraData });
            }
        };
        formEl.addEventListener('input', handler);
        formEl.addEventListener('change', handler);
        return interval;
    },

    /**
     * Muestra indicador visual de "Borrador restaurado".
     */
    showRestoredBadge(moduleKey) {
        const badge = document.createElement('div');
        badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;background:#f59e0b;color:#000;padding:8px 16px;border-radius:8px;font-size:0.82rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:fadeIn 0.3s ease;cursor:pointer;';
        badge.innerHTML = '<i class="fas fa-undo"></i> Borrador restaurado — clic para descartar';
        badge.addEventListener('click', () => {
            this.clear(moduleKey);
            badge.remove();
            location.reload();
        });
        document.body.appendChild(badge);
        setTimeout(() => badge.remove(), 6000);
    }
};

// =============================================
// VALIDACIONES Y UX
// =============================================

/**
 * Valida RUT chileno
 */
function validateRutCL(rut) {
    if (!rut) return true;
    let value = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    if (value.length < 8) return false;
    
    let dv = value.slice(-1);
    let num = value.slice(0, -1);
    
    let sum = 0;
    let mul = 2;
    for (let i = num.length - 1; i >= 0; i--) {
        sum += num[i] * mul;
        mul = mul === 7 ? 2 : mul + 1;
    }
    
    let res = 11 - (sum % 11);
    let expected = res === 11 ? '0' : res === 10 ? 'K' : res.toString();
    return dv === expected;
}

/**
 * Marca un campo con error visual y muestra mensaje en toast si se desea
 */
function markFieldError(input, message = null) {
    if (!input) return;
    input.classList.add('field-error');
    input.classList.remove('field-success');
    if (message) showError(message);
    
    input.addEventListener('input', () => {
        if (input.value.trim() !== '') {
            input.classList.remove('field-error');
        }
    }, { once: true });
}

function markFieldOk(input) {
    if (!input) return;
    input.classList.remove('field-error');
    input.classList.add('field-success');
}

/**
 * Utilidad Debounce para búsquedas
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * ── LAZY LOADING CON INTERSECTION OBSERVER ──
 * Inicializa lazy loading para imágenes y contenido
 */
function initLazyLoading(container = document) {
    if (!('IntersectionObserver' in window)) return; // Fallback para navegadores viejos
    
    const lazyImages = container.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    }, { rootMargin: '50px' });
    
    lazyImages.forEach(img => imageObserver.observe(img));
}

/**
 * Genera barra de paginación
 */
function renderPagination(containerId, total, perPage, currentPage, onPageClick) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    // If onPageClick is a function, register it globally so onclick can call it
    let fnName;
    if (typeof onPageClick === 'function') {
        fnName = '_pgCb_' + containerId;
        window[fnName] = onPageClick;
    } else {
        fnName = onPageClick;
    }

    let html = '<div class="pagination-bar" style="display:flex; gap:0.5rem; justify-content:center; margin-top:1rem; padding:1rem;">';

    html += `<button class="btn btn-sm btn-outline" ${currentPage === 1 ? 'disabled' : ''} onclick="${fnName}(${currentPage - 1})">Anterior</button>`;

    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);

    for (let i = start; i <= end; i++) {
        html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" onclick="${fnName}(${i})">${i}</button>`;
    }

    html += `<button class="btn btn-sm btn-outline" ${currentPage === totalPages ? 'disabled' : ''} onclick="${fnName}(${currentPage + 1})">Siguiente</button>`;

    html += '</div>';
    container.innerHTML = html;
}

// =============================================
// MOBILE PANEL TOGGLE (list/form tabs)
// =============================================
function setupPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.dataset.panel;
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.list-panel, .form-panel').forEach(p => {
                p.classList.remove('visible-panel', 'hidden-panel');
                if (p.classList.contains(panel + '-panel')) {
                    p.classList.add('visible-panel');
                } else {
                    p.classList.add('hidden-panel');
                }
            });
        });
    });
}

function switchToFormPanel() {
    const formTab = document.querySelector('.panel-tab[data-panel="form"]');
    if (formTab && window.innerWidth <= 768) {
        formTab.click();
    }
}

function switchToListPanel() {
    const listTab = document.querySelector('.panel-tab[data-panel="list"]');
    if (listTab && window.innerWidth <= 768) {
        listTab.click();
    }
}

// ============================================================================
// SISTEMA DE AYUDA CONTEXTUAL POR MÓDULO
// ============================================================================
const MODULE_HELP = {
    'index': {
        title: 'Panel Principal',
        icon: 'fa-home',
        description: 'Vista general del taller con indicadores clave de rendimiento (KPI).',
        sections: [
            { icon: 'fa-chart-line', title: '¿Qué muestra?',
              content: 'Widgets con ventas del mes, compras, OT activas, presupuestos, alertas de stock, cuentas por cobrar/pagar y flujo de caja. El gráfico compara ingresos vs egresos del período.' },
            { icon: 'fa-mouse-pointer', title: 'Uso',
              steps: [
                'Los valores se actualizan automáticamente al cargar la página.',
                'Use el menú lateral para navegar a cada módulo.',
                'Los widgets interactivos muestran resúmenes — haga clic en el menú para ver detalles.'
              ] }
        ]
    },
    'clientes': {
        title: 'Clientes',
        icon: 'fa-users',
        description: 'Registro y gestión de clientes del taller. Permite almacenar datos de contacto, vehículos asociados y documentación.',
        sections: [
            { icon: 'fa-database', title: 'Datos que almacena',
              content: 'Nombre, RUT, teléfono, correo, domicilio, redes sociales, datos bancarios y notas personales. Cada cliente puede tener múltiples vehículos asociados.' },
            { icon: 'fa-search-plus', title: 'Cómo usar',
              steps: [
                '<strong>Nuevo cliente:</strong> Complete el formulario y guarde. El RUT se valida automáticamente.',
                '<strong>Editar:</strong> Haga clic o doble clic en un registro de la lista.',
                '<strong>Buscar:</strong> Escriba en el campo de búsqueda para filtrar por nombre, RUT o teléfono.',
                '<strong>Adjuntar archivos:</strong> Arrastre fotos o documentos al área de carga.'
              ] }
        ]
    },
    'vehiculos': {
        title: 'Vehículos',
        icon: 'fa-car',
        description: 'Registro de vehículos asociados a clientes. Almacena datos técnicos, patente y documentación.',
        sections: [
            { icon: 'fa-cog', title: 'Datos del vehículo',
              content: 'Marca, modelo, año, patente, VIN, color, tipo de combustible, cilindrada, transmisión, tracción y carrocería.' },
            { icon: 'fa-link', title: 'Vinculación',
              content: 'Cada vehículo debe estar asociado a un cliente. Use el selector de cliente al crear o editar.' },
            { icon: 'fa-search', title: 'Búsqueda',
              content: 'Puede buscar por patente, marca o modelo usando el campo de búsqueda.' }
        ]
    },
    'proveedores': {
        title: 'Proveedores',
        icon: 'fa-truck',
        description: 'Directorio de proveedores del taller. Almacena datos de contacto, rubro y observaciones.',
        sections: [
            { icon: 'fa-address-book', title: 'Información',
              content: 'Nombre, RUT, rubro, teléfono, correo, dirección, sitio web, contacto principal.' },
            { icon: 'fa-clipboard-list', title: 'Uso',
              steps: [
                'Los proveedores se vinculan automáticamente con artículos, insumos y compras.',
                'Puede adjuntar documentos como cotizaciones o facturas.'
              ] }
        ]
    },
    'empleados': {
        title: 'Empleados',
        icon: 'fa-user-tie',
        description: 'Gestión del personal del taller: datos personales, laborales y bancarios.',
        sections: [
            { icon: 'fa-id-card', title: 'Información laboral',
              content: 'Cargo, sueldo, fecha de ingreso, fecha de nacimiento, descripción laboral.' },
            { icon: 'fa-university', title: 'Datos bancarios',
              content: 'Banco y cuenta bancaria para depósitos de remuneraciones.' },
            { icon: 'fa-tasks', title: 'Asignación',
              content: 'Los empleados se asignan a órdenes de trabajo y tareas diarias desde sus respectivos módulos.' }
        ]
    },
    'articulos': {
        title: 'Artículos (Repuestos)',
        icon: 'fa-box',
        description: 'Inventario de repuestos y partes. Control de stock, precios y proveedores.',
        sections: [
            { icon: 'fa-cubes', title: 'Control de stock',
              content: 'Cada artículo tiene stock actual, stock mínimo (alerta) y ubicación física en el taller. Cuando el stock baja del mínimo, aparece una alerta en el dashboard.' },
            { icon: 'fa-dollar-sign', title: 'Precios',
              content: 'Registra valor de referencia, valor de compra y valor de venta para cada artículo.' },
            { icon: 'fa-exchange-alt', title: 'Movimientos',
              content: 'Cada entrada o salida de stock se registra automáticamente en el historial de movimientos, permitiendo trazabilidad completa.' }
        ]
    },
    'insumos': {
        title: 'Insumos',
        icon: 'fa-boxes',
        description: 'Inventario de insumos consumibles del taller (lubricantes, filtros, químicos, etc.).',
        sections: [
            { icon: 'fa-tag', title: 'Formato',
              content: 'Cada insumo tiene un formato (litro, kilo, unidad, etc.) para facilitar el control.' },
            { icon: 'fa-chart-bar', title: 'Stock mínimo',
              content: 'Similar a artículos, puede definir stock mínimo para recibir alertas automáticas.' }
        ]
    },
    'trabajos_servicios': {
        title: 'Trabajos y Servicios',
        icon: 'fa-cogs',
        description: 'Catálogo de trabajos y servicios que ofrece el taller, con precios de referencia.',
        sections: [
            { icon: 'fa-wrench', title: '¿Qué es?',
              content: 'Lista de servicios predefinidos (ej: cambio de aceite, alineación, diagnóstico) que se pueden agregar rápidamente a presupuestos y órdenes de trabajo.' },
            { icon: 'fa-clock', title: 'Campos',
              content: 'Nombre del trabajo, descripción, tipo, tiempo estimado de implementación y valor del trabajo.' }
        ]
    },
    'presupuestos': {
        title: 'Presupuestos',
        icon: 'fa-file-invoice-dollar',
        description: 'Creación y gestión de presupuestos para clientes. Incluye servicios, repuestos y permite convertir a orden de trabajo.',
        sections: [
            { icon: 'fa-plus-circle', title: 'Crear presupuesto',
              steps: [
                'Seleccione el vehículo y cliente asociado.',
                'Agregue servicios (desde el catálogo) y artículos con cantidades y valores.',
                'Complete los montos: valor, impuesto, descuento y total.',
                'Guarde el presupuesto. El estado inicial es "borrador".'
              ] },
            { icon: 'fa-arrow-right', title: 'Flujo de trabajo',
              steps: [
                '<strong>Borrador → Pendiente:</strong> Presupuesto listo para presentar al cliente.',
                '<strong>Aprobado:</strong> El cliente aceptó. Puede convertir a OT.',
                '<strong>Convertir a OT:</strong> Genera una orden de trabajo con los mismos ítems.',
                '<strong>Rechazado / Vencido:</strong> Presupuesto no concretado.'
              ] },
            { icon: 'fa-file-pdf', title: 'PDF',
              content: 'Puede generar un PDF profesional del presupuesto para entregar al cliente.' }
        ]
    },
    'ordenes_trabajo': {
        title: 'Órdenes de Trabajo (OT)',
        icon: 'fa-tools',
        description: 'Gestión completa de órdenes de trabajo: desde la recepción hasta la entrega y facturación.',
        sections: [
            { icon: 'fa-clipboard-list', title: 'Creación',
              steps: [
                'Seleccione vehículo y cliente (pueden venir de un presupuesto aprobado).',
                'Asigne un empleado responsable y datos de recepción/inspección.',
                'Agregue servicios a realizar y repuestos a utilizar.',
                'Defina el estado inicial (pendiente).'
              ] },
            { icon: 'fa-sync-alt', title: 'Flujo de estados',
              content: 'Pendiente → En Proceso → Pausado / Esperando Repuesto → Finalizado → Entregado → Facturado. Al finalizar o entregar, se descuenta automáticamente el stock de los artículos utilizados.' },
            { icon: 'fa-exchange-alt', title: 'Conversión',
              content: 'Desde la OT puede generar una venta (facturación). También puede ver el kanban para arrastrar y soltar entre estados.' },
            { icon: 'fa-file-pdf', title: 'PDF',
              content: 'Exporte la OT a PDF con todos los detalles, servicios y artículos separados.' }
        ]
    },
    'compras': {
        title: 'Compras (Egresos)',
        icon: 'fa-shopping-cart',
        description: 'Registro de compras y egresos del taller. Control de pagos y cuentas por pagar.',
        sections: [
            { icon: 'fa-receipt', title: 'Registrar compra',
              steps: [
                'Complete el concepto, proveedor, fecha y monto.',
                'Seleccione forma de pago y cuenta bancaria asociada.',
                'Puede adjuntar factura o documento digital.'
              ] },
            { icon: 'fa-credit-card', title: 'Pagos',
              content: 'Use el botón "Registrar Pago" para marcar pagos. El sistema actualiza automáticamente el estado a "Pagado" cuando el total está cubierto.' }
        ]
    },
    'ventas': {
        title: 'Ventas',
        icon: 'fa-cash-register',
        description: 'Registro de ventas e ingresos del taller. Control de cobros y cuentas por cobrar.',
        sections: [
            { icon: 'fa-chart-line', title: 'Gestión',
              steps: [
                'Puede crear ventas manuales o convertir desde una OT (facturación automática).',
                'Registre pagos parciales o totales.',
                'El estado se actualiza automáticamente al completar los pagos.'
              ] },
            { icon: 'fa-file-invoice', title: 'Vinculación',
              content: 'Las ventas pueden estar vinculadas a presupuestos y órdenes de trabajo para trazabilidad completa del ciclo.' }
        ]
    },
    'orden_compra': {
        title: 'Órdenes de Compra',
        icon: 'fa-file-invoice',
        description: 'Gestión de órdenes de compra a proveedores. Control de recepción y actualización automática de stock.',
        sections: [
            { icon: 'fa-file', title: 'Crear OC',
              steps: [
                'Seleccione proveedor y fecha de emisión.',
                'Agregue productos (artículos o insumos) con cantidades y valores.',
                'El total se calcula automáticamente según subtotal, impuesto y descuento.'
              ] },
            { icon: 'fa-truck', title: 'Recepción',
              content: 'Cuando reciba la mercadería, cambie el estado a "Recibida" o "Recibida Parcial". El sistema actualizará automáticamente el stock de los productos recibidos y registrará los movimientos.' },
            { icon: 'fa-sync-alt', title: 'Estados',
              content: 'Pendiente → Aprobada → Recibida Parcial → Recibida → Cancelada. Las OC recibidas incrementan el stock automáticamente.' }
        ]
    },
    'apoyo_tecnico': {
        title: 'Apoyo Técnico',
        icon: 'fa-life-ring',
        description: 'Base de conocimiento técnico del taller. Almacena información, procedimientos y soluciones por marca/modelo.',
        sections: [
            { icon: 'fa-book', title: 'Contenido',
              content: 'Procedimientos de reparación, especificaciones técnicas, valores de referencia y notas por marca y modelo de vehículo.' },
            { icon: 'fa-search', title: 'Búsqueda',
              content: 'Puede buscar por nombre del procedimiento, marca o modelo del vehículo.' }
        ]
    },
    'tareas_diarias': {
        title: 'Tareas Diarias',
        icon: 'fa-tasks',
        description: 'Gestión de tareas y asignaciones del equipo del taller.',
        sections: [
            { icon: 'fa-user-check', title: 'Asignación',
              content: 'Asigne tareas a empleados con fecha, proceso, tipo y estado. Ideal para seguimiento de trabajos pendientes.' },
            { icon: 'fa-filter', title: 'Filtros',
              content: 'Puede buscar por nombre, detalles, proceso, tipo y estado.' }
        ]
    },
    'cuentas_bancarias': {
        title: 'Cuentas Bancarias',
        icon: 'fa-university',
        description: 'Registro de cuentas bancarias del taller para control de movimientos financieros.',
        sections: [
            { icon: 'fa-piggy-bank', title: 'Control',
              content: 'Nombre, banco, tipo de cuenta y saldo inicial. Se vinculan a compras y ventas para registrar pagos.' },
            { icon: 'fa-sync', title: 'Actualización',
              content: 'El saldo se actualiza automáticamente con cada movimiento de caja registrado en compras y ventas.' }
        ]
    }
};

function openHelp(moduleName) {
    const data = MODULE_HELP[moduleName];
    if (!data) return;
    const overlay = document.createElement('div');
    overlay.className = 'help-modal-overlay';
    overlay.innerHTML = `
        <div class="help-modal">
            <div class="help-modal-header">
                <h2><i class="fas ${data.icon}"></i> ${data.title}</h2>
                <button class="help-modal-close" onclick="this.closest('.help-modal-overlay').remove()">&times;</button>
            </div>
            <div class="help-modal-body">
                <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:1.2rem;line-height:1.5;">${data.description}</p>
                ${data.sections.map(s => `
                    <div class="help-section">
                        <h3><i class="fas ${s.icon}"></i> ${s.title}</h3>
                        ${s.content ? `<p>${s.content}</p>` : ''}
                        ${s.steps ? s.steps.map((step, i) => `
                            <div class="help-step">
                                <div class="help-step-num">${i + 1}</div>
                                <div class="help-step-content">${step}</div>
                            </div>
                        `).join('') : ''}
                    </div>
                `).join('')}
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// Auto-init help button on module pages
document.addEventListener('DOMContentLoaded', () => {
    const helpBtn = document.getElementById('btnHelp');
    const pageTitle = document.querySelector('.page-title');
    if (helpBtn && pageTitle && pageTitle.textContent.trim()) {
        const knownModules = Object.keys(MODULE_HELP);
        const moduleMatch = knownModules.find(m => window.location.pathname.includes(m) || pageTitle.textContent.toLowerCase().includes(MODULE_HELP[m].title.toLowerCase()));
        if (moduleMatch) {
            helpBtn.dataset.module = moduleMatch;
            helpBtn.addEventListener('click', () => openHelp(moduleMatch));
        }
    }
});

// ============================================================================
// CARD GRID RENDERER
// ============================================================================

/**
 * Renderiza una grilla de tarjetas (cards) a partir de un array de registros
 *
 * @param {HTMLElement} container - Elemento donde renderizar
 * @param {Array} items - Array de objetos con datos
 * @param {Object} config - Configuración de renderizado
 * @param {string} config.titleField - Campo principal para el título
 * @param {Array} config.subtitleFields - Array de {field, label?} para líneas secundarias
 * @param {string|null} config.thumbField - Campo con URL de imagen directa
 * @param {string} config.archivosField - Campo con array de archivos multimedia (default 'archivos')
 * @param {string|null} config.statusField - Campo de estado
 * @param {Object} config.badgeMap - Mapeo valor-estado -> clase color (ej: {pendiente:'warning', activo:'success'})
 * @param {Function} config.onClick - Callback al hacer clic (recibe item, cardElement)
 * @param {Function} config.onEdit - Callback para botón editar (recibe item)
 * @param {Function} config.onDelete - Callback para botón eliminar (recibe item)
 * @param {string|null} config.selectedId - ID del registro seleccionado
 * @param {string} config.idField - Nombre del campo ID (default 'id')
 */
function renderCardGrid(container, items, config) {
    if (!container) return;
    if (!items || !items.length) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i> Sin registros</div>`;
        return;
    }
    const {
        titleField = 'id',
        subtitleFields = [],
        thumbField = null,
        archivosField = 'archivos',
        statusField = null,
        badgeMap = {},
        onClick = null,
        onEdit = null,
        onDelete = null,
        selectedId = null,
        idField = 'id',
        renderCard = null
    } = config;

    container.innerHTML = '';

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'record-card animate-fade-in-up';
        const id = item[idField];
        if (selectedId && String(id) === String(selectedId)) {
            card.classList.add('selected');
        }

        if (renderCard && typeof renderCard === 'function') {
            card.innerHTML = renderCard(item);
        } else {
        // --- Thumbnail ---
        let thumbUrl = null;
        if (item.thumb_url) {
            thumbUrl = item.thumb_url;
        } else if (thumbField && item[thumbField]) {
            thumbUrl = item[thumbField];
        } else if (item[archivosField] && item[archivosField].length) {
            const first = item[archivosField][0];
            if (first.tipo_archivo === 'foto' && first.ruta_archivo) {
                thumbUrl = first.ruta_archivo;
            }
        }

        const thumbHtml = thumbUrl
            ? `<img src="${thumbUrl}" alt="" loading="lazy">`
            : `<i class="fas fa-image card-thumb-icon"></i>`;

        let badgeHtml = '';
        if (statusField && item[statusField]) {
            const val = item[statusField];
            const color = badgeMap[val] || 'primary';
            badgeHtml = `<span class="status-badge ${color}">${val}</span>`;
        }

        // --- Info ---
        const title = item[titleField] || `#${id}`;
        let subsHtml = '';
        subtitleFields.forEach(sf => {
            const field = typeof sf === 'string' ? sf : sf.field;
            const label = typeof sf === 'string' ? null : (sf.label || null);
            const type = typeof sf === 'string' ? null : (sf.type || null);
            let val = item[field];
            if (val !== null && val !== undefined && val !== '') {
                if (type === 'datetime' && val) {
                    try {
                        const d = new Date(val);
                        if (!isNaN(d.getTime())) {
                            val = d.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
                        }
                    } catch(e) { /* keep original */ }
                }
                const prefix = label ? `<span class="card-sub">${label}:</span> ` : '';
                subsHtml += `<p>${prefix}${val}</p>`;
            }
        });

        card.innerHTML = `
            <div class="card-thumb">
                ${thumbHtml}
                ${badgeHtml ? `<div class="card-badge-abs">${badgeHtml}</div>` : ''}
            </div>
            <div class="card-info">
                <h4 title="${escapeHtml(title)}">${title}</h4>
                ${subsHtml}
            </div>
            <div class="card-actions-row">
                ${onEdit ? `<button class="btn-icon" data-action="edit" title="Editar"><i class="fas fa-pen"></i></button>` : ''}
                ${onDelete ? `<button class="btn-icon btn-icon-danger" data-action="delete" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;
        }

        // Events
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            if (onClick) onClick(item, card);
        });
        card.querySelectorAll('.btn-icon[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onEdit) onEdit(item);
            });
        });
        card.querySelectorAll('.btn-icon[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onDelete) onDelete(item);
            });
        });

        container.appendChild(card);
    });
}

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

// ============================================================================
// MULTIMEDIA TOOLBAR (Camera, Audio, Video, Doc, +)
// ============================================================================

/**
 * Configura la barra de herramientas multimedia
 * @param {HTMLElement} toolbarEl - El contenedor .multimedia-toolbar
 * @param {HTMLInputElement} fileInput - El input file oculto para agregar archivos
 */
function setupMultimediaToolbar(toolbarEl, fileInput) {
    if (!toolbarEl || !fileInput) return;
    if (toolbarEl.dataset.mmInit) return;
    toolbarEl.dataset.mmInit = '1';

    const btnConfig = [
        { icon: 'fa-camera', label: 'Cámara', accept: 'image/*', capture: 'environment' },
        { icon: 'fa-microphone', label: 'Audio', accept: 'audio/*' },
        { icon: 'fa-video', label: 'Video', accept: 'video/*' },
        { icon: 'fa-file-alt', label: 'Documento', accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv' },
    ];

    btnConfig.forEach(cfg => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'multimedia-btn';
        btn.innerHTML = `<i class="fas ${cfg.icon}"></i> ${cfg.label}`;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Check if browser supports capture
            const supported = cfg.capture
                ? ('HTMLInputElement' in window && 'capture' in HTMLInputElement.prototype)
                : true;
            if (supported) {
                // Create a temporary input for this type
                const tmp = document.createElement('input');
                tmp.type = 'file';
                tmp.accept = cfg.accept;
                if (cfg.capture) tmp.setAttribute('capture', cfg.capture);
                tmp.multiple = false;
                tmp.style.display = 'none';
                document.body.appendChild(tmp);
                tmp.addEventListener('change', () => {
                    if (tmp.files && tmp.files.length) {
                        // Merge into the main file input
                        const dt = new DataTransfer();
                        if (fileInput.files) {
                            Array.from(fileInput.files).forEach(f => dt.items.add(f));
                        }
                        Array.from(tmp.files).forEach(f => dt.items.add(f));
                        fileInput.files = dt.files;
                        // Trigger preview update
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    document.body.removeChild(tmp);
                });
                tmp.click();
            } else {
                // Fallback to the main input with accept filter
                fileInput.accept = cfg.accept;
                fileInput.click();
                // Restore full accept after short delay
                setTimeout(() => {
                    fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx';
                }, 100);
            }
        });
        toolbarEl.appendChild(btn);
    });

    // "+" button to add more files (any type)
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'multimedia-btn multimedia-add-btn';
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Añadir archivos';
    addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    toolbarEl.appendChild(addBtn);
}

// ============================================================================
// OPTIONS MANAGER (Gestionar opciones de selects dinámicos)
// ============================================================================

/**
 * Abre un modal para gestionar (CRUD) las opciones de un select dinámico
 * @param {HTMLSelectElement} selectEl - El select cuya categoría gestionar
 */
async function openOptionsManager(selectEl) {
    const category = selectEl.dataset.category;
    if (!category) return showError('Categoría no definida');

    // Close existing overlay if any
    document.querySelectorAll('.options-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'options-overlay';
    overlay.innerHTML = `
        <div class="options-modal">
            <div class="options-modal-header">
                <h3><i class="fas fa-list"></i> Gestionar: ${category.replace(/_/g, ' ')}</h3>
                <button class="options-modal-close" type="button">&times;</button>
            </div>
            <div class="options-modal-body">
                <div class="options-add-row">
                    <input type="text" id="optionsNewVal" placeholder="Nueva opción..." maxlength="100">
                    <button type="button" class="btn btn-sm btn-primary" id="optionsAddBtn"><i class="fas fa-plus"></i> Agregar</button>
                </div>
                <div class="options-list" id="optionsList">
                    <div class="spinner" style="margin:1rem auto;"></div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const listEl = overlay.querySelector('#optionsList');
    const newInput = overlay.querySelector('#optionsNewVal');
    const addBtn = overlay.querySelector('#optionsAddBtn');

    function close() { overlay.remove(); }
    overlay.querySelector('.options-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });

    async function loadOptions() {
        try {
            const res = await fetch(`${API_ROOT}opciones_api.php?action=list_opciones&categoria=${encodeURIComponent(category)}`);
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message);
            renderOptions(data.data);
        } catch (err) {
            listEl.innerHTML = `<div class="options-empty"><i class="fas fa-exclamation-triangle"></i> Error: ${err.message}</div>`;
        }
    }

    function renderOptions(options) {
        if (!options || !options.length) {
            listEl.innerHTML = `<div class="options-empty"><i class="fas fa-inbox"></i> Sin opciones aún</div>`;
            return;
        }
        listEl.innerHTML = '';
        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'options-item';
            item.dataset.id = opt.id;
            item.dataset.val = opt.valor;
            item.innerHTML = `
                <span class="opt-value">${escapeHtml(opt.valor)}</span>
                <div class="opt-actions">
                    <button class="opt-edit" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="opt-delete" title="Eliminar"><i class="fas fa-times"></i></button>
                </div>`;
            // Edit
            item.querySelector('.opt-edit').addEventListener('click', () => startEdit(item, opt));
            // Delete
            item.querySelector('.opt-delete').addEventListener('click', () => deleteOption(item, opt));
            listEl.appendChild(item);
        });
    }

    async function addOption() {
        const val = newInput.value.trim();
        if (!val) return;
        addBtn.disabled = true;
        try {
            const fd = new FormData();
            fd.append('categoria', category);
            fd.append('valor', val);
            const res = await fetch(`${API_ROOT}opciones_api.php?action=add_opcion`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') {
                newInput.value = '';
                await loadOptions();
                // Also update the original select
                addOptionToSelect(selectEl, val);
            } else {
                showError(data.message);
            }
        } catch (err) {
            showError('Error al agregar');
        } finally {
            addBtn.disabled = false;
        }
    }

    function startEdit(item, opt) {
        if (item.classList.contains('editing')) return;
        item.classList.add('editing');
        const span = item.querySelector('.opt-value');
        span.innerHTML = `
            <input type="text" value="${escapeHtml(opt.valor)}" maxlength="100">
            <button class="btn btn-sm btn-primary opt-save"><i class="fas fa-check"></i></button>`;
        const input = span.querySelector('input');
        const saveBtn = span.querySelector('.opt-save');
        input.focus();
        input.select();
        async function save() {
            const newVal = input.value.trim();
            if (!newVal || newVal === opt.valor) {
                cancelEdit(item, opt);
                return;
            }
            try {
                const fd = new FormData();
                fd.append('id', opt.id);
                fd.append('valor', newVal);
                const res = await fetch(`${API_ROOT}opciones_api.php?action=edit_opcion`, { method: 'POST', body: fd });
                const data = await res.json();
                if (data.status === 'success') {
                    // Update the select
                    updateOptionInSelect(selectEl, opt.valor, newVal);
                    opt.valor = newVal;
                    await loadOptions();
                } else {
                    showError(data.message);
                    cancelEdit(item, opt);
                }
            } catch (err) {
                showError('Error al editar');
                cancelEdit(item, opt);
            }
        }
        saveBtn.addEventListener('click', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancelEdit(item, opt);
        });
    }

    function cancelEdit(item, opt) {
        item.classList.remove('editing');
        const span = item.querySelector('.opt-value');
        span.textContent = opt.valor;
    }

    async function deleteOption(item, opt) {
        if (!confirm(`¿Eliminar "${opt.valor}"?`)) return;
        try {
            const fd = new FormData();
            fd.append('id', opt.id);
            const res = await fetch(`${API_ROOT}opciones_api.php?action=delete_opcion`, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') {
                removeOptionFromSelect(selectEl, opt.valor);
                item.remove();
                if (listEl.children.length === 0) {
                    listEl.innerHTML = `<div class="options-empty"><i class="fas fa-inbox"></i> Sin opciones aún</div>`;
                }
            } else {
                showError(data.message);
            }
        } catch (err) {
            showError('Error al eliminar');
        }
    }

    function addOptionToSelect(sel, val) {
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === val) return;
        }
        const opt = new Option(val, val);
        sel.appendChild(opt);
    }

    function updateOptionInSelect(sel, oldVal, newVal) {
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === oldVal) {
                sel.options[i].text = newVal;
                sel.options[i].value = newVal;
                if (sel.value === oldVal) sel.value = newVal;
                break;
            }
        }
    }

    function removeOptionFromSelect(sel, val) {
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === val) {
                sel.remove(i);
                break;
            }
        }
    }

    addBtn.addEventListener('click', addOption);
    newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOption(); });

    await loadOptions();
}

// Enhanced btn-add-option that shows the Options Manager (full CRUD)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.btn-add-option').forEach(btn => {
        if (btn.dataset.omInit) return;
        btn.dataset.omInit = '1';
        const select = btn.closest('.select-wrapper')?.querySelector('select');
        if (select && select.dataset.category) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                openOptionsManager(select);
            });
        }
    });
});

// ============================================================================
// HAPTIC FEEDBACK — Vibrate API for tactile response on mobile
// ============================================================================
const Haptic = {
    supported: false,

    init() {
        this.supported = 'vibrate' in navigator && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    },

    light() {
        if (this.supported) navigator.vibrate(10);
    },

    medium() {
        if (this.supported) navigator.vibrate(20);
    },

    heavy() {
        if (this.supported) navigator.vibrate([30, 50, 30]);
    },

    selection() {
        if (this.supported) navigator.vibrate(15);
    },

    error() {
        if (this.supported) navigator.vibrate([50, 100, 50]);
    }
};

Haptic.init();

// Bind haptics to common touch interactions
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('touchstart', (e) => {
        const btn = e.target.closest('.btn, .nav-item, .bottom-nav-item, .list-item, .record-row, .compact-row, .ot-ticket-item');
        if (btn) Haptic.light();
    }, { passive: true });
});

// ============================================================================
// FIELD VOICE NOTES — Notas de voz asociadas a un campo del formulario
// ============================================================================
// Uso en un módulo:
//   setupFieldVoiceNote({ textareaId: 'diag-causa' });
//   // después de cargar/guardar el registro padre:
//   loadFieldVoiceNotes(entityId, 'ejecucion_ot', 'diag-causa');
//
// - Soporta múltiples audios por campo.
// - Si el registro aún no existe (form de creación), el audio queda en
//   memoria (window._pendingFieldAudios) y se sube al confirmar el POST
//   principal mediante flushPendingFieldAudios(parentEntityId).
// - Persiste en archivos_multimedia con campo_key = textareaId.
// ============================================================================

const FIELD_VOICE_API = API_ROOT + 'multimedia_api.php';

// Buffers en memoria para audios grabados antes de que exista el registro padre.
// Estructura: { campoKey: [{ blob, filename, duracionSeg }] }
window._pendingFieldAudios = window._pendingFieldAudios || {};

// Estado de streams/grabadoras activas (para liberar el micrófono al navegar).
const _activeVoiceRecorders = new WeakMap();

function _pickFieldVoiceMime() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return '';
    for (const m of candidates) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
}

function _formatDuration(seg) {
    const s = Math.max(0, Math.floor(seg || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

function _formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function _ensureFieldVoiceWrapper(textarea) {
    // Envuelve el <textarea>/<input> en un contenedor relativo sin alterar el
    // layout existente (insertamos el wrapper como padre sin mover el elemento
    // fuera del DOM original).
    if (textarea.parentElement && textarea.parentElement.classList.contains('field-voice-wrapper')) {
        return textarea.parentElement;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'field-voice-wrapper';
    textarea.parentNode.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);
    return wrapper;
}

function _stopActiveRecorder(campoKey) {
    const rec = _activeVoiceRecorders.get(campoKey);
    if (!rec) return;
    try {
        if (rec.recorder && rec.recorder.state !== 'inactive') {
            rec.recorder.stop();
        }
    } catch (e) { /* noop */ }
    if (rec.stream) {
        rec.stream.getTracks().forEach(t => t.stop());
    }
    _activeVoiceRecorders.delete(campoKey);
}

/**
 * Activa el patrón de notas de voz sobre un campo del formulario.
 * @param {Object}   opts
 * @param {string}   opts.textareaId  id del <textarea> o <input> objetivo
 * @param {string}  [opts.entidadTipo='ejecucion_ot'] valor de entidad_tipo
 *                                   usado en la API
 * @param {string}  [opts.label]      etiqueta accesible (aria-label)
 */
function setupFieldVoiceNote(opts) {
    const { textareaId, entidadTipo = 'ejecucion_ot', label = '' } = opts || {};
    if (!textareaId) return;
    const field = document.getElementById(textareaId);
    if (!field || field.dataset.voiceInit === '1') return;
    field.dataset.voiceInit = '1';
    field.dataset.voiceEntidad = entidadTipo;
    field.dataset.voiceCampoKey = textareaId;

    const wrapper = _ensureFieldVoiceWrapper(field);

    // Botón "Grabar" en la esquina superior derecha del campo.
    const btnRecord = document.createElement('button');
    btnRecord.type = 'button';
    btnRecord.className = 'btn-voice-record';
    btnRecord.setAttribute('aria-label', label ? `Grabar nota de voz para ${label}` : 'Grabar nota de voz');
    btnRecord.innerHTML = '<i class="fas fa-microphone"></i> <span>Grabar voz</span>';
    wrapper.appendChild(btnRecord);

    // Contenedor de la lista de audios (existentes + pendientes).
    const list = document.createElement('div');
    list.className = 'field-voice-list';
    list.id = `voice-list-${textareaId}`;
    wrapper.appendChild(list);

    // Indicador de estado de grabación.
    const indicator = document.createElement('div');
    indicator.className = 'field-voice-rec-indicator';
    indicator.style.display = 'none';
    indicator.innerHTML = `
        <span class="fv-dot"></span>
        <span class="fv-time">00:00</span>
        <button type="button" class="fv-stop"><i class="fas fa-stop"></i> Detener</button>
    `;
    wrapper.appendChild(indicator);

    const timeEl = indicator.querySelector('.fv-time');
    const stopBtn = indicator.querySelector('.fv-stop');

    let recorder = null;
    let stream = null;
    let chunks = [];
    let timer = null;
    let seconds = 0;
    let mime = _pickFieldVoiceMime();

    const stopAll = () => {
        if (recorder && recorder.state !== 'inactive') {
            try { recorder.stop(); } catch (e) { /* noop */ }
        }
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        if (timer) { clearInterval(timer); timer = null; }
        recorder = null;
        btnRecord.classList.remove('recording');
        btnRecord.disabled = false;
        indicator.style.display = 'none';
    };

    stopBtn.addEventListener('click', stopAll);

    btnRecord.addEventListener('click', async () => {
        if (recorder && recorder.state === 'recording') {
            stopAll();
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError('Tu navegador no soporta grabación de audio');
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunks = [];
            seconds = 0;
            timeEl.textContent = '00:00';
            recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                const type = recorder.mimeType || mime || 'audio/webm';
                const blob = new Blob(chunks, { type });
                const ext = (type.split('/')[1] || 'webm').split(';')[0];
                const filename = `nota_voz_${Date.now()}.${ext}`;
                _enqueuePendingAudio(textareaId, blob, filename);
                stopAll();
            };
            recorder.start(100);
            btnRecord.classList.add('recording');
            btnRecord.disabled = true;
            indicator.style.display = 'flex';
            timer = setInterval(() => {
                seconds++;
                timeEl.textContent = _formatDuration(seconds);
            }, 1000);
        } catch (err) {
            console.error('mic error', err);
            showError('⚠️ No se pudo acceder al micrófono. Verifica los permisos.');
            stopAll();
        }
    });

    // Liberar el micrófono al navegar / recargar.
    window.addEventListener('beforeunload', () => stopAll());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') stopAll();
    });
}

function _enqueuePendingAudio(campoKey, blob, filename) {
    if (!window._pendingFieldAudios[campoKey]) window._pendingFieldAudios[campoKey] = [];
    const duracion = null; // se puede inferir al reproducir; el backend no lo persiste
    window._pendingFieldAudios[campoKey].push({ blob, filename, duracion });

    // Render inmediato como item "pendiente" con barra de carga.
    const list = document.getElementById(`voice-list-${campoKey}`);
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'field-voice-item pending';
    item.dataset.campoKey = campoKey;
    item.dataset.pending = '1';
    const url = URL.createObjectURL(blob);
    item.innerHTML = `
        <i class="fas fa-microphone" style="color:var(--primary)"></i>
        <audio src="${url}" controls style="height:28px;flex:1;"></audio>
        <span class="fv-pending-label" style="font-size:0.7rem;color:var(--text-secondary)">Pendiente</span>
    `;
    list.appendChild(item);
}

/**
 * Sube los audios pendientes de un campo (o de todos si no se especifica)
 * contra la entidad padre ya persistida.
 * Llamar después del POST principal que devuelve el entityId.
 */
async function flushPendingFieldAudios(parentEntityId, entidadTipo, campoKey = null) {
    const fields = campoKey ? [campoKey] : Object.keys(window._pendingFieldAudios);
    let uploaded = 0;
    for (const ck of fields) {
        const queue = window._pendingFieldAudios[ck];
        if (!queue || !queue.length) continue;
        const fd = new FormData();
        fd.append('entidad_tipo', entidadTipo);
        fd.append('entidad_id', String(parentEntityId));
        const keys = [];
        for (const item of queue) {
            fd.append('archivos[]', item.blob, item.filename);
            keys.push(ck);
        }
        // campo_keys[] en el mismo orden que archivos[]
        for (const k of keys) fd.append('campo_keys[]', k);

        try {
            const r = await fetch(FIELD_VOICE_API + '?action=subir', { method: 'POST', body: fd });
            const j = await r.json();
            if (j.status === 'success') {
                uploaded += (j.data?.subidos || 0);
                // Limpiar pendientes del campo
                delete window._pendingFieldAudios[ck];
                // Re-renderizar lista: remover pendientes y volver a cargar
                const list = document.getElementById(`voice-list-${ck}`);
                if (list) {
                    list.querySelectorAll('.field-voice-item.pending').forEach(n => n.remove());
                }
                await loadFieldVoiceNotes(parentEntityId, entidadTipo, ck, `voice-list-${ck}`);
            } else {
                console.error('flushPendingFieldAudios error', j);
            }
        } catch (err) {
            console.error('flushPendingFieldAudios fetch error', err);
        }
    }
    return uploaded;
}

/**
 * Carga y renderiza los audios existentes (persistidos en BD) para un campo.
 * @param {number} entityId
 * @param {string} entidadTipo
 * @param {string} campoKey
 * @param {string} [listId]  id del contenedor (default: voice-list-<campoKey>)
 */
async function loadFieldVoiceNotes(entityId, entidadTipo, campoKey, listId) {
    if (!entityId || !campoKey) return;
    const list = document.getElementById(listId || `voice-list-${campoKey}`);
    if (!list) return;
    const url = `${FIELD_VOICE_API}?action=listar&entidad_tipo=${encodeURIComponent(entidadTipo)}&entidad_id=${entityId}&campo_key=${encodeURIComponent(campoKey)}&tipo=nota_voz`;
    try {
        const r = await fetch(url);
        const j = await r.json();
        if (j.status !== 'success' || !Array.isArray(j.data)) return;
        // Limpiar solo los ya persistidos (no los pendientes).
        list.querySelectorAll('.field-voice-item:not(.pending)').forEach(n => n.remove());
        j.data.forEach(a => {
            const item = document.createElement('div');
            item.className = 'field-voice-item';
            item.dataset.archivoId = a.id;
            const safeName = (a.nombre_original || 'nota_voz').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            item.innerHTML = `
                <i class="fas fa-microphone" style="color:var(--primary)"></i>
                <audio src="${a.ruta_archivo}" controls preload="none" style="height:28px;flex:1;"></audio>
                <span class="fv-meta" style="font-size:0.7rem;color:var(--text-secondary)">${_formatBytes(a.tamanio_bytes)}</span>
                <button type="button" class="fv-del" title="Eliminar" aria-label="Eliminar ${safeName}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            item.querySelector('.fv-del').addEventListener('click', async () => {
                if (!confirm('¿Eliminar esta nota de voz?')) return;
                const r2 = await fetch(FIELD_VOICE_API + '?action=eliminar&id=' + a.id, { method: 'POST' });
                const j2 = await r2.json();
                if (j2.status === 'success') {
                    item.remove();
                    showSuccess('Nota de voz eliminada');
                } else {
                    showError(j2.message || 'No se pudo eliminar');
                }
            });
            list.appendChild(item);
        });
    } catch (err) {
        console.error('loadFieldVoiceNotes error', err);
    }
}

// ── Header search button → opens command palette or focuses page search ──
document.addEventListener('DOMContentLoaded', () => {
    const btnSearch = document.getElementById('btnHeaderSearch');
    const btnBottomCmd = document.getElementById('btnBottomCmd');
    
    function openSearch() {
        // Try command palette first
        if (window._cmdPalette) {
            window._cmdPalette.toggle();
            return;
        }
        // Fallback: focus page search input
        const pageSearch = document.getElementById('searchInput');
        if (pageSearch) {
            pageSearch.focus();
            pageSearch.select();
            return;
        }
        // Fallback: open command palette via class
        if (typeof CommandPalette !== 'undefined') {
            window._cmdPalette = new CommandPalette();
            window._cmdPalette.toggle();
        }
    }
    
    if (btnSearch) btnSearch.addEventListener('click', openSearch);
    if (btnBottomCmd) btnBottomCmd.addEventListener('click', (e) => { e.preventDefault(); openSearch(); });
});
