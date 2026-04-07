# 🏥 Sistema de Gestión de Turnos Hospitalarios

Un sistema web moderno y ligero para la gestión de turnos en salas de espera, diseñado para operar en tiempo real sin necesidad de un servidor de base de datos complejo, utilizando `localStorage` para la sincronización entre terminales.

## 🚀 Características Principales

- **Generación de Tickets**: Interfaz para recepción que permite crear turnos Normales y de Alta Prioridad.
- **Llamado por Módulos**: Cada operador puede llamar al siguiente turno, repetir el llamado y marcar como "atendiendo".
- **Visualización Pública**: Pantalla optimizada para televisores o monitores en sala de espera, con alertas visuales (destellos amarillos) y auditivas.
- **Notificaciones Inteligentes**: Sistema de audio configurable por el administrador:
  - **🔔 Solo Sonido**: Notificación clásica mediante campanilla digital.
  - **🎙️ Llamado por Voz**: Anuncio hablado del turno y módulo (ej: "Turno A15, Módulo 1").
- **Sincronización en Tiempo Real**: Los cambios en un módulo se reflejan instantáneamente en la pantalla pública y demás terminales.
- **Historial y Búsqueda**: Registro de turnos atendidos, cronómetro de atención por paciente y búsqueda rápida por código de turno.

## 🛠️ Arquitectura Técnica

El proyecto está construido exclusivamente con tecnologías web estándar (Vanilla Stack), lo que facilita su despliegue y mantenimiento.

- **Frontend**: HTML5 Semántico, CSS3 Moderno (Gradients, Flexbox, Grid).
- **Lógica**: JavaScript (ES6+).
- **Estado**: Gestión de estado global mediante `localStorage` y eventos de escucha `storage`.
- **Audio**: Uso de **Web Audio API** para la generación de la campanilla (sin archivos externos) y **Web Speech API** para la síntesis de voz nativa.

## 📂 Estructura del Proyecto

- `index.html`: Punto de entrada y sistema de login/redirección por roles.
- `recepcion.html`: Interfaz para la generación de nuevos tickets.
- `modulo.html`: Panel de control para los operadores de los módulos (1-4).
- `display.html`: Pantalla pública para pacientes y acompañantes.
- `admin.html`: Panel administrativo para configuración y reinicio del sistema.
- `js/`: Directorio con la lógica del sistema.
  - `storage.js`: Motor de persistencia y estado global.
  - `tickets.js`: Lógica de creación y gestión de colas.
  - `auth.js`: Simulación de autenticación y manejo de sesiones.

## 📖 Instrucciones de Uso

1. **Inicio**: Abrir `index.html` en el navegador.
2. **Recepción**: Utilizar las credenciales de recepción para comenzar a emitir tickets.
3. **Módulos**: Los operadores deben ingresar con su número de módulo para recibir los turnos.
4. **Pantalla Pública**: Acceder directamente a `display.html` desde el equipo conectado al monitor de la sala.

---

Desarrollado por **Baneste Codes**
_Soluciones de desarrollo de software a medida para empresas de todos los tamaños._
