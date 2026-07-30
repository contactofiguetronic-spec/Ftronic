const API = API_ROOT + 'desarme_maestro_api.php';

let currentPage = 1, selectedId = null, allItems = [];
let currentTab = 'datos';
let editingCompatId = null;
let currentRecord = null;

const CATEGORIAS_COLORMAP = {
    'Motor':        'var(--primary)',
    'Frenos':       'var(--danger)',
    'Suspensión':   'var(--warning)',
    'Eléctrico':    '#f59e0b',
    'Transmisión':  'var(--success)',
    'Carrocería':   '#8b5cf6',
    'Interior':     '#ec4899',
    'Exterior':     '#06b6d4',
    'Dirección':    '#f97316',
    'Enfriamiento': '#3b82f6',
};

// ============================================================================
// CARD CONFIG
// ============================================================================
const cardConfig = {
    titleField: 'nombre',
    subtitleFields: [
        { field: 'categoria', label: 'Categoría' },
        { field: 'subsistema', label: 'Subsistema' },
        { field: 'tipo', label: 'Tipo' },
    ],
    badgeField: (item) => ({
        text: item.code || item.codigo || '—',
        color: CATEGORIAS_COLORMAP[item.categoria] || 'var(--primary)'
    }),
    onClick: (item) => cargarRegistro(item.id),
    onEdit: (item) => cargarRegistro(item.id),
    onDelete: async (item) => {
        if (!confirm('¿Eliminar esta pieza maestra?')) return;
        try {
            const fd = new FormData();
            fd.append('action', 'delete');
            fd.append('id', item.id);
            const r = await apiFetch(API, fd);
            if (r.status === 'success') {
                showSuccess('Pieza eliminada');
                if (selectedId === item.id) resetForm();
                await loadData();
            } else showError(r.message);
        } catch (e) { showError('Error al eliminar'); }
    }
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadDynamicOptions('pieza_categoria', 'desarme_categoria');
    await loadDynamicOptions('compat_marca', 'marca_vehiculo');
    await loadDynamicOptions('compat_combustible', 'combustible');
    await loadDynamicOptions('compat_traccion', 'traccion');
    await loadDynamicOptions('compat_transmision', 'transmision');
    await loadDynamicOptions('compat_tipo_carroceria', 'tipo_carroceria');
    await loadFilterOptions();

    loadData();
    setupReactiveRefresh(loadData);

    if (el('dataForm')) el('dataForm').addEventListener('submit', handleSubmit);
    if (el('btnNuevo')) el('btnNuevo').addEventListener('click', () => { resetForm(); openFichaPanel('fichaContainer'); });
    if (el('btnEliminar')) el('btnEliminar').addEventListener('click', handleDelete);
    if (el('btnVolver')) el('btnVolver').addEventListener('click', () => resetForm(true));
    if (el('btnAddCompat')) el('btnAddCompat').addEventListener('click', showCompatForm);
    if (el('btnSaveCompat')) el('btnSaveCompat').addEventListener('click', saveCompat);
    if (el('btnCancelCompat')) el('btnCancelCompat').addEventListener('click', hideCompatForm);

    document.querySelectorAll('.tab-bar .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    const si = el('searchInput');
    if (si) si.addEventListener('input', debounce(e => { currentPage = 1; selectedId = null; loadData(1, e.target.value); }, 400));

    el('filterCategoria').addEventListener('change', () => { currentPage = 1; loadData(); });
    el('filterSubsistema').addEventListener('change', () => { currentPage = 1; loadData(); });
    el('filterEstado').addEventListener('change', () => { currentPage = 1; loadData(); });

    setTimeout(() => { if (typeof ensureVisibility === 'function') ensureVisibility(); }, 1500);
});

