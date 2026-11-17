# NHILOS — Inventario de Contenido Web y Reuso

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_content_inventory_and_reuse_v1.0.md` |
| Versión | 1.1 |
| Estado | WORKING DRAFT — auditoría de la web desplegada y filtro de claims |
| Owner | Founder / Marketing |
| Base | Web desplegada `https://nhilospos.com` y fuente `design/nhilos-web-foundation/04-sintesis-hibrida.html` |
| Autoridad de claims | [`product_claim_audit_od02_v1.3.md`](../claims/product_claim_audit_od02_v1.3.md) |
| Documentos relacionados | [`nhilos_web_seo_architecture_v1.0.md`](./nhilos_web_seo_architecture_v1.0.md), [`nhilos_web_keyword_ideas_analysis_v1.0.md`](./nhilos_web_keyword_ideas_analysis_v1.0.md), [`nhilos_web_buyer_avatar_v1.0.md`](./nhilos_web_buyer_avatar_v1.0.md) |
| Fecha de verificación | 2026-11-16 |
| Objetivo | Inventariar las secciones reales de la web actual, marcar claims riesgosos y definir qué se reutiliza en la nueva arquitectura |

---

## 1. Regla de realidad

La web no puede mostrar algo que no existe, ni prometer un resultado que el producto no puede garantizar.

Orden de autoridad:

1. Comportamiento real del producto.
2. `product_claim_audit_od02_v1.3.md` (allowlist D4 y blocklist D5).
3. Contratos de contenido aprobados.
4. Copy creativo.

Si una sección se ve bien pero no cumple el punto 1, se corrige o se elimina. No se maquilla con diseño.

---

## 2. Filtro de claims NHILOS

### 2.1 DGI / fiscal

**Lo que sí se puede decir**

- Facturación conforme a la **DT 09-2007 para Sistemas Computarizados de Facturación**.
- Numeración correlativa, inmutabilidad y anulación supervisada mediante Nota de Crédito.
- Requiere prefijo y folio inicial autorizados por la DGI, configurados antes de operar.
- Validación sintáctica de Cédula y RUC; no consulta el padrón en vivo.

**Lo que NO se puede decir**

- “DGI 100%”, “cumplimiento total”, “cero multas”, “garantía fiscal”.
- “Facturación electrónica en línea”, “XML firmado”, “CUFE”, “envío automático a la DGI”.
- “Validación en tiempo real contra la DGI”.
- “Válido para contabilidad formal” como garantía legal absoluta.

**Fórmula recomendada**

> Facturación conforme a la DT 09-2007 para Sistemas Computarizados, con folio autorizado y anulación auditada. No es factura electrónica en línea.

### 2.2 Offline / continuidad

**Lo que sí se puede decir**

- La venta, el cobro, el ticket y la deducción de receta siguen operando en un terminal **enrolado y con catálogo hidratado**.
- SQLite local es la fuente de verdad en caja.
- Al volver la conexión, los pendientes se sincronizan en segundo plano.
- El cajero puede cambiar por PIN tras un login online previo.

**Lo que NO se puede decir**

- “Nunca pierdes una venta”, “nunca dejas de vender”, “cero pérdida de datos”.
- “Funciona sin internet en cualquier situación”.
- “Sincronización multi-terminal sin internet” (LAN/mDNS no está implementado).
- “Sincronización garantizada” o “100% sincronizado”.

**Fórmula recomendada**

> Cobra y factura en tu terminal aunque se caiga el internet. El enrolamiento inicial y los cambios de catálogo requieren conexión.

### 2.3 Sincronización / nube

**Lo que sí se puede decir**

- Sincronización asíncrona por deltas.
- La nube es eventualmente consistente.
- Hay un outbox local y un indicador de pendientes.
- El dashboard muestra frescura de sincronización.

**Lo que NO se puede decir**

- “Todo queda sincronizado” como estado absoluto.
- “100% sincronizado”, “sync instantáneo”, “tiempo real” sin contrato de frescura.
- “Sin duplicados” como garantía absoluta; se puede explicar la idempotencia, no venderla como infalibilidad.

### 2.4 Pagos / bimoneda

**Lo que sí se puede decir**

- Cobro bimoneda NIO/USD y vuelto calculado.
- Tasa oficial BCN y tasa comercial **configuradas**.
- Conciliación de vouchers BAC/Banpro en flujo manual desacoplado.
- El cajero digita últimos 4 dígitos y autorización.

**Lo que NO se puede decir**

- Integración directa por API, cable o Bluetooth con datáfonos.
- “El banco coincide siempre” o “conciliación garantizada”.
- “Tasa BCN en vivo” si no hay integración en vivo.

