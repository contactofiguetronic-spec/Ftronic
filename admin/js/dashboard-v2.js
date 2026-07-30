const DashboardV2 = {
    init() {
        this._setupClock();
        this._setupCmdPalette();
        this._setupHelp();
        this._setupBottomNav();
        this._renderModuleGrid();
        this._loadData();
    },

    // ═══ CLOCK ═══════════════════════════════════════════════════════════════
    _setupClock() {
        this._updateClock();
        setInterval(() => this._updateClock(), 1000);
    },

    _updateClock() {
        const now = new Date();
        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        const hourEl = document.getElementById('hourHand');
        const minEl = document.getElementById('minuteHand');
        const secEl = document.getElementById('secondHand');
        if (hourEl) hourEl.style.transform = `rotate(${(h % 12) * 30 + m * 0.5}deg)`;
        if (minEl) minEl.style.transform = `rotate(${m * 6 + s * 0.1}deg)`;
        if (secEl) secEl.style.transform = `rotate(${s * 6}deg)`;

        const timeEl = document.getElementById('clockTime');
        const dateEl = document.getElementById('clockDate');
        const greetEl = document.getElementById('clockGreeting');
        const wbTime = document.getElementById('wbTime');
        const wbGreet = document.getElementById('wbGreeting');
        const wbDate = document.getElementById('wbDate');

        if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        if (dateEl) dateEl.textContent = now.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
        if (wbTime) wbTime.textContent = now.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });

        const hr = now.getHours();
        const greeting = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
        if (greetEl) greetEl.textContent = greeting;
        if (wbGreet) wbGreet.textContent = greeting;
        if (wbDate) wbDate.textContent = now.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    },

    // ═══ HELPERS ═════════════════════════════════════════════════════════════
    _setupCmdPalette() {
        this.cmdPalette = new CommandPalette();
        const btn = document.getElementById('btnCommandPalette');
        if (btn) btn.addEventListener('click', () => this.cmdPalette.toggle());
    },

    _setupHelp() {
        const btn = document.getElementById('btnHelp');
        if (btn) btn.addEventListener('click', () => openHelp('index'));
    },

    _setupBottomNav() {
        const nav = document.getElementById('bottomNav');
        if (!nav) return;
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        nav.querySelectorAll('.bottom-nav-item').forEach(item => {
            if (item.getAttribute('href') === currentPage) item.classList.add('active');
        });
    },

    // ═══ ANIMATED COUNTER ════════════════════════════════════════════════════
    _animateValue(el, target, opts = {}) {
        const { prefix = '', suffix = '', duration = 1200, decimals = 0 } = opts;
        const start = performance.now();
        const from = 0;
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const value = from + (target - from) * ease(progress);
            el.textContent = prefix + (decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString('es-CL')) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    _animateMoney(el, target, duration = 1200) {
        const start = performance.now();
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const value = target * ease(progress);
            el.textContent = '$' + Math.round(value).toLocaleString('es-CL');
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    // ═══ MODULE GRID ═════════════════════════════════════════════════════════
    _renderModuleGrid() {
        const el = document.getElementById('moduleGrid');
        if (!el) return;
        const modules = [
            { icon:'fa-clipboard-list', color:'#059669', bg:'rgba(16,185,129,.1)', name:'Recepción', href:'recepcion_unificada.html' },
            { icon:'fa-file-invoice-dollar', color:'#2563eb', bg:'rgba(37,99,235,.1)', name:'Presupuestos', href:'presupuestos.html' },
            { icon:'fa-screwdriver-wrench', color:'#d97706', bg:'rgba(245,158,11,.1)', name:'OTs', href:'ordenes_trabajo.html' },
            { icon:'fa-helmet-safety', color:'#db2777', bg:'rgba(236,72,153,.1)', name:'Ejecución OT', href:'ejecucion_ot.html' },
            { icon:'fa-life-ring', color:'#7c3aed', bg:'rgba(139,92,246,.1)', name:'Apoyo Técnico', href:'apoyo_tecnico.html' },
            { icon:'fa-gears', color:'#ec4899', bg:'rgba(236,72,153,.1)', name:'Servicios', href:'trabajos_servicios.html' },
            { icon:'fa-users', color:'#059669', bg:'rgba(16,185,129,.1)', name:'Clientes', href:'clientes.html' },
            { icon:'fa-car-side', color:'#2563eb', bg:'rgba(37,99,235,.1)', name:'Vehículos', href:'vehiculos.html' },
            { icon:'fa-truck-fast', color:'#d97706', bg:'rgba(245,158,11,.1)', name:'Proveedores', href:'proveedores.html' },
            { icon:'fa-user-gear', color:'#7c3aed', bg:'rgba(139,92,246,.1)', name:'Empleados', href:'empleados.html' },
            { icon:'fa-cube', color:'#059669', bg:'rgba(16,185,129,.1)', name:'Artículos', href:'articulos.html' },
            { icon:'fa-boxes-stacked', color:'#d97706', bg:'rgba(245,158,11,.1)', name:'Insumos', href:'insumos.html' },
            { icon:'fa-list-check', color:'#2563eb', bg:'rgba(37,99,235,.1)', name:'Tareas', href:'tareas_diarias.html' },
            { icon:'fa-location-dot', color:'#ec4899', bg:'rgba(236,72,153,.1)', name:'Zonas', href:'zonas_taller.html' },
            { icon:'fa-file-invoice', color:'#7c3aed', bg:'rgba(139,92,246,.1)', name:'Ord. Compra', href:'orden_compra.html' },
            { icon:'fa-cart-shopping', color:'#059669', bg:'rgba(16,185,129,.1)', name:'Compras', href:'compras.html' },
            { icon:'fa-cash-register', color:'#2563eb', bg:'rgba(37,99,235,.1)', name:'Ventas', href:'ventas.html' },
            { icon:'fa-envelope', color:'#3460C9', bg:'rgba(75,123,236,.1)', name:'Correos', href:'correo.html' },
        ];
        el.innerHTML = modules.map((m, i) =>
            `<a href="${m.href}" class="module-access-item animate-scale-in stagger-${i + 1}">
                <div class="mai-icon" style="background:${m.bg};color:${m.color}"><i class="fas ${m.icon}"></i></div>
                <div class="mai-name">${m.name}</div>
            </a>`
        ).join('');
    },

    // ═══ LOAD DATA ═══════════════════════════════════════════════════════════
    _loadData() {
        const API = '/admin/api/dashboard_v2_api.php';
        fetch(API + '?action=resumen&t=' + Date.now())
            .then(r => r.json())
            .then(d => {
                if (d.status !== 'success') throw new Error(d.message);
                this._data = d.data;
                this._renderWelcomeBanner(d.data);
                this._renderKPIs(d.data);
                this._renderBankAccounts(d.data.cuentas_bancarias || []);
                this._loadOTs();
                this._loadTareas();
                this._loadAlertas(d.data.alertas_stock || []);
                this._renderCharts(d.data);
                this._loadTrendChart();
                this._loadCorreos();
            })
            .catch(err => {
                console.error('Dashboard error:', err);
            });
    },

    // ═══ WELCOME BANNER ══════════════════════════════════════════════════════
    _renderWelcomeBanner(data) {
        const el = document.getElementById('wbVentas');
        if (el) {
            const total = data.ventas_mes?.total || 0;
            const d = data.ventas_mes?.desglose || {};
            const detail = [];
            if (d.ventas_directas) detail.push('Ventas: ' + formatMoney(d.ventas_directas));
            if (d.ots_trabajos) detail.push('OTs: ' + formatMoney(d.ots_trabajos));
            if (d.presupuestos_pagados) detail.push('Pptos: ' + formatMoney(d.presupuestos_pagados));
            el.textContent = formatMoney(total);
            el.title = detail.join(' · ') || 'Sin ingresos este mes';
        }
        const elOTs = document.getElementById('wbOTs');
        if (elOTs) elOTs.textContent = data.ot_activas || 0;
        const elFlujo = document.getElementById('wbFlujo');
        if (elFlujo) elFlujo.textContent = formatMoney(data.flujo_caja?.balance || 0);
    },

    // ═══ KPIs ════════════════════════════════════════════════════════════════
    _renderKPIs(data) {
        // ── Financial KPIs ──
        const fin = document.getElementById('kpiFinancial');
        if (fin) {
            const d = data.ventas_mes?.desglose || {};
            const finKpis = [
                { icon:'fa-dollar-sign', label:'Ingresos del Mes', value:data.ventas_mes?.total||0, color:'#059669', bg:'rgba(16,185,129,.1)',
                  trend:data.ventas_mes?.variacion, trendLabel:'vs mes ant.', href:'ventas.html', money:true,
                  breakdown:d, subtitle: (d.ventas_directas_cantidad||0)+' ventas · '+(d.ots_trabajos_cantidad||0)+' OTs · '+(d.presupuestos_pagados_cantidad||0)+' pptos' },
                { icon:'fa-shopping-cart', label:'Compras del Mes', value:data.compras_mes?.total||0, color:'#dc2626', bg:'rgba(239,68,68,.1)',
                  subtitle:(data.compras_mes?.cantidad||0)+' compras', href:'compras.html', money:true },
                { icon:'fa-chart-pie', label:'Utilidad Bruta', value:data.utilidad_bruta||0, color:'#2563eb', bg:'rgba(37,99,235,.1)',
                  subtitle:'Ventas - Compras', href:'datos_reportes.html', money:true },
                { icon:'fa-chart-line', label:'Flujo de Caja', value:data.flujo_caja?.balance||0, color:'#059669', bg:'rgba(16,185,129,.1)',
                  subtitle:'Ing: '+formatMoney(data.flujo_caja?.ingresos||0), href:'datos_reportes.html', money:true },
            ];
            fin.innerHTML = finKpis.map((k, i) => this._kpiCard(k, i)).join('');
            this._animateKPIValues(fin, finKpis);
        }

        // ── Operations KPIs ──
        const ops = document.getElementById('kpiOperations');
        if (ops) {
            const opsKpis = [
                { icon:'fa-tools', label:'OTs Activas', value:data.ot_activas||0, color:'#d97706', bg:'rgba(245,158,11,.1)',
                  subtitle:'En progreso / pendientes', href:'ordenes_trabajo.html' },
                { icon:'fa-file-invoice-dollar', label:'Presupuestos Mes', value:data.presupuestos_mes?.cantidad||0, color:'#2563eb', bg:'rgba(37,99,235,.1)',
                  subtitle:'Conversión: '+(data.conversion_presupuestos?.tasa||0)+'%', href:'presupuestos.html' },
                { icon:'fa-hand-holding-usd', label:'Por Cobrar', value:data.por_cobrar?.total||0, color:'#059669', bg:'rgba(16,185,129,.1)',
                  subtitle:(data.por_cobrar?.cantidad||0)+' ventas pendientes', href:'ventas.html', money:true },
                { icon:'fa-credit-card', label:'Por Pagar', value:data.por_pagar?.total||0, color:'#d97706', bg:'rgba(245,158,11,.1)',
                  subtitle:(data.por_pagar?.cantidad||0)+' compras pendientes', href:'compras.html', money:true },
            ];
            ops.innerHTML = opsKpis.map((k, i) => this._kpiCard(k, i + 4)).join('');
            this._animateKPIValues(ops, opsKpis);
        }
    },

    _kpiCard(k, idx) {
        const trendHtml = k.trend != null
            ? `<span class="kpi-trend ${k.trend >= 0 ? 'up' : 'down'}"><i class="fas fa-arrow-${k.trend >= 0 ? 'up' : 'down'}"></i> ${k.trend >= 0 ? '+' : ''}${k.trend}%</span>`
            : '';
        const subtitleHtml = k.subtitle ? `<div class="kpi-label">${k.subtitle}</div>` : '';
        let breakdownHtml = '';
        if (k.breakdown) {
            const b = k.breakdown;
            breakdownHtml = `<div class="kpi-breakdown">
                <span><i class="fas fa-shopping-cart" style="color:#059669;"></i> Ventas: ${formatMoney(b.ventas_directas||0)}</span>
                <span><i class="fas fa-tools" style="color:#d97706;"></i> OTs: ${formatMoney(b.ots_trabajos||0)}</span>
                <span><i class="fas fa-file-invoice-dollar" style="color:#2563eb;"></i> Pptos: ${formatMoney(b.presupuestos_pagados||0)}</span>
            </div>`;
        }
        return `
        <a href="${k.href}" class="kpi-card animate-fade-in-up stagger-${idx + 1}">
            <div class="kpi-top">
                <div class="kpi-icon" style="background:${k.bg};color:${k.color}"><i class="fas ${k.icon}"></i></div>
                ${trendHtml}
            </div>
            <div class="kpi-value" data-target="${k.value}" data-money="${k.money?'1':'0'}">${k.money ? '$0' : '0'}</div>
            ${subtitleHtml}
            ${breakdownHtml}
        </a>`;
    },

    _animateKPIValues(container, kpis) {
        const cards = container.querySelectorAll('.kpi-value');
        cards.forEach((el, i) => {
            const k = kpis[i];
            const target = parseFloat(el.dataset.target) || 0;
            setTimeout(() => {
                if (k.money) this._animateMoney(el, target);
                else this._animateValue(el, target);
            }, 300 + i * 100);
        });
    },

    // ═══ BANK ACCOUNTS ═══════════════════════════════════════════════════════
    _renderBankAccounts(accounts) {
        const el = document.getElementById('bankCards');
        if (!el || !accounts.length) { if (el) el.innerHTML = '<div class="tp-empty">No hay cuentas registradas</div>'; return; }
        el.innerHTML = accounts.map(a => {
            const saldo = parseFloat(a.saldo) || 0;
            const cls = saldo >= 0 ? 'positive' : 'negative';
            return `
            <a href="cuentas_bancarias.html" class="bank-card">
                <div class="bank-card-icon" style="background:rgba(37,99,235,.08);color:var(--primary);"><i class="fas fa-landmark"></i></div>
                <div class="bank-card-name">${escapeHtml(a.nombre)}</div>
                <div class="bank-card-bank">${escapeHtml(a.banco || 'Sin banco')}</div>
                <div class="bank-card-saldo ${cls}">${formatMoney(saldo)}</div>
            </a>`;
        }).join('');
    },

    // ═══ TODAY'S WORK ═══════════════════════════════════════════════════════
    _loadOTs() {
        const el = document.getElementById('otList');
        const countEl = document.getElementById('otCount');
        if (!el) return;

        fetch('/admin/api/ordenes_trabajo_api.php?action=listar&page=1&per_page=10&t=' + Date.now())
            .then(r => r.json())
            .then(d => {
                const items = (d.data.items || []).filter(ot => !['finalizado','cancelado','entregado'].includes(ot.estado));
                if (!items.length) {
                    el.innerHTML = '<div class="tp-empty"><i class="fas fa-check-circle" style="font-size:1.5rem;opacity:.3;display:block;margin-bottom:.4rem;"></i>Sin OTs pendientes</div>';
                    if (countEl) countEl.textContent = '0';
                    return;
                }
                if (countEl) countEl.textContent = items.length;
                const statusColors = { abierta:'var(--primary)', proceso:'var(--warning)', diagnostico:'#8b5cf6' };
                const statusLabels = { abierta:'Abierta', proceso:'En Proceso', diagnostico:'Diagnóstico' };
                el.innerHTML = items.slice(0, 8).map(ot => {
                    const color = statusColors[ot.estado] || 'var(--text-secondary)';
                    const label = statusLabels[ot.estado] || ot.estado;
                    const sub = ot.patente ? `${ot.patente} · ${ot.cliente_nombre||''}` : `OT #${ot.id}`;
                    return `
                    <div class="tp-item" onclick="window.location.href='ejecucion_ot.html?ot_id=${ot.id}'">
                        <div class="tp-item-dot" style="background:${color}"></div>
                        <div class="tp-item-info">
                            <div class="tp-item-name">OT #${ot.id} — ${escapeHtml(ot.descripcion||'Sin descripción')}</div>
                            <div class="tp-item-sub">${escapeHtml(sub)} · <span style="color:${color};font-weight:600;">${label}</span></div>
                        </div>
                        <button class="tp-item-btn primary">Iniciar</button>
                    </div>`;
                }).join('');
            })
            .catch(() => {
                el.innerHTML = '<div class="tp-empty">Error al cargar OTs</div>';
            });
    },

    _loadTareas() {
        const el = document.getElementById('tareaList');
        const countEl = document.getElementById('tareaCount');
        if (!el) return;

        fetch('/admin/api/reportes_api.php?action=resumen_general&t=' + Date.now())
            .then(r => r.json())
            .then(d => {
                if (d.status !== 'success') throw new Error();
                const pending = d.data?.tareas_pendientes || 0;
                const progress = d.data?.tareas_en_progreso || 0;
                if (!pending && !progress) {
                    el.innerHTML = '<div class="tp-empty"><i class="fas fa-check-double" style="font-size:1.5rem;opacity:.3;display:block;margin-bottom:.4rem;"></i>Sin tareas pendientes</div>';
                    if (countEl) countEl.textContent = '0';
                    return;
                }
                const total = pending + progress;
                if (countEl) countEl.textContent = total;

                let html = '';
                if (progress > 0) {
                    html += `<div class="tp-item" onclick="window.location.href='tareas_diarias.html'">
                        <div class="tp-item-dot" style="background:var(--warning)"></div>
                        <div class="tp-item-info">
                            <div class="tp-item-name">${progress} tarea${progress>1?'s':''} en progreso</div>
                            <div class="tp-item-sub">Continuar trabajo asignado</div>
                        </div>
                        <button class="tp-item-btn warning">Ver</button>
                    </div>`;
                }
                if (pending > 0) {
                    html += `<div class="tp-item" onclick="window.location.href='tareas_diarias.html'">
                        <div class="tp-item-dot" style="background:var(--primary)"></div>
                        <div class="tp-item-info">
                            <div class="tp-item-name">${pending} tarea${pending>1?'s':''} pendiente${pending>1?'s':''}</div>
                            <div class="tp-item-sub">Tareas sin iniciar</div>
                        </div>
                        <button class="tp-item-btn outline">Ver</button>
                    </div>`;
                }
                el.innerHTML = html;
            })
            .catch(() => {
                el.innerHTML = '<div class="tp-empty">Error al cargar tareas</div>';
            });
    },

    _loadAlertas(alertas) {
        const el = document.getElementById('alertaList');
        const countEl = document.getElementById('alertaCount');
        if (!el) return;

        if (!alertas.length) {
            el.innerHTML = '<div class="tp-empty"><i class="fas fa-check-circle" style="font-size:1.5rem;opacity:.3;display:block;margin-bottom:.4rem;"></i>Sin alertas de stock</div>';
            if (countEl) countEl.textContent = '0';
            return;
        }

        if (countEl) countEl.textContent = alertas.length;
        el.innerHTML = alertas.slice(0, 8).map(a => {
            const stock = a.stock_actual ?? a.stock ?? 0;
            const min = a.stock_minimo ?? 5;
            const isOut = stock <= 0;
            return `
            <div class="tp-item" onclick="window.location.href='articulos.html'">
                <div class="tp-item-dot" style="background:${isOut ? 'var(--danger)' : 'var(--warning)'}"></div>
                <div class="tp-item-info">
                    <div class="tp-item-name">${escapeHtml(a.nombre)}</div>
                    <div class="tp-item-sub">Stock: <strong style="color:${isOut ? 'var(--danger)' : 'var(--warning)'}">${stock}</strong> / Mín: ${min}</div>
                </div>
                <button class="tp-item-btn ${isOut ? 'danger' : 'warning'}">${isOut ? 'Sin stock' : 'Bajo'}</button>
            </div>`;
        }).join('');
    },

    _loadCorreos() {
        const el = document.getElementById('correoList');
        const countEl = document.getElementById('correoCount');
        const navBadge = document.getElementById('nav-count-correos');
        if (!el) return;

        fetch('/admin/api/correo_api.php?action=listar&per_page=6')
            .then(r => r.json())
            .then(d => {
                const items = d.data?.items || [];
                const total = d.data?.total || 0;

                if (navBadge) {
                    if (total > 0) { navBadge.textContent = total; navBadge.style.display = ''; }
                    else { navBadge.style.display = 'none'; }
                }

                if (!items.length) {
                    el.innerHTML = '<div class="tp-empty"><i class="fas fa-envelope-open" style="font-size:1.5rem;opacity:.3;display:block;margin-bottom:.4rem;"></i>Sin correos recientes</div>';
                    if (countEl) countEl.textContent = '0';
                    return;
                }

                if (countEl) countEl.textContent = total;
                el.innerHTML = items.map(m => {
                    const initials = (m.remitente_nombre || m.remitente_email || '?').split(/[\s@]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
                    const date = m.fecha_envio ? new Date(m.fecha_envio) : null;
                    const isToday = date && date.toDateString() === new Date().toDateString();
                    const dateStr = isToday ? date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : (date ? date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : '');
                    const unreadCls = !m.leido ? ' font-weight:700;' : '';
                    return `
                    <div class="tp-item" onclick="window.location.href='correo.html'" style="cursor:pointer;">
                        <div style="width:32px;height:32px;min-width:32px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;">${escapeHtml(initials)}</div>
                        <div class="tp-item-info">
                            <div class="tp-item-name" style="${unreadCls}">${escapeHtml(m.remitente_nombre || m.remitente_email)}</div>
                            <div class="tp-item-sub">${escapeHtml((m.asunto || '').substring(0, 45))}${(m.asunto || '').length > 45 ? '...' : ''}</div>
                        </div>
                        <span style="font-size:.65rem;color:var(--text-secondary);white-space:nowrap;">${dateStr}</span>
                    </div>`;
                }).join('');
            })
            .catch(() => {
                el.innerHTML = '<div class="tp-empty"><i class="fas fa-exclamation-triangle" style="font-size:1.2rem;opacity:.3;display:block;margin-bottom:.3rem;"></i>Error al cargar correos</div>';
            });
    },

    // ═══ CHARTS ══════════════════════════════════════════════════════════════
    _renderCharts(data) {
        // ── Financial Bar Chart ──
        const ctx = document.getElementById('financeChart');
        if (ctx && typeof Chart !== 'undefined') {
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Ingresos', 'Egresos', 'Utilidad'],
                    datasets: [{
                        data: [data.ventas_mes?.total||0, data.compras_mes?.total||0, data.utilidad_bruta||0],
                        backgroundColor: ['rgba(16,185,129,0.8)', 'rgba(239,68,68,0.8)', 'rgba(37,99,235,0.8)'],
                        borderColor: ['#10B981', '#EF4444', '#2563EB'],
                        borderWidth: 1, borderRadius: 8, barPercentage: 0.55,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 1200, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: { backgroundColor:'#1e293b', titleColor:'#f8fafc', bodyColor:'#cbd5e1', cornerRadius:8, padding:12,
                            callbacks: { label: c => formatMoney(c.raw) } }
                    },
                    scales: {
                        y: { beginAtZero:true, ticks:{ callback:v=>formatMoney(v), color:'#94a3b8', font:{size:11} }, grid:{ color:'rgba(0,0,0,.04)' } },
                        x: { ticks:{ color:'#64748b', font:{size:11, weight:600} }, grid:{ display:false } }
                    },
                    onClick: (e, els) => { if (els.length) window.location.href = 'datos_reportes.html'; }
                }
            });
        }
    },

    _loadTrendChart() {
        fetch('/admin/api/dashboard_v2_api.php?action=ventas_por_periodo&meses=12&t=' + Date.now())
            .then(r => r.json())
            .then(d => {
                if (d.status !== 'success' || !d.data?.length) return;
                const ctx = document.getElementById('trendChart');
                if (!ctx || typeof Chart === 'undefined') return;

                const labels = d.data.map(r => {
                    const [y, m] = r.periodo.split('-');
                    const months = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                    return months[parseInt(m)] + ' ' + y.slice(2);
                });
                const values = d.data.map(r => parseFloat(r.total) || 0);

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Ventas',
                            data: values,
                            borderColor: '#10B981',
                            backgroundColor: 'rgba(16,185,129,0.08)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 2.5,
                            pointRadius: 3,
                            pointBackgroundColor: '#10B981',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointHoverRadius: 6,
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        animation: { duration: 1500, easing: 'easeOutQuart' },
                        plugins: {
                            legend: { display: false },
                            tooltip: { backgroundColor:'#1e293b', titleColor:'#f8fafc', bodyColor:'#cbd5e1', cornerRadius:8, padding:12,
                                callbacks: { label: c => 'Ventas: ' + formatMoney(c.raw) } }
                        },
                        scales: {
                            y: { beginAtZero:true, ticks:{ callback:v=>formatMoney(v), color:'#94a3b8', font:{size:11} }, grid:{ color:'rgba(0,0,0,.04)' } },
                            x: { ticks:{ color:'#64748b', font:{size:10}, maxRotation:45 }, grid:{ display:false } }
                        },
                        onClick: (e, els) => { if (els.length) window.location.href = 'datos_reportes.html'; }
                    }
                });
            })
            .catch(() => {});
    }
};

document.addEventListener('DOMContentLoaded', () => DashboardV2.init());
