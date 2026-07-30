/* js/compras.js — Compras Unificadas (manual + rápida + OTs pagadas) */
let allCompras = [];
let currentCompra = null;
let currentCompraMultimedia = [];
let thumbFile = null;
let currentPage = { compras: 1 };

const API_COMPRAS = API_ROOT + 'compras_api.php';
const API_PROV    = API_ROOT + 'proveedores_api.php';
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
  currentCompra = null;
  loadCompras();
}

document.addEventListener('DOMContentLoaded', () => {
  loadLinkedSelect('proveedor_id', 'proveedores');
  loadLinkedSelect('cuenta_bancaria_id', 'cuentas_bancarias');
  loadDynamicOptions('forma_pago', 'forma_pago');

  const fi = document.querySelector('.upload-file-input');
  if (fi) setupMultimediaToolbar(el('multimediaToolbar'), fi);

  loadCompras();
  setupFichaEvents();
  setupReactiveRefresh(() => loadCompras(true));
});

function setupFichaEvents() {
  el('btnNuevo').addEventListener('click', () => openFicha());
  el('btnBackList').addEventListener('click', closeFicha);
  el('btnFichaDelete').addEventListener('click', deleteCurrent);
  el('btnFichaPdf').addEventListener('click', () => { if (currentCompra) generateCompraPDF(currentCompra); });

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
    currentCompra = null;
    el('record_id').value = '';
    el('fichaTitle').textContent = 'Nueva Compra';
    el('fichaSub').textContent = 'Crear nuevo registro';
    el('fichaAvatar').textContent = 'CP';
    el('fichaAvatar').className = 'ficha-avatar gradient-red';
    el('btnFichaDelete').style.display = 'none';
    el('btnFichaPdf').style.display = 'none';
    el('fichaStats').innerHTML = '';
    el('paymentSection').style.display = 'none';
    resetFormFields();
    openFichaPanel();
    return;
  }

  currentCompra = allCompras.find(c => parseInt(c.id) === parseInt(id) && c.fuente === (fuente || c.fuente));
  if (!currentCompra) return;

  const isRapida = currentCompra.fuente === 'rapida';
  const isOT = currentCompra.fuente === 'ot';
  const isManual = currentCompra.fuente === 'manual';

  el('record_id').value = currentCompra.id;
  el('fichaTitle').textContent = currentCompra.numero_compra || currentCompra.nombre || `CP-${currentCompra.id}`;
  el('fichaSub').textContent = currentCompra.proveedor_nombre || 'Sin proveedor';
  el('fichaAvatar').textContent = isOT ? 'OT' : isRapida ? 'CR' : (currentCompra.numero_compra ? currentCompra.numero_compra.slice(-2) : 'CP');

  const isPagado = (currentCompra.estado_pago || '').toLowerCase() === 'pagado';
  el('fichaAvatar').className = 'ficha-avatar ' + (isPagado ? 'gradient-green' : isOT ? 'gradient-blue' : isRapida ? 'gradient-yellow' : 'gradient-red');
  el('btnFichaDelete').style.display = isOT ? 'none' : '';
  el('btnFichaPdf').style.display = isOT ? 'none' : '';

  el('fichaStats').innerHTML = `
    <div class="meta-card stat-sm"><div class="stat-label">Monto</div><div class="stat-val">${formatMoney(currentCompra.valor)}</div></div>
    <div class="meta-card stat-sm"><div class="stat-label">Estado</div><div class="stat-val">${currentCompra.estado_pago || '—'}</div></div>
    <div class="meta-card stat-sm"><div class="stat-label">Fuente</div><div class="stat-val">${isOT ? 'OT Pagada' : isRapida ? 'Compra Rápida' : 'Manual'}</div></div>
  `;

  el('paymentSection').style.display = (isPagado || isOT || isRapida) ? 'none' : 'flex';
  if (!isPagado && !isOT && !isRapida) {
    el('paymentStatusDisplay').textContent = currentCompra.estado_pago;
  }

  if (isManual) {
    populateFormFromCompra(currentCompra);
    openFichaPanel();
  } else if (isRapida) {
    window.location.href = `compras_rapidas.html?id=${currentCompra.id}`;
    return;
  } else if (isOT) {
    el('fichaStats').innerHTML += `
      <div class="meta-card stat-sm"><div class="stat-label">Descripción</div><div class="stat-val" style="font-size:0.8rem;">${escapeHtml(currentCompra.descripcion || '—')}</div></div>
    `;
  }
  loadExistingMedia();
}

