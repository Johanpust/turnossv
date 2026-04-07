// =============================================================
// modulo.js — Lógica de la vista del operador de módulo
// El número de módulo se lee del parámetro ?mod=N en la URL.
// Permite llamar, avanzar al siguiente turno y pausar/reanudar.
// Soporta 6 módulos y 4 tipos de turno (E, A, V, B).
// =============================================================

// Verificar autenticación y rol 'modulo'
const session = requireRole('modulo');

// -----------------------------------------------------------------
// Colores por tipo de turno
// -----------------------------------------------------------------
const TYPE_STYLES = {
    E: { color: '#3B82F6', bg: '#EFF6FF', emoji: '📦', label: 'Entrega de órdenes' },
    A: { color: '#10B981', bg: '#ECFDF5', emoji: '📅', label: 'Activación de citas' },
    V: { color: '#8B5CF6', bg: '#F5F3FF', emoji: '🧪', label: 'Varios' },
    B: { color: '#F59E0B', bg: '#FFFBEB', emoji: '🔬', label: 'Entrega de biopsias' }
};

// -----------------------------------------------------------------
// Obtener el número de módulo desde el parámetro URL (?mod=N)
// y verificar que coincida con el módulo asignado al usuario.
// -----------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const moduleId = parseInt(urlParams.get('mod'));

// Si el módulo en la URL no coincide con el asignado al usuario, redirigir
if (!moduleId || moduleId !== session.moduleId) {
    window.location.href = `modulo.html?mod=${session.moduleId}`;
}

// -----------------------------------------------------------------
// Referencias a elementos del DOM
// -----------------------------------------------------------------
const turnoCard = document.getElementById('turno-card');
const turnoContent = document.getElementById('turno-content');
const turnoEmpty = document.getElementById('turno-empty');
const emptySubText = document.getElementById('empty-sub-text');
const turnoNumero = document.getElementById('turno-numero');
const turnoDoc = document.getElementById('turno-doc');
const priorityBadge = document.getElementById('priority-badge');
const stateBanner = document.getElementById('state-banner');
const moduleStatusBadge = document.getElementById('module-status-badge');
const moduloNumIcon = document.getElementById('modulo-num-icon');
const moduloNumText = document.getElementById('modulo-num-text');
const navStatusBadge = document.getElementById('nav-status-badge');
const btnLlamar = document.getElementById('btn-llamar');
const btnAtendiendo = document.getElementById('btn-atendiendo');
const btnSiguiente = document.getElementById('btn-siguiente');
const btnPausa = document.getElementById('btn-pausa');
const pausaIcon = document.getElementById('pausa-icon');
const pausaText = document.getElementById('pausa-text');
const qiHigh = document.getElementById('qi-high');
const qiNormal = document.getElementById('qi-normal');
const qiTotal = document.getElementById('qi-total');
const serviceDetails = document.getElementById('service-details');
const serviceTimer = document.getElementById('service-timer');
const callsLog = document.getElementById('calls-log');
const searchCalls = document.getElementById('search-calls');
const btnToggleAttended = document.getElementById('btn-toggle-attended');
const attendedContent = document.getElementById('attended-content');
const finishedTicketsLog = document.getElementById('finished-tickets-log');

let timerInterval = null;
let currentSearchQuery = '';

// Mostrar número de módulo en la UI
moduloNumIcon.textContent = moduleId;
moduloNumText.textContent = moduleId;
document.title = `Módulo ${moduleId} — Sistema de Turnos`;

// -----------------------------------------------------------------
// updateUI: Actualiza toda la interfaz con el estado actual del módulo.
// -----------------------------------------------------------------
function updateUI(state) {
    const mod = state.modules[moduleId];
    if (!mod) return;

    // --- Actualizar contadores de cola ---
    qiHigh.textContent   = state.highQueue.length;
    qiNormal.textContent = state.queue.length;
    qiTotal.textContent  = getTotalInQueue(state);

    // --- Determinar estado del módulo y aplicar estilos ---
    if (!mod.active) {
        // Módulo desactivado por el administrador
        applyModuleState('inactive', mod);
    } else if (mod.paused) {
        // Módulo pausado por el operador
        applyModuleState('paused', mod);
    } else {
        // Módulo activo y operativo
        applyModuleState('active', mod);
    }
}

// -----------------------------------------------------------------
// setBadge: Actualiza un badge de estado en el DOM sin reemplazar
// el elemento (evita perder la referencia JS con outerHTML).
// -----------------------------------------------------------------
function setBadge(el, badgeClass, dotClass, label) {
    el.className = `badge ${badgeClass}`;
    el.innerHTML = `<span class="dot ${dotClass}"></span> ${label}`;
}

