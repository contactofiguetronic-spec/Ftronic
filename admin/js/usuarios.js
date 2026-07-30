// ============================================================================
// usuarios.js — Gestión de Usuarios, Roles y Permisos
// ============================================================================
const API = API_ROOT + 'usuarios_api.php';

let currentPage = 1;
let currentFichaId = null;
let allPermisos = [];
let userPermisos = [];

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupSearch();
    setupFormSubmit();
    setupCuentaForm();
    setupFichaTabs();
    setupFichaActions();
    setupPermisos();
    setupRolesModal();
    setupSolicitudes();
    setupHelpButton();
    setupNivelPreview();
    setupPasswordStrength();
    setupActivityFilter();

    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('id');
    const action = params.get('action');
    if (action === 'profile') {
        // Esperar a que _checkAuth() complete (es async)
        function _waitAuth(retries) {
            if (window.__user) {
                openFicha(window.__user.id);
            } else if (retries > 0) {
                setTimeout(() => _waitAuth(retries - 1), 200);
            } else {
                showToast('Error cargando perfil', 'error');
            }
        }
        _waitAuth(20);
    } else if (urlId) {
        openFicha(urlId);
    } else {
        loadData();
    }
    setupReactiveRefresh(loadData);
});

// ── Card Grid ────────────────────────────────────────────────────────────────
function loadData(page, search) {
    currentPage = page || currentPage || 1;
    search = search !== undefined ? search : (el('searchInput')?.value || '');
    const grid = el('cardGrid');
    grid.innerHTML = '<div class="card-empty"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

    fetch(`${API}?action=usuarios&page=${currentPage}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json())
        .then(res => {
            if (res.status !== 'success') { grid.innerHTML = `<div class="card-empty">${escapeHtml(res.message || 'Error')}</div>`; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="card-empty"><i class="fas fa-users" style="font-size:2rem;opacity:0.3;"></i><br>No hay usuarios</div>'; return; }

            grid.innerHTML = items.map(u => {
                const initials = ((u.nombre||'')[0] || 'U') + ((u.apellido||'')[0] || '');
                const colors = ['#4B7BEC','#e74c3c','#27ae60','#f39c12','#8e44ad','#16a085'];
                const bg = colors[(u.id || 0) % colors.length];
                const rolBadge = u.rol_nombre ? `<span style="font-size:0.7rem;background:rgba(75,123,236,0.1);color:var(--primary);padding:2px 8px;border-radius:10px;">${escapeHtml(u.rol_nombre)}</span>` : '';
                const nivelBadge = u.rol_nivel ? `<span style="font-size:0.65rem;background:rgba(0,0,0,0.04);color:var(--text-secondary);padding:2px 6px;border-radius:8px;margin-left:4px;">N${escapeHtml(String(u.rol_nivel))}</span>` : '';
                const statusBadge = u.activo == 1
                    ? '<span class="user-status-badge active">Activo</span>'
                    : '<span class="user-status-badge inactive">Inactivo</span>';
                const lastAccess = u.ultimo_acceso ? `<div style="font-size:0.68rem;color:var(--text-secondary);margin-top:2px;">Último acceso: ${escapeHtml(_formatRelativeTime(u.ultimo_acceso))}</div>` : '';
                return `
                    <div class="card" data-id="${u.id}" onclick="openFicha(${u.id})" style="cursor:pointer;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:44px;height:44px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;">${escapeHtml(initials)}</div>
                            <div style="flex:1;min-width:0;">
                                <div class="card-title">${escapeHtml(u.nombre || '')} ${escapeHtml(u.apellido || '')}</div>
                                <div class="card-sub">@${escapeHtml(u.username || '—')}</div>
                                <div class="card-sub"><small>${escapeHtml(u.email || '')}</small></div>
                                ${lastAccess}
                            </div>
                            <div style="text-align:right;">
                                ${rolBadge}${nivelBadge}<br>${statusBadge}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            const totalActive = items.filter(i => i.activo == 1).length;
            const summaryEl = el('listSummary');
            if (summaryEl) summaryEl.textContent = `${res.data.total} usuario${res.data.total !== 1 ? 's' : ''} · ${totalActive} activo${totalActive !== 1 ? 's' : ''}`;

            renderPagination('paginationContainer', res.data.total, res.data.per_page, res.data.page, (p) => loadData(p));
        })
        .catch(() => { grid.innerHTML = '<div class="card-empty">Error de conexión</div>'; });
}

function setupSearch() {
    let timer;
    if (el('searchInput')) {
        el('searchInput').addEventListener('input', function() {
            clearTimeout(timer);
            timer = setTimeout(() => loadData(1, this.value), 300);
        });
    }
}

