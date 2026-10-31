# Cliente HTTP — Requirements

Estado: en curso. El enfoque y las decisiones del diseño los aprobó Jorge el 31 oct 2026. Están implementados el PR 1 (la extensión en las notas), el PR 2 (la herramienta de DevTools) el cambio que la reemplaza por una pantalla propia (HT33–HT35, rama `feature/http-pantalla-propia`), la barra del bloque con lenguaje, método y cURL (HT36–HT38) y pegar un cURL (HT39–HT39c), en la misma rama. Faltan las pruebas en el navegador y en la app de QA.

El **Cliente HTTP v2** (HT40–HT69: editor de petición en pestañas, respuesta con árbol, historial, importar y generar código) lo aprobó Jorge el 31 oct 2026 con las ocho decisiones tal como las recomienda su diseño (design §14). Se hace en ocho PR, en el orden de `tasks.md`.

## Contexto

Jorge preguntó si tenía sentido un cliente HTTP "tipo Postman" en Logday para probar APIs y servicios. Se le propuso, y aprobó, algo más pequeño que Postman: una extensión opcional (`http-client`, grupo Herramientas) cuyas peticiones se escriben **dentro de las notas**, en un bloque ```` ```http ````, con la sintaxis de REST Client de VS Code y de Bruno. Con la extensión activa, el bloque muestra "Enviar" y, debajo, la respuesta.

Las peticiones son texto de la nota, así que se guardan, se versionan y se sincronizan con ella sin nada aparte. Lo que no debe viajar con la nota (los valores de las variables, los secretos y las respuestas) se queda en este equipo.

Para las pruebas rápidas que no hace falta guardar, y para tener a mano todas las peticiones de las notas, la extensión tiene su propia pantalla en el menú lateral (HT33–HT35), con el mismo motor. Hasta el 31 oct 2026 eso era una herramienta de DevTools (HT27 y HT28, enmendados).

Es la primera extensión del grupo Herramientas que envía datos fuera del equipo, así que lleva el aviso de R6 (`specs/extensiones`).

## Requisitos (EARS)

### Extensión

- HT1. La extensión `http-client` DEBERÁ ser opcional, del grupo Herramientas (`category: 'tool'`), solo de Desktop y apagada en una instalación nueva (R3). Su código NO DEBERÁ cargarse mientras esté apagada (R16).
- HT2. Al activarla por primera vez, el usuario DEBERÁ aceptar el aviso de R6. El aviso dice qué se envía (la URL, las cabeceras y el cuerpo que escribe, con los valores de sus variables y secretos), a quién (a la dirección que escribe) y cuándo (solo al pulsar Enviar). SI no lo acepta, la extensión NO DEBERÁ activarse.
- HT3. Una petición DEBERÁ enviarse solo cuando el usuario pulsa Enviar, usa el atajo de enviar o confirma un envío (HT20, HT21). NUNCA DEBERÁ enviarse por abrir una nota, editarla, sincronizarla o restaurarla, ni por una acción del agente de MCP o de otra extensión. Tampoco hay reintentos automáticos.

### Bloque `http` en las notas

- HT4. MIENTRAS la extensión esté activa, un bloque ```` ```http ```` de una nota DEBERÁ verse como código que se edita en la nota misma. Encima lleva una barra con el entorno y "Enviar", y debajo, la respuesta de la última petición que se envió desde ese bloque.
- HT5. **Sintaxis.** Cada petición tiene esta forma:
  - Una línea `MÉTODO URL`, con un `HTTP/1.1` opcional al final. Los métodos son GET, POST, PUT, PATCH, DELETE, HEAD y OPTIONS, en mayúsculas o minúsculas. Una línea que es solo una URL equivale a un GET.
  - Opcionalmente, líneas que empiezan por `?` o `&` y siguen la query de la URL.
  - Cabeceras `Nombre: valor`, una por línea.
  - Una línea en blanco y, después, el cuerpo, tal cual.
  - Las líneas que empiezan por `#` o `//` antes del cuerpo son comentarios.
- HT6. Un bloque PODRÁ tener varias peticiones separadas por líneas `###`. El texto que sigue a `###` es el nombre de la petición. La barra DEBERÁ dejar elegir cuál se envía, y el atajo de enviar DEBERÁ enviar la que tiene el cursor. El máximo es 20 peticiones por bloque.
- HT7. SI una petición tiene un error de sintaxis, el bloque DEBERÁ decir qué falla y en qué línea, y esa petición NO DEBERÁ poder enviarse. Un bloque mal escrito NUNCA DEBERÁ romper la nota.
- HT8. El bloque DEBERÁ verse como un bloque de código normal, sin perder nada (R24), en estos casos: con la extensión apagada, en Web y en Mobile, en la vista de código de la nota, en la vista previa y al exportar.
- HT9. MIENTRAS la extensión esté activa, el menú de bloques del editor de notas DEBERÁ ofrecer "Nuevo bloque: Cliente HTTP", que inserta en el cursor una petición de ejemplo y deja el cursor al final de la URL.

### Respuesta

- HT10. La respuesta DEBERÁ mostrar:
  - el código de estado y su texto;
  - el tiempo total, el tamaño del cuerpo y las cabeceras;
  - el cuerpo, formateado si es JSON o XML (con los formateadores de DevTools) y, si no, tal cual;
  - la petición que se envió, con la URL final, las redirecciones que se siguieron y los secretos ocultos.
- HT11. La respuesta NO DEBERÁ guardarse en la nota ni en el disco.
  - Se conserva en memoria por bloque y por petición, y sigue ahí al cambiar de nota o de sección.
  - Se borra al desactivar la extensión, al cerrar Logday o al cerrarla a mano.
  - Hay un tope: las 30 respuestas más recientes y 50 MB en total. Por encima, se olvidan las más viejas.
  - SI la petición cambió después de esa respuesta, la respuesta DEBERÁ decirlo.
  - *Enmendado el 31 oct 2026 (v2):* sigue valiendo para el cuerpo y las cabeceras de la respuesta. El historial (HT56) guarda de cada envío solo un resumen: el estado, los tiempos y los tamaños, nunca el cuerpo.
