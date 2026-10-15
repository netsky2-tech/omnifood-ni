# Q80 — Verificación de caracterización de impresión (post company-identity parity)

Terminal objetivo: **Q80 en producción** (`printer_driver = IPOS_Q80`).
Cambio bajo verificación: company-identity parity S5/S7
(`odd/tasks/identidad-empresa-paridad.md`) — el sync trae una **referencia**
(sha256) del logo de la empresa y la terminal ofrece **adoptarlo**; el camino
de impresión del ticket **nunca** depende de la nube.

Regla de oro (S7, verbatim del owner): **el ticket no puede cambiar**. Un
terminal con logo local y sin logo en la nube imprime **exactamente lo mismo**
que antes del cambio. "Que se vea igual" no es verificable: esta lista sí.

---

## Paso 0 — Registrar el estado ANTES (obligatorio, no opcional)

En la terminal Q80, abrir la pantalla de configuración de hardware
(ajustes → impresora/hardware) y registrar en la tabla de abajo el valor
**actual** de cada clave del almacenamiento local (`local_configs`). Si la
pantalla no expone un valor, leerlo directamente de `local_configs`
(los nombres de clave son exactos, tal como están en la base local).

| Clave (exacta)                | Valor ANTES (copiar completo) | Debe ser DESPUÉS |
|-------------------------------|-------------------------------|------------------|
| `printer_logo_base64`         | ☐ presente / ☐ ausente — si presente, registrar la **longitud** del string: ______ | **Idéntico** (mismo presente/ausente y misma longitud) salvo adopción del logo |
| `printer_logo_width`          | ______ | **Idéntico** |
| `printer_logo_height`         | ______ | **Idéntico** |
| `printer_logo_enabled`        | ______ | **Idéntico** |
| `printer_header_business_name`| ______ | **Idéntico** |
| `printer_header_ruc`          | ______ | **Idéntico** |
| `printer_header_address`      | ______ | **Idéntico** |
| `printer_header_phone`        | ______ | **Idéntico** |
| `address` (perfil del negocio)| ______ | **Idéntico** |
| `phone` (perfil del negocio)  | ______ | **Idéntico** |

Notas de registro:
- `printer_logo_base64` es largo; no hace falta copiar el string completo,
  **sí** su presencia y longitud exacta (esa longitud es la huella con la que
  se compara después).
- Las claves `printer_header_*` pueden no existir (caen al perfil del
  negocio: `printer_header_address ?? address`). Registrar **también** la
  ausencia — la precedencia local explícita (`printer_header_* ?? business_*`)
  es S6 y no cambia en esta verificación.

## Paso 1 — Ticket de caracterización ANTES

Imprimir un ticket de prueba en la Q80 con una venta de productos fijos
(mismos productos y cantidades que se usarán después) y **conservar el papel
físico**. Alternativa reproducible: capturar la salida de impresión si el
entorno de verificación lo permite. Anotar:

- ☐ Encabezado impreso (nombre, dirección, teléfono, RUC tal como salen)
- ☐ ¿Aparece logo? sí/no — si sí, cómo se ve
- ☐ Ítems, totales, pies (IVA, condición fiscal)
- Guardar (foto o papel) como **referencia de comparación**.

## Paso 2 — No adoptar el logo (control negativo)

Sin tocar nada del logo, **sincronizar la terminal** (para que llegue el
snapshot fiscal con la referencia `logoSha256`) y esperar al menos un ciclo
de sincronía. Luego:

1. Verificar que las claves de la tabla del Paso 0 **siguen idénticas**
   (releer y comparar longitudes).
2. Imprimir el **mismo** ticket de prueba del Paso 1.
3. Comparar contra la referencia: encabezado, logo, ítems y pies deben ser
   **idénticos**. La llegada de la referencia en la nube **no debe escribir
   ni un byte local** (la lectura del sha256 es de solo lectura; sin
   adopción explícita no se escribe nada).

✅ Si todo coincide y nada cambió: **el camino S7 está verificado**; el Paso 3
es la parte deliberada y puede hacerse aparte.

## Paso 3 (deliberado, sólo si el operador decide adoptar el logo de la empresa)

1. En la pantalla de hardware, tocar **"Aplicar logo de la empresa"**.
2. Si la adopción falla (sin conexión, bytes corruptos, derivación fallida):
   la app lo declara en el mensaje de estado y **no se escribió nada** —
   repetir la tabla del Paso 0 para confirmarlo y terminar aquí.
3. Si tiene éxito ("Logo de la empresa aplicado…"), verificar en la tabla
   del Paso 0:
   - ÚNICO cambio permitido: `printer_logo_base64` cambia (raster 1-bit
     derivado del original de la nube, por el MISMO rasterizador del camino
     manual). Registrar la nueva longitud: ______
   - `printer_logo_width`, `printer_logo_height`, `printer_logo_enabled`:
     **idénticos** (la adopción nunca toca el ajuste del operador).
   - Todas las demás claves: **idénticas**.
4. Imprimir el ticket de prueba y confirmar que el ticket es el mismo del
   Paso 1 **salvo el logo**, que ahora es el de la empresa.
5. Marcar visualmente (✔) que el logo impreso corresponde al de la empresa.

## Cómo deshacer la adopción

El camino de carga manual **no fue tocado**: en la pantalla de hardware,
volver a subir el logo anterior con la carga manual de imagen
(`uploadAndProcessLogo` — el mismo flujo de siempre, PNG local → raster
térmico). Eso reescribe `printer_logo_base64` con el raster del logo manual y
restaura el estado previo a la adopción. `width/height/enabled` vuelven a
quedar como estén en la pantalla (la carga manual conserva el mismo trato).

## Qué falla y qué significa

- Cualquier clave de la tabla que cambie **sin** haber tocado "Aplicar logo":
  **fallo** — hay un escritor que no debe existir (S5: la adopción es el único
  escritor de `printer_logo_*` en esta feature).
- Ticket distinto en el Paso 2: **fallo** — el camino de impresión está
  dependiendo de la nube (S7 violado).
- Ticket distinto en el Paso 3 más allá del logo: **fallo** — la adopción
  alteró algo más que el raster.
