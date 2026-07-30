const API = API_ROOT + 'pos_api.php';
const esc = escapeHtml;

let cart = [];
let cuentas = [];
let allItems = [];

// ═══ INIT ═════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    loadCuentas();
    loadAllItems();
    el('posSearch').addEventListener('input', () => filterItems(el('posSearch').value.trim()));
    el('btnConfirmar').addEventListener('click', confirmarVenta);
    el('btnClearCart').addEventListener('click', () => { if (cart.length && confirm('Vaciar carro?')) resetCart(); });
});

// ═══ CARGAR TODO ══════════════════════════════════════════════════════════════
async function loadAllItems() {
    const grid = el('posGrid');
    grid.innerHTML = '<div class="pos-empty"><i class="fas fa-spinner fa-spin"></i> Cargando catálogo...</div>';
    try {
        const r = await fetch(`${API}?action=buscar&q=&t=${Date.now()}`);
        const d = await r.json();
        if (d.status !== 'success') { grid.innerHTML = '<div class="pos-empty">Error al cargar</div>'; return; }
        allItems = d.data || [];
        renderGrid(allItems);
    } catch (e) { grid.innerHTML = '<div class="pos-empty">Error de conexión</div>'; }
}

// ═══ FILTRAR ═════════════════════════════════════════════════════════════════
function filterItems(q) {
    if (!q) { renderGrid(allItems); return; }
    const lower = q.toLowerCase();
    const filtered = allItems.filter(it =>
        it.nombre.toLowerCase().includes(lower) ||
        (it.codigo && it.codigo.toLowerCase().includes(lower)) ||
        (it.descripcion && it.descripcion.toLowerCase().includes(lower))
    );
    renderGrid(filtered, q);
}

// ═══ RENDER GRID ══════════════════════════════════════════════════════════════
function renderGrid(items, query) {
    const grid = el('posGrid');
    if (!items.length) {
        grid.innerHTML = `<div class="pos-empty"><i class="fas fa-search" style="font-size:2rem;opacity:0.25;display:block;margin-bottom:0.5rem;"></i>${query ? 'Sin resultados para "' + esc(query) + '"' : 'No hay productos ni servicios activos'}</div>`;
        return;
    }
    grid.innerHTML = items.map(it => {
        const stockClass = it.stock != null ? (it.stock <= 0 ? 'out' : (it.stock <= 5 ? 'low' : '')) : '';
        const stockText = it.stock != null ? `Stock: ${it.stock}` : '';
        const badgeLabel = it.tipo === 'articulo' ? '<i class="fas fa-box"></i> Artículo' : '<i class="fas fa-wrench"></i> Servicio';
        const desc = it.descripcion ? `<div class="pos-item-desc" title="${esc(it.descripcion)}">${esc(it.descripcion.substring(0, 50))}</div>` : '';
        return `
        <div class="pos-item" onclick="addToCart(${JSON.stringify({id:it.id,nombre:it.nombre,precio:parseFloat(it.precio),tipo:it.tipo,stock:it.stock}).replace(/"/g,'&quot;')})">
            <span class="pos-item-badge ${it.tipo}">${badgeLabel}</span>
            <div class="pos-item-name" title="${esc(it.nombre)}">${esc(it.nombre)}</div>
            ${desc}
            ${stockText ? `<span class="pos-item-stock ${stockClass}">${stockText}</span>` : ''}
            <div class="pos-item-price">${formatMoney(parseFloat(it.precio))}</div>
        </div>`;
    }).join('');
}

// ═══ CUENTAS ═════════════════════════════════════════════════════════════════
async function loadCuentas() {
    try {
        const r = await fetch(`${API}?action=cuentas&t=${Date.now()}`);
        const d = await r.json();
        if (d.status === 'success') {
            cuentas = d.data || [];
            const sel = el('posCuenta');
            sel.innerHTML = '<option value="">Seleccionar cuenta...</option>' +
                cuentas.map(c => `<option value="${c.id}">${esc(c.nombre)}${c.banco ? ' (' + esc(c.banco) + ')' : ''}</option>`).join('');
            if (cuentas.length === 1) sel.value = cuentas[0].id;
        }
    } catch (e) { console.error('Cuentas error:', e); }
}

