// ============================================================================
// vehiculos.js — Ficha Completa de Vehículos
// ============================================================================
const API = API_ROOT + 'vehiculos_api.php';
let currentPage = 1;
let currentRecordId = null;
let currentFichaId = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadLinkedSelects();
    loadDynamicSelects();
    setupSearch();
    setupFormSidebar();
    setupFormSubmit();
    setupFichaTabs();
    setupFichaActions();
    setupNotaModal();
    setupMultimediaTabs();
    setupApoyoTecnicoTab();
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

function loadLinkedSelects() {
    document.querySelectorAll('[data-linked]').forEach(sel => {
        const table = sel.dataset.linked;
        fetch(`${API_ROOT}${table}_api.php?per_page=200`)
            .then(r => r.json()).then(res => {
                if (res.status === 'success' && res.data?.items) {
                    res.data.items.forEach(item => {
                        const opt = document.createElement('option');
                        opt.value = item.id;
                        opt.textContent = `${item.nombre || ''} ${item.apellido || ''}`.trim();
                        sel.appendChild(opt);
                    });
                }
            }).catch(() => {});
    });
}

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
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-car"></i><p>Error al cargar</p></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-car"></i><p>No se encontraron vehículos</p></div>'; return; }
            grid.innerHTML = items.map(v => `
                <div class="record-card" data-id="${v.id}" onclick="openFicha(${v.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        ${v.thumb_url
                            ? `<img src="${escapeHtml(v.thumb_url)}" alt="" loading="lazy" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg-input);">`
                            : `<div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0;">${(v.marca||'V')[0]}${(v.modelo||'')[0]}</div>`
                        }
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${escapeHtml(v.patente || 'S/P')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(v.marca || '')} ${escapeHtml(v.modelo || '')} ${v.anio ? '(' + v.anio + ')' : ''}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(v.cliente_nombre || '')} ${escapeHtml(v.cliente_apellido || '')}</div>
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
    el('btnFichaDelete').addEventListener('click', () => {
        if (!currentFichaId) return;
        if (!confirm('¿Eliminar este vehículo y todo su historial?')) return;
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', currentFichaId);
        fetch(API, { method: 'POST', body: fd }).then(r => r.json()).then(res => {
            if (res.status === 'success') { closeFicha(); } else { alert(res.message); }
        });
    });
    el('btnFichaPdf').addEventListener('click', () => {
        if (!currentFichaId) return;
        window.open(`api/pdf_api.php?type=vehiculo&id=${currentFichaId}`, '_blank');
    });
    el('btnNuevo').addEventListener('click', () => {
        currentRecordId = null;
        currentFichaId = null;
        el('dataForm').reset();
        el('record_id').value = '';
        // Open in ficha mode for new record
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nuevo Vehículo';
        el('fichaSub').textContent = 'Complete los datos del vehículo';
        el('fichaAvatar').textContent = 'VH';
        el('fichaStats').innerHTML = '';
        el('badgeRecep').textContent = '0';
        el('badgeTrab').textContent = '0';
        // Activate datos tab
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
        const v = json.data;

        // Header
        el('fichaTitle').textContent = `${v.patente || 'S/P'} — ${v.marca || ''} ${v.modelo || ''}`;
        el('fichaSub').textContent = `${v.cliente_nombre || ''} ${v.cliente_apellido || ''} | ${v.anio || ''} | ${v.color || ''}`;
        el('fichaAvatar').textContent = (v.patente || 'VH').substring(0, 3).toUpperCase();

        // Form
        el('record_id').value = v.id;
        el('cliente_id').value = v.cliente_id || '';
        el('marca').value = v.marca || '';
        el('modelo').value = v.modelo || '';
        el('anio').value = v.anio || '';
        el('patente').value = v.patente || '';
        el('vin').value = v.vin || '';
        el('color').value = v.color || '';
        el('combustible').value = v.combustible || '';
        el('kilometraje').value = v.kilometraje || '';
        el('cilindrada_motor').value = v.cilindrada_motor || '';
        el('transmision').value = v.transmision || '';
        el('traccion').value = v.traccion || '';
        el('tipo_carroceria').value = v.tipo_carroceria || '';
        el('procedencia').value = v.procedencia || '';
        el('disenoestructural').value = v.disenoestructural || '';
        el('notas_tecnico').value = v.notas_tecnico || '';

        // Stats
        const [receps, trab] = await Promise.all([
            fetch(`${API}?action=recepciones&id=${id}`).then(r => r.json()),
            fetch(`${API}?action=trabajos&id=${id}`).then(r => r.json())
        ]);
        const rCount = Array.isArray(receps.data) ? receps.data.length : 0;
        const tCount = Array.isArray(trab.data) ? trab.data.length : 0;
        el('badgeRecep').textContent = rCount;
        el('badgeTrab').textContent = tCount;
        el('fichaStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${rCount}</div><div class="stat-lbl">Recepciones</div></div>
            <div class="stat-card"><div class="stat-val">${tCount}</div><div class="stat-lbl">Trabajos</div></div>
            <div class="stat-card"><div class="stat-val">${v.kilometraje ? formatMoney(v.kilometraje) : '—'}</div><div class="stat-lbl">Kilometraje</div></div>
            <div class="stat-card"><div class="stat-val">${v.anio || '—'}</div><div class="stat-lbl">Año</div></div>
        `;

        // Load tab data
        loadRecepciones(id);
        loadTrabajos(id);
        loadNotas(id);
        renderExistingMedia(v.archivos || []);
        loadApoyoTecnicoMedia(id);
    } catch (e) { console.error('Ficha error:', e); }
}

// ── Recepciones con Silueta ──────────────────────────────────────────────────
async function loadRecepciones(vehiculoId) {
    const container = el('recepcionesList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=recepciones&id=${vehiculoId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>Sin recepciones registradas</p></div>';
            return;
        }
        container.innerHTML = json.data.map(r => `
            <div class="timeline-item" onclick="window.open('recepcion_unificada.html?view=${r.id}','_blank')">
                <div class="tl-header">
                    <span class="tl-title">${escapeHtml(r.folio || 'REC-' + r.id)}</span>
                    <span class="tl-date">${escapeHtml(r.fecha || '')} ${escapeHtml(r.hora || '')}</span>
                </div>
                <div class="tl-body">
                    <span class="badge badge-${(r.eval_estado_general||'').toLowerCase()}">${escapeHtml(r.eval_estado_general || '—')}</span>
                    ${r.numero_orden_interna ? '<span style="margin-left:0.5rem;">OT: ' + escapeHtml(r.numero_orden_interna) + '</span>' : ''}
                    ${r.eval_motivo_visita ? '<br><small>' + escapeHtml(r.eval_motivo_visita) + '</small>' : ''}
                </div>
                <div class="tl-photos">
                    ${renderSilhouetteSlot(r.foto_frontal, 'Frontal')}
                    ${renderSilhouetteSlot(r.foto_lateral_izq, 'Lat. Izq')}
                    ${renderSilhouetteSlot(r.foto_superior, 'Superior')}
                    ${renderSilhouetteSlot(r.foto_lateral_der, 'Lat. Der')}
                    ${renderSilhouetteSlot(r.foto_trasera, 'Trasera')}
                </div>
            </div>
        `).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar recepciones</p></div>'; }
}

function renderSilhouetteSlot(photo, label) {
    if (!photo) return `<div class="silhouette-slot empty"><i class="fas fa-camera"></i><span>${label}</span></div>`;
    return `<div class="silhouette-slot" onclick="event.stopPropagation();showImg('${photo}')"><img src="${photo}" alt="${label}"><div class="slot-label">${label}</div></div>`;
}

function showImg(src) {
    el('imgModalSrc').src = src;
    el('imgModal').style.display = 'flex';
}

// ── Trabajos ─────────────────────────────────────────────────────────────────
async function loadTrabajos(vehiculoId) {
    const container = el('trabajosList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=trabajos&id=${vehiculoId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-tools"></i><p>Sin trabajos registrados</p></div>';
            return;
        }
        container.innerHTML = json.data.map(t => `
            <div class="timeline-item" onclick="window.open('ordenes_trabajo.html?view=${t.id}','_blank')">
                <div class="tl-header">
                    <span class="tl-title">${escapeHtml(t.numero_orden || 'OT-' + t.id)}</span>
                    <span class="tl-date">${escapeHtml(t.creado || '')}</span>
                </div>
                <div class="tl-body">
                    <span class="badge badge-${(t.estado||'').toLowerCase().replace(/\s/g,'-')}">${escapeHtml(t.estado || '—')}</span>
                    ${t.total ? '<span style="margin-left:0.5rem;">$' + Number(t.total).toLocaleString() + '</span>' : ''}
                    ${t.descripcion ? '<br><small>' + escapeHtml(t.descripcion.substring(0, 120)) + '</small>' : ''}
                </div>
            </div>
        `).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar trabajos</p></div>'; }
}

// ── Notas ────────────────────────────────────────────────────────────────────
async function loadNotas(vehiculoId) {
    const container = el('notasList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API}?action=notas&id=${vehiculoId}`);
        const json = await res.json();
        if (json.status !== 'success' || !json.data?.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-sticky-note"></i><p>Sin notas técnicas</p></div>';
            return;
        }
        container.innerHTML = json.data.map(n => `
            <div class="note-card">
                <div class="note-header">
                    <strong>${escapeHtml(n.titulo)}</strong>
                    <div>
                        <span class="note-cat ${n.categoria}">${escapeHtml(n.categoria.replace(/_/g,' '))}</span>
                        <button class="btn btn-sm btn-outline" onclick="editNota(${n.id},'${escapeHtml(n.titulo)}','${escapeHtml(n.categoria)}','${escapeHtml((n.contenido||'').replace(/'/g,"\\'"))}')" style="margin-left:0.3rem;"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger-outline" onclick="deleteNota(${n.id})" style="margin-left:0.2rem;"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary);white-space:pre-wrap;">${escapeHtml(n.contenido || '')}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.5rem;">${escapeHtml(n.creado || '')}</div>
            </div>
        `).join('');
    } catch (e) { container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar notas</p></div>'; }
}

function setupNotaModal() {
    el('btnAddNota').addEventListener('click', () => {
        el('nota_id').value = '';
        el('nota_titulo').value = '';
        el('nota_categoria').value = 'general';
        el('nota_contenido').value = '';
        el('notaModalTitle').textContent = 'Nueva Nota';
        el('notaModal').style.display = 'flex';
    });
    el('btnSaveNota').addEventListener('click', saveNota);
}

function editNota(id, titulo, categoria, contenido) {
    el('nota_id').value = id;
    el('nota_titulo').value = titulo;
    el('nota_categoria').value = categoria;
    el('nota_contenido').value = contenido;
    el('notaModalTitle').textContent = 'Editar Nota';
    el('notaModal').style.display = 'flex';
}

async function saveNota() {
    const fd = new FormData();
    fd.append('action', 'save_nota');
    fd.append('vehiculo_id', currentFichaId);
    if (el('nota_id').value) fd.append('nota_id', el('nota_id').value);
    fd.append('titulo', el('nota_titulo').value);
    fd.append('categoria', el('nota_categoria').value);
    fd.append('contenido', el('nota_contenido').value);
    try {
        const res = await fetch(API, { method: 'POST', body: fd });
        const json = await res.json();
        if (json.status === 'success') {
            el('notaModal').style.display = 'none';
            loadNotas(currentFichaId);
        } else { alert(json.message); }
    } catch (e) { alert('Error al guardar'); }
}

async function deleteNota(id) {
    if (!confirm('¿Eliminar esta nota?')) return;
    const fd = new FormData();
    fd.append('action', 'delete_nota');
    fd.append('nota_id', id);
    await fetch(API, { method: 'POST', body: fd });
    loadNotas(currentFichaId);
}

// ── Form Submit ──────────────────────────────────────────────────────────────
function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = el('btnSave') || el('btnGuardarDatos');
        if (btn) setButtonLoading(btn, true, 'Guardando...');
        const fd = new FormData(el('dataForm'));
        if (el('record_id').value) fd.append('id', el('record_id').value);
        // Agregar archivos del input de archivos del formulario (si existe dentro del form)
        const formFi = el('dataForm').querySelector('.upload-file-input');
        if (formFi?.files.length) Array.from(formFi.files).forEach(f => fd.append('archivos[]', f));
        try {
            const json = await uploadWithProgress(API, fd);
            if (json.status === 'success') {
                showSuccess(json.message || 'Guardado');
                if (json.data?.id && !currentFichaId) currentFichaId = json.data.id;
                if (currentFichaId) loadFichaData(currentFichaId);
            } else { showError(json.message); }
        } catch (e) { showError('Error al guardar'); }
        finally { if (btn) setButtonLoading(btn, false); }
    });
}

