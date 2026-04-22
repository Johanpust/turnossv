// =============================================================
// storage.js — Gestión del estado global en Supabase (PostgreSQL)
// Reemplaza localStorage. Todos los módulos comparten el mismo
// estado desde la base de datos. Los cambios se sincronizan en
// tiempo real usando Realtime de Supabase (WebSockets).
// =============================================================

const SUPABASE_ROW_ID = "singleton";

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
        attendingAt: null,
        callLogs: [],
        finishedTickets: [],
        allowedTypes: ['E', 'A', 'V', 'B']
    };
}

// Estado por defecto del sistema
const DEFAULT_STATE = {
    queue: [],
    highQueue: [],
    modules: {
        1: defaultModule(),
        2: defaultModule(),
        3: defaultModule(),
        4: defaultModule(),
        5: defaultModule(),
        6: defaultModule()
    },
    ticketCounter: { E: 1, A: 1, V: 1, B: 1 },
    callHistory: [],
    settings: {
        notificationMode: 'voice'
    },
    lastResetDate: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    lastUpdated: 0,
};

// -----------------------------------------------------------------
// _sanitizeState: Asegura que el estado tiene todas las propiedades
// necesarias (compatibilidad hacia adelante).
// -----------------------------------------------------------------
function _sanitizeState(parsed) {
    if (!parsed) return JSON.parse(JSON.stringify(DEFAULT_STATE));

    for (let i = 1; i <= 6; i++) {
        if (!parsed.modules[i]) {
            parsed.modules[i] = defaultModule();
        } else {
            if (!parsed.modules[i].allowedTypes) {
                parsed.modules[i].allowedTypes = ['E', 'A', 'V', 'B'];
            }
            if (parsed.modules[i].currentTicketType === undefined) {
                parsed.modules[i].currentTicketType = null;
            }
            if (parsed.modules[i].attendingAt === undefined) {
                parsed.modules[i].attendingAt = null;
            }
        }
    }

    if (!parsed.ticketCounter || typeof parsed.ticketCounter !== 'object' || parsed.ticketCounter.letter !== undefined) {
        parsed.ticketCounter = { E: 1, A: 1, V: 1, B: 1 };
    }
    ['E', 'A', 'V', 'B'].forEach(t => {
        if (typeof parsed.ticketCounter[t] !== 'number') {
            parsed.ticketCounter[t] = 1;
        }
    });

    if (!parsed.lastResetDate) {
        parsed.lastResetDate = new Date().toISOString().slice(0, 10);
    }

    return parsed;
}

// -----------------------------------------------------------------
// getState: Lee y devuelve el estado actual desde Supabase.
// Retorna el estado por defecto si no existe o hay error.
// -----------------------------------------------------------------
function getState() {
    return supabaseClient
        .from('app_state')
        .select('state')
        .eq('id', SUPABASE_ROW_ID)
        .single()
        .then(response => {
            const data = response.data;
            const error = response.error;
            if (error || !data) {
                console.warn('getState: no hay datos, retornando estado por defecto.', error);
                return JSON.parse(JSON.stringify(DEFAULT_STATE));
            }
            return _sanitizeState(data.state);
        })
        .catch(e => {
            console.error('Error leyendo estado desde Supabase:', e);
            return JSON.parse(JSON.stringify(DEFAULT_STATE));
        });
}

// -----------------------------------------------------------------
// setState: Guarda el estado en Supabase y marca timestamp.
// -----------------------------------------------------------------
function setState(newState) {
    newState.lastUpdated = Date.now();
    return supabaseClient
        .from('app_state')
        .update({ state: newState })
        .eq('id', SUPABASE_ROW_ID)
        .then(response => {
            if (response.error) {
                console.error('Error guardando estado en Supabase:', response.error);
            }
        })
        .catch(e => {
            console.error('Error en setState:', e);
        });
}

// -----------------------------------------------------------------
// resetState: Reinicia todo el sistema de turnos al estado inicial.
// Conserva la configuración de módulos (active, allowedTypes).
// -----------------------------------------------------------------
function resetState() {
    return getState().then(current => {
        const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));

        for (let i = 1; i <= 6; i++) {
            if (current.modules[i]) {
                fresh.modules[i].active       = current.modules[i].active;
                fresh.modules[i].allowedTypes = current.modules[i].allowedTypes || ['E', 'A', 'V', 'B'];
            }
            fresh.modules[i].paused           = false;
            fresh.modules[i].currentTicket    = null;
            fresh.modules[i].currentTicketType = null;
            fresh.modules[i].currentDocId     = null;
            fresh.modules[i].calledAt         = null;
            fresh.modules[i].isAttending      = false;
            fresh.modules[i].assignedAt       = 0;
            fresh.modules[i].callLogs         = [];
            fresh.modules[i].finishedTickets  = [];
        }

        fresh.settings = current.settings || DEFAULT_STATE.settings;

        return setState(fresh);
    });
}

// -----------------------------------------------------------------
// onStateChange: Registra un callback que se ejecuta cuando
// CUALQUIER cliente actualiza el estado (tiempo real via WebSocket).
// -----------------------------------------------------------------
function onStateChange(callback) {
    supabaseClient
        .channel('app_state_changes')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'app_state',
                filter: `id=eq.${SUPABASE_ROW_ID}`
            },
            (payload) => {
                try {
                    const newState = _sanitizeState(payload.new.state);
                    callback(newState);
                } catch (e) {
                    console.error('Error procesando cambio de estado en tiempo real:', e);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('\u2705 Conectado al canal de tiempo real de Supabase');
            }
        });
}

// -----------------------------------------------------------------
// checkAndAutoReset: Comprueba si hoy es un día distinto al del
// último reinicio. Si es así, reinicia todos los turnos automáticamente.
// Llamar al cargar cada página del sistema.
// -----------------------------------------------------------------
async function checkAndAutoReset() {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const state = await getState();

    if (state.lastResetDate && state.lastResetDate === todayStr) {
        return; // Ya se reinició hoy, nada que hacer
    }

    console.log(`\uD83D\uDD04 Nuevo día detectado (${todayStr}). Reiniciando sistema automáticamente...`);
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));

    // Conservar configuración de módulos (tipos permitidos, activo)
    for (let i = 1; i <= 6; i++) {
        if (state.modules[i]) {
            fresh.modules[i].active       = state.modules[i].active;
            fresh.modules[i].allowedTypes = state.modules[i].allowedTypes || ['E', 'A', 'V', 'B'];
        }
    }

    fresh.settings       = state.settings || DEFAULT_STATE.settings;
    fresh.lastResetDate  = todayStr;

    await setState(fresh);
    console.log('\u2705 Sistema reiniciado automáticamente para el nuevo día.');
}
