# Logday

Aplicacion de escritorio para gestion personal de trabajo diario.

Logday esta construida con Tauri + React y guarda los datos en archivos locales de texto (Markdown), para mantener portabilidad y control total de la informacion.

## Que resuelve

- Gestion de tareas por proyecto.
- Gestion de notas con editor enriquecido y Markdown.
- Registro diario de actividades (dailys) por fecha.
- Registro y calculo de horas extra.
- Respaldo e importacion de datos en ZIP.
- Integracion opcional con Git para versionar tu carpeta de trabajo.

## Funcionalidades principales

### Tareas

- Estados: todo, in-progress, done.
- Vistas: lista, kanban y calendario.
- Fecha de vencimiento, tags y rutas vinculadas.
- Editor de tarea con contenido en Markdown.

### Notas

- Lista de notas con carpetas y subcarpetas.
- Editor principal con Markdown enriquecido.
- Soporte de bloques Mermaid y edicion visual de diagramas.
- Exportacion de nota a MD, TXT o PDF.
- Operaciones rapidas: duplicar, mover, fijar, exportar y eliminar.

### Dailys

- Registro por fecha en formato mensual.
- Navegacion por meses con historial.
- Creacion rapida del daily de hoy.

### Horas extra

- Registro por mes y por entrada.
- Calculo de franjas de extras.
- Exportacion a Excel para reporte.

### Productividad y UX

- Busqueda global.
- Temas: system, light, dark, high-contrast, visual-rest.
- Idioma: espanol e ingles.
- Atajos configurables para acciones clave.
- Pantalla de inicio configurable.
- Confirmacion de acciones destructivas configurable.
- Notificaciones internas tipo toast.

### Respaldo y recuperacion

- Exporta toda la data a un archivo ZIP.
- Importa un ZIP previo y restaura contenido y ajustes.

### Integracion Git

- Inicializacion de repositorio desde la app.
- Commit, push, pull y fetch desde UI.
- Estado local y remoto visible.

### Bandeja del sistema

- Icono en system tray.
- Acciones rapidas: mostrar app, nueva nota y nueva tarea.
- Al cerrar la ventana principal, la app se oculta en vez de terminar.

## Arquitectura

### Frontend

- React 19 + TypeScript + Vite.
- Zustand para estado global.
- Tailwind CSS para UI.
- Componentes principales por dominio: tareas, notas, dailys, overtime, dashboard y ajustes.

### Backend (Tauri / Rust)

- Comandos para lectura/escritura de archivos.
- Exploracion de directorios y busqueda de texto.
- Utilidades de portapapeles y operaciones binarias.
- Puente para ejecutar comandos Git de forma controlada.
- Integracion con system tray.

## Modelo de almacenamiento local

La app trabaja sobre una carpeta base elegida por el usuario.

Estructura esperada:

	<basePath>/
	  projects/
		inbox/
		...
	  notes/
	  dailys/
	  overtime/

Configuracion principal:

- Archivo de configuracion de la app: config.json en el directorio de datos de Tauri.
- Incluye basePath, idioma, pantalla inicial y preferencias de comportamiento.

## Requisitos

- Node.js 20+
- pnpm 9+
- Rust estable
- Tauri CLI 2

## Desarrollo local

Instalar dependencias:

	pnpm install

Iniciar en modo desarrollo (frontend + app escritorio):

	pnpm tauri dev

Build del frontend:

	pnpm build

Chequeo rapido del backend Rust:

	cargo check --manifest-path src-tauri/Cargo.toml

## Build de escritorio

Generar binarios/instaladores con Tauri:

	pnpm tauri build

## Troubleshooting comun

### Puerto 1420 ocupado

Si Vite no levanta por conflicto de puerto:

	lsof -nP -iTCP:1420 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs -r kill

Luego reinicia:

	pnpm tauri dev

### Reinicios dobles en desarrollo

Si tienes varias sesiones abiertas de tauri dev, cierralas y deja una sola sesion activa.

## Alcance actual

Logday esta optimizada para flujo local-first: primero archivos locales, luego sincronizacion opcional con Git.

## Licencia

[AGPL-3.0-or-later](./LICENSE). Software libre: cualquier persona u organización puede usarlo, modificarlo y auto-hospedar su propia instancia. Si ofreces una versión modificada como servicio a terceros, el AGPL exige publicar también ese código modificado (copyleft de red) — ver el texto completo de la licencia para el detalle.
