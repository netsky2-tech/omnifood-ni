# NHILOS POS — Module Experience Audit Template v1.0

**Based on:** `nhilos_pos_experience_standard_v1.0.md` (§0–§62) and `nhilos_brand_experience_principles_v1.0.md` (Part B: NHILOS POS Expression)
**Standard sections covered:** §0–§62 (paridad estructural con `nhilos_backoffice_experience_standard_v1.0.md`)
**Use for:** Any POS App module audit (Flutter / Android 12 / MIRAY Q80)

---

# <MODULE> — Auditoría de Experiencia NHILOS POS

**Versión:**
**Fecha:**
**Auditor:**
**Módulo:** (Acceso/PIN / Catálogo-Venta / Carrito-Cobro / Historial-Facturación / Anulación DGI / Control de Caja / KDS / Sincronización / Hardware)
**Hardware target:** MIRAY Q80 / iPOS (Android 12, 800x1280 vertical, impresora térmica 80 mm, gaveta, escáner)
**Autoridad del módulo:** (PRD / Architecture Spec / POS Experience Standard / contrato DGI)
**Widgets / views revisadas:**
**Evidencia revisada:** (capturas ADB directas del hardware / código / runtime / tests)

---

## 1. Autoridad y conflictos (§0)

- Autoridad de producto identificada: (PRD / Spec / Acceptance Plan)
- Autoridades de experiencia aplicadas: Brand Part B + POS Standard §0–§62
- Conflictos autoridad-producto vs. autoridad-experiencia detectados:

```text
ID de conflicto:
Sección del estándar:
Descripción:
Resolución requerida: (producto gana / marca gana / AUTHORITY_CONFLICT a reportar)
```

> Regla: si un PRD aprobado exige un comportamiento distinto al que sugiere el estándar, reportar `AUTHORITY_CONFLICT`. No reescribir silenciosamente el contrato de producto.

---

## 2. Trabajo del módulo (§1, §4)

**Usuario primario:** (Cajero / Barista / Encargado de Turno / Propietario)
**Trabajo primario (Core Promise):**
**Usuarios/trabajos secundarios:**
**Requisito de velocidad en hora pico:** (ej. <10 s por venta en efectivo, <50 ms por toque)
**Riesgo si falla:** (descuadre de caja, demora en fila, producto equivocado, incumplimiento DGI, pérdida de carrito)
**Blockers de Core Promise revisados (§4.1):** verdad financiera / permisos / efectos colaterales / pérdida de trabajo / ambigüedad destructiva / contexto reconstruido a mano / desconocido como válido / contradicción PRD / flujo crítico inaccesible.

---

## 3. Inventario de superficies (§6 Fase B)

| Superficie / Pantalla | Flutter View / Widget | Trabajo | Lectura / Escritura | Densidad táctil | Variantes de permiso | Estados offline | Evidencia |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

---

## 4. Matriz de cobertura de experiencia (EX-01 → EX-19) (§51)

| ID | Dimensión | Pregunta central | Estado | Evidencia | Hallazgos |
|---|---|---|:---:|---|---|
| **EX-01** | Core Promise | ¿El operador completa la venta y el sistema dice la verdad fiscal? | | | |
| **EX-02** | Verdad de Producto | ¿UI coincide con PRD/dominio/DGI? | | | |
| **EX-03** | Precisión | ¿Vuelto y multimoneda son inequívocos? ¿Se pueden malinterpretar etiquetas? | | | |
| **EX-04** | Navegación | ¿El contexto viaja entre superficies? | | | |
| **EX-05** | Encontrabilidad | ¿Búsqueda/filtro/orden apropiados? | | | |
| **EX-06** | Formularios | ¿Entrada/edición y keypads claros, seguros, recuperables? | | | |
| **EX-07** | Acciones | ¿Consecuencias, riesgo y feedback claros? | | | |
| **EX-08** | Estados | ¿Carga/vacío/error/parcial/éxito intencionales? | | | |
| **EX-09** | Permisos | ¿Autorización end-to-end (PIN supervisor, roles)? | | | |
| **EX-10** | Tiempo | ¿Cero pasos repetidos en hora pico? | | | |
| **EX-11** | Sobriedad | ¿70/20/10 respetado, UI innecesaria eliminada? | | | |
| **EX-12** | Consistencia | ¿Patrones de suite compartidos? | | | |
| **EX-13** | Microcopy | ¿Lenguaje preciso, calmado, accionable? | | | |
| **EX-14** | Accesibilidad | ¿TalkBack, contraste AAA, targets táctiles? | | | |
| **EX-15** | Hardware | ¿Impresión 80 mm, papel, gaveta, escáner, reconexión según §45? | | | |
| **EX-16** | Performance | ¿<50 ms por toque, cold start, impresión no bloqueante? | | | |
| **EX-17** | Continuidad Offline | ¿Si el Wi-Fi cae, todo sigue y la verdad se preserva? | | | |
| **EX-18** | +1 | ¿Oportunidad de mejora sostenible? | | | |
| **EX-19** | Evidencia | ¿Cada PASS/FAIL es demostrable? | | | |

