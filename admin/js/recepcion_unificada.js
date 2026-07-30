const API = API_ROOT + 'recepcion_unificada_api.php';
const API_CLIENTES = API_ROOT + 'clientes_api.php';
const API_VEHICULOS = API_ROOT + 'vehiculos_api.php';

let currentPage = 1, selectedId = null, allItems = [];
let currentStep = 0;
let selectedClienteId = null, selectedVehiculoId = null;
let firmaCanvas, firmaCtx, firmaDibujando = false;
let fotoCapturaActual = null;
const fotosCapturadas = {};

const PHOTO_FIELDS = [
    { field:'foto_frontal',      label:'Frontal',      icon:'fa-car-side', required:true },
    { field:'foto_trasera',      label:'Trasera',      icon:'fa-car-side', required:true },
    { field:'foto_lateral_izq',  label:'Lateral Izq',  icon:'fa-car-side', required:true },
    { field:'foto_lateral_der',  label:'Lateral Der',  icon:'fa-car-side', required:true },
    { field:'foto_superior',     label:'Superior',     icon:'fa-car-side', required:true },
    { field:'foto_motor',        label:'Motor',        icon:'fa-cogs',     required:false },
    { field:'foto_interior',     label:'Interior',     icon:'fa-chair',    required:false },
];

const INSPECTION_FIELDS = {
    exterior: [
        { name:'insp_pintura_frontal',     label:'Pintura Frontal' },
        { name:'insp_pintura_lateral_izq', label:'Pintura Lat. Izq.' },
        { name:'insp_pintura_lateral_der', label:'Pintura Lat. Der.' },
        { name:'insp_pintura_trasera',     label:'Pintura Trasera' },
        { name:'insp_pintura_techo',       label:'Pintura Techo' },
        { name:'insp_parabrisas_del',      label:'Parabrisas Del.' },
        { name:'insp_parabrisas_tras',     label:'Parabrisas Tras.' },
        { name:'insp_espejos',             label:'Espejos' },
        { name:'insp_focos_del',           label:'Focos Delanteros' },
        { name:'insp_focos_tras',          label:'Focos Traseros' },
        { name:'insp_parachoque_del',      label:'Parachoques Del.' },
        { name:'insp_parachoque_tras',     label:'Parachoques Tras.' },
        { name:'insp_neumaticos_del',      label:'Neumáticos Del.' },
        { name:'insp_neumaticos_tras',     label:'Neumáticos Tras.' },
    ],
    interior: [
        { name:'insp_tapiz_piloto',   label:'Tapiz Piloto' },
        { name:'insp_tapiz_copiloto', label:'Tapiz Copiloto' },
        { name:'insp_tapiz_trasero',  label:'Tapiz Trasero' },
        { name:'insp_alfombras',      label:'Alfombras' },
        { name:'insp_tablero',        label:'Tablero' },
        { name:'insp_cinturones',     label:'Cinturones' },
    ],
    motor: [
        { name:'insp_motor_enciende',     label:'Motor Enciende', type:'si_no' },
        { name:'insp_nivel_aceite',       label:'Nivel Aceite' },
        { name:'insp_nivel_refrigerante', label:'Nivel Refrigerante' },
        { name:'insp_bateria',            label:'Batería' },
        { name:'insp_correas',            label:'Correas' },
    ],
    seguridad: [
        { name:'insp_rueda_repuesto', label:'Rueda Repuesto', type:'si_no' },
        { name:'insp_gata',           label:'Gata / Llaves', type:'si_no' },
        { name:'insp_chaleco',        label:'Chaleco Reflectante', type:'si_no' },
        { name:'insp_triangulo',      label:'Triángulo', type:'si_no' },
        { name:'insp_botiquin',       label:'Botiquín', type:'si_no' },
        { name:'insp_extintor',       label:'Extintor', type:'si_no' },
    ]
};

