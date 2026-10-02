# NHILOS POS — Auditoría de Experiencia de Terminal (v1.0)

**Document ID:** NH-AUD-POS-001
**Versión:** 1.0 (retroalineada al estándar expandido §0–§62)
**Fecha:** 2026-10-02
**Auditor:** el Gentleman (Senior Architect)
**Módulo / Aplicación:** NHILOS POS (Suite Móvil Flutter en Android 12)
**Hardware de Prueba:** MIRAY Q80 / iPOS (pantalla táctil 800x1280 vertical, impresora térmica 80 mm, gaveta de efectivo, escáner)
**Marco Autoritativo de Referencia:**
- `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` (Parte B: NHILOS POS Expression)
- `docs/nhilos/nhilos_pos_experience_standard_v1.0.md` (§0–§62)
**Plantilla Utilizada:** `docs/nhilos/nhilos_pos_module_audit_template_v1.0.md`
**Modelo de severidad aplicado (Estándar §5.1):** `BLOCKER` / `REQUIRED` / `REFINEMENT` / `+1 OPPORTUNITY`
**Evidencia Revisada:** 17 capturas directas de hardware vía ADB (`docs/nhilos/manuals/images/pos_01_*.png` a `pos_16_*.png`) con el menú real de 58 ítems y transacciones de SOHO Café.

> **Nota de versión:** esta auditoría fue ejecutada contra la v1.0 original del estándar (§1–§7) y ha sido re-expresada contra el estándar expandido §0–§62. Los hallazgos conservan su evidencia original; las dimensiones nuevas del estándar expandido quedan registradas como `NOT_EVIDENCED` y requieren un pase de re-auditoría (§14).

---

## 1. Autoridad y conflictos (§0)

- **Autoridad de producto:** comportamiento real observado de la suite POS (Flujo de venta, facturación, DGI, arqueo).
- **Autoridad de experiencia:** Brand Experience Principles (Parte B) + POS Experience Standard §0–§62.
- **Conflictos detectados:** ninguno. Ninguna observación de esta auditoría contradice un PRD aprobado; todas las correcciones son de expresión visual y riqueza de información, no de semántica de dominio. No se reporta ningún `AUTHORITY_CONFLICT`.
- **Invariantes de dominio verificados y respetados:** secuencia de facturación inmutable, anulación solo con `is_canceled`, SQLite como fuente de verdad (venta local sin red).

---

## 2. Misión del módulo y contexto operativo (§1, §4)

* **Usuario Principal:** Cajero y Barista de SOHO Café operando en barra de despacho.
* **Misión Principal (Core Promise):** Marcar pedidos con velocidad en hora pico, cobrar en efectivo (NIO/USD con vuelto exacto) o tarjeta, emitir ticket térmico de 80 mm e iniciar preparación sin fricción.
* **Usuarios Secundarios:** Encargado de Turno / Administrador autorizando anulaciones y realizando el cierre Z.
* **Riesgo Operativo si Falla (§4.2):** colas lentas en barra, errores de vuelto en dólares, fatiga táctil del barista, incumplimiento DGI, o percepción de "software barato/genérico" frente al cliente final.

---

## 3. Inventario de superficies auditadas (§6 Fase B)

| Superficie | Pantalla / Modal | Evidencia | Estado Funcional |
|---|---|---|:---:|
| **Acceso y PIN** | Selección de Operador y Teclado Numérico | `pos_01_seleccionar_usuario.png`, `pos_02_login_pin.png` | PASS |
| **Catálogo de Ventas** | Grilla de Productos y Barra Inferior | `pos_03_catalogo_soho.png`, `pos_04_carrito_barra.png` | PASS |
| **Detalle de Carrito** | Modal de Revisión y Acciones | `pos_05_detalle_carrito.png` | PASS |
| **Cobro y Facturación** | Modal de Cobro Multimoneda y Vuelto | `pos_06_pantalla_cobro.png`, `pos_07_cobro_efectivo_vuelto.png`, `pos_08_cobro_dolares.png` | PASS |
| **Menú Lateral** | Drawer Principal de Navegación | `pos_09_menu_lateral.png` | PASS |
| **Historial y Voids** | Lista de Facturas y Diálogo de Anulación | `pos_10_historial_ventas.png`, `pos_12_detalle_factura_acciones.png`, `pos_13_dialogo_anular_factura.png` | PASS |
| **Cocina / Barra** | Monitor KDS en Tiempo Real | `pos_11_kds_pantalla_cocina.png` | PASS |
| **Control de Turnos** | Arqueos de Caja, Corte X y Corte Z | `pos_14_control_caja_turnos.png`, `pos_15_lectura_parcial_corte_x.png`, `pos_16_cierre_turno_corte_z.png` | PASS |

