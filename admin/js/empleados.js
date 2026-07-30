const API = API_ROOT + 'empleados_api.php';
let currentPage = 1;
let currentFichaId = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadDynamicOptions('cargo', 'cargo_empleado');
    await loadDynamicOptions('banco', 'bancos');
    await loadRoles();
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
    setupCuentaActions();
    setupSearch();

    const mmToolbar = el('multimediaToolbar');
    const fileInput = document.querySelector('.upload-file-input');
    if (fileInput) setupMultimediaToolbar(mmToolbar, fileInput);

    const urlId = new URLSearchParams(window.location.search).get('id');
    if (urlId) { openFicha(urlId); } else { loadData(); }
    setupReactiveRefresh(loadData);
    setTimeout(function() {
        const grid = document.getElementById('cardGrid');
        if (grid && (!grid.children || grid.children.length === 0)) {
            try { loadData(); } catch(e) { console.error(e); }
        }
    }, 800);
});

// ── Card Grid ────────────────────────────────────────────────────────────────
function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar</p></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>No se encontraron empleados</p></div>'; return; }
            grid.innerHTML = items.map(e => `
                <div class="record-card" data-id="${e.id}" onclick="openFicha(${e.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${e.thumb_url
                            ? `<img src="${esc(e.thumb_url)}" alt="" loading="lazy" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg-input);">`
                            : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;">${(e.nombre||'E')[0]}${(e.apellido||'')[0]}</div>`
                        }
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(e.nombre || '')} ${esc(e.apellido || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.cargo || '')}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${esc(e.telefono || '')}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            renderPagination(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', cambiarPagina);
        }).catch(() => { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p></div>'; });
}

function cambiarPagina(p) { loadData(p, el('searchInput').value); }

function setupSearch() {
    let timer;
    el('searchInput').addEventListener('input', function() {
        clearTimeout(timer);
        timer = setTimeout(() => loadData(1, this.value), 400);
    });
}

// ── Ficha Completa ───────────────────────────────────────────────────────────
function openFicha(id) {
    currentFichaId = id;
    el('listView').style.display = 'none';
    el('fichaContainer').classList.add('active');
    loadFichaData(id);
}

function closeFicha() {
    el('listView').style.display = '';
    el('fichaContainer').classList.remove('active');
    currentFichaId = null;
    loadData(currentPage, el('searchInput').value);
}

function setupFichaTabs() {
    el('fichaTabs').addEventListener('click', e => {
        const tab = e.target.closest('.ficha-tab');
        if (!tab) return;
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        el('tab' + capitalize(tab.dataset.tab)).classList.add('active');
    });
}

function setupFichaActions() {
    el('btnBackList').addEventListener('click', closeFicha);
    el('btnFichaDelete').addEventListener('click', async () => {
        if (!currentFichaId) return;
        if (!confirm('¿Eliminar este empleado y todos sus datos?')) return;
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', currentFichaId);
        try {
            const res = await fetch(API, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') { showSuccess('Eliminado'); closeFicha(); }
            else showError(data.message);
        } catch(e) { showError('Error al eliminar'); }
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset();
        el('record_id').value = '';
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nuevo Empleado';
        el('fichaSub').textContent = 'Complete los datos del empleado';
        el('fichaAvatar').textContent = 'EM';
        el('fichaStats').innerHTML = '';
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.ficha-tab[data-tab="datos"]').classList.add('active');
        el('tabDatos').classList.add('active');
    });
}

async function loadFichaData(id) {
    try {
        const res = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const json = await res.json();
        if (json.status !== 'success') return;
        const e = json.data;

        el('fichaTitle').textContent = `${e.nombre || ''} ${e.apellido || ''}`;
        el('fichaSub').textContent = `${e.cargo || ''} ${e.rut ? '· ' + e.rut : ''} ${e.telefono ? '· ' + e.telefono : ''}`;
        el('fichaAvatar').textContent = `${(e.nombre||'E')[0]}${(e.apellido||'')[0]}`.toUpperCase();

        el('record_id').value = e.id;
        await loadDynamicOptions('cargo', 'cargo_empleado', e.cargo);
        await loadDynamicOptions('banco', 'bancos', e.banco);
        ['nombre','apellido','rut','telefono','correo','direccion','sueldo','fechaingreso','fecha_nacimiento','cuentabancaria','facebook','instagram','descripcionlaboral','detalles_personales'].forEach(name => {
            const input = el(name);
            if (input) { input.value = e[name] || ''; input.classList.remove('field-error','field-success'); }
        });

        el('fichaStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${esc(e.cargo || '—')}</div><div class="stat-lbl">Cargo</div></div>
            <div class="stat-card"><div class="stat-val">${esc(e.fechaingreso || '—')}</div><div class="stat-lbl">Ingreso</div></div>
            <div class="stat-card"><div class="stat-val">${e.sueldo ? '$' + Number(e.sueldo).toLocaleString() : '—'}</div><div class="stat-lbl">Sueldo</div></div>
        `;

        renderExistingMedia(e.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'empleados');
    } catch(e) { console.error('Ficha error:', e); }
}

// ── Form Submit ──────────────────────────────────────────────────────────────
function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const rules = { nombre: { required: true }, rut: { type: 'rut' }, correo: { type: 'email' } };
        if (!validateForm('dataForm', rules)) return;
        const btn = el('btnSave');
        setButtonLoading(btn, true, 'Guardando...');
        const fd = prepareSanitizedFormData(el('dataForm'));
        const fi = document.querySelector('.upload-file-input');
        if (fi && fi.files.length) Array.from(fi.files).forEach(f => fd.append('archivos[]', f));
        try {
            const d = await uploadWithProgress(API, fd);
            if (d.status === 'success') {
                showSuccess(d.message || 'Guardado');
                if (d.data?.id && !currentFichaId) currentFichaId = d.data.id;
                if (currentFichaId) loadFichaData(currentFichaId);
            } else showError(d.message || 'Error al guardar');
        } catch(e) { showError('Error de conexión'); }
        finally { setButtonLoading(btn, false); }
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderPagination(total, page, perPage, containerId, callback) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, containerId, callback); }

// ── Cuenta de Acceso ─────────────────────────────────────────────────────────
let rolesData = [];

async function loadRoles() {
    try {
        const res = await fetch(`${API}?action=roles&t=${Date.now()}`);
        const json = await res.json();
        if (json.status === 'success' && json.data) {
            rolesData = json.data;
            const sel = el('rol_select');
            sel.innerHTML = '<option value="">Sin rol asignado</option>';
            json.data.forEach(r => {
                sel.innerHTML += `<option value="${r.id}">${esc(r.nombre)} (Nivel ${r.nivel})</option>`;
            });
        }
    } catch(e) { console.error('Error loading roles:', e); }
}

async function loadUsuarioData(empleadoId) {
    try {
        const res = await fetch(`${API}?action=usuario_data&id=${empleadoId}&t=${Date.now()}`);
        const json = await res.json();
        if (json.status === 'success' && json.data) {
            const u = json.data;
            el('usuario_id').value = u.usuario_id || '';
            el('username').value = u.username || '';
            el('rol_select').value = u.rol_id || '';
            el('usuario_activo').value = u.activo != null ? u.activo : '1';
            el('passwordLabel').textContent = 'Nueva Contraseña (dejar vacío para mantener)';
            el('password').value = '';
            el('password').placeholder = 'Dejar vacío para no cambiar';
            el('confirmGroup').style.display = 'none';
        } else {
            // No hay cuenta vinculada
            el('usuario_id').value = '';
            el('username').value = '';
            el('rol_select').value = '';
            el('usuario_activo').value = '1';
            el('passwordLabel').textContent = 'Contraseña';
            el('password').value = '';
            el('password').placeholder = 'Mínimo 6 caracteres';
            el('confirmGroup').style.display = 'none';
        }
    } catch(e) { console.error('Error loading usuario data:', e); }
}

function setupCuentaActions() {
    // Botón guardar cuenta
    el('btnSaveCuenta').addEventListener('click', async () => {
        if (!currentFichaId) {
            showError('Guarde primero los datos del empleado antes de configurar la cuenta.');
            return;
        }
        const username = el('username').value.trim();
        const password = el('password').value;
        const confirm = el('password_confirm').value;

        if (username === '') {
            showError('Ingrese un nombre de usuario.');
            return;
        }
        if (password !== confirm) {
            showError('Las contraseñas no coinciden.');
            return;
        }

        const btn = el('btnSaveCuenta');
        setButtonLoading(btn, true, 'Guardando...');

        const fd = new FormData();
        fd.append('id', currentFichaId);
        fd.append('username', username);
        fd.append('password', password);
        fd.append('rol_select', el('rol_select').value);
        fd.append('usuario_activo', el('usuario_activo').value);

        try {
            const res = await fetch(API, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.status === 'success') {
                showSuccess('Cuenta de acceso guardada.');
                loadUsuarioData(currentFichaId);
            } else {
                showError(data.message || 'Error al guardar cuenta.');
            }
        } catch(e) { showError('Error de conexión'); }
        finally { setButtonLoading(btn, false); }
    });

    // Botón reset
    el('btnResetCuenta').addEventListener('click', () => {
        if (currentFichaId) loadUsuarioData(currentFichaId);
    });

    // Mostrar/ocultar confirmación de contraseña
    el('password').addEventListener('input', function() {
        const hasExisting = !!el('usuario_id').value;
        const hasNewPassword = this.value.length > 0;
        el('confirmGroup').style.display = (hasNewPassword) ? '' : 'none';
    });
}

// Patch loadFichaData to also load user data
const _origLoadFichaData = typeof loadFichaData === 'function' ? loadFichaData : null;
const origLoadFichaData = loadFichaData;
loadFichaData = async function(id) {
    await origLoadFichaData(id);
    loadUsuarioData(id);
};
