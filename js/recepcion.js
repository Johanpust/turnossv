// =============================================================
// recepcion.js — Lógica de la vista del recepcionista
// ACTUALIZADO: usa async/await con Supabase.
// =============================================================

const session = requireRole('recepcion');

// -----------------------------------------------------------------
// Referencias a elementos del DOM
// -----------------------------------------------------------------
const docInput          = document.getElementById('doc-id');
const btnNormal         = document.getElementById('btn-normal');
const btnPriority       = document.getElementById('btn-priority');
const formError         = document.getElementById('form-error');
const nextTicketEl      = document.getElementById('next-ticket-preview');
const queueTypeCounts   = document.getElementById('queue-type-counts');
const queuePreviewList  = document.getElementById('queue-preview-list');
const modulesStatusList = document.getElementById('modules-status-list');
const confirmationBox   = document.getElementById('ticket-confirmation');
const confirmTicketEl   = document.getElementById('confirmation-ticket');
const confirmDetailEl   = document.getElementById('confirmation-detail');

let selectedType = null;
let confirmationTimer = null;

const TYPE_STYLES = {
    E: { color: '#3B82F6', bg: '#EFF6FF', emoji: '📦', label: 'Entrega de órdenes' },
    A: { color: '#10B981', bg: '#ECFDF5', emoji: '📅', label: 'Activación de citas' },
    V: { color: '#8B5CF6', bg: '#F5F3FF', emoji: '🧪', label: 'Varios' },
    B: { color: '#F59E0B', bg: '#FFFBEB', emoji: '🔬', label: 'Entrega de biopsias' }
};

// -----------------------------------------------------------------
// Selección de tipo de turno
// -----------------------------------------------------------------
document.querySelectorAll('.ticket-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        selectedType = (selectedType === type) ? null : type;
        updateTypeButtons();
        updateButtonState();
        refreshNextTicketPreview();
        clearFormError();
    });
});

function updateTypeButtons() {
    document.querySelectorAll('.ticket-type-btn').forEach(btn => {
        const type = btn.dataset.type;
        const style = TYPE_STYLES[type];
        if (type === selectedType) {
            btn.classList.add('selected');
            btn.style.borderColor = style.color;
            btn.style.backgroundColor = style.bg;
            btn.style.color = style.color;
        } else {
            btn.classList.remove('selected');
            btn.style.borderColor = '';
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }
    });
}

function validateForm() {
    if (!selectedType) {
        showFormError('⚠️ Debes seleccionar el tipo de turno antes de continuar.');
        return false;
    }
    const val = docInput.value.trim();
    if (!val) {
        showFormError('Por favor ingresa el documento de identidad del paciente.');
        return false;
    }
    if (val.length < 4) {
        showFormError('El documento debe tener al menos 4 caracteres.');
        return false;
    }
    clearFormError();
    return true;
}

function showFormError(msg) {
    formError.textContent = msg;
    formError.style.display = 'block';
}
function clearFormError() {
    formError.style.display = 'none';
}

function updateButtonState() {
    const hasDoc  = docInput.value.trim().length >= 4;
    const hasType = selectedType !== null;
    btnNormal.disabled   = !(hasDoc && hasType);
    btnPriority.disabled = !(hasDoc && hasType);
}

// -----------------------------------------------------------------
// refreshNextTicketPreview: usa el estado más reciente de Supabase.
// -----------------------------------------------------------------
async function refreshNextTicketPreview() {
    const state = await getState();
    const preview = getNextTicketPreview(state, selectedType);
    nextTicketEl.textContent = preview;

    if (selectedType && TYPE_STYLES[selectedType]) {
        nextTicketEl.style.color = TYPE_STYLES[selectedType].color;
    } else {
        nextTicketEl.style.color = '';
    }
}

function showConfirmation(ticket, type, priority) {
    const typeStyle  = TYPE_STYLES[type] || {};
    const prioLabel  = priority === 'high' ? '🔴 Alta Prioridad' : '🔵 Normal';
    const typeLabel  = `${typeStyle.emoji || ''} ${typeStyle.label || type}`;

    confirmTicketEl.textContent = `Turno ${ticket}`;
    confirmDetailEl.textContent = `${typeLabel} — ${prioLabel}`;
    confirmationBox.classList.add('visible');

    clearTimeout(confirmationTimer);
    confirmationTimer = setTimeout(() => {
        confirmationBox.classList.remove('visible');
    }, 4500);
}

// -----------------------------------------------------------------
// generateTicket: Genera un nuevo turno y lo guarda en Supabase.
// -----------------------------------------------------------------
async function generateTicket(priority) {
    if (!validateForm()) return;

    // Deshabilitar botones mientras se procesa
    btnNormal.disabled   = true;
    btnPriority.disabled = true;

    const docId = docInput.value.trim();
    const type  = selectedType;
    const state = await getState();

    const ticket = addTicket(state, docId, priority, type);
    autoAssignToFreeModules(state);
    await setState(state);

    showConfirmation(ticket.ticket, type, priority);
    docInput.value = '';
    docInput.focus();
    updateButtonState();
    await refreshUI();
}

