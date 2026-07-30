// ============================================================================
// desarme_automotriz.js — Módulo de Desarme Automotriz (v3)
// ============================================================================

const API = API_ROOT + 'desarme_automotriz_api.php';
const API_PIEZAS = API_ROOT + 'desarme_piezas_api.php';
const API_MAESTRO = API_ROOT + 'desarme_maestro_api.php';
const API_MULTIMEDIA = API_ROOT + 'multimedia_api.php';

let currentDesarmeId = null;
let currentDesarmeData = null;
let currentPage = 1;
let allItems = [];
let desarmeParts = [];
let masterPartsCache = [];
let disabledPartsCache = [];
let selectedEstadoPieza = 'no_verificado';
let currentGrupoId = null;

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupSearch();
    setupFilters();
    setupFichaTabs();
    setupResumenActions();
    setupDescontaminacion();
    setupDesarme();
    setupPreparacion();
    setupPublicacion();
    setupModals();
    setupReactiveRefresh(loadData);

    const urlId = new URLSearchParams(window.location.search).get('id') || new URLSearchParams(window.location.search).get('selected');
    if (urlId) openFicha(parseInt(urlId));
});

// ============================================================================
// SEARCH & FILTERS
// ============================================================================
function setupSearch() {
    let timer;
    el('searchInput').addEventListener('input', function() {
        clearTimeout(timer);
        timer = setTimeout(() => loadData(1, this.value), 400);
    });
}

function setupFilters() {
    el('filterEstado').addEventListener('change', () => loadData(1));
    el('filterMotivo').addEventListener('change', () => loadData(1));
    el('btnNuevo').addEventListener('click', () => openModal('modalNuevoDesarme'));
}

