// =============================================================
// admin.js — Lógica del panel del administrador
// Gestiona módulos (activar/desactivar, tipos permitidos)
// y reinicio de turnos. Soporta 6 módulos.
// ACTUALIZADO: usa async/await con Supabase en lugar de localStorage.
// =============================================================

const session = requireRole('admin');

// -----------------------------------------------------------------
// Colores/etiquetas por tipo
// -----------------------------------------------------------------
const TYPE_STYLES = {
    E: { color: '#3B82F6', bg: '#EFF6FF', emoji: '📦', label: 'Entrega de órdenes' },
    A: { color: '#10B981', bg: '#ECFDF5', emoji: '📅', label: 'Activación de citas' },
    V: { color: '#8B5CF6', bg: '#F5F3FF', emoji: '🧪', label: 'Varios' },
    B: { color: '#F59E0B', bg: '#FFFBEB', emoji: '🔬', label: 'Biopsias' }
};

// -----------------------------------------------------------------
// Referencias a elementos del DOM
// -----------------------------------------------------------------
const modulesGrid          = document.getElementById('modules-grid');
const statTotalQueue       = document.getElementById('stat-total-queue');
const statHighQueue        = document.getElementById('stat-high-queue');
const statActiveModules    = document.getElementById('stat-active-modules');
const statQueueTypes       = document.getElementById('stat-queue-types');
const btnReset             = document.getElementById('btn-reset');
const btnActivateAll       = document.getElementById('btn-activate-all');
const btnDeactivateAll     = document.getElementById('btn-deactivate-all');
const modalReset           = document.getElementById('modal-reset');
const btnCancelReset       = document.getElementById('btn-cancel-reset');
const btnConfirmReset      = document.getElementById('btn-confirm-reset');
const radioNotificationModes = document.getElementsByName('notification-mode');