// -----------------------------------------------------------------
// renderQueueTypeCounts
// -----------------------------------------------------------------
function renderQueueTypeCounts(state) {
    const counts = getQueueCountByType(state);
    const total  = getTotalInQueue(state);
    const high   = state.highQueue.length;

    queueTypeCounts.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom:0.5rem;">
            ${Object.entries(TYPE_STYLES).map(([type, style]) => `
                <div style="display:flex; align-items:center; gap:0.4rem; padding: 0.4rem 0.6rem;
                            background:${style.bg}; border-radius:8px; border:1px solid ${style.color}30;">
                    <span style="font-size:1rem;">${style.emoji}</span>
                    <span style="font-size:1.1rem; font-weight:700; color:${style.color};">${String(counts[type] || 0).padStart(2,'0')}</span>
                    <span style="font-size:0.65rem; color:${style.color}; font-weight:600;">${type}</span>
                </div>
            `).join('')}
        </div>
        <div style="display:flex; gap:0.5rem; font-size:0.8rem; color:var(--gray-500); margin-top:0.25rem;">
            <span>Total en espera: <strong>${total}</strong></span>
            <span>·</span>
            <span>🔴 Prioridad Alta: <strong>${high}</strong></span>
        </div>
    `;
}

// -----------------------------------------------------------------
// renderQueuePreview
// -----------------------------------------------------------------
function renderQueuePreview(state) {
    const combined = [
        ...state.highQueue.map(t => ({ ...t, isHigh: true })),
        ...state.queue.map(t => ({ ...t, isHigh: false }))
    ].slice(0, 5);

    if (combined.length === 0) {
        queuePreviewList.innerHTML = '<div class="queue-empty">No hay turnos en espera</div>';
        return;
    }

    queuePreviewList.innerHTML = combined.map(t => {
        const style  = TYPE_STYLES[t.type] || {};
        return `
        <div class="queue-item ${t.isHigh ? 'high-priority' : ''}">
            <span class="queue-item-ticket" style="color:${style.color || ''};">${t.ticket}</span>
            <span class="queue-item-doc">Doc: ${t.docId}</span>
            <span style="font-size:0.65rem; background:${style.bg || '#f5f5f5'};
                         color:${style.color || '#555'}; padding:1px 6px; border-radius:4px;
                         border:1px solid ${style.color || '#ccc'}40;">
                ${style.emoji || ''} ${t.type}
            </span>
            ${t.isHigh ? '<span class="badge badge-high" style="font-size:0.6rem">🔴</span>' : ''}
        </div>
    `}).join('');
}

// -----------------------------------------------------------------
// renderModulesStatus
// -----------------------------------------------------------------
function renderModulesStatus(state) {
    modulesStatusList.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        const mod = state.modules[i];
        if (!mod) continue;

        let statusText, statusClass;

        if (!mod.active) {
            statusText  = 'Desactivado';
            statusClass = 'badge-inactive';
        } else if (mod.paused) {
            statusText  = 'Pausado';
            statusClass = 'badge-paused';
        } else if (mod.currentTicket) {
            const tStyle = TYPE_STYLES[mod.currentTicketType] || {};
            if (mod.calledAt) {
                statusText  = `Llamando: ${mod.currentTicket}`;
                statusClass = 'badge-active';
            } else if (mod.isAttending) {
                statusText  = `${tStyle.emoji || ''} ${mod.currentTicket}`;
                statusClass = 'badge-success';
            } else {
                statusText  = `Turno: ${mod.currentTicket}`;
                statusClass = 'badge-active';
            }
        } else {
            statusText  = 'Libre';
            statusClass = 'badge-normal';
        }

        const allowedStr = (mod.allowedTypes || ['E','A','V','B']).join(', ');

        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-bottom:1px solid var(--gray-100);';
        item.innerHTML = `
            <div>
                <span style="font-size:0.875rem; font-weight:600; color:var(--gray-700)">${i === 7 ? 'Autogestión' : 'Módulo ' + i}</span>
                <span style="font-size:0.65rem; color:var(--gray-400); margin-left:0.4rem;">[${allowedStr}]</span>
            </div>
            <span class="badge ${statusClass}" style="font-size:0.65rem;">${statusText}</span>
        `;
        modulesStatusList.appendChild(item);
    }
}

// -----------------------------------------------------------------
// renderFromState: Renderiza toda la UI desde un estado ya cargado.
// Usado por onStateChange para evitar un re-fetch innecesario.
// -----------------------------------------------------------------
function renderFromState(state) {
    // Actualizar preview del próximo turno con el estado recibido
    const preview = getNextTicketPreview(state, selectedType);
    nextTicketEl.textContent = preview;
    if (selectedType && TYPE_STYLES[selectedType]) {
        nextTicketEl.style.color = TYPE_STYLES[selectedType].color;
    } else {
        nextTicketEl.style.color = '';
    }
    renderQueueTypeCounts(state);
    renderQueuePreview(state);
    renderModulesStatus(state);
}

// -----------------------------------------------------------------
// refreshUI: Carga el estado desde Supabase y actualiza la pantalla.
// -----------------------------------------------------------------
async function refreshUI() {
    const state = await getState();
    renderFromState(state);
}

// -----------------------------------------------------------------
// Listeners
// -----------------------------------------------------------------
btnNormal.addEventListener('click',   () => generateTicket('normal'));
btnPriority.addEventListener('click', () => generateTicket('high'));

docInput.addEventListener('input', () => {
    clearFormError();
    updateButtonState();
    refreshNextTicketPreview();
});

docInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!btnNormal.disabled) generateTicket('normal');
    }
});

// -----------------------------------------------------------------
// Sincronización en tiempo real — usa newState directo del WebSocket
// sin hacer otro roundtrip a la base de datos.
// -----------------------------------------------------------------
onStateChange((newState) => { renderFromState(newState); });

// -----------------------------------------------------------------
// Inicialización
// -----------------------------------------------------------------
refreshUI();
docInput.focus();
