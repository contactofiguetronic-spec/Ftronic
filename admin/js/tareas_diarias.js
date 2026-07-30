const API = API_ROOT + 'tareas_diarias_api.php';
let currentPage = 1, selectedId = null, allItems = [];
let currentFilter = '';
let currentTarea = null;
let avanceFiles = [];
let commentFiles = [];

const STATUS_COLORS = {
    pendiente:   { bg:'rgba(245,158,11,.12)', text:'#b45309', label:'Pendiente' },
    en_progreso: { bg:'rgba(75,123,236,.12)', text:'#1e40af', label:'En Progreso' },
    detenida:    { bg:'rgba(239,68,68,.12)', text:'#991b1b', label:'Detenida' },
    completada:  { bg:'rgba(16,185,129,.12)', text:'#065f46', label:'Completada' },
    cancelada:   { bg:'rgba(107,114,128,.12)', text:'#374151', label:'Cancelada' },
};
const PRIORITY_COLORS = {
    urgente: { bg:'#dc2626', text:'#fff', label:'Urgente' },
    alta:    { bg:'#f59e0b', text:'#fff', label:'Alta' },
    normal:  { bg:'#6b7280', text:'#fff', label:'Normal' },
    baja:    { bg:'#d1d5db', text:'#374151', label:'Baja' },
};
const AVATAR_COLORS = ['#4B7BEC','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'];

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadLinkedSelect('asignado_empleado_id', 'empleados'),
        loadDynamicOptions('proceso', 'proceso_tarea'),
        loadDynamicOptions('tipo', 'tipo_tarea'),
    ]);

    await loadData();
    setupReactiveRefresh(loadData);

    el('taskFilters')?.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        el('taskFilters').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.status || '';
        currentPage = 1;
        loadData(1, el('searchInput')?.value || '');
    });

    const si = el('searchInput');
    if (si) si.addEventListener('input', debounce(e => { currentPage = 1; loadData(1, e.target.value); }, 400));

    el('btnNueva')?.addEventListener('click', () => openFicha());
    el('btnSolicitarCompra')?.addEventListener('click', crearOCDesdeTarea);
    el('btnBackList')?.addEventListener('click', closeFicha);
    el('btnFichaDelete')?.addEventListener('click', handleDelete);
    el('dataForm')?.addEventListener('submit', handleFormSubmit);
    el('btnReset')?.addEventListener('click', closeFicha);

    document.querySelectorAll('.detail-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = el('tab' + capitalize(tab.dataset.tab));
            if (panel) panel.classList.add('active');
        });
    });

    el('btnNuevoAvance')?.addEventListener('click', openAvanceModal);
    el('avanceForm')?.addEventListener('submit', handleAvanceSubmit);
    el('avanceUploadZone')?.addEventListener('click', () => el('avanceFileInput')?.click());
    el('avanceFileInput')?.addEventListener('change', e => handleAvanceFiles(e.target.files));
    el('avanceModalClose')?.addEventListener('click', closeAvanceModal);
    el('avanceCancel')?.addEventListener('click', closeAvanceModal);
    el('avanceModal')?.addEventListener('click', e => { if (e.target === el('avanceModal')) closeAvanceModal(); });

    el('btnCommentMedia')?.addEventListener('click', () => el('commentFileInput')?.click());
    el('commentFileInput')?.addEventListener('change', e => handleCommentFileSelect(e.target.files));
    el('btnSendComment')?.addEventListener('click', addComment);
    el('commentInput')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } });

    el('mediaUploadZone')?.addEventListener('click', () => el('mediaFileInput')?.click());
    el('mediaFileInput')?.addEventListener('change', handleMediaUpload);
    el('mediaUploadZone')?.addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; });
    el('mediaUploadZone')?.addEventListener('dragleave', e => { e.currentTarget.style.borderColor = ''; });
    el('mediaUploadZone')?.addEventListener('drop', e => { e.preventDefault(); e.currentTarget.style.borderColor = ''; handleMediaUpload({ target: { files: e.dataTransfer.files } }); });
});