### 2.5 Inventario / costos

**Lo que sí se puede decir**

- BOM descuenta insumos en productos `COMPOUND` con receta publicada.
- Kardex inmutable por deltas y CPP al asentar compras.
- Tolerancia a stock negativo con regularización posterior.
- Mermas clasificadas y órdenes de producción.
- Cualquier claim debe alinearse con `docs/inventario_marco_normativo.md` y declarar los `R-01`..`R-07` que toque.

**Lo que NO se puede decir**

- “Inventario exacto” o “cero merma”.
- “Todo producto descuenta insumos” (solo recetas publicadas).
- Valoraciones o métodos no autorizados.

### 2.6 Hardware / soporte

**Lo que sí se puede decir**

- Sunmi V2s con impresora integrada de 58 mm.
- Impresoras ESC/POS externas por LAN/IP con IP fija.
- KDS en la aplicación.
- Canales y horarios de soporte **si son reales**.

**Lo que NO se puede decir**

- Balanzas, lectores seriales de peso o integraciones no implementadas.
- “Garantía de reemplazo inmediato” si no existe contrato/SLA.
- “Soporte 24/7” o “atención inmediata” sin evidencia.

### 2.7 Prueba y media

- Capturas y videos deben ser del build vigente.
- Si los datos son de demostración, se etiquetan como **“Datos de demostración”**.
- No usar métricas inventadas, testimonios inventados, logos sin permiso ni personas generadas por IA como clientes.
- Un stand-in debe estar etiquetado y entrar a la lista de material pendiente.

---

## 3. Inventario de la web actual

Verificado en producción el 2026-11-16. La home actual es una sola página larga; estas secciones son materia prima para la nueva arquitectura.

| # | Sección actual | H2 actual | Qué prueba | Riesgo | Reuso |
|---|---|---|---|---|---|
| 1 | Hero | “Nunca dejas de vender. El POS que sigue cuando falla el internet.” | Producto real, video de dashboard/POS, promesa de continuidad | **BLOCKER:** “Nunca dejas de vender” es continuidad absoluta y contradice OD-02 | Home y `/software-pos/`, con H1 reescrito |
| 2 | Cuatro certezas | “Vende, cobra e imprime incluso sin conexión.” | Continuidad, visibilidad, costos, caja | **REQUIRED:** “Nunca dejas de vender” repetido; “tiempo real” sin frescura | Home, `/software-pos/`, `/software-pos/sin-internet/` |
| 3 | Hilo operativo | “Una venta conectada de inicio a fin. Sin pasos perdidos.” | Flujo venta → comanda → Kardex → backoffice | Bajo; útil y demostrativo | `/software-pos/`, `/software-pos/restaurantes/`, `/software-pos/food-parks/` |
| 4 | Roles | “Diseñado para las tres miradas que sostienen el negocio.” | Cajero, supervisor, dueño; capturas reales | Bajo; “resultado auditado” necesita fuente | `/software-pos/`, `/software-pos/multisucursal/` |
| 5 | Simulador offline | “Internet falla. Tu negocio no debería hacerlo.” | Outbox local, correlativo, reconexión | **REQUIRED:** “Sync al 100%”, “NUBE 100% SINCRONIZADA”, “todo” | `/software-pos/sin-internet/` |
| 6 | Backoffice sync | “Cuando vuelves a estar conectado, todo queda sincronizado.” | Pipeline local → nube, sin duplicados | **REQUIRED:** “todo” y “sin duplicados” absolutos | `/software-pos/sin-internet/`, `/software-pos/` |
| 7 | Módulos backoffice | “No es solo un dashboard. Es el centro de control completo de tu negocio.” | Ventas, fiscal, BOM/Kardex, catálogo, flota | **REQUIRED:** “libro de ventas oficial”, “tiempo real”, “instantáneo” | `/facturacion-dgi/`, `/inventario/`, `/software-pos/multisucursal/` |
| 8 | Onboarding | “Empieza en minutos, no en semanas.” | Plantillas, CSV, validación, DGI/BCN, terminal | **REQUIRED:** “menos de 15 minutos” sin evidencia | `/implementacion/`, `/precios/`, `/demo/` |
| 9 | Seguridad | “Tu operación. Tus datos. Bajo control.” | RLS, RBAC, audit trail, inmutabilidad | Bajo; separar “DGI” de “seguridad” | Home, `/software-pos/`, `/facturacion-dgi/` |
| 10 | Soporte / garantías | “Garantías técnicas reales. Compromiso operativo medible.” | Offline, multi-tenant, respaldo, integridad | **REQUIRED:** “garantías” y “medible” necesitan SLA/evidencia | `/soporte/` o home |
| 11 | FAQ | “Claridad operativa antes de comenzar.” | Dudas de offline, DGI, inventario, pagos, multi-caja | **REQUIRED:** “Sí, válido para contabilidad formal” y varias respuestas absolutas | `/software-pos/sin-internet/`, `/facturacion-dgi/`, `/inventario/` |
| 12 | Demo | “Ve cómo funcionaría en tu propio mostrador.” | Formulario contextual, WhatsApp, horario | Bajo; conservar si los canales son reales | `/demo/`, `/precios/`, `/software-pos/food-parks/` |

