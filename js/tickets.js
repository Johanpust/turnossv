// =============================================================
// tickets.js — Lógica de generación y gestión de turnos
// Tipos de turno: E, A, V, B (con numeración 001-999 por tipo)
// La cola es única y mezclada; el tipo es una clasificación.
// =============================================================

// -----------------------------------------------------------------
// generateNextTicketCode: Genera el código del próximo ticket
// para el tipo dado. E, A, V: 01-99. B: 001-020.
// -----------------------------------------------------------------
function generateNextTicketCode(state, type) {
    let limit = (type === 'B') ? 20 : 99;
    let padding = 2; // TODOS usan 2 dígitos (ej: V01, B01)

    if (!state.ticketCounter[type] || state.ticketCounter[type] > limit) {
        state.ticketCounter[type] = 1;
    }
    const number = state.ticketCounter[type];
    const code = `${type}${String(number).padStart(padding, '0')}`;

    // Avanzar el contador; cicla a 1 después del límite
    state.ticketCounter[type] = (number >= limit) ? 1 : number + 1;

    return code;
}

// -----------------------------------------------------------------
// getNextTicketPreview: Devuelve el código del próximo ticket
// para un tipo sin modificar el estado (solo lectura).
// -----------------------------------------------------------------
function getNextTicketPreview(state, type) {
    if (!type) return '—';
    let limit = (type === 'B') ? 20 : 99;
    let padding = 2; // TODOS usan 2 dígitos

    if (!state.ticketCounter[type] || state.ticketCounter[type] > limit) {
        state.ticketCounter[type] = 1;
    }
    const number = state.ticketCounter[type] || 1;
    return `${type}${String(number).padStart(padding, '0')}`;
}

// -----------------------------------------------------------------
// addTicket: Crea y agrega un nuevo turno a la cola correspondiente.
// priority: 'high' | 'normal'
// type: 'E' | 'A' | 'V' | 'B'
// Retorna el objeto ticket creado.
// -----------------------------------------------------------------
function addTicket(state, docId, priority = 'normal', type = 'E') {
    const code = generateNextTicketCode(state, type);

    const ticket = {
        ticket: code,           // Código del turno (ej: E005, V023)
        type: type,             // Tipo de turno: E | A | V | B
        docId: docId.trim(),    // Documento de identidad del paciente
        priority: priority,     // 'high' | 'normal'
        timestamp: Date.now()   // Hora de creación
    };

    if (priority === 'high') {
        state.highQueue.push(ticket);
    } else {
        state.queue.push(ticket);
    }

    return ticket;
}

// -----------------------------------------------------------------
// getFirstMatchingTicket: Busca el primer ticket en una cola que
// coincida con alguno de los tipos permitidos.
// Retorna { ticket, index } o null si no hay.
// -----------------------------------------------------------------
function getFirstMatchingTicket(queue, allowedTypes) {
    if (!allowedTypes || allowedTypes.length === 0) return null;
    for (let i = 0; i < queue.length; i++) {
        if (allowedTypes.includes(queue[i].type)) {
            return { ticket: queue[i], index: i };
        }
    }
    return null;
}

// -----------------------------------------------------------------
// peekNextTicket: Mira el próximo turno disponible para el módulo
// (según sus allowedTypes) sin retirarlo de la cola.
// Alta prioridad tiene precedencia.
// -----------------------------------------------------------------
function peekNextTicket(state, allowedTypes) {
    const highMatch = getFirstMatchingTicket(state.highQueue, allowedTypes);
    if (highMatch) return highMatch.ticket;
    const normalMatch = getFirstMatchingTicket(state.queue, allowedTypes);
    if (normalMatch) return normalMatch.ticket;
    return null;
}

// -----------------------------------------------------------------
// dequeueNextTicket: Retira y retorna el próximo turno disponible
// para el módulo según sus allowedTypes.
// Alta prioridad primero.
// -----------------------------------------------------------------
function dequeueNextTicket(state, allowedTypes) {
    const highMatch = getFirstMatchingTicket(state.highQueue, allowedTypes);
    if (highMatch) {
        state.highQueue.splice(highMatch.index, 1);
        return highMatch.ticket;
    }
    const normalMatch = getFirstMatchingTicket(state.queue, allowedTypes);
    if (normalMatch) {
        state.queue.splice(normalMatch.index, 1);
        return normalMatch.ticket;
    }
    return null;
}

// -----------------------------------------------------------------
// getTotalInQueue: Retorna la cantidad total de turnos en espera
// (de cualquier tipo y prioridad).
// -----------------------------------------------------------------
function getTotalInQueue(state) {
    return state.highQueue.length + state.queue.length;
}

// -----------------------------------------------------------------
// getQueueCountByType: Retorna un objeto con el conteo de turnos
// en espera por tipo { E: N, A: N, V: N, B: N }.
// -----------------------------------------------------------------
function getQueueCountByType(state) {
    const counts = { E: 0, A: 0, V: 0, B: 0 };
    [...state.highQueue, ...state.queue].forEach(t => {
        if (counts[t.type] !== undefined) counts[t.type]++;
    });
    return counts;
}

