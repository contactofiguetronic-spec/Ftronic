const API_PC = API_ROOT + 'portal_control_api.php';
const API_PORTAL = API_ROOT + 'portal_api.php';

let currentPage = 1;
let currentFilters = { search: '', estado: '' };
let selectedOtId = null;
let otCache = [];
let configCache = [];
let chatPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    el('btnRefresh').addEventListener('click', loadAll);
    el('btnApplyFilter').addEventListener('click', () => { currentPage = 1; loadOts(); });
    el('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { currentPage = 1; loadOts(); } });
    el('filterEstado').addEventListener('change', () => { currentPage = 1; loadOts(); });

    el('btnSaveConfig').addEventListener('click', saveConfig);
    el('btnBulkAvance').addEventListener('click', () => openModal('masivoModal'));
    el('btn-confirmar-avance').addEventListener('click', publicarAvance);
    el('btn-confirmar-masivo').addEventListener('click', publicarMasivo);

    el('av-porcentaje').addEventListener('input', (e) => {
        el('av-pct-label').textContent = e.target.value + '%';
    });

    loadAll();
});

function loadAll() {
    loadStats();
    loadOts();
    loadConfig();
    loadTopOts();
}

/* ════════════════════════════
   ESTADÍSTICAS
   ════════════════════════════ */
function loadStats() {
    fetch(`${API_PC}?action=stats`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) {
                const s = res.data;
                el('statOts').textContent = s.ots_activas || 0;
                el('statPendientes').textContent = s.comentarios_pendientes || 0;
                el('statHoy').textContent = s.comentarios_hoy || 0;
                el('statAvances').textContent = s.avances_semana || 0;
                el('statArchivos').textContent = s.archivos_cliente || 0;

                // Activity chart
                renderActivityChart(s.actividad_diaria || []);
            }
        });
}

