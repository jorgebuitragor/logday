# Excalidraw — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`excalidraw`, grupo Herramientas): dibujar bocetos
y diagramas a mano dentro de las notas, con el editor de Excalidraw. Es
la quinta del orden de Jorge (28 oct 2026). Complementa a Mermaid, que
ya existe para los diagramas con texto.

## Requisitos (EARS)

- X1. MIENTRAS la extensión esté activa, el menú de diagramas del editor
  de notas DEBERÁ ofrecer "Nuevo bloque: Excalidraw", que abre el editor
  de Excalidraw casi a pantalla completa.
- X2. El dibujo DEBERÁ guardarse dentro de la nota, como un bloque
  ```` ```excalidraw ```` con la escena en JSON en una sola línea. Así
  viaja con la nota por el CRDT, el sync, Git y la papelera, sin archivos
  aparte. En la nota se ve el dibujo (un SVG generado al vuelo), y al
  hacer clic se vuelve a abrir el editor.
- X3. Un bloque vacío o con JSON roto NO DEBERÁ romper la nota: muestra
  un aviso y al hacer clic se puede dibujar de nuevo.
- X4. Una escena de más de 1 MB (casi siempre por imágenes pegadas) NO
  DEBERÁ guardarse: se avisa para quitar imágenes.
- X5. Cerrar con cambios sin guardar DEBERÁ pedir confirmación.
- X6. Las fuentes de Excalidraw DEBERÁN servirse desde la app, no desde
  un CDN (R17 de la base). Excepción conocida: la fuente china
  (Xiaolai, 12 MB) no se incluye, y Excalidraw la busca en su CDN solo si
  hace falta.
- X7. El código de Excalidraw (~1 MB) DEBERÁ cargarse solo al usarlo
  (R16): ni al abrir la app ni con la extensión apagada.
- X8. Con la extensión apagada, o en Web y Mobile, el bloque se ve como un
  bloque de código normal, sin perder nada.
- X9. Textos en español e inglés, con tú y sin voseo; el editor usa el
  idioma y el tema de la app.

## Fuera de alcance

- Ver los dibujos en Web y Mobile (por ahora, el bloque de código).
- Bibliotecas de Excalidraw, colaboración en vivo y exportar aparte.
