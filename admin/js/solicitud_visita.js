// solicitud_visita.js — Solicitud de Visita (público/cliente)
const API = API_ROOT + 'solicitudes_api.php';

let currentYear, currentMonth;
let selectedSlot = null;
let availableDays = [];
let availableSlots = [];
let currentStep = 1;
let uploadedFiles = [];
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let selectedPriority = 'normal';

// ─── DOMContentLoaded ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;

    loadCalendar(currentYear, currentMonth);
    setupStepNavigation();
    setupMediaUpload();
    setupVoiceNote();
    setupPrioritySelector();
    goToStep(1);

    el('successClose')?.addEventListener('click', goBackToStart);
});

// ─── CALENDAR ───────────────────────────────────────────────────────
async function loadCalendar(year, month) {
    currentYear = year;
    currentMonth = month;
    try {
        const res = await fetch(`${API}?action=calendario&year=${year}&month=${month}`);
        const data = await res.json();
        availableDays = data.data || [];
        renderMiniCalendar(year, month);
    } catch (err) {
        console.error('Error loading calendar:', err);
    }
}

function renderMiniCalendar(year, month) {
    const container = el('calendarGrid');
    if (!container) return;

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDay = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();
    const monthName = getMonthName(month);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let html = `
        <div class="cal-header">
            <button type="button" class="cal-nav" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
            <span class="cal-title">${monthName} ${year}</span>
            <button type="button" class="cal-nav" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="cal-weekdays">
            <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
        <div class="cal-days">`;

    for (let i = 0; i < startDay; i++) {
        html += '<span class="cal-day empty"></span>';
    }

    for (let d = 1; d <= totalDays; d++) {
        const fecha = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = fecha === todayStr;
        const isSelected = selectedSlot && selectedSlot.fecha === fecha;
        const dayData = availableDays.find(ad => ad.fecha === fecha);
        const hasSlots = dayData && parseInt(dayData.disponibles) > 0;

        let cls = 'cal-day';
        if (isToday) cls += ' today';
        if (isSelected) cls += ' selected';
        if (hasSlots) cls += ' has-slots';
        else cls += ' disabled';

        html += `<span class="${cls}" data-date="${fecha}" ${hasSlots ? `onclick="selectDate('${fecha}')"` : ''}>`;
        html += `<span class="cal-num">${d}</span>`;
        if (hasSlots) html += `<span class="cal-dot"></span>`;
        html += `</span>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadCalendar(currentYear, currentMonth);
}

async function selectDate(fecha) {
    selectedSlot = null;
    const container = el('timeSlots');
    const slotsContainer = el('timeSlotsContainer');
    const label = el('selectedDateLabel');
    if (label) label.textContent = formatDateDisplay(fecha);
    container.innerHTML = '<div class="slots-loading"><i class="fas fa-spinner fa-spin"></i> Cargando horarios...</div>';
    slotsContainer?.classList.add('visible');

    renderMiniCalendar(currentYear, currentMonth);
    el('selectionSummary')?.classList.remove('visible');

    try {
        const res = await fetch(`${API}?action=slots&fecha=${fecha}`);
        const data = await res.json();
        availableSlots = data.data || [];
        renderSlots(fecha);
    } catch (err) {
        container.innerHTML = '<p class="slots-empty">Error al cargar horarios</p>';
    }
}

function renderSlots(fecha) {
    const container = el('timeSlots');
    if (!availableSlots.length) {
        container.innerHTML = '<p class="slots-empty">No hay horarios disponibles para esta fecha</p>';
        return;
    }

    let html = '';
    availableSlots.forEach(slot => {
        const h = parseInt(slot.hora_inicio.split(':')[0]);
        const m = slot.hora_inicio.split(':')[1];
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const h2 = parseInt(slot.hora_fin.split(':')[0]);
        const m2 = slot.hora_fin.split(':')[1];
        const ampm2 = h2 >= 12 ? 'PM' : 'AM';
        const h122 = h2 % 12 || 12;
        const time = `${h12}:${m} ${ampm} — ${h122}:${m2} ${ampm2}`;

        html += `<button type="button" class="time-pill" data-slot-id="${slot.id}" onclick="selectSlot(${JSON.stringify(slot).replace(/"/g, '&quot;')})">
            <i class="fas fa-clock"></i> ${time}
        </button>`;
    });
    container.innerHTML = html;
}

function selectSlot(slot) {
    selectedSlot = slot;

    document.querySelectorAll('.time-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.slotId == slot.id);
    });

    const summary = el('selectionSummary');
    const summaryText = el('summaryDateTime');
    if (summary && summaryText) {
        summaryText.textContent = `${formatDateDisplay(slot.fecha)} — ${formatTime(slot.hora_inicio)} a ${formatTime(slot.hora_fin)}`;
        summary.classList.add('visible');
    }

    updateNavButtons();
}

// ─── STEP NAVIGATION ────────────────────────────────────────────────
function setupStepNavigation() {
    el('btnNext')?.addEventListener('click', () => {
        if (currentStep === 4) {
            submitSolicitud();
            return;
        }
        if (validateStep(currentStep)) {
            if (currentStep < 4) goToStep(currentStep + 1);
        }
    });
    el('btnPrev')?.addEventListener('click', () => {
        if (currentStep > 1) goToStep(currentStep - 1);
    });
}

function goToStep(step) {
    currentStep = step;

    document.querySelectorAll('.form-page').forEach(fp => {
        fp.classList.remove('active');
    });
    const target = document.querySelector(`.form-page[data-page="${step}"]`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.step-circle-wrap').forEach((wrap, i) => {
        const circle = wrap.querySelector('.step-circle');
        wrap.classList.remove('active', 'completed');
        circle?.classList.remove('active', 'completed');
        if (i + 1 < step) { wrap.classList.add('completed'); circle?.classList.add('completed'); }
        else if (i + 1 === step) { wrap.classList.add('active'); circle?.classList.add('active'); }
    });
    document.querySelectorAll('.step-line').forEach((line, i) => {
        line.classList.toggle('active', i + 1 < step);
    });

    if (step === 4) populateSummary();

    updateNavButtons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateNavButtons() {
    const btnPrev = el('btnPrev');
    const btnNext = el('btnNext');
    if (btnPrev) btnPrev.style.visibility = currentStep > 1 ? 'visible' : 'hidden';

    if (btnNext) {
        const span = btnNext.querySelector('.btn-text');
        if (currentStep === 4) {
            if (span) span.textContent = 'Enviar Solicitud';
            btnNext.querySelector('i')?.setAttribute('class', 'fa-solid fa-paper-plane');
        } else {
            if (span) span.textContent = 'Siguiente';
            btnNext.querySelector('i')?.setAttribute('class', 'fa-solid fa-arrow-right');
        }
    }
}

function validateStep(step) {
    clearAllInlineErrors();

    if (step === 1) {
        if (!selectedSlot) {
            showInlineError('Por favor seleccione una fecha y horario');
            return false;
        }
        return true;
    }

    if (step === 2) {
        let valid = true;
        const nombre = el('v-nombre');
        const telefono = el('v-telefono');
        const patente = el('v-patente');

        if (!nombre?.value.trim()) { showFieldError(nombre, 'El nombre es requerido'); valid = false; }
        if (!telefono?.value.trim()) { showFieldError(telefono, 'El teléfono es requerido'); valid = false; }
        if (!patente?.value.trim()) { showFieldError(patente, 'La patente es requerida'); valid = false; }
        return valid;
    }

    if (step === 3) {
        const motivo = el('v-motivo');
        if (!motivo?.value.trim()) { showFieldError(motivo, 'El motivo de la visita es requerido'); return false; }
        return true;
    }

    return true;
}

function showFieldError(input, message) {
    if (!input) return;
    input.classList.add('field-error');
    const group = input.closest('.form-group');
    let errEl = group?.querySelector('.field-error-msg');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'field-error-msg';
        (group || input.parentElement).appendChild(errEl);
    }
    errEl.textContent = message;
    errEl.style.display = 'block';
}

function showInlineError(message) {
    const page = document.querySelector(`.form-page[data-page="${currentStep}"]`);
    if (!page) return;
    let banner = page.querySelector('.inline-error-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.className = 'inline-error-banner';
        page.prepend(banner);
    }
    banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(message)}`;
    banner.style.display = 'flex';
}

