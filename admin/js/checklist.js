// ============================================================================
// checklist.js — Checklists de Servicios: Plantillas + Ejecución
// ============================================================================

const API_CHECKLIST = API_ROOT + 'checklist_api.php';
const _clEl = id => document.getElementById(id);

// ── Plantilla (Service Catalog) ─────────────────────────────────────────────
let plantillaPasos = [];

function setupChecklistTab() {
    const tabs = document.querySelector('.sidebar-tabs, .form-tabs, .ficha-tabs');
    if (!tabs) return;

    const existingChecklistTab = tabs.querySelector('[data-tab="checklist"]');
    if (existingChecklistTab) return;

    const tab = document.createElement('div');
    tab.className = 'ficha-tab';
    tab.dataset.tab = 'checklist';
    tab.innerHTML = '<i class="fas fa-clipboard-check"></i> Checklist';
    tabs.appendChild(tab);

    tab.addEventListener('click', () => {
        document.querySelectorAll('.ficha-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ficha-panel, .tab-content, [id^="tab"]').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById('tabChecklist') || document.getElementById('checklistPanel');
        if (panel) panel.classList.add('active');
    });
}

function renderPlantillaPasos(pasos) {
    plantillaPasos = pasos || [];
    const container = _clEl('checklistPasosContainer');
    if (!container) return;
    if (!plantillaPasos.length) {
        container.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);border:2px dashed var(--border-color);border-radius:var(--radius-md);"><i class="fas fa-clipboard-list" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:0.5rem"></i>Sin pasos definidos</div>';
        return;
    }
    container.innerHTML = plantillaPasos.map((p, idx) => `
        <div class="checklist-paso-card" data-idx="${idx}">
            <span class="paso-num">${idx + 1}</span>
            <div class="paso-fields">
                <input type="text" value="${escapeHtml(p.titulo || '')}" placeholder="Título del paso"
                    class="paso-titulo"
                    onchange="updatePlantillaPaso(${idx}, 'titulo', this.value)">
                <input type="text" value="${escapeHtml(p.descripcion || '')}" placeholder="Instrucciones (opcional)"
                    class="paso-desc"
                    onchange="updatePlantillaPaso(${idx}, 'descripcion', this.value)">
            </div>
            <div class="paso-checks">
                <label class="paso-check-label" title="Requiere foto">
                    <input type="checkbox" ${p.requiere_foto ? 'checked' : ''} onchange="updatePlantillaPaso(${idx}, 'requiere_foto', this.checked ? 1 : 0)">
                    <i class="fas fa-camera"></i>
                </label>
                <label class="paso-check-label" title="Requiere nota de voz">
                    <input type="checkbox" ${p.requiere_nota_voz ? 'checked' : ''} onchange="updatePlantillaPaso(${idx}, 'requiere_nota_voz', this.checked ? 1 : 0)">
                    <i class="fas fa-microphone"></i>
                </label>
            </div>
            <div class="paso-actions">
                <button class="btn btn-xs btn-outline" onclick="movePlantillaPaso(${idx},-1)" ${idx === 0 ? 'disabled' : ''} title="Subir"><i class="fas fa-arrow-up"></i></button>
                <button class="btn btn-xs btn-outline" onclick="movePlantillaPaso(${idx},1)" ${idx === plantillaPasos.length - 1 ? 'disabled' : ''} title="Bajar"><i class="fas fa-arrow-down"></i></button>
                <button class="btn btn-xs btn-outline" onclick="removePlantillaPaso(${idx})" style="color:var(--danger)" title="Eliminar"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `).join('');
}

window.updatePlantillaPaso = function(idx, field, value) {
    if (plantillaPasos[idx]) plantillaPasos[idx][field] = value;
};

window.movePlantillaPaso = function(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= plantillaPasos.length) return;
    const temp = plantillaPasos[idx];
    plantillaPasos[idx] = plantillaPasos[newIdx];
    plantillaPasos[newIdx] = temp;
    renderPlantillaPasos(plantillaPasos);
};

window.removePlantillaPaso = function(idx) {
    plantillaPasos.splice(idx, 1);
    renderPlantillaPasos(plantillaPasos);
};

window.addPlantillaPaso = function() {
    plantillaPasos.push({ titulo: '', descripcion: '', requiere_foto: 0, requiere_nota_voz: 0 });
    renderPlantillaPasos(plantillaPasos);
    const container = _clEl('checklistPasosContainer');
    if (container) {
        const lastInput = container.querySelectorAll('input[type="text"]');
        if (lastInput.length) lastInput[lastInput.length - 2]?.focus();
    }
};

