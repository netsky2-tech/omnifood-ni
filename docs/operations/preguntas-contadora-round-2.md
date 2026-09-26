# Segunda ronda de consultas — sistema de facturación OmniFood (SOHO)

**Contexto.** Sus respuestas anteriores las transmitió el titular del negocio y quedaron
registradas textualmente en nuestro expediente técnico (referencia interna: incidencia #535
y directiva D-11). Sirvieron para cerrar siete puntos y para corregir decisiones que
habíamos tomado mal — en particular, que un cajero pueda anular su propio ticket sin
supervisor presente, lo cual nosotros no habíamos contemplado.

Este documento contiene lo que queda. Cuatro preguntas y tres datos.

Una regla de trabajo que aplica a todo lo siguiente: **no interpretamos la normativa.**
Donde una respuesta depende de una lectura de la ley, preguntamos en lugar de resolver.
Hasta ahora eso nos ahorrió tres errores publicados.

---

## Pregunta 8 — Qué es "el día" cuando un turno cruza la medianoche

*(Bloquea la validación de anulación y los reportes X/Z.)*

Usted escribió que el cajero puede anular una factura emitida por él **"durante su turno
actual y en la misma fecha fiscal"**. La primera parte ya está construida: desde la
última versión del sistema, cada factura queda ligada al turno en que se emitió.

La segunda parte no la podemos implementar, y preferimos decirlo antes que adivinarla.
**El sistema no tiene ningún concepto de "fecha fiscal".** Lo que existe es la hora de
apertura y de cierre de un turno, y la hora exacta en que se emitió cada factura. Nada
más.

El problema aparece cuando un turno cruza la medianoche:

| | Factura A | Factura B | Anulación |
|---|---|---|---|
| Reloj | 21:40 | 00:15 | 00:20 |
| Mismo turno | sí | sí | sí |
| Mismo día calendario | no | sí | — |

Bajo "mismo turno", la factura de las 21:40 es anulable a la 00:20. Bajo "mismo día",
no lo es. Son dos resultados distintos para la misma operación de caja, y la diferencia
afecta además qué facturas entran al Reporte X o Z de un día.

**Le preguntamos:**

1. ¿Un turno que cruza la medianoche pertenece a **un solo día fiscal** (el día en que
   abrió la caja), o se parte en dos?
2. ¿Quién y cómo fija el cierre del día fiscal: el cierre de caja del turno, una hora
   fija, o la fecha de calendario?
3. ¿El cierre de caja queda siempre dentro del mismo día fiscal en que se abrió? Si en
   algún escenario no (jornadas largas, dos turnos continuos), necesitamos saberlo antes de
   atar los reportes al turno.

**Lo que haremos con la respuesta.** Si es "mismo turno", dejamos la validación tal como
está ahora. Si es "día fiscal propio", agregamos un campo de fecha fiscal en la venta y
en el cierre de caja — es un cambio de estructura de datos, no de pantalla, y conviene
hacerlo ahora antes de que exista histórico que reconciliar.

---

## Pregunta 9 — Qué debe decir una reimpresión en la cabecera

