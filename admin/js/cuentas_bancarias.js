/* js/cuentas_bancarias.js — Ficha Completa */
let cuentas = [];
let allCuentas = [];
let currentCuenta = null;
let movimientos = [];
let movCurrentPage = 1;
let resumen = null;

const API_CB = API_ROOT + 'cuentas_bancarias_api.php';

function closeFicha() {
  el('listView').style.display = '';
  el('fichaContainer').classList.remove('active');
  currentCuenta = null;
  loadData();
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function setSelectValue(select, value) {
  if (!select) return;
  const opts = Array.from(select.options);
  const match = opts.find(o => o.value === value || o.text === value);
  select.value = match ? match.value : '';
}

document.addEventListener('DOMContentLoaded', () => {
  loadDynamicOptions('banco', 'bancos');
  loadDynamicOptions('tipo_cuenta', 'tipo_cuenta_bancaria');
  Promise.all([loadResumen(), loadCuentas(), loadMovimientos()]);
  setupFichaEvents();
  setupReactiveRefresh(() => { loadResumen(); loadCuentas(); loadMovimientos(); });
});

function setupFichaEvents() {
  el('btnNueva').addEventListener('click', () => openFicha());
  el('btnNuevoMovimiento').addEventListener('click', openMovimientoModal);
  el('btnTransferir')?.addEventListener('click', openTransferModal);
  el('btnBackList').addEventListener('click', closeFicha);
  el('btnFichaDelete').addEventListener('click', deleteCurrent);

  document.querySelectorAll('.ficha-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ficha-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = el('tab' + capitalize(tab.dataset.tab));
      if (panel) panel.classList.add('active');
    });
  });

  el('dataForm').addEventListener('submit', handleFormSubmit);
  el('btnReset').addEventListener('click', closeFicha);

  el('btnCerrarMov').addEventListener('click', closeMovimientoModal);
  el('formMovimiento').addEventListener('submit', handleMovimientoSubmit);
  el('modalMovimiento').addEventListener('click', (e) => { if (e.target === el('modalMovimiento')) closeMovimientoModal(); });

  el('btnCerrarTrans')?.addEventListener('click', closeTransferModal);
  el('formTransferir')?.addEventListener('submit', handleTransferSubmit);
  el('modalTransferir')?.addEventListener('click', (e) => { if (e.target === el('modalTransferir')) closeTransferModal(); });

  if (el('btnFiltrar')) el('btnFiltrar').addEventListener('click', () => { movCurrentPage = 1; loadMovimientos(); });
  ['filterCuenta','filterTipo','filterFechaDesde','filterFechaHasta'].forEach(id => {
    if (el(id)) el(id).addEventListener('change', () => { movCurrentPage = 1; loadMovimientos(); });
  });
}

function openFicha(id) {
  if (!id) {
    currentCuenta = null;
    el('record_id').value = '';
    el('fichaTitle').textContent = 'Nueva Cuenta';
    el('fichaSub').textContent = 'Crear nueva cuenta bancaria';
    el('fichaAvatar').textContent = 'CB';
    el('fichaAvatar').className = 'ficha-avatar gradient-blue';
    el('btnFichaDelete').style.display = 'none';
    el('fichaStats').innerHTML = '';
    resetFormFields();
    openFichaPanel();
    return;
  }

  currentCuenta = allCuentas.find(c => parseInt(c.id) === parseInt(id));
  if (!currentCuenta) return;

  el('record_id').value = currentCuenta.id;
  el('fichaTitle').textContent = currentCuenta.nombre;
  el('fichaSub').textContent = `${currentCuenta.banco || ''} ${currentCuenta.numero_cuenta ? '· ' + currentCuenta.numero_cuenta : ''}`;
  el('fichaAvatar').textContent = currentCuenta.nombre ? currentCuenta.nombre.slice(0, 2).toUpperCase() : 'CB';

  const saldo = parseFloat(currentCuenta.saldo) || 0;
  el('fichaAvatar').className = 'ficha-avatar ' + (saldo >= 0 ? 'gradient-green' : 'gradient-red');
  el('btnFichaDelete').style.display = '';

  el('fichaStats').innerHTML = `
    <div class="meta-card stat-sm"><div class="stat-label">Saldo</div><div class="stat-val">${formatMoney(saldo)}</div></div>
    <div class="meta-card stat-sm"><div class="stat-label">Tipo</div><div class="stat-val">${currentCuenta.tipo || '—'}</div></div>
    <div class="meta-card stat-sm"><div class="stat-label">Banco</div><div class="stat-val">${currentCuenta.banco || '—'}</div></div>
  `;

  populateFormFromCuenta(currentCuenta);
  openFichaPanel();
  loadMovimientos();
}