// -----------------------------------------------------------------
// applyModuleState: Aplica el estado visual del módulo a la interfaz.
// status: 'active' | 'paused' | 'inactive'
// -----------------------------------------------------------------
function applyModuleState(status, mod) {
    // Limpiar clases anteriores de la tarjeta
    turnoCard.classList.remove('has-ticket', 'is-paused', 'is-inactive');

    // --- Configuración por estado ---
    if (status === 'inactive') {
        // Módulo desactivado por el administrador: no puede operar
        turnoCard.classList.add('is-inactive');
        stateBanner.className = 'state-banner inactive';
        stateBanner.textContent = '🔴 Módulo desactivado por el administrador';
        setBadge(moduleStatusBadge, 'badge-inactive', 'dot-inactive', 'Desactivado');
        navStatusBadge.className = 'badge badge-inactive';
        navStatusBadge.textContent = 'Desactivado';
        setButtonsEnabled(false, false, false);
        showEmptyState('Módulo desactivado por el administrador.');

    } else if (status === 'paused') {
        // Módulo pausado: el operador puede reanudar, no tomar turnos nuevos
        turnoCard.classList.add('is-paused');
        stateBanner.className = 'state-banner paused';
        stateBanner.textContent = '⏸️ Servicio en pausa — No se asignarán nuevos turnos';
        setBadge(moduleStatusBadge, 'badge-paused', 'dot-paused', 'Pausado');
        navStatusBadge.className = 'badge badge-paused';
        navStatusBadge.textContent = 'Pausado';
        updatePauseButton(true);
        // Aún puede llamar/siguiente si tiene turno activo
        setButtonsEnabled(
            !!mod.currentTicket, // llamar solo si hay turno
            !!mod.currentTicket, // siguiente solo si hay turno
            true                 // puede reanudar
        );
        if (mod.currentTicket) {
            showTicket(mod);
        } else {
            showEmptyState('En pausa. Reanuda para recibir turnos.');
        }

    } else {
        // Módulo activo
        stateBanner.className = 'state-banner';
        stateBanner.textContent = '';
        setBadge(moduleStatusBadge, 'badge-active', 'dot-active', 'Activo');
        navStatusBadge.className = 'badge badge-active';
        navStatusBadge.textContent = 'Activo';
        updatePauseButton(false);

        // Siempre mostrar los detalles de servicio (historial) y actualizar logs
        serviceDetails.style.display = 'block';
        updateCallsLog(mod.callLogs, currentSearchQuery);
        updateFinishedTicketsLog(mod.finishedTickets);

        if (mod.currentTicket) {
            turnoCard.classList.add('has-ticket');
            showTicket(mod);

            startServiceTimer(mod.assignedAt);
            // Mostrar tarjeta de timer si no estaba visible
            serviceDetails.querySelector('.detail-card').style.display = 'block';

            // "Atendiendo" se habilita SOLO si está llamando (para detener el flash)
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
            
            // Ocultar solo la tarjeta del timer cuando no hay turno, pero dejar el historial
            serviceDetails.querySelector('.detail-card').style.display = 'none';
            stopServiceTimer();
        }
    }
}

