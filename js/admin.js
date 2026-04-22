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
// renderFromState: Actualiza la UI desde un objeto estado ya cargado.
// Usado por onStateChange (evita re-fetch) y por refreshUI.
// -----------------------------------------------------------------
function renderFromState(state) {
    renderModulesGrid(state);
    updateStats(state);

    if (radioNotificationModes.length > 0 && state.settings) {
        radioNotificationModes.forEach(radio => {
            radio.checked = (radio.value === state.settings.notificationMode);
        });
    }
}

// -----------------------------------------------------------------
// refreshUI: Carga el estado desde Supabase y re-renderiza.
// -----------------------------------------------------------------
async function refreshUI() {
    const state = await getState();
    renderFromState(state);
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
// Sincronización en tiempo real — usa newState directo del WebSocket
// sin hacer otro roundtrip a la base de datos.
// -----------------------------------------------------------------
onStateChange((newState) => { renderFromState(newState); });

// -----------------------------------------------------------------
// loadReportPreview: Carga y muestra la tabla previa del reporte
// para la fecha seleccionada en el date picker.
// -----------------------------------------------------------------
async function loadReportPreview() {
    const dateInput = document.getElementById('report-date-input');
    const previewBody = document.getElementById('report-preview-body');
    const previewSection = document.getElementById('report-preview-section');
    const downloadBtn = document.getElementById('btn-download-excel');
    const noDataMsg = document.getElementById('report-no-data');
    const loadingMsg = document.getElementById('report-loading');

    if (!dateInput || !dateInput.value) return;

    const dateStr = dateInput.value; // YYYY-MM-DD

    previewSection.style.display = 'block';
    loadingMsg.style.display = 'block';
    noDataMsg.style.display = 'none';
    previewBody.innerHTML = '';
    downloadBtn.disabled = true;

    const { rows, summary } = await fetchAttendanceSummaryByDate(dateStr);

    loadingMsg.style.display = 'none';

    if (!rows || rows.length === 0) {
        noDataMsg.style.display = 'block';
        return;
    }

    // Renderizar tabla de resumen por módulo
    const modIds = Object.keys(summary).map(Number).sort((a,b) => a - b);
    previewBody.innerHTML = modIds.map(modId => {
        const s = summary[modId];
        return `
            <tr>
                <td><strong>Módulo ${s.moduleId}</strong></td>
                <td style="text-align:center;">${s.total}</td>
                <td style="text-align:center;">
                    <span style="color:#3B82F6;font-weight:700;">E:${s.byType.E}</span>
                    <span style="color:#10B981;font-weight:700;"> A:${s.byType.A}</span>
                    <span style="color:#8B5CF6;font-weight:700;"> V:${s.byType.V}</span>
                    <span style="color:#F59E0B;font-weight:700;"> B:${s.byType.B}</span>
                </td>
                <td style="text-align:center;">${formatSecondsToMinutes(s.avgSeconds)}</td>
            </tr>
        `;
    }).join('');

    // Fila total
    const totalAll = modIds.reduce((acc, id) => acc + summary[id].total, 0);
    previewBody.innerHTML += `
        <tr style="border-top:2px solid var(--gray-200); font-weight:700; background:var(--gray-50);">
            <td>TOTAL</td>
            <td style="text-align:center;">${totalAll}</td>
            <td></td>
            <td></td>
        </tr>
    `;

    downloadBtn.disabled = false;
    downloadBtn.onclick = () => downloadExcel(dateStr);
}

// -----------------------------------------------------------------
// Inicialización
// -----------------------------------------------------------------
(async () => {
    await checkAndAutoReset();  // Reinicio automático si es un nuevo día
    await refreshUI();

    // Configurar el date picker con la fecha de hoy y event listener
    const dateInput = document.getElementById('report-date-input');
    if (dateInput) {
        dateInput.value = new Date().toISOString().slice(0, 10);
        dateInput.addEventListener('change', loadReportPreview);
    }

    // Cargar preview automáticamente para hoy
    loadReportPreview();
})();