- HT12. **Respuestas grandes o binarias.**
  - SI el cuerpo pasa del tamaño máximo (HT24), DEBERÁ cortarse ahí y decirse que está cortado.
  - SI el cuerpo de texto pasa de 2 MB, DEBERÁN mostrarse solo los primeros 2 MB, aunque se copie o se guarde entero. Por encima de 200 KB, se muestra sin colores.
  - SI el cuerpo no es texto, NO DEBERÁ mostrarse como texto. Se muestran el tipo y el tamaño, y se ofrece "Guardar como archivo". Las imágenes PNG, JPEG, GIF y WebP de hasta 5 MB DEBERÁN verse como imagen.
  - ~~El HTML NUNCA DEBERÁ dibujarse como página: se muestra como texto.~~ *Enmendado el 31 oct 2026 (v2):* se muestra como texto, y además puede verse como página en una vista previa sin scripts ni red, solo si el usuario la pide (HT53).
- HT13. Mientras una petición está en curso, DEBERÁ poder cancelarse. Al cancelarla, Rust deja de esperar la respuesta y la conexión se cierra.
- HT14. El cuerpo de la respuesta DEBERÁ poder copiarse, y guardarse como archivo con el diálogo del sistema. Solo se escribe lo que el usuario elige y donde lo elige.

### Variables y entornos

- HT15. La URL, las cabeceras y el cuerpo PODRÁN llevar variables `{{nombre}}`. Se resuelven al enviar, con el entorno activo. Además, hay tres variables del sistema: `{{$uuid}}` (un UUID v4), `{{$timestamp}}` (segundos Unix) y `{{$isoTimestamp}}` (instante ISO 8601 en UTC).
- HT16. SI la petición usa una variable que no está definida en el entorno activo, o un secreto sin valor en este equipo, NO DEBERÁ enviarse. El bloque DEBERÁ decir cuáles faltan y en qué entorno, con un acceso para definirlas.
- HT17. Los entornos (por ejemplo, Local, Staging y Producción) DEBERÁN administrarse en Opciones → Cliente HTTP: crear, renombrar, duplicar y eliminar, y en cada uno, sus variables (nombre, valor y si es secreta).
  - Se guardan solo en este equipo y NO DEBERÁN sincronizarse (R9).
  - Eliminar un entorno o una variable DEBERÁ pedir confirmación con el patrón compartido (`ConfirmDeleteModal`, que respeta "Confirmar antes de eliminar").
- HT18. **Secretos.** El valor de una variable marcada como secreta DEBERÁ guardarse solo en el llavero del sistema (R10).
  - El webview lo escribe una vez y no lo vuelve a leer: el comando Rust lo pone en la petición al enviarla.
  - NUNCA DEBERÁ ir en la nota, en `config.json`, en `localStorage`, en los backups de configuración, en el sync ni en los logs.
  - En la interfaz, un secreto se muestra solo con su pista (`••••…a1b2`), también en la petición enviada.
- HT19. Hay un solo **entorno activo** para todas las peticiones. DEBERÁ poder cambiarse desde Opciones, desde la barra de cada bloque y desde la pantalla Cliente HTTP (HT33), y se recuerda en este equipo. "Sin entorno" es una opción válida: las peticiones sin variables se envían igual.
- HT20. **Entorno protegido.** Un entorno PODRÁ marcarse como "Pedir confirmación antes de enviar". MIENTRAS esté activo, enviar un POST, PUT, PATCH o DELETE DEBERÁ pedir una confirmación en el mismo bloque, con el método y el nombre del entorno. GET, HEAD y OPTIONS se envían sin preguntar.
- HT21. **Secretos a un host ajeno.** Cada entorno tiene sus hosts de confianza: los de sus variables cuyo valor es una URL, más los que el usuario agregue.
  - SI una petición lleva un secreto y su host no está en esa lista, DEBERÁ pedirse una confirmación en el bloque. La confirmación nombra las variables secretas y el host.
  - El comando Rust DEBERÁ comprobarlo también, después de poner los secretos, y rechazar el envío si no hay confirmación.
- HT22. "Quitar configuración" (R8) DEBERÁ borrar los entornos, las opciones y todos los secretos de la extensión en el llavero. Eliminar un entorno o una variable secreta, o dejar de marcarla como secreta, DEBERÁ borrar su secreto del llavero.

### Envío (Rust)

- HT23. Las peticiones DEBERÁN salir desde Rust (R17), con `reqwest`, nunca desde el webview.
  - Solo se admiten `http://` y `https://`. Nada de `file://`, `data:`, `ftp://` ni otros esquemas.
  - La URL NO DEBERÁ llevar usuario ni contraseña (`https://u:p@host`), porque quedarían escritos en la nota.
  - Las cabeceras DEBERÁN ser válidas: nombres de token HTTP, y valores sin saltos de línea.
  - El host lo escribe el usuario. Es la excepción a "solo a los hosts que la extensión declara" de R17 (ver Decisiones).
- HT24. **Límites.**
  - Tiempo límite: 30 s por defecto, de 1 a 300 s. Cuenta toda la petición, redirecciones y cuerpo incluidos.
  - Tamaño máximo de la respuesta: 10 MB por defecto, de 1 a 50 MB.
  - Cuerpo de la petición: hasta 10 MB.
  - Redirecciones: se siguen por defecto, hasta 10, y se pueden desactivar. SI la petición lleva un secreto, NO DEBERÁ seguirse una redirección a otro host: se muestra la respuesta 3xx.
  - Hasta 6 peticiones a la vez.
  - Los tres primeros valores se cambian en Opciones.
- HT25. **Certificados.** Los certificados TLS DEBERÁN verificarse siempre, salvo en dos casos:
  - el entorno activo tiene "Aceptar certificados no válidos";
  - tras un error de certificado, el usuario elige "Enviar sin verificar (solo esta vez)".
  En los dos casos, la respuesta DEBERÁ mostrar que el certificado no se verificó.
- HT26. Los errores DEBERÁN llegar al webview como un código que se traduce, con el host como único detalle. NUNCA DEBERÁN llevar la URL completa, las cabeceras, el cuerpo ni un secreto. La extensión no escribe nada en los logs.

### DevTools (enmendado el 31 oct 2026)

