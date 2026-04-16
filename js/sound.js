// =============================================================
// sound.js — Alerta sonora profesional para Sistema de Turnos
//
// Chime de 3 notas ascendentes (E5 → G5 → C6) con envolvente
// natural tipo campana. Sin TTS, sin archivos externos.
// Compatible con Web Audio API en Chromium/Raspberry Pi.
// =============================================================

// -----------------------------------------------------------------
// playBell: Chime profesional de 3 notas — E5, G5, C6
// Sonido tipo hospital/clínica: suave, claro y no invasivo.
// -----------------------------------------------------------------
function playBell() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn('Web Audio API no disponible en este navegador.');
            return;
        }

        const ctx = new AudioContext();

        // Chime ascendente: E5 → G5 → C6
        // Parámetros: (ctx, frecuencia, inicio_seg, volumen, duracion_seg)
        playChimeTone(ctx, 659.25, 0.00, 0.72, 0.75);   // E5 — primera nota
        playChimeTone(ctx, 783.99, 0.55, 0.68, 0.75);   // G5 — segunda nota
        playChimeTone(ctx, 1046.5, 1.10, 0.80, 1.10);   // C6 — nota final

    } catch (e) {
        console.error('Error al reproducir chime:', e);
    }
}

// -----------------------------------------------------------------
// playChimeTone: Genera una nota individual del chime.
// Usa onda sinusoidal + armónicos suaves para cuerpo más rico.
// Envolvente: ataque rápido (20ms) + decaimiento exponencial.
// -----------------------------------------------------------------
function playChimeTone(ctx, frequency, startDelay, gain, duration) {
    // — Fundamental —
    const osc1     = ctx.createOscillator();
    const gain1    = ctx.createGain();
    osc1.type      = 'sine';
    osc1.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);

    // — 2° armónico (octava) — suave, da cuerpo al sonido —
    const osc2     = ctx.createOscillator();
    const gain2    = ctx.createGain();
    osc2.type      = 'sine';
    osc2.frequency.setValueAtTime(frequency * 2, ctx.currentTime + startDelay);

    // — 3° armónico — muy suave, solo textura —
    const osc3     = ctx.createOscillator();
    const gain3    = ctx.createGain();
    osc3.type      = 'sine';
    osc3.frequency.setValueAtTime(frequency * 3, ctx.currentTime + startDelay);

    // Mezclador de armónicos
    const mixer    = ctx.createGain();
    gain1.gain.setValueAtTime(gain,        ctx.currentTime);
    gain2.gain.setValueAtTime(gain * 0.20, ctx.currentTime);
    gain3.gain.setValueAtTime(gain * 0.08, ctx.currentTime);

    // Envolvente maestra: ataque rápido (20ms) + decaimiento tipo campana
    const now = ctx.currentTime + startDelay;
    mixer.gain.setValueAtTime(0.001, now);
    mixer.gain.linearRampToValueAtTime(1.0, now + 0.020);          // ataque
    mixer.gain.exponentialRampToValueAtTime(0.001, now + duration); // decaimiento

    // Conexiones: osciladores → ganancias → mezclador → salida
    osc1.connect(gain1); gain1.connect(mixer);
    osc2.connect(gain2); gain2.connect(mixer);
    osc3.connect(gain3); gain3.connect(mixer);
    mixer.connect(ctx.destination);

    // Iniciar y detener
    [osc1, osc2, osc3].forEach(osc => {
        osc.start(now);
        osc.stop(now + duration + 0.05);
    });
}

// =============================================================
// SISTEMA DE VOZ TTS (usado solo si el modo es 'voice')
// Con fix del bug asíncrono de Chrome/Chromium
// =============================================================

let _voicesReady = false;

function preloadVoices() {
    if (!window.speechSynthesis) return;

    function checkVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && !_voicesReady) {
            _voicesReady = true;
            const esVoices = voices.filter(v => v.lang.startsWith('es'));
            console.log(`✅ Voces TTS: ${voices.length} total, ${esVoices.length} en español.`);
        }
    }

    checkVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.addEventListener('voiceschanged', checkVoices);
    }
}

preloadVoices();

function getAvailableVoices(callback) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { callback(voices); return; }

    let resolved = false;
    function onChanged() {
        if (resolved) return;
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
        callback(window.speechSynthesis.getVoices());
    }
    window.speechSynthesis.addEventListener('voiceschanged', onChanged);
    setTimeout(() => {
        if (!resolved) {
            resolved = true;
            window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
            callback(window.speechSynthesis.getVoices());
        }
    }, 3000);
}

// -----------------------------------------------------------------
// announceTicket: Anuncia el turno por voz (SpeechSynthesis API).
// Se usa solo cuando el modo de notificación es 'voice'.
// Si las voces fallan, cae al chime como respaldo.
// -----------------------------------------------------------------
function announceTicket(ticket, moduleId, fallbackCallback) {
    if (!window.speechSynthesis) {
        if (fallbackCallback) fallbackCallback();
        return;
    }

    window.speechSynthesis.cancel();

    getAvailableVoices((voices) => {
        if (!voices || voices.length === 0) {
            console.warn('⚠️ Sin voces TTS — usando chime como respaldo.');
            if (fallbackCallback) fallbackCallback();
            return;
        }

        const letter  = ticket.charAt(0);
        const number  = ticket.slice(1);
        const message = `Turno ${letter} ${number}. Módulo ${moduleId}.`;

        const utterance  = new SpeechSynthesisUtterance(message);
        utterance.lang   = 'es-ES';
        utterance.rate   = 0.85;
        utterance.pitch  = 1.0;
        utterance.volume = 1.0;

        const esVoices = voices.filter(v => v.lang.startsWith('es'));
        if (esVoices.length > 0) {
            utterance.voice = esVoices.find(v =>
                v.name.includes('Premium') ||
                v.name.includes('Google')  ||
                v.name.includes('Microsoft')
            ) || esVoices[0];
        }

        let started = false;
        utterance.onstart  = () => { started = true; };
        utterance.onerror  = () => { if (fallbackCallback) fallbackCallback(); };

        window.speechSynthesis.speak(utterance);

        setTimeout(() => {
            if (!started && !window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                if (fallbackCallback) fallbackCallback();
            }
        }, 2000);
    });
}