// ============================================================================
// LIST RENDERING
// ============================================================================
function renderCardGrid(items) {
    const grid = el('cardGrid');
    if (!grid) return;
    if (!items.length) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-inbox"></i><p>No hay tareas para mostrar</p></div>';
        return;
    }
    grid.innerHTML = items.map(item => {
        const status = STATUS_COLORS[item.estado] || STATUS_COLORS.pendiente;
        const priority = PRIORITY_COLORS[item.prioridad] || PRIORITY_COLORS.normal;
        const initials = getInitials(item.empleado_nombre || item.empleado_apellido || 'S/A');
        const avatarColor = AVATAR_COLORS[(item.asignado_empleado_id || 0) % AVATAR_COLORS.length];
        const fecha = formatDateShort(item.fecha);
        const desde = timeAgo(item.creado);
        const pct = item.avances?.[0]?.porcentaje;
        let progressHtml = '';
        if (pct != null) {
            const pColor = pct >= 100 ? '#10b981' : pct >= 50 ? '#4B7BEC' : '#f59e0b';
            progressHtml = `<div class="tc-progress"><div class="tc-progress-bar"><div class="tc-progress-fill" style="width:${pct}%;background:${pColor}"></div></div></div>`;
        }
        return `
        <div class="task-card ${selectedId === item.id ? 'selected' : ''}" data-id="${item.id}" onclick="openFicha(${item.id})">
            <div class="tc-header">
                <div class="tc-avatar" style="background:${avatarColor}">${initials}</div>
                <div class="tc-meta">
                    <div class="tc-folio">${esc(item.folio || 'TAR-' + String(item.id).padStart(5,'0'))}</div>
                    <div class="tc-title">${esc(item.nombre)}</div>
                    <div class="tc-assignee"><i class="fas fa-user"></i> ${esc(item.empleado_nombre || 'Sin asignar')}</div>
                </div>
            </div>
            <div class="tc-badges">
                <span class="tc-badge ${item.estado}">${status.label}</span>
                <span class="tc-badge ${item.prioridad}">${priority.label}</span>
                ${item.tipo ? `<span class="tc-badge" style="background:rgba(139,92,246,.12);color:#6d28d9">${esc(item.tipo)}</span>` : ''}
            </div>
            <div class="tc-info">
                ${item.fecha ? `<span><i class="fas fa-calendar"></i> ${fecha}</span>` : ''}
                <span><i class="fas fa-clock"></i> ${desde}</span>
                ${item.total_comentarios ? `<span><i class="fas fa-comment"></i> ${item.total_comentarios}</span>` : ''}
                ${item.total_avances ? `<span><i class="fas fa-chart-line"></i> ${item.total_avances}</span>` : ''}
            </div>
            ${progressHtml}
        </div>`;
    }).join('');
}

