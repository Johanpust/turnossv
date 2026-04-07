// =============================================================
// display.js — Lógica de la pantalla pública (Raspberry Pi / TV)
// No requiere autenticación. Lee el estado de Supabase y se
// sincroniza automáticamente en tiempo real via WebSockets.
// ACTUALIZADO: async/await con Supabase en lugar de localStorage.
// =============================================================

const TYPE_STYLES = {
    E: { color: '#3B82F6', bg: '#DBEAFE', emoji: '📦', label: 'Órdenes' },
    A: { color: '#10B981', bg: '#D1FAE5', emoji: '📅', label: 'Citas' },
    V: { color: '#8B5CF6', bg: '#EDE9FE', emoji: '🧪', label: 'Varios' },
    B: { color: '#F59E0B', bg: '#FEF3C7', emoji: '🔬', label: 'Biopsias' }
};

const modulesDisplayGrid = document.getElementById('modules-display-grid');
const callHistoryList    = document.getElementById('call-history-list');
const displayTimeEl      = document.getElementById('display-time');
const displayDateEl      = document.getElementById('display-date');

let lastCalledAtMap = {};
for (let i = 1; i <= 6; i++) lastCalledAtMap[i] = 0;

function startClock() {
    function tick() {
        const now = new Date();
        const hh  = String(now.getHours()).padStart(2, '0');
        const mm  = String(now.getMinutes()).padStart(2, '0');
        const ss  = String(now.getSeconds()).padStart(2, '0');
        displayTimeEl.textContent = `${hh}:${mm}:${ss}`;
        const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        displayDateEl.textContent = now.toLocaleDateString('es-ES', opts)
            .replace(/^\w/, c => c.toUpperCase());
    }
    tick();
    setInterval(tick, 1000);
}

function getTypeStyle(type) {
    return TYPE_STYLES[type] || { color: '#6B7280', bg: '#F3F4F6', emoji: '🎟️', label: '' };
}

// -----------------------------------------------------------------
// renderModules: Genera las tarjetas de los 6 módulos.
// -----------------------------------------------------------------
function renderModules(state) {
    modulesDisplayGrid.innerHTML = '';

    for (let i = 1; i <= 6; i++) {
        const mod = state.modules[i];
        if (!mod) continue;

        let cardClass   = '';
        let statusLabel = '';
        let statusClass = '';

        if (!mod.active) {
            cardClass   = 'is-inactive';
            statusLabel = 'DESACTIVADO';
            statusClass = 'status-inactive';
        } else if (mod.paused) {
            cardClass   = 'is-paused';
            statusLabel = 'EN PAUSA';
            statusClass = 'status-paused';
        } else if (mod.currentTicket && mod.calledAt) {
            cardClass   = 'is-calling';
            statusLabel = 'LLAMANDO';
            statusClass = 'status-active';
        } else if (mod.isAttending) {
            cardClass   = '';
            statusLabel = 'ATENDIENDO';
            statusClass = 'status-attending';
        } else if (mod.currentTicket) {
            cardClass   = '';
            statusLabel = 'EN ATENCIÓN';
            statusClass = 'status-active';
        } else {
            cardClass   = '';
            statusLabel = 'DISPONIBLE';
            statusClass = 'status-waiting';
        }

        let ticketContent;
        if (mod.currentTicket) {
            const ts = getTypeStyle(mod.currentTicketType);
            ticketContent = `
                <div class="module-ticket-number" style="color:${ts.color};">
                    ${mod.currentTicket}
                </div>
                <div style="margin-top:0.25rem; font-size:0.75rem; font-weight:600;
                            color:${ts.color}; opacity:0.8; letter-spacing:0.05em;">
                    ${ts.emoji} ${ts.label}
                </div>`;
        } else {
            ticketContent = `<div class="module-ticket-empty">—</div>`;
        }

        const card = document.createElement('div');
        card.className = `module-display-card ${cardClass}`;
        card.id = `display-mod-${i}`;
        card.innerHTML = `
            <div class="module-display-header">
                <div class="module-display-num">MÓDULO ${i}</div>
                <span class="module-display-status ${statusClass}">${statusLabel}</span>
            </div>
            <div class="module-display-ticket">
                ${ticketContent}
            </div>
        `;

        modulesDisplayGrid.appendChild(card);
    }
}

// -----------------------------------------------------------------
// checkForNewCalls: Detecta llamados nuevos y dispara notificación.
// -----------------------------------------------------------------
function checkForNewCalls(state) {
    const notificationMode = (state.settings && state.settings.notificationMode) || 'sound';

    for (let i = 1; i <= 6; i++) {
        const mod      = state.modules[i];
        if (!mod) continue;
        const calledAt = mod.calledAt || 0;

        if (calledAt > (lastCalledAtMap[i] || 0)) {
            lastCalledAtMap[i] = calledAt;

            if (notificationMode === 'voice') {
                if (mod.currentTicket) {
                    announceTicket(mod.currentTicket, i);
                }
            } else {
                playBell();
            }
        }
    }
}

// -----------------------------------------------------------------
// renderWaitingQueue: Muestra los turnos en espera.
// -----------------------------------------------------------------
function renderWaitingQueue(state) {
    const waitingList = [
        ...state.highQueue.map(t => ({ ...t, isHigh: true })),
        ...state.queue.map(t => ({ ...t, isHigh: false }))
    ];

    if (waitingList.length === 0) {
        callHistoryList.innerHTML = '<span class="no-history">No hay turnos en espera...</span>';
        return;
    }

    callHistoryList.innerHTML = waitingList.map((item) => {
        const ts = getTypeStyle(item.type);
        const priorityBg     = item.isHigh ? '#FEF2F2' : ts.bg;

        return `
            <div class="history-item ${item.isHigh ? 'is-priority' : ''}"
                 style="border-left: 3px solid ${ts.color}; background:${priorityBg};">
                <div>
                    <div class="history-ticket" style="color:${ts.color};">${item.ticket}</div>
                    <div class="history-module" style="color:${ts.color}; opacity:0.75;">
                        ${ts.emoji} ${ts.label}${item.isHigh ? ' · 🔴 PRIORIDAD' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// -----------------------------------------------------------------
// refreshDisplay: Carga el estado inicial desde Supabase.
// -----------------------------------------------------------------
async function refreshDisplay() {
    const state = await getState();
    // Sincronizar mapa inicial para no disparar sonido al cargar
    for (let i = 1; i <= 6; i++) {
        if (state.modules[i]) {
            lastCalledAtMap[i] = state.modules[i].calledAt || 0;
        }
    }
    renderModules(state);
    renderWaitingQueue(state);
}

// -----------------------------------------------------------------
// Sincronización en tiempo real (WebSocket via Supabase Realtime)
// -----------------------------------------------------------------
onStateChange((newState) => {
    checkForNewCalls(newState);
    renderModules(newState);
    renderWaitingQueue(newState);
});

// -----------------------------------------------------------------
// Inicialización
// -----------------------------------------------------------------
startClock();
refreshDisplay();