*(Bloquea la reimpresión. Referencia interna: incidencia #547.)*

El negocio necesita reimprimir un ticket entregado, por ejemplo cuando el papel se cortó o
el cliente perdió el suyo. En este momento el sistema **no puede** hacerlo: el mecanismo
existe construido en dos versiones, pero ninguna tiene una pantalla donde un operador lo
pulse. Lo estamos corrigiendo.

Al revisarlo apareció un detalle que sí depende de usted. **La factura no guarda la
cabecera con la que se imprimió.** El nombre del negocio, el RUC, el domicilio y el
teléfono se leen de la configuración vigente en el momento de imprimir. Por lo tanto, una
reimpresión de un ticket emitido antes de cualquier cambio en esos datos produce un papel
con la cabecera de hoy, no con la de entonces.

Eso es inocuo mientras nada cambie. Deja de serlo el día que el negocio modifica su
domicilio, o agrega una segunda sucursal, o ajusta el número de autorización.

**Le preguntamos, en términos de qué documento vale ante la DGI:**

1. Una reimpresión debe **reproducir fielmente el documento original**, cabecera incluida
   (lo que exige guardar una copia de esos datos en el momento de emitir, que es un
   cambio de estructura), o
2. alcanza con que lleve el dato actual **y esté marcada de modo inequívoco como
   reproducción posterior**, con número y fecha del documento original y fecha-hora de la
   reimpresión?

Nuestra lectura operativa, sin valor jurídico: la opción 2 es más barata y deja mejor
rastro en el papel, porque hoy la reimpresión se vería idéntica al original. Pero eso es
precisamente lo que usted debe autorizar o rechazar. Si su respuesta es la opción 1,
anótelo: es un cambio más grande y lo encaramos antes de la apertura.

**Agregado:** tenemos previsto que un ticket anulado e impreso después de la anulación
lleve **las dos leyendas a la vez** — ANULADO y REIMPRESIÓN. Confírmenos si alguna de las
dos no debe figurar.

---

## Pregunta 10 — Cómo se corrige un ticket de un día anterior, y desde dónde

*(Bloquea la vía de nota de crédito. Referencia interna: incidencia #525 criterio AC-13, e
incidencia #522.)*

Usted indicó que las anulaciones de días anteriores **"pasan a un flujo administrativo
separado"**. Entendemos que ese flujo es la nota de crédito. Hay un obstáculo operativo
que necesita su decisión.

**Hoy el negocio no puede emitir una nota de crédito desde la tablet.** El sistema local
la genera y la imprime, pero el servidor la rechaza en la sincronización mientras no esté
implementado el registro de autorización correspondiente (referencia interna DSI-6). El
operador ve en pantalla "Nota de Crédito emitida correctamente" y el documento queda
pendiente, reintentando indefinidamente, sin que nadie se entere.

Eso último ya lo corregimos: el mensaje ahora dice que quedó **registrada y pendiente de
validación al sincronizar**, porque el POS no debe asercionar un hecho que no observó. Pero
el rechazo de fondo sigue en pie, y es una decisión de procedimiento, no de código.

**Le preguntamos:**

1. ¿Las notas de crédito las emite **usted desde el panel administrativo**, o las emite
   **el negocio desde la tablet**?
2. Si es el negocio: ¿qué datos de autorización necesita quedar registrando junto a cada
   nota de crédito para que podamos habilitar ese camino sin violar el motivo por el que
   está cerrado?
3. Mientras tanto, ¿el procedimiento provisorio es que el negocio le marque la
   necesidad (por ejemplo, con la anotación en el Reporte Z) y usted la emite?
4. Si un ticket del día anterior queda mal, ¿existe además algún libro o acta interna que
   usted firme, o el único soporte es la nota de crédito?

Le hacemos la pregunta 3 porque la apertura ya tiene fecha. Necesitamos un camino que
funcione el primer día, aunque ese camino sea manual y suyo.

---

## Pregunta 11 — Si quiere la aprobación de supervisor como política configurable

*(No es un requisito DGI. Es suyo decidirlo.)*

Usted escribió que supervisor/owner **no es requisito** de la DGI para la anulación
ordinaria del mismo día, y que **"puede incorporarse posteriormente como política
configurable de control interno"**. Tomamos nota y no lo implementamos como bloqueo.

Consulta puramente interna, sin apuro: ¿quiere ese control más adelante, y en qué forma?

- **Por monto**: el cajero anula tickets cobrados hasta un tope definido por el negocio;
  por encima, necesita aprobación. El tope quedaría editable en la configuración, junto
  al prefijo y el rango.
- **Por cantidad**: aprobación a partir de la anulación número *N* del turno.
- **Sin umbral**: toda anulación de un ticket ya cobrado requiere aprobación, y la
  anulación antes de cobrar no.

No lo preguntamos para construirlo ahora, sino para no cerrar el diseño. La regla actual
queda como usted la definió, y lo que viene ahora es implementarla así: el permiso se
llamará internamente `VOID_OWN_CURRENT_SHIFT_SALE` y será revocable por empleado sin tocar
el programa, de modo que si mañana decide exigir supervisor para una persona concreta, eso
sea una casilla de configuración y no una orden de desarrollo. **Aclaración honesta:**
eso todavía no existe en el sistema; es el diseño que adoptamos para la próxima entrega,
nada más.

---

## Datos que aún no tenemos (no son preguntas normativas)

Estos tres son hechos del negocio, ya pedidos antes, y siguen abiertos. Sin ellos hay
trabajo que no podemos cerrar:

1. **Rango de folios que la DGI autorizó a SOHO** — prefijo y desde/hasta. Lo necesitamos
   para reemplazar el valor por defecto que hoy trae el sistema (un rango de fábrica que
   no es el de nadie). Bloquea el arranque fiscal.
2. **Número y fecha de la resolución / carta de autorización de sistemas de facturación**
   — existe un campo donde el cliente lo carga, pero hoy no se imprime en ningún
   documento. Debimos haberlo detectado antes: un campo que se llena y no se usa es peor
   que uno que falta, porque da la sensación de estar resuelto. Bloquea el pase a
   producción.
3. **Plazo para denunciar la baja de un terminal que murió** — con él definimos qué hace
   el sistema si la tablet se pierde o se rompe, incluido el folio exacto donde se
   detuvo.

Y un pedido de revisión, cuando lo tenga a mano: **la carta de autorización en sí**. Nos
interesa leer si impone condiciones sobre series por terminal, renovaciones de rango o
ampliaciones de folios, porque hay dos automatismos que decidimos **no** construir hasta
ver ese papel.

---

## Lo que no le estamos preguntando

Para que no parezca olvido:

- **Si el void consume folio.** No lo consume: la anulación marca el documento y el número
  queda consumido para siempre. Eso es lo que usted indicó y lo que el sistema hace.
- **Si borramos algo.** No. La tabla de facturas está protegida contra borrado por
  disparador de base de datos y por una regla interna que prohíbe editar un documento ya
  emitido. Cuando encontramos números duplicados en el entorno de prueba, la solución fue
  que la migración falle y avise, no que limpie los datos.
- **Si la merma existe.** Existe y funciona; previamente habíamos afirmado que no, y
  estaban equivocadas dos de nuestras comprobaciones. Lo que le preguntamos en la ronda
  anterior sobre cómo probarla sigue vigente en el punto de quién la registra, que hoy el
  sistema no lo guarda.
