const API = API_ROOT + 'presupuestos_api.php';
const API_CLIENTES = API_ROOT + 'clientes_api.php';
const API_VEHICULOS = API_ROOT + 'vehiculos_api.php';
const API_SERVICIOS = API_ROOT + 'trabajos_servicios_api.php';
const API_ARTICULOS = API_ROOT + 'articulos_api.php';

let items = [], allItems = [], currentPage = 1, selectedId = null;
let selectedClienteId = null, selectedVehiculoId = null;
let currentStep = 0;
const TOTAL_STEPS = 5;
const IVA_RATE = 0.19;

const cardConfig = {
    titleField: 'id',
    titlePrefix: '#',
    subtitleFields: [
        { field: 'cliente_nombre', label: 'Cliente' },
        { field: 'fecha', label: 'Fecha' },
        { field: 'creado', label: 'Creado', type: 'datetime' }
    ],
    statusField: 'estado',
    badgeMap: {
        aprobado: 'success', rechazado: 'danger', vencido: 'danger',
        convertido: 'primary', borrador: 'warning'
    },
    onClick: (item) => cargarRegistro(item.id),
    onEdit: (item) => cargarRegistro(item.id),
    onDelete: async (item) => {
        if (!confirm('¿Eliminar presupuesto?')) return;
        try {
            const fd = new FormData(); fd.append('action','delete'); fd.append('id',item.id);
            const r = await fetch(API, {method:'POST',body:fd});
            const d = await r.json();
            if (d.status === 'success') { showSuccess('Eliminado'); if (selectedId===item.id) resetForm(); await loadData(); }
            else showError(d.message);
        } catch(e) { showError('Error'); }
    }
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const fi = document.querySelector('.upload-file-input');
    if (fi) setupMultimediaToolbar(el('multimediaToolbar'), fi);

    // Check for URL state (from navigation restoration)
    const urlState = NavState.get();
    if (urlState.id) {
        // Will load record after data is loaded
        selectedId = parseInt(urlState.id);
    }

    // Check for ?selected=X → auto-load a specific presupuesto
    const urlParams = new URLSearchParams(window.location.search);
    const selectedParam = urlParams.get('selected');
    if (selectedParam) {
        selectedId = parseInt(selectedParam);
        window.history.replaceState({}, '', window.location.pathname);
    }

    // Check for ?ot_id=X → auto-load data from OT
    const otIdParam = urlParams.get('ot_id');
    if (otIdParam) {
        cargarDatosDesdeOT(parseInt(otIdParam));
        window.history.replaceState({}, '', window.location.pathname);
    }

    loadData();
    setupReactiveRefresh(loadData);
    // Fallback: si por algún motivo la carga inicial no completó, reintentar tras 500ms
    setTimeout(function() {
        if (typeof loadData === 'function') {
            const grid = document.getElementById('cardGrid') || document.getElementById('otListBody');
            if (grid && (!grid.children || grid.children.length === 0) && (!grid.innerHTML || grid.innerHTML.trim() === '')) {
                console.warn('Retry loadData: lista vacía tras carga inicial');
                try { loadData(); } catch(e) { console.error(e); }
            }
        }
    }, 800);
    loadCatalogoServicios();
    loadCatalogoArticulos();
    setupWizardNav();
    el('dataForm').addEventListener('submit', handleSubmit);

    if (el('btnNuevo')) el('btnNuevo').addEventListener('click', () => { DraftManager.clear('presupuestos'); resetForm(); openFichaPanel('fichaContainer'); });
    if (el('btnReset')) el('btnReset').addEventListener('click', () => { DraftManager.clear('presupuestos'); resetForm(true); });
    if (el('btnEliminar')) el('btnEliminar').addEventListener('click', handleDelete);
    if (el('btnPdf')) el('btnPdf').addEventListener('click', generatePresupuestoPDF);
    if (el('btnCrearOT')) el('btnCrearOT')?.addEventListener('click', crearOT);
    if (el('btnVerificar')) el('btnVerificar')?.addEventListener('click', verificarPresupuesto);
    if (el('searchInput')) el('searchInput').addEventListener('input', debounce(e => { currentPage=1; selectedId=null; loadData(1, e.target.value); }, 400));

    // Client typeahead
    if (el('buscarCliente')) el('buscarCliente').addEventListener('input', debounce(buscarClientes, 300));

    // Vehicle select change
    if (el('vehiculo_select')) el('vehiculo_select').addEventListener('change', onVehiculoChange);

    // Discount inputs
    if (el('descuento_global')) el('descuento_global').addEventListener('input', recalcTotals);
    if (el('descuento_pct')) el('descuento_pct').addEventListener('input', recalcTotals);

    // Quick-create buttons
    if (el('btnQuickCreateCliente')) el('btnQuickCreateCliente').addEventListener('click', async () => {
        const c = await WizardCliente.open();
        if (c) selectCliente(c);
    });
    if (el('btnQuickCreateVehiculo')) el('btnQuickCreateVehiculo').addEventListener('click', async () => {
        if (!selectedClienteId) return showError('Primero seleccione un cliente');
        const v = await WizardVehiculo.open(selectedClienteId);
        if (v) {
            await loadVehiculosCliente(selectedClienteId);
            el('vehiculo_select').value = v.id;
            el('vehiculo_select').dispatchEvent(new Event('change'));
        }
    });
    if (el('btnQuickCreateServicio')) el('btnQuickCreateServicio').addEventListener('click', async () => {
        const s = await WizardServicio.open();
        if (s) {
            items.push({ id: s.id, tipo: 'servicio', nombre: s.nombre, detalle: '', cantidad: 1, valor: parseFloat(s.valor_trabajo || 0), descuento: 0 });
            renderAllItems();
            loadCatalogoServicios();
        }
    });
    if (el('btnQuickCreateArticulo')) el('btnQuickCreateArticulo').addEventListener('click', async () => {
        const a = await WizardArticulo.open();
        if (a) {
            items.push({ id: a.id, tipo: 'articulo', nombre: a.nombre, detalle: '', cantidad: 1, valor: parseFloat(a.valor_venta || 0), descuento: 0 });
            renderAllItems();
            loadCatalogoArticulos();
        }
    });

    // Catalog search
    if (el('searchServicios')) el('searchServicios').addEventListener('input', debounce(() => loadCatalogoServicios(el('searchServicios').value), 300));
    if (el('searchArticulos')) el('searchArticulos').addEventListener('input', debounce(() => loadCatalogoArticulos(el('searchArticulos').value), 300));

    // Mobile close button
    if (el('btnCloseMobile')) el('btnCloseMobile').addEventListener('click', () => closeFichaPanel('fichaContainer'));

    // Volver button (ficha header)
    if (el('btnVolver')) el('btnVolver').addEventListener('click', () => { resetForm(true); });

    // Restore draft
    const draft = DraftManager.load('presupuestos');
    if (draft && !draft._recordId) {
        DraftManager.restoreForm(el('dataForm'), draft);
        if (draft._items) { items = draft._items; renderAllItems(); recalcTotals(); }
        if (draft._selectedClienteId) {
            selectedClienteId = draft._selectedClienteId;
            el('cliente_id_hidden').value = draft._selectedClienteId;
            el('clientInfoPanel').classList.add('active');
            el('cipNombre').textContent = draft._clienteNombre || '—';
            el('cipRut').textContent = draft._clienteRut || '—';
            el('cipTel').textContent = draft._clienteTel || '—';
            if (selectedClienteId) loadVehiculosCliente(selectedClienteId);
        }
        if (draft._step !== undefined) goToStep(draft._step);
        DraftManager.showRestoredBadge('presupuestos');
    }

    DraftManager.startAutoSave('presupuestos', el('dataForm'), {
        get _recordId() { return el('record_id')?.value || ''; },
        get _items() { return items; },
        get _selectedClienteId() { return selectedClienteId; },
        get _clienteNombre() { return el('cipNombre')?.textContent || ''; },
        get _clienteRut() { return el('cipRut')?.textContent || ''; },
        get _clienteTel() { return el('cipTel')?.textContent || ''; },
        get _step() { return currentStep; }
    });

    // Handle browser back/forward
    NavState.onPop('wizard', (state) => {
        if (state.step !== undefined) goToStep(state.step);
    });
    NavState.onPop('record', (state) => {
        if (state.id) cargarRegistro(parseInt(state.id));
    });
    NavState.onPop('module', () => {
        resetForm(true);
    });
    
    // ── SAFETY CHECK — Prevenir pantalla negra ──────────────────────
    setTimeout(() => {
        if (typeof ensureVisibility === 'function') ensureVisibility();
    }, 1500);
});

