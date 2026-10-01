# DrumMetrics Kanban - Roadmap & Backlog

## 🐛 Bugs & UX Micro-interacciones
- [ ] **Animación de Cierre (Ripple Inverso):** Ajustar los keyframes `ripple-wave-reverse` y el temporizador en `cerrarTarjeta`. Actualmente, al deseleccionar una tarjeta, se ve como un parpadeo abrupto. Se requiere un fade-out más orgánico hacia el centro.
- [ ] **Bug de Doble Clic en Selección:** Si la Tarjeta A está abierta y el usuario hace clic en la Tarjeta B, la lógica cierra la A pero no abre la B. Corregir la propagación de eventos para permitir el "switch" directo en un solo clic.
- [ ] **Fix Visual (Título de Tareas Bloqueadas):** El título vuelve a gris al quitar el mouse, incluso si la tarjeta está expandida. Vincular la clase de texto blanco a `isCardExpanded` o `isClicked`, no solo al hover.

## 🎨 UI & Features Kanban
- [ ] **Botones Visuales Undo/Redo:** Agregar botones gráficos (iconos de flechas) en el `<header>`, junto al botón "+ NEW TASK".
- [ ] **Módulos (Restauración y Filtro):** 
  - Renderizar visualmente a qué módulo pertenece la tarea (ej. "Free Practice") dentro de la tarjeta.
  - Agregar un `FiltroMultiple` extra para "Modules" en el header, populado dinámicamente según los módulos existentes en la base de datos.
- [ ] **Focused Dependencies View (Vista de Dependencias):**
  - *Por defecto:* Al seleccionar una tarea bloqueada, las tarjetas no relacionadas simplemente reducen su opacidad (dimming) para no generar ruido, pero mantienen su tamaño.
  - *Acción explícita:* Agregar un botón sutil dentro de la tarjeta expandida (ej. un ícono con el texto "Collapse unrelated") para colapsar físicamente el resto del tablero solo cuando el usuario lo solicite.

## 👤 Identidad (Auth-Lite)
- [ ] **Selector de Usuario Activo:** Implementar un selector rápido en el header (tipo POS) para elegir al usuario activo: "[Alén] / [John]". Guardar en `localStorage` para automatizar la autoría en logs y comentarios sin requerir un sistema de login complejo.

## 💬 Comunicación (Requiere Backend/DB)
- [ ] **Comentarios por Tarea (Task Threads):**
  - DB: Agregar columna `comentarios` (JSONB) o tabla relacional `tarea_comentarios`.
  - UI: Sección de chat dentro del modal de edición.
  - UX: Agregar un indicador visual (ej. un punto neón) en la tarjeta si hay comentarios no leídos.
- [ ] **Global Project Log:**
  - DB: Crear tabla `project_logs` (id, autor, mensaje, fecha, tipo).
  - UI: Un panel lateral desplegable (Right Sidebar) accesible desde un botón fijo para registrar avances generales.

## 🤖 Integraciones Automáticas
- [ ] **GitHub Webhooks:**
  - Sincronizar el repo principal de DrumMetrics (la app, no el Kanban) con este tablero.
  - Crear una Edge Function (Supabase) o Route Handler (Next.js) que escuche los eventos `push` de GitHub.
  - Extraer el mensaje del commit y el autor, y publicarlo automáticamente en el "Global Project Log" con un ícono de GitHub.