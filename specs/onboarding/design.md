# Bienvenida (onboarding) — Design

Estado: en progreso.

## Arquitectura

- **Store** (`src/store/appStore.ts`): `setupBasePath` se separa en dos.
  - `pickBaseFolder(): Promise<{ path, isICloud, hasData } | null>` abre el diálogo y comprueba la carpeta (`fs.exists` sobre `projects`, `notes` o `dailys`), sin tocar `isConfigured` ni la config.
  - `completeOnboarding(path): Promise<void>` hace lo que hoy hace `setupBasePath` después de elegir: crea `projects/inbox`, `notes` y `dailys`, pone `basePath` e `isConfigured: true`, ejecuta `persistConfig` y carga los datos. Si falla, lanza el error sin cambiar `isConfigured`.

  `setupBasePath` desaparece o queda como `pickBaseFolder` + `completeOnboarding`, si algo más lo usa.
- **Lo que se elige antes de terminar:** `persistConfig` no escribe sin `basePath`, así que el estilo del menú, la pantalla de inicio y la vista se quedan en el store y se guardan en `completeOnboarding`. El tema y el idioma ya van a `localStorage`.
- **Componentes** (`src/pages/onboarding/`):
  - `Onboarding.tsx`: el estado del paso y la ruta elegida.
  - `OnboardingLayout`: progreso, título con foco y pie con Atrás, Omitir y Continuar.
  - Un archivo por paso: `StepWelcome`, `StepFolder`, `StepAppearance`, `StepTour` y `StepDone`.
- **Recorrido compartido** (`src/components/tour/`):
  - `TourScenes`: las 5 escenas, con su texto y su navegación interna;
  - `MiniFrame variant="icons" | "list"`: el marco de la miniatura con el menú en el estilo elegido;
  - una miniatura por escena;
  - `TourModal`, para Acerca de.
