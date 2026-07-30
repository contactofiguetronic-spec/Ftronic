// ============================================================================
// ejecucion_ot.js — Dashboard Operacional Unificado (9 cuadrantes)
// ============================================================================
const API = API_ROOT + 'ejecucion_ot_api.php';
const API_OPC = API_ROOT + 'opciones_api.php';

let currentEmpleadoId = 0;
let currentOt = null;
let currentOtData = null;
let catalogArticulos = [];
let catalogInsumos = [];
let catalogServicios = [];
let catalogEmpleados = [];
let cronometroHandle = null;
let cronometroInicio = null;
let cronometroRunning = false;
let mediaRecorder = null;
let mediaChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let autoSaveInterval = null;

const COLLAPSIBLE_KEY = 'ejecucion_ot_collapsed';

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    const stored = parseInt(localStorage.getItem('empleado_id') || '0', 10);
    currentEmpleadoId = stored;
    bindEvents();
    setupCollapsibles();
    await Promise.all([loadCatalogos(), loadEmpleados(), loadListas()]);
    updateEmpleadoLabel();
    bindFilterEvents();
    setupReactiveRefresh(loadListas);

    // Nota: después de cargar el registro, nosotros llamamos setupFieldVoiceNotes (lines siguientes) manualmente.
    // No lo hacemos automáticamente en la vista de lista (son muchas OTs).
    // En la vista dashboard donde currentOt está seteado, estas llamadas se harán más abajo.
});

function updateEmpleadoLabel() {
    const lbl = el('lbl-empleado');
    if (!lbl) return;
    const emp = catalogEmpleados.find(e => e.id == currentEmpleadoId);
    if (emp) {
        lbl.textContent = emp.display_name || `#${currentEmpleadoId}`;
    } else if (currentEmpleadoId) {
        lbl.textContent = `#${currentEmpleadoId}`;
    } else {
        lbl.textContent = 'Seleccionar';
    }
}

function onEmpleadoChange() {
    const val = parseInt(el('empleado-select').value, 10);
    if (val > 0) {
        currentEmpleadoId = val;
        localStorage.setItem('empleado_id', String(currentEmpleadoId));
        updateEmpleadoLabel();
        showToast('Empleado seleccionado', 'success');
    }
}

function bindEvents() {
    el('btn-refresh').addEventListener('click', loadListas);
    el('empleado-select').addEventListener('change', onEmpleadoChange);
    el('btn-clock-in').addEventListener('click', onClockIn);
    el('btn-clock-out').addEventListener('click', onClockOut);
    el('btn-volver').addEventListener('click', () => {
        stopCronometro();
        showView('list');
        loadListas();
    });
    el('btn-agregar-servicio')?.addEventListener('click', openServicioModal);
    el('btn-confirmar-servicio')?.addEventListener('click', confirmarServicio);
    el('servicio-buscar')?.addEventListener('input', filterServicios);
    el('btn-servicio-rapido')?.addEventListener('click', openServicioRapidoModal);
    el('btn-confirmar-servicio-rapido')?.addEventListener('click', confirmarServicioRapido);
    el('btn-sr-add-paso')?.addEventListener('click', addPasoRapido);
    el('sr-paso-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPasoRapido(); } });
    el('btn-agregar-repuesto-item')?.addEventListener('click', openRepuestoItemModal);
    el('btn-confirmar-repuesto-item')?.addEventListener('click', confirmarRepuestoItem);
    el('btn-guardar-diagnostico')?.addEventListener('click', guardarDiagnostico);
    el('btn-grabar-nota')?.addEventListener('click', toggleRecording);
    el('btn-detener-grabacion')?.addEventListener('click', stopRecording);
    el('btn-enviar-grabacion')?.addEventListener('click', sendRecording);
    el('input-nota-voz')?.addEventListener('change', () => {
        el('btn-subir-nota-voz').style.display = el('input-nota-voz').files.length ? '' : 'none';
    });
    el('btn-subir-nota-voz')?.addEventListener('click', onSubirNotaVoz);
    el('notas-libres')?.addEventListener('blur', guardarNotas);
    el('notas-libres')?.addEventListener('input', () => {
        DraftManager.save('ejecucion_ot_notas', { notas: el('notas-libres').value });
    });
    el('btn-solicitar-repuesto')?.addEventListener('click', onSolicitarRepuesto);
    el('repuesto-tipo')?.addEventListener('change', onRepuestoTipoChange);
    el('repuesto-buscar')?.addEventListener('input', onRepuestoBuscarInput);
    el('btn-crear-oc')?.addEventListener('click', onCreateOC);
    el('btn-confirmar-foto-item')?.addEventListener('click', confirmarFotoItem);
    el('foto-item-input')?.addEventListener('change', previewFotoItem);
    el('btn-agregar-etapa')?.addEventListener('click', onAgregarEtapa);
    document.addEventListener('click', e => {
        const r = el('repuesto-resultados');
        if (r && !e.target.closest('.repuestos-form-row label.grow')) r.innerHTML = '';
    });
    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    // Close modals on ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
        }
    });
}

// ============================================================================
// COLLAPSIBLES
// ============================================================================
function setupCollapsibles() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const body = document.getElementById(targetId);
            if (!body) return;
            const icon = header.querySelector('i.fa-chevron-down, i.fa-chevron-up');
            const isCollapsed = body.classList.toggle('collapsed');
            if (icon) {
                icon.className = isCollapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            }
            saveCollapsedState(targetId, isCollapsed);
        });
        const targetId = header.dataset.target;
        if (targetId && loadCollapsedState(targetId)) {
            const body = document.getElementById(targetId);
            const icon = header.querySelector('i.fa-chevron-down, i.fa-chevron-up');
            if (body) body.classList.add('collapsed');
            if (icon) icon.className = 'fas fa-chevron-down';
        }
    });
}

function saveCollapsedState(id, collapsed) {
    try {
        const state = JSON.parse(localStorage.getItem(COLLAPSIBLE_KEY) || '{}');
        state[id] = collapsed;
        localStorage.setItem(COLLAPSIBLE_KEY, JSON.stringify(state));
    } catch (e) {}
}

function loadCollapsedState(id) {
    try {
        const state = JSON.parse(localStorage.getItem(COLLAPSIBLE_KEY) || '{}');
        return !!state[id];
    } catch (e) { return false; }
}

// ============================================================================
// CATÁLOGOS / LISTAS
// ============================================================================
async function loadCatalogos() {
    try {
        const [a, i, s] = await Promise.all([
            fetch(`${API_OPC}?action=linked&tabla=articulos`).then(r => r.json()),
            fetch(`${API_OPC}?action=linked&tabla=insumos`).then(r => r.json()),
            fetch(`${API_OPC}?action=linked&tabla=trabajos_servicios`).then(r => r.json()),
        ]);
        catalogArticulos = a.status === 'success' ? a.data : [];
        catalogInsumos   = i.status === 'success' ? i.data : [];
        catalogServicios = s.status === 'success' ? s.data : [];
    } catch (e) { showError('Error al cargar catálogos'); }
}

async function loadEmpleados() {
    try {
        const r = await fetch(`${API_OPC}?action=linked&tabla=empleados`).then(r => r.json());
        catalogEmpleados = r.status === 'success' ? r.data : [];
        const sel = el('empleado-select');
        sel.innerHTML = '<option value="">— Seleccionar técnico —</option>' +
            catalogEmpleados.map(e => `<option value="${e.id}" ${e.id == currentEmpleadoId ? 'selected' : ''}>${escapeHtml(e.display_name)}</option>`).join('');
    } catch (e) { /* silent */ }
}

const ESTADO_SECCIONES = [
    { key: 'proceso',      label: 'En Proceso',    icon: 'fa-spinner',         color: 'var(--primary)' },
    { key: 'diagnostico',  label: 'Diagnóstico',   icon: 'fa-stethoscope',     color: 'var(--warning)' },
    { key: 'abierta',      label: 'Abiertas',       icon: 'fa-hourglass-start', color: 'var(--accent)' },
    { key: 'finalizado',   label: 'Finalizadas',    icon: 'fa-check-circle',    color: 'var(--success)' },
];

let currentFilter = 'all';

function bindFilterEvents() {
    document.querySelectorAll('.ejec-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ejec-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderSecciones(window._lastOts || []);
        });
    });
}

async function loadListas() {
    el('ejec-sections').innerHTML = '<div class="empty">Cargando…</div>';
    try {
        const r = await fetch(`${API}?action=listar_todas&_t=${Date.now()}`).then(r => r.json());
        const ots = r.data || [];
        window._lastOts = ots;
        renderSecciones(ots);
    } catch (e) {
        el('ejec-sections').innerHTML = '<div class="empty">Error al cargar OTs</div>';
    }
}

function renderSecciones(ots) {
    const container = el('ejec-sections');
    container.innerHTML = '';

    const agrupado = {};
    ESTADO_SECCIONES.forEach(s => agrupado[s.key] = []);
    ots.forEach(ot => {
        if (agrupado[ot.estado]) agrupado[ot.estado].push(ot);
    });

    const seccionesVisibles = ESTADO_SECCIONES.filter(s => {
        if (currentFilter === 'all') return agrupado[s.key].length > 0;
        return s.key === currentFilter && agrupado[s.key].length > 0;
    });

    if (!seccionesVisibles.length) {
        container.innerHTML = '<div class="empty"><i class="fas fa-inbox"></i> Sin OTs para mostrar</div>';
        return;
    }

    const estadoLabels = { abierta: 'Abierta', proceso: 'En Proceso', en_progreso: 'En Proceso', diagnostico: 'En Diagnóstico', finalizado: 'Finalizado', cancelado: 'Cancelado' };

    seccionesVisibles.forEach(sec => {
        const otsGrupo = agrupado[sec.key];
        const section = document.createElement('div');
        section.className = 'ejec-section';
        section.innerHTML = `
            <div class="ejec-section-head collapsible-header" data-target="sec-${sec.key}">
                <span class="ejec-section-title">
                    <i class="fas ${sec.icon}" style="color:${sec.color}"></i> ${sec.label}
                    <span class="ejec-section-count">${otsGrupo.length}</span>
                </span>
                <i class="fas fa-chevron-up"></i>
            </div>
            <div class="ejec-section-body" id="sec-${sec.key}">
                <div class="ejec-cards-grid">
                    ${otsGrupo.map(ot => renderOtCard(ot, estadoLabels)).join('')}
                </div>
            </div>
        `;
        container.appendChild(section);
    });

    // Bind card click events
    container.querySelectorAll('.btn-abrir').forEach(btn => {
        btn.addEventListener('click', () => abrirOt(parseInt(btn.getAttribute('data-id'), 10)));
    });

    // Bind collapsibles
    container.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const body = document.getElementById(targetId);
            if (!body) return;
            const icon = header.querySelector('i.fa-chevron-down, i.fa-chevron-up');
            const isCollapsed = body.classList.toggle('collapsed');
            if (icon) icon.className = isCollapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        });
    });
}

function renderOtCard(ot, estadoLabels) {
    const v = ot.vehiculo_patente || ot.veh_patente || '—';
    const vm = [ot.vehiculo_marca || ot.veh_marca, ot.vehiculo_modelo || ot.veh_modelo].filter(Boolean).join(' ');
    const a = ot.vehiculo_anio || ot.veh_anio || '';
    const cli = [ot.cliente_nombre || ot.cli_nombre, ot.cliente_apellido || ot.cli_apellido].filter(Boolean).join(' ') || '—';
    const prio = ot.prioridad ? `<span class="prio prio-${ot.prioridad}">${escapeHtml(ot.prioridad)}</span>` : '';
    const emp = [ot.emp_nombre, ot.emp_apellido].filter(Boolean).join(' ') || '';
    const isOpen = ot.estado === 'abierta';
    const isActive = ot.estado === 'proceso' || ot.estado === 'diagnostico';
    const isFinal = ot.estado === 'finalizado';

    let timerHtml = '';
    if (ot.hora_inicio_procesos && !isFinal) {
        timerHtml = `<span class="ot-timer"><i class="fas fa-play"></i> ${formatHora(ot.hora_inicio_procesos)}</span>`;
    } else if (isFinal && ot.hora_fin_procesos) {
        timerHtml = `<span class="ot-timer" style="color:var(--success)"><i class="fas fa-check"></i> ${formatHora(ot.hora_fin_procesos)}</span>`;
    }

    let actionBtn = '';
    if (isOpen) {
        actionBtn = `<button class="btn btn-primary btn-sm btn-abrir" data-id="${ot.id}">Iniciar <i class="fas fa-arrow-right"></i></button>`;
    } else if (isActive) {
        actionBtn = `<button class="btn btn-accent btn-sm btn-abrir" data-id="${ot.id}">Continuar <i class="fas fa-arrow-right"></i></button>`;
    } else if (isFinal) {
        actionBtn = `<button class="btn btn-secondary btn-sm btn-abrir" data-id="${ot.id}">Ver <i class="fas fa-eye"></i></button>`;
    }

    return `
    <div class="ot-card ${isActive ? 'ot-card-active' : ''} ${isFinal ? 'ot-card-final' : ''}" data-id="${ot.id}">
        <div class="ot-card-head">
            <span class="ot-id">OT #${ot.id}</span>${prio}
            <span class="ot-estado estado-${ot.estado}">${escapeHtml(estadoLabels[ot.estado] || ot.estado)}</span>
        </div>
        <div class="ot-card-body">
            <div><i class="fas fa-car"></i> <strong>${escapeHtml(v)}</strong> · ${escapeHtml(vm)} ${a}</div>
            <div><i class="fas fa-user"></i> ${escapeHtml(cli)}</div>
            ${emp ? `<div><i class="fas fa-hard-hat"></i> ${escapeHtml(emp)}</div>` : '<div class="text-muted"><i class="fas fa-hard-hat"></i> Sin asignar</div>'}
            ${ot.descripcion_problema ? `<div class="ot-card-desc"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(ot.descripcion_problema)}</div>` : ''}
        </div>
        <div class="ot-card-foot">
            ${timerHtml}
            ${actionBtn}
        </div>
    </div>`;
}

