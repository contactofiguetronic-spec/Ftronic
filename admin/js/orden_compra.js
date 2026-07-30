/* ============================================================================
   js/orden_compra.js — Ficha completa de Solicitudes de Compra
   Flujo: solicitud → cotización → validación → asignación → ejecución → gasto
   ============================================================================ */
const esc = escapeHtml;
const API_OC    = API_ROOT + 'orden_compra_api.php';
const API_MULT  = API_ROOT + 'multimedia_api.php';
const API_UNLINK = API_ROOT + 'unlink_file_api.php';

let currentPage = 1;
let selectedId = null;
let allItems = [];
let currentOC = null;
let currentOCMedia = [];
let itemsList = [];
let _productosCache = { articulos: [], insumos: [] };
let mediaFiles = [];

function setSelectValue(select, value) {
  if (!select) return;
  const opts = Array.from(select.options);
  const match = opts.find(o => o.value === String(value) || o.text === value);
  select.value = match ? match.value : '';
}

const ESTADOS = ['solicitado','en_cotizacion','aprobada','asignada','en_proceso','recibida_parcial','recibida','cancelada'];
const ESTADO_COLORS = {
    solicitado:      { bg:'rgba(107,114,128,.12)', text:'#374151', label:'Solicitado' },
    en_cotizacion:   { bg:'rgba(245,158,11,.12)',  text:'#b45309', label:'En Cotización' },
    aprobada:        { bg:'rgba(75,123,236,.12)',  text:'#1e40af', label:'Aprobada' },
    asignada:        { bg:'rgba(139,92,246,.12)',  text:'#6d28d9', label:'Asignada' },
    en_proceso:      { bg:'rgba(14,165,233,.12)',  text:'#0369a1', label:'En Proceso' },
    recibida_parcial:{ bg:'rgba(249,115,22,.12)',  text:'#c2410c', label:'Recibida Parcial' },
    recibida:        { bg:'rgba(16,185,129,.12)',  text:'#065f46', label:'Recibida' },
    cancelada:       { bg:'rgba(239,68,68,.12)',   text:'#991b1b', label:'Cancelada' },
};
const TIPO_COLORS = {
    articulo:   { bg:'rgba(75,123,236,.12)', text:'#1e40af', label:'Artículo' },
    insumo:     { bg:'rgba(16,185,129,.12)', text:'#065f46', label:'Insumo' },
    herramienta:{ bg:'rgba(245,158,11,.12)', text:'#b45309', label:'Herramienta' },
    otro:       { bg:'rgba(107,114,128,.12)', text:'#374151', label:'Otro' },
};

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadLinkedSelect('proveedor_id', 'proveedores'),
        loadLinkedSelect('solicitante_empleado_id', 'empleados'),
        loadLinkedSelect('asignado_empleado_id', 'empleados'),
        loadLinkedSelect('modal_proveedor_id', 'proveedores'),
        loadLinkedSelect('modal_solicitante_id', 'empleados'),
        loadLinkedSelect('modal_cuenta_id', 'cuentas_bancarias'),
    ]);
    await loadData();
    setupReactiveRefresh(() => loadData(1));

    el('btnNuevo')?.addEventListener('click', openNuevaSolicitud);
    el('btnBackList')?.addEventListener('click', closeFicha);
    el('btnFichaDelete')?.addEventListener('click', handleDelete);
    el('btnFichaPdf')?.addEventListener('click', () => { if (currentOC) window.open(API_ROOT + 'pdf_api.php?type=orden_compra&id=' + currentOC.id, '_blank'); });

    el('dataForm')?.addEventListener('submit', handleFormSubmit);
    el('btnReset')?.addEventListener('click', closeFicha);

    el('searchInput')?.addEventListener('input', debounce(() => { currentPage = 1; loadData(); }, 350));

    el('estadoFilters')?.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        el('estadoFilters').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPage = 1;
        loadData();
    });

    document.querySelectorAll('.ficha-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = el('tab' + tab.dataset.tab);
            if (panel) panel.classList.add('active');
        });
    });

    // Items
    el('btnAddItem')?.addEventListener('click', addItemRow);
    el('btnBuscarProducto')?.addEventListener('click', buscarProducto);
    el('btnSaveItems')?.addEventListener('click', saveItems);

    // Cotización
    el('btnSaveCotizacion')?.addEventListener('click', saveCotizacion);

    // Asignación
    el('btnAsignar')?.addEventListener('click', confirmAssign);

    // Seguimiento
    el('btnCambiarEstado')?.addEventListener('click', changeEstado);
    document.querySelectorAll('.estado-step').forEach(s => {
        s.addEventListener('click', () => { el('nuevoEstado').value = s.dataset.estado; renderEstadoFlow(s.dataset.estado); });
    });

    // Multimedia
    el('mediaFileInput')?.addEventListener('change', handleMediaUpload);
    el('uploadZone')?.addEventListener('click', () => el('mediaFileInput')?.click());
    el('uploadZone')?.addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; });
    el('uploadZone')?.addEventListener('dragleave', e => { e.currentTarget.style.borderColor = ''; });
    el('uploadZone')?.addEventListener('drop', e => { e.preventDefault(); e.currentTarget.style.borderColor = ''; handleMediaUpload({ target: { files: e.dataTransfer.files } }); });

    // Modal Nueva Solicitud
    el('ocModalClose')?.addEventListener('click', () => closeModal('ocModal'));
    el('ocModalCancel')?.addEventListener('click', () => closeModal('ocModal'));
    el('ocModalSubmit')?.addEventListener('click', submitNuevaSolicitud);
    el('ocModal')?.addEventListener('click', e => { if (e.target === el('ocModal')) closeModal('ocModal'); });

    // Modal Finalizar
    el('finalizarModalClose')?.addEventListener('click', () => closeModal('finalizarModal'));
    el('finalizarModalCancel')?.addEventListener('click', () => closeModal('finalizarModal'));
    el('finalizarModalSubmit')?.addEventListener('click', confirmFinalize);
    el('finalizarModal')?.addEventListener('click', e => { if (e.target === el('finalizarModal')) closeModal('finalizarModal'); });

    // Modal Productos
    el('productosModalClose')?.addEventListener('click', () => closeModal('productosModal'));
    el('productosModal')?.addEventListener('click', e => { if (e.target === el('productosModal')) closeModal('productosModal'); });
    el('productosModalSearch')?.addEventListener('input', debounce(e => renderProductosModalList(e.target.value), 250));
});