function populateFormFromCompra(c) {
  const form = el('dataForm');
  form.nombre.value = c.nombre || '';
  setSelectValue(form.proveedor_id, c.proveedor_id);
  form.fecha.value = c.fecha || getTodayDate();
  setSelectValue(form.forma_pago, c.forma_pago);
  setSelectValue(form.cuenta_bancaria_id, c.cuenta_bancaria_id);
  form.valor.value = c.valor || 0;
  form.numero_documento.value = c.numero_documento || '';
  form.estado_pago.value = c.estado_pago || 'Pendiente';
  form.fecha_vencimiento.value = c.fecha_vencimiento || '';
  form.descripcion.value = c.descripcion || '';
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

    const response = await apiFetch(API_COMPRAS + endpoint, fd);

    if (response.success || response.status === 'success') {
      showSuccess('Compra guardada correctamente');
      DraftManager.removeDraft('compras');
      setSelectValue(el('proveedor_id'), '');
      setSelectValue(el('cuenta_bancaria_id'), '');
      setSelectValue(el('forma_pago'), '');
      closeFicha();
      loadCompras();
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
  if (!currentCompra || !confirm('¿Eliminar este registro?')) return;

  try {
    const fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', currentCompra.id);
    fd.append('fuente', currentCompra.fuente || 'manual');
    const r = await apiFetch(API_COMPRAS, fd);
    if (r.success || r.status === 'success') {
      showSuccess('Eliminado');
      closeFicha();
      loadCompras();
    }
  } catch (error) {
    showError('Error al eliminar: ' + error.message);
  }
}

async function loadCompras(force = false) {
  try {
    const params = new URLSearchParams({
      page: currentPage.compras || 1,
      per_page: 20,
      search: el('searchInput')?.value || ''
    });
    const result = await fetch(`${API_COMPRAS}?${params}`).then(x => x.json());
    allCompras = result.data?.items || result.data || [];

    renderCardGrid(el('cardGrid'), allCompras, {
      renderCard: renderCompraCard,
      onClick: (item) => openFicha(item.id, item.fuente)
    });

    if (result.data?.total_pages > 1) {
      renderPagination('paginationContainer', result.data.total || 0, 20, currentPage.compras, (p) => { currentPage.compras = p; loadCompras(); });
    } else {
      el('paginationContainer').innerHTML = '';
    }
  } catch (error) {
    console.error('Error al cargar compras:', error);
    el('cardGrid').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>No se pudieron cargar las compras</p></div>';
  }
}

function renderCompraCard(c) {
  const fuente = c.fuente || 'manual';
  const isPagado = (c.estado_pago || '').toLowerCase() === 'pagado';

  const fuenteConfig = {
    manual:      { badge: '',                       grad: 'gradient-red',    icon: 'fa-cart-shopping' },
    rapida:      { badge: '<span class="badge badge-warning" style="font-size:0.65rem;">Rápida</span>',      grad: 'gradient-yellow', icon: 'fa-bolt' },
    pago_directo:{ badge: '<span class="badge badge-info" style="font-size:0.65rem;">Pago</span>',             grad: 'gradient-blue',   icon: 'fa-money-bill-wave' },
    pago_plazo:  { badge: '<span class="badge badge-purple" style="font-size:0.65rem;">Plazo</span>',         grad: 'gradient-purple', icon: 'fa-calendar-check' },
    orden_compra:{ badge: '<span class="badge badge-success" style="font-size:0.65rem;">OC</span>',            grad: 'gradient-green',  icon: 'fa-file-invoice' },
  };
  const cfg = fuenteConfig[fuente] || fuenteConfig.manual;

  const estadoBadge = isPagado ? '<span class="badge badge-success">Pagado</span>'
    : (c.estado_pago === 'Parcial' || c.estado_pago === 'Parcial') ? '<span class="badge badge-warning">Parcial</span>'
    : (c.estado_pago === 'Pendiente') ? '<span class="badge badge-danger">Pendiente</span>'
    : (c.estado_pago === 'Recibida') ? '<span class="badge badge-success">Recibida</span>'
    : (c.estado_pago === 'Cancelado') ? '<span class="badge badge-danger">Cancelado</span>'
    : '';

  return `
    <div class="card-inner">
      <div class="card-header">
        <div class="card-avatar ${cfg.grad}"><i class="fas ${cfg.icon}"></i></div>
        <div class="card-top-line"></div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(c.nombre || `EG-${c.id}`)}</h3>
        <p class="card-subtitle">${escapeHtml(c.proveedor_nombre || c.receptor || '—')}</p>
        <p class="card-subtitle" style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(c.descripcion || '')}</p>
        <div style="display:flex;gap:0.3rem;align-items:center;margin-top:0.3rem;">
          ${cfg.badge}
          ${estadoBadge}
        </div>
        <p class="card-subtitle" style="font-weight:700;color:var(--danger);margin-top:0.3rem;">${formatMoney(c.valor)}</p>
        <p style="font-size:0.72rem;color:var(--text-secondary);">${c.fecha || ''}</p>
      </div>
    </div>`;
}

function handleSearch() { clearTimeout(window._searchDebounce); window._searchDebounce = setTimeout(() => loadCompras(), 300); }

async function registrarPago(entidadTipo, entidadId) {
  const valor = el('valor')?.value;
  const fecha = el('fecha')?.value;
  const formaPago = el('forma_pago')?.value;
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
    fd.append('observacion', 'Pago registrado desde compras');
    const r = await apiFetch(API_COMPRAS, fd);
    if (r.success || r.status === 'success') {
      showSuccess('Pago registrado');
      openFicha(entidadId);
      loadCompras();
    } else {
      showError('Error: ' + r.message);
    }
  } catch(e) {
    showError('Error de conexión');
  }
}