Cada celda de Estado recibe exactamente uno: `PASS | FAIL | PARTIAL | NOT_EVIDENCED | N/A | AUTHORITY_CONFLICT`.
`NOT_EVIDENCED` no equivale a PASS.

---

## 5. Anatomía de pantalla y ergonomía táctil (§7, §8, §18, §46)

Para cada vista principal del módulo (5 preguntas de §7):

| Superficie | ¿Dónde estoy? | ¿Qué puedo hacer? (Acción primaria >=56 dp) | ¿Qué estoy viendo? (Alcance explícito) | ¿Qué necesita atención? | ¿Qué pasa después? | Targets >=48 dp? | Keypad >=72 dp + gap >=8 dp? | Color no es única señal? |
|---|---|---|---|---|---|:---:|:---:|:---:|
| | | | | | | | | |

Jerarquía P0/P1/P2 (§8): documentar qué domina cada pantalla y qué compite indebidamente.

---

## 6. Marca, sobriedad e identidad (§3, §12.6, §42)

| Check | Criterio | Estado | Evidencia / Observación |
|---|---|:---:|---|
| **Sobriedad cromática** | Paleta Deep Teal (`#1E3A40`) + Slate + Blanco. Sin marrones (`#795548`) ni morados (`#3949AB`) descolgados. Sin arcoíris. | | |
| **Keypad clean slate** | Teclas blancas + gris neutro en borrado (`#F1F5F9`/`#475569`). Sin rojos/marrones decorativos. | | |
| **Identidad de categoría** | Sin Síndrome de la Hamburguesa: resolver dinámico de glifos por categoría + monograma tipográfico (§12.6). | | |
| **Tipografía tabular** | Montos con `FontFeature.tabularFigures()`. Los números no bailan. | | |
| **Jerarquía de cobro** | Monto y vuelto dominan (P0). Buzzer/notas discretas. Vuelto en verde esmeralda con tipografía masiva. | | |
| **Disciplina 70/20/10** | 70% sobriedad / 20% producto / 10% gesto memorable. | | |
| **Estados de factura** | `ANULADA` visible sin convertir el historial en alarma (§26.1). | | |

---

## 7. Navegación, contexto y botón atrás (§9, §10, §11)

Mapa de navegación contextual:

```text
origen → destino → contexto preservado
```

Checks obligatorios:

- [ ] Sin drill-downs genéricos sin salida (AP-01).
- [ ] El contexto conocido por el sistema no se re-ingresa a mano.
- [ ] Lista/detalle/atrás preserva filtros, búsqueda y posición.
- [ ] **Guardián del botón atrás (§10.2):** carrito sin facturar protegido; ventas pendientes de sync intactas; conteo de arqueo advertido; monto tecleado conservado. (`BLOCKER` si falla: AP-POS-04)
- [ ] Drawer: ruta activa inequívoca, badges accionables, navegación según permiso.

---

## 8. Cobertura de estados (§28–§32)

| Estado | ¿Existe? | ¿Intencional? | Evidencia |
|---|:---:|:---:|---|
| Carga (skeleton/local) | | | |
| Vacío de primer uso | | | |
| Vacío válido | | | |
| Vacío filtrado (muestra filtro + reset) | | | |
| Vacío por permiso (superficie omitida) | | | |
| Error (responde las 4 preguntas de §30/Brand §25) | | | |
| Parcial / parcialmente sincronizado | | | |
| Éxito calmado con siguiente paso | | | |
| Toast/snackbar (no cubre carrito, keypad ni vuelto — §32.1) | | | |

---

## 9. Continuidad offline y sincronización (§35)

- [ ] SQLite es fuente de verdad; la venta no depende de red para ser válida.
- [ ] La cola de sincronización sobrevive cierre de app, crash y reinicio.
- [ ] El outbox es idempotente: ningún reintento genera factura duplicada.
- [ ] Señal offline: nube ámbar calmada + contador de cola + "Venta local protegida". Sin rojo alarmante.
- [ ] Los estados pendientes nunca se muestran como completados ni como cero.