---

## 4. Hallazgos que bloquean publicación

| Severidad | Hallazgo | Por qué | Corrección mínima |
|---|---|---|---|
| BLOCKER | H1 “Nunca dejas de vender” | Promete continuidad absoluta; OD-02 prohíbe “nunca pierdas una venta” | “Cobra y factura aunque se caiga el internet” + límite en subcopy |
| BLOCKER | “Cumplimiento fiscal DGI DT 09-2007” como sello | Se lee como cumplimiento total/aval | “Facturación conforme a DT 09-2007 para Sistemas Computarizados, con folio autorizado” |
| BLOCKER | “Evidencia Real” con “446 comprobantes” y “72 faltantes y 0 duplicados” | Si son datos de demo, es prueba inventada | Etiquetar “Datos de demostración” o usar datos reales con provenance |
| BLOCKER | “Es válido para contabilidad formal en Nicaragua. Sí.” | Garantía legal que el producto no puede emitir | “Diseñado para cumplir DT 09-2007; la validez formal depende de tu autorización, configuración y contador” |
| REQUIRED | “Sync al 100%” / “NUBE 100% SINCRONIZADA” | La nube es eventualmente consistente | “Sincronización automática al recuperar conexión” |
| REQUIRED | “Todo queda sincronizado” | Estado absoluto | “Se sincroniza cuando vuelve la conexión” |
| REQUIRED | “Tiempo real” repetido | No hay garantía de frescura instantánea | “Al día” o “en vivo” solo con el badge de frescura |
| REQUIRED | “Libro de ventas oficial” | Puede no ser un artefacto oficial | “Reporte de ventas exportable” |
| REQUIRED | “Tasa oficial BCN” sin contexto | Puede implicar integración en vivo | “Tasa configurada: oficial BCN y comercial” |
| REQUIRED | “Sincronización instantánea con terminales” | No es instantánea ni multi-terminal sin nube | “Sincronización automática” |
| REQUIRED | “Restaurar terminales íntegramente en minutos” | Requiere evidencia de backup/restore | Eliminar o documentar con prueba |
| REQUIRED | “Menos de 15 minutos” | Depende del catálogo y la configuración | “Onboarding guiado; el tiempo depende de tu catálogo” |
| REFINEMENT | “Cero promesas vacías” | Absoluto innecesario | “Cada capacidad se apoya en comportamiento verificable” |
| REFINEMENT | “Riesgos de sanción DGI” | Apela al miedo y sugiere garantía | “Sin trazabilidad fiscal” |

---

## 5. Reuso por página objetivo

| Página objetivo | Secciones actuales que se reutilizan | Cambios obligatorios |
|---|---|---|
| `/` | Hero, cuatro certezas, hilo, roles, seguridad, demo | Reescribir H1 y claims absolutos; etiquetar datos demo |
| `/software-pos/` | Hero, roles, hilo, seguridad | Ajustar continuidad y “tiempo real” |
| `/software-pos/restaurantes/` | Hilo, roles/cajero, KDS, demo | Enfocar en restaurante; no duplicar food park |
| `/software-pos/food-parks/` | Hilo, roles, onboarding, demo | Enfocar en food park/food court; no crear página Managua sin prueba local |
| `/software-pos/sin-internet/` | Simulador offline, backoffice sync, FAQ | Quitar “100%”, “todo”, “instantáneo”; explicar límites |
| `/software-pos/caja/` | Roles/supervisor, seguridad, FAQ de caja | Crear sección específica de arqueo/cierre |
| `/software-pos/bares/` | Hilo, roles, KDS | Adaptar ejemplos a barra y cuentas abiertas |
| `/software-pos/facturacion-dgi/` | Módulo fiscal, seguridad, FAQ DGI | Separar “POS + DGI” de “solo facturación” |
| `/software-pos/multisucursal/` | Módulo de flota, rol supervisor | Explicar que la consolidación es vía nube, no LAN |
| `/software-pos/hardware/` | Onboarding/hardware, FAQ hardware | No prometer hardware no soportado |
| `/facturacion-dgi/` | Módulo fiscal, seguridad, FAQ DGI | Añadir bloque “qué sí y qué no es DT 09-2007” |
| `/facturacion-dgi/restaurantes/` | Módulo fiscal, anulación, FAQ | Explicar Nota de Crédito y folio autorizado |
| `/facturacion-dgi/cafeterias/` | Módulo fiscal, onboarding | Adaptar ejemplos a cafetería |
| `/inventario/` | Módulo BOM/Kardex, seguridad | Alinear con `R-01`..`R-07` |
| `/inventario/restaurantes/` | BOM/Kardex, merma, FAQ | Explicar receta publicada y límites |
| `/inventario/food-parks/` | BOM/Kardex, roles | Adaptar a múltiples puestos |
| `/precios/` | Onboarding, demo | No publicar precio si no está aprobado; usar cotización |
| `/demo/` | Formulario, soporte | Mantener canales reales y tiempos de respuesta |
| `/implementacion/` | Onboarding | Reemplazar “15 min” por alcance y pasos |
| `/comparativas/` | Hilo, módulos | Comparación honesta; no difamar competidores |
| `/casos/` | Ninguna | No crear hasta tener casos reales con permiso |
| `/soporte/` | Soporte/garantías | Publicar solo canales, horarios y SLA reales |