// ============================================================================
// WIZARD NAVIGATION
// ============================================================================
function setupWizardNav() {
    // Step click navigation
    el('wizardProgress').querySelectorAll('.step').forEach(step => {
        step.addEventListener('click', () => {
            const target = parseInt(step.dataset.step);
            if (target <= currentStep + 1) goToStep(target);
        });
    });

    el('btnPrev').addEventListener('click', () => { if (currentStep > 0) goToStep(currentStep - 1); });
    el('btnNext').addEventListener('click', () => {
        if (currentStep === 0 && !selectedClienteId) return showError('Seleccione un cliente');
        if (currentStep < TOTAL_STEPS - 1) goToStep(currentStep + 1);
    });
}

function goToStep(step) {
    if (step < 0 || step >= TOTAL_STEPS) return;

    currentStep = step;

    // Update progress bar
    el('wizardProgress').querySelectorAll('.step').forEach((s, i) => {
        s.classList.toggle('active', i === step);
        s.classList.toggle('done', i < step);
    });

    // Show/hide panels
    document.querySelectorAll('.step-panel').forEach((p, i) => {
        p.classList.toggle('active', i === step);
    });

    // Button visibility
    el('btnPrev').style.display = step === 0 ? 'none' : 'inline-flex';

    if (step === TOTAL_STEPS - 1) {
        el('btnNext').style.display = 'none';
        el('btnGuardarFinal').style.display = 'inline-flex';
    } else {
        el('btnNext').style.display = 'inline-flex';
        el('btnGuardarFinal').style.display = 'none';
    }

    // Load catalogs when entering steps 2/3
        if (step === 2) { loadCatalogoServicios(); loadCatalogoArticulos(); }
        if (step === 3) { loadCatalogoArticulos(); loadCatalogoServicios(); }
        if (step === 4) renderAllItems();

    // Push wizard step to URL (replace to avoid back-button spam)
    NavState.pushWizard('presupuestos', step, { id: el('record_id')?.value || null });
}

