const API = API_ROOT + 'pagos_api.php';
const esc = escapeHtml;

let currentPageDirectos = 1;
let currentPagePlazos = 1;
let cuentasBancarias = [];

// ═══ INIT ═════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ── Directos ──
    el('searchDirectos')?.addEventListener('input', debounce(e => {
        currentPageDirectos = 1;
        loadDirectos(1, e.target.value);
    }, 400));
    el('btnNuevoPagoDirecto')?.addEventListener('click', () => abrirModalDirecto(null));
    el('pagoDirModalClose')?.addEventListener('click', () => el('pagoDirectoModal').classList.remove('active'));
    el('pagoDirCancelar')?.addEventListener('click', () => el('pagoDirectoModal').classList.remove('active'));
    el('pagoDirConfirmar')?.addEventListener('click', confirmarPagoDirecto);

    // ── Plazos ──
    el('searchPlazos')?.addEventListener('input', debounce(e => {
        currentPagePlazos = 1;
        loadPlazos(1, e.target.value);
    }, 400));
    el('btnNuevoPlazo')?.addEventListener('click', () => abrirModalPlazo(null));
    el('plazoModalClose')?.addEventListener('click', () => el('plazoModal').classList.remove('active'));
    el('plazoCancelar')?.addEventListener('click', () => el('plazoModal').classList.remove('active'));
    el('plazoConfirmar')?.addEventListener('click', confirmarPlazo);
    el('btnProcesarPlazos')?.addEventListener('click', procesarPlazos);

    // Load initial data
    loadDirectos();
    loadKpisDirectos();
    loadPlazos();
    loadKpisPlazos();

    setupReactiveRefresh(() => {
        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (activeTab === 'directos') {
            loadDirectos(currentPageDirectos, el('searchDirectos')?.value || '');
            loadKpisDirectos();
        } else {
            loadPlazos(currentPagePlazos, el('searchPlazos')?.value || '');
            loadKpisPlazos();
        }
    });
});

// ═══ TABS ═════════════════════════════════════════════════════════════════════
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('tabDirectos')?.classList.toggle('active', tab === 'directos');
    document.getElementById('tabPlazos')?.classList.toggle('active', tab === 'plazos');
}

