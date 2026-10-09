# NHILOS — Decisiones cerradas y navegación por enlaces

**Origen:** respuestas del usuario (2026-10-08) y pedido de reemplazar los símbolos `§NN` por
enlaces a la sección referenciada.
**Base:** `origin/main` = `b4b5ad27`. Rama: `feat/nhilos-branding-reality-audit`.
**Estado:** EN CURSO.

---

## Decisiones del usuario que hay que reflejar

| # | Decisión | Efecto documental |
|---|---|---|
| D1 | **Antecedentes marcarios:** los verá el usuario. | Pasa de «recomendado» a **en curso**. No bloquea exploración. |
| D2 | **URL: `nhilospos.com`**, con comodín para clientes (`soho.nhilospos.com`) y backend (`api.nhilospos.com`). | Cierra la decisión de URL pendiente en la IA, el paquete de inicio y el contrato de producto. |
| D3 | **Fotografías propias: diferidas.** Primero asentar las bases. | Cierra la decisión abierta de fotografía; la fase 1 usa producto y tipografía. |
| D4 | **Demos: las hace el usuario**, y ya consiguió alguien con la app instalada para pruebas reales. | Cierra `OD-PP-10` (receptor de demos). |

---

## Alcance medido del cambio de `§` a enlaces

298 referencias en 12 documentos. Las referencias apuntan a **documentos distintos**, no solo al
propio: el brief cita la constitución, el media inventory cita el contrato de producto, la IA cita
el spec no funcional.

| Documento | `§` |
|---|---|
| `nhilos_pos_product_page_content_v1.1.md` | 100 |
| `nhilos_brand_identity_brief_v0.1.md` | 45 |
| `Recursos/nhilos_pos_experience_standard_v1.0.md` | 38 |
| `nhilos_website_homepage_content_v1.1.md` | 36 |
| `nhilos_website_information_architecture_content_wireframe_v1.0.md` | 21 |
| `nhilos_pos_media_inventory_v1.0.md` | 12 |
| `branding_reality_audit_v0.1.md` | 12 |
| `nhilos_branding_document_governance_v1.0.md` | 10 |
| `nhilos_design_kickoff_handover_v0.1.md` | 9 |
| `Recursos/product_claim_audit_od02_v1.3.md` | 8 |
| `nhilos_website_product_marketing_brief_v1.0.md` | 5 |
| `Recursos/nhilos_website_non_functional_spec_v1.0.md` | 2 |

**Verificación previa de viabilidad:** las referencias apuntan a **secciones numeradas**, que son
únicas en cada documento. Los subtítulos repetidos (`Purpose`, `Claim IDs`) no reciben referencias
`§`, así que no generan anclas frágiles con sufijo.

---

## Convención de enlace adoptada

```text
antes:   ver §16
después: ver [Cumplimiento Fiscal DGI](#16-section-14--cumplimiento-fiscal-dgi-dt-09-2007)
```

- El texto del enlace es el **título de la sección**, no su número.
- Las referencias a otro documento llevan **ruta relativa + ancla**.
- Las anclas son las de GitHub (título en minúsculas, sin puntuación, espacios a guiones).

**Riesgo declarado:** las anclas derivan del texto del título. Renombrar una sección referenciada
rompe los enlaces que la citan. Queda como regla en la gobernanza.

---

## Tareas

### T1 · Cerrar las cuatro decisiones
1. URL en la IA (decisión de URL), el paquete de inicio y el contrato de producto.
2. Fotografía diferida en el brief y el paquete.
3. Receptor de demos en `OD-PP-10` del contrato de producto.
4. Antecedentes marcarios en curso en el brief.

**Checks:** ninguna decisión cerrada sigue figurando como abierta.
**Commit evidencia:** pendiente.

### T2 · Reemplazar `§NN` por enlaces
1. Construir el índice de anclas de cada documento.
2. Resolver el documento destino de cada referencia por contexto.
3. Reescribir como enlaces con el título como texto.

**Checks:** toda ancla generada existe en el documento destino.
**Commit evidencia:** pendiente.

### T3 · Verificación
1. Verificación independiente: que cada enlace resuelva, que ningún `§` sobreviva, y que no se haya
   alterado ningún claim ni conteo.

**Checks:** informe con PASS/FAIL.
**Commit evidencia:** pendiente.


---

## RESULTADO (2026-10-08)

**2 commits empujados:** `5cf8f6c8`… no. Los de esta tanda: `a1fb7d4c` y el cierre de decisiones.
Rama `feat/nhilos-branding-reality-audit`, 18 commits totales.

### Decisiones cerradas

| Decisión | Estado | Dónde quedó |
|---|---|---|
| Marcaria | EN CURSO (el cliente la ejecuta) | Brief §10 y sección de propiedad del nombre |
| Dominio `nhilospos.com` + `<cliente>.nhilospos.com` + `api.nhilospos.com` | **CERRADA** | IA §Route governance (con la consecuencia de arquitectura: el marketing vive en el apex y no comparte espacio con los inquilinos) |
| Fotografía propia | **CERRADA como diferida** | Brief §10 y handover §5/§6 |
| Receptor de demos: el fundador | **CERRADA** | `OD-PP-10` pasó de `OPEN` a `CLOSED`; se actualizaron el DoD y el recuento de decisiones abiertas del contrato de producto |

Quedan abiertas solo tres: estados vacíos/error del sitio, prioridad de soportes, y el `path` exacto de cada página.

### Conversión de `§` a enlaces

- **261 enlaces con ancla verificados, 0 rotos** (chequeo mecánico contra las anclas reales de los títulos).
- Las referencias apuntan a **documentos distintos** y se resolvieron por contexto: el brief cita la constitución, el media inventory cita el contrato de producto, el cuadro NF de la IA cita el spec no funcional, y el OD-02 cita el contrato de homepage.
- **Corrección derivada:** `§13.12` no existe como sección. La prohibición de autodescribirse como premium es el **ítem 12** de una lista dentro de §13, no una subsección. Ahora enlaza a §13 y dice qué ítem es.

### Alcance contenido a propósito

El `§` es **convención repo-wide: 45 documentos fuera del set** lo usan (auditorías, planes, onboarding). Se convirtió **solo el set de branding**.

Consecuencia importante: se **restauraron las tres copias de estándares en `Recursos/` a identidad byte a byte** con sus canónicas. Convertirlas habría divergido silenciosamente una copia de su fuente — el mismo defecto de dueño duplicado que esta auditoría viene corrigiendo.

**Hallazgo nuevo:** la copia del estándar de backoffice en `Recursos/` está **19 líneas por detrás** de la canónica `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (a esta le faltan las secciones 17.5 y 26.1 y párrafos sueltos). Es preexistente, no lo causó este cambio, y es la misma clase de problema: copia sin gobierno. Merece una decisión: deduplicar (referenciar la canónica) o resincronizar.

### Convención documentada

Quedó en la gobernanza, con su restricción: **el ancla deriva del texto del título**, así que renombrar una sección referenciada rompe todos los enlaces que la citan.
