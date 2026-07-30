const API = API_ROOT + 'proveedores_api.php';
let currentPage = 1;
let currentFichaId = null;
let currentArticulos = [];

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadDynamicOptions('rubro', 'rubro_proveedor');
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
    setupSearch();
    setupArticuloProveedor();

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
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-truck"></i><p>No se encontraron proveedores</p></div>'; return; }
            grid.innerHTML = items.map(p => `
                <div class="record-card" data-id="${p.id}" onclick="openFicha(${p.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${p.thumb_url
                            ? `<img src="${esc(p.thumb_url)}" alt="" loading="lazy" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg-input);">`
                            : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;">${(p.nombre||'P')[0]}</div>`
                        }
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(p.nombre || 'S/N')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.rubro || '')} ${p.rut ? '· ' + esc(p.rut) : ''}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${esc(p.telefono || '')}</div>
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
        if (!confirm('¿Eliminar este proveedor y todos sus datos asociados?')) return;
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
        el('fichaTitle').textContent = 'Nuevo Proveedor';
        el('fichaSub').textContent = 'Complete los datos del proveedor';
        el('fichaAvatar').textContent = 'PR';
        el('fichaStats').innerHTML = '';
        el('badgeArt').textContent = '0';
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.ficha-tab[data-tab="datos"]').classList.add('active');
        el('tabDatos').classList.add('active');
        renderProveedorArticulos([]);
    });
}

