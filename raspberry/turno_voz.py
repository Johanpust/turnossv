#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║  turno_voz.py — Servicio de VOZ para el Sistema de Turnos   ║
║  Raspberry Pi — Funciona con CUALQUIER versión de OS         ║
║                                                              ║
║  ¿Qué hace?                                                  ║
║    • Consulta Supabase cada 2 segundos                       ║
║    • Detecta cuando un módulo llama un turno nuevo           ║
║    • Anuncia el turno por los altavoces via espeak-ng        ║
║    • Corre independiente del navegador Chromium              ║
║                                                              ║
║  Requisito previo:                                           ║
║    sudo apt install -y espeak-ng                             ║
╚══════════════════════════════════════════════════════════════╝
"""

import time
import subprocess
import urllib.request
import urllib.error
import json
import sys

# ═══════════════════════════════════════════════════════════════════
#  CONFIGURACIÓN — ajustar si cambian las credenciales de Supabase
# ═══════════════════════════════════════════════════════════════════
SUPABASE_URL = "https://hhngizubxqpfanlvzhnn.supabase.co"
SUPABASE_KEY = "sb_publishable_g10mW7MFKDaLsQWKeNCo3g_6sTwhiEL"

POLL_INTERVAL   = 2      # segundos entre cada consulta a Supabase
ESPEAK_SPEED    = 115    # velocidad de la voz (palabras por minuto)
ESPEAK_VOLUME   = 200    # volumen 0-200
ESPEAK_PITCH    = 45     # tono de la voz 0-99
ESPEAK_VOICE    = "es"   # idioma/voz: "es" = español genérico

# ═══════════════════════════════════════════════════════════════════
#  ESTADO INTERNO — guardar el último calledAt por módulo
# ═══════════════════════════════════════════════════════════════════
last_called_at = {str(i): 0 for i in range(1, 7)}

# ═══════════════════════════════════════════════════════════════════
#  FUNCIÓN DE VOZ — llama a espeak-ng directamente
# ═══════════════════════════════════════════════════════════════════
def speak(text):
    """Anuncia el texto por los altavoces del sistema."""
    try:
        subprocess.Popen([
            'espeak-ng',
            '-v', ESPEAK_VOICE,
            '-s', str(ESPEAK_SPEED),
            '-a', str(ESPEAK_VOLUME),
            '-p', str(ESPEAK_PITCH),
            text
        ])
        print(f"  📢 Anunciando: \"{text}\"")
    except FileNotFoundError:
        print("  ❌ ERROR: espeak-ng no está instalado.")
        print("     Solución: sudo apt install -y espeak-ng")
        sys.exit(1)
    except Exception as e:
        print(f"  ❌ Error al reproducir voz: {e}")


# ═══════════════════════════════════════════════════════════════════
#  CONSULTA A SUPABASE — sin librerías externas, solo urllib
# ═══════════════════════════════════════════════════════════════════
def get_state():
    """Descarga el estado actual del sistema desde Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/app_state?select=state&id=eq.singleton"
    req = urllib.request.Request(
        url,
        headers={
            'apikey':        SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type':  'application/json'
        }
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        rows = json.loads(resp.read())
        if rows and len(rows) > 0:
            return rows[0].get('state', {})
    return {}


# ═══════════════════════════════════════════════════════════════════
#  DETECCIÓN DE NUEVOS LLAMADOS
# ═══════════════════════════════════════════════════════════════════
def check_calls(state):
    """Compara el estado actual con el anterior y anuncia si hay cambio."""
    global last_called_at
    modules = state.get('modules', {})

    for mod_id, mod in modules.items():
        called_at = mod.get('calledAt') or 0
        ticket    = mod.get('currentTicket') or ''

        # ¿Cambió el calledAt respecto a la última revisión?
        if called_at > (last_called_at.get(str(mod_id), 0)) and ticket:
            last_called_at[str(mod_id)] = called_at

            # Separar letra y número del turno (ej: "A05" → "A" y "05")
            letter = ticket[0] if ticket else ''
            number = ticket[1:].lstrip('0') if len(ticket) > 1 else '0'
            if not number:
                number = '0'

            # Leer cada dígito separado para mayor claridad
            digits_spoken = ' '.join(list(number))

            message = f"Turno {letter} {digits_spoken}. Módulo {mod_id}."
            speak(message)


# ═══════════════════════════════════════════════════════════════════
#  INICIALIZACIÓN — carga el estado actual sin anunciar nada
# ═══════════════════════════════════════════════════════════════════
def initialize():
    """Lee el estado inicial para no anunciar turnos viejos al arrancar."""
    global last_called_at
    print("─" * 60)
    print("  🔔 Sistema de Voz de Turnos — Raspberry Pi")
    print("─" * 60)
    print(f"  Supabase : {SUPABASE_URL}")
    print(f"  Intervalo: {POLL_INTERVAL}s  |  Voz: {ESPEAK_VOICE}")
    print("─" * 60)
    print("  🔄 Conectando con Supabase...")

    try:
        state   = get_state()
        modules = state.get('modules', {})

        for mod_id, mod in modules.items():
            last_called_at[str(mod_id)] = mod.get('calledAt') or 0

        print(f"  ✅ Listo. Monitoreando {len(modules)} módulos.")
        print("  ℹ️  Presiona Ctrl+C para detener.\n")

        # Anuncio de inicio para verificar que el audio funciona
        speak("Sistema de turnos activo.")

    except urllib.error.URLError as e:
        print(f"  ⚠️  Sin conexión al iniciar: {e}")
        print("      El sistema seguirá reintentando cada 2 segundos...\n")
    except Exception as e:
        print(f"  ⚠️  Error al inicializar: {e}\n")


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
            print("\n  🛑 Sistema de voz detenido.")
            sys.exit(0)

        except Exception as e:
            print(f"  ⚠️  Error inesperado: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
