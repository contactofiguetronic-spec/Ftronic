/* ============================================================================
   FIGUETRONIC — CORPORATE LANDING PAGE — JavaScript
   Engineering Laboratory — Professional Automotive Workshop
   ============================================================================
   Pure vanilla JS, no frameworks.
   Features: Sticky header, scroll reveal, counters, lightbox, mobile menu,
             contact form (posts to solicitudes_api.php), smooth scroll.
   ============================================================================ */

(function () {
    'use strict';

    const API = '/admin/api/solicitudes_api.php';

    document.addEventListener('DOMContentLoaded', () => {
        initStickyHeader();
        initMobileMenu();
        initSmoothScroll();
        initScrollReveal();
        initCounters();
        initLightbox();
        initContactForm();
    });

    /* ═══════════════════════════════════════════════════════════════════════
       STICKY HEADER
       ═══════════════════════════════════════════════════════════════════════ */

    function initStickyHeader() {
        const header = document.querySelector('.header');
        if (!header) return;

        const onScroll = () => {
            header.classList.toggle('scrolled', window.scrollY > 50);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MOBILE MENU
       ═══════════════════════════════════════════════════════════════════════ */

    function initMobileMenu() {
        const hamburger = document.querySelector('.hamburger');
        const navLinks = document.querySelector('.nav-links');
        if (!hamburger || !navLinks) return;

        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('open');
            document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SMOOTH SCROLL
       ═══════════════════════════════════════════════════════════════════════ */

    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', e => {
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    const headerH = document.querySelector('.header')?.offsetHeight || 0;
                    const top = target.getBoundingClientRect().top + window.scrollY - headerH - 16;
                    window.scrollTo({ top, behavior: 'smooth' });
                }
            });
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SCROLL REVEAL (IntersectionObserver)
       ═══════════════════════════════════════════════════════════════════════ */

    function initScrollReveal() {
        const elements = document.querySelectorAll('[data-reveal]');
        if (!elements.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
        );

        elements.forEach(el => observer.observe(el));
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ANIMATED COUNTERS
       ═══════════════════════════════════════════════════════════════════════ */

    function initCounters() {
        const counters = document.querySelectorAll('[data-count]');
        if (!counters.length) return;

        const animate = (el) => {
            const target = parseInt(el.dataset.count, 10);
            const suffix = el.dataset.suffix || '';
            const duration = 2000;
            const start = performance.now();

            const step = (now) => {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(eased * target);
                el.textContent = current.toLocaleString('es-CL') + suffix;
                if (progress < 1) requestAnimationFrame(step);
            };

            requestAnimationFrame(step);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        animate(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );

        counters.forEach(el => observer.observe(el));
    }

    /* ═══════════════════════════════════════════════════════════════════════
       LIGHTBOX GALLERY
       ═══════════════════════════════════════════════════════════════════════ */

    function initLightbox() {
        const items = document.querySelectorAll('.portfolio-item');
        const lightbox = document.querySelector('.lightbox');
        if (!items.length || !lightbox) return;

        const imgEl = lightbox.querySelector('img');
        const counterEl = lightbox.querySelector('.lightbox-counter');
        const closeBtn = lightbox.querySelector('.lightbox-close');
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');

        let currentIndex = 0;
        const images = Array.from(items).map(item => ({
            src: item.querySelector('img')?.src,
            alt: item.querySelector('img')?.alt || ''
        }));

        function open(index) {
            currentIndex = index;
            update();
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function close() {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }

        function update() {
            if (imgEl) {
                imgEl.src = images[currentIndex].src;
                imgEl.alt = images[currentIndex].alt;
            }
            if (counterEl) {
                counterEl.textContent = `${currentIndex + 1} / ${images.length}`;
            }
        }

        function prev() {
            currentIndex = (currentIndex - 1 + images.length) % images.length;
            update();
        }

        function next() {
            currentIndex = (currentIndex + 1) % images.length;
            update();
        }

        items.forEach((item, i) => {
            item.addEventListener('click', () => open(i));
        });

        closeBtn?.addEventListener('click', close);
        prevBtn?.addEventListener('click', prev);
        nextBtn?.addEventListener('click', next);

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) close();
        });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowLeft') prev();
            if (e.key === 'ArrowRight') next();
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CONTACT FORM — Calendar + Time Slots + Media Upload
       ═══════════════════════════════════════════════════════════════════════ */

    let calYear, calMonth;
    let availableDays = [];
    let selectedSlot = null;
    let uploadedFiles = [];
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let voiceTimerInterval = null;
    let voiceSeconds = 0;

    function initContactForm() {
        const form = document.getElementById('visit-form');
        if (!form) return;

        const now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth() + 1;

        document.getElementById('calPrev')?.addEventListener('click', () => { calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; } loadCalendar(); });
        document.getElementById('calNext')?.addEventListener('click', () => { calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; } loadCalendar(); });

        document.getElementById('voiceBtn')?.addEventListener('click', toggleVoiceNote);

        setupUploadZone();
        loadCalendar();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validateForm()) return;

            const submitBtn = document.getElementById('submitBtn');
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            hideFormError();

            try {
                const fd = new FormData();
                fd.append('action', 'enviar');
                fd.append('slot_id', selectedSlot.id);
                fd.append('fecha_solicitada', selectedSlot.fecha);
                fd.append('hora_solicitada', selectedSlot.hora_inicio);

                fd.append('cliente_nombre', document.getElementById('v-nombre')?.value.trim() || '');
                fd.append('cliente_telefono', document.getElementById('v-telefono')?.value.trim() || '');

                fd.append('vehiculo_marca', document.getElementById('v-marca')?.value.trim() || '');
                fd.append('vehiculo_modelo', document.getElementById('v-modelo')?.value.trim() || '');
                fd.append('vehiculo_anio', document.getElementById('v-ano')?.value.trim() || '');
                fd.append('vehiculo_patente', document.getElementById('v-patente')?.value.trim().toUpperCase() || '');
                fd.append('vehiculo_color', document.getElementById('v-color')?.value.trim() || '');

                fd.append('motivo', document.getElementById('v-motivo')?.value.trim() || '');

                uploadedFiles.forEach(f => fd.append('archivos[]', f));

                const res = await fetch(API, { method: 'POST', body: fd });
                const json = await res.json();

                if (json.status === 'success') {
                    document.getElementById('visit-form').reset();
                    selectedSlot = null;
                    uploadedFiles = [];
                    renderPreviewGrid();
                    hideSlots();
                    document.getElementById('selectedSummary')?.classList.remove('visible');
                    document.getElementById('calGrid') && renderCalendar();
                    showConfirmation(json.data?.folio || 'SOL-????');
                } else {
                    showFormError(json.message || 'Error al enviar. Intenta nuevamente.');
                }
            } catch (err) {
                showFormError('Error de conexion. Verifica tu internet.');
                console.error('Form error:', err);
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });

        const modal = document.querySelector('.modal-overlay');
        modal?.querySelector('.modal-close')?.addEventListener('click', () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CALENDAR
       ═══════════════════════════════════════════════════════════════════════ */

    async function loadCalendar() {
        try {
            const res = await fetch(`${API}?action=calendario&year=${calYear}&month=${calMonth}`);
            const json = await res.json();
            availableDays = json.data || [];
        } catch (err) {
            console.error('Calendar load error:', err);
            availableDays = [];
        }
        renderCalendar();
    }

    function renderCalendar() {
        const grid = document.getElementById('calGrid');
        if (!grid) return;

        const label = document.getElementById('calMonthLabel');
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        if (label) label.textContent = `${monthNames[calMonth - 1]} ${calYear}`;

        const firstDay = new Date(calYear, calMonth - 1, 1);
        const lastDay = new Date(calYear, calMonth, 0);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const totalDays = lastDay.getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        let html = '';
        for (let i = 0; i < startOffset; i++) html += '<span class="cal-day empty"></span>';

        for (let d = 1; d <= totalDays; d++) {
            const fecha = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayData = availableDays.find(ad => ad.fecha === fecha);
            const hasSlots = dayData && parseInt(dayData.disponibles) > 0;
            const isToday = fecha === todayStr;
            const isSelected = selectedSlot && selectedSlot.fecha === fecha;

            let cls = 'cal-day';
            if (isToday) cls += ' today';
            if (isSelected) cls += ' selected';
            if (hasSlots) cls += ' has-slots'; else cls += ' disabled';

            const onclick = hasSlots ? ` onclick="window._corpSelectDate('${fecha}')"` : '';
            html += `<span class="${cls}" data-date="${fecha}"${onclick}><span class="cal-num">${d}</span></span>`;
        }

        grid.innerHTML = html;
    }

    window._corpSelectDate = async function (fecha) {
        selectedSlot = null;
        document.getElementById('selectedSummary')?.classList.remove('visible');

        const slotsSection = document.getElementById('slotsSection');
        const slotsLabel = document.getElementById('slotsLabel');
        const slotsGrid = document.getElementById('slotsGrid');
        const slotsLoading = document.getElementById('slotsLoading');

        if (slotsLabel) slotsLabel.textContent = `Horarios para ${formatDateDisplay(fecha)}`;
        if (slotsGrid) slotsGrid.innerHTML = '';
        if (slotsLoading) slotsLoading.classList.add('visible');
        slotsSection?.classList.add('visible');

        renderCalendar();

        try {
            const res = await fetch(`${API}?action=slots&fecha=${fecha}`);
            const json = await res.json();
            const slots = json.data || [];
            renderSlots(fecha, slots);
        } catch (err) {
            if (slotsGrid) slotsGrid.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;">Error al cargar horarios</p>';
        } finally {
            if (slotsLoading) slotsLoading.classList.remove('visible');
        }
    };

    function hideSlots() {
        document.getElementById('slotsSection')?.classList.remove('visible');
        document.getElementById('slotsGrid').innerHTML = '';
    }

    function renderSlots(fecha, slots) {
        const grid = document.getElementById('slotsGrid');
        if (!grid) return;

        if (!slots.length) {
            grid.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;">No hay horarios disponibles para esta fecha</p>';
            return;
        }

        grid.innerHTML = slots.map(slot => {
            const h1 = parseInt(slot.hora_inicio.split(':')[0]);
            const m1 = slot.hora_inicio.split(':')[1];
            const h2 = parseInt(slot.hora_fin.split(':')[0]);
            const m2 = slot.hora_fin.split(':')[1];
            const ampm1 = h1 >= 12 ? 'PM' : 'AM';
            const ampm2 = h2 >= 12 ? 'PM' : 'AM';
            const timeStr = `${h1 % 12 || 12}:${m1} ${ampm1} — ${h2 % 12 || 12}:${m2} ${ampm2}`;
            const slotJson = JSON.stringify(slot).replace(/"/g, '&quot;');
            return `<button type="button" class="time-pill" data-slot-id="${slot.id}" onclick="window._corpSelectSlot(${slotJson})"><i class="fas fa-clock"></i> ${timeStr}</button>`;
        }).join('');
    }

    window._corpSelectSlot = function (slot) {
        selectedSlot = slot;
        document.querySelectorAll('.time-pill').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.slotId == slot.id);
        });
        const summary = document.getElementById('selectedSummary');
        const dt = document.getElementById('ssDateTime');
        if (dt) dt.textContent = `${formatDateDisplay(slot.fecha)} — ${formatTime(slot.hora_inicio)} a ${formatTime(slot.hora_fin)}`;
        summary?.classList.add('visible');
    };

    function formatDateDisplay(fecha) {
        const parts = fecha.split('-');
        const d = parseInt(parts[2]);
        const m = parseInt(parts[1]);
        const y = parts[0];
        const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        return `${d} de ${monthNames[m - 1]} de ${y}`;
    }

    function formatTime(hhmm) {
        const [h, m] = hhmm.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${hour % 12 || 12}:${m} ${ampm}`;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FILE UPLOAD
       ═══════════════════════════════════════════════════════════════════════ */

    function setupUploadZone() {
        const zone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        if (!zone || !fileInput) return;

        zone.addEventListener('click', (e) => {
            if (e.target.closest('.remove-thumb')) return;
            fileInput.click();
        });

        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
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

        if (rejected > 0) showToast('Solo PNG, JPG, MP4 y WebM (max 10MB c/u)', 'error');
        renderPreviewGrid();
    }

    function renderPreviewGrid() {
        const grid = document.getElementById('previewGrid');
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
                item.innerHTML = '<i class="fas fa-video" style="font-size:1.5rem;color:var(--accent)"></i>';
            } else {
                item.innerHTML = '<i class="fas fa-microphone" style="font-size:1.5rem;color:var(--danger)"></i>';
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-thumb';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.addEventListener('click', (e) => { e.stopPropagation(); uploadedFiles.splice(i, 1); renderPreviewGrid(); });
            item.appendChild(removeBtn);

            const name = document.createElement('span');
            name.className = 'thumb-name';
            name.textContent = file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name;
            item.appendChild(name);

            grid.appendChild(item);
        });

        const zone = document.getElementById('uploadZone');
        let counter = zone?.querySelector('.file-counter');
        if (!counter) {
            counter = document.createElement('div');
            counter.className = 'file-counter';
            zone?.appendChild(counter);
        }
        counter.textContent = uploadedFiles.length > 0 ? `${uploadedFiles.length}/10 archivos` : '';
        counter.style.display = uploadedFiles.length > 0 ? 'block' : 'none';
    }

    /* ═══════════════════════════════════════════════════════════════════════
       VOICE RECORDING
       ═══════════════════════════════════════════════════════════════════════ */

    async function toggleVoiceNote() {
        const btn = document.getElementById('voiceBtn');
        const label = document.getElementById('voiceLabel');
        const timer = document.getElementById('voiceTimer');

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
                    renderPreviewGrid();
                    stream.getTracks().forEach(t => t.stop());
                };

                mediaRecorder.start();
                isRecording = true;
                btn?.classList.add('recording');
                if (label) label.textContent = 'Grabando...';
                if (timer) { timer.classList.add('visible'); timer.textContent = '00:00'; }
                voiceSeconds = 0;
                voiceTimerInterval = setInterval(() => {
                    voiceSeconds++;
                    const m = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
                    const s = String(voiceSeconds % 60).padStart(2, '0');
                    if (timer) timer.textContent = `${m}:${s}`;
                }, 1000);
            } catch (err) {
                console.error('Mic error:', err);
                showToast('No se pudo acceder al microfono.', 'error');
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            btn?.classList.remove('recording');
            if (label) label.textContent = 'Grabar nota de voz';
            if (timer) timer.classList.remove('visible');
            clearInterval(voiceTimerInterval);
            voiceTimerInterval = null;
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       VALIDATION & SUBMISSION
       ═══════════════════════════════════════════════════════════════════════ */

    function validateForm() {
        const nombre = document.getElementById('v-nombre')?.value.trim();
        const telefono = document.getElementById('v-telefono')?.value.trim();
        const marca = document.getElementById('v-marca')?.value.trim();
        const modelo = document.getElementById('v-modelo')?.value.trim();
        const anio = document.getElementById('v-ano')?.value.trim();
        const motivo = document.getElementById('v-motivo')?.value.trim();

        if (!selectedSlot) { showFormError('Selecciona una fecha y horario disponibles.'); return false; }
        if (!nombre) { showFormError('Ingresa tu nombre completo.'); return false; }
        if (!telefono) { showFormError('Ingresa tu telefono de contacto.'); return false; }
        if (!marca) { showFormError('Ingresa la marca del vehiculo.'); return false; }
        if (!modelo) { showFormError('Ingresa el modelo del vehiculo.'); return false; }
        if (!anio) { showFormError('Ingresa el ano del vehiculo.'); return false; }
        if (!motivo) { showFormError('Describe el motivo de la visita.'); return false; }

        hideFormError();
        return true;
    }

    function showFormError(msg) {
        const el = document.getElementById('formError');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('visible');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideFormError() {
        document.getElementById('formError')?.classList.remove('visible');
    }

    function showConfirmation(folio) {
        const modal = document.querySelector('.modal-overlay');
        if (!modal) return;
        const folioEl = modal.querySelector('.folio');
        if (folioEl) folioEl.textContent = `Folio: ${folio}`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /* ═══════════════════════════════════════════════════════════════════════
       TOAST NOTIFICATION
       ═══════════════════════════════════════════════════════════════════════ */

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
        toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;align-items:center;gap:10px;padding:14px 24px;border-radius:10px;background:${type === 'error' ? '#fef2f2' : type === 'success' ? '#f0fdf4' : '#eff6ff'};color:${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#2563eb'};border:1px solid ${type === 'error' ? '#fecaca' : type === 'success' ? '#bbf7d0' : '#bfdbfe'};box-shadow:0 10px 25px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;font-size:0.92rem;font-weight:500;animation:slideInToast 0.3s ease;`;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

})();