async function loadFichaData(id) {
    try {
        const res = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const json = await res.json();
        if (json.status !== 'success') return;
        const p = json.data;

        el('fichaTitle').textContent = p.nombre || 'S/N';
        el('fichaSub').textContent = `${p.rubro || ''} ${p.rut ? '· ' + p.rut : ''} ${p.telefono ? '· ' + p.telefono : ''}`;
        el('fichaAvatar').textContent = (p.nombre || 'P').substring(0, 2).toUpperCase();

        el('record_id').value = p.id;
        await loadDynamicOptions('rubro', 'rubro_proveedor', p.rubro);
        ['nombre','rut','telefono','correo','direccion','sitio_web','contacto_nombre','contacto_telefono','observaciones'].forEach(name => {
            const input = el(name);
            if (input) { input.value = p[name] || ''; input.classList.remove('field-error','field-success'); }
        });

        const artRes = await fetch(`${API}?action=articulos&proveedor_id=${id}`).then(r => r.json());
        const artCount = Array.isArray(artRes.data) ? artRes.data.length : 0;
        el('badgeArt').textContent = artCount;

        el('fichaStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${artCount}</div><div class="stat-lbl">Artículos</div></div>
            <div class="stat-card"><div class="stat-val">${esc(p.rubro || '—')}</div><div class="stat-lbl">Rubro</div></div>
            <div class="stat-card"><div class="stat-val">${esc(p.telefono || '—')}</div><div class="stat-lbl">Teléfono</div></div>
        `;

        renderProveedorArticulos(artRes.data || []);
        renderExistingMedia(p.archivos || [], 'existingMediaContainer', 'existingMediaGrid', 'proveedores');

        if (typeof setupFieldVoiceNote === 'function') {
            setupFieldVoiceNote({ textareaId: 'direccion', label: 'Dirección', entidadTipo: 'proveedores' });
            setupFieldVoiceNote({ textareaId: 'observaciones', label: 'Observaciones', entidadTipo: 'proveedores' });
            loadFieldVoiceNotes(p.id, 'proveedores', 'direccion', 'voice-list-direccion');
            loadFieldVoiceNotes(p.id, 'proveedores', 'observaciones', 'voice-list-observaciones');
        }
    } catch(e) { console.error('Ficha error:', e); }
}

// ── Form Submit ──────────────────────────────────────────────────────────────
function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async (e) => {
        e.preventDefault();
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

// ── Artículos del Proveedor ─────────────────────────────────────────────────
function renderProveedorArticulos(articulos) {
    const container = el('articulosContainer');
    if (!container) return;
    currentArticulos = articulos || [];
    if (!currentArticulos.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-box"></i><p>Sin artículos asociados</p></div>';
        return;
    }
        container.innerHTML = `
        <table class="proveedor-articulos-table">
            <thead><tr><th>Artículo</th><th style="text-align:right;">Stock</th><th style="text-align:right;">Precio Costo</th><th>Entrega</th><th style="text-align:center;">Acciones</th></tr></thead>
            <tbody>
                ${currentArticulos.map(a => `
                    <tr>
                        <td><strong>${esc(a.nombre)}</strong></td>
                        <td style="text-align:right;">${a.stock || 0}</td>
                        <td style="text-align:right;">${a.precio_costo ? formatMoney(a.precio_costo) : '—'}</td>
                        <td>${a.tiempo_entrega || '—'}</td>
                        <td style="text-align:center;"><button class="btn btn-sm btn-danger" onclick="deleteProveedorArticulo(${a.id})" title="Desasociar"><i class="fas fa-times"></i></button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.deleteProveedorArticulo = async function(id) {
    if (!confirm('¿Desasociar este artículo del proveedor?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_articulo');
        fd.append('id', id);
        const d = await apiFetch(API, fd);
        if (d.status === 'success') { showSuccess('Artículo desasociado'); if (currentFichaId) loadFichaData(currentFichaId); }
        else showError(d.message);
    } catch(e) { showError('Error'); }
};

function setupArticuloProveedor() {
    const btnAdd = el('btnAgregarArticulo');
    if (!btnAdd) return;
    btnAdd.addEventListener('click', () => {
        if (!currentFichaId) { showError('Guarde el proveedor primero'); return; }
        ensureArticuloModal();
        el('apBuscarArticulo').value = '';
        el('apResultadosArticulo').innerHTML = '';
        el('apSelectedInfo').style.display = 'none';
        el('apPrecioCosto').value = '';
        el('apTiempoEntrega').value = '';
        el('apNotas').value = '';
        el('apSelectedInfo').style.display = 'none';
        el('apModal').classList.add('active');
    });
}

function ensureArticuloModal() {
    if (el('apModal')) return;
    const modal = document.createElement('div');
    modal.id = 'apModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content modal-md">
            <div class="modal-header">
                <h3><i class="fas fa-box"></i> Agregar Artículo al Proveedor</h3>
                <button type="button" class="modal-close" onclick="el('apModal').classList.remove('active')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group" style="position:relative;">
                    <label>Buscar Artículo *</label>
                    <input type="text" id="apBuscarArticulo" placeholder="Escriba nombre del artículo..." autocomplete="off">
                    <div id="apResultadosArticulo" class="typeahead-results"></div>
                </div>
                <div id="apSelectedInfo" style="display:none;padding:0.5rem;background:var(--bg-secondary);border-radius:var(--radius-sm);margin-bottom:0.75rem;">
                    <strong id="apSelectedNombre"></strong>
                    <span id="apSelectedStock" style="font-size:0.8rem;color:var(--text-secondary);"></span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                    <div class="form-group"><label>Precio Costo</label><input type="number" id="apPrecioCosto" min="0" step="1"></div>
                    <div class="form-group"><label>Tiempo Entrega</label><input type="text" id="apTiempoEntrega" placeholder="ej. 24h, 3 días"></div>
                </div>
                <div class="form-group"><label>Notas</label><input type="text" id="apNotas" placeholder="Notas sobre el artículo..."></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="el('apModal').classList.remove('active')"><i class="fas fa-times"></i> Cancelar</button>
                <button type="button" class="btn btn-primary" id="apConfirmar"><i class="fas fa-plus"></i> Agregar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    let _apSelectedArticuloId = null;
    let _timer;

    el('apBuscarArticulo').addEventListener('input', function() {
        clearTimeout(_timer);
        const q = this.value.trim();
        if (q.length < 2) { el('apResultadosArticulo').style.display = 'none'; return; }
        _timer = setTimeout(async () => {
            try {
                const r = await fetch(`${API}?action=buscar_articulo&q=${encodeURIComponent(q)}&t=${Date.now()}`);
                const d = await r.json();
                const items = d.data || [];
                el('apResultadosArticulo').innerHTML = '';
                if (!items.length) {
                    el('apResultadosArticulo').innerHTML = '<div style="padding:0.5rem;color:var(--text-secondary);font-size:0.8rem;">Sin resultados</div>';
                    el('apResultadosArticulo').style.display = 'block';
                    return;
                }
                items.forEach(a => {
                    const div = document.createElement('div');
                    div.innerHTML = `<strong>${esc(a.nombre)}</strong> <span style="color:var(--text-secondary);font-size:0.78rem;">· Stock: ${a.stock || 0} · ${formatMoney(a.precio_venta || 0)}</span>`;
                    div.addEventListener('click', () => {
                        _apSelectedArticuloId = a.id;
                        el('apSelectedNombre').textContent = a.nombre;
                        el('apSelectedStock').textContent = `Stock: ${a.stock || 0} · Precio: ${formatMoney(a.precio_venta || 0)}`;
                        el('apSelectedInfo').style.display = 'block';
                        el('apBuscarArticulo').value = '';
                        el('apResultadosArticulo').style.display = 'none';
                        el('apPrecioCosto').value = a.valor_compra || '';
                    });
                    el('apResultadosArticulo').appendChild(div);
                });
                el('apResultadosArticulo').style.display = 'block';
            } catch(e) { console.error(e); }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!el('apBuscarArticulo')?.contains(e.target) && !el('apResultadosArticulo')?.contains(e.target)) {
            el('apResultadosArticulo').style.display = 'none';
        }
    });

    el('apConfirmar').addEventListener('click', async () => {
        if (!_apSelectedArticuloId) { showError('Seleccione un artículo'); return; }
        const btn = el('apConfirmar');
        setButtonLoading(btn, true, 'Agregando...');
        try {
            const fd = new FormData();
            fd.append('action', 'add_articulo');
            fd.append('proveedor_id', currentFichaId);
            fd.append('articulo_id', _apSelectedArticuloId);
            fd.append('precio_costo', el('apPrecioCosto').value || '0');
            fd.append('tiempo_entrega', el('apTiempoEntrega').value || '');
            fd.append('notas', el('apNotas').value || '');
            const d = await apiFetch(API, fd);
            if (d.status === 'success') {
                showSuccess('Artículo asociado');
                el('apModal').classList.remove('active');
                loadFichaData(currentFichaId);
            } else showError(d.message);
        } catch(e) { showError('Error'); }
        finally { setButtonLoading(btn, false); }
    });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatMoney(n) {
    if (n == null || isNaN(n)) return '$0';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(Math.round(n));
    return sign + '$' + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function renderPagination(total, page, perPage, containerId, callback) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, containerId, callback); }
