# NHILOS Branding — Auditoría de realidad y remediación documental

**Origen:** pedido del usuario — auditar `docs/nhilos/branding/` para que refleje la realidad
del producto actual, con el standard de experiencia NHILOS (POS + web/backoffice) como marco, y
narrar el valor del loyalty ya implementado.
**Base de comparación:** `origin/main` = `b4b5ad27` (2026-10-08). HEAD de trabajo actual:
`fix/voucher-reconciliation-sync-route` = `fcf9f873` (+3 commits no pusheados, ajenos a este trabajo).
**Estado:** EN CURSO — Fase A (auditoría, solo lectura).

---

## Decisiones del usuario (2026-10-08)

| # | Decisión | Valor elegido |
|---|---|---|
| D1 | Entregable | **Auditoría + reescritura**: primero el informe, y con OK explícito se reescriben los docs (tareas ODD + commits). |
| D2 | Loyalty | **Pilar de posicionamiento verificado**: auditar implementación real y proponerlo como valor público con límites explícitos. |
| D3 | Limpieza estructural | **Incluida**: eliminar `:Zone.Identifier`, deduplicar Brand Principles contra el doc trackeado, convertir el `.docx` a `.md`. |

---

## Contexto verificado del set

| Hecho | Evidencia |
|---|---|
| `docs/nhilos/branding/` es **untracked** (no está en `main`) | `git status --short` |
| `NHILOS - Brand Experiencie Principles` es **byte-idéntico** a `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` | `diff -q` → sin diferencias |
| 18 archivos `*:Zone.Identifier` acompañan cada doc | `find docs/nhilos/branding -type f` |
| `NHILOS POS - Media Inventory.docx` declara ser `nhilos_pos_media_inventory_v1.0.md`, `APPROVED / GATE D`, build `7af1521` | `unzip -p ... word/document.xml` |
| El docx referencia `nhilos_pos_product_page_content_v1.2`; el `.md` presente es **v1.1** | desalineación de contrato de versiones |
| `Recursos/` tiene el standard de **backoffice** pero **no** el `nhilos_pos_experience_standard_v1.0.md` | `ls Recursos/` |
| Loyalty: **0 menciones** en brief, product page, wireframe y media inventory | `grep -ric loyalty ...` |
| OD-02 (`product_claim_audit_od02_v0.1.md` v1.1) auditado contra `7af1521` (2026-09-26) | cabecera del documento |
| Deriva desde el build auditado | `git log 7af1521..origin/main` → **575 commits** (Nivel 1/2/3 POS, sync outbound de customers, reconciliación de vouchers, FX range, badge de frescura de dashboard) |

---

## Reglas de la auditoría

1. **El producto real manda sobre el claim de marketing** (regla heredada de OD-02).
2. Nunca se introduce *futureware*: lo no implementado se marca `PROPOSED` y queda fuera del copy público.
3. Todo claim público necesita evidencia de código o test en `origin/main`.
4. Los estándares NHILOS POS y Backoffice son el marco de conformidad de forma, no solo de contenido.
5. La fase de auditoría es **solo lectura**; no se toca ningún documento hasta el gate humano de A6.

---

## Fase A — Auditoría (solo lectura) + informe

### A1 · Inventario y gobernanza del set
1. Inventariar los 5 documentos + `Recursos/` con rol, autoridad y downstream de cada uno.
2. Detectar duplicados, huérfanos, versiones desalineadas y referencias faltantes.
3. Mapear la cadena de autoridad real: Brand Principles → Marketing Brief → IA Wireframe → Product Page → Media Inventory → OD-02.

**Checks:** cada documento del folder aparece con rol y upstream/downstream declarados.
**Commit evidencia:** pendiente.

### A2 · Re-verificación de la matriz OD-02 (34 claims) contra `main`
1. Confirmar el contrato de evidencia de OD-02 (E3 + E4) y los límites LIM-01..LIM-06.
2. Re-verificar cada claim contra el código vigente en `origin/main`; clasificar: `SIN CAMBIO` / `DERIVA` / `YA NO SOSTENIBLE` / `NUEVO CLAIMABLE`.
3. Priorizar los 575 commits por impacto en claims públicos (Nivel 1/2/3 POS, sync de customers, vouchers, FX range, frescura de dashboard).

**Checks:** tabla claim → estado → evidencia `path:line` en `origin/main`.
**Commit evidencia:** pendiente.

