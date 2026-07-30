/**
 * portal.js — Portal de Clientes v2 (Arquitectura modular escalable)
 *
 * Patrón: Cada tab se registra como módulo independiente.
 * Para agregar una nueva tab: llamar PortalTab.register({ id, label, icon, render, onActivate })
 */
const API = API_ROOT + 'portal_api.php';
let currentOtId = null;
let currentData = null;
let chatPollInterval = null;
let updatePollInterval = null;
let lastComentarioId = 0;

/* ════════════════════════════════════════════════════════════
   PORTAL TAB REGISTRY — Sistema de tabs escalable
   ════════════════════════════════════════════════════════════ */
const PortalTab = {
    _tabs: [],

    register(tab) {
        this._tabs.push({
            id: tab.id,
            label: tab.label,
            icon: tab.icon,
            badge: tab.badge || null,
            render: tab.render,
            onActivate: tab.onActivate || null,
            show: tab.show !== undefined ? tab.show : true,
        });
    },

    getVisible() {
        return this._tabs.filter(t => t.show);
    },

    renderAll(data) {
        this._tabs.forEach(t => {
            if (t.show && typeof t.render === 'function') t.render(data);
        });
    },

    activate(tabId) {
        const t = this._tabs.find(x => x.id === tabId);
        if (t && t.onActivate) t.onActivate();
    },

    updateBadge(tabId, count) {
        const t = this._tabs.find(x => x.id === tabId);
        if (!t) return;
        t.badge = count;
        const el = document.querySelector(`[data-tab="${tabId}"] .tab-badge`);
        if (el) {
            el.textContent = count;
            el.style.display = count > 0 ? '' : 'none';
        }
    }
};

/* ════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    registerAllTabs();

    el('btnSearch')?.addEventListener('click', searchOT);
    el('searchInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchOT(); } });
    el('btnSolicitarHeader')?.addEventListener('click', () => openModal());
    el('btnSolicitarVisita')?.addEventListener('click', () => openModal());
    el('btnSubmitVisita')?.addEventListener('click', submitVisita);
    el('btnCloseModal')?.addEventListener('click', closeModal);
    el('btnCancelModal')?.addEventListener('click', closeModal);
    el('visitaModal')?.addEventListener('click', (e) => { if (e.target === el('visitaModal')) closeModal(); });
    el('lightboxClose')?.addEventListener('click', closeLightbox);
    el('lightbox')?.addEventListener('click', (e) => { if (e.target === el('lightbox')) closeLightbox(); });

    const params = new URLSearchParams(window.location.search);
    const otParam = params.get('ot');
    const rutParam = params.get('rut');
    if (otParam) { el('searchInput').value = otParam; searchOT(); }
    else if (rutParam) { el('searchInput').value = rutParam; searchOT(); }
});

/* ════════════════════════════════════════════════════════════
   TAB REGISTRATION — Registra todos los módulos de tabs
   ════════════════════════════════════════════════════════════ */
function registerAllTabs() {
    const cfg = currentData?.config || {};

    // Tab: Resumen (siempre visible)
    PortalTab.register({
        id: 'tab-resumen', label: 'Resumen', icon: 'fa-chart-line',
        show: true,
        render: renderTabResumen,
    });

    // Tab: Ejecución
    PortalTab.register({
        id: 'tab-ejecucion', label: 'Ejecución', icon: 'fa-tasks',
        show: true,
        render: renderTabEjecucion,
        onActivate: () => loadEjecucion(),
    });

    // Tab: Avances
    PortalTab.register({
        id: 'tab-avances', label: 'Avances', icon: 'fa-chart-bar',
        show: cfg.mostrar_avances !== false,
        render: renderTabAvances,
    });

    // Tab: Presupuesto
    PortalTab.register({
        id: 'tab-presupuesto', label: 'Presupuesto', icon: 'fa-file-invoice-dollar',
        show: cfg.mostrar_presupuesto !== false,
        render: renderTabPresupuesto,
    });

    // Tab: Comunicación
    PortalTab.register({
        id: 'tab-comunicacion', label: 'Comunicación', icon: 'fa-comments',
        show: cfg.mostrar_chat !== false,
        render: renderTabComunicacion,
        onActivate: () => { scrollChatBottom(); el('chatInput')?.focus(); },
    });

    // Tab: Galería
    PortalTab.register({
        id: 'tab-galeria', label: 'Galería', icon: 'fa-images',
        show: cfg.mostrar_galeria !== false,
        render: renderTabGaleria,
        onActivate: () => loadGaleria(),
    });
}

/* ════════════════════════════════════════════════════════════
   SEARCH
   ════════════════════════════════════════════════════════════ */