- ~~HT27. MIENTRAS Cliente HTTP y DevTools estén activas, DevTools DEBERÁ tener la herramienta "Cliente HTTP" en un grupo nuevo, "Red".~~ **Enmendado el 31 oct 2026, pedido por Jorge:** el formulario pasa a la pantalla propia de la extensión (HT33). DevTools ya no tiene el grupo "Red" ni la herramienta, y su D11 ("no envía nada fuera del equipo") vuelve a valer sin excepción (specs/devtools D11 y D25).
- ~~HT28. Lo que se escribe en esa herramienta, y su respuesta, viven en memoria, como el resto de DevTools (D9).~~ **Enmendado el 31 oct 2026:** lo mismo vale para el formulario de la pantalla (HT33). "Guardar en una nota" sigue; "Traer de una nota" lo reemplaza la columna "Peticiones" (HT34).

### Textos, teclado y accesibilidad

- HT29. Los textos DEBERÁN estar en español y en inglés, en español con tú y sin voseo: la sección `httpClient` de `i18n.ts` y las claves `http-client.*` de `extensions`.
- HT30. Todo DEBERÁ poder hacerse con el teclado, con el foco visible. Con el cursor dentro de un bloque `http`, ⌘↵ (Ctrl+Enter fuera de macOS) envía. El resultado de cada envío se anuncia a los lectores de pantalla.

## Decisiones

### Aprobadas por Jorge (31 oct 2026)

