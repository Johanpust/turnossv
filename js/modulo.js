// =============================================================
// modulo.js — Lógica de la vista del operador de módulo
// ACTUALIZADO: usa async/await con Supabase en lugar de localStorage.
// =============================================================

const session = requireRole('modulo');

const TYPE_STYLES = {
    E: { color: '#3B82F6', bg: '#EFF6FF', emoji: '📦', label: 'Entrega de órdenes' },
    A: { color: '#10B981', bg: '#ECFDF5', emoji: '📅', label: 'Activación de citas' },
    V: { color: '#8B5CF6', bg: '#F5F3FF', emoji: '🧪', label: 'Varios' },
    B: { color: '#F59E0B', bg: '#FFFBEB', emoji: '🔬', label: 'Entrega de biopsias' }
};

const urlParams = new URLSearchParams(window.location.search);
const moduleId  = parseInt(urlParams.get('mod'));

if (!moduleId || moduleId !== session.moduleId) {
    window.location.href = `modulo.html?mod=${session.moduleId}`;
}

// -----------------------------------------------------------------
// Referencias a elementos del DOM
// -----------------------------------------------------------------
const turnoCard           = document.getElementById('turno-card');
const turnoContent        = document.getElementById('turno-content');
const turnoEmpty          = document.getElementById('turno-empty');
const emptySubText        = document.getElementById('empty-sub-text');
const turnoNumero         = document.getElementById('turno-numero');
const turnoDoc            = document.getElementById('turno-doc');
const priorityBadge       = document.getElementById('priority-badge');
const stateBanner         = document.getElementById('state-banner');
const moduleStatusBadge   = document.getElementById('module-status-badge');
const moduloNumIcon       = document.getElementById('modulo-num-icon');
const moduloNumText       = document.getElementById('modulo-num-text');
const navStatusBadge      = document.getElementById('nav-status-badge');
const btnLlamar           = document.getElementById('btn-llamar');
const btnAtendiendo       = document.getElementById('btn-atendiendo');
const btnSiguiente        = document.getElementById('btn-siguiente');
const btnPausa            = document.getElementById('btn-pausa');
const pausaIcon           = document.getElementById('pausa-icon');
const pausaText           = document.getElementById('pausa-text');
const qiHigh              = document.getElementById('qi-high');
const qiNormal            = document.getElementById('qi-normal');
const qiTotal             = document.getElementById('qi-total');
const serviceDetails      = document.getElementById('service-details');
const serviceTimer        = document.getElementById('service-timer');
const callsLog            = document.getElementById('calls-log');
const searchCalls         = document.getElementById('search-calls');
const btnToggleAttended   = document.getElementById('btn-toggle-attended');
const attendedContent     = document.getElementById('attended-content');
const finishedTicketsLog  = document.getElementById('finished-tickets-log');

let timerInterval = null;
let currentSearchQuery = '';

if (moduleId === 7) {
    moduloNumIcon.textContent = 'A';
    document.querySelector('.modulo-title span').textContent = 'Autogestión';
    document.title = `Autogestión — Sistema de Turnos`;
} else {
    moduloNumIcon.textContent = moduleId;
    moduloNumText.textContent = moduleId;
    document.title = `Módulo ${moduleId} — Sistema de Turnos`;
}

// -----------------------------------------------------------------
// updateUI: Actualiza la interfaz con el estado del módulo.
// -----------------------------------------------------------------
function updateUI(state) {
    const mod = state.modules[moduleId];
    if (!mod) return;

    qiHigh.textContent   = state.highQueue.length;
    qiNormal.textContent = state.queue.length;
    qiTotal.textContent  = getTotalInQueue(state);

    if (!mod.active) {
        applyModuleState('inactive', mod);
    } else if (mod.paused) {
        applyModuleState('paused', mod);
    } else {
        applyModuleState('active', mod);
    }
}

function setBadge(el, badgeClass, dotClass, label) {
    el.className = `badge ${badgeClass}`;
    el.innerHTML = `<span class="dot ${dotClass}"></span> ${label}`;
}