// ── Form Sidebar (legacy compat) ─────────────────────────────────────────────
function setupFormSidebar() {
    const toggle = el('menuToggle');
    const sidebar = el('sidebar');
    if (toggle) toggle.addEventListener('click', () => sidebar.classList.toggle('mobile-active'));
    const closeBtn = el('btnCloseMobile');
    if (closeBtn) closeBtn.addEventListener('click', () => closeFicha());
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
        const isVid = /\.(mp4|mov|avi)$/i.test(f.nombre_original || f.ruta_archivo);
        if (isImg) return `<div class="media-thumb" onclick="showImg('${f.ruta_archivo}')"><img src="${f.ruta_archivo}" alt="${escapeHtml(f.nombre_original)}"></div>`;
        if (isVid) return `<div class="media-thumb"><video src="${f.ruta_archivo}" controls style="width:100%;border-radius:var(--radius-sm);"></video></div>`;
        return `<div class="media-thumb" onclick="window.open('${f.ruta_archivo}','_blank')"><i class="fas fa-file" style="font-size:2rem;color:var(--primary);"></i><small>${escapeHtml(f.nombre_original||'doc')}</small></div>`;
    }).join('');
}
function renderPagination(total, page, perPage, containerId, callback) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, containerId, callback); }

// ── Multimedia Tabs (upload independiente por pestaña) ──────────────────────
function setupMultimediaTabs() {
    // Toolbar para la pestaña Multimedia principal
    const mainFi = el('uploadZone')?.querySelector('input[type="file"]') || document.querySelector('#uploadZone .upload-file-input');
    const mainTb = el('multimediaToolbar');
    if (mainTb && mainFi) {
        setupMultimediaToolbar(mainTb, mainFi);
    }
    // Agregar botón de subir archivos para cada zona multimedia
    _addUploadBtn('uploadZone', 'vehiculo');
    _addUploadBtn('apoyoTechUploadZone', 'apoyo_tecnico');
}

