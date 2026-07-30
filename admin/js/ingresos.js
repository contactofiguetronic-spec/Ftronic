const API = API_ROOT + 'ingresos_api.php';
const esc = escapeHtml;

let currentPage = 1;

// ═══ INIT ═════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    el('searchInput').addEventListener('input', debounce(e => {
        currentPage = 1;
        loadData(1, e.target.value);
    }, 400));

    el('filterFechaDesde')?.addEventListener('change', () => { currentPage = 1; loadData(1); });
    el('filterFechaHasta')?.addEventListener('change', () => { currentPage = 1; loadData(1); });

    loadData();
    loadKpis();
    setupReactiveRefresh(() => { loadData(currentPage); loadKpis(); });
});

// ═══ KPIs ═════════════════════════════════════════════════════════════════════
async function loadKpis() {
    try {
        const r = await fetch(`${API}?action=resumen&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success') {
            const k = d.data;
            el('kpiMesActual').querySelector('.ot-kpi-val').textContent = formatMoney(k.mes_actual || 0);
            el('kpiMontoTotal').querySelector('.ot-kpi-val').textContent = formatMoney(k.monto_total || 0);
            el('kpiPptos').querySelector('.ot-kpi-val').textContent = formatMoney(k.monto_pptos || 0);
            el('kpiVentas').querySelector('.ot-kpi-val').textContent = formatMoney(k.monto_ventas || 0);
        }
    } catch (e) { console.error('KPI error:', e); }
}

// ═══ LIST ═════════════════════════════════════════════════════════════════════
async function loadData(page = 1, search = '') {
    currentPage = page;
    const grid = el('cardGrid');
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    el('emptyState').style.display = 'none';

    try {
        const params = new URLSearchParams({ page, per_page: 20, t: Date.now() });
        if (search) params.set('search', search);
        const fd = el('filterFechaDesde')?.value;
        const fh = el('filterFechaHasta')?.value;
        if (fd) params.set('fecha_desde', fd);
        if (fh) params.set('fecha_hasta', fh);

        const r = await fetch(`${API}?${params}`);
        const d = await r.json();
        if (d.status !== 'success') { grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Error al cargar</div>'; return; }
        const items = d.data.items || [];
        if (!items.length) { grid.innerHTML = ''; el('emptyState').style.display = 'block'; return; }

        grid.innerHTML = items.map(p => {
            return `
            <div class="card" style="cursor:pointer;border-left:3px solid var(--success);" onclick="verDetalle(${p.id})">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.5rem;">
                    <span style="font-weight:700;color:var(--primary);font-size:0.85rem;">Ingreso #${p.id}</span>
                    <span class="badge-estado badge-completado">Ppto #${p.ppto_id || p.entidad_id}</span>
                </div>
                <div style="font-weight:600;color:var(--text-primary);margin-bottom:0.3rem;">
                    ${esc(p.patente || '—')} · ${esc(p.marca || '')}
                </div>
                <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.3rem;">
                    <i class="fas fa-user"></i> ${esc(p.cliente_nombre || '')} ${esc(p.cliente_apellido || '')}
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:0.5rem;">
                    <span style="font-weight:700;color:var(--success);font-size:1rem;">${formatMoney(p.monto)}</span>
                    <span style="font-size:0.78rem;color:var(--text-secondary);">${p.fecha || '—'}</span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;">
                    ${esc(p.cuenta_nombre || '—')} · ${esc(p.forma_pago || '—')}
                </div>
            </div>`;
        }).join('');

        renderPagination('paginationContainer', d.data.total, d.data.per_page, d.data.page, (p) => loadData(p, el('searchInput').value));
    } catch (e) { grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Error de conexión</div>'; }
}

// ═══ DETALLE ═════════════════════════════════════════════════════════════════
    window.verDetalle = async function(id) {
    try {
        const r = await fetch(`${API}?action=detalle&id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return showError(d.message);
        const p = d.data;

        el('detalleContent').innerHTML = `
            <div style="background:var(--bg-main);padding:1rem;border-radius:var(--radius-md);margin-bottom:1rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <strong style="color:var(--primary);">Ingreso #${p.id}</strong>
                    <span class="badge-estado badge-completado">Presupuesto #${p.ppto_id || p.entidad_id}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Monto</span><strong style="font-size:1.1rem;color:var(--success);">${formatMoney(p.monto)}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Fecha</span><strong>${p.fecha || '—'}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Forma de Pago</span><strong>${esc(p.forma_pago || '—')}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Tipo</span><strong>${esc(p.tipo_pago || 'contado')}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Cuenta</span><strong>${esc(p.cuenta_nombre || '—')} ${esc(p.banco || '')}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Referencia</span><strong>Ppto #${p.ppto_id || p.entidad_id}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Cliente</span><strong>${esc(p.cliente_nombre || '')} ${esc(p.cliente_apellido || '')}</strong></div>
                    <div><span style="font-size:0.75rem;color:var(--text-secondary);display:block;">Vehículo</span><strong>${esc(p.patente || '—')} ${esc(p.marca || '')}</strong></div>
                </div>
                ${p.observacion ? `<div style="margin-top:0.75rem;"><strong style="font-size:0.8rem;">Observación:</strong><p style="font-size:0.85rem;color:var(--text-secondary);">${esc(p.observacion)}</p></div>` : ''}
            </div>
        `;
        el('detalleModal').classList.add('active');
    } catch (e) { showError('Error: ' + e.message); }
};