function formatHora(s) {
    if (!s) return '—';
    try {
        return new Date(s.replace(' ', 'T')).toLocaleString('es-CL', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
        });
    } catch (e) { return s; }
}

// ============================================================================
// ABRIR OT
// ============================================================================
let _ejecOtReactiveRegistered = false;
let _abrirOtInProgress = false;

async function abrirOt(otId) {
    if (_abrirOtInProgress) return;
    _abrirOtInProgress = true;
    try {
        showView('dashboard');
        const r = await fetch(`${API}?action=cargar_ot&ot_id=${otId}&_t=${Date.now()}`).then(r => r.json());
        if (r.status !== 'success') {
            showError(r.message || 'Error al cargar OT');
            showView('list');
            return;
        }
        currentOt = r.data.ot;
        currentOtData = r.data;
        renderDashboard();
        if (autoSaveInterval) clearInterval(autoSaveInterval);
        autoSaveInterval = DraftManager.startAutoSave('ejecucion_ot_notas', el('notas-libres'), { ot_id: currentOt.id });
        // Reactive refresh: register ONCE, not per abrirOt call
        if (!_ejecOtReactiveRegistered) {
            _ejecOtReactiveRegistered = true;
            setupReactiveRefresh(() => {
                if (currentOt && el('view-dashboard').style.display !== 'none') {
                    setTimeout(() => abrirOt(currentOt.id), 0);
                }
            });
        }
    } finally {
        _abrirOtInProgress = false;
    }
}

function showView(view) {
    el('view-list').style.display = view === 'list' ? '' : 'none';
    el('view-dashboard').style.display = view === 'dashboard' ? '' : 'none';
}

// ============================================================================
// DASHBOARD PRINCIPAL
// ============================================================================
function renderDashboard() {
    const ot = currentOt;
    const d = currentOtData;
    const isClosed = ot.estado === 'finalizado';
    const isInProgress = ot.estado === 'proceso' || ot.estado === 'diagnostico';
    const isPending = ot.estado === 'abierta';
    const allDone = allItemsCompleted(d.items);

    el('ot-titulo').textContent = `OT #${ot.id}`;
    const estadoLabels = { abierta: 'Abierta', proceso: 'En Proceso', en_progreso: 'En Proceso', diagnostico: 'En Diagnóstico', finalizado: 'Finalizado', cancelado: 'Cancelado' };
    el('ot-estado-label').textContent = estadoLabels[ot.estado] || ot.estado;
    el('ot-estado-label').className = `ot-estado estado-${ot.estado}`;

    // Configurar notas de voz por campo para los 4 textareas principales
    // (después de que la entidad exista, para evitar uploads fallidos)
    if (!isPending) {
        // Cargar notas persistidas desde BD
        const camposVoice = [
            { id: 'diag-causa', label: 'Causa Raíz' },
            { id: 'diag-final', label: 'Diagnóstico Final' },
            { id: 'diag-recom', label: 'Recomendaciones' },
            { id: 'notas-libres', label: 'Notas Libres' }
        ];
        camposVoice.forEach(campo => {
            setupFieldVoiceNote({ textareaId: campo.id, label: campo.label, entidadTipo: 'ejecucion_ot' });
            loadFieldVoiceNotes(ot.id, 'ejecucion_ot', campo.id, `voice-list-${campo.id}`);
        });

        // Si había pendientes (grabadas antes de que la OT existiera), subirlas ahora
        const pendientes = Object.keys(window._pendingFieldAudios || {}).filter(k => window._pendingFieldAudios[k] && window._pendingFieldAudios[k].length > 0);
        if (pendientes.length) {
            flushPendingFieldAudios(ot.id, 'ejecucion_ot', pendientes[0]); // primera pendiente como base
        }
    }

    const setVis = (id, vis) => { const e = el(id); if (e) e.style.display = vis; };
    setVis('btn-clock-in', isPending ? '' : 'none');
    setVis('btn-clock-out', (isInProgress && allDone) ? '' : 'none');
    setVis('btn-agregar-servicio', isInProgress ? '' : 'none');
    setVis('btn-servicio-rapido', isInProgress ? '' : 'none');
    setVis('btn-agregar-repuesto-item', isInProgress ? '' : 'none');
    setVis('btn-grabar-nota', isInProgress ? '' : 'none');

    if (isInProgress) startCronometro(ot.hora_inicio);
    else if (isClosed) {
        stopCronometro();
        const ini = ot.hora_inicio ? new Date(ot.hora_inicio.replace(' ', 'T')) : null;
        const fin = ot.hora_fin ? new Date(ot.hora_fin.replace(' ', 'T')) : null;
        el('cronometro').textContent = (ini && fin) ? formatHMS(fin - ini) : '—';
    } else {
        stopCronometro();
        el('cronometro').textContent = '00:00:00';
    }

    renderC1Identidad(ot);
    renderC2Recepcion(d);
    renderC3Inspeccion(d.inspeccion);
    const allItems = d.items || [];
    // Filter items: servicios vs repuestos
    // - tipo=servicio → servicios
    // - tipo=articulo with seccion starting with 'repuesto' → repuestos (única fuente)
    const serviciosItems = allItems.filter(i => i.tipo === 'servicio');
    const repuestosItems = allItems.filter(i => i.tipo === 'articulo' && i.seccion && i.seccion.startsWith('repuesto'));
    renderC4Checklist(serviciosItems, isClosed, ot.estado);
    renderC5Repuestos(repuestosItems, d.repuestos || [], isClosed);
    renderTimeline(d.etapas || [], isClosed);
    renderC7Apoyo(d.apoyo || []);
    renderDiagnostico(d.diagnostico, isClosed);
    renderC9NotasAudio(d.notas_voz || [], isClosed);
    renderC10Cliente(ot);

    // Auto-expand sections that have data
    autoExpandSections(d);

    if (isClosed) showInfo('OT finalizada — edición bloqueada');
}

function autoExpandSections(d) {
    // Mapeo de sección -> condición para expandir
    const hasRecepData = (d.recep_fotos?.length || 0) > 0
                      || (d.fotos?.length || 0) > 0
                      || (d.recep_notas_voz?.length || 0) > 0
                      || (d.notas_voz?.length || 0) > 0;
    const hasInspData = !!d.inspeccion && Object.entries(d.inspeccion).some(([k, v]) =>
        !k.startsWith('id') && v && v !== '' && typeof v !== 'object');
    const hasRecepCols = !!d.recepcion && Object.entries(d.recepcion).some(([k, v]) =>
        k.startsWith('foto_') && v);
    const checks = {
        'c2-content': hasRecepData || hasRecepCols,
        'c3-content': hasInspData,
        'c5-content': (d.repuestos || []).length > 0 || (d.items || []).filter(i => i.tipo === 'articulo' && i.seccion && i.seccion.startsWith('repuesto')).length > 0,
        'c6-content': (d.etapas || []).length > 0,
        'c7-content': (d.apoyo || []).length > 0,
    };
    for (const [contentId, shouldExpand] of Object.entries(checks)) {
        if (shouldExpand) {
            const body = el(contentId);
            if (body) {
                body.classList.remove('collapsed');
                const card = body.closest('.ejec-card');
                if (card) {
                    const chevron = card.querySelector('.fa-chevron-down');
                    if (chevron) chevron.className = 'fas fa-chevron-up';
                }
            }
        }
    }
}

function allItemsCompleted(items) {
    const servicios = (items || []).filter(i => i.tipo === 'servicio');
    if (servicios.length === 0) {
        // Si no hay servicios, verificar si hay repuestos pendientes
        const repuestos = (items || []).filter(i => i.tipo === 'articulo' && i.seccion && i.seccion.startsWith('repuesto'));
        return repuestos.length > 0 && repuestos.every(i => i.estado_item === 'completado');
    }
    return servicios.every(i => i.estado_item === 'completado');
}

