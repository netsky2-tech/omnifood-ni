# S23 Ultra — identidad de empresa y `ruc`, verificado en el aparato (sin papel)

Dispositivo objetivo: **S23 Ultra del owner** (dispositivo personal, donde se vienen
haciendo las pruebas). **No** es el Q80.
Bajo verificación: company-identity parity (S1–S7 de
`odd/tasks/identidad-empresa-paridad.md`) y la task 31 (el `ruc` local).

> **Supersede** a `q80-verification-checklist.md`. Aquel apuntaba al Q80 de producción
> —que está en casa del cliente y no es accesible— y por eso **no es ejecutable**.
> Ese archivo se conserva como registro de qué se pretendía verificar allí.

---

## Advertencia de alcance — leer antes de empezar

En el S23 Ultra el driver de impresión es **simulado**: el aparato **no imprime**.
De ahí salen tres consecuencias, y son la razón de existir de esta lista:

1. **Un "éxito" de impresión en el S23 NO es evidencia de impresión.** El adaptador
   simulado reporta éxito sin imprimir nada; el propio resolver lo advierte
   (`apps/pos_app/lib/domain/services/printer/printer_resolver.dart`: *"Never route
   this driver to the mock (it reports false successes)"*). No anotar "imprime bien"
   a partir del S23: sería un falso verde.
2. **No hay comparación de papel.** La mitad física de S7 —"el ticket no puede
   cambiar"— **queda NO VERIFICADA**, y no es verificable hoy en ningún lado: el Q80
   que sí imprimiría está en producción.
3. Por eso esta pasada verifica **el conjunto exacto de claves y valores que el camino
   de impresión consume** —lo que la app le entregaría a la impresora—, no el papel.
   Es el *fallback* que `identidad-empresa-paridad.md` L4 ya había previsto: *"si no se
   puede capturar la salida impresa, se caracteriza el conjunto exacto de claves y
   valores que el impresor lee, y se declara cuál de las dos cosas se probó"*.
   **Se prueba la primera. La segunda queda pendiente y declarada.**

---

## Paso −1 — Preparar el artefacto (obligatorio)

Las claves que se verifican dependen del código de **esta rama**, y el APK que hoy
tiene el S23 es anterior. Sin este paso la pasada verifica otra cosa.

1. Bump de `versionCode` en `apps/pos_app/pubspec.yaml` (convención del repo: se
   bumpea a mano y no se commitea solo). ☐
2. Build release arm64 con `scripts/build_pos_apk.sh` (precedente exacto:
   `odd/tasks/soho-s23-device-validation.md`, T1). ☐
3. `adb install -r` — mismo firmante, datos locales intactos. ☐
4. Backend alcanzable: `local_configs.api_base_url`; con backend local,
   `adb reverse tcp:3000 tcp:3000`. ☐
5. Confirmar en la pantalla de hardware que el driver configurado es **simulado**
   (`mock`). Es lo esperado en este aparato y es el motivo de la advertencia de
   arriba: anotarlo, no "arreglarlo". ☐

---

## Paso 0 — Registrar el estado ANTES (obligatorio, no opcional)

Leer los valores **actuales** de `local_configs`. Si la pantalla no expone un valor,
leerlo directo de la base local del S23 (build de depuración + `adb`).

| Clave (exacta)                 | Valor ANTES (copiar completo) | Debe ser DESPUÉS |
|--------------------------------|-------------------------------|------------------|
| `printer_logo_base64`          | ☐ presente / ☐ ausente — si presente, **longitud**: ______ | **Idéntico** (mismo presente/ausente y misma longitud) salvo adopción |
| `printer_logo_width`           | ______ | **Idéntico** |
| `printer_logo_height`          | ______ | **Idéntico** |
| `printer_logo_enabled`         | ______ | **Idéntico** |
| `printer_header_business_name` | ______ | **Idéntico** |
| `printer_header_ruc`           | ______ | **Idéntico** |
| `printer_header_address`       | ______ | **Idéntico** |
| `printer_header_phone`         | ______ | **Idéntico** |
| `address` (perfil del negocio) | ______ | **Idéntico** |
| `phone` (perfil del negocio)   | ______ | **Idéntico** |
| `ruc` (emisor fiscal)          | ______ | **Idéntico**, salvo la única excepción legítima: la nube **retira** un `ruc` que había afirmado antes |

Notas de registro:
- `printer_logo_base64` es largo: no copiar el string, **sí** su presencia y su
  longitud exacta — esa longitud es la huella con la que se compara después.
- Las claves `printer_header_*` pueden no existir. Registrar **también** la ausencia:
  la precedencia local explícita (`printer_header_* ?? business_*`) es S6 y no cambia
  en esta verificación.
- **`ruc` sin prefijo es la que se imprime.** Los caminos de venta y reimpresión pasan
  `printerConfig.fiscalRuc`, que sale de la clave plana `ruc`
  (`printer_config_service.dart:28/110/163`; `sale_view_model.dart:2389` y `:2620`).
  `printer_header_ruc` es decorativa: **cero** consumidores de impresión la leen, y
  **nunca** sustituye al RUC del emisor.
- Con el arreglo option-B del `ruc` (task 31, que reusa el marcador de P2), la
  proyección escribe `ruc` sólo cuando el snapshot lo **afirma**. Una retracción
  (`ruc: null` después de haberlo afirmado) es el **único** escritor legítimo de un
  cambio: cualquier otro cambio de `ruc` sin intervención del operador es **fallo**.
- **Si `ruc` está AUSENTE en el Paso 0**, el código anterior pudo haberlo borrado ya
  (una revisión con `ruc: null` lo borraba). El arreglo es **sólo hacia adelante**: no
  restaura lo ya borrado. Volver a cargar el RUC del emisor (desde la web o desde
  Perfil del Negocio) **antes** de la comparación, y anotar que se recuperó a mano.
- **Artefacto entre versiones (declarado).** Una terminal que aplicó un snapshot
  **anterior al arreglo** con un `ruc` no vacío tiene un marcador que **no** nombra
  `ruc`. Para esa terminal, una revisión posterior con `ruc: null` **conserva** el
  valor previo en vez de borrarlo: la retracción recién toma efecto cuando la nube
  vuelve a afirmar un `ruc` no vacío. Es conservador a propósito —nunca borra de
  más— y hay que **esperarlo**, no reportarlo como fallo.

---

## Paso 1 — Registrar el encabezado RESUELTO (acá no hay papel)

En vez del ticket impreso (imposible en este aparato), registrar el conjunto que el
camino de impresión entregaría:

- ☐ Perfil del Negocio: `business_name`, **`ruc`**, `address`, `phone` — copiar tal
  como se ven.
- ☐ Pantalla de hardware: logo presente/ausente y sus parámetros (ancho/alto/habilitado).
- ☐ Dejar constancia de que **este paso no imprimió nada** y que el driver es simulado.

## Paso 2 — No adoptar el logo (control negativo)

Sin tocar nada del logo, **sincronizar la terminal** (para que llegue el snapshot
fiscal con la referencia `logoSha256`) y esperar al menos un ciclo.

1. Verificar que las claves del Paso 0 **siguen idénticas** (releer y comparar
   longitudes).
2. Verificar que el encabezado resuelto del Paso 1 **no cambió**.
3. La llegada de la referencia en la nube **no debe escribir ni un byte local**: sin
   adopción explícita, ni una clave `printer_logo_*` se toca.

✅ Si todo coincide y nada cambió: **el camino inerte (S7) queda verificado en su mitad
de estado**. El Paso 3 es deliberado y puede hacerse aparte.

## Paso 3 (deliberado, sólo si el operador decide adoptar el logo de la empresa)

1. En la pantalla de hardware, tocar **"Aplicar logo de la empresa"**.
2. Si la adopción falla (sin conexión, bytes corruptos, derivación fallida): la app lo
   declara y **no se escribió nada** — repetir el Paso 0 para confirmarlo y terminar acá.
3. Si tiene éxito, verificar en el Paso 0:
   - ÚNICO cambio permitido: `printer_logo_base64` (nueva longitud: ______).
   - `printer_logo_width`, `printer_logo_height`, `printer_logo_enabled`: **idénticos**.
   - Todas las demás claves, **`ruc` incluida**: **idénticas**.
4. **No** intentar confirmar la adopción "imprimiendo": en el S23 no hay papel. La
   confirmación es la clave escrita y su longitud.

## Cómo deshacer la adopción

La carga manual **no fue tocada**: en la pantalla de hardware, volver a subir el logo
anterior con el flujo manual de siempre (PNG local → raster térmico). Eso reescribe
`printer_logo_base64` y restaura el estado previo.

## Qué falla y qué significa

- Cualquier clave del Paso 0 que cambie **sin** haber tocado "Aplicar logo": **fallo**
  — hay un escritor que no debe existir.
- Un cambio en el encabezado resuelto del Paso 1 que no sea la excepción del `ruc`:
  **fallo**.
- Un cambio de `printer_logo_width/height/enabled` durante la adopción: **fallo** — la
  adopción nunca toca el ajuste del operador.

## Lo que esta lista NO prueba (declarado, no disimulado)

- **Que el papel impreso sea idéntico salvo el logo adoptado.** Es la mitad física de
  S7 y **queda pendiente**: requiere una terminal con impresora térmica real (el Q80
  del cliente, o cualquier otra con el driver correcto). Nada de lo que se observe en
  el S23 la sustituye.
- Que el adaptador simulado "imprima": no imprime, y reporta éxito igual.
- La configuración de impresora del **tenant de producción**: esta pasada corre contra
  el entorno que se le configure al S23, no contra el del cliente.