function clearAllInlineErrors() {
    document.querySelectorAll('.field-error').forEach(e => e.classList.remove('field-error'));
    document.querySelectorAll('.field-error-msg').forEach(e => { e.style.display = 'none'; e.textContent = ''; });
    document.querySelectorAll('.inline-error-banner').forEach(e => { e.style.display = 'none'; e.innerHTML = ''; });
}

// ─── PRIORITY SELECTOR ─────────────────────────────────────────────
function setupPrioritySelector() {
    el('prioritySelector')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.priority-option');
        if (!opt) return;
        document.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedPriority = opt.dataset.priority || 'normal';
    });
}

// ─── MEDIA UPLOAD ───────────────────────────────────────────────────
function setupMediaUpload() {
    const dropZone = el('uploadZone');
    if (!dropZone) return;

    // Remove any file inputs added by common.js
    dropZone.querySelectorAll('.upload-file-input').forEach(inp => inp.remove());

    const fileInput = el('fileInput');
    if (!fileInput) return;

    // Stop propagation on the input itself to prevent double-firing
    fileInput.addEventListener('click', e => e.stopPropagation());

    dropZone.addEventListener('click', (e) => {
        if (e.target.closest('.remove-thumb')) return;
        fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        addFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) addFiles(fileInput.files);
        fileInput.value = '';
    });
}