- No es un Postman completo: es una extensión opcional, apagada por defecto.
- Las peticiones van dentro de las notas, como bloque ```` ```http ```` con sintaxis de REST Client o Bruno, y usan el punto de extensión de bloques (R24), como Excalidraw.
- Las peticiones se sincronizan porque son notas. La respuesta no se guarda en la nota.
- Las variables y los entornos se guardan solo en este equipo, y los secretos en el llavero.
- Hay una herramienta "Cliente HTTP" en DevTools para las pruebas sin guardar, con "Guardar en una nota". *Enmendada el 31 oct 2026: es una pantalla propia (HT33).*
- Las peticiones salen desde Rust (por CORS y por R17), y la extensión lleva el aviso de R6.
- Quedan fuera de la primera versión: scripts pre y post, OAuth guiado, WebSockets y gRPC, importar colecciones de Postman y los tests automáticos.

### Aprobadas por Jorge (31 oct 2026): las 10 de `design.md`, Interfaz §10, tal como las recomienda el diseño

1. **Edición en la nota, no en un modal.** El código del bloque `http` se ve y se edita como un bloque de código normal, y la extensión le pone una barra encima y la respuesta debajo. Hace falta un modo nuevo del punto de extensión: `noteBlock.inline` (design §A3). Excalidraw sigue con su editor aparte.
2. **Un entorno activo global**, no uno por nota, con selector en cada bloque. Para no enviar a producción sin querer están los entornos protegidos (HT20).
3. **Confirmación de secretos a un host ajeno (HT21).** No estaba en el pedido, pero cierra un riesgo real: una nota creada por el agente de MCP, o pegada de otro lado, podría mandar `{{token}}` a cualquier sitio.
4. **Entorno protegido:** confirma solo POST, PUT, PATCH y DELETE. Confirmar también los GET acostumbra a pulsar "Enviar" sin leer.
5. ~~**"Red" es un grupo nuevo de DevTools**, al final de la lista (D24), con una sola herramienta por ahora.~~ **Enmendada el 31 oct 2026, pedido por Jorge:** no encontraba la herramienta (no tenía Cliente HTTP activa) y le pareció confuso que una extensión con su propia opción en Extensiones viviera dentro de otra. El Cliente HTTP tiene su propia pantalla (HT33) y DevTools vuelve a sus seis grupos.
6. **`Content-Type: application/json` automático** cuando el cuerpo es JSON válido y la petición no trae `Content-Type`. Se marca como "Agregada por Logday" en la petición enviada.
7. **Variables del sistema:** `{{$uuid}}`, `{{$timestamp}}` y `{{$isoTimestamp}}`.
8. **Vista previa de las imágenes** PNG, JPEG, GIF y WebP de hasta 5 MB.
9. **Resaltado `http` en todas las notas**, aunque la extensión esté apagada (≈1 KB).
10. **Solo HTTP/1.1** en la primera versión: `reqwest` está compilado sin la feature `http2`.

Además, del diseño:

- **R17:** el host de cada petición lo pone el usuario, y solo se contacta cuando él lo pide. Se documenta como excepción en `specs/extensiones`.
- **Sin variables dentro de la nota** (`@baseUrl = …` de REST Client) en la primera versión. Sería cómodo, pero invita a escribir tokens en la nota, que se sincroniza en texto plano.

## Fuera de alcance (por ahora)

*Revisado el 31 oct 2026 con el Cliente HTTP v2:* entran importar de Postman, Insomnia, Bruno y OpenAPI (HT62–HT69), los cuerpos desde un archivo y `multipart/form-data` (HT45–HT49) y el historial (HT56–HT58). Siguen fuera:

- Scripts antes y después de la petición, tests automáticos y encadenar peticiones (usar la respuesta de una en otra; el paquete C del diseño v2).
- OAuth guiado, Digest, NTLM, AWS v4 y certificados de cliente (mTLS).
- GraphQL como tipo propio, WebSockets, gRPC, Server-Sent Events y respuestas en streaming (el paquete E).
- Variables dentro de la nota (`@nombre = valor`), variables anidadas (`{{a}}` dentro del valor de otra) y variables comunes a todos los entornos.
- Un almacén de cookies entre peticiones. Cada petición va sola.
- HTTP/2 y el proxy del sistema en macOS. Sí se respetan `HTTP_PROXY` y `HTTPS_PROXY`.
- Enviar desde Web o Mobile. Allí el bloque se ve como código (HT8).

## Cambio del 31 oct 2026

- HT31. SI la respuesta trae el valor de un secreto (en las cabeceras o en un cuerpo de texto; por ejemplo, un servidor de eco), Rust DEBERÁ cambiarlo por su marca `{{$secret:<clave>}}` antes de devolverla, para que nunca llegue al webview ni se muestre. Lo pidió Jorge tras probar con httpbin.

## Cambio del 31 oct 2026: pantalla propia

Pedido por Jorge: no encontraba el Cliente HTTP de DevTools (no tenía la extensión activa) y le pareció confuso que una extensión con su propia opción en Extensiones viviera dentro de otra. Decidió darle su pantalla, completa. Reemplaza HT27 y HT28 (enmendados arriba) y la decisión 5.

- HT33. **Pantalla propia.** MIENTRAS la extensión esté activa, el menú lateral DEBERÁ tener la sección "Cliente HTTP", con el ícono `Globe` (`view: true` en el registro; specs/extensiones R11 y R13, specs/navegacion-secciones NS7). La pantalla tiene, a la derecha, el formulario que antes estaba en DevTools:
  - método, URL, cabeceras y cuerpo, el entorno activo (HT19), Enviar (⌘↵, Ctrl+Enter fuera de macOS, o Enter en la URL) y Cancelar (o Esc) mientras se envía;
  - la misma vista de respuesta que los bloques (HT10–HT14), y las mismas confirmaciones, límites y errores, porque se envía con el mismo motor (HT3, HT20, HT21, HT24);
  - "Guardar en una nota", que crea una nota con la petición en un bloque `http`, con los nombres de las variables y nunca sus valores (HT18);
  - lo que se escribe y la respuesta viven en memoria y se olvidan al desactivar la extensión (HT11); nada se escribe en la nota de la que vino la petición.
  - *Enmendado el 31 oct 2026 (v2):* la nota de la que vino se reescribe solo con "Guardar en la nota" (HT50), que es explícito y avisa si la nota cambió; sin pulsarlo, la nota no se toca. Lo enviado desde la pantalla queda en el historial (HT56).
- HT34. **Columna "Peticiones".** A la izquierda, la pantalla DEBERÁ listar las peticiones de los bloques `http` de todas las notas, de todas las carpetas, agrupadas por nota:
  - cada nota con su título ("Sin título" si no tiene), y dentro, cada petición con su método y su URL sin el esquema; un bloque con varias peticiones separadas por `###` muestra cada una, con su nombre si lo tiene;
  - un bloque mal escrito NO DEBERÁ romper la lista: sus peticiones se ven marcadas "con errores"; un bloque vacío no aporta ninguna;
  - un buscador que filtra por el título de la nota, el nombre, el método o la URL, sin distinguir tildes ni mayúsculas;
  - al elegir una, se carga en el formulario y la pantalla dice de qué nota viene, con "Abrir la nota". Si tiene un error en la nota, el formulario lo avisa;
  - "Nueva petición" vacía el formulario;
  - sin peticiones, DEBERÁ explicar cómo crear una: escribir un bloque ```` ```http ```` en una nota, o "Nueva petición" y guardarla;
  - la lista se lee de disco al abrir la pantalla, con "Actualizar", y al cambiar las notas en la app (crear, editar, sincronizar). No vigila el disco.
- HT35. **Ayuda.** La sección DEBERÁ tener su ayuda contextual propia (specs/ayuda-contextual AY30): la columna, el formulario, los entornos y secretos, ⌘↵, y que los bloques `http` de las notas también se envían desde la nota.
- Opciones → Cliente HTTP, al pie, DEBERÁ apuntar a la pantalla ("Abrir Cliente HTTP"), no a DevTools. El aviso de R6 y la descripción de la extensión nombran la pantalla en vez de DevTools.

## Cambio del 31 oct 2026: lenguaje, método y cURL en la barra del bloque

Pedido por Jorge al probar: al pasar un bloque a HTTP se abría bien la petición, pero ya no podía cambiarle el lenguaje (a JSON o a Java, por ejemplo) sin quitar el formato de código y volver a ponerlo, porque los bloques de las extensiones no tienen el selector de lenguaje de los bloques normales. Pidió además poder cambiar el método (GET, POST, PUT…) y que se cambie el texto de la petición.

- HT36. **Método.** MIENTRAS la nota se pueda editar, la barra del bloque DEBERÁ tener un selector con el método de la petición de la barra (la del cursor o la elegida, HT6) y los siete métodos de HT5. Al elegir otro, DEBERÁ reescribir solo el método en la línea de esa petición: la URL, el `HTTP/1.1`, las cabeceras, el cuerpo, los comentarios y las demás peticiones quedan igual. Una línea que es solo una URL recibe el método delante. Si con GET o HEAD la petición tiene cuerpo, el cuerpo NO DEBERÁ borrarse: sale el aviso de siempre (`getWithBody`, `headWithBody`) y se anuncia. El cambio se deshace con ⌘Z en un paso y el cursor se queda donde estaba.
- HT37. **Copiar como cURL.** La barra DEBERÁ tener "Copiar como cURL", que copia la petición de la barra como comando `curl -X MÉTODO 'url' -H 'Nombre: valor' --data-raw '…'`, con las comillas simples escapadas para sh y zsh. Las variables y los secretos DEBERÁN quedar como `{{nombre}}`, NUNCA con su valor (HT18). Lleva el `Content-Type: application/json` que Logday agrega a un cuerpo JSON (decisión 6). HEAD va con `--head` y sin cuerpo, como se envía. Con un error de sintaxis, la acción no está disponible.
- HT38. **Lenguaje del bloque.** MIENTRAS la nota se pueda editar, la etiqueta "HTTP" de la barra DEBERÁ ser un selector con los mismos lenguajes que el de los bloques de código normales. Al elegir otro, el bloque pasa a ese lenguaje y se ve como código normal, con su selector de siempre; el texto no cambia. Es una acción de la base de extensiones (specs/extensiones R24), así que sirve a cualquier bloque inline.

## Cambio del 31 oct 2026: pegar un cURL

Pedido por Jorge (31 oct 2026): "si pego un curl en una nota, que automáticamente distinga que es una request". Hasta ahora un `curl …` pegado quedaba como texto.

Los dos últimos requisitos se llamaban HT40 y HT41. El 31 oct 2026 pasaron a HT39b y HT39c, para que HT40–HT69 sean los del Cliente HTTP v2 con los números con que los aprobó Jorge.

- HT39. **Pegar un cURL en una nota.** MIENTRAS la extensión esté activa, pegar en el editor de notas un texto que es un único comando `curl` DEBERÁ crear un bloque ```` ```http ```` con la petición equivalente:
  - fuera de un bloque de código, en un bloque nuevo, con el cursor al final de su código; dentro de un bloque `http`, el código convertido como texto; dentro de un bloque de otro lenguaje (bash, JSON…), el texto tal cual;
  - el método, la URL, las cabeceras y el cuerpo de las opciones de curl que cambian la petición (`-X`, `-H`, `-d` y sus variantes, `--json`, `-G`, `-I`, `-u`, `-A`, `-e`, `-b`, `--url`, `--url-query`, `--oauth2-bearer`, `-r`); las que no la cambian (`-L`, `-s`, `-k`, `-o`, `--compressed`…) se ignoran. El método es el explícito; si no, HEAD con `-I`, POST con datos y GET sin ellos. Un cuerpo JSON se formatea con 2 espacios, sin cambiar sus valores;
  - SI el texto no es un único comando que el bloque pueda escribir (otro comando, `|`, `&&`, `;`, una redirección, un cuerpo o cabeceras desde un archivo con `@`, un formulario `-F`, `-T`, otro esquema que http o https, un método que no es de HT5), NO DEBERÁ convertirse: se pega tal cual, como antes;
  - "Pegar sin formato" (⇧⌘V) pega tal cual. ⌘Z justo después DEBERÁ dejar el texto original pegado; otro ⌘Z lo quita;
  - con la extensión apagada, pegar no cambia.