// ============================================================================
// C1: CLIENTE Y VEHÍCULO
// ============================================================================
function renderC1Identidad(ot) {
    const c = el('c1-content');
    const alerts = [];
    if (Number(ot.alerta_pernos_rodados)) alerts.push('Pernos rodados');
    if (Number(ot.alerta_falla_red)) alerts.push('Falla de red previa');
    const cli = [ot.cliente_nombre, ot.cliente_apellido].filter(Boolean).join(' ') || '—';
    const vehiculo = [ot.marca, ot.modelo, ot.anio].filter(Boolean).join(' ') || '—';
    c.innerHTML = `
        <div style="display:flex;gap:0.8rem;align-items:flex-start;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
                <div class="c1-grid">
                    <span class="c1-label">Patente</span>
                    <span class="c1-value mono" style="font-size:1rem;font-weight:700;">${escapeHtml(ot.patente || '—')}</span>
                    <span class="c1-label">Vehículo</span>
                    <span class="c1-value">${escapeHtml(vehiculo)}</span>
                    <span class="c1-label">Color</span>
                    <span class="c1-value">${escapeHtml(ot.color || '—')}</span>
                    <span class="c1-label">VIN</span>
                    <span class="c1-value mono small">${escapeHtml(ot.vin || '—')}</span>
                    <span class="c1-label">Km entrada</span>
                    <span class="c1-value mono">${escapeHtml(String(ot.vehiculo_kilometraje || '—'))}</span>
                    <span class="c1-label">Combustible</span>
                    <span class="c1-value">${escapeHtml(ot.combustible || '—')}</span>
                </div>
            </div>
            <div style="flex:0 0 auto;min-width:160px;">
                <div style="background:var(--bg-tertiary);border-radius:8px;padding:0.6rem;border:1px solid var(--border-color);">
                    <div style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.3rem;font-weight:600;">Cliente</div>
                    <div style="font-size:0.9rem;font-weight:600;">${escapeHtml(cli)}</div>
                    ${ot.cliente_telefono ? `<a href="tel:${escapeHtml(ot.cliente_telefono)}" style="display:inline-flex;align-items:center;gap:0.3rem;margin-top:0.3rem;color:var(--accent);font-size:0.85rem;text-decoration:none;"><i class="fas fa-phone"></i> ${escapeHtml(ot.cliente_telefono)}</a>` : ''}
                    ${ot.cliente_rut ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.2rem;">RUT: ${escapeHtml(ot.cliente_rut)}</div>` : ''}
                </div>
            </div>
        </div>
        ${alerts.length ? `<div class="c1-alerts">${alerts.map(a => `<div class="c1-alert"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(a)}</div>`).join('')}</div>` : ''}
    `;
}

// ============================================================================
// C2: RECEPCIÓN Y MULTIMEDIA
// ============================================================================
function renderC2Recepcion(d) {
    const c = el('c2-content');
    const ot = d.ot;
    const recep = d.recepcion || {};
    const fotosFromCols = ['foto_frontal','foto_trasera','foto_lateral_izq','foto_lateral_der','foto_superior','foto_motor','foto_interior']
        .map(k => recep[k] ? { ruta_archivo: recep[k], tipo_archivo: 'foto', _fromCol: true } : null).filter(Boolean);
    const fotos = [...(d.recep_fotos || []), ...(d.fotos || []), ...fotosFromCols];
    const audios = [...(d.recep_notas_voz || []), ...(d.notas_voz || [])];
    let insp = '';
    if (d.inspeccion) {
        const labels = {
            insp_pintura_frontal: 'Pintura frontal', insp_pintura_lateral_izq: 'Pintura lat. izq.',
            insp_pintura_lateral_der: 'Pintura lat. der.', insp_pintura_trasera: 'Pintura trasera',
            insp_pintura_techo: 'Pintura techo', insp_parabrisas_del: 'Parabrisas del.',
            insp_parabrisas_tras: 'Parabrisas tras.', insp_espejos: 'Espejos',
            insp_focos_del: 'Focos delanteros', insp_focos_tras: 'Focos traseros',
            insp_parachoque_del: 'Parachoques del.', insp_parachoque_tras: 'Parachoques tras.',
            insp_neumaticos_del: 'Neumáticos del.', insp_neumaticos_tras: 'Neumáticos tras.',
            insp_tapiz_piloto: 'Tapiz piloto', insp_tapiz_copiloto: 'Tapiz copiloto',
            insp_tapiz_trasero: 'Tapiz trasero', insp_alfombras: 'Alfombras',
            insp_tablero: 'Tablero', insp_cinturones: 'Cinturones',
            insp_motor_enciende: 'Motor enciende', insp_nivel_aceite: 'Nivel aceite',
            insp_nivel_refrigerante: 'Nivel refrigerante', insp_bateria: 'Batería',
            insp_correas: 'Correas', insp_rueda_repuesto: 'Rueda repuesto',
            insp_gata: 'Gata', insp_chaleco: 'Chaleco', insp_triangulo: 'Triángulo',
            insp_botiquín: 'Botiquín', insp_botiquin: 'Botiquín',
            insp_extintor: 'Extintor', insp_ralladuras: 'Ralladuras', insp_abollones: 'Abollones',
            insp_observaciones_generales: 'Obs. generales',
            eval_estado_general: 'Estado general', eval_motivo_visita: 'Motivo visita',
            eval_analisis_tecnico: 'Análisis técnico', eval_condiciones_exteriores: 'Cond. exteriores',
            eval_condiciones_interiores: 'Cond. interiores', eval_detalles_danos: 'Detalles daños'
        };
        const skipC2 = ['id','vehiculo_id','creado','actualizado','recepcion_id',
                         'eval_firma_cliente','eval_firma_inspector',
                         'foto_frontal','foto_trasera','foto_lateral_izq','foto_lateral_der',
                         'foto_superior','foto_motor','foto_interior'];
        const keys = Object.entries(d.inspeccion).filter(([k, v]) =>
            !skipC2.includes(k) && v && v !== '');
        if (keys.length) {
            insp += `<div class="c2-section"><h4>Checklist entrada</h4>
                <div class="c3-grid">${keys.map(([k, v]) =>
                    `<div class="c3-cell"><span class="c3-key">${escapeHtml(labels[k] || k.replace(/_/g, ' '))}</span><span>${escapeHtml(v)}</span></div>`
                ).join('')}</div></div>`;
        }
    }
    if (ot.insp_observaciones_generales) {
        insp += `<div class="c2-section"><h4>Obs. recepción</h4><p class="text-muted">${escapeHtml(ot.insp_observaciones_generales)}</p></div>`;
    }
    c.innerHTML = `
        <div class="c2-section">
            <h4>Notas de voz</h4>
            ${audios.length ? `<div class="c2-audios">${audios.map(a =>
                `<div class="c2-audio"><i class="fas fa-microphone"></i><audio controls src="${escapeHtml(a.ruta_archivo)}"></audio>
                 <a href="${escapeHtml(a.ruta_archivo)}" download class="c2-dl"><i class="fas fa-download"></i></a></div>`
            ).join('')}</div>` : '<p class="empty">Sin notas de voz</p>'}
        </div>
        <div class="c2-section">
            <h4>Fotos</h4>
            ${fotos.length ? `<div class="c2-carousel">${fotos.map(f =>
                `<a href="${escapeHtml(f.ruta_archivo)}" target="_blank"><img src="${escapeHtml(f.ruta_archivo)}" alt="" loading="lazy"></a>`
            ).join('')}</div>` : '<p class="empty">Sin fotos registradas</p>'}
        </div>
        ${insp}
    `;
}

// ============================================================================
// C3: INSPECCIÓN VISUAL
// ============================================================================
function renderC3Inspeccion(inspeccion) {
    const c = el('c3-content');
    if (!inspeccion) {
        c.innerHTML = '<p class="empty">Sin inspección visual registrada</p>';
        return;
    }
    const labels = {
        insp_pintura_frontal: 'Pintura frontal', insp_pintura_lateral_izq: 'Pintura lat. izq.',
        insp_pintura_lateral_der: 'Pintura lat. der.', insp_pintura_trasera: 'Pintura trasera',
        insp_pintura_techo: 'Pintura techo', insp_parabrisas_del: 'Parabrisas del.',
        insp_parabrisas_tras: 'Parabrisas tras.', insp_espejos: 'Espejos',
        insp_focos_del: 'Focos delanteros', insp_focos_tras: 'Focos traseros',
        insp_parachoque_del: 'Parachoques del.', insp_parachoque_tras: 'Parachoques tras.',
        insp_neumaticos_del: 'Neumáticos del.', insp_neumaticos_tras: 'Neumáticos tras.',
        insp_tapiz_piloto: 'Tapiz piloto', insp_tapiz_copiloto: 'Tapiz copiloto',
        insp_tapiz_trasero: 'Tapiz trasero', insp_alfombras: 'Alfombras',
        insp_tablero: 'Tablero', insp_cinturones: 'Cinturones',
        insp_motor_enciende: 'Motor enciende', insp_nivel_aceite: 'Nivel aceite',
        insp_nivel_refrigerante: 'Nivel refrigerante', insp_bateria: 'Batería',
        insp_correas: 'Correas', insp_rueda_repuesto: 'Rueda repuesto',
        insp_gata: 'Gata', insp_chaleco: 'Chaleco', insp_triangulo: 'Triángulo',
        insp_botiquín: 'Botiquín', insp_botiquin: 'Botiquín',
        insp_extintor: 'Extintor', insp_ralladuras: 'Ralladuras', insp_abollones: 'Abollones',
        insp_observaciones_generales: 'Observaciones generales',
        luces_altas: 'Luces altas', luces_bajas: 'Luces bajas', luces_giro: 'Luces giro',
        luces_stop: 'Luces stop', luces_reversa: 'Luces reversa', luces_tablero: 'Luces tablero',
        limpia_parabrisas: 'Limpia parabrisas', neblineros: 'Neblineros', alarma: 'Alarma',
        cinturones: 'Cinturones', bocina: 'Bocina',
        carroceria: 'Carrocería', vidrios: 'Vidrios', espejos: 'Espejos',
        neumatico_dd: 'Neumático DD', neumatico_dt: 'Neumático DT', neumatico_td: 'Neumático TD',
        neumatico_tt: 'Neumático TT', neumatico_reserva: 'Neumático reserva',
        nivel_aceite: 'Nivel aceite', nivel_refrigerante: 'Nivel refrigerante',
        nivel_liquido_freno: 'Nivel líq. freno', nivel_liquido_direccion: 'Nivel líq. dirección',
        nivel_liquido_transmision: 'Nivel líq. transmisión',
        fuga_aceite: 'Fuga aceite', fuga_refrigerante: 'Fuga refrigerante',
        fuga_combustible: 'Fuga combustible', fuga_liquido_freno: 'Fuga líq. freno',
        correa_tiempo: 'Correa tiempo', correa_alternador: 'Correa alternador',
        bateria: 'Batería', terminales_bateria: 'Terminales batería',
        soporte_motor: 'Soporte motor', soporte_caja: 'Soporte caja',
        estado_general: 'Estado general', puertas: 'Puertas',
        eval_estado_general: 'Estado general', eval_motivo_visita: 'Motivo visita',
        eval_analisis_tecnico: 'Análisis técnico', eval_condiciones_exteriores: 'Condiciones exteriores',
        eval_condiciones_interiores: 'Condiciones interiores', eval_detalles_danos: 'Detalles daños'
    };
    const skip = ['id','vehiculo_id','creado','actualizado','eval_firma_cliente','eval_firma_inspector',
                   'foto_frontal','foto_trasera','foto_lateral_izq','foto_lateral_der','foto_superior',
                   'foto_motor','foto_interior','vehiculo_id','recepcion_id','eval_estado_general'];
    const keys = Object.entries(inspeccion).filter(([k, v]) =>
        !skip.includes(k) && v && v !== '');
    if (!keys.length) {
        c.innerHTML = '<p class="empty">Sin datos de inspección</p>';
        return;
    }
    c.innerHTML = `<div class="c3-grid">${keys.map(([k, v]) =>
        `<div class="c3-cell"><span class="c3-key">${escapeHtml(labels[k] || k.replace(/_/g, ' '))}</span><span>${escapeHtml(v)}</span></div>`
    ).join('')}</div>`;
}

// ============================================================================
// C4: CHECKLIST INTERACTIVO
// ============================================================================
function renderC4Checklist(items, isClosed, estadoOt) {
    const lista = el('checklist-list');
    lista.innerHTML = '';
    if (!items.length) {
        lista.innerHTML = '<li class="empty">Sin servicios en la OT — Agregue desde los botones superiores</li>';
    } else {
        items.forEach(it => lista.appendChild(renderItemCard(it, isClosed)));
    }
    const total = items.length;
    const done = items.filter(i => i.estado_item === 'completado').length;
    const prog = total ? Math.round((done / total) * 100) : 0;
    el('checklist-progress').textContent = `${done} / ${total} completados (${prog}%)`;
    el('checklist-progress-bar').style.width = prog + '%';
}

function renderItemCard(it, isClosed) {
    const div = document.createElement('div');
    div.className = `item-card estado-${it.estado_item || 'pendiente'}`;
    if (Number(it.es_imprevisto)) div.classList.add('imprevisto');

    const isImprev = Number(it.es_imprevisto) === 1;
    const disabled = isClosed ? 'disabled' : '';
    const icons = { servicio: 'fa-wrench', repuesto_taller: 'fa-cog', repuesto_cliente: 'fa-user-cog' };
    const icon = icons[it.seccion] || 'fa-tools';
    const fotos = it.fotos || [];
    const audios = it.audios || [];
    const tieneMultimedia = fotos.length || audios.length;

    // Checklist steps (si el servicio tiene plantilla)
    let checklistHtml = '';
    const cl = it.checklist;
    if (cl && cl.pasos && cl.pasos.length) {
        const clPct = cl.porcentaje || 0;
        checklistHtml = `
            <div class="item-checklist">
                <div class="item-checklist-header">
                    <span class="item-checklist-title"><i class="fas fa-clipboard-check"></i> ${escapeHtml(it.nombre || '')} — ${escapeHtml(cl.nombre)}</span>
                    <span class="item-checklist-pct">${clPct}%</span>
                </div>
                <div class="item-checklist-bar"><div style="width:${clPct}%"></div></div>
                <div class="item-checklist-steps">
                    ${cl.pasos.map(p => {
                        const stepFotos = (p.fotos || []).map(f =>
                            '<div class="step-media-item step-photo" onclick="openStepLightbox(' + p.id + ',' + it.id + ',\'foto\')"><img src="' + escapeHtml(f.ruta_archivo) + '" loading="lazy" alt=""><button class="step-media-del" onclick="event.stopPropagation();deleteFotoPaso(' + f.id + ',' + p.id + ',' + it.id + ')"><i class="fas fa-times"></i></button></div>'
                        ).join('');
                        const stepVideos = (p.videos || []).map(v =>
                            v.thumbnail_url
                                ? '<div class="step-media-item step-video-item" onclick="openStepLightbox(' + p.id + ',' + it.id + ',\'video\')"><div class="step-video-thumb"><img src="' + escapeHtml(v.thumbnail_url) + '" loading="lazy" alt=""><i class="fas fa-play-circle"></i></div><button class="step-media-del" onclick="event.stopPropagation();deleteVideoPaso(' + v.id + ',' + p.id + ',' + it.id + ')"><i class="fas fa-times"></i></button></div>'
                                : '<div class="step-media-item step-video-item" onclick="openStepLightbox(' + p.id + ',' + it.id + ',\'video\')"><div class="step-video-thumb"><i class="fas fa-play-circle"></i></div><button class="step-media-del" onclick="event.stopPropagation();deleteVideoPaso(' + v.id + ',' + p.id + ',' + it.id + ')"><i class="fas fa-times"></i></button></div>'
                        ).join('');
                        const stepVoz = (p.notas_voz || []).map(v =>
                            '<div class="step-media-item step-voice"><i class="fas fa-microphone"></i><audio src="' + escapeHtml(v.ruta_archivo) + '" controls style="height:24px;flex:1;"></audio><button class="step-media-del" onclick="event.stopPropagation();deleteNotaVozPaso(' + v.id + ',' + p.id + ',' + it.id + ')"><i class="fas fa-times"></i></button></div>'
                        ).join('');
                        const hasMedia = stepFotos || stepVideos || stepVoz;
                        return `
                        <div class="checklist-step ${p.completado ? 'done' : ''}" data-paso-id="${p.id}">
                            <div class="step-main">
                                <label class="step-check-label">
                                    <input type="checkbox" ${p.completado ? 'checked' : ''} ${isClosed ? 'disabled' : ''}
                                           onchange="togglePasoOt(${p.id}, this.checked, ${it.id})">
                                    <span class="checklist-step-check"><i class="fas ${p.completado ? 'fa-check-circle' : 'fa-circle'}"></i></span>
                                    <span class="checklist-step-info">
                                        <span class="checklist-step-title">${escapeHtml(p.titulo)}</span>
                                        ${p.descripcion ? `<span class="checklist-step-desc">${escapeHtml(p.descripcion)}</span>` : ''}
                                    </span>
                                </label>
                            </div>
                            ${!isClosed ? `
                            <div class="step-actions">
                                <button class="step-action-btn" onclick="uploadFotoPaso(${p.id},${it.id})" title="Agregar evidencia"><i class="fas fa-plus-circle"></i></button>
                            </div>` : ''}
                            ${hasMedia ? '<div class="step-media">' + stepFotos + stepVideos + stepVoz + '</div>' : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    div.innerHTML = `
        <div class="item-card-header">
            <span class="item-icon ${it.seccion}"><i class="fas ${icon}"></i></span>
            <span class="item-name">
                ${isImprev ? '<span class="item-tag imprevisto">IMPREVISTO</span> ' : ''}
                ${(it.tipo === 'articulo' && it.seccion && it.seccion.startsWith('repuesto')) ? '<span class="item-tag" style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:0.65rem;padding:1px 5px;border-radius:3px;text-transform:uppercase;font-weight:700;margin-right:4px;">REPUESTO</span> ' : ''}
                ${escapeHtml(it.nombre || '—')}
            </span>
            <select class="item-estado-select" data-id="${it.id}" ${disabled}>
                <option value="pendiente"  ${it.estado_item==='pendiente'?'selected':''}>Pendiente</option>
                <option value="en_proceso" ${it.estado_item==='en_proceso'?'selected':''}>En proceso</option>
                <option value="completado" ${it.estado_item==='completado'?'selected':''}>Completado</option>
            </select>
            ${isImprev && !isClosed ? `<button class="item-delete-btn" data-id="${it.id}" title="Eliminar imprevisto"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        ${it.detalle ? `<div class="item-detail">${escapeHtml(it.detalle)}</div>` : ''}
        <div class="item-body">
            ${checklistHtml}
            <textarea class="item-labores-area" rows="2" placeholder="Labores realizadas…" ${disabled}>${escapeHtml(it.labores_realizadas || '')}</textarea>
            ${tieneMultimedia ? `<div class="item-media">${fotos.map(f =>
                `<img src="${escapeHtml(f.ruta_archivo)}" alt="" loading="lazy" onclick="window.open('${escapeHtml(f.ruta_archivo)}','_blank')">
                 <button class="item-media-btn" onclick="confirm('¿Eliminar esta foto?')&&eliminarEvidencia(${f.id},${it.id})"><i class="fas fa-times"></i></button>`
            ).join('')}${audios.map(a =>
                `<div class="media-thumb" style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;background:var(--bg-tertiary);border-radius:4px;font-size:0.75rem;">
                  <i class="fas fa-microphone"></i>
                  <audio src="${escapeHtml(a.ruta_archivo)}" controls style="height:24px;width:120px;"></audio>
                  <button class="item-media-btn" onclick="if(confirm('¿Eliminar?'))eliminarEvidencia(${a.id},${it.id})"><i class="fas fa-times"></i></button>
                 </div>`
            ).join('')}</div>` : ''}
            <div class="item-footer">
                ${!isClosed ? `<button class="item-media-btn" onclick="openFotoModal(${it.id})"><i class="fas fa-camera"></i> Foto</button>
                <button class="item-media-btn" onclick="openItemAudio(${it.id})"><i class="fas fa-microphone"></i> Audio</button>
                <button class="item-action-btn btn btn-sm btn-primary" onclick="guardarLaboresItem(${it.id})"><i class="fas fa-save"></i> Guardar</button>` : ''}
            </div>
        </div>
    `;

    div.querySelector('.item-estado-select').addEventListener('change', e => onItemEstadoChange(it, e.target.value));
    if (!isClosed) {
        div.querySelector('.item-delete-btn')?.addEventListener('click', () => onDeleteImprevisto(it));
    }
    return div;
}

// ─── CHECKLIST PASOS TOGGLE ─────────────────────────────────────────────
async function togglePasoOt(pasoId, completado, itemId) {
    const CHECKLIST_API = API_ROOT + 'checklist_api.php';
    const fd = new FormData();
    fd.append('action', 'toggle_paso_ot');
    fd.append('paso_id', pasoId);
    fd.append('completado', completado ? 1 : 0);
    try {
        const json = await apiFetch(CHECKLIST_API, fd);
        if (json.status === 'success') {
            showToast(completado ? 'Paso completado' : 'Paso desmarcado', 'success');
            // Actualizar UI del paso sin recargar todo
            const stepLabel = document.querySelector(`[data-paso-id="${pasoId}"]`);
            if (stepLabel) {
                stepLabel.classList.toggle('done', completado);
                const icon = stepLabel.querySelector('.checklist-step-check i');
                if (icon) icon.className = `fas ${completado ? 'fa-check-circle' : 'fa-circle'}`;
            }
            // Actualizar barra de progreso del checklist
            if (json.data && currentOtData) {
                const item = currentOtData.items.find(i => i.id === itemId);
                if (item && item.checklist) {
                    item.checklist.porcentaje = json.data.porcentaje;
                    item.checklist.estado = json.data.estado;
                    const card = document.querySelector(`.item-card[data-id="${itemId}"]`) ||
                                 document.querySelector(`[data-paso-id="${pasoId}"]`)?.closest('.item-card');
                    if (card) {
                        const pctEl = card.querySelector('.item-checklist-pct');
                        if (pctEl) pctEl.textContent = json.data.porcentaje + '%';
                        const barFill = card.querySelector('.item-checklist-bar div');
                        if (barFill) barFill.style.width = json.data.porcentaje + '%';
                    }
                }
            }
        } else {
            showToast(json.message || 'Error al actualizar paso', 'error');
        }
    } catch (e) {
        console.error('togglePasoOt error:', e);
        showToast('Error de conexión', 'error');
    }
}

// ─── CHECKLIST STEP MEDIA ─────────────────────────────────────────────
const CHECKLIST_API = API_ROOT + 'checklist_api.php';

function openFileForStep(pasoId, itemId, accept, capture) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.capture = 'environment';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        const tipoLabel = isVideo ? 'Video' : isAudio ? 'Audio' : 'Foto';
        const kb = Math.round(file.size / 1024);
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        const sizeStr = kb > 1024 ? mb + ' MB' : kb + ' KB';
        let action = 'add_foto_paso';
        if (isVideo) action = 'add_video_paso';
        else if (isAudio) action = 'add_nota_voz_paso';
        const fd = new FormData();
        fd.append('action', action);
        fd.append('paso_id', pasoId);
        fd.append('archivo', file);
        fd.append('duracion_segundos', '0');

        // Crear toast con barra de progreso
        const loadId = 'upload-' + Date.now();
        let loadEl = document.createElement('div');
        loadEl.id = loadId;
        loadEl.className = 'toast toast-info show';
        loadEl.innerHTML = `
            <strong>${tipoLabel}</strong>
            <span style="display:flex;flex-direction:column;gap:4px;width:100%;">
                <span class="upload-status"><i class="fas fa-spinner fa-spin"></i> Preparando ${sizeStr}…</span>
                <div class="upload-progress-bar" style="width:100%;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;">
                    <div class="upload-progress-fill" style="width:0%;height:100%;background:var(--primary,#3b82f6);border-radius:3px;transition:width 0.2s;"></div>
                </div>
                <span class="upload-pct" style="font-size:0.72rem;color:var(--text-secondary);">0%</span>
            </span>`;
        let container = document.getElementById('toastContainer');
        if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; document.body.appendChild(container); }
        container.appendChild(loadEl);

        const updateProgress = (pct, text) => {
            const fill = loadEl.querySelector('.upload-progress-fill');
            const pctLabel = loadEl.querySelector('.upload-pct');
            const status = loadEl.querySelector('.upload-status');
            if (fill) fill.style.width = pct + '%';
            if (pctLabel) pctLabel.textContent = pct + '%';
            if (status && text) status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + text;
        };
        const removeLoad = () => { if (loadEl && loadEl.parentNode) loadEl.remove(); };

        const xhr = new XMLHttpRequest();
        xhr.open('POST', CHECKLIST_API, true);
        xhr.responseType = 'json';

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                const loaded = e.loaded < 1024 * 1024
                    ? (e.loaded / 1024).toFixed(0) + ' KB'
                    : (e.loaded / (1024 * 1024)).toFixed(1) + ' MB';
                const total = e.total < 1024 * 1024
                    ? (e.total / 1024).toFixed(0) + ' KB'
                    : (e.total / (1024 * 1024)).toFixed(1) + ' MB';
                updateProgress(pct, `Subiendo ${loaded} / ${total}`);
            }
        };

        xhr.onload = () => {
            removeLoad();
            const r = xhr.response;
            if (r && r.status === 'success') {
                showSuccess(tipoLabel + ' subido correctamente');
                refreshStepMedia(pasoId, itemId);
            } else showError((r && r.message) || 'Error al subir');
        };

        xhr.onerror = () => {
            removeLoad();
            showError('Error de conexión');
        };

        xhr.send(fd);
    };
    input.click();
}

