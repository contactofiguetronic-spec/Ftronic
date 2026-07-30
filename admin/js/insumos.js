const API = API_ROOT + 'insumos_api.php';
const STOCK_API = API_ROOT + 'stock_api.php';
let currentPage = 1;
let currentFichaId = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadLinkedSelect('proveedor_id', 'proveedores');
    await loadDynamicOptions('formato', 'formato_insumo');
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
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
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-boxes"></i><p>No se encontraron insumos</p></div>'; return; }
            grid.innerHTML = items.map(i => `
                <div class="record-card" data-id="${i.id}" onclick="openFicha(${i.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${i.thumb_url
                            ? `<img src="${esc(i.thumb_url)}" alt="" loading="lazy" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg-input);">`
                            : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;">${(i.nombre||'I')[0]}${(i.formato||'')[0]||''}</div>`
                        }
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(i.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(i.formato || '—')} · Stock: ${i.stock ?? i.stock_actual ?? 0}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">$${Number(i.valor_venta || 0).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            renderPaginationLocal(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', cambiarPagina);
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
    });
}

function setupFichaActions() {
    el('btnBackList').addEventListener('click', closeFicha);
    el('btnFichaDelete').addEventListener('click', async () => {
        if (!currentFichaId) return;
        if (!confirm('¿Eliminar este insumo y todos sus datos?')) return;
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
        el('fichaTitle').textContent = 'Nuevo Insumo';
        el('fichaSub').textContent = 'Complete los datos del insumo';
        el('fichaAvatar').textContent = 'IN';
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
        const i = json.data;

        el('fichaTitle').textContent = i.nombre || '—';
        el('fichaSub').textContent = `${i.formato || ''} ${i.proveedor_nombre ? '· ' + i.proveedor_nombre : ''}`;
        el('fichaAvatar').textContent = (i.nombre || 'IN').substring(0, 2).toUpperCase();

        el('record_id').value = i.id;
        await loadLinkedSelect('proveedor_id', 'proveedores', i.proveedor_id);
        await loadDynamicOptions('formato', 'formato_insumo', i.formato);
        ['nombre','stock_minimo','valor_compra','valor_venta'].forEach(name => {
            const input = el(name);
            if (input) { input.value = i[name] || ''; input.classList.remove('field-error','field-success'); }
        });
        const stockInput = el('stock_actual');
        if (stockInput) { stockInput.value = i.stock ?? i.stock_actual ?? 0; stockInput.classList.remove('field-error','field-success'); }

        el('fichaStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${i.stock ?? i.stock_actual ?? 0}</div><div class="stat-lbl">Stock Actual</div></div>
            <div class="stat-card"><div class="stat-val">${i.stock_minimo || 0}</div><div class="stat-lbl">Stock Mínimo</div></div>
            <div class="stat-card"><div class="stat-val">$${Number(i.valor_venta || 0).toLocaleString()}</div><div class="stat-lbl">Precio Venta</div></div>
            <div class="stat-card"><div class="stat-val">$${Number(i.valor_compra || 0).toLocaleString()}</div><div class="stat-lbl">Precio Compra</div></div>
        `;

        renderExistingMedia(i.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'insumos');
    } catch(e) { console.error('Ficha error:', e); }
}

// ── Stock Tab ────────────────────────────────────────────────────────────────
async function loadStockMovements(insumoId) {
    const container = el('stockMovementsContainer');
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> Cargando movimientos...</div>';
    try {
        const res = await fetch(`${STOCK_API}?action=movimientos&producto_tipo=insumo&producto_id=${insumoId}&t=${Date.now()}`);
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
        const rules = { nombre: { required: true }, proveedor_id: { type: 'select' } };
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
function renderPaginationLocal(total, page, perPage, containerId, callback) { renderPagination(containerId, total, perPage, page, callback); }