// ============================================================================
// LOAD DATA (list view)
// ============================================================================
function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

    const estado = el('filterEstado').value;
    const motivo = el('filterMotivo').value;
    let url = `${API}?page=${page}&per_page=12&t=${Date.now()}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (estado) url += `&estado=${estado}`;
    if (motivo) url += `&motivo=${motivo}`;

    fetch(url).then(r => r.json()).then(res => {
        if (res.status !== 'success') { grid.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text-secondary)">Error al cargar</p>'; return; }
        allItems = res.data.items || [];
        if (!allItems.length) { grid.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text-secondary)"><i class="fas fa-inbox"></i> No hay procesos de desarme</p>'; renderPagination(0, 1, 12, 'paginationContainer', ()=>{}); return; }
        grid.innerHTML = allItems.map(item => renderCard(item)).join('');
        renderPagination(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', p => loadData(p, el('searchInput').value));
        loadStats();
    }).catch(() => { grid.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--danger)">Error de conexión</p>'; });
}

function renderCard(item) {
    const phases = ['recepcion','descontaminacion','desarme','preparacion','completado'];
    const currentIdx = phases.indexOf(item.estado);
    const progressPct = Math.round(((currentIdx + 1) / phases.length) * 100);
    const estadoColors = { recepcion:'var(--primary)', descontaminacion:'#f59e0b', desarme:'var(--danger)', preparacion:'#8b5cf6', completado:'var(--success)' };
    const estadoLabels = { recepcion:'Recepción', descontaminacion:'Descontaminación', desarme:'Desarme', preparacion:'Preparación', completado:'Completado', cancelado:'Cancelado' };
    const totalP = item.total_piezas || 0;
    const doneP = item.piezas_procesadas || 0;
    const motivoLabels = { siniestrado:'Siniestrado', baja:'Dado de baja', multa:'Multa', donacion:'Donación', otro:'Otro', dano_total:'Daño Total', robo:'Robo', abandono:'Abandono', junk:'Chatarra' };

    return `<div class="card" onclick="openFicha(${item.id})" style="cursor:pointer;border-left:4px solid ${estadoColors[item.estado] || 'var(--border-color)'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
            <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary)">${escapeHtml(item.folio || '—')}</div>
            <span style="font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:12px;font-weight:700;background:${estadoColors[item.estado]}22;color:${estadoColors[item.estado]}">${escapeHtml(estadoLabels[item.estado] || item.estado)}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-primary);margin-bottom:0.3rem">
            <i class="fas fa-car" style="color:var(--text-secondary);margin-right:0.3rem"></i>
            ${escapeHtml(item.v_marca || '')} ${escapeHtml(item.v_modelo || '')} ${item.v_anio || ''}
        </div>
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.4rem">
            <span style="font-weight:600">${escapeHtml(item.v_patente || '—')}</span> · ${escapeHtml(motivoLabels[item.motivo_desarme] || item.motivo_desarme || '')}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem">
            <div style="font-size:0.75rem;color:var(--text-secondary)">${totalP} piezas ${totalP > 0 ? `(${doneP}/${totalP})` : ''}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary)">${item.tecnico_nombre ? escapeHtml(item.tecnico_nombre + ' ' + (item.tecnico_apellido || '')) : 'Sin asignar'}</div>
        </div>
        <div style="background:rgba(0,0,0,0.1);border-radius:10px;height:6px;margin-top:0.5rem;overflow:hidden">
            <div style="background:${estadoColors[item.estado]};width:${progressPct}%;height:100%;border-radius:10px;transition:width 0.5s ease"></div>
        </div>
    </div>`;
}

function loadStats() {
    fetch(`${API}?action=stats&t=${Date.now()}`).then(r => r.json()).then(res => {
        if (res.status !== 'success') return;
        const s = res.data.por_estado || {};
        el('kpiRecepcion').textContent = s.recepcion || 0;
        el('kpiDescontaminacion').textContent = s.descontaminacion || 0;
        el('kpiDesarme').textContent = s.desarme || 0;
        el('kpiPreparacion').textContent = s.preparacion || 0;
        el('kpiCompletado').textContent = s.completado || 0;
    });
}

// ============================================================================
// FICHA TABS
// ============================================================================
function setupFichaTabs() {
    const container = el('fichaTabs');
    if (!container) return;
    container.addEventListener('click', e => {
        const tab = e.target.closest('.ficha-tab');
        if (!tab) return;
        document.querySelectorAll('#fichaTabs .ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = 'panel' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
        const panel = el(panelId);
        if (panel) panel.classList.add('active');
    });
}

// ============================================================================
// FICHA — OPEN / CLOSE
// ============================================================================
function openFicha(id) {
    currentDesarmeId = id;
    el('listView').style.display = 'none';
    el('fichaContainer').classList.add('active');
    loadFichaData(id);
}

function closeFicha() {
    el('listView').style.display = '';
    el('fichaContainer').classList.remove('active');
    currentDesarmeId = null;
    currentDesarmeData = null;
    loadData(currentPage, el('searchInput').value);
}

function loadFichaData(id) {
    fetch(`${API}?id=${id}&t=${Date.now()}`).then(r => r.json()).then(res => {
        if (res.status !== 'success') { showError('Error cargando datos'); return; }
        currentDesarmeData = res.data;
        renderResumen(res.data);
        renderChecklist(res.data.descontaminacion || []);
        loadDesarmeParts(id);
        loadPreparacionParts(id);
        loadPublicacionParts(id);
        renderHistorial(res.data.historial || []);
        renderReportes();
        loadDesarmeGallery();
        el('fichaTitle').textContent = res.data.folio || 'Desarme';
        el('fichaSub').textContent = `${res.data.v_marca || ''} ${res.data.v_modelo || ''} ${res.data.v_anio || ''} — ${res.data.v_patente || ''}`;
    });
}

// ============================================================================
// TAB: RESUMEN — con datos vehiculares visibles
// ============================================================================
function renderResumen(d) {
    el('dFolio').value = d.folio || '';
    el('dFechaInicio').value = d.creado ? new Date(d.creado).toLocaleDateString('es-CL') : '';
    el('dMotivo').value = d.motivo_desarme || '';
    el('dNotas').value = d.notas_generales || '';
    el('dPatente').value = d.v_patente || '';
    el('dMarca').value = d.v_marca || '';
    el('dModelo').value = d.v_modelo || '';
    el('dAnio').value = d.v_anio || '';
    el('dCombustible').value = d.v_combustible || '';
    el('dTransmision').value = d.v_transmision || '';
    el('dTraccion').value = d.v_traccion || '';
    el('dKilometraje').value = d.v_kilometraje ? d.v_kilometraje.toLocaleString('es-CL') + ' km' : '';
    el('dClienteNombre').value = d.cliente_nombre ? `${d.cliente_nombre} ${d.cliente_apellido || ''}` : '';
    el('dClienteTelefono').value = d.cliente_telefono || '';

    // Vehicle spec badges
    const specContainer = el('vehicleSpecs');
    if (specContainer) {
        const specs = [];
        if (d.v_transmision) specs.push(`<span class="vehicle-spec"><i class="fas fa-cogs"></i> ${escapeHtml(d.v_transmision)}</span>`);
        if (d.v_traccion) specs.push(`<span class="vehicle-spec"><i class="fas fa-car"></i> ${escapeHtml(d.v_traccion)}</span>`);
        if (d.v_combustible) specs.push(`<span class="vehicle-spec"><i class="fas fa-gas-pump"></i> ${escapeHtml(d.v_combustible)}</span>`);
        if (d.v_anio) specs.push(`<span class="vehicle-spec"><i class="fas fa-calendar"></i> ${d.v_anio}</span>`);
        if (d.v_kilometraje) specs.push(`<span class="vehicle-spec"><i class="fas fa-road"></i> ${d.v_kilometraje.toLocaleString('es-CL')} km</span>`);
        specContainer.innerHTML = specs.join('');
    }

    loadLinkedSelect('dTecnico', 'empleados').then(() => {
        if (d.tecnico_asignado) el('dTecnico').value = d.tecnico_asignado;
    });

    const phases = ['recepcion','descontaminacion','desarme','preparacion','completado'];
    const currentIdx = phases.indexOf(d.estado);
    document.querySelectorAll('#progressSteps .pstep').forEach(step => {
        const phase = step.dataset.phase;
        const idx = phases.indexOf(phase);
        step.classList.remove('done','active');
        if (idx < currentIdx) step.classList.add('done');
        else if (idx === currentIdx) step.classList.add('active');
    });

    const actions = el('resumenActions');
    actions.querySelectorAll('button').forEach(b => b.style.display = 'none');
    el('btnGuardarResumen').style.display = '';
    el('btnRetroDescontaminacion').style.display = 'none';
    el('btnRetroDesarme').style.display = 'none';
    el('btnRetroPreparacion').style.display = 'none';

    if (d.estado === 'recepcion') {
        el('btnIniciarDescontaminacion').style.display = '';
    } else if (d.estado === 'descontaminacion') {
        el('btnIniciarDesarme').style.display = '';
        el('btnRetroDescontaminacion').style.display = '';
    } else if (d.estado === 'desarme') {
        el('btnIniciarPreparacion').style.display = '';
        el('btnRetroDesarme').style.display = '';
    } else if (d.estado === 'preparacion') {
        el('btnCompletarDesarme').style.display = '';
        el('btnRetroPreparacion').style.display = '';
    }
}

function setupResumenActions() {
    el('btnVolver').addEventListener('click', closeFicha);
    el('btnGuardarResumen').addEventListener('click', () => {
        if (!currentDesarmeId) return;
        const fd = new FormData();
        fd.append('action', 'update');
        fd.append('id', currentDesarmeId);
        fd.append('tecnico_asignado', el('dTecnico').value);
        fd.append('motivo_detalle', '');
        fd.append('notas_generales', el('dNotas').value);
        apiFetch(API, fd).then(r => { if (r.status === 'success') showSuccess('Guardado'); });
    });
    el('btnIniciarDescontaminacion').addEventListener('click', () => changePhase('iniciar_descontaminacion'));
    el('btnIniciarDesarme').addEventListener('click', () => changePhase('completar_descontaminacion'));
    el('btnIniciarPreparacion').addEventListener('click', () => changePhase('completar_desarme'));
    el('btnCompletarDesarme').addEventListener('click', () => changePhase('completar_preparacion'));
}

function changePhase(action) {
    if (!currentDesarmeId) return;
    const fd = new FormData();
    fd.append('action', action);
    fd.append('id', currentDesarmeId);
    apiFetch(API, fd).then(r => {
        if (r.status === 'success') {
            showSuccess(r.message);
            loadFichaData(currentDesarmeId);
        } else {
            showError(r.message);
        }
    });
}

function retrocederFase(destino) {
    if (!currentDesarmeId) return;
    const labels = { recepcion:'Recepción', descontaminacion:'Descontaminación', desarme:'Desarme', preparacion:'Preparación', completado:'Completado' };
    if (!confirm(`¿Volver a la fase "${labels[destino]}"? Se conservarán todos los registros actuales.`)) return;
    const fd = new FormData();
    fd.append('action', 'retroceder_fase');
    fd.append('id', currentDesarmeId);
    fd.append('destino', destino);
    apiFetch(API, fd).then(r => {
        if (r.status === 'success') {
            showSuccess(r.message);
            loadFichaData(currentDesarmeId);
        } else {
            showError(r.message);
        }
    });
}

// ============================================================================
// TAB: DESCONTAMINACIÓN
// ============================================================================
function renderChecklist(items) {
    const grid = el('checklistGrid');
    if (!items.length) {
        grid.innerHTML = '<p style="color:var(--text-secondary);padding:1rem">No hay items de descontaminación. Inicie el proceso primero.</p>';
        return;
    }
    grid.innerHTML = items.map(item => `
        <div class="checklist-item" data-id="${item.id}">
            <input type="checkbox" ${item.realizado ? 'checked' : ''} onchange="toggleDescontaminacion(${item.id}, this.checked)">
            <div class="cl-info">
                <div class="cl-name">${escapeHtml(item.item)}</div>
            </div>
        </div>
    `).join('');

    el('btnCompletarDescontaminacion').style.display = (currentDesarmeData && currentDesarmeData.estado === 'descontaminacion') ? '' : 'none';
}

function toggleDescontaminacion(id, checked) {
    const fd = new FormData();
    fd.append('action', 'update_descontaminacion');
    fd.append('id', currentDesarmeId);
    fd.append('descont_id', id);
    fd.append('realizado', checked ? '1' : '0');
    apiFetch(API, fd).then(() => {
        const item = (currentDesarmeData.descontaminacion || []).find(i => i.id == id);
        if (item) item.realizado = checked ? 1 : 0;
        renderChecklist(currentDesarmeData.descontaminacion);
    });
}

function setupDescontaminacion() {
    el('btnGuardarDescontaminacion').addEventListener('click', () => showSuccess('Descontaminación guardada'));
    el('btnCompletarDescontaminacion').addEventListener('click', () => changePhase('completar_descontaminacion'));
}

// ============================================================================
// TAB: DESARME — Misiones unificadas con grupos expandibles
// ============================================================================
function loadDesarmeParts(desarmeId) {
    fetch(`${API_PIEZAS}?desarme_id=${desarmeId}&t=${Date.now()}`).then(r => r.json()).then(res => {
        desarmeParts = res.status === 'success' ? (res.data || []) : [];
        renderMissions(desarmeId);
    });
}

function renderMissions(desarmeId) {
    const container = el('missionsContainer');
    if (!currentDesarmeData) return;
    const veh = {
        combustible: currentDesarmeData.v_combustible || '',
        traccion: currentDesarmeData.v_traccion || '',
        transmision: currentDesarmeData.v_transmision || '',
        marca: currentDesarmeData.v_marca || '',
        modelo: currentDesarmeData.v_modelo || ''
    };

    const fd = new FormData();
    fd.append('action', 'filter_for_vehicle');
    fd.append('combustible', veh.combustible);
    fd.append('traccion', veh.traccion);
    fd.append('transmision', veh.transmision);
    fd.append('marca', veh.marca);
    fd.append('modelo', veh.modelo);
    apiFetch(API_MAESTRO, fd).then(r => {
        if (r.status !== 'success') { container.innerHTML = '<p style="color:var(--text-secondary)">Error cargando misiones</p>'; return; }
        masterPartsCache = r.data || [];

        const extractedCodes = desarmeParts.filter(p => p.code_pieza).map(p => p.code_pieza);

        // Cargar grupos + deshabilitadas en paralelo
        Promise.all([
            fetch(`${API_PIEZAS}?desarme_id=${desarmeId}&t=${Date.now()}`).then(r => r.json()),
            fetch(`${API_PIEZAS}?action=listar_deshabilitadas&desarme_id=${desarmeId}&t=${Date.now()}`).then(r => r.json())
        ]).then(([resItems, resDisabled]) => {
            const allItems = resItems.status === 'success' ? (resItems.data || []) : [];
            const grupos = allItems.filter(p => p.es_grupo == 1);
            disabledPartsCache = resDisabled.status === 'success' ? (resDisabled.data || []) : [];
            const disabledIds = new Set(disabledPartsCache.map(d => d.maestro_pieza_id));

            // Cargar hijos de cada grupo
            const fetches = grupos.map(g =>
                fetch(`${API_PIEZAS}?action=listar_hijos_grupo&padre_id=${g.id}&t=${Date.now()}`)
                    .then(r => r.json())
                    .then(res => { g._hijos = res.status === 'success' ? (res.data || []) : []; })
            );

            Promise.all(fetches).then(() => {
                // Piezas que están en algún grupo
                const piezasEnGrupo = new Set();
                grupos.forEach(g => (g._hijos || []).forEach(h => piezasEnGrupo.add(h.id)));

                const grouped = {};
                masterPartsCache.forEach(p => {
                    if (!grouped[p.categoria]) grouped[p.categoria] = { pending: [], extracted: [], grupos: [], disabled: [] };
                    if (disabledIds.has(p.id)) {
                        grouped[p.categoria].disabled.push(p);
                    } else if (extractedCodes.includes(p.code)) {
                        grouped[p.categoria].extracted.push(p);
                    } else {
                        grouped[p.categoria].pending.push(p);
                    }
                });

                grupos.forEach(g => {
                    const cat = g.categoria || 'Otros';
                    if (!grouped[cat]) grouped[cat] = { pending: [], extracted: [], grupos: [], disabled: [] };
                    grouped[cat].grupos.push(g);
                });

                if (!Object.keys(grouped).length) {
                    container.innerHTML = '<p style="color:var(--text-secondary);padding:0.5rem">No se encontraron piezas compatibles con este vehículo</p>';
                    return;
                }

                container.innerHTML = Object.entries(grouped).map(([cat, data], idx) => {
                    const totalActive = data.pending.length + data.extracted.length;
                    const extractedCount = data.extracted.length;
                    const disabledCount = data.disabled.length;
                    return `
                    <div class="mission-group">
                        <div class="mission-group-header" onclick="toggleMissionGroup(this)">
                            <span><i class="fas fa-folder" style="margin-right:0.4rem;color:var(--primary)"></i> ${escapeHtml(cat)}</span>
                            <span class="mg-count">${extractedCount}/${totalActive} extraídas${data.grupos.length ? ' · ' + data.grupos.length + ' grupo(s)' : ''}${disabledCount ? ' · ' + disabledCount + ' deshab.' : ''}</span>
                        </div>
                        <div class="mission-group-body" ${idx > 0 ? 'style="display:none"' : ''}>
                            <div class="mission-group-actions">
                                <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();openGrupoPiezas('${escapeHtml(cat).replace(/'/g,"\\'")}')" title="Agrupar piezas"><i class="fas fa-layer-group"></i> Grupo</button>
                            </div>
                            ${data.grupos.map(g => renderGrupoExpandible(g)).join('')}
                            ${data.pending.map(p => `
                                <div class="mission-part pendiente" onclick="quickRegisterPart(${p.id}, '${escapeHtml(p.code)}', '${escapeHtml(p.nombre).replace(/'/g,"\\'")}', '${escapeHtml(p.categoria).replace(/'/g,"\\'")}', '${escapeHtml(p.subsistema).replace(/'/g,"\\'")}')" style="cursor:pointer" title="Clic para registrar esta pieza">
                                    <span class="mp-name"><span style="color:var(--primary);font-weight:700;margin-right:0.3rem">${escapeHtml(p.code)}</span> ${escapeHtml(p.nombre)}</span>
                                    <span class="mp-status pendiente"><i class="fas fa-plus-circle"></i> Registrar</span>
                                </div>
                            `).join('')}
                            ${data.extracted.map(p => {
                                const partData = desarmeParts.find(ep => ep.code_pieza === p.code);
                                return `<div class="mission-part extraida" style="cursor:pointer" onclick="editPart(${partData ? partData.id : 0})" title="Clic para editar">
                                    <span class="mp-name"><span style="color:var(--primary);font-weight:700;margin-right:0.3rem">${escapeHtml(p.code)}</span> ${escapeHtml(p.nombre)}</span>
                                    <span class="mp-status extraida"><i class="fas fa-check"></i> Extraída</span>
                                </div>`;
                            }).join('')}
                            ${data.disabled.map(p => `
                                <div class="mission-part deshabilitada" style="opacity:0.5;border-style:dashed" title="Deshabilitada para este vehículo">
                                    <span class="mp-name" style="text-decoration:line-through"><span style="color:var(--text-secondary);font-weight:700;margin-right:0.3rem">${escapeHtml(p.code)}</span> ${escapeHtml(p.nombre)}</span>
                                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();habilitarPieza(${p.id})" style="font-size:0.7rem;padding:0.2rem 0.5rem"><i class="fas fa-undo"></i> Rehabilitar</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
                }).join('');
            });
        });
    });
}

function renderGrupoExpandible(g) {
    const hijos = g._hijos || [];
    const nombre = g.nombre_grupo || g.nombre_pieza;
    const id = g.id;
    return `
    <div class="mission-group-sub" id="grupoSub_${id}">
        <div class="mission-part grupo-expand" onclick="toggleGrupoExpand(${id})" style="cursor:pointer;border-left:3px solid #8b5cf6;background:rgba(139,92,246,0.05);margin-bottom:0">
            <span class="mp-name"><i class="fas fa-layer-group" style="color:#8b5cf6;margin-right:0.4rem"></i> <strong>${escapeHtml(nombre)}</strong> <span style="font-size:0.72rem;color:var(--text-secondary);margin-left:0.3rem">(${hijos.length} piezas)</span></span>
            <span style="color:var(--text-secondary);font-size:0.75rem;flex-shrink:0"><i class="fas fa-chevron-down grupo-arrow" id="grupoArrow_${id}"></i></span>
        </div>
        <div class="grupo-hijos" id="grupoHijos_${id}" style="display:none;padding:0.4rem 0 0.4rem 1.5rem">
            ${hijos.map(h => `
                <div class="mission-part" style="cursor:pointer;padding:0.5rem 0.6rem;margin-bottom:0.3rem;border-left:2px solid rgba(139,92,246,0.3)" onclick="editPart(${h.id})" title="Clic para editar">
                    <span class="mp-name" style="font-size:0.78rem"><span style="color:var(--primary);font-weight:700;margin-right:0.3rem;font-size:0.72rem">${escapeHtml(h.code_pieza || h.master_code || '')}</span> ${escapeHtml(h.nombre_pieza)}</span>
                    <span class="mp-status ${h.estado_pieza || 'no_verificado'}" style="font-size:0.68rem">${escapeHtml(h.estado_pieza || 'pendiente')}</span>
                </div>
            `).join('')}
            <div style="margin-top:0.3rem">
                <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();editarGrupo(${id})" style="font-size:0.7rem;padding:0.2rem 0.5rem"><i class="fas fa-edit"></i> Editar grupo</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();eliminarGrupoInline(${id})" style="font-size:0.7rem;padding:0.2rem 0.5rem"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    </div>`;
}

function toggleGrupoExpand(id) {
    const hijos = el('grupoHijos_' + id);
    const arrow = el('grupoArrow_' + id);
    if (!hijos) return;
    const isOpen = hijos.style.display !== 'none';
    hijos.style.display = isOpen ? 'none' : '';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function toggleMissionGroup(header) {
    const body = header.nextElementSibling;
    const allBodies = document.querySelectorAll('.mission-group-body');
    const isOpen = body.style.display !== 'none';
    allBodies.forEach(b => b.style.display = 'none');
    if (!isOpen) body.style.display = '';
}

// ============================================================================
// DESHABILITAR / HABILITAR piezas
// ============================================================================
function deshabilitarPieza(maestroPiezaId, nombre) {
    if (!currentDesarmeId) return;
    const motivo = prompt(`Motivo para deshabilitar "${nombre}":`, 'No aplica para este modelo');
    if (motivo === null) return;
    const fd = new FormData();
    fd.append('action', 'deshabilitar_pieza');
    fd.append('desarme_id', currentDesarmeId);
    fd.append('maestro_pieza_id', maestroPiezaId);
    fd.append('motivo', motivo);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') { showSuccess('Pieza deshabilitada'); loadDesarmeParts(currentDesarmeId); }
    });
}

function habilitarPieza(maestroPiezaId) {
    if (!currentDesarmeId) return;
    const fd = new FormData();
    fd.append('action', 'habilitar_pieza');
    fd.append('desarme_id', currentDesarmeId);
    fd.append('maestro_pieza_id', maestroPiezaId);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') { showSuccess('Pieza habilitada'); loadDesarmeParts(currentDesarmeId); }
    });
}

// ============================================================================
// GRUPOS — Crear / Editar / Eliminar inline
// ============================================================================
let grupoPiezasCache = [];

function openGrupoPiezas(categoria) {
    if (!currentDesarmeId) return;
    const pending = masterPartsCache.filter(p => p.categoria === categoria && !desarmeParts.some(ep => ep.code_pieza === p.code) && !disabledPartsCache.some(d => d.maestro_pieza_id === p.id));
    if (!pending.length) { showError('No hay piezas pendientes en esta categoría'); return; }
    grupoPiezasCache = pending;

    el('grupoCreateForm').style.display = '';
    el('grupoViewPanel').style.display = 'none';
    el('btnGuardarGrupo').style.display = '';
    el('btnEliminarGrupo').style.display = 'none';
    el('btnGuardarGrupoEdit').style.display = 'none';
    el('grupoModalTitle').innerHTML = '<i class="fas fa-layer-group"></i> Registrar Grupo de Piezas';

    el('grupoNombre').value = 'Grupo ' + categoria;
    el('grupoCategoria').value = categoria;
    const list = el('grupoPiezasChecklist');
    list.innerHTML = pending.map((p, i) => `
        <label style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.6rem;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;font-size:0.82rem;transition:background 0.15s" onmouseenter="this.style.background='rgba(37,99,235,0.06)'" onmouseleave="this.style.background=''">
            <input type="checkbox" value="${i}" class="grupo-part-check" checked style="accent-color:var(--primary);width:15px;height:15px;flex-shrink:0">
            <span style="color:var(--primary);font-weight:700;font-size:0.78rem;min-width:60px;flex-shrink:0">${escapeHtml(p.code)}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.nombre)}</span>
        </label>
    `).join('');
    openModal('modalGrupoPiezas');
}

function saveGrupoPiezas() {
    const nombre = el('grupoNombre').value.trim();
    if (!nombre) { showError('Nombre del grupo requerido'); return; }
    const checks = document.querySelectorAll('.grupo-part-check:checked');
    if (!checks.length) { showError('Seleccione al menos una pieza'); return; }
    const selected = Array.from(checks).map(ch => grupoPiezasCache[parseInt(ch.value)]);

    const fd = new FormData();
    fd.append('action', 'crear_grupo');
    fd.append('desarme_id', currentDesarmeId);
    fd.append('nombre_grupo', nombre);
    fd.append('categoria', el('grupoCategoria').value);
    selected.forEach((p, i) => {
        fd.append(`hijos[${i}][maestro_pieza_id]`, p.id);
        fd.append(`hijos[${i}][nombre]`, p.nombre);
        fd.append(`hijos[${i}][code]`, p.code);
        fd.append(`hijos[${i}][categoria]`, p.categoria);
        fd.append(`hijos[${i}][subsistema]`, p.subsistema);
        fd.append(`hijos[${i}][estado]`, 'no_verificado');
    });

    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') {
            showSuccess(`Grupo registrado: ${selected.length} piezas`);
            closeModal('modalGrupoPiezas');
            loadDesarmeParts(currentDesarmeId);
        } else {
            showError(r.message);
        }
    });
}

function editarGrupo(grupoId) {
    if (!currentDesarmeId) return;
    currentGrupoId = grupoId;
    fetch(`${API_PIEZAS}?id=${grupoId}&t=${Date.now()}`).then(r => r.json()).then(res => {
        if (res.status !== 'success') return;
        const grupo = res.data;
        fetch(`${API_PIEZAS}?action=listar_hijos_grupo&padre_id=${grupoId}&t=${Date.now()}`).then(r2 => r2.json()).then(res2 => {
            const hijos = res2.status === 'success' ? (res2.data || []) : [];
            el('grupoCreateForm').style.display = 'none';
            el('grupoViewPanel').style.display = '';
            el('btnGuardarGrupo').style.display = 'none';
            el('btnEliminarGrupo').style.display = '';
            el('btnGuardarGrupoEdit').style.display = '';
            el('grupoModalTitle').innerHTML = '<i class="fas fa-layer-group"></i> ' + escapeHtml(grupo.nombre_grupo || grupo.nombre_pieza);
            el('grupoViewNombre').value = grupo.nombre_grupo || grupo.nombre_pieza || '';
            el('grupoViewCategoria').value = grupo.categoria || '';
            el('grupoViewCount').textContent = hijos.length;
            renderGrupoHijos(hijos);
            openModal('modalGrupoPiezas');
        });
    });
}

function renderGrupoHijos(hijos) {
    const container = el('grupoViewParts');
    if (!hijos.length) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.82rem;padding:0.5rem">No hay piezas en este grupo</p>';
        return;
    }
    container.innerHTML = hijos.map(h => `
        <div class="mission-part" style="cursor:pointer;margin-bottom:0.4rem" onclick="editPartFromGrupo(${h.id})" title="Clic para editar">
            <span class="mp-name">
                <span style="color:var(--primary);font-weight:700;margin-right:0.3rem;font-size:0.78rem">${escapeHtml(h.code_pieza || h.master_code || '')}</span>
                ${escapeHtml(h.nombre_pieza)}
            </span>
            <span class="mp-status ${h.estado_pieza || 'no_verificado'}" style="font-size:0.72rem">${escapeHtml(h.estado_pieza || 'no_verificado')}</span>
        </div>
    `).join('');
}

function editPartFromGrupo(partId) {
    closeModal('modalGrupoPiezas');
    editPart(partId);
}

function guardarGrupoEdit() {
    if (!currentGrupoId) return;
    const fd = new FormData();
    fd.append('action', 'guardar_grupo');
    fd.append('id', currentGrupoId);
    fd.append('nombre_grupo', el('grupoViewNombre').value);
    fd.append('categoria', el('grupoViewCategoria').value);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') {
            showSuccess('Grupo actualizado');
            closeModal('modalGrupoPiezas');
            loadDesarmeParts(currentDesarmeId);
        } else {
            showError(r.message);
        }
    });
}

function eliminarGrupoActual() {
    if (!currentGrupoId) return;
    if (!confirm('¿Eliminar este grupo? Las piezas individuales permanecerán como extraídas.')) return;
    const fd = new FormData();
    fd.append('action', 'eliminar_grupo');
    fd.append('id', currentGrupoId);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') {
            showSuccess('Grupo eliminado');
            closeModal('modalGrupoPiezas');
            loadDesarmeParts(currentDesarmeId);
        } else {
            showError(r.message);
        }
    });
}

function eliminarGrupoInline(grupoId) {
    if (!confirm('¿Eliminar este grupo? Las piezas permanecerán como extraídas.')) return;
    const fd = new FormData();
    fd.append('action', 'eliminar_grupo');
    fd.append('id', grupoId);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') {
            showSuccess('Grupo eliminado');
            loadDesarmeParts(currentDesarmeId);
        } else {
            showError(r.message);
        }
    });
}

// ============================================================================
// PIEZAS — Registrar / Editar
// ============================================================================
function setupDesarme() {
    el('btnPiezaHuerfana').addEventListener('click', () => {
        if (!currentDesarmeId) return;
        resetPiezaForm();
        el('piezaNombre').focus();
        openModal('modalNuevaPieza');
    });
}

function quickRegisterPart(maestroId, code, nombre, categoria, subsistema) {
    if (!currentDesarmeId) return;
    resetPiezaForm();
    el('piezaMaestraId').value = maestroId;
    el('piezaNombre').value = nombre;
    el('piezaCategoria').value = categoria;
    el('piezaCodigo').value = code;
    el('piezaNombre').focus();
    el('btnEliminarPieza').style.display = 'none';
    openModal('modalNuevaPieza');
}

function editPart(id) {
    if (!id) return;
    fetch(`${API_PIEZAS}?id=${id}&t=${Date.now()}`).then(r => r.json()).then(res => {
        if (res.status !== 'success') return;
        const p = res.data;
        el('piezaMaestraId').value = p.maestro_pieza_id || '';
        el('piezaNombre').value = p.nombre_pieza || '';
        el('piezaCategoria').value = p.categoria || '';
        el('piezaCodigo').value = p.code_pieza || '';
        el('piezaEstado').value = p.estado_pieza || 'no_verificado';
        selectedEstadoPieza = p.estado_pieza || 'no_verificado';
        updateEstadoBtns();
        el('piezaNotas').value = p.notas_tecnico || '';
        el('btnGuardarPieza').dataset.editId = id;
        el('btnEliminarPieza').style.display = '';
        openModal('modalNuevaPieza');
        loadPiezaGallery(id);
    });
}

function deletePartFromModal() {
    const id = el('btnGuardarPieza').dataset.editId;
    if (!id) return;
    if (!confirm('¿Eliminar esta pieza?')) return;
    const fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', id);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') { showSuccess('Eliminada'); closeModal('modalNuevaPieza'); loadDesarmeParts(currentDesarmeId); }
    });
}

// ============================================================================
// PIEZAS — Galería de fotos
// ============================================================================
function loadPiezaGallery(itemId) {
    const gallery = el('piezaGallery');
    gallery.innerHTML = '<p style="color:var(--text-secondary);font-size:0.78rem;grid-column:1/-1"><i class="fas fa-spinner fa-spin"></i> Cargando fotos...</p>';
    fetch(`${API_PIEZAS}?action=listar_fotos&item_id=${itemId}&t=${Date.now()}`).then(r => r.json()).then(res => {
        if (res.status !== 'success' || !res.data || !res.data.length) {
            gallery.innerHTML = '<p style="color:var(--text-secondary);font-size:0.78rem;grid-column:1/-1">Sin fotos. Use el botón para agregar imágenes.</p>';
            return;
        }
        gallery.innerHTML = res.data.map(f => `
            <div style="position:relative;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;aspect-ratio:1">
                <img src="${escapeHtml(f.ruta_archivo)}" alt="${escapeHtml(f.nombre_original || '')}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:rgba(0,0,0,0.1);color:var(--text-secondary);font-size:0.75rem"><i class="fas fa-image"></i></div>
                <button onclick="deletePiezaFoto(${f.id}, ${itemId})" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(239,68,68,0.9);color:#fff;border:none;cursor:pointer;font-size:0.6rem;display:flex;align-items:center;justify-content:center" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
    }).catch(() => { gallery.innerHTML = '<p style="color:var(--text-secondary);font-size:0.78rem;grid-column:1/-1">Error al cargar fotos</p>'; });
}

