const API = API_ROOT + 'articulos_api.php';
const STOCK_API = API_ROOT + 'stock_api.php';
let currentPage = 1;
let currentFichaId = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadLinkedSelect('proveedor_id', 'proveedores');
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
    setupSearch();

    // Init proveedor_id hidden field management or similar if needed
    // Removed old loadLinkedSelect as it's no longer used in the main form.

    const mmToolbar = el('multimediaToolbar');
    const fileInput = document.querySelector('.upload-file-input');
    if (fileInput) {
        setupMultimediaToolbar(mmToolbar, fileInput);
        fileInput.addEventListener('change', toggleSubirBtn);
    }
    el('btnSubirImagenes')?.addEventListener('click', uploadArticuloMedia);
    el('uploadZone')?.addEventListener('click', () => el('uploadFileInput')?.click());
    el('uploadZone')?.addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; });
    el('uploadZone')?.addEventListener('dragleave', e => { e.currentTarget.style.borderColor = ''; });
    el('uploadZone')?.addEventListener('drop', e => { e.preventDefault(); e.currentTarget.style.borderColor = ''; fileInput.files = e.dataTransfer.files; toggleSubirBtn(); });

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
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-box"></i><p>No se encontraron artículos</p></div>'; return; }
            grid.innerHTML = items.map(a => `
                <div class="record-card" data-id="${a.id}" onclick="openFicha(${a.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${a.thumb_url
                            ? `<img src="${esc(a.thumb_url)}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg-input);">`
                            : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;">${(a.nombre||'A')[0]}${(a.codigo||'')[0]||''}</div>`
                        }
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(a.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Cód: ${esc(a.codigo || '—')} · Stock: ${a.stock || 0}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">$${Number(a.valor_venta || 0).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            renderPaginationLocal(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', cambiarPagina);

            const countEl = el('recordCount');
            if (countEl) { const t = res.data.total || 0; countEl.textContent = `${t} registro${t !== 1 ? 's' : ''}`; }
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
        if (tab.dataset.tab === 'stock' && currentFichaId) loadStockMovements(currentFichaId);
        if (tab.dataset.tab === 'proveedores' && currentFichaId) loadArticuloProveedores(currentFichaId);
    });
}