// -----------------------------------------------------------------
// assignTicketToModule: Intenta asignar el próximo turno de la cola
// (filtrado por allowedTypes del módulo) a un módulo específico.
// Solo si el módulo está activo, no pausado y sin turno en curso.
// Retorna true si se asignó, false si no.
// -----------------------------------------------------------------
function assignTicketToModule(state, moduleId) {
    const mod = state.modules[moduleId];
    if (!mod.active || mod.paused || mod.currentTicket !== null) {
        return false;
    }

    const allowedTypes = mod.allowedTypes || ['E', 'A', 'V', 'B'];
    const next = dequeueNextTicket(state, allowedTypes);
    if (!next) return false;

    mod.currentTicket = next.ticket;
    mod.currentTicketType = next.type;
    mod.currentDocId = next.docId;
    mod.calledAt = null;
    mod.isAttending = false;
    mod.assignedAt = Date.now();
    if (!mod.callLogs) mod.callLogs = [];

    return true;
}

// -----------------------------------------------------------------
// autoAssignToFreeModules: Recorre los 6 módulos y asigna turnos
// automáticamente a los que estén disponibles (respetando tipos).
// -----------------------------------------------------------------
function autoAssignToFreeModules(state) {
    for (let i = 1; i <= 7; i++) {
        const mod = state.modules[i];
        if (getTotalInQueue(state) === 0) break;
        if (mod.active && !mod.paused && mod.currentTicket === null) {
            assignTicketToModule(state, i);
        }
    }
}

// -----------------------------------------------------------------
// completeCurrentTicket: Marca el turno como completado,
// lo registra en el historial y asigna el siguiente.
// -----------------------------------------------------------------
function completeCurrentTicket(state, moduleId) {
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;

    const finishedAt = Date.now();

    if (!mod.finishedTickets) mod.finishedTickets = [];
    mod.finishedTickets.push({
        ticket:     mod.currentTicket,
        type:       mod.currentTicketType,
        docId:      mod.currentDocId,
        assignedAt: mod.assignedAt,
        attendingAt: mod.attendingAt || null,
        finishedAt: finishedAt
    });

    // Persistir en Supabase para el reporte diario
    if (typeof logAttendance === 'function') {
        logAttendance({
            moduleId:    moduleId,
            ticket:      mod.currentTicket,
            ticketType:  mod.currentTicketType,
            docId:       mod.currentDocId,
            assignedAt:  mod.assignedAt   || null,
            attendingAt: mod.attendingAt  || null,
            finishedAt:  finishedAt
        });
    }

    mod.currentTicket     = null;
    mod.currentTicketType = null;
    mod.currentDocId      = null;
    mod.calledAt          = null;
    mod.isAttending       = false;
    mod.assignedAt        = 0;
    mod.attendingAt       = null;

    autoAssignToFreeModules(state);
}

// -----------------------------------------------------------------
// callCurrentTicket: Registra la llamada de un turno en el historial.
// Se invoca cuando el operador presiona "Llamar".
// -----------------------------------------------------------------
function callCurrentTicket(state, moduleId) {
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;

    mod.calledAt = Date.now();

    if (!mod.callLogs) mod.callLogs = [];
    mod.callLogs.push({
        ticket: mod.currentTicket,
        type: mod.currentTicketType,
        docId: mod.currentDocId,
        calledAt: mod.calledAt
    });

    const record = {
        ticket: mod.currentTicket,
        type: mod.currentTicketType,
        moduleId: moduleId,
        calledAt: mod.calledAt
    };

    state.callHistory.unshift(record);
    if (state.callHistory.length > 10) {
        state.callHistory = state.callHistory.slice(0, 10);
    }
}

// -----------------------------------------------------------------
// attendCurrentTicket: Cambia el estado del módulo a "atendiendo".
// -----------------------------------------------------------------
function attendCurrentTicket(state, moduleId) {
    const mod = state.modules[moduleId];
    if (!mod.currentTicket) return;
    mod.isAttending  = true;
    mod.attendingAt  = Date.now();  // Hora exacta en que comienza la atención
    mod.calledAt     = null;
}

// -----------------------------------------------------------------
// calculateEstimatedWaitTime: Devuelve el tiempo estimado en minutos
// -----------------------------------------------------------------
function calculateEstimatedWaitTime(state) {
    let activeModules = 0;
    for (let i = 1; i <= 7; i++) {
        if (state.modules[i] && state.modules[i].active && !state.modules[i].paused) {
            activeModules++;
        }
    }
    
    const divisor = activeModules > 0 ? activeModules : 1;
    const totalInQueue = getTotalInQueue(state);
    
    // Asumimos 3 minutos promedio por turno
    const avgMinutesPerPatient = 3;
    
    const estimatedWait = Math.ceil((totalInQueue / divisor) * avgMinutesPerPatient);
    
    // Devolvemos el tiempo (mínimo 1 minuto si hay cola, 0 si la cola está vacía)
    return totalInQueue === 0 ? 0 : Math.max(1, estimatedWait);
}