function uploadPiezaFotos(files, overrideId) {
    if (!files.length) return;
    const editId = overrideId || el('btnGuardarPieza').dataset.editId;
    if (!editId) { showError('Guarde la pieza primero para subir fotos'); return; }
    const progressDiv = el('piezaUploadGalleryProgress');
    progressDiv.innerHTML = '';
    Array.from(files).forEach((file, idx) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:0.4rem';
        wrap.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem"><span style="font-size:0.78rem;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)}</span><span class="upload-pct" style="font-size:0.72rem;color:var(--text-secondary);min-width:35px;text-align:right">0%</span></div><div style="background:rgba(0,0,0,0.15);border-radius:6px;height:6px;overflow:hidden"><div class="upload-bar" style="background:var(--primary);width:0%;height:100%;border-radius:6px;transition:width 0.3s ease"></div></div>`;
        progressDiv.appendChild(wrap);
        const fd = new FormData();
        fd.append('action', 'subir');
        fd.append('entidad_tipo', 'desarme_pieza');
        fd.append('entidad_id', editId);
        fd.append('archivos[]', file);
        fd.append('campo_keys[]', 'pieza_foto');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_MULTIMEDIA);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const pct = Math.round((e.loaded / e.total) * 100); wrap.querySelector('.upload-pct').textContent = pct + '%'; wrap.querySelector('.upload-bar').style.width = pct + '%'; } };
        xhr.onload = () => { wrap.querySelector('.upload-pct').textContent = '✓'; wrap.querySelector('.upload-bar').style.background = 'var(--success)'; wrap.querySelector('.upload-bar').style.width = '100%'; if (idx === files.length - 1) setTimeout(() => { progressDiv.innerHTML = ''; loadPiezaGallery(editId); }, 800); };
        xhr.onerror = () => { wrap.querySelector('.upload-pct').textContent = '✗'; wrap.querySelector('.upload-bar').style.background = 'var(--danger)'; };
        xhr.send(fd);
    });
}

function deletePiezaFoto(fotoId, itemId) {
    if (!confirm('¿Eliminar esta foto?')) return;
    const fd = new FormData();
    fd.append('action', 'eliminar');
    fd.append('id', fotoId);
    apiFetch(API_MULTIMEDIA, fd).then(r => { if (r.status === 'success') loadPiezaGallery(itemId); });
}

// ============================================================================
// PIEZAS — Guardar con upload integrado
// ============================================================================
function resetPiezaForm() {
    el('piezaMaestraId').value = '';
    el('piezaNombre').value = '';
    el('piezaCategoria').value = '';
    el('piezaCodigo').value = '';
    el('piezaCosto').value = '';
    el('piezaEstado').value = 'no_verificado';
    selectedEstadoPieza = 'no_verificado';
    updateEstadoBtns();
    el('piezaNotas').value = '';
    el('btnGuardarPieza').dataset.editId = '';
    el('btnEliminarPieza').style.display = 'none';
    el('piezaUploadProgress').style.display = 'none';
    el('piezaProgressBar').style.width = '0%';
    el('piezaProgressText').textContent = '';
    el('piezaGallery').innerHTML = '';
    el('piezaUploadGalleryProgress').innerHTML = '';
    setButtonLoading(el('btnGuardarPieza'), false);
}

function updateEstadoBtns() {
    document.querySelectorAll('#piezaEstadoBtns button').forEach(b => {
        b.classList.toggle('selected', b.dataset.estado === selectedEstadoPieza);
    });
}

function savePieza() {
    const nombre = el('piezaNombre').value.trim();
    if (!nombre) { showError('Nombre de pieza requerido'); return; }
    const editId = el('btnGuardarPieza').dataset.editId;
    const isEdit = !!editId;
    const fd = new FormData();
    fd.append('action', isEdit ? 'update' : 'insert');
    if (isEdit) fd.append('id', editId);
    fd.append('desarme_id', currentDesarmeId);
    fd.append('maestro_pieza_id', el('piezaMaestraId').value);
    fd.append('nombre_pieza', nombre);
    fd.append('code_pieza', el('piezaCodigo').value);
    fd.append('categoria', el('piezaCategoria').value);
    fd.append('estado_pieza', selectedEstadoPieza.toLowerCase().replace(/ /g, '_'));
    fd.append('notas_tecnico', el('piezaNotas').value);
    const btn = el('btnGuardarPieza');
    setButtonLoading(btn, true, 'Guardando...');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_PIEZAS, true);
    xhr.withCredentials = true;
    xhr.onload = () => {
        setButtonLoading(btn, false);
        let r; try { r = JSON.parse(xhr.responseText); } catch(e) { r = { status: 'error', message: 'Respuesta inválida' }; }
        if (r.status === 'success') {
            const newId = r.data?.id || editId;
            if (!isEdit && newId) { el('btnGuardarPieza').dataset.editId = newId; el('btnEliminarPieza').style.display = ''; }
            showSuccess(isEdit ? 'Pieza actualizada' : 'Pieza registrada');
            loadDesarmeParts(currentDesarmeId);
            const fileInput = el('piezaUploadFotos');
            if (fileInput && fileInput.files.length) { uploadPiezaFotos(fileInput.files, newId || editId); fileInput.value = ''; }
            else if (newId) loadPiezaGallery(newId);
        } else { showError(r.message); }
    };
    xhr.onerror = () => { setButtonLoading(btn, false); showError('Error de conexión'); };
    xhr.send(fd);
}

// ============================================================================
// TAB: PREPARACIÓN
// ============================================================================
function loadPreparacionParts(desarmeId) {
    fetch(`${API_PIEZAS}?desarme_id=${desarmeId}&fase=extraida&t=${Date.now()}`).then(r => r.json()).then(res => {
        const list = el('prepPartsList');
        const parts = res.status === 'success' ? (res.data || []) : [];
        if (!parts.length) { list.innerHTML = '<p style="color:var(--text-secondary);padding:0.5rem;font-size:0.85rem">No hay piezas pendientes de preparación</p>'; return; }
        list.innerHTML = parts.map(p => `<div class="part-card"><div class="pc-header"><div class="pc-name">${escapeHtml(p.nombre_pieza)}</div><span class="pc-badge no_verificado">${escapeHtml(p.estado_pieza || 'Pendiente')}</span></div><div class="pc-meta">${escapeHtml(p.code_pieza || '')} · ${escapeHtml(p.categoria || '')}</div><div class="pc-actions"><button class="btn btn-sm btn-primary" onclick="openInspeccion(${p.id}, '${escapeHtml(p.nombre_pieza).replace(/'/g,"\\'")}')"><i class="fas fa-broom"></i> Inspeccionar</button></div></div>`).join('');
    });
}