// -----------------------------------------------------------------
// showTicket: Muestra los datos del turno actual en la tarjeta.
// Activa la animación de pop en el número de turno.
// -----------------------------------------------------------------
function showTicket(mod) {
    turnoEmpty.style.display = 'none';
    turnoContent.style.display = 'block';

    // Animar el número si cambió
    if (turnoNumero.textContent !== mod.currentTicket) {
        turnoNumero.classList.remove('animate-pop');
        void turnoNumero.offsetWidth;
        turnoNumero.classList.add('animate-pop');
    }

    turnoNumero.textContent = mod.currentTicket;
    turnoDoc.textContent    = mod.currentDocId || '—';

    // Colorear el número según el tipo de turno
    const ts = TYPE_STYLES[mod.currentTicketType] || {};
    turnoNumero.style.color = ts.color || '';

    // Actualizar badge de tipo
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

// -----------------------------------------------------------------
// showEmptyState: Muestra el estado vacío (sin turno asignado).
// -----------------------------------------------------------------
function showEmptyState(subText) {
    turnoContent.style.display = 'none';
    turnoEmpty.style.display = 'block';
    emptySubText.textContent = subText || 'Esperando próximo turno en cola...';
    btnLlamar.classList.remove('has-ticket');
}

// -----------------------------------------------------------------
// setButtonsEnabled: Habilita o deshabilita los botones de acción.
// -----------------------------------------------------------------
function setButtonsEnabled(canLlamar, canAtendiendo, canSiguiente, canPause) {
    btnLlamar.disabled = !canLlamar;
    btnAtendiendo.disabled = !canAtendiendo;
    btnSiguiente.disabled = !canSiguiente;
    btnPausa.disabled = !canPause;
}

// -----------------------------------------------------------------
// startServiceTimer: Inicia un intervalo para mostrar el tiempo transcurrido.
// -----------------------------------------------------------------
function startServiceTimer(startTime) {
    if (timerInterval) clearInterval(timerInterval);
    if (!startTime) return;

    function tick() {
        const diff = Date.now() - startTime;
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

// -----------------------------------------------------------------
// updateCallsLog: Muestra la lista de llamados realizados agrupados por turno.
// -----------------------------------------------------------------
function updateCallsLog(logs, query = '') {
    if (!logs || logs.length === 0) {
        callsLog.innerHTML = '<div class="log-empty">No se han realizado llamados aún</div>';
        return;
    }

    // Filtrar por turno si hay query
    const filteredLogs = query 
        ? logs.filter(l => l.ticket.toLowerCase().includes(query.toLowerCase()))
        : logs;

    if (filteredLogs.length === 0) {
        callsLog.innerHTML = '<div class="log-empty">No se encontraron llamados para "' + query + '"</div>';
        return;
    }

    // Agrupar logs por ticket
    const groups = {};
    filteredLogs.forEach(log => {
        if (!groups[log.ticket]) {
            groups[log.ticket] = {
                ticket: log.ticket,
                docId: log.docId,
                calls: []
            };
        }
        groups[log.ticket].calls.push(log.calledAt);
    });

    // Convertir a array y revertir para ver lo más reciente arriba
    const sortedGroups = Object.values(groups).reverse();

    callsLog.innerHTML = sortedGroups.map((group) => {
        const callsHtml = group.calls.map((ts, idx) => {
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
                <div style="width: 100%;">
                    ${callsHtml}
                </div>
            </div>
        `;
    }).join('');
}

// -----------------------------------------------------------------
// updateFinishedTicketsLog: Muestra la lista de turnos atendidos.
// -----------------------------------------------------------------
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

// -----------------------------------------------------------------
// updatePauseButton: Actualiza el texto e ícono del botón de pausa.
// -----------------------------------------------------------------
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
// Acción: Botón LLAMAR — reproduce campanilla y registra el llamado
// -----------------------------------------------------------------
btnLlamar.addEventListener('click', () => {
    const state = getState();
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;

    // Registrar el llamado en el historial del display
    callCurrentTicket(state, moduleId);
    setState(state);

    // Refrescar la UI localmente para que el historial y el botón "atendiendo" se actualicen de inmediato.
    updateUI(state);
});

// -----------------------------------------------------------------
// Acción: Botón ATENDIENDO — cambia estado de llamando a atendiendo
// -----------------------------------------------------------------
btnAtendiendo.addEventListener('click', () => {
    const state = getState();
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;

    // Cambiar estado a atendiendo (esto limpia mod.calledAt y detiene el flash)
    attendCurrentTicket(state, moduleId);
    setState(state);

    // Refrescar la UI
    updateUI(state);
});

// -----------------------------------------------------------------
// Acción: Botón SIGUIENTE — completa el turno actual y carga el próximo
// -----------------------------------------------------------------
btnSiguiente.addEventListener('click', () => {
    const state = getState();

    // Completar el turno del módulo y asignar el siguiente automáticamente
    completeCurrentTicket(state, moduleId);
    setState(state);

    // Refrescar la UI con el nuevo estado
    updateUI(state);
});

// -----------------------------------------------------------------
// Acción: Botón PAUSAR / REANUDAR
// -----------------------------------------------------------------
btnPausa.addEventListener('click', () => {
    const state = getState();
    const mod = state.modules[moduleId];

    if (!mod.active) return; // No hacer nada si está desactivado por admin

    // Alternar el estado de pausa
    mod.paused = !mod.paused;

    // Si se reanuda, intentar asignar el siguiente turno automáticamente
    if (!mod.paused) {
        autoAssignToFreeModules(state);
    }

    setState(state);
    updateUI(state);
});

// -----------------------------------------------------------------
// Sincronización en tiempo real: escuchar cambios de otras pestañas
// (recepcionista genera turno, admin activa/desactiva módulo, etc.)
// -----------------------------------------------------------------
onStateChange((newState) => {
    updateUI(newState);
});

// -----------------------------------------------------------------
// Acción: Búsqueda en historial de llamados
// -----------------------------------------------------------------
searchCalls.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    const state = getState();
    const mod = state.modules[moduleId];
    updateCallsLog(mod.callLogs, currentSearchQuery);
});

// -----------------------------------------------------------------
// Acción: Toggle Acordeón de Turnos Atendidos
// -----------------------------------------------------------------
btnToggleAttended.addEventListener('click', () => {
    const isVisible = attendedContent.style.display === 'block';
    attendedContent.style.display = isVisible ? 'none' : 'block';
    btnToggleAttended.classList.toggle('active', !isVisible);
});

// -----------------------------------------------------------------
// Inicialización: renderizar la UI al cargar la página
// -----------------------------------------------------------------
updateUI(getState());
