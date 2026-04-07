// =============================================================
// storage.js — Gestión del estado global en localStorage
// Todos los módulos comparten este estado. Los cambios se
// sincronizan entre pestañas usando el evento 'storage'.
// =============================================================

const STORAGE_KEY = "hospital_turnos_state";

// Tipos de turno disponibles en el sistema
const TICKET_TYPES = {
    E: { label: 'Entrega de órdenes',     emoji: '📦', color: '#3B82F6' },
    A: { label: 'Activación de citas',    emoji: '📅', color: '#10B981' },
    V: { label: 'Varios',                 emoji: '🧪', color: '#8B5CF6' },
    B: { label: 'Entrega de biopsias',    emoji: '🔬', color: '#F59E0B' }
};

// Estado por defecto del módulo
function defaultModule() {
    return {
        active: true,
        paused: false,
        currentTicket: null,
        currentTicketType: null,
        currentDocId: null,
        calledAt: null,
        isAttending: false,
        assignedAt: 0,
        callLogs: [],
        finishedTickets: [],
        allowedTypes: ['E', 'A', 'V', 'B'] // Tipos que este módulo puede atender
    };
}

// Estado por defecto del sistema
const DEFAULT_STATE = {
    // Cola única mezclada (normal + prioridad)
    queue: [],
    highQueue: [],

    // Estado de cada módulo (1–6)
    modules: {
        1: defaultModule(),
        2: defaultModule(),
        3: defaultModule(),
        4: defaultModule(),
        5: defaultModule(),
        6: defaultModule()
    },

    // Contadores de tickets por tipo: cada uno va de 1 a 999
    ticketCounter: { E: 1, A: 1, V: 1, B: 1 },

    // Historial de los últimos 10 turnos llamados (para el display)
    callHistory: [],

    // Preferencias del sistema
    settings: {
        notificationMode: 'voice' // 'sound' o 'voice'
    },

    // Timestamp del último cambio
    lastUpdated: 0,
};

// -----------------------------------------------------------------
// getState: Lee y devuelve el estado actual desde localStorage.
// Si no existe, retorna el estado por defecto.
// -----------------------------------------------------------------
function getState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));

        const parsed = JSON.parse(raw);

        // Asegurar que los 6 módulos existen y tienen todas las propiedades
        for (let i = 1; i <= 6; i++) {
            if (!parsed.modules[i]) {
                parsed.modules[i] = defaultModule();
            } else {
                // Compatibilidad: agregar allowedTypes si no existe
                if (!parsed.modules[i].allowedTypes) {
                    parsed.modules[i].allowedTypes = ['E', 'A', 'V', 'B'];
                }
                // Compatibilidad: agregar currentTicketType si no existe
                if (parsed.modules[i].currentTicketType === undefined) {
                    parsed.modules[i].currentTicketType = null;
                }
            }
        }

        // Compatibilidad: convertir ticketCounter antiguo (letter+number) al nuevo formato
        if (parsed.ticketCounter && parsed.ticketCounter.letter !== undefined) {
            parsed.ticketCounter = { E: 1, A: 1, V: 1, B: 1 };
        }
        // Asegurar que existen todos los tipos en el contador
        if (!parsed.ticketCounter || typeof parsed.ticketCounter !== 'object') {
            parsed.ticketCounter = { E: 1, A: 1, V: 1, B: 1 };
        }
        ['E', 'A', 'V', 'B'].forEach(t => {
            if (typeof parsed.ticketCounter[t] !== 'number') {
                parsed.ticketCounter[t] = 1;
            }
        });

        return parsed;
    } catch (e) {
        console.error("Error leyendo estado:", e);
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
}

// -----------------------------------------------------------------
// setState: Guarda el estado en localStorage y marca timestamp.
// -----------------------------------------------------------------
function setState(newState) {
    try {
        newState.lastUpdated = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (e) {
        console.error("Error guardando estado:", e);
    }
}

// -----------------------------------------------------------------
// resetState: Reinicia todo el sistema de turnos al estado inicial.
// Conserva la configuración de módulos (active, allowedTypes).
// -----------------------------------------------------------------
function resetState() {
    const current = getState();
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));

    // Conservar configuración de cada módulo
    for (let i = 1; i <= 6; i++) {
        if (current.modules[i]) {
            fresh.modules[i].active = current.modules[i].active;
            fresh.modules[i].allowedTypes = current.modules[i].allowedTypes || ['E', 'A', 'V', 'B'];
        }
        // Limpiar turno en curso y pausa
        fresh.modules[i].paused = false;
        fresh.modules[i].currentTicket = null;
        fresh.modules[i].currentTicketType = null;
        fresh.modules[i].currentDocId = null;
        fresh.modules[i].calledAt = null;
        fresh.modules[i].isAttending = false;
        fresh.modules[i].assignedAt = 0;
        fresh.modules[i].callLogs = [];
        fresh.modules[i].finishedTickets = [];
    }

    // Conservar configuraciones globales
    fresh.settings = current.settings || DEFAULT_STATE.settings;

    setState(fresh);
}

// -----------------------------------------------------------------
// onStateChange: Registra un callback que se ejecuta cuando otro
// contexto (otra pestaña) cambia el estado en localStorage.
// -----------------------------------------------------------------
function onStateChange(callback) {
    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) {
            try {
                const newState = JSON.parse(event.newValue);
                callback(newState);
            } catch (e) {
                console.error("Error parseando cambio de estado:", e);
            }
        }
    });
}
