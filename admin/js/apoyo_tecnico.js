const API = API_ROOT + 'apoyo_tecnico_api.php';
let currentPage = 1;
let currentFichaId = null;
let currentModo = 'conocimiento';

document.addEventListener('DOMContentLoaded', async () => {
    const fi = document.querySelector('.upload-file-input');
    if (fi) setupMultimediaToolbar(el('multimediaToolbar'), fi);
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
    setupSearch();

    const urlParams = new URLSearchParams(window.location.search);
    const urlOtId = urlParams.get('ot_id');
    if (urlOtId) { cambiarModo('soporte'); if (el('ot_id')) el('ot_id').value = urlOtId; if (el('btnNuevo')) { el('dataForm').reset(); el('record_id').value = ''; openFichaNew(); } }
    const urlId = urlParams.get('id');
    if (urlId && !urlOtId) { const r = await fetch(`${API}?id=${urlId}&t=${Date.now()}`); const d = await r.json(); if (d.status === 'success' && d.data) openFicha(d.data.id); }
    else if (!urlId && !urlOtId) loadData();
    setupReactiveRefresh(loadData);
    setTimeout(function() { const g = el('cardGrid'); if (g && !g.children.length) try { loadData(); } catch(e) {} }, 800);
});

function cambiarModo(modo) {
    currentModo = modo;
    el('modo').value = modo;
    document.querySelectorAll('.module-tab').forEach(t => {
        const isActive = t.dataset.modo === modo;
        t.classList.toggle('active', isActive);
        t.style.color = isActive ? 'var(--primary)' : 'var(--text-secondary)';
        t.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
    });
    document.querySelectorAll('.soporte-field').forEach(f => f.style.display = modo === 'soporte' ? '' : 'none');
    currentFichaId = null; currentPage = 1;
    loadData();
}

function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&modo=${currentModo}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-life-ring"></i><p>Sin registros</p></div>'; return; }
            grid.innerHTML = items.map(a => `
                <div class="record-card" data-id="${a.id}" onclick="openFicha(${a.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0;"><i class="fas fa-life-ring"></i></div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(a.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.vehiculo_marca || '')} ${esc(a.vehiculo_modelo || '')}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            renderPagination(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', cambiarPagina);
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

function openFichaNew() {
    currentFichaId = null;
    el('listView').style.display = 'none';
    el('fichaContainer').classList.add('active');
    el('fichaTitle').textContent = 'Nuevo Registro';
    el('fichaSub').textContent = '';
    el('fichaAvatar').innerHTML = '<i class="fas fa-life-ring"></i>';
    document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.ficha-tab[data-tab="datos"]').classList.add('active');
    el('tabDatos').classList.add('active');
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
        if (!currentFichaId || !confirm('¿Eliminar este registro?')) return;
        const fd = new FormData(); fd.append('action', 'delete'); fd.append('id', currentFichaId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminado'); closeFicha(); } else showError(d.message);
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset(); el('record_id').value = '';
        if (el('modo')) el('modo').value = currentModo;
        openFichaNew();
    });
}

async function loadFichaData(id) {
    try {
        const r = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return;
        const a = d.data;
        el('fichaTitle').textContent = a.nombre || '—';
        el('fichaSub').textContent = `${a.vehiculo_marca || ''} ${a.vehiculo_modelo || ''} · ${a.tipo || ''}`;
        el('fichaAvatar').innerHTML = '<i class="fas fa-life-ring"></i>';
        el('record_id').value = a.id;
        ['nombre','vehiculo_marca','vehiculo_modelo','tipo','descripcion','responsable'].forEach(n => { const i = el(n); if (i) { i.value = a[n] || ''; i.classList.remove('field-error','field-success'); } });
        if (el('modo')) el('modo').value = a.modo || 'conocimiento';
        if (el('estado')) el('estado').value = a.estado || 'borrador';
        if (el('prioridad')) el('prioridad').value = a.prioridad || 'normal';
        if (el('ot_id')) el('ot_id').value = a.ot_id || '';
        if (a.modo === 'soporte') {
            currentModo = 'soporte';
            document.querySelectorAll('.soporte-field').forEach(f => f.style.display = '');
            document.querySelectorAll('.module-tab').forEach(t => {
                const isActive = t.dataset.modo === 'soporte';
                t.classList.toggle('active', isActive);
                t.style.color = isActive ? 'var(--primary)' : 'var(--text-secondary)';
                t.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
            });
        }
        renderExistingMedia(a.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'apoyo_tecnico');
    } catch(e) {}
}

function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm('dataForm', { nombre: { required: true } })) return;
        const btn = el('btnSave'); setButtonLoading(btn, true, 'Guardando...');
        const fd = prepareSanitizedFormData(el('dataForm'));
        fd.set('modo', currentModo);
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
function renderPagination(total, page, perPage, cid, cb) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, cid, cb); }
