// agenda_taller.js — Agenda del Taller: gestión interna de slots y visitas
const API = API_ROOT + 'agenda_api.php';
const esc = escapeHtml;

let currentYear, currentMonth;
let selectedDate = null;
let calendarSlots = [];
let resumenData = null;
let daySlots = [];

function getDayName(dayNum) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayNum] || '';
}
function getMonthName(monthNum) {
    const months = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[monthNum] || '';
}
function padZero(n) { return n < 10 ? '0' + n : String(n); }
function formatDate(d) {
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}
function formatTimeRange(start, end) {
    if (!start) return '';
    const s = start.substring(0, 5);
    const e = end ? end.substring(0, 5) : '';
    return s + (e ? ' - ' + e : '');
}
function getSlotStatusBadge(estado) {
    const map = { 'disponible': 'disponible', 'reservado': 'reservado', 'confirmado': 'confirmado', 'cancelado': 'cancelado' };
    const cls = map[estado] || 'disponible';
    return `<span class="slot-status ${cls}">${esc(estado || 'disponible')}</span>`;
}

// ── DOMContentLoaded ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;

    el('btnPrevMonth')?.addEventListener('click', () => changeMonth(-1));
    el('btnNextMonth')?.addEventListener('click', () => changeMonth(1));
    el('btnGenerarSlots')?.addEventListener('click', () => generarSlots());
    el('btnNuevaVisita')?.addEventListener('click', () => openNuevaVisitaModal());
    el('btnCerrarNuevaVisita')?.addEventListener('click', () => closeModalOverlay('modalNuevaVisita'));
    el('btnCerrarAsignar')?.addEventListener('click', () => closeModalOverlay('modalAsignarSolicitud'));
    el('btnCerrarDetalle')?.addEventListener('click', () => closeModalOverlay('modalDetalleSolicitud'));
    el('btnCloseDayDetail')?.addEventListener('click', hideDayDetail);

    // Solicitudes toggle
    el('solicitudesHeader')?.addEventListener('click', () => {
        el('solicitudesHeader')?.classList.toggle('collapsed');
        el('solicitudesBody')?.classList.toggle('collapsed');
    });

    // Create visita dia
    el('btnCrearVisitaDia')?.addEventListener('click', () => {
        if (selectedDate) openNuevaVisitaModal(selectedDate);
    });

    // Calendar day click (delegated)
    el('calendarGrid')?.addEventListener('click', (e) => {
        const dayCell = e.target.closest('.calendar-day[data-fecha]');
        if (dayCell?.dataset.fecha) selectDay(dayCell.dataset.fecha);
    });

    // Close day detail overlay on background click
    el('dayDetailOverlay')?.addEventListener('click', (e) => {
        if (e.target === el('dayDetailOverlay')) hideDayDetail();
    });

    // Form nueva visita
    el('formNuevaVisita')?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitNuevaVisita();
    });
    el('visitaCliente')?.addEventListener('change', () => {
        loadVehiculoCliente(el('visitaCliente').value);
    });

    // Assign solicitud
    el('btnConfirmarAsignar')?.addEventListener('click', () => submitAsignarSolicitud());
    el('asignarFecha')?.addEventListener('change', () => loadAsignarSlots());

    loadResumen();
    loadCalendar();
    loadSolicitudes();

    setupReactiveRefresh(() => {
        loadResumen();
        loadCalendar();
        if (selectedDate) selectDay(selectedDate);
        loadSolicitudes();
    });
});

// ── Month navigation ───────────────────────────────────────────────────────
function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    selectedDate = null;
    hideDayDetail();
    loadCalendar();
}

// ── loadResumen ────────────────────────────────────────────────────────────
async function loadResumen() {
    try {
        const res = await fetch(API + '?action=resumen');
        const json = await res.json();
        if (json.data) {
            resumenData = json.data;
            const set = (id, v) => { const e = el(id); if (e) e.textContent = v ?? 0; };
            set('kpiSlotsHoy', json.data.slots_hoy);
            set('kpiDisponiblesHoy', json.data.disponibles_hoy);
            set('kpiSolicitudes', json.data.solicitudes_pendientes);
            set('kpiVisitasSemana', json.data.visitas_semana);
            const badge = el('badgeSolicitudes');
            if (badge) badge.textContent = json.data.solicitudes_pendientes ?? 0;
        }
    } catch (err) { console.error('loadResumen:', err); }
}