function searchOT() {
    const q = el('searchInput').value.trim();
    if (!q) { showError('Ingrese un RUT o número de OT'); el('searchInput').focus(); return; }

    el('loadingSpinner').style.display = 'flex';
    el('resultsArea').classList.remove('visible');
    el('resultsContainer').innerHTML = '';
    el('btnSearch').disabled = true;

    fetch(`${API}?action=search&q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(res => {
            el('loadingSpinner').style.display = 'none';
            el('btnSearch').disabled = false;
            if (res.status === 'success' && res.data) {
                currentData = res.data;
                currentOtId = res.data.ot?.id || null;
                lastComentarioId = 0;
                renderOT(res.data);
            } else {
                el('resultsArea').classList.add('visible');
                el('resultsContainer').innerHTML = `
                    <div class="empty-state"><i class="fas fa-search-minus"></i>
                    <p style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">Sin resultados</p>
                    <p style="font-size:0.85rem;">No encontramos órdenes asociadas a <strong>${escapeHtml(q)}</strong>.</p></div>`;
            }
        })
        .catch(() => {
            el('loadingSpinner').style.display = 'none';
            el('btnSearch').disabled = false;
            el('resultsArea').classList.add('visible');
            el('resultsContainer').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p></div>`;
        });
}

/* ════════════════════════════════════════════════════════════
   RENDER OT — Hero + Tabs (registrados dinámicamente)
   ════════════════════════════════════════════════════════════ */