// ── Ficha ────────────────────────────────────────────────────────────────────
function openFicha(id) {
    currentFichaId = id;
    el('listView').style.display = 'none';
    el('fichaContainer').style.display = 'block';

    fetch(`${API}?action=usuario&id=${id}&t=${Date.now()}`)
        .then(r => r.json())
        .then(res => {
            if (res.status !== 'success') { showToast(res.message || 'Error cargando usuario', 'error'); return; }
            const u = res.data;
            const isNew = !id || id === 0;
            document.title = isNew ? 'Nuevo Usuario — Figuetronic' : `${u.nombre || 'Usuario'} — Figuetronic`;

            const initials = ((u.nombre||'')[0] || 'U') + ((u.apellido||'')[0] || '');
            el('fichaAvatar').textContent = initials;
            el('fichaTitle').textContent = `${u.nombre || ''} ${u.apellido || ''}`;
            el('fichaSub').textContent = `@${u.username || '—'} · ${u.email || '—'}`;
            el('fichaContacts').innerHTML = u.telefono ? `<a href="tel:${escapeHtml(u.telefono)}"><i class="fas fa-phone"></i> ${escapeHtml(u.telefono)}</a>` : '';

            // Datos tab
            el('record_id').value = u.id;
            el('usr-nombre').value = u.nombre || '';
            el('usr-apellido').value = u.apellido || '';
            el('usr-email').value = u.email || '';
            el('usr-telefono').value = u.telefono || '';
            el('usr-tipo').value = u.tipo || 'empleado';
            el('usr-nivel').value = u.nivel || 2;
            // Trigger nivel preview
            if (el('usr-nivel').dispatchEvent) el('usr-nivel').dispatchEvent(new Event('input'));

            // Cuenta tab
            el('usr-username').value = u.username || '';
            el('usr-password').value = '';
            el('lblPassword').textContent = isNew ? 'Contraseña *' : 'Contraseña (dejar vacío sin cambios)';
            el('pwdHint').textContent = isNew ? 'Mínimo 6 caracteres' : '';
            el('usr-activo').value = u.activo != null ? u.activo : 1;
            loadRolesSelect(u.rol_id);

            // Account status info
            const statusEl = el('cuentaStatus');
            if (statusEl) {
                if (isNew) {
                    statusEl.style.display = 'none';
                } else {
                let statusHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
                statusHtml += `<div><strong>Estado:</strong> <span style="color:${u.activo == 1 ? '#27ae60' : '#e74c3c'};">${u.activo == 1 ? 'Activo' : 'Inactivo'}</span></div>`;
                statusHtml += `<div><strong>Último acceso:</strong> ${u.ultimo_acceso ? _formatRelativeTime(u.ultimo_acceso) : 'Nunca'}</div>`;
                if (u.intentos_fallidos > 0) statusHtml += `<div><strong>Intentos fallidos:</strong> <span style="color:#e74c3c;">${u.intentos_fallidos}</span></div>`;
                if (u.bloqueado_hasta) statusHtml += `<div><strong>Bloqueado hasta:</strong> <span style="color:#e74c3c;">${escapeHtml(u.bloqueado_hasta)}</span></div>`;
                statusHtml += '</div>';
                statusEl.innerHTML = statusHtml;
                statusEl.style.display = 'flex';
                }
            }

            // Permisos tab
            loadUserPermisos(u.id);

            // Actividad tab
            loadActivity(u.id);
        });
}

function closeFicha() {
    el('fichaContainer').style.display = 'none';
    el('listView').style.display = 'block';
    currentFichaId = null;
    document.title = 'Usuarios - Figuetronic';
    loadData();
}

function setupFichaActions() {
    if (el('btnBackList')) el('btnBackList').onclick = closeFicha;
    if (el('btnFichaDelete')) el('btnFichaDelete').onclick = async () => {
        if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
        const btn = el('btnFichaDelete');
        setButtonLoading(btn, true);
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', currentFichaId);
        const res = await apiFetch(API, fd);
        setButtonLoading(btn, false);
        if (res.status === 'success') { showToast('Usuario eliminado', 'success'); closeFicha(); }
        else showToast(res.message || 'Error', 'error');
    };
    if (el('btnNuevo')) el('btnNuevo').onclick = () => openFicha(0);
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function setupFichaTabs() {
    document.querySelectorAll('.ficha-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panelId = 'tab' + capitalize(tab.dataset.tab);
            const panel = el(panelId);
            if (panel) panel.classList.add('active');
        };
    });
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ── Form: Datos ──────────────────────────────────────────────────────────────
function setupFormSubmit() {
    const form = el('dataForm');
    if (!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        if (fd.get('id') == '0') fd.delete('id');
        const res = await apiFetch(API, fd);
        if (res.status === 'success') {
            showToast('Usuario guardado', 'success');
            const newId = res.data?.id || currentFichaId;
            if (!currentFichaId || currentFichaId === 0) { openFicha(newId); }
            else { openFicha(newId); }
        } else { showToast(res.message || 'Error guardando', 'error'); }
    };
}

