# Bienvenida (onboarding) — Requirements

Estado: en progreso.

## Contexto

La primera vez que se abre Logday Desktop (sin carpeta configurada, `!isConfigured`), se muestra `src/pages/Onboarding.tsx`. Es una sola pantalla: el logo, una lista fija de 8 funciones en español y el botón "Elegir carpeta de trabajo". Tiene varios problemas:

- **El aviso de iCloud nunca se ve.** `setupBasePath` pone `isConfigured: true` al elegir la carpeta, `App.tsx` desmonta el onboarding y el aviso queda como código muerto.
- **Promete lo que no hay.** Dice "Búsqueda global en todos tus archivos", pero Buscar encuentra tareas y dailys (más las secciones), no las notas.
- **No explica lo nuevo:** Inicio, el menú de secciones (Barra de íconos o Lista), ⌘0…⌘9, Sync con logday-server ni las extensiones.
- **No tiene i18n.**

Jorge pidió el 31 oct 2026 ampliarlo para que un usuario nuevo entienda cómo funciona la app, con animaciones guía, y que se pueda elegir la vista. El agente de diseño (`logday-design`) propuso el flujo de abajo y Jorge lo aprobó tal cual.

## Requisitos (EARS)

### Flujo

- OB1. La bienvenida DEBERÁ tener 5 pasos:
  1. bienvenida e idioma;
  2. carpeta de trabajo;
  3. apariencia (tema y estilo del menú);
  4. cómo funciona (recorrido);
  5. todo listo (pantalla de inicio).

  Lleva un indicador de progreso ("Paso n de 5") y los botones Atrás (pasos 2 a 5) y Continuar.
- OB2. La carpeta es obligatoria: Continuar queda deshabilitado en el paso 2 hasta elegirla. Desde el paso 3, "Omitir y abrir Logday" termina con los valores elegidos hasta ese momento o los de por defecto. En el paso 4, "Omitir recorrido" lleva al paso 5.
- OB3. Elegir la carpeta NO DEBERÁ terminar la bienvenida. La app solo se abre (`isConfigured: true`) al pulsar "Abrir Logday" o "Omitir y abrir Logday". En ese momento se crean las carpetas, se guarda la config y se cargan los datos.
- OB4. El avance a medias no se guarda. SI se cierra la app antes de terminar, la bienvenida empieza otra vez; el tema y el idioma, que ya se guardan aparte, se conservan.

### Paso 1. Bienvenida e idioma

- OB5. El idioma (español o inglés) se elige con un grupo de radios y cambia la pantalla al momento. SI no hay idioma guardado, se preelige el del sistema (`navigator.language` que empieza con `es` → español; si no, inglés).

### Paso 2. Carpeta

- OB6. Se elige la carpeta con el diálogo del sistema; cancelar no cambia nada. La ruta elegida se muestra, se puede cambiar y se anuncia a los lectores de pantalla.
- OB7. SI la carpeta está en iCloud Drive, se DEBERÁ mostrar el aviso (que puede congelarse mientras iCloud sincroniza) con "Elegir otra carpeta". Es solo un aviso: se puede seguir con esa carpeta.
- OB8. SI la carpeta ya tiene datos de Logday (`projects`, `notes` o `dailys`), se DEBERÁ avisar que se usarán tal cual.
- OB9. SI no se pueden crear las carpetas al terminar, se muestra el error y se puede reintentar o volver a elegir otra.

### Paso 3. Apariencia

- OB10. El tema se elige con los mismos tiles de Opciones (sin el tema personalizado) y se aplica al momento.
- OB11. El estilo del menú se elige con el mismo selector de Opciones → Navegación (`SidebarStylePicker`, PR logday#44), con sus miniaturas animadas.

### Paso 4. Cómo funciona

- OB12. El recorrido DEBERÁ tener 5 escenas, cada una con una miniatura animada y 2 a 4 líneas de texto:
  1. Tu día (Inicio, Dailys y Horas extra);
  2. Tareas;
  3. Notas;
  4. Muévete rápido (Buscar, ⌘0…⌘9, clic derecho y "Más");
  5. Tus datos (archivos .md locales, y Sync, Git y extensiones opcionales).
- OB13. Las miniaturas DEBERÁN:
  - dibujarse en HTML y CSS con los tokens del tema, sin GIF ni video;
  - mostrar el menú con el estilo elegido en el paso 3;
  - animarse una vez, en unos 4 s, al aparecer, con un botón "Ver la animación de nuevo";
  - CON `prefers-reduced-motion: reduce` o `.no-animations`, quedarse en el fotograma final y ocultar el botón.

  La información está en el texto: la miniatura es decorativa.
- OB14. Los atajos del texto DEBERÁN salir de la config (las letras configuradas en `shortcuts`, ⌘ o Ctrl según el sistema, y los dígitos según el orden del menú), no escribirse a mano.
- OB15. El recorrido se PODRÁ volver a ver desde Opciones → Acerca de → "Ver el recorrido", en un modal con las mismas 5 escenas (sin carpeta ni apariencia).

### Paso 5. Todo listo

- OB16. Se elige la pantalla de inicio entre Inicio (por defecto), Dailys, Tareas, Notas y Horas extra, y se muestra dónde quedan los datos. "Abrir Logday" termina, y la app abre en esa sección.

### Accesibilidad y textos

- OB17. Al cambiar de paso, el foco DEBERÁ ir al título del paso; en el paso 4, al título de la escena. Todo se puede hacer con teclado; los grupos de opciones son radios nativos. El cambio de paso se anima solo si las animaciones están permitidas.
- OB18. Textos en español y en inglés, sin voseo. Ninguna función prometida que no exista.

## Fuera de alcance

- Un tour sobre la app real (spotlight). Se descartó porque en el primer inicio la app está vacía y porque se rompería con cada cambio del menú.
- Estados vacíos que enseñen (por ejemplo "Crea tu primera tarea con ⌘T"): podría venir después, aparte.
- Conectar Sync dentro de la bienvenida: el recorrido indica dónde hacerlo.

## Decisiones (31 oct 2026)

Jorge aprobó la propuesta del agente de diseño:

- la pantalla de inicio se elige al final, después del recorrido;
- el idioma se preelige según el sistema;
- se avisa si la carpeta ya tiene datos;
- el recorrido se puede volver a ver desde Acerca de;
- va en dos PR: (a) el flujo, la carpeta y el arreglo de iCloud; (b) las escenas animadas y "Ver el recorrido".
