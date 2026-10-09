# NHILOS — Auditoría de Realidad: Documentos de Branding vs Producto

**Documento:** `branding_reality_audit_v0.1.md`
**Versión:** 0.1 (borrador para gate humano)
**Estado:** `REVIEW_REQUIRED` — pendiente de decisión del Founder
**Alcance auditado:** `docs/nhilos/branding/` (5 documentos + `Recursos/`)
**Base de comparación:** `origin/main` = `b4b5ad27` (2026-10-08)
**Working tree:** `origin/main` + 3 commits ajenos (reconciliación de vouchers, `fcf9f873`)
**Marco normativo aplicado:** `nhilos_brand_experience_principles_v1.0.md`, `nhilos_pos_experience_standard_v1.0.md`, `nhilos_backoffice_experience_standard_v1.0.md`, `nhilos_website_non_functional_acceptance_spec.md`
**Método:** 6 exploradores read-only en 2 olas; sin escritura sobre ningún documento auditado.
**Rol documental:** insumo de la remediación. Este informe es un registro del estado **encontrado**, no un documento gobernado por la cadena que él mismo originó (`nhilos_branding_document_governance_v1.0.md`): las rutas y nombres de archivo que cita son los vigentes al momento de la auditoría, antes de la normalización.

> **Regla rectora aplicada:** el producto real tiene precedencia sobre cualquier claim de
> marketing. Todo lo no verificable en código se marca y sale del copy público.

---

## 1. Veredicto ejecutivo

El set de branding **no refleja hoy la realidad del producto**, y la causa raíz no es de
redacción: es de **contrato documental**. Hay tres fallas estructurales:

1. **La cadena de autoridad es circular.** El Marketing Brief declara al OD-02 como su upstream;
   el OD-02 declara al Marketing Brief como su upstream. No hay raíz. Nadie puede decir cuál de
   los dos manda cuando divergen.
2. **La autoridad de claims no gobierna la publicación de claims.** El Brief llama al OD-02
   "fuente autoritativa única de claims técnicos", pero el Product Page Content — el documento
   que efectivamente publica claims — **no cita ni un solo ID del OD-02**. Define 49 IDs propios
   en 11 namespaces. La intersección es cero.
3. **La evidencia está congelada en un build viejo.** El OD-02 se auditó contra `7af1521`
   (2026-09-26) y el Media Inventory contra el mismo commit. Desde entonces entraron **575
   commits**, incluida la remediación Nivel 1/2/3 de POS, el sync outbound de customers y la
   reconciliación de vouchers. Al re-verificar los 34 claims: **31 sin cambio, 3 con deriva,
   0 insostenibles** — la base técnica resistió bien, pero **2 rutas de evidencia ya no
   existen** y **un límite declarado quedó obsoleto**.

Y hay una ausencia que es la más costosa para el lanzamiento: **Loyalty tiene 0 menciones** en
el Brief, el Product Page Content, el Wireframe y el Media Inventory, a pesar de estar
implementado, sincronizado y auditado. Es valor real de producto que hoy no se cuenta.