// ── Form: Cuenta ─────────────────────────────────────────────────────────────
function setupCuentaForm() {
    const form = el('cuentaForm');
    if (!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        if (!currentFichaId) return;
        const fd = new FormData(form);
        fd.append('usuario_id', currentFichaId);
        if (!fd.get('password') || fd.get('password').length === 0) fd.delete('password');
        const res = await apiFetch(API, fd);
        if (res.status === 'success') showToast('Cuenta actualizada', 'success');
        else showToast(res.message || 'Error', 'error');
    };
}

function togglePwd(inputId, btn) {
    const inp = el(inputId);
    if (!inp) return;
    const isPassword = inp.type === 'password';
    inp.type = isPassword ? 'text' : 'password';
    btn.querySelector('i').className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
}

// ── Roles Select ─────────────────────────────────────────────────────────────
function loadRolesSelect(selectedId) {
    fetch(`${API_ROOT}usuarios_api.php?action=roles&t=${Date.now()}`)
        .then(r => r.json())
        .then(res => {
            const sel = el('usr-rol');
            if (!sel) return;
            sel.innerHTML = '<option value="">— Sin rol —</option>';
            if (res.status === 'success' && Array.isArray(res.data)) {
                res.data.forEach(r => {
                    const o = document.createElement('option');
                    o.value = r.id;
                    o.textContent = `${r.nombre} (N${r.nivel}) — ${r.permisos_count || 0} permisos`;
                    if (r.id == selectedId) o.selected = true;
                    sel.appendChild(o);
                });
            }
            // Show role description when selection changes
            sel.onchange = () => {
                const rolDescEl = el('rolDesc');
                if (!rolDescEl) return;
                const opt = sel.options[sel.selectedIndex];
                rolDescEl.textContent = opt && opt.value ? opt.textContent.split(' — ').slice(1).join(' — ') : '';
            };
            sel.dispatchEvent(new Event('change'));
        });
}

// ── Permisos ─────────────────────────────────────────────────────────────────
function setupPermisos() {
    if (el('btnSavePermisos')) el('btnSavePermisos').onclick = savePermisos;
    if (el('btnApplyRole')) el('btnApplyRole').onclick = applyRolePreset;
    if (el('permSearchInput')) {
        el('permSearchInput').addEventListener('input', () => _filterPermisos());
    }
}

async function loadUserPermisos(userId) {
    const res = await fetch(`${API}?action=permisos&usuario_id=${userId}&t=${Date.now()}`).then(r => r.json());
    if (res.status === 'success') {
        allPermisos = res.data.all || [];
        userPermisos = res.data.user || [];
        renderPermisos();
    }
}

function renderPermisos() {
    const grid = el('permGrid');
    if (!grid) return;

    const labels = {
        clientes: 'Clientes', vehiculos: 'Vehículos', empleados: 'Empleados', usuarios: 'Usuarios',
        ot: 'Órdenes Trabajo', recepcion: 'Recepción', diagnos: 'Diagnósticos', presu: 'Presupuestos',
        inventario: 'Inventario', compra: 'Compras', ingreso: 'Ingresos', egreso: 'Egresos',
        pagos: 'Pagos', pos: 'POS', agenda: 'Agenda', correo: 'Correo', reportes: 'Reportes',
        conta: 'Contabilidad', general: 'General', config: 'Configuración'
    };

    // Group by module
    const modules = {};
    allPermisos.forEach(p => {
        const mod = p.split(':')[0] || 'general';
        if (!modules[mod]) modules[mod] = [];
        modules[mod].push(p);
    });

    let html = '';
    Object.keys(modules).sort().forEach(mod => {
        const perms = modules[mod];
        const allChecked = perms.every(p => userPermisos.includes(p));
        html += `<div class="perm-module-header" data-module="${escapeHtml(mod)}" style="grid-column:1/-1;">
            <span style="font-weight:700;font-size:0.85rem;color:var(--primary);text-transform:uppercase;">${labels[mod] || mod}</span>
            <label><input type="checkbox" class="perm-module-toggle" data-module="${escapeHtml(mod)}" ${allChecked ? 'checked' : ''}> Seleccionar todo</label>
        </div>`;
        perms.forEach(p => {
            const checked = userPermisos.includes(p) ? 'checked' : '';
            const action = p.split(':')[1] || '';
            html += `<label class="perm-item ${checked ? 'active' : ''}" data-perm="${escapeHtml(p)}"><input type="checkbox" value="${escapeHtml(p)}" ${checked}> ${escapeHtml(action)}</label>`;
        });
    });
    grid.innerHTML = html;

    // Checkbox change events
    grid.querySelectorAll('input[type=checkbox].perm-item input, .perm-item input[type=checkbox]').forEach(cb => {
        if (!cb.closest('.perm-item')) return;
        cb.onchange = () => {
            cb.closest('.perm-item').classList.toggle('active', cb.checked);
            _updateModuleToggle(cb.value);
            updatePermCount();
        };
    });

    // Module toggle events
    grid.querySelectorAll('.perm-module-toggle').forEach(toggle => {
        toggle.addEventListener('change', function() {
            const mod = this.dataset.module;
            const checked = this.checked;
            grid.querySelectorAll(`.perm-item[data-perm^="${mod}:"] input[type=checkbox]`).forEach(cb => {
                cb.checked = checked;
                cb.closest('.perm-item').classList.toggle('active', checked);
            });
            updatePermCount();
        });
    });

    updatePermCount();
    loadRolePresets();
}