function openInspeccion(itemId, nombre) {
    el('inspPiezaId').value = itemId;
    el('inspPiezaNombre').textContent = nombre;
    el('inspVisual').value = '';
    el('inspFuncionamiento').value = '';
    el('inspLimpieza').value = '';
    el('inspResultado').value = '';
    el('inspSpecs').value = '';
    el('inspPrecio').value = '';
    el('inspPrecioMin').value = '';
    el('inspNotas').value = '';
    el('inspValorInfo').textContent = '';
    el('inspValorInfo').style.display = 'none';
    openModal('modalInspeccion');
    const part = desarmeParts.find(p => p.id == itemId);
    if (part && part.categoria) {
        fetch(`${API_MAESTRO}?action=valorizacion_calcular&categoria=${encodeURIComponent(part.categoria)}&condicion=bueno&t=${Date.now()}`).then(r => r.json()).then(res => {
            if (res.status === 'success' && res.data.configurado) {
                el('inspValorInfo').textContent = `Valor base: $${Number(res.data.precio_base).toLocaleString('es-CL')} × factor ${res.data.factor} = $${Number(res.data.valor_estimado).toLocaleString('es-CL')}`;
                el('inspValorInfo').style.display = 'block';
                el('inspPrecio').value = res.data.valor_estimado;
            }
        });
    }
}