### A3 · Auditoría de Loyalty como pilar verificado
1. Mapear la implementación real: ledger, proyección, earn/redeem, promotions (batch 14), superficies POS y backoffice.
2. Cruzar contra `docs/loyalty/*` (PRD, spec, roadmap, gap audit, metric contract) y el re-audit POS↔Web v2.
3. Derivar claims públicos verificables con sus `works_when` / `does_not_work_when`, y lo que **no** se puede prometer.

**Checks:** cada claim de loyalty propuesto tiene evidencia en código y un límite declarado.
**Commit evidencia:** pendiente.

### A4 · Conformidad con estándares NHILOS
1. `docs/nhilos/nhilos_pos_experience_standard_v1.0.md` → conformidad del Product Page Content y Media Inventory.
2. `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` → conformidad del IA Wireframe (superficie web) y de las menciones de Owner Dashboard.
3. `nhilos_brand_experience_principles_v1.0.md` → identidad verbal, no-negociables, `NHILOS +1`, límites de marca.

**Checks:** hallazgos por estándar, con sección citada del estándar y del doc.
**Commit evidencia:** pendiente.

### A5 · Consistencia interna y contrato de versiones
1. Verificar el contrato de versiones entre docs (brief v?, IA v1.0, product page v1.1 vs docx → v1.2, media inventory v1.0).
2. Verificar integridad de Claim IDs, allowlist/blocklist D4/D5 y cross-references.
3. Verificar la coherencia del sitemap y de las CTA contra las reglas de navegación N-01..N-04.

**Checks:** matriz de versiones y lista de cross-refs rotos.
**Commit evidencia:** pendiente.

### A6 · Informe consolidado + plan de remediación → **GATE HUMANO**
1. Consolidar hallazgos con severidad y evidencia.
2. Proponer el plan de remediación doc-por-doc.
3. **Esperar OK explícito del usuario antes de la Fase B.**

**Checks:** informe entregado; gate declarado.
**Commit evidencia:** pendiente.

---

## Fase B — Remediación (post-gate)

### B1 · Limpieza estructural del folder
1. Eliminar los 18 `*:Zone.Identifier`.
2. Deduplicar Brand Principles contra `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` (dejar un único dueño).
3. Convertir `NHILOS POS - Media Inventory.docx` a `.md` con nombre normalizado.
4. Normalizar nombres de archivo y agregar `Recursos/nhilos_pos_experience_standard_v1.0.md`.

**Checks:** folder sin `Zone.Identifier`, sin duplicados, con nombres normalizados.
**Commit evidencia:** pendiente.

### B2 · Reescritura y normalización de los documentos
1. Reescribir los documentos para reflejar la realidad verificada en Fase A.
2. Incorporar Loyalty como pilar verificado, con límites explícitos.
3. Alinear forma y vocabulario a los estándares NHILOS POS y Backoffice.

**Checks:** sin *futureware*; todo claim trazable a OD-02 o a evidencia nueva.
**Commit evidencia:** pendiente.

### B3 · Verificación final del set
1. Re-correr la matriz de claims contra los documentos reescritos.
2. Verificar integridad de Claim IDs, versiones y cross-refs.
3. Verificar conformidad final con los estándares.

**Checks:** matriz verde; sin IDs huérfanos; versiones consistentes.
**Commit evidencia:** pendiente.

---

## RESULTADO DE FASE A (2026-10-08)

Entregable: `docs/nhilos/branding/branding_reality_audit_v0.1.md` (borrador `REVIEW_REQUIRED`).
Ningún documento auditado fue modificado. No se creó rama ni commit: la Fase B espera el gate.

**Conteo de hallazgos:** 4 BLOCKER · 12 HIGH · 13 MEDIUM · 3 LOW.

| Bloque | Resultado |
|---|---|
| A1 inventario y gobernanza | 5 documentos + 4 en `Recursos/` con rol y cadena de autoridad mapeados; **circularidad Brief ↔ OD-02**; 18 `Zone.Identifier`; duplicado byte-idéntico del Brand Principles |
| A2 re-verificación OD-02 | **30 SIN CAMBIO · 3 DERIVA · 0 YA NO SOSTENIBLE · 0 NUEVO CLAIMABLE** en la matriz; 2 rutas de evidencia muertas; límite Floor v57 obsoleto (real v65) |
| A3 loyalty | 6 claims públicos verificables (`LY-01..LY-06`) + 9 capacidades diseñadas y no cableadas a la lista de no-promesa |
| A4 conformidad | gates del NFA huérfanos en la IA (WCAG/CWV/peso/targets ausentes); 12 violaciones de la constitución de marca; flujos Core A–E del POS **VERIFICADOS** contra código |
| A5 consistencia | 49 IDs del Product Page con intersección **cero** con los 34 del OD-02; conflicto de sitemap Brief vs Wireframe; drift de versiones en 4 documentos |

