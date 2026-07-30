/**
 * WizardServicio — Modal reutilizable de creación rápida de servicio
 * Uso: const servicio = await WizardServicio.open();
 * Retorna: { id, nombre, tipo, valor_trabajo } o null si cancela
 */
const WizardServicio = {
    open() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'wizard-modal active';
            modal.innerHTML = `
                <div class="wizard-modal-overlay"></div>
                <div class="wizard-modal-content">
                    <div class="wizard-modal-header">
                        <h3><i class="fas fa-cogs"></i> Crear Servicio Rápido</h3>
                        <button class="wizard-modal-close">&times;</button>
                    </div>
                    <div class="wizard-modal-body">
                        <div class="wform-group">
                            <label>Nombre <span class="req">*</span></label>
                            <input type="text" id="wizSrvNombre" placeholder="Nombre del servicio" autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Tipo</label>
                            <input type="text" id="wizSrvTipo" placeholder="Mecánica, Eléctrica, Carrocería..." autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Descripción</label>
                            <textarea id="wizSrvDesc" rows="3" placeholder="Descripción del servicio..."></textarea>
                        </div>
                        <div class="wform-row">
                            <div class="wform-group">
                                <label>Valor <span class="req">*</span></label>
                                <input type="number" id="wizSrvValor" min="0" step="100" placeholder="0">
                            </div>
                            <div class="wform-group">
                                <label>Tiempo estimado</label>
                                <input type="text" id="wizSrvTiempo" placeholder="2 horas, 1 día...">
                            </div>
                        </div>
                    </div>
                    <div class="wizard-modal-footer">
                        <button class="btn btn-outline" id="wizSrvCancel">Cancelar</button>
                        <button class="btn btn-primary" id="wizSrvSubmit"><i class="fas fa-save"></i> Crear</button>
                    </div>
                </div>`;

            const close = () => { modal.remove(); resolve(null); };
            modal.querySelector('.wizard-modal-overlay').addEventListener('click', close);
            modal.querySelector('.wizard-modal-close').addEventListener('click', close);
            modal.querySelector('#wizSrvCancel').addEventListener('click', close);

            modal.querySelector('#wizSrvSubmit').addEventListener('click', async () => {
                const nombre = modal.querySelector('#wizSrvNombre').value.trim();
                const tipo = modal.querySelector('#wizSrvTipo').value.trim();
                const descripcion = modal.querySelector('#wizSrvDesc').value.trim();
                const valor = modal.querySelector('#wizSrvValor').value;
                const tiempo = modal.querySelector('#wizSrvTiempo').value.trim();

                if (!nombre || !valor) {
                    showError('Nombre y valor son requeridos');
                    return;
                }

                const btn = modal.querySelector('#wizSrvSubmit');
                setButtonLoading(btn, true, 'Creando...');

                const fd = new FormData();
                fd.append('action', 'create_inline_servicio');
                fd.append('nombre', nombre);
                if (tipo) fd.append('tipo', tipo);
                if (descripcion) fd.append('descripcion', descripcion);
                fd.append('valor_trabajo', valor);
                if (tiempo) fd.append('tiempo_implementar', tiempo);

                try {
                    const res = await fetch(API_ROOT + 'presupuestos_api.php', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showSuccess('Servicio creado');
                        modal.remove();
                        resolve(data.data);
                    } else {
                        showError(data.message);
                        setButtonLoading(btn, false);
                    }
                } catch (e) {
                    showError('Error al crear servicio');
                    setButtonLoading(btn, false);
                }
            });

            document.body.appendChild(modal);
            modal.querySelector('#wizSrvNombre').focus();
        });
    }
};