function setupPreparacion() {
    el('btnGuardarInspeccion').addEventListener('click', () => {
        const fd = new FormData();
        fd.append('action', 'update_preparacion');
        fd.append('desarme_item_id', el('inspPiezaId').value);
        fd.append('inspeccion_visual', el('inspVisual').value ? '1' : '0');
        fd.append('prueba_funcionamiento', el('inspFuncionamiento').value ? '1' : '0');
        fd.append('limpieza_realizada', el('inspLimpieza').value ? '1' : '0');
        fd.append('resultado_inspeccion', el('inspResultado').value || 'aprobado');
        fd.append('especificaciones_tecnicas', el('inspSpecs').value);
        fd.append('precio_estimado', el('inspPrecio').value || '0');
        fd.append('precio_venta', el('inspPrecioMin').value || el('inspPrecio').value || '0');
        fd.append('notas', el('inspNotas').value);
        apiFetch(API_PIEZAS, fd).then(r => {
            if (r.status === 'success') { showSuccess('Inspección guardada'); closeModal('modalInspeccion'); loadDesarmeParts(currentDesarmeId); loadPreparacionParts(currentDesarmeId); }
        });
    });
}

// ============================================================================
// TAB: PUBLICACIÓN
// ============================================================================
function loadPublicacionParts(desarmeId) {
    fetch(`${API_PIEZAS}?desarme_id=${desarmeId}&fase=preparada&t=${Date.now()}`).then(r => r.json()).then(res => {
        const list = el('pubPartsList');
        const parts = res.status === 'success' ? (res.data || []) : [];
        if (!parts.length) { list.innerHTML = '<p style="color:var(--text-secondary);padding:0.5rem;font-size:0.85rem">No hay piezas listas para publicar</p>'; return; }
        list.innerHTML = parts.map(p => `<div class="part-card"><div class="pc-header"><div class="pc-name">${escapeHtml(p.nombre_pieza)}</div><span class="pc-badge" style="background:rgba(139,92,246,0.15);color:#8b5cf6">Preparada</span></div><div class="pc-meta">${escapeHtml(p.code_pieza || '')} · ${escapeHtml(p.categoria || '')}</div><div class="pc-actions"><button class="btn btn-sm btn-success" onclick="publishPart(${p.id})"><i class="fas fa-upload"></i> Publicar</button></div></div>`).join('');
        const kitList = el('kitPiezasList');
        if (kitList) kitList.innerHTML = parts.map(p => `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0;cursor:pointer;font-size:0.82rem"><input type="checkbox" value="${p.id}" class="kit-part-check"> ${escapeHtml(p.nombre_pieza)} <span style="color:var(--text-secondary)">(${escapeHtml(p.code_pieza || '')})</span></label>`).join('');
    });
}