---

## 4. Matriz de Cobertura de Experiencia (EX-01 → EX-19) (§51)

Cada celda usa el vocabulario de estado del Estándar §5.2: `PASS | FAIL | PARTIAL | NOT_EVIDENCED | N/A | AUTHORITY_CONFLICT`.

| ID | Dimensión | Pregunta de Control | Veredicto | Hallazgo Asociado |
|---|---|---|:---:|---|
| **EX-01** | Core Promise | ¿El operador completa la venta y la verdad fiscal es exacta? | **PASS** | Transacciones 1 a 7 consecutivas, cálculos exactos en NIO/USD. |
| **EX-02** | Verdad de Producto | ¿UI coincide con PRD/dominio/DGI? | **PASS** | Secuencia ascendente intacta; diálogo formal de motivos DGI. |
| **EX-03** | Precisión | ¿El vuelto es inequívoco en Córdobas y Dólares? | **PASS** | Cálculo dinámico exacto al tipo de cambio comercial (36.62). |
| **EX-04** | Navegación | ¿El contexto viaja entre superficies? | **PARTIAL** | Navegación directa correcta; sin evidencia de preservación de filtros de historial (§9, §13.1). |
| **EX-05** | Encontrabilidad | ¿Búsqueda/filtro/orden apropiados? | **NOT_EVIDENCED** | Re-auditar bajo §13–§15. |
| **EX-06** | Formularios | ¿Entrada/edición y keypads claros, seguros, recuperables? | **PARTIAL** | Teclado numérico algo rígido (PX-002); sin evidencia de guardas anti doble envío (§19.2). |
| **EX-07** | Acciones | ¿Consecuencias, riesgo y feedback claros? | **PASS** | Anulación con motivo formal; corte Z con confirmación ceremonial. |
| **EX-08** | Estados | ¿Carga/vacío/error/parcial/éxito intencionales? | **NOT_EVIDENCED** | Re-auditar bajo §28–§32 (4 clases de vacío, 4 preguntas de error, posición de toasts §32.1). |
| **EX-09** | Permisos | ¿Autorización end-to-end (PIN supervisor, roles)? | **PARTIAL** | Anulación exige motivo; sin evidencia ADB de PIN de supervisor por rol (§33.2). |
| **EX-10** | Tiempo | ¿Cero pasos repetidos en hora pico? | **PASS** | 2 toques para agregar producto, flujo directo a cobro. |
| **EX-11** | Sobriedad | ¿70/20/10 respetado? | **FAIL** | Tecla marrón en keypad, AppBar morada en caja, arcoíris de colores (PX-002). |
| **EX-12** | Consistencia | ¿Patrones de suite compartidos? | **PARTIAL** | KDS y Control de Caja usan paletas desconectadas del catálogo (PX-002). |
| **EX-13** | Microcopy | ¿Lenguaje preciso, calmado, accionable? | **PARTIAL** | Verbos correctos en acciones críticas; re-auditar copy de errores bajo §30/§39. |
| **EX-14** | Accesibilidad | ¿TalkBack, contraste AAA, targets táctiles? | **NOT_EVIDENCED** | Re-auditar bajo §46 (TalkBack, contraste, color no como única señal). |
| **EX-15** | Hardware | ¿Impresión 80 mm, papel, gaveta, escáner, reconexión según §45? | **NOT_EVIDENCED** | Re-auditar bajo §45 (spec de ticket, corte parcial ESC/POS, out-of-paper, gaveta, escáner). |
| **EX-16** | Performance | ¿<50 ms por toque, cold start, impresión no bloqueante? | **NOT_EVIDENCED** | Re-auditar bajo §47 con medición de dispositivo. |
| **EX-17** | Continuidad Offline | ¿Si el Wi-Fi cae, todo sigue y la verdad se preserva? | **PASS** | Venta local en SQLite transparente, cola de sincronización preservada. |
| **EX-18** | +1 | ¿Oportunidad de mejora sostenible? | **PENDING → +1 OPPORTUNITY** | PX-005 (háptica); evaluar además §49 +1.15 completo. |
| **EX-19** | Evidencia | ¿Cada PASS/FAIL es demostrable? | **PASS** | Toda la matriz se apoya en las 17 capturas ADB y transacciones reales. |

