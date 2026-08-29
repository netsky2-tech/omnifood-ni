# Calculadora interna de viabilidad financiera

**Uso interno.** Los CSV son la fuente editable y el manifiesto publicado identifica una generación completa de reportes. Todas las métricas son **antes de impuestos y retenciones**. El resultado económico y la contribución por cliente NO son utilidad neta.

## Ruta mensual

```bash
python3 scripts/finance/generate_financial_report.py --period YYYY-MM --scenario LOW
python3 scripts/finance/generate_financial_report.py --period YYYY-MM --scenario CONSERVATIVE
```

Cada ejecución escribe una instantánea en `docs/finance/generated/runs/<generation_id>/` y, solo cuando todos sus archivos están completos, reemplaza atómicamente `docs/finance/generated/authoritative_manifest.json`. Los lectores deben resolver `run_path` desde ese manifiesto; los archivos sueltos antiguos en la raíz de `generated/` no son autoritativos.

```bash
python3 - <<'PY'
import json
from pathlib import Path
root = Path("docs/finance/generated")
manifest = json.loads((root / "authoritative_manifest.json").read_text(encoding="utf-8"))
print(root / manifest["run_path"])
PY
```

Una falla antes del cambio de manifiesto puede dejar una ejecución huérfana, pero nunca mezcla sus archivos con la generación autoritativa anterior.

## Qué significa cada resultado

| Concepto | Fórmula | Lectura correcta |
| --- | --- | --- |
| Ingreso | `INCOME` con estado `CLEARED` | Valor reconocido por servicios; puede ser de caja o no monetario. |
| Flujo de caja neto | ingreso de caja + `CAPITAL_IN` − gastos de caja − `CAPITAL_OUT` | Movimiento real de efectivo. El capital no altera el resultado operativo. |
| Resultado operativo | ingresos `CLEARED` − gastos `CLEARED` | Desempeño antes de impuestos/retenciones y antes de valorar trabajo del propietario. |
| Resultado económico | resultado operativo − trabajo `CONFIRMED` | Indica si la operación cubre los recursos consumidos. No es utilidad neta. |
| Contribución por cliente | ingreso atribuido − gastos atribuidos de caja/no monetarios − trabajo atribuido | Antes de costos compartidos no asignados, impuestos y retenciones; no equivale a rentabilidad final. |

`PENDING`, `UNVERIFIED` y horas `ESTIMATED` nunca afectan actuals.

## Transacciones y capital

```text
amount_usd = redondear_media_arriba(amount × fx_to_usd, 2 decimales)
```

`amount` siempre es positivo. Si se suministra `amount_usd`, debe coincidir **exactamente al centavo** con la conversión. Las direcciones válidas son:

- `INCOME`: ingreso operativo; categoría `REVENUE`.
- `EXPENSE`: gasto operativo.
- `CAPITAL_IN`: aporte o reversión de retiro; categoría `FINANCING`.
- `CAPITAL_OUT`: retiro o reversión de aporte; categoría `FINANCING`.

`SUBSCRIPTION` exige `recurring=YES`; `SETUP` exige `recurring=NO`. El generador rechaza clasificaciones libres o contradictorias. Los aportes, retiros y sus reversiones afectan caja, nunca ingreso ni resultado operativo.

## Suscripciones efectivas e MRR histórico

Cada fila de `CUSTOMER_SUBSCRIPTIONS.csv` es un intervalo inmutable identificado por `interval_id` y asociado a un `subscription_id` estable.

```text
MRR = suma(monthly_fee_usd de intervalos ACTIVE vigentes al cierre)
ARR = MRR × 12
reserva_variable = suma(reserva del escenario de esos intervalos ACTIVE)
contribucion_recurrente = MRR − presupuesto_fijo − reserva_variable
margen_unitario_promedio = (MRR − reserva_variable) / intervalos_activos
clientes_equilibrio = techo(presupuesto_fijo / margen_unitario_promedio)
```

Una pausa, cancelación o reactivación futura no cambia meses anteriores: se cierra el intervalo vigente y se añade uno nuevo. Nunca se cambia el estado o la fecha inicial de un intervalo histórico.

El equilibrio devuelve:

- `NO_ACTIVE_SUBSCRIPTIONS`: no existe tarifa/reserva activa observada.
- `UNATTAINABLE_NONPOSITIVE_MARGIN`: tarifa promedio menos reserva es cero o negativa.
- un entero: clientes requeridos con el margen activo promedio.

SOHO permanece `PLANNED`, con fecha prevista 2026-09-05, hasta una puesta en marcha aceptada. Para activarlo, cierre el intervalo planificado el día anterior a la aceptación real y añada un intervalo `ACTIVE` nuevo desde la fecha aceptada. El cobro se registra aparte como transacción y solo pasa a `CLEARED` con evidencia.

## Presupuesto fijo y reservas

`FINANCIAL_BUDGET.csv` contiene únicamente líneas `FIXED`. `budget_line_id` define identidad dentro de cada escenario:

- una fila `RECURRING` establece la base;
- una fila `YYYY-MM` con el mismo escenario e ID **reemplaza** esa línea durante el mes;
- IDs distintos se suman; y
- claves duplicadas o metadatos contradictorios se rechazan.

La única autoridad de reserva variable es el intervalo de suscripción activo. No se registra reserva por cliente en el presupuesto fijo.

| Escenario | Presupuesto fijo | Reserva SOHO por intervalo activo | Equilibrio de referencia a US$89 |
| --- | ---: | ---: | ---: |
| `LOW` | US$161.92 | US$1.00 | 2 clientes |
| `CONSERVATIVE` | US$170.02 | US$5.00 | 3 clientes |

La oferta pública continúa en **US$250 de implementación + US$89/mes**. SOHO fundador continúa en **US$200 + US$79/mes** después del go-live aceptado.

## Estados de viabilidad sin ambigüedad

Cada dimensión usa los mismos límites:

- `POSITIVE_SURPLUS`: resultado mayor que cero.
- `NON_NEGATIVE`: resultado exactamente cero; cubre sin excedente.
- `NEGATIVE`: resultado menor que cero.

Se aplican por separado a caja, resultado económico después del trabajo del propietario y contribución recurrente modelada. Caja positiva financiada por capital no demuestra sostenibilidad operativa.

## Contribución y costos compartidos

`client_contribution_YYYY-MM.csv` incluye clientes con actividad del periodo y, claramente identificados, clientes activos sin actividad. Excluye clientes solamente `PLANNED`. Incluye gastos atribuidos de caja y no monetarios, además de trabajo confirmado.

`cost_allocation_reconciliation_YYYY-MM.csv` separa gastos y trabajo atribuidos de costos compartidos sin asignar. Esa conciliación es obligatoria: una contribución positiva antes de costos compartidos no es ganancia del cliente.

## Señales de alerta

Investigar si aumenta `UNVERIFIED`, se reescribe un intervalo histórico, falta trabajo del propietario, aparece una reserva variable en presupuesto, el resultado depende de capital/setup, la clasificación contradice recurrencia, o la generación leída no coincide con el manifiesto autoritativo.