---

## 6. Secciones que faltan y conviene añadir

| Página | Sección faltante | Por qué |
|---|---|---|
| `/facturacion-dgi/` | “Qué sí y qué no es la DT 09-2007” | Evita vender DGI 100% y responde la objeción real |
| `/software-pos/sin-internet/` | “Qué funciona offline y qué requiere internet” | Convierte la promesa en condición clara |
| `/precios/` | Alcance de cotización | Evita precios inventados y expectativas falsas |
| `/implementacion/` | Responsabilidades y tiempos | Evita prometer “15 minutos” |
| `/soporte/` | Canales, horarios y SLA | Evita “garantías” sin sustento |
| `/comparativas/` | Comparación POS vs Excel / local vs nube | Captura intención de consideración sin humo |
| `/recursos/` | Guías DGI/VET y merma revisadas por contador | Captura intención informativa con autoridad |
| `/casos/` | Caso real con permiso y número verificable | Solo cuando exista; no inventar |

---

## 7. Inventario de media reutilizable

| Activo | Uso actual | Reuso | Condición |
|---|---|---|---|
| `pos_hero_live_loop.mp4` | Hero | Home, `/software-pos/` | Verificar build vigente |
| `dsh_hero_live_loop.mp4` | Hero | Home, `/software-pos/` | Verificar build vigente |
| `pos_offline_narrative_loop.mp4` | Simulador offline | `/software-pos/sin-internet/` | Etiquetar demo si aplica |
| `pos_caja_step1_loop.mp4` | Hilo operativo | `/software-pos/restaurantes/` | Verificar build vigente |
| `dsh_02_kpis_ventas.webp` | Dashboard | Home, `/software-pos/`, `/facturacion-dgi/` | Etiquetar datos demo si aplica |
| `dsh_03_historial_comprobantes.webp` | Fiscal | `/facturacion-dgi/` | Verificar que no exponga datos reales |
| `dsh_15_inventario.webp`, `dsh_20_kardex_delta_ledger.webp` | Inventario | `/inventario/` | Verificar build vigente |
| `dsh_18_terminales_flota.webp` | Flota | `/software-pos/multisucursal/` | Verificar build vigente |
| `pos_16_cierre_turno_corte_z.webp` | Caja | `/software-pos/caja/` | Verificar build vigente |

Regla: si una captura tiene cifras, nombres o actividad inventada, se etiqueta como demostración o se reemplaza. No se publica como “evidencia real”.

---

## 8. Próximo paso

Las keyword ideas ya llegaron y la arquitectura v1.2 ya las integró. Para ejecutar:

1. Usar el [análisis de keyword ideas](./nhilos_web_keyword_ideas_analysis_v1.0.md) para el triage.
2. Revisar cada grupo de la arquitectura contra este filtro de claims.
3. Reutilizar las secciones de la tabla 5; no reescribir lo que ya funciona.
4. Crear páginas nuevas solo si hay intención, contenido diferencial y evidencia.
5. Escribir briefs para las 10 páginas P0 antes de tocar el HTML.

---

## 9. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Inventario de secciones desplegadas, filtro de claims y mapa de reuso | Equipo NHILOS |
| 1.1 | 2026-11-16 | Enlazado el análisis de keyword ideas y actualizado el próximo paso a arquitectura v1.2 | Equipo NHILOS |
