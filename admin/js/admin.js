/**
 * admin.js — Panel de Administración v2
 * Arquitectura unificada: Usuarios → Datos/Cuenta/Permisos
 */
const ADMIN_API = API_ROOT + 'admin_api.php';
const USR_API   = API_ROOT + 'usuarios_api.php';

window.AdminPanel = {
    _currentTab: 'tabResumen',
    _usrPage: 1,
    _usrSearch: '',
    _selectedUsr: null,
    _allPerms: [],
    _usrRolePerms: [],
    _usrOverridePerms: [],
    _rolesData: [],
    _configData: [],
    _auditData: [],

    // ═══ INIT ════════════════════════════════════════════════════════════════
    init() {
        this._setupTabs();
        this._setupUsuarios();
        this._setupRoles();
        this._setupAuditoria();
        this._setupConfig();
        this._loadResumen();
    },

    // ═══ TABS ════════════════════════════════════════════════════════════════
    _setupTabs() {
        document.querySelectorAll('#adminTabs .admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#adminTabs .admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.getElementById(tab.dataset.tab);
                if (panel) panel.classList.add('active');
                this._currentTab = tab.dataset.tab;
                if (tab.dataset.tab === 'tabResumen') this._loadResumen();
                if (tab.dataset.tab === 'tabUsuarios') this._loadUsuarios();
                if (tab.dataset.tab === 'tabRoles') this._loadRoles();
            });
        });
        // Sub-tabs inside user detail
        document.querySelectorAll('[data-stab]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-stab]').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#stabDatos,#stabCuenta,#stabPerms').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById(btn.dataset.stab);
                if (panel) panel.classList.add('active');
            });
        });
    },

    // ═══ DASHBOARD ═══════════════════════════════════════════════════════════
    async _loadResumen() {
        try {
            const res = await fetch(ADMIN_API + '?action=stats&t=' + Date.now(), { credentials: 'same-origin' }).then(r => r.json());
            if (res.status !== 'success') return;
            const d = res.data;
            setText('kpiActivos', d.usuarios_activos ?? '—');
            setText('kpiLogins', d.logins_hoy ?? '—');
            setText('kpiSesiones', d.sesiones_activas ?? '—');
            setText('kpiBloqueados', d.bloqueados ?? '—');

            // Activity
            const actList = el('activityList');
            if (actList) {
                const items = d.actividad || [];
                actList.innerHTML = items.length ? items.slice(0, 10).map(a => this._renderActivity(a)).join('') : '<div style="padding:20px;text-align:center;color:var(--text-secondary);">Sin actividad</div>';
            }

            // Sessions
            const sessList = el('sessionsList');
            if (sessList) {
                const sr = await fetch(ADMIN_API + '?action=sessions&t=' + Date.now(), { credentials: 'same-origin' }).then(r => r.json());
                const sessions = (sr.status === 'success' && Array.isArray(sr.data)) ? sr.data : [];
                sessList.innerHTML = sessions.length ? sessions.map(s => this._renderSession(s)).join('') : '<div style="padding:20px;text-align:center;color:var(--text-secondary);">No hay sesiones activas</div>';
            }
        } catch(e) { console.error('Resumen error:', e); }
    },

    _renderActivity(a) {
        const icons = { login: ['fa-right-to-bracket','#27ae60'], logout: ['fa-right-from-bracket','#95a5a6'], create: ['fa-plus','#3498db'], update: ['fa-pen','#f39c12'], delete: ['fa-trash','#e74c3c'], save: ['fa-floppy-disk','#4B7BEC'] };
        const ic = icons[a.accion] || ['fa-circle-info','#7f8c8d'];
        const name = a.nombre ? a.nombre + (a.apellido ? ' ' + a.apellido : '') : a.username || 'Sistema';
        return `<div class="activity-item"><div class="activity-icon" style="background:${ic[1]}22;color:${ic[1]};"><i class="fas ${ic[0]}"></i></div><div style="flex:1;"><div class="activity-text"><strong>${escapeHtml(name)}</strong> ${escapeHtml(a.accion)}</div><div style="font-size:.78rem;color:var(--text-secondary);">${escapeHtml(a.detalle || '')}</div></div><div class="activity-time">${escapeHtml(a.fecha || '')}</div></div>`;
    },

    _renderSession(s) {
        const name = s.nombre ? s.nombre + (s.apellido ? ' ' + s.apellido : '') : s.username || '—';
        return `<div class="session-row"><div style="width:32px;height:32px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:.7rem;font-weight:700;flex-shrink:0;">${escapeHtml(((name)[0]||'U').toUpperCase())}</div><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:.85rem;">${escapeHtml(name)}</div><div class="session-ip">@${escapeHtml(s.username||'—')}</div></div><div style="font-size:.75rem;color:var(--text-secondary);white-space:nowrap;">${escapeHtml(s.ultimo_acceso||'')}</div><button onclick="AdminPanel._forceLogout(${s.usuario_id})" class="btn btn-xs btn-danger-outline" title="Forzar logout"><i class="fas fa-right-from-bracket"></i></button></div>`;
    },

    async _forceLogout(uid) {
        if (!confirm('¿Forzar cierre de sesión?')) return;
        const r = await fetch(ADMIN_API + '?action=force_logout', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({usuario_id:uid}) }).then(r=>r.json()).catch(e=>({status:'error',message:e.message}));
        if (r.status==='success') { showToast('Sesión invalidada','success'); this._loadResumen(); } else showToast(r.message||'Error','error');
    },

    // ═══ USUARIOS ═══════════════════════════════════════════════════════════
    _setupUsuarios() {
        const search = el('usrSearch');
        if (search) { let t; search.addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>{ this._usrPage=1; this._usrSearch=search.value; this._loadUsuarios(); },300); }); }
        if (el('btnNuevoUsr')) el('btnNuevoUsr').onclick = () => this._createUser();
        if (el('btnDetailBack')) el('btnDetailBack').onclick = () => this._closeDetail();
        if (el('btnDetailDelete')) el('btnDetailDelete').onclick = () => this._deleteUser();
        if (el('formDatos')) el('formDatos').onsubmit = (e) => { e.preventDefault(); this._saveDatos(); };
        if (el('formCuenta')) el('formCuenta').onsubmit = (e) => { e.preventDefault(); this._saveCuenta(); };
        if (el('btnResetRole')) el('btnResetRole').onclick = () => this._resetToRole();
        if (el('btnSavePerms')) el('btnSavePerms').onclick = () => this._savePerms();
        if (el('btnApplyRole')) el('btnApplyRole').onclick = () => this._applyRolePreset();
    },

    async _loadUsuarios() {
        const list = el('usrList');
        if (!list) return;
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const r = await fetch(`${USR_API}?action=usuarios&page=${this._usrPage}&search=${encodeURIComponent(this._usrSearch)}&t=${Date.now()}`, {credentials:'same-origin'}).then(r=>r.json());
            if (r.status!=='success') { list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary);">${escapeHtml(r.message||'Error')}</div>`; return; }
            const items = r.data.items || [];
            if (!items.length) { list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary);"><i class="fas fa-users" style="font-size:2rem;opacity:.2;"></i><br>No hay usuarios</div>'; return; }
            const colorMap = {1:'#e74c3c',2:'#e67e22',3:'#f39c12',4:'#27ae60',5:'#3498db',6:'#95a5a6'};
            list.innerHTML = items.map(u => {
                const initials = ((u.nombre||'')[0]||'U') + ((u.apellido||'')[0]||'');
                const isSelected = this._selectedUsr && this._selectedUsr.id === u.id;
                const bgColor = u.activo==1 ? '#16a34a' : '#dc2626';
                return `<div class="usr-list-card${isSelected?' selected':''}" onclick="AdminPanel._selectUsr(${u.id})">
                    <div class="usr-avatar" style="background:linear-gradient(135deg,var(--primary),var(--accent));">${escapeHtml(initials.toUpperCase())}</div>
                    <div class="usr-info"><div class="usr-name">${escapeHtml(u.nombre||'')} ${escapeHtml(u.apellido||'')}</div><div class="usr-meta">@${escapeHtml(u.username||'—')} · ${escapeHtml(u.email||'—')}</div></div>
                    <div class="usr-status" style="background:${bgColor};" title="${u.activo==1?'Activo':'Inactivo'}"></div>
                </div>`;
            }).join('');
            if (r.data.total_pages > 1) {
                renderPagination('usrPagination', r.data.total, r.data.per_page, r.data.page, (p) => { this._usrPage = p; this._loadUsuarios(); });
            }
        } catch(e) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">Error de conexión</div>'; }
    },

    async _selectUsr(id) {
        try {
            const r = await fetch(`${USR_API}?action=usuarios&page=1&search=&t=${Date.now()}`, {credentials:'same-origin'}).then(r=>r.json());
            const items = r.data?.items || [];
            const usr = items.find(u => u.id === id);
            if (!usr) return;
            this._selectedUsr = usr;
            this._showDetail(usr);
            // Refresh list selection
            document.querySelectorAll('.usr-list-card').forEach(c => c.classList.remove('selected'));
            event?.currentTarget?.classList?.add('selected');
        } catch(e) { console.error(e); }
    },

    _showDetail(usr) {
        el('usrEmpty').style.display = 'none';
        el('usrDetail').style.display = 'block';
        const initials = ((usr.nombre||'')[0]||'U') + ((usr.apellido||'')[0]||'');
        el('detailAvatar').textContent = initials.toUpperCase();
        el('detailName').textContent = `${usr.nombre||''} ${usr.apellido||''}`;
        el('detailMeta').textContent = `@${usr.username||'—'} · ${usr.email||'—'} · ${usr.activo==1?'Activo':'Inactivo'}`;
        // Fill forms
        el('fld_id').value = usr.id;
        el('fld_nombre').value = usr.nombre || '';
        el('fld_apellido').value = usr.apellido || '';
        el('fld_email').value = usr.email || '';
        el('fld_telefono').value = usr.telefono || '';
        el('fld_tipo').value = usr.tipo || 'empleado';
        el('fld_username').value = usr.username || '';
        el('fld_password').value = '';
        el('fld_activo').value = usr.activo ?? 1;
        this._loadRolesSelect(usr.rol_id);
        this._loadUsrPerms(usr.id);
        // Switch to datos tab
        document.querySelectorAll('[data-stab]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#stabDatos,#stabCuenta,#stabPerms').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-stab="stabDatos"]').classList.add('active');
        el('stabDatos').classList.add('active');
    },

    _closeDetail() {
        el('usrDetail').style.display = 'none';
        el('usrEmpty').style.display = 'block';
        this._selectedUsr = null;
        document.querySelectorAll('.usr-list-card').forEach(c => c.classList.remove('selected'));
    },

    async _loadRolesSelect(selectedId) {
        const sel = el('fld_rol');
        if (!sel) return;
        try {
            const r = await fetch(`${USR_API}?action=roles&t=${Date.now()}`).then(r=>r.json());
            const roles = r.status==='success' ? (r.data||[]) : [];
            sel.innerHTML = '<option value="">— Sin rol —</option>' + roles.map(r => `<option value="${r.id}" ${r.id==selectedId?'selected':''}>${escapeHtml(r.nombre)} (N${r.nivel})</option>`).join('');
        } catch(e) {}
        // Also populate perm role preset
        const preset = el('permRolePreset');
        if (preset) {
            try {
                const r = await fetch(`${USR_API}?action=roles&t=${Date.now()}`).then(r=>r.json());
                const roles = r.status==='success' ? (r.data||[]) : [];
                preset.innerHTML = '<option value="">— Personalizar —</option>' + roles.map(r => `<option value="${r.id}">${escapeHtml(r.nombre)} (N${r.nivel})</option>`).join('');
            } catch(e) {}
        }
    },

    async _saveDatos() {
        if (!this._selectedUsr) return;
        const fd = new FormData(el('formDatos'));
        fd.append('action', 'save');
        const r = await apiFetch(USR_API, fd);
        if (r.status==='success') { showToast('Datos guardados','success'); this._selectedUsr.nombre=el('fld_nombre').value; this._selectedUsr.apellido=el('fld_apellido').value; this._selectedUsr.email=el('fld_email').value; this._selectedUsr.telefono=el('fld_telefono').value; this._selectedUsr.tipo=el('fld_tipo').value; this._loadUsuarios(); } else showToast(r.message||'Error','error');
    },

    async _saveCuenta() {
        if (!this._selectedUsr) return;
        const fd = new FormData(el('formCuenta'));
        fd.append('action', 'save_cuenta');
        fd.append('id', this._selectedUsr.id);
        const r = await apiFetch(USR_API, fd);
        if (r.status==='success') { showToast('Cuenta guardada','success'); this._selectedUsr.username=el('fld_username').value; this._selectedUsr.rol_id=el('fld_rol').value; this._selectedUsr.activo=el('fld_activo').value; this._loadUsuarios(); this._loadUsrPerms(this._selectedUsr.id); } else showToast(r.message||'Error','error');
    },

    async _createUser() {
        const nombre = prompt('Nombre del nuevo usuario:');
        if (!nombre) return;
        const fd = new FormData();
        fd.append('action', 'save');
        fd.append('nombre', nombre);
        fd.append('tipo', 'empleado');
        const r = await apiFetch(USR_API, fd);
        if (r.status==='success') { showToast('Usuario creado','success'); this._loadUsuarios(); } else showToast(r.message||'Error','error');
    },

    async _deleteUser() {
        if (!this._selectedUsr) return;
        if (!confirm(`¿Eliminar usuario ${this._selectedUsr.username}?`)) return;
        const fd = new FormData();
        fd.append('action', 'delete');
        fd.append('id', this._selectedUsr.id);
        const r = await apiFetch(USR_API, fd);
        if (r.status==='success') { showToast('Usuario eliminado','success'); this._closeDetail(); this._loadUsuarios(); } else showToast(r.message||'Error','error');
    },

    // ═══ PERMISOS UNIFICADOS ═══════════════════════════════════════════════
    async _loadUsrPerms(userId) {
        try {
            const r = await fetch(`${USR_API}?action=permisos&usuario_id=${userId}&t=${Date.now()}`).then(r=>r.json());
            if (r.status!=='success') return;
            this._allPerms = r.data.all || [];
            this._usrRolePerms = r.data.role || [];
            this._usrOverridePerms = r.data.user || [];
            this._renderPermSource();
            this._renderPermGrid();
        } catch(e) { console.error(e); }
    },

    _renderPermSource() {
        const info = el('permSourceInfo');
        if (!info) return;
        const hasOverride = this._usrOverridePerms.length > 0;
        if (hasOverride) {
            info.style.background = '#fef3c7';
            info.style.border = '1px solid #fbbf24';
            info.style.color = '#92400e';
            info.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-top:2px;"></i><div><strong>Override activo</strong> — Este usuario tiene ${this._usrOverridePerms.length} permisos personalizados que reemplazan los de su rol. Use "Restaurar al Rol" para volver a los permisos del rol.</div>`;
        } else {
            info.style.background = '#dbeafe';
            info.style.border = '1px solid #93c5fd';
            info.style.color = '#1d4ed8';
            info.innerHTML = `<i class="fas fa-info-circle" style="margin-top:2px;"></i><div><strong>Sin override</strong> — Este usuario hereda los permisos de su rol asignado (${this._usrRolePerms.length} permisos). Para personalizar, modifique los permisos abajo y guarde.</div>`;
        }
    },

    _renderPermGrid() {
        const grid = el('permGrid');
        if (!grid) return;
        if (!this._allPerms.length) { grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">No hay permisos definidos</div>'; return; }

        // Group by module
        const modules = {};
        this._allPerms.forEach(p => {
            const mod = p.modulo || 'general';
            if (!modules[mod]) modules[mod] = [];
            modules[mod].push(p);
        });

        const hasOverride = this._usrOverridePerms.length > 0;
        const overrideSet = new Set(this._usrOverridePerms);
        const roleSet = new Set(this._usrRolePerms);

        let html = '';
        Object.keys(modules).sort().forEach(mod => {
            const perms = modules[mod];
            const checkedCount = perms.filter(p => hasOverride ? overrideSet.has(p.permiso) : roleSet.has(p.permiso)).length;
            html += `<div class="perm-module-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'grid':'none'">
                <h4><i class="fas fa-cube" style="color:var(--primary);font-size:.8rem;"></i> ${escapeHtml(mod)} <span class="perm-module-count">${checkedCount}/${perms.length}</span></h4>
                <i class="fas fa-chevron-down" style="font-size:.7rem;color:var(--text-secondary);"></i>
            </div>
            <div class="perm-items" style="display:grid;">`;
            perms.forEach(p => {
                const isChecked = hasOverride ? overrideSet.has(p.permiso) : roleSet.has(p.permiso);
                const srcLabel = hasOverride ? (overrideSet.has(p.permiso) ? 'override' : 'rol') : 'rol';
                const srcClass = srcLabel === 'override' ? 'perm-source-override' : 'perm-source-role';
                html += `<label class="perm-item${hasOverride && !overrideSet.has(p.permiso) && roleSet.has(p.permiso) ? ' disabled' : ''}">
                    <input type="checkbox" data-perm="${escapeHtml(p.permiso)}" ${isChecked?'checked':''} onchange="AdminPanel._onPermToggle(this)">
                    <span class="perm-label">${escapeHtml(p.accion||p.permiso)}</span>
                    ${hasOverride ? `<span class="perm-src ${srcClass}">${srcLabel}</span>` : ''}
                </label>`;
            });
            html += '</div>';
        });
        grid.innerHTML = html;

        // Update count
        const checked = grid.querySelectorAll('input[type=checkbox]:checked').length;
        setText('permCount', `${checked} / ${this._allPerms.length} permisos activos`);
    },

    _onPermToggle(cb) {
        const grid = el('permGrid');
        if (!grid) return;
        const checked = grid.querySelectorAll('input[type=checkbox]:checked').length;
        setText('permCount', `${checked} / ${this._allPerms.length} permisos activos`);
    },

    async _savePerms() {
        if (!this._selectedUsr) return;
        const grid = el('permGrid');
        const perms = Array.from(grid.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.dataset.perm);
        const fd = new FormData();
        fd.append('action', 'save_permisos');
        fd.append('usuario_id', this._selectedUsr.id);
        fd.append('permisos', JSON.stringify(perms));
        const r = await apiFetch(USR_API, fd);
        if (r.status==='success') { showToast('Permisos guardados','success'); this._loadUsrPerms(this._selectedUsr.id); } else showToast(r.message||'Error','error');
    },

    async _resetToRole() {
        if (!this._selectedUsr) return;
        if (!confirm('¿Restablecer permisos a los del rol?')) return;
        const r = await fetch(ADMIN_API + '?action=reset_user_role', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({usuario_id:this._selectedUsr.id}) }).then(r=>r.json()).catch(e=>({status:'error',message:e.message}));
        if (r.status==='success') { showToast('Permisos restablecidos','success'); this._loadUsrPerms(this._selectedUsr.id); } else showToast(r.message||'Error','error');
    },

    async _applyRolePreset() {
        const roleId = el('permRolePreset')?.value;
        if (!roleId || !this._selectedUsr) return;
        // Load role permissions and apply as override
        try {
            const r = await fetch(`${ADMIN_API}?action=role_perms&rol_id=${roleId}&t=${Date.now()}`).then(r=>r.json());
            if (r.status==='success') {
                const rolePerms = (r.data || []).map(p => p.permiso);
                // Check all boxes matching role perms
                const grid = el('permGrid');
                grid.querySelectorAll('input[type=checkbox]').forEach(cb => {
                    cb.checked = rolePerms.includes(cb.dataset.perm);
                });
                const checked = grid.querySelectorAll('input[type=checkbox]:checked').length;
                setText('permCount', `${checked} / ${this._allPerms.length} permisos activos`);
                showToast('Permisos del rol aplicados (guarde para confirmar)','info');
            }
        } catch(e) { console.error(e); }
    },

    // ═══ ROLES ═══════════════════════════════════════════════════════════════
    _setupRoles() {
        if (el('btnNuevoRol')) el('btnNuevoRol').onclick = () => this._openRoleEditor();
        if (el('btnCloseRoleEditor')) el('btnCloseRoleEditor').onclick = () => { el('roleEditor').style.display='none'; };
        if (el('btnSaveRole')) el('btnSaveRole').onclick = () => this._saveRole();
    },

    async _loadRoles() {
        const grid = el('rolesGrid');
        if (!grid) return;
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const r = await fetch(`${USR_API}?action=roles&t=${Date.now()}`).then(r=>r.json());
            if (r.status!=='success') { grid.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary);">${escapeHtml(r.message||'Error')}</div>`; return; }
            this._rolesData = r.data || [];
            const colorMap = {1:'#e74c3c',2:'#e67e22',3:'#f39c12',4:'#27ae60',5:'#3498db',6:'#95a5a6'};
            const iconMap = {1:'fa-crown',2:'fa-user-shield',3:'fa-briefcase',4:'fa-user-gear',5:'fa-wrench',6:'fa-eye'};
            grid.innerHTML = this._rolesData.map(role => {
                const color = colorMap[role.nivel] || '#4B7BEC';
                const icon = iconMap[role.nivel] || 'fa-shield-halved';
                return `<div class="role-card" onclick="AdminPanel._openRoleEditor(${role.id})" style="--role-color:${color};">
                    <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${color};border-radius:4px 0 0 4px;"></div>
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
                        <div style="width:42px;height:42px;border-radius:10px;background:${color};display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#fff;"><i class="fas ${icon}"></i></div>
                        <span style="font-size:.68rem;padding:3px 10px;border-radius:12px;font-weight:600;background:${color}12;color:${color};">Nivel ${role.nivel}</span>
                    </div>
                    <div style="font-weight:700;font-size:1rem;margin-bottom:2px;">${escapeHtml(role.nombre)}</div>
                    <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(role.descripcion||'Sin descripción')}</div>
                    <div style="display:flex;gap:12px;font-size:.72rem;color:var(--text-secondary);">
                        <span><i class="fas fa-key" style="margin-right:4px;"></i>${role.permisos_count||0} permisos</span>
                        <span><i class="fas fa-users" style="margin-right:4px;"></i>${role.usuarios_count||0} usuarios</span>
                    </div>
                </div>`;
            }).join('');
        } catch(e) { grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">Error de conexión</div>'; }
    },

    async _openRoleEditor(roleId) {
        el('roleEditor').style.display = 'block';
        if (roleId) {
            const role = this._rolesData.find(r => r.id === roleId);
            if (!role) return;
            el('roleEditorTitle').innerHTML = `<i class="fas fa-pen-to-square" style="color:var(--primary);"></i> Editar: ${escapeHtml(role.nombre)}`;
            el('rolId').value = role.id;
            el('rolNombre').value = role.nombre;
            el('rolNivel').value = role.nivel;
            el('rolDescripcion').value = role.descripcion || '';
            this._loadPermMatrix(role.id);
        } else {
            el('roleEditorTitle').innerHTML = '<i class="fas fa-plus" style="color:var(--primary);"></i> Nuevo Rol';
            el('rolId').value = '';
            el('rolNombre').value = '';
            el('rolNivel').value = '5';
            el('rolDescripcion').value = '';
            this._loadPermMatrix(null);
        }
    },

    async _loadPermMatrix(roleId) {
        const tbody = document.querySelector('#permMatrix tbody');
        if (!tbody) return;
        // Get all permissions
        try {
            const r = await fetch(`${USR_API}?action=permisos&t=${Date.now()}`).then(r=>r.json());
            if (r.status!=='success') return;
            const allPerms = r.data.all || [];
            // Get role permissions if editing
            let rolePerms = [];
            if (roleId) {
                const rp = await fetch(`${ADMIN_API}?action=role_perms&rol_id=${roleId}&t=${Date.now()}`).then(r=>r.json());
                rolePerms = rp.status==='success' ? (rp.data||[]).map(p=>p.permiso) : [];
            }
            const roleSet = new Set(rolePerms);
            // Group by module
            const modules = {};
            allPerms.forEach(p => {
                const mod = p.modulo || 'general';
                if (!modules[mod]) modules[mod] = [];
                modules[mod].push(p);
            });
            let html = '';
            Object.keys(modules).sort().forEach(mod => {
                const perms = modules[mod];
                const allChecked = perms.every(p => roleSet.has(p.permiso));
                html += `<tr style="background:rgba(75,123,236,.03);">
                    <td><label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;"><input type="checkbox" data-mod="${escapeHtml(mod)}" onchange="AdminPanel._toggleModAll(this)" ${allChecked?'checked':''}> ${escapeHtml(mod)}</label></td>`;
                ['ver','crear','editar','eliminar'].forEach(act => {
                    const p = perms.find(x => x.accion === act);
                    if (p) {
                        html += `<td style="text-align:center;"><input type="checkbox" data-perm="${escapeHtml(p.permiso)}" ${roleSet.has(p.permiso)?'checked':''}></td>`;
                    } else {
                        html += '<td style="text-align:center;color:var(--text-secondary);">—</td>';
                    }
                });
                html += '</tr>';
            });
            tbody.innerHTML = html;
        } catch(e) { console.error(e); }
    },

    _toggleModAll(cb) {
        const mod = cb.dataset.mod;
        const table = el('permMatrix');
        table.querySelectorAll(`input[data-perm^="${mod}:"]`).forEach(inp => inp.checked = cb.checked);
    },

    async _saveRole() {
        const id = el('rolId').value;
        const data = {
            id: id ? parseInt(id) : 0,
            nombre: el('rolNombre').value.trim(),
            nivel: parseInt(el('rolNivel').value),
            descripcion: el('rolDescripcion').value.trim(),
            color: '#4B7BEC'
        };
        if (!data.nombre) { showToast('Nombre requerido','error'); return; }
        // Get checked permissions
        const perms = Array.from(el('permMatrix').querySelectorAll('input[type=checkbox][data-perm]:checked')).map(cb => cb.dataset.perm).filter(v => v && v !== 'on' && v.includes(':'));
        try {
            const r = await fetch(ADMIN_API + '?action=save_role', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({...data, permisos:perms}) }).then(r=>r.json()).catch(e=>({status:'error',message:e.message}));
            if (r.status==='success') {
                const roleId = r.data?.id || id;
                if (roleId && perms.length) {
                    await fetch(ADMIN_API + '?action=save_role_perms', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({rol_id:roleId, permisos:perms}) }).then(r=>r.json());
                }
                showToast('Rol guardado','success');
                el('roleEditor').style.display='none';
                this._loadRoles();
            } else showToast(r.message||'Error','error');
        } catch(e) { showToast('Error de conexión','error'); }
    },

    // ═══ AUDITORÍA ══════════════════════════════════════════════════════════
    _setupAuditoria() {
        if (el('btnAuditSearch')) el('btnAuditSearch').onclick = () => this._loadAuditLog();
        if (el('btnAuditExport')) el('btnAuditExport').onclick = () => this._exportAuditCSV();
        fetch(USR_API + '?action=usuarios&per_page=500&t=' + Date.now(), {credentials:'same-origin'}).then(r=>r.json()).then(res => {
            const sel = el('auditUserFilter');
            if (sel && res.status==='success' && res.data?.items) {
                res.data.items.forEach(u => { const o = document.createElement('option'); o.value=u.id; o.textContent=u.nombre+(u.apellido?' '+u.apellido:'')+' (@'+u.username+')'; sel.appendChild(o); });
            }
        }).catch(()=>{});
    },

    async _loadAuditLog() {
        const timeline = el('auditTimeline');
        if (!timeline) return;
        timeline.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
        const params = new URLSearchParams({action:'audit_log'});
        const uf = el('auditUserFilter')?.value; if (uf) params.append('usuario_id',uf);
        const mf = el('auditModFilter')?.value; if (mf) params.append('modulo',mf);
        const df = el('auditDateFrom')?.value; if (df) params.append('date_from',df);
        const dt = el('auditDateTo')?.value; if (dt) params.append('date_to',dt);
        params.append('t',Date.now());
        try {
            const r = await fetch(`${ADMIN_API}?${params.toString()}`).then(r=>r.json());
            if (r.status!=='success') { timeline.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-secondary);">${escapeHtml(r.message||'Error')}</div>`; return; }
            this._auditData = r.data?.items || [];
            if (!this._auditData.length) { timeline.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-secondary);">Sin registros</div>'; return; }
            timeline.innerHTML = this._auditData.map(item => {
                const icons = {login:['fa-right-to-bracket','#27ae60'],logout:['fa-right-from-bracket','#95a5a6'],create:['fa-plus','#3498db'],update:['fa-pen','#f39c12'],delete:['fa-trash','#e74c3c'],save:['fa-floppy-disk','#4B7BEC'],export:['fa-download','#8e44ad']};
                const ic = icons[item.accion]||['fa-circle-info','#7f8c8d'];
                const name = item.nombre ? item.nombre+(item.apellido?' '+item.apellido:'') : item.username||'Sistema';
                return `<div class="activity-item"><div class="activity-icon" style="background:${ic[1]}22;color:${ic[1]};"><i class="fas ${ic[0]}"></i></div><div style="flex:1;"><div class="activity-text"><strong>${escapeHtml(name)}</strong> — ${escapeHtml(item.accion)} <span style="color:var(--primary);font-weight:600;">${escapeHtml(item.entidad||'')}</span></div><div style="font-size:.78rem;color:var(--text-secondary);">${escapeHtml(item.detalle||'')}</div></div><div class="activity-time">${escapeHtml(item.fecha||'')}</div></div>`;
            }).join('');
        } catch(e) { timeline.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-secondary);">Error de conexión</div>'; }
    },

    _exportAuditCSV() {
        if (!this._auditData?.length) { showToast('Sin datos','error'); return; }
        const headers = ['Fecha','Usuario','Acción','Entidad','Detalle'];
        const rows = this._auditData.map(item => [item.fecha||'',item.nombre?item.nombre+(item.apellido?' '+item.apellido:''):item.username||'',item.accion||'',item.entidad||'',item.detalle||'']);
        let csv = headers.join(',') + '\n';
        rows.forEach(r => { csv += r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',') + '\n'; });
        const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'auditoria_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    },

    // ═══ CONFIGURACIÓN ══════════════════════════════════════════════════════
    _setupConfig() {
        if (el('configForm')) el('configForm').onsubmit = (e) => { e.preventDefault(); this._saveConfig(); };
    },

    async _loadConfig() {
        const c = el('configGroupsContainer');
        if (!c) return;
        try {
            const r = await fetch(ADMIN_API + '?action=config&t=' + Date.now()).then(r=>r.json());
            if (r.status!=='success') { c.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-secondary);">'+escapeHtml(r.message||'Error')+'</div>'; return; }
            this._configData = Array.isArray(r.data) ? r.data : [];
            const groups = {};
            this._configData.forEach(item => { const g=item.grupo||item.categoria||'General'; if(!groups[g]) groups[g]=[]; groups[g].push(item); });
            let html = '';
            Object.keys(groups).sort().forEach(g => {
                html += `<div class="config-section"><h3><i class="fas fa-cog"></i> ${escapeHtml(g)}</h3><div class="form-grid">`;
                groups[g].forEach(item => { html += this._renderConfigField(item); });
                html += '</div></div>';
            });
            c.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--text-secondary);">Sin configuración</div>';
        } catch(e) { c.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-secondary);">Error de conexión</div>'; }
    },

    _renderConfigField(item) {
        const val = item.valor ?? '';
        let input = '';
        if (item.tipo==='boolean'||item.tipo==='bool') {
            input = `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" name="config_${escapeHtml(item.clave)}" ${val==='1'||val===1||val==='true'?'checked':''}> <span style="font-size:.82rem;">${escapeHtml(item.descripcion||item.clave)}</span></label>`;
        } else if (item.tipo==='integer'||item.tipo==='int') {
            input = `<label>${escapeHtml(item.descripcion||item.clave)}</label><input type="number" name="config_${escapeHtml(item.clave)}" value="${escapeHtml(String(val))}" style="width:100%;">`;
        } else {
            input = `<label>${escapeHtml(item.descripcion||item.clave)}</label><input type="text" name="config_${escapeHtml(item.clave)}" value="${escapeHtml(String(val))}" style="width:100%;">`;
        }
        return `<div class="form-group">${input}</div>`;
    },

    async _saveConfig() {
        const form = el('configForm'); if (!form) return;
        const configs = {};
        this._configData.forEach(item => {
            const input = form.querySelector(`[name="config_${item.clave}"]`);
            configs[item.clave] = (item.tipo==='boolean'||item.tipo==='bool') ? (input?.checked?'1':'0') : (input?.value??item.valor);
        });
        const btn = el('btnSaveConfig'); setButtonLoading(btn,true);
        const r = await fetch(ADMIN_API+'?action=save_config',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({configs})}).then(r=>r.json()).catch(e=>({status:'error',message:e.message}));
        setButtonLoading(btn,false);
        if (r.status==='success') showToast('Configuración guardada','success'); else showToast(r.message||'Error','error');
    }
};

function setText(id, val) { const e = el(id); if (e) e.textContent = val; }

document.addEventListener('DOMContentLoaded', () => { AdminPanel.init(); });