function renderOT(data) {
    el('resultsArea').classList.add('visible');
    const c = el('resultsContainer');
    const ot = data.ot || {};
    const v = data.vehiculo || null;
    const cl = data.cliente || null;
    const emp = data.empleado || null;
    const progreso = data.progreso || {};
    const cfg = data.config || {};

    if (cl === null && v === null) {
        c.innerHTML = '<div class="empty-state"><i class="fas fa-eye-slash"></i><p>Esta información no está disponible públicamente</p></div>';
        return;
    }

    const folio = ot.folio_ot || `OT-${String(ot.id).padStart(5, '0')}`;
    const estado = ot.estado || 'pendiente';
    const fechaStr = ot.fecha ? new Date(ot.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
    const vehiculoStr = v ? [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || '—' : '—';
    const clienteNombre = cl ? ((cl.nombre || '') + ' ' + (cl.apellido || '')) : '—';
    const pct = progreso.porcentaje || 0;

    // Aplicar color personalizado
    if (cfg.color_primario && /^#[0-9A-Fa-f]{6}$/.test(cfg.color_primario)) {
        document.documentElement.style.setProperty('--primary', cfg.color_primario);
    }

    // Aplicar título/subtítulo personalizado
    const heroTitle = el('heroTitle');
    const heroSubtitle = el('heroSubtitle');
    if (heroTitle && cfg.titulo_portal) heroTitle.textContent = cfg.titulo_portal;
    if (heroSubtitle && cfg.subtitulo_portal) heroSubtitle.textContent = cfg.subtitulo_portal;

    // Hero
    let heroHtml = `
        <div class="ot-hero">
            <div class="ot-hero-top">
                <div class="ot-hero-folio"><i class="fas fa-wrench" style="margin-right:10px;opacity:0.6;"></i>${escapeHtml(folio)}</div>
                ${cfg.mostrar_estado_ot !== false && estado ? `<span class="ot-hero-estado ${estado}">${getEstadoLabel(estado)}</span>` : ''}
            </div>
            <div class="ot-hero-grid">
                ${v ? `<div class="ot-hero-item"><span class="label">Vehículo</span><span class="value">${escapeHtml(vehiculoStr)}</span></div>` : ''}
                ${cfg.mostrar_patente !== false && v?.patente ? `<div class="ot-hero-item"><span class="label">Patente</span><span class="value">${escapeHtml(v.patente)}</span></div>` : ''}
                ${cl ? `<div class="ot-hero-item"><span class="label">Cliente</span><span class="value">${escapeHtml(clienteNombre)}</span></div>` : ''}
                ${cfg.mostrar_fecha_ingreso !== false ? `<div class="ot-hero-item"><span class="label">Fecha ingreso</span><span class="value">${fechaStr}</span></div>` : ''}
                ${emp ? `<div class="ot-hero-item"><span class="label">Técnico</span><span class="value">${escapeHtml(emp.nombre || 'Sin asignar')}</span></div>` : ''}
                ${cl?.rut ? `<div class="ot-hero-item"><span class="label">RUT</span><span class="value">${escapeHtml(cl.rut)}</span></div>` : ''}
            </div>
            ${cfg.mostrar_progreso !== false ? `
            <div class="ot-progress">
                <div class="ot-progress-header">
                    <span class="ot-progress-label">Progreso del servicio</span>
                    <span class="ot-progress-pct">${pct}%</span>
                </div>
                <div class="ot-progress-track">
                    <div class="ot-progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="ot-progress-stats">
                    <span class="ps-done"><i class="fas fa-check"></i> ${progreso.completados || 0} completados</span>
                    <span class="ps-proc"><i class="fas fa-spinner"></i> ${progreso.en_proceso || 0} en proceso</span>
                    <span class="ps-pend"><i class="fas fa-hourglass"></i> ${progreso.pendientes || 0} pendientes</span>
                </div>
            </div>` : ''}
        </div>`;

    // Tabs
    let tabsHtml = '';
    let panelsHtml = '';
    const visibleTabs = PortalTab.getVisible();

    visibleTabs.forEach((t, i) => {
        const active = i === 0 ? ' active' : '';
        const badgeHtml = t.badge != null && t.badge > 0 ? `<span class="tab-badge">${t.badge}</span>` : '';
        tabsHtml += `<button class="portal-tab${active}" data-tab="${t.id}"><i class="fas ${t.icon}"></i> ${t.label}${badgeHtml}</button>`;
        panelsHtml += `<div class="tab-panel${active}" id="${t.id}"></div>`;
    });

    c.innerHTML = heroHtml + `<div class="portal-tabs" id="portalTabs">${tabsHtml}</div>` + panelsHtml;

    // Tab click handlers
    document.querySelectorAll('.portal-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Render content for each visible tab
    visibleTabs.forEach(t => {
        if (typeof t.render === 'function') t.render(data);
    });

    // Async data loads
    if (cfg.mostrar_chat !== false) {
        loadComentarios();
        setupChatInput();
    }

    // Polling para updates
    startUpdatePolling();

    // Quick links
    const qlTitle = el('quickLinksTitle');
    if (qlTitle) qlTitle.style.display = (cfg.mostrar_solicitar_visita !== false || cfg.mostrar_quick_links !== false) ? '' : 'none';
}

function switchTab(tabId) {
    document.querySelectorAll('.portal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
    PortalTab.activate(tabId);
}

/* ════════════════════════════════════════════════════════════
   TAB: RESUMEN
   ════════════════════════════════════════════════════════════ */
function renderTabResumen(data) {
    const panel = el('tab-resumen');
    if (!panel) return;
    const ot = data.ot || {};
    const diags = data.diagnosticos || [];
    const etapas = data.etapas || [];
    const cfg = data.config || {};

    let html = '';

    // Timeline
    if (cfg.mostrar_timeline !== false) {
        html += `<div class="p-card"><div class="p-card-head"><h3><i class="fas fa-clock"></i> Línea de Tiempo</h3></div><div class="p-card-body">${renderTimeline(etapas, diags, data.avances || [], ot)}</div></div>`;
    }

    // Etapas de ejecución
    if (etapas.length) {
        html += `<div class="p-card"><div class="p-card-head"><h3><i class="fas fa-flag-checkered"></i> Fases del Servicio</h3></div><div class="p-card-body">${renderEtapas(etapas)}</div></div>`;
    }

    // Diagnósticos
    if (cfg.mostrar_diagnosticos !== false && diags.length) {
        html += renderDiagnosticos(diags);
    }

    panel.innerHTML = html || '<div class="empty-state"><i class="fas fa-info-circle"></i><p>Sin datos de resumen disponibles</p></div>';
}

/* ════════════════════════════════════════════════════════════
   TAB: EJECUCIÓN (Checklist + Steps + Media por servicio)
   ════════════════════════════════════════════════════════════ */
function renderTabEjecucion(data) {
    const panel = el('tab-ejecucion');
    if (!panel) return;
    panel.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando ejecución...</p></div>';
    loadEjecucion();
}

async function loadEjecucion() {
    if (!currentOtId) return;
    const panel = el('tab-ejecucion');
    if (!panel) return;

    try {
        const r = await fetch(`${API}?action=ejecucion&ot_id=${currentOtId}`);
        const res = await r.json();
        if (res.status !== 'success' || !res.data) {
            panel.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar ejecución</p></div>';
            return;
        }
        panel.innerHTML = renderEjecucionItems(res.data);
    } catch (e) {
        panel.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p></div>';
    }
}

function renderEjecucionItems(items) {
    if (!items.length) return '<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>Sin servicios registrados aún</p></div>';

    let html = '<div class="ejecucion-grid">';
    items.forEach(item => {
        const st = item.estado_item || 'pendiente';
        const stClass = st === 'completado' ? 'completado' : st === 'en_proceso' ? 'en_proceso' : 'pendiente';
        const stIcon = st === 'completado' ? 'fa-check-circle' : st === 'en_proceso' ? 'fa-spinner fa-spin' : 'fa-hourglass-start';
        const stLabel = st === 'completado' ? 'Completado' : st === 'en_proceso' ? 'En Proceso' : 'Pendiente';
        const isImprevisto = item.es_imprevisto == 1;
        const cl = item.checklist;
        const clPct = cl ? cl.porcentaje_completado || 0 : (st === 'completado' ? 100 : 0);

        html += `<div class="ej-card ${stClass}${isImprevisto ? ' imprevisto' : ''}">
            <div class="ej-card-head">
                <div class="ej-card-icon ${stClass}"><i class="fas ${stIcon}"></i></div>
                <div class="ej-card-title">
                    <h4>${escapeHtml(item.nombre || 'Servicio')}${isImprevisto ? ' <span class="tag-imprevisto">Imprevisto</span>' : ''}</h4>
                    ${item.detalle ? `<p>${escapeHtml(item.detalle)}</p>` : ''}
                </div>
                <span class="ej-badge ${stClass}">${stLabel}</span>
            </div>`;

        // Checklist progress
        if (cl) {
            html += `<div class="ej-checklist-progress">
                <div class="ej-cl-header">
                    <span><i class="fas fa-clipboard-check"></i> ${escapeHtml(cl.nombre || 'Checklist')}</span>
                    <span class="ej-cl-pct">${clPct}%</span>
                </div>
                <div class="ej-cl-bar"><div class="ej-cl-bar-fill" style="width:${clPct}%"></div></div>
            </div>`;
        }

        // Checklist pasos
        if (cl && cl.pasos && cl.pasos.length) {
            html += '<div class="ej-pasos">';
            cl.pasos.forEach(paso => {
                const pasoSt = paso.completado ? 'completado' : 'pendiente';
                const pasoIcon = paso.completado ? 'fa-check-circle' : 'fa-circle';
                html += `<div class="ej-paso ${pasoSt}">
                    <div class="ej-paso-icon"><i class="fas ${pasoIcon}"></i></div>
                    <div class="ej-paso-content">
                        <div class="ej-paso-title">${escapeHtml(paso.titulo)}</div>
                        ${paso.descripcion ? `<div class="ej-paso-desc">${escapeHtml(paso.descripcion)}</div>` : ''}
                        ${paso.notas ? `<div class="ej-paso-notas"><i class="fas fa-sticky-note"></i> ${escapeHtml(paso.notas)}</div>` : ''}
                        ${paso.completado_por ? `<div class="ej-paso-meta">por ${escapeHtml(paso.completado_por)} · ${fmtDateTime(paso.completado_en)}</div>` : ''}
                        ${renderPasoMedia(paso)}
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        // Labores realizadas
        if (item.labores_realizadas) {
            html += `<div class="ej-labores"><i class="fas fa-file-alt"></i> <strong>Trabajo realizado:</strong> ${escapeHtml(item.labores_realizadas)}</div>`;
        }

        // Media del item
        if ((item.fotos && item.fotos.length) || (item.audios && item.audios.length)) {
            html += '<div class="ej-media">';
            (item.fotos || []).forEach(f => {
                const src = f.ruta_archivo?.startsWith('/') ? f.ruta_archivo : '/' + f.ruta_archivo;
                html += `<div class="ej-media-thumb" onclick="openLightbox('img','${escapeHtml(src)}')"><img src="${escapeHtml(src)}" alt="" loading="lazy"></div>`;
            });
            (item.audios || []).forEach(a => {
                const src = a.ruta_archivo?.startsWith('/') ? a.ruta_archivo : '/' + a.ruta_archivo;
                html += `<div class="ej-media-audio"><i class="fas fa-headphones"></i><audio src="${escapeHtml(src)}" controls></audio></div>`;
            });
            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div>';
    return html;
}

function renderPasoMedia(paso) {
    let html = '';
    const allMedia = [...(paso.fotos || []), ...(paso.videos || []), ...(paso.notas_voz || [])];
    if (!allMedia.length) return '';

    html += '<div class="ej-paso-media">';
    allMedia.forEach(m => {
        const src = m.ruta_archivo?.startsWith('/') ? m.ruta_archivo : '/' + m.ruta_archivo;
        const isVideo = m.nombre_original && /\.(mp4|webm|mov)$/i.test(m.nombre_original);
        const isAudio = m.nombre_original && /\.(wav|ogg|mp3|m4a)$/i.test(m.nombre_original);

        if (isAudio) {
            html += `<div class="ej-pm-item audio"><i class="fas fa-headphones"></i><audio src="${escapeHtml(src)}" controls></audio></div>`;
        } else if (isVideo) {
            html += `<div class="ej-pm-item video" onclick="openLightbox('video','${escapeHtml(src)}')"><i class="fas fa-play-circle"></i></div>`;
        } else {
            html += `<div class="ej-pm-item foto" onclick="openLightbox('img','${escapeHtml(src)}')"><img src="${escapeHtml(src)}" alt="" loading="lazy"></div>`;
        }
    });
    html += '</div>';
    return html;
}

/* ════════════════════════════════════════════════════════════
   TAB: AVANCES
   ════════════════════════════════════════════════════════════ */
function renderTabAvances(data) {
    const panel = el('tab-avances');
    if (!panel) return;
    const avances = data.avances || [];
    if (!avances.length) {
        panel.innerHTML = '<div class="p-card"><div class="p-card-body"><div class="empty-state"><i class="fas fa-chart-line"></i><p>No hay avances registrados aún</p><p style="font-size:0.82rem;color:var(--text-tertiary);margin-top:4px;">El técnico irá publicando el progreso del servicio aquí.</p></div></div></div>';
        return;
    }

    panel.innerHTML = `<div class="p-card"><div class="p-card-head"><h3><i class="fas fa-chart-bar"></i> Avances del Servicio</h3></div><div class="p-card-body">
        <div class="timeline">${avances.map(a => `
        <div class="tl-item">
            <div class="tl-dot"><i class="fas fa-chart-line"></i></div>
            <div class="tl-content">
                <div class="tl-title">${escapeHtml(a.titulo || 'Avance')}</div>
                ${a.descripcion ? `<div class="tl-desc">${escapeHtml(a.descripcion)}</div>` : ''}
                ${a.porcentaje != null ? `<div style="margin-top:8px;display:flex;align-items:center;gap:8px;"><div class="ot-progress-track" style="height:6px;flex:1;"><div class="ot-progress-fill" style="width:${a.porcentaje}%"></div></div><span style="font-size:0.78rem;font-weight:700;color:var(--primary);">${a.porcentaje}%</span></div>` : ''}
                ${a.multimedia && a.multimedia.length ? renderAvanceMedia(a.multimedia) : ''}
                <div class="tl-date"><i class="fas fa-clock"></i> ${fmtDate(a.creado, true)} · ${escapeHtml(a.autor_nombre || 'Sistema')}</div>
            </div>
        </div>`).join('')}</div></div></div>`;
}

function renderAvanceMedia(media) {
    return `<div class="avance-media">${media.map(m => {
        const src = m.ruta_archivo?.startsWith('/') ? m.ruta_archivo : '/' + m.ruta_archivo;
        const isVideo = m.tipo_archivo === 'video';
        const isAudio = m.tipo_archivo === 'nota_voz';
        if (isAudio) return `<div class="am-item"><i class="fas fa-headphones"></i><audio src="${escapeHtml(src)}" controls></audio></div>`;
        if (isVideo) return `<div class="am-item video" onclick="openLightbox('video','${escapeHtml(src)}')"><i class="fas fa-play-circle"></i></div>`;
        return `<div class="am-item foto" onclick="openLightbox('img','${escapeHtml(src)}')"><img src="${escapeHtml(src)}" alt="" loading="lazy"></div>`;
    }).join('')}</div>`;
}

/* ════════════════════════════════════════════════════════════
   TAB: PRESUPUESTO
   ════════════════════════════════════════════════════════════ */
function renderTabPresupuesto(data) {
    const panel = el('tab-presupuesto');
    if (!panel) return;
    const ppto = data.presupuesto;
    const items = data.presupuesto_items || [];
    const cfg = data.config || {};

    if (!ppto) {
        panel.innerHTML = '<div class="p-card"><div class="p-card-body"><div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><p>Sin presupuesto disponible</p></div></div></div>';
        return;
    }

    const total = ppto.valor_total || ppto.valor || 0;
    const rowsHtml = items.length ? items.map(it => `
        <tr>
            <td>${escapeHtml(it.nombre || '')}${it.detalle ? `<br><small style="color:var(--text-tertiary);font-size:0.76rem;">${escapeHtml(it.detalle)}</small>` : ''}</td>
            <td>${it.cantidad || 1}</td>
            <td style="text-align:right;">${formatMoney(it.valor_unitario)}</td>
            <td style="text-align:right;font-weight:600;">${formatMoney((it.valor_unitario || 0) * (it.cantidad || 1))}</td>
        </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);padding:1.5rem;">Sin ítems</td></tr>';

    panel.innerHTML = `
    <div class="p-card">
        <div class="p-card-head">
            <h3><i class="fas fa-file-invoice-dollar"></i> Presupuesto</h3>
            ${cfg.mostrar_presupuesto_estado !== false ? `<span class="ej-badge ${ppto.estado === 'aprobado' ? 'completado' : 'pendiente'}">${getEstadoLabel(ppto.estado || 'borrador')}</span>` : ''}
        </div>
        <div class="p-card-body">
            <div style="overflow-x:auto;">
                <table class="ppto-table">
                    <thead><tr><th>Ítem</th><th>Cant.</th><th style="text-align:right;">Valor Unit.</th><th style="text-align:right;">Total</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            ${cfg.mostrar_presupuesto_total !== false ? `<div class="ppto-total">Total: <span class="amount">${formatMoney(total)}</span></div>` : ''}
            ${ppto.observaciones ? `<p style="margin-top:8px;font-size:0.82rem;color:var(--text-secondary);"><strong>Observaciones:</strong> ${escapeHtml(ppto.observaciones)}</p>` : ''}
        </div>
    </div>`;
}

/* ════════════════════════════════════════════════════════════
   TAB: COMUNICACIÓN (Chat)
   ════════════════════════════════════════════════════════════ */
function renderTabComunicacion(data) {
    const panel = el('tab-comunicacion');
    if (!panel) return;
    const cfg = data.config || {};
    const showAttach = cfg.permitir_subir_fotos !== false || cfg.permitir_subir_videos !== false || cfg.permitir_grabar_audio !== false;
    const sendDisabled = cfg.permitir_enviar_mensajes === false;

    panel.innerHTML = `<div class="p-card"><div class="p-card-head"><h3><i class="fas fa-comments"></i> Comunicación con el Taller</h3></div><div class="p-card-body" style="padding:0;">
        <div class="chat-container" id="chatContainer">
            <div class="chat-messages" id="chatMessages"><div class="empty-state" style="padding:2rem;"><i class="fas fa-comments"></i><p>Cargando conversación...</p></div></div>
            <div class="chat-input">
                ${showAttach ? `<div class="chat-attach">
                    <button title="Subir foto" onclick="triggerFileUpload('foto')" style="${cfg.permitir_subir_fotos === false ? 'display:none' : ''}"><i class="fas fa-camera"></i></button>
                    <button title="Subir video" onclick="triggerFileUpload('video')" style="${cfg.permitir_subir_videos === false ? 'display:none' : ''}"><i class="fas fa-video"></i></button>
                    <button title="Grabar nota de voz" onclick="triggerFileUpload('nota_voz')" style="${cfg.permitir_grabar_audio === false ? 'display:none' : ''}"><i class="fas fa-microphone"></i></button>
                </div>` : ''}
                <input type="text" id="chatInput" placeholder="${sendDisabled ? 'Chat deshabilitado' : 'Escriba un mensaje...'}" autocomplete="off" ${sendDisabled ? 'disabled' : ''}>
                <button onclick="enviarComentario()" ${sendDisabled ? 'disabled' : ''}><i class="fas fa-paper-plane"></i></button>
            </div>
            <input type="file" id="fileUploadInput" accept="image/*,video/*,audio/*" style="display:none;">
        </div>
    </div></div>`;
}

function loadComentarios() {
    if (!currentOtId) return;
    fetch(`${API}?action=comentarios&ot_id=${currentOtId}`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) {
                renderChat(res.data);
                if (res.data.length) lastComentarioId = Math.max(...res.data.map(c => c.id || 0));
            }
        });
}

function renderChat(msgs) {
    const container = el('chatMessages');
    if (!container) return;
    if (!msgs.length) {
        container.innerHTML = `<div class="empty-state" style="padding:2rem;"><i class="fas fa-comments"></i><p>Inicie una conversación con el taller</p><p style="font-size:0.82rem;color:var(--text-tertiary);margin-top:4px;">Escriba un mensaje, comparta fotos o notas de voz.</p></div>`;
        return;
    }
    container.innerHTML = msgs.map(m => `
        <div class="chat-msg ${escapeHtml(m.autor_tipo || 'cliente')}">
            <div class="msg-author">${escapeHtml(m.autor_nombre || (m.autor_tipo === 'cliente' ? 'Usted' : 'Taller'))}</div>
            <div>${escapeHtml(m.mensaje || '')}</div>
            <div class="msg-time">${fmtDateTime(m.creado)}</div>
        </div>`).join('');
    scrollChatBottom();
}

function scrollChatBottom() {
    const c = el('chatMessages');
    if (c) setTimeout(() => c.scrollTop = c.scrollHeight, 100);
}

function setupChatInput() {
    const input = el('chatInput');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentario(); }
    });
    el('fileUploadInput')?.addEventListener('change', handleFileUpload);
}

function enviarComentario() {
    const input = el('chatInput');
    const msg = input?.value.trim();
    if (!msg || !currentOtId) return;

    const container = el('chatMessages');
    const emptyState = container?.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg cliente';
    msgDiv.innerHTML = `<div class="msg-author">Usted</div><div>${escapeHtml(msg)}</div><div class="msg-time">Ahora</div>`;
    container?.appendChild(msgDiv);
    scrollChatBottom();
    input.value = '';

    fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comentar', ot_id: currentOtId, mensaje: msg, nombre: currentData?.cliente?.nombre || 'Cliente' })
    }).then(r => r.json()).then(res => {
        if (res.status !== 'success') { msgDiv.style.opacity = '0.5'; msgDiv.title = res.message || 'Error'; }
        else lastComentarioId = res.data?.id || lastComentarioId;
    }).catch(() => { msgDiv.style.opacity = '0.5'; });
}

/* ════════════════════════════════════════════════════════════
   FILE UPLOAD
   ════════════════════════════════════════════════════════════ */
let pendingUploadType = 'foto';
function triggerFileUpload(tipo) { pendingUploadType = tipo; el('fileUploadInput')?.click(); }

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || !currentOtId) return;

    const container = el('chatMessages');
    const uploading = document.createElement('div');
    uploading.className = 'chat-msg cliente';
    uploading.innerHTML = `<div class="msg-author">Usted</div><div><i class="fas fa-spinner fa-spin"></i> Subiendo ${pendingUploadType}...</div>`;
    container?.appendChild(uploading);
    scrollChatBottom();

    const fd = new FormData();
    fd.append('ot_id', currentOtId);
    fd.append('tipo', pendingUploadType);
    fd.append('archivo', file);
    fd.append('nombre', currentData?.cliente?.nombre || 'Cliente');

    fetch(API, { method: 'POST', body: fd })
        .then(r => r.json())
        .then(res => {
            uploading.remove();
            if (res.status === 'success') {
                const labels = { foto: 'Foto enviada', video: 'Video enviado', nota_voz: 'Nota de voz enviada' };
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chat-msg cliente';
                msgDiv.innerHTML = `<div class="msg-author">Usted</div><div>${labels[pendingUploadType] || 'Archivo enviado'}</div><div class="msg-time">Ahora</div>`;
                container?.appendChild(msgDiv);
                scrollChatBottom();
            } else showError(res.message || 'Error al subir');
        })
        .catch(() => { uploading.remove(); showError('Error de conexión'); });

    e.target.value = '';
}