const cardConfig = {
    titleField: 'vehiculo_patente',
    subtitleFields: [
        { field: 'folio', label: 'Folio' },
        { field: 'cliente_nombre', label: 'Cliente' },
        { field: 'fecha', label: 'Fecha' },
        { field: 'numero_orden_interna', label: 'Orden' },
    ],
    badgeField: (item) => ({
        text: item.eval_estado_general || 'Pendiente',
        color: item.eval_estado_general === 'Excelente' ? 'var(--success)' :
               item.eval_estado_general === 'Bueno' ? 'var(--primary)' :
               item.eval_estado_general === 'Regular' ? 'var(--warning)' : 'var(--text-secondary)'
    }),
    onClick: (item) => cargarRegistro(item.id),
    onEdit: (item) => cargarRegistro(item.id),
    onDelete: async (item) => {
        if (!confirm('¿Eliminar recepción?')) return;
        try {
            const fd = new FormData(); fd.append('action','delete'); fd.append('id',item.id);
            const r = await fetch(API, {method:'POST',body:fd});
            const d = await r.json();
            if (d.status === 'success') { showSuccess('Eliminado'); if (selectedId===item.id) resetForm(); await loadData(); }
            else showError(d.message);
        } catch(e) { showError('Error'); }
    }
};

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    buildInspectionGrids();
    buildPhotoGrid();
    initFirmaCanvas();
    // Sidebar toggle no longer needed — ficha completa pattern handles its own visibility
    // setupFormSidebarToggle('dataForm', 'formSidebar');

    await loadDynamicOptions('veh_marca', 'marca_vehiculo');
    await loadDynamicOptions('veh_color', 'color_vehiculo');
    await loadDynamicOptions('veh_combustible', 'combustible');
    await loadDynamicOptions('veh_transmision', 'transmision');
    await loadDynamicOptions('veh_traccion', 'traccion');
    await loadDynamicOptions('veh_tipo_carroceria', 'tipo_carroceria');
    await loadDynamicOptions('veh_procedencia', 'procedencia');
    await loadDynamicOptions('veh_disenoestructural', 'diseno_estructural');
    // Asesor: select dinámico desde empleados
    if (el('asesor_taller')) await loadLinkedSelect('asesor_taller', 'empleados');

    // ── RESTAURAR BORRADOR ──────────────────────────────────────────
    const draft = DraftManager.load('recepcion_unificada');
    if (draft && !draft._recordId) {
        DraftBanner.show('recepcion_unificada',
            () => {
                DraftManager.restoreForm(el('dataForm'), draft);
                if (draft._currentStep !== undefined) goToStep(parseInt(draft._currentStep));
                if (draft._inspectionValues) {
                    Object.entries(draft._inspectionValues).forEach(([name, val]) => {
                        const radio = document.querySelector(`input[name="${name}"][value="${val}"]`);
                        if (radio) radio.checked = true;
                    });
                }
            },
            () => { resetForm(); }
        );
    }

    loadData();
    setupReactiveRefresh(loadData);
    // Fallback: si por algún motivo la carga inicial no completó, reintentar tras 500ms
    setTimeout(function() {
        if (typeof loadData === 'function') {
            const grid = document.getElementById('cardGrid') || document.getElementById('otListBody');
            if (grid && (!grid.children || grid.children.length === 0) && (!grid.innerHTML || grid.innerHTML.trim() === '')) {
                console.warn('Retry loadData: lista vacía tras carga inicial');
                try { loadData(); } catch(e) { console.error(e); }
            }
        }
    }, 800);
    if (el('dataForm')) el('dataForm').addEventListener('submit', handleSubmit);
    if (el('btnNuevo')) el('btnNuevo').addEventListener('click', () => { DraftManager.clear('recepcion_unificada'); resetForm(); openFichaPanel('fichaContainer'); });
    if (el('btnEliminar')) el('btnEliminar').addEventListener('click', handleDelete);
    if (el('btnPdf')) el('btnPdf').addEventListener('click', generateRecepcionPDF);
    if (el('btnCloseMobile')) el('btnCloseMobile').addEventListener('click', () => closeFichaPanel('fichaContainer'));
    if (el('btnVolver')) el('btnVolver').addEventListener('click', () => { resetForm(true); });

    el('btnPrev').addEventListener('click', () => goToStep(currentStep - 1));
    el('btnNext').addEventListener('click', () => goToStep(currentStep + 1));
    el('btnGuardarFinal').addEventListener('click', (e) => { e.preventDefault(); handleSubmit(e); });

    document.querySelectorAll('.wizard-progress .step').forEach(step => {
        step.addEventListener('click', () => goToStep(parseInt(step.dataset.step)));
    });

    if (el('btnLimpiarFirma')) el('btnLimpiarFirma').addEventListener('click', clearFirma);

    // ── AUTO-GUARDADO ──────────────────────────────────────────────
    DraftManager.startAutoSave('recepcion_unificada', el('dataForm'), {
        get _currentStep() { return currentStep; },
        get _recordId() { return el('record_id')?.value || ''; },
        get _inspectionValues() {
            const vals = {};
            document.querySelectorAll('input[type="radio"]:checked').forEach(r => {
                if (r.name && r.name.startsWith('insp_')) vals[r.name] = r.value;
            });
            return vals;
        }
    });
    if (el('buscarCliente')) el('buscarCliente').addEventListener('input', debounce(buscarClientes, 300));
    if (el('buscarVehiculo')) el('buscarVehiculo').addEventListener('input', debounce(buscarVehiculos, 300));

    const si = el('searchInput');
    if (si) si.addEventListener('input', debounce(e => { currentPage=1; selectedId=null; loadData(1, e.target.value); }, 400));

    setupPhotoCapture();
    
    // ── SAFETY CHECK — Prevenir pantalla negra ──────────────────────
    setTimeout(() => {
        if (typeof ensureVisibility === 'function') ensureVisibility();
    }, 1500);
});

// ============================================================================
// INSPECTION GRIDS
// ============================================================================
function buildInspectionGrids() {
    Object.entries(INSPECTION_FIELDS).forEach(([section, fields]) => {
        const gridId = section === 'exterior' ? 'gridExterior' :
                       section === 'interior' ? 'gridInterior' :
                       section === 'motor' ? 'gridMotor' : 'gridSeguridad';
        const grid = el(gridId);
        if (!grid) return;
        grid.innerHTML = '';
        fields.forEach(f => {
            const isSiNo = f.type === 'si_no';
            const vals = isSiNo ? ['Sí','No'] : ['Bueno','Regular','Malo','N/A'];
            const div = document.createElement('div');
            div.className = 'inspection-item';
            div.innerHTML = `<label>${f.label}</label><div class="inspection-toggle">${vals.map(v => `<label><input type="radio" name="${f.name}" value="${v}"><span>${v}</span></label>`).join('')}</div>`;
            grid.appendChild(div);
        });
    });
}

