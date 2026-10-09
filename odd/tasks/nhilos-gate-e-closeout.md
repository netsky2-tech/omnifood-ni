# NHILOS — Gate E cruzado y cierre de decisiones

**Origen:** cerrar lo que quedaba pendiente de la línea de branding antes de cerrar sesión.
**Base:** `origin/main` = `b4b5ad27`. Rama: `feat/nhilos-branding-reality-audit`.
**Estado:** CERRADO.

---

## INCIDENTE REGISTRADO — pérdida de trabajo sin commitear

Durante el trabajo de conversión de `§` a enlaces corrí `git checkout -- docs/` **cuatro veces**
para volver a un estado limpio entre intentos del script. Eso **descartó cambios que nunca se habían
commiteado**: las cuatro decisiones de producto que el usuario había respondido (dominio, fotografía
diferida, receptor de demos, marcaria en curso).

Le reporté al usuario que estaban cerradas y **no estaban en el repositorio**. Se detectó al correr
el Gate E, que encontró `OD-PP-10` como `OPEN` cuando yo lo había cerrado.

**Regla que queda:** `git checkout -- <ruta>` descarta trabajo no commiteado, no solo cambios
accidentales. Antes de usarlo hay que commitear o saber exactamente qué se va a perder. Para volver
atrás en un experimento de script, trabajar sobre una copia o commitear primero.

Las cuatro decisiones se reaplicaron y ahora están commiteadas.

---

## Gate E — contraste cruzado homepage ↔ página de producto

Ejecutado el 2026-10-08 como verificación independiente. Criterios tomados de los dos propios
contratos (homepage §18.6 y página de producto `Gate E`). Resultado: **11 contradicciones**.

### Corregidas

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | **Nodo de navegación inventado.** La homepage declaraba `Cómo funciona` en la navegación primaria como `APPROVED_WEBSITE`; la IA lo había eliminado (SC-03). La IA tenía además un bloque ASCII viejo que lo mostraba. | Navegación primaria corregida a `Producto · Implementación · Recursos · Nosotros` en ambos documentos. En el footer sí corresponde: es un sub-ítem de Producto. |
| 2 | **División de labores invertida.** La homepage era más específica que la página de producto en continuidad, violando su propia regla, y prometía una "matriz completa" que la página de producto no entrega. | La promesa ahora dice lo que el contrato de producto realmente entrega y declara la matriz como pendiente de validación. La página de producto se profundizó con la lista de tareas que continúan localmente, respaldada por `PC-OFF-01`/`02`/`04`. |
| 3 | **Estado cruzado contradictorio.** La página de producto llamaba `OD-HM-01` "decisión abierta"; la homepage la tenía `CLOSED`. | Alineado a `CLOSED`. |
| 4 | **La página de producto declaraba a la homepage no disponible.** Tres lugares decían "upstream pendiente" contra su propia cabecera, que dice que la dependencia está satisfecha. | `OD-PP-12` `CLOSED`, Gate E `PASSED`, lista de decisiones abiertas vacía. |
| 5 | **Afirmación falsa sobre el índice inverso.** La homepage decía que el índice del OD-02 solo referenciaba la página de producto. | `OD-HM-05` `CLOSED`: el índice ya lista las citas `HM-*`. |
| 6 | **Deriva de rol.** Homepage `Quien gestiona` vs página de producto `Quien supervisa`; canónico `OD-PP-05` = Cajero/Supervisor/Owner. | Alineado a `Quien supervisa`. |
| 7 | **Enlace a destino inexistente.** El footer de la homepage listaba `Contacto`, que la IA no tiene y la propia homepage prohíbe. | Eliminado. |
| 8 | **Variante de CTA secundario.** `Ver cómo funciona` vs `Explorar cómo funciona`. | Unificado. |
| 9 | **Referencia cruzada mal apuntada.** El video de la sección de medios enlazaba a la §1.2 propia en lugar de la del spec no funcional. | Retargeteada a `Presupuestos de Medios` del spec. |
| 10 | **Página de producto muda sobre los gates no funcionales** que la homepage sí compromete. | Agregado el bloque `NF-01`..`NF-13` heredados, con los umbrales. |
| 11 | **Menores:** topología futureware nombrada como contexto; "terminal autorizada" contra la limitación de terminal única; 7 pasos de implementación vs 8. | Corregidos los tres. |

### Verificación posterior

- **1505 anclas, 0 enlaces rotos, 0 anclas rotas.**
- Conteos intactos: registro 43 = índice inverso 43; página de producto 61 IDs = Anexo A 61; homepage 34 IDs.
- Las cuatro decisiones cerradas presentes y commiteadas: `OD-PP-10` `CLOSED`, `OD-PP-12` `CLOSED`,
  dominio `nhilospos.com` en la IA, marcaria `EN CURSO` en el brief.

---

## Estado de la línea al cerrar

**Cerrado:** auditoría de realidad, remediación, reorganización por rol, deduplicación de estándares,
conversión de `§` a enlaces, guía de entregables con ejemplos, entrega navegable (sitio + PDF),
Gate E cruzado, y las cuatro decisiones de producto.

**Bloqueado por la línea P3** (registrado en la gobernanza §7): re-anclaje del OD-02, revalidación de
medios contra el build final, y revisión de los contratos contra el comportamiento nuevo.

**Pendiente del usuario:** abrir el PR, prioridad de soportes, estados vacíos/error del sitio,
`path` exacto de cada página, y la producción fotográfica diferida.