// ============================================================================
// LOAD FILTER OPTIONS
// ============================================================================
async function loadFilterOptions() {
    try {
        const r = await fetch(`${API}?action=filter_options&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success' && d.data) {
            const catSelect = el('filterCategoria');
            const subSelect = el('filterSubsistema');
            if (d.data.categorias) {
                d.data.categorias.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    catSelect.appendChild(opt);
                });
            }
            if (d.data.subsistemas) {
                d.data.subsistemas.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s;
                    subSelect.appendChild(opt);
                });
            }
        }
    } catch (e) { console.error(e); }
}

// ============================================================================
// LOAD DATA
// ============================================================================
async function loadData(page = 1, search = '') {
    currentPage = page;
    try {
        const cat = el('filterCategoria').value;
        const sub = el('filterSubsistema').value;
        const est = el('filterEstado').value;
        const params = new URLSearchParams({ page, search, t: Date.now() });
        if (cat) params.set('categoria', cat);
        if (sub) params.set('subsistema', sub);
        if (est !== '') params.set('activo', est);
        const r = await fetch(`${API}?${params}`);
        const d = await r.json();
        if (d.status === 'success') {
            allItems = d.data.items || [];
            const cfg = { ...cardConfig, selectedId };
            if (!UIController.canModule('desarme_maestro', 'eliminar')) delete cfg.onDelete;
            renderCardGrid(el('cardGrid'), allItems, cfg);
            if (d.data?.total) renderPagination('paginationContainer', d.data.total, d.data.per_page, d.data.page, 'cambiarPagina');
        }
    } catch (e) { console.error(e); }
}
function cambiarPagina(page) { loadData(page, el('searchInput')?.value || ''); }

// ============================================================================
// LOAD RECORD
// ============================================================================
async function cargarRegistro(id) {
    resetForm(false);
    selectedId = id;
    openFichaPanel('fichaContainer');
    try {
        const r = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return showError(d.message);
        const rec = d.data;
        currentRecord = rec;

        el('record_id').value = rec.id || '';
        el('pieza_codigo').value = rec.code || rec.codigo || '';
        el('pieza_codigo').setAttribute('readonly', 'readonly');
        el('pieza_codigo').style.backgroundColor = 'rgba(0,0,0,0.08)';
        el('pieza_nombre').value = rec.nombre || '';
        el('pieza_subsistema').value = rec.subsistema || '';
        el('pieza_tipo').value = rec.tipo || '';
        el('pieza_activo').checked = !!Number(rec.activo);
        await loadDynamicOptions('pieza_categoria', 'desarme_categoria', rec.categoria);

        el('fichaTitle').textContent = rec.nombre || 'Pieza';
        el('fichaSub').textContent = `${rec.code || rec.codigo || ''}${rec.categoria ? ' — ' + rec.categoria : ''}${rec.subsistema ? ' — ' + rec.subsistema : ''}`;

        if (UIController.canModule('desarme_maestro', 'eliminar')) el('btnEliminar').style.display = 'inline-flex';

        renderCompatTable(rec.compatibilidades || []);

        (el('cardGrid')?.querySelectorAll('.record-card') || []).forEach((c, i) => {
            c.classList.toggle('selected', allItems[i] && String(allItems[i].id) === String(id));
        });

        switchTab('datos');
    } catch (e) { console.error(e); showError('Error al cargar pieza'); }
}

// ============================================================================
// SUBMIT
// ============================================================================
async function handleSubmit(e) {
    e.preventDefault();
    const btn = el('btnGuardar');
    setButtonLoading(btn, true, 'Guardando...');
    const fd = new FormData(el('dataForm'));
    fd.set('activo', el('pieza_activo').checked ? '1' : '0');
    try {
        const d = await apiFetch(API, fd);
        if (d.status === 'success') {
            showSuccess(d.message || 'Pieza guardada');
            await loadData();
            if (d.data?.id && !fd.get('id')) {
                await cargarRegistro(d.data.id);
            }
        } else showError(d.message);
    } catch (e) { showError('Error de conexión'); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// DELETE
// ============================================================================
async function handleDelete() {
    const id = el('record_id')?.value;
    if (!id || !confirm('¿Eliminar esta pieza maestra y todas sus compatibilidades?')) return;
    const btn = el('btnEliminar');
    setButtonLoading(btn, true, 'Eliminando...');
    try {
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', id);
        const r = await apiFetch(API, fd);
        if (r.status === 'success') {
            showSuccess('Pieza eliminada');
            selectedId = null;
            await loadData();
            resetForm();
        } else showError(r.message);
    } catch (e) { showError('Error al eliminar'); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// RESET
// ============================================================================
function resetForm(clear = true) {
    el('dataForm').reset();
    el('pieza_activo').checked = true;
    el('pieza_codigo').removeAttribute('readonly');
    el('pieza_codigo').style.backgroundColor = '';
    currentRecord = null;
    editingCompatId = null;
    hideCompatForm();
    renderCompatTable([]);
    if (clear) {
        el('fichaTitle').textContent = 'Nueva Pieza';
        el('fichaSub').textContent = 'Complete los datos de la pieza maestra';
        selectedId = null;
        el('cardGrid')?.querySelectorAll('.record-card').forEach(c => c.classList.remove('selected'));
        closeFichaPanel('fichaContainer');
    }
    el('btnEliminar').style.display = 'none';
    switchTab('datos');
}

// ============================================================================
// TABS
// ============================================================================
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-bar .tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.tab === tab);
    });
}

// ============================================================================
// COMPATIBILIDAD: RENDER TABLE
// ============================================================================
function renderCompatTable(items) {
    const tbody = el('compatTableBody');
    const empty = el('compatEmpty');
    tbody.innerHTML = '';
    if (!items || items.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    items.forEach(c => {
        const tr = document.createElement('tr');
        const anioRange = [c.anio_inicio, c.anio_fin].filter(Boolean).join(' — ') || '—';
        tr.innerHTML = `
            <td>${escapeHtml(c.marca || '—')}</td>
            <td>${escapeHtml(c.modelo || '—')}</td>
            <td>${escapeHtml(anioRange)}</td>
            <td>${escapeHtml(c.combustible || '—')}</td>
            <td>${escapeHtml(c.traccion || '—')}</td>
            <td>${escapeHtml(c.transmision || '—')}</td>
            <td>${escapeHtml(c.tipo_carroceria || '—')}</td>
            <td>${escapeHtml(c.notas || '—')}</td>
            <td class="compat-actions">
                <button class="btn btn-sm btn-secondary" onclick="editCompat(${c.id})" data-perm="desarme_maestro:editar"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btn-danger-outline" onclick="deleteCompat(${c.id})" data-perm="desarme_maestro:eliminar"><i class="fas fa-trash"></i></button>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ============================================================================
// COMPATIBILIDAD: ADD / EDIT
// ============================================================================
function showCompatForm(compatData) {
    editingCompatId = null;
    el('compat_id').value = '';
    el('compat_marca').value = '';
    el('compat_modelo').value = '';
    el('compat_anio_inicio').value = '';
    el('compat_anio_fin').value = '';
    el('compat_combustible').value = '';
    el('compat_traccion').value = '';
    el('compat_transmision').value = '';
    el('compat_tipo_carroceria').value = '';
    el('compat_notas').value = '';

    if (compatData) {
        editingCompatId = compatData.id;
        el('compat_id').value = compatData.id;
        el('compat_marca').value = compatData.marca || '';
        el('compat_modelo').value = compatData.modelo || '';
        el('compat_anio_inicio').value = compatData.anio_inicio || '';
        el('compat_anio_fin').value = compatData.anio_fin || '';
        el('compat_combustible').value = compatData.combustible || '';
        el('compat_traccion').value = compatData.traccion || '';
        el('compat_transmision').value = compatData.transmision || '';
        el('compat_tipo_carroceria').value = compatData.tipo_carroceria || '';
        el('compat_notas').value = compatData.notas || '';
    }

    el('compatFormWrap').style.display = 'block';
    el('btnAddCompat').style.display = 'none';
}

function hideCompatForm() {
    editingCompatId = null;
    el('compatFormWrap').style.display = 'none';
    el('btnAddCompat').style.display = 'inline-flex';
}

async function saveCompat() {
    const piezaId = el('record_id')?.value;
    if (!piezaId) { showError('Guarde la pieza primero'); return; }
    const marca = el('compat_marca').value.trim();
    if (!marca) { showError('La marca es obligatoria'); return; }

    const fd = new FormData();
    fd.append('action', editingCompatId ? 'update_compat' : 'add_compat');
    fd.append('maestro_pieza_id', piezaId);
    if (editingCompatId) fd.append('compat_id', editingCompatId);
    fd.append('marca', marca);
    fd.append('modelo', el('compat_modelo').value.trim());
    fd.append('anio_inicio', el('compat_anio_inicio').value);
    fd.append('anio_fin', el('compat_anio_fin').value);
    fd.append('combustible', el('compat_combustible').value);
    fd.append('traccion', el('compat_traccion').value);
    fd.append('transmision', el('compat_transmision').value);
    fd.append('tipo_carroceria', el('compat_tipo_carroceria').value);
    fd.append('notas', el('compat_notas').value.trim());

    try {
        const d = await apiFetch(API, fd);
        if (d.status === 'success') {
            showSuccess(d.message || 'Compatibilidad guardada');
            hideCompatForm();
            await cargarRegistro(piezaId);
        } else showError(d.message);
    } catch (e) { showError('Error al guardar compatibilidad'); }
}

async function editCompat(compatId) {
    const piezaId = el('record_id')?.value;
    if (!piezaId || !currentRecord) return;
    const compat = (currentRecord.compatibilidades || []).find(c => c.id === compatId);
    if (compat) showCompatForm(compat);
}

async function deleteCompat(compatId) {
    const piezaId = el('record_id')?.value;
    if (!piezaId || !confirm('¿Eliminar esta compatibilidad?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_compat');
        fd.append('maestro_pieza_id', piezaId);
        fd.append('compat_id', compatId);
        const d = await apiFetch(API, fd);
        if (d.status === 'success') {
            showSuccess('Compatibilidad eliminada');
            await cargarRegistro(piezaId);
        } else showError(d.message);
    } catch (e) { showError('Error al eliminar compatibilidad'); }
}