// ============================================================================
// DATA LOADING
// ============================================================================
async function loadData(page = 1, search = '') {
    currentPage = page;
    try {
        let url = `${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`;
        if (currentFilter) url += `&estado=${encodeURIComponent(currentFilter)}`;
        const r = await fetch(url);
        const d = await r.json();
        if (d.status === 'success') {
            allItems = d.data.items || d.data;
            renderCardGrid(allItems);
            if (d.data?.total) renderPagination('paginationContainer', d.data.total, d.data.per_page || 25, d.data.page || 1, (p) => loadData(p, el('searchInput')?.value || ''));
        }
    } catch (e) {
        console.error(e);
        el('cardGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar</p></div>';
    }
}

// ============================================================================
// FICHA (DETAIL VIEW)
// ============================================================================
async function openFicha(id) {
    if (!id) {
        currentTarea = null;
        selectedId = null;
        el('record_id').value = '';
        el('fichaTitle').textContent = 'Nueva Tarea';
        el('fichaSub').textContent = 'Crear nueva tarea';
        el('fichaAvatar').textContent = 'TA';
        el('fichaAvatar').className = 'ficha-avatar gradient-orange';
        el('fichaStats').innerHTML = '';
        el('btnFichaDelete').style.display = 'none';
        resetFormFields();
        if (el('fecha')) el('fecha').value = new Date().toISOString().split('T')[0];
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        return;
    }

    selectedId = id;
    currentTarea = allItems.find(t => parseInt(t.id) === parseInt(id));
    if (!currentTarea) return;

    el('record_id').value = currentTarea.id;
    el('fichaTitle').textContent = currentTarea.nombre;
    el('fichaSub').textContent = `${currentTarea.folio || 'TAR-' + String(currentTarea.id).padStart(5,'0')} · ${currentTarea.empleado_nombre || 'Sin asignar'}`;
    el('fichaAvatar').textContent = (currentTarea.folio || 'TA').slice(-2);
    const isDone = currentTarea.estado === 'completada';
    const isCancelled = currentTarea.estado === 'cancelada';
    el('fichaAvatar').className = 'ficha-avatar ' + (isDone ? 'gradient-green' : isCancelled ? 'gradient-gray' : 'gradient-orange');
    el('btnFichaDelete').style.display = '';

    populateForm(currentTarea);

    el('listView').style.display = 'none';
    el('fichaContainer').classList.add('active');

    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
    el('tabDatos').classList.add('active');
    document.querySelector('.detail-tab[data-tab="datos"]')?.classList.add('active');

    await loadFullTask(id);
}

function closeFicha() {
    el('listView').style.display = '';
    el('fichaContainer').classList.remove('active');
    currentTarea = null;
    selectedId = null;
    loadData(currentPage, el('searchInput')?.value || '');
}

function populateForm(t) {
    el('nombre').value = t.nombre || '';
    setSelectValue(el('asignado_empleado_id'), t.asignado_empleado_id);
    el('fecha').value = t.fecha || '';
    el('prioridad').value = t.prioridad || 'normal';
    el('estado').value = t.estado || 'pendiente';
    setSelectValue(el('proceso'), t.proceso);
    setSelectValue(el('tipo'), t.tipo);
    el('detalles').value = t.detalles || '';
    el('observaciones').value = t.observaciones || '';
}

function resetFormFields() {
    el('dataForm')?.reset();
    el('prioridad').value = 'normal';
    el('estado').value = 'pendiente';
}

// ============================================================================
// RENDER AVANCES (Timeline)
// ============================================================================
function renderAvances(avances) {
    const container = el('avancesTimeline');
    if (!container) return;
    if (!avances.length) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:0.82rem"><i class="fas fa-chart-line" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:0.5rem"></i> Sin avances registrados</div>';
        return;
    }
    container.innerHTML = avances.map(a => {
        let mediaHtml = '';
        if (a.archivos && a.archivos.length) {
            mediaHtml = `<div class="avance-media">${a.archivos.map(m => renderMediaItem(m)).join('')}</div>`;
        }
        return `<div class="avance-item">
            <div class="avance-line"><div class="avance-dot"></div><div class="avance-stem"></div></div>
            <div class="avance-content">
                <div class="avance-header">
                    <span class="avance-title">${esc(a.titulo || 'Avance')}</span>
                    <div style="display:flex;gap:6px;align-items:center">
                        ${a.porcentaje != null ? `<span class="avance-pct">${a.porcentaje}%</span>` : ''}
                        <span class="avance-delete" onclick="deleteAvance(${a.id})" title="Eliminar"><i class="fas fa-trash"></i></span>
                    </div>
                </div>
                <div class="avance-text">${esc(a.descripcion)}</div>
                ${mediaHtml}
                <div class="avance-meta"><span>${esc(a.autor_empleado || 'Anónimo')}</span><span>${timeAgo(a.creado)}</span></div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================================
// RENDER COMMENTS
// ============================================================================
function renderComments(comments) {
    const container = el('commentList');
    if (!container) return;
    if (!comments.length) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-size:0.82rem"><i class="fas fa-comment-dots" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:0.5rem"></i> Sin comentarios</div>';
        return;
    }
    container.innerHTML = comments.map(c => {
        const initials = getInitials(c.autor_nombre || c.autor_empleado || 'Anónimo');
        const color = AVATAR_COLORS[(c.id || 0) % AVATAR_COLORS.length];
        let mediaHtml = '';
        if (c.archivos && c.archivos.length) {
            mediaHtml = `<div class="comment-media">${c.archivos.map(m => renderMediaItem(m)).join('')}</div>`;
        }
        return `<div class="comment-item">
            <div class="comment-avatar" style="background:${color}20;color:${color}">${initials}</div>
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-author">${esc(c.autor_nombre || c.autor_empleado || 'Anónimo')}</span>
                    <span class="comment-time">${timeAgo(c.creado)}</span>
                    <span class="comment-delete" onclick="deleteComment(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></span>
                </div>
                <div class="comment-text">${esc(c.comentario)}</div>
                ${mediaHtml}
            </div>
        </div>`;
    }).join('');
}

// ============================================================================
// RENDER MEDIA
// ============================================================================
function renderMedia(archivos) {
    const grid = el('mediaGrid');
    if (!grid) return;
    if (!archivos.length) {
        grid.innerHTML = '';
        return;
    }
    grid.innerHTML = archivos.map(m => `<div class="media-item">${renderMediaItem(m)}<button class="media-delete" onclick="deleteMediaFile(${m.id})"><i class="fas fa-times"></i></button></div>`).join('');
}

function renderMediaItem(m) {
    if (m.tipo_archivo === 'foto') return `<img src="${m.ruta_archivo}" alt="${esc(m.nombre_original||'')}" loading="lazy" onclick="openLightbox('foto','${m.ruta_archivo}','${esc(m.nombre_original||'')}')">`;
    if (m.tipo_archivo === 'video') return `<video src="${m.ruta_archivo}" preload="metadata" controls style="cursor:pointer"></video>`;
    if (m.tipo_archivo === 'nota_voz') return `<audio src="${m.ruta_archivo}" controls preload="metadata"></audio>`;
    return `<div style="padding:0.5rem;text-align:center;font-size:0.7rem;color:var(--text-secondary);background:var(--bg-secondary);border-radius:6px"><i class="fas fa-file" style="font-size:1.2rem;color:var(--primary);display:block;margin-bottom:2px"></i>${esc(m.nombre_original||'Archivo')}</div>`;
}

// ============================================================================
// STATS
// ============================================================================
async function loadTaskStats(taskId) {
    try {
        const r = await fetch(`${API}?action=stats&tarea_id=${taskId}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return;
        const s = d.data;
        el('taskStats').innerHTML = `
            <div class="stat-card"><div class="stat-val">${s.total_avances || 0}</div><div class="stat-label">Avances</div></div>
            <div class="stat-card"><div class="stat-val">${s.total_comentarios || 0}</div><div class="stat-label">Comentarios</div></div>
            <div class="stat-card"><div class="stat-val">${s.total_archivos || 0}</div><div class="stat-label">Archivos</div></div>
            <div class="stat-card"><div class="stat-val">${s.ultimo_porcentaje != null ? s.ultimo_porcentaje + '%' : '—'}</div><div class="stat-label">Último Avance</div></div>
        `;
    } catch (e) { console.error(e); }
}

// ============================================================================
// FORM SUBMIT
// ============================================================================
async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = el('btnSave');
    setButtonLoading(btn, true, 'Guardando...');
    const fd = prepareSanitizedFormData(el('dataForm'));
    try {
        const d = await uploadWithProgress(API, fd);
        if (d.status === 'success') {
            showSuccess(d.message || 'Guardado');
            if (!el('record_id').value && d.data?.id) {
                openFicha(d.data.id);
            } else {
                await loadFullTask(parseInt(el('record_id').value));
            }
        } else showError(d.message || 'Error');
    } catch (e) { showError('Error de conexión'); }
    finally { setButtonLoading(btn, false); }
}

