/**
 * PDF Generator Module - Figuetronic
 * Genera documentos PDF via backend PHP → HTML premium → Print-to-PDF
 * Soporta: Presupuestos, Ordenes de Trabajo, Ventas, Recepcion Unificada
 */

const COMPANY_DATA = {
    name: 'FIGUETRONIC SPA',
    rut: '78419845-6',
    address: 'Baldomero Lillo 364',
    phone: '+56.995183457',
    city: 'Santiago',
    commune: 'Padre Hurtado',
    business: 'SERVICIO DE ELECTRONICA AUTOMOTRIZ',
    logo: 'assets/logo.jpeg',
    email: 'info@figuetronic.cl'
};

/**
 * Genera un documento PDF profesional via backend PHP
 * Abre el documento en nueva ventana con diseño premium listo para imprimir/guardar PDF
 * @param {string} documentType - Tipo de documento
 * @param {object} documentData - Datos del documento (debe incluir .id)
 * @param {string} fileName - Nombre del archivo (usado como título de ventana)
 */
async function generatePDF(documentType, documentData, fileName = 'documento.pdf') {
    try {
        const id = documentData.id;
        if (!id) {
            showError('No se puede generar PDF: falta el ID del documento');
            return;
        }

        const typeMap = {
            'presupuesto': 'presupuesto',
            'orden': 'orden',
            'orden_trabajo': 'orden',
            'venta': 'venta',
            'factura': 'venta',
            'recepcion': 'recepcion_unificada',
            'recepcion_unificada': 'recepcion_unificada'
        };

        const apiType = typeMap[documentType.toLowerCase()];
        if (!apiType) {
            showError('Tipo de documento no soportado: ' + documentType);
            return;
        }

        const url = `${API_ROOT}pdf_api.php?type=${encodeURIComponent(apiType)}&id=${id}`;

        showInfo('Generando documento...');

        const res = await fetch(url);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Error del servidor (' + res.status + ')');
        }

        const html = await res.text();

        // Open in new window for print-to-PDF
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showError('El navegador bloqueó la ventana emergente. Permita popups para este sitio.');
            return;
        }

        printWindow.document.write(html);
        printWindow.document.close();

        showSuccess('Documento generado — use "Guardar como PDF" en el diálogo de impresión');
    } catch (err) {
        console.error('Error al generar PDF:', err);
        showError('Error al generar el PDF: ' + err.message);
    }
}

/**
 * Genera PDF de recepcion unificada via backend PHP
 * @param {number} id - ID de la recepcion unificada
 */
async function generateRecepcionUnificadaPDF(id) {
    try {
        if (!id) {
            showError('ID de recepción requerido');
            return;
        }

        const url = `${API_ROOT}pdf_api.php?type=recepcion_unificada&id=${id}`;

        showInfo('Generando documento de recepción...');

        const res = await fetch(url);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Error del servidor (' + res.status + ')');
        }

        const html = await res.text();

        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            showError('El navegador bloqueó la ventana emergente. Permita popups para este sitio.');
            return;
        }

        printWindow.document.write(html);
        printWindow.document.close();

        showSuccess('Documento generado — use "Guardar como PDF" en el diálogo de impresión');
    } catch (err) {
        console.error('Error al generar PDF de recepción:', err);
        showError('Error al generar el PDF: ' + err.message);
    }
}

// ============================================================================
// UTILIDADES (mantenidas para compatibilidad)
// ============================================================================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

function formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-CL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