- HT39b. **Valores sensibles del cURL.** El bloque queda en la nota, que se sincroniza, así que los valores sensibles NUNCA DEBERÁN quedar escritos en él (HT18): se cambian por variables `{{nombre}}`, que se resuelven con el entorno activo (HT15):
  - `Authorization` y `Proxy-Authorization`, con el esquema a la vista (`Bearer {{token}}`, `Basic {{basic_auth}}`); `Cookie` y `-b` (`{{cookie}}`); `-u` y el usuario y la contraseña de la URL (`Basic {{basic_auth}}`). *Enmendado el 31 oct 2026 (v2, design §14.14):* `-u usuario:contraseña` y el usuario de la URL dan `Authorization: Basic {{username}}:{{password}}`, con dos variables, y Rust codifica en Base64 al enviar (HT44); ya no hace falta guardar el valor en Base64 a mano;
  - las cabeceras, los parámetros de la query y los campos de un cuerpo JSON o de formulario cuyo nombre contiene `token`, `api-key`/`apikey`, `secret`, `password`, `session`, `credential` o `signature` (o es `key`, `auth`, `pwd` o `pass`);
  - lo que ya es una variable (`{{token}}`, o `$TOKEN` del shell, que pasa a `{{TOKEN}}`) se deja.
  SI se cambió algún valor, DEBERÁ avisarse una vez con los nombres de las variables y "Abrir Entornos", para guardarlos como secretos. El valor real NO DEBERÁ guardarse en la nota, en `config.json`, en `localStorage` ni en el llavero: lo guarda el usuario en Entornos, si quiere.
- HT39c. **Pegar un cURL en la pantalla.** Pegar un comando cURL en la URL de la pantalla Cliente HTTP (HT33) DEBERÁ rellenar el formulario entero (método, URL, cabeceras y cuerpo) con las mismas reglas de HT39 y HT39b. Lo pegado reemplaza lo que había en el formulario; no se deshace con ⌘Z.


## Cliente HTTP v2 (aprobado el 31 oct 2026)

Propuesta de diseño del 31 oct 2026 a partir de lo que Jorge echaba de menos de Postman, Insomnia y Bruno. Entran tres paquetes: **A**, el editor de la petición (HT40–HT50); **B**, la respuesta (HT51–HT59), y **D**, importar y generar código (HT60–HT69). Quedan fuera **C** (scripts, tests y encadenar peticiones) y **E** (GraphQL, WebSocket y SSE); el diseño deja preparado lo que necesitarán (design §14.13).

**La regla que ordena todo:** la fuente de verdad es el **texto** del bloque. Las tablas, la pestaña Auth y el selector de cuerpo son vistas de ese texto: cada edición en una vista reescribe solo las líneas afectadas, y al editar el texto se actualizan las vistas. No hay estado oculto (ni JSON aparte, ni metadatos fuera de la nota, ni directivas propias que REST Client no entienda), con una única excepción local que no viaja: los permisos de archivo de HT48. Todo lo que se escribe es compatible con REST Client y con el cliente HTTP de JetBrains, salvo los campos de form desactivados (HT46).

### Editor de la petición (paquete A)

- HT40. **Editor en pestañas.** La pantalla Cliente HTTP DEBERÁ editar la petición con las pestañas **Params**, **Cabeceras**, **Auth**, **Cuerpo** y **Texto**, bajo la fila del método y la URL.
  - Lo que se edita es el texto de una petición, y las pestañas son vistas de ese texto.
  - Editar una tabla DEBERÁ reescribir solo las líneas de esa fila o de su zona; el resto del texto, comentarios incluidos, queda igual.
  - Editar la pestaña Texto DEBERÁ actualizar las demás vistas; los errores se muestran con la misma pausa de 300 ms que en el bloque.
  - SI una zona tiene un error de sintaxis, su tabla DEBERÁ quedar de solo lectura, con el error e "Ir al texto": una tabla no pisa un texto que no entiende.
- HT41. **Params.** La tabla DEBERÁ listar, en orden, los parámetros de la URL y de las líneas `?`/`&`, activos y desactivados.
  - Un parámetro desactivado es una línea `# &nombre=valor` en la zona de la query (después de la línea de la petición o entre líneas `&`). Para REST Client es un comentario, que es justo lo que significa. Dentro de esa zona se admiten comentarios.
  - Al editarla se respeta el estilo que hay: en la URL o en líneas aparte. Si no hay query, se escribe en la URL.
  - Al desactivar una fila de la URL, la fila pasa a una línea propia (`# &k=v`) y la URL se queda sin ella.
  - Los valores se muestran como están escritos. Al escribir, solo se codifican los caracteres que romperían la query (el espacio, `&`, `#`, y `=` en el nombre); las `{{variables}}` nunca se codifican.
  - El campo URL y la tabla DEBERÁN mantenerse al día entre sí.