**Veredictos dimensionales de la ronda original (retirados del vocabulario antiguo):** los veredictos `POS-01 → POS-12` de la plantilla v1.0 (PASS/PARTIAL/FAIL/PENDING) han sido migrados a la matriz EX-01 → EX-19 y al registro de hallazgos PX-### de esta versión.

---

## 5. Registro Detallado de Hallazgos (plantilla §53)

Severidades asignadas según §5.1 del estándar expandido.

### PX-001 — "El Síndrome de la Hamburguesa": fallback iconográfico inadecuado

* **Severidad:** `REQUIRED`
* **Estado:** OPEN
* **Estándar:** §12.6 (Identidad de producto) / §3.2 (tratamiento del contexto) / AP-POS-01
* **Superficie:** Catálogo principal de productos (`pos_03_catalogo_soho.png`).
* **Autoridad:** Brand §21 (Cuidado: identidad del comercio) + POS Standard §12.6.

**ACTUAL**
Todos los productos de cafetería de SOHO Café (*Espresso*, *Americano*, *Cappuccino*, *Latte*, *Cortadito*) muestran un ícono fallback de hamburguesa con refresco (`🍔🥤`).

**ESPERADO**
Resolver dinámico de fallback de 2 niveles (§12.6): glifo vectorial sobrio por categoría configurada (taza para Café Caliente, vaso alto para Bebidas Frías, croissant para Repostería, cubiertos para Comida) y, si la categoría no tiene glifo, monograma tipográfico sobre fondo pastel de categoría (`ED`, `C12`). Nunca un fallback genérico de comida en código.

**POR QUÉ IMPORTA**
Cuidado: la terminal proyecta la identidad del comercio ante el cliente final. Un fallback genérico comunica "software genérico", el opuesto de "Aquí pensaron en los detalles."

**EVIDENCIA**
`pos_03_catalogo_soho.png` — todos los ítems de café con el mismo ícono de hamburguesa.

**CORRECCIÓN**
Implementar el resolver por categoría + monograma tipográfico; eliminar el fallback único de hamburguesa del código.

**ACEPTACIÓN**
En el catálogo de SOHO Café, ningún producto no-hamburguesa muestra el ícono de hamburguesa; cafés muestran taza, repostería muestra croissant, y los ítems sin glifo muestran monograma.

**DEPENDENCIAS**
Categorías de producto correctamente configuradas en el catálogo local.

### PX-002 — Dispersión cromática y componentes desalineados del sistema de diseño

* **Severidad:** `REQUIRED`
* **Estado:** OPEN
* **Estándar:** §42.1 (Paleta cromática unificada y prohibición expresa) / §18.2 (keypad clean slate) / §48 (Consistencia) / AP-POS-02
* **Superficies:** Teclado de PIN (`pos_02`), Pantalla de Cobro (`pos_06`), Control de Caja (`pos_14`).
* **Autoridad:** POS Standard §42.1 (prohibición expresa de marrones `#795548` y morados `#3949AB`).

**ACTUAL**
1. En el teclado de PIN, la tecla de borrado `⌫` usa el marrón predeterminado de Material Design (`#795548`), y la tecla `C` un rojo intenso no contextual.
2. En Control de Caja, la AppBar tiene fondo morado/índigo (`#3949AB`) inexistente en el sistema de diseño, y las tarjetas de balance usan fondos pastel celestes, verdes y lilas.
3. En la pantalla de cobro conviven azul brillante, verde esmeralda, amarillo chillón en el Buzzer y gris apagado en billetes.

