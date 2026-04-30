# 🔔 Sistema de Voz — Raspberry Pi

Este servicio reemplaza la voz del navegador (que es poco confiable en Raspberry Pi) con una solución directa: un script Python que monitorea Supabase y usa `espeak-ng` para hablar por los altavoces del televisor.

---

## ¿Cómo funciona?

```
Módulo llama turno → Supabase se actualiza → Python detecta el cambio → espeak-ng habla por el TV
```

El navegador Chromium solo muestra la pantalla visual.
El audio lo maneja el Raspberry Pi completamente por su cuenta.

---

## Archivos incluidos

| Archivo | Para qué sirve |
|---|---|
| `turno_voz.py` | Script principal de voz — corre en el Pi |
| `turno_voz.service` | Servicio systemd — se inicia solo al encender |
| `instalar.sh` | Script de instalación automática |

---

## Instalación paso a paso

### Paso 1 — Copiar los archivos al Raspberry Pi

**Opción A — Descargar desde GitHub:**
```bash
# En el Raspberry Pi, abre una terminal:
cd /home/pi
git clone https://github.com/Johanpust/turnossv.git
cd turnossv/raspberry
```

**Opción B — USB:**
1. Copia la carpeta `raspberry/` a una memoria USB
2. En el Pi, cópiala a `/home/pi/`

---

### Paso 2 — Instalar todo automáticamente

```bash
cd /home/pi/turnossv/raspberry
bash instalar.sh
```

Esto hará automáticamente:
- ✅ Instalar `espeak-ng` (el motor de voz)
- ✅ Probar que el audio funciona
- ✅ Instalar el servicio para que arranque solo al encender
- ✅ Iniciar el servicio ahora mismo

---

### Paso 3 — Verificar que está funcionando

```bash
# Ver los logs en tiempo real
sudo journalctl -u turno_voz -f
```

Deberías ver algo como:
```
✅ Listo. Monitoreando 6 módulos.
📢 Anunciando: "Turno A 5. Módulo 2."
```

---

## Prueba manual rápida

Si quieres probar la voz sin esperar un turno real:

```bash
espeak-ng -v es -s 115 -a 200 "Turno A cinco. Módulo dos."
```

---

## Comandos de mantenimiento

```bash
# Ver estado del servicio
sudo systemctl status turno_voz

# Ver logs en tiempo real
sudo journalctl -u turno_voz -f

# Reiniciar el servicio
sudo systemctl restart turno_voz

# Detener el servicio
sudo systemctl stop turno_voz

# Desactivar que arranque al inicio
sudo systemctl disable turno_voz
```

---

## Si el audio no sale por el TV (HDMI)

Si `espeak-ng` habla pero el sonido sale por el conector de 3.5mm en vez del HDMI:

```bash
# Forzar salida de audio por HDMI
sudo raspi-config nonint do_audio 2

# Luego reiniciar el servicio
sudo systemctl restart turno_voz
```

---

## Arranque automático del display en Chromium

Para que Chromium también abra automáticamente al encender el Pi:

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/turnos-display.desktop
```

Pega esto dentro y guarda (`Ctrl+X` → `Y` → `Enter`):

```ini
[Desktop Entry]
Type=Application
Name=Pantalla Turnos
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --no-first-run --autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble --disable-restore-session-state https://turnossv.vercel.app/display
X-GNOME-Autostart-enabled=true
```

> ⚠️ **IMPORTANTE:** La URL es `/display` sin `.html` — Vercel elimina la extensión automáticamente.

---

## Pantalla negra al encender (HDMI sin señal)

Si el Pi enciende con la pantalla negra (solo se ve el cursor), el Raspberry Pi no está
detectando el TV por HDMI correctamente. Solución permanente:

```bash
sudo nano /boot/config.txt
```

Agrega o descomenta estas líneas al final:

```
# Forzar salida HDMI aunque no haya monitor detectado
hdmi_force_hotplug=1
hdmi_drive=2

# Si la pantalla sigue en negro, agregar también:
hdmi_group=1
hdmi_mode=16
```

Guarda (`Ctrl+X` → `Y` → `Enter`) y reinicia:

```bash
sudo reboot
```

---

## Resumen de lo que corre en el Pi al encender

| Componente | Descripción | Inicio |
|---|---|---|
| `turno_voz.service` | Voz por espeak-ng | Automático (systemd) |
| `Chromium` | Display visual en el TV | Automático (autostart) |