function renderActivityChart(data) {
    const container = el('activityChart');
    if (!data.length) { container.innerHTML = '<div class="pc-empty" style="padding:1rem;font-size:0.82rem;">Sin actividad</div>'; return; }

    const max = Math.max(...data.map(d => parseInt(d.total)), 1);
    const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

    container.innerHTML = data.map(d => {
        const pct = (d.total / max) * 100;
        const fecha = new Date(d.dia + 'T12:00:00');
        const dia = dias[fecha.getDay()];
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
            <div class="pc-bar" style="height:${pct}%;">
                <div class="pc-bar-value">${d.total}</div>
            </div>
            <div class="pc-bar-label">${dia}</div>
        </div>`;
    }).join('');
}

/* ════════════════════════════
   OTs
   ════════════════════════════ */
function loadOts() {
    currentFilters.search = el('searchInput').value.trim();
    currentFilters.estado = el('filterEstado').value;

    const params = new URLSearchParams({
        action: 'ots',
        page: currentPage,
        per_page: 15,
        ...currentFilters,
    });

    el('otListContainer').innerHTML = '<div class="pc-empty"><i class="fas fa-spinner fa-spin"></i><p>Cargando OTs...</p></div>';

    fetch(`${API_PC}?${params}`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) {
                otCache = res.data.items;
                renderOts(res.data);
            }
        });
}

function renderOts(data) {
    const container = el('otListContainer');
    if (!data.items.length) {
        container.innerHTML = '<div class="pc-empty"><i class="fas fa-inbox"></i><p>No se encontraron OTs</p></div>';
        el('otPagination').innerHTML = '';
        return;
    }

    container.innerHTML = data.items.map(ot => `
        <div class="pc-ot-item" onclick="selectOt(${ot.id})">
            <div class="pc-ot-folio">${escapeHtml(ot.folio_ot || '#' + ot.id)}</div>
            <div class="pc-ot-info">
                <div class="pc-ot-cliente">${escapeHtml((ot.cliente_nombre || '') + ' ' + (ot.cliente_apellido || ''))} <span class="pc-estado ${ot.estado}">${getEstadoLabel(ot.estado)}</span></div>
                <div class="pc-ot-meta">
                    <span><i class="fas fa-car"></i> ${escapeHtml((ot.marca || '') + ' ' + (ot.modelo || ''))} ${ot.patente ? '· ' + escapeHtml(ot.patente) : ''}</span>
                    <span><i class="fas fa-calendar"></i> ${fmtDateShort(ot.creado)}</span>
                </div>
            </div>
            <div class="pc-ot-stats">
                <div class="pc-ot-stat ${ot.comentarios_pendientes > 0 ? 'alert' : ''}" title="Comentarios">
                    <span class="num">${ot.total_comentarios || 0}</span>
                    <span class="lbl"><i class="fas fa-comments"></i></span>
                </div>
                <div class="pc-ot-stat" title="Avances">
                    <span class="num">${ot.total_avances || 0}</span>
                    <span class="lbl"><i class="fas fa-chart-line"></i></span>
                </div>
                <div class="pc-ot-stat" title="Adjuntos cliente">
                    <span class="num">${ot.total_interacciones || 0}</span>
                    <span class="lbl"><i class="fas fa-paperclip"></i></span>
                </div>
            </div>
        </div>
    `).join('');

    // Pagination
    const pag = el('otPagination');
    if (data.total_pages > 1) {
        pag.innerHTML = `
            <span>Mostrando ${(data.page - 1) * data.per_page + 1}-${Math.min(data.page * data.per_page, data.total)} de ${data.total}</span>
            <div style="display:flex;gap:4px;">
                <button class="pc-btn pc-btn-sm pc-btn-secondary" ${data.page === 1 ? 'disabled' : ''} onclick="gotoPage(${data.page - 1})"><i class="fas fa-chevron-left"></i></button>
                <span style="padding:5px 10px;">${data.page} / ${data.total_pages}</span>
                <button class="pc-btn pc-btn-sm pc-btn-secondary" ${data.page === data.total_pages ? 'disabled' : ''} onclick="gotoPage(${data.page + 1})"><i class="fas fa-chevron-right"></i></button>
            </div>`;
    } else {
        pag.innerHTML = `<span>${data.total} OTs</span>`;
    }
}

function gotoPage(p) { currentPage = p; loadOts(); }

function selectOt(otId) {
    selectedOtId = otId;
    loadOtDetalle(otId);
}

function loadOtDetalle(otId) {
    el('otDetalleContainer').innerHTML = '<div class="pc-card"><div class="pc-card-body"><div class="pc-empty"><i class="fas fa-spinner fa-spin"></i><p>Cargando...</p></div></div></div>';

    fetch(`${API_PC}?action=ot_detalle&ot_id=${otId}`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) renderOtDetalle(res.data);
        });
}

function renderOtDetalle(data) {
    const ot = data.ot;
    const container = el('otDetalleContainer');
    const clienteNombre = (ot.cliente_nombre || '') + ' ' + (ot.cliente_apellido || '');
    const vehiculo = [ot.marca, ot.modelo, ot.anio].filter(Boolean).join(' ');

    container.innerHTML = `
        <div class="pc-active-ot">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div class="folio">${escapeHtml(ot.folio_ot || '#' + ot.id)}</div>
                <span class="pc-estado ${ot.estado}">${getEstadoLabel(ot.estado)}</span>
            </div>
            <div class="info">
                <i class="fas fa-user"></i> ${escapeHtml(clienteNombre)} ·
                <i class="fas fa-car"></i> ${escapeHtml(vehiculo)} ${ot.patente ? '· ' + escapeHtml(ot.patente) : ''}
            </div>
        </div>

        <div class="pc-card">
            <div class="pc-tabs">
                <button class="pc-tab active" data-pane="chatPane"><i class="fas fa-comments"></i> Chat</button>
                <button class="pc-tab" data-pane="avancesPane"><i class="fas fa-chart-line"></i> Avances</button>
                <button class="pc-tab" data-pane="mediaPane"><i class="fas fa-images"></i> Multimedia</button>
                <button class="pc-tab" data-pane="permisosPane"><i class="fas fa-sliders-h"></i> Permisos</button>
            </div>

            <!-- CHAT -->
            <div class="pc-tab-panel active" id="chatPane">
                <div class="pc-chat" style="height:420px;border-radius:0;border:none;">
                    <div class="pc-chat-messages" id="chatMessages"></div>
                    <div class="pc-chat-input">
                        <input type="text" id="chatInput" placeholder="Escriba un mensaje para el cliente...">
                        <button onclick="enviarMensaje()"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>

            <!-- AVANCES -->
            <div class="pc-tab-panel" id="avancesPane">
                <div style="padding:1rem;">
                    <button class="pc-btn pc-btn-primary" onclick="openModal('avanceModal')"><i class="fas fa-bullhorn"></i> Publicar avance</button>
                    <div id="avancesList"></div>
                </div>
            </div>

            <!-- MULTIMEDIA -->
            <div class="pc-tab-panel" id="mediaPane">
                <div style="padding:1rem;">
                    <div class="pc-media-grid" id="mediaGrid"></div>
                </div>
            </div>

            <!-- PERMISOS -->
            <div class="pc-tab-panel" id="permisosPane">
                <div style="padding:1rem;">
                    <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.8rem;"><i class="fas fa-info-circle"></i> Estos overrides tienen prioridad sobre la configuración global del portal.</p>
                    <div id="permisosOtList"></div>
                </div>
            </div>
        </div>
    `;

    // Tab switching
    container.querySelectorAll('.pc-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.pc-tab').forEach(t => t.classList.toggle('active', t === tab));
            container.querySelectorAll('.pc-tab-panel').forEach(p => p.classList.toggle('active', p.id === tab.dataset.pane));
        });
    });

    // Chat input
    const chatInput = el('chatInput');
    if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarMensaje(); });

    renderChat(data.comentarios || []);
    renderAvances(data.avances || []);
    renderMedia(data.multimedia || []);
    renderPermisosOt(data.permisos || {});

    // Poll chat every 20s
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(() => {
        if (selectedOtId) {
            fetch(`${API_PC}?action=ot_comentarios&ot_id=${selectedOtId}`)
                .then(r => r.json())
                .then(res => { if (res.status === 'success') renderChat(res.data || [], true); });
        }
    }, 20000);
}

function renderChat(msgs, silent) {
    const container = el('chatMessages');
    if (!container) return;
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    if (!msgs.length) {
        container.innerHTML = '<div class="pc-empty" style="padding:1.5rem;"><i class="fas fa-comments"></i><p>Sin mensajes aún</p></div>';
        return;
    }
    container.innerHTML = msgs.map(m => `
        <div class="pc-msg ${m.autor_tipo}">
            <div class="who">${escapeHtml(m.autor_nombre || (m.autor_tipo === 'cliente' ? 'Cliente' : 'Taller'))}</div>
            <div>${escapeHtml(m.mensaje)}</div>
            <div class="when">${new Date(m.creado).toLocaleString('es-CL', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
    `).join('');
    if (wasAtBottom || !silent) container.scrollTop = container.scrollHeight;
}

function enviarMensaje() {
    const input = el('chatInput');
    const msg = input?.value.trim();
    if (!msg || !selectedOtId) return;

    const fd = new FormData();
    fd.append('ot_id', selectedOtId);
    fd.append('mensaje', msg);
    apiFetch(`${API_PC}?action=ot_responder`, fd).then(res => {
        if (res.status === 'success') {
            input.value = '';
            loadOtDetalle(selectedOtId);
        } else showError(res.message || 'Error');
    });
}

function renderAvances(avances) {
    const container = el('avancesList');
    if (!container) return;
    if (!avances.length) {
        container.innerHTML = '<div class="pc-empty" style="padding:1.5rem;"><i class="fas fa-chart-line"></i><p>Sin avances publicados</p></div>';
        return;
    }
    container.innerHTML = avances.map(a => `
        <div class="pc-avance">
            <div class="pc-avance-head">
                <div class="pc-avance-title">${escapeHtml(a.titulo)}</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    ${a.porcentaje != null ? `<div class="pc-avance-pct">${a.porcentaje}%</div>` : ''}
                    <button class="pc-btn pc-btn-sm pc-btn-danger" onclick="eliminarAvance(${a.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            ${a.descripcion ? `<div class="pc-avance-desc">${escapeHtml(a.descripcion)}</div>` : ''}
            ${a.porcentaje != null ? `<div class="pc-progress-bar"><div class="pc-progress-bar-fill" style="width:${a.porcentaje}%"></div></div>` : ''}
            <div class="pc-avance-meta">
                <span><i class="fas fa-user"></i> ${escapeHtml(a.autor_nombre || 'Sistema')}</span>
                <span><i class="fas fa-clock"></i> ${new Date(a.creado).toLocaleString('es-CL')}</span>
            </div>
            ${a.multimedia && a.multimedia.length ? renderAvanceMedia(a.multimedia) : ''}
        </div>
    `).join('');
}

function renderAvanceMedia(media) {
    return `<div class="pc-media-grid" style="margin-top:0.5rem;">${media.map(m => {
        const isVideo = m.tipo_archivo === 'video';
        const isAudio = m.tipo_archivo === 'nota_voz';
        const src = m.ruta_archivo?.startsWith('/') ? m.ruta_archivo : '/' + m.ruta_archivo;
        if (isAudio) return `<div class="pc-media-item"><i class="fas fa-headphones"></i><audio src="${escapeHtml(src)}" controls></audio></div>`;
        if (isVideo) return `<div class="pc-media-item"><video src="${escapeHtml(src)}" muted></video></div>`;
        return `<div class="pc-media-item"><img src="${escapeHtml(src)}" alt="${escapeHtml(m.nombre_original || '')}"></div>`;
    }).join('')}</div>`;
}

function publicarAvance() {
    if (!selectedOtId) return showError('Seleccione una OT');
    const titulo = el('av-titulo')?.value.trim();
    const desc = el('av-descripcion')?.value.trim();
    const pct = parseInt(el('av-porcentaje')?.value || 0);

    if (!titulo) return showError('Ingrese un título');

    const fd = new FormData();
    fd.append('ot_id', selectedOtId);
    fd.append('titulo', titulo);
    fd.append('descripcion', desc);
    fd.append('porcentaje', pct);
    const files = el('av-archivos')?.files;
    if (files) for (const f of files) fd.append('archivos[]', f);

    const btn = el('btn-confirmar-avance');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';

    apiFetch(`${API_PC}?action=ot_publicar_avance`, fd).then(res => {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publicar';
        if (res.status === 'success') {
            showSuccess('Avance publicado');
            el('av-titulo').value = '';
            el('av-descripcion').value = '';
            el('av-porcentaje').value = 0;
            el('av-pct-label').textContent = '0%';
            el('av-archivos').value = '';
            closeModal('avanceModal');
            loadOtDetalle(selectedOtId);
        } else showError(res.message || 'Error');
    });
}

function publicarMasivo() {
    const titulo = el('mas-titulo')?.value.trim();
    const desc = el('mas-descripcion')?.value.trim();
    const pct = parseInt(el('mas-porcentaje')?.value || 0);

    if (!titulo) return showError('Ingrese un título');

    const otIds = otCache.filter(ot => !['finalizado','entregado','cancelado'].includes(ot.estado)).map(ot => ot.id);
    if (!otIds.length) return showError('No hay OTs activas');

    if (!confirm(`¿Publicar este avance en ${otIds.length} OTs activas?`)) return;

    const fd = new FormData();
    fd.append('ot_ids', JSON.stringify(otIds));
    fd.append('titulo', titulo);
    fd.append('descripcion', desc);
    fd.append('porcentaje', pct);
    apiFetch(`${API_PC}?action=ot_publicar_todo`, fd).then(res => {
        if (res.status === 'success') {
            showSuccess(res.message);
            closeModal('masivoModal');
            el('mas-titulo').value = '';
            el('mas-descripcion').value = '';
            el('mas-porcentaje').value = 0;
            loadStats();
        } else showError(res.message || 'Error');
    });
}

function eliminarAvance(id) {
    if (!confirm('¿Eliminar este avance? Los archivos asociados también se eliminarán.')) return;
    const fd = new FormData();
    fd.append('id', id);
    apiFetch(`${API_PC}?action=ot_eliminar_avance`, fd).then(res => {
        if (res.status === 'success') { showSuccess('Avance eliminado'); loadOtDetalle(selectedOtId); loadOts(); loadStats(); }
        else showError(res.message || 'Error');
    });
}

function eliminarComentario(id) {
    if (!confirm('¿Eliminar este comentario?')) return;
    const fd = new FormData();
    fd.append('id', id);
    apiFetch(`${API_PC}?action=ot_eliminar_comentario`, fd).then(res => {
        if (res.status === 'success') { showSuccess('Eliminado'); loadOtDetalle(selectedOtId); }
        else showError(res.message || 'Error');
    });
}

function renderMedia(media) {
    const container = el('mediaGrid');
    if (!container) return;
    if (!media.length) {
        container.innerHTML = '<div class="pc-empty" style="grid-column:1/-1;padding:1.5rem;"><i class="fas fa-images"></i><p>Sin archivos</p></div>';
        return;
    }
    container.innerHTML = media.map(m => {
        const isVideo = m.tipo_archivo === 'video';
        const isAudio = m.tipo_archivo === 'nota_voz';
        const src = m.ruta_archivo?.startsWith('/') ? m.ruta_archivo : '/' + m.ruta_archivo;
        const origen = m.origen === 'cliente' ? '<i class="fas fa-user"></i>' : (m.origen === 'avance' ? '<i class="fas fa-bullhorn"></i>' : '<i class="fas fa-wrench"></i>');
        if (isAudio) return `<div class="pc-media-item"><i class="fas fa-headphones"></i><audio src="${escapeHtml(src)}" controls></audio><button class="pc-media-del" onclick="eliminarMedia(${m.id},'${m.origen === 'cliente' ? 'ot_interacciones_cliente' : 'archivos_multimedia'}')"><i class="fas fa-times"></i></button></div>`;
        if (isVideo) return `<div class="pc-media-item"><video src="${escapeHtml(src)}" muted></video><button class="pc-media-del" onclick="eliminarMedia(${m.id},'archivos_multimedia')"><i class="fas fa-times"></i></button></div>`;
        return `<div class="pc-media-item"><img src="${escapeHtml(src)}" alt=""><button class="pc-media-del" onclick="eliminarMedia(${m.id},'${m.origen === 'cliente' ? 'ot_interacciones_cliente' : 'archivos_multimedia'}')"><i class="fas fa-times"></i></button></div>`;
    }).join('');
}

function eliminarMedia(id, tipo) {
    if (!confirm('¿Eliminar este archivo?')) return;
    const fd = new FormData();
    fd.append('id', id);
    fd.append('tipo', tipo);
    apiFetch(`${API_PC}?action=ot_eliminar_multimedia`, fd).then(res => {
        if (res.status === 'success') { showSuccess('Archivo eliminado'); loadOtDetalle(selectedOtId); }
        else showError(res.message || 'Error');
    });
}

function renderPermisosOt(permisos) {
    const container = el('permisosOtList');
    if (!container) return;
    if (!configCache.length) {
        container.innerHTML = '<div class="pc-empty"><p>Cargando configuración...</p></div>';
        return;
    }

    const groupIcons = {
        'Datos del Cliente': 'fa-id-card', 'Orden de Trabajo': 'fa-file-invoice',
        'Servicios y Checklist': 'fa-clipboard-list', 'Presupuesto': 'fa-file-invoice-dollar',
        'Diagnóstico': 'fa-stethoscope', 'Avances': 'fa-chart-line',
        'Comunicación': 'fa-comments', 'Galería Multimedia': 'fa-images',
        'Solicitudes': 'fa-calendar-check', 'Personalización': 'fa-palette',
    };

    const grouped = {};
    configCache.forEach(c => {
        const sec = c.seccion || 'General';
        if (!grouped[sec]) grouped[sec] = [];
        grouped[sec].push(c);
    });

    container.innerHTML = Object.entries(grouped).map(([sec, items]) => {
        const icon = groupIcons[sec] || 'fa-cog';
        return `
        <div style="margin-bottom:12px;">
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;padding:4px 0 6px;display:flex;align-items:center;gap:6px;">
                <i class="fas ${icon}" style="color:var(--primary);font-size:0.72rem;"></i> ${escapeHtml(sec)}
            </div>
            ${items.map(c => {
                const valor = permisos[c.clave];
                const isOverridden = valor !== undefined && valor !== null;
                const globalOn = c.valor === '1' || c.valor === 'true';
                const overrideOn = isOverridden && (valor === '1' || valor === 'true');
                const effectiveOn = isOverridden ? overrideOn : globalOn;
                return `
                <div class="pc-toggle-row" style="padding:8px 12px;">
                    <div class="pc-toggle-info">
                        <div class="label" style="font-size:0.82rem;">${escapeHtml(c.etiqueta)}</div>
                        <div class="desc" style="font-size:0.72rem;">
                            ${isOverridden
                                ? `<span style="color:#f59e0b;font-weight:600;">Override: ${overrideOn ? 'ON' : 'OFF'}</span> · Global: ${globalOn ? 'ON' : 'OFF'}`
                                : `Actual: <span style="font-weight:600;color:${globalOn ? 'var(--success)' : 'var(--text-tertiary)'}">${globalOn ? 'Habilitado' : 'Deshabilitado'}</span>`
                            }
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        ${isOverridden ? '<span style="font-size:0.65rem;color:#f59e0b;font-weight:700;background:rgba(245,158,11,0.1);padding:2px 6px;border-radius:4px;"><i class="fas fa-star"></i> OVERRIDE</span>' : ''}
                        <label class="pc-switch">
                            <input type="checkbox" data-clave="${c.clave}" ${effectiveOn ? 'checked' : ''} onchange="togglePermisoOt('${c.clave}', this.checked)">
                            <span class="pc-switch-slider"></span>
                        </label>
                        ${isOverridden ? `<button class="pc-btn pc-btn-sm pc-btn-secondary" onclick="resetPermisoOt('${c.clave}')" title="Restaurar valor global" style="padding:3px 6px;"><i class="fas fa-undo"></i></button>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }).join('');
}

function togglePermisoOt(clave, checked) {
    const fd = new FormData();
    fd.append('ot_id', selectedOtId);
    fd.append('clave', clave);
    fd.append('valor', checked ? '1' : '0');
    apiFetch(`${API_PC}?action=ot_permiso`, fd).then(res => {
        if (res.status === 'success') { showToast('Permiso guardado'); loadOtDetalle(selectedOtId); }
        else showError(res.message || 'Error');
    });
}

function resetPermisoOt(clave) {
    const fd = new FormData();
    fd.append('ot_id', selectedOtId);
    fd.append('clave', clave);
    fd.append('valor', '');
    apiFetch(`${API_PC}?action=ot_permiso`, fd).then(res => {
        if (res.status === 'success') loadOtDetalle(selectedOtId);
    });
}

/* ════════════════════════════
   CONFIGURACIÓN
   ════════════════════════════ */
function loadConfig() {
    fetch(`${API_PC}?action=config`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) {
                configCache = res.data.items;
                renderConfig(res.data.secciones);
            }
        });
}

function renderConfig(secciones) {
    const container = el('configContainer');
    const sectionIcons = {
        'Datos del Cliente': 'fa-id-card',
        'Orden de Trabajo': 'fa-file-invoice',
        'Servicios y Checklist': 'fa-clipboard-list',
        'Presupuesto': 'fa-file-invoice-dollar',
        'Diagnóstico': 'fa-stethoscope',
        'Avances': 'fa-chart-line',
        'Comunicación': 'fa-comments',
        'Galería Multimedia': 'fa-images',
        'Solicitudes': 'fa-calendar-check',
        'Personalización': 'fa-palette',
    };

    const totalOn = configCache.filter(c => c.tipo === 'boolean' && (c.valor === '1' || c.valor === 'true')).length;
    const totalBoolean = configCache.filter(c => c.tipo === 'boolean').length;

    container.innerHTML = `
        <div style="padding:0.75rem 1.25rem;background:var(--bg-hover);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:0.82rem;color:var(--text-secondary);"><i class="fas fa-info-circle" style="margin-right:4px;"></i> <strong>${totalOn}</strong> de ${totalBoolean} secciones habilitadas para el portal</span>
            <button class="pc-btn pc-btn-sm pc-btn-secondary" onclick="toggleAllConfig(true)" title="Habilitar todo"><i class="fas fa-check-double"></i></button>
        </div>
        ${Object.entries(secciones).map(([sec, items]) => {
            const icon = sectionIcons[sec] || 'fa-cog';
            const secOn = items.filter(i => i.tipo === 'boolean' && (i.valor === '1' || i.valor === 'true')).length;
            const secTotal = items.filter(i => i.tipo === 'boolean').length;
            return `
            <div class="pc-seccion" style="border:none;border-radius:0;border-bottom:1px solid var(--border-subtle);margin-bottom:0;">
                <div class="pc-seccion-head" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.pc-toggle-icon').classList.toggle('fa-rotate-180')">
                    <h4>
                        <i class="fas ${icon}" style="color:var(--primary);"></i>
                        ${escapeHtml(sec)}
                        ${secTotal > 0 ? `<span style="font-size:0.72rem;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:8px;background:${secOn === secTotal ? 'rgba(16,185,129,0.1);color:#10b981' : secOn > 0 ? 'rgba(245,158,11,0.1);color:#f59e0b' : 'var(--bg-hover);color:var(--text-tertiary)'}">${secOn}/${secTotal}</span>` : ''}
                    </h4>
                    <i class="fas fa-chevron-down pc-toggle-icon" style="transition:transform 0.2s;"></i>
                </div>
                <div class="pc-seccion-body">
                    ${items.map(it => renderConfigItem(it)).join('')}
                </div>
            </div>`;
        }).join('')}`;

    container.querySelectorAll('input[data-clave]').forEach(inp => {
        inp.addEventListener('change', markConfigDirty);
    });
}

function renderConfigItem(item) {
    if (item.tipo === 'boolean') {
        const isOn = item.valor === '1' || item.valor === 'true';
        return `
        <div class="pc-toggle-row">
            <div class="pc-toggle-info">
                <div class="label">${escapeHtml(item.etiqueta)}</div>
                ${item.descripcion ? `<div class="desc">${escapeHtml(item.descripcion)}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:0.7rem;font-weight:600;color:${isOn ? 'var(--success)' : 'var(--text-tertiary)'};">${isOn ? 'ON' : 'OFF'}</span>
                <label class="pc-switch">
                    <input type="checkbox" data-clave="${item.clave}" data-tipo="boolean" ${isOn ? 'checked' : ''}>
                    <span class="pc-switch-slider"></span>
                </label>
            </div>
        </div>`;
    } else if (item.clave === 'color_primario') {
        return `
        <div class="pc-input-row">
            <label>${escapeHtml(item.etiqueta)}</label>
            <div class="pc-color-row">
                <input type="color" data-clave="${item.clave}" data-tipo="string" value="${escapeHtml(item.valor || '#4B7BEC')}">
                <input type="text" data-clave="${item.clave}" data-tipo="string" value="${escapeHtml(item.valor || '')}" style="flex:1;">
            </div>
        </div>`;
    } else {
        return `
        <div class="pc-input-row">
            <label>${escapeHtml(item.etiqueta)}${item.descripcion ? ` <span style="color:var(--text-tertiary);font-weight:400;">— ${escapeHtml(item.descripcion)}</span>` : ''}</label>
            <input type="text" data-clave="${item.clave}" data-tipo="string" value="${escapeHtml(item.valor || '')}" placeholder="${escapeHtml(item.etiqueta)}">
        </div>`;
    }
}

function toggleAllConfig(on) {
    document.querySelectorAll('#configContainer input[data-tipo="boolean"]').forEach(cb => {
        cb.checked = on;
    });
    markConfigDirty();
}

let configDirty = false;
function markConfigDirty() {
    configDirty = true;
    el('btnSaveConfig').innerHTML = '<i class="fas fa-save"></i> Guardar *';
    el('btnSaveConfig').classList.add('pc-btn-warning');
}

function saveConfig() {
    const items = [];
    document.querySelectorAll('#configContainer input[data-clave]').forEach(input => {
        const clave = input.dataset.clave;
        const tipo = input.dataset.tipo;
        let valor = '';
        if (tipo === 'boolean') valor = input.checked ? '1' : '0';
        else valor = input.value;
        items.push({ clave, valor });
    });

    if (!items.length) { showError('No hay configuración para guardar'); return; }

    const btn = el('btnSaveConfig');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    const fd = new FormData();
    fd.append('action', 'save_config');
    fd.append('items_json', JSON.stringify(items));

    fetch(API_PC, { method: 'POST', body: fd })
    .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error('HTTP ' + r.status + ': ' + t.substring(0, 300)); });
        return r.json();
    })
    .then(res => {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        if (res.status === 'success') {
            showSuccess(res.message || 'Configuración guardada');
            configDirty = false;
            el('btnSaveConfig').classList.remove('pc-btn-warning');
            showSaveBar('Configuración guardada');
            loadConfig();
        } else showError(res.message || 'Error al guardar');
    })
    .catch(err => {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        showError('Error: ' + err.message);
    });
}

function showSaveBar(text) {
    const bar = el('saveBar');
    el('saveBarText').textContent = text;
    bar.classList.add('show');
    setTimeout(() => bar.classList.remove('show'), 2000);
}

/* ════════════════════════════
   TOP OTs
   ════════════════════════════ */
function loadTopOts() {
    fetch(`${API_PC}?action=stats`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) {
                const top = res.data.ots_mas_activas || [];
                const container = el('topOtsList');
                if (!top.length) { container.innerHTML = '<div class="pc-empty"><p>Sin actividad</p></div>'; return; }
                container.innerHTML = top.map(ot => {
                    const otId = ot.id || ot.ot_id || 0;
                    const nombre = (ot.cliente_nombre || ot.nombre || '') + ' ' + (ot.cliente_apellido || ot.apellido || '');
                    const folio = ot.folio_ot || ('OT-' + String(otId).padStart(5, '0'));
                    return `
                    <div class="pc-ot-item" onclick="selectOt(${otId})" style="grid-template-columns: 1fr auto;padding:0.75rem 1.25rem;">
                        <div class="pc-ot-info">
                            <div class="pc-ot-cliente" style="font-size:0.85rem;">${escapeHtml(folio)} · ${escapeHtml(nombre.trim())}</div>
                        </div>
                        <div class="pc-ot-stat" style="background:var(--primary-glow);">
                            <span class="num" style="color:var(--primary);">${ot.total}</span>
                            <span class="lbl">msgs</span>
                        </div>
                    </div>`;
                }).join('');
            }
        });
}

/* ════════════════════════════
   HELPERS
   ════════════════════════════ */
function getEstadoLabel(e) {
    const m = { pendiente:'Pendiente', en_proceso:'En Proceso', proceso:'En Proceso', diagnostico:'Diagnóstico', finalizado:'Finalizado', completado:'Completado', entregado:'Entregado', facturado:'Facturado', cancelado:'Cancelado', borrador:'Borrador', pendiente_aprobacion:'Pend. Aprobación', aprobado:'Aprobado', rechazada:'Rechazada', abierta:'Abierta', pausado:'Pausado', esperando_repuesto:'Esperando Rep.' };
    return m[e] || e;
}

function fmtDateShort(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}