function applyModuleState(status, mod) {
    turnoCard.classList.remove('has-ticket', 'is-paused', 'is-inactive');

    if (status === 'inactive') {
        turnoCard.classList.add('is-inactive');
        stateBanner.className = 'state-banner inactive';
        stateBanner.textContent = '🔴 Módulo desactivado por el administrador';
        setBadge(moduleStatusBadge, 'badge-inactive', 'dot-inactive', 'Desactivado');
        navStatusBadge.className = 'badge badge-inactive';
        navStatusBadge.textContent = 'Desactivado';
        setButtonsEnabled(false, false, false);
        showEmptyState('Módulo desactivado por el administrador.');

    } else if (status === 'paused') {
        turnoCard.classList.add('is-paused');
        stateBanner.className = 'state-banner paused';
        stateBanner.textContent = '⏸️ Servicio en pausa — No se asignarán nuevos turnos';
        setBadge(moduleStatusBadge, 'badge-paused', 'dot-paused', 'Pausado');
        navStatusBadge.className = 'badge badge-paused';
        navStatusBadge.textContent = 'Pausado';
        updatePauseButton(true);
        setButtonsEnabled(
            !!mod.currentTicket,
            !!mod.currentTicket,
            true,
            true // canPause
        );
        if (mod.currentTicket) {
            showTicket(mod);
        } else {
            showEmptyState('En pausa. Reanuda para recibir turnos.');
        }

    } else {
        stateBanner.className = 'state-banner';
        stateBanner.textContent = '';
        setBadge(moduleStatusBadge, 'badge-active', 'dot-active', 'Activo');
        navStatusBadge.className = 'badge badge-active';
        navStatusBadge.textContent = 'Activo';
        updatePauseButton(false);

        serviceDetails.style.display = 'block';
        updateCallsLog(mod.callLogs, currentSearchQuery);
        updateFinishedTicketsLog(mod.finishedTickets);

        if (mod.currentTicket) {
            turnoCard.classList.add('has-ticket');
            showTicket(mod);
            startServiceTimer(mod.assignedAt);
            serviceDetails.querySelector('.detail-card').style.display = 'block';

            const isCurrentlyCalling = !!mod.calledAt;
            setButtonsEnabled(true, isCurrentlyCalling, true, true);

            if (isCurrentlyCalling) {
                btnLlamar.classList.remove('has-ticket');
            } else {
                btnLlamar.classList.add('has-ticket');
            }
        } else {
            showEmptyState('Esperando próximo turno en cola...');
            setButtonsEnabled(false, false, false, true);
            btnLlamar.classList.remove('has-ticket');
            serviceDetails.querySelector('.detail-card').style.display = 'none';
            stopServiceTimer();
        }
    }
}

function showTicket(mod) {
    turnoEmpty.style.display = 'none';
    turnoContent.style.display = 'block';

    if (turnoNumero.textContent !== mod.currentTicket) {
        turnoNumero.classList.remove('animate-pop');
        void turnoNumero.offsetWidth;
        turnoNumero.classList.add('animate-pop');
    }

    turnoNumero.textContent = mod.currentTicket;
    turnoDoc.textContent    = mod.currentDocId || '—';

    const ts = TYPE_STYLES[mod.currentTicketType] || {};
    turnoNumero.style.color = ts.color || '';

    let typeBadgeEl = document.getElementById('ticket-type-badge');
    if (!typeBadgeEl) {
        typeBadgeEl = document.createElement('div');
        typeBadgeEl.id = 'ticket-type-badge';
        typeBadgeEl.style.cssText = 'text-align:center; margin-bottom:0.5rem;';
        turnoNumero.parentNode.insertBefore(typeBadgeEl, turnoNumero.nextSibling);
    }
    if (mod.currentTicketType && ts.label) {
        typeBadgeEl.innerHTML = `
            <span style="display:inline-flex; align-items:center; gap:0.3rem;
                         background:${ts.bg}; color:${ts.color}; border:1px solid ${ts.color}40;
                         padding:3px 10px; border-radius:20px; font-size:0.8rem; font-weight:600;">
                ${ts.emoji} ${ts.label}
            </span>`;
        typeBadgeEl.style.display = 'block';
    } else {
        typeBadgeEl.style.display = 'none';
    }
}