/* ════════════════════════════════════════════════════════════
   TAB: GALERÍA
   ════════════════════════════════════════════════════════════ */
function renderTabGaleria(data) {
    const panel = el('tab-galeria');
    if (!panel) return;
    const mediaData = data.multimedia || [];
    if (mediaData.length) {
        renderGaleria({ servicios: mediaData });
    } else {
        loadGaleria();
    }
}

function loadGaleria() {
    if (!currentOtId) return;
    const panel = el('tab-galeria');
    if (!panel) return;
    panel.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando galería...</p></div>';

    fetch(`${API}?action=multimedia&ot_id=${currentOtId}`)
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' && res.data) renderGaleria(res.data);
            else panel.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><p>Error al cargar galería</p></div>';
        })
        .catch(() => { panel.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error de conexión</p></div>'; });
}

function renderGaleria(data) {
    const c = el('tab-galeria');
    if (!c) return;
    const all = [...(data.servicios || []), ...(data.recepcion || []), ...(data.cliente || [])];

    if (!all.length) {
        c.innerHTML = `<div class="empty-state"><i class="fas fa-images"></i><p>No hay archivos multimedia disponibles</p></div>`;
        return;
    }

    c.innerHTML = `<div class="gallery-grid">${all.map(m => {
        const isVideo = m.tipo_archivo === 'video' || (m.ruta_archivo && /\.(mp4|webm|mov)$/i.test(m.ruta_archivo));
        const isAudio = m.tipo_archivo === 'nota_voz' || (m.ruta_archivo && /\.(wav|ogg|mp3|m4a)$/i.test(m.ruta_archivo));
        const src = m.ruta_archivo?.startsWith('/') ? m.ruta_archivo : (m.ruta_archivo ? '/' + m.ruta_archivo : '');
        const orig = m.nombre_original || m.origen || '';

        if (isAudio) return `<div class="gallery-item audio" onclick="openLightbox('audio','${escapeHtml(src)}')"><div class="gi-icon"><i class="fas fa-headphones"></i></div><div class="gi-label">${escapeHtml(orig)}</div></div>`;
        if (isVideo) return `<div class="gallery-item video" onclick="openLightbox('video','${escapeHtml(src)}')"><video src="${escapeHtml(src)}" muted></video><div class="gi-label"><i class="fas fa-play-circle"></i> ${escapeHtml(orig)}</div></div>`;
        return `<div class="gallery-item" onclick="openLightbox('img','${escapeHtml(src)}')"><img src="${escapeHtml(src)}" alt="${escapeHtml(orig)}" loading="lazy"><div class="gi-label">${escapeHtml(orig)}</div></div>`;
    }).join('')}</div>`;
}

/* ════════════════════════════════════════════════════════════
   LIGHTBOX
   ════════════════════════════════════════════════════════════ */
function openLightbox(type, src) {
    const lb = el('lightbox');
    const content = el('lightboxContent');
    if (!lb || !content) return;
    if (type === 'img') content.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:85vh;border-radius:8px;">`;
    else if (type === 'video') content.innerHTML = `<video src="${src}" controls autoplay style="max-width:90vw;max-height:85vh;border-radius:8px;"></video>`;
    else if (type === 'audio') content.innerHTML = `<div style="background:var(--bg-card,#1a1a2e);padding:2rem;border-radius:12px;text-align:center;"><i class="fas fa-headphones" style="font-size:3rem;color:var(--primary);margin-bottom:1rem;display:block;"></i><audio src="${src}" controls autoplay style="width:100%;max-width:400px;"></audio></div>`;
    lb.classList.add('active');
}
function closeLightbox() { el('lightbox')?.classList.remove('active'); el('lightboxContent').innerHTML = ''; }

/* ════════════════════════════════════════════════════════════
   MODAL (Visita)
   ════════════════════════════════════════════════════════════ */
function openModal(id = 'visitaModal') {
    const m = el(id);
    if (!m) return;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (id === 'visitaModal') setTimeout(() => el('visitaNombre')?.focus(), 100);
}
function closeModal(id = 'visitaModal') {
    const m = el(id);
    if (!m) return;
    m.classList.remove('active');
    document.body.style.overflow = '';
}

function submitVisita() {
    const fd = new FormData();
    fd.append('nombre', el('visitaNombre')?.value.trim() || '');
    fd.append('telefono', el('visitaTelefono')?.value.trim() || '');
    fd.append('correo', el('visitaCorreo')?.value.trim() || '');
    fd.append('patente', el('visitaPatente')?.value.trim() || '');
    fd.append('vehiculo', el('visitaVehiculo')?.value.trim() || '');
    fd.append('motivo', el('visitaMotivo')?.value.trim() || '');

    if (!fd.get('nombre')) { showError('El nombre es obligatorio'); return; }
    if (!fd.get('telefono')) { showError('El teléfono es obligatorio'); return; }
    if (!fd.get('patente')) { showError('La patente es obligatoria'); return; }
    if (!fd.get('motivo')) { showError('El motivo es obligatorio'); return; }

    fetch(API + '?action=solicitar_visita', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success') {
                showSuccess(res.message);
                closeModal();
                el('visitaNombre').value = '';
                el('visitaTelefono').value = '';
                el('visitaCorreo').value = '';
                el('visitaPatente').value = '';
                el('visitaVehiculo').value = '';
                el('visitaMotivo').value = '';
            } else showError(res.message || 'Error');
        })
        .catch(() => showError('Error de conexión'));
}