function populateFormFromCuenta(c) {
  const form = el('dataForm');
  form.nombre.value = c.nombre || '';
  setSelectValue(form.banco, c.banco);
  form.numero_cuenta.value = c.numero_cuenta || '';
  setSelectValue(form.tipo_cuenta, c.tipo);
  form.saldo_inicial.value = c.saldo ?? c.saldo_inicial ?? 0;
}

function resetFormFields() {
  el('dataForm').reset();
  el('saldo_inicial').value = 0;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const btn = el('btnSave');
  setButtonLoading(btn, true);

  try {
    const fd = new FormData(el('dataForm'));
    const isEditing = !!el('record_id').value;
    const endpoint = isEditing ? '?action=update' : '?action=insert';

    const response = await apiFetch(API_CB + endpoint, fd);

    if (response.success || response.status === 'success') {
      showSuccess('Cuenta guardada correctamente');
      setSelectValue(el('banco'), '');
      setSelectValue(el('tipo_cuenta'), '');
      closeFicha();
      Promise.all([loadCuentas(), loadResumen(), loadMovimientos()]);
    } else {
      throw new Error(response.message);
    }
  } catch (error) {
    console.error('Error al guardar:', error);
    showError('Error al guardar: ' + error.message);
  } finally {
    setButtonLoading(btn, false);
  }
}

async function deleteCurrent() {
  if (!currentCuenta || !confirm('¿Eliminar esta cuenta? Los movimientos asociados se conservarán.')) return;

  try {
    const fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', currentCuenta.id);
    const r = await apiFetch(API_CB, fd);
    if (r.success || r.status === 'success') {
      showSuccess('Cuenta eliminada');
      closeFicha();
      Promise.all([loadCuentas(), loadResumen(), loadMovimientos()]);
    }
  } catch (error) {
    showError('Error al eliminar: ' + error.message);
  }
}

async function loadResumen() {
  try {
    const r = await fetch(`${API_CB}?action=resumen`).then(x => x.json());
    if (r.status !== 'success') return;
    resumen = r.data;

    el('kpiSaldoTotal').textContent = formatMoney(resumen.total_saldos);
    el('kpiCuentasCount').textContent = `${resumen.total_cuentas} cuenta${resumen.total_cuentas !== 1 ? 's' : ''}`;
    el('kpiIngresosMes').textContent = formatMoney(resumen.ingresos_mes);
    el('kpiEgresosMes').textContent = formatMoney(resumen.egresos_mes);
    el('kpiBalanceMes').textContent = formatMoney(resumen.balance_mes);
    el('kpiMovimientosHoy').textContent = `${resumen.movimientos_hoy} movimiento${resumen.movimientos_hoy !== 1 ? 's' : ''} hoy`;

    if (resumen.ingresos_mes_anterior > 0) {
      const pct = Math.round(((resumen.ingresos_mes - resumen.ingresos_mes_anterior) / resumen.ingresos_mes_anterior) * 100);
      el('kpiIngresosChange').textContent = `${pct >= 0 ? '+' : ''}${pct}% vs mes anterior`;
      el('kpiIngresosChange').className = `kpi-change ${pct >= 0 ? 'up' : 'down'}`;
    } else {
      el('kpiIngresosChange').textContent = resumen.ingresos_mes > 0 ? 'Primer mes con datos' : '';
      el('kpiIngresosChange').className = 'kpi-change';
    }
    if (resumen.egresos_mes_anterior > 0) {
      const pct = Math.round(((resumen.egresos_mes - resumen.egresos_mes_anterior) / resumen.egresos_mes_anterior) * 100);
      el('kpiEgresosChange').textContent = `${pct >= 0 ? '+' : ''}${pct}% vs mes anterior`;
      el('kpiEgresosChange').className = `kpi-change ${pct <= 0 ? 'up' : 'down'}`;
    } else {
      el('kpiEgresosChange').textContent = resumen.egresos_mes > 0 ? 'Primer mes con datos' : '';
      el('kpiEgresosChange').className = 'kpi-change';
    }
  } catch(e) { console.error('Error loading resumen:', e); }
}

