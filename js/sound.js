// =============================================================
// sound.js — Generación de sonido de campanilla y voz TTS
// Usa la Web Audio API para el sonido de campana y la
// SpeechSynthesis API para anunciar turnos por voz.
//
// IMPORTANTE (Raspberry Pi): Para que la voz funcione instalar:
//   sudo apt install -y espeak-ng
// =============================================================

// -----------------------------------------------------------------
// playBell: Reproduce un sonido de campanilla usando osciladores.
// Crea un sonido que imita una campana con fundido (fade-out).
// -----------------------------------------------------------------
function playBell() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn('Web Audio API no disponible en este navegador.');
            return;
        }
        const ctx = new AudioContext();
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
// createBellTone: Crea un tono individual de la campanilla.
// ctx: AudioContext | frequency: Hz | startDelay: seg | gainValue: 0-1
// -----------------------------------------------------------------
function createBellTone(ctx, frequency, startDelay, gainValue) {
    const oscillator = ctx.createOscillator();
    const gainNode   = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);
    oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.5,
        ctx.currentTime + startDelay + 1.5
    );

    gainNode.gain.setValueAtTime(gainValue, ctx.currentTime + startDelay);
    gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + startDelay + 1.5
    );

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(ctx.currentTime + startDelay);
    oscillator.stop(ctx.currentTime + startDelay + 1.5);
}

// =============================================================
// SISTEMA DE VOZ TTS
// =============================================================

// -----------------------------------------------------------------
// preloadVoices: Pre-carga las voces TTS lo antes posible.
// En Chrome/Chromium las voces se cargan de forma ASÍNCRONA,
// por lo que hay que escuchar el evento onvoiceschanged.
// -----------------------------------------------------------------
let _voicesReady = false;

function preloadVoices() {
    if (!window.speechSynthesis) return;

    function checkVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && !_voicesReady) {
            _voicesReady = true;
            const esVoices = voices.filter(v => v.lang.startsWith('es'));
            console.log(`✅ Voces TTS listas: ${voices.length} total, ${esVoices.length} en español.`);
            if (esVoices.length > 0) {
                console.log('Voces ES disponibles:', esVoices.map(v => `${v.name} (${v.lang})`).join(', '));
            } else {
                console.warn('⚠️ No hay voces en español. En Raspberry Pi ejecuta: sudo apt install -y espeak-ng');
            }
        }
    }

    // Intento inmediato (algunos navegadores las tienen ya)
    checkVoices();

    // Escuchar el evento asíncrono de Chrome/Chromium
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.addEventListener('voiceschanged', checkVoices);
    }
}

// Pre-cargar voces tan pronto como cargue el script
preloadVoices();

// -----------------------------------------------------------------
// getAvailableVoices: Obtiene las voces de forma segura.
// Si aún no están listas, espera el evento onvoiceschanged.
// Llama a callback(voices) cuando estén disponibles.
// -----------------------------------------------------------------
function getAvailableVoices(callback) {
    // Intento inmediato
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        callback(voices);
        return;
    }

    // Las voces no están listas todavía — esperar con timeout
    let resolved = false;

    function onChanged() {
        if (resolved) return;
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
        callback(window.speechSynthesis.getVoices());
    }

    window.speechSynthesis.addEventListener('voiceschanged', onChanged);

    // Timeout de seguridad a 3 segundos
    setTimeout(() => {
        if (!resolved) {
            resolved = true;
            window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
            const finalVoices = window.speechSynthesis.getVoices();
            if (finalVoices.length === 0) {
                console.warn('⚠️ Tiempo agotado esperando voces TTS.');
                console.warn('   Raspberry Pi: sudo apt install -y espeak-ng');
            }
            callback(finalVoices);
        }
    }, 3000);
}

// -----------------------------------------------------------------
// announceTicket: Anuncia el turno por voz (SpeechSynthesis API).
// ticket: código del turno (ej: "A05")
// moduleId: número del módulo (ej: 3)
// fallbackCallback: función a llamar si la voz falla (campanilla)
// -----------------------------------------------------------------
function announceTicket(ticket, moduleId, fallbackCallback) {
    if (!window.speechSynthesis) {
        console.warn('SpeechSynthesis API no soportada. Usando campanilla.');
        if (fallbackCallback) fallbackCallback();
        return;
    }

    // Cancelar cualquier anuncio previo para evitar que se amontonen
    window.speechSynthesis.cancel();

    // Esperar a que las voces estén listas (fix del bug asíncrono de Chrome)
    getAvailableVoices((voices) => {
        if (!voices || voices.length === 0) {
            console.warn('⚠️ Sin voces TTS disponibles — activando campanilla como respaldo.');
            if (fallbackCallback) fallbackCallback();
            return;
        }

        // Construir el texto del anuncio
        const letter  = ticket.charAt(0);
        const number  = ticket.slice(1);
        const message = `Turno ${letter} ${number}. Módulo ${moduleId}.`;

        const utterance  = new SpeechSynthesisUtterance(message);
        utterance.lang   = 'es-ES';
        utterance.rate   = 0.85;
        utterance.pitch  = 1.0;
        utterance.volume = 1.0;

        // Seleccionar la mejor voz en español disponible
        const esVoices = voices.filter(v => v.lang.startsWith('es'));
        if (esVoices.length > 0) {
            const bestVoice = esVoices.find(v =>
                v.name.includes('Premium') ||
                v.name.includes('Google')  ||
                v.name.includes('Microsoft')
            ) || esVoices[0];
            utterance.voice = bestVoice;
            console.log(`🗣️ Anunciando con voz: ${bestVoice.name} (${bestVoice.lang})`);
        } else {
            // Ninguna en español — usar la primera disponible (puede ser inglés/espeak)
            utterance.voice = voices[0];
            console.warn(`⚠️ Sin voz ES. Usando: ${voices[0].name} — instala espeak-ng para español`);
        }

        let speechStarted = false;

        utterance.onstart = () => {
            speechStarted = true;
            console.log(`🔊 Anunciando: "${message}"`);
        };

        utterance.onend = () => {
            console.log('✅ Anuncio completado.');
        };

        utterance.onerror = (e) => {
            console.warn('❌ Error TTS:', e.error);
            if (fallbackCallback) fallbackCallback();
        };

        window.speechSynthesis.speak(utterance);

        // Timeout de seguridad: si la voz no arrancó en 2s, tocar la campanilla
        setTimeout(() => {
            if (!speechStarted && !window.speechSynthesis.speaking) {
                console.warn('⏱️ La voz no emitió sonido. Activando campanilla.');
                window.speechSynthesis.cancel();
                if (fallbackCallback) fallbackCallback();
            }
        }, 2000);
    });
}
