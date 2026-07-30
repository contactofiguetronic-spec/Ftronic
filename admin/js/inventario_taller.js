const API = API_ROOT + 'inventario_taller_api.php';
const ZONAS_API = API_ROOT + 'zonas_taller_api.php';
let currentPage = 1;
let currentFichaId = null;
let zonasCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadLinkedSelect('zona_taller_id', 'zonas_taller');
    await loadDynamicOptions('categoria', 'categoria_inventario');
    await loadDynamicOptions('utilidad', 'utilidad_inventario');
    setupZonaPicker();
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
    if (el('btnAddZona')) el('btnAddZona').addEventListener('click', async () => {
        const zona = await WizardZonaTaller.open();
        if (zona) { await loadLinkedSelect('zona_taller_id', 'zonas_taller', zona.id); actualizarZonaPicker(); showSuccess('Zona seleccionada'); }
    });
});

/* ═══ ZONA PICKER ═══ */
async function setupZonaPicker() {
    const trigger = el('zonaPickerTrigger'), modal = el('zonaPickerModal'), search = el('zonaPickerSearch'), clear = el('zonaPickerClear'), closeBtn = el('zonaPickerClose');
    if (trigger) trigger.addEventListener('click', () => abrirZonaPicker());
    if (closeBtn) closeBtn.addEventListener('click', () => cerrarZonaPicker());
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) cerrarZonaPicker(); });
    if (clear) clear.addEventListener('click', () => { const s = el('zona_taller_id'); if (s) s.value = ''; actualizarZonaPicker(); });
    if (search) search.addEventListener('input', debounce(() => renderZonaGrid(search.value.trim()), 250));
    actualizarZonaPicker();
}

async function abrirZonaPicker() {
    const modal = el('zonaPickerModal');
    if (!modal) return;
    modal.classList.add('active');
    const search = el('zonaPickerSearch');
    if (search) { search.value = ''; setTimeout(() => search.focus(), 50); }
    if (!zonasCache.length) await cargarZonasCache();
    renderZonaGrid('');
}

function cerrarZonaPicker() { const m = el('zonaPickerModal'); if (m) m.classList.remove('active'); }

async function cargarZonasCache() {
    try { const r = await fetch(`${ZONAS_API}?page=1&per_page=200&t=${Date.now()}`); const d = await r.json(); if (d.status === 'success') zonasCache = d.data.items || []; } catch(e) { zonasCache = []; }
}