async function loadCuentas(force = false) {
  try {
    const r = await fetch(`${API_CB}?per_page=50`).then(x => x.json());
    if (r.status !== 'success') return;
    allCuentas = r.data.items || r.data;
    renderAccountCards();
    populateCuentasFromList();
  } catch(e) { console.error(e); }
}

function renderAccountCards() {
  const grid = el('accountGrid');
  if (!grid) return;
  if (!allCuentas.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:2rem;text-align:center;color:var(--text-secondary)"><i class="fas fa-university" style="font-size:2rem;margin-bottom:.5rem;display:block"></i>No hay cuentas registradas</div>';
    return;
  }
  grid.innerHTML = allCuentas.map(c => {
    const saldo = parseFloat(c.saldo) || 0;
    const saldoClass = saldo >= 0 ? 'positive' : 'negative';
    return `
      <div class="account-card ${currentCuenta && String(currentCuenta.id) === String(c.id) ? 'selected' : ''}" onclick="openFicha(${c.id})">
        <div class="ac-header">
          <div class="ac-icon"><i class="fas fa-university"></i></div>
          <div>
            <div class="ac-name">${escapeHtml(c.nombre)}</div>
            <div class="ac-bank">${escapeHtml(c.banco || '—')}${c.numero_cuenta ? ' · ' + escapeHtml(c.numero_cuenta) : ''}</div>
            ${c.tipo ? `<span class="ac-type">${escapeHtml(c.tipo)}</span>` : ''}
          </div>
        </div>
        <div class="ac-balance">
          <div class="ac-balance-label">Saldo Actual</div>
          <div class="ac-balance-value ${saldoClass}">${formatMoney(saldo)}</div>
        </div>
      </div>`;
  }).join('');
}

function populateCuentasFromList() {
  const sel = el('filterCuenta');
  const movSel = el('movCuenta');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = '<option value="">Todas las cuentas</option>' +
      allCuentas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} — ${escapeHtml(c.banco || '')}</option>`).join('');
    sel.value = current;
  }
  if (movSel) {
    movSel.innerHTML = '<option value="">— Seleccionar —</option>' +
      allCuentas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} — ${escapeHtml(c.banco || '')}</option>`).join('');
  }
}