function publishPart(id) {
    if (!confirm('¿Publicar esta pieza al almacén de repuestos?')) return;
    const fd = new FormData();
    fd.append('action', 'publicar');
    fd.append('id', id);
    apiFetch(API_PIEZAS, fd).then(r => {
        if (r.status === 'success') { showSuccess('Pieza publicada'); loadPublicacionParts(currentDesarmeId); loadDesarmeParts(currentDesarmeId); }
        else showError(r.message);
    });
}

function setupPublicacion() {
    el('btnPublicarTodas').addEventListener('click', () => showInfo('Seleccione las piezas individualmente para publicar'));
    el('btnCrearKit').addEventListener('click', () => { el('kitNombre').value = ''; el('kitPrecio').value = ''; loadPublicacionParts(currentDesarmeId); openModal('modalCrearKit'); });
    el('btnGuardarKit').addEventListener('click', () => {
        const nombre = el('kitNombre').value.trim();
        if (!nombre) { showError('Nombre requerido'); return; }
        const checks = document.querySelectorAll('.kit-part-check:checked');
        if (!checks.length) { showError('Seleccione al menos una pieza'); return; }
        const fd = new FormData();
        fd.append('action', 'crear_kit');
        fd.append('desarme_id', currentDesarmeId);
        fd.append('nombre', nombre);
        fd.append('precio_kit', el('kitPrecio').value || '0');
        apiFetch(API, fd).then(r => {
            if (r.status === 'success') {
                const kitId = r.data.id;
                Promise.all(Array.from(checks).map(ch => { const fdi = new FormData(); fdi.append('action', 'agregar_kit_item'); fdi.append('kit_id', kitId); fdi.append('desarme_item_id', ch.value); return apiFetch(API_PIEZAS, fdi); })).then(() => { showSuccess('Kit creado'); closeModal('modalCrearKit'); });
            }
        });
    });
}