- HT42. **Cabeceras.** La tabla DEBERÁ listar las cabeceras con una casilla para activar o desactivar cada fila. Una cabecera desactivada es un comentario `# Nombre: valor` en la zona de las cabeceras; un comentario de esa zona con forma de cabecera cuenta como fila desactivada (`# TODO: revisar` aparece como la cabecera "TODO": es inofensivo, porque no se envía). Los comentarios de antes de la línea de la petición nunca son filas. Las cabeceras repetidas son filas aparte. Debajo, en solo lectura, van las que agrega Logday (`Content-Type` de JSON y `User-Agent`), marcadas "Agregada por Logday".
- HT43. **Auth.** La pestaña Auth DEBERÁ ofrecer *Ninguna*, *Bearer*, *Basic* y *API key* (en una cabecera o en la query), y además *Otra*, que muestra tal cual una `Authorization` que no reconoce.
  - Lo elegido DEBERÁ escribirse como una cabecera o un parámetro normal (`Authorization: Bearer {{token}}`, `Authorization: Basic {{user}}:{{password}}`, `X-API-Key: {{apiKey}}`, `&api_key={{apiKey}}`), nunca como una directiva aparte.
  - Los valores DEBERÁN ser `{{variables}}`. SI el usuario escribe o pega un valor literal, DEBERÁ ofrecerse "Guardar como secreto": crea una variable secreta en el entorno elegido (el activo de serie), pone `{{nombre}}` en el campo y el valor no llega nunca a la nota.
  - Auth reconoce una API key así: una cabecera o un parámetro activo cuyo valor es exactamente `{{var}}`, si `var` es un secreto del entorno activo o su nombre es de credencial (`token`, `api-key`, `secret`, `password`…, las mismas reglas que al pegar un cURL, HT39b).
- HT44. **Basic en Rust.** SI una cabecera `Authorization` o `Proxy-Authorization` es `Basic` y sus credenciales, sin los secretos puestos, tienen `:` o un espacio, Rust DEBERÁ codificar `usuario:contraseña` en Base64 *después* de poner los secretos, como REST Client y JetBrains (`Basic usuario contraseña` equivale a `usuario:contraseña`). Base64 nunca lleva `:` ni espacios, así que `Basic dXNlcjpwYXNz` o `Basic {{basic_b64}}` se envían tal cual. La pestaña Petición DEBERÁ mostrar `Basic ana:••••…a1b2` con la marca "Codificada por Logday".
- HT45. **Tipos de cuerpo.** La pestaña Cuerpo DEBERÁ tener un selector: Ninguno, JSON, Form (urlencoded), Multipart, Texto (texto, XML, HTML, JavaScript o YAML) y Archivo.
  - El tipo se deduce del texto, en este orden: una línea `< ruta` sola → Archivo; `Content-Type` multipart con boundary → Multipart; urlencoded → Form; JSON, o un cuerpo que parece JSON → JSON; lo demás → Texto.
  - Cambiar de tipo DEBERÁ poner el `Content-Type` que corresponde (reemplazando el valor de la línea que hay, o agregándola) y convertir el cuerpo cuando se puede.
  - Lo que no se puede convertir se guarda en memoria por tipo, como Postman: al volver al tipo anterior, vuelve su cuerpo. La nota solo tiene un cuerpo.
- HT46. **Form.** La tabla DEBERÁ editar los campos con su casilla. Un cuerpo de una línea se mantiene en una; al desactivar un campo, el cuerpo pasa a una línea por campo y el desactivado queda como `# &k=v` (**solo Logday**: REST Client lo enviaría como texto). Al enviar, Logday quita esas líneas y une las demás.
- HT47. **Multipart.** La tabla DEBERÁ editar las partes: nombre, tipo (Texto o Archivo), valor o archivo, y un `Content-Type` opcional. Escribe la sintaxis de REST Client (partes separadas por el boundary, `LogdayBoundary` si lo pone Logday, y `< ./ruta` como contenido de un archivo), y Rust arma el cuerpo con CRLF. Las partes no se desactivan en v1: se eliminan.
- HT48. **Archivos locales.** Una línea `< ruta` del cuerpo DEBERÁ tratarse como una etiqueta.
  - Rust DEBERÁ enviar el archivo solo si el usuario lo eligió **en este equipo**, con el diálogo del sistema, para esa nota y esa etiqueta. NUNCA DEBERÁ leer un archivo por la ruta escrita en la nota.
  - Cuando Logday escribe la línea, usa `./<nombre del archivo>`, sin carpetas, para que la nota sincronizada no lleve rutas de este equipo.
  - SI la etiqueta no tiene un archivo elegido en este equipo (una nota sincronizada desde otro equipo, o una ruta escrita a mano), la petición NO DEBERÁ poder enviarse. El bloque y la pantalla DEBERÁN decir qué archivo falta y ofrecer "Elegir archivo…".
  - SI el archivo elegido ya no existe o pasó del límite, DEBERÁ decirse al enviar, sin enviar nada.
  - `<@ ./x` (archivo con variables de REST Client) se envía sin sustituir las variables, con un aviso.
- HT49. **Límites de los archivos.** Un cuerpo con archivos DEBERÁ medir como mucho **50 MB** en total; el cuerpo de texto sigue en 10 MB (HT24). Se comprueba al elegir el archivo (aviso) y al enviar (error). El contenido se lee en memoria en el momento de enviar, no antes.
- HT50. **Guardar en la nota.** MIENTRAS la petición de la pantalla venga de una nota y tenga cambios, la pantalla DEBERÁ ofrecer "Guardar en la nota" (⌘S).
  - Reemplaza en la nota solo esa sección del bloque.
  - SI la sección cambió en la nota desde que se cargó, DEBERÁ preguntarse "La nota cambió desde que abriste esta petición", con dos salidas: "Reemplazar en la nota" y "Guardar como petición nueva" (otra sección `###` al final del mismo bloque, o una nota nueva si el bloque ya tiene 20).
  - Los permisos de archivo de la petición pasan a la nota de destino.
  - Nunca se guarda solo: sin pulsarlo, la nota no se toca.
  - La barra del bloque en la nota DEBERÁ tener "Editar en Cliente HTTP", que abre la pantalla con esa petición cargada.
  - "Guardar en una nota" (HT33), que crea una nota nueva, pasa a llamarse "Nueva nota" para no confundir los dos.

### Respuesta (paquete B)