async function loadMovimientos(page = 1) {
  movCurrentPage = page;
  const params = new URLSearchParams({
    action: 'movimientos',
    page: page,
    per_page: 20,
  });
  if (currentCuenta) params.set('cuenta_id', currentCuenta.id);
  if (el('filterCuenta')?.value) params.set('cuenta_id', el('filterCuenta').value);
  if (el('filterTipo')?.value) params.set('tipo', el('filterTipo').value);
  if (el('filterFechaDesde')?.value) params.set('fecha_desde', el('filterFechaDesde').value);
  if (el('filterFechaHasta')?.value) params.set('fecha_hasta', el('filterFechaHasta').value);

  const tbodyId = currentCuenta ? 'movimientosBody' : 'movimientosBodyAll';
  const paginationId = currentCuenta ? 'movimientosPaginationFicha' : 'movimientosPagination';

  try {
    const r = await fetch(`${API_CB}?${params.toString()}`).then(x => x.json());
    if (r.status !== 'success') return;
    const items = r.data.items || [];
    const tbody = el(tbodyId);
    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="mov-empty"><i class="fas fa-inbox"></i> No hay movimientos con estos filtros</td></tr>';
    } else {
      tbody.innerHTML = items.map(m => {
        const monto = parseFloat(m.monto) || 0;
        const montoClass = m.tipo === 'ingreso' ? 'positive' : 'negative';
        const signo = m.tipo === 'ingreso' ? '+' : '-';
        const fecha = m.fecha || '—';
        const tipoLabel = {ingreso:'Ingreso',egreso:'Egreso',transferencia:'Transferencia'}[m.tipo] || m.tipo;
        const colCount = currentCuenta ? 4 : 5;
        return `<tr>
          <td>${fecha}</td>
          <td><span class="mov-tipo-badge ${m.tipo}">${tipoLabel}</span></td>
          <td>${escapeHtml(m.concepto || m.entidad_tipo || '—')}</td>
          ${currentCuenta ? '' : `<td>${escapeHtml(m.cuenta_nombre || '—')}</td>`}
          <td class="mov-monto ${montoClass}">${signo}${formatMoney(monto)}</td>
        </tr>`;
      }).join('');
    }

    const paginationEl = el(paginationId);
    if (paginationEl && r.data?.total) {
      renderPagination(paginationEl, { page: r.data.page || 1, total_pages: r.data.total_pages || 1 }, (p) => loadMovimientos(p));
    } else if (paginationEl) {
      paginationEl.innerHTML = '';
    }
  } catch(e) { console.error('Error loading movimientos:', e); }
}

function openMovimientoModal() {
  el('formMovimiento')?.reset();
  el('movFecha').value = new Date().toISOString().split('T')[0];
  if (currentCuenta) el('movCuenta').value = currentCuenta.id;
  el('modalMovimiento')?.classList.add('active');
}

function closeMovimientoModal() {
  el('modalMovimiento')?.classList.remove('active');
}

async function handleMovimientoSubmit(e) {
  e.preventDefault();
  const btn = el('btnGuardarMov');
  setButtonLoading(btn, true, 'Registrando...');
  try {
    const fd = new FormData(el('formMovimiento'));
    fd.append('action', 'registrar_movimiento');
    const r = await apiFetch(API_CB, fd);
    if (r.status === 'success') {
      showSuccess('Movimiento registrado — Nuevo saldo: ' + formatMoney(r.data?.nuevo_saldo || 0));
      closeMovimientoModal();
      await Promise.all([loadResumen(), loadCuentas(), loadMovimientos()]);
    } else {
      showError(r.message);
    }
  } catch(e) {
    showError('Error de conexión');
  } finally {
    setButtonLoading(btn, false);
  }
}

// ═══ TRANSFERENCIA ══════════════════════════════════════════════════════════════
function openTransferModal() {
  el('formTransferir')?.reset();
  el('transFecha').value = new Date().toISOString().split('T')[0];
  // Poblar selects de cuentas
  const origen = el('transOrigen');
  const destino = el('transDestino');
  if (origen && destino) {
    origen.innerHTML = '<option value="">— Seleccionar —</option>' +
      allCuentas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} — ${formatMoney(parseFloat(c.saldo) || 0)}</option>`).join('');
    destino.innerHTML = '<option value="">— Seleccionar —</option>' +
      allCuentas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} — ${formatMoney(parseFloat(c.saldo) || 0)}</option>`).join('');
  }
  el('modalTransferir')?.classList.add('active');
}

function closeTransferModal() {
  el('modalTransferir')?.classList.remove('active');
}

async function handleTransferSubmit(e) {
  e.preventDefault();
  const btn = el('btnGuardarTrans');
  setButtonLoading(btn, true, 'Transfiriendo...');
  try {
    const fd = new FormData(el('formTransferir'));
    fd.append('action', 'transferir');
    const r = await apiFetch(API_CB, fd);
    if (r.status === 'success') {
      showSuccess('Transferencia realizada');
      closeTransferModal();
      await Promise.all([loadResumen(), loadCuentas(), loadMovimientos()]);
    } else {
      showError(r.message);
    }
  } catch(e) {
    showError('Error de conexión');
  } finally {
    setButtonLoading(btn, false);
  }
}