// ============================================================================
// CLIENT SEARCH
// ============================================================================
async function buscarClientes(e) {
    const q = e.target.value.trim();
    const results = el('resultadosCliente');
    if (q.length < 2) { results.style.display = 'none'; return; }
    try {
        const res = await fetch(`${API_CLIENTES}?search=${encodeURIComponent(q)}&per_page=6`);
        const data = await res.json();
        results.innerHTML = '';
        if (data.status === 'success' && data.data.items?.length) {
            data.data.items.forEach(c => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${c.nombre} ${c.apellido || ''}</strong> <span style="opacity:.6;font-size:.78rem">— ${c.rut || 'S/RUT'} — ${c.telefono || ''}</span>`;
                div.addEventListener('click', () => selectCliente(c));
                results.appendChild(div);
            });
            results.style.display = 'block';
        } else {
            results.innerHTML = '<div style="color:var(--text-secondary)">Sin resultados — continúe para crear nuevo</div>';
            results.style.display = 'block';
        }
    } catch(err) { console.error(err); }
}

function selectCliente(c) {
    selectedClienteId = c.id;
    el('cliente_id_hidden').value = c.id;
    el('buscarCliente').value = '';
    el('resultadosCliente').style.display = 'none';
    el('cipNombre').textContent = `${c.nombre || ''} ${c.apellido || ''}`;
    el('cipRut').textContent = c.rut || '—';
    el('cipTel').textContent = c.telefono || '—';
    el('clientInfoPanel').classList.add('active');
    loadVehiculosCliente(c.id);
    showSuccess('Cliente seleccionado');
}

async function loadVehiculosCliente(clienteId) {
    const sel = el('vehiculo_select');
    sel.innerHTML = '<option value="">Cargando vehículos...</option>';
    try {
        const res = await fetch(`${API_VEHICULOS}?search=&cliente_id=${clienteId}&per_page=50`);
        const data = await res.json();
        sel.innerHTML = '<option value="">— Seleccionar vehículo —</option>';
        if (data.status === 'success') {
            const vList = Array.isArray(data.data) ? data.data : (data.data?.items || []);
            if (vList.length) {
                vList.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    opt.textContent = `${v.marca || ''} ${v.modelo || ''} — ${v.patente || 'S/P'}`;
                    opt.dataset.marca = v.marca || '';
                    opt.dataset.modelo = v.modelo || '';
                    opt.dataset.patente = v.patente || '';
                    sel.appendChild(opt);
                });
            } else {
                sel.innerHTML = '<option value="">Sin vehículos — cree uno rápido</option>';
            }
        } else {
            sel.innerHTML = '<option value="">Error al cargar</option>';
        }
    } catch(e) { sel.innerHTML = '<option value="">Error al cargar</option>'; }
}

function onVehiculoChange(e) {
    const opt = e.target.selectedOptions[0];
    if (!opt || !opt.value) { el('vehicleInfoPanel').classList.remove('active'); el('vehiculo_id_hidden').value = ''; return; }
    el('vehiculo_id_hidden').value = opt.value;
    el('vipMarca').textContent = opt.dataset.marca || '—';
    el('vipModelo').textContent = opt.dataset.modelo || '—';
    el('vipPatente').textContent = opt.dataset.patente || '—';
    el('vehicleInfoPanel').classList.add('active');
    selectedVehiculoId = opt.value;
}

// ============================================================================
// CATALOG BROWSERS
// ============================================================================
async function loadCatalogoServicios(search = '') {
    const container = el('catalogoServicios');
    if (!container) return;
    try {
        const res = await fetch(`${API_SERVICIOS}?page=1&search=${encodeURIComponent(search)}&per_page=20`);
        const data = await res.json();
        container.innerHTML = '';
        if (data.status === 'success' && data.data.items?.length) {
            data.data.items.forEach(s => {
                const price = parseFloat(s.valor_trabajo || 0);
                const inItems = items.some(i => i.tipo === 'servicio' && i.id == s.id);
                const card = document.createElement('div');
                card.className = 'catalog-card' + (inItems ? ' selected' : '');
                card.innerHTML = `
                    <div class="cc-icon srv"><i class="fas fa-cogs"></i></div>
                    <div class="cc-name">${s.nombre}</div>
                    <div class="cc-detail">${s.tipo || 'Servicio'}</div>
                    <div class="cc-price">${formatMoney(price)}</div>`;
                card.addEventListener('click', () => {
                    if (inItems) return;
                    items.push({ id: s.id, tipo: 'servicio', nombre: s.nombre, detalle: s.descripcion || '', cantidad: 1, valor: price, descuento: 0 });
                    card.classList.add('selected');
                    renderAllItems();
                });
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="catalog-empty"><i class="fas fa-inbox"></i> Sin servicios encontrados</div>';
        }
    } catch(e) { container.innerHTML = '<div class="catalog-empty"><i class="fas fa-exclamation-triangle"></i> Error al cargar</div>'; }
}

async function loadCatalogoArticulos(search = '') {
    const container = el('catalogoArticulos');
    if (!container) return;
    try {
        const res = await fetch(`${API_ARTICULOS}?page=1&search=${encodeURIComponent(search)}&per_page=20`);
        const data = await res.json();
        container.innerHTML = '';
        if (data.status === 'success' && data.data.items?.length) {
            data.data.items.forEach(a => {
                const price = parseFloat(a.valor_venta || a.precio_venta || 0);
                const inItems = items.some(i => i.tipo === 'articulo' && i.id == a.id);
                const card = document.createElement('div');
                card.className = 'catalog-card' + (inItems ? ' selected' : '');
                card.innerHTML = `
                    <div class="cc-icon art"><i class="fas fa-box"></i></div>
                    <div class="cc-name">${a.nombre}</div>
                    <div class="cc-detail">${a.tipo || 'Artículo'}${a.marca ? ' — ' + a.marca : ''}</div>
                    <div class="cc-price">${formatMoney(price)}</div>`;
                card.addEventListener('click', () => {
                    if (inItems) return;
                    items.push({ id: a.id, tipo: 'articulo', nombre: a.nombre, detalle: a.detalles || '', cantidad: 1, valor: price, descuento: 0 });
                    card.classList.add('selected');
                    renderAllItems();
                });
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div class="catalog-empty"><i class="fas fa-inbox"></i> Sin artículos encontrados</div>';
        }
    } catch(e) { container.innerHTML = '<div class="catalog-empty"><i class="fas fa-exclamation-triangle"></i> Error al cargar</div>'; }
}

// ============================================================================
// RENDER ITEMS (all views)
// ============================================================================
function renderAllItems() {
    renderItemsServicios();
    renderItemsArticulos();
    renderItemsStep4();
    recalcTotals();
}

function renderItemsServicios() {
    const body = el('itemsServiciosBody');
    const table = el('itemsServiciosTable');
    const empty = el('itemsServiciosEmpty');
    if (!body) return;
    body.innerHTML = '';
    const svcItems = items.filter(i => i.tipo === 'servicio');
    if (svcItems.length === 0) { table.style.display = 'none'; empty.style.display = 'block'; return; }
    table.style.display = 'table'; empty.style.display = 'none';
    svcItems.forEach(item => {
        const idx = items.indexOf(item);
        const sub = item.valor * item.cantidad;
        const desc = sub * (item.descuento / 100);
        const neto = sub - desc;
        const isCero = item.valor === 0;
        const row = document.createElement('tr');
        if (isCero) row.style.background = 'rgba(245,158,11,0.08)';
        row.innerHTML = `
            <td class="item-nombre"><span class="item-tipo servicio">SRV</span> ${item.nombre}${isCero ? ' <span style="font-size:0.65rem;background:var(--warning);color:#fff;padding:1px 5px;border-radius:4px;font-weight:700;margin-left:0.3rem;">$0 — Asignar precio</span>' : ''}</td>
            <td><input type="number" value="${item.cantidad}" min="0.5" step="0.5" onchange="items[${idx}].cantidad=parseFloat(this.value)||0;renderAllItems()"></td>
            <td><input type="number" value="${item.valor}" min="0" step="100" onchange="items[${idx}].valor=parseFloat(this.value)||0;renderAllItems()"></td>
            <td><input type="number" value="${item.descuento}" min="0" max="100" step="0.5" onchange="items[${idx}].descuento=parseFloat(this.value)||0;renderAllItems()"></td>
            <td class="item-subtotal">${desc > 0 ? `<span style="text-decoration:line-through;opacity:.5;font-size:.72rem">${formatMoney(sub)}</span> ` : ''}${formatMoney(neto)}</td>
            <td><button type="button" class="btn-remove" onclick="removeItem(${idx})"><i class="fas fa-times"></i></button></td>`;
        body.appendChild(row);
    });
}

function renderItemsArticulos() {
    const body = el('itemsArticulosBody');
    const table = el('itemsArticulosTable');
    const empty = el('itemsArticulosEmpty');
    if (!body) return;
    body.innerHTML = '';
    const artItems = items.filter(i => i.tipo === 'articulo');
    if (artItems.length === 0) { table.style.display = 'none'; empty.style.display = 'block'; return; }
    table.style.display = 'table'; empty.style.display = 'none';
    artItems.forEach(item => {
        const idx = items.indexOf(item);
        const sub = item.valor * item.cantidad;
        const desc = sub * (item.descuento / 100);
        const neto = sub - desc;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="item-nombre"><span class="item-tipo articulo">ART</span> ${item.nombre}</td>
            <td><input type="number" value="${item.cantidad}" min="0.5" step="0.5" onchange="items[${idx}].cantidad=parseFloat(this.value)||0;renderAllItems()"></td>
            <td><input type="number" value="${item.valor}" min="0" step="100" onchange="items[${idx}].valor=parseFloat(this.value)||0;renderAllItems()"></td>
            <td><input type="number" value="${item.descuento}" min="0" max="100" step="0.5" onchange="items[${idx}].descuento=parseFloat(this.value)||0;renderAllItems()"></td>
            <td class="item-subtotal">${desc > 0 ? `<span style="text-decoration:line-through;opacity:.5;font-size:.72rem">${formatMoney(sub)}</span> ` : ''}${formatMoney(neto)}</td>
            <td><button type="button" class="btn-remove" onclick="removeItem(${idx})"><i class="fas fa-times"></i></button></td>`;
        body.appendChild(row);
    });
}

function renderItemsStep4() {
    const body = el('itemsBody');
    const empty = el('emptyItemsMsg');
    const table = el('itemsTable');
    if (!body) return;
    body.innerHTML = '';
    if (items.length === 0) { table.style.display = 'none'; empty.style.display = 'block'; return; }
    table.style.display = 'table'; empty.style.display = 'none';
    items.forEach((item, index) => {
        const sub = item.valor * item.cantidad;
        const desc = sub * (item.descuento / 100);
        const neto = sub - desc;
        const isCero = item.valor === 0;
        const row = document.createElement('tr');
        if (isCero) row.style.background = 'rgba(245,158,11,0.08)';
        row.innerHTML = `
            <td class="item-nombre">
                <span class="item-tipo ${item.tipo}">${item.tipo === 'servicio' ? 'SRV' : 'ART'}</span>
                ${item.nombre}${isCero ? ' <span style="font-size:0.65rem;background:var(--warning);color:#fff;padding:1px 5px;border-radius:4px;font-weight:700;margin-left:0.3rem;">$0</span>' : ''}
            </td>
            <td><input type="number" value="${item.cantidad}" min="0.5" step="0.5" onchange="items[${index}].cantidad=parseFloat(this.value)||0;renderAllItems()"></td>
            <td><input type="number" value="${item.valor}" min="0" step="100" onchange="items[${index}].valor=parseFloat(this.value)||0;renderAllItems()"></td>
            <td><input type="number" value="${item.descuento}" min="0" max="100" step="0.5" onchange="items[${index}].descuento=parseFloat(this.value)||0;renderAllItems()"></td>
            <td class="item-subtotal">${desc > 0 ? `<span style="text-decoration:line-through;opacity:.5;font-size:.72rem">${formatMoney(sub)}</span> ` : ''}${formatMoney(neto)}</td>
            <td><button type="button" class="btn-remove" onclick="removeItem(${index})"><i class="fas fa-times"></i></button></td>`;
        body.appendChild(row);
    });
}

function removeItem(index) {
    items.splice(index, 1);
    renderAllItems();
}

// ============================================================================
// CALCULATE TOTALS
// ============================================================================
function recalcTotals() {
    let subtotalItems = 0, descItems = 0;
    items.forEach(item => {
        const sub = item.valor * item.cantidad;
        subtotalItems += sub;
        descItems += sub * (item.descuento / 100);
    });
    const neto = subtotalItems - descItems;
    const iva = neto * IVA_RATE;
    const descGlobalPct = parseFloat(el('descuento_pct')?.value || 0);
    const descGlobalFixed = parseFloat(el('descuento_global')?.value || 0);
    const descGlobalFromPct = neto * (descGlobalPct / 100);
    const descGlobalTotal = descGlobalFixed + descGlobalFromPct;
    const total = Math.max(0, neto + iva - descGlobalTotal);

    if (el('totalItems')) el('totalItems').textContent = formatMoney(subtotalItems);
    if (el('totalDescItems')) el('totalDescItems').textContent = '-' + formatMoney(descItems);
    if (el('totalNeto')) el('totalNeto').textContent = formatMoney(Math.max(0, neto));
    if (el('totalIVA')) el('totalIVA').textContent = formatMoney(iva);
    if (el('totalDescGlobal')) el('totalDescGlobal').textContent = '-' + formatMoney(descGlobalTotal);
    if (el('totalGrand')) el('totalGrand').textContent = formatMoney(total);

    return { subtotalItems, descItems, neto, iva, descGlobalTotal, total };
}

// ============================================================================
// LOAD DATA (card grid)
// ============================================================================
async function loadData(page = 1, search = '') {
    currentPage = page;
    try {
        const res = await fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`);
        const data = await res.json();
        if (data.status === 'success') {
            allItems = data.data.items;
            renderCardGrid(el('cardGrid'), allItems, { ...cardConfig, selectedId });
            if (data.data.total) renderPagination('paginationContainer', data.data.total, data.data.per_page, data.data.page, 'cambiarPagina');
        }
        if (selectedId && allItems.some(i => String(i.id) === String(selectedId))) {
            cargarRegistro(selectedId);
            selectedId = null;
        }
    } catch (err) { console.error(err); }
    // Cargar OTs finalizadas sin presupuesto para mostrar banner de acción
    loadOTsListas();
}

async function loadOTsListas() {
    try {
        const res = await fetch(`${API_ROOT}ordenes_trabajo_api.php?action=listar&estado=finalizado&per_page=50&t=${Date.now()}`);
        const data = await res.json();
        if (data.status !== 'success') return;
        const otsSinPpto = (data.data?.items || []).filter(ot => !ot.presupuesto_id);
        const banner = el('otFinalizadasBanner');
        const help = el('otFinalizadasHelp');
        if (!banner) return;
        if (otsSinPpto.length === 0) { banner.style.display = 'none'; if (help) help.style.display = 'none'; return; }
        banner.style.display = 'block';
        if (help) help.style.display = 'block';
        banner.innerHTML = `<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <i class="fas fa-check-circle" style="color:var(--success);font-size:1.2rem;"></i>
            <div style="flex:1">
                <strong style="color:var(--success)">${otsSinPpto.length} OT(s) finalizadas listas para presupuestar</strong>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.15rem;">Haga clic en una OT para crear su presupuesto directamente.</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                ${otsSinPpto.slice(0,5).map(ot => `
                    <button onclick="cargarDatosDesdeOT(${ot.id})" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:0.3rem 0.7rem;color:var(--success);font-size:0.78rem;font-weight:600;cursor:pointer;">
                        <i class="fas fa-tools"></i> OT #${ot.id} — ${escapeHtml(ot.patente||'?')} ${escapeHtml(ot.cliente_nombre||'')}
                    </button>`).join('')}
                ${otsSinPpto.length > 5 ? `<span style="font-size:0.75rem;color:var(--text-secondary);align-self:center;">+${otsSinPpto.length-5} más</span>` : ''}
            </div>
        </div>`;
    } catch(e) {}
}

function renderRichList(container, items) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'record-list'; // Override grid class

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Sin presupuestos encontrados</div>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = `record-row ${selectedId === item.id ? 'selected' : ''}`;
        
        // Thumbnail logic: If there are files, show first image, otherwise icon
        const thumbContent = item.archivos && item.archivos.length > 0 
            ? `<img src="${item.archivos[0].ruta_archivo}" alt="thumb">` 
            : `<i class="fas fa-file-invoice-dollar"></i>`;

        const badgeColor = { aprobado:'var(--success)', rechazado:'var(--danger)', vencido:'var(--danger)', convertido:'var(--primary)', borrador:'var(--warning)' }[item.estado] || 'var(--warning)';

        row.innerHTML = `
            <div class="record-row-thumb">${thumbContent}</div>
            <div class="record-row-info">
                <div class="record-row-title">Presupuesto #${item.id} — ${item.cliente_nombre}</div>
                <div class="record-row-sub">
                    <span><i class="far fa-calendar-alt"></i> ${item.fecha || 'S/F'}</span>
                    <span class="status-badge" style="background:rgba(0,0,0,0.2); color:${badgeColor}">${item.estado || 'borrador'}</span>
                </div>
            </div>
            <div class="record-row-actions">
                <button class="btn-icon-sm" title="Ver PDF" onclick="event.stopPropagation(); generatePresupuestoPDF()"><i class="fas fa-file-pdf"></i></button>
                <button class="btn-icon-sm" title="Editar" onclick="event.stopPropagation(); cargarRegistro(${item.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon-sm danger" title="Eliminar" onclick="event.stopPropagation(); handleDeleteRecord(${item.id})"><i class="fas fa-trash"></i></button>
            </div>
        `;

        row.addEventListener('click', () => {
            selectedId = item.id;
            document.querySelectorAll('.record-row').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            cargarRegistro(item.id);
        });

        container.appendChild(row);
    });
}