- HT51. **Árbol JSON.** SI el cuerpo es JSON válido de hasta 5 MB, la pestaña Cuerpo DEBERÁ ofrecer la vista **Árbol**, además de Formateado y Sin formato. Los nodos se pliegan; al abrir se ven desplegados los dos primeros niveles; plegados, los arreglos y objetos muestran su tamaño (`[12]`, `{4}`); los arreglos de más de 200 elementos muestran 200 con "Mostrar 200 más"; cada nodo DEBERÁ poder copiarse (su valor en JSON) y copiar su ruta (`$.data[0].id`). La última vista elegida se recuerda en este equipo (preferencia de UI local).
- HT52. **Filtro.** Sobre el árbol, un campo DEBERÁ filtrar por **texto** (sin distinguir tildes ni mayúsculas, en las claves y los valores escalares; deja las ramas que coinciden, desplegadas y resaltadas) o por **ruta**, si empieza por `$`: un subconjunto de JSONPath (`.clave`, `['clave']`, `[n]`, `[a:b]`, `*`, `..` y filtros `[?(@.k == v)]` con `== != < <= > >=` contra un número, un texto, `true`, `false` o `null`), **sin evaluar código**. El resultado es una lista de coincidencias (ruta y valor) con el total. Una ruta mal escrita DEBERÁ decir qué falla y en qué posición.
- HT53. **Vista previa HTML** (enmienda HT12). SI el cuerpo es `text/html`, la pestaña Cuerpo DEBERÁ ofrecer "Código | Vista previa". La vista previa es un iframe `sandbox` sin `allow-scripts` ni `allow-same-origin`, con una CSP sin red y `srcdoc`. Se abre siempre en "Código"; la vista previa se pide, y DEBERÁ decirse que no se cargan imágenes, estilos ni fuentes externos.
- HT54. **Cookies.** SI la respuesta trae `Set-Cookie`, DEBERÁ haber una pestaña **Cookies {n}** con una fila por cookie: nombre, valor, dominio, ruta, caducidad y las marcas HttpOnly, Secure y SameSite. Las cookies NO DEBERÁN guardarse ni enviarse en otras peticiones. Se leen de las cabeceras que ya llegaron enmascaradas (HT31).
- HT55. **Tiempos.** La respuesta DEBERÁ mostrar, por cada salto (redirecciones incluidas), la **espera** (desde que se envía hasta las cabeceras: incluye DNS, conexión y TLS si se abrió una conexión nueva, la subida del cuerpo y el tiempo del servidor), la **descarga** (de las cabeceras al último byte), el **total** y la dirección IP y el puerto a los que se conectó. NO DEBERÁ mostrar DNS, conexión ni TLS por separado, salvo con HT55b.
- HT55b. MIENTRAS "Medir la conexión" esté activa en Opciones (apagada de serie), cada envío DEBERÁ usar una conexión nueva, sin reutilizar ninguna, y mostrar también **DNS** y **Conexión y TLS** (juntos), con la nota de que con conexión nueva los tiempos son algo más altos.
- HT56. **Historial: qué guarda.** Cada envío, desde una nota o desde la pantalla, terminado en respuesta, error o cancelación, DEBERÁ guardar una entrada en el historial local: el momento, el método, la URL final enmascarada y el entorno; el **texto de la petición sin resolver** (con `{{nombre}}`), hasta 64 KB (más grande, sin el cuerpo y con la marca "cuerpo no guardado"); el estado o el código de error, los tiempos y los tamaños; y de dónde vino (la nota y la petición, o la pantalla). NUNCA DEBERÁ guardar el valor de un secreto, el cuerpo ni las cabeceras de la respuesta, ni las cookies. Rust enmascara cualquier valor de secreto que aparezca, y las cabeceras sensibles escritas con un valor literal (`Authorization`, `Cookie`, `Proxy-Authorization` y las de nombre de credencial) se guardan como `••••`.
- HT57. **Historial: dónde y cuánto.** Se guarda en `app_local_data_dir()/http-client/history.jsonl`, escrito solo por Rust. NO DEBERÁ ir en la nota, en `config.json`, en `localStorage`, en los backups ni en el sync. Tope: **500 entradas y 30 días**, configurable de 50 a 5000 entradas y de 1 a 365 días; se recorta al empezar y al escribir. En Opciones: "Guardar el historial" (activado de serie) y "Borrar el historial" (con `ConfirmDeleteModal`). "Quitar configuración" (R8) DEBERÁ borrarlo; desactivar la extensión, no.
- HT58. **Historial: usarlo.** La columna de la pantalla DEBERÁ tener la pestaña **Historial**, con las entradas de la más reciente a la más vieja, agrupadas por día y filtradas por el mismo buscador. Al elegir una, se carga como petición nueva ("Del historial · 14:05"), con "Abrir la nota" si vino de una nota que existe. Cada entrada se elimina sola, con "Deshacer" en el toast y sin confirmar. Como el historial no guarda la respuesta, al cargar una entrada se ve solo el resumen guardado, con "Volver a enviar".
- HT59. **Guardar la respuesta.** Además de HT14: "Guardar la respuesta completa…" escribe la línea de estado, las cabeceras y el cuerpo de texto, ya enmascarados, en un `.http` o un `.txt`. SI el cuerpo se cortó por el tope (HT24), DEBERÁ ofrecerse "Descargar entero a un archivo…": Rust repite la petición y escribe directo en un archivo elegido con su diálogo, hasta 2 GB, con el progreso y "Cancelar". Es un envío nuevo y pide sus confirmaciones (HT3, HT20, HT21).

### Importar y generar (paquete D)

- HT60. **Copiar como…** "Copiar como cURL" (HT37) DEBERÁ pasar a ser el menú **"Copiar como…"**, con cURL, JavaScript (fetch), Python (requests), Go (net/http) y Java (HttpClient), en la barra del bloque y en la pantalla.
  - Las variables y los secretos DEBERÁN quedar como `{{nombre}}`, NUNCA con su valor.
  - Las filas desactivadas NO DEBERÁN aparecer.
  - Basic va con la ayuda de cada lenguaje (`-u`, `auth=(…)`, `SetBasicAuth`, `Base64.getEncoder()`), sin codificar; un archivo, como su etiqueta; el `Content-Type` automático de JSON, como en cURL.
  - Java con multipart queda deshabilitado en el menú, con la razón.
