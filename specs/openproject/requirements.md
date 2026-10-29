# OpenProject — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`openproject`, grupo Integraciones): trae los work
packages que el usuario tiene asignados en OpenProject como tareas de
Logday. Jorge la eligió el 29 oct 2026, después de Excalidraw. Ya estaba
decidida en el vault (`Integraciones opcionales (ideas)`, 28 oct 2026):

- va en Desktop, porque el OpenProject de la empresa solo se alcanza
  desde la red interna o la VPN, y logday-server (en Gaia) no llega;
- lo primero es traer las tareas. Registrar tiempo y sincronizar estados
  quedan para después.

Usa la API v3 de OpenProject con el token de API personal del usuario
(Basic, usuario `apikey`).

## Requisitos (EARS)

### Conectar

- P1. La dirección DEBERÁ ser `https`, o `http` solo para una dirección de
  la red interna: IP privada, nombre sin puntos o dominio `.local`,
  `.lan`, `.internal`, `.intranet`, `.corp` o `.home.arpa`. Con `http`,
  el panel DEBERÁ avisar que el token viaja sin cifrar.
- P2. "Conectar" DEBERÁ probar la dirección y el token con
  `/api/v3/users/me` antes de guardarlos. Se guardan **juntos** en el
  llavero (`ext:openproject:url`, `ext:openproject:token`), así el token
  solo viaja a la dirección con la que se guardó. Ninguno llega al
  webview. Las peticiones no siguen redirecciones, para que el token no
  vaya a otro sitio.
- P3. El panel DEBERÁ mostrar el usuario conectado y ofrecer
  "Desconectar", que borra la dirección y el token del llavero.

### Importar

- P4. "Importar ahora" DEBERÁ traer los work packages **abiertos** donde
  el usuario es **asignado o responsable** (hasta 2000 de cada uno; los
  de responsable, desde el 29 oct 2026, a pedido de Jorge) y crear una tarea por cada uno en
  el proyecto de Logday elegido ("openproject" por defecto, que se crea si
  no existe).
- P4b. El panel DEBERÁ listar los campos personalizados de persona de ese
  OpenProject (como "Responsable Desarrollo" en la FCV) para elegir en
  cuáles buscar también al usuario. En ellos se filtra por el id del
  usuario, no por `me`. Solo se aceptan ids `customField<n>`. Un campo
  que no está en todos los proyectos se busca dentro de cada proyecto
  activo, saltando los proyectos donde no existe.
- P4c. El panel DEBERÁ permitir traer también los work packages cerrados
  (apagado por defecto). Pedido por Jorge el 29 oct 2026: en la FCV la
  mayoría de sus tareas ya están liberadas.
- P4d. Solo las tareas y los errores (tipos Task y Bug) DEBERÁN
  importarse como tareas. Las épicas, Features, hitos y fases dan las
  carpetas (P5b). Las que habían llegado antes se quitan y van a la
  papelera de Logday. Pedido por Jorge el 29 oct 2026.
- P5. Cada tarea DEBERÁ llevar:
  - el asunto como título;
  - como código, el valor del campo de texto que el usuario elija en
    "Código de la tarea" (en la FCV, "Tarea", que se elige sola si existe),
    o `OP-<número>` si no
    elige ninguno o el work package no lo tiene. Si ese código ya lo usa
    otra tarea, va `OP-<número>`;
  - la fecha de fin (o la del hito);
  - la etiqueta `openproject`;
  - en el cuerpo: un enlace al work package, su proyecto, tipo, estado y
    prioridad, y la descripción.
- P5b. Cada tarea DEBERÁ ir en el proyecto de Logday elegido, en un
  subproyecto por la **épica** que la contiene (la más cercana entre sus
  ancestros) y, dentro, uno por su **Feature** (la más cercana por debajo
  de esa épica). En la FCV la estructura es Épica (área o app) > Feature
  (versión) > Tarea. Por ejemplo,
  `openproject/medico-asistencial/app-circuito-cerrado-v.x.x.x`. Sin
  épica ni Feature, en el proyecto elegido. Una épica o una Feature va en
  su propia carpeta. Pedido por Jorge el 29 oct 2026: primero solo la
  épica, después la épica y la Feature.
- P5c. En cada importación, a las tareas ya importadas se les DEBERÁN
  corregir el código y el proyecto (P5, P5b) **solo si siguen como los
  dejó la importación**. Si el usuario los cambió, no se tocan. El título
  y el cuerpo nunca se tocan.
- P5d. Cada tarea DEBERÁ llevar el avance de OpenProject
  (`percentageDone`) en su campo de progreso (`progress`, logday#36). En
  cada importación se actualiza con la misma regla de P5c: solo si el
  usuario no lo cambió en Logday.
- P5e. El estado de la tarea DEBERÁ seguir al de OpenProject, con la regla
  de P5c:
  - un estado que OpenProject cuenta como cerrado (`isClosed`) → hecha;
  - uno que empieza por "En " o "In " ("En Desarrollo") → en progreso;
  - el resto → por hacer.
- P6. Un work package ya importado NO DEBERÁ importarse otra vez ni pisar
  la tarea, aunque cambie en OpenProject: el usuario pudo editarla, y las
  escrituras van por LWW y el CRDT. Lo que se haga en Logday tampoco
  cambia nada en OpenProject.
- P6b. El panel DEBERÁ ofrecer "Volver a importar las borradas": vuelve a
  crear las tareas ya importadas que no existen en Logday. Por defecto, lo
  que el usuario borró no vuelve (P6). Pedido por Jorge el 29 oct 2026,
  después de borrar el proyecto para empezar de cero.
- P7. El panel DEBERÁ permitir importar solo, al abrir la app y cada 30
  minutos (apagado por defecto).
- P8. El panel DEBERÁ mostrar el resultado de la última importación
  (cuándo, cuántas tareas nuevas o el error). Sin VPN se ve "No se pudo
  conectar", y se reintenta en la próxima.

### Red y datos

- P9. La respuesta de OpenProject se lee como datos, solo los campos que
  se usan. Si no tiene la forma esperada, se avisa y no se crea ninguna
  tarea.
- P10. Solo lee de OpenProject y no envía datos de Logday, así que no
  lleva el aviso de R6 de la base. El permiso lo da el usuario al crear
  el token.
- P11. Textos en español e inglés, con tú y sin voseo, con una guía paso
  a paso para conseguir el token.

## Fuera de alcance (por ahora)

- Registrar tiempo en OpenProject desde el daily o las horas extra.
- Sincronizar estados (cerrar la tarea al cerrar el work package, o al
  revés).
- Certificados propios de la empresa: si el equipo no confía en ellos,
  la conexión falla con "No se pudo conectar".
