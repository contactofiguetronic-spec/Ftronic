class CommandPalette {
    constructor(config = {}) {
        this.config = {
            modules: [],
            onNavigate: null,
            ...config
        };

        this.overlay = null;
        this.input = null;
        this.results = null;
        this._items = [];
        this._filteredItems = [];
        this._highlightedIndex = -1;
        this._active = false;

        this._bind();
    }

    _bind() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.toggle();
                return;
            }

            if (!this._active) return;

            if (e.key === 'Escape') {
                this.close();
                e.preventDefault();
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._highlightNext();
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._highlightPrev();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                this._activateHighlighted();
                return;
            }
        });
    }

    toggle() {
        if (this._active) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'cmd-overlay';
        this.overlay.innerHTML = `
            <div class="cmd-palette">
                <div class="cmd-input-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" id="cmdInput" placeholder="Buscar módulos, acciones, crear..." autocomplete="off" spellcheck="false">
                    <span class="cmd-shortcut-hint">ESC</span>
                </div>
                <div class="cmd-results" id="cmdResults"></div>
            </div>`;

        document.body.appendChild(this.overlay);

        this.input = this.overlay.querySelector('#cmdInput');
        this.results = this.overlay.querySelector('#cmdResults');

        this._buildIndex();

        this.input.addEventListener('input', () => this._search(this.input.value));
        this.results.addEventListener('click', (e) => {
            const item = e.target.closest('.cmd-item');
            if (item) {
                const index = parseInt(item.dataset.index);
                if (!isNaN(index) && this._filteredItems[index]) {
                    this._navigate(this._filteredItems[index]);
                }
            }
        });

        requestAnimationFrame(() => {
            this.overlay.classList.add('active');
            this.input.focus();
        });

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        this._active = true;
        this._search('');
    }

    close() {
        if (!this.overlay) return;
        this.overlay.classList.remove('active');
        this._highlightedIndex = -1;
        this._active = false;
        setTimeout(() => {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
                this.input = null;
                this.results = null;
            }
        }, 200);
    }

    _buildIndex() {
        this._items = [];

        const currentPage = window.location.pathname.split('/').pop() || 'index.html';

        const mods = [
            { key: 'recepcion_unificada', icon: 'fa-clipboard-check', label: 'Recepción Unificada', desc: 'Registro de ingreso de vehículos' },
            { key: 'ordenes_trabajo', icon: 'fa-tools', label: 'Órdenes de Trabajo', desc: 'Gestión de órdenes de trabajo' },
            { key: 'ejecucion_ot', icon: 'fa-hard-hat', label: 'Ejecución OT', desc: 'Ejecución de órdenes de trabajo' },
            { key: 'presupuestos', icon: 'fa-file-invoice-dollar', label: 'Presupuestos', desc: 'Presupuestos y cotizaciones' },
            { key: 'clientes', icon: 'fa-users', label: 'Clientes', desc: 'Base de datos de clientes' },
            { key: 'vehiculos', icon: 'fa-car', label: 'Vehículos', desc: 'Inventario de vehículos' },
            { key: 'articulos', icon: 'fa-box', label: 'Artículos', desc: 'Inventario de repuestos' },
            { key: 'insumos', icon: 'fa-boxes', label: 'Insumos', desc: 'Insumos del taller' },
            { key: 'proveedores', icon: 'fa-truck', label: 'Proveedores', desc: 'Directorio de proveedores' },
            { key: 'empleados', icon: 'fa-user-tie', label: 'Empleados', desc: 'Gestión de empleados' },
            { key: 'ventas', icon: 'fa-cash-register', label: 'Ventas', desc: 'Facturación y cobros' },
            { key: 'compras', icon: 'fa-shopping-cart', label: 'Compras', desc: 'Compras y egresos' },
            { key: 'compras_rapidas', icon: 'fa-bolt', label: 'Compra Rápida', desc: 'Compras rápidas y gastos' },
            { key: 'orden_compra', icon: 'fa-file-invoice', label: 'Órdenes de Compra', desc: 'Órdenes de compra' },
            { key: 'pagos', icon: 'fa-credit-card', label: 'Pagos', desc: 'Registro de pagos' },
            { key: 'cuentas_bancarias', icon: 'fa-university', label: 'Cuentas Bancarias', desc: 'Cuentas bancarias' },
            { key: 'apoyo_tecnico', icon: 'fa-life-ring', label: 'Apoyo Técnico', desc: 'Apoyo técnico' },
            { key: 'tareas_diarias', icon: 'fa-tasks', label: 'Tareas Diarias', desc: 'Tareas del equipo' },
            { key: 'trabajos_servicios', icon: 'fa-cogs', label: 'Trabajos y Servicios', desc: 'Catálogo de servicios' },
            { key: 'datos_reportes', icon: 'fa-chart-bar', label: 'Datos y Reportes', desc: 'Reportes y estadísticas' },
            { key: 'index', icon: 'fa-home', label: 'Panel Principal', desc: 'Dashboard e inicio' },
            { key: 'zonas_taller', icon: 'fa-map-marker-alt', label: 'Zonas Taller', desc: 'Áreas y zonas del taller' },
            { key: 'inventario_taller', icon: 'fa-toolbox', label: 'Inventario Taller', desc: 'Herramientas y equipos' },
        ];

        // Module items
        mods.forEach(m => {
            const url = m.key === 'index' ? 'dashboard.html' : `${m.key}.html`;
            this._items.push({
                type: 'module',
                icon: m.icon,
                label: m.label,
                desc: m.desc,
                url: url,
                keywords: `${m.label} ${m.desc} ${m.key} modulo ir`.toLowerCase()
            });
        });

        // Create action items for each module
        const createActions = {
            'recepcion_unificada': { icon: 'fa-plus-circle', label: 'Nueva Recepción', desc: 'Crear una recepción de vehículo' },
            'ordenes_trabajo': { icon: 'fa-plus-circle', label: 'Nueva OT', desc: 'Crear orden de trabajo' },
            'presupuestos': { icon: 'fa-plus-circle', label: 'Nuevo Presupuesto', desc: 'Crear presupuesto' },
            'clientes': { icon: 'fa-plus-circle', label: 'Nuevo Cliente', desc: 'Registrar nuevo cliente' },
            'vehiculos': { icon: 'fa-plus-circle', label: 'Nuevo Vehículo', desc: 'Registrar vehículo' },
            'proveedores': { icon: 'fa-plus-circle', label: 'Nuevo Proveedor', desc: 'Registrar proveedor' },
            'empleados': { icon: 'fa-plus-circle', label: 'Nuevo Empleado', desc: 'Registrar empleado' },
            'compras_rapidas': { icon: 'fa-plus-circle', label: 'Nueva Compra Rápida', desc: 'Registrar gasto o compra rápida' },
            'tareas_diarias': { icon: 'fa-plus-circle', label: 'Nueva Tarea', desc: 'Crear tarea pendiente' },
            'articulos': { icon: 'fa-plus-circle', label: 'Nuevo Artículo', desc: 'Agregar artículo al inventario' },
            'insumos': { icon: 'fa-plus-circle', label: 'Nuevo Insumo', desc: 'Agregar insumo' },
        };

        Object.entries(createActions).forEach(([key, val]) => {
            const url = `${key}.html`;
            this._items.push({
                type: 'action',
                icon: val.icon,
                label: val.label,
                desc: val.desc,
                url: url,
                keywords: `${val.label} ${val.desc} crear nuevo agregar ${key}`.toLowerCase()
            });
        });

        // Context-specific quick actions
        const ctxActions = {
            'ejecucion_ot.html': [
                { icon: 'fa-play', label: 'Iniciar Trabajo', desc: 'Clock in en OT activa', keywords: 'iniciar trabajo clock in empezar' },
            ],
            'ordenes_trabajo.html': [
                { icon: 'fa-file-invoice-dollar', label: 'Ver Presupuestos', desc: 'Ir a presupuestos', keywords: 'presupuestos cotizacion' },
            ],
        };

        if (ctxActions[currentPage]) {
            ctxActions[currentPage].forEach(a => {
                const url = currentPage;
                this._items.push({
                    type: 'quick',
                    icon: a.icon,
                    label: a.label,
                    desc: a.desc,
                    url: url,
                    keywords: a.keywords
                });
            });
        }

        // Global quick actions
        this._items.push({
            type: 'system',
            icon: 'fa-arrow-left',
            label: 'Volver al inicio',
            desc: 'Navegar al panel principal',
            url: 'dashboard.html',
            keywords: 'inicio home volver dashboard'
        });
    }

    _search(query) {
        const q = query.toLowerCase().trim();
        this._highlightedIndex = -1;

        let filtered;
        if (!q) {
            // Empty query: show modules grouped, no actions
            filtered = this._items.filter(i => i.type === 'module' || i.type === 'system');
        } else {
            // Fuzzy-like: check if all query terms appear in keywords
            const terms = q.split(/\s+/).filter(Boolean);
            filtered = this._items.filter(item =>
                terms.every(term => item.keywords.includes(term)) ||
                terms.some(term => {
                    // Partial match on label
                    const label = item.label.toLowerCase();
                    return label.includes(term) || term.includes(label);
                })
            );
        }

        this._filteredItems = filtered;

        if (!filtered.length) {
            this.results.innerHTML = `<div class="cmd-empty"><i class="fas fa-search" style="display:block;font-size:1.5rem;margin-bottom:0.5rem;opacity:0.3"></i> Sin resultados para "${escapeHtml(query)}"</div>`;
            return;
        }

        let html = '';

        const modules = filtered.filter(i => i.type === 'module');
        if (modules.length) {
            if (q) html += '<div class="cmd-group-label">Módulos</div>';
            else html += '<div class="cmd-group-label">Navegación</div>';
            modules.forEach(item => {
                const actualIdx = filtered.indexOf(item);
                html += `
                    <a href="${item.url}" class="cmd-item" data-index="${actualIdx}">
                        <i class="fas ${item.icon}"></i>
                        <span class="cmd-item-label">${item.label}</span>
                        <span class="cmd-item-desc">${item.desc}</span>
                    </a>`;
            });
        }

        const actions = filtered.filter(i => i.type === 'action');
        if (actions.length) {
            html += '<div class="cmd-group-label">Acciones</div>';
            actions.forEach(item => {
                const actualIdx = filtered.indexOf(item);
                html += `
                    <a href="${item.url}" class="cmd-item cmd-action" data-index="${actualIdx}">
                        <i class="fas ${item.icon}" style="color:var(--accent)"></i>
                        <span class="cmd-item-label">${item.label}</span>
                        <span class="cmd-item-desc">${item.desc}</span>
                    </a>`;
            });
        }

        const quicks = filtered.filter(i => i.type === 'quick');
        if (quicks.length) {
            html += '<div class="cmd-group-label">Acceso Rápido</div>';
            quicks.forEach(item => {
                const actualIdx = filtered.indexOf(item);
                html += `
                    <a href="${item.url}" class="cmd-item" data-index="${actualIdx}">
                        <i class="fas ${item.icon}" style="color:var(--warning)"></i>
                        <span class="cmd-item-label">${item.label}</span>
                        <span class="cmd-item-desc">${item.desc}</span>
                    </a>`;
            });
        }

        const systems = filtered.filter(i => i.type === 'system');
        if (systems.length) {
            // Only show system items if query matches
            if (q) {
                html += '<div class="cmd-group-label">Sistema</div>';
                systems.forEach(item => {
                    const actualIdx = filtered.indexOf(item);
                    html += `
                        <a href="${item.url}" class="cmd-item" data-index="${actualIdx}">
                            <i class="fas ${item.icon}"></i>
                            <span class="cmd-item-label">${item.label}</span>
                            <span class="cmd-item-desc">${item.desc}</span>
                        </a>`;
                });
            }
        }

        this.results.innerHTML = html;
    }

    _highlightNext() {
        if (!this._filteredItems || !this._filteredItems.length) return;
        const max = this._filteredItems.length - 1;
        this._highlightedIndex = Math.min(max, this._highlightedIndex + 1);
        this._scrollToHighlighted();
    }

    _highlightPrev() {
        if (!this._filteredItems || !this._filteredItems.length) return;
        this._highlightedIndex = Math.max(0, this._highlightedIndex - 1);
        this._scrollToHighlighted();
    }

    _scrollToHighlighted() {
        const items = this.results.querySelectorAll('.cmd-item');
        items.forEach((el, i) => {
            el.classList.toggle('highlighted', i === this._highlightedIndex);
        });
        if (items[this._highlightedIndex]) {
            items[this._highlightedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    _activateHighlighted() {
        if (this._highlightedIndex >= 0 && this._filteredItems && this._filteredItems[this._highlightedIndex]) {
            this._navigate(this._filteredItems[this._highlightedIndex]);
        }
    }

    _navigate(item) {
        this.close();
        if (item.url) {
            if (this.config.onNavigate) {
                this.config.onNavigate(item.url);
            } else {
                window.location.href = item.url;
            }
        }
    }
}