function _updateModuleToggle(permValue) {
    const mod = permValue.split(':')[0];
    const grid = el('permGrid');
    if (!grid) return;
    const modulePerms = grid.querySelectorAll(`.perm-item[data-perm^="${mod}:"] input[type=checkbox]`);
    const allChecked = Array.from(modulePerms).every(cb => cb.checked);
    const toggle = grid.querySelector(`.perm-module-toggle[data-module="${mod}"]`);
    if (toggle) toggle.checked = allChecked;
}

function _filterPermisos() {
    const query = (el('permSearchInput')?.value || '').toLowerCase().trim();
    const grid = el('permGrid');
    if (!grid) return;

    if (!query) {
        grid.querySelectorAll('.perm-item').forEach(el => el.style.display = '');
        grid.querySelectorAll('.perm-module-header').forEach(el => el.style.display = '');
        return;
    }

    // Show/hide perm items
    grid.querySelectorAll('.perm-item').forEach(item => {
        const perm = (item.dataset.perm || '').toLowerCase();
        item.style.display = perm.includes(query) ? '' : 'none';
    });

    // Show module headers only if they have visible items
    grid.querySelectorAll('.perm-module-header').forEach(header => {
        const mod = header.dataset.module;
        const hasVisible = grid.querySelector(`.perm-item[data-perm^="${mod}:"]:not([style*="display: none"])`);
        header.style.display = hasVisible ? '' : 'none';
    });
}

function updatePermCount() {
    const checked = el('permGrid')?.querySelectorAll('input:checked').length || 0;
    if (el('permCount')) el('permCount').textContent = `${checked} / ${allPermisos.length} permisos activos`;
}

async function savePermisos() {
    if (!currentFichaId) return;
    const checked = Array.from(el('permGrid').querySelectorAll('.perm-item input[type=checkbox]:checked')).map(cb => cb.value).filter(v => v && v !== 'on' && v.includes(':'));
    const fd = new FormData();
    fd.append('action', 'save_permisos');
    fd.append('usuario_id', currentFichaId);
    fd.append('permisos', JSON.stringify(checked));
    const res = await apiFetch(API, fd);
    if (res.status === 'success') showToast('Permisos guardados', 'success');
    else showToast(res.message || 'Error', 'error');
}

async function loadRolePresets() {
    const res = await fetch(`${API}?action=roles&t=${Date.now()}`).then(r => r.json());
    const sel = el('permRolePreset');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Personalizar —</option>';
    if (res.status === 'success' && Array.isArray(res.data)) {
        res.data.forEach(r => {
            const o = document.createElement('option');
            o.value = r.id;
            o.textContent = `${r.nombre} (${r.permisos_count || '?'} permisos)`;
            sel.appendChild(o);
        });
    }
}

async function applyRolePreset() {
    const roleId = el('permRolePreset')?.value;
    if (!roleId) return;
    const res = await fetch(`${API}?action=role_permisos&rol_id=${roleId}&t=${Date.now()}`).then(r => r.json());
    if (res.status === 'success' && Array.isArray(res.data)) {
        userPermisos = res.data.map(p => p.permiso || p);
        renderPermisos();
    }
}

// ── Actividad ────────────────────────────────────────────────────────────────
async function loadActivity(userId) {
    const log = el('activityLog');
    if (!log) return;
    log.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

    const res = await fetch(`${API}?action=activity&usuario_id=${userId}&t=${Date.now()}`).then(r => r.json());
    if (res.status !== 'success' || !res.data?.length) {
        allActivityData = [];
        log.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);"><i class="fas fa-clock-rotate-left" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:8px;"></i>Sin actividad registrada</div>';
        return;
    }
    allActivityData = res.data;
    _renderFilteredActivity();
}

// ── Roles Modal ──────────────────────────────────────────────────────────────
function setupRolesModal() {
    if (el('btnRoles')) el('btnRoles').onclick = () => { loadRolesModal(); el('rolesModal').style.display = 'flex'; };
}

