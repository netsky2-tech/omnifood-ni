import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toFiniteNumber } from "@/lib/numeric";
import { useDishMargins } from "./use-dish-margins";

/**
 * R8 (H8): the per-dish cost and margin surface the theoretical-cost
 * calculator never had. It reads `GET /inventory/reports/dish-margins` and
 * shows, per dish, the unit theoretical cost, the selling price and the
 * gross margin (Nio and %). A dish the backend could not price appears in
 * "No valuados" WITH its reason — the surface never hides a gap behind an
 * em dash.
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function DishMarginsPage() {
  const { data, isLoading, isError } = useDishMargins();

  if (isLoading) {
    return <LoadingState message="Calculando costo y margen por plato…" />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        title="No se pudo cargar el costo por plato"
        description="Reintente en unos segundos."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Costo y margen por plato</h1>
        <p className="text-sm text-muted-foreground">
          Costo teórico del lote y margen bruto por plato, a partir del costo
          promedio actual de cada componente.
        </p>
      </header>

      {data.dishes.length === 0 ? (
        <EmptyState
          title="Sin platos valuados"
          description="Ningún producto COMPOUND o PREPARED tiene una receta publicada activa."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Platos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plato</TableHead>
                  <TableHead className="text-right">
                    Costo unitario
                  </TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dishes.map((dish) => (
                  <TableRow key={dish.productId}>
                    <TableCell>{dish.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        toFiniteNumber(dish.unitTheoreticalCostNio),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dish.sellingPriceNio == null
                        ? "—"
                        : formatCurrency(toFiniteNumber(dish.sellingPriceNio))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dish.grossMarginNio == null
                        ? "—"
                        : formatCurrency(toFiniteNumber(dish.grossMarginNio))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dish.grossMarginPct == null
                        ? "—"
                        : formatPercent(toFiniteNumber(dish.grossMarginPct))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.skipped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No valuados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.skipped.map((skip) => (
                <li key={skip.productId}>
                  <span className="font-medium text-foreground">
                    {skip.productName}
                  </span>
                  : {skip.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