function addFiles(files) {
    const maxFiles = 10;
    const maxSize = 10 * 1024 * 1024;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
    let rejected = 0;

    Array.from(files).forEach(file => {
        if (uploadedFiles.length >= maxFiles) { rejected++; return; }
        if (!validTypes.includes(file.type)) { rejected++; return; }
        if (file.size > maxSize) { rejected++; return; }
        uploadedFiles.push(file);
    });

    if (rejected > 0) {
        const msgs = [];
        if (uploadedFiles.length >= maxFiles) msgs.push(`Máximo ${maxFiles} archivos`);
        msgs.push('Solo PNG, JPG, MP4 y WebM (máx. 10MB c/u)');
        showToast(msgs[0], 'warning');
    }

    renderFileThumbnails();
    updateFileCounter();
}

function renderFileThumbnails() {
    const grid = el('previewGrid');
    if (!grid) return;
    grid.innerHTML = '';

    uploadedFiles.forEach((file, i) => {
        const item = document.createElement('div');
        item.className = 'preview-thumb';

        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            item.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            item.innerHTML = '<i class="fas fa-video" style="font-size:1.5rem;color:var(--primary)"></i>';
        } else {
            item.innerHTML = '<i class="fas fa-file" style="font-size:1.5rem;color:var(--text-secondary)"></i>';
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-thumb';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(i);
        });
        item.appendChild(removeBtn);

        const name = document.createElement('span');
        name.className = 'thumb-name';
        name.textContent = file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name;
        item.appendChild(name);

        grid.appendChild(item);
    });
}

function updateFileCounter() {
    const dropZone = el('uploadZone');
    if (!dropZone) return;
    let counter = dropZone.querySelector('.file-counter');
    if (!counter) {
        counter = document.createElement('div');
        counter.className = 'file-counter';
        dropZone.appendChild(counter);
    }
    counter.textContent = uploadedFiles.length > 0 ? `${uploadedFiles.length}/10 archivos` : '';
    counter.style.display = uploadedFiles.length > 0 ? 'block' : 'none';
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileThumbnails();
    updateFileCounter();
}

// ─── VOICE NOTE RECORDER ────────────────────────────────────────────
function setupVoiceNote() {
    el('voiceBtn')?.addEventListener('click', toggleVoiceNote);
}

async function toggleVoiceNote() {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                const file = new File([blob], `nota_voz_${Date.now()}.webm`, { type: 'audio/webm' });
                uploadedFiles.push(file);
                renderFileThumbnails();
                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            el('voiceBtn')?.classList.add('recording');
            const label = el('voiceLabel');
            if (label) label.textContent = 'Grabando...';
            startVoiceTimer();
        } catch (err) {
            console.error('Mic access denied:', err);
            showInlineError('No se pudo acceder al micrófono.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        el('voiceBtn')?.classList.remove('recording');
        const label = el('voiceLabel');
        if (label) label.textContent = 'Grabar nota de voz';
        stopVoiceTimer();
    }
}

let voiceTimerInterval = null;
let voiceSeconds = 0;

function startVoiceTimer() {
    voiceSeconds = 0;
    const timer = el('voiceTimer');
    if (timer) timer.textContent = '00:00';
    voiceTimerInterval = setInterval(() => {
        voiceSeconds++;
        const m = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
        const s = String(voiceSeconds % 60).padStart(2, '0');
        if (timer) timer.textContent = `${m}:${s}`;
    }, 1000);
}

function stopVoiceTimer() {
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
}