/* ════════════════════════════════════════════════════════════
   POLLING — Actualización automática de datos
   ════════════════════════════════════════════════════════════ */
function startUpdatePolling() {
    stopUpdatePolling();
    updatePollInterval = setInterval(() => {
        if (!currentOtId) return;
        fetch(`${API}?action=updates&ot_id=${currentOtId}&last_id=${lastComentarioId}`)
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success' && res.data) {
                    if (res.data.nuevos_comentarios > 0) loadComentarios();
                }
            })
            .catch(() => {});
    }, 30000);
}

function stopUpdatePolling() {
    if (updatePollInterval) { clearInterval(updatePollInterval); updatePollInterval = null; }
}

/* ════════════════════════════════════════════════════════════
   SHARED RENDERERS
   ════════════════════════════════════════════════════════════ */
function renderTimeline(etapas, diags, avances, ot) {
    const events = [];

    if (ot?.creado) events.push({ icon: 'fa-clipboard-check', title: 'Orden de Trabajo creada', desc: 'Ingreso del vehículo al taller', date: fmtDate(ot.creado, true), estado: 'completado' });

    diags.forEach(d => {
        events.push({ icon: 'fa-stethoscope', title: 'Diagnóstico ' + (d.folio || ''), desc: d.diagnostico_final || d.problema_principal || 'Diagnóstico realizado', date: fmtDate(d.fecha), estado: d.estado === 'completado' ? 'completado' : 'en_proceso' });
    });

    etapas.forEach(e => {
        events.push({ icon: 'fa-flag-checkered', title: e.nombre, desc: e.estado === 'completado' ? 'Completada' : (e.estado === 'en_curso' ? 'En curso' : 'Pendiente'), date: fmtDate(e.fecha_inicio || e.fecha_fin), estado: e.estado === 'completado' ? 'completado' : (e.estado === 'en_curso' ? 'en_proceso' : 'pendiente') });
    });

    (avances || []).slice(0, 3).forEach(a => {
        events.push({ icon: 'fa-chart-line', title: a.titulo || 'Avance', desc: a.descripcion || (a.porcentaje != null ? a.porcentaje + '%' : ''), date: fmtDate(a.creado), estado: 'completado', pct: a.porcentaje });
    });

    if (ot?.hora_fin_procesos) events.push({ icon: 'fa-check-circle', title: 'Trabajo finalizado', desc: 'Servicio completado', date: fmtDate(ot.hora_fin_procesos, true), estado: 'completado' });

    events.sort((a, b) => (new Date(a.date || 0)) - (new Date(b.date || 0)));

    if (!events.length) return '<div class="empty-state"><i class="fas fa-clock"></i><p>Sin eventos registrados</p></div>';

    return `<div class="timeline">${events.map(e => `
        <div class="tl-item ${e.estado || ''}">
            <div class="tl-dot"><i class="fas ${e.icon}"></i></div>
            <div class="tl-content">
                <div class="tl-title">${escapeHtml(e.title)}</div>
                ${e.desc ? `<div class="tl-desc">${escapeHtml(e.desc)}</div>` : ''}
                ${e.pct != null ? `<div class="tl-pct">${e.pct}%</div>` : ''}
                <div class="tl-date">${e.date || ''}</div>
            </div>
        </div>`).join('')}</div>`;
}