// -----------------------------------------------------------------
// renderModulesGrid: Genera las 6 tarjetas de módulo.
// -----------------------------------------------------------------
function renderModulesGrid(state) {
    modulesGrid.innerHTML = '';

    for (let i = 1; i <= 6; i++) {
        const mod = state.modules[i];
        if (!mod) continue;

        const allowedTypes = mod.allowedTypes || ['E', 'A', 'V', 'B'];

        let cardClass = 'is-inactive';
        let badgeHtml = '<span class="badge badge-inactive"><span class="dot dot-inactive"></span> Desactivado</span>';

        if (mod.active && mod.paused) {
            cardClass = 'is-paused';
            badgeHtml = '<span class="badge badge-paused"><span class="dot dot-paused"></span> Pausado</span>';
        } else if (mod.active) {
            cardClass = 'is-active';
            badgeHtml = '<span class="badge badge-active"><span class="dot dot-active"></span> Activo</span>';
        }

        const ticketHtml = mod.currentTicket
            ? `<div class="module-ticket-display">${mod.currentTicket}</div>
               <div class="module-doc-id">Doc: ${mod.currentDocId || '—'}</div>`
            : `<div class="module-ticket-empty">Sin turno</div>
               <div class="module-doc-id" style="min-height:20px;"></div>`;

        const typeCheckboxes = ['E', 'A', 'V', 'B'].map(type => {
            const style   = TYPE_STYLES[type];
            const checked = allowedTypes.includes(type) ? 'checked' : '';
            return `
                <label class="type-checkbox-label" title="${style.label}"
                       style="border-color:${checked ? style.color : 'transparent'};
                              background:${checked ? style.bg : '#f9f9f9'};
                              color:${checked ? style.color : '#999'};">
                    <input type="checkbox" style="display:none;"
                           ${checked}
                           onchange="toggleModuleType(${i}, '${type}', this.checked)" />
                    <span style="font-size:0.85rem;">${style.emoji}</span>
                    <span style="font-weight:700; font-size:0.9rem;">${type}</span>
                </label>
            `;
        }).join('');

        const card = document.createElement('div');
        card.className = `module-card ${cardClass}`;
        card.style.animationDelay = `${(i - 1) * 0.08}s`;
        card.innerHTML = `
            <div class="module-card-header">
                <span class="module-number">Módulo ${i}</span>
                ${badgeHtml}
            </div>
            <div class="module-card-body">
                ${ticketHtml}
                <div style="margin: 0.75rem 0 0.5rem;">
                    <div style="font-size:0.7rem; font-weight:600; color:var(--gray-500); text-transform:uppercase;
                                letter-spacing:0.05em; margin-bottom:0.35rem;">Tipos que atiende</div>
                    <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
                        ${typeCheckboxes}
                    </div>
                </div>
                <div class="toggle-wrapper">
                    <span class="toggle-label">${mod.active ? 'Módulo activo' : 'Módulo desactivado'}</span>
                    <label class="toggle-switch" title="${mod.active ? 'Desactivar módulo' : 'Activar módulo'}">
                        <input
                            type="checkbox"
                            id="toggle-mod-${i}"
                            ${mod.active ? 'checked' : ''}
                            onchange="toggleModule(${i}, this.checked)"
                        />
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;

        modulesGrid.appendChild(card);
    }
}

// -----------------------------------------------------------------
// updateStats: Actualiza los contadores de estadísticas rápidas.
// -----------------------------------------------------------------
function updateStats(state) {
    statTotalQueue.textContent = getTotalInQueue(state);
    statHighQueue.textContent  = state.highQueue.length;

    let activeCount = 0;
    for (let i = 1; i <= 6; i++) {
        if (state.modules[i] && state.modules[i].active) activeCount++;
    }
    statActiveModules.textContent = `${activeCount}/6`;

    const counts = getQueueCountByType(state);
    const typeSummary = Object.entries(counts)
        .filter(([,n]) => n > 0)
        .map(([t, n]) => `${t}:${n}`)
        .join(' · ');
    statQueueTypes.textContent = typeSummary || '—';
}

// -----------------------------------------------------------------
// refreshUI: Re-renderiza toda la interfaz del admin.
// -----------------------------------------------------------------
async function refreshUI() {
    const state = await getState();
    renderModulesGrid(state);
    updateStats(state);

    if (radioNotificationModes.length > 0 && state.settings) {
        radioNotificationModes.forEach(radio => {
            radio.checked = (radio.value === state.settings.notificationMode);
        });
    }
}

// -----------------------------------------------------------------
// toggleModule: Activa o desactiva un módulo.
// -----------------------------------------------------------------
async function toggleModule(moduleId, activate) {
    const state = await getState();
    const mod   = state.modules[moduleId];

    if (!activate) {
        mod.active = false;
        mod.paused = false;

        if (mod.currentTicket) {
            state.queue.unshift({
                ticket:    mod.currentTicket,
                type:      mod.currentTicketType || 'E',
                docId:     mod.currentDocId,
                priority:  'normal',
                timestamp: Date.now()
            });
            mod.currentTicket     = null;
            mod.currentTicketType = null;
            mod.currentDocId      = null;
            mod.calledAt          = null;
        }
    } else {
        mod.active = true;
        autoAssignToFreeModules(state);
    }

    await setState(state);
    await refreshUI();
}

// -----------------------------------------------------------------
// toggleModuleType: Habilita o deshabilita un tipo de turno.
// -----------------------------------------------------------------
async function toggleModuleType(moduleId, type, enabled) {
    const state = await getState();
    const mod   = state.modules[moduleId];

    if (!mod.allowedTypes) mod.allowedTypes = ['E', 'A', 'V', 'B'];

    if (enabled) {
        if (!mod.allowedTypes.includes(type)) {
            mod.allowedTypes.push(type);
        }
    } else {
        mod.allowedTypes = mod.allowedTypes.filter(t => t !== type);
        if (mod.allowedTypes.length === 0) {
            mod.allowedTypes = [type];
            await setState(state);
            await refreshUI();
            return;
        }
    }

    await setState(state);
    await refreshUI();
}

// -----------------------------------------------------------------
// Botón: Activar todos los módulos
// -----------------------------------------------------------------
btnActivateAll.addEventListener('click', async () => {
    const state = await getState();
    for (let i = 1; i <= 6; i++) {
        if (state.modules[i]) state.modules[i].active = true;
    }
    autoAssignToFreeModules(state);
    await setState(state);
    await refreshUI();
});

// -----------------------------------------------------------------
// Botón: Desactivar todos los módulos
// -----------------------------------------------------------------
btnDeactivateAll.addEventListener('click', async () => {
    const state = await getState();
    for (let i = 1; i <= 6; i++) {
        const mod = state.modules[i];
        if (!mod) continue;
        if (mod.currentTicket) {
            state.queue.unshift({
                ticket:    mod.currentTicket,
                type:      mod.currentTicketType || 'E',
                docId:     mod.currentDocId,
                priority:  'normal',
                timestamp: Date.now()
            });
        }
        mod.active        = false;
        mod.paused        = false;
        mod.currentTicket = null;
        mod.currentTicketType = null;
        mod.currentDocId  = null;
        mod.calledAt      = null;
    }
    await setState(state);
    await refreshUI();
});

// -----------------------------------------------------------------
// Modal de reinicio
// -----------------------------------------------------------------
btnReset.addEventListener('click', () => {
    modalReset.classList.add('visible');
});

btnCancelReset.addEventListener('click', () => {
    modalReset.classList.remove('visible');
});

modalReset.addEventListener('click', (e) => {
    if (e.target === modalReset) modalReset.classList.remove('visible');
});

btnConfirmReset.addEventListener('click', async () => {
    await resetState();
    modalReset.classList.remove('visible');
    await refreshUI();
});

// -----------------------------------------------------------------
// Cambiar modo de notificación
// -----------------------------------------------------------------
radioNotificationModes.forEach(radio => {
    radio.addEventListener('change', async (e) => {
        if (e.target.checked) {
            const state = await getState();
            if (!state.settings) state.settings = {};
            state.settings.notificationMode = e.target.value;
            await setState(state);
        }
    });
});

// -----------------------------------------------------------------
// Sincronización en tiempo real
// -----------------------------------------------------------------
onStateChange(() => { refreshUI(); });

// -----------------------------------------------------------------
// Inicialización
// -----------------------------------------------------------------
refreshUI();
