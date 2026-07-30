class ListRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            idField: 'id',
            titleField: 'id',
            subtitleFields: [],
            statusField: null,
            badgeMap: {},
            thumbField: null,
            archivosField: 'archivos',
            onClick: null,
            onEdit: null,
            onDelete: null,
            selectedId: null,
            storageKey: null,
            ...options
        };

        this.items = [];
        this.viewMode = this._getSavedView() || 'card';
        this.virtualScroller = null;
    }

    _getSavedView() {
        if (!this.options.storageKey) return null;
        try {
            return localStorage.getItem('view_' + this.options.storageKey) || null;
        } catch { return null; }
    }

    _saveView(mode) {
        if (!this.options.storageKey) return;
        try { localStorage.setItem('view_' + this.options.storageKey, mode); } catch {}
    }

    setViewMode(mode) {
        this.viewMode = mode;
        this._saveView(mode);
        this.render(this.items);
    }

    render(items) {
        this.items = items || [];
        this.container.innerHTML = '';

        if (!this.items || !this.items.length) {
            this.container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Sin registros</div>';
            return;
        }

        switch (this.viewMode) {
            case 'compact':
                this._renderCompact();
                break;
            case 'record':
                this._renderRecord();
                break;
            case 'card':
            default:
                this._renderCard();
                break;
        }
    }

    _renderCompact() {
        const wrapper = document.createElement('div');
        wrapper.className = 'record-list';

        this.items.forEach((item, idx) => {
            const id = item[this.options.idField];
            const title = item[this.options.titleField] || `#${id}`;

            const row = document.createElement('div');
            row.className = 'compact-row';
            if (this.options.selectedId && String(id) === String(this.options.selectedId)) {
                row.classList.add('selected');
            }

            let subHtml = '';
            if (this.options.statusField && item[this.options.statusField]) {
                const val = item[this.options.statusField];
                const color = this.options.badgeMap[val] || 'primary';
                subHtml = `<span class="status-badge ${color}">${val}</span>`;
            } else if (this.options.subtitleFields.length) {
                const sf = this.options.subtitleFields[0];
                const field = typeof sf === 'string' ? sf : sf.field;
                const val = item[field];
                if (val) subHtml = `<span class="compact-row-sub">${val}</span>`;
            }

            const actionsHtml = [];
            if (this.options.onEdit) {
                actionsHtml.push(`<button class="btn-edit" data-id="${id}" title="Editar"><i class="fas fa-pen"></i></button>`);
            }
            if (this.options.onDelete) {
                actionsHtml.push(`<button class="btn-delete" data-id="${id}" title="Eliminar"><i class="fas fa-trash"></i></button>`);
            }

            row.innerHTML = `
                <span class="compact-row-title">${this._escape(title)}</span>
                ${subHtml}
                ${actionsHtml.length ? `<div class="compact-row-actions">${actionsHtml.join('')}</div>` : ''}`;

            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                if (this.options.onClick) this.options.onClick(item, row);
            });

            row.querySelectorAll('.btn-edit').forEach(b => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.options.onEdit) this.options.onEdit(item);
                });
            });
            row.querySelectorAll('.btn-delete').forEach(b => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.options.onDelete) this.options.onDelete(item);
                });
            });

            wrapper.appendChild(row);
        });

        this.container.appendChild(wrapper);
    }

    _renderRecord() {
        const wrapper = document.createElement('div');
        wrapper.className = 'record-list';

        this.items.forEach((item, idx) => {
            const id = item[this.options.idField];
            const title = item[this.options.titleField] || `#${id}`;

            const row = document.createElement('div');
            row.className = 'record-row';
            if (this.options.selectedId && String(id) === String(this.options.selectedId)) {
                row.classList.add('selected');
            }

            let thumbUrl = null;
            if (this.options.thumbField && item[this.options.thumbField]) {
                thumbUrl = item[this.options.thumbField];
            } else if (item[this.options.archivosField] && item[this.options.archivosField].length) {
                const first = item[this.options.archivosField][0];
                if (first.tipo_archivo === 'foto' && first.ruta_archivo) {
                    thumbUrl = first.ruta_archivo;
                }
            }

            const thumbHtml = thumbUrl
                ? `<img src="${thumbUrl}" alt="" loading="lazy">`
                : `<i class="fas fa-image"></i>`;

            let subHtml = '';
            this.options.subtitleFields.forEach(sf => {
                const field = typeof sf === 'string' ? sf : sf.field;
                const label = typeof sf === 'string' ? null : (sf.label || null);
                const type = typeof sf === 'string' ? null : (sf.type || null);
                let val = item[field];
                if (val !== null && val !== undefined && val !== '') {
                    if (type === 'datetime' && val) {
                        try {
                            const d = new Date(val);
                            if (!isNaN(d.getTime())) {
                                val = d.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
                            }
                        } catch(e) {}
                    }
                    const prefix = label ? `${label}: ` : '';
                    subHtml += (subHtml ? ' · ' : '') + prefix + val;
                }
            });

            let statusHtml = '';
            if (this.options.statusField && item[this.options.statusField]) {
                const val = item[this.options.statusField];
                const color = this.options.badgeMap[val] || 'primary';
                statusHtml = `<span class="status-badge ${color}">${val}</span>`;
            }

            const actionsHtml = [];
            if (this.options.onEdit) {
                actionsHtml.push(`<button class="btn-icon-sm" title="Editar"><i class="fas fa-pen"></i></button>`);
            }
            if (this.options.onDelete) {
                actionsHtml.push(`<button class="btn-icon-sm danger" title="Eliminar"><i class="fas fa-trash"></i></button>`);
            }

            row.innerHTML = `
                <div class="record-row-thumb">${thumbHtml}</div>
                <div class="record-row-info">
                    <div class="record-row-title">${this._escape(title)}</div>
                    ${subHtml ? `<div class="record-row-sub">${subHtml}</div>` : ''}
                    ${statusHtml ? `<div style="margin-top:0.2rem;">${statusHtml}</div>` : ''}
                </div>
                ${actionsHtml.length ? `<div class="record-row-actions">${actionsHtml.join('')}</div>` : ''}`;

            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                if (this.options.onClick) this.options.onClick(item, row);
            });

            row.querySelectorAll('.btn-icon-sm').forEach(b => {
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (b.classList.contains('danger') && this.options.onDelete) {
                        this.options.onDelete(item);
                    } else if (this.options.onEdit) {
                        this.options.onEdit(item);
                    }
                });
            });

            wrapper.appendChild(row);
        });

        this.container.appendChild(wrapper);
    }

    _renderCard() {
        window.renderCardGrid(this.container, this.items, {
            titleField: this.options.titleField,
            subtitleFields: this.options.subtitleFields,
            thumbField: this.options.thumbField,
            archivosField: this.options.archivosField,
            statusField: this.options.statusField,
            badgeMap: this.options.badgeMap,
            onClick: this.options.onClick,
            onEdit: this.options.onEdit,
            onDelete: this.options.onDelete,
            selectedId: this.options.selectedId,
            idField: this.options.idField
        });
    }

    _escape(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    static createViewToggle(container, currentMode, onChange) {
        const toggle = document.createElement('div');
        toggle.className = 'view-toggle';

        const modes = [
            { key: 'compact', icon: 'fa-list', title: 'Vista compacta' },
            { key: 'record', icon: 'fa-align-justify', title: 'Vista detallada' },
            { key: 'card', icon: 'fa-th-large', title: 'Vista tarjetas' },
        ];

        modes.forEach(m => {
            const btn = document.createElement('button');
            btn.className = 'view-toggle-btn' + (m.key === currentMode ? ' active' : '');
            btn.innerHTML = `<i class="fas ${m.icon}"></i>`;
            btn.title = m.title;
            btn.addEventListener('click', () => {
                toggle.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (onChange) onChange(m.key);
            });
            toggle.appendChild(btn);
        });

        container.appendChild(toggle);
        return toggle;
    }
}