async function loadRolesModal() {
    const container = el('rolesList');
    container.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';

    const res = await fetch(`${API}?action=roles&t=${Date.now()}`).then(r => r.json());
    if (res.status !== 'success' || !res.data?.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);">No hay roles</div>';
        return;
    }

    const desc = {
        1: { text: 'Acceso total al sistema — configuración, permisos, auditoría, sesiones', icon: 'fa-crown', color: '#DC2626' },
        2: { text: 'Gestión completa de clientes, OTs, finanzas e inventario — sin config admin', icon: 'fa-user-tie', color: '#F59E0B' },
        3: { text: 'Recepción de vehículos, gestión de clientes y órdenes de trabajo', icon: 'fa-headset', color: '#4B7BEC' },
        4: { text: 'Ejecución de OTs, inventario, diagnósticos y asignaciones de taller', icon: 'fa-wrench', color: '#27ae60' },
        5: { text: 'Presupuestos, ventas, punto de venta y gestión de clientes', icon: 'fa-tag', color: '#8e44ad' },
        6: { text: 'Solo lectura — acceso restringido a consulta de datos', icon: 'fa-eye', color: '#6B7280' }
    };

    container.innerHTML = res.data.map(r => {
        const d = desc[r.nivel] || { text: r.descripcion || '', icon: 'fa-shield', color: 'var(--primary)' };
        return `<div class="role-card" style="margin-bottom:12px;padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:8px;background:${d.color}15;color:${d.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas ${d.icon}"></i></div>
                <div style="flex:1;">
                    <div class="role-name">${escapeHtml(r.nombre)} <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:400;">Nivel ${r.nivel}</span></div>
                    <div class="role-desc">${escapeHtml(d.text)}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.75rem;font-weight:600;color:var(--primary);">${r.permisos_count || 0}</div>
                    <div style="font-size:0.65rem;color:var(--text-secondary);">permisos</div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Solicitudes de Registro ────────────────────────────────────────────────
let solicitudesCurrentPage = 1;
let solicitudActual = null;

function setupSolicitudes() {
    const btn = document.getElementById('btnSolicitudes');
    const btnBack = document.getElementById('btnBackFromSolicitudes');
    const btnBack2 = document.getElementById('btnBackFromSolicitud');
    const filter = document.getElementById('solicitudesFilter');
    const btnRefresh = document.getElementById('btnRefreshSolicitudes');
    const btnAprobar = document.getElementById('btnAprobarSolicitud');
    const btnRechazar = document.getElementById('btnRechazarSolicitud');
    const btnGenPwd = document.getElementById('btnGenPassword');

    if (btn) btn.addEventListener('click', () => showSolicitudesView());
    if (btnBack) btnBack.addEventListener('click', () => hideSolicitudesView());
    if (btnBack2) btnBack2.addEventListener('click', () => hideFichaSolicitud());
    if (filter) filter.addEventListener('change', () => loadSolicitudes());
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadSolicitudes());
    if (btnAprobar) btnAprobar.addEventListener('click', () => aprobarSolicitud());
    if (btnRechazar) btnRechazar.addEventListener('click', () => rechazarSolicitud());
    if (btnGenPwd) btnGenPwd.addEventListener('click', () => {
        const pwd = _genRandomPassword();
        document.getElementById('solPassword').value = pwd;
    });

    loadSolicitudesCount();
}

function _genRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    return pwd;
}

function loadSolicitudesCount() {
    fetch(API + '?action=solicitudes_count')
        .then(r => r.json())
        .then(d => {
            if (d.status === 'success') {
                const badge = document.getElementById('solicitudesBadge');
                const count = d.data.pendientes;
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? 'flex' : 'none';
                }
            }
        }).catch(() => {});
}

function showSolicitudesView() {
    document.getElementById('listView').style.display = 'none';
    document.getElementById('fichaContainer').style.display = 'none';
    document.getElementById('solicitudesView').style.display = '';
    document.getElementById('fichaSolicitud').style.display = 'none';
    loadSolicitudes();
}

function hideSolicitudesView() {
    document.getElementById('solicitudesView').style.display = 'none';
    document.getElementById('listView').style.display = '';
    loadData();
}

function hideFichaSolicitud() {
    document.getElementById('fichaSolicitud').style.display = 'none';
    document.getElementById('solicitudesView').style.display = '';
    loadSolicitudes();
}

function loadSolicitudes(page) {
    page = page || 1;
    solicitudesCurrentPage = page;
    const estado = document.getElementById('solicitudesFilter').value;
    const container = document.getElementById('solicitudesContainer');

    fetch(API + '?action=solicitudes&estado=' + encodeURIComponent(estado) + '&page=' + page)
        .then(r => r.json())
        .then(d => {
            if (d.status !== 'success') {
                container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">' + escapeHtml(d.message || 'Error') + '</div>';
                return;
            }
            const items = d.data.items;
            const total = d.data.total;

            if (items.length === 0) {
                container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:8px;display:block;opacity:0.4;"></i>No hay solicitudes ' + escapeHtml(estado || '') + '</div>';
                return;
            }

            let html = '<div class="card-grid">';
            items.forEach(s => {
                const initials = ((s.nombre || '')[0] + (s.apellido || '')[0]).toUpperCase();
                const estadoBadge = s.estado === 'pendiente' ? '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">Pendiente</span>'
                    : s.estado === 'aprobada' ? '<span style="background:#DCFCE7;color:#166534;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">Aprobada</span>'
                    : '<span style="background:#FEE2E2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">Rechazada</span>';
                const created = s.usuario_creado_username ? '<div style="font-size:0.7rem;color:var(--primary);margin-top:2px;">@' + escapeHtml(s.usuario_creado_username) + '</div>' : '';
                const motivo = s.motivo ? '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">"' + escapeHtml(s.motivo.substring(0, 80)) + (s.motivo.length > 80 ? '...' : '') + '"</div>' : '';

                html += `<div class="card compact-list-row" style="cursor:pointer;" onclick="openSolicitud(${s.id})">
                    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;">
                        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#D97706,#F59E0B);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.8rem;flex-shrink:0;">${escapeHtml(initials)}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(s.nombre)} ${escapeHtml(s.apellido)}</div>
                            <div style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(s.email)} ${s.telefono ? '· ' + escapeHtml(s.telefono) : ''}</div>
                            ${created}${motivo}
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            ${estadoBadge}
                            <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:4px;">${escapeHtml(s.creado ? new Date(s.creado).toLocaleDateString('es-CL') : '')}</div>
                        </div>
                    </div>
                </div>`;
            });
            html += '</div>';

            // Pagination
            if (d.data.total_pages > 1) {
                html += '<div style="display:flex;justify-content:center;gap:8px;margin-top:16px;">';
                for (let i = 1; i <= d.data.total_pages; i++) {
                    const active = i === page ? 'background:var(--primary);color:#fff;' : '';
                    html += `<button class="btn btn-sm btn-secondary" style="${active}" onclick="loadSolicitudes(${i})">${i}</button>`;
                }
                html += '</div>';
            }

            container.innerHTML = html;
        }).catch(err => {
            container.innerHTML = '<div style="padding:40px;text-align:center;color:#DC2626;">Error de conexión</div>';
        });
}

function openSolicitud(id) {
    fetch(API + '?action=solicitud&id=' + id)
        .then(r => r.json())
        .then(d => {
            if (d.status !== 'success') {
                showToast(d.message || 'Error', 'error');
                return;
            }
            solicitudActual = d.data;
            _renderSolicitudFicha(d.data);
        }).catch(err => showToast('Error de conexión', 'error'));
}

function _renderSolicitudFicha(sol) {
    document.getElementById('solicitudesView').style.display = 'none';
    document.getElementById('listView').style.display = 'none';
    document.getElementById('fichaContainer').style.display = 'none';
    const ficha = document.getElementById('fichaSolicitud');
    ficha.style.display = '';

    const initials = ((sol.nombre || '')[0] + (sol.apellido || '')[0]).toUpperCase();
    document.getElementById('solAvatar').textContent = initials;
    document.getElementById('solTitle').textContent = sol.nombre + ' ' + sol.apellido;
    document.getElementById('solSub').innerHTML = escapeHtml(sol.email) + (sol.telefono ? ' · ' + escapeHtml(sol.telefono) : '');
    document.getElementById('solContacts').innerHTML = sol.rut ? '<span style="font-size:0.8rem;color:var(--text-secondary);"><i class="fas fa-id-card"></i> ' + escapeHtml(sol.rut) + '</span>' : '';

    // Detalle
    const detalle = document.getElementById('solDetalleContent');
    let detHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">';
    detHtml += _solField('Nombre', sol.nombre + ' ' + sol.apellido);
    detHtml += _solField('Email', sol.email);
    detHtml += _solField('Teléfono', sol.telefono || '—');
    detHtml += _solField('RUT', sol.rut || '—');
    detHtml += _solField('Empresa', sol.empresa || '—');
    detHtml += _solField('Estado', sol.estado);
    detHtml += _solField('Fecha solicitud', sol.creado ? new Date(sol.creado).toLocaleString('es-CL') : '—');
    detHtml += _solField('Revisado por', sol.admin_username ? '@' + sol.admin_username : '—');
    detHtml += '</div>';
    if (sol.motivo) {
        detHtml += '<div style="margin-top:16px;"><label style="font-weight:600;font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:4px;">Motivo:</label><p style="font-size:0.85rem;line-height:1.5;">' + escapeHtml(sol.motivo) + '</p></div>';
    }
    if (sol.motivo_rechazo) {
        detHtml += '<div style="margin-top:12px;padding:12px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA;"><label style="font-weight:600;font-size:0.8rem;color:#991b1b;display:block;margin-bottom:4px;">Motivo de rechazo:</label><p style="font-size:0.85rem;color:#991b1b;">' + escapeHtml(sol.motivo_rechazo) + '</p></div>';
    }
    if (sol.usuario_creado_username) {
        detHtml += '<div style="margin-top:12px;padding:12px;background:#F0FDF4;border-radius:8px;border:1px solid #BBF7D0;"><label style="font-weight:600;font-size:0.8rem;color:#166534;display:block;margin-bottom:4px;">Usuario creado:</label><p style="font-size:0.85rem;color:#166534;"><strong>@' + escapeHtml(sol.usuario_creado_username) + '</strong></p></div>';
    }
    detalle.innerHTML = detHtml;

    // Aprobar tab - load roles
    if (sol.estado === 'pendiente') {
        fetch(API + '?action=roles').then(r => r.json()).then(d => {
            if (d.status === 'success') {
                const sel = document.getElementById('solRolSelect');
                sel.innerHTML = '<option value="">— Seleccionar rol —</option>';
                d.data.forEach(r => {
                    sel.innerHTML += `<option value="${r.id}">${escapeHtml(r.nombre)} (Nivel ${r.nivel})</option>`;
                });
                // Default role from config
                sel.value = '6'; // Solo Lectura
            }
        }).catch(() => {});
        document.getElementById('solUsername').value = '';
        document.getElementById('solPassword').value = _genRandomPassword();
    }

    // Setup ficha tabs for solicitud — delegated via onclick in HTML (switchSolTab)
}

function switchSolTab(tabEl, tabName) {
    const ficha = document.getElementById('fichaSolicitud');
    if (!ficha) return;
    ficha.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
    ficha.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
    tabEl.classList.add('active');
    const panelId = 'tabSol' + capitalize(tabName);
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
}

function _solField(label, value) {
    return `<div><label style="font-weight:600;font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:2px;">${escapeHtml(label)}</label><div style="font-size:0.85rem;">${escapeHtml(value)}</div></div>`;
}

function aprobarSolicitud() {
    if (!solicitudActual) return;
    const rolId = parseInt(document.getElementById('solRolSelect').value);
    const username = document.getElementById('solUsername').value.trim();
    const password = document.getElementById('solPassword').value;

    if (!rolId) { showToast('Seleccione un rol', 'error'); return; }
    if (!password || password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

    const btn = document.getElementById('btnAprobarSolicitud');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    fetch(API + '?action=aprobar_solicitud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: solicitudActual.id, rol_id: rolId, username: username, password: password })
    }).then(r => r.json()).then(d => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Aprobar y Crear Usuario';
        if (d.status === 'success') {
            showToast(d.message, 'success');
            hideFichaSolicitud();
            loadSolicitudesCount();
        } else {
            showToast(d.message || 'Error', 'error');
        }
    }).catch(err => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Aprobar y Crear Usuario';
        showToast('Error de conexión', 'error');
    });
}

function rechazarSolicitud() {
    if (!solicitudActual) return;
    const motivo = prompt('Motivo del rechazo (opcional):');
    if (motivo === null) return; // user cancelled

    const btn = document.getElementById('btnRechazarSolicitud');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    fetch(API + '?action=rechazar_solicitud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: solicitudActual.id, motivo: motivo })
    }).then(r => r.json()).then(d => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-times"></i> Rechazar';
        if (d.status === 'success') {
            showToast(d.message, 'success');
            hideFichaSolicitud();
            loadSolicitudesCount();
        } else {
            showToast(d.message || 'Error', 'error');
        }
    }).catch(err => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-times"></i> Rechazar';
        showToast('Error de conexión', 'error');
    });
}

// ── Utility: Relative Time ──────────────────────────────────────────────────
function _formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'hace un momento';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Help Button ─────────────────────────────────────────────────────────────
function setupHelpButton() {
    const btn = el('btnHelp');
    if (btn) btn.onclick = () => { const m = el('helpModal'); if (m) m.style.display = 'flex'; };
}

// ── Nivel Preview ───────────────────────────────────────────────────────────
function setupNivelPreview() {
    const nivelInput = el('usr-nivel');
    const preview = el('nivelPreview');
    if (!nivelInput || !preview) return;

    const nivelInfo = {
        1: { label: 'Administrador', desc: 'Acceso total al sistema. Puede gestionar configuración, permisos, roles y auditoría.', color: '#DC2626' },
        2: { label: 'Gerente', desc: 'Gestión completa de clientes, OTs, inventario y finanzas. Sin acceso a configuración admin.', color: '#F59E0B' },
        3: { label: 'Recepcionista', desc: 'Recepción de vehículos, clientes, órdenes de trabajo y agenda.', color: '#4B7BEC' },
        4: { label: 'Técnico', desc: 'Ejecución de OTs, inventario, diagnósticos y asignaciones de taller.', color: '#27ae60' },
        5: { label: 'Vendedor', desc: 'Presupuestos, ventas, punto de venta y gestión de clientes.', color: '#8e44ad' },
        6: { label: 'Solo Lectura', desc: 'Consulta de datos sin posibilidad de modificar. Acceso restringido.', color: '#6B7280' }
    };

    function updatePreview() {
        const n = parseInt(nivelInput.value);
        const info = nivelInfo[n];
        if (info) {
            preview.style.display = 'block';
            preview.style.borderColor = info.color + '40';
            preview.innerHTML = `<strong style="color:${info.color};">${info.label}</strong> — ${info.desc}`;
        } else {
            preview.style.display = 'none';
        }
    }

    nivelInput.addEventListener('input', updatePreview);
    nivelInput.addEventListener('change', updatePreview);
    updatePreview();
}

// ── Password Strength ───────────────────────────────────────────────────────
function setupPasswordStrength() {
    const pwdInput = el('usr-password');
    const strengthEl = el('pwdStrength');
    const barEl = el('pwdStrengthBar');
    const labelEl = el('pwdStrengthLabel');
    if (!pwdInput || !strengthEl || !barEl || !labelEl) return;

    pwdInput.addEventListener('input', function() {
        const pwd = this.value;
        if (!pwd) {
            strengthEl.style.display = 'none';
            labelEl.style.display = 'none';
            return;
        }

        let score = 0;
        if (pwd.length >= 6) score++;
        if (pwd.length >= 10) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;

        const levels = [
            { max: 1, label: 'Muy débil', color: '#DC2626', width: '20%' },
            { max: 2, label: 'Débil', color: '#F59E0B', width: '40%' },
            { max: 3, label: 'Media', color: '#F59E0B', width: '60%' },
            { max: 4, label: 'Fuerte', color: '#27ae60', width: '80%' },
            { max: 5, label: 'Muy fuerte', color: '#16A34A', width: '100%' }
        ];

        const level = levels.find(l => score <= l.max) || levels[4];
        strengthEl.style.display = 'block';
        labelEl.style.display = 'block';
        barEl.style.width = level.width;
        barEl.style.background = level.color;
        labelEl.textContent = level.label;
        labelEl.style.color = level.color;
    });
}

// ── Activity Filter ─────────────────────────────────────────────────────────
let allActivityData = [];

function setupActivityFilter() {
    const filter = el('activityTypeFilter');
    if (filter) filter.addEventListener('change', () => _renderFilteredActivity());
}

function _renderFilteredActivity() {
    const filter = el('activityTypeFilter');
    const log = el('activityLog');
    if (!filter || !log || !allActivityData.length) return;

    const type = filter.value;
    const filtered = type ? allActivityData.filter(a => a.accion === type) : allActivityData;

    if (!filtered.length) {
        log.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">Sin actividad de este tipo</div>';
        return;
    }

    const icons = { login: ['fa-right-to-bracket', '#27ae60'], logout: ['fa-right-from-bracket', '#95a5a6'], create: ['fa-plus', '#3498db'], update: ['fa-pen', '#f39c12'], delete: ['fa-trash', '#e74c3c'] };
    log.innerHTML = filtered.map(a => {
        const ic = icons[a.accion] || ['fa-circle-info', '#7f8c8d'];
        return `<div class="activity-row">
            <div class="activity-icon" style="background:${ic[1]}22;color:${ic[1]};"><i class="fas ${ic[0]}"></i></div>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(a.accion)}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(a.detalle || '')}</div>
            </div>
            <div style="font-size:0.7rem;color:var(--text-secondary);white-space:nowrap;">${escapeHtml(a.fecha || '')}</div>
        </div>`;
    }).join('');
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
(function() {
    const toggle = document.getElementById('sidebarCollapseBtn');
    const sidebar = document.getElementById('sidebar');
    if (toggle && sidebar) {
        toggle.onclick = () => {
            sidebar.classList.toggle('collapsed');
            toggle.querySelector('i').className = sidebar.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        };
    }
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle && sidebar) {
        menuToggle.onclick = () => sidebar.classList.toggle('open');
    }
    // Nav search
    const navSearch = document.getElementById('navSearch');
    if (navSearch) {
        navSearch.addEventListener('input', function() {
            const q = this.value.toLowerCase().trim();
            document.querySelectorAll('.nav-item').forEach(item => {
                const text = (item.textContent + ' ' + (item.title || '')).toLowerCase();
                item.style.display = (!q || text.includes(q)) ? '' : 'none';
            });
            const empty = document.querySelector('.nav-search-empty');
            const anyVisible = [...document.querySelectorAll('.nav-item')].some(i => i.style.display !== 'none');
            if (empty) empty.style.display = (q && !anyVisible) ? 'block' : 'none';
        });
    }
})();