function showStepMediaChoice(pasoId, itemId) {
    let overlay = el('step-media-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'step-media-overlay';
        overlay.className = 'step-media-overlay';
        overlay.innerHTML = '<div class="step-media-sheet">'
            + '<div class="step-sheet-handle"></div>'
            + '<p class="step-sheet-title">Agregar evidencia</p>'
            + '<button class="step-sheet-btn" id="smc-camera"><i class="fas fa-camera"></i> Tomar foto</button>'
            + '<button class="step-sheet-btn" id="smc-gallery"><i class="fas fa-image"></i> Galería de fotos</button>'
            + '<button class="step-sheet-btn" id="smc-video-rec"><i class="fas fa-video"></i> Grabar video</button>'
            + '<button class="step-sheet-btn" id="smc-video-gal"><i class="fas fa-film"></i> Video de galería</button>'
            + '<button class="step-sheet-btn" id="smc-audio"><i class="fas fa-microphone"></i> Grabar nota de voz</button>'
            + '<button class="step-sheet-cancel" id="smc-cancel">Cancelar</button>'
            + '</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeStepMediaChoice(); });
    }
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    el('smc-cancel').onclick = closeStepMediaChoice;
    el('smc-camera').onclick = function() { closeStepMediaChoice(); openFileForStep(pasoId, itemId, 'image/*', true); };
    el('smc-gallery').onclick = function() { closeStepMediaChoice(); openFileForStep(pasoId, itemId, 'image/*', false); };
    el('smc-video-rec').onclick = function() { closeStepMediaChoice(); openFileForStep(pasoId, itemId, 'video/*', true); };
    el('smc-video-gal').onclick = function() { closeStepMediaChoice(); openFileForStep(pasoId, itemId, 'video/*', false); };
    el('smc-audio').onclick = function() { closeStepMediaChoice(); grabarVozPaso(pasoId, itemId); };
}

function closeStepMediaChoice() {
    var ov = el('step-media-overlay');
    if (ov) { ov.classList.remove('active'); document.body.style.overflow = ''; }
}

function uploadFotoPaso(pasoId, itemId) {
    showStepMediaChoice(pasoId, itemId);
}

