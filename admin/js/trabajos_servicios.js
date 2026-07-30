const API = API_ROOT + 'trabajos_servicios_api.php';
let currentPage = 1;
let currentFichaId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadDynamicOptions('tipo', 'tipo_servicio');
    if (typeof setupChecklistTab === 'function') setupChecklistTab();
    setupFichaTabs();
    setupFichaActions();
    setupFormSubmit();
    setupSearch();
    const fi = document.querySelector('.upload-file-input');
    if (fi) setupMultimediaToolbar(el('multimediaToolbar'), fi);
    const urlId = new URLSearchParams(window.location.search).get('id');
    if (urlId) { openFicha(urlId); } else { loadData(); }
    setupReactiveRefresh(loadData);
    setTimeout(function() { const g = el('cardGrid'); if (g && !g.children.length) try { loadData(); } catch(e) {} }, 800);
});

function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
    fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`)
        .then(r => r.json()).then(res => {
            if (res.status !== 'success') { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; return; }
            const items = res.data.items || [];
            if (!items.length) { grid.innerHTML = '<div class="empty-state"><i class="fas fa-cogs"></i><p>Sin servicios</p></div>'; return; }
            grid.innerHTML = items.map(s => `
                <div class="record-card" data-id="${s.id}" onclick="openFicha(${s.id})" style="cursor:pointer;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#06b6d4,#0891b2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;flex-shrink:0;"><i class="fas fa-cogs"></i></div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${esc(s.nombre || '')}</div>
                            <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.tipo || '—')} · $${Number(s.valor_trabajo || 0).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            `).join('');
            renderPagination(res.data.total, res.data.page, res.data.per_page, 'paginationContainer', cambiarPagina);
        }).catch(() => { grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i></div>'; });
}

function cambiarPagina(p) { loadData(p, el('searchInput').value); }
function setupSearch() { let t; el('searchInput').addEventListener('input', function() { clearTimeout(t); t = setTimeout(() => loadData(1, this.value), 400); }); }

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
        el('tab' + cap(tab.dataset.tab)).classList.add('active');
    });
}

function setupFichaActions() {
    el('btnBackList').addEventListener('click', closeFicha);
    el('btnFichaDelete').addEventListener('click', async () => {
        if (!currentFichaId || !confirm('¿Eliminar este servicio?')) return;
        const fd = new FormData(); fd.append('action', 'delete'); fd.append('id', currentFichaId);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminado'); closeFicha(); } else showError(d.message);
    });
    el('btnNuevo').addEventListener('click', () => {
        currentFichaId = null;
        el('dataForm').reset(); el('record_id').value = '';
        if (el('checklistNombre')) el('checklistNombre').value = '';
        if (el('checklistDescripcion')) el('checklistDescripcion').value = '';
        if (typeof renderPlantillaPasos === 'function') renderPlantillaPasos([]);
        el('listView').style.display = 'none';
        el('fichaContainer').classList.add('active');
        el('fichaTitle').textContent = 'Nuevo Servicio';
        el('fichaSub').textContent = '';
        el('fichaAvatar').innerHTML = '<i class="fas fa-cogs"></i>';
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.ficha-tab[data-tab="datos"]').classList.add('active');
        el('tabDatos').classList.add('active');
    });
}

async function loadFichaData(id) {
    try {
        const r = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return;
        const s = d.data;
        el('fichaTitle').textContent = s.nombre || '—';
        el('fichaSub').textContent = `${s.tipo || '—'} · $${Number(s.valor_trabajo || 0).toLocaleString()} · ${s.tiempo_estimado ? s.tiempo_estimado + 'h' : ''}`;
        el('fichaAvatar').innerHTML = '<i class="fas fa-cogs"></i>';
        el('record_id').value = s.id;
        await loadDynamicOptions('tipo', 'tipo_servicio', s.tipo);
        ['nombre','descripcion','valor_trabajo','tiempo_estimado'].forEach(n => { const i = el(n); if (i) { i.value = s[n] || ''; i.classList.remove('field-error','field-success'); } });
        if (typeof loadChecklistPlantilla === 'function') await loadChecklistPlantilla(id);
    } catch(e) {}
}

function setupFormSubmit() {
    el('dataForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (!validateForm('dataForm', { nombre: { required: true } })) return;
        const btn = el('btnSave'); setButtonLoading(btn, true, 'Guardando...');
        const fd = prepareSanitizedFormData(el('dataForm'));
        try {
            const d = await uploadWithProgress(API, fd);
            if (d.status === 'success') {
                showSuccess(d.message || 'Guardado');
                const servicioId = d.data?.id || el('record_id')?.value;
                if (servicioId && typeof saveChecklistPlantilla === 'function') {
                    const nombre = el('checklistNombre')?.value?.trim();
                    if (nombre) await saveChecklistPlantilla(servicioId);
                }
                if (servicioId) loadFichaData(servicioId);
            } else showError(d.message || 'Error');
        } catch(e) { showError('Error de conexión'); }
        finally { setButtonLoading(btn, false); }
    });
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderPagination(total, page, perPage, cid, cb) { if (typeof renderPaginationGlobal === 'function') renderPaginationGlobal(total, page, perPage, cid, cb); }
