const API = API_ROOT + 'zonas_taller_api.php';
let currentPage = 1;
let currentFichaId = null;

document.addEventListener('DOMContentLoaded', async () => {
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

function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>Sin zonas</p></div>'; return; }
            grid.innerHTML = items.map(z => {
                const hasImage = z.thumb_url && z.thumb_url.trim();
                const avatar = hasImage
                    ? `<div style="width:48px;height:48px;border-radius:10px;overflow:hidden;flex-shrink:0;"><img src="${esc(z.thumb_url)}" alt="${esc(z.nombre)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>`
                    : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0;"><i class="fas fa-map-marker-alt"></i></div>`;
                return `
                <div class="record-card" data-id="${z.id}" onclick="openFicha(${z.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${avatar}
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(z.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(z.descripcion || '')}</div>
                        </div>
                    </div>
                </div>`;
            }).join('');
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
        if (!currentFichaId || !confirm('¿Eliminar esta zona y sus archivos?')) return;
        const fd = new FormData(); fd.append('action', 'delete'); fd.append('id', currentFichaId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminada'); closeFicha(); } else showError(d.message);
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset(); el('record_id').value = '';
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nueva Zona';
        el('fichaSub').textContent = '';
        el('fichaAvatar').innerHTML = '<i class="fas fa-map-marker-alt"></i>';
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
        const z = d.data;
        el('fichaTitle').textContent = z.nombre || '—';
        el('fichaSub').textContent = z.descripcion || '';
        const hasImg = z.archivos && z.archivos.length && z.archivos[0].ruta_archivo;
        el('fichaAvatar').innerHTML = hasImg
            ? `<img src="${esc(z.archivos[0].ruta_archivo)}" alt="${esc(z.nombre)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : '<i class="fas fa-map-marker-alt"></i>';
        el('record_id').value = z.id;
        ['nombre','descripcion'].forEach(n => { const i = el(n); if (i) { i.value = z[n] || ''; i.classList.remove('field-error','field-success'); } });
        renderExistingMedia(z.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'zonas_taller');
    } catch(e) {}
}

function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm('dataForm', { nombre: { required: true } })) return;
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
function renderPagination(total, page, perPage, cid, cb) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, cid, cb); }
