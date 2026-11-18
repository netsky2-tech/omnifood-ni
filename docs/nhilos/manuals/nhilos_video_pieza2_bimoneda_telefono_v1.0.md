# Pieza 2 · Jueves 19/11 · Cobro bimoneda en un teléfono

Versión 1.0 · 17/11/2026 · Reemplaza el guion de "vídeo físico en mostrador" v1.1

## Por qué cambia

El guion v1.1 se apoyaba en la terminal MIRAY Q80 y en una impresora térmica de
80 mm. La Q80 era del cliente y ya se entregó; no hay impresora. El claim
"Hardware real" y el plano del ticket impreso no se pueden rodar, y grabarlos con
un render sería mentir en el primer segundo.

Lo que sí existe: un Samsung S23 con la aplicación instalada, un billete de
dólar y una mesa. Con eso se sostiene una pieza más fuerte, porque la promesa ya
no es "mira este hardware" sino "esto corre en el teléfono que ya tienes".

## Gancho

Pregunta concreta que el dueño se hace, y que el material responde:

> **"Te pagan con $20. ¿Cuánto devuelves en córdobas?"**

Variantes para probar en las tres redes:

| Variante | Texto | Cuándo conviene |
|---|---|---|
| A (recomendada) | "Te pagan con $20. ¿Cuánto devuelves en córdobas?" | Duda real del mostrador, invita a comentar la respuesta |
| B | "$20 dólares en la mano. El vuelto sale exacto." | Más directa, funciona si la A cansa |
| C | "Se cayó el internet y la venta se cobró igual." | Cuando el ángulo offline rinda mejor |

## Beats

| Tiempo | Imagen real | Texto en pantalla |
|---|---|---|
| 0.0–2.0s | Manos dejan el teléfono en la mesa; entra el billete de $20 en el mismo plano | "Te pagan con $20" |
| 2.0–5.0s | Billete junto a la pantalla con el cobro bimoneda abierto y el total en córdobas | "Y el vuelto en córdobas" |
| 5.0–10.0s | El pulgar toca Cobrar; la pantalla muestra el vuelto exacto y el tipo de cambio BCN | "C$607.49" (cifra animada) |
| 10.0–16.0s | Se abre el panel del sistema con Modo Avión; la venta se completa igual y queda en cola | "Sin internet" → "Se sincroniza sola" |
| 16.0–20.0s | Plano limpio del teléfono; cierre de marca | "Comenta DEMO" |

Total: 20 segundos. El montaje puede comprimir el beat 3 si el ritmo lo pide.

## Lista de tomas

Grabar todas en vertical, con la luz del ambiente a favor, sin hablar a cámara.

| Toma | Qué grabar | Encuadre | Duración | Debe verse | No debe aparecer |
|---|---|---|---|---|---|
| T1 | Apoyar el teléfono en la mesa y acercar el billete | Vertical, picado suave, teléfono y mano completos | 4–5s | El billete entrando en foco, la pantalla encendida | Rostros, personas de fondo, marcas de otros productos |
| T2 | Billete en la mano junto a la pantalla que muestra el total en córdobas | Primer plano, pantalla legible | 4s | El total en C$ y el monto recibido en USD | Reflejos que tapen la cifra |
| T3 | Tocar Cobrar y sostener en pantalla el vuelto exacto | Primer plano cerrado | 5s | La cifra del vuelto y el tipo de cambio BCN, sin cortar | Notificaciones del sistema |
| T4 | Abrir el panel de Modo Avión y mostrarlo activo | Vertical, el panel completo | 4s | La etiqueta "Modo Avión" legible | El nombre de dispositivos Bluetooth vinculados (dato personal) |
| T5 | Completar una venta con la red caída | Primer plano de pantalla | 6s | El cobro confirmado y el contador de pendientes | Datos de clientes reales |
| T6 | Esperar la reconexión hasta ver el estado sincronizado | Primer plano de la barra de estado | 3s | El indicador en verde | Nada que tape el indicador |
| T7 | Plano limpio del teléfono en la mesa o en la mano | Vertical, fondo limpio | 3s | El teléfono completo, pantalla encendida | Objetos que distraigan |

Antes de grabar: activar el modo avión del teléfono para las tomas T4 a T6 y
desactivarlo después, con el backend local arriba para que el pedido se pueda
encadenar.

## Audio

Locución breve, sin subrayar lo que la pantalla ya dice:

> "Así cobra NHILOS en un teléfono normal: dólares, vuelto exacto en córdobas y
> la venta sigue aunque se caiga el internet. Comenta DEMO y te mando el acceso."

Ambiente real del local a volumen bajo, sin música que compita con la voz. Si no
hay locución disponible, la pieza funciona muda con la tipografía cinética.

## Disciplina de claims

- No decir "hardware real": no hay hardware propio en cuadro.
- No prometer impresión: no hay impresora conectada; el adaptador ESC/POS genérico
  está planificado en #983 y sin implementar.
- No decir "cero multas", "autorizado por la DGI" ni "factura electrónica".
  La app cumple la mecánica de la DT 09-2007; la autorización es del contribuyente.
- Las cifras en pantalla deben coincidir con el tipo de cambio que muestra la app
  en el momento de grabar. Si cambia, se actualiza el texto, no el video.

## Publicación

- Formato: 1080×1920, 30 fps, menos de 25 s, sin márgenes negros.
- Copy: una línea de contexto y una pregunta. El llamado es "Comenta DEMO".
- Hashtags: mezcla de nicho y locales, sin bloques de treinta.
- Publicar el mismo archivo en las tres redes; el corte cambia solo si una
  plataforma lo exige.

## Ruta de respaldo

Si no hay tiempo de grabar, se salva `out/pieza2_digital.mp4`: se quita el claim
"Hardware real", se rehace la apertura para que el gancho esté en el primer
segundo, se reemplaza el ticket renderizado por un recurso que no simule una
impresión y se ajusta el ritmo. Queda publicable, pero sigue siendo una
grabación de pantalla y se nota.
