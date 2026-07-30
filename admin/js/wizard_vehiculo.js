/**
 * WizardVehiculo — Modal reutilizable de creación rápida de vehículo
 * Uso: const vehiculo = await WizardVehiculo.open(clienteId);
 * Retorna: { id, patente, marca, modelo } o null si cancela
 */
const WizardVehiculo = {
    open(clienteId) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'wizard-modal active';
            modal.innerHTML = `
                <div class="wizard-modal-overlay"></div>
                <div class="wizard-modal-content">
                    <div class="wizard-modal-header">
                        <h3><i class="fas fa-car"></i> Crear Vehículo Rápido</h3>
                        <button class="wizard-modal-close">&times;</button>
                    </div>
                    <div class="wizard-modal-body">
                        <div class="wform-group">
                            <label>Patente <span class="req">*</span></label>
                            <input type="text" id="wizVehPatente" placeholder="ABCD12" maxlength="10" style="text-transform:uppercase" autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Marca <span class="req">*</span></label>
                            <div class="select-wrapper">
                                <select id="wizVehMarca"><option value="">— Seleccionar —</option></select>
                            </div>
                        </div>
                        <div class="wform-group">
                            <label>Modelo <span class="req">*</span></label>
                            <input type="text" id="wizVehModelo" placeholder="Modelo" autocomplete="off">
                        </div>
                        <div class="wform-row">
                            <div class="wform-group">
                                <label>Año</label>
                                <input type="number" id="wizVehAnio" min="1990" max="2030" placeholder="2024">
                            </div>
                            <div class="wform-group">
                                <label>Color</label>
                                <input type="text" id="wizVehColor" placeholder="Blanco">
                            </div>
                        </div>
                        <div class="wform-group">
                            <label>VIN</label>
                            <input type="text" id="wizVehVin" placeholder="Número de chasis" autocomplete="off">
                        </div>
                    </div>
                    <div class="wizard-modal-footer">
                        <button class="btn btn-outline" id="wizVehCancel">Cancelar</button>
                        <button class="btn btn-primary" id="wizVehSubmit"><i class="fas fa-save"></i> Crear</button>
                    </div>
                </div>`;

            const close = () => { modal.remove(); resolve(null); };
            modal.querySelector('.wizard-modal-overlay').addEventListener('click', close);
            modal.querySelector('.wizard-modal-close').addEventListener('click', close);
            modal.querySelector('#wizVehCancel').addEventListener('click', close);

            // Load marcas dynamically
            loadDynamicOptions('wizVehMarca', 'marca_vehiculo');

            modal.querySelector('#wizVehSubmit').addEventListener('click', async () => {
                const patente = modal.querySelector('#wizVehPatente').value.trim();
                const marca = modal.querySelector('#wizVehMarca').value;
                const modelo = modal.querySelector('#wizVehModelo').value.trim();
                const anio = modal.querySelector('#wizVehAnio').value;
                const color = modal.querySelector('#wizVehColor').value.trim();
                const vin = modal.querySelector('#wizVehVin').value.trim();

                if (!patente || !marca || !modelo) {
                    showError('Patente, marca y modelo son requeridos');
                    return;
                }

                const btn = modal.querySelector('#wizVehSubmit');
                setButtonLoading(btn, true, 'Creando...');

                const fd = new FormData();
                fd.append('cliente_id', clienteId);
                fd.append('patente', patente);
                fd.append('marca', marca);
                fd.append('modelo', modelo);
                if (anio) fd.append('anio', anio);
                if (color) fd.append('color', color);
                if (vin) fd.append('vin', vin);

                try {
                    const res = await fetch(API_ROOT + 'vehiculos_api.php', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showSuccess('Vehículo creado');
                        modal.remove();
                        resolve(data.data);
                    } else {
                        showError(data.message);
                        setButtonLoading(btn, false);
                    }
                } catch (e) {
                    showError('Error al crear vehículo');
                    setButtonLoading(btn, false);
                }
            });

            document.body.appendChild(modal);
            modal.querySelector('#wizVehPatente').focus();
        });
    }
};