- HT61. **Código.** La pantalla DEBERÁ tener un panel "Código" bajo la petición, con las mismas pestañas de lenguaje, el código resaltado y "Copiar". Se actualiza al editar.
- HT62. **Formatos.** "Importar…" DEBERÁ aceptar, reconociéndolos por su contenido y no por la extensión: Postman (colección v2.1 y v2.0, y entornos), Insomnia (export v4 en JSON y v5 en YAML), Bruno (una carpeta de colección o su export JSON) y OpenAPI 3.0 y 3.1 y Swagger 2.0, en JSON o YAML. Importar NUNCA DEBERÁ enviar una petición ni leer otra cosa que lo elegido (HT3).
- HT63. **Vista previa.** Antes de escribir nada, DEBERÁ mostrarse qué se va a crear: la carpeta de destino (con nombre editable; si existe, "Nombre (2)"); cuántas notas, peticiones, entornos y variables; los **secretos encontrados**, cada uno con "Guardar en el llavero" (marcado de serie) o "Dejar vacío" y el valor nunca visible, solo su pista; y los avisos (scripts omitidos, autenticaciones no admitidas, archivos que habrá que elegir, peticiones que no se pudieron convertir). Solo "Importar" escribe; "Cancelar" no deja nada.
- HT64. **Notas.** Cada colección DEBERÁ dar una carpeta de notas. Cada carpeta de la colección (o tag de OpenAPI) DEBERÁ dar una **nota**; las subcarpetas dan subcarpetas hasta 4 niveles y, más hondo, se aplanan ("A / B"). Las peticiones sueltas de la raíz van a una nota con el nombre de la colección. Cada petición lleva un título `## Nombre`, su descripción en Markdown si la tiene y **un bloque ```http con una sola petición** (`### Nombre` y la petición).
- HT65. **Entornos y variables.** Cada entorno importado DEBERÁ dar un entorno de Logday (si el nombre existe, con la colección entre paréntesis). Las variables de la colección se copian en cada entorno importado, y ganan las del entorno; si no viene ninguno, se crea uno con el nombre de la colección. En OpenAPI, cada servidor da un entorno con `baseUrl`, y las URL usan `{{baseUrl}}`. Los hosts de confianza salen, como siempre, de las variables del entorno (HT21). Las variables de Insomnia (`{{ _.x }}`) y de Bruno (`process.env.X`) se reescriben a `{{x}}`; `{{$guid}}` y `{{$randomUUID}}` de Postman pasan a `{{$uuid}}`, `{{$timestamp}}` se queda, y las demás `{{$…}}` se dejan con un aviso.
- HT66. **Secretos al importar.** Un valor DEBERÁ tratarse como secreto si viene marcado (`type: "secret"` en Postman, `secret` en Bruno), si es un campo de autenticación (token de Bearer, contraseña de Basic, valor de una API key, tokens de OAuth 2) o si su nombre es de credencial. Un secreto NUNCA DEBERÁ escribirse en una nota: con "Guardar en el llavero" pasa a una variable secreta; con "Dejar vacío", la variable se crea sin valor y la petición pide escribirlo (HT16). Un literal dentro de una petición se reemplaza por una variable, con los nombres de la importación de cURL (`token`, `password`, `apiKey`, `token_2`…).
- HT67. **Lo que no se importa.** Los scripts NO DEBERÁN ejecutarse: se omiten y se cuentan; una opción apagada de serie los copia a la nota como texto (un bloque ```js plegado, con el aviso de que pueden tener tokens escritos a mano). La autenticación heredada se escribe en cada petición; OAuth 2 queda como `Bearer {{access_token}}` con la variable vacía y un comentario que explica cómo conseguir el token. Digest, NTLM, AWS v4, Hawk y certificados de cliente quedan como un comentario y un aviso. Los archivos de `formdata` y `file` pasan a etiquetas `< ./nombre` sin permiso (HT48). GraphQL pasa a JSON `{"query", "variables"}` con POST. Cookies, ejemplos de respuesta y *mocks* se ignoran.
- HT68. **Límites de la importación.** El archivo DEBERÁ pesar como mucho 20 MB, y la importación tener como mucho 2000 peticiones y 300 notas; por encima, la vista previa lo dice y no deja importar. Una importación grande escribe por tandas con el progreso. Al terminar: "Se crearon {n} notas en «{carpeta}»", con "Abrir la carpeta" y "Deshacer la importación", que borra lo creado (notas, carpeta, entornos y secretos) sin pedir confirmación.
- HT69. **OpenAPI.** Cada operación da una petición con el nombre `summary` (o `operationId`, o el método y la ruta). Los params de la ruta `{id}` pasan a `{{id}}`; los de la query, los obligatorios activos y los opcionales desactivados (`# &limit=`), con su `example` o `default`. El cuerpo sale de `example`/`examples` o se genera del esquema (hasta 4 niveles, `$ref` locales, ciclos cortados), prefiriendo JSON, después form y después multipart. Los `securitySchemes` bearer, basic y apiKey dan la Auth correspondiente, con variables secretas vacías.

### Aprobadas por Jorge (31 oct 2026): las 8 decisiones del diseño v2, tal como las recomienda

1. **Tablas solo en la pantalla, con "Guardar en la nota" explícito y aviso de conflicto** (HT50). El bloque ya es el texto, y otra vista dentro de la nota la vuelve pesada; guardar solo, en cada cambio, escribiría en una nota sincronizada desde otra pantalla mientras el editor la tiene abierta.
2. **Tope del cuerpo con archivos: 50 MB, leídos en memoria al enviar** (HT49). Más grande pide *streaming* desde disco, que cabe en B3 si hace falta.
3. **Campos de form desactivados con `# &k=v`**, aunque solo los entienda Logday (HT46): las colecciones de Postman los traen a menudo. Las partes multipart no se desactivan en v1.
4. **Historial activado de serie, sin cuerpos ni cabeceras de respuesta, 500 entradas y 30 días** (HT56, HT57). Guardar respuestas metería tokens de login y datos personales en el disco y contradiría HT11.
5. **Tiempos: espera, descarga, total y dirección remota** en B1 (HT55); "Medir la conexión" (DNS y conexión) como opción en B3, apagada de serie (HT55b). `reqwest` 0.12 no da los tiempos por fase, y medirlos bien pide un cliente de un solo uso.
6. **"Descargar entero a un archivo"**, con *streaming* y hasta 2 GB, en B3 (HT59): el mismo canal sirve después para SSE. En B1 basta "Guardar como archivo" de lo recibido.
7. **Java con multipart deshabilitado en "Copiar como…"**, con la razón (HT60).
8. **Scripts de Postman al importar: omitirlos, contarlos y ofrecer copiarlos como texto, apagado de serie** (HT67).