- **Reutiliza** `SidebarStylePicker` (Opciones → Navegación, PR logday#44) y `ThemeTile`. A los tiles se les da semántica de radio, o `aria-pressed`, lo que también arregla Opciones.
- **i18n:** sección nueva `onboarding` (y `tour` para las escenas) en `src/lib/i18n.ts`, con las mismas claves en es y en.
- **Animaciones:** clases `.obd-*` en `App.css`, junto a las `.sbp-*`. Usan solo `transform` y `opacity`, y se apagan con `prefers-reduced-motion` y `.no-animations`.

## Interfaz

Se basa en el diseño del agente `logday-design` (31 oct 2026).

### Layout común (cabe en 800×600)

```
+--------------------------------------------------------------+
|                    ● ● ○ ○ ○   Paso 2 de 5                   |
|        +------------------------------------------+          |
|        |  <h1 tabIndex=-1> título                 |          |  max-w-xl, centrado
|        |  texto de apoyo                          |          |
|        |  [ contenido del paso ]                  |          |  overflow-y-auto
|        +------------------------------------------+          |
|   [Atrás]            Omitir y abrir Logday       [Continuar] |  pie fijo
+--------------------------------------------------------------+
```

- **Contenedor:**
  - fondo `bg-[var(--bg-base)]`;
  - columna `w-full max-w-xl px-8`;
  - título `text-lg font-semibold text-[var(--text-primary)]`;
  - texto de apoyo `text-xs text-[var(--text-muted)]`.
- **Progreso:** `<ol aria-label>` con puntos de `h-1.5 w-1.5 rounded-full`.
  - El actual y los hechos van en `bg-[var(--accent)]`; los que faltan, en `bg-[var(--border-high)]`.
  - El actual lleva `aria-current="step"`.
  - Al lado, "Paso n de 5", en `text-[10px] text-[var(--text-hint)]`.
- **Botón principal:** `rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500`, más `FOCUS_RING`. Es indigo fijo, no `--accent`, porque el texto blanco no contrasta en sepia ni en los temas tintados.
- **Atrás:** `SECONDARY_CLS`.
- **Omitir:** `text-xs text-[var(--text-hint)] hover:text-[var(--text-secondary)] hover:underline`, más `FOCUS_RING`.
- **Cambio de paso:** opacidad y `translateX(8px)` en 150 ms, sin movimiento si las animaciones están apagadas.

### Paso 1. Bienvenida

```
            [logo 64px]
            logday
   Tareas, notas y tu registro diario, en archivos Markdown que son tuyos.
   En unos pasos eliges dónde guardar tus datos y cómo se ve la app,
   y te mostramos cómo funciona.
   Idioma   ( Español | English )
                    [ Empezar ]
            Toma un par de minutos.
```

El idioma es un `fieldset` con radios `sr-only` y el aspecto de los botones de idioma de `GeneralSettingsTab`.

### Paso 2. Carpeta

```
  Elige tu carpeta de trabajo
  Logday guarda tus tareas, notas, dailys y horas extra como archivos .md ...
  +-----------------------------------------------------+
  | [FolderOpen]  ~/Documents/Logday        [Cambiar]   |   bg-surface, border-card
  +-----------------------------------------------------+
     (sin carpeta: [ Elegir carpeta… ] botón principal ancho)
  [!] Esta carpeta está en iCloud Drive ... Elegir otra carpeta   (role=alert)
  (i) Esta carpeta ya tiene datos de Logday. Se usarán tal cual.  (role=status)
  Te recomendamos una carpeta local, por ejemplo ~/Documents/Logday.
```

- **Aviso de iCloud:** `border-amber-500/30 bg-amber-500/10`, título en `text-amber-400`. El texto pasa de `amber-300/80` a `text-[var(--text-secondary)]`, porque el primero no tiene contraste en los temas claro y sepia.
- **Continuar deshabilitado:** lleva `aria-describedby` hacia "Elige una carpeta para continuar.".
- **Al elegir:** una región `aria-live="polite"` anuncia "Carpeta elegida: …".

### Paso 3. Apariencia

```
  Elige cómo se ve
  Puedes cambiarlo cuando quieras en Opciones.
  Tema
  [Sistema][Claro][Oscuro][Alto contraste]      grid-cols-4 gap-2, ThemeTile
  [Descanso][Sepia][OLED][Nórdico]
  Menú lateral · Estilo de las secciones
  [ SidebarStylePicker ]
```

### Paso 4. Cómo funciona

```
  Cómo funciona                                  2 de 5
  +-----------------------------------------------------+
  | [MiniFrame: menú en el estilo elegido | escena]  [↺] |   h-44, aria-hidden
  +-----------------------------------------------------+
  <h2 tabIndex=-1> Tareas
  · Organiza tus tareas en proyectos, con tags y fecha de vencimiento.
  · Cámbialas de vista: Lista, Kanban o Calendario.
  · [⌘T] crea una tarea desde cualquier sección.
          ○ ● ○ ○ ○                      [Omitir recorrido] [Siguiente]
```

| Escena | Qué se mueve | Fotograma final |
|---|---|---|
| 1. Tu día | El resaltado va de Inicio (tarjetas "Hoy" y "Esta semana") a Dailys; el panel se funde a un editor cuyas líneas se escriben (`scaleX`); aparece ⌘D | Dailys con 3 líneas |
| 2. Tareas | Una lista de 4 filas pasa a Kanban; las filas se reparten en 3 columnas y una tarjeta se mueve de la 1 a la 2 | Kanban con la tarjeta movida |
| 3. Notas | Se escriben líneas, aparece un diagrama de 3 cajas y la lista pasa a árbol | Árbol con la nota y el diagrama |
| 4. Muévete rápido | Aparece Buscar con "tar" y "Ir a Tareas" resaltado; al cerrarse, el menú salta a Tareas; teclas ⌘F y ⌘1 | El menú en Tareas y las teclas |
| 5. Tus datos | De una carpeta salen `tasks/…md`, `notes/…md` y `dailys/…md`; después, con borde punteado, Sync, Git y Extensiones, cada una "opcional" | Todas las fichas |

- **Colores:** las miniaturas usan los tokens del tema: `--bg-base`, `--bg-panel`, `--bg-hover`, `--border`, `--border-card`, `--bg-elevated`, y `--accent` para lo activo.
- **Animación:**
  - una sola pasada de unos 4 s, que empieza 300 ms después de mostrarse la escena;
  - termina en el fotograma final, con `animation-fill-mode: both`;
  - el estilo base es ese fotograma final, así que sin animación ya se ve completo;
  - "Ver de nuevo" vuelve a montar la escena con `key`;
  - solo está montada la escena actual.
- **Teclas:** con el `<kbd>` de `SearchModal`.

### Paso 5. Todo listo

```
  Todo listo
  ¿Con qué sección quieres abrir Logday?
  (•) [Home]     Inicio        Resumen general al iniciar
  ( ) [Calendar] Dailys        Registro diario de actividades
  ( ) [List]     Tareas        Lista y tablero de tareas
  ( ) [Book]     Notas         Lista y editor de notas
  ( ) [Timer]    Horas extra   Control y reporte de horas extra
  Puedes cambiarlo en Opciones → Navegación.
  Tus datos se guardan en ~/Documents/Logday.
                                         [Atrás] [Abrir Logday]
```

- **Filas:** radios nativos en filas `rounded-lg px-3 py-2`; la elegida, con `bg-indigo-500/10 text-indigo-400`.
- **Descripciones:** son las claves `startupDesc*` que ya existen.
- **Mientras se prepara la carpeta:** el botón dice "Preparando tu carpeta…" y queda deshabilitado.

### Acerca de

En Opciones → Acerca de, un botón "Ver el recorrido" con su descripción. Abre `TourModal` (`ModalOverlay` + `ModalPanel max-w-xl`) con `TourScenes`:
- "Cerrar" y Esc lo cierran;
- en la última escena, el botón principal dice "Terminar".

### Textos (es / en)

Son los del diseño del agente, que Jorge aprobó.

**Comunes**

| Clave | es | en |
|---|---|---|
| progress | Progreso de la configuración | Setup progress |
| step | Paso {n} de {total} | Step {n} of {total} |
| back / next / continue | Atrás / Siguiente / Continuar | Back / Next / Continue |
| skipAll | Omitir y abrir Logday | Skip and open Logday |
| skipTour | Omitir recorrido | Skip tour |

**Paso 1, Bienvenida**

| Clave | es | en |
|---|---|---|
| welcomeTitle | Te damos la bienvenida a Logday | Welcome to Logday |
| tagline | Tareas, notas y tu registro diario, en archivos Markdown que son tuyos. | Tasks, notes and your daily log, in Markdown files you own. |
| welcomeBody | En unos pasos eliges dónde guardar tus datos y cómo se ve la app, y te mostramos cómo funciona. | In a few steps you'll choose where to keep your data and how the app looks, and see how it works. |
| language | Idioma | Language |
| start | Empezar | Get started |
| duration | Toma un par de minutos. | Takes a couple of minutes. |

**Paso 2, Carpeta**

| Clave | es | en |
|---|---|---|
| folderTitle | Elige tu carpeta de trabajo | Choose your work folder |
| folderBody | Logday guarda tus tareas, notas, dailys y horas extra como archivos .md en esta carpeta. Puedes abrirlos con cualquier editor y cambiar de carpeta después en Opciones → Almacenamiento. | Logday saves your tasks, notes, dailies and overtime as .md files in this folder. You can open them with any editor and change the folder later in Settings → Storage. |
| pick | Elegir carpeta… | Choose folder… |
| change | Cambiar | Change |
| opening | Abriendo… | Opening… |
| chosen | Carpeta elegida: {path} | Folder selected: {path} |
| needFolder | Elige una carpeta para continuar. | Choose a folder to continue. |
| localHint | Te recomendamos una carpeta local, por ejemplo ~/Documents/Logday. | We recommend a local folder, for example ~/Documents/Logday. |
| icloudTitle | Esta carpeta está en iCloud Drive | This folder is in iCloud Drive |
| icloudBody | La app puede congelarse mientras iCloud sincroniza los archivos. Te recomendamos una carpeta local, por ejemplo ~/Documents/Logday. | The app can freeze while iCloud syncs files. We recommend a local folder, for example ~/Documents/Logday. |
| icloudAction | Elegir otra carpeta | Choose another folder |
| existing | Esta carpeta ya tiene datos de Logday. Se usarán tal cual. | This folder already has Logday data. It will be used as is. |
| folderError | No se pudo usar esta carpeta. Comprueba que tengas permiso de escritura o elige otra. | This folder can't be used. Check that you can write to it, or choose another one. |

**Paso 3, Apariencia**

| Clave | es | en |
|---|---|---|
| lookTitle | Elige cómo se ve | Choose how it looks |
| lookBody | Puedes cambiarlo cuando quieras en Opciones. | You can change this anytime in Settings. |

**Paso 4, Cómo funciona**

| Clave | es | en |
|---|---|---|
| tourTitle | Cómo funciona | How it works |
| sceneCount | {n} de {total} | {n} of {total} |
| replay | Ver la animación de nuevo | Play the animation again |
| s1Title | Tu día | Your day |
| s1a | Inicio te muestra lo del día: tareas vencidas o para hoy, lo que está en progreso y la actividad reciente. | Home shows your day: overdue and due-today tasks, work in progress and recent activity. |
| s1b | En Dailys escribes el registro de tu trabajo, un archivo por día. {key} crea el de hoy. | In Dailies you log your work, one file per day. {key} creates today's. |
| s1c | En Horas extra registras las horas fuera de tu jornada y las exportas a Excel. | In Overtime you log hours outside your schedule and export them to Excel. |
| s2Title | Tareas | Tasks |
| s2a | Organiza tus tareas en proyectos, con tags y fecha de vencimiento. | Organize your tasks in projects, with tags and due dates. |
| s2b | Cámbialas de vista: Lista, Kanban o Calendario. | Switch views: List, Kanban or Calendar. |
| s2c | {key} crea una tarea desde cualquier sección. | {key} creates a task from any section. |
| s3Title | Notas | Notes |
| s3a | Escribe en Markdown con un editor enriquecido: listas, tablas, código y diagramas. | Write in Markdown with a rich editor: lists, tables, code and diagrams. |
| s3b | Ordénalas en carpetas y míralas en lista o en árbol. | Organize them in folders and view them as a list or a tree. |
| s3c | {key} crea una nota. | {key} creates a note. |
| s4Title | Muévete rápido | Get around fast |
| s4a | {key} abre Buscar: encuentra tareas y dailys, o escribe el nombre de una sección para ir a ella. | {key} opens Search: find tasks and dailies, or type a section's name to go to it. |
| s4b | {home} te lleva a Inicio y {first}…{last}, a las demás secciones, en el orden del menú. | {home} takes you Home and {first}…{last} to the other sections, in sidebar order. |
| s4c | Con clic derecho en una sección la quitas del menú o la mueves. Las que no se ven están en Más. | Right-click a section to remove it from the sidebar or move it. The ones you don't see are under More. |
| s5Title | Tus datos, a tu manera | Your data, your way |
| s5a | Todo queda en archivos .md en tu carpeta, sin cuenta ni conexión. | Everything stays in .md files in your folder, with no account or connection. |
| s5b | Sync (opcional): conecta tu propio servidor logday-server para tener tus datos en otros equipos y en Logday Web. Si ya usas Logday en otro equipo, conéctalo en Opciones → Sync. | Sync (optional): connect your own logday-server to have your data on other devices and in Logday Web. If you already use Logday elsewhere, connect it in Settings → Sync. |
| s5c | Git (opcional): guarda versiones de tu carpeta con commits y push automáticos. | Git (optional): keep versions of your folder with automatic commits and pushes. |
| s5d | Extensiones (opcionales): Pomodoro, Google Calendar, MCP para asistentes de IA y más. Vienen apagadas; actívalas en Opciones → Extensiones. | Extensions (optional): Pomodoro, Google Calendar, MCP for AI assistants and more. They're off by default; turn them on in Settings → Extensions. |

**Paso 5, Todo listo**

| Clave | es | en |
|---|---|---|
| doneTitle | Todo listo | You're all set |
| startLegend | ¿Con qué sección quieres abrir Logday? | Which section should Logday open with? |
| startHint | Puedes cambiarlo en Opciones → Navegación. | You can change this in Settings → Navigation. |
| savedIn | Tus datos se guardan en {path}. | Your data is saved in {path}. |
| open | Abrir Logday | Open Logday |
| finishing | Preparando tu carpeta… | Setting up your folder… |
| finishError | No se pudo preparar la carpeta. Inténtalo de nuevo o elige otra. | The folder couldn't be set up. Try again or choose another one. |

**Acerca de**

| Clave | es | en |
|---|---|---|
| aboutTour | Ver el recorrido | Take the tour |
| aboutTourDesc | Repasa cómo funciona Logday. | See how Logday works. |
| tourDone / close | Terminar / Cerrar | Done / Close |

Antes de escribirlos, se comprueba contra el código que cada función que mencionan exista: las extensiones nombradas en `registry.ts`, los atajos en `shortcuts` y lo que encuentra Buscar.
