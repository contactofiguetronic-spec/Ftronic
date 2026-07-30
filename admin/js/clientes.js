// ============================================================================
// clientes.js — Ficha Completa de Clientes
// ============================================================================
const API = API_ROOT + 'clientes_api.php';
const VH_API = API_ROOT + 'vehiculos_api.php';
const REC_API = API_ROOT + 'recepcion_unificada_api.php';
const PRES_API = API_ROOT + 'presupuestos_api.php';
const OT_API = API_ROOT + 'ordenes_trabajo_api.php';
let currentPage = 1;
let currentFichaId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadDynamicSelects();
    setupSearch();
    setupFormSidebar();
    setupFormSubmit();
    setupFichaTabs();
    setupFichaActions();
    // Open ficha if ?id= parameter
    const urlId = new URLSearchParams(window.location.search).get('id');
    if (urlId) { openFicha(urlId); } else { loadData(); }
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
});

function loadDynamicSelects() {
    document.querySelectorAll('[data-category]').forEach(sel => {
        const cat = sel.dataset.category;
        fetch(`${API_ROOT}opciones_api.php?categoria=${cat}&action=opciones`)
            .then(r => r.json()).then(res => {
                if (res.status === 'success' && Array.isArray(res.data)) {
                    res.data.forEach(opt => {
                        const o = document.createElement('option');
                        o.value = opt.valor || opt;
                        o.textContent = opt.valor || opt;
                        sel.appendChild(o);
                    });
                }
            }).catch(() => {});
    });
}

// ── Card Grid ────────────────────────────────────────────────────────────────
function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Error al cargar</p></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No se encontraron clientes</p></div>'; return; }
            grid.innerHTML = items.map(c => `
                <div class="card" data-id="${c.id}" onclick="openFicha(${c.id})">
                    <div class="card-title">${escapeHtml(c.nombre || '')} ${escapeHtml(c.apellido || '')}</div>
                    <div class="card-sub">${escapeHtml(c.rut || '')}</div>
                    <div class="card-sub"><small>${escapeHtml(c.telefono || '')}</small></div>
                    <div class="card-sub"><small>${escapeHtml(c.correo || '')}</small></div>
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
    el('btnFichaDelete').addEventListener('click', () => {
        if (!currentFichaId) return;
        if (!confirm('¿Eliminar este cliente y todo su historial?')) return;
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', currentFichaId);
        fetch(API, { method: 'POST', body: fd }).then(r => r.json()).then(res => {
            if (res.status === 'success') { closeFicha(); } else { alert(res.message); }
        });
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset();
        el('record_id').value = '';
        el('formTitle').innerHTML = '<i class="fas fa-users"></i> Nuevo Cliente';
        el('btnEliminar').style.display = 'none';
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nuevo Cliente';
        el('fichaSub').textContent = 'Complete los datos del cliente';
        el('fichaAvatar').textContent = 'CL';
        el('fichaStats').innerHTML = '';
        el('fichaContacts').innerHTML = '';
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.ficha-tab[data-tab="datos"]').classList.add('active');
        el('tabDatos').classList.add('active');
    });
}

async function loadFichaData(id) {
    try {
        const [cliRes, resumenRes] = await Promise.all([
            fetch(`${API}?id=${id}`).then(r => r.json()),
            fetch(`${API}?action=resumen&id=${id}`).then(r => r.json())
        ]);
        if (cliRes.status !== 'success') return;
        const c = cliRes.data;
        const r = resumenRes.data || {};

        // Header
        el('fichaTitle').textContent = `${c.nombre || ''} ${c.apellido || ''}`;
        el('fichaSub').textContent = `${c.rut || ''} | ${c.telefono || ''} | ${c.correo || ''}`;
        el('fichaAvatar').textContent = ((c.nombre || '') + (c.apellido || '')).substring(0, 2).toUpperCase();

        // Contact links
        let contacts = '';
        if (c.telefono) contacts += `<a href="tel:${c.telefono}"><i class="fas fa-phone"></i> ${escapeHtml(c.telefono)}</a>`;
        if (c.correo) contacts += `<a href="mailto:${c.correo}"><i class="fas fa-envelope"></i> ${escapeHtml(c.correo)}</a>`;
        if (c.facebook) contacts += `<a href="https://facebook.com/${escapeHtml(c.facebook)}" target="_blank"><i class="fab fa-facebook"></i> ${escapeHtml(c.facebook)}</a>`;
        if (c.instagram) contacts += `<a href="https://instagram.com/${escapeHtml(c.instagram)}" target="_blank"><i class="fab fa-instagram"></i> ${escapeHtml(c.instagram)}</a>`;
        el('fichaContacts').innerHTML = contacts;

        // Form
        el('record_id').value = c.id;
        el('nombre').value = c.nombre || '';
        el('apellido').value = c.apellido || '';
        el('rut').value = c.rut || '';
        el('telefono').value = c.telefono || '';
        el('correo').value = c.correo || '';
        el('banco').value = c.banco || '';
        el('cuentabancaria').value = c.cuentabancaria || '';
        el('domicilio').value = c.domicilio || '';
        el('facebook').value = c.facebook || '';
        el('instagram').value = c.instagram || '';
        el('detalles_personales').value = c.dalles_personales || c.detalles_personales || '';

        // Setup field voice notes for text fields
        if (typeof setupFieldVoiceNote === 'function') {
            setupFieldVoiceNote({ textareaId: 'domicilio', label: 'Domicilio', entidadTipo: 'clientes' });
            setupFieldVoiceNote({ textareaId: 'detalles_personales', label: 'Detalles Personales', entidadTipo: 'clientes' });
            loadFieldVoiceNotes(c.id, 'clientes', 'domicilio', 'voice-list-domicilio');
            loadFieldVoiceNotes(c.id, 'clientes', 'detalles_personales', 'voice-list-detalles_personales');
        }

        // Stats
        el('badgeVeh').textContent = r.vehiculos || 0;
        el('badgeRecep').textContent = r.recepciones || 0;
        el('badgePres').textContent = r.presupuestos || 0;
        el('badgeOT').textContent = r.ordenes_trabajo || 0;
        el('fichaStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${r.vehiculos || 0}</div><div class="stat-lbl">Vehículos</div></div>
            <div class="stat-card"><div class="stat-val">${r.recepciones || 0}</div><div class="stat-lbl">Recepciones</div></div>
            <div class="stat-card"><div class="stat-val">${r.presupuestos || 0}</div><div class="stat-lbl">Presupuestos</div></div>
            <div class="stat-card"><div class="stat-val">${r.ordenes_trabajo || 0}</div><div class="stat-lbl">Órdenes Trabajo</div></div>
            <div class="stat-card"><div class="stat-val">${formatMoney(r.total_ventas || 0)}</div><div class="stat-lbl">Total Ventas</div></div>
        `;

        // Load tabs
        loadVehiculos(id);
        loadRecepciones(id);
        loadPresupuestos(id);
        loadOTs(id);
        loadVentas(id);
        renderExistingMedia(c.archivos || []);
    } catch (e) { console.error('Ficha error:', e); }
}

