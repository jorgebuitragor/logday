# Cumplimiento de datos personales — Requirements

Estado: en diseño

## Contexto

Logday cambió de alcance: ya no es "un proyecto interno para
colaboradores de la FCV" sino software libre (AGPL-3.0-or-later, ver
`LICENSE` en los 4 repos) para cualquier persona u organización que
quiera auto-hospedar su propia instancia (modelo confirmado con el
usuario: cada quien se auto-hospeda, Jorge no opera un servicio
público central).

Esto tiene una consecuencia legal directa: **quien despliega su propio
`logday-server` es el responsable del tratamiento de los datos de sus
usuarios**, no Jorge. El trabajo de este spec no es escribir la
política de privacidad de Jorge — es darle a **cualquier operador**
las piezas para poder cumplir con la suya, en cualquiera de los 4
servicios (`task-manager`, `logday-web`, `logday-mobile`,
`logday-server`).

Contexto legal de referencia (Colombia — Ley 1581 de 2012 y Decreto
1377/2013, vigilados por la SIC; cada operador debe validar si le
aplica otro marco según su jurisdicción):

- Todo responsable del tratamiento necesita una Política de
  Tratamiento de Datos Personales, y debe capturar consentimiento
  explícito del titular.
- Los **datos sensibles** (salud, entre otros) exigen consentimiento
  explícito y diferenciado, e informarle al titular que no está
  obligado a darlo. **Encontrado en el código**:
  `src/types/absence.ts` → `AbsenceType` incluye `'incapacidad'`
  (incapacidad médica) — eso es dato sensible de salud.
- El titular tiene derecho a acceder, corregir y suprimir sus datos.

Este spec **no reemplaza asesoría legal real** — entrega una plantilla
de política y el mecanismo técnico de consentimiento/derechos, no un
texto legal definitivo. Cada operador (Jorge incluido, para su propia
instancia) debe adaptar el texto a su caso.

## Requisitos (EARS)

### Alcance: solo aplica con sync activo

- El uso 100% local de Logday (sin servidor configurado) NUNCA DEBERÁ
  requerir aceptar ninguna política — no hay tratamiento por un
  tercero si los datos nunca salen del disco del usuario. Esto no
  cambia: local-first sigue siendo el modo por defecto.
- El gate de consentimiento DEBERÁ aplicar únicamente al conectar o
  usar sync contra un `logday-server` (cualquiera de los 3 clientes).

### Política editable por el operador

- `logday-server` DEBERÁ permitir a un administrador cargar y editar
  el texto de su propia Política de Tratamiento de Datos Personales,
  con una versión (número) que se incrementa cada vez que el texto
  cambia.
- El sistema DEBERÁ venir con un texto de **plantilla** en español,
  estructurado según los elementos que exige la ley colombiana
  (identificación del responsable, finalidad, derechos del titular,
  procedimiento para ejercerlos, tratamiento de datos sensibles,
  vigencia), dejando explícito en el propio texto que debe adaptarse
  antes de usarse en producción.

### Consentimiento general obligatorio

- Cuando un usuario inicie sesión contra un servidor y no haya
  aceptado la versión vigente de la política (primera vez, o porque el
  operador la actualizó), el sistema DEBERÁ mostrarle el texto completo
  y exigir una aceptación explícita (no un checkbox premarcado, no
  "seguir usando implica aceptar") antes de dejarlo continuar, en
  Desktop, web y móvil por igual.
- El servidor DEBERÁ registrar qué versión aceptó cada usuario y
  cuándo, de forma auditable.

### Consentimiento diferenciado para dato sensible

- Cuando un usuario, estando conectado a un servidor, vaya a guardar
  por primera vez una ausencia de tipo `incapacidad`, el sistema
  DEBERÁ pedirle un consentimiento aparte y explícito para ese dato
  específico, indicándole que no está obligado a proporcionarlo.
- Este consentimiento es independiente del consentimiento general —
  aceptar la política no implica haber aceptado esto.

### Derechos del titular

- Un usuario conectado a un servidor DEBERÁ poder, desde Ajustes:
  exportar toda su información almacenada en ese servidor, y solicitar
  la eliminación de su cuenta junto con todos sus datos ahí.
- La eliminación de cuenta DEBERÁ ser irreversible y pedir confirmación
  fuerte (mismo criterio que otras acciones destructivas ya existentes
  en la app).

## Fuera de este spec

- Registro ante la SIC / RNBD — obligación del operador, no algo que
  el software resuelva.
- Cifrado en reposo y forzar HTTPS — riesgos ya documentados en la
  conversación, spec aparte si se decide abordarlos.
- El texto legal definitivo de la política de Jorge para su propia
  instancia de `logday-server` — este spec entrega la plantilla y el
  mecanismo, no una revisión legal real.
