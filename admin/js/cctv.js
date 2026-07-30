// cctv.js — Módulo Cámaras CCTV (Dahua)
(function () {
    'use strict';

    const API_CCTV = API_ROOT + 'cctv_api.php';

    let STATE = {
        dispositivos: [],
        camaras: [],
        snapshotInterval: 10,
        liveTimer: null,
        liveActual: null,   // { dispositivo_id, canal, nombre }
        liveCloudUrl: '',
        livePaused: false,
        liveRetries: 0,
    };
    let hlsInstance = null;

    function fd(action, obj) {
        const f = new FormData();
        f.append('action', action);
        if (obj) Object.keys(obj).forEach(k => f.append(k, obj[k]));
        return f;
    }

    function getJSON(url) {
        return fetch(url, { credentials: 'same-origin' }).then(r => r.json());
    }

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        document.querySelectorAll('.dfc-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
        el('btnRefresh').addEventListener('click', loadAll);
        el('btnNuevoDispositivo').addEventListener('click', () => openDispositivoModal());
        el('btnGuardarDispositivo').addEventListener('click', guardarDispositivo);
        el('disp-clave-cambiar').addEventListener('change', function () {
            el('disp-clave').style.display = this.checked ? '' : 'none';
            if (this.checked) { el('disp-clave').focus(); }
            else { el('disp-clave').value = ''; }
        });
        initPtzPanel();
        el('btnGuardarConfig').addEventListener('click', guardarConfig);
        el('btnGuardarCamara').addEventListener('click', guardarCamara);
        el('btnLiveCloud').addEventListener('click', () => { if (STATE.liveCloudUrl) window.open(STATE.liveCloudUrl, '_blank'); });
        el('btnLiveDolynk').addEventListener('click', verViaDolynk);
        el('btnLiveDolynkAdd').addEventListener('click', agregarDolynk);
        el('btnLiveDolynkStatus').addEventListener('click', estadoDolynk);
        el('btnLivePause').addEventListener('click', togglePause);
        el('btnLiveQuality').addEventListener('click', toggleQuality);
        el('btnCopyDolynk').addEventListener('click', () => {
            const v = el('liveDolynkUrl').value;
            if (!v) return;
            if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => showInfo('URL copiada')).catch(() => {});
            else { el('liveDolynkUrl').select(); document.execCommand && document.execCommand('copy'); }
        });
        el('btnGuardarDolynk').addEventListener('click', guardarDolynk);
        loadAll();
        loadConfig();
        setupReactiveRefresh(loadAll);
    }

    function loadAll() {
        loadDispositivos();
        loadCamaras();
    }

    function switchTab(name) {
        document.querySelectorAll('.dfc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.dfc-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
        if (name === 'camaras') startLiveIfOpen();
    }

    /* ═════════════════════════════ DISPOSITIVOS ═════════════════════════════ */
    function loadDispositivos() {
        apiFetch(API_CCTV, fd('dispositivos')).then(res => {
            if (res.status === 'success') {
                STATE.dispositivos = res.data || [];
            } else {
                STATE.dispositivos = [];
                console.error('cctv dispositivos:', res.message);
            }
            renderDispositivos();
            updateStats();
        });
    }

    function renderDispositivos() {
        const wrap = el('dispositivosList');
        if (!STATE.dispositivos.length) {
            wrap.innerHTML = '<div class="dfc-empty"><i class="fas fa-server"></i><p>No hay dispositivos registrados. Agregue el DVR Dahua del taller.</p></div>';
            return;
        }
        wrap.innerHTML = STATE.dispositivos.map(d => `
            <div class="dfc-dev-block" data-dev="${d.id}">
                <div class="dfc-dev">
                    <div class="dfc-dev-info">
                        <h4>${escapeHtml(d.nombre)} ${d.activo ? '' : '<span class="dfc-stat-label" style="color:#ef4444;">(inactivo)</span>'}</h4>
                        <div><span class="dfc-p2p">${escapeHtml(d.device_id_p2p || '—')}</span></div>
                        <div class="dfc-meta">${escapeHtml(d.tipo || 'DVR')}${d.ip_local ? ' · ' + escapeHtml(d.ip_local) : ''}${d.tiene_clave ? ' · 🔒 clave configurada' : ' · ⚠ clave pendiente'}</div>
                    </div>
                    <div class="dfc-dev-actions">
                        <button class="dfc-btn dfc-btn-secondary dfc-btn-sm" onclick="CCTV.abrirNube(${d.id})"><i class="fas fa-cloud"></i> Nube</button>
                        <button class="dfc-btn dfc-btn-secondary dfc-btn-sm" onclick="CCTV.editarDispositivo(${d.id})"><i class="fas fa-edit"></i></button>
                        <button class="dfc-btn dfc-btn-danger dfc-btn-sm" onclick="CCTV.eliminarDispositivo(${d.id})"><i class="fas fa-trash"></i></button>
                        <button class="dfc-btn dfc-btn-primary dfc-btn-sm" onclick="CCTV.abrirCamara(${d.id})"><i class="fas fa-plus"></i> Cámara</button>
                    </div>
                </div>
                <div class="dfc-cam-list" id="camlist-${d.id}">
                    ${renderCamarasDeDispositivo(d.id)}
                </div>
            </div>`).join('');
    }

    function renderCamarasDeDispositivo(devId) {
        const cams = STATE.camaras.filter(c => c.dispositivo_id == devId);
        if (!cams.length) return '<div class="dfc-cam-empty">Sin cámaras. Agregue los canales de este DVR con el botón "Cámara".</div>';
        const disp = STATE.dispositivos.find(d => d.id == devId) || {};
        const tieneDDNS = disp.device_id_p2p && disp.device_id_p2p.indexOf('.') !== -1;
        const puedeLive = !!(disp.ip_publica || disp.ip_local || tieneDDNS);
        return cams.map(c => `
            <div class="dfc-cam-row">
                <div><strong>${escapeHtml(c.nombre)}</strong> <span class="dfc-stat-label">Canal ${c.canal}</span><br><span class="dfc-meta">${escapeHtml(c.ubicacion || '')}</span></div>
                <div class="dfc-dev-actions">
                    ${puedeLive ? `<button class="dfc-btn dfc-btn-primary dfc-btn-sm" onclick="CCTV.verEnVivo(${c.id})"><i class="fas fa-play"></i> Ver</button>` : ''}
                    <button class="dfc-btn dfc-btn-secondary dfc-btn-sm" onclick="CCTV.editarCamara(${c.id})"><i class="fas fa-edit"></i></button>
                    <button class="dfc-btn dfc-btn-danger dfc-btn-sm" onclick="CCTV.eliminarCamara(${c.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    }

    function openDispositivoModal(id) {
        el('dispModalTitle').textContent = id ? 'Editar dispositivo Dahua' : 'Nuevo dispositivo Dahua';
        el('disp-id').value = id || '';
        const d = id ? STATE.dispositivos.find(x => x.id == id) : null;
        el('disp-nombre').value = d ? d.nombre : '';
        el('disp-p2p').value = d ? (d.device_id_p2p || '') : '';
        el('disp-usuario').value = d ? (d.usuario || '') : 'admin';
        el('disp-clave').value = '';
        const cambiarClave = el('disp-clave-cambiar');
        cambiarClave.checked = false;
        if (d && d.tiene_clave) {
            el('disp-clave-status').textContent = '🔒 Clave configurada. Deje el campo en blanco (y sin marcar "Cambiar clave") para mantenerla.';
            el('disp-clave').style.display = 'none';
            el('disp-clave').placeholder = 'Nueva clave';
        } else {
            el('disp-clave-status').textContent = '';
            el('disp-clave').style.display = '';
            el('disp-clave').placeholder = 'Clave del DVR';
        }
        el('disp-ip').value = d ? (d.ip_local || '') : '';
        el('disp-ip-publica').value = d ? (d.ip_publica || '') : '';
        el('disp-puerto').value = d ? (d.puerto_http || 80) : 80;
        el('disp-rtsp').value = d ? (d.puerto_rtsp || 554) : 554;
        el('disp-sdk').value = d ? (d.puerto_sdk || 37777) : 37777;
        el('disp-portal').value = d ? (d.portal_web || 'https://dhi-dms.com') : 'https://dhi-dms.com';
        el('disp-notas').value = d ? (d.notas || '') : '';
        openModal('dispositivoModal');
    }

    function guardarDispositivo() {
        const id = el('disp-id').value;
        const data = {
            id: id,
            nombre: el('disp-nombre').value.trim(),
            device_id_p2p: el('disp-p2p').value.trim(),
            usuario: el('disp-usuario').value.trim(),
            clave: el('disp-clave').value,
            ip_local: el('disp-ip').value.trim(),
            ip_publica: el('disp-ip-publica').value.trim(),
            puerto_http: el('disp-puerto').value || 80,
            puerto_rtsp: el('disp-rtsp').value || 554,
            puerto_sdk: el('disp-sdk').value || 37777,
            portal_web: el('disp-portal').value.trim(),
            notas: el('disp-notas').value.trim(),
        };
        if (!data.nombre) { showError('El nombre es obligatorio'); return; }
        const btn = el('btnGuardarDispositivo');
        setButtonLoading(btn, true);
        apiFetch(API_CCTV, fd('guardar_dispositivo', data)).then(res => {
            setButtonLoading(btn, false);
            if (res.status === 'success') {
                showSuccess(res.message || 'Dispositivo guardado');
                closeModal('dispositivoModal');
                loadDispositivos();
            } else {
                showError(res.message || 'No se pudo guardar');
            }
        });
    }

    function eliminarDispositivo(id) {
        if (!confirm('¿Eliminar este dispositivo y sus cámaras?')) return;
        apiFetch(API_CCTV, fd('eliminar_dispositivo', { id })).then(res => {
            if (res.status === 'success') { showSuccess('Dispositivo eliminado'); loadAll(); }
            else showError(res.message || 'Error');
        });
    }

    /* ═════════════════════════════════ CÁMARAS ═══════════════════════════════ */
    function loadCamaras() {
        apiFetch(API_CCTV, fd('camaras')).then(res => {
            if (res.status === 'success') {
                STATE.camaras = res.data || [];
            } else {
                STATE.camaras = [];
                console.error('cctv camaras:', res.message);
            }
            renderCamaras();
            renderDispositivos();
            updateStats();
        });
    }

    function renderCamaras() {
        const grid = el('camarasGrid');
        if (!STATE.camaras.length) {
            grid.innerHTML = '<div class="dfc-empty"><i class="fas fa-video"></i><p>No hay cámaras configuradas. Registre un dispositivo y agregue sus canales.</p></div>';
            return;
        }
        grid.innerHTML = STATE.camaras.map(c => {
            const disp = STATE.dispositivos.find(d => d.id == c.dispositivo_id) || {};
            // DVR es alcanzable si tiene ip_publica, ip_local, o device_id_p2p con puntos (DDNS)
            const tieneDDNS = disp.device_id_p2p && disp.device_id_p2p.indexOf('.') !== -1;
            const puedeLive = !!(disp.ip_publica || disp.ip_local || tieneDDNS);
            const puedeNube = !!(disp.device_id_p2p || disp.portal_web);
            return `
            <div class="dfc-cam">
                <div class="dfc-cam-head">
                    <h3><span class="dfc-dot ${puedeLive ? '' : 'off'}"></span> ${escapeHtml(c.nombre)}</h3>
                    <span class="dfc-stat-label">Canal ${c.canal}</span>
                </div>
                <div class="dfc-cam-img" id="cam-img-${c.id}">
                    <div class="dfc-cam-placeholder"><i class="fas fa-video"></i><span>${escapeHtml(disp.nombre || '')}</span></div>
                </div>
                <div class="dfc-cam-meta">${escapeHtml(c.ubicacion || 'Sin ubicación')}</div>
                <div class="dfc-cam-actions">
                    ${puedeLive ? `<button class="dfc-btn dfc-btn-primary dfc-btn-sm" onclick="CCTV.verEnVivo(${c.id})"><i class="fas fa-play"></i> Ver en vivo</button>` : ''}
                    ${puedeNube ? `<button class="dfc-btn dfc-btn-secondary dfc-btn-sm" onclick="CCTV.abrirNube(${c.dispositivo_id})"><i class="fas fa-cloud"></i> Nube</button>` : ''}
                    <button class="dfc-btn dfc-btn-secondary dfc-btn-sm" onclick="CCTV.snapshotManual(${c.id})"><i class="fas fa-camera"></i> Snapshot</button>
                </div>
            </div>`;
        }).join('');
        // Cargar primer snapshot best-effort para cada cámara con DVR alcanzable
        STATE.camaras.forEach(c => {
            const disp = STATE.dispositivos.find(d => d.id == c.dispositivo_id) || {};
            const tieneDDNS = disp.device_id_p2p && disp.device_id_p2p.indexOf('.') !== -1;
            if (disp.ip_publica || disp.ip_local || tieneDDNS) cargarSnapshotEn(c.id, disp.id, c.canal, false);
        });
    }

    function cargarSnapshotEn(camId, dispId, canal, forzarVivo) {
        const wrap = el('cam-img-' + camId) || (forzarVivo ? el('liveImgWrap') : null);
        if (!wrap) return;
        // Para thumbnails del grid, usar snapshot (imagen estática) — más confiable
        if (!forzarVivo) {
            const img = new Image();
            img.onload = function () { wrap.innerHTML = ''; wrap.appendChild(img); };
            img.onerror = function () {
                wrap.innerHTML = '<div class="dfc-cam-placeholder"><i class="fas fa-video-slash"></i><span>Sin conexión</span></div>';
            };
            img.src = `${API_CCTV}?action=snapshot&dispositivo_id=${dispId}&canal=${canal}&_t=${Date.now()}`;
            return;
        }
        // Para live modal: primero snapshot para confirmar que el DVR responde
        const img = new Image();
        img.onload = function () {
            wrap.innerHTML = '';
            wrap.appendChild(img);
            STATE.liveRetries = 0;
            el('liveStatus').textContent = '';
            // Ahora intentar stream MJPEG continuo
            setTimeout(() => {
                const imgStream = new Image();
                imgStream.onload = function () { wrap.innerHTML = ''; wrap.appendChild(imgStream); };
                imgStream.onerror = function () {
                    // Mantener el snapshot como fallback
                    el('liveStatus').textContent = 'Stream MJPEG no disponible. Mostrando snapshot.';
                };
                const btnQ = el('btnLiveQuality');
                const st = btnQ ? (btnQ.dataset.subtype || '1') : '1';
                imgStream.src = `${API_CCTV}?action=stream&dispositivo_id=${dispId}&canal=${canal}&subtype=${st}&_t=${Date.now()}`;
            }, 500);
        };
        img.onerror = function () {
            if (STATE.liveRetries < 3) {
                STATE.liveRetries++;
                el('liveStatus').textContent = 'Reintentando... (' + STATE.liveRetries + '/3)';
                setTimeout(() => cargarSnapshotEn(camId, dispId, canal, true), 3000);
                return;
            }
            wrap.innerHTML = '<div class="dfc-cam-placeholder"><i class="fas fa-cloud"></i><span>No se pudo conectar al DVR.<br>Use "Abrir en nube Dahua".</span></div>';
            el('liveStatus').textContent = 'El DVR no es alcanzable. Verifique IP pública/DDNS y port-forward.';
        };
        const btnQ = el('btnLiveQuality');
        const st = btnQ ? (btnQ.dataset.subtype || '1') : '1';
        img.src = `${API_CCTV}?action=snapshot&dispositivo_id=${dispId}&canal=${canal}&_t=${Date.now()}`;
    }

    function verEnVivo(camId) {
        const c = STATE.camaras.find(x => x.id == camId);
        if (!c) return;
        const disp = STATE.dispositivos.find(d => d.id == c.dispositivo_id) || {};
        const tieneDDNS = disp.device_id_p2p && disp.device_id_p2p.indexOf('.') !== -1;
        STATE.liveActual = { dispositivo_id: disp.id, canal: c.canal, nombre: c.nombre, device_id_p2p: disp.device_id_p2p, ip_local: disp.ip_local, ip_publica: disp.ip_publica, tieneDDNS };
        STATE.liveDolynkUrl = '';
        STATE.livePaused = false;
        STATE.liveRetries = 0;
        el('liveTitle').textContent = 'Vista en vivo · ' + c.nombre;
        el('liveStatus').textContent = '';
        el('liveDolynkWrap').style.display = 'none';
        el('liveImgWrap').innerHTML = '<div class="dfc-cam-placeholder"><i class="fas fa-spinner fa-spin"></i><span>Cargando...</span></div>';
        // Reset play/pause button
        const btnPause = el('btnLivePause');
        if (btnPause) { btnPause.innerHTML = '<i class="fas fa-pause"></i>'; btnPause.title = 'Pausar'; }
        // Reset quality toggle
        const btnQuality = el('btnLiveQuality');
        if (btnQuality) { btnQuality.dataset.subtype = '1'; btnQuality.innerHTML = '<i class="fas fa-signal"></i> Sub-stream'; }
        openModal('liveModal');
        getJSON(`${API_CCTV}?action=nube_url&dispositivo_id=${disp.id}`).then(r => {
            if (r.status === 'success') STATE.liveCloudUrl = r.data.url;
        });
        cargarSnapshotEn(0, disp.id, c.canal, true);
    }

    function startLiveRefresh() { stopLiveRefresh(); }
    function stopLiveRefresh() { if (STATE.liveTimer) { clearInterval(STATE.liveTimer); STATE.liveTimer = null; } }

    function startLiveIfOpen() { /* no-op: el refresh vive solo en el modal */ }

    function snapshotManual(camId) {
        const c = STATE.camaras.find(x => x.id == camId);
        if (!c) return;
        const disp = STATE.dispositivos.find(d => d.id == c.dispositivo_id) || {};
        const tieneDDNS = disp.device_id_p2p && disp.device_id_p2p.indexOf('.') !== -1;
        if (disp.ip_publica || disp.ip_local || tieneDDNS) {
            window.open(`${API_CCTV}?action=snapshot&dispositivo_id=${disp.id}&canal=${c.canal}&_t=${Date.now()}`, '_blank');
        } else if (disp.device_id_p2p) {
            fetch(`${API_CCTV}?action=dolynk_snapshot&dispositivo_id=${disp.id}&canal=${c.canal}`, { credentials: 'same-origin' })
                .then(r => r.json()).then(res => {
                    if (res.status !== 'success') { showError(res.message || 'Snapshot nube falló'); return; }
                    const url = (res.data && (res.data.url || res.data.snapUrl)) || null;
                    if (url) window.open(url, '_blank');
                    else { showInfo('DoLynk no devolvió URL de snapshot.'); console.log(res.data); }
                });
        } else {
            showInfo('Esta cámara no tiene DVR expuesto ni ID P2P.');
        }
    }

    function togglePause() {
        if (!STATE.liveActual) return;
        STATE.livePaused = !STATE.livePaused;
        const btnPause = el('btnLivePause');
        const imgWrap = el('liveImgWrap');
        if (STATE.livePaused) {
            btnPause.innerHTML = '<i class="fas fa-play"></i>';
            btnPause.title = 'Reanudar';
            // Pause video if HLS
            const video = imgWrap.querySelector('video');
            if (video) video.pause();
            // Pause img MJPEG by stopping reload
            const img = imgWrap.querySelector('img');
            if (img) img.src = '';
            el('liveStatus').textContent = 'Pausado';
        } else {
            btnPause.innerHTML = '<i class="fas fa-pause"></i>';
            btnPause.title = 'Pausar';
            // Resume: reload stream
            const la = STATE.liveActual;
            STATE.liveRetries = 0;
            cargarSnapshotEn(0, la.dispositivo_id, la.canal, true);
            el('liveStatus').textContent = '';
        }
    }

    function toggleQuality() {
        if (!STATE.liveActual) return;
        const btn = el('btnLiveQuality');
        const current = parseInt(btn.dataset.subtype || '1', 10);
        const next = current === 1 ? 0 : 1;
        btn.dataset.subtype = next;
        btn.innerHTML = next === 1
            ? '<i class="fas fa-signal"></i> Sub-stream'
            : '<i class="fas fa-signal"></i> Main stream';
        // Reload stream with new subtype
        STATE.liveRetries = 0;
        const la = STATE.liveActual;
        cargarSnapshotEn(0, la.dispositivo_id, la.canal, true);
    }

    function abrirNube(dispId) {
        getJSON(`${API_CCTV}?action=nube_url&dispositivo_id=${dispId}`).then(r => {
            if (r.status === 'success') {
                window.open(r.data.url, '_blank');
                if (r.data.device_id_p2p) showInfo('ID P2P para DMSS: ' + r.data.device_id_p2p);
            } else {
                showError(r.message || 'No se pudo obtener el acceso a la nube');
            }
        });
    }

    /* ═════════════════════════════════ STATS ═══════════════════════════════ */
    function updateStats() {
        const ds = STATE.dispositivos;
        el('statDevices').textContent = ds.length;
        el('statCamaras').textContent = STATE.camaras.length;
        el('statNube').textContent = ds.filter(d => d.device_id_p2p || d.portal_web).length;
        el('statOnline').textContent = ds.filter(d => d.ip_local).length;
    }

    /* ═════════════════════════════════ CONFIG ═══════════════════════════════ */
    function loadConfig() {
        // Config local del módulo (no persistente en BD por ahora)
        const saved = {};
        try { Object.assign(saved, JSON.parse(localStorage.getItem('cctv_config') || '{}')); } catch (e) {}
        STATE.snapshotInterval = saved.snapshotInterval || 10;
        el('cfgSnapshotInterval').value = STATE.snapshotInterval;
        el('cfgNotas').value = saved.notas || '';
        cargarDolynkConfig();
    }

    function cargarDolynkConfig() {
        apiFetch(API_CCTV, fd('dolynk_config')).then(res => {
            if (res.status !== 'success' || !res.data) return;
            el('cfgDolynkAk').value = res.data.ak || '';
            el('cfgDolynkPid').value = res.data.pid || '';
            el('cfgDolynkRegion').value = res.data.region || 'sg';
            el('dolynkStatus').textContent = res.data.configured
                ? '✓ Credenciales configuradas'
                : '⚠ Falta configurar AccessKey/SecretKey';
            el('dolynkStatus').style.color = res.data.configured ? '#16a34a' : '#b45309';
        });
    }

    function guardarDolynk() {
        const data = {
            ak: el('cfgDolynkAk').value.trim(),
            sk: el('cfgDolynkSk').value.trim(),
            pid: el('cfgDolynkPid').value.trim(),
            region: el('cfgDolynkRegion').value,
        };
        if (!data.ak || !data.sk || !data.pid) { showError('AccessKey, SecretAccessKey y ProductId son obligatorios'); return; }
        const btn = el('btnGuardarDolynk');
        setButtonLoading(btn, true);
        apiFetch(API_CCTV, fd('dolynk_save', data)).then(res => {
            setButtonLoading(btn, false);
            if (res.status === 'success') { showSuccess('Credenciales DoLynk guardadas'); cargarDolynkConfig(); }
            else showError(res.message || 'No se pudo guardar');
        });
    }

    function guardarConfig() {
        const cfg = {
            snapshotInterval: parseInt(el('cfgSnapshotInterval').value, 10) || 10,
            notas: el('cfgNotas').value,
        };
        STATE.snapshotInterval = cfg.snapshotInterval;
        localStorage.setItem('cctv_config', JSON.stringify(cfg));
        showSuccess('Configuración guardada');
    }

    function verViaDolynk() {
        if (!STATE.liveActual) { showInfo('Abra una vista en vivo para usar DoLynk.'); return; }
        const btn = el('btnLiveDolynk');
        setButtonLoading(btn, true);
        el('liveStatus').textContent = 'Solicitando stream HLS a DoLynk...';
        ensureHlsJs(() => {
            const url = `${API_CCTV}?action=dolynk_hls&dispositivo_id=${STATE.liveActual.dispositivo_id}&canal=${STATE.liveActual.canal}&stream_type=1`;
            fetch(url, { credentials: 'same-origin' }).then(r => r.json()).then(res => {
                setButtonLoading(btn, false);
                if (res.status !== 'success') { showError(res.message || 'DoLynk falló'); el('liveStatus').textContent = res.message || 'DoLynk falló'; return; }
                const d = res.data || {};
                const list = d.streamList || [];
                const m3u8 = (list[0] && list[0].hls) || d.hls || null;
                if (!m3u8) {
                    showInfo('DoLynk no devolvió HLS. El dispositivo debe estar vinculado y online en DoLynk.');
                    el('liveStatus').textContent = 'Sin HLS. ¿El DVR está agregado y online en DoLynk?';
                    console.log('DoLynk HLS response:', d);
                    return;
                }
                playHls(m3u8);
                el('liveStatus').textContent = 'Transmisión HLS DoLynk cargada.';
                showSuccess('Video en vivo (DoLynk HLS)');
            }).catch(e => {
                setButtonLoading(btn, false);
                showError('Error al consultar DoLynk: ' + e.message);
            });
        });
    }

    function ensureHlsJs(cb) {
        if (window.Hls) return cb();
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
        s.onload = cb;
        s.onerror = () => { el('liveStatus').textContent = 'No se pudo cargar hls.js (CDN).'; };
        document.head.appendChild(s);
    }

    function playHls(src) {
        const wrap = el('liveImgWrap');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
        const video = document.createElement('video');
        video.id = 'liveHls';
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        wrap.appendChild(video);
        if (window.Hls && window.Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(src);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.ERROR, (evt, data) => {
                if (data && data.fatal) {
                    el('liveStatus').textContent = 'Error HLS: ' + (data.details || data.type);
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src; // Safari/iOS nativo
        } else {
            el('liveStatus').textContent = 'Este navegador no soporta HLS.';
        }
    }

    function agregarDolynk() {
        if (!STATE.liveActual) { showInfo('Abra una vista en vivo para usar DoLynk.'); return; }
        const btn = el('btnLiveDolynkAdd');
        setButtonLoading(btn, true);
        apiFetch(API_CCTV, fd('dolynk_add', { dispositivo_id: STATE.liveActual.dispositivo_id })).then(res => {
            setButtonLoading(btn, false);
            if (res.status === 'success') { showSuccess('Dispositivo agregado a DoLynk'); el('liveStatus').textContent = 'Agregado a DoLynk. Ahora prueba “Ver vía DoLynk”.'; }
            else showError(res.message || 'No se pudo agregar a DoLynk');
        });
    }

    function estadoDolynk() {
        if (!STATE.liveActual) { showInfo('Abra una vista en vivo para usar DoLynk.'); return; }
        const btn = el('btnLiveDolynkStatus');
        setButtonLoading(btn, true);
        apiFetch(API_CCTV, fd('dolynk_bindinfo', { dispositivo_id: STATE.liveActual.dispositivo_id })).then(res => {
            setButtonLoading(btn, false);
            if (res.status !== 'success') { showError(res.message || 'Error'); return; }
            const d = res.data || {};
            const txt = `Enlace DoLynk — bindStatus: ${d.bindStatus || '?'} · status: ${d.status || '?'} · deviceExist: ${d.deviceExist || '?'}`;
            el('liveStatus').textContent = txt;
            showInfo(txt);
        });
    }

    // ════════════════════════════════ CÁMARAS ════════════════════════════════
    function abrirCamara(devId, camId) {
        el('camModalTitle').textContent = camId ? 'Editar cámara' : 'Nueva cámara';
        el('cam-id').value = camId || '';
        el('cam-dispositivo_id').value = devId;
        const c = camId ? STATE.camaras.find(x => x.id == camId) : null;
        el('cam-canal').value = c ? c.canal : siguienteCanal(devId);
        el('cam-nombre').value = c ? c.nombre : '';
        el('cam-ubicacion').value = c ? (c.ubicacion || '') : '';
        openModal('camaraModal');
    }

    function siguienteCanal(devId) {
        const cams = STATE.camaras.filter(c => c.dispositivo_id == devId);
        return cams.length ? Math.max.apply(null, cams.map(c => parseInt(c.canal, 10) || 0)) + 1 : 1;
    }

    function guardarCamara() {
        const data = {
            id: el('cam-id').value,
            dispositivo_id: el('cam-dispositivo_id').value,
            canal: el('cam-canal').value,
            nombre: el('cam-nombre').value.trim(),
            ubicacion: el('cam-ubicacion').value.trim(),
        };
        if (!data.nombre) { showError('El nombre de la cámara es obligatorio'); return; }
        const btn = el('btnGuardarCamara');
        setButtonLoading(btn, true);
        apiFetch(API_CCTV, fd('guardar_camara', data)).then(res => {
            setButtonLoading(btn, false);
            if (res.status === 'success') {
                showSuccess(res.message || 'Cámara guardada');
                closeModal('camaraModal');
                loadCamaras();
            } else {
                showError(res.message || 'No se pudo guardar');
            }
        });
    }

    function eliminarCamara(id) {
        if (!confirm('¿Eliminar esta cámara?')) return;
        apiFetch(API_CCTV, fd('eliminar_camara', { id })).then(res => {
            if (res.status === 'success') { showSuccess('Cámara eliminada'); loadCamaras(); }
            else showError(res.message || 'Error');
        });
    }

    /* ═════════════════════════════════ PTZ ═════════════════════════════════ */
    let ptzActiveCode = null;
    let ptzBusy = false;

    function initPtzPanel() {
        document.querySelectorAll('#ptzPanel [data-ptz]').forEach(btn => {
            const code = btn.dataset.ptz;
            const isStop = code === 'Stop';
            const fire = (mov) => {
                if (!STATE.liveActual) return;
                if (!isStop && mov === 'start' && ptzActiveCode) ptzSend('stop', ptzActiveCode, null);
                ptzSend(mov, code, btn);
            };
            if (!isStop) {
                btn.addEventListener('mousedown', (e) => { e.preventDefault(); fire('start'); });
                btn.addEventListener('mouseup',   (e) => { e.preventDefault(); fire('stop'); });
                btn.addEventListener('mouseleave',(e) => { if (ptzActiveCode === code) fire('stop'); });
                btn.addEventListener('touchstart',(e) => { e.preventDefault(); fire('start'); }, { passive:false });
                btn.addEventListener('touchend',  (e) => { e.preventDefault(); fire('stop');   }, { passive:false });
            } else {
                btn.addEventListener('click', () => fire('stop'));
            }
        });
        // Teclado (cuando el modal liveModal está visible)
        const keyMap = {
            'ArrowLeft':'Left','ArrowRight':'Right','ArrowUp':'Up','ArrowDown':'Down',
            '+':'ZoomIn','=':'ZoomIn','-':'ZoomOut','_':'ZoomOut',
        };
        document.addEventListener('keydown', (e) => {
            const m = document.getElementById('liveModal');
            if (!m || !m.classList.contains('open')) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const code = keyMap[e.key];
            if (!code || ptzActiveCode === code) return;
            e.preventDefault();
            ptzSend('start', code, null);
        });
        document.addEventListener('keyup', (e) => {
            const code = keyMap[e.key];
            if (!code || ptzActiveCode !== code) return;
            e.preventDefault();
            ptzSend('stop', code, null);
        });
    }

    function ptzSend(mov, code, btn) {
        if (!STATE.liveActual) {
            if (mov === 'start') showInfo('Abra una vista en vivo para usar PTZ.');
            return;
        }
        if (ptzBusy && mov === 'start') return;
        if (mov === 'start') {
            ptzActiveCode = code;
            if (btn) btn.classList.add('dfc-ptz-active');
        } else if (mov === 'stop') {
            ptzActiveCode = null;
            if (btn) btn.classList.remove('dfc-ptz-active');
            document.querySelectorAll('#ptzPanel [data-ptz].dfc-ptz-active').forEach(b => b.classList.remove('dfc-ptz-active'));
        }
        ptzBusy = true;
        const la = STATE.liveActual;
        const tieneDDNS = la.device_id_p2p && la.device_id_p2p.indexOf('.') !== -1;
        const target = (la.device_id_p2p && !la.ip_local && !la.ip_publica && !tieneDDNS) ? 'dolynk' : 'local';
        const data = {
            dispositivo_id: la.dispositivo_id,
            canal: la.canal,
            code: code,
            ptz_action: mov,
            arg1: mov === 'start' ? 5 : 0,
        };
        const action = target === 'dolynk' ? 'dolynk_ptz' : 'ptz';
        apiFetch(API_CCTV, fd(action, data)).then(res => {
            if (mov === 'stop') ptzBusy = false;
            if (res.status !== 'success' && mov === 'start' && !res.data?.silent) {
                showError((target === 'dolynk' ? '[DoLynk] ' : '') + (res.message || 'PTZ falló'));
            }
        }).finally(() => {
            if (mov === 'start') {
                // Liberar tras un breve tiempo para no iniciar otro start idéntico
                setTimeout(() => { ptzBusy = false; }, 80);
            }
        });
    }

    // Exponer para inline onclick
    window.CCTV = {
        verEnVivo, abrirNube, editarDispositivo: openDispositivoModal, eliminarDispositivo, snapshotManual,
        abrirCamara, editarCamara: abrirCamara, eliminarCamara,
    };

    // Limpiar timer al cerrar el modal de live
    document.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal') && e.target.id === 'liveModal') {
            stopLiveRefresh();
            if (ptzActiveCode) ptzSend('stop', ptzActiveCode, null);
        }
    });

    // Botón cerrar del modal: limpiar PTZ
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('modal-close') &&
            e.target.closest && e.target.closest('.modal') && e.target.closest('.modal').id === 'liveModal') {
            if (ptzActiveCode) ptzSend('stop', ptzActiveCode, null);
        }
    });
})();
