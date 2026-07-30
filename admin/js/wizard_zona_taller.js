/**
 * WizardZonaTaller — Modal reutilizable de creación rápida de zona
 * Uso: const zona = await WizardZonaTaller.open();
 * Retorna: { id, nombre } o null si cancela
 */
const WizardZonaTaller = {
    open() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'wizard-modal active';
            modal.innerHTML = `
                <div class="wizard-modal-overlay"></div>
                <div class="wizard-modal-content">
                    <div class="wizard-modal-header">
                        <h3><i class="fas fa-map-marker-alt"></i> Crear Zona Rápida</h3>
                        <button class="wizard-modal-close">&times;</button>
                    </div>
                    <div class="wizard-modal-body">
                        <div class="wform-group">
                            <label>Nombre <span class="req">*</span></label>
                            <input type="text" id="wizZonaNombre" placeholder="Ej: Área de soldadura, Almacén..." autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Descripción</label>
                            <textarea id="wizZonaDesc" rows="3" placeholder="Describe brevemente esta zona..."></textarea>
                        </div>
                    </div>
                    <div class="wizard-modal-footer">
                        <button class="btn btn-outline" id="wizZonaCancel">Cancelar</button>
                        <button class="btn btn-primary" id="wizZonaSubmit"><i class="fas fa-save"></i> Crear</button>
                    </div>
                </div>`;

            const close = () => { modal.remove(); resolve(null); };
            modal.querySelector('.wizard-modal-overlay').addEventListener('click', close);
            modal.querySelector('.wizard-modal-close').addEventListener('click', close);
            modal.querySelector('#wizZonaCancel').addEventListener('click', close);

            modal.querySelector('#wizZonaSubmit').addEventListener('click', async () => {
                const nombre = modal.querySelector('#wizZonaNombre').value.trim();
                const descripcion = modal.querySelector('#wizZonaDesc').value.trim();

                if (!nombre) {
                    showError('El nombre es requerido');
                    return;
                }

                const btn = modal.querySelector('#wizZonaSubmit');
                setButtonLoading(btn, true, 'Creando...');

                const fd = new FormData();
                fd.append('nombre', nombre);
                if (descripcion) fd.append('descripcion', descripcion);

                try {
                    const res = await fetch(API_ROOT + 'zonas_taller_api.php', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showSuccess('Zona creada');
                        modal.remove();
                        resolve(data.data);
                    } else {
                        showError(data.message);
                        setButtonLoading(btn, false);
                    }
                } catch (e) {
                    showError('Error al crear zona');
                    setButtonLoading(btn, false);
                }
            });

            document.body.appendChild(modal);
            modal.querySelector('#wizZonaNombre').focus();
        });
    }
};