// ── loadCalendar ───────────────────────────────────────────────────────────
async function loadCalendar() {
    try {
        const res = await fetch(`${API}?action=calendario&year=${currentYear}&month=${currentMonth}`);
        const json = await res.json();
        calendarSlots = (Array.isArray(json.data)) ? json.data : [];

        const titleEl = el('monthLabel');
        if (titleEl) titleEl.textContent = `${getMonthName(currentMonth)} ${currentYear}`;

        renderCalendarGrid();
    } catch (err) { console.error('loadCalendar:', err); }
}

function renderCalendarGrid() {
    const grid = el('calendarGrid');
    if (!grid) return;

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const startDow = firstDay.getDay();
    const startIdx = startDow === 0 ? 6 : startDow - 1;

    const todayStr = formatDate(new Date());

    const statsByDate = {};
    calendarSlots.forEach(s => {
        if (!statsByDate[s.fecha]) statsByDate[s.fecha] = { disponibles: 0, ocupados: 0 };
        if (s.estado === 'disponible') statsByDate[s.fecha].disponibles++;
        else statsByDate[s.fecha].ocupados++;
    });

    let html = '';

    for (let i = 0; i < startIdx; i++) {
        html += '<div class="calendar-day other-month"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const fecha = `${currentYear}-${padZero(currentMonth)}-${padZero(d)}`;
        const isToday = fecha === todayStr;
        const isSelected = fecha === selectedDate;
        const st = statsByDate[fecha] || { disponibles: 0, ocupados: 0 };
        const total = st.disponibles + st.ocupados;
        const dimmed = total === 0;

        let cls = 'calendar-day';
        if (isToday) cls += ' today';
        if (isSelected) cls += ' selected';
        if (dimmed) cls += ' dimmed';

        let badges = '';
        if (st.disponibles > 0) badges += `<span class="day-slots" style="background:rgba(52,199,89,.12);color:var(--success)">${st.disponibles}</span>`;
        if (st.ocupados > 0) badges += `<span class="day-slots" style="background:rgba(75,123,236,.12);color:var(--primary)">${st.ocupados}</span>`;

        html += `<div class="${cls}" data-fecha="${fecha}">`;
        html += `<span class="day-number">${d}</span>`;
        if (badges) html += `<div>${badges}</div>`;
        html += '</div>';
    }

    const totalCells = startIdx + daysInMonth;
    const remainder = totalCells % 7;
    if (remainder > 0) {
        for (let i = 0; i < 7 - remainder; i++) {
            html += '<div class="calendar-day other-month"></div>';
        }
    }

    grid.innerHTML = html;
}

// ── selectDay ──────────────────────────────────────────────────────────────
async function selectDay(fecha) {
    selectedDate = fecha;

    document.querySelectorAll('.calendar-day.selected').forEach(e => e.classList.remove('selected'));
    const cell = document.querySelector(`.calendar-day[data-fecha="${fecha}"]`);
    if (cell) cell.classList.add('selected');

    try {
        const res = await fetch(`${API}?action=disponibilidad&fecha=${fecha}`);
        const json = await res.json();
        daySlots = (Array.isArray(json.data)) ? json.data : [];
        renderDayDetail(daySlots, fecha);
    } catch (err) {
        console.error('selectDay:', err);
        showError('Error al cargar disponibilidad del día');
    }
}

