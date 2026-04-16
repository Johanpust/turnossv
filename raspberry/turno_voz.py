#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║  turno_chime.py — Servicio de ALERTA SONORA para Turnos      ║
║  Raspberry Pi — Sin TTS, sin espeak, sin dependencias extra  ║
║                                                              ║
║  ¿Qué hace?                                                  ║
║    • Consulta Supabase cada 2 segundos                       ║
║    • Detecta cuando un módulo llama un turno nuevo           ║
║    • Reproduce un chime profesional de 3 notas por el TV     ║
║    • El WAV se genera con Python puro (stdlib únicamente)    ║
║                                                              ║
║  Único requisito del sistema:                                ║
║    aplay  (incluido por defecto en Raspberry Pi OS)          ║
╚══════════════════════════════════════════════════════════════╝
"""

import time
import subprocess
import urllib.request
import urllib.error
import json
import sys
import wave
import math
import struct
import os

# ═══════════════════════════════════════════════════════════════════
#  CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════
SUPABASE_URL   = "https://hhngizubxqpfanlvzhnn.supabase.co"
SUPABASE_KEY   = "sb_publishable_g10mW7MFKDaLsQWKeNCo3g_6sTwhiEL"
POLL_INTERVAL  = 2        # segundos entre consultas a Supabase
CHIME_WAV_PATH = "/tmp/turno_chime.wav"
SAMPLE_RATE    = 44100    # Hz — nativo del HDMI, sin conversión

# ═══════════════════════════════════════════════════════════════════
#  GENERADOR DEL CHIME — Python stdlib puro, sin numpy ni scipy
#
#  Produce un chime profesional ascendente de 3 notas:
#    E5 (659 Hz)  →  G5 (784 Hz)  →  C6 (1047 Hz)
#  Con envolvente natural: ataque suave, decaimiento tipo campana.
# ═══════════════════════════════════════════════════════════════════
def _make_tone(frequency, duration, volume=0.75):
    """Genera una nota con envolvente tipo campana (ataque+decaimiento)."""
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # Ataque muy rápido (20 ms) + decaimiento exponencial tipo campana
        attack   = min(1.0, t / 0.020)
        decay    = math.exp(-4.5 * t / duration)
        envelope = attack * decay
        # Fundamental + 2° armónico suave para cuerpo más rico
        s  = math.sin(2 * math.pi * frequency * t)
        s += 0.20 * math.sin(2 * math.pi * frequency * 2 * t)
        s += 0.08 * math.sin(2 * math.pi * frequency * 3 * t)
        samples.append(envelope * volume * s / 1.28)  # normalizar
    return samples


def _make_silence(duration):
    return [0.0] * int(SAMPLE_RATE * duration)


def generate_chime_wav(path=CHIME_WAV_PATH):
    """Crea el WAV del chime. Solo se llama una vez al iniciar."""
    # Tres notas musicales ascendentes
    note1 = _make_tone(659.25, 0.75, 0.72)   # E5 — primera llamada
    note2 = _make_tone(783.99, 0.75, 0.68)   # G5 — segunda llamada
    note3 = _make_tone(1046.50, 1.10, 0.80)  # C6 — nota final (más larga)

    gap = _make_silence(0.12)  # pausa breve entre notas

    all_samples = note1 + gap + note2 + gap + note3

    with wave.open(path, 'w') as wav:
        wav.setnchannels(1)   # mono
        wav.setsampwidth(2)   # 16-bit
        wav.setframerate(SAMPLE_RATE)
        for s in all_samples:
            clamped = max(-1.0, min(1.0, s))
            wav.writeframes(struct.pack('<h', int(clamped * 32767)))

    print(f"  ✅ Chime generado: {path}")
    return path


# ═══════════════════════════════════════════════════════════════════
#  REPRODUCCIÓN — aplay nativo, sin conversión de sample rate
# ═══════════════════════════════════════════════════════════════════
def play_chime():
    """Reproduce el chime por los altavoces del sistema."""
    try:
        subprocess.Popen(
            ['aplay', '-q', CHIME_WAV_PATH],
            stderr=subprocess.DEVNULL
        )
        print("  🔔 Chime reproducido")
    except FileNotFoundError:
        print("  ❌ 'aplay' no encontrado. En Raspberry Pi OS ya viene incluido.")
        print("     Si falta: sudo apt install -y alsa-utils")
    except Exception as e:
        print(f"  ❌ Error al reproducir: {e}")


# ═══════════════════════════════════════════════════════════════════
#  CONSULTA A SUPABASE
# ═══════════════════════════════════════════════════════════════════
last_called_at = {str(i): 0 for i in range(1, 7)}


def get_state():
    url = f"{SUPABASE_URL}/rest/v1/app_state?select=state&id=eq.singleton"
    req = urllib.request.Request(url, headers={
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json'
    })
    with urllib.request.urlopen(req, timeout=5) as resp:
        rows = json.loads(resp.read())
        if rows:
            return rows[0].get('state', {})
    return {}


# ═══════════════════════════════════════════════════════════════════
#  DETECCIÓN DE NUEVOS LLAMADOS
# ═══════════════════════════════════════════════════════════════════
def check_calls(state):
    global last_called_at
    modules = state.get('modules', {})

    for mod_id, mod in modules.items():
        called_at = mod.get('calledAt') or 0
        ticket    = mod.get('currentTicket') or ''

        if called_at > last_called_at.get(str(mod_id), 0) and ticket:
            last_called_at[str(mod_id)] = called_at
            print(f"  📋 Turno llamado: {ticket} — Módulo {mod_id}")
            play_chime()


# ═══════════════════════════════════════════════════════════════════
#  INICIALIZACIÓN
# ═══════════════════════════════════════════════════════════════════
def initialize():
    global last_called_at
    print("─" * 60)
    print("  🔔 Sistema de Alerta Sonora de Turnos — Raspberry Pi")
    print("─" * 60)

    # Generar el WAV del chime al arrancar
    generate_chime_wav()

    print(f"  Supabase : {SUPABASE_URL}")
    print(f"  Intervalo: {POLL_INTERVAL}s  |  Audio: chime 3 notas (E5-G5-C6)")
    print("─" * 60)
    print("  🔄 Conectando con Supabase...")

    try:
        state   = get_state()
        modules = state.get('modules', {})
        for mod_id, mod in modules.items():
            last_called_at[str(mod_id)] = mod.get('calledAt') or 0

        print(f"  ✅ Listo. Monitoreando {len(modules)} módulos.")
        print("  ℹ️  Presiona Ctrl+C para detener.\n")

        # Chime de prueba al arrancar para confirmar que el audio funciona
        play_chime()

    except urllib.error.URLError as e:
        print(f"  ⚠️  Sin red al iniciar: {e}. Reintentando en el loop...")
    except Exception as e:
        print(f"  ⚠️  Error al inicializar: {e}")


# ═══════════════════════════════════════════════════════════════════
#  LOOP PRINCIPAL
# ═══════════════════════════════════════════════════════════════════
def main():
    initialize()
    consecutive_errors = 0

    while True:
        try:
            state = get_state()
            check_calls(state)
            consecutive_errors = 0

        except urllib.error.URLError as e:
            consecutive_errors += 1
            if consecutive_errors <= 3 or consecutive_errors % 10 == 0:
                print(f"  ⚠️  Sin red ({consecutive_errors}x): {e}")

        except KeyboardInterrupt:
            print("\n  🛑 Sistema de alerta detenido.")
            sys.exit(0)

        except Exception as e:
            print(f"  ⚠️  Error inesperado: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
