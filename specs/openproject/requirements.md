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
  usuario, no por `me`. Solo se aceptan ids `customField<n>`.
- P5. Cada tarea DEBERÁ llevar:
  - el asunto como título;
  - el código `OP-<número>`;
  - la fecha de fin (o la del hito);
  - la etiqueta `openproject`;
  - en el cuerpo: un enlace al work package, su proyecto, tipo, estado y
    prioridad, y la descripción.
- P6. Un work package ya importado NO DEBERÁ importarse otra vez ni pisar
  la tarea, aunque cambie en OpenProject: el usuario pudo editarla, y las
  escrituras van por LWW y el CRDT. Lo que se haga en Logday tampoco
  cambia nada en OpenProject.
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
