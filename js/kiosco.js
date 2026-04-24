// =============================================================
// kiosco.js — Lógica para la vista del kiosco móvil
// =============================================================

const docInput = document.getElementById('doc-id');
const btnGenerate = document.getElementById('btn-generate');
const errorMsg = document.getElementById('error-msg');
const formView = document.getElementById('form-view');
const successView = document.getElementById('success-view');
const finalTicketEl = document.getElementById('final-ticket');
const waitTimeEl = document.getElementById('wait-time');
const countdownEl = document.getElementById('countdown');

// Validar input
docInput.addEventListener('input', () => {
    errorMsg.style.display = 'none';
    const val = docInput.value.trim();
    if (val.length >= 4 && /^\d+$/.test(val)) {
        btnGenerate.disabled = false;
    } else {
        btnGenerate.disabled = true;
    }
});

btnGenerate.addEventListener('click', async () => {
    const docId = docInput.value.trim();
    
    if (docId.length < 4 || !/^\d+$/.test(docId)) {
        errorMsg.textContent = 'Ingresa un número de documento válido (mínimo 4 dígitos).';
        errorMsg.style.display = 'block';
        return;
    }

    btnGenerate.disabled = true;
    btnGenerate.innerHTML = 'Procesando...';

    try {
        const state = await getState();
        
        // Agregar turno tipo E (Entrega de órdenes)
        const ticket = addTicket(state, docId, 'normal', 'E');
        
        // Intentar auto-asignar si hay módulos libres
        autoAssignToFreeModules(state);
        
        // Calcular tiempo de espera
        const waitMinutes = calculateEstimatedWaitTime(state);
        
        await setState(state);

        // Mostrar éxito
        finalTicketEl.textContent = ticket.ticket;
        waitTimeEl.textContent = `Espera: ~${waitMinutes} min`;
        
        formView.style.display = 'none';
        successView.style.display = 'block';

        // Cuenta regresiva
        let secs = 10;
        const interval = setInterval(() => {
            secs--;
            countdownEl.textContent = secs;
            if (secs <= 0) {
                clearInterval(interval);
                window.location.reload();
            }
        }, 1000);

    } catch (error) {
        console.error("Error al generar turno:", error);
        errorMsg.textContent = 'Hubo un error de conexión. Intenta de nuevo.';
        errorMsg.style.display = 'block';
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>📦</span> Obtener Ficha';
    }
});