// ============================================================================
// PHOTO GRID
// ============================================================================
function buildPhotoGrid() {
    const grid = el('photoGrid');
    if (!grid) return;
    grid.innerHTML = '';
    PHOTO_FIELDS.forEach(p => {
        const slot = document.createElement('div');
        slot.className = `photo-slot ${p.required ? 'required' : 'optional'}`;
        slot.dataset.field = p.field;
        slot.innerHTML = `
            <div class="photo-preview" id="prev_${p.field}"><i class="fas ${p.icon}"></i><span>${p.label}</span></div>
            <div class="photo-actions">
                <button type="button" class="btn-capture" data-capture="camera" data-field="${p.field}"><i class="fas fa-camera"></i> Cámara</button>
                <button type="button" class="btn-capture" data-capture="gallery" data-field="${p.field}"><i class="fas fa-image"></i> Galería</button>
            </div>`;
        grid.appendChild(slot);
    });
}

function setupPhotoCapture() {
    const inputCam = el('inputFotografia');
    const inputGal = el('inputGaleria');

    document.querySelectorAll('.btn-capture').forEach(btn => {
        btn.addEventListener('click', () => {
            fotoCapturaActual = btn.dataset.field;
            if (btn.dataset.capture === 'camera') {
                inputCam.setAttribute('capture', 'environment');
                inputCam.click();
            } else {
                inputGal.removeAttribute('capture');
                inputGal.click();
            }
        });
    });

    [inputCam, inputGal].forEach(input => {
        input.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file || !fotoCapturaActual) return;
            const compressed = await compressImage(file, 1920, 0.7);
            const reader = new FileReader();
            reader.onload = (ev) => {
                fotosCapturadas[fotoCapturaActual] = ev.target.result;
                const prev = el(`prev_${fotoCapturaActual}`);
                if (prev) { prev.innerHTML = `<img src="${ev.target.result}" alt="${fotoCapturaActual}">`; }
                updatePhotoProgress();
            };
            reader.readAsDataURL(compressed);
            input.value = '';
        });
    });
}

function compressImage(file, maxWidth = 1920, quality = 0.7) {
    return new Promise(resolve => {
        if (!file.type.startsWith('image/') || file.size < 200000) { resolve(file); return; }
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => {
                if (blob) {
                    const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(compressed);
                } else { resolve(file); }
            }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
    });
}

function updatePhotoProgress() {
    const total = PHOTO_FIELDS.filter(p => p.required).length;
    const done = PHOTO_FIELDS.filter(p => p.required && fotosCapturadas[p.field]).length;
    const pct = total ? (done / total * 100) : 0;
    const fill = el('photoProgressFill');
    const txt = el('photoProgressText');
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = `${done} de ${total} obligatorias`;
}

// ============================================================================
// FIRM A CANVAS
// ============================================================================
function initFirmaCanvas() {
    firmaCanvas = el('canvasFirma');
    if (!firmaCanvas) return;
    firmaCtx = firmaCanvas.getContext('2d');
    firmaCtx.lineWidth = 2;
    firmaCtx.strokeStyle = '#1e3c72';
    firmaCtx.lineCap = 'round';

    const getPos = (e) => {
        const r = firmaCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - r.left, y: clientY - r.top };
    };

    firmaCanvas.addEventListener('mousedown', (e) => { firmaDibujando = true; const p = getPos(e); firmaCtx.beginPath(); firmaCtx.moveTo(p.x, p.y); });
    firmaCanvas.addEventListener('mousemove', (e) => { if (!firmaDibujando) return; const p = getPos(e); firmaCtx.lineTo(p.x, p.y); firmaCtx.stroke(); });
    firmaCanvas.addEventListener('mouseup', () => { firmaDibujando = false; _guardarFirmaEnBuffer(); });
    firmaCanvas.addEventListener('mouseleave', () => { firmaDibujando = false; });
    firmaCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); firmaDibujando = true; const p = getPos(e); firmaCtx.beginPath(); firmaCtx.moveTo(p.x, p.y); });
    firmaCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!firmaDibujando) return; const p = getPos(e); firmaCtx.lineTo(p.x, p.y); firmaCtx.stroke(); });
    firmaCanvas.addEventListener('touchend', () => { firmaDibujando = false; _guardarFirmaEnBuffer(); });
}

let _firmaBlob = null;
function _guardarFirmaEnBuffer() {
    if (!firmaCanvas) return;
    firmaCanvas.toBlob(function(blob) { _firmaBlob = blob; }, 'image/png');
}

function clearFirma() {
    if (!firmaCtx) return;
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
    _firmaBlob = null;
    el('eval_firma_cliente').value = '';
}