// ── Proveedores del Artículo ─────────────────────────────────────────────────
async function loadArticuloProveedores(articuloId) {
    const container = el('proveedoresContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    try {
        const res = await fetch(`${API_ROOT}articulos_api.php?action=proveedores&articulo_id=${articuloId}&t=${Date.now()}`);
        const json = await res.json();
        if (json.status !== 'success') { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar</p></div>'; return; }
        const provs = json.data || [];
        if (!provs.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-truck"></i><p>Sin proveedores vinculados</p></div>'; return; }
        container.innerHTML = `
            <table class="proveedor-articulos-table">
                <thead><tr><th>Proveedor</th><th>Precio Costo</th><th>Entrega</th></tr></thead>
                <tbody>
                    ${provs.map(p => `
                        <tr>
                            <td><strong>${esc(p.nombre)}</strong></td>
                            <td>${formatMoney(p.precio_costo || 0)}</td>
                            <td>${esc(p.tiempo_entrega || '—')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch(e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p></div>'; }
}

function setupFichaActions() {
    el('btnBackList').addEventListener('click', closeFicha);
    el('btnFichaDelete').addEventListener('click', async () => {
        if (!currentFichaId) return;
        if (!confirm('¿Eliminar este artículo y todos sus datos?')) return;
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
        el('fichaTitle').textContent = 'Nuevo Artículo';
        el('fichaSub').textContent = 'Complete los datos del artículo';
        el('fichaAvatar').textContent = 'AR';
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
        const a = json.data;

        el('fichaTitle').textContent = a.nombre || '—';
        el('fichaSub').textContent = `${a.codigo ? 'Cód: ' + a.codigo : ''} ${a.proveedor_nombre ? '· ' + a.proveedor_nombre : ''}`;
        el('fichaAvatar').textContent = (a.nombre || 'AR').substring(0, 2).toUpperCase();

        el('record_id').value = a.id;
        a.stock_actual = a.stock;
        ['nombre','codigo','stock_actual','stock_minimo','valor_referencia','valor_compra','valor_venta','ubicacion'].forEach(name => {
            const input = el(name);
            if (input) { input.value = a[name] || ''; input.classList.remove('field-error','field-success'); }
        });

        el('fichaStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${a.stock_actual || 0}</div><div class="stat-lbl">Stock Actual</div></div>
            <div class="stat-card"><div class="stat-val">${a.stock_minimo || 0}</div><div class="stat-lbl">Stock Mínimo</div></div>
            <div class="stat-card"><div class="stat-val">$${Number(a.valor_venta || 0).toLocaleString()}</div><div class="stat-lbl">Precio Venta</div></div>
            <div class="stat-card"><div class="stat-val">$${Number(a.valor_compra || 0).toLocaleString()}</div><div class="stat-lbl">Precio Compra</div></div>
        `;

        renderExistingMedia(a.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'articulos');
    } catch(e) { console.error('Ficha error:', e); }
}

// ── Stock Tab ────────────────────────────────────────────────────────────────
async function loadStockMovements(articuloId) {
    const container = el('stockMovementsContainer');
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> Cargando movimientos...</div>';
    try {
        const res = await fetch(`${STOCK_API}?action=movimientos&producto_tipo=articulo&producto_id=${articuloId}&t=${Date.now()}`);
        const json = await res.json();
        if (json.status !== 'success') { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar</p></div>'; return; }
        const movimientos = json.data || [];
        if (!movimientos.length) { container.innerHTML = '<div class="empty-state"><i class="fas fa-warehouse"></i><p>Sin movimientos registrados</p></div>'; return; }
        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="stock-table">
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Referencia</th><th>Notas</th></tr></thead>
                    <tbody>${movimientos.map(m => `
                        <tr>
                            <td>${esc(m.fecha || '')}</td>
                            <td><span class="status-badge ${m.tipo === 'entrada' ? 'status-success' : 'status-warning'}">${esc(m.tipo || '')}</span></td>
                            <td>${m.cantidad || 0}</td>
                            <td>${esc(m.referencia_tipo || '')} ${m.referencia_id ? '#' + m.referencia_id : ''}</td>
                            <td>${esc(m.notas || '')}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>
        `;
    } catch(e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p></div>'; }
}

// ── Form Submit ──────────────────────────────────────────────────────────────
function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const rules = { nombre: { required: true } };
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

// ── Imágenes: subida independiente ───────────────────────────────────────────
function toggleSubirBtn() {
    const fi = document.querySelector('.upload-file-input');
    const btn = el('btnSubirImagenes');
    const status = el('uploadStatus');
    if (!btn) return;
    const has = fi && fi.files.length > 0;
    btn.disabled = !has;
    if (status) status.textContent = has ? `${fi.files.length} archivo(s) seleccionado(s)` : '';
}

async function uploadArticuloMedia() {
    const fi = document.querySelector('.upload-file-input');
    if (!fi || !fi.files.length) { showToast('Seleccione al menos una imagen', 'info'); return; }
    if (!currentFichaId) { showError('Primero guarde el artículo (pestaña Datos) antes de subir imágenes'); return; }
    const btn = el('btnSubirImagenes');
    setButtonLoading(btn, true, 'Subiendo...');
    if (el('uploadStatus')) el('uploadStatus').textContent = 'Subiendo...';
    try {
        const fd = new FormData();
        fd.append('action', 'update');
        fd.append('id', currentFichaId);
        Array.from(fi.files).forEach(f => fd.append('archivos[]', f));
        const d = await uploadWithProgress(API, fd);
        if (d.status === 'success') {
            showSuccess('Imágenes subidas correctamente');
            fi.value = '';
            toggleSubirBtn();
            if (currentFichaId) loadFichaData(currentFichaId);
        } else {
            showError(d.message || 'Error al subir');
        }
    } catch (e) {
        showError('Error de conexión al subir');
    } finally {
        setButtonLoading(btn, false, '<i class="fas fa-upload"></i> Subir Imágenes');
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderPaginationLocal(total, page, perPage, containerId, callback) { renderPagination(containerId, total, perPage, page, callback); }