**Hallazgo inesperado y corregido en el camino:** el Product Page Content define **12** secciones
(no 8), y su numeración **sí** alinea con las 12 secciones del Media Inventory; lo que difiere son
los nombres, no los números.

**Riesgo declarado para Fase B:** los pasos R2 (contrato de Claim IDs) y R9 (rutas/arquitectura
del sitio) son reescrituras estructurales, no cosméticas; deben ser unidades de trabajo separadas
con revisión humana propia.

---

## RESULTADO DE FASE B (2026-10-08)

Worktree dedicado: `/home/octavio_morales/omnifood-ni-branding-reality-audit`
Rama: `feat/nhilos-branding-reality-audit` desde `origin/main` = `b4b5ad27`.
El árbol de trabajo principal quedó intacto (los 3 commits de vouchers y el bump local del
`pubspec.yaml` no se tocaron).

**9 commits de unidad de trabajo, 11 archivos, 9 541 líneas agregadas** (de las cuales 7 764 son
la importación literal del set que estaba untracked y 2 557 la copia del estándar POS: el
trabajo realmente autorado ronda las 1 800 líneas).

| WU | R | Commit | Resultado |
|---|---|---|---|
| B1 | R12 | `f8325505`, `bb274f17` | Set bajo control de versiones; nombres normalizados a los ids declarados; duplicado eliminado; `.docx` → `.md`; estándar POS agregado a `Recursos/` |
| B2 | R1+R11+R3 | `5a996f96` | Contrato de gobernanza con cadena de autoridad lineal y reglas G-01..G-09; OD-02 renombrado a v1.2 y re-anclado a `b4b5ad27`; 2 rutas de evidencia muertas corregidas; límite v57 → v65; claim fiscal delimitado |
| B3 | R2 | `4ee64bb5` | Anexo A con 49 filas de trazabilidad; índice inverso con 34 filas; 4 claims marcados `SIN BASE OD-02` |
| B4 | R4+R6+R7 | `06e1ae68` | Badge de UI inventado eliminado; topes 180/350 KB sin fuente eliminados; métrica de 2 segundos eliminada; PIN de supervisor corregido; 4 roles reales; perfil de hardware específico con 58/80 mm; FlexiPoint y OmniCore fuera; Gate D retirado por evidencia obsoleta |
| B5 | R5 | `a8afc664` | Absolutos delimitados; lenguaje de miedo y de estatus removido; CTA único; `NHILOS +1` presente |
| B6 | R10 | `645971c9` | OD-02 v1.3 con 40 claims; 6 claims de loyalty verificados; 10 no-promesas declaradas; pilar en el Brief, sección 13 en el producto, bloque en la IA, `MEDIA-LOY-01` pendiente |
| B7 | R8+R9 | `5c0ea8eb` | Autoridad de rutas asignada a la IA; Brief §5 reescrito como mensajes sin rutas; 13 gates NF-01..NF-13 heredados al wireframe; navegación desktop/móvil paridad; PASS falso reemplazado |
| B8 | verificación | `ec8b2175` | Verificador independiente read-only; 8 defectos sobrevivientes corregidos (versión 1.3, `1.0.1+6` sin fuente, contradicción de estado en el registro, conteo interno, G-04 operativo) |

**Estado del set:** ningún documento tiene futureware publicable; todo claim público cita un ID
del OD-02; la evidencia está anclada a `b4b5ad27` con fecha y regla de frescura (`G-08`).

**Pendientes declarados (no son defectos, son condiciones):**
1. Revalidación de los activos de medios contra `b4b5ad27` (Gate D retirado).
2. `nhilos_website_homepage_content_v1.1.md` no existe y bloquea la publicación del contrato de contenido.
3. 4 claims sin base en el OD-02, bloqueados para publicación hasta anclarlos.
4. Deuda declarada por la constitución: `nhilos_brand_identity_system.md` y guía verbal.
5. 12 claims del OD-02 sin cobertura publicada, incluido el bloque fiscal DGI `PC-FISC-01..03`.

---

## RESULTADO DE FASE C (2026-10-08)

Continuación sobre la misma rama y worktree. **5 commits más** (14 en total desde `b4b5ad27`).

