# Guía práctica de control financiero

Los CSV son la fuente de verdad editable. Los reportes se consumen únicamente desde la ejecución indicada por `authoritative_manifest.json`.

## ALTO — puerta de privacidad antes de usar Git

> **Los archivos financieros reales solo pueden añadirse a Git cuando este repositorio Y cada remoto, fork, espejo, respaldo CI y destino de revisión estén aprobados como privados.** Si no puede demostrarlo, NO añada datos reales ni reportes generados al repositorio.

Use las opciones de ruta para mantener fuentes y salidas en un directorio privado externo:

```bash
python3 scripts/finance/generate_financial_report.py \
  --period 2026-08 \
  --scenario LOW \
  --ledger "$HOME/private/omnifood-finance/FINANCIAL_TRACKER.csv" \
  --budget "$HOME/private/omnifood-finance/FINANCIAL_BUDGET.csv" \
  --subscriptions "$HOME/private/omnifood-finance/CUSTOMER_SUBSCRIPTIONS.csv" \
  --labor "$HOME/private/omnifood-finance/OWNER_LABOR.csv" \
  --output-dir "$HOME/private/omnifood-finance/generated"
```

No incluya métodos de pago, números bancarios, referencias de comprobantes ni notas privadas en reportes. El generador utiliza esos campos para validación/atribución cuando corresponda, pero no los publica.

## Ruta semanal — 10 minutos

- [ ] Guardar evidencia en almacenamiento privado y asignar una referencia interna.
- [ ] Añadir ingresos, gastos, `CAPITAL_IN` y `CAPITAL_OUT` al ledger.
- [ ] Marcar `CLEARED` solo con evidencia; mantener dudas como `PENDING` o `UNVERIFIED`.
- [ ] Registrar horas reales como `CONFIRMED`; planificación como `ESTIMATED`.
- [ ] Revisar importes positivos, clasificación controlada, efecto de caja y recurrencia.
- [ ] Confirmar que Excel no cambió fechas, IDs ni encabezados.

## Cierre mensual — 10 minutos

- [ ] Conciliar filas `CLEARED` con la evidencia privada.
- [ ] Resolver `PENDING` sin convertir automáticamente legado `UNVERIFIED`.
- [ ] Cerrar/añadir intervalos de suscripción; nunca reescribir intervalos históricos.
- [ ] Revisar overrides mensuales del presupuesto fijo y reservas en intervalos activos.
- [ ] Ejecutar LOW y CONSERVATIVE.
- [ ] Resolver el manifiesto y revisar dashboard, resumen, contribución y conciliación de costos.
- [ ] Regenerar un escenario y confirmar mismo `generation_id` y ausencia de filas duplicadas.
- [ ] Respaldar fuentes, manifiesto, ejecución autoritativa y evidencia en almacenamiento privado.

```bash
python3 scripts/finance/generate_financial_report.py --period YYYY-MM --scenario LOW
python3 scripts/finance/generate_financial_report.py --period YYYY-MM --scenario CONSERVATIVE
python3 -m unittest discover -s scripts/finance/tests -p 'test_*.py' -v
```

## Cómo encontrar la generación autoritativa

```bash
python3 - <<'PY'
import json
from pathlib import Path
root = Path("docs/finance/generated")  # Cambie esta ruta si usa --output-dir.
manifest = json.loads((root / "authoritative_manifest.json").read_text(encoding="utf-8"))
run = root / manifest["run_path"]
print("generation_id:", manifest["generation_id"])
print("authoritative run:", run)
for name in sorted(manifest["files"]):
    print(" -", run / name)
PY
```

El manifiesto contiene hashes SHA-256. El generador valida el manifiesto, el manifiesto interno de la ejecución y cada hash antes de reutilizar un resumen. Una falla de publicación no cambia el manifiesto anterior. Los archivos sueltos previos en la raíz de `generated/` son legado no autoritativo.

## Contratos

| Archivo | Responsabilidad |
| --- | --- |
| `FINANCIAL_TRACKER.csv` | Transacciones `CLEARED`, `PENDING` y `UNVERIFIED`. |
| `FINANCIAL_BUDGET.csv` | Costos fijos LOW/CONSERVATIVE e overrides mensuales. |
| `CUSTOMER_SUBSCRIPTIONS.csv` | Intervalos efectivos para MRR/ARR y reserva variable. |
| `OWNER_LABOR.csv` | Tiempo confirmado o estimado del propietario. |
| `generated/authoritative_manifest.json` | Único puntero a una generación completa. |

Los CSV de entrada aceptan UTF-8 con o sin BOM. Los CSV generados usan **UTF-8 con BOM**, delimitador coma y escape preventivo de textos que comienzan con `=`, `+`, `-` o `@` para uso seguro en Excel. No cambie encabezados ni cantidad de columnas.

## Ledger: campos e invariantes