---

## 10. Hardware y periféricos (§45)

| Check | Criterio | Estado | Evidencia |
|---|---|:---:|---|
| **Ticket 80 mm** | Header (logo, nombre, RUC, dirección), correlativo, fecha/hora/caja/turno/cajero, zona monoespaciada con montos alineados, desglose DGI, pagos/vuelto, QR sin cortar, pie. | | |
| **Corte ESC/POS** | Corte parcial. Nunca corte total ni a mitad del QR. | | |
| **Papel agotado** | Detección, señal ámbar accionable, ticket encolado y reimprimible, venta sigue siendo válida. | | |
| **Gaveta** | Kick automático solo en efectivo; apertura manual con permiso de supervisor + PIN + evento de auditoría. | | |
| **Escáner** | Agrega/localiza sin doble inyección; código desconocido con feedback claro; funciona offline. | | |
| **Reconexión** | Estado visible, backoff automático, sin bucles de diálogos, venta nunca bloqueada. | | |
| **Lenguaje** | "compatible / verificado por NHILOS". Nunca "homologado" sin verificación. | | |

---

## 11. Fiscal y finanzas (§23, §24, §34)

- [ ] Facturas jamás se eliminan; solo `is_canceled` con numeración secuencial inmutable.
- [ ] Anulación exige motivo formal DGI (radio buttons grandes; *Otro* con detalle obligatorio) y PIN de supervisor.
- [ ] Botón de anulación con verbo explícito y bloqueado hasta motivo válido.
- [ ] Guarda anti doble envío activa en cobro y anulación (idempotencia de factura).
- [ ] Moneda consistente (C$ primario, USD como equivalencia con TC visible); decimales estables.
- [ ] Detalle de factura = ticket de papel 1:1 (§24.2).
- [ ] `—` significa desconocido, jamás cero; históricos permanecen históricos.

---

## 12. Hallazgos (§53)

Usar la plantilla de hallazgo del estándar (§53) para cada hallazgo:

| ID | Severidad | Sección del estándar | Superficie | Hallazgo (resumen) | Corrección recomendada |
|---|---|---|---|---|---|
| PX-001 | BLOCKER / REQUIRED / REFINEMENT / +1 OPPORTUNITY | | | | |
| PX-002 | | | | | |

Plantilla completa por hallazgo (pegar debajo de la tabla):

```text
ID: PX-###
Severidad: BLOCKER | REQUIRED | REFINEMENT | +1 OPPORTUNITY
Estado: OPEN
Estándar: §<sección>
Superficie:
Autoridad:

ACTUAL
<lo que la implementación hace>

ESPERADO
<lo que el estándar/contrato de producto requiere>

POR QUÉ IMPORTA
<core promise / precisión / cuidado / tiempo / sobriedad / +1>

EVIDENCIA
<archivo/código/captura ADB/runtime/test>

CORRECCIÓN
<cambio acotado recomendado>

ACEPTACIÓN
<test observable>

DEPENDENCIAS
<si aplica>
```

Reglas de severidad (§5.1): `BLOCKER` = el release no puede pasar (seguridad, verdad fiscal/financiera, pérdida de datos, acción destructiva sin protección, falsa certeza material). `REQUIRED` = debe corregirse para aceptación. `REFINEMENT` = calidad sin romper la promesa central. `+1 OPPORTUNITY` = mejora sostenible; su ausencia no es fracaso.

---

## 13. Oportunidades +1 (§49)

Solo después de entender los hallazgos de Core Promise / REQUIRED.

| Candidato +1 | Patrón (§49) | Útil / Sostenible / No compensatorio | Recomendación |
|---|---|---|---|
| | | | |

---

## 14. Correcciones requeridas y refinamientos diferidos

**Correcciones requeridas para aceptación:**

| ID | Severidad | Encargado | Test de aceptación |
|---|---|---|---|
| | | | |

**Refinamientos diferidos (con justificación):**

| ID | Justificación del diferimiento |
|---|---|
| | |

---

## 15. Veredicto de la auditoría (§6 Fase H)

- [ ] **READY** (Cumple el Estándar de Experiencia NHILOS POS)
- [ ] **READY_AFTER_REQUIRED_FIXES** (Núcleo sólido; requiere cerrar REQUIRED)
- [ ] **NOT_READY** (Falla Core Promise, ergonomía táctil crítica, sobriedad de marca o invariantes offline/DGI)
- [ ] **BLOCKED_BY_PRODUCT_DECISION**
- [ ] **BLOCKED_BY_MISSING_EVIDENCE**

**Conclusión del auditor:**