| WU | Commit | Resultado |
|---|---|---|
| Limpieza | — | `docs/nhilos/branding/` borrado del checkout principal (respaldo en `omnifood-ni-wip-backups/nhilos-branding-original-2026-10-08.tar.gz`); 13 `:Zone.Identifier` eliminados. **6 de ellos estaban trackeados** en `docs/loyalty/` y se restauraron para no ensuciar el árbol del usuario. |
| C1 | `535f402b` | 3 claims atómicos nuevos (`PC-FOH-01..03`) anclan los 4 claims sin base; registro 40 → 43; **0 claims bloqueados** por `G-04` |
| C2 | `f3cafdc1` | `nhilos_website_homepage_content_v1.1.md` creado (918 líneas) desde la IA, el Brief, el registro y los estándares; dependencia del product page liberada |
| C3 | `34bdf6b8` | Hueco de cobertura cerrado y **nueva Sección 14 de Cumplimiento Fiscal DGI**; el índice inverso pasó a cubrir los dos contratos de contenido |
| C4 | `525470b2` | Revalidación de medios sobre evidencia real existente |
| C5 | `90192cf6` | Corrección de los 10 defectos que encontró la verificación independiente |

### Hallazgo mayor de C3

El product page **no tenía contenido fiscal**: cero menciones de DGI, DT 09-2007 o consecutivos,
pese a que el cumplimiento DGI es uno de los cinco pilares del Brief y hay un bloque
`PC-FISC-01..03` aprobado. El propio media inventory estaba mal etiquetado (llamaba "Fiscal DGI"
al Workflow D, que en realidad es mantener una cuenta abierta). Era un hueco de **contenido**, no
de claim: el código ya estaba auditado, nadie había escrito la página.

### Resultado de cobertura

**De 43 claims del registro, 40 tienen cita publicada.** Los 3 sin cita son exactamente
`PC-OFF-05`, `PC-FISC-04` y `PC-PAY-03`: los futureware que **no deben** publicarse. Ningún claim
`APPROVED_WEBSITE` quedó sin cobertura.

### Hallazgo mayor de C4

La biblioteca tiene **33 capturas reales**, no cero. Pero están tomadas entre el `2026-10-02` y el
`2026-10-07`, y el build siguió cambiando hasta el `2026-10-08`. El análisis de ventana de cambio
por superficie da: **1 vigente** (panel fiscal), **1 obsoleta** (cobro: la captura del 10-02 es
anterior a los campos `Nombre Cliente` / `RUC` del 10-07), **6 requieren reverificación** y
**6 faltantes**.

### Correcciones de la segunda verificación (C5)

El paso independiente volvió a encontrar defectos reales, incluido uno grave mío: la revalidación
de medios había medido 5 archivos y generalizado a los 33. La biblioteca tiene **tres resoluciones**
(16×`800x1280`, 8×`1080x2316` de dispositivo no documentado, 9×`1440x900` de navegador), y solo
**17** son las capturas ADB que documenta la auditoría. También se corrigieron el conteo de
secciones del product page, la composición de secciones del media inventory, los rangos del control
de cambios de gobernanza, la lista downstream del OD-02, la cadena upstream del product page, y la
aritmética del re-anclaje (30+3 no sumaba 34; el número correcto es 31+3).

**Verificación final:** registro 43 = índice inverso 43; product page 61 = Anexo A 61; homepage 34
IDs sin duplicados; veredictos de medios 1+1+6+6 = 14.

---

## DECISIONES DE CIERRE (2026-10-08)

| Decisión del usuario | Efecto |
|---|---|
| **Los medios y las capturas esperan al final** | La revalidación de capturas queda **diferida** hasta que cierre la línea P3 en curso, para plasmar la versión definitiva y no recapturar dos veces. Lo que sí se ejecutó: auditoría de la evidencia existente, procedencia fechada por commit, dimensiones reales y ventana de cambio por superficie. No hay nada pendiente de hacer ahora sobre este punto. |
| **Solo se empuja al repo** | Rama `feat/nhilos-branding-reality-audit` empujada a `origin` (15 commits). Sin PR. |

### Obligación registrada al cerrar la línea P3

El set queda anclado a `b4b5ad27` pero marcado **provisional**: la línea P3 (descuentos y
promociones e2e) cambia comportamiento que este set ya publica. La obligación de re-anclaje y los
claims en riesgo (`PC-LOY-01`, `PC-LOY-02`, `PC-LOY-05`, `PC-LOY-06`, `PC-FOH-02`, `PC-PAY-01`,
`PC-PAY-04`, `PC-DASH-04`, `PC-SEC-03`, `PC-HW-03`) están en
`nhilos_branding_document_governance_v1.0.md` §7, que exige al cerrar: re-verificar cada claim,
re-anclar a un commit concreto, revalidar medios y revisar los contratos de contenido.

**Pendiente fuera de alcance:** 6 archivos `:Zone.Identifier` **trackeados** en `docs/loyalty/`
(basura heredada); merecen un commit propio de limpieza.
