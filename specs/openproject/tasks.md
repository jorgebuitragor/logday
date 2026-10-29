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
- [ ] QA con el OpenProject de la FCV (con la VPN) en la app de QA.