function showEmptyState(subText) {
    turnoContent.style.display = 'none';
    turnoEmpty.style.display = 'block';
    emptySubText.textContent = subText || 'Esperando próximo turno en cola...';
    btnLlamar.classList.remove('has-ticket');
}

function setButtonsEnabled(canLlamar, canAtendiendo, canSiguiente, canPause) {
    btnLlamar.disabled     = !canLlamar;
    btnAtendiendo.disabled = !canAtendiendo;
    btnSiguiente.disabled  = !canSiguiente;
    btnPausa.disabled      = !canPause;
}

function startServiceTimer(startTime) {
    if (timerInterval) clearInterval(timerInterval);
    if (!startTime) return;

    function tick() {
        const diff      = Date.now() - startTime;
        const totalSecs = Math.floor(diff / 1000);
        const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
        const secs = String(totalSecs % 60).padStart(2, '0');
        serviceTimer.textContent = `${mins}:${secs}`;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
}

function stopServiceTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    serviceTimer.textContent = '00:00';
}

function updateCallsLog(logs, query = '') {
    if (!logs || logs.length === 0) {
        callsLog.innerHTML = '<div class="log-empty">No se han realizado llamados aún</div>';
        return;
    }

    const filteredLogs = query
        ? logs.filter(l => l.ticket.toLowerCase().includes(query.toLowerCase()))
        : logs;

    if (filteredLogs.length === 0) {
        callsLog.innerHTML = '<div class="log-empty">No se encontraron llamados para "' + query + '"</div>';
        return;
    }

    const groups = {};
    filteredLogs.forEach(log => {
        if (!groups[log.ticket]) {
            groups[log.ticket] = { ticket: log.ticket, docId: log.docId, calls: [] };
        }
        groups[log.ticket].calls.push(log.calledAt);
    });

    const sortedGroups = Object.values(groups).reverse();

    callsLog.innerHTML = sortedGroups.map((group) => {
        const callsHtml = group.calls.map((ts) => {
            const date = new Date(ts);
            const timeStr = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
            return `<div style="font-size: 0.75rem; color: var(--gray-500); padding-left: 0.5rem;">• ${timeStr}</div>`;
        }).join('');

        return `
            <div class="log-item" style="flex-direction: column; align-items: flex-start; gap: 4px; border-bottom: 2px solid var(--gray-100); padding-bottom: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: var(--primary-700); font-size: 1rem;">${group.ticket}</strong>
                        <span style="font-size: 0.65rem; background: var(--primary-50); color: var(--primary-600); padding: 1px 6px; border-radius: 4px;">${group.calls.length} llamados</span>
                    </div>
                    <span style="font-size: 0.7rem; color: var(--gray-400)">Doc: ${group.docId}</span>
                </div>
                <div style="width: 100%;">${callsHtml}</div>
            </div>
        `;
    }).join('');
}

function updateFinishedTicketsLog(finished) {
    if (!finished || finished.length === 0) {
        finishedTicketsLog.innerHTML = '<div class="log-empty">No hay turnos finalizados aún</div>';
        return;
    }

    const reversed = [...finished].reverse();

    finishedTicketsLog.innerHTML = reversed.map(t => {
        const date = new Date(t.finishedAt);
        const timeStr = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
        return `
            <div class="log-item" style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--gray-50);">
                <div>
                    <strong style="color: var(--gray-700); font-size: 0.95rem;">${t.ticket}</strong>
                    <div style="font-size: 0.75rem; color: var(--gray-400);">Finalizado: ${timeStr}</div>
                </div>
                <div style="font-size: 0.8rem; color: var(--gray-500);">Doc: ${t.docId}</div>
            </div>
        `;
    }).join('');
}

