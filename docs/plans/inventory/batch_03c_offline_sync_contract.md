# Batch 3c: Sync Offline Determinista — Deltas e Idempotencia

Contrato determinista para la sincronización offline (Topología B). Define cómo la tablet transmite movimientos a la nube de forma reproducible, sin corrupción por latencia/conectividad intermitente. Cierra UC-02.

## Estado actual
- Sync de catálogo existe; sync de movimientos no tiene contrato determinista formal.

## Brechas a remediar
- [ ] **Clave de idempotencia**: cada movimiento local genera un idempotency key único (ej. `{terminal_id}:{seq_local}`) para que la nube rechace duplicados.
- [ ] **Secuencia por terminal de origen**: cada terminal mantiene su propio contador secuencial estricto; la nube procesa por orden de secuencia de origen, no por timestamp de llegada.
- [ ] **Deltas, no absolutos**: la tablet nunca transmite "stock actual"; transmite deltas netos (PRD §1 Topología B, UC-02).
- [ ] **Reintentos y duplicados**: política de retry con backoff; la nube debe responder idéntico ante retransmisiones (idempotencia).
- [ ] **Fallo parcial**: política explícita — qué pasa si un lote parcial se acepta y otro se rechaza (registro de rechazo, reenvío selectivo).
- [ ] **Orden en la nube**: la nube no reordena por timestamp absoluto; respeta la secuencia de origen por terminal para preservar balances intermedios (UC-02).

## Alcance técnico

### Contrato de sync (determinista)
| Aspecto | Regla |
|---------|-------|
| Unidad de transferencia | Delta neto por movimiento (no stock absoluto) |
| Clave idempotencia | `{terminal_id}:{seq_local}` — único, rechaza duplicados |
| Ordenamiento | Secuencia de origen por terminal, estricta |
| Retry | Backoff exponencial; retransmitir lote hasta ack |
| Duplicado | Nube responde igual (idempotente), no duplica movimiento |
| Fallo parcial | Lote se marca por ítem; rechazos van a cola de reenvío con motivo |
| Outbox | Patrón Outbox local: movimientos confirmados encolados, no enviados en la transacción de venta |

### Topología B (PRD §1)
- La tablet ejecuta BOM localmente (SQLite) al confirmar venta/merma.
- Al recuperar conexión, dispara transacciones en orden cronológico de origen (Outbox Pattern).
- La nube procesa cada delta sin alterar balances intermedios ya calculados de otros dispositivos.

### Concurrencia (NFR)
- FIFO por ítem al aplicar deltas concurrentes desde múltiples terminales.

## DoD (Criterios de aceptación)
- [ ] Cada movimiento local lleva idempotency key + seq de terminal.
- [ ] Nube rechaza duplicados (test: retransmitir lote → sin duplicados en Kardex).
- [ ] Orden preservado: test con seq desordenada por red → la nube aplica en orden de origen.
- [ ] Política de fallo parcial documentada y testeada (un ítem rechazado no aborta el lote entero).
- [ ] Verificar que ningún endpoint acepta "stock actual" absoluto.

## PRD cubierto
§1 Topología B · UC-02 Sync diferida · NFR Concurrencia