// ═══ KPIs DIRECTOS ═══════════════════════════════════════════════════════════
async function loadKpisDirectos() {
    try {
        const r = await fetch(`${API}?action=resumen_directos&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success') {
            const k = d.data;
            el('kpiDirTotal').textContent = k.total_pagos || 0;
            el('kpiDirMonto').textContent = formatMoney(k.monto_total || 0);
            el('kpiDirHoy').textContent = formatMoney(k.pagados_hoy || 0);
            el('kpiDirPromedio').textContent = k.total_pagos > 0 ? formatMoney(Math.round((k.monto_total || 0) / k.total_pagos)) : '$0';
        }
    } catch (e) {}
}

// ═══ LIST DIRECTOS ═══════════════════════════════════════════════════════════
async function loadDirectos(page = 1, search = '') {
    currentPageDirectos = page;
    const grid = el('cardGridDirectos');
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    el('emptyStateDirectos').style.display = 'none';
    try {
        const params = new URLSearchParams({ action: 'listar_directos', page, per_page: 20, t: Date.now() });
        if (search) params.set('search', search);
        const r = await fetch(`${API}?${params}`);
        const d = await r.json();
        if (d.status !== 'success') { grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Error al cargar</div>'; return; }
        const items = d.data.items || [];
        if (!items.length) { grid.innerHTML = ''; el('emptyStateDirectos').style.display = 'block'; return; }
        grid.innerHTML = items.map(p => {
            const fechaPago = p.fecha_pago || p.fecha;
            const esHoy = fechaPago === new Date().toISOString().slice(0, 10);
            const badgeClass = esHoy ? 'completado' : 'en_proceso';
            const badgeText = esHoy ? 'Hoy' : 'Registrado';
            return `
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;">
                    <span style="font-weight:700;color:var(--primary);font-size:0.85rem;">${esc(p.concepto || 'Sin concepto')}</span>
                    <span class="badge-estado badge-${badgeClass}">${badgeText}</span>
                </div>
                ${p.descripcion ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.3rem;">${esc(p.descripcion)}</div>` : ''}
                <div style="display:flex;justify-content:space-between;margin-top:0.5rem;">
                    <span style="font-weight:700;color:var(--danger);font-size:1rem;">${formatMoney(p.monto)}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">${formatDateShort(fechaPago)}</span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;">
                    <i class="fas fa-user"></i> ${esc(p.receptor || '—')} · <i class="fas fa-university"></i> ${esc(p.cuenta_nombre || '—')} ${esc(p.banco || '')}
                </div>
                ${p.observacion ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;font-style:italic;">"${esc(p.observacion)}"</div>` : ''}
                <div style="display:flex;gap:0.35rem;margin-top:0.5rem;">
                    <button class="btn btn-xs btn-outline" onclick="editarPagoDirecto(${p.id})" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-xs btn-danger-outline" onclick="eliminarPagoDirecto(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
        renderPagination('paginationContainerDirectos', d.data.total, d.data.per_page, d.data.page, (p) => loadDirectos(p, el('searchDirectos')?.value || ''));
    } catch (e) { grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Error de conexión</div>'; }
}

// ═══ MODAL DIRECTO ═══════════════════════════════════════════════════════════
async function loadCuentasBancarias() {
    if (!cuentasBancarias.length) {
        try {
            const r = await fetch(`${API}?action=cuentas&t=${Date.now()}`);
            const d = await r.json();
            if (d.status === 'success') cuentasBancarias = d.data || [];
        } catch (e) {}
    }
    // Update both selects
    const options = '<option value="">— Seleccionar cuenta —</option>' +
        cuentasBancarias.map(c => `<option value="${c.id}">${esc(c.nombre)} — ${esc(c.banco || '')} (Saldo: ${formatMoney(c.saldo || 0)})</option>`).join('');
    const selDir = el('pagoDirCuentaBancaria');
    const selPlz = el('plazoCuentaBancaria');
    if (selDir) selDir.innerHTML = options;
    if (selPlz) selPlz.innerHTML = options;
}

function abrirModalDirecto(data) {
    el('pagoDirId').value = data ? data.id : '';
    el('pagoDirModalTitle').textContent = data ? 'Editar Pago' : 'Registrar Pago';
    el('pagoDirConcepto').value = data ? (data.concepto || '') : '';
    el('pagoDirDescripcion').value = data ? (data.descripcion || '') : '';
    el('pagoDirMonto').value = data ? data.monto : '';
    el('pagoDirFecha').value = data ? (data.fecha_pago || data.fecha) : new Date().toISOString().slice(0, 10);
    el('pagoDirFormaPago').value = data ? (data.forma_pago || 'efectivo') : 'efectivo';
    el('pagoDirReceptor').value = data ? (data.receptor || '') : '';
    el('pagoDirObservacion').value = data ? (data.observacion || '') : '';
    loadCuentasBancarias().then(() => {
        el('pagoDirCuentaBancaria').value = data ? (data.cuenta_bancaria_id || '') : '';
    });
    el('pagoDirectoModal').classList.add('active');
}

window.editarPagoDirecto = async function(id) {
    try {
        const r = await fetch(`${API}?action=listar_directos&per_page=999&t=${Date.now()}`);
        const d = await r.json();
        const item = (d.data.items || []).find(p => parseInt(p.id) === parseInt(id));
        if (item) abrirModalDirecto(item);
        else showError('No encontrado');
    } catch (e) { showError('Error'); }
};

async function confirmarPagoDirecto() {
    const concepto = el('pagoDirConcepto').value.trim();
    const monto = parseFloat(el('pagoDirMonto').value) || 0;
    const fecha = el('pagoDirFecha').value;
    const formaPago = el('pagoDirFormaPago').value;
    const cuentaId = parseInt(el('pagoDirCuentaBancaria').value) || 0;
    if (!concepto) return showError('Ingrese un concepto');
    if (monto <= 0) return showError('Ingrese un monto válido');
    if (!fecha) return showError('Seleccione una fecha');
    if (!cuentaId) return showError('Seleccione una cuenta bancaria');

    const isEdit = !!el('pagoDirId').value;

    setButtonLoading(el('pagoDirConfirmar'), true, 'Guardando...');
    try {
        const fd = new FormData();
        fd.append('action', isEdit ? 'editar_pago_directo' : 'registrar_pago_directo');
        if (isEdit) fd.append('id', el('pagoDirId').value);
        fd.append('concepto', concepto);
        fd.append('descripcion', el('pagoDirDescripcion').value.trim());
        fd.append('monto', monto);
        fd.append('fecha_pago', fecha);
        fd.append('forma_pago', formaPago);
        fd.append('cuenta_bancaria_id', cuentaId);
        fd.append('receptor', el('pagoDirReceptor').value.trim());
        fd.append('observacion', el('pagoDirObservacion').value.trim());
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') {
            showSuccess(d.message);
            el('pagoDirectoModal').classList.remove('active');
            loadDirectos(currentPageDirectos, el('searchDirectos')?.value || '');
            loadKpisDirectos();
        } else showError(d.message);
    } catch (e) { showError('Error de conexión'); }
    finally { setButtonLoading(el('pagoDirConfirmar'), false); }
}

window.eliminarPagoDirecto = async function(id) {
    if (!confirm('¿Eliminar este pago permanentemente? Se revertirá el saldo de la cuenta bancaria.')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'eliminar_pago_directo');
        fd.append('id', id);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminado'); loadDirectos(currentPageDirectos); loadKpisDirectos(); }
        else showError(d.message);
    } catch (e) { showError('Error'); }
};

// ═══ KPIs PLAZOS ═════════════════════════════════════════════════════════════
async function loadKpisPlazos() {
    try {
        const r = await fetch(`${API}?action=resumen_plazos&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success') {
            const k = d.data;
            el('kpiPlazosTotal').textContent = k.total_plazos || 0;
            el('kpiPlazosPendiente').textContent = formatMoney(k.total_pendiente || 0);
            el('kpiPlazosPagado').textContent = formatMoney(k.pagado_mes || 0);
            el('kpiPlazosVencido').textContent = formatMoney(k.vencido || 0);
        }
    } catch (e) {}
}

// ═══ LIST PLAZOS ═════════════════════════════════════════════════════════════
async function loadPlazos(page = 1, search = '') {
    currentPagePlazos = page;
    const grid = el('cardGridPlazos');
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    el('emptyStatePlazos').style.display = 'none';
    try {
        const params = new URLSearchParams({ action: 'listar_plazos', page, per_page: 20, t: Date.now() });
        if (search) params.set('search', search);
        const r = await fetch(`${API}?${params}`);
        const d = await r.json();
        if (d.status !== 'success') { grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Error al cargar</div>'; return; }
        const items = d.data.items || [];
        if (!items.length) { grid.innerHTML = ''; el('emptyStatePlazos').style.display = 'block'; return; }
        grid.innerHTML = items.map(p => {
            const isPaid = p.estado === 'pagado';
            const isCancelled = p.estado === 'cancelado';
            const isOverdue = !isPaid && !isCancelled && p.fecha_pago <= new Date().toISOString().slice(0, 10);
            const badgeClass = isPaid ? 'completado' : isCancelled ? 'rechazado' : isOverdue ? 'pendiente' : 'en_proceso';
            const badgeText = isPaid ? 'Pagado' : isCancelled ? 'Cancelado' : isOverdue ? 'Vencido' : 'Pendiente';
            return `
            <div class="card" style="cursor:default;${isPaid ? 'opacity:0.65;' : ''}${isOverdue ? 'border-left:3px solid var(--danger);' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;">
                    <span style="font-weight:700;color:var(--primary);font-size:0.85rem;">${esc(p.concepto)}</span>
                    <span class="badge-estado badge-${badgeClass}">${badgeText}</span>
                </div>
                ${p.descripcion ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.3rem;">${esc(p.descripcion)}</div>` : ''}
                <div style="display:flex;justify-content:space-between;margin-top:0.5rem;">
                    <span style="font-weight:700;color:${isPaid ? 'var(--text-secondary)' : 'var(--danger)'};font-size:1rem;">${formatMoney(p.monto)}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">${formatDateShort(p.fecha_pago)}</span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;">
                    <i class="fas fa-user"></i> ${esc(p.receptor || '—')} · <i class="fas fa-university"></i> ${esc(p.cuenta_nombre || '—')} ${esc(p.banco || '')}
                </div>
                ${isPaid && p.fecha_ejecucion ? `<div style="font-size:0.7rem;color:var(--success);margin-top:0.2rem;"><i class="fas fa-check-circle"></i> Pagado el ${formatDateShort(p.fecha_ejecucion)}</div>` : ''}
                <div style="display:flex;gap:0.35rem;margin-top:0.5rem;">
                    ${!isPaid && !isCancelled ? `<button class="btn btn-xs btn-outline" onclick="editarPlazo(${p.id})" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-xs btn-danger-outline" onclick="cancelarPlazo(${p.id})" title="Cancelar"><i class="fas fa-times"></i></button>` : ''}
                    <button class="btn btn-xs btn-danger-outline" onclick="eliminarPlazo(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
        renderPagination('paginationContainerPlazos', d.data.total, d.data.per_page, d.data.page, (p) => loadPlazos(p, el('searchPlazos')?.value || ''));
    } catch (e) { grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Error de conexión</div>'; }
}

// ═══ MODAL PLAZOS ════════════════════════════════════════════════════════════
function abrirModalPlazo(data) {
    el('plazoId').value = data ? data.id : '';
    el('plazoModalTitle').textContent = data ? 'Editar Pago a Plazos' : 'Nuevo Pago a Plazos';
    el('plazoConcepto').value = data ? data.concepto : '';
    el('plazoDescripcion').value = data ? (data.descripcion || '') : '';
    el('plazoMonto').value = data ? data.monto : '';
    el('plazoFechaPago').value = data ? data.fecha_pago : '';
    el('plazoReceptor').value = data ? (data.receptor || '') : '';
    el('plazoObservacion').value = data ? (data.observacion || '') : '';
    loadCuentasBancarias().then(() => {
        el('plazoCuentaBancaria').value = data ? (data.cuenta_bancaria_id || '') : '';
    });
    el('plazoModal').classList.add('active');
}

window.editarPlazo = async function(id) {
    try {
        const r = await fetch(`${API}?action=listar_plazos&per_page=999&t=${Date.now()}`);
        const d = await r.json();
        const item = (d.data.items || []).find(p => parseInt(p.id) === parseInt(id));
        if (item) abrirModalPlazo(item);
        else showError('No encontrado');
    } catch (e) { showError('Error'); }
};

async function confirmarPlazo() {
    const concepto = el('plazoConcepto').value;
    const monto = parseFloat(el('plazoMonto').value) || 0;
    const fechaPago = el('plazoFechaPago').value;
    const cuentaId = parseInt(el('plazoCuentaBancaria').value) || 0;
    if (!concepto) return showError('Seleccione un concepto');
    if (monto <= 0) return showError('Ingrese un monto válido');
    if (!fechaPago) return showError('Seleccione una fecha de pago');
    if (!cuentaId) return showError('Seleccione una cuenta bancaria');

    setButtonLoading(el('plazoConfirmar'), true, 'Guardando...');
    try {
        const fd = new FormData();
        fd.append('action', 'registrar_plazo');
        fd.append('concepto', concepto);
        fd.append('descripcion', el('plazoDescripcion').value.trim());
        fd.append('monto', monto);
        fd.append('fecha_pago', fechaPago);
        fd.append('cuenta_bancaria_id', cuentaId);
        fd.append('receptor', el('plazoReceptor').value.trim());
        fd.append('observacion', el('plazoObservacion').value.trim());
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') {
            showSuccess(d.message);
            el('plazoModal').classList.remove('active');
            loadPlazos(currentPagePlazos, el('searchPlazos')?.value || '');
            loadKpisPlazos();
        } else showError(d.message);
    } catch (e) { showError('Error de conexión'); }
    finally { setButtonLoading(el('plazoConfirmar'), false); }
}

window.cancelarPlazo = async function(id) {
    if (!confirm('¿Cancelar este pago a plazos?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'cancelar_plazo');
        fd.append('id', id);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Cancelado'); loadPlazos(currentPagePlazos); loadKpisPlazos(); }
        else showError(d.message);
    } catch (e) { showError('Error'); }
};

window.eliminarPlazo = async function(id) {
    if (!confirm('¿Eliminar este pago a plazos permanentemente?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'eliminar_plazo');
        fd.append('id', id);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminado'); loadPlazos(currentPagePlazos); loadKpisPlazos(); }
        else showError(d.message);
    } catch (e) { showError('Error'); }
};

async function procesarPlazos() {
    if (!confirm('¿Procesar todos los pagos a plazos vencidos? Se descontarán los montos de las cuentas bancarias asociadas.')) return;
    setButtonLoading(el('btnProcesarPlazos'), true, 'Procesando...');
    try {
        const fd = new FormData();
        fd.append('action', 'procesar_plazos');
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') {
            showSuccess(d.message);
            loadPlazos(currentPagePlazos);
            loadKpisPlazos();
        } else showError(d.message);
    } catch (e) { showError('Error de conexión'); }
    finally { setButtonLoading(el('btnProcesarPlazos'), false); }
}

// ═══ UTILITIES ═══════════════════════════════════════════════════════════════
function formatDateShort(dateStr) {
    if (!dateStr) return '';
    try { const d = new Date(dateStr + 'T00:00:00'); return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return dateStr; }
}