// ── Vehículos ────────────────────────────────────────────────────────────────
async function loadVehiculos(clienteId) {
    const container = el('vehiculosList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=vehiculos&id=${clienteId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-car"></i><p>Sin vehículos registrados</p></div>';
            return;
        }
        container.innerHTML = json.data.map(v => `
            <div class="vehicle-mini-card" onclick="window.open('vehiculos.html?id=${v.id}','_blank')">
                <div class="vmc-icon"><i class="fas fa-car"></i></div>
                <div class="vmc-info">
                    <h4>${escapeHtml(v.patente || 'S/P')} — ${escapeHtml(v.marca || '')} ${escapeHtml(v.modelo || '')}</h4>
                    <small>${v.anio ? v.anio + ' | ' : ''}${escapeHtml(v.color || '')} | ${escapeHtml(v.combustible || '')} ${v.kilometraje ? '| ' + formatMoney(v.kilometraje) + ' km' : ''}</small>
                </div>
            </div>
        `).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error</p></div>'; }
}

// ── Recepciones ──────────────────────────────────────────────────────────────
async function loadRecepciones(clienteId) {
    const container = el('recepcionesList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=recepciones&id=${clienteId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>Sin recepciones</p></div>';
            return;
        }
        container.innerHTML = '<div class="timeline">' + json.data.map(r => `
            <div class="timeline-item" onclick="window.open('recepcion_unificada.html?view=${r.id}','_blank')">
                <div class="tl-header">
                    <span class="tl-title">${escapeHtml(r.folio || 'REC-' + r.id)}</span>
                    <span class="tl-date">${escapeHtml(r.fecha || '')}</span>
                </div>
                <div class="tl-body">
                    <span class="badge badge-${(r.eval_estado_general||'').toLowerCase()}">${escapeHtml(r.eval_estado_general || '—')}</span>
                    ${r.vehiculo_patente ? ' <small>' + escapeHtml(r.vehiculo_patente) + ' ' + escapeHtml(r.vehiculo_marca || '') + ' ' + escapeHtml(r.vehiculo_modelo || '') + '</small>' : ''}
                    ${r.numero_orden_interna ? ' | OT: ' + escapeHtml(r.numero_orden_interna) : ''}
                    ${r.eval_motivo_visita ? '<br><small>' + escapeHtml(r.eval_motivo_visita) + '</small>' : ''}
                </div>
            </div>
        `).join('') + '</div>';
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error</p></div>'; }
}