function renderDayDetail(slots, fecha) {
    const overlay = el('dayDetailOverlay');
    const titleEl = el('dayDetailTitle');
    const bodyEl = el('dayDetailBody');
    if (!overlay || !bodyEl) return;

    const dateObj = new Date(fecha + 'T12:00:00');
    const dayName = getDayName(dateObj.getDay());
    const dateLabel = `${dayName} ${dateObj.getDate()} de ${getMonthName(dateObj.getMonth() + 1)}`;

    if (titleEl) titleEl.textContent = dateLabel;

    if (!slots || slots.length === 0) {
        bodyEl.innerHTML = '<div class="agenda-empty"><i class="fas fa-calendar-times"></i>Sin horarios configurados para este día</div>';
    } else {
        let html = '<div class="slot-timeline">';
        slots.forEach(slot => {
            const timeRange = formatTimeRange(slot.hora_inicio, slot.hora_fin);
            const isAvailable = slot.disponible !== false && !['reservado','confirmado','cancelado'].includes(slot.estado);
            const estado = slot.estado || (isAvailable ? 'disponible' : 'ocupado');

            let info = '';
            if (!isAvailable && slot.cliente_nombre) {
                const nombre = esc(slot.cliente_nombre) + (slot.cliente_apellido ? ' ' + esc(slot.cliente_apellido) : '');
                const patente = slot.vehiculo_patente ? esc(slot.vehiculo_patente) : '';
                info = `<div class="slot-info"><span class="slot-client"><i class="fas fa-user"></i> ${nombre}</span>`;
                if (patente) info += ` <span><i class="fas fa-car"></i> ${patente}</span>`;
                info += '</div>';
            }

            let actions = '';
            if (isAvailable) {
                actions = `<div class="slot-actions"><button class="btn btn-sm btn-primary" onclick="openNuevaVisitaModal('${esc(fecha)}', '${esc(slot.hora_inicio)}', ${slot.id})"><i class="fas fa-plus"></i> Visita</button></div>`;
            } else if (estado === 'reservado' && slot.visita_id) {
                actions = `<div class="slot-actions">
                    <button class="btn btn-sm btn-success" onclick="confirmarVisita(${slot.visita_id})"><i class="fas fa-check"></i> Confirmar</button>
                    <button class="btn btn-sm btn-danger" onclick="cancelarSlot(${slot.id})"><i class="fas fa-times"></i> Cancelar</button></div>`;
            } else if (estado === 'confirmado' && slot.visita_id) {
                actions = `<div class="slot-actions"><button class="btn btn-sm btn-danger" onclick="cancelarSlot(${slot.id})"><i class="fas fa-times"></i> Cancelar</button></div>`;
            }

            html += `<div class="slot-item status-${estado}">`;
            html += `<div class="slot-time">${timeRange} ${getSlotStatusBadge(estado)}</div>`;
            if (info) html += info;
            if (actions) html += actions;
            html += '</div>';
        });
        html += '</div>';
        bodyEl.innerHTML = html;
    }

    overlay.classList.add('active');
}

function hideDayDetail() {
    el('dayDetailOverlay')?.classList.remove('active');
    selectedDate = null;
    document.querySelectorAll('.calendar-day.selected').forEach(e => e.classList.remove('selected'));
}

// ── loadSolicitudes ────────────────────────────────────────────────────────
async function loadSolicitudes() {
    try {
        const res = await fetch(API + '?action=solicitudes&estado=pendiente');
        const json = await res.json();
        renderSolicitudes(Array.isArray(json.data) ? json.data : []);
    } catch (err) { console.error('loadSolicitudes:', err); }
}

function renderSolicitudes(solicitudes) {
    const container = el('solicitudesList');
    if (!container) return;

    if (!solicitudes.length) {
        container.innerHTML = '<div class="agenda-empty"><i class="fas fa-inbox"></i>No hay solicitudes pendientes</div>';
        return;
    }

    let html = '';
    solicitudes.forEach(sol => {
        const nombre = esc((sol.cliente_nombre || '') + ' ' + (sol.cliente_apellido || ''));
        const patente = esc(sol.vehiculo_patente || '-');
        const marca = esc(sol.vehiculo_marca || '');
        const modelo = esc(sol.vehiculo_modelo || '');
        const vehiculo = [marca, modelo].filter(Boolean).join(' ');
        const motivo = esc(sol.motivo || '');
        const fecha = sol.fecha_solicitada || sol.fecha_preferida || '';
        const fechaLabel = fecha ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
        const creado = sol.creado ? new Date(sol.creado).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        const folio = sol.folio || `SOL-${sol.id}`;

        html += `<div class="solicitud-card" data-id="${sol.id}">`;
        html += `<div class="sol-top"><span class="sol-folio">${esc(folio)}</span><span class="sol-date">${creado}</span></div>`;
        html += `<div class="sol-client">${nombre}</div>`;
        html += `<div class="sol-details">`;
        if (vehiculo) html += `<span><i class="fas fa-car"></i> ${esc(vehiculo)} — ${patente}</span>`;
        const horaLabel = sol.hora_solicitada ? sol.hora_solicitada.substring(0, 5) : '';
        html += `<span><i class="fas fa-calendar"></i> ${fechaLabel}${horaLabel ? ' <i class="fas fa-clock"></i> ' + horaLabel : ''}</span>`;
        html += `<span><i class="fas fa-flag"></i> ${esc(sol.prioridad || 'normal')}</span>`;
        html += `</div>`;
        if (motivo) html += `<div class="sol-motivo"><i class="fas fa-comment"></i> ${motivo}</div>`;
        html += `<div class="sol-actions">`;
        html += `<button class="btn btn-sm btn-primary" onclick="openAsignarSolicitud(${sol.id}, '${esc(sol.fecha_solicitada || '')}', '${esc(sol.hora_solicitada || '')}')"><i class="fas fa-calendar-check"></i> Asignar</button>`;
        html += `<button class="btn btn-sm btn-outline" onclick="verDetalleSolicitud(${sol.id})"><i class="fas fa-eye"></i> Ver</button>`;
        html += `<button class="btn btn-sm btn-danger-outline" onclick="rechazarSolicitud(${sol.id})"><i class="fas fa-times"></i> Rechazar</button>`;
        html += `</div></div>`;
    });

    container.innerHTML = html;
}

