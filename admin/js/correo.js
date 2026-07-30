/**
 * CORREO ELECTRONICO — Dashboard Module
 * IMAP sync + inbox + reader + reply via SMTP
 */
(function () {
    'use strict';

    const API = '/admin/api/correo_api.php';
    const PER_PAGE = 25;

    let currentPage = 1;
    let currentFilter = 'all';
    let currentCuentaId = 0;
    let currentMsgId = null;
    let searchTimeout = null;
    let isSyncing = false;

    document.addEventListener('DOMContentLoaded', () => {
        loadCuentas();
        loadUnreadCount();
        loadMessages();
    });

    /* ═══════════════════════════════════════════════════════════════════════
       CUENTAS
       ═══════════════════════════════════════════════════════════════════════ */

    async function loadCuentas() {
        try {
            const res = await fetch(`${API}?action=cuentas`);
            const data = await res.json();
            const cuentas = data.data || [];
            const container = document.getElementById('cuentasList');
            if (!container) return;

            let html = `<div class="correo-account-item active" data-cuenta="0" onclick="correoSelectCuenta(0)">
                <i class="fas fa-inbox"></i> Todas
            </div>`;
            cuentas.forEach(c => {
                html += `<div class="correo-account-item" data-cuenta="${c.id}" onclick="correoSelectCuenta(${c.id})">
                    <i class="fas fa-envelope"></i> ${escapeHtml(c.email)}
                </div>`;
            });
            container.innerHTML = html;
        } catch (err) {
            console.error('Error loading cuentas:', err);
        }
    }

    async function loadUnreadCount() {
        try {
            const res = await fetch(`${API}?action=unread_count`);
            const data = await res.json();
            const info = data.data || {};
            const badge = document.getElementById('unreadBadge');
            const countEl = document.getElementById('unreadCount');

            if (info.total > 0) {
                badge.style.display = 'inline-flex';
                countEl.textContent = info.total;
            } else {
                badge.style.display = 'none';
            }

            // Update sidebar badges
            (info.cuentas || []).forEach(c => {
                const item = document.querySelector(`.correo-account-item[data-cuenta="${c.id}"]`);
                if (!item) return;
                let badgeEl = item.querySelector('.acct-badge');
                if (c.no_leidos > 0) {
                    if (!badgeEl) {
                        badgeEl = document.createElement('span');
                        badgeEl.className = 'acct-badge';
                        item.appendChild(badgeEl);
                    }
                    badgeEl.textContent = c.no_leidos;
                } else if (badgeEl) {
                    badgeEl.remove();
                }
            });
        } catch (err) {
            console.error('Error loading unread count:', err);
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       MESSAGES LIST
       ═══════════════════════════════════════════════════════════════════════ */

    async function loadMessages() {
        const container = document.getElementById('msgList');
        if (!container) return;

        const params = new URLSearchParams();
        params.set('page', currentPage);
        params.set('per_page', PER_PAGE);
        if (currentCuentaId > 0) params.set('cuenta_id', currentCuentaId);
        if (currentFilter === 'unread') params.set('leido', '0');

        const busqueda = document.getElementById('searchInput')?.value.trim();
        if (busqueda) params.set('busqueda', busqueda);

        container.innerHTML = '<div class="correo-list-empty"><i class="fas fa-spinner fa-spin"></i><span>Cargando...</span></div>';

        try {
            const res = await fetch(`${API}?action=listar&${params}`);
            const data = await res.json();
            const items = data.data?.items || [];
            const total = data.data?.total || 0;
            const totalPages = data.data?.total_pages || 1;

            document.getElementById('listCount').textContent = `${total} mensaje${total !== 1 ? 's' : ''}`;

            if (items.length === 0) {
                container.innerHTML = '<div class="correo-list-empty"><i class="fas fa-inbox"></i><span>No hay mensajes</span></div>';
                document.getElementById('pagination').innerHTML = '';
                return;
            }

            let html = '';
            items.forEach(msg => {
                const initials = getInitials(msg.remitente_nombre || msg.remitente_email);
                const dateStr = formatMsgDate(msg.fecha_envio);
                const isActive = msg.id === currentMsgId;
                const isUnread = !msg.leido;
                const hasAttachments = msg.tiene_adjuntos;
                const isFlagged = msg.flaggeado;
                const hasClient = msg.cliente_id;

                let cls = 'correo-msg-item';
                if (isActive) cls += ' active';
                if (isUnread) cls += ' unread';

                html += `<div class="${cls}" onclick="correoOpenMessage(${msg.id})">
                    <div class="correo-msg-avatar">${escapeHtml(initials)}</div>
                    <div class="correo-msg-content">
                        <div class="correo-msg-top">
                            <span class="correo-msg-sender">${escapeHtml(msg.remitente_nombre || msg.remitente_email)}</span>
                            <span class="correo-msg-date">${dateStr}</span>
                        </div>
                        <div class="correo-msg-subject">${escapeHtml(msg.asunto)}</div>
                        <div class="correo-msg-preview">${escapeHtml(msg.preview || '')}</div>
                        <div class="correo-msg-flags">
                            ${hasAttachments ? '<i class="fas fa-paperclip flag-attachment"></i>' : ''}
                            ${isFlagged ? '<i class="fas fa-star flag-flagged"></i>' : ''}
                            ${hasClient ? '<i class="fas fa-user-check flag-client" title="Vinculado a cliente"></i>' : ''}
                        </div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;

            // Pagination
            renderPagination(currentPage, totalPages);
        } catch (err) {
            container.innerHTML = '<div class="correo-list-empty"><i class="fas fa-exclamation-triangle"></i><span>Error al cargar mensajes</span></div>';
            console.error('Error loading messages:', err);
        }
    }

    function renderPagination(page, totalPages) {
        const container = document.getElementById('pagination');
        if (!container || totalPages <= 1) { container.innerHTML = ''; return; }

        let html = `<button class="correo-page-btn" onclick="correoGoPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let i = start; i <= end; i++) {
            html += `<button class="correo-page-btn ${i === page ? 'active' : ''}" onclick="correoGoPage(${i})">${i}</button>`;
        }
        html += `<button class="correo-page-btn" onclick="correoGoPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        container.innerHTML = html;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       READER
       ═══════════════════════════════════════════════════════════════════════ */

    async function openMessage(id) {
        currentMsgId = id;
        const emptyEl = document.getElementById('readerEmpty');
        const contentEl = document.getElementById('readerContent');
        if (emptyEl) emptyEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'flex';

        // Mobile: show reader
        document.getElementById('correoLayout')?.classList.add('show-reader');

        try {
            const res = await fetch(`${API}?action=ver&id=${id}`);
            const data = await res.json();
            if (data.status !== 'success') { showToast(data.message, 'error'); return; }
            const msg = data.data;

            document.getElementById('readerSubject').textContent = msg.asunto;

            const initials = getInitials(msg.remitente_nombre || msg.remitente_email);
            const dateStr = formatDateFull(msg.fecha_envio);
            const toList = (msg.destinatarios || []).map(d => d.email).join(', ');

            document.getElementById('readerMeta').innerHTML = `
                <div class="meta-avatar">${escapeHtml(initials)}</div>
                <div>
                    <div><span class="meta-from">${escapeHtml(msg.remitente_nombre)}</span> <span class="meta-email">&lt;${escapeHtml(msg.remitente_email)}&gt;</span></div>
                    <div class="meta-to">Para: ${escapeHtml(msg.cuenta_email)}${toList ? ', ' + escapeHtml(toList) : ''}</div>
                    <div>${dateStr}</div>
                </div>`;

            // Body
            const bodyEl = document.getElementById('readerBody');
            if (msg.body_html) {
                bodyEl.innerHTML = `<iframe id="bodyFrame" sandbox="allow-same-origin" style="width:100%;min-height:300px;border:none;"></iframe>`;
                const frame = document.getElementById('bodyFrame');
                const doc = frame.contentDocument || frame.contentWindow.document;
                doc.open();
                doc.write(`<html><head><style>body{font-family:Inter,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;padding:16px;margin:0;}a{color:#3b82f6;}img{max-width:100%;height:auto;}</style></head><body>${msg.body_html}</body></html>`);
                doc.close();
                // Auto-resize iframe
                setTimeout(() => {
                    try { frame.style.height = doc.body.scrollHeight + 20 + 'px'; } catch (e) {}
                }, 100);
            } else {
                bodyEl.innerHTML = `<div class="body-text">${escapeHtml(msg.body_text || '(sin contenido)')}</div>`;
            }

            // Attachments
            const attachBar = document.getElementById('attachmentsBar');
            if (msg.adjuntos && msg.adjuntos.length > 0) {
                attachBar.style.display = 'flex';
                attachBar.innerHTML = msg.adjuntos.map(a => `
                    <a class="correo-attach-chip" href="${API}?action=adjunto_descargar&adjunto_id=${a.id}" target="_blank">
                        <i class="fas fa-file"></i> ${escapeHtml(a.filename)} <span style="color:var(--text-secondary);font-size:.65rem;">(${formatSize(a.size_bytes)})</span>
                    </a>`).join('');
            } else {
                attachBar.style.display = 'none';
            }

            // Update flag button
            const btnFlag = document.getElementById('btnFlag');
            if (btnFlag) btnFlag.innerHTML = msg.flaggeado
                ? '<i class="fas fa-star" style="color:var(--warning)"></i>'
                : '<i class="far fa-star"></i>';

            // Hide reply box initially
            document.getElementById('replyBox').style.display = 'none';
            document.getElementById('replyTextarea').value = '';

            // Re-highlight list item
            loadMessages();
            loadUnreadCount();
        } catch (err) {
            console.error('Error loading message:', err);
            showToast('Error al cargar el mensaje', 'error');
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       REPLY
       ═══════════════════════════════════════════════════════════════════════ */

    function showReplyBox() {
        const box = document.getElementById('replyBox');
        if (box) box.style.display = 'block';
        document.getElementById('replyTextarea')?.focus();
    }

    async function sendReply() {
        const textarea = document.getElementById('replyTextarea');
        const body = textarea?.value.trim();
        if (!body || !currentMsgId) { showToast('Escribe una respuesta', 'error'); return; }

        const btn = document.getElementById('sendBtn');
        setButtonLoading(btn, true, 'Enviando...');

        try {
            const fd = new FormData();
            fd.append('action', 'responder');
            fd.append('mensaje_id', currentMsgId);
            fd.append('cuenta_id', currentCuentaId || await getDefaultCuentaId());
            fd.append('body', `<p>${body.replace(/\n/g, '</p><p>')}</p>`);

            // Attach files
            const fileInput = document.getElementById('replyFiles');
            if (fileInput?.files) {
                Array.from(fileInput.files).forEach(f => fd.append('archivos[]', f));
            }

            const res = await fetch(API, { method: 'POST', body: fd });
            const data = await res.json();

            if (data.status === 'success') {
                showToast('Respuesta enviada', 'success');
                textarea.value = '';
                document.getElementById('replyBox').style.display = 'none';
                if (fileInput) fileInput.value = '';
            } else {
                showToast(data.message || 'Error al enviar', 'error');
            }
        } catch (err) {
            showToast('Error de conexion', 'error');
            console.error('Reply error:', err);
        } finally {
            setButtonLoading(btn, false);
        }
    }

    async function getDefaultCuentaId() {
        try {
            const res = await fetch(`${API}?action=cuentas`);
            const data = await res.json();
            const cuentas = data.data || [];
            return cuentas.length > 0 ? cuentas[0].id : 0;
        } catch (e) { return 0; }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SYNC
       ═══════════════════════════════════════════════════════════════════════ */

    async function syncMail() {
        if (isSyncing) return;
        isSyncing = true;
        const btn = document.getElementById('syncBtn');
        btn?.classList.add('loading');
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizando...';

        try {
            const fd = new FormData();
            fd.append('action', 'sincronizar');
            if (currentCuentaId > 0) fd.append('cuenta_id', currentCuentaId);

            const res = await fetch(API, { method: 'POST', body: fd });
            const data = await res.json();
            const synced = data.data?.synced || 0;

            if (synced > 0) {
                showToast(`${synced} nuevo${synced !== 1 ? 's' : ''} mensaje${synced !== 1 ? 's' : ''} sincronizado${synced !== 1 ? 's' : ''}`, 'success');
            } else {
                showToast('Bandeja actualizada', 'info');
            }

            await loadMessages();
            await loadUnreadCount();
        } catch (err) {
            showToast('Error al sincronizar', 'error');
            console.error('Sync error:', err);
        } finally {
            isSyncing = false;
            btn?.classList.remove('loading');
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar';
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       ACTIONS
       ═══════════════════════════════════════════════════════════════════════ */

    async function toggleRead(id, leido) {
        const fd = new FormData();
        fd.append('action', 'marcar_leido');
        fd.append('id', id);
        fd.append('leido', leido ? '1' : '0');
        await fetch(API, { method: 'POST', body: fd });
        loadMessages();
        loadUnreadCount();
    }

    async function toggleFlag(id, flagged) {
        const fd = new FormData();
        fd.append('action', 'marcar_flagged');
        fd.append('id', id);
        fd.append('flaggeado', flagged ? '1' : '0');
        await fetch(API, { method: 'POST', body: fd });
        loadMessages();
    }

    /* ═══════════════════════════════════════════════════════════════════════
       HELPERS
       ═══════════════════════════════════════════════════════════════════════ */

    function getInitials(name) {
        if (!name) return '?';
        const parts = name.split(/[\s@]+/).filter(Boolean);
        return parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : parts[0].substring(0, 2).toUpperCase();
    }

    function formatMsgDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    }

    function formatDateFull(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatSize(bytes) {
        bytes = parseInt(bytes) || 0;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const el = document.createElement('div');
        el.textContent = str;
        return el.innerHTML;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       GLOBAL EXPORTS
       ═══════════════════════════════════════════════════════════════════════ */

    window.correoSelectCuenta = function (id) {
        currentCuentaId = id;
        currentPage = 1;
        document.querySelectorAll('.correo-account-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.cuenta) === id);
        });
        loadMessages();
    };

    window.correoSetFilter = function (filter) {
        currentFilter = filter;
        currentPage = 1;
        document.querySelectorAll('.correo-filter-item').forEach(el => {
            el.classList.toggle('active', el.dataset.filter === filter);
        });
        loadMessages();
    };

    window.correoOpenMessage = openMessage;
    window.correoSync = syncMail;
    window.correoGoPage = function (page) { currentPage = page; loadMessages(); };

    window.correoReply = showReplyBox;
    window.correoSendReply = sendReply;

    window.correoForward = function () {
        showToast('Funcion de reenvio proximamente', 'info');
    };

    window.correoBackToList = function () {
        document.getElementById('correoLayout')?.classList.remove('show-reader');
        currentMsgId = null;
        document.getElementById('readerEmpty').style.display = 'flex';
        document.getElementById('readerContent').style.display = 'none';
        loadMessages();
    };

    window.correoToggleFlag = async function () {
        if (!currentMsgId) return;
        const btn = document.getElementById('btnFlag');
        const isFlagged = btn?.innerHTML.includes('fa-star"') && !btn.innerHTML.includes('far');
        await toggleFlag(currentMsgId, isFlagged ? 0 : 1);
        if (!isFlagged) {
            btn.innerHTML = '<i class="fas fa-star" style="color:var(--warning)"></i>';
        } else {
            btn.innerHTML = '<i class="far fa-star"></i>';
        }
    };

    window.correoInsertBold = function () { correoWrapSelection('**', '**'); };
    window.correoInsertItalic = function () { correoWrapSelection('*', '*'); };
    window.correoInsertLink = function () {
        const url = prompt('URL del enlace:');
        if (url) correoWrapSelection('[', `](${url})`);
    };

    function correoWrapSelection(before, after) {
        const ta = document.getElementById('replyTextarea');
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = ta.value;
        ta.value = text.substring(0, start) + before + text.substring(start, end) + after + text.substring(end);
        ta.focus();
        ta.setSelectionRange(start + before.length, end + before.length);
    }

    window.correoDebounceSearch = function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { currentPage = 1; loadMessages(); }, 350);
    };

    /* ═══════════════════════════════════════════════════════════════════════
       TOAST
       ═══════════════════════════════════════════════════════════════════════ */

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function' && window.showToast !== showToast) {
            return window.showToast(message, type);
        }
        const existing = document.querySelector('.correo-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'correo-toast';
        const icon = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
        toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
        toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;align-items:center;gap:10px;padding:14px 24px;border-radius:10px;background:${type === 'error' ? '#fef2f2' : type === 'success' ? '#f0fdf4' : '#eff6ff'};color:${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#2563eb'};border:1px solid ${type === 'error' ? '#fecaca' : type === 'success' ? '#bbf7d0' : '#bfdbfe'};box-shadow:0 10px 25px rgba(0,0,0,0.15);font-family:'Inter',sans-serif;font-size:.92rem;font-weight:500;animation:slideInToast .3s ease;`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, 4000);
    }

    // Inject animation
    const style = document.createElement('style');
    style.textContent = '@keyframes slideInToast{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);

})();