async function handleDeleteRecord(id) {
    if (!confirm('¿Eliminar presupuesto?')) return;
    const btn = document.querySelector('.btn-danger-outline'); // Or a specific button
    try {
        const fd = new FormData(); fd.append('action','delete'); fd.append('id',id);
        const res = await fetch(API, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.status === 'success') { 
            showSuccess('Eliminado'); 
            selectedId = null; 
            await loadData(currentPage, el('searchInput')?.value || ''); 
            resetForm(true); 
        } else showError(data.message);
    } catch (err) { showError('Error al eliminar'); }
}


// ============================================================================
// LOAD RECORD (edit mode → jump to step 4)
// ============================================================================
async function cargarRegistro(id) {
    resetForm(false); selectedId = id;
    openFichaPanel('fichaContainer');
    try {
        const res = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const data = await res.json();
        if (data.status !== 'success') return showError(data.message);
        const item = data.data;

        el('record_id').value = item.id;
        el('fecha').value = item.fecha || '';
        el('vigencia').value = item.vigencia || 30;
        el('requisito').value = item.requisito || '';
        el('observaciones').value = item.observaciones || '';

        // Setup field voice notes for text fields
        if (typeof setupFieldVoiceNote === 'function') {
            setupFieldVoiceNote({ textareaId: 'requisito', label: 'Requisito', entidadTipo: 'presupuestos' });
            setupFieldVoiceNote({ textareaId: 'observaciones', label: 'Observaciones', entidadTipo: 'presupuestos' });
            loadFieldVoiceNotes(item.id, 'presupuestos', 'requisito', 'voice-list-requisito');
            loadFieldVoiceNotes(item.id, 'presupuestos', 'observaciones', 'voice-list-observaciones');
        }

        // Client
        if (item.cliente_id) {
            selectedClienteId = item.cliente_id;
            el('cliente_id_hidden').value = item.cliente_id;
            el('cipNombre').textContent = `${item.cliente_nombre || ''} ${item.cliente_apellido || ''}`;
            el('cipRut').textContent = item.cliente_rut || '—';
            el('cipTel').textContent = item.cliente_telefono || '—';
            el('clientInfoPanel').classList.add('active');
            await loadVehiculosCliente(item.cliente_id);
            if (item.vehiculo_id) {
                el('vehiculo_select').value = item.vehiculo_id;
                el('vehiculo_id_hidden').value = item.vehiculo_id;
                el('vipMarca').textContent = item.marca || '—';
                el('vipModelo').textContent = item.modelo || '—';
                el('vipPatente').textContent = item.patente || '—';
                el('vehicleInfoPanel').classList.add('active');
            }
        }

        // Items
        if (item.items_list && item.items_list.length) {
            items = item.items_list.map(i => ({
                id: i.item_id, tipo: i.tipo, nombre: i.nombre,
                detalle: i.detalle || '', cantidad: i.cantidad,
                valor: i.valor_unitario, descuento: i.descuento || 0
            }));
        } else if (item.items_json) {
            try { items = JSON.parse(item.items_json); } catch(e) { items = []; }
        }
        renderAllItems();

        el('descuento_global').value = item.descuento_global || 0;
        el('descuento_pct').value = item.descuento_pct || 0;

        window._currentPresupuestoData = item;
        renderExistingMedia(item.archivos, 'existingMediaContainer', 'existingMediaGrid', 'presupuestos');
        el('fichaTitle').textContent = 'Presupuesto #' + item.id;
        el('fichaSub').textContent = `${item.cliente_nombre || 'Sin cliente'} — ${item.fecha || ''}`;
        el('btnEliminar').style.display = 'inline-flex';
        if (el('btnPdf')) el('btnPdf').style.display = 'inline-flex';
        // Show "Crear OT" only if not already converted
        if (el('btnCrearOT')) el('btnCrearOT').style.display = item.convertido_a_ot ? 'none' : 'inline-flex';
        // Show "Registrar Pago" if presupuesto has positive total
        if (el('btnRegistrarPago')) el('btnRegistrarPago').style.display = (parseFloat(item.valor_total) > 0) ? 'inline-flex' : 'none';
        // Show "Verificar" only if not yet verified and not pagado/convertido
        const puedeVerificar = !item.verificado && !['pagado','convertido','rechazado'].includes(item.estado);
        if (el('btnVerificar')) el('btnVerificar').style.display = puedeVerificar ? 'inline-flex' : 'none';
        (el('cardGrid')?.querySelectorAll('.record-card')||[]).forEach((c,i) => c.classList.toggle('selected', allItems[i] && String(allItems[i].id)===String(id)));

        // Push record state to URL
        NavState.pushRecord('presupuestos', id, 'Presupuesto #' + item.id);
        // Jump to step 4 (totals) for edit mode
        goToStep(4);
    } catch (err) { console.error("Error cargando:", err); }
}