// ─── SUMMARY ────────────────────────────────────────────────────────
function populateSummary() {
    if (selectedSlot) {
        const set = (id, val) => { const e = el(id); if (e) e.textContent = val || '—'; };
        set('c-fecha', formatDateDisplay(selectedSlot.fecha));
        set('c-hora', `${formatTime(selectedSlot.hora_inicio)} a ${formatTime(selectedSlot.hora_fin)}`);
        set('c-nombre', `${el('v-nombre')?.value || ''} ${el('v-apellido')?.value || ''}`.trim());
        set('c-telefono', el('v-telefono')?.value);
        set('c-correo', el('v-correo')?.value);
        set('c-rut', el('v-rut')?.value);
        set('c-patente', el('v-patente')?.value?.toUpperCase());
        set('c-vehiculo', `${el('v-marca')?.value || ''} ${el('v-modelo')?.value || ''}`.trim());
        set('c-ano', el('v-ano')?.value);
        set('c-motivo', el('v-motivo')?.value);
        set('c-prioridad', selectedPriority === 'urgente' ? 'Urgente' : 'Normal');
    }
}

// ─── FORM SUBMIT ────────────────────────────────────────────────────
async function submitSolicitud() {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

    const btn = el('btnNext');
    setButtonLoading(btn, true, 'Enviando...');

    try {
        const fd = new FormData();
        fd.append('action', 'enviar');
        fd.append('slot_id', selectedSlot.id);
        fd.append('fecha_solicitada', selectedSlot.fecha);
        fd.append('hora_solicitada', selectedSlot.hora_inicio);
        fd.append('cliente_nombre', el('v-nombre')?.value?.trim() || '');
        fd.append('cliente_apellido', el('v-apellido')?.value?.trim() || '');
        fd.append('cliente_telefono', el('v-telefono')?.value?.trim() || '');
        fd.append('cliente_correo', el('v-correo')?.value?.trim() || '');
        fd.append('cliente_rut', el('v-rut')?.value?.trim() || '');
        fd.append('vehiculo_patente', el('v-patente')?.value?.trim().toUpperCase() || '');
        fd.append('vehiculo_marca', el('v-marca')?.value?.trim() || '');
        fd.append('vehiculo_modelo', el('v-modelo')?.value?.trim() || '');
        fd.append('vehiculo_anio', el('v-ano')?.value?.trim() || '');
        fd.append('motivo', el('v-motivo')?.value?.trim() || '');
        fd.append('observaciones', el('v-notas')?.value?.trim() || '');
        fd.append('prioridad', selectedPriority);

        uploadedFiles.forEach(f => fd.append('archivos[]', f));

        const res = await fetch(API, { method: 'POST', body: fd });
        const data = await res.json();

        if (data.status === 'success') {
            showSuccessScreen(data.data);
        } else {
            showInlineError(data.message || 'Error al enviar la solicitud.');
            setButtonLoading(btn, false);
        }
    } catch (err) {
        console.error('Submit error:', err);
        showInlineError('Error de conexión. Intente nuevamente.');
        setButtonLoading(btn, false);
    }
}

function showSuccessScreen(result) {
    document.querySelectorAll('.form-page').forEach(fp => fp.classList.remove('active'));
    document.querySelector('.steps-bar').style.display = 'none';
    document.querySelector('.form-actions').style.display = 'none';

    const overlay = el('successOverlay');
    if (overlay) {
        overlay.classList.add('visible');
    }
}

function goBackToStart() {
    el('successOverlay')?.classList.remove('visible');
    document.querySelector('.steps-bar').style.display = '';
    document.querySelector('.form-actions').style.display = '';

    selectedSlot = null;
    uploadedFiles = [];
    currentStep = 1;
    selectedPriority = 'normal';

    document.querySelectorAll('.form-page')[0]?.classList.add('active');
    document.querySelectorAll('.form-page[data-page]').forEach((fp, i) => {
        fp.classList.toggle('active', i === 0);
    });

    document.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
    el('prioritySelector')?.querySelector('.priority-option')?.classList.add('selected');

    renderFileThumbnails();
    renderMiniCalendar(currentYear, currentMonth);
    el('selectionSummary')?.classList.remove('visible');
    el('timeSlotsContainer')?.classList.remove('visible');
    el('timeSlots').innerHTML = '';

    goToStep(1);
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────
function getMonthName(m) {
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return names[m - 1] || '';
}

function formatTime(time) {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
}

function formatDateDisplay(fecha) {
    if (!fecha) return '';
    const [y, m, d] = fecha.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    return `${dayNames[date.getDay()]} ${parseInt(d)} de ${getMonthName(parseInt(m))}`;
}