| Campo | Regla |
| --- | --- |
| `transaction_id` | ID único, estable y no reutilizable. |
| `date` | `YYYY-MM-DD`. |
| `status` | `CLEARED`, `PENDING` o `UNVERIFIED`. |
| `direction` | `INCOME`, `EXPENSE`, `CAPITAL_IN` o `CAPITAL_OUT`. |
| `category` / `subcategory` | Valores controlados; no se aceptan etiquetas improvisadas. |
| `client` | Cliente atribuible; vacío para costo compartido. |
| `amount` | Decimal positivo en moneda fuente. |
| `currency` / `fx_to_usd` | `USD` usa FX `1`; NIO usa USD por córdoba. |
| `amount_usd` | Opcional; si existe debe coincidir exactamente al centavo. |
| `cash_effect` | `YES` o `NO`; capital exige `YES`. |
| `recurring` | `SUBSCRIPTION` exige `YES`; `SETUP` exige `NO`. |
| `reference` / `notes` | Evidencia y contexto privados; no aparecen en reportes. |

```csv
transaction_id,date,status,direction,category,subcategory,client,description,amount,currency,fx_to_usd,amount_usd,cash_effect,recurring,reference,notes
TX-20260905-001,2026-09-05,CLEARED,INCOME,REVENUE,SETUP,SOHO,Accepted implementation fee,200.00,USD,1,,YES,NO,private-receipt,Example only.
TX-20260906-001,2026-09-06,CLEARED,CAPITAL_IN,FINANCING,OWNER_CONTRIBUTION,,Owner cash contribution,100.00,USD,1,,YES,NO,private-transfer,Capital is not income.
TX-20260907-001,2026-09-07,CLEARED,CAPITAL_OUT,FINANCING,OWNER_WITHDRAWAL,,Owner withdrawal,25.00,USD,1,,YES,NO,private-transfer,Capital is not expense.
```

Una reversión usa un ID nuevo y la dirección económica opuesta: por ejemplo, revertir un aporte usa `CAPITAL_OUT/FINANCING/CAPITAL_REVERSAL`. Nunca use importes negativos.

## Presupuesto: identidad y override

`budget_line_id` identifica el mismo costo dentro del escenario. La clave única es `(scenario, period, budget_line_id)`. Solo se permite `scope=FIXED`.

```csv
budget_line_id,period,scenario,category,description,monthly_amount_usd,scope,notes
RAILWAY,RECURRING,LOW,INFRASTRUCTURE,Railway Pro and usage,20.00,FIXED,Recurring base.
RAILWAY,2026-10,LOW,INFRASTRUCTURE,Railway Pro and usage,24.00,FIXED,October override replaces 20.00.
```

Un override reemplaza la línea recurrente del mismo ID; no se suma. Las reservas variables viven exclusivamente en intervalos de suscripción.

## Suscripciones: historial efectivo inmutable

Cada fila representa un intervalo. `interval_id` es único; `subscription_id` agrupa la historia contractual. Los intervalos de una suscripción no pueden superponerse.

```csv
interval_id,subscription_id,client,status,effective_start_date,effective_end_date,monthly_fee_usd,setup_fee_usd,locations,terminals,variable_reserve_low_usd,variable_reserve_conservative_usd,planned_service_date,notes
SOHO-PLAN-20260828,SOHO-FOUNDING-001,SOHO,PLANNED,2026-08-28,2026-09-04,79.00,200.00,1,1,1.00,5.00,2026-09-05,Close only after accepted go-live.
SOHO-ACTIVE-20260905,SOHO-FOUNDING-001,SOHO,ACTIVE,2026-09-05,,79.00,200.00,1,1,1.00,5.00,,Add after actual acceptance.
```

### Pausa, cancelación o reactivación

1. Cierre el intervalo actual con `effective_end_date` en el último día de ese estado.
2. Añada un intervalo nuevo con ID nuevo y fecha inicial posterior.
3. Use `PAUSED`, `CANCELLED` o `ACTIVE` según corresponda.
4. No cambie estado, fecha inicial, tarifa o reserva de un intervalo histórico.

Así, regenerar agosto después de una cancelación en noviembre conserva el MRR de agosto.

## Trabajo del propietario

```csv
entry_id,date,status,client,activity,hours,hourly_rate_usd,notes
LAB-20260905-001,2026-09-05,CONFIRMED,SOHO,Accepted go-live session,2.50,25.00,Example only; enter verified time.
```

La base vigente es US$25/hora. Horas `ESTIMATED` no afectan resultados reales.

## Correcciones y conservación

No elimine ni reescriba historia `CLEARED`. Añada una reversión con ID nuevo, cite el original y después añada la corrección. Una fila abierta `PENDING` puede completarse al llegar evidencia; legado `UNVERIFIED` solo cambia con comprobación documentada. Las facturas fiscales no se eliminan: anulaciones y secuencias se conservan según las reglas DGI aplicables.

Git facilita revisión, pero no sustituye respaldo cifrado, control de acceso ni archivo contable. Antes de compartir cualquier diff, verifique nuevamente la puerta de privacidad de esta guía.
