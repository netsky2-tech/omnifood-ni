# NHILOS — Gobernanza del Set Documental de Branding y Sitio Web

**Documento:** `nhilos_branding_document_governance_v1.0.md`
**Versión:** 1.0
**Estado:** `APPROVED / AUTHORITATIVE — DOCUMENT GOVERNANCE`
**Autoridad de la que deriva:** `nhilos_brand_experience_principles_v1.0.md` [Autoridad y alcance](../../nhilos_brand_experience_principles_v1.0.md#0-autoridad-y-alcance) (Autoridad y alcance) y [Excepciones](../../nhilos_brand_experience_principles_v1.0.md#17-excepciones) (Gobernanza)
**Alcance:** todo documento de marca, marketing, arquitectura de sitio, contenido de producto y evidencia de medios de NHILOS
**Fecha:** 2026-10-08
**Origen:** creado para cerrar los hallazgos `B1`, `H1`, `H10`, `H11` y `M5` de `branding_reality_audit_v0.1.md`

---

## 1. Por qué existe este documento

Antes de este documento, la cadena de autoridad del set era **circular**: el Marketing Brief
declaraba al OD-02 como su upstream y el OD-02 declaraba al Marketing Brief como el suyo. Cuando
dos documentos se contradicen y cada uno es autoridad del otro, ninguna contradicción puede
resolverse por regla; solo por opinión de quien la encuentre primero. Eso ya produjo defectos
reales: rutas de sitio que un documento prescribe y otro prohíbe, y un contrato de identificadores
de claim que no se intersecta con su propia fuente de verdad.

Este documento fija la dirección. Es de cumplimiento obligatorio para cualquier cambio futuro en
el set.

---

## 2. Regla de oro

> **El producto real tiene precedencia sobre cualquier afirmación de marketing.**
> Y hacia abajo de la cadena, **ningún documento puede contradecir a su upstream**,
> solo precisarlo con más detalle.

---

## 3. Cadena de autoridad (lineal, sin ciclos)

```text
1. nhilos_brand_experience_principles_v1.0.md          [docs/nhilos/]
   Constitución de marca. Autoridad fundacional sobre
   arquitectura de marca, personalidad, comportamiento verbal y no-negociables.
        │
        ├─────────────────────────────────────────────┐
        │                                             ▼
        │                              I. nhilos_brand_identity_brief_v0.1.md
        │                                 [branding/identidad/] Capa de identidad.
        │                                 Traduce la constitución en un encargo de
        │                                 identidad ejecutable: núcleo de marca,
        │                                 restricciones, direcciones, entregables.
        │                                      │
        │                                      ▼
        │                                 nhilos_brand_identity_system.md
        │                                 (a producir por diseño — previsto en el anexo D, diferido por [Decisiones DEFERRED / downstream](../../nhilos_brand_experience_principles_v1.0.md#47-decisiones-deferred--downstream) `BR-D01`)
        ▼
2. product_claim_audit_od02_v1.3.md                    [branding/claims/]
   Autoridad de claims. Inventario de lo que el producto REALMENTE hace,
   con evidencia de código y límites declarados. Traduce la realidad técnica
   a claims admisibles.
        │
        ▼
3. nhilos_website_product_marketing_brief_v1.0.md      [branding/web/]
   Narrativa de marketing. Elige qué claims admisibles se usan y con qué
   segmento y mensaje. NO inventa claims.
        │
        ├──────────────────────► 4. nhilos_website_information_architecture_content_wireframe_v1.0.md
        │                            Dueño de la navegación y las rutas. Recibe del brief
        │                            mensajes por capacidad, no rutas ni promesas fuera de
        │                            lo que el brief autoriza en messaging.
        │                                 │
        │                                 ▼
        │                          5. nhilos_website_homepage_content_v1.1.md
        │                             Contrato de contenido de la homepage.
        │                             Implementa los bloques H00–H13 de la IA con copy,
        │                             claims citados del OD-02 y límites declarados.
        │                                 │
        │                                 ▼
        │                          6. nhilos_pos_product_page_content_v1.1.md
        │                             Contrato de contenido de página de producto.
        │                             Cada claim publicado cita su ID del OD-02.
        │                             Contrasta contra la homepage en el Gate E.
        │                                 │
        │                                 ▼
        │                          7. nhilos_pos_media_inventory_v1.0.md
        │                             Evidencia visual (Gate D). Ningún activo puede
        │                             contradecir el contenido del paso 6.
        │
        ▼
   D. nhilos_design_kickoff_handover_v0.1.md           [branding/identidad/]
      Paquete operativo del encargo de diseño. No decide marca ni claims:
      declara qué documento gobierna cada frente de trabajo, en qué orden
      se lee y qué decisiones ya están tomadas.

   Referencias técnicas transversales (no deciden marca ni claims):
   nhilos_pos_experience_standard_v1.0.md                [docs/nhilos/]
   nhilos_backoffice_experience_standard_v1.0.md         [docs/nhilos/]
   nhilos_website_non_functional_spec_v1.0.md                [branding/web/]
   nhilos_backoffice_module_audit_template_v2.1.md       [docs/nhilos/]
```

**Regla anti-ciclo:** ningún documento puede declarar como upstream a un documento que lo declare
a él como upstream. Si un documento necesita una regla que vive arriba, la cita; no la reedita.

### Convención de referencia entre documentos

Las referencias cruzadas se escriben como **enlaces de markdown cuyo texto es el título de la
sección destino**, sin el símbolo `§`. El número de sección vive en el ancla, no en el texto:

```markdown
antes:   ver §16
después: ver [Cumplimiento Fiscal DGI](../producto/nhilos_pos_product_page_content_v1.1.md#16-section-14--cumplimiento-fiscal-dgi-dt-09-2007)
```

**Consecuencia que hay que respetar:** el ancla deriva del **texto del título**. Renombrar una
sección referenciada rompe todos los enlaces que la citan. Al renombrar una sección numerada, hay
que buscar quién la referencia y actualizar el enlace.

Motivo: leer `§16` obliga a buscar la sección; el título enlazado dice de qué se está hablando y
lleva ahí en un clic.

---

## 4. Reglas de cumplimiento

| # | Regla | Verificable por |
|---|---|---|
| `G-01` | Todo documento declara en su cabecera: id exacto, versión, estado, y su **upstream inmediato** por id y versión. | Inspección de cabecera |
| `G-02` | Un documento downstream **nunca** contradice a su upstream. Si detecta un error upstream, lo escala; no lo edita por su cuenta. | Diff cruzado |
| `G-03` | Ningún documento se autodeclara "fuente autoritativa única" de nada. La autoridad se otorga desde este documento. | grep de "autoritativa única" |
| `G-04` | Todo claim técnico publicado en contenido de marketing o de producto cita un ID de claim del OD-02. Un claim sin ID no se publica. | Integridad de IDs |
| `G-05` | Los números, textos de UI y nombres de hardware citados deben ser verificables en el repositorio. Prohibido transcribir texto de interfaz de memoria o de un build obsoleto. | Búsqueda en código |
| `G-06` | Toda promesa de capacidad declara su `works_when` / `does_not_work_when`. Capacidad sin límite declarado = claim no admisible. | Ausencia de límite |
| `G-07` | La sustitución de un documento se marca explícitamente con `SUPERSEDED BY <id>`. Prohibido dejar dos documentos "vigentes" que digan cosas distintas. | grep de SUPERSEDED |
| `G-08` | Una revisión de realidad se re-ancla a un commit concreto y la fecha del anclaje queda en la cabecera. Un anclaje de más de 90 días o más de 200 commits obliga a re-auditar antes de publicar. | Cabecera del OD-02 |
| `G-09` | La evidencia de medios (capturas) proviene del build anclado vigente, no de un build histórico. | Cabecera del media inventory |

---

## 5. Registro de documentos

| # | Documento (id) | Ruta | Rol | Versión | Estado |
|---|---|---|---|---|---|
| 1 | `nhilos_brand_experience_principles_v1.0.md` | `docs/nhilos/` | Constitución de marca | 1.0 | `APPROVED / AUTHORITATIVE` |
| 2 | `product_claim_audit_od02_v1.3.md` | `branding/claims/` | Autoridad de claims | 1.3 | `CLOSED / VERIFIED / RE-ANCHORED` |
| 3 | `nhilos_website_product_marketing_brief_v1.0.md` | `branding/web/` | Narrativa de marketing | 1.0 | `APPROVED` |
| 4 | `nhilos_website_information_architecture_content_wireframe_v1.0.md` | `branding/web/` | IA y contenido del sitio | 1.0 | `APPROVED` |
| 5 | `nhilos_website_homepage_content_v1.1.md` | `branding/web/` | Contrato de contenido de la homepage | 1.1 | `APPROVED / PUBLICATION GATED` |
| 6 | `nhilos_pos_product_page_content_v1.1.md` | `branding/producto/` | Contrato de contenido de producto | 1.1 | `APPROVED / PUBLICATION GATED` |
| 7 | `nhilos_pos_media_inventory_v1.0.md` | `branding/producto/` | Evidencia visual (Gate D) | 1.0 | `CONTENIDO APROBADO / GATE D PARCIAL — 1 VIGENTE · 1 OBSOLETA · 6 A REVERIFICAR · 6 FALTANTES / REVALIDACIÓN DE CAPTURAS DIFERIDA ([Estado de anclaje y obligación de re-anclaje](#7-estado-de-anclaje-y-obligación-de-re-anclaje))` |
| — | `nhilos_pos_experience_standard_v1.0.md` | `docs/nhilos/` | Estándar UX superficie POS | 1.0 | `APPROVED / REFERENCE` |
| — | `nhilos_backoffice_experience_standard_v1.0.md` | `docs/nhilos/` | Estándar UX superficies backoffice | 1.0 | `APPROVED / REFERENCE` |
| — | `nhilos_website_non_functional_spec_v1.0.md` | `branding/web/` | Spec no funcional del sitio | 1.0 | `DRAFT` — gates heredados por la IA ([Non-functional acceptance gates (inherited)](../web/nhilos_website_information_architecture_content_wireframe_v1.0.md#181-non-functional-acceptance-gates-inherited) `NF-01`..`NF-13`) |
| — | `nhilos_backoffice_module_audit_template_v2.1.md` | `docs/nhilos/` | Plantilla de auditoría de módulo | 2.1 | `EVIDENCE PASS` |
| `I` | `nhilos_brand_identity_brief_v0.1.md` | `branding/identidad/` | Capa de identidad — encargo de diseño | 0.1 | `FOR DESIGN — INPUT DOCUMENT` |
| `D` | `nhilos_design_kickoff_handover_v0.1.md` | `branding/identidad/` | Paquete operativo del encargo de diseño | 0.1 | `FOR DESIGN — KICKOFF PACK` |

### Roadmap de documentos de marca pendientes

La constitución prevé esta secuencia (árbol documental del anexo D) y declara explícitamente que v1.0 se aprueba **sin requerir** que el sistema de identidad esté diseñado ([Decisiones DEFERRED / downstream](../../nhilos_brand_experience_principles_v1.0.md#47-decisiones-deferred--downstream) `BR-D01`, [Authority boundary after v1.0](../../nhilos_brand_experience_principles_v1.0.md#48-authority-boundary-after-v10)). Ningún documento se produce «porque está en la lista»:
cada uno se produce cuando su disparador aparece. Así se evita olvidarlo **y** se evita generar
versiones flacas que nadie usa.

| Documento | Estado | Disparador que lo justifica |
|---|---|---|
| `nhilos_brand_identity_system.md` | **Pendiente — es el entregable de diseño en curso** | Existe el brief (`I`). Se produce cuando el diseñador entregue la identidad. La constitución lo deja **diferido** ([Decisiones DEFERRED / downstream](../../nhilos_brand_experience_principles_v1.0.md#47-decisiones-deferred--downstream) `BR-D01`), no exigido. |
| `nhilos_verbal_identity_guide.md` | Pendiente | Hoy la autoridad verbal es la constitución [Identidad verbal](../../nhilos_brand_experience_principles_v1.0.md#14-identidad-verbal) y alcanza. Se justifica cuando haya **más de un redactor o agencia** escribiendo para la marca. |
| `product_expression_specs/nhilos_pos_brand_expression.md` | Pendiente | Se justifica cuando exista un **segundo producto** y haya que definir qué puede variar por producto. Hoy POS es la única expresión vigente. |
| `product_expression_specs/` (conta, erp) | Pendiente | Cuando esos productos se aprueben. Hoy son líneas previstas, no aprobadas. |
| `experience_playbooks/` (sales, onboarding, support) | Pendiente | Cuando la operación de esos frentes escale al punto de necesitar guion propio. |

---

## 6. Control de cambios

1. Un cambio en el paso 1 obliga a revisar los pasos 2 a 7.
2. Un cambio en el paso 2 (nuevo claim admisible o claim retirado) obliga a revisar los pasos 3 a 7.
3. Un cambio de rutas o navegación del sitio se decide en el paso 4 (IA wireframe) y nunca en el
   paso 3. El Brief contribuye mensajes por capacidad, no rutas: no puede introducirlas,
   prescribirlas ni propagarlas.
4. **Ownership split:** el Brief (paso 3) es dueño del **messaging**; el IA wireframe (paso 4) es
   dueño de la **navegación y las rutas**. Toda decisión de sitemap, rutas o navegación nace y se
   documenta en el paso 4.
5. Toda revisión de realidad se registra como un documento numerado y su resultado se refleja en
   el paso correspondiente antes de publicar.

---

## 7. Estado de anclaje y obligación de re-anclaje

**Anclaje vigente del set:** `b4b5ad27` (`origin/main`, 2026-10-08).

`G-08` obliga a re-anclar cuando el build se mueve. Hoy hay un motivo concreto y conocido, no
hipotético: existe una línea de trabajo en curso (**auditoría P3 de descuentos y promociones
e2e, web + POS**) que **cambia comportamiento que este set ya publica**. Mientras esa línea no
cierre, el anclaje `b4b5ad27` queda declarado como **provisional** y los claims de la tabla
siguiente quedan marcados como **pendientes de re-verificación**.

| Línea de trabajo en curso | Superficie | Claims del OD-02 en riesgo |
|---|---|---|
| Acumuladores independientes, base de lealtad y etiquetas de UI | Lealtad | `PC-LOY-01`, `PC-LOY-06` |
| Tope de descuento: configuración, proyección al POS y rechazo en descuento manual | Descuentos | `PC-LOY-02`, `PC-PAY-04` |
| Promociones: retiro del toggle en POS y recarga con checkout abierto | Promociones | `PC-LOY-05` |
| Origen del descuento por línea (backend, prorrateo y reporte) | Descuentos / reportes | `PC-LOY-02`, `PC-DASH-04` |
| Historial de ventas: filtro de fecha, totales del conjunto y fracasos honestos | Reportes | `PC-DASH-04` |
| Modifiers: coerción de decimales y normalización en la API | Modificadores | `PC-FOH-02` |
| Mensajes de error sin fuga de datos internos | Contratos de API | `PC-SEC-03` |
| Proyección de `audit_logs` al panel con actor y entidad | Auditoría | `PC-SEC-03` |
| QR / transferencia, topología de KDS, Fase 8.3 | Pagos y cocina | `PC-PAY-01`, `PC-HW-03` |

### Obligación al cerrar esa línea de trabajo

1. **Re-verificar** cada claim de la tabla contra el nuevo build; clasificar `SIN CAMBIO`,
   `DERIVA` o `YA NO SOSTENIBLE`, y actualizar límites donde corresponda.
2. **Re-anclar** el OD-02 a un commit concreto y actualizar la fecha de la cabecera.
3. **Revalidar los medios** contra el build final: era exactamente el motivo por el que la
   revalidación de capturas quedó diferida (ver `nhilos_pos_media_inventory_v1.0.md` [Revalidación de Medios contra el Build Anclado (`b4b5ad27`)](../producto/nhilos_pos_media_inventory_v1.0.md#5-revalidación-de-medios-contra-el-build-anclado-b4b5ad27)).
4. **Revisar los contratos de contenido** (homepage y página de producto) para que ninguna copia
   publicada contradiga el comportamiento nuevo, especialmente en descuentos, promociones,
   lealtad y modificadores.

Ningún documento de este set puede publicarse con el anclaje marcado como provisional si alguno de
los claims en riesgo cambió.

---

## 8. Estado de cierre respecto de la auditoría de realidad

Este documento cierra el contrato de autoridad. Los hallazgos de contenido restantes se corrigen
en los documentos que corresponden, según el plan `R1–R12` de
`branding_reality_audit_v0.1.md`.