// ============================================================================
// AUTO-LOAD FROM OT (?ot_id=X)
// ============================================================================
async function cargarDatosDesdeOT(otId) {
    showInfo('Cargando datos desde OT #' + otId + '...');
    try {
        const res = await fetch(`${API}?action=ot_data_for_presupuesto&ot_id=${otId}&t=${Date.now()}`);
        const data = await res.json();
        if (data.status !== 'success') return showError(data.message);

        const d = data.data;
        resetForm(false);
        openFichaPanel('fichaContainer');

        // Prefill cliente
        if (d.cliente && d.cliente.id) {
            selectCliente(d.cliente);
        }

        // Prefill vehiculo
        if (d.vehiculo && d.vehiculo.id) {
            // Wait for vehicles to load, then select
            const checkVehicles = setInterval(() => {
                const sel = el('vehiculo_select');
                if (sel && sel.options.length > 1) {
                    clearInterval(checkVehicles);
                    sel.value = d.vehiculo.id;
                    sel.dispatchEvent(new Event('change'));
                }
            }, 100);
            setTimeout(() => clearInterval(checkVehicles), 5000);
        }

        // Prefill items from OT/diagnosis
        if (d.items && d.items.length) {
            items = d.items;
            renderAllItems();
            // Advertir si hay ítems imprevistos con valor $0
            const imprevistos = items.filter(i => (i.valor === 0 || i.valor_unitario === 0) && i.tipo === 'servicio');
            if (imprevistos.length) {
                showToast(`${imprevistos.length} servicio(s) con valor $0 (imprevistos). Asigne precio en el paso de Totales.`, 'warning');
            }
        }

        // Set description as observaciones
        if (d.descripcion) {
            el('observaciones').value = 'Desde OT #' + otId + ': ' + d.descripcion;
        }

        // Go to step 2 (services) to let user review items
        setTimeout(() => goToStep(2), 300);

        showSuccess('Datos de OT #' + otId + ' cargados — revise los ítems antes de guardar');
    } catch (e) {
        showError('Error al cargar datos de OT: ' + e.message);
    }
}

