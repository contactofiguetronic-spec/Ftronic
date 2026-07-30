const API = API_ROOT + 'reportes_api.php';
let charts = {};
let currentCategory = 'resumen';
let currentDesde = '';
let currentHasta = '';
let tableSortKey = null;
let tableSortDir = 'asc';
const _reportData = {};

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return dt.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showLoading() {
  const s = el('loadingSpinner');
  if (s) { s.classList.add('show'); s.style.display = 'flex'; }
}

function hideLoading() {
  const s = el('loadingSpinner');
  if (s) { s.classList.remove('show'); s.style.display = 'none'; }
}

function destroyCharts() {
  Object.values(charts).forEach(c => { if (c) { c.destroy(); } });
  charts = {};
}

function dateRangeParams() {
  return `&desde=${currentDesde}&hasta=${currentHasta}`;
}

async function reportFetch(action, extra = '') {
  try {
    const resp = await fetch(`${API}?action=${action}${dateRangeParams()}${extra}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const d = await resp.json();
    if (d.error) throw new Error(d.error);
    return d;
  } catch (e) {
    console.error(`API error (${action}):`, e);
    return null;
  }
}

function unwrap(resp) {
  if (!resp) return [];
  const d = resp.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  return [];
}

function trendHTML(val) {
  if (val == null || val === 0) return '';
  const up = val > 0;
  return `<span class="kpi-trend ${up ? 'up' : 'down'}"><i class="fas fa-${up ? 'arrow-up' : 'arrow-down'}"></i> ${Math.abs(val)}%</span>`;
}

function renderKPIs(containerId, kpis) {
  const grid = el(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  kpis.forEach((k, i) => {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.innerHTML = `
      <div class="kpi-icon" style="background:${k.color || '#4B7BEC'}20;color:${k.color || '#4B7BEC'}">
        <i class="${k.icon || 'fas fa-chart-line'}"></i>
      </div>
      <div class="kpi-value">${k.value != null ? k.value : '--'}</div>
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      ${k.trend || k.sub ? `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.7rem;">${k.trend || ''}${k.sub ? `<span style="color:var(--text-secondary)">${escapeHtml(k.sub)}</span>` : ''}</div>` : ''}
    `;
    grid.appendChild(card);
    requestAnimationFrame(() => {
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  });
}

function renderTable(containerId, columns, data, page = 1, perPage = 15) {
  const container = el(containerId);
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Sin datos para mostrar</p></div>';
    return;
  }

  // Sort
  if (tableSortKey) {
    const dir = tableSortDir === 'asc' ? 1 : -1;
    data = [...data].sort((a, b) => {
      const va = a[tableSortKey], vb = b[tableSortKey];
      if (va == null) return 1; if (vb == null) return -1;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
    });
  }

  const totalPages = Math.ceil(data.length / perPage);
  const start = (page - 1) * perPage;
  const pageData = data.slice(start, start + perPage);

  let html = '<div class="table-wrap"><table class="data-table"><thead><tr>';
  columns.forEach(c => {
    const active = tableSortKey === c.key;
    html += `<th data-key="${escapeHtml(c.key)}" class="${active ? 'sort-active' : ''}" style="cursor:pointer;user-select:none;">
      ${escapeHtml(c.label)} ${active ? `<i class="fas fa-sort-${tableSortDir === 'asc' ? 'up' : 'down'}"></i>` : '<i class="fas fa-sort" style="opacity:0.25"></i>'}
    </th>`;
  });
  html += '</tr></thead><tbody>';
  pageData.forEach(row => {
    html += '<tr>';
    columns.forEach(c => {
      let val = row[c.key];
      if (c.format === 'money') val = formatMoney(val);
      else if (c.format === 'date') val = formatDate(val);
      else if (c.format === 'badge') val = `<span class="badge badge-${escapeHtml((val || '').toLowerCase().replace(/\s+/g,'-'))}">${escapeHtml(val)}</span>`;
      else if (c.format === 'percent') val = val != null ? val + '%' : '--';
      else if (c.format === 'trend') val = trendHTML(val);
      else if (c.html) val = c.html(row);
      else val = escapeHtml(val);
      html += `<td>${val != null ? val : '--'}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  if (totalPages > 1) {
    html += `<div class="table-footer">
      <span style="color:var(--text-secondary);font-size:0.72rem;">${data.length} registros, página ${page} de ${totalPages}</span>
      <div class="table-pagination">
        <button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Anterior</button>
        <button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Siguiente <i class="fas fa-chevron-right"></i></button>
      </div>
    </div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) renderTable(containerId, columns, data, p, perPage);
    });
  });

  container.querySelectorAll('th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (tableSortKey === key) tableSortDir = tableSortDir === 'asc' ? 'desc' : 'asc';
      else { tableSortKey = key; tableSortDir = 'asc'; }
      renderTable(containerId, columns, data, 1, perPage);
    });
  });
}

function createChart(canvasId, config) {
  let canvas = el(canvasId);
  if (!canvas) {
    const area = el('chartsArea');
    if (!area) return null;
    const card = document.createElement('div');
    card.className = 'chart-card';
    const title = config.title || (config.data?.labels?.[0] ? config.data.labels[0] : 'Gráfico');
    card.innerHTML = `<div class="chart-header"><div class="chart-title"><i class="fas fa-chart-${config.type === 'doughnut' ? 'pie' : 'bar'}"></i> ${escapeHtml(title)}</div></div><div style="position:relative;height:260px;width:100%;"><canvas id="${canvasId}"></canvas></div>`;
    area.appendChild(card);
    canvas = el(canvasId);
  }
  if (!canvas) return null;
  if (charts[canvasId]) { charts[canvasId].destroy(); }
  const ctx = canvas.getContext('2d');
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#374151', font: { size: 10 } } }
    },
    scales: config.type !== 'doughnut' && config.type !== 'pie' ? {
      x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(0,0,0,0.04)' } }
    } : {},
    ...(config.options || {})
  };
  charts[canvasId] = new Chart(ctx, { ...config, options: opts });
  return charts[canvasId];
}

const CC = ['#4B7BEC','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1'];

// ============================================================================
// CATEGORY LOADERS
// ============================================================================

async function loadResumen() {
  showLoading();
  const [resumen, evolucion, distVentas] = await Promise.all([
    reportFetch('resumen_general'),
    reportFetch('evolucion_ventas_compras&meses=12'),
    reportFetch('distribucion_ventas')
  ]);
  hideLoading();

  _reportData.resumen = { resumen, evolucion, distVentas };

  if (resumen) {
    const r = resumen.data;
    renderKPIs('kpiGrid', [
      { icon: 'fas fa-dollar-sign', color: '#10b981', value: formatMoney(r.ventas_total), label: 'Ingresos', sub: `${r.ventas_cantidad} cobros`, trend: trendHTML(r.ventas_trend) },
      { icon: 'fas fa-shopping-cart', color: '#3b82f6', value: formatMoney(r.compras_total), label: 'Compras', sub: `${r.compras_cantidad} transacciones`, trend: trendHTML(r.compras_trend) },
      { icon: 'fas fa-bolt', color: '#f59e0b', value: formatMoney(r.rapidas_total || 0), label: 'Compras Rápidas', sub: `${r.rapidas_cantidad || 0} registros` },
      { icon: 'fas fa-chart-line', color: '#f59e0b', value: formatMoney(r.utilidad_bruta), label: 'Utilidad Bruta', sub: r.ventas_total ? ((r.utilidad_bruta / r.ventas_total) * 100).toFixed(1) + '% margen' : '' },
      { icon: 'fas fa-wrench', color: '#8b5cf6', value: r.ots_total, label: 'Órdenes Trabajo', sub: `${r.ots_activas} activas · ${r.ots_completadas} completadas` },
      { icon: 'fas fa-file-invoice', color: '#06b6d4', value: r.presupuestos_cantidad, label: 'Presupuestos', sub: formatMoney(r.presupuestos_total) },
      { icon: 'fas fa-car', color: '#f97316', value: r.recepciones, label: 'Recepciones', sub: 'Ingresos al taller' },
      { icon: 'fas fa-tasks', color: '#ec4899', value: r.tareas_total, label: 'Tareas', sub: `${r.tareas_pendientes} pend. · ${r.tareas_en_progreso} prog. · ${r.tareas_completadas} comp.` },
      { icon: 'fas fa-users', color: '#14b8a6', value: r.clientes_total, label: 'Clientes', sub: `${r.clientes_nuevos} nuevos en el período` },
      { icon: 'fas fa-truck', color: '#6366f1', value: r.vehiculos_total, label: 'Vehículos', sub: 'Registrados' },
      { icon: 'fas fa-arrow-circle-right', color: '#ef4444', value: formatMoney(r.por_cobrar_total), label: 'Por Cobrar', sub: `${r.por_cobrar_cantidad} documentos` },
      { icon: 'fas fa-arrow-circle-left', color: '#f97316', value: formatMoney(r.por_pagar_total), label: 'Por Pagar', sub: `${r.por_pagar_cantidad} documentos` }
    ]);
  }

  if (evolucion && evolucion.data) {
    const ev = evolucion.data;
    const vArr = Array.isArray(ev.ventas) ? ev.ventas : [];
    const cArr = Array.isArray(ev.compras) ? ev.compras : [];
    const periodos = [...new Set([...vArr.map(d => d.periodo), ...cArr.map(d => d.periodo)])].sort();
    const vMap = {}; vArr.forEach(d => { vMap[d.periodo] = parseFloat(d.total) || 0; });
    const cMap = {}; cArr.forEach(d => { cMap[d.periodo] = parseFloat(d.total) || 0; });
    if (periodos.length) {
      createChart('chartVentasCompras', {
        type: 'line', title: 'Evolución Ventas vs Compras',
        data: {
          labels: periodos,
          datasets: [
            { label: 'Ventas', data: periodos.map(p => vMap[p] || 0), borderColor: '#10b981', backgroundColor: '#10b98120', fill: true, tension: 0.3, pointRadius: 3 },
            { label: 'Compras', data: periodos.map(p => cMap[p] || 0), borderColor: '#ef4444', backgroundColor: '#ef444420', fill: true, tension: 0.3, pointRadius: 3 }
          ]
        }
      });
    }
  }

  const distArr = unwrap(distVentas);
  if (distArr.length) {
    const labels = distArr.map(d => d.categoria);
    const values = distArr.map(d => parseFloat(d.total) || 0);
    createChart('chartDistVentas', {
      type: 'doughnut', title: 'Distribución de Ventas',
      data: { labels, datasets: [{ data: values, backgroundColor: CC.slice(0, labels.length) }] }
    });
  }
}

async function loadFinanzas() {
  showLoading();
  const [ventas, compras, rapidas, cuentas, flujo, vtasClientes, cobrar, pagar] = await Promise.all([
    reportFetch('ventas_por_rango'), reportFetch('compras_por_rango'), reportFetch('compras_rapidas_por_rango'),
    reportFetch('cuentas_detalle'), reportFetch('flujo_caja_rango'), reportFetch('ventas_por_cliente'),
    reportFetch('por_cobrar_detalle'), reportFetch('por_pagar_detalle')
  ]);
  hideLoading();

  _reportData.finanzas = { ventas, compras, rapidas, cuentas, flujo, vtasClientes, cobrar, pagar };

  const vArr = unwrap(ventas), cArr = unwrap(compras), rArr = unwrap(rapidas);
  const cobArr = unwrap(cobrar), pagArr = unwrap(pagar);
  const totalV = vArr.reduce((s, r) => s + (r.total || r.monto || 0), 0);
  const totalC = cArr.reduce((s, r) => s + (r.total || r.monto || 0), 0);
  const totalR = rArr.reduce((s, r) => s + (r.total || r.monto || 0), 0);
  const totalCob = cobArr.reduce((s, r) => s + (r.saldo_pendiente || r.monto || r.total || 0), 0);
  const totalPag = pagArr.reduce((s, r) => s + (r.monto || r.total || 0), 0);

  renderKPIs('kpiGrid', [
    { icon: 'fas fa-dollar-sign', color: '#10b981', value: formatMoney(totalV), label: 'Ingresos', sub: `${vArr.length} registros` },
    { icon: 'fas fa-shopping-cart', color: '#3b82f6', value: formatMoney(totalC), label: 'Compras', sub: `${cArr.length} registros` },
    { icon: 'fas fa-bolt', color: '#f59e0b', value: formatMoney(totalR), label: 'Compras Rápidas', sub: `${rArr.length} registros` },
    { icon: 'fas fa-chart-line', color: '#8b5cf6', value: formatMoney(totalV - totalC - totalR), label: 'Utilidad Neta' },
    { icon: 'fas fa-arrow-circle-right', color: '#ef4444', value: formatMoney(totalCob), label: 'Por Cobrar', sub: `${cobArr.length} docs.` },
    { icon: 'fas fa-arrow-circle-left', color: '#06b6d4', value: formatMoney(totalPag), label: 'Por Pagar', sub: `${pagArr.length} docs.` }
  ]);

  const flujoArr = unwrap(flujo);
  if (flujoArr.length) {
    createChart('chartFlujoCaja', {
      type: 'bar', title: 'Flujo de Caja',
      data: {
        labels: flujoArr.map(d => formatDate(d.fecha)),
        datasets: [
          { label: 'Ingresos', data: flujoArr.map(d => d.ingresos || 0), backgroundColor: '#10b981' },
          { label: 'Egresos', data: flujoArr.map(d => d.egresos || 0), backgroundColor: '#ef4444' }
        ]
      }
    });
  }

  const vcArr = unwrap(vtasClientes);
  if (vcArr.length) {
    createChart('chartVentasCliente', {
      type: 'bar', title: 'Ventas por Cliente (Top 10)',
      data: {
        labels: vcArr.slice(0, 10).map(d => d.cliente_nombre),
        datasets: [{ label: 'Ventas', data: vcArr.slice(0, 10).map(d => parseFloat(d.total_ventas) || 0), backgroundColor: CC }]
      }
    });
  }

  const cuentasArr = unwrap(cuentas);
  if (cuentasArr.length) {
    createChart('chartCuentas', {
      type: 'bar', title: 'Balance por Cuenta',
      data: {
        labels: cuentasArr.map(d => d.nombre),
        datasets: [
          { label: 'Ingresos', data: cuentasArr.map(d => d.ingresos_rango || 0), backgroundColor: '#10b981' },
          { label: 'Egresos', data: cuentasArr.map(d => d.egresos_rango || 0), backgroundColor: '#ef4444' }
        ]
      }
    });
  }

  const combined = [
    ...vArr.map(r => ({ tipo: 'Venta', fecha: r.fecha, desc: r.cliente_nombre || r.nombre || '', monto: r.total || r.monto || 0 })),
    ...cArr.map(r => ({ tipo: 'Compra', fecha: r.fecha, desc: r.proveedor_nombre || r.nombre || '', monto: r.total || r.monto || 0 })),
    ...rArr.map(r => ({ tipo: 'Rápida', fecha: r.fecha, desc: r.empleado_nombre || r.detalle || '', monto: r.valor || r.total || 0 }))
  ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  renderTable('tableContainer', [
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'fecha', label: 'Fecha', format: 'date' },
    { key: 'desc', label: 'Descripción' },
    { key: 'monto', label: 'Monto', format: 'money' }
  ], combined);
}

async function loadOperaciones() {
  showLoading();
  const [otsEstado, otsDetalle, productividad, presConv, trabajosTop] = await Promise.all([
    reportFetch('ots_por_estado'), reportFetch('ots_detalle'),
    reportFetch('productividad_tecnicos'), reportFetch('presupuestos_conversion'),
    reportFetch('trabajos_top')
  ]);
  hideLoading();

  _reportData.operaciones = { otsEstado, otsDetalle, productividad, presConv, trabajosTop };

  const allOts = unwrap(otsDetalle);
  const activas = allOts.filter(o => ['abierta','proceso','diagnostico'].includes((o.estado||'').toLowerCase())).length;
  const completadas = allOts.filter(o => ['finalizado','entregado','facturado'].includes((o.estado||'').toLowerCase())).length;

  const presData = presConv?.data || {};
  const convPct = presData.total > 0 ? ((presData.convertidos||0) / presData.total * 100).toFixed(1) + '%' : '0%';

  renderKPIs('kpiGrid', [
    { icon: 'fas fa-wrench', color: '#f59e0b', value: activas, label: 'OTs Activas' },
    { icon: 'fas fa-check-circle', color: '#10b981', value: completadas, label: 'Completadas', sub: `${allOts.length} total` },
    { icon: 'fas fa-file-invoice', color: '#3b82f6', value: presData.total || 0, label: 'Presupuestos', sub: formatMoney(presData.monto_total) },
    { icon: 'fas fa-percentage', color: '#8b5cf6', value: convPct, label: 'Conversión', sub: `${presData.convertidos||0} convertidos` }
  ]);

  const otsEstArr = unwrap(otsEstado);
  if (otsEstArr.length) {
    createChart('chartOtsEstado', {
      type: 'bar', title: 'OTs por Estado',
      data: { labels: otsEstArr.map(d => d.estado), datasets: [{ label: 'Cantidad', data: otsEstArr.map(d => d.cantidad||0), backgroundColor: CC }] }
    });
  }

  const prodArr = unwrap(productividad);
  if (prodArr.length) {
    const top = prodArr.slice(0, 8);
    createChart('chartProductividad', {
      type: 'bar', title: 'Productividad Técnicos',
      data: { labels: top.map(d => d.nombre), datasets: [{ label: 'OTs Completadas', data: top.map(d => d.ordenes_completadas||0), backgroundColor: '#4f46e5' }] },
      options: { indexAxis: 'y' }
    });
  }

  const ttArr = unwrap(trabajosTop);
  if (ttArr.length) {
    createChart('chartTrabajosTop', {
      type: 'bar', title: 'Trabajos Más Solicitados (Top 8)',
      data: { labels: ttArr.slice(0, 8).map(d => d.nombre), datasets: [{ label: 'Frecuencia', data: ttArr.slice(0, 8).map(d => d.frecuencia||0), backgroundColor: CC }] }
    });
  }

  renderTable('tableContainer', [
    { key: 'id', label: '# OT' },
    { key: 'creado', label: 'Creado', format: 'date' },
    { key: 'cliente_nombre', label: 'Cliente' },
    { key: 'tecnico_nombre', label: 'Técnico' },
    { key: 'estado', label: 'Estado', format: 'badge' }
  ], allOts);
}

async function loadInventario() {
  showLoading();
  const [stock, movimientos, artTop] = await Promise.all([
    reportFetch('stock_estado'), reportFetch('movimientos_stock_rango'), reportFetch('articulos_top')
  ]);
  hideLoading();

  _reportData.inventario = { stock, movimientos, artTop };

  const allStock = unwrap(stock);
  const arts = allStock.filter(s => s.tipo === 'articulo').length;
  const ins = allStock.filter(s => s.tipo === 'insumo').length;
  const alertas = allStock.filter(s => s.stock_actual <= s.stock_minimo).length;
  const bajo = allStock.filter(s => s.stock_actual < s.stock_minimo).length;

  // Movimiento count
  const movArr = unwrap(movimientos);

  renderKPIs('kpiGrid', [
    { icon: 'fas fa-boxes', color: '#3b82f6', value: arts, label: 'Artículos' },
    { icon: 'fas fa-box-open', color: '#06b6d4', value: ins, label: 'Insumos' },
    { icon: 'fas fa-exchange-alt', color: '#8b5cf6', value: movArr.length, label: 'Movimientos', sub: 'En el período' },
    { icon: 'fas fa-exclamation-triangle', color: '#f59e0b', value: alertas, label: 'En Mínimo' },
    { icon: 'fas fa-exclamation-circle', color: '#ef4444', value: bajo, label: 'Bajo Mínimo' }
  ]);

  const artTopArr = unwrap(artTop);
  if (artTopArr.length) {
    createChart('chartArticulosTop', {
      type: 'bar', title: 'Artículos Más Vendidos (Top 10)',
      data: { labels: artTopArr.slice(0, 10).map(d => d.nombre), datasets: [{ label: 'Unidades', data: artTopArr.slice(0, 10).map(d => d.vendidos||0), backgroundColor: CC }] }
    });
  }

  if (allStock.length) {
    const bins = { 'OK': 0, 'En mínimo': 0, 'Bajo mínimo': 0 };
    allStock.forEach(s => {
      if (s.stock_actual <= 0) bins['Bajo mínimo']++;
      else if (s.stock_actual <= s.stock_minimo) bins['En mínimo']++;
      else bins['OK']++;
    });
    createChart('chartStockEstado', {
      type: 'doughnut', title: 'Estado del Stock',
      data: { labels: Object.keys(bins), datasets: [{ data: Object.values(bins), backgroundColor: ['#10b981','#f59e0b','#ef4444'] }] }
    });
  }

  renderTable('tableContainer', [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'tipo', label: 'Tipo', format: 'badge' },
    { key: 'stock_actual', label: 'Stock', html: r => {
      const a = r.stock_actual <= r.stock_minimo;
      return a ? `<strong style="color:#ef4444">${r.stock_actual}</strong>` : (r.stock_actual ?? '--');
    }},
    { key: 'stock_minimo', label: 'Mínimo' },
    { key: 'precio', label: 'Precio', format: 'money' }
  ], allStock);
}

async function loadInventarioTaller() {
  showLoading();
  try {
    const res = await fetch(API_ROOT + 'reportes_api.php?action=inventario_taller_todos&t=' + Date.now());
    const json = await res.json();
    hideLoading();
    const items = (json.status === 'success' && json.data) ? json.data : [];
    _reportData.inventario_taller = items;

    const total = items.length;
    const inversionTotal = items.reduce((s, i) => s + parseFloat(i.precio_avaluado || 0), 0);
    const conFotos = items.filter(i => parseInt(i.media_count || 0) > 0).length;

    // Agrupar por zona
    const porZona = {};
    items.forEach(i => {
      const z = i.zona_nombre || 'Sin zona';
      porZona[z] = (porZona[z] || 0) + 1;
    });

    // Agrupar por categoría
    const porCategoria = {};
    items.forEach(i => {
      const c = i.categoria || 'Sin categoría';
      porCategoria[c] = (porCategoria[c] || 0) + 1;
    });

    renderKPIs('kpiGrid', [
      { icon: 'fas fa-toolbox', color: '#3b82f6', value: total, label: 'Total Artículos' },
      { icon: 'fas fa-dollar-sign', color: '#10b981', value: formatMoney(inversionTotal), label: 'Inversión Total' },
      { icon: 'fas fa-camera', color: '#8b5cf6', value: conFotos, label: 'Con Fotos' },
      { icon: 'fas fa-map-marker-alt', color: '#f59e0b', value: Object.keys(porZona).length, label: 'Zonas' }
    ]);

    if (Object.keys(porZona).length) {
      createChart('chartInventarioZonas', {
        type: 'doughnut', title: 'Artículos por Zona',
        data: { labels: Object.keys(porZona), datasets: [{ data: Object.values(porZona), backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'] }] }
      });
    }

    if (Object.keys(porCategoria).length) {
      createChart('chartInventarioCategorias', {
        type: 'bar', title: 'Artículos por Categoría',
        data: { labels: Object.keys(porCategoria), datasets: [{ label: 'Cantidad', data: Object.values(porCategoria), backgroundColor: '#3b82f6' }] }
      });
    }

    renderTable('tableContainer', [
      { key: 'identificacion', label: 'Identificación' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'zona_nombre', label: 'Zona' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'precio_avaluado', label: 'Avalúo', format: 'money' }
    ], items);
  } catch(e) {
    hideLoading();
    renderKPIs('kpiGrid', []);
    if (el('tableContainer')) el('tableContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i> Error al cargar inventario</div>';
  }
}

async function loadTareas() {
  showLoading();
  const [estado, empleado, detalle] = await Promise.all([
    reportFetch('tareas_por_estado'), reportFetch('tareas_por_empleado'), reportFetch('tareas_detalle')
  ]);
  hideLoading();

  _reportData.tareas = { estado, empleado, detalle };

  const allTareas = unwrap(detalle);
  const pend = allTareas.filter(t => (t.estado||'').toLowerCase() === 'pendiente').length;
  const prog = allTareas.filter(t => ['en progreso','en_progreso','progreso'].includes((t.estado||'').toLowerCase())).length;
  const comp = allTareas.filter(t => ['completada','finalizada','cerrada'].includes((t.estado||'').toLowerCase())).length;
  const deten = allTareas.filter(t => (t.estado||'').toLowerCase() === 'detenida').length;

  renderKPIs('kpiGrid', [
    { icon: 'fas fa-tasks', color: '#3b82f6', value: allTareas.length, label: 'Total Tareas' },
    { icon: 'fas fa-hourglass-half', color: '#f59e0b', value: pend, label: 'Pendientes' },
    { icon: 'fas fa-spinner', color: '#8b5cf6', value: prog, label: 'En Progreso' },
    { icon: 'fas fa-check-circle', color: '#10b981', value: comp, label: 'Completadas', sub: allTareas.length ? Math.round(comp/allTareas.length*100) + '%' : '' },
    { icon: 'fas fa-pause-circle', color: '#ef4444', value: deten, label: 'Detenidas' }
  ]);

  const estArr = unwrap(estado);
  if (estArr.length) {
    createChart('chartTareasEstado', {
      type: 'doughnut', title: 'Tareas por Estado',
      data: { labels: estArr.map(d => d.estado), datasets: [{ data: estArr.map(d => d.cantidad||0), backgroundColor: CC }] }
    });
  }

  const empArr = unwrap(empleado);
  if (empArr.length) {
    createChart('chartTareasEmpleado', {
      type: 'bar', title: 'Tareas por Empleado',
      data: { labels: empArr.map(d => d.nombre), datasets: [{ label: 'Asignadas', data: empArr.map(d => d.total_tareas||0), backgroundColor: '#4f46e5' }] }
    });
  }

  renderTable('tableContainer', [
    { key: 'id', label: '#' },
    { key: 'nombre', label: 'Título' },
    { key: 'empleado_nombre', label: 'Empleado' },
    { key: 'estado', label: 'Estado', format: 'badge' },
    { key: 'prioridad', label: 'Prioridad', format: 'badge' },
    { key: 'fecha', label: 'Fecha', format: 'date' }
  ], allTareas);
}

async function loadClientes() {
  showLoading();
  const [resumen, lista] = await Promise.all([
    reportFetch('clientes_resumen'),
    reportFetch('clientes_lista&tipo=completo')
  ]);
  hideLoading();

  _reportData.clientes = { resumen, lista };

  if (resumen) {
    const r = resumen.data;
    renderKPIs('kpiGrid', [
      { icon: 'fas fa-users', color: '#14b8a6', value: r.total, label: 'Total Clientes' },
      { icon: 'fas fa-user-plus', color: '#10b981', value: r.con_vehiculos, label: 'Con Vehículos', sub: r.total ? `${((r.con_vehiculos/r.total)*100).toFixed(0)}% del total` : '' },
      { icon: 'fas fa-shopping-bag', color: '#3b82f6', value: r.con_compras_rango, label: 'Con Pagos en el período' },
      { icon: 'fas fa-car-side', color: '#f59e0b', value: r.ultimas_visitas?.length || 0, label: 'Visitas recientes' }
    ]);

    const visits = r.ultimas_visitas || [];
    if (visits.length) {
      createChart('chartClientes', {
        type: 'bar', title: 'Últimas Visitas al Taller',
        data: { labels: visits.slice(0, 8).map(d => d.cliente_nombre), datasets: [{ label: 'Visitas', data: visits.slice(0, 8).map(() => 1), backgroundColor: CC }] }
      });
    }
  }

  const clientesArr = unwrap(lista);
  if (clientesArr.length) {
    renderTable('tableContainer', [
      { key: 'nombre', label: 'Nombre', html: r => escapeHtml(r.nombre + ' ' + (r.apellido||'')) },
      { key: 'rut', label: 'RUT' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'vehiculos', label: 'Vehículos' },
      { key: 'visitas', label: 'Visitas' },
      { key: 'ventas_count', label: 'Pagos' },
      { key: 'ventas_total', label: 'Monto Pagado', format: 'money' }
    ], clientesArr);
  } else {
    const $tc = el('tableContainer');
    if ($tc) $tc.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Sin clientes registrados</p></div>';
  }
}

async function loadEmpleados() {
  showLoading();
  const [resumen] = await Promise.all([reportFetch('empleados_resumen')]);
  hideLoading();

  _reportData.empleados = { resumen };

  if (resumen) {
    const r = resumen.data;
    renderKPIs('kpiGrid', [
      { icon: 'fas fa-user-tie', color: '#4f46e5', value: r.total, label: 'Total Empleados' },
      { icon: 'fas fa-check-double', color: '#10b981', value: r.tareas_completadas, label: 'Tareas Completadas', sub: 'En el período' }
    ]);

    const tecnicos = r.rendimiento_tecnicos || [];
    if (tecnicos.length) {
      createChart('chartEmpleados', {
        type: 'bar', title: 'Rendimiento Técnicos',
        data: { labels: tecnicos.map(d => d.nombre), datasets: [
          { label: 'OTs Total', data: tecnicos.map(d => d.total_ots||0), backgroundColor: '#3b82f6' },
          { label: 'Completadas', data: tecnicos.map(d => d.completadas||0), backgroundColor: '#10b981' }
        ]}
      });
    }

    const tareasEmp = r.tareas_por_empleado || [];
    if (tareasEmp.length) {
      renderTable('tableContainer', [
        { key: 'nombre', label: 'Empleado' },
        { key: 'total_tareas', label: 'Total Tareas' },
        { key: 'completadas', label: 'Completadas' }
      ], tareasEmp);
    } else {
      const $tc = el('tableContainer');
      if ($tc) $tc.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>Sin datos de empleados</p></div>';
    }
  }
}

async function loadReporteMensual() {
  showLoading();
  const resumen = await reportFetch('resumen_general');
  hideLoading();

  _reportData.mensual = { resumen };

  if (resumen) {
    const r = resumen.data;
    renderKPIs('kpiGrid', [
      { icon: 'fas fa-dollar-sign', color: '#10b981', value: formatMoney(r.ventas_total), label: 'Ingresos Totales', sub: `${r.ventas_cantidad} cobros` },
      { icon: 'fas fa-shopping-cart', color: '#3b82f6', value: formatMoney(r.compras_total), label: 'Compras Totales' },
      { icon: 'fas fa-chart-line', color: '#f59e0b', value: formatMoney(r.utilidad_bruta), label: 'Utilidad Bruta' },
      { icon: 'fas fa-wrench', color: '#8b5cf6', value: r.ots_total, label: 'OTs', sub: `${r.ots_activas} activas · ${r.ots_completadas} completadas` },
      { icon: 'fas fa-users', color: '#14b8a6', value: r.clientes_total, label: 'Clientes', sub: `${r.clientes_nuevos} nuevos` },
      { icon: 'fas fa-tasks', color: '#ec4899', value: r.tareas_total, label: 'Tareas', sub: `${r.tareas_pendientes} pend. · ${r.tareas_completadas} comp.` }
    ]);
  }
}

// ============================================================================
// REPORT WIZARD
// ============================================================================

function openReportWizard() {
  const modal = el('reportWizard');
  if (!modal) return;
  modal.style.display = 'flex';

  const sectionsByCat = {
    resumen: ['Resumen General', 'Evolución Ventas/Compras', 'Distribución Ventas'],
    finanzas: ['Ventas', 'Compras', 'Compras Rápidas', 'Flujo Caja', 'Ventas por Cliente', 'Cuentas'],
    operaciones: ['OTs por Estado', 'Detalle OTs', 'Productividad', 'Presupuestos', 'Top Trabajos'],
    inventario: ['Stock Estado', 'Movimientos', 'Artículos Top'],
    tareas: ['Tareas por Estado', 'Tareas por Empleado', 'Detalle Tareas'],
    clientes: ['Resumen Clientes', 'Top Clientes', 'Visitas'],
    empleados: ['Resumen Empleados', 'Rendimiento Técnicos', 'Tareas por Empleado'],
    mensual: ['Resumen General', 'Indicadores Clave']
  };

  const step1 = el('wizardStep1');
  const items = sectionsByCat[currentCategory] || sectionsByCat.resumen;

  const checkboxes = items.map(s => `
    <label class="check-item selected">
      <input type="checkbox" checked data-section="${escapeHtml(s)}">
      <span class="check-label">${escapeHtml(s)}</span>
    </label>
  `).join('');

  step1.innerHTML = `
    <h4><i class="fas fa-list-check"></i> Secciones del reporte (${escapeHtml(currentCategory)})</h4>
    <div class="wizard-checklist">${checkboxes}</div>
    <div style="margin-top:0.8rem;">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.82rem;color:var(--text-secondary);">
        <input type="checkbox" id="wizardSelectAll" checked> Seleccionar todo
      </label>
    </div>
  `;

  const selAll = el('wizardSelectAll');
  if (selAll) {
    selAll.onchange = function() {
      step1.querySelectorAll('input[type="checkbox"][data-section]').forEach(cb => cb.checked = this.checked);
    };
  }

  wizardShowStep(1);
}

function wizardShowStep(step) {
  [1, 2, 3].forEach(s => {
    const el = el('wizardStep' + s);
    if (el) el.classList.toggle('active', s === step);
  });
  document.querySelectorAll('.wizard-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('completed', s < step);
  });
  el('wizardPrev').style.display = step > 1 ? '' : 'none';
  el('wizardNext').style.display = step < 3 ? '' : 'none';
  el('wizardGenerate').style.display = step === 3 ? '' : 'none';
  if (step === 3) updateWizardPreview();
}

function closeReportWizard() {
  const modal = el('reportWizard');
  if (modal) modal.style.display = 'none';
}

function updateWizardPreview() {
  const preview = el('wizardPreview');
  if (!preview) return;
  preview.innerHTML = `
    <i class="fas fa-file-alt" style="font-size:2.5rem;opacity:0.4;color:var(--primary);"></i>
    <p style="font-weight:600;color:var(--text-primary);">Reporte Listo para Generar</p>
    <p style="font-size:0.78rem;color:var(--text-secondary);">
      Período: ${formatDate(currentDesde)} — ${formatDate(currentHasta)}<br>
      Categoría: ${currentCategory}
    </p>
  `;
}

// ============================================================================
// PREMIUM PDF HELPERS — matching pdf_api.php design system
// ============================================================================

function buildPremiumSection(title, body, icon = 'fa-chart-line', colorClass = '') {
  const cc = colorClass ? ` ${colorClass}` : '';
  return `<div class="section">
    <div class="section-header${cc}"><i class="fas ${icon}"></i> ${escapeHtml(title)}</div>
    <div class="section-body">${body}</div>
  </div>`;
}

function buildPremiumInfoGrid(items, cols = 3) {
  const cc = cols === 2 ? ' cols-2' : '';
  let h = `<div class="info-grid${cc}">`;
  for (const [label, value] of Object.entries(items)) {
    h += `<div class="info-item"><div class="info-label">${escapeHtml(label)}</div><div class="info-value">${value != null ? value : '--'}</div></div>`;
  }
  h += '</div>';
  return h;
}

function buildPremiumTable(headers, rows) {
  let h = '<table class="data-table"><thead><tr>';
  headers.forEach(hdr => { h += `<th>${escapeHtml(hdr)}</th>`; });
  h += '</tr></thead><tbody>';
  rows.forEach(row => {
    h += '<tr>';
    row.forEach(cell => { h += `<td>${cell != null ? cell : '--'}</td>`; });
    h += '</tr>';
  });
  h += '</tbody></table>';
  return h;
}

function buildSectionContent(sectionName) {
  const d = _reportData;

  switch (sectionName) {
    case 'Resumen General': {
      const r = d.resumen?.resumen?.data;
      if (!r) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos disponibles para este período.</p>';
      return buildPremiumInfoGrid({
        'Ingresos Totales': '$' + formatMoney(r.ventas_total),
        'Compras Totales': '$' + formatMoney(r.compras_total),
        'Compras Rápidas': '$' + formatMoney(r.rapidas_total || 0),
        'Utilidad Bruta': '$' + formatMoney(r.utilidad_bruta),
        'Órdenes Trabajo': String(r.ots_total || 0),
        'Presupuestos': String(r.presupuestos_cantidad || 0),
        'Recepciones': String(r.recepciones || 0),
        'Clientes': String(r.clientes_total || 0),
        'Vehículos': String(r.vehiculos_total || 0),
        'Tareas': String(r.tareas_total || 0),
        'Por Cobrar': '$' + formatMoney(r.por_cobrar_total || 0),
        'Por Pagar': '$' + formatMoney(r.por_pagar_total || 0),
      }, 3);
    }

    case 'Evolución Ventas/Compras': {
      const ev = d.resumen?.evolucion?.data;
      if (!ev) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de evolución.</p>';
      const vArr = Array.isArray(ev.ventas) ? ev.ventas : [];
      const cArr = Array.isArray(ev.compras) ? ev.compras : [];
      if (!vArr.length && !cArr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de evolución.</p>';
      const periodos = [...new Set([...vArr.map(d => d.periodo), ...cArr.map(d => d.periodo)])].sort();
      return buildPremiumTable(
        ['Período', 'Ventas', 'Compras'],
        periodos.map(p => {
          const v = vArr.find(d => d.periodo === p);
          const c = cArr.find(d => d.periodo === p);
          return [escapeHtml(p), '$' + formatMoney(v?.total || 0), '$' + formatMoney(c?.total || 0)];
        })
      );
    }

    case 'Distribución Ventas': {
      const arr = unwrap(d.resumen?.distVentas);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de distribución.</p>';
      return buildPremiumTable(
        ['Categoría', 'Total'],
        arr.map(item => [escapeHtml(item.categoria || ''), '$' + formatMoney(item.total || 0)])
      );
    }

    case 'Ventas': {
      const arr = unwrap(d.finanzas?.ventas);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin ingresos registrados.</p>';
      return buildPremiumTable(
        ['Fecha', 'Cliente', 'Monto'],
        arr.map(item => [escapeHtml(item.fecha || ''), escapeHtml(item.cliente_nombre || ''), '$' + formatMoney(item.monto || item.total || 0)])
      );
    }

    case 'Compras': {
      const arr = unwrap(d.finanzas?.compras);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin compras registradas.</p>';
      return buildPremiumTable(
        ['Fecha', 'Proveedor', 'Total'],
        arr.map(item => [escapeHtml(item.fecha || ''), escapeHtml(item.proveedor_nombre || item.nombre || ''), '$' + formatMoney(item.total || item.monto || 0)])
      );
    }

    case 'Compras Rápidas': {
      const arr = unwrap(d.finanzas?.rapidas);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin compras rápidas registradas.</p>';
      return buildPremiumTable(
        ['Fecha', 'Detalle', 'Valor'],
        arr.map(item => [escapeHtml(item.fecha || ''), escapeHtml(item.empleado_nombre || item.detalle || ''), '$' + formatMoney(item.valor || item.total || 0)])
      );
    }

    case 'Flujo Caja': {
      const arr = unwrap(d.finanzas?.flujo);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de flujo de caja.</p>';
      return buildPremiumTable(
        ['Fecha', 'Ingresos', 'Egresos'],
        arr.map(item => [escapeHtml(item.fecha || ''), '$' + formatMoney(item.ingresos || 0), '$' + formatMoney(item.egresos || 0)])
      );
    }

    case 'Ventas por Cliente': {
      const arr = unwrap(d.finanzas?.vtasClientes);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de ingresos por cliente.</p>';
      return buildPremiumTable(
        ['Cliente', 'Total Ingresos'],
        arr.slice(0, 15).map(item => [escapeHtml(item.cliente_nombre || ''), '$' + formatMoney(item.total_ventas || 0)])
      );
    }

    case 'Cuentas': {
      const arr = unwrap(d.finanzas?.cuentas);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de cuentas.</p>';
      return buildPremiumTable(
        ['Cuenta', 'Ingresos', 'Egresos'],
        arr.map(item => [escapeHtml(item.nombre || ''), '$' + formatMoney(item.ingresos_rango || 0), '$' + formatMoney(item.egresos_rango || 0)])
      );
    }

    case 'OTs por Estado': {
      const arr = unwrap(d.operaciones?.otsEstado);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos.</p>';
      return buildPremiumTable(['Estado', 'Cantidad'], arr.map(item => [escapeHtml(item.estado || ''), String(item.cantidad || 0)]));
    }

    case 'Detalle OTs': {
      const arr = unwrap(d.operaciones?.otsDetalle);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de OT.</p>';
      return buildPremiumTable(
        ['# OT', 'Creado', 'Cliente', 'Técnico', 'Estado'],
        arr.slice(0, 30).map(item => [
          String(item.id || ''), escapeHtml(item.creado || ''), escapeHtml(item.cliente_nombre || ''),
          escapeHtml(item.tecnico_nombre || ''), '<span class="badge">' + escapeHtml(item.estado || '') + '</span>',
        ])
      );
    }

    case 'Productividad': {
      const arr = unwrap(d.operaciones?.productividad);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de productividad.</p>';
      return buildPremiumTable(
        ['Técnico', 'OTs Completadas'],
        arr.slice(0, 15).map(item => [escapeHtml(item.nombre || ''), String(item.ordenes_completadas || 0)])
      );
    }

    case 'Presupuestos': {
      const pd = d.operaciones?.presConv?.data || {};
      const items = [];
      if (pd.total != null) items.push(['Total Presupuestos', String(pd.total)]);
      if (pd.convertidos != null) items.push(['Convertidos', String(pd.convertidos)]);
      if (pd.monto_total != null) items.push(['Monto Total', '$' + formatMoney(pd.monto_total)]);
      if (pd.total > 0) items.push(['Tasa Conversión', ((pd.convertidos || 0) / pd.total * 100).toFixed(1) + '%']);
      if (!items.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de presupuestos.</p>';
      return buildPremiumTable(['Indicador', 'Valor'], items);
    }

    case 'Top Trabajos': {
      const arr = unwrap(d.operaciones?.trabajosTop);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos.</p>';
      return buildPremiumTable(
        ['Trabajo', 'Frecuencia'],
        arr.slice(0, 15).map(item => [escapeHtml(item.nombre || ''), String(item.frecuencia || 0)])
      );
    }

    case 'Stock Estado': {
      const arr = unwrap(d.inventario?.stock);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de stock.</p>';
      return buildPremiumTable(
        ['Código', 'Descripción', 'Tipo', 'Stock Actual', 'Mínimo', 'Precio'],
        arr.slice(0, 30).map(item => [
          escapeHtml(item.codigo || ''), escapeHtml(item.descripcion || ''),
          '<span class="badge">' + escapeHtml(item.tipo || '') + '</span>',
          String(item.stock_actual ?? ''), String(item.stock_minimo ?? ''),
          '$' + formatMoney(item.precio || 0),
        ])
      );
    }

    case 'Movimientos': {
      const arr = unwrap(d.inventario?.movimientos);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin movimientos registrados.</p>';
      return buildPremiumTable(
        ['Fecha', 'Artículo', 'Tipo', 'Cantidad'],
        arr.slice(0, 30).map(item => [
          escapeHtml(item.fecha || ''), escapeHtml(item.articulo_nombre || item.nombre || ''),
          escapeHtml(item.tipo || ''), String(item.cantidad || 0),
        ])
      );
    }

    case 'Artículos Top': {
      const arr = unwrap(d.inventario?.artTop);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos.</p>';
      return buildPremiumTable(
        ['Artículo', 'Unidades Vendidas'],
        arr.slice(0, 15).map(item => [escapeHtml(item.nombre || ''), String(item.vendidos || 0)])
      );
    }

    case 'Inversión Taller': {
      const arr = d.inventario_taller || _reportData.inventario_taller || [];
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de inventario del taller.</p>';
      return buildPremiumTable(
        ['Identificación', 'Nombre', 'Zona', 'Categoría', 'Avalúo'],
        arr.map(item => [
          escapeHtml(item.identificacion || ''), escapeHtml(item.nombre || ''),
          escapeHtml(item.zona_nombre || '—'), escapeHtml(item.categoria || '—'),
          '$' + formatMoney(item.precio_avaluado || 0)
        ])
      );
    }

    case 'Tareas por Estado': {
      const arr = unwrap(d.tareas?.estado);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos.</p>';
      return buildPremiumTable(['Estado', 'Cantidad'], arr.map(item => [escapeHtml(item.estado || ''), String(item.cantidad || 0)]));
    }

    case 'Tareas por Empleado': {
      const arr = unwrap(d.tareas?.empleado);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos.</p>';
      return buildPremiumTable(
        ['Empleado', 'Total Tareas'],
        arr.map(item => [escapeHtml(item.nombre || ''), String(item.total_tareas || 0)])
      );
    }

    case 'Detalle Tareas': {
      const arr = unwrap(d.tareas?.detalle);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de tareas.</p>';
      return buildPremiumTable(
        ['#', 'Título', 'Empleado', 'Estado', 'Prioridad', 'Fecha'],
        arr.slice(0, 30).map(item => [
          String(item.id || ''), escapeHtml(item.nombre || ''), escapeHtml(item.empleado_nombre || ''),
          '<span class="badge">' + escapeHtml(item.estado || '') + '</span>',
          '<span class="badge">' + escapeHtml(item.prioridad || '') + '</span>',
          escapeHtml(item.fecha || ''),
        ])
      );
    }

    case 'Resumen Clientes': {
      const r = d.clientes?.resumen?.data;
      if (!r) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de clientes.</p>';
      return buildPremiumInfoGrid({
        'Total Clientes': String(r.total || 0),
        'Con Vehículos': String(r.con_vehiculos || 0),
        'Compraron en Período': String(r.con_compras_rango || 0),
      }, 3);
    }

    case 'Top Clientes': {
      const arr = unwrap(d.clientes?.lista);
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de clientes.</p>';
      return buildPremiumTable(
        ['Nombre', 'RUT', 'Teléfono', 'Vehículos', 'Visitas', 'Pagos', 'Monto Pagado'],
        arr.slice(0, 20).map(item => [
          escapeHtml((item.nombre || '') + ' ' + (item.apellido || '')), escapeHtml(item.rut || ''),
          escapeHtml(item.telefono || ''), String(item.vehiculos ?? ''), String(item.visitas ?? ''),
          String(item.ventas_count ?? ''), '$' + formatMoney(item.ventas_total || 0),
        ])
      );
    }

    case 'Visitas': {
      const arr = d.clientes?.resumen?.data?.ultimas_visitas || [];
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin visitas registradas.</p>';
      return buildPremiumTable(
        ['Cliente', 'Contacto'],
        arr.slice(0, 20).map(item => [escapeHtml(item.cliente_nombre || ''), escapeHtml(item.telefono || '')])
      );
    }

    case 'Resumen Empleados': {
      const r = d.empleados?.resumen?.data;
      if (!r) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de empleados.</p>';
      return buildPremiumInfoGrid({
        'Total Empleados': String(r.total || 0),
        'Tareas Completadas': String(r.tareas_completadas || 0),
      }, 2);
    }

    case 'Rendimiento Técnicos': {
      const arr = d.empleados?.resumen?.data?.rendimiento_tecnicos || [];
      if (!arr.length) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos de rendimiento.</p>';
      return buildPremiumTable(
        ['Técnico', 'OTs Total', 'Completadas'],
        arr.map(item => [escapeHtml(item.nombre || ''), String(item.total_ots || 0), String(item.completadas || 0)])
      );
    }

    case 'Indicadores Clave': {
      const r = d.mensual?.resumen?.data;
      if (!r) return '<p style="color:#94a3b8;font-size:8.5px;">Sin datos.</p>';
      return buildPremiumInfoGrid({
        'Ingresos': '$' + formatMoney(r.ventas_total),
        'Compras': '$' + formatMoney(r.compras_total),
        'Utilidad': '$' + formatMoney(r.utilidad_bruta),
        'OTs': String(r.ots_total || 0),
        'Clientes': String(r.clientes_total || 0),
        'Tareas': String(r.tareas_total || 0),
      }, 3);
    }

    default:
      return '<p style="color:#94a3b8;font-size:8.5px;">Sección <strong>' + escapeHtml(sectionName) + '</strong> — datos procesados del período ' + escapeHtml(currentDesde) + ' al ' + escapeHtml(currentHasta) + '.</p>';
  }
}

const SECTION_ICONS = {
  'Resumen General': 'fa-chart-pie',
  'Evolución Ventas/Compras': 'fa-chart-line',
  'Distribución Ventas': 'fa-chart-bar',
  'Ventas': 'fa-dollar-sign',
  'Compras': 'fa-shopping-cart',
  'Compras Rápidas': 'fa-bolt',
  'Flujo Caja': 'fa-money-bill-wave',
  'Ventas por Cliente': 'fa-users',
  'Cuentas': 'fa-book',
  'OTs por Estado': 'fa-tasks',
  'Detalle OTs': 'fa-list',
  'Productividad': 'fa-tachometer-alt',
  'Presupuestos': 'fa-file-invoice',
  'Top Trabajos': 'fa-trophy',
  'Stock Estado': 'fa-boxes',
  'Movimientos': 'fa-exchange-alt',
  'Artículos Top': 'fa-star',
  'Inversión Taller': 'fa-toolbox',
  'Tareas por Estado': 'fa-check-circle',
  'Tareas por Empleado': 'fa-user-clock',
  'Detalle Tareas': 'fa-clipboard-list',
  'Resumen Clientes': 'fa-users',
  'Top Clientes': 'fa-user-tie',
  'Visitas': 'fa-calendar-check',
  'Resumen Empleados': 'fa-user-tie',
  'Rendimiento Técnicos': 'fa-chart-bar',
  'Indicadores Clave': 'fa-key',
};

const SECTION_COLORS = {
  'Resumen General': 'purple',
  'Evolución Ventas/Compras': 'green',
  'Distribución Ventas': 'amber',
  'Ventas': 'green',
  'Compras': '',
  'Flujo Caja': 'green',
  'OTs por Estado': '',
  'Detalle OTs': '',
  'Productividad': 'purple',
  'Presupuestos': 'green',
  'Stock Estado': '',
  'Movimientos': 'amber',
  'Artículos Top': 'purple',
  'Inversión Taller': 'cyan',
  'Tareas por Estado': '',
  'Tareas por Empleado': '',
  'Detalle Tareas': '',
  'Resumen Clientes': 'purple',
  'Top Clientes': '',
  'Visitas': 'green',
  'Resumen Empleados': 'purple',
  'Rendimiento Técnicos': '',
  'Indicadores Clave': 'amber',
};

function wizardGenerate() {
  const step1 = el('wizardStep1');
  const sections = [];
  step1.querySelectorAll('input[type="checkbox"][data-section]:checked').forEach(cb => sections.push(cb.dataset.section));

  if (!sections.length) { showError('Seleccione al menos una sección para el reporte.'); return; }

  const dateStr = new Date().toLocaleString('es-CL');
  const catTitle = (CATEGORIES[currentCategory] || {}).title || currentCategory;

  const sectionsHtml = sections.map(sec => {
    const icon = SECTION_ICONS[sec] || 'fa-chart-line';
    const color = SECTION_COLORS[sec] || '';
    return buildPremiumSection(sec, buildSectionContent(sec), icon, color);
  }).join('');

  let html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>Reporte ' + escapeHtml(catTitle) + ' — FIGUETRONIC SPA</title>'
    + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">'
    + '<style>'
    + '@page{size:A4 portrait;margin:12mm 10mm 15mm 10mm}'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a2e;background:#fff;font-size:9px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + '.doc-header{display:flex;align-items:center;gap:14px;padding:14px 18px;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#1e40af 100%);border-radius:12px;color:#fff;margin-bottom:10px;box-shadow:0 4px 20px rgba(15,23,42,.25);position:relative;overflow:hidden}'
    + '.doc-header::before{content:"";position:absolute;top:-50%;right:-20%;width:200px;height:200px;background:radial-gradient(circle,rgba(255,255,255,.08) 0%,transparent 70%);border-radius:50%}'
    + '.doc-header::after{content:"";position:absolute;bottom:-30%;left:10%;width:150px;height:150px;background:radial-gradient(circle,rgba(59,130,246,.15) 0%,transparent 70%);border-radius:50%}'
    + '.doc-company{flex:1;position:relative;z-index:1}'
    + '.doc-company-name{font-size:16px;font-weight:800;letter-spacing:1px}'
    + '.doc-company-rut{font-size:8px;opacity:.7;margin-top:1px}'
    + '.doc-company-detail{font-size:7.5px;opacity:.6;margin-top:1px}'
    + '.doc-badge{position:relative;z-index:1;background:rgba(255,255,255,.12);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.15);padding:8px 14px;border-radius:8px;text-align:center;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}'
    + '.doc-badge-id{font-size:14px;font-weight:900;color:#60a5fa}'
    + '.doc-title-bar{background:linear-gradient(90deg,#eff6ff,#f0fdf4);border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:10px 16px;margin-bottom:10px}'
    + '.doc-title{font-size:16px;font-weight:900;color:#1e3a5f;text-transform:uppercase;letter-spacing:3px}'
    + '.doc-subtitle{font-size:8px;color:#64748b;font-style:italic;margin-top:2px}'
    + '.section{margin-bottom:8px;page-break-inside:avoid}'
    + '.section-header{display:flex;align-items:center;gap:6px;padding:5px 10px;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;border-radius:6px 6px 0 0;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}'
    + '.section-header.green{background:linear-gradient(135deg,#065f46,#10b981)}'
    + '.section-header.amber{background:linear-gradient(135deg,#92400e,#f59e0b)}'
    + '.section-header.red{background:linear-gradient(135deg,#991b1b,#ef4444)}'
    + '.section-header.purple{background:linear-gradient(135deg,#581c87,#a855f7)}'
    + '.section-header i{font-size:10px}'
    + '.section-body{border:1px solid #e2e8f0;border-top:none;border-radius:0 0 6px 6px;padding:8px 10px;background:#fff}'
    + '.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 12px}'
    + '.info-grid.cols-2{grid-template-columns:1fr 1fr}'
    + '.info-item{padding:4px 0}'
    + '.info-label{font-size:7px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}'
    + '.info-value{font-size:9px;font-weight:600;color:#1a1a2e;margin-top:1px}'
    + '.data-table{width:100%;border-collapse:collapse;font-size:8px}'
    + '.data-table thead th{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:6px 8px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left}'
    + '.data-table tbody td{padding:6px 8px;border-bottom:1px solid #f1f5f9}'
    + '.data-table tbody tr:nth-child(even){background:#f8fafc}'
    + '.data-table tbody tr:last-child td{border-bottom:2px solid #2563eb}'
    + '.badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;background:#dbeafe;color:#1d4ed8}'
    + '.doc-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:2px solid #1e3a5f;margin-top:12px;font-size:7px;color:#94a3b8}'
    + '@media print{body{margin:0}}'
    + '</style></head><body>'
    + '<div class="doc-header">'
    + '<div class="doc-company">'
    + '<div class="doc-company-name">FIGUETRONIC SPA</div>'
    + '<div class="doc-company-rut">RUT: 78419845-6</div>'
    + '<div class="doc-company-detail">Baldomero Lillo 364, Padre Hurtado, Santiago | Tel: +56.995183457</div>'
    + '<div class="doc-company-detail" style="color:#f87171;margin-top:2px;">SERVICIO DE ELECTRÓNICA AUTOMOTRIZ</div>'
    + '</div>'
    + '<div class="doc-badge"><div class="doc-badge-id">REPORTE</div><div>CONTROL DE GESTIÓN</div></div>'
    + '</div>'
    + '<div class="doc-title-bar">'
    + '<div class="doc-title">Reporte de Control — ' + escapeHtml(catTitle) + '</div>'
    + '<div class="doc-subtitle">' + escapeHtml(currentDesde) + ' al ' + escapeHtml(currentHasta) + ' · Generado: ' + dateStr + '</div>'
    + '</div>'
    + sectionsHtml
    + '<div class="doc-footer">'
    + '<span>FIGUETRONIC SPA — 78419845-6</span>'
    + '<span>figuetronic.cl</span>'
    + '<span>Reporte ' + escapeHtml(catTitle) + ' | ' + dateStr + '</span>'
    + '</div>'
    + '<script>document.fonts.ready.then(function(){setTimeout(function(){window.print()},600)})<\/script>'
    + '</body></html>';

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  closeReportWizard();
}

// ============================================================================
// NAVIGATION
// ============================================================================

const CATEGORIES = {
  resumen:   { title: 'Resumen General',       icon: 'fas fa-chart-pie',    loader: loadResumen },
  finanzas:  { title: 'Finanzas',              icon: 'fas fa-dollar-sign',  loader: loadFinanzas },
  operaciones: { title: 'Operaciones',           icon: 'fas fa-tools',       loader: loadOperaciones },
  inventario:  { title: 'Inventario',            icon: 'fas fa-boxes',       loader: loadInventario },
  inventario_taller: { title: 'Inventario Taller', icon: 'fas fa-toolbox',  loader: loadInventarioTaller },
  tareas:    { title: 'Tareas Diarias',         icon: 'fas fa-tasks',       loader: loadTareas },
  clientes:  { title: 'Clientes',              icon: 'fas fa-users',       loader: loadClientes },
  empleados: { title: 'Empleados',             icon: 'fas fa-user-tie',    loader: loadEmpleados },
  mensual:   { title: 'Reporte Mensual',        icon: 'fas fa-file-alt',    loader: loadReporteMensual }
};

function setCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.report-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === cat);
  });

  const info = CATEGORIES[cat] || CATEGORIES.resumen;
  const titleEl = el('reportTitle');
  if (titleEl) titleEl.textContent = info.title;

  destroyCharts();
  el('kpiGrid').innerHTML = '';
  const tc = el('tableContainer');
  if (tc) tc.innerHTML = '';

  const chartsArea = el('chartsArea');
  if (chartsArea) {
    chartsArea.querySelectorAll('.chart-card').forEach(c => c.remove());
  }

  if (info.loader) info.loader();
}

function applyDateFilter() {
  const desde = el('dateFrom');
  const hasta = el('dateTo');
  currentDesde = desde ? desde.value : '';
  currentHasta = hasta ? hasta.value : '';
  const rd = el('dateRangeDisplay');
  if (rd) rd.textContent = `${formatDate(currentDesde)} — ${formatDate(currentHasta)}`;
  setCategory(currentCategory);
}

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  currentDesde = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  currentHasta = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;

  const df = el('dateFrom'), dt = el('dateTo');
  if (df) df.value = currentDesde;
  if (dt) dt.value = currentHasta;

  const rd = el('dateRangeDisplay');
  if (rd) rd.textContent = `${formatDate(currentDesde)} — ${formatDate(currentHasta)}`;

  document.querySelectorAll('.report-tab').forEach(btn => {
    btn.addEventListener('click', () => setCategory(btn.dataset.category));
  });

  el('btnApplyFilter')?.addEventListener('click', applyDateFilter);
  el('btnGenerateReport')?.addEventListener('click', openReportWizard);
  el('wizardClose')?.addEventListener('click', closeReportWizard);
  el('wizardCancel')?.addEventListener('click', closeReportWizard);

  const wm = el('reportWizard');
  if (wm) {
    wm.addEventListener('click', e => { if (e.target === wm) closeReportWizard(); });
  }

  el('wizardNext')?.addEventListener('click', () => {
    const cur = document.querySelector('.wizard-step.active');
    if (cur) wizardShowStep(parseInt(cur.dataset.step) + 1);
  });

  el('wizardPrev')?.addEventListener('click', () => {
    const cur = document.querySelector('.wizard-step.active');
    if (cur) wizardShowStep(parseInt(cur.dataset.step) - 1);
  });

  el('wizardGenerate')?.addEventListener('click', wizardGenerate);

  setCategory('resumen');
});