function renderZonaGrid(filter) {
    const grid = el('zonaPickerGrid');
    if (!grid) return;
    const q = (filter || '').toLowerCase();
    const items = zonasCache.filter(z => !q || (z.nombre || '').toLowerCase().includes(q));
    if (!items.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-search"></i><p>No se encontraron zonas</p></div>'; return; }
    const sel = el('zona_taller_id');
    const currentSel = sel ? sel.value : '';
    grid.innerHTML = items.map(z => {
        const isSelected = String(z.id) === String(currentSel);
        const thumb = z.thumb_url ? `<img src="${esc(z.thumb_url)}" alt="${esc(z.nombre)}" loading="lazy">` : `<div class="zona-card-noimg"><i class="fas fa-map-marker-alt"></i></div>`;
        return `<div class="zona-card ${isSelected ? 'selected' : ''}" data-id="${z.id}" onclick="seleccionarZonaPicker(${z.id})"><div class="zona-card-thumb">${thumb}</div><div class="zona-card-body"><strong>${esc(z.nombre || '—')}</strong>${z.descripcion ? `<small>${esc(z.descripcion)}</small>` : ''}</div>${isSelected ? '<div class="zona-card-check"><i class="fas fa-check"></i></div>' : ''}</div>`;
    }).join('');
}

window.seleccionarZonaPicker = function(id) {
    const sel = el('zona_taller_id');
    if (sel) { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    actualizarZonaPicker(); cerrarZonaPicker();
};

function actualizarZonaPicker() {
    const sel = el('zona_taller_id');
    if (!sel) return;
    const id = sel.value;
    const empty = el('zonaPickerEmpty'), selected = el('zonaPickerSelected'), thumb = el('zonaPickerThumb'), label = el('zonaPickerLabel'), preview = el('zonaPickerPreview'), previewImg = el('zonaPickerPreviewImg'), previewName = el('zonaPickerPreviewName'), previewDesc = el('zonaPickerPreviewDesc');
    if (!id) { if (empty) empty.style.display = ''; if (selected) selected.style.display = 'none'; if (preview) preview.style.display = 'none'; return; }
    let zona = zonasCache.find(z => String(z.id) === String(id));
    if (!zona) { fetch(`${ZONAS_API}?id=${id}&t=${Date.now()}`).then(r => r.json()).then(d => { if (d.status === 'success') { if (!zonasCache.find(z => z.id === d.data.id)) zonasCache.push(d.data); actualizarZonaPicker(); } }).catch(() => {}); return; }
    if (empty) empty.style.display = 'none'; if (selected) selected.style.display = '';
    if (thumb) { thumb.src = zona.thumb_url || ''; thumb.style.display = zona.thumb_url ? '' : 'none'; }
    if (label) label.textContent = zona.nombre || '';
    if (preview) preview.style.display = '';
    if (previewImg) { previewImg.src = zona.thumb_url || ''; previewImg.style.display = zona.thumb_url ? '' : 'none'; }
    if (previewName) previewName.textContent = zona.nombre || '—';
    if (previewDesc) previewDesc.textContent = zona.descripcion || '';
}

/* ═══ LIST & FICHA ═══ */
function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-toolbox"></i><p>Sin artículos</p></div>'; return; }
            grid.innerHTML = items.map(i => `
                <div class="record-card" data-id="${i.id}" onclick="openFicha(${i.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${i.thumb_url ? `<img src="${esc(i.thumb_url)}" alt="" loading="lazy" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;">` : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.75rem;flex-shrink:0;">${esc(i.identificacion || 'IT')}</div>`}
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(i.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(i.zona_nombre || '')} · ${esc(i.categoria || '')}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">$${Number(i.precio_avaluado || 0).toLocaleString()}</div>
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
        if (!currentFichaId || !confirm('¿Eliminar este artículo del inventario?')) return;
        const fd = new FormData(); fd.append('action', 'delete'); fd.append('id', currentFichaId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminado'); closeFicha(); } else showError(d.message);
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset(); el('record_id').value = '';
        if (el('zona_taller_id')) el('zona_taller_id').value = '';
        actualizarZonaPicker();
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nuevo Artículo';
        el('fichaSub').textContent = '';
        el('fichaAvatar').innerHTML = '<i class="fas fa-toolbox"></i>';
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
        const i = d.data;
        el('fichaTitle').textContent = i.nombre || '—';
        el('fichaSub').textContent = `${i.identificacion || ''} ${i.zona_nombre ? '· ' + i.zona_nombre : ''} ${i.categoria ? '· ' + i.categoria : ''}`;
        el('fichaAvatar').textContent = i.identificacion || 'IT';
        el('record_id').value = i.id;
        if (i.identificacion && el('identificacionBadge')) { el('identificacionBadge').style.display = 'block'; el('identificacionValue').textContent = i.identificacion; }
        await loadLinkedSelect('zona_taller_id', 'zonas_taller', i.zona_taller_id);
        actualizarZonaPicker();
        await loadDynamicOptions('categoria', 'categoria_inventario', i.categoria);
        await loadDynamicOptions('utilidad', 'utilidad_inventario', i.utilidad);
        ['nombre','detalles','utilidad','precio_avaluado'].forEach(n => { const x = el(n); if (x) { x.value = i[n] || ''; x.classList.remove('field-error','field-success'); } });
        renderExistingMedia(i.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'inventario_taller');
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
            if (d.status === 'success') { showSuccess(d.message || 'Guardado'); if (d.data?.id) { await loadFichaData(d.data.id); } }
            else showError(d.message || 'Error');
        } catch(e) { showError('Error de conexión'); }
        finally { setButtonLoading(btn, false); }
    });
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderPagination(total, page, perPage, cid, cb) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, cid, cb); }
