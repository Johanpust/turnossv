// =============================================================
// login.js — Lógica de la página de login (index.html)
// Maneja el formulario de autenticación y redirección por rol.
// =============================================================

// Si el usuario ya tiene sesión activa, redirigir directamente
redirectIfLoggedIn();

// Referencias a elementos del DOM
const form = document.getElementById('login-form');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const errorEl = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

// -----------------------------------------------------------------
// Mostrar mensaje de error en el formulario
// -----------------------------------------------------------------
function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
    // Agitar la tarjeta para feedback visual
    loginBtn.parentElement.style.animation = 'none';
}

// -----------------------------------------------------------------
// Ocultar mensaje de error
// -----------------------------------------------------------------
function clearError() {
    errorEl.classList.remove('visible');
}

// -----------------------------------------------------------------
// Listener del formulario: intento de login
// -----------------------------------------------------------------
form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    // Validar campos vacíos
    if (!username || !password) {
        showError('Por favor, ingresa usuario y contraseña.');
        return;
    }

    // Deshabilitar botón mientras se procesa
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verificando...';

    // Pequeña demora para efecto de procesamiento
    setTimeout(() => {
        const result = login(username, password);

        if (result.success) {
            // Login exitoso: redirigir a la vista del rol
            loginBtn.textContent = '✅ Accediendo...';
            setTimeout(() => {
                window.location.href = result.redirect;
            }, 400);
        } else {
            // Login fallido: mostrar error y rehabilitar
            showError(result.message);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Iniciar Sesión';
            passwordEl.value = '';
            passwordEl.focus();
        }
    }, 300);
});

// Limpiar error al escribir en cualquier campo
usernameEl.addEventListener('input', clearError);
passwordEl.addEventListener('input', clearError);

// Enfocar automáticamente el campo de usuario al cargar
usernameEl.focus();
