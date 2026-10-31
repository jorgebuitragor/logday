# Pomodoro — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`pomodoro`, grupo Herramientas). Es un temporizador de la técnica Pomodoro: bloques de trabajo de 25 minutos separados por descansos cortos, y un descanso largo cada cuatro bloques. Sirve para trabajar por bloques sin salir de Logday y, si se quiere, ligado a una tarea.

Jorge la pidió el 30 oct 2026, de la lista de candidatas del grupo Herramientas, y decidió dos cosas:

- **Dónde se ve:** tiene su vista propia (un ícono en la fila de secciones, como DevTools) y, además, un contador pequeño siempre visible en el menú lateral y en la bandeja del sistema.
- **El daily no se toca:** al terminar un pomodoro no se anota nada en el daily. Los pomodoros del día se cuentan solo en la vista.

## Requisitos (EARS)

### Ciclo

- PM1. El temporizador DEBERÁ alternar tres fases: **trabajo** (25 min), **descanso corto** (5 min) y **descanso largo** (15 min), con el largo después de cada 4 de trabajo. Las cuatro cifras DEBERÁN poder cambiarse en las opciones: de 1 a 120 minutos, y de 2 a 10 bloques antes del descanso largo.
- PM2. Controles: iniciar, pausar, reanudar, saltar a la fase siguiente y reiniciar la fase actual. "Reiniciar el ciclo" vuelve a trabajo, con el contador de bloques en cero.
- PM3. Al terminar una fase, la siguiente DEBERÁ quedar lista. Por defecto no arranca sola, para no empezar a contar sin que el usuario lo note. Hay dos opciones, apagadas por defecto: "Empezar solos los descansos" y "Empezar solo el trabajo después del descanso".
- PM4. El tiempo DEBERÁ medirse contra la hora del reloj (un instante de fin), no contando segundos. Así sigue siendo exacto aunque la ventana esté oculta, el sistema frene el WebView o el equipo se suspenda.
  - SI al volver ya pasó el fin, la fase DEBERÁ darse por terminada una sola vez, con su aviso.

### Aviso al terminar

- PM5. Al terminar una fase, Logday DEBERÁ:
  - mostrar una notificación del sistema ("Terminó el pomodoro. Toca un descanso de 5 min" o "Terminó el descanso"), que respeta la opción global de notificaciones de la app;
  - si está activado, sonar un aviso corto. El sonido se genera, sin archivos, y va activado por defecto.
  - La notificación DEBERÁ salir aunque la ventana esté oculta en la bandeja, así que el fin lo vigila el proceso nativo (Rust), no un temporizador del WebView.

### Tarea (opcional)

- PM6. Antes o durante un bloque de trabajo se PODRÁ elegir una tarea pendiente o en curso de cualquier proyecto. La vista DEBERÁ mostrar su título y dejar abrirla. Sin tarea, el pomodoro funciona igual.
- PM7. La extensión NO DEBERÁ escribir en la tarea ni en el daily (decisión de Jorge). Los pomodoros por tarea se cuentan solo en el historial local (PM9).

### Dónde se ve

- PM8. **Vista propia** (R11): la fase, el tiempo restante grande, el progreso de la fase, los controles, la tarea elegida, los bloques hechos del ciclo (por ejemplo, 2 de 4) y el resumen de hoy.
- PM9. **Historial de hoy:** cuántos pomodoros de trabajo se completaron hoy, los minutos de foco y la lista (hora, duración y tarea, si había). Solo cuentan las fases de trabajo que llegaron al final (un salto no cuenta).
  - Se guarda localmente, en la configuración de la extensión: no se sincroniza.
  - Se conservan los últimos 14 días.
- PM10. **Contador en el menú lateral:** MIENTRAS haya una fase en curso o en pausa, el menú lateral DEBERÁ mostrar un contador pequeño con la fase y el tiempo (y un control de pausa). Va tanto expandido como colapsado y está a la vista desde cualquier sección. Al hacer clic se abre la vista.
- PM11. **Bandeja del sistema:** MIENTRAS haya una fase en curso:
  - En macOS, el ícono de la bandeja DEBERÁ mostrar el tiempo restante al lado (`18:42`, o `‖ 18:42` en pausa). En Windows va en el tooltip. En Linux, Tauri no muestra ni el título ni el tooltip, así que queda solo la entrada de estado del menú.
  - El menú de la bandeja DEBERÁ tener "Pausar", "Reanudar" o "Iniciar" según el estado, y "Saltar".
  - Al pausar, el tiempo se queda fijo. Sin fase en curso, no se muestra nada.

### Persistencia y extensión

- PM12. El estado (fase, fin o tiempo restante si está en pausa, bloques del ciclo y tarea) DEBERÁ guardarse en la configuración de la extensión. Así, al cerrar y volver a abrir Logday, el temporizador sigue donde estaba (PM4).
- PM13. Al desactivar la extensión, el temporizador DEBERÁ pararse y el contador del menú y de la bandeja, desaparecer. El historial y las opciones se conservan, como cualquier configuración (R7).
- PM14. Textos en español y en inglés, sin voseo. La extensión no envía nada fuera del equipo, así que no lleva el aviso de R6.

## Decisiones (30 oct 2026)

Son las recomendadas por el diseño (`design.md`, sección 12):

- **Contador:** sigue visible después del fin de una fase, hasta que empieza la siguiente.
- **Bandeja:**
  - ofrece "Iniciar un pomodoro" aunque no haya nada en curso;
  - el título de macOS va sin emoji y se actualiza cada segundo.
- **Fin con la app cerrada:** el bloque cuenta siempre, pero solo se avisa si terminó hace menos de 5 minutos. La fase siguiente nunca arranca sola.
- **Cambio de día:** el ciclo vuelve a cero si no hay nada en curso.
- **Tarea:**
  - si se completa o se borra a mitad de bloque, el siguiente bloque empieza sin tarea;
  - al cambiar de tarea a mitad de bloque, el bloque cuenta, en el historial local, para la que esté elegida al terminar.
- **Opciones:** van en Opciones → Extensiones. En la vista quedan un atajo a Opciones y el botón de sonido.
- **Inglés:** la fase de trabajo se llama "Focus".

## Fuera de alcance (por ahora)

- Anotar en el daily o en la tarea (decisión de Jorge).
- Sincronizar el historial entre equipos.
- Estadísticas de más de 14 días y gráficos.
- Bloquear sitios o apps durante el foco.
- Atajo de teclado global.