function updatePauseButton(isPaused) {
    if (isPaused) {
        btnPausa.classList.remove('pausar');
        btnPausa.classList.add('reanudar');
        pausaIcon.textContent = '▶️';
        pausaText.textContent = 'Reanudar servicio';
    } else {
        btnPausa.classList.remove('reanudar');
        btnPausa.classList.add('pausar');
        pausaIcon.textContent = '⏸️';
        pausaText.textContent = 'Pausar servicio';
    }
}

// -----------------------------------------------------------------
// Acciones de botones — todas async
// -----------------------------------------------------------------
btnLlamar.addEventListener('click', async () => {
    const state = await getState();
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;

    callCurrentTicket(state, moduleId);
    await setState(state);
    updateUI(state);
});

btnAtendiendo.addEventListener('click', async () => {
    const state = await getState();
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;

    attendCurrentTicket(state, moduleId);
    await setState(state);
    updateUI(state);
});

btnSiguiente.addEventListener('click', async () => {
    const state = await getState();
    completeCurrentTicket(state, moduleId);
    await setState(state);
    updateUI(state);
});

btnPausa.addEventListener('click', async () => {
    const state = await getState();
    const mod = state.modules[moduleId];
    if (!mod.active) return;

    mod.paused = !mod.paused;

    if (!mod.paused) {
        autoAssignToFreeModules(state);
    }

    await setState(state);
    updateUI(state);
});

// -----------------------------------------------------------------
// Sincronización en tiempo real
// -----------------------------------------------------------------
onStateChange((newState) => {
    updateUI(newState);
});

// -----------------------------------------------------------------
// Búsqueda en historial
// -----------------------------------------------------------------
searchCalls.addEventListener('input', async (e) => {
    currentSearchQuery = e.target.value.trim();
    const state = await getState();
    const mod = state.modules[moduleId];
    updateCallsLog(mod.callLogs, currentSearchQuery);
});

// -----------------------------------------------------------------
// Toggle Acordeón de Turnos Atendidos
// -----------------------------------------------------------------
btnToggleAttended.addEventListener('click', () => {
    const isVisible = attendedContent.style.display === 'block';
    attendedContent.style.display = isVisible ? 'none' : 'block';
    btnToggleAttended.classList.toggle('active', !isVisible);
});

// -----------------------------------------------------------------
// Inicialización
// -----------------------------------------------------------------
(async () => {
    await checkAndAutoReset();  // Reinicio automático si es un nuevo día
    const state = await getState();
    updateUI(state);
})();

// -----------------------------------------------------------------
// Mini-Recepción (Generar Ficha Rápida)
// -----------------------------------------------------------------
const btnQuickTicket = document.getElementById('btn-quick-ticket');
const quickTypeSelect = document.getElementById('quick-type');
const quickDocInput = document.getElementById('quick-doc-id');
const quickTicketMsg = document.getElementById('quick-ticket-msg');

if (btnQuickTicket) {
    btnQuickTicket.addEventListener('click', async () => {
        const type = quickTypeSelect.value;
        const docId = quickDocInput.value.trim();

        if (!docId) {
            alert('Por favor, ingresa el documento del paciente.');
            return;
        }
        if (docId.length < 4) {
            alert('El documento debe tener al menos 4 números.');
            return;
        }
        if (!/^\d+$/.test(docId)) {
            alert('El documento debe contener solo números.');
            return;
        }

        btnQuickTicket.disabled = true;
        
        try {
            const state = await getState();
            
            // Re-usamos la lógica de tickets.js
            const result = addTicket(state, docId, 'normal', type);
            
            if (result && result.ticket) {
                // Asignar automáticamente si hay un módulo libre
                autoAssignToFreeModules(state);
                await setState(state);
                
                quickDocInput.value = '';
                quickTicketMsg.style.display = 'block';
                quickTicketMsg.textContent = `✅ Ficha ${result.ticket} generada`;
                
                // Ocultar mensaje después de 4 segundos
                setTimeout(() => {
                    quickTicketMsg.style.display = 'none';
                }, 4000);
            } else {
                alert('Error al generar el turno.');
            }
        } catch (error) {
            console.error("Error al generar ficha rápida:", error);
            alert("Error al conectar con la base de datos.");
        } finally {
            btnQuickTicket.disabled = false;
        }
    });
}
