/**
 * WizardArticulo — Modal reutilizable de creación rápida de artículo
 * Uso: const articulo = await WizardArticulo.open();
 * Retorna: { id, nombre, tipo, marca, valor_venta } o null si cancela
 */
const WizardArticulo = {
    open() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'wizard-modal active';
            modal.innerHTML = `
                <div class="wizard-modal-overlay"></div>
                <div class="wizard-modal-content">
                    <div class="wizard-modal-header">
                        <h3><i class="fas fa-box"></i> Crear Artículo Rápido</h3>
                        <button class="wizard-modal-close">&times;</button>
                    </div>
                    <div class="wizard-modal-body">
                        <div class="wform-group">
                            <label>Nombre <span class="req">*</span></label>
                            <input type="text" id="wizArtNombre" placeholder="Nombre del artículo" autocomplete="off">
                        </div>
                        <div class="wform-row">
                            <div class="wform-group">
                                <label>Tipo</label>
                                <input type="text" id="wizArtTipo" placeholder="Filtro, Aceite, Repuesto..." autocomplete="off">
                            </div>
                            <div class="wform-group">
                                <label>Marca</label>
                                <input type="text" id="wizArtMarca" placeholder="Marca" autocomplete="off">
                            </div>
                        </div>
                        <div class="wform-row">
                            <div class="wform-group">
                                <label>Valor Venta</label>
                                <input type="number" id="wizArtValor" min="0" step="100" placeholder="0">
                            </div>
                            <div class="wform-group">
                                <label>Stock</label>
                                <input type="number" id="wizArtStock" min="0" value="0">
                            </div>
                        </div>
                        <div class="wform-group">
                            <label>Detalles</label>
                            <textarea id="wizArtDetalles" rows="3" placeholder="Detalles del artículo..."></textarea>
                        </div>
                    </div>
                    <div class="wizard-modal-footer">
                        <button class="btn btn-outline" id="wizArtCancel">Cancelar</button>
                        <button class="btn btn-primary" id="wizArtSubmit"><i class="fas fa-save"></i> Crear</button>
                    </div>
                </div>`;

            const close = () => { modal.remove(); resolve(null); };
            modal.querySelector('.wizard-modal-overlay').addEventListener('click', close);
            modal.querySelector('.wizard-modal-close').addEventListener('click', close);
            modal.querySelector('#wizArtCancel').addEventListener('click', close);

            modal.querySelector('#wizArtSubmit').addEventListener('click', async () => {
                const nombre = modal.querySelector('#wizArtNombre').value.trim();
                const tipo = modal.querySelector('#wizArtTipo').value.trim();
                const marca = modal.querySelector('#wizArtMarca').value.trim();
                const valor = modal.querySelector('#wizArtValor').value;
                const stock = modal.querySelector('#wizArtStock').value;
                const detalles = modal.querySelector('#wizArtDetalles').value.trim();

                if (!nombre) {
                    showError('El nombre es requerido');
                    return;
                }

                const btn = modal.querySelector('#wizArtSubmit');
                setButtonLoading(btn, true, 'Creando...');

                const fd = new FormData();
                fd.append('action', 'create_inline_articulo');
                fd.append('nombre', nombre);
                if (tipo) fd.append('tipo', tipo);
                if (marca) fd.append('marca', marca);
                if (valor) fd.append('valor_venta', valor);
                fd.append('stock', stock || 0);
                if (detalles) fd.append('detalles', detalles);

                try {
                    const res = await fetch(API_ROOT + 'presupuestos_api.php', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showSuccess('Artículo creado');
                        modal.remove();
                        resolve(data.data);
                    } else {
                        showError(data.message);
                        setButtonLoading(btn, false);
                    }
                } catch (e) {
                    showError('Error al crear artículo');
                    setButtonLoading(btn, false);
                }
            });

            document.body.appendChild(modal);
            modal.querySelector('#wizArtNombre').focus();
        });
    }
};
