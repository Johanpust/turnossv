// =============================================================
// auth.js — Autenticación y gestión de sesiones
// Credenciales hardcodeadas. La sesión se guarda en
// sessionStorage para que cada pestaña sea independiente.
// =============================================================

// Clave de sesión en sessionStorage
const SESSION_KEY = 'hospital_session';

// -----------------------------------------------------------------
// Usuarios del sistema con sus credenciales y rol asignado.
// Para módulos, incluye el número de módulo que controlan.
// -----------------------------------------------------------------
const USERS = {
    admin: {
        password: 'admin123',
        role: 'admin',
        redirect: 'admin.html',
        displayName: 'Administrador'
    },
    recepcion: {
        password: 'recep123',
        role: 'recepcion',
        redirect: 'recepcion.html',
        displayName: 'Recepción'
    },
    modulo1: {
        password: 'mod1pass',
        role: 'modulo',
        moduleId: 1,
        redirect: 'modulo.html?mod=1',
        displayName: 'Módulo 1'
    },
    modulo2: {
        password: 'mod2pass',
        role: 'modulo',
        moduleId: 2,
        redirect: 'modulo.html?mod=2',
        displayName: 'Módulo 2'
    },
    modulo3: {
        password: 'mod3pass',
        role: 'modulo',
        moduleId: 3,
        redirect: 'modulo.html?mod=3',
        displayName: 'Módulo 3'
    },
    modulo4: {
        password: 'mod4pass',
        role: 'modulo',
        moduleId: 4,
        redirect: 'modulo.html?mod=4',
        displayName: 'Módulo 4'
    },
    modulo5: {
        password: 'mod5pass',
        role: 'modulo',
        moduleId: 5,
        redirect: 'modulo.html?mod=5',
        displayName: 'Módulo 5'
    },
    modulo6: {
        password: 'mod6pass',
        role: 'modulo',
        moduleId: 6,
        redirect: 'modulo.html?mod=6',
        displayName: 'Módulo 6'
    },
    modulo7: {
        password: 'mod7pass',
        role: 'modulo',
        moduleId: 7,
        redirect: 'modulo.html?mod=7',
        displayName: 'Autogestión'
    }
};

// -----------------------------------------------------------------
// login: Verifica credenciales y guarda la sesión si son correctas.
// Retorna { success, message, user } 
// -----------------------------------------------------------------
function login(username, password) {
    const user = USERS[username.trim().toLowerCase()];

    if (!user) {
        return { success: false, message: 'Usuario no encontrado.' };
    }

    if (user.password !== password) {
        return { success: false, message: 'Contraseña incorrecta.' };
    }

    // Guardar sesión en sessionStorage (solo dura la pestaña)
    const session = {
        username: username.trim().toLowerCase(),
        role: user.role,
        moduleId: user.moduleId || null,
        displayName: user.displayName
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

    return { success: true, user, redirect: user.redirect };
}

// -----------------------------------------------------------------
// getSession: Obtiene la sesión actual del usuario.
// Retorna el objeto de sesión o null si no hay sesión activa.
// -----------------------------------------------------------------
function getSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// -----------------------------------------------------------------
// logout: Cierra la sesión y redirige al login.
// -----------------------------------------------------------------
function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
}

// -----------------------------------------------------------------
// requireRole: Protege una página verificando el rol del usuario.
// Si no hay sesión o el rol no coincide, redirige al login.
// roles puede ser un string o un array de strings.
// -----------------------------------------------------------------
function requireRole(roles) {
    const session = getSession();
    const allowed = Array.isArray(roles) ? roles : [roles];

    if (!session || !allowed.includes(session.role)) {
        window.location.href = 'index.html';
        return null;
    }

    return session;
}

// -----------------------------------------------------------------
// redirectIfLoggedIn: Si el usuario ya tiene sesión, lo redirige
// a su pantalla correspondiente (evita volver al login).
// -----------------------------------------------------------------
function redirectIfLoggedIn() {
    const session = getSession();
    if (!session) return;

    const user = USERS[session.username];
    if (user) {
        window.location.href = user.redirect;
    }
}