async function saveChecklistPlantilla(servicioId) {
    const nombre = _clEl('checklistNombre')?.value?.trim() || '';
    const descripcion = _clEl('checklistDescripcion')?.value?.trim() || '';
    if (!nombre) { showToast('Nombre del checklist requerido', 'info'); return false; }

    const fd = new FormData();
    fd.append('action', 'save_plantilla');
    fd.append('servicio_id', servicioId);
    fd.append('nombre', nombre);
    fd.append('descripcion', descripcion);
    fd.append('pasos', JSON.stringify(plantillaPasos));

    try {
        const r = await fetch(API_CHECKLIST, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showToast('Checklist guardado', 'success'); return true; }
        else { showToast(d.message || 'Error', 'error'); return false; }
    } catch (e) { showToast('Error de conexión', 'error'); return false; }
}

async function loadChecklistPlantilla(servicioId) {
    try {
        const r = await fetch(`${API_CHECKLIST}?action=plantilla&servicio_id=${servicioId}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success' && d.data?.plantilla) {
            const p = d.data.plantilla;
            if (_clEl('checklistNombre')) _clEl('checklistNombre').value = p.nombre || '';
            if (_clEl('checklistDescripcion')) _clEl('checklistDescripcion').value = p.descripcion || '';
            renderPlantillaPasos(d.data.pasos || []);
            return true;
        }
        renderPlantillaPasos([]);
        return false;
    } catch (e) { console.error(e); return false; }
}

// ── Ejecución (Diagnóstico) ─────────────────────────────────────────────────
let checklistEjecucionData = null;

function renderChecklistBadge(servicio) {
    if (!servicio?.checklist) return '';
    const cl = servicio.checklist;
    const pct = cl.porcentaje_completado || 0;
    const color = pct >= 100 ? 'var(--success)' : pct > 0 ? 'var(--primary)' : 'var(--text-secondary)';
    return `
        <div style="margin-top:0.4rem;display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;">
            <i class="fas fa-clipboard-check" style="color:${color}"></i>
            <span style="color:${color};font-weight:600;">${cl.pasos_completados || 0}/${cl.pasos_total || 0} pasos</span>
            <div style="flex:1;height:6px;background:var(--border-color);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
            </div>
            <span style="color:${color};font-weight:600;">${pct}%</span>
            <button class="btn btn-xs btn-outline" onclick="openChecklistEjecucion(${servicio.id})" title="Abrir Checklist">
                <i class="fas fa-external-link-alt"></i>
            </button>
        </div>`;
}

window.openChecklistEjecucion = async function(diagServId) {
    try {
        const r = await fetch(`${API_CHECKLIST}?action=ejecucion&diagnostico_servicio_id=${diagServId}&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') { showToast('Error cargando checklist', 'error'); return; }

        checklistEjecucionData = d.data;
        renderChecklistModal();
    } catch (e) { showToast('Error de conexión', 'error'); }
};

function renderChecklistModal() {
    let modal = _clEl('checklistModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'checklistModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content modal-lg" style="max-width:800px;width:95%;max-height:90vh;display:flex;flex-direction:column;">
            <div class="modal-header">
                <h3><i class="fas fa-clipboard-check"></i> Checklist de Ejecución</h3>
                <button class="modal-close" onclick="_clEl('checklistModal').classList.remove('active')">&times;</button>
            </div>
            <div class="modal-body" id="checklistModalBody" style="overflow-y:auto;flex:1;"></div>
        </div>`;
        document.body.appendChild(modal);
    }

    const data = checklistEjecucionData;
    if (!data?.ejecucion) {
        _clEl('checklistModalBody').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">No hay checklist asociado</div>';
        modal.classList.add('active');
        return;
    }

    const ej = data.ejecucion;
    const pasos = data.pasos || [];
    const pct = ej.porcentaje_completado || 0;
    const apiBase = API_ROOT.replace('api/', '');

    let pasosHtml = pasos.map((p, idx) => {
        const fotos = p.fotos || [];
        const voces = p.notas_voz || [];
        const estadoClass = p.completado ? 'var(--success)' : 'var(--text-secondary)';
        const icono = p.completado ? 'fa-check-circle' : 'fa-circle';

        return `
        <div style="border:1px solid ${p.completado ? 'var(--success)' : 'var(--border-color)'};border-radius:var(--radius-md);margin-bottom:0.5rem;overflow:hidden;transition:border-color 0.3s;">
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.6rem 0.8rem;background:${p.completado ? 'rgba(16,185,129,0.05)' : 'var(--card-bg)'};">
                <i class="fas ${icono}" style="color:${estadoClass};font-size:1rem;"></i>
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">Paso ${idx + 1}: ${escapeHtml(p.titulo)}</div>
                    ${p.descripcion ? `<div style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(p.descripcion)}</div>` : ''}
                    ${p.completado && p.completado_por ? `<div style="font-size:0.7rem;color:var(--success);margin-top:0.2rem;">Completado por ${escapeHtml(p.completado_por)} ${p.completado_en ? '· ' + p.completado_en : ''}</div>` : ''}
                </div>
                ${!p.completado ? `<button class="btn btn-xs btn-success" onclick="marcarPasoCompletado(${p.id}, ${ej.id})"><i class="fas fa-check"></i> Completar</button>` : ''}
            </div>
            <div style="padding:0.4rem 0.8rem;border-top:1px solid var(--border-color);">
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                    ${fotos.length ? fotos.map(f => `
                        <div style="position:relative;display:inline-block;">
                            <img src="${apiBase}${f.ruta_archivo}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border-color);cursor:pointer;"
                                onclick="openLightbox('foto','${apiBase}${f.ruta_archivo}','${escapeHtml(f.nombre_original || '')}')">
                            <button class="btn btn-xs" style="position:absolute;top:-4px;right:-4px;background:var(--danger);color:white;border:none;border-radius:50%;width:16px;height:16px;font-size:8px;padding:0;cursor:pointer;"
                                onclick="deleteFotoPaso(${f.id})">&times;</button>
                        </div>
                    `).join('') : ''}
                    ${voces.length ? voces.map(v => `
                        <div style="display:flex;align-items:center;gap:0.3rem;background:var(--bg-secondary);padding:0.3rem 0.5rem;border-radius:var(--radius-sm);font-size:0.75rem;">
                            <i class="fas fa-microphone" style="color:var(--primary);"></i>
                            <audio src="${apiBase}${v.ruta_archivo}" controls style="height:28px;width:120px;"></audio>
                            <button class="btn btn-xs btn-outline" style="color:var(--danger);padding:0 0.3rem;" onclick="deleteNotaVoz(${v.id})"><i class="fas fa-times"></i></button>
                        </div>
                    `).join('') : ''}
                    ${!p.completado ? `
                        <button class="btn btn-xs btn-outline" onclick="uploadFotoPaso(${p.id})" title="Subir foto"><i class="fas fa-camera"></i></button>
                        <button class="btn btn-xs btn-outline" onclick="grabarNotaVoz(${p.id})" title="Grabar nota de voz" id="btnVoz_${p.id}"><i class="fas fa-microphone"></i></button>
                    ` : ''}
                </div>
                ${!p.completado ? `
                <div style="margin-top:0.3rem;">
                    <input type="text" placeholder="Notas del paso..." value="${escapeHtml(p.notas || '')}"
                        style="width:100%;font-size:0.78rem;padding:0.3rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--bg);color:var(--text-primary);"
                        onchange="savePasoNotas(${p.id}, this.value)">
                </div>` : ''}
            </div>
        </div>`;
    }).join('');

    _clEl('checklistModalBody').innerHTML = `
        <div style="margin-bottom:1rem;">
            <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(ej.nombre)}</div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.4rem;">
                <div style="flex:1;height:8px;background:var(--border-color);border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--success)' : 'var(--primary)'};border-radius:4px;transition:width 0.3s;"></div>
                </div>
                <span style="font-size:0.82rem;font-weight:600;color:${pct >= 100 ? 'var(--success)' : 'var(--primary)'};">${pct}%</span>
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
            <button class="btn btn-sm btn-outline" onclick="addPasoManual(${ej.id})"><i class="fas fa-plus"></i> Agregar Paso</button>
        </div>
        <div id="checklistPasosList">${pasosHtml}</div>
    `;
    modal.classList.add('active');
}

window.marcarPasoCompletado = async function(pasoId, ejecucionId) {
    try {
        const fd = new FormData();
        fd.append('action', 'update_paso');
        fd.append('id', pasoId);
        fd.append('completado', '1');
        fd.append('completado_por', 'Técnico');
        const r = await fetch(API_CHECKLIST, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') {
            showToast('Paso completado', 'success');
            openChecklistEjecucionFromModal(ejecucionId);
        } else showToast(d.message || 'Error', 'error');
    } catch (e) { showToast('Error de conexión', 'error'); }
};

window.savePasoNotas = async function(pasoId, notas) {
    try {
        const fd = new FormData();
        fd.append('action', 'update_paso');
        fd.append('id', pasoId);
        fd.append('notas', notas);
        await fetch(API_CHECKLIST, { method: 'POST', body: fd });
    } catch (e) { console.error(e); }
};

window.uploadFotoPaso = function(pasoId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('action', 'add_foto_paso');
        fd.append('paso_id', pasoId);
        fd.append('archivo', file);

        const kb = Math.round(file.size / 1024);
        const sizeStr = kb > 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : kb + ' KB';
        let loadEl = document.createElement('div');
        loadEl.className = 'toast toast-info show';
        loadEl.innerHTML = `
            <strong>Foto</strong>
            <span style="display:flex;flex-direction:column;gap:4px;width:100%;">
                <span class="upload-status"><i class="fas fa-spinner fa-spin"></i> Preparando ${sizeStr}…</span>
                <div class="upload-progress-bar" style="width:100%;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;">
                    <div class="upload-progress-fill" style="width:0%;height:100%;background:var(--primary,#3b82f6);border-radius:3px;transition:width 0.2s;"></div>
                </div>
                <span class="upload-pct" style="font-size:0.72rem;color:var(--text-secondary);">0%</span>
            </span>`;
        let container = document.getElementById('toastContainer');
        if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; document.body.appendChild(container); }
        container.appendChild(loadEl);

        const updateProgress = (pct, text) => {
            const fill = loadEl.querySelector('.upload-progress-fill');
            const pctLabel = loadEl.querySelector('.upload-pct');
            const status = loadEl.querySelector('.upload-status');
            if (fill) fill.style.width = pct + '%';
            if (pctLabel) pctLabel.textContent = pct + '%';
            if (status && text) status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + text;
        };
        const removeLoad = () => { if (loadEl && loadEl.parentNode) loadEl.remove(); };

        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_CHECKLIST, true);
        xhr.responseType = 'json';
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                const loaded = e.loaded < 1024 * 1024 ? (e.loaded / 1024).toFixed(0) + ' KB' : (e.loaded / (1024 * 1024)).toFixed(1) + ' MB';
                const total = e.total < 1024 * 1024 ? (e.total / 1024).toFixed(0) + ' KB' : (e.total / (1024 * 1024)).toFixed(1) + ' MB';
                updateProgress(pct, `Subiendo ${loaded} / ${total}`);
            }
        };
        xhr.onload = () => {
            removeLoad();
            const d = xhr.response;
            if (d && d.status === 'success') { showToast('Foto subida', 'success'); refreshChecklistModal(); }
            else showToast((d && d.message) || 'Error', 'error');
        };
        xhr.onerror = () => { removeLoad(); showToast('Error de conexión', 'error'); };
        xhr.send(fd);
    };
    input.click();
};

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;

window.grabarNotaVoz = async function(pasoId) {
    const btn = _clEl('btnVoz_' + pasoId);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        if (recordingTimer) clearInterval(recordingTimer);
        if (btn) { btn.innerHTML = '<i class="fas fa-microphone"></i>'; btn.classList.remove('btn-danger'); btn.classList.add('btn-outline'); }
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];
        let startTime = Date.now();

        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(audioChunks, { type: mimeType });
            const ext = mimeType.includes('webm') ? 'webm' : 'mp3';
            const file = new File([blob], `nota_voz_${Date.now()}.${ext}`, { type: mimeType });
            const duracion = Math.round((Date.now() - startTime) / 1000);

            const fd = new FormData();
            fd.append('action', 'add_nota_voz_paso');
            fd.append('paso_id', pasoId);
            fd.append('archivo', file);
            fd.append('duracion_segundos', duracion);

            const kb = Math.round(file.size / 1024);
            const sizeStr = kb > 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : kb + ' KB';
            let loadEl = document.createElement('div');
            loadEl.className = 'toast toast-info show';
            loadEl.innerHTML = `
                <strong>Audio</strong>
                <span style="display:flex;flex-direction:column;gap:4px;width:100%;">
                    <span class="upload-status"><i class="fas fa-spinner fa-spin"></i> Preparando ${sizeStr}…</span>
                    <div class="upload-progress-bar" style="width:100%;height:6px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;">
                        <div class="upload-progress-fill" style="width:0%;height:100%;background:var(--primary,#3b82f6);border-radius:3px;transition:width 0.2s;"></div>
                    </div>
                    <span class="upload-pct" style="font-size:0.72rem;color:var(--text-secondary);">0%</span>
                </span>`;
            let container = document.getElementById('toastContainer');
            if (!container) { container = document.createElement('div'); container.id = 'toastContainer'; document.body.appendChild(container); }
            container.appendChild(loadEl);

            const updateProgress = (pct, text) => {
                const fill = loadEl.querySelector('.upload-progress-fill');
                const pctLabel = loadEl.querySelector('.upload-pct');
                const status = loadEl.querySelector('.upload-status');
                if (fill) fill.style.width = pct + '%';
                if (pctLabel) pctLabel.textContent = pct + '%';
                if (status && text) status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + text;
            };
            const removeLoad = () => { if (loadEl && loadEl.parentNode) loadEl.remove(); };

            const xhr = new XMLHttpRequest();
            xhr.open('POST', API_CHECKLIST, true);
            xhr.responseType = 'json';
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    const loaded = e.loaded < 1024 * 1024 ? (e.loaded / 1024).toFixed(0) + ' KB' : (e.loaded / (1024 * 1024)).toFixed(1) + ' MB';
                    const total = e.total < 1024 * 1024 ? (e.total / 1024).toFixed(0) + ' KB' : (e.total / (1024 * 1024)).toFixed(1) + ' MB';
                    updateProgress(pct, `Subiendo ${loaded} / ${total}`);
                }
            };
            xhr.onload = () => {
                removeLoad();
                const d = xhr.response;
                if (d && d.status === 'success') { showToast('Nota de voz guardada', 'success'); refreshChecklistModal(); }
                else showToast((d && d.message) || 'Error', 'error');
            };
            xhr.onerror = () => { removeLoad(); showToast('Error de conexión', 'error'); };
            xhr.send(fd);
        };

        mediaRecorder.start();
        if (btn) { btn.innerHTML = '<i class="fas fa-stop"></i> Grabando...'; btn.classList.remove('btn-outline'); btn.classList.add('btn-danger'); }

        startTime = Date.now();
        recordingTimer = setInterval(() => {
            const secs = Math.round((Date.now() - startTime) / 1000);
            if (btn) btn.innerHTML = `<i class="fas fa-stop"></i> ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
        }, 1000);
    } catch (e) {
        showToast('No se pudo acceder al micrófono', 'error');
    }
};