async function handleDelete() {
    const id = el('record_id')?.value;
    if (!id || !confirm('¿Eliminar esta tarea y todos sus comentarios/avances?')) return;
    const btn = el('btnFichaDelete');
    setButtonLoading(btn, true, 'Eliminando...');
    try {
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', id);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminada'); closeFicha(); }
        else showError(d.message);
    } catch (e) { showError('Error al eliminar'); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// LOAD FULL TASK (refresh detail)
// ============================================================================
async function loadFullTask(id) {
    try {
        const r = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return;
        const item = d.data;
        currentTarea = item;
        el('fichaTitle').textContent = item.nombre;
        el('fichaSub').textContent = `${item.folio || 'TAR-' + String(item.id).padStart(5,'0')} · ${item.empleado_nombre || 'Sin asignar'}`;

        const status = STATUS_COLORS[item.estado] || STATUS_COLORS.pendiente;
        const priority = PRIORITY_COLORS[item.prioridad] || PRIORITY_COLORS.normal;
        const pct = item.avances?.[0]?.porcentaje;
        el('fichaStats').innerHTML = `
            <div class="meta-card stat-sm"><div class="stat-label">Estado</div><div class="stat-val" style="color:${status.text}">${status.label}</div></div>
            <div class="meta-card stat-sm"><div class="stat-label">Prioridad</div><div class="stat-val">${priority.label}</div></div>
            <div class="meta-card stat-sm"><div class="stat-label">Fecha</div><div class="stat-val">${formatDateShort(item.fecha) || '—'}</div></div>
            ${pct != null ? `<div class="meta-card stat-sm"><div class="stat-label">Progreso</div><div class="stat-val">${pct}%</div></div>` : ''}
        `;

        renderAvances(item.avances || []);
        renderComments(item.comentarios || []);
        renderMedia(item.archivos || []);
        loadTaskStats(item.id);
        el('tabAvancesCount').textContent = (item.avances || []).length;
        el('tabComentariosCount').textContent = (item.comentarios || []).length;
        el('tabMediaCount').textContent = (item.archivos || []).length;
    } catch (e) { console.error(e); }
}

// ============================================================================
// COMMENTS
// ============================================================================
function handleCommentFileSelect(files) {
    if (!files.length) return;
    Array.from(files).forEach(f => commentFiles.push(f));
    renderCommentPreview();
}

function renderCommentPreview() {
    const container = el('commentPreview');
    if (!container) return;
    container.innerHTML = commentFiles.map((f, i) => {
        const isImg = f.type.startsWith('image/');
        const isVid = f.type.startsWith('video/');
        const url = URL.createObjectURL(f);
        const inner = isImg ? `<img src="${url}">` : isVid ? `<video src="${url}"></video>` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.5rem"><i class="fas fa-file"></i></div>`;
        return `<div class="comment-preview-item">${inner}<button class="comment-preview-remove" onclick="removeCommentFile(${i})"><i class="fas fa-times"></i></button></div>`;
    }).join('');
}

function removeCommentFile(index) {
    commentFiles.splice(index, 1);
    renderCommentPreview();
}

async function addComment() {
    const input = el('commentInput');
    if (!input || (!input.value.trim() && !commentFiles.length)) return;
    try {
        const fd = new FormData();
        fd.append('action', 'add_comment');
        fd.append('tarea_id', currentTarea.id);
        fd.append('comentario', input.value.trim());
        fd.append('autor_nombre', 'Usuario');
        commentFiles.forEach(f => fd.append('archivos[]', f));
        const d = await uploadWithProgress(API, fd);
        if (d.status === 'success') {
            input.value = '';
            commentFiles = [];
            renderCommentPreview();
            await loadFullTask(currentTarea.id);
        } else showError(d.message);
    } catch (e) { showError('Error al comentar'); }
}

async function deleteComment(commentId) {
    if (!confirm('¿Eliminar comentario?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_comment');
        fd.append('comment_id', commentId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') await loadFullTask(currentTarea.id);
        else showError(d.message);
    } catch (e) { showError('Error'); }
}

// ============================================================================
// AVANCES
// ============================================================================
function openAvanceModal() {
    el('avance_tarea_id').value = currentTarea.id;
    el('avance_titulo').value = '';
    el('avance_descripcion').value = '';
    el('avance_porcentaje').value = '';
    avanceFiles = [];
    el('avancePreviewGrid').innerHTML = '';
    el('avanceModal')?.classList.add('open');
}

function closeAvanceModal() {
    el('avanceModal')?.classList.remove('open');
    avanceFiles = [];
}

function handleAvanceFiles(fileList) {
    if (!fileList) return;
    Array.from(fileList).forEach(f => {
        if (f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')) {
            avanceFiles.push(f);
        }
    });
    renderAvancePreview();
}

function renderAvancePreview() {
    const grid = el('avancePreviewGrid');
    if (!grid) return;
    grid.innerHTML = avanceFiles.map((f, i) => {
        const isImg = f.type.startsWith('image/');
        const isVid = f.type.startsWith('video/');
        const url = URL.createObjectURL(f);
        const inner = isImg ? `<img src="${url}">` : isVid ? `<video src="${url}"></video>` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.6rem;color:var(--text-secondary)"><i class="fas fa-microphone" style="font-size:1.5rem;color:var(--danger)"></i></div>`;
        return `<div class="media-item" style="position:relative">${inner}<button class="media-delete" style="display:flex" onclick="removeAvanceFile(${i})"><i class="fas fa-times"></i></button></div>`;
    }).join('');
}

function removeAvanceFile(index) {
    avanceFiles.splice(index, 1);
    renderAvancePreview();
}

async function handleAvanceSubmit(e) {
    e.preventDefault();
    const btn = el('avanceSave');
    const desc = el('avance_descripcion')?.value?.trim();
    if (!desc) return showError('Ingresa el detalle del avance');
    setButtonLoading(btn, true, 'Guardando...');
    const fd = new FormData();
    fd.append('action', 'add_avance');
    fd.append('tarea_id', el('avance_tarea_id').value);
    fd.append('titulo', el('avance_titulo')?.value || '');
    fd.append('descripcion', desc);
    fd.append('porcentaje', el('avance_porcentaje')?.value || '');
    avanceFiles.forEach(f => fd.append('archivos[]', f));
    try {
        const d = await uploadWithProgress(API, fd);
        if (d.status === 'success') {
            showSuccess('Avance registrado');
            closeAvanceModal();
            await loadFullTask(parseInt(el('avance_tarea_id').value));
        } else showError(d.message);
    } catch (e) { showError('Error al registrar avance'); }
    finally { setButtonLoading(btn, false); }
}

async function deleteAvance(avanceId) {
    if (!confirm('¿Eliminar este avance?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_avance');
        fd.append('avance_id', avanceId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') await loadFullTask(currentTarea.id);
        else showError(d.message);
    } catch (e) { showError('Error'); }
}

// ============================================================================
// MULTIMEDIA
// ============================================================================
async function handleMediaUpload(e) {
    const files = e.target?.files;
    if (!files || !files.length || !currentTarea) return;
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('archivos[]', f));
    fd.append('entidad_tipo', 'tareas_diarias');
    fd.append('entidad_id', currentTarea.id);
    fd.append('action', 'subir');
    try {
        const d = await apiFetch(API_ROOT + 'multimedia_api.php', fd);
        if (d.status === 'success') { showSuccess('Archivos subidos'); await loadFullTask(currentTarea.id); }
        else showError(d.message || 'Error al subir');
    } catch (e) { showError('Error de conexión'); }
}

async function deleteMediaFile(mediaId) {
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
        const fd = new FormData();
        fd.append('id', mediaId);
        fd.append('action', 'eliminar');
        const r = await apiFetch(API_ROOT + 'multimedia_api.php', fd);
        if (r.status === 'success') { showSuccess('Eliminado'); await loadFullTask(currentTarea.id); }
    } catch (e) { showError('Error'); }
}

// ============================================================================
// UTILITIES
// ============================================================================
function getInitials(name) { return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'; }
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    try { const d = new Date(dateStr + 'T00:00:00'); return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return dateStr; }
}
function timeAgo(dateStr) {
    if (!dateStr) return '';
    try {
        const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
        if (diff < 60) return 'ahora';
        if (diff < 3600) return Math.floor(diff / 60) + ' min';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd';
        return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    } catch { return ''; }
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function setSelectValue(select, value) {
    if (!select) return;
    const opts = Array.from(select.options);
    const match = opts.find(o => o.value == value || o.text == value);
    select.value = match ? match.value : '';
}
function esc(str) { return str ? escapeHtml(str) : ''; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ── Crear Solicitud de Compra desde Tarea ─────────────────────────────── */
async function crearOCDesdeTarea() {
    if (!currentTarea) { showToast('Abra una tarea primero', 'info'); return; }
    const nombre = currentTarea.nombre || 'Compra desde tarea';
    if (!confirm('¿Crear una Solicitud de Compra asociada a esta tarea?\n\nSe generará una OC con el título de la tarea como ítem.')) return;
    const btn = el('btnSolicitarCompra');
    setButtonLoading(btn, true);
    try {
        const fd = new FormData();
        fd.append('action', 'crear_oc');
        fd.append('origen_tipo', 'tarea');
        fd.append('origen_id', currentTarea.id);
        if (currentTarea.asignado_empleado_id) fd.append('solicitante_empleado_id', currentTarea.asignado_empleado_id);
        fd.append('observaciones', 'Generada desde Tarea ' + (currentTarea.folio || ('TAR-' + String(currentTarea.id).padStart(5, '0'))));
        fd.append('items_json', JSON.stringify([{ nombre, producto_tipo: 'otro', cantidad_solicitada: 1, valor_unitario: 0 }]));
        const r = await apiFetch(API_ROOT + 'orden_compra_api.php', fd);
        if (r.success || r.status === 'success') {
            showSuccess('Solicitud de compra creada: ' + (r.data?.folio || 'OC'));
            window.open('orden_compra.html', '_blank');
        } else {
            throw new Error(r.message);
        }
    } catch (e) {
        showError('Error: ' + e.message);
    } finally {
        setButtonLoading(btn, false);
    }
}
