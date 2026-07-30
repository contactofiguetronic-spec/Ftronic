/* js/ordenes_trabajo.js — Ficha Completa */
const API = API_ROOT + 'ordenes_trabajo_api.php';
const API_ARTICULOS = API_ROOT + 'articulos_api.php';
const API_SERVICIOS = API_ROOT + 'trabajos_servicios_api.php';

let selectedId = null;
let currentPage = 1;
let currentOtData = null;
let currentRecepcionData = null;
let currentSearch = '';
let currentEstado = '';
let totalItems = 0;
let perPage = 25;
let otRepuestosTaller = [];
let otServicios = [];
let otRepuestosCliente = [];

const statusLabels = {
    abierta: 'Abierta', proceso: 'En Proceso',
    diagnostico: 'En Diagnóstico', finalizado: 'Finalizado', cancelado: 'Cancelado'
};

const statusFlow = {
    abierta: ['proceso', 'diagnostico'],
    proceso: ['diagnostico', 'finalizado', 'cancelado'],
    diagnostico: ['proceso', 'finalizado', 'cancelado'],
    finalizado: [], cancelado: ['abierta']
};

function getStatusLabel(s) { return statusLabels[s] || s || '—'; }

document.addEventListener('DOMContentLoaded', async () => {
    await loadLinkedData();
    bindEvents();
    loadKpis();
    await loadRecepcionesAbiertasList();

    const urlParams = new URLSearchParams(window.location.search);
    const autoSelected = urlParams.get('selected');
    if (autoSelected) {
        const id = parseInt(autoSelected);
        if (id) openFicha(id);
        window.history.replaceState({}, '', window.location.pathname);
    }

    setupReactiveRefresh(() => loadRecepcionesAbiertasList(currentPage));
});

async function loadLinkedData() {
    await loadLinkedSelect('otAsignadoSelect', 'empleados');
    await loadLinkedSelect('otEmpleadoSelect', 'empleados');
}

function bindEvents() {
    el('btnRefreshList').addEventListener('click', () => loadRecepcionesAbiertasList(1, currentSearch, currentEstado));
    el('btnBackList').addEventListener('click', closeFicha);
    el('btnFichaPdf').addEventListener('click', generarPdf);
    el('btnFichaDelete').addEventListener('click', eliminarOT);
    el('btnAsignar').addEventListener('click', asignarTecnico);
    el('btnCrearPresupuesto').addEventListener('click', crearPresupuesto);
    el('btnIrPresupuesto').addEventListener('click', irAPresupuesto);
    el('btnVerPresupuesto').addEventListener('click', () => {
        if (currentOtData?.presupuesto_id_ref) {
            window.open('presupuestos.html?selected=' + currentOtData.presupuesto_id_ref, '_blank');
        }
    });
    const btnGenOT = el('btnGenerarOTdesdePanel');
    if (btnGenOT) btnGenOT.addEventListener('click', generarOTdesdePanel);

    let searchTimer;
    const searchInput = el('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                currentSearch = e.target.value.trim();
                loadRecepcionesAbiertasList(1, currentSearch, currentEstado);
            }, 400);
        });
    }

    const filterEstado = el('filterEstado');
    if (filterEstado) {
        filterEstado.addEventListener('change', (e) => {
            currentEstado = e.target.value;
            loadRecepcionesAbiertasList(1, currentSearch, currentEstado);
        });
    }

    if (el('btnIrEjecucion')) el('btnIrEjecucion').addEventListener('click', abrirEjecucion);

    document.querySelectorAll('.ficha-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const dataTab = tab.dataset.tab;
            const panel = el('tab' + dataTab.charAt(0).toUpperCase() + dataTab.slice(1));
            if (panel) panel.classList.add('active');
        });
    });

    el('btnGuardarDatosOT').addEventListener('click', guardarDatosOT);
    el('btnAgregarRepuestoTaller').addEventListener('click', () => {
        resetRepuestoModal();
        cargarListaArticulos();
        el('repuestoTallerModal').classList.add('active');
    });
    el('btnAgregarServicio').addEventListener('click', () => {
        resetServicioModal();
        cargarListaServicios();
        el('servicioModal').classList.add('active');
    });
    if (el('btnAgregarRepuestoCliente')) el('btnAgregarRepuestoCliente').addEventListener('click', agregarRepuestoCliente);

    el('recepModalClose').addEventListener('click', () => el('recepModal').classList.remove('active'));
    el('recepCancelar').addEventListener('click', () => el('recepModal').classList.remove('active'));

    el('buscarArticuloTaller').addEventListener('input', filtrarListaArticulos);
    el('btnGuardarRepuestoTaller').addEventListener('click', guardarRepuestoTaller);
    el('buscarServicioTrabajo').addEventListener('input', filtrarListaServicios);
    el('btnGuardarServicio').addEventListener('click', guardarServicio);
}