async function deleteFotoPaso(fotoId, pasoId, itemId) {
    if (!confirm('¿Eliminar esta foto?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_foto_paso');
    fd.append('id', fotoId);
    try {
        const r = await apiFetch(CHECKLIST_API, fd);
        if (r.status === 'success') {
            showSuccess('Foto eliminada');
            setTimeout(() => abrirOt(currentOt.id), 0);
        } else showError(r.message || 'Error');
    } catch (e) { showError('Error de conexión'); }
}

let pasoVozRecorder = null;
let pasoVozStream = null;
let pasoVozTarget = { pasoId: 0, itemId: 0 };

function grabarVozPaso(pasoId, itemId) {
    pasoVozTarget = { pasoId, itemId };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Tu navegador no soporta grabación de audio');
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        pasoVozStream = stream;
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        pasoVozRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        const chunks = [];
        pasoVozRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        pasoVozRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: pasoVozRecorder.mimeType || 'audio/webm' });
            const ext = (pasoVozRecorder.mimeType || 'audio/webm').split('/')[1].split(';')[0];
            const file = new File([blob], `voz_paso_${Date.now()}.${ext}`, { type: blob.type });
            const fd = new FormData();
            fd.append('action', 'add_nota_voz_paso');
            fd.append('paso_id', pasoId);
            fd.append('archivo', file);
            fd.append('duracion_segundos', '0');

            // Toast con barra de progreso
            const kb = Math.round(file.size / 1024);
            const sizeStr = kb > 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : kb + ' KB';
            let loadEl = document.createElement('div');
            loadEl.className = 'toast toast-info show';
            loadEl.innerHTML = `
                <strong>Audio</strong>
                <span style="display:flex;flex-direction:column;gap:4px;width:100%;">
                    <span class="upload-status"><i class="fas fa-spinner fa-spin"></i> Preparando ${sizeStr}…</span>
                    <div class="upload-progress-bar" style="width:100%;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;">
                        <div class="upload-progress-fill" style="width:0%;height:100%;background:var(--primary,#3b82f6);border-radius:3px;transition:width 0.2s;"></div>
                    </div>
                    <span class="upload-pct" style="font-size:0.72rem;color:var(--text-secondary);">0%</span>
                </span>`;
            let container = document.getElementById('toastContainer');
            if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; document.body.appendChild(container); }
            container.appendChild(loadEl);

            const updateProgress = (pct, text) => {
                const fill = loadEl.querySelector('.upload-progress-fill');
                const pctLabel = loadEl.querySelector('.upload-pct');
                const status = loadEl.querySelector('.upload-status');
                if (fill) fill.style.width = pct + '%';
                if (pctLabel) pctLabel.textContent = pct + '%';
                if (status && text) status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + text;
            };
            const removeLoad = () => { if (loadEl && loadEl.parentNode) loadEl.remove(); };

            const xhr = new XMLHttpRequest();
            xhr.open('POST', CHECKLIST_API, true);
            xhr.responseType = 'json';
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    const loaded = e.loaded < 1024 * 1024
                        ? (e.loaded / 1024).toFixed(0) + ' KB'
                        : (e.loaded / (1024 * 1024)).toFixed(1) + ' MB';
                    const total = e.total < 1024 * 1024
                        ? (e.total / 1024).toFixed(0) + ' KB'
                        : (e.total / (1024 * 1024)).toFixed(1) + ' MB';
                    updateProgress(pct, `Subiendo ${loaded} / ${total}`);
                }
            };
            xhr.onload = () => {
                removeLoad();
                const r = xhr.response;
                if (r && r.status === 'success') {
                    showSuccess('Nota de voz guardada');
                    refreshStepMedia(pasoId, itemId);
                } else showError((r && r.message) || 'Error al guardar');
            };
            xhr.onerror = () => { removeLoad(); showError('Error de conexión'); };
            xhr.send(fd);

            stream.getTracks().forEach(t => t.stop());
        };
        pasoVozRecorder.start();
        showToast('Grabando... presione para detener', 'info');
        pasoVozRecorder.onstop_original = pasoVozRecorder.onstop;
        pasoVozRecorder.addEventListener('click', () => {
            if (pasoVozRecorder.state === 'recording') pasoVozRecorder.stop();
        });
        // Auto-stop after 60 seconds
        setTimeout(() => { if (pasoVozRecorder && pasoVozRecorder.state === 'recording') pasoVozRecorder.stop(); }, 60000);
    }).catch(() => {
        showError('No se pudo acceder al micrófono');
    });
}

async function deleteNotaVozPaso(notaId, pasoId, itemId) {
    if (!confirm('¿Eliminar esta nota de voz?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_nota_voz_paso');
    fd.append('id', notaId);
    try {
        const r = await apiFetch(CHECKLIST_API, fd);
        if (r.status === 'success') {
            showSuccess('Nota eliminada');
            refreshStepMedia(pasoId, itemId);
        } else showError(r.message || 'Error');
    } catch (e) { showError('Error de conexión'); }
}

// ─── VIDEO UPLOAD/DELETE ──────────────────────────────────────────────
async function deleteVideoPaso(videoId, pasoId, itemId) {
    if (!confirm('¿Eliminar este video?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_video_paso');
    fd.append('id', videoId);
    try {
        const r = await apiFetch(CHECKLIST_API, fd);
        if (r.status === 'success') {
            showSuccess('Video eliminado');
            refreshStepMedia(pasoId, itemId);
        } else showError(r.message || 'Error');
    } catch (e) { showError('Error de conexión'); }
}

// ─── REFRESH STEP MEDIA (lightweight — no full OT reload) ────────────
async function refreshStepMedia(pasoId, itemId) {
    try {
        const r = await apiFetch(API + '?action=cargar_ot&ot_id=' + currentOt.id);
        if (r.status !== 'success') return;
        const d = r.data;
        currentOtData = d;
        const item = d.items.find(function(i) { return i.id === itemId; });
        if (!item || !item.checklist) return;
        const step = item.checklist.pasos.find(function(p) { return p.id === pasoId; });
        if (!step) return;
        const stepEl = document.querySelector('[data-paso-id="' + pasoId + '"]');
        if (!stepEl) return;
        var mediaHtml = buildStepMediaHtml(step, item.id);
        var existing = stepEl.querySelector('.step-media');
        if (existing) { existing.outerHTML = mediaHtml; }
        else if (mediaHtml) { stepEl.insertAdjacentHTML('beforeend', mediaHtml); }
    } catch (e) { console.error('refreshStepMedia:', e); }
}

function buildStepMediaHtml(step, itemId) {
    var fotos = (step.fotos || []).map(function(f) {
        return '<div class="step-media-item step-photo" onclick="openStepLightbox(' + step.id + ',' + itemId + ',\'foto\')">'
            + '<img src="' + escapeHtml(f.ruta_archivo) + '" loading="lazy" alt="">'
            + '<button class="step-media-del" onclick="event.stopPropagation();deleteFotoPaso(' + f.id + ',' + step.id + ',' + itemId + ')"><i class="fas fa-times"></i></button>'
            + '</div>';
    }).join('');
    var videos = (step.videos || []).map(function(v) {
        var thumbHtml = v.thumbnail_url
            ? '<div class="step-video-thumb"><img src="' + escapeHtml(v.thumbnail_url) + '" loading="lazy" alt=""><i class="fas fa-play-circle"></i></div>'
            : '<div class="step-video-thumb"><i class="fas fa-play-circle"></i></div>';
        return '<div class="step-media-item step-video-item" onclick="openStepLightbox(' + step.id + ',' + itemId + ',\'video\')">'
            + thumbHtml
            + '<button class="step-media-del" onclick="event.stopPropagation();deleteVideoPaso(' + v.id + ',' + step.id + ',' + itemId + ')"><i class="fas fa-times"></i></button>'
            + '</div>';
    }).join('');
    var voz = (step.notas_voz || []).map(function(v) {
        return '<div class="step-media-item step-voice">'
            + '<i class="fas fa-microphone"></i>'
            + '<audio src="' + escapeHtml(v.ruta_archivo) + '" controls style="height:24px;flex:1;"></audio>'
            + '<button class="step-media-del" onclick="event.stopPropagation();deleteNotaVozPaso(' + v.id + ',' + step.id + ',' + itemId + ')"><i class="fas fa-times"></i></button>'
            + '</div>';
    }).join('');
    if (!fotos && !videos && !voz) return '';
    return '<div class="step-media">' + fotos + videos + voz + '</div>';
}

// ─── STEP MEDIA LIGHTBOX ─────────────────────────────────────────────
function openStepLightbox(pasoId, itemId, initialType) {
    if (!currentOtData) return;
    var item = currentOtData.items.find(function(i) { return i.id === itemId; });
    if (!item || !item.checklist) return;
    var step = item.checklist.pasos.find(function(p) { return p.id === pasoId; });
    if (!step) return;
    var allMedia = [];
    (step.fotos || []).forEach(function(f) { allMedia.push({ type: 'foto', src: f.ruta_archivo, id: f.id }); });
    (step.videos || []).forEach(function(v) { allMedia.push({ type: 'video', src: v.ruta_archivo, id: v.id, thumbnail: v.thumbnail_url || null }); });
    (step.notas_voz || []).forEach(function(v) { allMedia.push({ type: 'audio', src: v.ruta_archivo, id: v.id }); });
    (step.pdfs || []).forEach(function(p) { allMedia.push({ type: 'pdf', src: p.ruta_archivo, name: p.nombre_original || 'PDF', id: p.id }); });
    if (!allMedia.length) return;
    var idx = 0;
    if (initialType) {
        var match = allMedia.findIndex(function(m) { return m.type === initialType; });
        if (match >= 0) idx = match;
    }
    var ov = el('step-lightbox');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'step-lightbox';
        ov.className = 'step-lightbox';
        document.body.appendChild(ov);
    }
    window._slbMedia = allMedia;
    window._slbIdx = idx;
    window._slbPasoId = pasoId;
    window._slbItemId = itemId;
    renderLightbox();
    ov.classList.add('active');
    document.body.style.overflow = 'hidden';
    ov.onclick = function(e) { if (e.target === ov) closeStepLightbox(); };
}

function renderLightbox() {
    var ov = el('step-lightbox');
    var all = window._slbMedia;
    var idx = window._slbIdx;
    var m = all[idx];
    var content = '';
    if (m.type === 'foto') {
        content = '<img src="' + escapeHtml(m.src) + '" class="slb-img" alt="">';
    } else if (m.type === 'video') {
        content = '<video src="' + escapeHtml(m.src) + '" controls autoplay class="slb-video"></video>';
    } else if (m.type === 'audio') {
        content = '<div class="slb-audio-wrap"><div class="slb-audio-icon"><i class="fas fa-microphone"></i></div>'
            + '<audio src="' + escapeHtml(m.src) + '" controls autoplay class="slb-audio"></audio></div>';
    } else if (m.type === 'pdf') {
        content = '<iframe src="' + escapeHtml(m.src) + '" class="slb-pdf" title="' + escapeHtml(m.name || 'PDF') + '"></iframe>';
    }
    var thumbs = all.map(function(t, i) {
        var cls = i === idx ? ' active' : '';
        if (t.type === 'foto') return '<div class="slb-thumb' + cls + '" onclick="window._slbGoto(' + i + ')"><img src="' + escapeHtml(t.src) + '" alt=""></div>';
        if (t.type === 'video') return t.thumbnail
            ? '<div class="slb-thumb' + cls + '" onclick="window._slbGoto(' + i + ')"><img src="' + escapeHtml(t.thumbnail) + '" alt=""></div>'
            : '<div class="slb-thumb slb-thumb-video' + cls + '" onclick="window._slbGoto(' + i + ')"><i class="fas fa-play"></i></div>';
        if (t.type === 'pdf') return '<div class="slb-thumb slb-thumb-pdf' + cls + '" onclick="window._slbGoto(' + i + ')"><i class="fas fa-file-pdf"></i></div>';
        return '<div class="slb-thumb slb-thumb-audio' + cls + '" onclick="window._slbGoto(' + i + ')"><i class="fas fa-microphone"></i></div>';
    }).join('');
    ov.innerHTML = '<div class="slb-inner">'
        + '<button class="slb-close" onclick="closeStepLightbox()"><i class="fas fa-times"></i></button>'
        + (all.length > 1 ? '<button class="slb-nav slb-prev" onclick="window._slbNav(-1)"><i class="fas fa-chevron-left"></i></button>' : '')
        + '<div class="slb-content">' + content + '</div>'
        + (all.length > 1 ? '<button class="slb-nav slb-next" onclick="window._slbNav(1)"><i class="fas fa-chevron-right"></i></button>' : '')
        + '<div class="slb-thumbs">' + thumbs + '</div>'
        + '<div class="slb-counter">' + (idx + 1) + ' / ' + all.length + '</div>'
        + '</div>';
}

window._slbGoto = function(i) { window._slbIdx = i; renderLightbox(); };
window._slbNav = function(d) {
    var all = window._slbMedia;
    window._slbIdx = (window._slbIdx + d + all.length) % all.length;
    renderLightbox();
};
function closeStepLightbox() {
    var ov = el('step-lightbox');
    if (ov) { ov.classList.remove('active'); document.body.style.overflow = ''; }
    window._slbMedia = [];
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────
function openModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    const m = el(id);
    if (!m) return;
    m.classList.remove('active');
    document.body.style.overflow = '';
}

let fotoItemTargetId = 0;
function openFotoModal(itemId) {
    fotoItemTargetId = itemId;
    el('foto-item-input').value = '';
    el('foto-item-preview').innerHTML = '';
    openModal('foto-item-modal');
}
function previewFotoItem() {
    const preview = el('foto-item-preview');
    preview.innerHTML = '';
    const files = el('foto-item-input').files;
    if (files.length) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(files[0]);
        img.style.maxWidth = '100%';
        img.style.maxHeight = '200px';
        img.style.borderRadius = '6px';
        preview.appendChild(img);
    }
}
async function confirmarFotoItem() {
    const files = el('foto-item-input').files;
    if (!files.length) { showError('Seleccione una foto'); return; }
    if (!fotoItemTargetId) { showError('Error: item no identificado'); return; }
    const fd = new FormData();
    for (const f of files) fd.append('archivos[]', f);
    fd.append('item_id', fotoItemTargetId);
    const btn = el('btn-confirmar-foto-item');
    setButtonLoading(btn, true, 'Subiendo…');
    const r = await uploadWithProgress(`${API}?action=agregar_item_foto`, fd);
    setButtonLoading(btn, false, '<i class="fas fa-upload"></i> Subir Foto');
    if (r.status === 'success') {
        showSuccess('Foto agregada');
        closeModal('foto-item-modal');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}
async function eliminarEvidencia(evId, itemId) {
    const fd = new FormData();
    fd.append('evidencia_id', evId);
    fd.append('item_id', itemId);
    const r = await apiFetch(`${API}?action=eliminar_item_foto`, fd);
    if (r.status === 'success') { showSuccess('Eliminado'); setTimeout(() => abrirOt(currentOt.id), 0); }
    else showError(r.message || 'Error');
}

let currentAudioItemId = 0;
function openItemAudio(itemId) {
    currentAudioItemId = itemId;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        showError('Primero inicie la grabación desde el botón "Grabar Audio" en Notas');
        return;
    }
}