// ============================================================================
// WIZARD NAVIGATION
// ============================================================================
function goToStep(step) {
    if (step < 0 || step > 4) return;

    if (step > currentStep) {
        if (currentStep === 0) {
            const nombre = el('cli_nombre')?.value?.trim();
            const telefono = el('cli_telefono')?.value?.trim();
            if (!nombre || !telefono) { showError('Nombre y teléfono del cliente son requeridos'); return; }
        }
        if (currentStep === 3) {
            const required = PHOTO_FIELDS.filter(p => p.required);
            const missing = required.filter(p => !fotosCapturadas[p.field]);
            if (missing.length > 0) { showError(`Faltan ${missing.length} fotos obligatorias`); return; }
        }
    }

    currentStep = step;

    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    const target = document.querySelector(`.step-panel[data-step="${step}"]`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.wizard-progress .step').forEach(s => {
        const sStep = parseInt(s.dataset.step);
        s.classList.remove('active', 'done');
        if (sStep === step) s.classList.add('active');
        else if (sStep < step) s.classList.add('done');
    });

    el('btnPrev').style.display = step === 0 ? 'none' : 'inline-flex';
    el('btnNext').style.display = step < 4 ? 'inline-flex' : 'none';
    el('btnGuardarFinal').style.display = step === 4 ? 'inline-flex' : 'none';
}

// ============================================================================
// CLIENT SEARCH (typeahead)
// ============================================================================
async function buscarClientes(e) {
    const q = e.target.value.trim();
    const results = el('resultadosCliente');
    if (q.length < 2) { results.style.display = 'none'; return; }
    try {
        const res = await fetch(`${API_CLIENTES}?search=${encodeURIComponent(q)}&per_page=5`);
        const data = await res.json();
        results.innerHTML = '';
        if (data.status === 'success' && data.data.items?.length) {
            data.data.items.forEach(c => {
                const div = document.createElement('div');
                div.textContent = `${c.nombre} ${c.apellido || ''} — ${c.rut || ''} — ${c.telefono || ''}`;
                div.addEventListener('click', () => {
                    selectedClienteId = c.id;
                    el('cliente_id').value = c.id;
                    el('cli_nombre').value = c.nombre || '';
                    el('cli_apellido').value = c.apellido || '';
                    el('cli_telefono').value = c.telefono || '';
                    el('cli_rut').value = c.rut || '';
                    el('cli_correo').value = c.correo || '';
                    el('cli_domicilio').value = c.domicilio || '';
                    el('buscarCliente').value = '';
                    results.style.display = 'none';
                    showSuccess('Cliente cargado');
                    cargarVehiculosDelCliente(c.id);
                });
                results.appendChild(div);
            });
            results.style.display = 'block';
        } else {
            results.innerHTML = '<div>Sin resultados — continúe para crear nuevo</div>';
            results.style.display = 'block';
        }
    } catch(err) { console.error(err); }
}

// ============================================================================
// AUTO-FILL VEHÍCULOS AL SELECCIONAR CLIENTE
// ============================================================================
async function cargarVehiculosDelCliente(clienteId) {
    if (!clienteId) return;
    try {
        const res = await fetch(`${API_CLIENTES}?action=vehiculos&id=${clienteId}`);
        const data = await res.json();
        if (data.status !== 'success' || !data.data?.length) {
            showToast('El cliente seleccionado no tiene vehículos asignados.', 'warning');
            return;
        }
        const vehiculos = data.data;
        if (vehiculos.length === 1) {
            await aplicarDatosVehiculo(vehiculos[0]);
            showSuccess(`Vehículo auto-cargado: ${vehiculos[0].marca} ${vehiculos[0].modelo} (${vehiculos[0].patente})`);
        } else {
            mostrarSelectorVehiculos(vehiculos);
            showSuccess(`Se encontraron ${vehiculos.length} vehículos. Seleccione uno.`);
            setTimeout(() => {
                const stepVehiculo = document.querySelector('.wizard-nav .wizard-step[data-step="2"]');
                if(stepVehiculo && !stepVehiculo.classList.contains('active')) {
                    stepVehiculo.click();
                }
            }, 500);
        }
    } catch(err) { console.error('Error al cargar vehículos del cliente:', err); }
}

async function aplicarDatosVehiculo(v) {
    selectedVehiculoId = v.id;
    el('vehiculo_id').value = v.id;
    el('veh_patente').value = v.patente || '';
    await loadDynamicOptions('veh_marca', 'marca_vehiculo', v.marca);
    el('veh_modelo').value = v.modelo || '';
    el('veh_anio').value = v.anio || '';
    await loadDynamicOptions('veh_color', 'color_vehiculo', v.color);
    await loadDynamicOptions('veh_combustible', 'combustible', v.combustible);
    el('veh_vin').value = v.vin || '';
    el('veh_kilometraje').value = v.kilometraje || '';
    if (v.cilindrada_motor !== undefined) el('veh_cilindrada_motor').value = v.cilindrada_motor || '';
    if (v.transmision !== undefined) await loadDynamicOptions('veh_transmision', 'transmision', v.transmision);
    if (v.traccion !== undefined) await loadDynamicOptions('veh_traccion', 'traccion', v.traccion);
    if (v.tipo_carroceria !== undefined) await loadDynamicOptions('veh_tipo_carroceria', 'tipo_carroceria', v.tipo_carroceria);
    if (v.procedencia !== undefined) await loadDynamicOptions('veh_procedencia', 'procedencia', v.procedencia);
    if (v.disenoestructural !== undefined) await loadDynamicOptions('veh_disenoestructural', 'diseno_estructural', v.disenoestructural);
    if (v.notas_tecnico !== undefined) el('veh_notas_tecnico').value = v.notas_tecnico || '';
}