**ESPERADO**
Paleta única §42.1: AppBar de Control de Caja en Slate/Navy (`#1E293B`); keypad clean slate con teclas blancas + borde neutro, borrado en gris (`#F1F5F9` con ícono `#475569`); Buzzer como campo colapsable discreto con ícono de campana neutro (§41); el rojo reservado a peligro real (§23) y el ámbar a advertencias calmadas (§35.4).

**POR QUÉ IMPORTA**
Sobriedad y Consistencia: los colores decorativos fuera del sistema producen falsas señales de peligro (rojo/marrón en teclas) y fragmentan la identidad NHILOS entre módulos.

**EVIDENCIA**
`pos_02_login_pin.png`, `pos_06_pantalla_cobro.png`, `pos_14_control_caja_turnos.png`.

**CORRECCIÓN**
Refactor visual quirúrgico: unificar AppBar de caja, neutralizar teclas del keypad, discretizar el Buzzer, normalizar tarjetas de balance a blanco puro con acentos sobrios.

**ACEPTACIÓN**
En capturas nuevas de `pos_02`, `pos_06` y `pos_14` no existe ningún color fuera de la tabla §42.1; la tecla de borrado es gris neutro.

**DEPENDENCIAS**
Ninguna.

### PX-003 — Falta de riqueza contextual en el Historial de Facturas

* **Severidad:** `REQUIRED`
* **Estado:** OPEN
* **Estándar:** §12.2 (Riqueza contextual de las filas)
* **Superficie:** Historial de Ventas (`pos_10_historial_ventas.png`).
* **Autoridad:** POS Standard §12.2 (la fila debe permitir decidir sin abrir).

**ACTUAL**
Las filas muestran únicamente el número correlativo (`7`, `6`, `5`), fecha/hora y total.

**ESPERADO**
Cada fila muestra: número de factura (`#000007`), hora y cajero (`21:43 · Maxwell O.`), resumen de ítems (`1x Cappuccino 12oz, 1x Americano`), método de pago (`Efectivo`) y total con números tabulares (`C$ 225.00`). Facturas anuladas con matiz rojizo sutil y etiqueta `ANULADA` (§26.1).

**POR QUÉ IMPORTA**
Tiempo y Cuidado: si un cliente solicita reimpresión o consulta minutos después, el barista no debe abrir facturas a ciegas.

**EVIDENCIA**
`pos_10_historial_ventas.png` — filas de números planos.

**CORRECCIÓN**
Enriquecer la tarjeta de cada fila con segunda línea de resumen de ítems y método de pago, más cajero y hora.

**ACEPTACIÓN**
Dada una venta con 2 productos conocidos, su fila en el historial permite identificarla visualmente sin tocarla.

**DEPENDENCIAS**
Persistencia del resumen de ítems en la entidad de venta local (Floor).

### PX-004 — Ausencia de tipografía tabular (`tabular-nums`) en importes

* **Severidad:** `REFINEMENT`
* **Estado:** OPEN
* **Estándar:** §34.1 (Números tabulares obligatorios) / §42.7
* **Superficie:** Modal de Cobro y Facturación (`pos_06`, `pos_07`, `pos_08`).
* **Autoridad:** POS Standard §34.1.

**ACTUAL**
Al tipear cifras o alternar entre botones de billetes (C$ 225 vs C$ 500), los dígitos proporcionales causan ligeros saltos de ancho en el texto del vuelto.

**ESPERADO**
`FontFeature.tabularFigures()` en el `TextStyle` de todos los campos de precio, monto de entrada y vuelto; dígitos de ancho fijo sin desplazamientos.

**POR QUÉ IMPORTA**
Precisión percibida: los montos que "bailan" comunican inestabilidad en el momento más sensible del flujo (el vuelto).

**EVIDENCIA**
`pos_07_cobro_efectivo_vuelto.png` — desplazamiento de dígitos al cambiar montos.

**CORRECCIÓN**
Aplicar `FontFeature.tabularFigures()` al sistema de estilos de montos (una sola fuente de estilos compartida).