// ─── ACCIONES DE ITEM ──────────────────────────────────────────────────────
async function onItemEstadoChange(item, nuevoEstado) {
    if (nuevoEstado === 'completado') {
        const card = document.querySelector(`.item-estado-select[data-id="${item.id}"]`)?.closest('.item-card');
        if (!card) { showError('Error de referencia'); return; }
        const ta = card.querySelector('.item-labores-area');
        if (!ta || !ta.value.trim()) {
            ta?.focus();
            showError('Primero registre las labores realizadas, luego marque como completado');
            const sel = card.querySelector('.item-estado-select');
            if (sel) sel.value = item.estado_item || 'pendiente';
            return;
        }
    }
    const fd = new FormData();
    fd.append('item_id', item.id);
    fd.append('estado_item', nuevoEstado);
    fd.append('labores', item.labores_realizadas || '');
    const r = await apiFetch(`${API}?action=actualizar_item_estado`, fd);
    if (r.status === 'success') {
        showSuccess(`Item marcado como ${nuevoEstado}`);
        item.estado_item = nuevoEstado;
        item.completado = nuevoEstado === 'completado' ? 1 : 0;
        actualizarProgresoYBotones();
    } else {
        showError(r.message || 'Error al actualizar estado');
        const sel = document.querySelector(`.item-estado-select[data-id="${item.id}"]`);
        if (sel) sel.value = item.estado_item || 'pendiente';
    }
}

async function guardarLaboresItem(itemId) {
    const card = document.querySelector(`.item-estado-select[data-id="${itemId}"]`)?.closest('.item-card');
    if (!card) return;
    const ta = card.querySelector('.item-labores-area');
    const lab = (ta.value || '').trim();
    if (!lab) { showError('Ingrese las labores realizadas'); ta?.focus(); return; }
    const fd = new FormData();
    fd.append('item_id', itemId);
    fd.append('labores', lab);
    const r = await apiFetch(`${API}?action=guardar_labores`, fd);
    if (r.status === 'success') {
        showSuccess('Labores guardadas');
        const item = currentOtData?.items?.find(i => i.id === itemId);
        if (item) item.labores_realizadas = lab;
    } else showError(r.message || 'Error');
}

