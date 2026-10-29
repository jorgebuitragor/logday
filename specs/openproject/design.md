# OpenProject — Design

## Rust (`src-tauri/src/extensions/openproject.rs`)

- `openproject_connect(url, token)`:
  - valida la dirección (P1);
  - `GET /api/v3/users/me` con Basic `apikey:<token>` y espera
    `_type: "User"`;
  - guarda la dirección y el token en el llavero;
  - devuelve `{ name, url }`.
- `openproject_disconnect()`: borra los dos secretos.
- `openproject_work_packages(page)`: una página (1 a 20, de 100 cada una)
  de `/api/v3/work_packages`, con estos filtros, devuelta como texto JSON:
  - `assignee = me` y `status o` (abiertos);
  - `sortBy updatedAt desc`.
- La dirección y el token quedan en memoria tras leerlos una vez, para
  no abrir el aviso del llavero en cada importación.
- Errores como códigos, nunca el texto de reqwest, que lleva la URL:
  `unauthorized`, `forbidden`, `not_found`, `redirected`, `network`,
  `timeout`, `provider_error` y otros.
- Sin redirecciones, 20 s de plazo y 8 MB por respuesta como máximo.

## Webview (`src/extensions/openproject/`)

- `model.ts`:
  - `readOpenProjectSettings`;
  - `parseWorkPackages`, que lee HAL: `_embedded.elements`,
    `description.raw`, `dueDate` o `date`, y los `title` de `_links`;
  - `workPackageToTask`;
  - `projectSlug`, igual que `createProject`.
- `importer.ts`:
  - pide las páginas hasta `total`;
  - filtra con `imported` (id del work package → id de la tarea);
  - crea el proyecto si falta;
  - crea las tareas con `createTask(…, { tags, due, open: false })`, del
    más viejo al más nuevo;
  - guarda `imported` tras cada tarea;
  - las tareas pasan por `createTask`, así que van por el sync y disparan
    `task.created` para el webhook.
- La dirección también va en `settings.baseUrl`, solo para los enlaces y
  para mostrarla. Rust usa la del llavero.
- `Settings.tsx` sigue el panel de Granola:
  - dirección y token, o la cuenta conectada;
  - el proyecto;
  - "Importar solo";
  - el último resultado;
  - la guía.
- `index.ts`: `start()` con el temporizador de P7.