function mostrarSelectorVehiculos(vehiculos) {
    const results = el('resultadosVehiculo');
    const buscar = el('buscarVehiculo');
    if (!results || !buscar) return;
    results.innerHTML = '';
    const header = document.createElement('div');
    header.style.cssText = 'padding:0.5rem 0.8rem;font-size:0.75rem;color:var(--text-secondary);font-weight:600;background:rgba(0,0,0,0.08);';
    header.textContent = `Vehículos de este cliente (${vehiculos.length}):`;
    results.appendChild(header);
    vehiculos.forEach(v => {
        const div = document.createElement('div');
        div.textContent = `${v.marca} ${v.modelo} — ${v.patente} — ${v.anio || 'S/A'}`;
        div.addEventListener('click', async () => {
            await aplicarDatosVehiculo(v);
            buscar.value = '';
            results.style.display = 'none';
            showSuccess('Vehículo cargado: ' + v.patente);
        });
        results.appendChild(div);
    });
    results.style.display = 'block';
    const hideHandler = (e) => {
        if (!results.contains(e.target) && e.target !== buscar) {
            results.style.display = 'none';
            document.removeEventListener('click', hideHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', hideHandler), 0);
}

// ============================================================================
// VEHICLE SEARCH (typeahead)
// ============================================================================
async function buscarVehiculos(e) {
    const q = e.target.value.trim();
    const results = el('resultadosVehiculo');
    if (q.length < 2) { results.style.display = 'none'; return; }
    try {
        const res = await fetch(`${API_VEHICULOS}?search=${encodeURIComponent(q)}&per_page=5`);
        const data = await res.json();
        results.innerHTML = '';
        if (data.status === 'success' && data.data.items?.length) {
            data.data.items.forEach(v => {
                const div = document.createElement('div');
                div.textContent = `${v.marca} ${v.modelo} — ${v.patente} — ${v.cliente_nombre || ''}`;
                div.addEventListener('click', () => {
                    selectedVehiculoId = v.id;
                    el('vehiculo_id').value = v.id;
                    el('veh_patente').value = v.patente || '';
                    el('veh_marca').value = v.marca || '';
                    el('veh_modelo').value = v.modelo || '';
                    el('veh_anio').value = v.anio || '';
                    el('veh_color').value = v.color || '';
                    el('veh_combustible').value = v.combustible || '';
                    el('veh_vin').value = v.vin || '';
                    el('veh_kilometraje').value = v.kilometraje || '';
                    el('veh_cilindrada_motor').value = v.cilindrada_motor || '';
                    el('veh_transmision').value = v.transmision || '';
                    el('veh_traccion').value = v.traccion || '';
                    el('veh_tipo_carroceria').value = v.tipo_carroceria || '';
                    el('veh_procedencia').value = v.procedencia || '';
                    el('veh_disenoestructural').value = v.disenoestructural || '';
                    el('veh_notas_tecnico').value = v.notas_tecnico || '';
                    el('buscarVehiculo').value = '';
                    results.style.display = 'none';
                    showSuccess('Vehículo cargado');
                });
                results.appendChild(div);
            });
            results.style.display = 'block';
        } else {
            results.innerHTML = '<div>Sin resultados — continúe para crear nuevo</div>';
            results.style.display = 'block';
        }
    } catch(err) { console.error(err); }
}

// ============================================================================
// LOAD DATA
// ============================================================================
async function loadData(page = 1, search = '') {
    currentPage = page;
    try {
        const r = await fetch(`${API}?page=${page}&search=${encodeURIComponent(search)}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success') {
            allItems = d.data.items || [];
            const cfg = { ...cardConfig, selectedId };
            if (!UIController.canModule('recepcion', 'eliminar')) delete cfg.onDelete;
            renderCardGrid(el('cardGrid'), allItems, cfg);
            if (d.data?.total) renderPagination('paginationContainer', d.data.total, d.data.per_page, d.data.page, 'cambiarPagina');
            // ── PERF: Lazy loading ─────────────────────────────────
            setTimeout(() => { if (typeof initLazyLoading === 'function') initLazyLoading(); }, 100);
        }
    } catch(e) { console.error(e); }
}
function cambiarPagina(page) { loadData(page, el('searchInput')?.value || ''); }

// ============================================================================
// LOAD RECORD
// ============================================================================
async function cargarRegistro(id) {
    resetForm(false);
    selectedId = id;
    openFichaPanel('fichaContainer');
    try {
        const r = await fetch(`${API}?id=${id}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') return showError(d.message);
        const rec = d.data;
        el('record_id').value = rec.id || '';
        el('cliente_id').value = rec.cliente_id || '';
        el('vehiculo_id').value = rec.vehiculo_id || '';
        selectedClienteId = rec.cliente_id;
        selectedVehiculoId = rec.vehiculo_id;

        // Paso 0: Cliente
        el('cli_nombre').value = rec.cliente_nombre || '';
        el('cli_apellido').value = rec.cliente_apellido || '';
        el('cli_telefono').value = rec.cliente_telefono || '';
        el('cli_rut').value = rec.cliente_rut || '';
        el('cli_correo').value = rec.cliente_correo || '';
        el('cli_domicilio').value = rec.cliente_domicilio || '';

        // Paso 1: Vehículo
        el('veh_patente').value = rec.vehiculo_patente || '';
        await loadDynamicOptions('veh_marca', 'marca_vehiculo', rec.vehiculo_marca);
        await loadDynamicOptions('veh_color', 'color_vehiculo', rec.vehiculo_color);
        await loadDynamicOptions('veh_combustible', 'combustible', rec.vehiculo_combustible);
        await loadDynamicOptions('veh_transmision', 'transmision', rec.vehiculo_transmision);
        await loadDynamicOptions('veh_traccion', 'traccion', rec.vehiculo_traccion);
        await loadDynamicOptions('veh_tipo_carroceria', 'tipo_carroceria', rec.vehiculo_tipo_carroceria);
        await loadDynamicOptions('veh_procedencia', 'procedencia', rec.vehiculo_procedencia);
        await loadDynamicOptions('veh_disenoestructural', 'diseno_estructural', rec.vehiculo_disenoestructural);
        el('veh_modelo').value = rec.vehiculo_modelo || '';
        el('veh_anio').value = rec.vehiculo_anio || '';
        el('veh_vin').value = rec.vehiculo_vin || '';
        el('veh_kilometraje').value = rec.vehiculo_kilometraje || '';
        el('veh_cilindrada_motor').value = rec.vehiculo_cilindrada_motor || '';
        el('veh_notas_tecnico').value = rec.vehiculo_notas_tecnico || '';

        // Paso 2: Inspección
        Object.values(INSPECTION_FIELDS).flat().forEach(f => {
            const val = rec[f.name];
            if (val) {
                const radio = document.querySelector(`input[name="${f.name}"][value="${val}"]`);
                if (radio) radio.checked = true;
            }
        });
        if (rec.insp_ralladuras) document.querySelector('textarea[name="insp_ralladuras"]').value = rec.insp_ralladuras;
        if (rec.insp_abollones) document.querySelector('textarea[name="insp_abollones"]').value = rec.insp_abollones;
        if (rec.insp_observaciones_generales) document.querySelector('textarea[name="insp_observaciones_generales"]').value = rec.insp_observaciones_generales;

        // Setup field voice notes for text fields
        if (typeof setupFieldVoiceNote === 'function') {
            setupFieldVoiceNote({ textareaId: 'cli_domicilio', label: 'Domicilio Cliente', entidadTipo: 'recepcion_unificada' });
            setupFieldVoiceNote({ textareaId: 'veh_notas_tecnico', label: 'Notas Técnicas Vehículo', entidadTipo: 'recepcion_unificada' });
            setupFieldVoiceNote({ textareaId: 'insp_ralladuras', label: 'Ralladuras', entidadTipo: 'recepcion_unificada' });
            setupFieldVoiceNote({ textareaId: 'insp_abollones', label: 'Abollones', entidadTipo: 'recepcion_unificada' });
            setupFieldVoiceNote({ textareaId: 'insp_observaciones_generales', label: 'Observaciones Generales', entidadTipo: 'recepcion_unificada' });
            setupFieldVoiceNote({ textareaId: 'eval_motivo_visita', label: 'Motivo de Visita', entidadTipo: 'recepcion_unificada' });
            loadFieldVoiceNotes(rec.id, 'recepcion_unificada', 'cli_domicilio', 'voice-list-cli_domicilio');
            loadFieldVoiceNotes(rec.id, 'recepcion_unificada', 'veh_notas_tecnico', 'voice-list-veh_notas_tecnico');
            loadFieldVoiceNotes(rec.id, 'recepcion_unificada', 'insp_ralladuras', 'voice-list-insp_ralladuras');
            loadFieldVoiceNotes(rec.id, 'recepcion_unificada', 'insp_abollones', 'voice-list-insp_abollones');
            loadFieldVoiceNotes(rec.id, 'recepcion_unificada', 'insp_observaciones_generales', 'voice-list-insp_observaciones_generales');
            loadFieldVoiceNotes(rec.id, 'recepcion_unificada', 'eval_motivo_visita', 'voice-list-eval_motivo_visita');
        }

        // Paso 3: Fotos
        PHOTO_FIELDS.forEach(p => {
            const val = rec[p.field];
            if (val) {
                fotosCapturadas[p.field] = val;
                const prev = el(`prev_${p.field}`);
                if (prev) prev.innerHTML = `<img src="${val}" alt="${p.label}">`;
            }
        });
        updatePhotoProgress();

        // Paso 4: Evaluación
        if (rec.folio) el('folio').value = rec.folio;
        if (rec.eval_estado_general) el('eval_estado_general').value = rec.eval_estado_general;
        document.querySelector('input[name="numero_orden_interna"]').value = rec.numero_orden_interna || '';
        if (el('asesor_taller')) el('asesor_taller').value = rec.asesor_taller || '';
        document.querySelector('input[name="forma_llegada"]').value = rec.forma_llegada || '';
        document.querySelector('textarea[name="eval_motivo_visita"]').value = rec.eval_motivo_visita || '';
        if (el('alerta_pernos_rodados')) el('alerta_pernos_rodados').checked = !!Number(rec.alerta_pernos_rodados);
        if (el('alerta_falla_red')) el('alerta_falla_red').checked = !!Number(rec.alerta_falla_red);
        if (rec.eval_firma_cliente) {
            const img = new Image();
            img.onload = () => firmaCtx.drawImage(img, 0, 0, firmaCanvas.width, firmaCanvas.height);
            img.src = rec.eval_firma_cliente;
        }

        el('fichaTitle').textContent = 'Recepción #' + rec.id;
        el('fichaSub').textContent = `${rec.cliente_nombre || 'Sin cliente'} — ${rec.vehiculo_patente || 'Sin vehículo'}`;
        if (UIController.canModule('recepcion', 'eliminar')) el('btnEliminar').style.display = 'inline-flex';
        if (el('btnPdf')) el('btnPdf').style.display = 'inline-flex';
        if (el('btnVerCliente') && (rec.cliente_id || selectedClienteId)) el('btnVerCliente').style.display = 'inline-flex';
        // Show "Crear OT" button if no OT exists for this reception
        if (el('btnCrearOT')) {
            try {
                const chk = await fetch(API_ROOT + 'ordenes_trabajo_api.php?action=check_by_recepcion&recepcion_id=' + rec.id);
                const chkD = await chk.json();
                el('btnCrearOT').style.display = (chkD.status === 'success' && !chkD.data?.exists) ? 'inline-flex' : 'none';
            } catch(e) { el('btnCrearOT').style.display = 'inline-flex'; }
        }
        // Show "Derivar a Desarme" button if no desarme exists for this reception
        if (el('btnDerivarDesarme')) {
            try {
                const chkDes = await fetch(API_ROOT + 'desarme_automotriz_api.php?action=check_by_recepcion&recepcion_id=' + rec.id);
                const chkDesD = await chkDes.json();
                el('btnDerivarDesarme').style.display = (chkDesD.status === 'success' && !chkDesD.data?.exists) ? 'inline-flex' : 'none';
            } catch(e) { el('btnDerivarDesarme').style.display = 'inline-flex'; }
        }
        (el('cardGrid')?.querySelectorAll('.record-card')||[]).forEach((c,i) => c.classList.toggle('selected', allItems[i] && String(allItems[i].id)===String(id)));
        goToStep(0);
    } catch(e) { console.error(e); showError('Error al cargar'); }
}

// ============================================================================
// CREAR OT DESDE RECEPCIÓN
// ============================================================================
async function crearOTdesdeRecepcionById(recepcionId) {
    try {
        const fd = new FormData();
        fd.append('action', 'crear_ot_desde_recepcion');
        fd.append('recepcion_id', recepcionId);
        const d = await apiFetch(API_ROOT + 'ordenes_trabajo_api.php', fd);
        if (d.status === 'success') {
            showSuccess('OT #' + d.data.id + ' creada exitosamente');
            window.open('ordenes_trabajo.html?selected=' + d.data.id, '_blank');
        } else showError(d.message);
    } catch(e) { showError('Error: ' + e.message); }
}

async function crearOTdesdeRecepcion() {
    const id = el('record_id')?.value;
    if (!id) { showError('Seleccione una recepción'); return; }
    if (!confirm('¿Crear una Orden de Trabajo para esta recepción?')) return;
    const btn = el('btnCrearOT');
    setButtonLoading(btn, true, 'Creando OT...');
    try {
        const fd = new FormData();
        fd.append('action', 'crear_ot_desde_recepcion');
        fd.append('recepcion_id', id);
        const d = await apiFetch(API_ROOT + 'ordenes_trabajo_api.php', fd);
        if (d.status === 'success') {
            showSuccess('OT #' + d.data.id + ' creada exitosamente');
            el('btnCrearOT').style.display = 'none';
            window.open('ordenes_trabajo.html?selected=' + d.data.id, '_blank');
        } else showError(d.message);
    } catch(e) { showError('Error: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// DERIVAR A DESARRE
// ============================================================================
async function derivarADesarme() {
    const recepcionId = el('record_id')?.value;
    if (!recepcionId) { showError('Seleccione una recepción primero'); return; }
    if (!confirm('¿Derivar esta recepción a Desarme Automotriz? Se creará una OT de desarme automáticamente.')) return;

    const btn = el('btnDerivarDesarme');
    setButtonLoading(btn, true, 'Derivando...');
    try {
        const fd = new FormData();
        fd.append('action', 'create_from_recepcion');
        fd.append('recepcion_id', recepcionId);
        const d = await apiFetch(API_ROOT + 'desarme_automotriz_api.php', fd);
        if (d.status === 'success') {
            showSuccess('Desarme #' + d.data.folio + ' creado exitosamente');
            window.open('desarme_automotriz.html?selected=' + d.data.id, '_blank');
        } else showError(d.message);
    } catch(e) { showError('Error al derivar a desarme: ' + e.message); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// SUBMIT
// ============================================================================
async function handleSubmit(e) {
    e.preventDefault();
    const btn = el('btnGuardarFinal') || el('btnSave');
    setButtonLoading(btn, true, 'Guardando...');
    const fd = new FormData(el('dataForm'));

    // Agregar inspección
    Object.values(INSPECTION_FIELDS).flat().forEach(f => {
        const checked = document.querySelector(`input[name="${f.name}"]:checked`);
        fd.set(f.name, checked ? checked.value : 'N/A');
    });

    // Agregar checkboxes de alerta (solo se envían cuando están marcados)
    fd.set('alerta_pernos_rodados', el('alerta_pernos_rodados')?.checked ? '1' : '0');
    fd.set('alerta_falla_red', el('alerta_falla_red')?.checked ? '1' : '0');

    // Agregar fotos como base64
    PHOTO_FIELDS.forEach(p => {
        if (fotosCapturadas[p.field]) fd.set(p.field, fotosCapturadas[p.field]);
    });

    // Enviar firma como archivo (no base64 inline)
    if (_firmaBlob) {
        fd.append('firma_archivo', _firmaBlob, 'firma_' + Date.now() + '.png');
        fd.delete('eval_firma_cliente');
    }

    try {
        const d = await uploadWithProgress(API, fd);
        if (d.status === 'success') {
            DraftManager.clear('recepcion_unificada');
            await loadData();
            const recId = d.data?.id || fd.get('id');
            const esEdicion = fd.get('id');
            if (recId && !esEdicion) {
                showSuccess('Recepción guardada. La recepción está abierta y lista para crear una OT.');
                if (confirm('Recepción #' + recId + ' creada exitosamente.\n\n¿Desea crear una Orden de Trabajo ahora?')) {
                    crearOTdesdeRecepcionById(recId);
                    return;
                }
            } else {
                showSuccess(d.message || 'Recepción actualizada');
            }
            resetForm();
        }
        else showError(d.message);
    } catch(e) { showError('Error de conexión'); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// DELETE
// ============================================================================
async function handleDelete() {
    const id = el('record_id')?.value;
    if (!id || !confirm('¿Eliminar recepción?')) return;
    const btn = el('btnEliminar');
    setButtonLoading(btn, true, 'Eliminando...');
    try {
        const fd = new FormData(); fd.append('action','delete'); fd.append('id',id);
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showSuccess('Eliminado'); selectedId=null; await loadData(); resetForm(); }
        else showError(d.message);
    } catch(e) { showError('Error'); }
    finally { setButtonLoading(btn, false); }
}

// ============================================================================
// RESET
// ============================================================================
function resetForm(clear = true) {
    DraftManager.clear('recepcion_unificada');
    el('dataForm').reset();
    selectedClienteId = null;
    selectedVehiculoId = null;
    el('cliente_id').value = '';
    el('vehiculo_id').value = '';
    Object.keys(fotosCapturadas).forEach(k => delete fotosCapturadas[k]);
    PHOTO_FIELDS.forEach(p => {
        const prev = el(`prev_${p.field}`);
        if (prev) prev.innerHTML = `<i class="fas ${p.field.includes('motor') ? 'fa-cogs' : p.field.includes('interior') ? 'fa-chair' : 'fa-car-side'}"></i><span>${PHOTO_FIELDS.find(x=>x.field===p.field).label}</span>`;
    });
    updatePhotoProgress();
    clearFirma();
    Object.values(INSPECTION_FIELDS).flat().forEach(f => {
        document.querySelectorAll(`input[name="${f.name}"]`).forEach(r => r.checked = false);
    });
    document.querySelectorAll('.form-grid textarea').forEach(t => t.value = '');
    if (clear) {
        el('fichaTitle').textContent = 'Nueva Recepción';
        el('fichaSub').textContent = 'Complete los pasos del wizard para registrar la recepción';
        selectedId = null;
        el('cardGrid')?.querySelectorAll('.record-card').forEach(c => c.classList.remove('selected'));
        closeFichaPanel('fichaContainer');
    }
    el('btnEliminar').style.display = 'none';
    if (el('btnPdf')) el('btnPdf').style.display = 'none';
    if (el('btnVerCliente')) el('btnVerCliente').style.display = 'none';
    if (el('btnCrearOT')) el('btnCrearOT').style.display = 'none';
    if (el('btnDerivarDesarme')) el('btnDerivarDesarme').style.display = 'none';
    if (el('folio')) {
        el('folio').setAttribute('readonly', 'readonly');
        el('folio').style.backgroundColor = 'rgba(0,0,0,0.1)';
        el('folio').value = '(Generado automáticamente)';
    }
    goToStep(0);
}

// ============================================================================
// PDF
// ============================================================================
function generateRecepcionPDF() {
    const id = el('record_id')?.value;
    if (!id) return showError('Seleccione una recepción');
    if (typeof generateRecepcionUnificadaPDF === 'function') {
        generateRecepcionUnificadaPDF(id);
    } else {
        showError('Generador PDF no disponible');
    }
}

// ── Link a Ficha del Cliente ─────────────────────────────────────────────────
function openClienteFicha() {
    const clienteId = el('cliente_id')?.value || selectedClienteId;
    if (!clienteId) { showError('No hay cliente asociado a esta recepción'); return; }
    window.open(`clientes.html?id=${clienteId}`, '_blank');
}
