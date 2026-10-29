# OpenProject — Tareas

Estado: en progreso.

- [x] Decisión: en Desktop, token de API, primero traer tareas (28 y 29
  oct 2026).
- [x] Rust: conectar, desconectar y work packages, con pruebas de la
  dirección, la consulta y los códigos de error.
- [x] `model.ts`, con pruebas sobre respuestas con la estructura de la
  API v3 y datos inventados (`fixtures.ts`).
- [x] Importador, panel, módulo, registro y textos en es y en.
- [x] Revisión con el build de producción en el navegador y Tauri
  simulado (29 oct 2026):
  - token malo: muestra "OpenProject rechazó el token";
  - conectar: muestra el usuario, la dirección y el aviso de `http://`;
  - importar: crea 3 tareas en el proyecto "openproject" (creado), con
    código, fecha (también la de un hito), etiqueta, enlace y
    descripción;
  - importar otra vez: 0 tareas nuevas;
  - sin red: muestra el error de la VPN en el último resultado.
- [x] Conexión con el OpenProject de la FCV en la app de QA (29 oct
  2026): por la VPN, con `http` e IP privada (se acepta con el aviso). La
  importación corrió sin error y creó 0 tareas. Jorge pidió traer
  también los work packages de los que es responsable.
- [x] Traer también los de responsable (29 oct 2026).
- [x] "Buscar también por" con los campos personalizados de persona,
  como "Responsable Desarrollo" (29 oct 2026). Revisado en el navegador:
  busca por los tres campos y no duplica.
- [x] En la FCV, la lista de filtros falla con sesión: los campos se
  prueban uno por uno. Fuera de un proyecto, "Cf 11 no existe": se busca
  en cada proyecto (verificado sin sesión en un proyecto público, con el
  id de un miembro, el 29 oct 2026).
- [x] Importar en la QA (29 oct 2026): 35 tareas, con los de responsable y
  los de "Responsable Desarrollo".
- [x] Código desde el campo "Tarea", subproyecto por épica y corrección
  de las ya importadas (29 oct 2026). Revisado en el navegador con
  archivos simulados:
  - la importada se movió a `openproject/app-circuito-cerrado` con el
    código `TAR-0042` y sin perder lo escrito;
  - la nueva fue a la épica más cercana;
  - la que el usuario movió a mano no se tocó;
  - la segunda importación no cambió nada.
- [x] Avance (%) desde `percentageDone` en `Task.progress` (29 oct 2026),
  con la rama de logday#36 mergeada en esta. El campo es de la sesión de
  progreso: servidor, Desktop, Web y Mobile.
- [x] Estructura real de la FCV (29 oct 2026), con un script que Jorge
  corrió con su token, sin pasarlo al chat:
  - no tiene nada como Asignado: es Responsable Desarrollo (35 abiertos,
    328 en total), Responsable Análisis (25 y 178) y Autor (30);
  - las épicas son áreas ("Medico Asistencial", "Corporativo
    Financiero") o apps ("App Autenticador (SoyFCV)"), con Features
    (versiones) debajo;
  - "Tarea" (`customField2`) es el número de ticket;
  - muchos estados son de la FCV (Liberado, Producción: cerrados).
- [x] Traer los cerrados, estado según OpenProject y "Tarea" por
  defecto (29 oct 2026). Revisado en el navegador.
- [x] QA con la FCV (29 oct 2026): 329 tareas, con 294 hechas, 13 en
  progreso y 22 por hacer, con avance y el código de "Tarea".
- [x] Épica y Feature como carpetas (29 oct 2026). Revisado en el
  navegador: la importada se mueve a `<épica>/<feature>` sin perder lo
  escrito.
- [x] "Volver a importar las borradas" (29 oct 2026): Jorge borró el
  proyecto para empezar de cero, y la importación solo trajo 1 tarea
  nueva, porque cada work package entra una vez.
- [x] QA con la FCV, con "Volver a importar las borradas" (29 oct 2026):
  - 330 tareas en 100 carpetas de Feature;
  - 307 en `<épica>/<feature>`, 21 solo con épica o solo con Feature, y 2 sin ninguna;
  - estados: 294 hechas, 14 en progreso y 22 por hacer;
  - 47 con `OP-<n>` porque no tienen "Tarea".
- [x] Enviar el avance y el estado a OpenProject (P12, 29 oct 2026):
  apagado por defecto, con aviso, equivalencia de estados, `lockVersion`
  y pendientes sin red. Revisado en el navegador: marcar como hecha envió
  "Liberado" con la versión de la importación y guardó la nueva.
- [x] En la QA (29 oct 2026), el avance de una tarea no llegó. Se corrigió:
  - una importada antes de P12, con un envío pendiente, nunca recibía su
    versión;
  - después de importar no se reintentaba;
  - dos cambios seguidos se pisaban en la fila de pendientes (se perdieron
    dos estados);
  - la equivalencia no se leía al importar.
- [ ] Volver a probar el envío en la QA.
- [x] Solo Tasks y Bugs (29 oct 2026). Las 38 Features, épicas e hitos que
  habían llegado se quitan en la próxima importación y van a la papelera.