// ============================================================================
// SUBMIT
// ============================================================================
async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedClienteId && !el('cliente_id_hidden').value) return showError('Seleccione un cliente');
    if (items.length === 0) return showError('Agregue al menos un ítem al presupuesto');

    const btn = el('btnGuardarFinal');
    setButtonLoading(btn, true, 'Guardando...');
    const totals = recalcTotals();

    const fd = new FormData(el('dataForm'));
    fd.set('cliente_id', selectedClienteId || el('cliente_id_hidden').value || '');
    fd.set('vehiculo_id', el('vehiculo_id_hidden').value || '');
    fd.set('items_json', JSON.stringify(items));
    fd.set('valor', totals.neto);
    fd.set('impuesto', totals.iva);
    fd.set('descuento', totals.descItems + totals.descGlobalTotal);
    fd.set('valor_total', totals.total);
    fd.set('descuento_global', el('descuento_global')?.value || 0);
    fd.set('descuento_pct', el('descuento_pct')?.value || 0);

    const fi = document.querySelector('.upload-file-input');
    if (fi?.files.length) Array.from(fi.files).forEach(f => fd.append('archivos[]', f));

    try {
        const data = await uploadWithProgress(API, fd);
        if (data.status === 'success') { showSuccess('Presupuesto guardado'); DraftManager.clear('presupuestos'); await loadData(); resetForm(true); }
        else showError(data.message);
    } catch (err) { showError('Error'); } finally { setButtonLoading(btn, false); }
}