// ============================================================================
// TAB: HISTORIAL
// ============================================================================
function renderHistorial(items) {
    const container = el('timelineContainer');
    if (!items.length) { container.innerHTML = '<p style="color:var(--text-secondary);padding:0.5rem">Sin actividad registrada</p>'; return; }
    container.innerHTML = items.map(h => `<div class="tl-item"><div class="tl-time">${h.creado ? new Date(h.creado).toLocaleString('es-CL') : ''}</div><div class="tl-action">${escapeHtml(h.accion || '').replace(/_/g, ' ')}</div><div class="tl-detail">${escapeHtml(h.detalle || '')}</div></div>`).join('');
}

function renderReportes() {
    if (!currentDesarmeData) return;
    const parts = desarmeParts || [];
    const kpis = el('reportesKpis');
    const totalParts = parts.length;
    const publicadas = parts.filter(p => p.fase === 'publicada').length;
    const preparadas = parts.filter(p => p.fase === 'preparada').length;
    const extraidas = parts.filter(p => p.fase === 'extraida').length;
    const totalEstimado = parts.reduce((s, p) => s + Number(p.precio_venta || p.precio_estimado || 0), 0);
    kpis.innerHTML = `<div class="kpi-card phase-desarme"><div class="kpi-value">${totalParts}</div><div class="kpi-label">Total Piezas</div></div><div class="kpi-card phase-completado"><div class="kpi-value">${publicadas}</div><div class="kpi-label">Publicadas</div></div><div class="kpi-card phase-preparacion"><div class="kpi-value">${preparadas}</div><div class="kpi-label">Preparadas</div></div><div class="kpi-card phase-recepcion"><div class="kpi-value">${extraidas}</div><div class="kpi-label">Extraídas</div></div><div class="kpi-card phase-descontaminacion"><div class="kpi-value">$${totalEstimado.toLocaleString('es-CL')}</div><div class="kpi-label">Valor Estimado</div></div>`;
    const cats = {};
    parts.forEach(p => { const c = p.categoria || 'Sin categoría'; cats[c] = (cats[c] || 0) + 1; });
    const catColors = ['var(--primary)', 'var(--danger)', 'var(--warning)', 'var(--success)', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    el('chartCategorias').innerHTML = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([cat, count], i) => { const pct = totalParts ? Math.round((count / totalParts) * 100) : 0; return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem"><div style="width:12px;height:12px;border-radius:3px;background:${catColors[i % catColors.length]}"></div><div style="flex:1;font-size:0.82rem;color:var(--text-primary)">${escapeHtml(cat)}</div><div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary)">${count} (${pct}%)</div></div>`; }).join('') || '<p style="color:var(--text-secondary);font-size:0.82rem">Sin datos</p>';
    const ests = {};
    parts.forEach(p => { const e = p.estado_pieza || 'no_verificado'; ests[e] = (ests[e] || 0) + 1; });
    const estLabels = { bueno: 'Bueno', malo: 'Malo', no_verificado: 'No Verificado', para_reparacion: 'Para Reparación' };
    el('chartEstados').innerHTML = Object.entries(ests).map(([est, count]) => { const pct = totalParts ? Math.round((count / totalParts) * 100) : 0; return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem"><div style="flex:1;font-size:0.82rem;color:var(--text-primary)">${escapeHtml(estLabels[est] || est)}</div><div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary)">${count} (${pct}%)</div></div>`; }).join('') || '<p style="color:var(--text-secondary);font-size:0.82rem">Sin datos</p>';
    const pubParts = parts.filter(p => p.fase === 'publicada' || p.estado_publicacion === 'publicada');
    const pubTotal = pubParts.reduce((s, p) => s + Number(p.precio_venta || 0), 0);
    el('reporteFinanciero').innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-top:0.5rem"><div><span style="color:var(--text-secondary)">Piezas publicadas:</span> <strong>${pubParts.length}</strong></div><div><span style="color:var(--text-secondary)">Ingresos potenciales:</span> <strong>$${pubTotal.toLocaleString('es-CL')}</strong></div><div><span style="color:var(--text-secondary)">Tasa publicación:</span> <strong>${totalParts ? Math.round((pubParts.length / totalParts) * 100) : 0}%</strong></div></div>`;
}

