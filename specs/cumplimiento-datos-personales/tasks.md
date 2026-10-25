# Cumplimiento de datos personales — Tareas

Estado: en diseño, sin empezar.

## `logday-server`

- [ ] Migración: `instance_settings` gana `privacy_policy_text` +
      `privacy_policy_version` (con la plantilla como `DEFAULT`).
- [ ] Migración: `users` gana `privacy_accepted_version`,
      `privacy_accepted_at`, `sensitive_data_accepted_at`.
- [ ] `GET /policy` (público).
- [ ] `POST /policy/accept` (autenticado, valida versión, 409 si está
      desactualizada).
- [ ] `POST /policy/accept-sensitive` (autenticado).
- [ ] `login`/`refresh` agregan `policy_version` +
      `policy_accepted_version` a la respuesta.
- [ ] `GET /account/export` (JSON con todo lo del usuario en las 7
      tablas de dominio + cuenta/dispositivos).
- [ ] `DELETE /account` (pide contraseña, cascada sobre las 7 tablas +
      `devices` + `used_refresh_tokens`, invalida la sesión).
- [ ] Panel admin: campo de texto + versión para
      `privacy_policy_text`/`privacy_policy_version` en
      `panelSettings`/`panelUpdateSettings`.
- [ ] Redactar la plantilla de política por defecto (placeholders +
      nota de "no es un documento legal final").

## `task-manager` (Desktop)

- [ ] Leer `policy_version`/`policy_accepted_version` de la respuesta
      de login/refresh, guardarlos en `syncConfig` o estado aparte.
- [ ] Pantalla de gate de consentimiento general (scroll-to-enable) —
      se interpone entre login/reconexión y el resto de la app, solo
      si hay sync configurado.
- [ ] Gate aparte para dato sensible al guardar una `AbsenceDay` tipo
      `incapacidad` con sync activo.
- [ ] Ajustes → nueva sección "Privacidad y datos": ver política,
      exportar mis datos, eliminar mi cuenta (con confirmación fuerte).
- [ ] i18n es/en.

## `logday-web`

- [ ] Mismo gate de consentimiento general (equivalente en React/web).
- [ ] Mismo gate de dato sensible.
- [ ] Nota: este repo hoy es un arnés de prueba del protocolo, no un
      cliente real todavía (ver su propio README) — evaluar si esto se
      hace ahora o se difiere a cuando `logday-web` sea un cliente de
      verdad.

## `logday-mobile`

- [ ] Mismo gate de consentimiento general (equivalente en
      Expo/React Native).
- [ ] Mismo gate de dato sensible.
- [ ] Nota: repo "en diseño" todavía (ver su propio README) — mismo
      criterio que `logday-web`, evaluar prioridad.

## Validación

- [ ] `go test ./...` / `cargo check` / `tsc --noEmit` en verde en
      cada repo tocado.
- [ ] Probar contra un servidor real: primer login sin haber aceptado
      nunca → aparece el gate; aceptar → no vuelve a aparecer; el
      admin sube la versión desde el panel → vuelve a aparecer en el
      siguiente login.
- [ ] Probar el gate de dato sensible por separado del general.
- [ ] Probar exportar datos y confirmar que el JSON trae todo lo
      esperado.
- [ ] Probar eliminar cuenta y confirmar en la base que no queda nada
      de ese usuario.
- [ ] Confirmar que el modo 100% local (sin sync) nunca muestra
      ningún gate.
