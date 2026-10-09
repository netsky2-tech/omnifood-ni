# NHILOS — Gobernanza del Set Documental de Branding y Sitio Web

**Documento:** `nhilos_branding_document_governance_v1.0.md`
**Versión:** 1.0
**Estado:** `APPROVED / AUTHORITATIVE — DOCUMENT GOVERNANCE`
**Autoridad de la que deriva:** `nhilos_brand_experience_principles_v1.0.md` §0 (Autoridad y alcance) y §17 (Gobernanza)
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
        ▼
2. product_claim_audit_od02_v1.3.md                    [branding/Recursos/]
   Autoridad de claims. Inventario de lo que el producto REALMENTE hace,
   con evidencia de código y límites declarados. Traduce la realidad técnica
   a claims admisibles.
        │
        ▼
3. nhilos_website_product_marketing_brief_v1.0.md      [branding/]
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
   Referencias técnicas transversales (no deciden marca ni claims):
   nhilos_pos_experience_standard_v1.0.md                [branding/Recursos/]
   nhilos_backoffice_experience_standard_v1.0.md         [branding/Recursos/]
   nhilos_website_non_functional_spec_v1.0.md                [branding/Recursos/]
   nhilos_backoffice_module_audit_template_v1.0.md       [branding/Recursos/]
```

**Regla anti-ciclo:** ningún documento puede declarar como upstream a un documento que lo declare
a él como upstream. Si un documento necesita una regla que vive arriba, la cita; no la reedita.

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
| 2 | `product_claim_audit_od02_v1.3.md` | `branding/Recursos/` | Autoridad de claims | 1.3 | `CLOSED / VERIFIED / RE-ANCHORED` |
| 3 | `nhilos_website_product_marketing_brief_v1.0.md` | `branding/` | Narrativa de marketing | 1.0 | `APPROVED` |
| 4 | `nhilos_website_information_architecture_content_wireframe_v1.0.md` | `branding/` | IA y contenido del sitio | 1.0 | `APPROVED` |
| 5 | `nhilos_website_homepage_content_v1.1.md` | `branding/` | Contrato de contenido de la homepage | 1.1 | `APPROVED / PUBLICATION GATED` |
| 6 | `nhilos_pos_product_page_content_v1.1.md` | `branding/` | Contrato de contenido de producto | 1.1 | `APPROVED / PUBLICATION GATED` |
| 7 | `nhilos_pos_media_inventory_v1.0.md` | `branding/` | Evidencia visual (Gate D) | 1.0 | `CONTENIDO APROBADO / GATE D PARCIAL — 1 VIGENTE · 1 OBSOLETA · 6 A REVERIFICAR · 6 FALTANTES` |
| — | `nhilos_pos_experience_standard_v1.0.md` | `branding/Recursos/` | Estándar UX superficie POS | 1.0 | `APPROVED / REFERENCE` |
| — | `nhilos_backoffice_experience_standard_v1.0.md` | `branding/Recursos/` | Estándar UX superficies backoffice | 1.0 | `APPROVED / REFERENCE` |
| — | `nhilos_website_non_functional_spec_v1.0.md` | `branding/Recursos/` | Spec no funcional del sitio | 1.0 | `DRAFT` — gates heredados por la IA (§18.1 `NF-01`..`NF-13`) |
| — | `nhilos_backoffice_module_audit_template_v1.0.md` | `branding/Recursos/` | Plantilla de auditoría de módulo | 1.0 | `EVIDENCE PASS` |

**Documentos derivados exigidos por la constitución y aún inexistentes** (deuda declarada, no
pendiente de este set): `nhilos_brand_identity_system.md`, `nhilos_verbal_identity_guide.md` y
las especificaciones de expresión por producto. La constitución los marca como línea futura.

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

## 7. Estado de cierre respecto de la auditoría de realidad

Este documento cierra el contrato de autoridad. Los hallazgos de contenido restantes se corrigen
en los documentos que corresponden, según el plan `R1–R12` de
`branding_reality_audit_v0.1.md`.