async function loadExistingMedia() {
  if (!currentCompra) return;
  try {
    const fd = new FormData();
    fd.append('tabla', currentCompra.fuente === 'rapida' ? 'compras_rapidas' : 'compras');
    fd.append('registro_id', currentCompra.id);
    const res = await apiFetch(API_MULT, fd);
    currentCompraMultimedia = Array.isArray(res) ? (res[0]?.data || res) : (res.data || []);
    renderExistingMedia(currentCompraMultimedia, 'existingMediaContainer', 'existingMediaGrid', 'compras');
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

async function generateCompraPDF(compra) {
  const rid = compra.id || el('record_id').value;
  const flds = el('dataForm').querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=file]),select,textarea');
  let rows = '';
  flds.forEach(inp => {
    const lbl = inp.closest('.form-group')?.querySelector('label')?.textContent?.trim() || inp.name;
    const val = inp.tagName === 'SELECT' ? inp.options[inp.selectedIndex]?.text : inp.value;
    if (lbl && val) rows += `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;width:40%"><strong>${lbl}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${val}</td></tr>`;
  });
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Compras - Registro ${rid}</title>
<style>@page{size:letter;margin:0.5in;}body{font-family:Helvetica,Arial,sans-serif;padding:2rem;color:#333;margin:0;}
.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:1rem;margin-bottom:1.5rem;}
.header h1{margin:0;font-size:1.3rem;color:#1d4ed8;}
.header p{margin:2px 0;color:#666;font-size:0.8rem;}
table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;}
td{padding:6px 10px;border-bottom:1px solid #eee;}
.footer{text-align:center;color:#aaa;font-size:0.72rem;border-top:1px solid #eee;padding-top:1rem;margin-top:2rem;}</style></head><body>
<div class="header"><div><h1>Compras (Egresos)</h1><p>Registro N° ${rid} &bull; ${new Date().toLocaleDateString('es-CL')}</p></div></div>
<table>${rows}</table>
<div class="footer">Taller Figuetronic &bull; figuetronic.cl &bull; Generado: ${new Date().toLocaleString('es-CL')}</div>
</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}