// ═══ CART ═════════════════════════════════════════════════════════════════════
window.addToCart = function(item) {
    const idx = cart.findIndex(c => c.id === item.id && c.tipo === item.tipo);
    if (idx >= 0) {
        const newQty = cart[idx].cantidad + 1;
        if (item.stock != null && newQty > item.stock) {
            el('errorStockMsg').textContent = `"${item.nombre}" solo tiene ${item.stock} en stock.`;
            el('errorStockModal').classList.add('active');
            return;
        }
        cart[idx].cantidad = newQty;
    } else {
        if (item.stock != null && item.stock <= 0) {
            el('errorStockMsg').textContent = `"${item.nombre}" no tiene stock disponible.`;
            el('errorStockModal').classList.add('active');
            return;
        }
        cart.push({ ...item, cantidad: 1 });
    }
    renderCart();
};

window.updateQty = function(idx, delta) {
    const it = cart[idx];
    const newQty = it.cantidad + delta;
    if (newQty <= 0) { cart.splice(idx, 1); renderCart(); return; }
    if (it.stock != null && newQty > it.stock) {
        el('errorStockMsg').textContent = `"${it.nombre}" solo tiene ${it.stock} en stock.`;
        el('errorStockModal').classList.add('active');
        return;
    }
    it.cantidad = newQty;
    renderCart();
};

window.removeFromCart = function(idx) {
    cart.splice(idx, 1);
    renderCart();
};

function renderCart() {
    const container = el('cartItems');
    const empty = el('cartEmpty');
    if (!cart.length) {
        container.innerHTML = '';
        container.appendChild(empty);
        empty.style.display = '';
        el('posSubtotal').textContent = '$0';
        el('posIva').textContent = '$0';
        el('posTotal').textContent = '$0';
        el('btnConfirmar').disabled = true;
        return;
    }
    empty.style.display = 'none';
    container.innerHTML = cart.map((it, i) => `
        <div class="pos-cart-row">
            <div class="pos-cart-row-name" title="${esc(it.nombre)}">${esc(it.nombre)}<small>${it.tipo === 'articulo' ? 'Articulo' : 'Servicio'} · ${formatMoney(it.precio)}</small></div>
            <div class="pos-cart-row-qty">
                <button onclick="updateQty(${i}, -1)"><i class="fas fa-minus"></i></button>
                <span>${it.cantidad}</span>
                <button onclick="updateQty(${i}, 1)"><i class="fas fa-plus"></i></button>
            </div>
            <div class="pos-cart-row-price">${formatMoney(it.precio * it.cantidad)}</div>
            <span class="pos-cart-row-del" onclick="removeFromCart(${i})"><i class="fas fa-xmark"></i></span>
        </div>
    `).join('');
    const sub = cart.reduce((s, it) => s + it.precio * it.cantidad, 0);
    const iva = Math.round(sub * 0.19);
    el('posSubtotal').textContent = formatMoney(sub);
    el('posIva').textContent = formatMoney(iva);
    el('posTotal').textContent = formatMoney(sub + iva);
    el('btnConfirmar').disabled = !el('posCuenta').value;
}

el('posCuenta')?.addEventListener('change', () => { if (cart.length) el('btnConfirmar').disabled = !el('posCuenta').value; });

function resetCart() {
    cart = [];
    el('posSearch').value = '';
    renderGrid(allItems);
    renderCart();
}

// ═══ CONFIRMAR ═══════════════════════════════════════════════════════════════
async function confirmarVenta() {
    const cuentaId = el('posCuenta').value;
    if (!cuentaId) return showError('Seleccione una cuenta bancaria');
    if (!cart.length) return showError('El carro esta vacio');

    const btn = el('btnConfirmar');
    setButtonLoading(btn, true);

    const fd = new FormData();
    fd.append('action', 'confirmar_venta');
    fd.append('items_json', JSON.stringify(cart));
    fd.append('cuenta_bancaria_id', cuentaId);
    fd.append('forma_pago', el('posFormaPago').value);

    try {
        const r = await fetch(API, { method: 'POST', body: fd });
        const d = await r.json();
        if (d.status === 'success') {
            const sub = cart.reduce((s, it) => s + it.precio * it.cantidad, 0);
            const iva = Math.round(sub * 0.19);
            el('successTotal').textContent = formatMoney(sub + iva);
            el('successMsg').textContent = `Venta #${d.data.venta_id} registrada exitosamente.`;
            el('successModal').classList.add('active');
        } else {
            showError(d.message);
        }
    } catch (e) {
        showError('Error de conexion: ' + e.message);
    } finally {
        setButtonLoading(btn, false);
    }
}