/* ── Lista ─────────────────────────────────────────────────────────────── */
async function loadData(page) {
    currentPage = page || currentPage;
    try {
        const params = new URLSearchParams({
            page: currentPage,
            per_page: 12,
            search: el('searchInput')?.value || '',
        });
        const activeFilter = el('estadoFilters')?.querySelector('.filter-btn.active');
        if (activeFilter && activeFilter.dataset.estado) params.set('estado', activeFilter.dataset.estado);

        const r = await fetch(`${API_OC}?${params.toString()}`);
        const d = await r.json();
        allItems = d.data?.items || [];
        renderCardGrid();
        const total = r.data?.total || allItems.length;
        const perPage = r.data?.per_page || 12;
        if (total > perPage) {
            renderPagination('paginationContainer', total, perPage, currentPage, p => loadData(p));
        } else {
            el('paginationContainer').innerHTML = '';
        }
    } catch (e) {
        console.error('Error cargando OC:', e);
        el('cardGrid').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i> Error al cargar</div>';
    }
}

function renderCardGrid() {
    const grid = el('cardGrid');
    if (!grid) return;
    if (!allItems.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fas fa-file-invoice"></i><p>No hay solicitudes de compra</p></div>';
        return;
    }
    grid.innerHTML = allItems.map(oc => {
        const st = ESTADO_COLORS[oc.estado] || ESTADO_COLORS.solicitado;
        const avatar = oc.thumb_url
            ? `<div class="card-avatar" style="background:#fff;"><img src="${oc.thumb_url}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>`
            : `<div class="card-avatar gradient-rose">${(oc.folio || 'OC').slice(-2)}</div>`;
        const solicitante = [oc.solicitante_nombre, oc.solicitante_apellido].filter(Boolean).join(' ') || '—';
        return `<div class="card" data-id="${oc.id}">
            <div class="card-inner">
                <div class="card-header">
                    ${avatar}
                    <div class="card-top-line"></div>
                </div>
                <div class="card-body">
                    <h3 class="card-title">${esc(oc.folio || ('OC-' + String(oc.id).padStart(5,'0')))}</h3>
                    <p class="card-subtitle">${esc(oc.proveedor_nombre || 'Sin proveedor')}</p>
                    <p class="card-subtitle">${oc.fecha_emision || '—'}</p>
                    <span class="status-badge" style="background:${st.bg};color:${st.text};">${st.label}</span>
                    <p class="card-subtitle" style="margin-top:0.4rem;">Total: <strong>${formatMoney(oc.total || 0)}</strong></p>
                    <p class="card-subtitle" style="font-size:0.72rem;">Sol: ${esc(solicitante)}</p>
                </div>
            </div>
        </div>`;
    }).join('');
    grid.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => openFicha(parseInt(c.dataset.id))));
}