// ── Asignar solicitud ──────────────────────────────────────────────────────
let _asignarSolId = null;
let _asignarSlotId = null;

function openAsignarSolicitud(solId, fechaSolicitada, horaSolicitada) {
    _asignarSolId = solId;
    _asignarSlotId = null;
    el('asignarSolicitudId').value = solId;
    el('asignarFecha').value = fechaSolicitada || formatDate(new Date());
    el('asignarFecha').min = formatDate(new Date());
    el('slotPickerGrid').innerHTML = '<div class="agenda-empty"><i class="fas fa-clock"></i>Cargando slots...</div>';
    el('btnConfirmarAsignar').disabled = true;
    el('modalAsignarSolicitud').classList.add('active');
    loadAsignarSlots(horaSolicitada);
}

async function loadAsignarSlots(preselectHora) {
    const fecha = el('asignarFecha')?.value;
    if (!fecha) return;
    const container = el('slotPickerGrid');
    container.innerHTML = '<div style="text-align:center;padding:1rem"><i class="fas fa-spinner fa-spin"></i></div>';
    _asignarSlotId = null;
    el('btnConfirmarAsignar').disabled = true;

    try {
        const res = await fetch(`${API}?action=disponibilidad&fecha=${fecha}`);
        const json = await res.json();
        const disponibles = (Array.isArray(json.data)) ? json.data.filter(s => s.disponible) : [];

        if (!disponibles.length) {
            container.innerHTML = '<div class="agenda-empty"><i class="fas fa-clock"></i>Sin horarios disponibles</div>';
            return;
        }

        let html = '';
        disponibles.forEach(slot => {
            const time = formatTimeRange(slot.hora_inicio, slot.hora_fin);
            const matchHora = preselectHora && slot.hora_inicio === preselectHora;
            const selectedClass = matchHora ? ' selected' : '';
            if (matchHora) _asignarSlotId = slot.id;
            html += `<button type="button" class="slot-picker-item${selectedClass}" data-id="${slot.id}" onclick="pickAsignarSlot(this, ${slot.id})">${time}</button>`;
        });
        container.innerHTML = html;

        if (_asignarSlotId) el('btnConfirmarAsignar').disabled = false;
    } catch (err) {
        container.innerHTML = '<div class="agenda-empty" style="color:var(--danger)"><i class="fas fa-exclamation-triangle"></i>Error al cargar</div>';
    }
}

function pickAsignarSlot(btn, slotId) {
    document.querySelectorAll('#slotPickerGrid .slot-picker-item.selected').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    _asignarSlotId = slotId;
    el('btnConfirmarAsignar').disabled = false;
}

