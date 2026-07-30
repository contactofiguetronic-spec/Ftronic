/* js/ventas.js — Ficha Completa */
let allVentas = [];
let currentVenta = null;
let currentVentaMultimedia = [];
let thumbFile = null;
let currentPage = { ventas: 1 };

const API_VENTAS  = API_ROOT + 'ventas_api.php';
const API_CLIENTE = API_ROOT + 'clientes_api.php';
const API_CBANC   = API_ROOT + 'cuentas_bancarias_api.php';
const API_MULT    = API_ROOT + 'multimedia_api.php';
const API_UNLINK  = API_ROOT + 'unlink_file_api.php';

function getTodayDate() { return new Date().toISOString().slice(0, 10); }

function setSelectValue(select, value) {
  if (!select) return;
  const opts = Array.from(select.options);
  const match = opts.find(o => o.value == value || o.text == value);
  select.value = match ? match.value : '';
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function closeFicha() {
  el('listView').style.display = '';
  el('fichaContainer').classList.remove('active');
  currentVenta = null;
  loadVentas();
}

document.addEventListener('DOMContentLoaded', () => {
  loadDynamicOptions('forma_pago', 'forma_pago');
  loadLinkedSelect('cliente_id', 'clientes');
  loadLinkedSelect('cuenta_bancaria_id', 'cuentas_bancarias');

  const fi = document.querySelector('.upload-file-input');
  if (fi) setupMultimediaToolbar(el('multimediaToolbar'), fi);

  loadVentas();
  setupFichaEvents();
  setupReactiveRefresh(() => loadVentas(true));
});

function setupFichaEvents() {
  el('btnNuevo').addEventListener('click', () => openFicha());
  el('btnBackList').addEventListener('click', closeFicha);
  el('btnFichaDelete').addEventListener('click', deleteCurrent);
  el('btnFichaPdf').addEventListener('click', () => { if (currentVenta) generateVentaPDF(currentVenta); });

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
  el('searchInput').addEventListener('input', handleSearch);

  setupFieldVoiceNote({ textareaId: 'descripcion' });
}

function openFicha(id, fuente) {
  if (!id) {
    currentVenta = null;
    el('record_id').value = '';
    el('fichaTitle').textContent = 'Nueva Venta';
    el('fichaSub').textContent = 'Crear nuevo registro';
    el('fichaAvatar').textContent = 'VT';
    el('fichaAvatar').className = 'ficha-avatar gradient-green';
    el('btnFichaDelete').style.display = 'none';
    el('btnFichaPdf').style.display = 'none';
    el('fichaStats').innerHTML = '';
    el('paymentSection').style.display = 'none';
    resetFormFields();
    openFichaPanel();
    return;
  }

  currentVenta = allVentas.find(v => parseInt(v.id) === parseInt(id) && v.fuente === (fuente || v.fuente));
  if (!currentVenta) return;

  const isPresupuesto = currentVenta.fuente === 'presupuesto';
  const isPagado = (currentVenta.estado_pago || '').toLowerCase() === 'pagado';
  const isPOS = (currentVenta.nombre || '').startsWith('Venta POS');

  el('record_id').value = currentVenta.id;
  el('fichaTitle').textContent = currentVenta.nombre || `ING-${currentVenta.id}`;
  el('fichaSub').textContent = currentVenta.cliente_nombre || 'Sin cliente';
  el('fichaAvatar').textContent = isPresupuesto ? 'TR' : isPOS ? 'VT' : (currentVenta.nombre || 'VT').slice(-2);

  el('fichaAvatar').className = 'ficha-avatar ' + (isPresupuesto ? 'gradient-blue' : 'gradient-green');
  el('btnFichaDelete').style.display = isPresupuesto ? 'none' : '';
  el('btnFichaPdf').style.display = isPresupuesto ? 'none' : '';

  el('fichaStats').innerHTML = `
    <div class="meta-card stat-sm"><div class="stat-label">Monto</div><div class="stat-val">${formatMoney(currentVenta.valor)}</div></div>
    <div class="meta-card stat-sm"><div class="stat-label">Estado</div><div class="stat-val">${currentVenta.estado_pago || '—'}</div></div>
    <div class="meta-card stat-sm"><div class="stat-label">Fecha</div><div class="stat-val">${currentVenta.fecha || '—'}</div></div>
  `;

  el('paymentSection').style.display = (isPagado || isPresupuesto) ? 'none' : 'flex';
  if (!isPagado && !isPresupuesto) {
    el('paymentStatusDisplay').textContent = currentVenta.estado_pago;
  }

  if (isPresupuesto) {
    // Presupuesto pagado: vista solo lectura
    openFichaPanel();
  } else {
    populateFormFromVenta(currentVenta);
    openFichaPanel();
  }
  loadExistingMedia();
}

function populateFormFromVenta(v) {
  const form = el('dataForm');
  form.nombre.value = v.nombre || '';
  setSelectValue(form.cliente_id, v.cliente_id);
  form.fecha.value = v.fecha || getTodayDate();
  setSelectValue(form.forma_pago, v.forma_pago);
  setSelectValue(form.cuenta_bancaria_id, v.cuenta_bancaria_id);
  form.valor.value = v.valor || 0;
  form.numero_documento.value = v.numero_documento || '';
  form.estado_pago.value = v.estado_pago || 'Pendiente';
  form.fecha_vencimiento.value = v.fecha_vencimiento || '';
  form.descripcion.value = v.descripcion || '';
}

function resetFormFields() {
  el('dataForm').reset();
  el('valor').value = '0';
  el('estado_pago').value = 'Pendiente';
  el('fecha').value = getTodayDate();
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const btn = el('btnSave');
  setButtonLoading(btn, true);

  try {
    const fd = new FormData(el('dataForm'));
    if (fd.get('fecha') === '' || fd.get('fecha') === null) fd.set('fecha', getTodayDate());
    if (fd.get('estado_pago') === '') fd.set('estado_pago', 'Pendiente');

    const isEditing = !!el('record_id').value;
    const endpoint = isEditing ? '?action=update' : '?action=insert';

    if (fd.get('numero_documento')) fd.append('numero_documento', fd.get('numero_documento'));
    if (fd.get('fecha_vencimiento')) fd.append('fecha_vencimiento', fd.get('fecha_vencimiento'));

    const response = await apiFetch(API_VENTAS + endpoint, fd);

    if (response.success || response.status === 'success') {
      showSuccess('Venta guardada correctamente');
      DraftManager.removeDraft('ventas');
      setSelectValue(el('cliente_id'), '');
      setSelectValue(el('cuenta_bancaria_id'), '');
      setSelectValue(el('forma_pago'), '');
      closeFicha();
      loadVentas();
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
  if (!currentVenta || !confirm('¿Eliminar esta venta?')) return;

  try {
    const fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', currentVenta.id);
    const r = await apiFetch(API_VENTAS, fd);
    if (r.success || r.status === 'success') {
      showSuccess('Venta eliminada');
      closeFicha();
      loadVentas();
    }
  } catch (error) {
    showError('Error al eliminar: ' + error.message);
  }
}

async function loadVentas(force = false) {
  try {
    const params = new URLSearchParams({
      page: currentPage.ventas || 1,
      per_page: 18,
      search: el('searchInput')?.value || ''
    });
    const result = await fetch(`${API_VENTAS}?${params}`).then(x => x.json());
    allVentas = result.data?.items || result.data || [];

    renderCardGrid(el('cardGrid'), allVentas, {
      renderCard: renderVentaCard,
      onClick: (item) => openFicha(item.id, item.fuente)
    });

    if (result.data?.total_pages > 1) {
      renderPagination('paginationContainer', result.data.total || 0, 18, currentPage.ventas, (p) => { currentPage.ventas = p; loadVentas(); });
    } else {
      el('paginationContainer').innerHTML = '';
    }
  } catch (error) {
    console.error('Error al cargar ventas:', error);
    el('cardGrid').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>No se pudieron cargar las ventas</p></div>';
  }
}

function renderVentaCard(v) {
  const fuente = v.fuente || 'venta';
  const isPagado = (v.estado_pago || '').toLowerCase() === 'pagado';
  const isPresupuesto = fuente === 'presupuesto';
  const isPOS = (v.nombre || '').startsWith('Venta POS');

  const badgeClass = isPagado ? 'badge-success' : (v.estado_pago === 'Parcial') ? 'badge-warning' : 'badge-danger';

  const fuenteBadge = isPresupuesto ? '<span class="badge badge-info" style="font-size:0.65rem;">Trabajo</span>'
    : isPOS ? '<span class="badge badge-warning" style="font-size:0.65rem;">POS</span>'
    : '';

  const gradClass = isPresupuesto ? 'gradient-blue' : 'gradient-green';
  const iconClass = isPresupuesto ? 'fa-screwdriver-wrench' : 'fa-cash-register';
  const initials = isPresupuesto ? 'TR' : (v.nombre || 'VT').slice(-2);

  let thumbSrc = '';
  if (v.thumb_url) {
    thumbSrc = `<img src="${v.thumb_url}" alt="" loading="lazy">`;
  }
  const initialsHtml = thumbSrc ? '' : `<div class="card-avatar-initials">${initials}</div>`;

  return `
    <div class="card-inner">
      <div class="card-header">
        <div class="card-avatar ${gradClass}">${thumbSrc}${initialsHtml}</div>
        <div class="card-top-line"></div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(v.nombre || `ING-${v.id}`)}</h3>
        <p class="card-subtitle">${escapeHtml(v.cliente_nombre || 'Sin cliente')}</p>
        <p class="card-subtitle" style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(v.descripcion || '')}</p>
        <div style="display:flex;gap:0.3rem;align-items:center;margin-top:0.3rem;">
          ${fuenteBadge}
          <span class="badge ${badgeClass}">${escapeHtml(v.estado_pago || 'Pendiente')}</span>
        </div>
        <p class="card-subtitle" style="font-weight:700;color:var(--success);margin-top:0.3rem;">${formatMoney(v.valor)}</p>
        <p style="font-size:0.72rem;color:var(--text-secondary);">${v.fecha || ''}</p>
      </div>
    </div>`;
}

function handleSearch() { clearTimeout(window._searchDebounce); window._searchDebounce = setTimeout(() => loadVentas(), 300); }

async function loadExistingMedia() {
  if (!currentVenta) return;
  try {
    const fd = new FormData();
    fd.append('tabla', 'ventas');
    fd.append('registro_id', currentVenta.id);
    const res = await apiFetch(API_MULT, fd);
    currentVentaMultimedia = Array.isArray(res) ? (res[0]?.data || res) : (res.data || []);
    renderExistingMedia(currentVentaMultimedia, 'existingMediaContainer', 'existingMediaGrid', 'ventas');
  } catch (e) { console.warn('Media load failed', e); }
}

async function deleteMediaFile(mediaId) {
  if (!confirm('¿Eliminar este archivo?')) return;
  try {
    const fd = new FormData();
    fd.append('id', mediaId);
    fd.append('force', 1);
    const r = await apiFetch(API_UNLINK, fd);
    if (r.success) { showSuccess('Eliminado'); loadExistingMedia(); }
  } catch (e) { console.error(e); }
}

async function generateVentaPDF(venta) {
  try {
    const fd = new FormData();
    fd.append('action', 'generate_ventas_pdf');
    fd.append('ventas_ids', JSON.stringify([venta.id]));

    const response = await fetch(API_VENTAS + '?action=generate_ventas_pdf', {
      method: 'POST',
      body: fd
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Venta_${venta.numero_venta || venta.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } else {
      throw new Error('Error al generar PDF');
    }
  } catch (error) {
    console.error('Error al generar PDF:', error);
    showError('Error al generar PDF');
  }
}

// ============================================================================
// REGISTRAR PAGO — registra un pago parcial contra la venta
// ============================================================================
async function registrarPago(entidadTipo, entidadId) {
  const valor = el('valor')?.value;
  const fecha = el('fecha')?.value;
  const formaPago = el('forma_pago')?.value;
  const cuentaId = el('cuenta_bancaria_id')?.value || '';
  if (!valor || !fecha || !formaPago) {
    showInfo('Complete: Monto, Fecha y Forma de Pago');
    return;
  }
  try {
    const fd = new FormData();
    fd.append('action', 'registrar_pago');
    fd.append('entidad_id', entidadId);
    fd.append('monto', valor);
    fd.append('fecha', fecha);
    fd.append('forma_pago', formaPago);
    fd.append('cuenta_bancaria_id', cuentaId);
    fd.append('observacion', 'Pago registrado desde ventas');
    const r = await apiFetch(API_VENTAS, fd);
    if (r.success || r.status === 'success') {
      showSuccess('Pago registrado');
      openFicha(entidadId);
      loadVentas();
    } else {
      showError('Error: ' + r.message);
    }
  } catch(e) {
    showError('Error de conexión');
  }
}