// ============================================================================
// DELETE
// ============================================================================
async function handleDelete() {
    const id = el('record_id')?.value;
    if (!id || !confirm('¿Eliminar presupuesto?')) return;
    const btn = el('btnEliminar');
    setButtonLoading(btn, true, 'Eliminando...');
    try {
        const fd = new FormData(); fd.append('action','delete'); fd.append('id',id);
        const res = await fetch(API, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.status === 'success') { showSuccess('Eliminado'); selectedId=null; await loadData(); resetForm(true); }
        else showError(data.message);
    } catch (err) { showError('Error'); } finally { setButtonLoading(btn, false); }
}

// ============================================================================
// RESET
// ============================================================================
function resetForm(clear = true) {
    DraftManager.clear('presupuestos');
    el('dataForm').reset();
    items = []; renderAllItems();
    selectedClienteId = null; selectedVehiculoId = null;
    el('cliente_id_hidden').value = '';
    el('vehiculo_id_hidden').value = '';
    el('clientInfoPanel').classList.remove('active');
    el('vehicleInfoPanel').classList.remove('active');
    el('vehiculo_select').innerHTML = '<option value="">— Seleccionar vehículo —</option>';
    el('descuento_global').value = 0;
    el('descuento_pct').value = 0;
    recalcTotals();
    if (el('existingMediaContainer')) el('existingMediaContainer').style.display = 'none';
    const fi = document.querySelector('.upload-file-input'); if(fi) fi.value = '';
    const pg = document.querySelector('.new-preview-grid'); if(pg) pg.innerHTML = '';
    if (clear) {
        el('fichaTitle').textContent = 'Nuevo Presupuesto';
        el('fichaSub').textContent = 'Complete los pasos del wizard para crear el presupuesto';
        selectedId = null;
        el('cardGrid')?.querySelectorAll('.record-card').forEach(c => c.classList.remove('selected'));
        closeFichaPanel('fichaContainer');
        NavState.setParam('id', null);
        NavState.setParam('step', null);
    }
    el('btnEliminar').style.display = 'none';
    if (el('btnPdf')) el('btnPdf').style.display = 'none';
    if (el('btnCrearOT')) el('btnCrearOT').style.display = 'none';
    if (el('btnRegistrarPago')) el('btnRegistrarPago').style.display = 'none';
    if (el('btnVerificar')) el('btnVerificar').style.display = 'none';
    goToStep(0);
}