**Recomendación:** no publicar el set en su estado actual. Remediar en el orden propuesto en [Loyalty: estado verificado y propuesta de pilar](#7-loyalty-estado-verificado-y-propuesta-de-pilar)

---

## 2. Hallazgos BLOCKER

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| B1 | **Autoridad circular Brief ↔ OD-02.** Cada uno declara al otro como upstream. | `NHILOS - Website Product marketing Brief:6`; `Recursos/product_claim_audit_od02_v0.1.md:8` y `:216` | Ninguna divergencia futura puede resolverse por regla; solo por opinión. |
| B2 | **Contrato de Claim IDs vacío.** El Product Page Content define 49 IDs (`PP-001..PP-004`, `PC-001..004`, `CW-001..006`, `CT-001..005`, `CV-001..005`, `RL-001..004`, `GL-001..004`, `IM-001..005`, `HC-001..004`, `SP-001..004`, `DM-001..004`) con **intersección cero** con los 34 IDs del OD-02. | `NHILOS POS - Product Page Content 1.1.md:141-144, 245-248, 378-383, 467-471, 548-552, 635-638, 753-756, 847-851, 921-924, 989-992, 1182-1185, 1195-1198`; OD-02 `:75-108` | La "fuente autoritativa única" no tiene trazabilidad sobre lo publicado. Publicación sin gate real. |
| B3 | **Texto de runtime fabricado.** El Media Inventory describe un indicador de UI literal: *"Modo Offline Activo - Base de Datos SQLite Floor v57"*. **Ese string no existe en el código** (grep = 0 coincidencias). Los strings reales son `"Sin conexión (Offline) - N pendientes"`. Además el schema real es **v65**, no v57. | Media Inventory [Mapeo Exhaustivo por Sección de la Página de Producto (v1.1)](nhilos_pos_media_inventory_v1.0.md#3-mapeo-exhaustivo-por-sección-de-la-página-de-producto-v11) Sección 04; real: `apps/pos_app/lib/ui/features/sales/widgets/cloud_sync_status_badge.dart:179,292`; versión: `apps/pos_app/lib/data/database/app_database.dart:115-116` (`@Database(version: 65)`) | Viola la Regla Innegociable #1 del propio documento (cero mockups, todo runtime real). Bajo la regla "producto real > claim", el caption es falso. |
| B4 | **"Cumplimiento garantizado" lavado de auditoría a brief.** El OD-02 marca ✅ el claim *"Cumplimiento garantizado con la DT 09-2007"* y el Brief lo publica tal cual, pese a que el propio OD-02 limita el claim: requiere prefijo y folio autorizado por la DGI. | OD-02 `:134`; Brief `:39`; límite en OD-02 `:89` (`PUBLIC_APPROVED_WITH_LIMITATION`) | Contradice el No-Negociable #1 de la constitución de marca y la propia `LIM-01`. Riesgo legal y de credibilidad. El defecto está en la **cadena de aprobación**, no en el copywriter. |

---

## 3. Hallazgos HIGH

| # | Hallazgo | Evidencia |
|---|---|---|
| H1 | **Upstreams colgantes.** `nhilos_website_information_architecture_content_wireframe_v0.2.md` se referencia 4× y solo existe v1.0. `nhilos_website_homepage_content_v1.1.md` se referencia 4× por el Product Page Content y **condiciona su publicación** — no existe en ningún lugar del repo. | Brief `:7,162`; OD-02 `:9,217`; Product Page `:9,29,1340,1439` |
| H2 | **Conflicto de sitemap.** El Brief [Control Ejecutivo Remoto para el Dueño (Dashboard V2)](nhilos_website_product_marketing_brief_v1.0.md#5-control-ejecutivo-remoto-para-el-dueño-dashboard-v2) prescribe rutas de capacidad de primer nivel `/inventario`, `/fiscal`, `/hardware`, `/dashboard`. El Wireframe las omite **todas** y su SC-06 elimina `/dashboard` explícitamente. Aun así el Wireframe registra *"Consistencia con Website Brief: PASS"*, y ningún documento está marcado `SUPERSEDED`. | Brief `:98,106,114,123,130`; Wireframe `:129-161, 1470-1471, 1497` |
| H3 | **Copy hero absoluto.** *"Tu venta nunca se frena"* y *"el sistema de punto de venta que nunca se frena"* contradicen la delimitación del propio Brief (el enrolamiento y los cambios de catálogo requieren internet) y el Product Page Content prohíbe explícitamente ese tipo de frase (*"Nunca se detiene"*). | Brief `:30,92` vs Brief `:33`; Product Page `:455` |
| H4 | **Métricas sin respaldo.** *"ticket impreso en 2 segundos"* y *"Control milimétrico"* no tienen evidencia en el allowlist D4. | Brief `:77` |
| H5 | **Contradicción de hardware entre dos documentos aprobados.** El Brief afirma *"Equipamiento probado y certificado en campo"* de forma genérica; el Product Page Content fija el perfil verificado en **MIRAY Q80 / iPOS**. El Media Inventory, además, **omite el soporte de 80 mm** que el código sí implementa. | Brief `:124`; Product Page `:1336`; código: `apps/pos_app/lib/domain/services/printer/receipt_layout_formatter.dart:57,81-82` |
| H6 | **Marcas legadas en copy público aprobado.** *"FlexiPoint registra el pago"* en el copy propuesto del Product Page; *"OmniCore Platform"* en el header de procedencia del OD-02. Ambas prohibidas por la arquitectura de marca. | Product Page `:318`; OD-02 `:52`; norma en Brand Principles [Qué NO hacer](../nhilos_brand_experience_principles_v1.0.md#13-qué-no-hacer) |
| H7 | **Capacidades disfrazadas de "Producto:".** El Brief titula secciones de primer nivel *"Producto: Inventario, Recetas y BOH"* y *"Producto: Cumplimiento Fiscal DGI"*, violando [Modelo de arquitectura recomendado](../nhilos_brand_experience_principles_v1.0.md#12-modelo-de-arquitectura-recomendado) ("permanecen como capacidades") y la regla N-03 del Wireframe. | Brief `:98,106,114`; Wireframe `:285-291` |
| H8 | **Los gates del NFA quedaron huérfanos en la IA.** El Wireframe no declara WCAG, LCP/INP/CLS, peso de página, tamaño de target táctil ni contraste. Su [Acceptance Criteria --- IA + Content Wireframe](nhilos_website_information_architecture_content_wireframe_v1.0.md#18-acceptance-criteria-----ia--content-wireframe) cierra "21/21 checks" **sin un solo criterio de accesibilidad o performance**, pese a que el NFA los define con números. | NFA `:17-22, 24-40, 44-50, 65`; Wireframe `:1325-1357` |
| H9 | **Números sin respaldo en el Media Inventory.** Los topes *"máx 180 KB por captura"* y *"350 KB por foto de hardware"* **no aparecen en ningún documento del repo** — no pueden atribuirse al NFA. | grep sobre `docs/nhilos` = 0 coincidencias |
| H10 | **Contrato de versiones roto.** El Media Inventory declara upstream `nhilos_pos_product_page_content_v1.2`; el archivo presente es **v1.1**. | Media Inventory header; `NHILOS POS - Product Page Content 1.1.md:1` |
| H11 | **El NFA cita una autoridad inexistente.** Cita *"Brief v1.0 - Section 47.1"*; el Brief tiene 7 secciones y termina en `:159`. El spec de release-gate del sitio web no tiene upstream verificable. | NFA `:5`; Brief estructura `:14,26,59,73,89,140,159` |
| H12 | **Promesa de Owner Dashboard sin producto.** El Brief promete *"conciliaciones bancarias"*. No existe ninguna feature de conciliación bancaria; solo un ítem de vouchers pendientes que enlaza a reconciliación. | Brief `:130-138`; `apps/owner_dashboard/src/features/` (surfaces reales: `audit, auth, cash, catalog, customers, dashboard, fiscal, inventory, kardex, loyalty, menu-qr, modifiers, onboarding, promotions, recipes, sales, settings, users`) |

---

## 4. Hallazgos MEDIUM

| # | Hallazgo | Evidencia |
|---|---|---|
| M1 | **Deriva de evidencia del OD-02.** Dos rutas listadas ya no existen: `apps/admin_backend/src/modules/inventory/inventory-sync.service.ts` (hoy `modules/sales/services/inbound-sync.service.ts` + `controllers/sync-batch.controller.ts`) y la migración `1809200000000-AddInvoiceTipColumns.ts` (hoy `1809470000000-AddTipsToInvoices.ts`). El comportamiento se mantiene; la procedencia del documento es la que quedó vieja. | OD-02 `:58` y `:88` |
| M2 | **Límite obsoleto del OD-02.** El claim PC-OFF-02 declara Floor **v57**; el schema real es **v65**. | OD-02 `:58`; `app_database.dart:115-116` |
| M3 | **Modelo de roles desalineado.** El Product Page describe 3 personas (cobra / supervisa / dirige); el código define **4 roles** (`OWNER`, `MANAGER`, `CASHIER`, `WAITER`). El propio Product Page lo reconcilia internamente (OD-PP-05), pero el Media Inventory habla de "matriz RBAC" sin declarar el modelo real. | `apps/pos_app/lib/domain/models/user.dart:7-14`; `apps/admin_backend/src/modules/identity/security/user-role.enum.ts:8-13` |
| M4 | **Atribución incorrecta del PIN de supervisor.** El Media Inventory afirma que las anulaciones de platillos requieren PIN de supervisor. La anulación de factura es una **guarda de política** (factura propia + turno abierto + misma fecha), no un prompt de PIN. El PIN aplica a cierre de caja, apertura de gaveta, descuento manual y varianza de producción. | `sale_view_model.dart:2450-2461`; `domain/usecases/sales/void_decision.dart:45-52`; `sale_view.dart:744,2112` |
| M5 | **Drift de identidad/versión.** OD-02: filename `v0.1` vs declarado `1.1`. Module audit template: filename `_v1.0` vs interno `0.1`. NFA: id interno ≠ filename. IA: id sin versión vs atribuciones `_v0.2`. | OD-02 `:3-4`; template `:6-8`; NFA `:3`; Wireframe `:4` |
| M6 | **Duplicado byte-idéntico.** `NHILOS - Brand Experiencie Principles` es idéntico a `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` (ya trackeado y APPROVED). Dos dueños del mismo documento. | `diff -q` sin diferencias |
| M7 | **Falta el standard POS en `Recursos/`.** Está el standard de backoffice pero **no** el `nhilos_pos_experience_standard_v1.0.md`, que es el marco normativo de la superficie principal del producto. | `ls Recursos/` |
| M8 | **CTA inconsistente.** Brief: *"Agendá una Demostración Operativa"*. Wireframe (aprobado): *"Solicitar una demo"*. | Brief `:94`; Wireframe `:1125` |
| M9 | **Navegación inconsistente interna.** Desktop: Producto / Implementación / Recursos / Nosotros. Mobile: Implementación queda anidada dentro de Producto. | Wireframe `:186-196` vs `:1199-1219` |
| M10 | **Tono de miedo y lenguaje de estatus.** *"El dueño vive esclavizado en el local"*; *"Arqueo y Finanzas Bimoneda Blindadas"*; *"Control milimétrico"*. Contradicen [Ventas](../nhilos_brand_experience_principles_v1.0.md#43-ventas) (no miedo), [Personalidad](../nhilos_brand_experience_principles_v1.0.md#6-personalidad) (Sereno) y [Sobriedad](../nhilos_brand_experience_principles_v1.0.md#53-sobriedad) (sobriedad). | Brief `:53,47,77` |
| M11 | **Drift de nombres de sección.** El Media Inventory mapea S01 "Hero", S04 "Offline-first", S05 "Control ejecutivo", S06 "Roles y seguridad", S12 "formulario demo"; el Product Page las titula "Product Promise", "Continuity", "Control / Visibility", "Roles", "Demo CTA". La numeración **sí** alinea (12 secciones en ambos). | Media Inventory [Mapeo Exhaustivo por Sección de la Página de Producto (v1.1)](nhilos_pos_media_inventory_v1.0.md#3-mapeo-exhaustivo-por-sección-de-la-página-de-producto-v11); Product Page `:101-1098` |
| M12 | **IDs huérfanos en ambas direcciones.** 10 IDs del OD-02 se definen y nunca se citan; los 34 no tienen documento consumidor en el folder. Los 49 IDs del Product Page no tienen definición en el OD-02. | OD-02 `:75-108, 128-157` |
| M13 | **Trazabilidad de la cadena de marca a medio construir.** El Brand Principles manda derivar `nhilos_brand_identity_system.md`, `nhilos_verbal_identity_guide.md` y specs de expresión; ninguno existe. El propio documento marca el identity system como *"futuro"*. | Brand Principles `:1444-1453, 1551` |

---

## 5. Hallazgos LOW

| # | Hallazgo |
|---|---|
| L1 | 18 archivos basura `*:Zone.Identifier` acompañan cada documento (artefacto de transferencia Windows). |
| L2 | El Media Inventory está en `.docx` y declara ser un `.md` (`nhilos_pos_media_inventory_v1.0.md`). No es indexable ni diffeable. |
| L3 | El principio `NHILOS +1` es invocado solo por el Wireframe; los otros tres documentos nunca lo nombran. |

---

## 6. Re-verificación de la matriz OD-02 (34 claims) contra `origin/main`

**Resultado: 31 `SIN CAMBIO` · 3 `DERIVA` · 0 `YA NO SOSTENIBLE` · 0 `NUEVO CLAIMABLE` dentro de la matriz.** (31 + 3 = 34; la cifra anterior decía 30 y no cuadraba con el total auditado.)

La matriz resistió bien los 575 commits. Las tres derivas:

| Claim | Deriva | Estado real |
|---|---|---|
| `PC-OFF-03` sync bidireccional por deltas | El servicio backend citado ya no existe en esa ruta | `modules/sales/services/inbound-sync.service.ts` + `controllers/sync-batch.controller.ts`; comportamiento **ampliado** con transporte por dispositivo y `identity/guards/sync-transport.guard.ts` |
| `PC-PAY-06` propina 10% sin base IVA | Migración renombrada | `src/migrations/1809470000000-AddTipsToInvoices.ts:8`; comportamiento intacto (4 columnas), ampliado con `tips-summary.tsx` en dashboard |
| `PC-DASH-02` badge de frescura de sync | Hook movido de ubicación | `src/features/dashboard/use-sync-freshness.ts`; comportamiento intacto y ampliado con badge `PARTIAL` para huecos históricos |

**Reforzamientos detectados** (el claim sigue siendo verdadero y hoy es más fuerte):
`PC-FISC-01` (constraint de unicidad de número de factura por tenant), `PC-FISC-02`
(notas de crédito con impresión fiscal), `PC-PAY-04` (resolución de tipo de cambio BCN +
comercial), `PC-SEC-01` (ratchet sistémico de RLS), `PC-SEC-03` (severidad de auditoría
persistida), `PC-HW-01` (layouts 80 mm).

**Riesgo abierto:** los claims `PC-DASH-01` y `PC-DASH-03` fueron corregidos repetidas veces
(ticket promedio ahora acotado al ticket; denominador del share de top-products etiquetado;
números no probados retirados). El copy **no debe sobredeclarar precisión** en KPIs.

---

## 7. Loyalty: estado verificado y propuesta de pilar

Loyalty **está implementado** y es publicable como pilar, con límites explícitos.

### 7.1 Claims públicos propuestos (verificados en código)

| ID | Claim | `works_when` | `does_not_work_when` | Evidencia |
|---|---|---|---|---|
| `LY-01` | "Tus clientes acumulan puntos automáticamente en cada venta, incluso sin internet." | Cliente seleccionado y venta guardada local; tasa 1 pt por C$10 | Sin cliente seleccionado; si la escritura local falla la venta igual completa (la deriva solo queda en logs); la tasa es plana, no respeta reglas de programa | `sale_view_model.dart:1800-1822`; `loyalty_service.dart:33-37` |
| `LY-02` | "Los puntos se canjean como descuento en caja, con salvaguardas." | Saldo ≥ 10 pts, canje ≥ 10 pts, descuento ≤ total; siempre dirigido por el operador | Bajo el mínimo o saldo insuficiente; el canje desde catálogo de recompensas **no** aplica el beneficio al total del carrito | `loyalty_service.dart:47-77`; `sale_view_model.dart:541-566,1034` |
| `LY-03` | "Los puntos se sincronizan a la nube de forma idempotente; los duplicados no cuentan doble." | Ambos lados eventualmente online; mismo payload reenviado; replay del batch | Divergencia de identidad por redondeo ≤0.5 pt por transacción; casos borde de eco de saldo (mitigados, no resueltos); no existe test de round-trip | `sync_service.dart:1217-1252`; `loyalty-sync.controller.ts:43`; `loyalty-ledger.service.ts:117-166`; `test/loyalty/customer-loyalty-rls.db.e2e-spec.ts:280-304` |
| `LY-04` | "Identificás al cliente en el mostrador por QR, código, teléfono o búsqueda por nombre, todo offline." | Existe el dato localmente; payload QR `NHL1:{code}` escaneado o tipeado | Cliente desconocido; permiso de cámara denegado | `customer_identification_service.dart:14-35`; `main.dart:679` |
| `LY-05` | "Las promociones (2x1, %, monto fijo, combos) se aplican solas y de forma determinista en caja, y se administran centralmente." | Promoción activa localmente; el push de la nube ya llegó | Filas malformadas de la nube se descartan; **no** están ligadas a las reglas de acumulación de puntos | `promotions_engine.dart:41-151`; `sale_view_model.dart:1117-1124`; `sync_service.dart:4407-4457` |
| `LY-06` | "El dueño configura programas y recompensas, ajusta puntos con actor y motivo, y ve la economía de cada recompensa." | Rol OWNER/MANAGER | No existen KPIs de loyalty, ni campañas, ni portal para el consumidor | `loyalty.controller.ts:84-238,391`; `loyalty-page.tsx:563-580`; `reward-profit-aware-dialog.tsx`; `rbac.ts:60` |

### 7.2 PROHIBIDO prometer (diseñado, no cableado)

Acumulación por reglas de programa (sellos/visitas) en el POS · acumulación automática en la
nube desde tickets · canje de beneficios de recompensa (descuento/producto gratis) en el POS ·
ciclo de intención/anulación de canje manejado desde el POS · expiración de puntos · niveles
Bronce/Plata/Oro · campañas · dashboards de KPI de loyalty · portal del consumidor · paridad
exacta de saldo POS↔nube en tiempo real.

### 7.3 Otros claims nuevos con evidencia (más allá de loyalty)

Promociones administradas desde el backoffice · modificadores/grupos de opciones en tickets ·
sync outbound de customers (delta) · notas de crédito con impresión fiscal · turnos enviados a
la nube + vista de sesiones de caja en web · reconciliación de vouchers sincronizada ·
actualización OTA de terminales · menú digital QR · COGS/rentabilidad con cobertura honesta ·
importación de menú por Excel · impresión térmica 80 mm multi-modelo · compras y proveedores
desde web.

---

## 8. Plan de remediación propuesto

Orden pensado para no reescribir dos veces: primero se repara el **contrato de autoridad**,
después el contenido.

| Paso | Acción | Documentos | Bloquea |
|---|---|---|---|
| R1 | **Romper la circularidad**: declarar la dirección real de autoridad (Brand Principles → OD-02 → Brief → IA → Product Page → Media) y marcar explícitamente qué versión supersede a cuál. | Brief, OD-02, IA | B1, H2 |
| R2 | **Reconciliar el contrato de Claim IDs**: mapear los 49 IDs del Product Page a los 34 del OD-02 (o unificar en un esquema único) y hacer que cada claim publicado cite su ID de origen. | Product Page, OD-02 | B2, M12 |
| R3 | **Refrescar la evidencia congelada**: re-anclar el OD-02 en `b4b5ad27`, corregir las 2 rutas muertas, el límite v57→v65 y las 3 derivas. | OD-02 | B4, M1, M2 |
| R4 | **Purgar fabricaciones**: eliminar el badge inexistente, los topes 180/350 KB y la métrica de "2 segundos"; corregir el PIN de supervisor y el modelo de roles. | Media Inventory, Brief | B3, H4, H9, M3, M4 |
| R5 | **Suavizar absolutos**: "nunca se frena" → capacidad delimitada; quitar miedo y lenguaje de estatus; alinear el CTA. | Brief, Product Page | H3, M8, M10 |
| R6 | **Resolver hardware**: un único perfil verificado (Q80/iPOS + Sunmi V2s, 58/80 mm) y borrar "certificado en campo" genérico. | Brief, Product Page, Media Inventory | H5 |
| R7 | **Limpiar marcas legadas**: FlexiPoint, OmniCore Platform. | Product Page, OD-02 | H6 |
| R8 | **Bajar los gates del NFA al Wireframe**: WCAG 2.1 AA, LCP/INP/CLS, peso, targets, contraste, 404, consentimiento, errores de formulario. | IA Wireframe | H8 |
| R9 | **Eliminar rutas de capacidad top-level** y alinear el sitemap con N-03; actualizar el Brief [Control Ejecutivo Remoto para el Dueño (Dashboard V2)](nhilos_website_product_marketing_brief_v1.0.md#5-control-ejecutivo-remoto-para-el-dueño-dashboard-v2) o marcarlo superseded. | Brief, IA Wireframe | H7, H2 |
| R10 | **Incorporar Loyalty como pilar** con los claims `LY-01..LY-06` y la lista de no-promesa. | Brief, Product Page, IA | ausencia de loyalty |
| R11 | **Reparar el contrato de versiones y nombres** de todos los documentos; resolver `v1.2` fantasma y "Brief §47.1". | todos | H10, H11, M5 |
| R12 | **Limpieza estructural**: eliminar `Zone.Identifier`, deduplicar Brand Principles, convertir el `.docx` a `.md`, agregar el standard POS a `Recursos/`. | folder | L1, L2, M6, M7 |

---

## 9. Gate

**Fase A cerrada. No se modificó ningún documento auditado.**

Decisión requerida para abrir la Fase B:
1. ¿Se aprueba el plan R1–R12 como está, o se ajusta el orden/alcance?
2. ¿Se mantiene la decisión D1 (auditoría + reescritura) y D3 (limpieza incluida)?

Riesgo declarado de la Fase B: R2 y R9 son **reescrituras estructurales**, no cosméticas.
R9 toca la arquitectura del sitio web (rutas y navegación) y R2 toca el contrato de claims de
todo el set. Son las dos que más revisión humana exigen; conviene tratarlas como unidades de
trabajo separadas y revisables, no en un solo pase.
