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
const audioOverlay       = document.getElementById('audio-overlay');

let lastCalledAtMap = {};
for (let i = 1; i <= 6; i++) lastCalledAtMap[i] = 0;

// Contexto de audio compartido (se crea al primer click del usuario)
let sharedAudioCtx = null;
let audioUnlocked  = false;

// -----------------------------------------------------------------
// activateAudio: Desbloquea el audio del navegador.
// Debe llamarse desde un evento de usuario (click/touch).
// -----------------------------------------------------------------
function activateAudio() {
    if (audioUnlocked) return;

    try {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
            sharedAudioCtx = new AudioCtxClass();
            // Crear y reproducir un tono silencioso para desbloquear el contexto
            const buf = sharedAudioCtx.createBuffer(1, 1, 22050);
            const src = sharedAudioCtx.createBufferSource();
            src.buffer = buf;
            src.connect(sharedAudioCtx.destination);
            src.start(0);
        }
        // Desbloquear también SpeechSynthesis con una utterance silenciosa
        if (window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance('');
            window.speechSynthesis.speak(u);
        }
        audioUnlocked = true;
        console.log('✅ Audio desbloqueado por interacción del usuario');
    } catch (e) {
        console.warn('No se pudo desbloquear el audio:', e);
    }

    // Ocultar overlay
    if (audioOverlay) {
        audioOverlay.style.transition = 'opacity 0.4s';
        audioOverlay.style.opacity = '0';
        setTimeout(() => { audioOverlay.style.display = 'none'; }, 400);
    }
}

// Wire overlay click
if (audioOverlay) {
    audioOverlay.addEventListener('click', activateAudio);
    audioOverlay.addEventListener('touchend', activateAudio);
}

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

        let hasActiveTicketDisplay = false;

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
            hasActiveTicketDisplay = true;
        } else if (mod.isAttending && mod.currentTicket) {
            cardClass   = '';
            statusLabel = 'ATENDIENDO';
            statusClass = 'status-attending';
            hasActiveTicketDisplay = true;
        } else if (mod.currentTicket) {
            cardClass   = '';
            statusLabel = 'EN ESPERA';
            statusClass = 'status-waiting';
            hasActiveTicketDisplay = true;
        } else {
            cardClass   = '';
            statusLabel = 'DISPONIBLE';
            statusClass = 'status-waiting';
        }

        let ticketContent;
        if (hasActiveTicketDisplay) {
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
// Solo ejecuta audio si el usuario ya activó la pantalla.
// -----------------------------------------------------------------
function checkForNewCalls(state) {
    const notificationMode = (state.settings && state.settings.notificationMode) || 'sound';

    for (let i = 1; i <= 6; i++) {
        const mod      = state.modules[i];
        if (!mod) continue;
        const calledAt = mod.calledAt || 0;

        if (calledAt > (lastCalledAtMap[i] || 0)) {
            lastCalledAtMap[i] = calledAt;

            if (!audioUnlocked) {
                console.log('Audio bloqueado por el navegador — el usuario debe tocar la pantalla primero.');
                continue;
            }

            if (notificationMode === 'voice') {
                if (mod.currentTicket) {
                    announceTicket(mod.currentTicket, i);
                }
            } else {
                playBellUnlocked();
            }
        }
    }
}

// -----------------------------------------------------------------
// playBellUnlocked: Reproduce campanilla usando el sharedAudioCtx
// que ya fue desbloqueado por la interacción del usuario.
// -----------------------------------------------------------------
function playBellUnlocked() {
    try {
        if (!sharedAudioCtx) return;
        // Reanudar si el contexto fue suspendido automáticamente
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
        }
        const ctx = sharedAudioCtx;
        createBellTone(ctx, 880,  0,    0.6);
        createBellTone(ctx, 1108, 0,    0.3);
        createBellTone(ctx, 659,  0,    0.2);
        createBellTone(ctx, 1046, 0.35, 0.5);
        createBellTone(ctx, 1318, 0.35, 0.2);
    } catch (e) {
        console.error('Error al reproducir campanilla:', e);
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