async function submitAsignarSolicitud() {
    if (!_asignarSolId || !_asignarSlotId) return showError('Seleccione un horario');

    const btn = el('btnConfirmarAsignar');
    setButtonLoading(btn, true, 'Asignando...');

    try {
        const fd = new FormData();
        fd.append('action', 'asignar_solicitud');
        fd.append('solicitud_id', _asignarSolId);
        fd.append('slot_id', _asignarSlotId);
        const result = await apiFetch(API, fd);
        if (result.status === 'success') {
            showSuccess('Solicitud asignada correctamente');
            closeModalOverlay('modalAsignarSolicitud');
            loadCalendar();
            loadSolicitudes();
            loadResumen();
        } else {
            showError(result.message || 'Error al asignar');
        }
    } catch (err) {
        showError('Error de conexión');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ── Ver detalle solicitud ──────────────────────────────────────────────────
async function verDetalleSolicitud(solId) {
    const container = el('detalleSolicitudContent');
    container.innerHTML = '<div class="agenda-empty"><i class="fas fa-spinner fa-spin"></i>Cargando...</div>';
    el('modalDetalleSolicitud').classList.add('active');

    try {
        const res = await fetch(`${API}?action=detalle_solicitud&id=${solId}`);
        const json = await res.json();
        if (!json.data) {
            container.innerHTML = '<div class="agenda-empty"><i class="fas fa-exclamation-triangle"></i>No encontrada</div>';
            return;
        }
        const s = json.data;
        const nombre = esc((s.cliente_nombre || '') + ' ' + (s.cliente_apellido || ''));
        const vehiculo = [s.vehiculo_marca, s.vehiculo_modelo].filter(Boolean).map(esc).join(' ');

        let html = '<div class="detalle-grid">';
        html += `<div class="detalle-row"><span class="detalle-label">Cliente</span><span class="detalle-value">${nombre}</span></div>`;
        html += `<div class="detalle-row"><span class="detalle-label">Teléfono</span><span class="detalle-value">${esc(s.cliente_telefono || '-')}</span></div>`;
        html += `<div class="detalle-row"><span class="detalle-label">Correo</span><span class="detalle-value">${esc(s.cliente_correo || '-')}</span></div>`;
        if (vehiculo) html += `<div class="detalle-row"><span class="detalle-label">Vehículo</span><span class="detalle-value">${vehiculo} — ${esc(s.vehiculo_patente || '-')}</span></div>`;
        html += `<div class="detalle-row"><span class="detalle-label">Motivo</span><span class="detalle-value">${esc(s.motivo || '-')}</span></div>`;
        html += `<div class="detalle-row"><span class="detalle-label">Prioridad</span><span class="detalle-value">${esc(s.prioridad || 'normal')}</span></div>`;
        html += `<div class="detalle-row"><span class="detalle-label">Estado</span><span class="detalle-value"><span class="slot-status ${esc(s.estado)}">${esc(s.estado)}</span></span></div>`;
        if (s.fecha_solicitada) {
            const fechaLabel = new Date(s.fecha_solicitada + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const horaLabel = s.hora_solicitada ? s.hora_solicitada.substring(0, 5) : '';
            html += `<div class="detalle-row"><span class="detalle-label">Fecha solicitada</span><span class="detalle-value"><i class="fas fa-calendar"></i> ${esc(fechaLabel)}${horaLabel ? ' <i class="fas fa-clock"></i> ' + esc(horaLabel) : ''}</span></div>`;
        }
        if (s.observaciones) html += `<div class="detalle-row"><span class="detalle-label">Observaciones</span><span class="detalle-value">${esc(s.observaciones)}</span></div>`;
        html += '</div>';

        // Multimedia
        const archivos = s.archivos || [];
        if (archivos.length > 0) {
            html += '<div class="detalle-multimedia">';
            html += '<h4 style="margin:1rem 0 .5rem;font-size:.85rem;color:var(--text-primary)"><i class="fas fa-paperclip"></i> Archivos adjuntos (' + archivos.length + ')</h4>';
            html += '<div class="media-grid">';
            archivos.forEach(a => {
                const ruta = a.ruta_thumbnail || a.ruta_archivo;
                const nombre = esc(a.nombre_original || 'archivo');
                if (a.tipo_archivo === 'foto') {
                    html += `<div class="media-item" onclick="openMediaLightbox('${esc(a.ruta_archivo)}')">
                        <img src="${esc(ruta)}" alt="${nombre}" loading="lazy">
                        <span class="media-name">${nombre}</span>
                    </div>`;
                } else if (a.tipo_archivo === 'audio' || (a.ruta_archivo && a.ruta_archivo.endsWith('.webm'))) {
                    html += `<div class="media-item media-audio">
                        <i class="fas fa-microphone" style="font-size:1.5rem;color:var(--primary)"></i>
                        <audio controls preload="none" style="width:100%;margin-top:.3rem">
                            <source src="${esc(a.ruta_archivo)}" type="audio/webm">
                        </audio>
                        <span class="media-name">${nombre}</span>
                    </div>`;
                } else if (a.tipo_archivo === 'video') {
                    html += `<div class="media-item media-video">
                        <video controls preload="none" style="width:100%;border-radius:6px">
                            <source src="${esc(a.ruta_archivo)}" type="video/mp4">
                        </video>
                        <span class="media-name">${nombre}</span>
                    </div>`;
                } else {
                    html += `<div class="media-item">
                        <i class="fas fa-file" style="font-size:1.5rem;color:var(--text-secondary)"></i>
                        <span class="media-name">${nombre}</span>
                    </div>`;
                }
            });
            html += '</div></div>';
        }

        // Nota de voz
        if (s.notas_voz) {
            try {
                const nv = JSON.parse(s.notas_voz);
                if (nv && nv.ruta) {
                    html += '<div class="detalle-multimedia">';
                    html += '<h4 style="margin:1rem 0 .5rem;font-size:.85rem;color:var(--text-primary)"><i class="fas fa-microphone"></i> Nota de voz del cliente</h4>';
                    html += `<audio controls preload="none" style="width:100%"><source src="${esc(nv.ruta)}" type="audio/webm"></audio>`;
                    html += '</div>';
                }
            } catch(e) { /* not JSON */ }
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="agenda-empty" style="color:var(--danger)"><i class="fas fa-exclamation-triangle"></i>Error al cargar</div>';
    }
}

// ── Nueva visita directa ──────────────────────────────────────────────────
function openNuevaVisitaModal(fecha, hora, slotId) {
    el('visitaFecha').value = fecha || formatDate(new Date());
    el('visitaFecha').min = formatDate(new Date());
    el('visitaSlot').innerHTML = '<option value="">Cargando horarios...</option>';
    el('visitaCliente').innerHTML = '<option value="">Cargando clientes...</option>';
    el('visitaVehiculo').innerHTML = '<option value="">— Sin vehículo —</option>';
    el('visitaMotivo').value = '';
    el('modalNuevaVisita').classList.add('active');

    loadVisitaSlots(fecha || formatDate(new Date()), slotId, hora);
    loadVisitaClientes();
}

async function loadVisitaSlots(fecha, preselectSlotId, preselectHora) {
    const sel = el('visitaSlot');
    try {
        const res = await fetch(`${API}?action=disponibilidad&fecha=${fecha}`);
        const json = await res.json();
        const disponibles = (Array.isArray(json.data)) ? json.data.filter(s => s.disponible) : [];
        let html = '<option value="">— Seleccionar horario —</option>';
        disponibles.forEach(s => {
            const time = formatTimeRange(s.hora_inicio, s.hora_fin);
            const matchId = preselectSlotId && s.id == preselectSlotId;
            const matchHora = !matchId && preselectHora && s.hora_inicio === preselectHora;
            const selected = (matchId || matchHora) ? ' selected' : '';
            html += `<option value="${s.id}"${selected}>${time}</option>`;
        });
        sel.innerHTML = html;
    } catch (err) {
        sel.innerHTML = '<option value="">Error al cargar</option>';
    }
}

async function loadVisitaClientes() {
    const sel = el('visitaCliente');
    try {
        const res = await fetch(API_ROOT + 'clientes_api.php?action=listar');
        const json = await res.json();
        const items = Array.isArray(json.data) ? json.data : [];
        let html = '<option value="">— Seleccionar cliente —</option>';
        items.forEach(c => {
            html += `<option value="${c.id}">${esc(c.nombre)} ${esc(c.apellido || '')}</option>`;
        });
        sel.innerHTML = html;
    } catch (err) {
        sel.innerHTML = '<option value="">Error al cargar</option>';
    }
}

async function loadVehiculoCliente(clienteId) {
    const sel = el('visitaVehiculo');
    sel.innerHTML = '<option value="">— Sin vehículo —</option>';
    if (!clienteId) return;
    try {
        const res = await fetch(`${API_ROOT}clientes_api.php?action=vehiculos&id=${clienteId}`);
        const json = await res.json();
        const items = Array.isArray(json.data) ? json.data : [];
        items.forEach(v => {
            const label = `${v.marca || ''} ${v.modelo || ''} ${v.anio || ''} — ${v.patente || ''}`.trim();
            sel.innerHTML += `<option value="${v.id}">${esc(label)}</option>`;
        });
    } catch (err) { /* ignore */ }
}

async function submitNuevaVisita() {
    const slotId = el('visitaSlot')?.value;
    const clienteId = el('visitaCliente')?.value;
    const motivo = el('visitaMotivo')?.value?.trim();
    const fecha = el('visitaFecha')?.value;

    if (!fecha) return showError('Seleccione una fecha');
    if (!slotId) return showError('Seleccione un horario');
    if (!clienteId) return showError('Seleccione un cliente');
    if (!motivo) return showError('Ingrese el motivo');

    const btn = el('btnGuardarVisita');
    setButtonLoading(btn, true, 'Creando...');

    try {
        const fd = new FormData();
        fd.append('action', 'crear_visita');
        fd.append('slot_id', slotId);
        fd.append('cliente_id', clienteId);
        fd.append('vehiculo_id', el('visitaVehiculo')?.value || '');
        fd.append('motivo', motivo);
        const result = await apiFetch(API, fd);
        if (result.status === 'success') {
            showSuccess('Visita creada correctamente');
            closeModalOverlay('modalNuevaVisita');
            loadCalendar();
            loadResumen();
            if (selectedDate) selectDay(selectedDate);
        } else {
            showError(result.message || 'Error al crear visita');
        }
    } catch (err) {
        showError('Error de conexión');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ── Confirmar visita ──────────────────────────────────────────────────────
async function confirmarVisita(visitaId) {
    if (!confirm('¿Confirmar esta visita?')) return;

    try {
        const fd = new FormData();
        fd.append('action', 'confirmar');
        fd.append('visita_id', visitaId);
        const result = await apiFetch(API, fd);
        if (result.status === 'success') {
            showSuccess('Visita confirmada');
            loadCalendar();
            loadResumen();
            if (selectedDate) selectDay(selectedDate);
        } else {
            showError(result.message || 'Error al confirmar');
        }
    } catch (err) {
        showError('Error de conexión');
    }
}

// ── Cancelar slot ───────────────────────────────────────────────────────────
async function cancelarSlot(slotId) {
    if (!confirm('¿Cancelar este slot? Se eliminará la visita asociada.')) return;

    try {
        const fd = new FormData();
        fd.append('action', 'cancelar_slot');
        fd.append('slot_id', slotId);
        const result = await apiFetch(API, fd);
        if (result.status === 'success') {
            showSuccess('Slot cancelado');
            loadCalendar();
            loadResumen();
            if (selectedDate) selectDay(selectedDate);
        } else {
            showError(result.message || 'Error al cancelar');
        }
    } catch (err) {
        showError('Error de conexión');
    }
}

// ── Rechazar solicitud ──────────────────────────────────────────────────────
async function rechazarSolicitud(solId) {
    const motivo = prompt('Motivo del rechazo (opcional):');
    if (motivo === null) return;

    try {
        const fd = new FormData();
        fd.append('action', 'rechazar_solicitud');
        fd.append('solicitud_id', solId);
        fd.append('motivo', motivo);
        const result = await apiFetch(API, fd);
        if (result.status === 'success') {
            showSuccess('Solicitud rechazada');
            loadSolicitudes();
            loadResumen();
        } else {
            showError(result.message || 'Error al rechazar');
        }
    } catch (err) {
        showError('Error de conexión');
    }
}

// ── Generar slots ───────────────────────────────────────────────────────────
async function generarSlots() {
    const btn = el('btnGenerarSlots');
    setButtonLoading(btn, true, 'Generando...');

    try {
        const fd = new FormData();
        fd.append('action', 'generar_slots');
        fd.append('year', currentYear);
        fd.append('month', currentMonth);
        const result = await apiFetch(API, fd);
        if (result.status === 'success') {
            showSuccess(result.data?.generados ? `${result.data.generados} slots generados` : 'Slots generados');
            loadCalendar();
            loadResumen();
        } else {
            showError(result.message || 'Error al generar slots');
        }
    } catch (err) {
        showError('Error de conexión');
    } finally {
        setButtonLoading(btn, false);
    }
}

// ── Modal helpers ───────────────────────────────────────────────────────────
function closeModalOverlay(id) {
    el(id)?.classList.remove('active');
}

// ── Media lightbox ──────────────────────────────────────────────────
function openMediaLightbox(src) {
    const lb = el('mediaLightbox');
    const img = el('lbImage');
    if (lb && img) {
        img.src = src;
        lb.classList.add('active');
    }
}
function closeMediaLightbox() {
    el('mediaLightbox')?.classList.remove('active');
    const img = el('lbImage');
    if (img) img.src = '';
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMediaLightbox();
});