function renderEtapas(etapas) {
    if (!etapas.length) return '';
    return `<div class="etapas-flow">${etapas.map(e => {
        const st = e.estado || 'pendiente';
        const icon = st === 'completado' ? 'fa-check-circle' : st === 'en_curso' ? 'fa-play-circle' : 'fa-circle';
        return `<div class="etapa-item ${st}">
            <div class="etapa-icon"><i class="fas ${icon}"></i></div>
            <div class="etapa-info">
                <div class="etapa-name">${escapeHtml(e.nombre)}</div>
                ${e.notas ? `<div class="etapa-notes">${escapeHtml(e.notas)}</div>` : ''}
                ${e.fecha_fin ? `<div class="etapa-date">${fmtDateTime(e.fecha_fin)}</div>` : ''}
            </div>
        </div>`;
    }).join('')}</div>`;
}

function renderDiagnosticos(diags) {
    if (!diags.length) return '';
    return `<div class="p-card"><div class="p-card-head"><h3><i class="fas fa-stethoscope"></i> Diagnósticos</h3></div><div class="p-card-body">
        ${diags.map(d => `
        <div class="diag-item">
            <div class="diag-head">
                <span class="diag-folio">${escapeHtml(d.folio || '')}</span>
                <span class="ej-badge ${d.estado === 'completado' ? 'completado' : 'pendiente'}">${getEstadoLabel(d.estado || 'pendiente')}</span>
            </div>
            ${d.problema_principal ? `<p><strong>Problema:</strong> ${escapeHtml(d.problema_principal)}</p>` : ''}
            ${d.diagnostico_final ? `<p><strong>Diagnóstico:</strong> ${escapeHtml(d.diagnostico_final)}</p>` : ''}
            ${d.fecha ? `<div class="diag-date">${fmtDate(d.fecha)}</div>` : ''}
        </div>`).join('')}
    </div></div>`;
}

/* ════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════ */
function fmtDate(dateStr, time = false) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const opts = { day: '2-digit', month: 'short', year: 'numeric' };
        if (time) opts.hour = '2-digit'; opts.minute = '2-digit';
        return d.toLocaleDateString('es-CL', opts);
    } catch { return dateStr; }
}

function fmtDateTime(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
}

function getEstadoLabel(estado) {
    const map = {
        'abierta': 'Abierta', 'proceso': 'En Proceso', 'en_progreso': 'En Progreso',
        'diagnostico': 'En Diagnóstico', 'finalizado': 'Finalizada', 'entregado': 'Entregado',
        'cancelado': 'Cancelada', 'pendiente': 'Pendiente', 'completado': 'Completado',
        'borrador': 'Borrador', 'aprobado': 'Aprobado', 'rechazado': 'Rechazado',
        'en_curso': 'En Curso',
    };
    return map[estado] || estado;
}

function formatMoney(val) {
    return '$' + Number(val || 0).toLocaleString('es-CL');
}