function _addUploadBtn(zoneId, module) {
    const zone = el(zoneId);
    if (!zone) return;
    // No duplicar si ya existe
    if (zone.querySelector('.upload-confirm-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-primary upload-confirm-btn';
    btn.style.cssText = 'margin-top:0.5rem;display:none;width:100%;';
    btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Subir archivos';
    btn.addEventListener('click', () => _uploadZoneFiles(zone, module));
    zone.parentNode.insertBefore(btn, zone.nextSibling);
    // Observar el file input para mostrar/ocultar el botón
    const fi = zone.querySelector('input[type="file"]') || document.querySelector(`#${zoneId} .upload-file-input`);
    if (fi) {
        fi.addEventListener('change', () => {
            btn.style.display = fi.files.length ? '' : 'none';
        });
    }
}

async function _uploadZoneFiles(zone, module) {
    const fi = zone.querySelector('input[type="file"]') || document.querySelector(`#${zone.id} .upload-file-input`);
    if (!fi?.files.length) { showError('Selecciona archivos primero'); return; }
    if (!currentFichaId) { showError('Guarda el vehículo primero'); return; }
    const fd = new FormData();
    fd.append('action', 'upload_media');
    fd.append('id', currentFichaId);
    fd.append('module', module);
    Array.from(fi.files).forEach(f => fd.append('archivos[]', f));
    try {
        const json = await uploadWithProgress(API, fd);
        if (json.status === 'success') {
            showSuccess(json.message || 'Archivos subidos');
            fi.value = '';
            zone.querySelector('.new-preview-grid')?.remove();
            const confirmBtn = zone.parentNode.querySelector('.upload-confirm-btn');
            if (confirmBtn) confirmBtn.style.display = 'none';
            loadFichaData(currentFichaId);
        } else showError(json.message);
    } catch (e) { showError('Error al subir archivos'); }
}

// ── Apoyo Técnico Tab ────────────────────────────────────────────────────────
function setupApoyoTecnicoTab() {
    const fi = el('apoyoTechUploadZone')?.querySelector('input[type="file"]') || document.querySelector('#apoyoTechUploadZone .upload-file-input');
    const tb = el('apoyoTechToolbar');
    if (tb && fi) {
        setupMultimediaToolbar(tb, fi);
    }
}

async function loadApoyoTecnicoMedia(vehiculoId) {
    if (!vehiculoId) return;
    const container = el('apoyoTechMediaContainer');
    const grid = el('apoyoTechMediaGrid');
    if (!container || !grid) return;
    try {
        const res = await fetch(`${API_ROOT}opciones_api.php?action=list_media&module=apoyo_tecnico&vehiculo_id=${vehiculoId}&t=${Date.now()}`);
        const d = await res.json();
        if (d.status === 'success' && d.data?.length) {
            container.style.display = '';
            grid.innerHTML = d.data.map(f => {
                const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(f.nombre_original || f.ruta_archivo);
                const isVid = /\.(mp4|mov|avi)$/i.test(f.nombre_original || f.ruta_archivo);
                if (isImg) return `<div class="media-thumb" onclick="showImg('${f.ruta_archivo}')"><img src="${f.ruta_archivo}" alt="${escapeHtml(f.nombre_original)}"></div>`;
                if (isVid) return `<div class="media-thumb"><video src="${f.ruta_archivo}" controls style="width:100%;border-radius:var(--radius-sm);"></video></div>`;
                return `<div class="media-thumb" onclick="window.open('${f.ruta_archivo}','_blank')"><i class="fas fa-file" style="font-size:2rem;color:var(--primary);"></i><small>${escapeHtml(f.nombre_original||'doc')}</small></div>`;
            }).join('');
        } else {
            container.style.display = 'none';
        }
    } catch(e) { console.error('Error loading apoyo tecnico media:', e); }
}
