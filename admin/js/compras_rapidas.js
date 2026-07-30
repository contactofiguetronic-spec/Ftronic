const API = API_ROOT + 'compras_rapidas_api.php';
let currentPage = 1;
let currentFichaId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (el('fecha') && !el('fecha').value) el('fecha').value = new Date().toISOString().split('T')[0];
    await Promise.all([
        loadDynamicOptions('tipo_pago', 'tipo_pago_compra_rapida'),
        loadLinkedSelect('empleado_responsable_id', 'empleados'),
        loadCuentasBancarias(),
    ]);
    setupProveedorTypeahead();
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
    setupSearch();
    const fi = document.querySelector('.upload-file-input');
    if (fi) setupMultimediaToolbar(el('multimediaToolbar'), fi);
    const urlId = new URLSearchParams(window.location.search).get('id');
    if (urlId) { openFicha(urlId); } else { loadData(); }
    setupReactiveRefresh(loadData);
    setTimeout(function() { const g = el('cardGrid'); if (g && !g.children.length) try { loadData(); } catch(e) {} }, 800);
});

function setupProveedorTypeahead() {
    const input = el('proveedor_nombre'), hidden = el('proveedor_id'), list = el('proveedorTypeahead'), btnNew = el('btnNuevoProveedor');
    if (!input || !list) return;
    let timer;
    input.addEventListener('input', () => {
        hidden.value = ''; clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 1) { list.style.display = 'none'; return; }
        timer = setTimeout(async () => {
            try {
                const res = await fetch(API_ROOT + 'proveedores_api.php?search=' + encodeURIComponent(q) + '&page=1');
                const d = await res.json();
                const items = d.data?.items || d.data || [];
                if (!items.length) { list.style.display = 'none'; return; }
                list.innerHTML = items.map(p => `<div data-id="${p.id}" data-nombre="${esc(p.nombre)}">${esc(p.nombre)}${p.rut ? ' — ' + esc(p.rut) : ''}</div>`).join('');
                list.style.display = 'block';
                list.querySelectorAll('div').forEach(item => item.addEventListener('mousedown', e => { e.preventDefault(); hidden.value = item.dataset.id; input.value = item.dataset.nombre; list.style.display = 'none'; }));
            } catch(e) { list.style.display = 'none'; }
        }, 300);
    });
    input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 200));
    if (btnNew) btnNew.addEventListener('click', async () => {
        const nombre = prompt('Nombre del nuevo proveedor:');
        if (!nombre) return;
        const fd = new FormData(); fd.append('action', 'create'); fd.append('nombre', nombre);
        const res = await fetch(API_ROOT + 'proveedores_api.php', { method: 'POST', body: fd });
        const d = await res.json();
        if (d.status === 'success' && d.data?.id) { hidden.value = d.data.id; input.value = nombre; showSuccess('Proveedor creado'); }
        else showError(d.message || 'Error');
    });
}

async function loadCuentasBancarias() {
    try {
        const res = await fetch(API_ROOT + 'cuentas_bancarias_api.php');
        const d = await res.json();
        const sel = el('cuenta_bancaria_id');
        if (!sel) return;
        (d.data?.items || d.data || []).forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.nombre + (c.banco ? ' — ' + c.banco : ''); sel.appendChild(opt); });
    } catch(e) {}
}

function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-bolt"></i><p>Sin compras rápidas</p></div>'; return; }
            grid.innerHTML = items.map(c => `
                <div class="record-card" data-id="${c.id}" onclick="openFicha(${c.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0;"><i class="fas fa-bolt"></i></div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(c.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);">$${Number(c.valor || 0).toLocaleString()} · ${esc(c.fecha || '')}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${esc(c.proveedor_nombre || '')} ${c.empleado_nombre ? '· ' + esc(c.empleado_nombre) : ''}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            renderPaginationLocal(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', cambiarPagina);
        }).catch(() => { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; });
}

function cambiarPagina(p) { loadData(p, el('searchInput').value); }
function setupSearch() { let t; el('searchInput').addEventListener('input', function() { clearTimeout(t); t = setTimeout(() => loadData(1, this.value), 400); }); }

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
        el('tab' + cap(tab.dataset.tab)).classList.add('active');
    });
}

function setupFichaActions() {
    el('btnBackList').addEventListener('click', closeFicha);
    el('btnFichaDelete').addEventListener('click', async () => {
        if (!currentFichaId || !confirm('¿Eliminar esta compra rápida?')) return;
        const fd = new FormData(); fd.append('action', 'delete'); fd.append('id', currentFichaId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminada'); closeFicha(); } else showError(d.message);
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset(); el('record_id').value = '';
        if (el('fecha')) el('fecha').value = new Date().toISOString().split('T')[0];
        if (el('proveedor_id')) el('proveedor_id').value = '';
        if (el('proveedor_nombre')) el('proveedor_nombre').value = '';
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nueva Compra Rápida';
        el('fichaSub').textContent = '';
        el('fichaAvatar').innerHTML = '<i class="fas fa-bolt"></i>';
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.ficha-tab[data-tab="datos"]').classList.add('active');
        el('tabDatos').classList.add('active');
    });
}

async function loadFichaData(id) {
    try {
        const r = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return;
        const c = d.data;
        el('fichaTitle').textContent = c.nombre || '—';
        el('fichaSub').textContent = `$${Number(c.valor || 0).toLocaleString()} · ${c.fecha || ''} · ${c.proveedor_nombre || ''}`;
        el('fichaAvatar').innerHTML = '<i class="fas fa-bolt"></i>';
        el('record_id').value = c.id;
        await Promise.all([
            loadDynamicOptions('tipo_pago', 'tipo_pago_compra_rapida', c.tipo_pago),
            loadLinkedSelect('empleado_responsable_id', 'empleados', c.empleado_responsable_id),
            loadCuentasBancarias(),
        ]);
        if (el('cuenta_bancaria_id') && c.cuenta_bancaria_id) el('cuenta_bancaria_id').value = c.cuenta_bancaria_id;
        if (el('proveedor_id')) el('proveedor_id').value = c.proveedor_id || '';
        if (el('proveedor_nombre')) el('proveedor_nombre').value = c.proveedor_nombre || '';
        ['fecha','nombre','lugar_compra','valor','detalle'].forEach(n => { const i = el(n); if (i) { i.value = c[n] || ''; i.classList.remove('field-error','field-success'); } });
        renderExistingMedia(c.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'compras_rapidas');
    } catch(e) {}
}

function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm('dataForm', { fecha: { required: true }, nombre: { required: true }, valor: { required: true } })) return;
        const btn = el('btnSave'); setButtonLoading(btn, true, 'Guardando...');
        const fd = prepareSanitizedFormData(el('dataForm'));
        const fi = document.querySelector('.upload-file-input');
        if (fi && fi.files.length) Array.from(fi.files).forEach(f => fd.append('archivos[]', f));
        try {
            const d = await uploadWithProgress(API, fd);
            if (d.status === 'success') { showSuccess(d.message || 'Guardado'); if (d.data?.id && !currentFichaId) currentFichaId = d.data.id; if (currentFichaId) loadFichaData(currentFichaId); }
            else showError(d.message || 'Error');
        } catch(e) { showError('Error de conexión'); }
        finally { setButtonLoading(btn, false); }
    });
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderPaginationLocal(total, page, perPage, cid, cb) { renderPagination(cid, total, perPage, page, cb); }