**ACEPTACIÓN**
Al alternar billetes rápidos en el modal de cobro, el ancho del texto del vuelto no varía.

**DEPENDENCIAS**
Ninguna.

### PX-005 — Feedback háptico en la confirmación de cobro

* **Severidad:** `+1 OPPORTUNITY`
* **Estado:** OPEN
* **Estándar:** §49 (+1.15, gesto memorable 1)
* **Superficie:** Finalización de venta en el terminal MIRAY Q80.
* **Autoridad:** POS Standard §49 / Brand §11 (NHILOS +1).

**ACTUAL**
La confirmación de cobro no produce retroalimentación física en el terminal.

**ESPERADO**
Pulso de vibración corto y firme (`HapticFeedback.mediumImpact()` o equivalente) al confirmar el cobro e imprimir el comprobante: confirmación física instantánea que transmite solidez y cierre.

**POR QUÉ IMPORTA**
+1: eleva la percepción de precisión sin costo de flujo. No compensa hallazgos; se ejecuta después de cerrar PX-001/PX-002/PX-003.

**EVIDENCIA**
Ausencia observable en los recorridos ADB de cobro.

**CORRECCIÓN**
Integrar el pulso háptico al pipeline de confirmación de cobro, respetando movimiento reducido (§46).

**ACEPTACIÓN**
En dispositivo físico, confirmar un cobro produce el pulso de vibración; el flujo no se ralentiza.

**DEPENDENCIAS**
Ninguna.

---

## 6. Mapa de navegación/contexto (§9, §10)

```text
Catálogo → Carrito (modal) → Cobro (modal) → Éxito → Nueva venta   [contexto de venta preservado]
Historial → Detalle de factura → Reimprimir / Anular               [factura como contexto]
Control de Caja → Corte X / Corte Z                                [turno como contexto]
```

**Guardián del botón atrás (§10.2):** `NOT_EVIDENCED` en esta ronda. Verificar en re-auditoría que atrás nunca descarte carrito sin facturar, conteo de arqueo ni monto tecleado (AP-POS-04, severidad `BLOCKER` si falla).

---

## 7. Cobertura de estados (§28–§32)

`NOT_EVIDENCED` en esta ronda para la mayoría de clases. Re-auditar en el siguiente pase:

- carga (§28), 4 clases de vacío (§29), errores con las 4 preguntas (§30/Brand §25), éxito calmado (§31), y **posición de toasts/snackbars** (§32.1: nunca sobre carrito, keypad o vuelto — `FAIL / REQUIRED` si cubre el vuelto en el momento del cobro, AP-POS-03).

---

## 8. Cobertura de hardware (§45)

`NOT_EVIDENCED` en esta ronda. Re-auditar bajo el estándar expandido:

- spec del ticket de 80 mm (§45.1) y corte parcial ESC/POS;
- manejo de papel agotado con venta válida y ticket reimprimible (§45.2);
- gaveta: kick en efectivo, apertura manual con permiso + auditoría (§45.3);
- escáner sin doble inyección (§45.4);
- reconexión calmada (§45.5);
- lenguaje "compatible / verificado por NHILOS", nunca "homologado" (§45.6).

---

## 9. Oportunidades +1 (§49)

| Candidato | Patrón | Evaluación |
|---|---|---|
| Feedback háptico al cobrar | +1.15.1 | Útil y sostenible — **recomendado (PX-005)** |
| Confirmación sonora sutil al imprimir | +1.15.2 | Evaluar en re-auditoría de hardware |
| Nube ámbar "Venta local protegida" | +1.15.3 | Verificar copy/estado actual en re-auditoría offline |
| Corte Z pantalla = papel 1:1 | +1.15.4 | Verificar en re-auditoría de hardware |
| Botones rápidos de billetes dinámicos | +1.3 / §40 | Ya presentes en el modal de cobro — **PASS** |

Regla de gobernanza: ningún +1 se implementa mientras exista un hallazgo `REQUIRED` abierto en la misma superficie.

---

## 10. Correcciones requeridas para aceptación