/* ── Ficha ─────────────────────────────────────────────────────────────── */
function openFicha(id) {
    if (!id) return;
    selectedId = id;
    el('listView').style.display = 'none';
    el('fichaContainer').style.display = 'block';
    el('record_id').value = id;
    loadOCFull(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadOCFull(id) {
    try {
        const r = await fetch(`${API_OC}?id=${id}`);
        const d = await r.json();
        if (d.status !== 'success') throw new Error(d.message);
        currentOC = d.data;
        renderFicha();
    } catch (e) {
        console.error('Error ficha OC:', e);
        showError('Error al cargar la solicitud');
    }
}

function renderFicha() {
    const oc = currentOC;
    if (!oc) return;
    const st = ESTADO_COLORS[oc.estado] || ESTADO_COLORS.solicitado;
    const folio = oc.folio || ('OC-' + String(oc.id).padStart(5,'0'));

    el('fichaTitle').textContent = folio;
    el('fichaSub').textContent = oc.proveedor_nombre || 'Sin proveedor';
    el('fichaAvatar').className = 'ficha-avatar gradient-rose';
    el('fichaAvatar').textContent = folio.slice(-2);
    el('btnFichaPdf').style.display = '';
    el('btnFichaDelete').style.display = '';

    el('fichaStats').innerHTML = `
        <div class="stat-card"><div class="stat-val">${formatMoney(oc.total || 0)}</div><div class="stat-lbl">Total</div></div>
        <div class="stat-card"><div class="stat-val">${(oc.items || []).length}</div><div class="stat-lbl">Ítems</div></div>
        <div class="stat-card"><div class="stat-val">${oc.fecha_emision || '—'}</div><div class="stat-lbl">Emisión</div></div>
        <div class="stat-card"><div class="stat-val" style="font-size:0.95rem;">${st.label}</div><div class="stat-lbl">Estado</div></div>
    `;

    // Datos tab
    el('folioDisplay').value = folio;
    el('fecha_emision').value = oc.fecha_emision || getTodayDate();
    setSelectValue(el('proveedor_id'), oc.proveedor_id);
    setSelectValue(el('solicitante_empleado_id'), oc.solicitante_empleado_id);
    el('estado').value = oc.estado || 'solicitado';
    setSelectValue(el('origen_tipo'), oc.origen_tipo || 'manual');
    el('fecha_entrega_estimada').value = oc.fecha_entrega_estimada || '';
    setSelectValue(el('forma_pago'), oc.forma_pago);
    el('observaciones').value = oc.observaciones || '';

    // Items tab
    itemsList = (oc.items || []).map(i => ({
        id: i.id,
        producto_tipo: i.producto_tipo,
        producto_id: i.producto_id,
        nombre: i.nombre,
        cantidad_solicitada: i.cantidad_solicitada,
        cantidad_recibida: i.cantidad_recibida,
        valor_unitario: i.valor_unitario,
        descripcion: i.descripcion || '',
    }));
    renderItemsTable();

    // Cotización tab
    el('cotizacion').value = oc.cotizacion || '';

    // Asignación tab
    renderAsignacion(oc);

    // Seguimiento tab
    renderEstadoFlow(oc.estado);
    el('nuevoEstado').value = oc.estado || 'solicitado';
    renderRecibirItems(oc);
    loadHistorial(oc.id);

    // Multimedia tab
    currentOCMedia = (oc.archivos || []);
    renderMedia();
}

function renderAsignacion(oc) {
    const box = el('assignedInfo');
    const card = el('assignedCard');
    if (oc.asignado_empleado_id) {
        box.style.display = '';
        const nombre = [oc.asignado_nombre, oc.asignado_apellido].filter(Boolean).join(' ');
        const ini = getInitials(nombre);
        card.innerHTML = `
            <div class="ac-avatar">${esc(ini)}</div>
            <div class="ac-info">
                <h4>${esc(nombre || 'Empleado')}</h4>
                <p>${oc.tarea_id ? 'Tarea creada: TAR-' + String(oc.tarea_id).padStart(5,'0') : 'Sin tarea enlazada'}</p>
            </div>
            ${oc.tarea_id ? `<a class="btn btn-sm btn-secondary ac-tarea" href="tareas_diarias.html" target="_blank"><i class="fas fa-external-link-alt"></i> Ver Tarea</a>` : ''}
        `;
    } else {
        box.style.display = 'none';
        card.innerHTML = '';
    }
}

function renderEstadoFlow(estado) {
    document.querySelectorAll('.estado-step').forEach(s => {
        const order = ESTADOS.indexOf(s.dataset.estado);
        const cur = ESTADOS.indexOf(estado);
        s.classList.toggle('active', s.dataset.estado === estado);
        s.classList.toggle('done', order < cur);
    });
}

function renderRecibirItems(oc) {
    const cont = el('recibirItemsContainer');
    if (!cont) return;
    const items = oc.items || [];
    if (!items.length) { cont.innerHTML = '<p class="form-hint">Esta solicitud no tiene ítems.</p>'; return; }
    cont.innerHTML = items.map((it, idx) => `
        <div class="form-group" style="display:flex;gap:0.5rem;align-items:center;">
            <span style="flex:1;font-size:0.82rem;">${esc(it.nombre)} <small style="color:var(--text-secondary)">(solic: ${it.cantidad_solicitada})</small></span>
            <input type="number" class="form-control form-control-sm recibir-cant" data-idx="${idx}" value="${it.cantidad_recibida || 0}" min="0" max="${it.cantidad_solicitada}" style="width:90px;">
        </div>
    `).join('');
}

async function loadHistorial(id) {
    const cont = el('historialContainer');
    if (!cont) return;
    try {
        const r = await fetch(API_ROOT + 'historial_api.php?entidad_tipo=orden_compra&entidad_id=' + id);
        const d = await r.json();
        const hist = d.data || [];
        if (!hist.length) { cont.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i> Sin historial</div>'; return; }
        cont.innerHTML = hist.map(h => `
            <div class="timeline-item">
                <div class="tl-header">
                    <span class="tl-title">${esc(h.accion || '')}</span>
                    <span class="tl-date">${formatDateShort(h.creado || h.created_at)}</span>
                </div>
                <div class="tl-body">${esc(h.detalle || h.valor_nuevo || '')}</div>
            </div>
        `).join('');
    } catch (e) {
        cont.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i> Sin historial</div>';
    }
}

/* ── Items editor ──────────────────────────────────────────────────────── */
function addItemRow() {
    const tipo = el('producto_tipo').value;
    const nombre = el('producto_nombre').value.trim();
    const cant = parseInt(el('cantidad_solicitada').value) || 1;
    const valor = parseFloat(el('valor_unitario').value) || 0;
    const desc = el('item_descripcion').value.trim();
    if (!nombre) { showToast('Debe ingresar un nombre de producto', 'info'); return; }
    itemsList.push({
        producto_tipo: tipo,
        producto_id: el('producto_id').value || null,
        nombre,
        cantidad_solicitada: cant,
        cantidad_recibida: 0,
        valor_unitario: valor,
        descripcion: desc,
    });
    renderItemsTable();
    el('producto_nombre').value = '';
    el('producto_id').value = '';
    el('cantidad_solicitada').value = 1;
    el('valor_unitario').value = '';
    el('item_descripcion').value = '';
    recalcTotals();
}

function removeItem(index) { itemsList.splice(index, 1); renderItemsTable(); recalcTotals(); }

function renderItemsTable() {
    const tbody = el('itemsTableBody');
    if (!tbody) return;
    if (!itemsList.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-box-open"></i> Sin ítems agregados</td></tr>';
        recalcTotals();
        return;
    }
    tbody.innerHTML = itemsList.map((it, i) => {
        const t = TIPO_COLORS[it.producto_tipo] || TIPO_COLORS.otro;
        const sub = (parseInt(it.cantidad_solicitada) || 1) * (parseFloat(it.valor_unitario) || 0);
        return `<tr data-idx="${i}">
            <td><span class="status-badge" style="background:${t.bg};color:${t.text};font-size:0.65rem;">${t.label}</span></td>
            <td>
                <strong>${esc(it.nombre || '')}</strong>
                ${it.descripcion ? `<br><small style="color:var(--text-secondary)">${esc(it.descripcion)}</small>` : ''}
            </td>
            <td style="text-align:center;"><input type="number" class="form-control form-control-sm item-cant" data-idx="${i}" value="${it.cantidad_solicitada}" min="1" style="width:70px;text-align:center;"></td>
            <td style="text-align:right;"><input type="number" class="form-control form-control-sm item-valor" data-idx="${i}" value="${it.valor_unitario}" step="any" style="width:100px;text-align:right;"></td>
            <td style="text-align:right;font-weight:700;">${formatMoney(sub)}</td>
            <td style="text-align:center;"><button type="button" class="btn btn-sm btn-danger-outline" onclick="removeItem(${i})"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    }).join('');
    tbody.querySelectorAll('.item-cant').forEach(inp => inp.addEventListener('change', () => { itemsList[inp.dataset.idx].cantidad_solicitada = parseInt(inp.value) || 1; renderItemsTable(); }));
    tbody.querySelectorAll('.item-valor').forEach(inp => inp.addEventListener('change', () => { itemsList[inp.dataset.idx].valor_unitario = parseFloat(inp.value) || 0; renderItemsTable(); }));
    recalcTotals();
}

function recalcTotals() {
    const subtotal = itemsList.reduce((s, i) => s + ((parseInt(i.cantidad_solicitada) || 0) * (parseFloat(i.valor_unitario) || 0)), 0);
    el('subtotalDisplay').textContent = formatMoney(subtotal);
    el('impuestoDisplay').textContent = formatMoney(subtotal * 0.19);
    el('descuentoDisplay').textContent = formatMoney(0);
    el('totalDisplay').textContent = formatMoney(subtotal * 1.19);
}

async function saveItems() {
    if (!currentOC) return;
    const btn = el('btnSaveItems');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData();
        fd.append('action', 'update');
        fd.append('id', currentOC.id);
        fd.append('proveedor_id', el('proveedor_id').value || '');
        fd.append('fecha_emision', el('fecha_emision').value);
        fd.append('estado', el('estado').value);
        fd.append('items_json', JSON.stringify(itemsList));
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess('Ítems guardados');
            loadOCFull(currentOC.id);
            loadData(currentPage);
        } else throw new Error(r.message);
    } catch (e) {
        showError('Error: ' + e.message);
    } finally { setButtonLoading(btn, false); }
}

/* ── Formulario principal (Datos) ──────────────────────────────────────── */
async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = el('btnSave');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData(el('dataForm'));
        const isEdit = !!el('record_id').value;
        fd.append('action', isEdit ? 'update' : 'insert');
        fd.append('items_json', JSON.stringify(itemsList));
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess(isEdit ? 'Actualizado' : 'Guardado');
            const id = r.data?.id || el('record_id').value;
            loadOCFull(id);
            loadData(currentPage);
        } else throw new Error(r.message);
    } catch (e) {
        showError('Error: ' + e.message);
    } finally { setButtonLoading(btn, false); }
}

/* ── Nueva Solicitud (modal) ───────────────────────────────────────────── */
function openNuevaSolicitud() {
    el('modal_fecha_emision').value = getTodayDate();
    setSelectValue(el('modal_proveedor_id'), '');
    setSelectValue(el('modal_solicitante_id'), '');
    el('modal_origen_tipo').value = 'manual';
    el('modal_observaciones').value = '';
    el('modal_item_nombre').value = '';
    el('modal_item_cantidad').value = 1;
    el('modal_item_tipo').value = 'articulo';
    openModal('ocModal');
    setTimeout(() => el('modal_item_nombre')?.focus(), 100);
}

async function submitNuevaSolicitud() {
    const btn = el('ocModalSubmit');
    setButtonLoading(btn, true);
    try {
        const nombre = el('modal_item_nombre').value.trim();
        if (!nombre) { showToast('Debe ingresar al menos un ítem', 'info'); return; }
        const items = [{
            nombre,
            producto_tipo: el('modal_item_tipo').value,
            cantidad_solicitada: parseInt(el('modal_item_cantidad').value) || 1,
            valor_unitario: 0,
        }];
        const fd = new FormData();
        fd.append('action', 'crear_oc');
        fd.append('origen_tipo', el('modal_origen_tipo').value);
        fd.append('proveedor_id', el('modal_proveedor_id').value || '');
        fd.append('solicitante_empleado_id', el('modal_solicitante_id').value || '');
        fd.append('observaciones', el('modal_observaciones').value);
        fd.append('items_json', JSON.stringify(items));
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess('Solicitud creada: ' + (r.data?.folio || ''));
            closeModal('ocModal');
            loadData(1);
        } else throw new Error(r.message);
    } catch (e) {
        showError('Error: ' + e.message);
    } finally { setButtonLoading(btn, false); }
}

/* ── Cotización ────────────────────────────────────────────────────────── */
async function saveCotizacion() {
    if (!currentOC) return;
    const btn = el('btnSaveCotizacion');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData();
        fd.append('action', 'guardar_cotizacion');
        fd.append('id', currentOC.id);
        fd.append('cotizacion', el('cotizacion').value);
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') showSuccess('Cotización guardada');
        else throw new Error(r.message);
    } catch (e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

/* ── Asignar ───────────────────────────────────────────────────────────── */
async function confirmAssign() {
    if (!currentOC) return;
    const empId = el('asignado_empleado_id').value;
    if (!empId) { showToast('Seleccione un empleado responsable', 'info'); return; }
    const btn = el('btnAsignar');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData();
        fd.append('action', 'asignar');
        fd.append('id', currentOC.id);
        fd.append('asignado_empleado_id', empId);
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess('Responsable asignado. Tarea creada.');
            loadOCFull(currentOC.id);
            loadData(currentPage);
        } else throw new Error(r.message);
    } catch (e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

/* ── Cambiar estado ────────────────────────────────────────────────────── */
async function changeEstado() {
    if (!currentOC) return;
    const nuevo = el('nuevoEstado').value;
    const btn = el('btnCambiarEstado');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData();
        fd.append('action', 'update_estado');
        fd.append('id', currentOC.id);
        fd.append('estado', nuevo);
        if (['recibida', 'recibida_parcial'].includes(nuevo)) {
            const items = [];
            document.querySelectorAll('.recibir-cant').forEach(inp => {
                const idx = inp.dataset.idx;
                items.push({
                    id: itemsList[idx]?.id || null,
                    producto_tipo: itemsList[idx]?.producto_tipo,
                    producto_id: itemsList[idx]?.producto_id,
                    cantidad_recibida: inp.value || 0,
                });
            });
            fd.append('items', JSON.stringify(items));
        }
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess('Estado actualizado');
            loadOCFull(currentOC.id);
            loadData(currentPage);
        } else throw new Error(r.message);
    } catch (e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

/* ── Finalizar / Registrar gasto ───────────────────────────────────────── */
function openFinalizar() {
    if (!currentOC) return;
    el('modal_total_final').value = currentOC.total || 0;
    setSelectValue(el('modal_cuenta_id'), currentOC.cuenta_bancaria_id || '');
    setSelectValue(el('modal_forma_pago'), currentOC.forma_pago || 'contado');
    openModal('finalizarModal');
}

async function confirmFinalize() {
    if (!currentOC) return;
    const cuentaId = el('modal_cuenta_id').value;
    if (!cuentaId) { showToast('Seleccione una cuenta bancaria', 'info'); return; }
    const btn = el('finalizarModalSubmit');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData();
        fd.append('action', 'finalizar');
        fd.append('id', currentOC.id);
        fd.append('cuenta_bancaria_id', cuentaId);
        fd.append('forma_pago', el('modal_forma_pago').value);
        fd.append('total', el('modal_total_final').value || currentOC.total);
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess('OC finalizada y gasto registrado');
            closeModal('finalizarModal');
            // Agregar botón de finalizar accesible desde seguimiento
            loadOCFull(currentOC.id);
            loadData(currentPage);
        } else throw new Error(r.message);
    } catch (e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

/* ── Eliminar ──────────────────────────────────────────────────────────── */
async function handleDelete() {
    if (!currentOC || !confirm('¿Eliminar esta solicitud de compra?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', currentOC.id);
        const r = await apiFetch(API_OC, fd);
        if (r.success || r.status === 'success') {
            showSuccess('Eliminada');
            closeFicha();
        }
    } catch (e) { showError('Error al eliminar'); }
}

function closeFicha() {
    selectedId = null;
    currentOC = null;
    el('fichaContainer').style.display = 'none';
    el('listView').style.display = '';
    loadData(currentPage);
}

/* ── Multimedia ────────────────────────────────────────────────────────── */
function renderMedia() {
    const cont = el('existingMediaContainer');
    const grid = el('existingMediaGrid');
    if (!currentOC || !currentOCMedia.length) { cont.style.display = 'none'; return; }
    cont.style.display = '';
    grid.innerHTML = currentOCMedia.map(m => {
        const isImg = (m.tipo_archivo || '').startsWith('foto') || /\.(jpg|jpeg|png|gif|webp)$/i.test(m.ruta_archivo || m.ruta_thumbnail || '');
        const src = m.ruta_thumbnail || m.ruta_archivo;
        const inner = isImg
            ? `<img src="${src}" alt="" loading="lazy">`
            : `<i class="fas fa-file-video"></i>`;
        return `<div class="media-item" data-id="${m.id}" onclick="openLightbox('${isImg ? 'foto' : 'video'}', '${src}', '')">
            ${inner}
            <button class="media-del" data-id="${m.id}" title="Eliminar"><i class="fas fa-times"></i></button>
        </div>`;
    }).join('');
    grid.querySelectorAll('.media-del').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteMediaFile(btn.dataset.id);
    }));
}

async function handleMediaUpload(e) {
    if (!currentOC) { showToast('Guarde la solicitud primero', 'info'); return; }
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
        const fd = new FormData();
        files.forEach(f => fd.append('archivos[]', f));
        fd.append('entidad_tipo', 'orden_compra');
        fd.append('entidad_id', currentOC.id);
        const r = await apiFetch(API_MULT + '?action=subir', fd);
        if (r.success || r.status === 'success') {
            showSuccess('Archivos subidos');
            loadOCFull(currentOC.id);
        } else throw new Error(r.message);
    } catch (err) { showError('Error al subir: ' + err.message); }
    e.target.value = '';
}

async function deleteMediaFile(id) {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
        const fd = new FormData();
        fd.append('id', id);
        fd.append('force', 1);
        const r = await apiFetch(API_UNLINK, fd);
        if (r.success) { showSuccess('Eliminado'); loadOCFull(currentOC.id); }
    } catch (e) { showError('Error al eliminar'); }
}

/* ── Modal Productos ───────────────────────────────────────────────────── */
async function buscarProducto() {
    openModal('productosModal');
    el('productosModalSearch').value = '';
    await renderProductosModalList('');
}

async function renderProductosModalList(filter) {
    const cont = el('productosModalList');
    if (!cont) return;
    const tipo = el('producto_tipo').value;
    const cacheKey = tipo === 'insumo' ? 'insumos' : 'articulos';
    if (!_productosCache[cacheKey].length) {
        cont.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
        try {
            const r = await fetch(API_ROOT + (tipo === 'insumo' ? 'insumos_api.php' : 'articulos_api.php') + '?per_page=300');
            const d = await r.json();
            _productosCache[cacheKey] = d.data?.items || [];
        } catch (e) { cont.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i> Error</div>'; return; }
    }
    const q = (filter || '').toLowerCase();
    const list = _productosCache[cacheKey].filter(p => !q || (p.nombre || '').toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q));
    if (!list.length) { cont.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i> Sin resultados</div>'; return; }
    cont.innerHTML = list.map(p => `<div class="producto-option" data-id="${p.id}" data-nombre="${(p.nombre||'').replace(/"/g,'&quot;')}" data-valor="${p.valor_venta || p.valor_unitario || 0}" onclick="seleccionarProducto(${p.id}, '${(p.nombre||'').replace(/'/g,"\\'")}', ${p.valor_venta || p.valor_unitario || 0})">
        <div class="prod-name">${esc(p.nombre || '')}</div>
        <div class="prod-meta"><small>${p.codigo ? 'Cód: ' + esc(p.codigo) + ' · ' : ''}Stock: ${p.stock || 0} · ${formatMoney(p.valor_venta || p.valor_unitario || 0)}</small></div>
    </div>`).join('');
}

function seleccionarProducto(id, nombre, valor) {
    el('producto_id').value = id;
    el('producto_nombre').value = nombre;
    el('valor_unitario').value = valor;
    closeModal('productosModal');
    setTimeout(() => el('cantidad_solicitada')?.focus(), 100);
}

/* ── Helpers modales ───────────────────────────────────────────────────── */
function openModal(id) { el(id)?.classList.add('active'); }
function closeModal(id) { el(id)?.classList.remove('active'); }
function getTodayDate() { return new Date().toISOString().slice(0, 10); }
function getInitials(nombre) {
    if (!nombre) return '?';
    const parts = nombre.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}
