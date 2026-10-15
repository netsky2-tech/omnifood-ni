# Q80 — SUPERADO: no ejecutable (terminal en producción, en casa del cliente)

**Estado: NO EJECUTABLE (2026-10-15).** Reemplazado por
`odd/artifacts/s23-device-verification-checklist.md`. Se conserva este archivo para
no perder **qué** se pretendía verificar acá y **qué queda sin verificar** por no poder
hacerlo.

## Por qué no puede correrse

La terminal objetivo es el **Q80 en producción**, y está **en el sitio del cliente**.
El owner no tiene acceso para hacer una pasada de verificación, y **no se interfiere la
operación de un cliente que está vendiendo**. La instrucción es explícita: toda prueba
se hace en el **S23 Ultra** del owner, que es su dispositivo personal de pruebas.

## Qué verificaba este instrumento, y qué queda descubierto

Pretendía caracterizar la **impresión física**: tomar el ticket de una venta fija
**antes** y **después** de la paridad, sobre papel real, y exigir que saliera *idéntico*
salvo el logo adoptado — la mitad de "el ticket no puede cambiar" del S7.

Eso **no se puede verificar hoy en ningún aparato accesible**:

- el Q80 que sí imprime está en producción y no se toca;
- el **S23 Ultra tiene driver de impresión simulado**: no imprime, y el adaptador
  reporta éxito igual (el propio resolver lo advierte: *"Never route this driver to the
  mock (it reports false successes)"*), así que un "imprimir bien" en el S23 sería un
  falso verde.

**Consecuencia declarada: la mitad física de S7 queda PENDIENTE.** El S23 verifica la
otra mitad —el conjunto exacto de claves y valores que el camino de impresión consume—,
que es el *fallback* ya previsto en `identidad-empresa-paridad.md` L4. Se declara cuál
de las dos cosas se probó; no se presenta una como la otra.

## Cómo se cierra este hueco

En el momento en que se pueda tocar **una terminal con impresora térmica real** (el Q80
del cliente en una ventana acordada, o cualquier otro equipo con el driver correcto):
tomar el ticket antes/después y comparar el papel. Hasta entonces, cualquier afirmación
sobre el papel impreso en producción es **no verificada**.

## Lo que sí se conserva de este documento

Las claves que este instrumento mandaba registrar —incluida la fila **`ruc`** y las
notas de los advisories **A3** (artefacto entre versiones: un marcador previo conserva
el valor ante una retracción hasta que la nube reafirme un `ruc`) y **A4** (el arreglo
es sólo hacia adelante: un `ruc` ya borrado no se recupera y se recarga a mano)—
**están todas** en el checklist del S23, que es el instrumento vigente.