window.deleteFotoPaso = async function(fotoId) {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_foto_paso');
        fd.append('id', fotoId);
        const r = await fetch(API_CHECKLIST, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showToast('Foto eliminada', 'success'); refreshChecklistModal(); }
    } catch (e) { showToast('Error', 'error'); }
};

window.deleteNotaVoz = async function(notaId) {
    if (!confirm('¿Eliminar esta nota de voz?')) return;
    try {
        const fd = new FormData();
        fd.append('action', 'delete_nota_voz_paso');
        fd.append('id', notaId);
        const r = await fetch(API_CHECKLIST, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showToast('Nota eliminada', 'success'); refreshChecklistModal(); }
    } catch (e) { showToast('Error', 'error'); }
};

window.addPasoManual = async function(ejecucionId) {
    const titulo = prompt('Título del paso:');
    if (!titulo || !titulo.trim()) return;
    const fd = new FormData();
    fd.append('action', 'add_paso');
    fd.append('ejecucion_id', ejecucionId);
    fd.append('titulo', titulo.trim());
    try {
        const r = await fetch(API_CHECKLIST, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') { showToast('Paso agregado', 'success'); refreshChecklistModal(); }
    } catch (e) { showToast('Error', 'error'); }
};

async function openChecklistEjecucionFromModal(ejecucionId) {
    try {
        // Find the diagnostico_servicio_id from the current ejecucion data
        if (checklistEjecucionData?.ejecucion?.id == ejecucionId) {
            const dsId = checklistEjecucionData.ejecucion.diagnostico_servicio_id;
            await openChecklistEjecucion(dsId);
        }
    } catch (e) { console.error(e); }
}

async function refreshChecklistModal() {
    if (checklistEjecucionData?.ejecucion) {
        await openChecklistEjecucion(checklistEjecucionData.ejecucion.diagnostico_servicio_id);
    }
}
