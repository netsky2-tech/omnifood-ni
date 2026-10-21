import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  fetchInventoryDivergences,
  fetchInventoryParityGaps,
  type InventoryDivergence,
} from "./divergences-api";

/**
 * What did not add up — and WHERE it came from.
 *
 * WHY (FD-01, openspec/changes/fiscal-no-se-congela-por-inventario): the
 * difference between what a sale consumed and what the inventory backed used
 * to be a REJECTION in the cloud, and that rejection froze the terminal's
 * fiscal sequence: the tenant stopped invoicing. Now the cloud applies the
 * invoice always and DECLARES the difference, and this screen is where the
 * owner picks it up.
 *
 * It says two things, in this order:
 * 1. WHAT happened: the sale, the insumo, the units nothing backed and the
 *    money they represent.
 * 2. WHERE it came from: the insumos whose stock does not add up to their
 *    lots. Without the second list, the owner would be hunting the difference
 *    blind — and the second list is the work list that actually closes it.
 *
 * It says NOTHING when there is nothing pending: a healthy inventory is a
 * healthy inventory, and a screen that always has something in it is a screen
 * nobody reads.
 */

const CAUSE_COPY: Record<string, string> = {
  LOT_COVERAGE_INSUFFICIENT:
    "La venta consumió unidades que no estaban en ningún lote.",
  DECLARED_STOCK_INSUFFICIENT:
    "La venta se pasó del stock que la empresa tenía declarado.",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 4,
  }).format(quantity);
}

function causeCopy(cause: string): string {
  return (
    CAUSE_COPY[cause] ??
    "El inventario no respaldó toda la venta (detalle en el servidor)."
  );
}

export function InventoryDivergencePanel() {
  const divergences = useQuery({
    queryKey: ["inventory", "divergences", "OPEN"],
    queryFn: () => fetchInventoryDivergences("OPEN"),
  });
  const parity = useQuery({
    queryKey: ["inventory", "divergences", "parity"],
    queryFn: () => fetchInventoryParityGaps(),
  });

  const rows: InventoryDivergence[] = divergences.data?.items ?? [];
  const gaps = parity.data?.items ?? [];

  if (divergences.isLoading || parity.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Revisando las diferencias de inventario…
      </p>
    );
  }

  if (divergences.isError) {
    return (
      <p className="text-sm text-destructive">
        No se pudieron leer las diferencias de inventario. Revisa la conexión
        con el servidor.
      </p>
    );
  }

  if (rows.length === 0 && gaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay diferencias de inventario pendientes de conciliar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.length > 0 && (
        <section aria-labelledby="divergences-pendientes">
          <h3
            id="divergences-pendientes"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            Ventas registradas con diferencias por conciliar
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            La factura se registró igual —nunca se bloquea la venta— pero el
            inventario no respaldó toda la salida. Se concilia con una
            regularización del insumo.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-4 py-2 font-medium">Venta</th>
                  <th className="px-4 py-2 font-medium">Causa</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Unidades sin respaldo
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="px-4 py-3 tabular-nums">
                      {row.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {causeCopy(row.cause)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatQuantity(row.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(row.amountNio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {gaps.length > 0 && (
        <section aria-labelledby="desajustes-paridad">
          <h3
            id="desajustes-paridad"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            Insumos cuyo stock no cuadra con sus lotes
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Aquí nacen las diferencias: el stock declarado no coincide con la
            suma de los lotes. Un conteo o una regularización de estos
            insumos es lo que las cierra.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-4 py-2 font-medium">Insumo</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Stock declarado
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Suma de lotes
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Desajuste
                  </th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((gap) => (
                  <tr key={gap.insumoId} className="border-b">
                    <td className="px-4 py-3">{gap.insumoName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatQuantity(gap.declaredStock)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatQuantity(gap.lotStock)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatQuantity(gap.gap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