async function loadKpis() {
    try {
        const r = await fetch(`${API}?action=kpis&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success') {
            const k = d.data;
            el('kpiPendientes').querySelector('.ot-kpi-val').textContent = k.pendientes || 0;
            el('kpiDiagnostico').querySelector('.ot-kpi-val').textContent = k.en_diagnostico || 0;
            el('kpiConPresup').querySelector('.ot-kpi-val').textContent = k.con_presupuesto || 0;
            el('kpiPagadas').querySelector('.ot-kpi-val').textContent = k.pagadas_mes || 0;
        }
    } catch (e) { console.error('KPI error:', e); }
}

async function loadRecepcionesAbiertasList(page = currentPage, search = currentSearch, estado = currentEstado) {
    currentPage = page;
    currentSearch = search;
    currentEstado = estado;

    el('otAbiertasList').innerHTML = renderSkeletonTickets(3);
    el('otProcesoList').innerHTML = renderSkeletonTickets(3);
    el('otAbiertasEmpty').style.display = 'none';
    el('otProcesoEmpty').style.display = 'none';
    el('otEmpty').style.display = 'none';

    const showAbiertas = !estado || estado === 'abierta';
    const showProceso = !estado || ['diagnostico', 'proceso'].includes(estado);

    el('sectionAbiertas').style.display = showAbiertas ? '' : 'none';
    el('sectionProceso').style.display = showProceso ? '' : 'none';

    try {
        const params = new URLSearchParams({
            page, per_page: perPage, search: search || '', estado: estado || '', t: Date.now()
        });
        const r = await fetch(`${API}?action=listar&${params}`);
        const d = await r.json();
        if (d.status !== 'success') {
            el('otAbiertasList').innerHTML = '';
            el('otProcesoList').innerHTML = '';
            el('otEmpty').style.display = 'block';
            renderPagination(0, 0, 0);
            return;
        }

        const allItems = d.data?.items || [];
        totalItems = d.data?.total || 0;
        perPage = d.data?.per_page || perPage;

        const abiertas = allItems.filter(i => i.estado === 'abierta');
        const proceso = allItems.filter(i => i.estado !== 'abierta');

        if (showAbiertas) {
            el('abiertasCount').textContent = abiertas.length;
            if (abiertas.length) {
                el('otAbiertasEmpty').style.display = 'none';
                renderAbiertasList(abiertas);
            } else {
                el('otAbiertasList').innerHTML = '';
                el('otAbiertasEmpty').style.display = 'block';
            }
        }

        if (showProceso) {
            el('procesoCount').textContent = proceso.length;
            if (proceso.length) {
                el('otProcesoEmpty').style.display = 'none';
                renderProcesoList(proceso);
            } else {
                el('otProcesoList').innerHTML = '';
                el('otProcesoEmpty').style.display = 'block';
            }
        }

        renderPagination(totalItems, d.data.page, perPage);

        if (!abiertas.length && !proceso.length) {
            el('otEmpty').style.display = 'block';
        }
    } catch (e) {
        console.error('List error:', e);
        el('otAbiertasList').innerHTML = '';
        el('otProcesoList').innerHTML = '';
        el('otEmpty').innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p>';
        el('otEmpty').style.display = 'block';
    }
}

function renderPagination(total, page, per) {
    const container = el('otPagination');
    if (!total || total <= (per || perPage)) { container.innerHTML = ''; return; }
    const totalPages = Math.ceil(total / per);
    const cur = page || 1;
    let html = '';
    html += `<button onclick="cambiarPaginaOt(${cur - 1})" ${cur === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
    const start = Math.max(1, cur - 2);
    const end = Math.min(totalPages, cur + 2);
    if (start > 1) {
        html += `<button onclick="cambiarPaginaOt(1)">1</button>`;
        if (start > 2) html += `<span class="ot-page-info">…</span>`;
    }
    for (let i = start; i <= end; i++) {
        html += `<button class="${i === cur ? 'active' : ''}" onclick="cambiarPaginaOt(${i})">${i}</button>`;
    }
    if (end < totalPages) {
        if (end < totalPages - 1) html += `<span class="ot-page-info">…</span>`;
        html += `<button onclick="cambiarPaginaOt(${totalPages})">${totalPages}</button>`;
    }
    html += `<button onclick="cambiarPaginaOt(${cur + 1})" ${cur === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    html += `<span class="ot-page-info">${total} reg.</span>`;
    container.innerHTML = html;
}

window.cambiarPaginaOt = function(p) {
    if (p < 1) return;
    const totalPages = Math.ceil(totalItems / perPage);
    if (p > totalPages) return;
    loadRecepcionesAbiertasList(p, currentSearch, currentEstado);
};

function renderSkeletonTickets(n) {
    let h = '';
    for (let i = 0; i < n; i++) {
        h += '<div class="ot-card-item record-card" style="pointer-events:none">' +
             '<div class="ot-card-top"><div style="background:var(--border-color);border-radius:4px;width:70px;height:12px">&nbsp;</div></div>' +
             '<div style="background:var(--border-color);border-radius:4px;width:90%;height:14px;margin-top:8px">&nbsp;</div>' +
             '<div style="background:var(--border-color);border-radius:4px;width:70%;height:12px;margin-top:6px">&nbsp;</div>' +
             '</div>';
    }
    return h;
}

function renderAbiertasList(items) {
    const container = el('otAbiertasList');
    container.innerHTML = items.map(item => {
        const otId = item.id;
        const estado = item.estado || 'abierta';
        const clienteFull = [item.cliente_nombre, item.cliente_apellido].filter(Boolean).join(' ') || '—';
        const vehiculo = [item.marca, item.modelo].filter(Boolean).join(' ') || '';
        const fecha = item.fecha || (item.creado ? item.creado.split(' ')[0] : '');
        const empleadoFull = [item.empleado_nombre, item.empleado_apellido].filter(Boolean).join(' ');

        return `<div class="ot-card-item record-card" data-id="${otId}" onclick="openFicha(${otId})">
            <div class="ot-card-top">
                <span class="ot-card-id">OT #${otId}</span>
                <span class="badge badge-warning">${getStatusLabel(estado)}</span>
            </div>
            <div class="ot-card-vehicle">
                <i class="fas fa-car"></i>
                <strong>${escapeHtml(item.patente || '—')}</strong>
                ${vehiculo ? `<span class="ot-card-vehicle-model">${escapeHtml(vehiculo)}</span>` : ''}
            </div>
            <div class="ot-card-client">
                <i class="fas fa-user"></i> ${escapeHtml(clienteFull)}
            </div>
            <div class="ot-card-badges">
                <span class="ot-card-badge"><i class="fas fa-calendar"></i> ${escapeHtml(fecha)}</span>
                ${empleadoFull ? `<span class="ot-card-badge"><i class="fas fa-user-cog"></i> ${escapeHtml(empleadoFull)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

function renderProcesoList(items) {
    const container = el('otProcesoList');
    container.innerHTML = items.map(item => {
        const otId = item.id;
        const estado = item.estado || 'abierta';
        const clienteFull = [item.cliente_nombre, item.cliente_apellido].filter(Boolean).join(' ') || '—';
        const vehiculo = [item.marca, item.modelo].filter(Boolean).join(' ') || '';
        const motivo = item.descripcion_problema || 'Sin descripción';
        const fecha = item.fecha || (item.creado ? item.creado.split(' ')[0] : '');
        const itemsPendientes = item.items_pendientes || 0;
        const tienePpto = !!item.presupuesto_id;
        const empleadoFull = [item.empleado_nombre, item.empleado_apellido].filter(Boolean).join(' ');

        const estadoColors = {
            proceso: 'badge-info',
            diagnostico: 'badge-warning', finalizado: 'badge-success', cancelado: 'badge-danger'
        };
        const badgeClass = estadoColors[estado] || 'badge-secondary';

        return `<div class="ot-card-item record-card" data-id="${otId}" onclick="openFicha(${otId})">
            <div class="ot-card-top">
                <span class="ot-card-id">OT #${otId}</span>
                <span class="badge ${badgeClass}">${getStatusLabel(estado)}</span>
            </div>
            <div class="ot-card-vehicle">
                <i class="fas fa-car"></i>
                <strong>${escapeHtml(item.patente || '—')}</strong>
                ${vehiculo ? `<span class="ot-card-vehicle-model">${escapeHtml(vehiculo)}</span>` : ''}
            </div>
            <div class="ot-card-client">
                <i class="fas fa-user"></i> ${escapeHtml(clienteFull)}
            </div>
            <div class="ot-card-badges">
                <span class="ot-card-badge"><i class="fas fa-calendar"></i> ${escapeHtml(fecha)}</span>
                ${empleadoFull ? `<span class="ot-card-badge"><i class="fas fa-user-cog"></i> ${escapeHtml(empleadoFull)}</span>` : ''}
                ${tienePpto ? '<span class="ot-card-badge badge-ppto"><i class="fas fa-file-invoice-dollar"></i> PPTO</span>' : ''}
                ${itemsPendientes > 0 ? `<span class="ot-card-badge badge-items"><i class="fas fa-tasks"></i> ${itemsPendientes}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

window.openFicha = async function(id) {
    selectedId = id;
    document.querySelectorAll('.ot-card-item').forEach(e => e.classList.remove('selected'));
    const ticketEl = document.querySelector(`.ot-card-item[data-id="${id}"]`);
    if (ticketEl) ticketEl.classList.add('selected');

    el('fichaTitle').textContent = `OT #${id}`;
    el('fichaSub').textContent = 'Cargando...';
    el('fichaAvatar').textContent = 'OT';
    el('fichaAvatar').className = 'ficha-avatar gradient-yellow';
    el('btnFichaPdf').style.display = '';
    el('btnFichaDelete').style.display = '';
    el('fichaStats').innerHTML = '';

    openFichaPanel();
    await cargarDetalle(id);
};

function closeFicha() {
    closeFichaPanel();
    selectedId = null;
    currentOtData = null;
    currentRecepcionData = null;
    document.querySelectorAll('.ot-card-item').forEach(e => e.classList.remove('selected'));
}

async function cargarDetalle(id) {
    try {
        const r = await fetch(`${API}?action=detalle&id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') {
            showError(d.message || 'Error al cargar OT');
            return;
        }
        currentOtData = d.data;
        renderDetalle(currentOtData);
        renderStatusBadge(currentOtData.estado);
        renderOTMultimedia(d.data.archivos || []);
    } catch (e) {
        console.error('cargarDetalle error:', e);
        showError('Error al cargar: ' + (e.message || e));
    }
}

function renderDetalle(data) {
    const setText = (id, val) => { const e = el(id); if (e) e.textContent = val; };
    const setVal = (id, val) => { const e = el(id); if (e) e.value = val; };
    const setDisplay = (id, val) => { const e = el(id); if (e) e.style.display = val; };
    const setClass = (id, cls) => { const e = el(id); if (e) e.className = cls; };

    const clienteFull = [data.cliente_nombre, data.cliente_apellido].filter(Boolean).join(' ') || '—';
    el('fichaTitle').textContent = `OT #${data.id}`;
    el('fichaSub').textContent = `${data.patente || '—'} · ${clienteFull}`;

    const estadoColors = {
        abierta: 'gradient-yellow', proceso: 'gradient-blue',
        diagnostico: 'gradient-orange', finalizado: 'gradient-green', cancelado: 'gradient-red'
    };
    el('fichaAvatar').className = 'ficha-avatar ' + (estadoColors[data.estado] || 'gradient-yellow');
    el('fichaAvatar').textContent = data.patente ? data.patente.slice(0, 2).toUpperCase() : 'OT';

    el('fichaStats').innerHTML = `
        <div class="meta-card stat-sm"><div class="stat-label">Estado</div><div class="stat-val">${getStatusLabel(data.estado)}</div></div>
        <div class="meta-card stat-sm"><div class="stat-label">Prioridad</div><div class="stat-val">${data.prioridad || 'Normal'}</div></div>
        <div class="meta-card stat-sm"><div class="stat-label">Fecha</div><div class="stat-val">${data.fecha || '—'}</div></div>
    `;

    setVal('otAsignadoSelect', data.asignado_empleado_id || '');
    setText('otCliNombre', clienteFull);
    setText('otCliRut', data.cliente_rut || '—');
    setText('otCliTelefono', data.cliente_telefono || '—');
    setText('otVehPatente', data.patente || '—');
    setText('otVehMarcaModelo', [data.marca, data.modelo].filter(Boolean).join(' ') || '—');
    setText('otVehAnio', data.anio || '—');
    setText('otPresupId', data.presupuesto_id_ref ? '#' + data.presupuesto_id_ref : '—');
    setText('otPresupMonto', data.presupuesto_total ? formatMoney(data.presupuesto_total) : '—');
    setText('otPresupEstado', data.presupuesto_estado ? data.presupuesto_estado.toUpperCase() : '—');
    setVal('otFecha', data.fecha || new Date().toISOString().split('T')[0]);
    setVal('otDescripcionProblema', data.descripcion_problema || '');
    setVal('otProcedimientoTecnico', data.procedimiento_tecnico || '');
    setVal('otNotasAdicionales', data.notas_adicionales || '');
    setVal('otEmpleadoSelect', data.asignado_empleado_id || '');
    setVal('otComentariosEmpleado', data.comentarios_empleado || '');

    if (typeof setupFieldVoiceNote === 'function') {
        setupFieldVoiceNote({ textareaId: 'otDescripcionProblema', label: 'Descripción Problema', entidadTipo: 'orden_trabajo' });
        setupFieldVoiceNote({ textareaId: 'otProcedimientoTecnico', label: 'Procedimiento Técnico', entidadTipo: 'orden_trabajo' });
        setupFieldVoiceNote({ textareaId: 'otNotasAdicionales', label: 'Notas Adicionales', entidadTipo: 'orden_trabajo' });
        setupFieldVoiceNote({ textareaId: 'otComentariosEmpleado', label: 'Comentarios Empleado', entidadTipo: 'orden_trabajo' });
    }

    otRepuestosTaller = (data.items_list || []).filter(i => i.seccion === 'repuesto_taller');
    otServicios = (data.items_list || []).filter(i => i.seccion === 'servicio');
    if (data.repuestos_cliente) {
        try {
            const parsed = JSON.parse(data.repuestos_cliente);
            otRepuestosCliente = Array.isArray(parsed) ? parsed : [];
        } catch(e) {
            otRepuestosCliente = data.repuestos_cliente.trim() ? [{ descripcion: data.repuestos_cliente.trim(), cantidad: 1, marca: '', modelo: '', notas: '' }] : [];
        }
    } else { otRepuestosCliente = []; }
    renderRepuestosTallerList();
    renderServiciosList();
    renderRepuestosClienteList();

    setText('otRecepFolio', data.recepcion_folio || data.folio_ot || '—');
    setText('otRecepFecha', data.recepcion_fecha || '—');
    setText('otRecepMotivo', data.eval_motivo_visita || data.descripcion_problema || '—');
    setText('otRecepEstado', data.eval_estado_general || '—');

    renderRecepcionTab(data);

    setText('otInicioTrabajo', data.fecha_inicio_trabajo || '—');
    const tecnicoName = [data.tecnico_nombre, data.tecnico_apellido].filter(Boolean).join(' ') || '—';
    setText('otTecnicoAsignado', tecnicoName);
    if (data.fecha_inicio_trabajo) {
        const inicio = new Date(data.fecha_inicio_trabajo);
        const now = new Date();
        const diffMs = now - inicio;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        setText('otTiempoTranscurrido', hours > 0 ? `${hours}h ${mins}min` : `${mins} min`);
    } else { setText('otTiempoTranscurrido', '—'); }

    const showEjecucion = ['abierta', 'proceso', 'diagnostico'].includes(data.estado);
    setDisplay('btnIrEjecucion', showEjecucion ? 'inline-flex' : 'none');

    const puedeCrearPpto = ['proceso', 'diagnostico'].includes(data.estado) && !data.presupuesto_id_ref;
    const puedeVerPpto = !!data.presupuesto_id_ref;
    const puedeIrPpto = data.estado === 'finalizado' && !data.presupuesto_id_ref;
    setDisplay('btnCrearPresupuesto', puedeCrearPpto ? 'inline-flex' : 'none');
    setDisplay('btnIrPresupuesto', puedeIrPpto ? 'inline-flex' : 'none');
    setDisplay('btnVerPresupuesto', puedeVerPpto ? 'inline-flex' : 'none');
}

function renderStatusBadge(estado) {
    const badge = el('otStatusBadge');
    if (!badge) return;
    badge.textContent = getStatusLabel(estado);
    badge.className = `ot-estado estado-${estado}`;
}

async function asignarTecnico() {
    const empId = el('otAsignadoSelect').value;
    try {
        const fd = new FormData();
        fd.append('action', 'asignar');
        fd.append('id', selectedId);
        fd.append('asignado_empleado_id', empId);
        const d = await apiFetch(API, fd);
        if (d.status === 'success') showSuccess('Técnico asignado');
        else showError(d.message);
    } catch (e) { showError('Error: ' + e.message); }
}

function abrirEjecucion() {
    if (!selectedId) return;
    window.open('ejecucion_ot.html?ot_id=' + selectedId, '_blank');
}

async function guardarDatosOT() {
    if (!selectedId) return;
    try {
        const body = new FormData();
        body.append('action', 'update_datos');
        body.append('id', selectedId);
        body.append('fecha', el('otFecha').value);
        body.append('descripcion_problema', el('otDescripcionProblema').value.trim());
        body.append('procedimiento_tecnico', el('otProcedimientoTecnico').value.trim());
        body.append('notas_adicionales', el('otNotasAdicionales').value.trim());
        body.append('asignado_empleado_id', el('otEmpleadoSelect').value);
        body.append('repuestos_cliente', JSON.stringify(otRepuestosCliente));
        body.append('comentarios_empleado', el('otComentariosEmpleado').value.trim());

        const allItems = [...otRepuestosTaller, ...otServicios];
        body.append('items_json', JSON.stringify(allItems));

        const d = await apiFetch(API, body);
        if (d.status === 'success') {
            showSuccess('Datos guardados');
            await cargarDetalle(selectedId);
        } else showError(d.message);
    } catch (e) { showError('Error: ' + e.message); }
}

let _articulosCache = [];
async function cargarListaArticulos() {
    const container = el('articulosLista');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.85rem;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    try {
        const r = await fetch(`${API_ARTICULOS}?per_page=200&t=${Date.now()}`);
        const d = await r.json();
        _articulosCache = (d.status === 'success' && d.data?.items) ? d.data.items : [];
    } catch (e) { _articulosCache = []; }
    renderArticulosLista('');
}

function renderArticulosLista(filter) {
    const container = el('articulosLista');
    const q = filter.toLowerCase();
    const items = _articulosCache.filter(a => !q || a.nombre.toLowerCase().includes(q) || (a.tipo && a.tipo.toLowerCase().includes(q)));
    if (!items.length) {
        container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.85rem;">Sin artículos disponibles</div>';
        return;
    }
    container.innerHTML = items.map(a =>
        `<div class="arti-item" data-id="${a.id}" style="padding:0.5rem 0.6rem;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;transition:var(--transition);" onclick="selArticulo(this, ${a.id})">
            <span><strong>${escapeHtml(a.nombre)}</strong></span>
            <span style="color:var(--text-secondary);font-size:0.8rem;">Stock: ${a.stock || 0} · ${formatMoney(a.valor_venta || 0)}</span>
        </div>`
    ).join('');
}

function filtrarListaArticulos(e) { renderArticulosLista(e.target.value.trim()); }
function resetRepuestoModal() {
    el('buscarArticuloTaller').value = '';
    el('selectedArticuloInfo').style.display = 'none';
    el('repuestoTallerCantidad').value = 1;
    el('repuestoTallerDetalle').value = '';
    window._selectedArticuloId = null;
    window._selectedArticuloValor = 0;
}

window.selArticulo = function(elem, id) {
    document.querySelectorAll('.arti-item').forEach(e => e.classList.remove('selected'));
    elem.classList.add('selected');
    const nombre = elem.querySelector('strong')?.textContent || '';
    const stockText = elem.querySelector('span:last-child')?.textContent || '';
    window._selectedArticuloId = id;
    const articuloData = _articulosCache.find(a => a.id === id);
    window._selectedArticuloValor = articuloData ? (articuloData.valor_venta || 0) : 0;
    el('selectedArticuloNombre').textContent = nombre;
    el('selectedArticuloStock').textContent = stockText;
    el('selectedArticuloInfo').style.display = 'block';
};

window.cerrarModalRepuesto = function() { el('repuestoTallerModal').classList.remove('active'); };

function renderRepuestosTallerList() {
    const container = el('otRepuestosTallerList');
    if (!container) return;
    if (!otRepuestosTaller.length) {
        container.innerHTML = '<div style="font-size:0.82rem;color:var(--text-secondary);padding:0.5rem;">Sin repuestos asignados</div>';
        return;
    }
    container.innerHTML = otRepuestosTaller.map((item, idx) => `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:0.3rem;font-size:0.85rem;">
            <i class="fas fa-box" style="color:var(--primary)"></i>
            <span style="flex:1"><strong>${escapeHtml(item.nombre)}</strong> × ${item.cantidad || 1}</span>
            ${item.detalle ? `<span style="color:var(--text-secondary);font-size:0.78rem;">${escapeHtml(item.detalle)}</span>` : ''}
            <button class="btn btn-xs btn-outline" onclick="removeRepuestoTaller(${idx})" style="color:var(--danger)"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

window.removeRepuestoTaller = function(idx) { otRepuestosTaller.splice(idx, 1); renderRepuestosTallerList(); };

function guardarRepuestoTaller() {
    const articuloId = window._selectedArticuloId;
    const nombre = el('selectedArticuloNombre')?.textContent;
    if (!articuloId || !nombre) { showError('Seleccione un artículo del inventario'); return; }
    const cantidad = parseInt(el('repuestoTallerCantidad').value) || 1;
    const detalle = el('repuestoTallerDetalle').value.trim();
    otRepuestosTaller.push({
        tipo: 'articulo', item_id: articuloId, nombre, cantidad, detalle,
        valor_unitario: window._selectedArticuloValor || 0, seccion: 'repuesto_taller'
    });
    renderRepuestosTallerList();
    el('repuestoTallerModal').classList.remove('active');
    showSuccess('Repuesto agregado');
}

let _serviciosCache = [];
async function cargarListaServicios() {
    const container = el('serviciosLista');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.85rem;"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    try {
        const r = await fetch(`${API_SERVICIOS}?per_page=200&t=${Date.now()}`);
        const d = await r.json();
        _serviciosCache = (d.status === 'success' && d.data?.items) ? d.data.items : [];
    } catch (e) { _serviciosCache = []; }
    renderServiciosLista('');
}

function renderServiciosLista(filter) {
    const container = el('serviciosLista');
    const q = filter.toLowerCase();
    const items = _serviciosCache.filter(s => !q || s.nombre.toLowerCase().includes(q) || (s.tipo && s.tipo.toLowerCase().includes(q)));
    if (!items.length) {
        container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.85rem;">Sin servicios disponibles</div>';
        return;
    }
    container.innerHTML = items.map(s =>
        `<div class="serv-item" data-id="${s.id}" style="padding:0.5rem 0.6rem;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;transition:var(--transition);" onclick="selServicio(this, ${s.id})">
            <span><strong>${escapeHtml(s.nombre)}</strong></span>
            <span style="color:var(--text-secondary);font-size:0.8rem;">${formatMoney(s.valor_trabajo || 0)}</span>
        </div>`
    ).join('');
}

function filtrarListaServicios(e) { renderServiciosLista(e.target.value.trim()); }
function resetServicioModal() {
    el('buscarServicioTrabajo').value = '';
    el('selectedServicioInfo').style.display = 'none';
    el('servicioDetalle').value = '';
    window._selectedServicioId = null;
    window._selectedServicioValor = 0;
}

window.selServicio = function(elem, id) {
    document.querySelectorAll('.serv-item').forEach(e => e.classList.remove('selected'));
    elem.classList.add('selected');
    const nombre = elem.querySelector('strong')?.textContent || '';
    const precioText = elem.querySelector('span:last-child')?.textContent || '';
    window._selectedServicioId = id;
    const servicioData = _serviciosCache.find(s => s.id === id);
    window._selectedServicioValor = servicioData ? (servicioData.valor_trabajo || 0) : 0;
    el('selectedServicioNombre').textContent = nombre;
    el('selectedServicioPrecio').textContent = 'Valor: ' + precioText;
    el('selectedServicioInfo').style.display = 'block';
};

window.cerrarModalServicio = function() { el('servicioModal').classList.remove('active'); };

function renderServiciosList() {
    const container = el('otServiciosList');
    if (!container) return;
    if (!otServicios.length) {
        container.innerHTML = '<div style="font-size:0.82rem;color:var(--text-secondary);padding:0.5rem;">Sin servicios asignados</div>';
        return;
    }
    container.innerHTML = otServicios.map((item, idx) => `
        <div style="display:flex;flex-direction:column;padding:0.4rem;border:1px solid ${item.es_imprevisto ? 'var(--warning)' : 'var(--border-color)'};border-radius:var(--radius-sm);margin-bottom:0.3rem;${item.es_imprevisto ? 'background:rgba(245,158,11,0.05);' : ''}">
            <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;">
                <i class="fas fa-cogs" style="color:var(--accent)"></i>
                <span style="flex:1"><strong>${escapeHtml(item.nombre)}</strong>${item.es_imprevisto ? ' <span style="font-size:0.65rem;background:var(--warning);color:#fff;padding:1px 5px;border-radius:4px;font-weight:700;">IMPREVISTO $0</span>' : ''}</span>
                <span style="color:var(--text-secondary);font-size:0.78rem;">${formatMoney(item.valor_unitario || 0)}</span>
                ${item.detalle ? `<span style="color:var(--text-secondary);font-size:0.78rem;">${escapeHtml(item.detalle)}</span>` : ''}
                <button class="btn btn-xs btn-outline" onclick="removeServicio(${idx})" style="color:var(--danger)"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `).join('');
}

window.removeServicio = function(idx) { otServicios.splice(idx, 1); renderServiciosList(); };

function guardarServicio() {
    const servicioId = window._selectedServicioId;
    const nombre = el('selectedServicioNombre')?.textContent;
    if (!servicioId || !nombre) { showError('Seleccione un servicio del catálogo'); return; }
    const detalle = el('servicioDetalle').value.trim();
    const esImprevisto = currentOtData && !['abierta'].includes(currentOtData.estado);
    const valorUnitario = esImprevisto ? 0 : (window._selectedServicioValor || 0);
    otServicios.push({
        tipo: 'servicio', item_id: servicioId, nombre, cantidad: 1, detalle,
        valor_unitario: valorUnitario, seccion: 'servicio', es_imprevisto: esImprevisto ? 1 : 0
    });
    if (esImprevisto) showToast('Servicio imprevisto agregado con valor $0 — el administrador asignará el precio en el presupuesto.', 'warning');
    renderServiciosList();
    el('servicioModal').classList.remove('active');
    showSuccess('Servicio agregado');
}

function renderRepuestosClienteList() {
    const container = el('otRepuestosClienteList');
    if (!container) return;
    if (!otRepuestosCliente.length) {
        container.innerHTML = '<div style="font-size:0.82rem;color:var(--text-secondary);padding:0.5rem;">Sin repuestos del cliente registrados</div>';
        return;
    }
    container.innerHTML = otRepuestosCliente.map((item, idx) => `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:0.3rem;font-size:0.85rem;">
            <i class="fas fa-user-cog" style="color:var(--warning)"></i>
            <span style="flex:1"><strong>${escapeHtml(item.descripcion)}</strong> × ${item.cantidad || 1}</span>
            ${item.marca ? `<span style="color:var(--text-secondary);font-size:0.78rem;">${escapeHtml(item.marca)} ${escapeHtml(item.modelo || '')}</span>` : ''}
            <button class="btn btn-xs btn-outline" onclick="removeRepuestoCliente(${idx})" style="color:var(--danger)"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

window.removeRepuestoCliente = function(idx) { otRepuestosCliente.splice(idx, 1); renderRepuestosClienteList(); };

function agregarRepuestoCliente() {
    const desc = prompt('Descripción del repuesto del cliente:');
    if (!desc || !desc.trim()) return;
    const cant = prompt('Cantidad:', '1');
    const marca = prompt('Marca (opcional):');
    const modelo = prompt('Modelo (opcional):');
    const notas = prompt('Notas (opcional):');
    otRepuestosCliente.push({
        descripcion: desc.trim(), cantidad: parseInt(cant) || 1,
        marca: marca || '', modelo: modelo || '', notas: notas || ''
    });
    renderRepuestosClienteList();
}

async function crearPresupuesto() {
    if (!selectedId) return;
    if (!confirm('¿Crear un presupuesto desde esta OT?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'convertir_ot_a_presupuesto');
        fd.append('ot_id', selectedId);
        const d = await apiFetch(API_ROOT + 'presupuestos_api.php', fd);
        if (d.status === 'success') {
            showSuccess('Presupuesto #' + d.data.id + ' creado exitosamente');
            await cargarDetalle(selectedId);
            loadRecepcionesAbiertasList();
            loadKpis();
            window.open('presupuestos.html?selected=' + d.data.id, '_blank');
        } else showError(d.message);
    } catch (e) { showError('Error: ' + e.message); }
}

function irAPresupuesto() {
    if (!selectedId) return;
    window.open('presupuestos.html?ot_id=' + selectedId, '_blank');
}

async function eliminarOT() {
    if (!selectedId) return;
    if (!confirm('¿Eliminar esta OT permanentemente? Esta acción no se puede deshacer.')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', selectedId);
        const d = await apiFetch(API, fd);
        if (d.status === 'success') {
            showSuccess('OT eliminada');
            closeFicha();
            loadRecepcionesAbiertasList();
            loadKpis();
        } else showError(d.message);
    } catch (e) { showError('Error: ' + e.message); }
}

async function generarPdf() {
    if (!selectedId || !currentOtData) return showError('Selecciona una OT');
    try {
        showInfo('Generando PDF...');
        const url = API_ROOT + 'pdf_api.php?type=orden&id=' + selectedId;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error del servidor (' + res.status + ')');
        const html = await res.text();
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) { showError('El navegador bloqueó la ventana emergente.'); return; }
        printWindow.document.write(html);
        printWindow.document.close();
        showSuccess('PDF generado');
    } catch (err) { showError('Error al generar el PDF: ' + err.message); }
}

async function loadRecepcionesAbiertas() {
    el('recepLista').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Cargando recepciones...</div>';
    el('recepModal').classList.add('active');
    try {
        const r = await fetch(`${API}?action=recepciones_abiertas&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') { el('recepLista').innerHTML = '<div style="text-align:center;padding:1rem;color:var(--danger)">Error al cargar</div>'; return; }
        const items = Array.isArray(d.data) ? d.data : (d.data?.items || []);
        if (!items.length) {
            el('recepLista').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary)"><i class="fas fa-clipboard-check" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:0.5rem"></i>No hay recepciones abiertas sin OT</div>';
            return;
        }
        el('recepLista').innerHTML = items.map(r => `
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:0.5rem;cursor:pointer;transition:var(--transition)" class="recep-item"
                 onclick="crearOTdesdeRecepcion(${r.id}, '${escapeHtml(r.patente || '')}', '${escapeHtml((r.marca || '') + ' ' + (r.modelo || ''))}', '${escapeHtml(r.cliente_nombre || '')} ${escapeHtml(r.cliente_apellido || '')}')">
                <div style="width:44px;height:44px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;">${(r.patente || '??').slice(0,2).toUpperCase()}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(r.patente || '—')} · ${escapeHtml(r.marca || '')} ${escapeHtml(r.modelo || '')}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(r.cliente_nombre || '')} ${escapeHtml(r.cliente_apellido || '')} · ${r.fecha || '—'}</div>
                </div>
                <div style="flex-shrink:0;"><span class="badge badge-warning">Abierta</span></div>
            </div>
        `).join('');
    } catch (e) { el('recepLista').innerHTML = '<div style="text-align:center;padding:1rem;color:var(--danger)">Error de conexión</div>'; }
}

window.crearOTdesdeRecepcion = async function(recepcionId, patente, vehiculo, cliente) {
    if (!confirm(`¿Crear OT para ${patente} — ${vehiculo}?\nCliente: ${cliente}`)) return;
    try {
        const fd = new FormData();
        fd.append('action', 'crear_ot_desde_recepcion');
        fd.append('recepcion_id', recepcionId);
        const d = await apiFetch(API, fd);
        if (d.status === 'success') {
            showSuccess('OT #' + d.data.id + ' creada desde recepción');
            el('recepModal').classList.remove('active');
            openFicha(d.data.id);
            loadRecepcionesAbiertasList();
            loadKpis();
        } else showError(d.message);
    } catch (e) { showError('Error: ' + e.message); }
};

function renderOTMultimedia(archivos) {
    const container = el('otExistingMediaContainer');
    const grid = el('otExistingMediaGrid');
    if (!container || !grid) return;

    if (!archivos || !archivos.length) {
        container.style.display = 'none';
        grid.innerHTML = '';
    } else {
        container.style.display = 'block';
        grid.innerHTML = archivos.map(a => {
            const isImg = a.tipo === 'imagen' || /\.(jpe?g|png|gif|webp)$/i.test(a.nombre || '');
            const isAudio = a.tipo === 'nota_voz' || a.tipo === 'audio' || /\.(mp3|ogg|wav|m4a|webm)$/i.test(a.nombre || '');
            const url = '/' + a.ruta;
            if (isImg) {
                return `<div class="media-item" style="position:relative;display:inline-block;margin:0.25rem;">
                    <img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;" onclick="window.open('${url}','_blank')" title="${escapeHtml(a.nombre||'')}">
                    <button onclick="deleteOTMedia(${a.id})" style="position:absolute;top:2px;right:2px;background:rgba(239,68,68,0.85);border:none;border-radius:4px;color:#fff;width:18px;height:18px;cursor:pointer;font-size:0.6rem;display:flex;align-items:center;justify-content:center;"><i class="fas fa-times"></i></button>
                </div>`;
            } else if (isAudio) {
                return `<div class="media-item" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.6rem;background:rgba(37,99,235,0.08);border-radius:6px;margin:0.25rem 0;font-size:0.78rem;">
                    <i class="fas fa-microphone" style="color:var(--primary)"></i>
                    <audio controls src="${url}" style="height:24px;flex:1;"></audio>
                    <button onclick="deleteOTMedia(${a.id})" style="background:rgba(239,68,68,0.15);border:none;border-radius:4px;color:var(--danger);padding:0.2rem 0.4rem;cursor:pointer;font-size:0.7rem;"><i class="fas fa-trash"></i></button>
                </div>`;
            } else {
                return `<div class="media-item" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.6rem;background:rgba(0,0,0,0.08);border-radius:6px;margin:0.25rem 0;font-size:0.78rem;">
                    <i class="fas fa-file" style="color:var(--text-secondary)"></i>
                    <a href="${url}" target="_blank" style="flex:1;color:var(--text-primary);text-decoration:none;">${escapeHtml(a.nombre||'Archivo')}</a>
                    <button onclick="deleteOTMedia(${a.id})" style="background:rgba(239,68,68,0.15);border:none;border-radius:4px;color:var(--danger);padding:0.2rem 0.4rem;cursor:pointer;font-size:0.7rem;"><i class="fas fa-trash"></i></button>
                </div>`;
            }
        }).join('');
    }

    const toolbar = el('otMultimediaToolbar');
    let fileInput = el('otFileInput');
    if (toolbar && !toolbar.dataset.mmInit) {
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'otFileInput';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            fileInput.accept = 'image/*,audio/*,video/*,.pdf,.doc,.docx';
            document.body.appendChild(fileInput);
        }
        if (typeof setupMultimediaToolbar === 'function') setupMultimediaToolbar(toolbar, fileInput);
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length) { handleOTMediaUpload(fileInput.files); fileInput.value = ''; }
        });
    }

    const zone = el('otUploadZone');
    if (zone && !zone.dataset.initialized) {
        zone.dataset.initialized = '1';
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault(); zone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleOTMediaUpload(e.dataTransfer.files);
        });
        zone.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.multiple = true; inp.accept = 'image/*,audio/*,video/*,.pdf,.doc,.docx';
            inp.onchange = () => { if (inp.files.length) handleOTMediaUpload(inp.files); };
            inp.click();
        });
    }
}

async function handleOTMediaUpload(files) {
    if (!selectedId || !files || !files.length) return;
    const fd = new FormData();
    fd.append('action', 'update_datos');
    fd.append('id', selectedId);
    fd.append('fecha', el('otFecha')?.value || '');
    fd.append('descripcion_problema', el('otDescripcionProblema')?.value || '');
    fd.append('procedimiento_tecnico', el('otProcedimientoTecnico')?.value || '');
    fd.append('notas_adicionales', el('otNotasAdicionales')?.value || '');
    fd.append('asignado_empleado_id', el('otEmpleadoSelect')?.value || '');
    fd.append('comentarios_empleado', el('otComentariosEmpleado')?.value || '');
    for (let i = 0; i < files.length; i++) fd.append('archivos[]', files[i]);
    try {
        const d = await apiFetch(API, fd);
        if (d.status === 'success') { showSuccess('Archivo subido'); await cargarDetalle(selectedId); }
        else showError(d.message);
    } catch(e) { showError('Error subiendo archivo'); }
}

async function deleteOTMedia(archivoId) {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_multimedia');
        fd.append('archivo_id', archivoId);
        const d = await apiFetch(API, fd);
        if (d.status === 'success') { showSuccess('Eliminado'); await cargarDetalle(selectedId); }
        else showError(d.message);
    } catch(e) { showError('Error al eliminar'); }
}

function renderRecepcionTab(data) {
    const c = el('otRecepcionContent');
    if (!c) return;

    const hasRecepcion = data.recepcion_id || data.foto_frontal || data.foto_trasera;
    if (!hasRecepcion) {
        c.innerHTML = '<div class="empty-state" style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fas fa-clipboard-check" style="font-size:2rem;margin-bottom:0.5rem;display:block;"></i>Sin datos de recepción vinculados</div>';
        return;
    }

    let html = '';
    const fotos = [
        { key: 'foto_frontal', label: 'Frontal' }, { key: 'foto_trasera', label: 'Trasera' },
        { key: 'foto_lateral_izq', label: 'Lat. Izq.' }, { key: 'foto_lateral_der', label: 'Lat. Der.' },
        { key: 'foto_superior', label: 'Superior' }, { key: 'foto_motor', label: 'Motor' },
        { key: 'foto_interior', label: 'Interior' },
    ];
    const fotosDisponibles = fotos.filter(f => data[f.key]);
    if (fotosDisponibles.length) {
        html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;"><i class="fas fa-camera"></i> Fotos de Recepción</strong></div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5rem;margin-bottom:1.25rem;">';
        fotosDisponibles.forEach(f => {
            html += `<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:4/3;border:1px solid var(--border-color);">
                <img src="${escapeHtml(data[f.key])}" alt="${f.label}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="window.open(this.src,'_blank')">
                <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:0.65rem;padding:2px 6px;text-align:center;">${f.label}</span>
            </div>`;
        });
        html += '</div>';
    }

    const inspFields = [
        ['insp_pintura_frontal', 'Pintura Frontal'], ['insp_pintura_lateral_izq', 'Pintura Lat. Izq.'],
        ['insp_pintura_lateral_der', 'Pintura Lat. Der.'], ['insp_pintura_trasera', 'Pintura Trasera'],
        ['insp_pintura_techo', 'Pintura Techo'], ['insp_parabrisas_del', 'Parabrisas Del.'],
        ['insp_parabrisas_tras', 'Parabrisas Tras.'], ['insp_espejos', 'Espejos'],
        ['insp_focos_del', 'Focos Del.'], ['insp_focos_tras', 'Focos Tras.'],
        ['insp_parachoque_del', 'Parachoques Del.'], ['insp_parachoque_tras', 'Parachoques Tras.'],
        ['insp_neumaticos_del', 'Neumáticos Del.'], ['insp_neumaticos_tras', 'Neumáticos Tras.'],
        ['insp_tapiz_piloto', 'Tapiz Piloto'], ['insp_tapiz_copiloto', 'Tapiz Copiloto'],
        ['insp_tapiz_trasero', 'Tapiz Trasero'], ['insp_alfombras', 'Alfombras'],
        ['insp_tablero', 'Tablero'], ['insp_cinturones', 'Cinturones'],
        ['insp_motor_enciende', 'Motor Enciende'], ['insp_nivel_aceite', 'Nivel Aceite'],
        ['insp_nivel_refrigerante', 'Nivel Refrigerante'], ['insp_bateria', 'Batería'],
        ['insp_correas', 'Correas'], ['insp_rueda_repuesto', 'Rueda Repuesto'],
        ['insp_gata', 'Gata'], ['insp_chaleco', 'Chaleco'],
        ['insp_triangulo', 'Triángulo'], ['insp_botiquin', 'Botiquín'], ['insp_extintor', 'Extintor'],
    ];
    const inspDisponibles = inspFields.filter(([k]) => data[k] && data[k] !== 'N/A');
    if (inspDisponibles.length) {
        html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;"><i class="fas fa-search"></i> Inspección Visual</strong></div>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.4rem;margin-bottom:1.25rem;">';
        inspDisponibles.forEach(([k, label]) => {
            const val = data[k];
            const color = val === 'Bueno' ? 'var(--success)' : val === 'Regular' ? 'var(--warning)' : val === 'Malo' ? 'var(--danger)' : 'var(--text-secondary)';
            html += `<div style="display:flex;justify-content:space-between;padding:0.3rem 0.6rem;border-radius:6px;background:rgba(255,255,255,0.03);font-size:0.78rem;"><span style="color:var(--text-secondary);">${escapeHtml(label)}</span><span style="font-weight:600;color:${color};">${escapeHtml(val)}</span></div>`;
        });
        html += '</div>';
    }

    const alertas = [];
    if (Number(data.alerta_pernos_rodados)) alertas.push('Pernos de rodados');
    if (Number(data.alerta_falla_red)) alertas.push('Falla de red previa');
    if (alertas.length) {
        html += '<div style="margin-bottom:1rem;padding:0.6rem 0.8rem;border-radius:8px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);font-size:0.82rem;color:#fca5a5;">';
        html += '<i class="fas fa-exclamation-triangle" style="margin-right:0.4rem;color:var(--danger);"></i><strong>Alertas:</strong> ' + alertas.map(a => escapeHtml(a)).join(', ');
        html += '</div>';
    }

    const obs = data.insp_observaciones_generales || data.insp_ralladuras || data.insp_abollones;
    if (obs) {
        html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;"><i class="fas fa-sticky-note"></i> Observaciones</strong></div>';
        if (data.insp_ralladuras) html += `<div style="font-size:0.82rem;margin-bottom:0.3rem;"><strong>Ralladuras:</strong> ${escapeHtml(data.insp_ralladuras)}</div>`;
        if (data.insp_abollones) html += `<div style="font-size:0.82rem;margin-bottom:0.3rem;"><strong>Abollones:</strong> ${escapeHtml(data.insp_abollones)}</div>`;
        if (data.insp_observaciones_generales) html += `<div style="font-size:0.82rem;margin-bottom:0.3rem;"><strong>Generales:</strong> ${escapeHtml(data.insp_observaciones_generales)}</div>`;
    }

    if (data.eval_motivo_visita || data.eval_estado_general) {
        html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;"><i class="fas fa-clipboard-list"></i> Evaluación</strong></div>';
        if (data.eval_estado_general) html += `<div style="font-size:0.82rem;margin-bottom:0.3rem;"><strong>Estado:</strong> ${escapeHtml(data.eval_estado_general)}</div>`;
        if (data.eval_motivo_visita) html += `<div style="font-size:0.82rem;margin-bottom:0.3rem;"><strong>Motivo:</strong> ${escapeHtml(data.eval_motivo_visita)}</div>`;
    }

    if (data.eval_firma_cliente && data.eval_firma_cliente.startsWith('data:image')) {
        html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.82rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;"><i class="fas fa-signature"></i> Firma del Cliente</strong></div>';
        html += `<div style="max-width:300px;"><img src="${escapeHtml(data.eval_firma_cliente)}" alt="Firma" style="width:100%;border:1px solid var(--border-color);border-radius:8px;background:rgba(0,0,0,0.15);"></div>`;
    }

    c.innerHTML = html || '<div class="empty-state" style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fas fa-clipboard-check" style="font-size:2rem;margin-bottom:0.5rem;display:block;"></i>Sin datos de recepción vinculados</div>';
}
