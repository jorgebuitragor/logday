# Actualizaciones automáticas — Requirements

Estado: implementado, pendiente de validar contra un release real (ver
`tasks.md` "Validación").

## Contexto

Logday Desktop hoy (`AboutSettingsTab.tsx` + comando Rust `check_update`)
solo puede avisar de una versión nueva si el usuario entra a Ajustes →
Acerca de y hace clic en "Buscar actualizaciones" — eso consulta la API
de GitHub (`check_update` en `src-tauri/src/lib.rs`, pega contra
`api.github.com/repos/jorgebuitragor/logday/releases/latest`) y, si hay
una versión nueva, muestra un botón que abre el navegador a la página
del release (`fs.openUrl(releaseInfo.html_url)`). De ahí en más todo es
manual: descargar el instalador correcto, cerrar la app, instalarlo,
volver a abrirla.

La app se distribuye a colaboradores de la FCV, no solo a Jorge — este
flujo manual es el mismo tipo de fricción repetida que ya preocupó
antes en este proyecto (sesión de renovación de sesión de sync: "temo
que los usuarios vean este problema reiteradamente"). El pedido acá es
que la app pueda avisar sola de una actualización, y opcionalmente
instalarla sola, sin que nadie tenga que salir de la app.

## Decisiones ya acordadas con el usuario

- **Plataformas**: macOS y Windows — los colaboradores usan ambos.
- **Sin cuenta de Apple Developer todavía** — no hay notarización real
  disponible por ahora. Ver "Riesgo conocido: Gatekeeper en macOS" en
  `design.md`, no se resuelve en este spec.

## Requisitos (EARS)

### Chequeo

- Cuando la app termine de iniciar, el sistema DEBERÁ chequear en
  segundo plano si hay una versión nueva publicada, sin bloquear el uso
  de la app ni requerir que el usuario abra Ajustes.
- El sistema DEBERÁ repetir ese chequeo periódicamente mientras la app
  siga abierta, no solo una vez al iniciar.
- Cuando el chequeo falle (sin red, GitHub caído, etc.), el sistema NO
  DEBERÁ mostrar ningún error visible ni interrumpir el uso normal — se
  reintenta en el próximo ciclo.

### Aviso

- Cuando haya una versión nueva disponible, el sistema DEBERÁ mostrarlo
  dentro de la propia app, de forma visible pero no intrusiva — no solo
  dentro de la pestaña Ajustes → Acerca de, como hoy.
- El aviso DEBERÁ incluir la versión nueva y, si el release la trae, sus
  notas (cuerpo del release de GitHub).

### Actualización manual (modo por defecto)

- Cuando el usuario haga clic en "Actualizar ahora", el sistema DEBERÁ
  descargar el instalador correcto para su sistema operativo, verificar
  su firma, instalarlo y reiniciar la app — todo sin que el usuario
  tenga que abrir el navegador ni ejecutar nada a mano.
- Mientras se descarga/instala, el sistema DEBERÁ mostrar algún estado
  ("descargando…", "instalando…") para que el usuario no piense que la
  app se colgó.

### Actualización automática (opt-in)

- El sistema DEBERÁ ofrecer, en Ajustes → Acerca de, un interruptor
  "Actualizar automáticamente".
- Cuando ese interruptor esté activo y se detecte una versión nueva, el
  sistema DEBERÁ descargar e instalar la actualización sin pedir
  confirmación previa, pero SIEMPRE DEBERÁ avisar antes de reiniciar la
  app (para no cortarle el trabajo a alguien a mitad de una edición),
  con al menos la opción de posponer el reinicio unos minutos.
- Por defecto (instalación nueva, sin que el usuario haya tocado nada
  en Ajustes) el interruptor DEBERÁ estar desactivado — el modo por
  defecto es avisar y dejar que el usuario decida cuándo, nunca
  instalar sola sin que nadie lo haya pedido antes.

### Integridad

- El sistema DEBERÁ verificar la firma criptográfica de cada
  actualización antes de instalarla, rechazándola si no coincide
  (protege contra un artefacto corrupto o un release falsificado).

### Reemplazo del chequeo actual

- El flujo actual de "Buscar actualizaciones" que abre el navegador
  (`check_update` en Rust, botón en `AboutSettingsTab.tsx`) DEBERÁ
  reemplazarse por el nuevo mecanismo, no coexistir como una segunda
  forma de chequear lo mismo.

## Fuera de este spec

- Notarización real de Apple (requiere cuenta de pago, $99/año) — se
  documenta como riesgo conocido en `design.md`, no se resuelve acá.
- Auto-actualización silenciosa sin ningún aviso antes de reiniciar —
  se descarta a propósito, ver "Actualización automática" arriba.
- Rollback automático si una versión nueva rompe algo — fuera de
  alcance; se resuelve publicando un release corregido, como cualquier
  otro bug.
- Servidor de updates propio — GitHub Releases alcanza, ver `design.md`.