// ============================================================================
// MODALS — Setup
// ============================================================================
function setupModals() {
    el('btnHeaderSearch').addEventListener('click', () => el('searchInput').focus());
    let searchTimer;
    el('buscarVehiculoDesarme').addEventListener('input', function() {
        clearTimeout(searchTimer);
        const q = this.value.trim();
        if (q.length < 2) { el('resultadosVehiculoDesarme').style.display = 'none'; return; }
        searchTimer = setTimeout(() => {
            fetch(`${API_ROOT}recepcion_unificada_api.php?search=${encodeURIComponent(q)}&per_page=8&t=${Date.now()}`).then(r => r.json()).then(res => {
                const results = el('resultadosVehiculoDesarme');
                if (res.status !== 'success' || !res.data.items.length) { results.style.display = 'none'; return; }
                results.innerHTML = res.data.items.map(r => `<div onclick="selectVehiculoDesarme(${r.vehiculo_id || r.id}, '${escapeHtml((r.vehiculo_patente || r.patente || '').replace(/'/g,"\\'"))}', '${escapeHtml((r.vehiculo_marca || r.marca || '').replace(/'/g,"\\'"))}', '${escapeHtml((r.vehiculo_modelo || r.modelo || '').replace(/'/g,"\\'"))}', ${r.vehiculo_anio || r.anio || 0}, ${r.cliente_id || 0}, '${escapeHtml((r.cliente_nombre || '').replace(/'/g,"\\'"))}')"><strong>${escapeHtml(r.vehiculo_patente || r.patente || '—')}</strong> — ${escapeHtml(r.vehiculo_marca || r.marca || '')} ${escapeHtml(r.vehiculo_modelo || r.modelo || '')} (${r.vehiculo_anio || r.anio || ''})<div style="font-size:0.75rem;color:var(--text-secondary)">${escapeHtml(r.cliente_nombre || '')} ${escapeHtml(r.cliente_apellido || '')}</div></div>`).join('');
                results.style.display = 'block';
            });
        }, 300);
    });
    el('btnCrearDesarme').addEventListener('click', () => {
        const vehId = el('nuevoVehiculoId').value;
        const motivo = el('nuevoMotivo').value;
        if (!vehId || !motivo) { showError('Seleccione vehículo y motivo'); return; }
        const fd = new FormData();
        fd.append('action', 'insert');
        fd.append('vehiculo_id', vehId);
        fd.append('motivo_desarme', motivo);
        fd.append('tecnico_asignado', el('nuevoTecnico').value);
        fd.append('motivo_detalle', el('nuevoNotas').value);
        apiFetch(API, fd).then(r => { if (r.status === 'success') { showSuccess('Desarme creado: ' + r.data.folio); closeModal('modalNuevoDesarme'); openFicha(r.data.id); } else showError(r.message); });
    });
    let partTimer;
    el('buscarPiezaMaestra').addEventListener('input', function() {
        clearTimeout(partTimer);
        const q = this.value.trim();
        if (q.length < 2) { el('resultadosPiezaMaestra').style.display = 'none'; return; }
        partTimer = setTimeout(() => {
            fetch(`${API_MAESTRO}?search=${encodeURIComponent(q)}&per_page=8&t=${Date.now()}`).then(r => r.json()).then(res => {
                const results = el('resultadosPiezaMaestra');
                if (res.status !== 'success' || !res.data.items.length) { results.style.display = 'none'; return; }
                results.innerHTML = res.data.items.map(p => `<div onclick="selectPiezaMaestra(${p.id}, '${escapeHtml(p.code.replace(/'/g,"\\'"))}', '${escapeHtml(p.nombre.replace(/'/g,"\\'"))}', '${escapeHtml(p.categoria.replace(/'/g,"\\'"))}', '${escapeHtml(p.subsistema.replace(/'/g,"\\'"))}')"><strong style="color:var(--primary)">${escapeHtml(p.code)}</strong> — ${escapeHtml(p.nombre)}<div style="font-size:0.75rem;color:var(--text-secondary)">${escapeHtml(p.categoria)} · ${escapeHtml(p.subsistema)}</div></div>`).join('');
                results.style.display = 'block';
            });
        }, 300);
    });
    document.querySelectorAll('#piezaEstadoBtns button').forEach(btn => {
        btn.addEventListener('click', function() { document.querySelectorAll('#piezaEstadoBtns button').forEach(b => b.classList.remove('selected')); this.classList.add('selected'); selectedEstadoPieza = this.dataset.estado; el('piezaEstado').value = selectedEstadoPieza; });
    });
    el('btnGuardarPieza').addEventListener('click', savePieza);
    loadLinkedSelect('nuevoTecnico', 'empleados');
}

function selectVehiculoDesarme(id, patente, marca, modelo, anio, clienteId, clienteNombre) {
    el('nuevoVehiculoId').value = id;
    el('vehSeleccionInfo').textContent = `${patente} — ${marca} ${modelo} (${anio}) — ${clienteNombre}`;
    el('vehiculoSeleccionado').style.display = '';
    el('resultadosVehiculoDesarme').style.display = 'none';
    el('buscarVehiculoDesarme').value = '';
}

function selectPiezaMaestra(id, code, nombre, categoria, subsistema) {
    el('piezaMaestraId').value = id;
    el('piezaNombre').value = nombre;
    el('piezaCategoria').value = categoria;
    el('piezaCodigo').value = code;
    el('resultadosPiezaMaestra').style.display = 'none';
    el('buscarPiezaMaestra').value = '';
}

// ============================================================================
// MULTIMEDIA — FOTOS DEL DESARME
// ============================================================================
function loadDesarmeGallery() {
    if (!currentDesarmeId) return;
    fetch(`${API_MULTIMEDIA}?action=listar&entidad_tipo=desarme_vehiculo&entidad_id=${currentDesarmeId}&t=${Date.now()}`).then(r => r.json()).then(res => {
        const gallery = el('desarmeGallery');
        if (!gallery) return;
        if (res.status !== 'success' || !res.data || !res.data.length) { gallery.innerHTML = '<p style="color:var(--text-secondary);font-size:0.82rem;grid-column:1/-1">Sin fotos.</p>'; return; }
        gallery.innerHTML = res.data.map(f => `<div style="position:relative;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;aspect-ratio:1"><img src="${escapeHtml(f.ruta_archivo)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"><button onclick="deleteDesarmeFoto(${f.id})" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(239,68,68,0.9);color:#fff;border:none;cursor:pointer;font-size:0.65rem;display:flex;align-items:center;justify-content:center" title="Eliminar"><i class="fas fa-trash"></i></button></div>`).join('');
    }).catch(() => {});
}

function uploadDesarmeFotos(files) {
    if (!files.length || !currentDesarmeId) return;
    const progressDiv = el('desarmeUploadProgress');
    if (!progressDiv) return;
    progressDiv.innerHTML = '';
    Array.from(files).forEach((file, idx) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:0.4rem';
        wrap.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem"><span style="font-size:0.78rem;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file.name)}</span><span class="upload-pct" style="font-size:0.72rem;color:var(--text-secondary);min-width:35px;text-align:right">0%</span></div><div style="background:rgba(0,0,0,0.15);border-radius:6px;height:6px;overflow:hidden"><div class="upload-bar" style="background:var(--primary);width:0%;height:100%;border-radius:6px;transition:width 0.3s ease"></div></div>`;
        progressDiv.appendChild(wrap);
        const fd = new FormData();
        fd.append('action', 'subir');
        fd.append('entidad_tipo', 'desarme_vehiculo');
        fd.append('entidad_id', currentDesarmeId);
        fd.append('archivos[]', file);
        fd.append('campo_keys[]', 'foto_desarme');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_MULTIMEDIA);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const pct = Math.round((e.loaded / e.total) * 100); wrap.querySelector('.upload-pct').textContent = pct + '%'; wrap.querySelector('.upload-bar').style.width = pct + '%'; } };
        xhr.onload = () => { wrap.querySelector('.upload-pct').textContent = '✓'; wrap.querySelector('.upload-bar').style.background = 'var(--success)'; wrap.querySelector('.upload-bar').style.width = '100%'; if (idx === files.length - 1) setTimeout(() => { progressDiv.innerHTML = ''; loadDesarmeGallery(); }, 800); };
        xhr.onerror = () => { wrap.querySelector('.upload-pct').textContent = '✗'; wrap.querySelector('.upload-bar').style.background = 'var(--danger)'; };
        xhr.send(fd);
    });
}

function deleteDesarmeFoto(id) {
    if (!confirm('¿Eliminar esta foto?')) return;
    const fd = new FormData();
    fd.append('action', 'eliminar');
    fd.append('id', id);
    apiFetch(API_MULTIMEDIA, fd).then(r => { if (r.status === 'success') loadDesarmeGallery(); });
}