// ============================================================================
// PDF
// ============================================================================
function generatePresupuestoPDF() {
    const data = window._currentPresupuestoData;
    if (!data || !data.id) { showError('Seleccione un presupuesto'); return; }
    data.items = items;
    const totals = recalcTotals();
    data.valor = totals.neto;
    data.impuesto = totals.iva;
    data.descuento = totals.descItems + totals.descGlobalTotal;
    data.valor_total = totals.total;
    generatePDF('presupuesto', data, 'Presupuesto_' + data.id + '.pdf');
}

// ============================================================================
// VERIFICAR PRESUPUESTO
// ============================================================================
async function verificarPresupuesto() {
    const id = el('record_id')?.value;
    if (!id) return showError('Seleccione un presupuesto');
    if (!confirm('¿Marcar este presupuesto como verificado?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'verificar');
        fd.append('id', id);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') {
            showSuccess('Presupuesto verificado');
            await cargarRegistro(id);
        } else showError(d.message);
    } catch (e) { showError('Error: ' + e.message); }
}

// ============================================================================
// CREAR OT DESDE PRESUPUESTO
// ============================================================================
async function crearOT() {
    const id = el('record_id')?.value;
    if (!id) { showError('Seleccione presupuesto'); return; }
    if (!confirm('¿Generar una Orden de Trabajo desde este presupuesto?\nSe copiarán cliente, vehículo y todos los ítems.')) return;
    const btn = el('btnCrearOT');
    setButtonLoading(btn, true, 'Generando OT...');
    try {
        const fd = new FormData();
        fd.append('action', 'convertir_a_ot');
        fd.append('id', id);
        const res = await fetch(API, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.status === 'success') {
            showSuccess('OT #' + data.data.id + ' creada desde presupuesto #' + id);
            await loadData();
            cargarRegistro(id);
            window.open('ordenes_trabajo.html?selected=' + data.data.id, '_blank');
        } else {
            showError(data.message || 'No se pudo crear la OT');
        }
    } catch (e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// REGISTRAR PAGO
// ============================================================================
async function abrirModalPago() {
    const id = el('record_id')?.value;
    if (!id) return showError('Seleccione un presupuesto');
    const data = window._currentPresupuestoData || {};
    const total = parseFloat(data.valor_total) || 0;

    // Load payments
    let totalPagado = 0;
    try {
        const r = await fetch(API + '?action=pagos&presupuesto_id=' + id + '&t=' + Date.now());
        const d = await r.json();
        if (d.status === 'success' && Array.isArray(d.data)) {
            totalPagado = d.data.reduce((s, p) => s + parseFloat(p.monto), 0);
        }
    } catch(e) {}

    const saldo = total - totalPagado;
    el('pagoResumen').innerHTML = `
        <p><strong>Presupuesto #${id}</strong> — ${escapeHtml(data.descripcion || data.detalle_trabajos || '')}</p>
        <p>Total: <strong>${formatMoney(total)}</strong> | Pagado: <strong>${formatMoney(totalPagado)}</strong> | Pendiente: <strong style="color:${saldo > 0 ? 'var(--warning)' : 'var(--success)'}">${formatMoney(saldo)}</strong></p>`;
    el('pagoMonto').value = saldo > 0 ? saldo : '';
    el('pagoMonto').max = saldo;
    el('pagoObservacion').value = '';

    // Load accounts
    try {
        const r = await fetch(API_ROOT + 'cuentas_bancarias_api.php?t=' + Date.now());
        const d = await r.json();
        const sel = el('pagoCuenta');
        sel.innerHTML = '<option value="">— Sin cuenta —</option>';
        if (d.status === 'success') {
            const cuentas = d.data?.items || (Array.isArray(d.data) ? d.data : []);
            cuentas.forEach(c => {
                sel.innerHTML += `<option value="${c.id}">${escapeHtml(c.nombre)} — ${escapeHtml(c.banco || '')} (${formatMoney(c.saldo || 0)})</option>`;
            });
        }
    } catch(e) { console.error('Error loading cuentas:', e); }

    el('pagoModal').classList.add('active');
    el('pagoConfirmar').onclick = confirmarPago;
}

function cerrarModalPago() {
    el('pagoModal').classList.remove('active');
    if (el('pagoComprobante')) el('pagoComprobante').value = '';
}

async function confirmarPago() {
    const id = el('record_id')?.value;
    const monto = parseFloat(el('pagoMonto').value);
    if (!id || !monto || monto <= 0) return showError('Ingrese un monto válido');
    const btn = el('pagoConfirmar');
    setButtonLoading(btn, true, 'Registrando...');
    try {
        const fd = new FormData();
        fd.append('action', 'registrar_pago');
        fd.append('presupuesto_id', id);
        fd.append('monto', monto);
        fd.append('cuenta_bancaria_id', el('pagoCuenta').value);
        fd.append('forma_pago', el('pagoForma').value);
        fd.append('observacion', el('pagoObservacion').value);
        // Comprobante de pago (imagen/PDF opcional)
        const comprobante = el('pagoComprobante');
        if (comprobante && comprobante.files && comprobante.files[0]) {
            fd.append('comprobante', comprobante.files[0]);
        }
        const d = await apiFetch(API, fd);
        if (d.status === 'success') {
            showSuccess('Pago de ' + formatMoney(monto) + ' registrado');
            cerrarModalPago();
            await loadData();
            if (selectedId) cargarRegistro(selectedId);
        } else showError(d.message);
    } catch(e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}
