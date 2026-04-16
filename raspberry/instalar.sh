#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  instalar.sh — Instala el servicio de voz en el Raspberry Pi
#  Ejecutar con: bash instalar.sh
# ══════════════════════════════════════════════════════════════════

set -e  # Detener si algún comando falla

echo ""
echo "══════════════════════════════════════════════"
echo "  🔔 Instalando Servicio de Voz de Turnos"
echo "══════════════════════════════════════════════"

# 1. Instalar espeak-ng (motor de voz)
echo ""
echo "📦 Instalando espeak-ng..."
sudo apt update -qq
sudo apt install -y espeak-ng

echo "✅ espeak-ng instalado."

# 2. Verificar que el audio funciona
echo ""
echo "🔊 Probando audio (deberías escuchar un mensaje de prueba)..."
espeak-ng "Prueba de audio. Sistema de turnos." -v es || echo "⚠️  Prueba de audio falló — verifica la salida de audio"

# 3. Copiar el script al directorio home
echo ""
echo "📁 Copiando turno_voz.py..."
cp turno_voz.py /home/pi/turno_voz.py
chmod +x /home/pi/turno_voz.py
echo "✅ Script copiado a /home/pi/turno_voz.py"

# 4. Instalar y activar el servicio systemd
echo ""
echo "⚙️  Instalando servicio systemd..."
sudo cp turno_voz.service /etc/systemd/system/turno_voz.service
sudo systemctl daemon-reload
sudo systemctl enable turno_voz.service
sudo systemctl start turno_voz.service

echo ""
echo "══════════════════════════════════════════════"
echo "  ✅ Instalación completada exitosamente"
echo "══════════════════════════════════════════════"
echo ""
echo "  Comandos útiles:"
echo "  • Ver logs en vivo  : sudo journalctl -u turno_voz -f"
echo "  • Ver estado        : sudo systemctl status turno_voz"
echo "  • Detener           : sudo systemctl stop turno_voz"
echo "  • Reiniciar         : sudo systemctl restart turno_voz"
echo ""
