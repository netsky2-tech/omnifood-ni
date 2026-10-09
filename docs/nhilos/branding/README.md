# NHILOS — Set documental de branding y sitio web

Este directorio contiene la documentación que gobierna **la marca NHILOS, el sitio comercial y el
contenido de la página de producto**. Está organizado por el rol de cada documento en la cadena de
autoridad, no por fecha ni por autor.

**Empezá por la gobernanza.** Si vas a leer o editar cualquier otra cosa de acá, la
[gobernanza](gobernanza/nhilos_branding_document_governance_v1.0.md) te dice qué documento manda
sobre qué y en qué orden se leen.

---

## Cómo está organizado

| Carpeta | Qué contiene |
|---|---|
| [`gobernanza/`](gobernanza/) | Las reglas del set y el informe que las originó |
| [`identidad/`](identidad/) | El encargo de identidad de marca y el paquete de inicio para diseño |
| [`claims/`](claims/) | El registro de lo que el producto realmente hace, con evidencia |
| [`web/`](web/) | Mensaje, arquitectura de información, contenido y gates no funcionales del sitio |
| [`producto/`](producto/) | Contenido de la página profunda de producto y el inventario de medios |

---

## Orden de lectura

### Si sos del equipo y querés entender el set

| # | Documento | Para qué |
|---|---|---|
| 1 | [Gobernanza del set](gobernanza/nhilos_branding_document_governance_v1.0.md) | La cadena de autoridad, las 9 reglas y la convención de referencias |
| 2 | [Registro de claims (OD-02)](claims/product_claim_audit_od02_v1.3.md) | Qué hace el producto y con qué límites. **Es la única fuente de lo que se puede afirmar** |
| 3 | [Brief de marketing](web/nhilos_website_product_marketing_brief_v1.0.md) | Posicionamiento y mensaje por capacidad |
| 4 | [Arquitectura de información del sitio](web/nhilos_website_information_architecture_content_wireframe_v1.0.md) | Sitemap, navegación, wireframes |
| 5 | [Contenido de homepage](web/nhilos_website_homepage_content_v1.1.md) y [de página de producto](producto/nhilos_pos_product_page_content_v1.1.md) | El copy real, con sus restricciones |
| 6 | [Spec no funcional del sitio](web/nhilos_website_non_functional_spec_v1.0.md) | Accesibilidad y rendimiento como criterios de aceptación |
| 7 | [Inventario de medios](producto/nhilos_pos_media_inventory_v1.0.md) | Qué evidencia visual existe y en qué estado |

### Si vas a diseñar

Empezá por el [paquete de inicio para diseño](identidad/nhilos_design_kickoff_handover_v0.1.md):
contiene el orden exacto, el alcance, las decisiones ya tomadas y las reglas que no se negocian.

Para la marca, el encargo es el [brief de identidad](identidad/nhilos_brand_identity_brief_v0.1.md).

### Si querés entender de dónde viene todo esto

El [informe de auditoría de realidad](gobernanza/branding_reality_audit_v0.1.md) documenta el estado
**encontrado**, con los 4 bloqueantes, 12 hallazgos altos y 13 medios que originaron esta
reorganización. Usa los nombres de archivo previos a la normalización: es un registro histórico.

---

## Qué NO está en este directorio

| Documento | Dónde vive | Por qué no acá |
|---|---|---|
| Constitución de marca | [`docs/nhilos/nhilos_brand_experience_principles_v1.0.md`](../nhilos_brand_experience_principles_v1.0.md) | Es la autoridad fundacional de toda la compañía, no solo de este set. Tiene dueño único. |
| Estándar de experiencia POS | [`docs/nhilos/nhilos_pos_experience_standard_v1.0.md`](../nhilos_pos_experience_standard_v1.0.md) | Estándar técnico vivido, con dueño propio |
| Estándar de experiencia backoffice | [`docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`](../nhilos_backoffice_experience_standard_v1.0.md) | Ídem |
| Plantilla de auditoría de módulo | [`docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md`](../nhilos_backoffice_module_audit_template_v2.1.md) | Ídem |
| Capturas del producto | [`docs/nhilos/manuals/images/`](../manuals/images/) | Evidencia cruda; el set solo la indexa |
| Manuales de usuario | [`docs/nhilos/manuals/`](../manuals/) | Documentación de cliente |

> **Nota de historia:** este set llegó a tener copias de los estándares dentro de una carpeta
> `Recursos/`. Se eliminaron a propósito: una copia que puede divergir de su fuente es el defecto de
> **dueño duplicado**, y una de esas copias ya estaba 19 líneas por detrás de su canónica. Los
> estándares se referencian, no se copian.

---

## Las tres reglas que hay que respetar al editar

1. **Ningún documento contradice a su upstream.** La cadena está en la gobernanza. Si encontrás un
   error arriba, se escala; no se edita por tu cuenta.
2. **Todo claim técnico publicado cita un claim del registro.** Si no tiene fila en el OD-02, no se
   publica como capacidad.
3. **Las referencias cruzadas son enlaces, no `§NN`.** El texto del enlace es el título de la
   sección destino. **Consecuencia:** el ancla deriva del texto del título, así que renombrar una
   sección referenciada rompe todos los enlaces que la citan.

---

## Estado del set

El set está **aprobado en su contenido y bloqueado para publicación** por condiciones abiertas, no
por defectos. Las condiciones están declaradas y se pueden consultar en:

- El [registro de claims](claims/product_claim_audit_od02_v1.3.md): su anclaje es **provisional**
  mientras corre la línea de trabajo de descuentos y promociones.
- El [inventario de medios](producto/nhilos_pos_media_inventory_v1.0.md): su revalidación de
  capturas está **diferida** hasta el build final, para no recapturar dos veces.
- La gobernanza: la sección de anclaje lista los claims en riesgo y las obligaciones al cerrar esa
  línea.