| ID | Severidad | Encargado | Test de aceptación |
|---|---|---|---|
| PX-001 | REQUIRED | Frontend POS | Ningún producto no-hamburguesa con ícono de hamburguesa; resolver por categoría activo. |
| PX-002 | REQUIRED | Frontend POS | Cero colores fuera de §42.1 en `pos_02`, `pos_06`, `pos_14`; keypad clean slate. |
| PX-003 | REQUIRED | Frontend POS | Filas del historial con ítems, cajero, método de pago y total legibles sin abrir la factura. |

**Refinamientos diferidos:**

| ID | Justificación |
|---|---|
| PX-004 | `REFINEMENT`: no rompe la promesa central; se agrupa con el refactor visual de PX-002. |

**+1 aprobado tras cierre de REQUIRED:**

| ID | Condición |
|---|---|
| PX-005 | Solo después de cerrar PX-001/PX-002/PX-003 en las superficies afectadas. |

---

## 11. Tests de aceptación (consolidado)

1. Catálogo de SOHO Café: 0 fallbacks de hamburguesa en productos de café/repostería (PX-001).
2. Capturas nuevas de PIN/cobro/caja: 0 hex fuera de la paleta §42.1 (PX-002).
3. Historial: identificación visual de una venta de 2 ítems sin tocar la fila (PX-003).
4. Alternancia de billetes rápidos: ancho del vuelto estable (PX-004).
5. Cobro en dispositivo físico: pulso háptico presente sin retraso perceptible (PX-005).

---

## 12. Veredicto de la Auditoría

- [ ] **READY**
- [x] **READY_AFTER_REQUIRED_FIXES** (núcleo operativo y fiscal sólido; requiere cerrar PX-001, PX-002 y PX-003 y completar el pase de re-auditoría §14)
- [ ] **NOT_READY**
- [ ] **BLOCKED_BY_PRODUCT_DECISION**
- [ ] **BLOCKED_BY_MISSING_EVIDENCE**

**Conclusión del Auditor:**
El núcleo operativo de NHILOS POS es extraordinario: la resiliencia fuera de línea (EX-17), la precisión fiscal (EX-01, EX-02) y el cálculo de vueltos multimoneda (EX-03) son intachables y satisfacen el *Core Promise*. Para cumplir la promesa de **"Lujo Sobrio y Cuidado Artesanal"** de la marca NHILOS, se aprueba la ejecución de un **refactor visual quirúrgico** en `apps/pos_app` que elimine el Síndrome de la Hamburguesa (PX-001), unifique la paleta cromática alrededor de Deep Teal / Slate (PX-002) y agregue la riqueza contextual necesaria en el historial de ventas (PX-003), seguido del pase de re-auditoría de las dimensiones `NOT_EVIDENCED` del estándar expandido.

---

## 13. Resumen de severidades

| Severidad | Cantidad | IDs |
|---|---:|---|
| BLOCKER | 0 | — |
| REQUIRED | 3 | PX-001, PX-002, PX-003 |
| REFINEMENT | 1 | PX-004 |
| +1 OPPORTUNITY | 1 | PX-005 |

---

## 14. Pase de re-auditoría requerido (estándar expandido §0–§62)

Las dimensiones marcadas `NOT_EVIDENCED`/`PARTIAL` en la matriz §4 deben cubrirse con evidencia nueva antes del veredicto final de la terminal (Estándar §60):

| Dimensión | Secciones del estándar | Evidencia mínima requerida |
|---|---|---|
| Encontrabilidad | §13–§15 | Búsqueda/filtro/orden del historial y catálogo en dispositivo |
| Estados | §28–§32 | 4 clases de vacío, errores con 4 preguntas, posición de toasts |
| Permisos | §33 | PIN de supervisor en anulación y apertura de gaveta, por rol |
| Accesibilidad | §46 | Recorrido TalkBack del flujo de cobro; contraste; targets |
| Hardware | §45 | Ticket 80 mm vs spec, corte parcial, out-of-paper, gaveta, escáner |
| Performance | §47 | Medición de latencia de toque y cold start en MIRAY Q80 |
| Guardián de atrás | §10.2 | Carrito/conteo/cobro protegidos ante botón atrás |
| Offline (invariantes) | §35 | Durabilidad de cola tras reinicio; idempotencia del outbox |