// ── Presupuestos ─────────────────────────────────────────────────────────────
async function loadPresupuestos(clienteId) {
    const container = el('presupuestosList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=presupuestos&id=${clienteId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><p>Sin presupuestos</p></div>';
            return;
        }
        container.innerHTML = '<div class="timeline">' + json.data.map(p => `
            <div class="timeline-item" onclick="window.open('presupuestos.html?view=${p.id}','_blank')">
                <div class="tl-header">
                    <span class="tl-title">${escapeHtml(p.numero_presupuesto || 'PPTO-' + p.id)}</span>
                    <span class="tl-date">${escapeHtml(p.fecha || p.creado || '')}</span>
                </div>
                <div class="tl-body">
                    <span class="badge badge-${(p.estado||'').toLowerCase().replace(/\s/g,'-')}">${escapeHtml(p.estado || '—')}</span>
                    ${p.total ? ' <strong>' + formatMoney(p.total) + '</strong>' : ''}
                    ${p.patente ? ' | <small>' + escapeHtml(p.patente) + ' ' + escapeHtml(p.marca || '') + ' ' + escapeHtml(p.modelo || '') + '</small>' : ''}
                </div>
            </div>
        `).join('') + '</div>';
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error</p></div>'; }
}

// ── Órdenes de Trabajo ───────────────────────────────────────────────────────
async function loadOTs(clienteId) {
    const container = el('otsList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=ordenes_trabajo&id=${clienteId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-tools"></i><p>Sin órdenes de trabajo</p></div>';
            return;
        }
        container.innerHTML = '<div class="timeline">' + json.data.map(t => `
            <div class="timeline-item" onclick="window.open('ordenes_trabajo.html?view=${t.id}','_blank')">
                <div class="tl-header">
                    <span class="tl-title">${escapeHtml(t.numero_orden || 'OT-' + t.id)}</span>
                    <span class="tl-date">${escapeHtml(t.creado || '')}</span>
                </div>
                <div class="tl-body">
                    <span class="badge badge-${(t.estado||'').toLowerCase().replace(/\s/g,'-')}">${escapeHtml(t.estado || '—')}</span>
                    ${t.total ? ' <strong>' + formatMoney(t.total) + '</strong>' : ''}
                    ${t.patente ? ' | <small>' + escapeHtml(t.patente) + ' ' + escapeHtml(t.marca || '') + ' ' + escapeHtml(t.modelo || '') + '</small>' : ''}
                </div>
            </div>
        `).join('') + '</div>';
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error</p></div>'; }
}

// ── Ventas ───────────────────────────────────────────────────────────────────
async function loadVentas(clienteId) {
    const container = el('ventasList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=ventas&id=${clienteId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-cash-register"></i><p>Sin ventas registradas</p></div>';
            return;
        }
        container.innerHTML = '<div class="timeline">' + json.data.map(v => `
            <div class="timeline-item">
                <div class="tl-header">
                    <span class="tl-title">${escapeHtml(v.concepto || 'Venta-' + v.id)}</span>
                    <span class="tl-date">${escapeHtml(v.fecha || v.creado || '')}</span>
                </div>
                <div class="tl-body">
                    <strong>${formatMoney(v.valor)}</strong>
                    ${v.forma_pago ? ' | ' + escapeHtml(v.forma_pago) : ''}
                    <span class="badge badge-${(v.estado_pago||'').toLowerCase()}" style="margin-left:0.5rem;">${escapeHtml(v.estado_pago || '—')}</span>
                    ${v.numero_documento ? '<br><small>Doc: ' + escapeHtml(v.numero_documento) + '</small>' : ''}
                </div>
            </div>
        `).join('') + '</div>';
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error</p></div>'; }
}

// ── Form Submit ──────────────────────────────────────────────────────────────
function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(el('dataForm'));
        if (el('record_id').value) fd.append('id', el('record_id').value);
        try {
            const res = await fetch(API, { method: 'POST', body: fd });
            const json = await res.json();
            if (json.status === 'success') {
                if (json.data?.id && !currentFichaId) currentFichaId = json.data.id;
                if (currentFichaId) loadFichaData(currentFichaId);
            } else { alert(json.message); }
        } catch (e) { alert('Error al guardar'); }
    });
}

function setupFormSidebar() {
    el('menuToggle')?.addEventListener('click', () => el('sidebar').classList.toggle('mobile-active'));
    el('btnCloseMobile')?.addEventListener('click', closeFicha);
    el('btnReset')?.addEventListener('click', () => { if (currentFichaId) loadFichaData(currentFichaId); });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function renderExistingMedia(files) {
    const container = el('existingMediaGrid');
    const wrapper = el('existingMediaContainer');
    if (!files.length) { wrapper.style.display = 'none'; return; }
    wrapper.style.display = '';
    container.innerHTML = files.map(f => {
        const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(f.nombre_original || f.ruta_archivo);
        if (isImg) return `<div class="media-thumb" onclick="el('imgModalSrc').src='${f.ruta_archivo}';el('imgModal').style.display='flex'"><img src="${f.ruta_archivo}" alt="${escapeHtml(f.nombre_original)}"></div>`;
        return `<div class="media-thumb" onclick="window.open('${f.ruta_archivo}','_blank')"><i class="fas fa-file" style="font-size:2rem;color:var(--primary);"></i><small>${escapeHtml(f.nombre_original||'doc')}</small></div>`;
    }).join('');
}
function renderPagination(total, page, perPage, containerId, callback) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, containerId, callback); }
