/**
 * WizardCliente — Modal reutilizable de creación rápida de cliente
 * Uso: const cliente = await WizardCliente.open();
 * Retorna: { id, nombre, apellido, rut, telefono } o null si cancela
 */
const WizardCliente = {
    open() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'wizard-modal active';
            modal.innerHTML = `
                <div class="wizard-modal-overlay"></div>
                <div class="wizard-modal-content">
                    <div class="wizard-modal-header">
                        <h3><i class="fas fa-user-plus"></i> Crear Cliente Rápido</h3>
                        <button class="wizard-modal-close">&times;</button>
                    </div>
                    <div class="wizard-modal-body">
                        <div class="wform-group">
                            <label>Nombre <span class="req">*</span></label>
                            <input type="text" id="wizCliNombre" placeholder="Nombre" autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Apellido <span class="req">*</span></label>
                            <input type="text" id="wizCliApellido" placeholder="Apellido" autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Teléfono <span class="req">*</span></label>
                            <input type="tel" id="wizCliTelefono" placeholder="+569..." autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>RUT</label>
                            <input type="text" id="wizCliRut" placeholder="12.345.678-9" maxlength="12" autocomplete="off">
                        </div>
                        <div class="wform-group">
                            <label>Email</label>
                            <input type="email" id="wizCliEmail" placeholder="correo@ejemplo.cl" autocomplete="off">
                        </div>
                    </div>
                    <div class="wizard-modal-footer">
                        <button class="btn btn-outline" id="wizCliCancel">Cancelar</button>
                        <button class="btn btn-primary" id="wizCliSubmit"><i class="fas fa-save"></i> Crear</button>
                    </div>
                </div>`;

            const close = () => { modal.remove(); resolve(null); };
            modal.querySelector('.wizard-modal-overlay').addEventListener('click', close);
            modal.querySelector('.wizard-modal-close').addEventListener('click', close);
            modal.querySelector('#wizCliCancel').addEventListener('click', close);

            modal.querySelector('#wizCliSubmit').addEventListener('click', async () => {
                const nombre = modal.querySelector('#wizCliNombre').value.trim();
                const apellido = modal.querySelector('#wizCliApellido').value.trim();
                const telefono = modal.querySelector('#wizCliTelefono').value.trim();
                const rut = modal.querySelector('#wizCliRut').value.trim();
                const email = modal.querySelector('#wizCliEmail').value.trim();

                if (!nombre || !apellido || !telefono) {
                    showError('Nombre, apellido y teléfono son requeridos');
                    return;
                }

                const btn = modal.querySelector('#wizCliSubmit');
                setButtonLoading(btn, true, 'Creando...');

                const fd = new FormData();
                fd.append('nombre', nombre);
                fd.append('apellido', apellido);
                fd.append('telefono', telefono);
                if (rut) fd.append('rut', rut);
                if (email) fd.append('correo', email);

                try {
                    const res = await fetch(API_ROOT + 'clientes_api.php', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (data.status === 'success') {
                        showSuccess('Cliente creado');
                        modal.remove();
                        resolve(data.data);
                    } else {
                        showError(data.message);
                        setButtonLoading(btn, false);
                    }
                } catch (e) {
                    showError('Error al crear cliente');
                    setButtonLoading(btn, false);
                }
            });

            document.body.appendChild(modal);
            modal.querySelector('#wizCliNombre').focus();
        });
    }
};