async function onDeleteImprevisto(item) {
    if (!confirm('¿Eliminar este servicio imprevisto?')) return;
    const fd = new FormData();
    fd.append('item_id', item.id);
    const r = await apiFetch(`${API}?action=eliminar_item_imprevisto`, fd);
    if (r.status === 'success') {
        showSuccess('Imprevisto eliminado');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

function actualizarProgresoYBotones() {
    if (!currentOtData) return;
    const items = (currentOtData.items || []).filter(i => i.tipo === 'servicio');
    const total = items.length;
    const done = items.filter(i => i.estado_item === 'completado').length;
    const prog = total ? Math.round((done / total) * 100) : 0;
    el('checklist-progress').textContent = `${done} / ${total} completados (${prog}%)`;
    el('checklist-progress-bar').style.width = prog + '%';
    const allDone = allItemsCompleted(currentOtData.items);
    const isInProgress = currentOt && ['proceso', 'diagnostico'].includes(currentOt.estado);
    el('btn-clock-out').style.display = (isInProgress && allDone) ? '' : 'none';
}

// ============================================================================
// MODAL: AGREGAR SERVICIO
// ============================================================================
function openServicioModal() {
    if (!currentOt || !['proceso','diagnostico'].includes(currentOt.estado)) {
        showError('La OT debe estar en progreso para agregar servicios');
        return;
    }
    const sel = el('servicio-select');
    sel.innerHTML = catalogServicios.map(s => `<option value="${s.id}">${escapeHtml(s.display_name)}</option>`).join('');
    el('servicio-buscar').value = '';
    el('servicio-imprevisto').checked = false;
    openModal('servicio-modal');
}
function closeServicioModal() { closeModal('servicio-modal'); }
function filterServicios() {
    const q = (el('servicio-buscar').value || '').toLowerCase();
    const sel = el('servicio-select');
    const f = q ? catalogServicios.filter(s => (s.display_name || '').toLowerCase().includes(q)) : catalogServicios;
    sel.innerHTML = f.map(s => `<option value="${s.id}">${escapeHtml(s.display_name)}</option>`).join('');
}
async function confirmarServicio() {
    const itemId = parseInt(el('servicio-select').value, 10);
    if (!itemId) { showError('Seleccione un servicio'); return; }
    const esImprevisto = el('servicio-imprevisto').checked ? 1 : 0;
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('item_id', itemId);
    fd.append('es_imprevisto', esImprevisto);
    const r = await apiFetch(`${API}?action=agregar_servicio_item`, fd);
    if (r.status === 'success') {
        showSuccess('Servicio agregado al checklist');
        closeModal('servicio-modal');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

// ============================================================================
// MODAL: SERVICIO RÁPIDO
// ============================================================================
let srPasos = [];

function openServicioRapidoModal() {
    if (!currentOt || !['proceso','diagnostico'].includes(currentOt.estado)) {
        showError('La OT debe estar en progreso para agregar servicios');
        return;
    }
    el('sr-nombre').value = '';
    el('sr-descripcion').value = '';
    el('sr-paso-input').value = '';
    srPasos = [];
    renderSrPasos();
    openModal('servicio-rapido-modal');
    el('sr-nombre').focus();
}

function renderSrPasos() {
    const container = el('sr-pasos-list');
    if (!srPasos.length) {
        container.innerHTML = '<p class="muted" style="font-size:0.82rem;margin:0;">Sin pasos agregados</p>';
        return;
    }
    container.innerHTML = srPasos.map((p, i) => `
        <div class="sr-paso-item">
            <span class="sr-paso-num">${i + 1}</span>
            <span class="sr-paso-text">${escapeHtml(p)}</span>
            <button class="sr-paso-remove" data-idx="${i}" title="Eliminar paso"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
    container.querySelectorAll('.sr-paso-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            srPasos.splice(parseInt(btn.dataset.idx, 10), 1);
            renderSrPasos();
        });
    });
}

function addPasoRapido() {
    const val = (el('sr-paso-input').value || '').trim();
    if (!val) return;
    srPasos.push(val);
    el('sr-paso-input').value = '';
    renderSrPasos();
    el('sr-paso-input').focus();
}

async function confirmarServicioRapido() {
    const nombre = (el('sr-nombre').value || '').trim();
    if (!nombre) { showError('Ingrese el nombre del servicio'); el('sr-nombre').focus(); return; }
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('nombre', nombre);
    fd.append('descripcion', (el('sr-descripcion').value || '').trim());
    fd.append('pasos', JSON.stringify(srPasos));
    const btn = el('btn-confirmar-servicio-rapido');
    setButtonLoading(btn, true, 'Agregando…');
    const r = await apiFetch(`${API}?action=agregar_servicio_rapido`, fd);
    setButtonLoading(btn, false, '<i class="fas fa-check"></i> Agregar Servicio');
    if (r.status === 'success') {
        showSuccess('Servicio rápido agregado');
        closeModal('servicio-rapido-modal');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

// ============================================================================
// MODAL: AGREGAR REPUESTO A ITEMS
// ============================================================================
function openRepuestoItemModal() {
    if (!currentOt || !['proceso','diagnostico'].includes(currentOt.estado)) {
        showError('La OT debe estar en progreso para agregar repuestos');
        return;
    }
    el('repitem-nombre').value = '';
    el('repitem-cantidad').value = '1';
    el('repitem-valor').value = '0';
    el('repitem-tipo').value = 'repuesto_taller';
    openModal('repuesto-item-modal');
}
function closeRepuestoItemModal() { closeModal('repuesto-item-modal'); }
async function confirmarRepuestoItem() {
    const nombre = (el('repitem-nombre').value || '').trim();
    if (!nombre) { showError('Ingrese el nombre del repuesto'); return; }
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('nombre', nombre);
    fd.append('seccion', el('repitem-tipo').value);
    fd.append('cantidad', el('repitem-cantidad').value || '1');
    fd.append('valor', el('repitem-valor').value || '0');
    const r = await apiFetch(`${API}?action=agregar_repuesto_item`, fd);
    if (r.status === 'success') {
        showSuccess('Repuesto agregado al checklist');
        closeModal('repuesto-item-modal');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

// ============================================================================
// CRONÓMETRO
// ============================================================================
function startCronometro(horaInicio) {
    stopCronometro();
    const inicio = horaInicio ? new Date(horaInicio.replace(' ', 'T')).getTime() : Date.now();
    cronometroInicio = inicio;
    cronometroRunning = true;
    const tick = () => {
        if (!cronometroRunning) return;
        const c = el('cronometro');
        if (c) c.textContent = formatHMS(Date.now() - cronometroInicio);
    };
    tick();
    cronometroHandle = setInterval(tick, 1000);
}

function stopCronometro() {
    cronometroRunning = false;
    if (cronometroHandle) { clearInterval(cronometroHandle); cronometroHandle = null; }
}

function formatHMS(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ============================================================================
// CLOCK IN / OUT
// ============================================================================
function validarEmpleado() {
    if (!currentEmpleadoId || currentEmpleadoId <= 0) {
        showError('Debe seleccionar un técnico antes de continuar');
        return false;
    }
    return true;
}

async function onClockIn() {
    if (!currentOt) return;
    if (!validarEmpleado()) return;
    setButtonLoading(el('btn-clock-in'), true, 'Iniciando…');
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('empleado_id', currentEmpleadoId);
    const r = await apiFetch(`${API}?action=clock_in`, fd);
    setButtonLoading(el('btn-clock-in'), false, '<i class="fas fa-play"></i> Iniciar Trabajo');
    if (r.status === 'success') {
        showSuccess('Trabajo iniciado');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

async function onClockOut() {
    if (!currentOt) return;
    if (!confirm('¿Finalizar la OT completamente? Se cerrará para liquidación.')) return;
    setButtonLoading(el('btn-clock-out'), true, 'Cerrando…');
    const fd = new FormData(); fd.append('ot_id', currentOt.id);
    const r = await apiFetch(`${API}?action=clock_out`, fd);
    setButtonLoading(el('btn-clock-out'), false, '<i class="fas fa-flag-checkered"></i> Finalizar');
    if (r.status === 'success') {
        showSuccess('OT cerrada para liquidación');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

// ============================================================================
// C5: SOLICITUD DE REPUESTOS
// ============================================================================
function onRepuestoTipoChange() {
    const t = el('repuesto-tipo').value;
    el('repuesto-buscar').value = '';
    el('repuesto-buscar').dataset.selectedId = '';
    el('repuesto-buscar').placeholder = t === 'insumo' ? 'Buscar insumo…' : 'Buscar artículo…';
    el('repuesto-resultados').innerHTML = '';
}
function onRepuestoBuscarInput(e) {
    const q = (e.target.value || '').toLowerCase();
    const tipo = el('repuesto-tipo').value;
    const lista = tipo === 'insumo' ? catalogInsumos : catalogArticulos;
    if (!q) { el('repuesto-resultados').innerHTML = ''; return; }
    const m = lista.filter(x => (x.display_name || '').toLowerCase().includes(q)).slice(0, 10);
    el('repuesto-resultados').innerHTML = m.map(x =>
        `<div class="repuesto-opt" data-id="${x.id}" data-nombre="${escapeHtml(x.display_name)}">
            <i class="fas fa-box"></i> ${escapeHtml(x.display_name)}
        </div>`
    ).join('');
    el('repuesto-resultados').querySelectorAll('.repuesto-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            el('repuesto-buscar').value = opt.getAttribute('data-nombre');
            el('repuesto-buscar').dataset.selectedId = opt.getAttribute('data-id');
            el('repuesto-resultados').innerHTML = '';
        });
    });
}
async function eliminarRepuestoSolicitado(id) {
    if (!confirm('¿Eliminar esta solicitud del almacén?')) return;
    const fd = new FormData();
    fd.append('id', id);
    const r = await apiFetch(`${API}?action=eliminar_repuesto_solicitado`, fd);
    if (r.status === 'success') { showSuccess('Solicitud eliminada'); setTimeout(() => abrirOt(currentOt.id), 0); }
    else showError(r.message || 'Error');
}

async function onSolicitarRepuesto() {
    if (!validarEmpleado()) return;
    const tipo = el('repuesto-tipo').value;
    const itemId = parseInt(el('repuesto-buscar').dataset.selectedId || '0', 10);
    const cantidad = parseInt(el('repuesto-cantidad').value, 10) || 1;
    const obs = el('repuesto-observacion').value || '';
    if (!itemId) { showError('Seleccione un artículo o insumo'); return; }
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('cantidad', cantidad);
    fd.append('empleado_id', currentEmpleadoId);
    fd.append('observacion', obs);
    if (tipo === 'insumo') fd.append('insumo_id', itemId);
    else fd.append('articulo_id', itemId);
    if (el('repuesto-foto').files.length) {
        for (const f of el('repuesto-foto').files) fd.append('archivos[]', f);
    }
    const r = await apiFetch(`${API}?action=solicitar_repuesto`, fd);
    if (r.status === 'success') {
        showSuccess('Repuesto solicitado a pañol');
        el('repuesto-buscar').value = ''; el('repuesto-buscar').dataset.selectedId = '';
        el('repuesto-cantidad').value = 1; el('repuesto-observacion').value = '';
        el('repuesto-foto').value = '';
        el('repuesto-resultados').innerHTML = '';
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

async function onCreateOC() {
    const sel = document.querySelector('.rep-estado-sel');
    if (!sel) { showError('Seleccione un repuesto en la tabla'); return; }
    const repuestoId = parseInt(sel.dataset.id, 10);
    if (!repuestoId) { showError('Repuesto no identificado'); return; }
    if (!confirm('¿Crear orden de compra para este repuesto?')) return;
    const fd = new FormData(); fd.append('repuesto_id', repuestoId);
    const r = await apiFetch(API_ROOT + 'orden_compra_api.php?action=crear_desde_repuesto', fd);
    if (r.status === 'success') {
        showSuccess('OC ' + (r.data?.folio || ('#'+r.data?.oc_id)) + ' creada');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

async function crearOCRepuesto(repuestoId) {
    if (!repuestoId) { showError('Repuesto no identificado'); return; }
    if (!confirm('¿Crear orden de compra para este repuesto?')) return;
    const fd = new FormData(); fd.append('repuesto_id', repuestoId);
    const r = await apiFetch(API_ROOT + 'orden_compra_api.php?action=crear_desde_repuesto', fd);
    if (r.status === 'success') {
        showSuccess('OC ' + (r.data?.folio || ('#'+r.data?.oc_id)) + ' creada');
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

function renderC5Repuestos(checklistRepuestos, warehouseRepuestos, isClosed) {
    // Sub-sección: Repuestos del Trabajo (items tipo=articulo con seccion=repuesto_*)
    const repChecklist = el('repuestos-checklist-list');
    if (!checklistRepuestos.length) {
        repChecklist.innerHTML = '<p class="empty" style="font-size:0.82rem;">Sin repuestos del trabajo agregados a la OT</p>';
    } else {
        repChecklist.innerHTML = checklistRepuestos.map(r => {
            const fotos = r.fotos || [];
            const fotoHtml = fotos.length ? `<img src="${escapeHtml(fotos[0].ruta_archivo)}" class="rep-foto-thumb" onclick="window.open('${escapeHtml(fotos[0].ruta_archivo)}','_blank')">` : '';
            const estadoLabels = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado' };
            const estadoClass = r.estado_item === 'completado' ? 'rep-entregado' : r.estado_item === 'en_proceso' ? 'rep-solicitado' : 'rep-solicitado';
            return `<div class="rep-checklist-item">
                <div class="rep-checklist-info">
                    <span class="rep-checklist-name">${escapeHtml(r.nombre || '—')}</span>
                    <span class="rep-checklist-qty">Cant: ${r.cantidad || 1}</span>
                    <span class="rep-estado ${estadoClass}">${escapeHtml(estadoLabels[r.estado_item] || r.estado_item || 'Pendiente')}</span>
                </div>
                ${fotoHtml ? `<div class="rep-checklist-foto">${fotoHtml}</div>` : ''}
            </div>`;
        }).join('');
    }

    // Sub-sección: Solicitudes al Almacén
    const tbody = el('repuestos-tbody');
    if (!warehouseRepuestos.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin solicitudes de repuestos a pañol</td></tr>';
    } else {
        tbody.innerHTML = warehouseRepuestos.map(r => {
            const nombre = r.articulo_nombre || r.insumo_nombre || '—';
            const emp = [r.emp_nombre, r.emp_apellido].filter(Boolean).join(' ') || '—';
            const fec = r.creado ? formatHora(r.creado) : '—';
            const actions = isClosed ? '—' : `
                <div style="display:flex;flex-direction:column;gap:4px;">
                <select class="rep-estado-sel" data-id="${r.id}">
                    <option value="solicitado" ${r.estado==='solicitado'?'selected':''}>Solicitado</option>
                    <option value="entregado"  ${r.estado==='entregado' ?'selected':''}>Entregado</option>
                    <option value="rechazado"  ${r.estado==='rechazado' ?'selected':''}>Rechazado</option>
                    <option value="cancelado"  ${r.estado==='cancelado' ?'selected':''}>Cancelado</option>
                </select>
                ${r.estado === 'solicitado' && !r.oc_id ? `<button class="btn btn-xs btn-primary" onclick="crearOCRepuesto(${r.id})" title="Crear OC para este repuesto"><i class="fas fa-file-invoice"></i> Crear OC</button>` : ''}
                ${r.oc_id ? `<span style="font-size:0.7rem;color:var(--primary);"><i class="fas fa-link"></i> OC #${r.oc_id}</span>` : ''}
                <button class="btn btn-xs btn-danger-outline" onclick="eliminarRepuestoSolicitado(${r.id})" title="Eliminar solicitud"><i class="fas fa-trash"></i> Eliminar</button>
                </div>`;
            const foto = r.foto_ruta ? `<img src="${escapeHtml(r.foto_ruta)}" class="rep-foto-thumb" onclick="window.open('${escapeHtml(r.foto_ruta)}','_blank')">` : '—';
            return `<tr>
                <td>${escapeHtml(nombre)}</td>
                <td class="num">${r.cantidad}</td>
                <td><span class="rep-estado rep-${r.estado}">${escapeHtml(r.estado)}</span></td>
                <td><small>${escapeHtml(emp)}<br>${fec}</small></td>
                <td>${foto}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('.rep-estado-sel').forEach(sel => {
            sel.addEventListener('change', async () => {
                const id = parseInt(sel.getAttribute('data-id'), 10);
                const estado = sel.value;
                const fd = new FormData(); fd.append('id', id); fd.append('estado', estado);
                const r = await apiFetch(`${API}?action=actualizar_repuesto`, fd);
                if (r.status === 'success') { showSuccess('Estado actualizado'); setTimeout(() => abrirOt(currentOt.id), 0); }
                else showError(r.message || 'Error');
            });
        });
    }
}

// ============================================================================
// C6: ETAPAS / TIMELINE
// ============================================================================
async function onAgregarEtapa() {
    const nombre = (el('etapa-nombre').value || '').trim();
    if (!nombre) { showError('Ingrese el nombre de la etapa'); return; }
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('nombre', nombre);
    const r = await apiFetch(`${API}?action=agregar_etapa`, fd);
    if (r.status === 'success') {
        showSuccess('Etapa agregada');
        el('etapa-nombre').value = '';
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

function renderTimeline(etapas, isClosed) {
    const container = el('timeline-container');
    const list = el('etapas-list');
    if (!etapas.length) {
        container.innerHTML = '<p class="empty">Sin etapas definidas. Agregue etapas para trabajos multi-fase.</p>';
        list.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div class="timeline-bar">${etapas.map((e, i) => {
            const dotClass = e.estado === 'completado' ? 'completed' : e.estado === 'en_curso' ? 'current' : '';
            const lineClass = e.estado === 'completado' ? 'completed' : '';
            const labelClass = e.estado !== 'pendiente' ? 'active' : '';
            return `
                <div class="timeline-step">
                    <div class="timeline-dot ${dotClass}" title="${escapeHtml(e.nombre)}"></div>
                    <div class="timeline-label ${labelClass}">${escapeHtml(e.nombre)}</div>
                </div>
                ${i < etapas.length - 1 ? `<div class="timeline-line ${lineClass}"></div>` : ''}
            `;
        }).join('')}</div>`;

    list.innerHTML = etapas.map(e => {
        const estadoLabels = { pendiente: 'Pendiente', en_curso: 'En curso', completado: 'Completado' };
        const actions = isClosed ? '' : `
            <select class="etapa-estado-sel" data-id="${e.id}" style="padding:2px 6px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);font-size:0.8rem;">
                <option value="pendiente"  ${e.estado==='pendiente'?'selected':''}>Pendiente</option>
                <option value="en_curso"   ${e.estado==='en_curso'?'selected':''}>En curso</option>
                <option value="completado" ${e.estado==='completado'?'selected':''}>Completado</option>
            </select>
            <button class="etapa-delete-btn" data-id="${e.id}" title="Eliminar etapa"><i class="fas fa-times"></i></button>`;
        return `<div class="etapa-item">
            <span class="etapa-nombre">${escapeHtml(e.nombre)}</span>
            <span class="etapa-estado ${e.estado}">${estadoLabels[e.estado] || e.estado}</span>
            ${actions}
        </div>`;
    }).join('');

    list.querySelectorAll('.etapa-estado-sel').forEach(sel => {
        sel.addEventListener('change', async () => {
            const id = parseInt(sel.dataset.id, 10);
            const estado = sel.value;
            const fd = new FormData(); fd.append('id', id); fd.append('estado', estado);
            fd.append('nombre', ''); // override no rename
            const r = await apiFetch(`${API}?action=actualizar_etapa`, fd);
            if (r.status === 'success') { showSuccess('Etapa actualizada'); setTimeout(() => abrirOt(currentOt.id), 0); }
            else showError(r.message || 'Error');
        });
    });
    list.querySelectorAll('.etapa-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar esta etapa?')) return;
            const id = parseInt(btn.dataset.id, 10);
            const fd = new FormData(); fd.append('id', id);
            const r = await apiFetch(`${API}?action=eliminar_etapa`, fd);
            if (r.status === 'success') { showSuccess('Etapa eliminada'); setTimeout(() => abrirOt(currentOt.id), 0); }
            else showError(r.message || 'Error');
        });
    });
}

// ============================================================================
// C7: APOYO TÉCNICO
// ============================================================================
function renderC7Apoyo(items) {
    const c = el('c7-content');
    const countEl = document.querySelector('#section-c7 .ejec-card-head span');
    const totalFiles = items.reduce((sum, a) => sum + (a.archivos || []).length, 0);
    if (countEl && totalFiles > 0) {
        const badge = countEl.querySelector('.apoyo-count');
        if (badge) badge.remove();
        countEl.insertAdjacentHTML('beforeend', ` <span class="apoyo-count" style="font-size:0.7rem;background:rgba(99,102,241,0.18);color:#818cf8;padding:1px 6px;border-radius:999px;">${totalFiles}</span>`);
    }
    if (!items.length) {
        c.innerHTML = `<p class="empty" style="padding:0.8rem;">
            <i class="fas fa-info-circle" style="margin-right:0.3rem;"></i>
            Sin documentación técnica para ${escapeHtml(currentOt?.marca || '')} ${escapeHtml(currentOt?.modelo || '')}.
            Puede agregar apoyo desde el módulo <a href="apoyo_tecnico.html" style="color:var(--accent);">Apoyo Técnico</a> o desde la <a href="vehiculos.html?id=${currentOt?.vehiculo_id || ''}" style="color:var(--accent);">ficha del vehículo</a>.
        </p>`;
        return;
    }
    c.innerHTML = items.map(a => {
        const archs = a.archivos || [];
        const imgs = archs.filter(x => /\.(jpg|jpeg|png|gif|webp)$/i.test(x.nombre_original || x.ruta_archivo));
        const vids = archs.filter(x => /\.(mp4|mov|avi|webm)$/i.test(x.nombre_original || x.ruta_archivo));
        const pdfs = archs.filter(x => /\.pdf$/i.test(x.nombre_original || ''));
        const otros = archs.filter(x => !imgs.includes(x) && !vids.includes(x) && !pdfs.includes(x));
        const isVirtual = a._virtual;
        return `<div class="c7-card">
            <div class="c7-head">
                <span class="c7-tipo">${isVirtual ? '<i class="fas fa-car"></i> Vehículo' : escapeHtml(a.tipo || 'Apoyo')}</span>
                <h4>${escapeHtml(a.nombre)}</h4>
            </div>
            ${a.descripcion ? `<p class="c7-desc">${escapeHtml(a.descripcion)}</p>` : ''}
            ${imgs.length ? `<div class="c7-media">${imgs.map(f =>
                `<div class="c7-thumb" onclick="openLightbox('foto','${escapeHtml(f.ruta_archivo)}','${escapeHtml(f.nombre_original || '')}')"><img src="${escapeHtml(f.ruta_archivo)}" loading="lazy" alt="${escapeHtml(f.nombre_original || '')}"></div>`
            ).join('')}</div>` : ''}
            ${vids.length ? `<div class="c7-media">${vids.map(f =>
                `<div class="c7-thumb"><video src="${escapeHtml(f.ruta_archivo)}" controls preload="none" style="width:100%;border-radius:4px;"></video></div>`
            ).join('')}</div>` : ''}
            ${pdfs.length ? `<div class="c7-files">${pdfs.map(f =>
                `<div class="c7-pdf" style="cursor:pointer;" onclick="openLightbox('pdf','${escapeHtml(f.ruta_archivo)}','${escapeHtml(f.nombre_original || 'PDF')}')"><i class="fas fa-file-pdf"></i> ${escapeHtml(f.nombre_original || 'PDF')}</div>`
            ).join('')}</div>` : ''}
            ${otros.length ? `<div class="c7-files">${otros.map(f =>
                `<a class="c7-link" href="${escapeHtml(f.ruta_archivo)}" target="_blank"><i class="fas fa-paperclip"></i> ${escapeHtml(f.nombre_original || f.tipo_archivo)}</a>`
            ).join('')}</div>` : ''}
        </div>`;
    }).join('');
}

// ============================================================================
// C8: DIAGNÓSTICO FINAL
// ============================================================================
function renderDiagnostico(diag, isClosed) {
    el('diag-causa').value = diag?.causa_raiz || '';
    el('diag-final').value = diag?.diagnostico_final || '';
    el('diag-recom').value = diag?.recomendaciones || '';
    const btn = el('btn-guardar-diagnostico');
    btn.disabled = isClosed;
    btn.style.opacity = isClosed ? '0.5' : '';
}

async function guardarDiagnostico() {
    if (!currentOt) return;
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('causa_raiz', el('diag-causa').value || '');
    fd.append('diagnostico_final', el('diag-final').value || '');
    fd.append('recomendaciones', el('diag-recom').value || '');
    const btn = el('btn-guardar-diagnostico');
    setButtonLoading(btn, true, 'Guardando…');
    const r = await apiFetch(`${API}?action=guardar_diagnostico`, fd);
    setButtonLoading(btn, false, '<i class="fas fa-save"></i> Guardar Diagnóstico');
    if (r.status === 'success') showSuccess('Diagnóstico guardado');
    else showError(r.message || 'Error');
}

// ============================================================================
// C9: NOTAS Y AUDIO
// ============================================================================
function renderC9NotasAudio(audios, isClosed) {
    const list = el('audios-list');
    if (!audios.length) {
        list.innerHTML = '<p class="empty">Sin notas de voz grabadas</p>';
    } else {
        list.innerHTML = audios.map(a =>
            `<div class="audio-item">
                <i class="fas fa-microphone"></i>
                <audio controls src="${escapeHtml(a.ruta_archivo)}"></audio>
                <a href="${escapeHtml(a.ruta_archivo)}" download class="c2-dl"><i class="fas fa-download"></i></a>
                ${!isClosed ? `<button class="item-media-btn" onclick="if(confirm('¿Eliminar?'))eliminarAudio('${escapeHtml(a.id)}')"><i class="fas fa-times"></i></button>` : ''}
            </div>`
        ).join('');
    }
    const draft = DraftManager.load('ejecucion_ot_notas');
    if (draft && draft.notas && !el('notas-libres').value) {
        el('notas-libres').value = draft.notas;
    }
}

async function eliminarAudio(audId) {
    const fd = new FormData();
    fd.append('evidencia_id', audId);
    const r = await apiFetch(`${API}?action=eliminar_evidencia_item`, fd);
    if (r.status === 'success') { showSuccess('Audio eliminado'); setTimeout(() => abrirOt(currentOt.id), 0); }
    else showError(r.message || 'Error');
}

async function guardarNotas() {
    if (!currentOt) return;
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    fd.append('notas', el('notas-libres').value || '');
    await apiFetch(`${API}?action=guardar_notas`, fd);
    DraftManager.clear('ejecucion_ot_notas');
}

// ─── GRABADOR DE AUDIO (MediaRecorder) ────────────────────────────────────
function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        showError('Grabación de audio no soportada en este navegador');
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) mediaChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(mediaChunks, { type: mediaRecorder.mimeType });
            const url = URL.createObjectURL(blob);
            el('recorder-bar').style.display = '';
            el('btn-enviar-grabacion').style.display = '';
            el('btn-enviar-grabacion').dataset.blob = url;
            el('btn-enviar-grabacion')._blob = blob;
            el('recorder-indicator').style.animation = 'none';
            el('recorder-indicator').style.background = '#22c55e';
            el('btn-grabar-texto').textContent = 'Grabar Audio';
        };
        mediaRecorder.start(100);
        recordingSeconds = 0;
        el('recorder-bar').style.display = '';
        el('recorder-timer').textContent = '00:00';
        el('btn-enviar-grabacion').style.display = 'none';
        el('btn-grabar-texto').textContent = 'Detener';
        if (recordingTimer) clearInterval(recordingTimer);
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            el('recorder-timer').textContent = `${String(Math.floor(recordingSeconds/60)).padStart(2,'0')}:${String(recordingSeconds%60).padStart(2,'0')}`;
        }, 1000);
        showToast('Grabando…', 'info');
    }).catch(() => showError('Permiso de micrófono denegado'));
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    }
}

async function sendRecording() {
    if (!mediaRecorder || !el('btn-enviar-grabacion')._blob) { showError('No hay grabación'); return; }
    const blob = el('btn-enviar-grabacion')._blob;
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    if (currentAudioItemId > 0) fd.append('item_id', currentAudioItemId);
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
    fd.append('archivos[]', blob, `nota_voz_${Date.now()}.${ext}`);
    const r = await uploadWithProgress(`${API}?action=subir_nota_voz`, fd);
    if (r.status === 'success') {
        showSuccess('Nota de voz guardada');
        el('recorder-bar').style.display = 'none';
        el('btn-enviar-grabacion').style.display = 'none';
        el('btn-enviar-grabacion')._blob = null;
        currentAudioItemId = 0;
        setTimeout(() => abrirOt(currentOt.id), 0);
    } else showError(r.message || 'Error');
}

async function onSubirNotaVoz() {
    const inp = el('input-nota-voz');
    if (!inp.files.length) { showError('Seleccione un archivo de audio'); return; }
    const fd = new FormData();
    fd.append('ot_id', currentOt.id);
    for (const f of inp.files) fd.append('archivos[]', f);
    const r = await uploadWithProgress(`${API}?action=subir_nota_voz`, fd);
    if (r.status === 'success') { showSuccess('Nota de voz guardada'); inp.value = ''; el('btn-subir-nota-voz').style.display = 'none'; setTimeout(() => abrirOt(currentOt.id), 0); }
    else showError(r.message || 'Error');
}

// ============================================================================
// C10: CLIENTE — Comunicación y portal
// ============================================================================
let c10PollInterval = null;

function renderC10Cliente(ot) {
    // Set portal link
    const btnPortal = el('btn-ver-portal');
    if (btnPortal) {
        btnPortal.href = `portal.html?ot=${encodeURIComponent(ot.folio_ot || 'OT-' + String(ot.id).padStart(5, '0'))}`;
        btnPortal.style.display = '';
    }

    // Load comments
    loadC10Comentarios(ot.id);

    // Load avances
    loadC10Avances(ot.id);

    // Setup send button
    const btnSend = el('c10-btn-send');
    const input = el('c10-chat-input');
    if (btnSend && !btnSend._bound) {
        btnSend._bound = true;
        btnSend.addEventListener('click', () => sendC10Comentario(ot.id));
    }
    if (input && !input._bound) {
        input._bound = true;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendC10Comentario(ot.id); }
        });
    }

    // Poll for new comments every 30s
    if (c10PollInterval) clearInterval(c10PollInterval);
    c10PollInterval = setInterval(() => {
        if (currentOt?.id) loadC10Comentarios(currentOt.id, true);
    }, 30000);
}

function loadC10Comentarios(otId, silent) {
    fetch(`${API_PORTAL}?action=comentarios&ot_id=${otId}`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) renderC10Chat(res.data, silent);
        });
}

const API_PORTAL = API_ROOT + 'portal_api.php';

function renderC10Chat(msgs, silent) {
    const container = el('c10-chat-messages');
    if (!container) return;

    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;

    container.innerHTML = msgs.length ? msgs.map(m => {
        const isCliente = m.autor_tipo === 'cliente';
        const align = isCliente ? 'flex-start' : 'flex-end';
        const bg = isCliente ? 'var(--bg-hover)' : 'var(--primary)';
        const color = isCliente ? 'var(--text-primary)' : '#fff';
        return `<div style="display:flex;justify-content:${align};">
            <div style="max-width:80%;padding:10px 14px;border-radius:14px;background:${bg};color:${color};font-size:0.85rem;line-height:1.5;">
                <div style="font-size:0.72rem;font-weight:700;margin-bottom:2px;opacity:0.8;">${escapeHtml(isCliente ? (m.autor_nombre || 'Cliente') : (m.autor_nombre || 'Taller'))}</div>
                <div>${escapeHtml(m.mensaje || '')}</div>
                <div style="font-size:0.68rem;opacity:0.5;margin-top:4px;text-align:right;">${new Date(m.creado).toLocaleTimeString('es-CL', {hour:'2-digit',minute:'2-digit'})}</div>
            </div>
        </div>`;
    }).join('') : '<div style="text-align:center;color:var(--text-tertiary);padding:2rem;"><i class="fas fa-comments" style="font-size:1.5rem;margin-bottom:0.5rem;display:block;"></i>Sin comentarios aún</div>';

    if (wasAtBottom || !silent) container.scrollTop = container.scrollHeight;

    // Update badge
    const unread = msgs.filter(m => m.autor_tipo === 'cliente' && !m.leido).length;
    const badge = el('cliente-comentarios-badge');
    if (badge) {
        badge.textContent = unread;
        badge.style.display = unread > 0 ? '' : 'none';
    }
}

function sendC10Comentario(otId) {
    const input = el('c10-chat-input');
    const msg = input?.value.trim();
    if (!msg) return;

    // Optimistic add
    const container = el('c10-chat-messages');
    const emptyState = container.querySelector('[style*="text-align:center"]');
    if (emptyState) emptyState.remove();

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:flex-end;';
    wrapper.innerHTML = `<div style="max-width:80%;padding:10px 14px;border-radius:14px;background:var(--primary);color:#fff;font-size:0.85rem;">
        <div style="font-size:0.72rem;font-weight:700;margin-bottom:2px;opacity:0.8;">Taller</div>
        <div>${escapeHtml(msg)}</div>
        <div style="font-size:0.68rem;opacity:0.5;margin-top:4px;text-align:right;">Ahora</div>
    </div>`;
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    input.value = '';

    // Send via API — uses ejecucion_ot_api to post as系统/tecnico
    const fd = new FormData();
    fd.append('action', 'agregar_comentario_cliente');
    fd.append('ot_id', otId);
    fd.append('mensaje', msg);
    apiFetch(`${API}?action=agregar_comentario_cliente`, fd).catch(() => {
        // Fallback: send via portal_api as sistema
        fetch(API_PORTAL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'comentar', ot_id: otId, mensaje: msg, nombre: 'Taller' })
        });
    });
}

function loadC10Avances(otId) {
    fetch(`${API_PORTAL}?action=avances&ot_id=${otId}`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) renderC10Avances(res.data);
        });
}

function renderC10Avances(avances) {
    const container = el('c10-avances');
    if (!container) return;
    if (!avances.length) {
        container.innerHTML = '<div style="font-size:0.82rem;color:var(--text-tertiary);padding:0.5rem;">Sin avances registrados</div>';
        return;
    }
    container.innerHTML = avances.slice(0, 5).map(a => `
        <div style="padding:8px 12px;background:var(--bg-hover);border-radius:8px;margin-bottom:6px;font-size:0.82rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${escapeHtml(a.titulo || 'Avance')}</strong>
                ${a.porcentaje != null ? `<span style="color:var(--primary);font-weight:700;">${a.porcentaje}%</span>` : ''}
            </div>
            ${a.descripcion ? `<div style="color:var(--text-secondary);margin-top:2px;">${escapeHtml(a.descripcion)}</div>` : ''}
            <div style="color:var(--text-tertiary);font-size:0.72rem;margin-top:4px;">${new Date(a.creado).toLocaleString('es-CL')}</div>
        </div>
    `).join('');
}

// ============================================================================
// HELPERS
// ============================================================================
function escapeHtml(str) {
    if (typeof str !== 'string') return str || '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// apiFetch is defined in common.js — global
