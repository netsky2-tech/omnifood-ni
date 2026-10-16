import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChefHat, Search, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { DishMargin } from "./dish-margins";

/**
 * R8 (H8): the per-dish cost and margin surface the theoretical-cost
 * calculator never had. It reads `GET /inventory/reports/dish-margins` and
 * shows, per dish, the unit theoretical cost, the selling price and the gross
 * margin (Nio and %).
 *
 * R16 (S13) applies the Nhilos backoffice experience standard to the same
 * surface: the dishes the backend could NOT price are an exception block with
 * a semantic variant (§7.4, §26.1) carrying operator copy only — the reason
 * arrives in Spanish from the API and a raw id is never rendered (§39.4,
 * §30.3, AP-10). The table is findable and narrowable (§12.1, §13), its sort
 * and range are visible (§15), no-data and no-results are different states
 * (§13.2, §29), and a priced catalog stays quiet (§+1.13).
 */
const PAGE_SIZE = 10;

type SortKey = "name" | "cost" | "price" | "margin" | "marginPct";

const SORTS: {
  key: SortKey;
  label: string;
  value: (dish: DishMargin) => number | string;
}[] = [
  { key: "name", label: "Plato", value: (d) => d.productName.toLowerCase() },
  {
    key: "cost",
    label: "Costo unitario",
    value: (d) => toFiniteNumber(d.unitTheoreticalCostNio),
  },
  {
    key: "price",
    label: "Precio",
    // An unpriced dish sorts below every priced one: it is missing, not zero
    // (AP-02: unknown is never presented as zero).
    value: (d) => (d.sellingPriceNio == null ? -1 : toFiniteNumber(d.sellingPriceNio)),
  },
  {
    key: "margin",
    label: "Margen",
    value: (d) => (d.grossMarginNio == null ? -1 : toFiniteNumber(d.grossMarginNio)),
  },
  {
    key: "marginPct",
    label: "Margen %",
    value: (d) => (d.grossMarginPct == null ? -1 : toFiniteNumber(d.grossMarginPct)),
  },
];

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

/** §13: search reflects how the operator knows the dish — by name, or by the
 * ingredient that carries its cost. */
function matchesSearch(dish: DishMargin, term: string): boolean {
  if (dish.productName.toLowerCase().includes(term)) return true;
  return (dish.components ?? []).some((component) =>
    (component.ingredientName ?? "").toLowerCase().includes(term),
  );
}

export function DishMarginsPage() {
  const { data, isLoading, isError } = useDishMargins();
  const [search, setSearch] = useState("");
  // The default sort answers the page's operational job: what does this dish
  // cost, cheapest first (§15).
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const term = search.trim().toLowerCase();

  const visibleDishes = useMemo(() => {
    const dishes = (data?.dishes ?? []).filter(
      (dish) => !term || matchesSearch(dish, term),
    );
    const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
    const direction = sortDir === "asc" ? 1 : -1;
    return [...dishes].sort((a, b) => {
      const left = sort.value(a);
      const right = sort.value(b);
      if (typeof left === "string" || typeof right === "string") {
        return String(left).localeCompare(String(right)) * direction;
      }
      if (left === right) {
        // Deterministic tie-break: the name (§15).
        return a.productName.localeCompare(b.productName);
      }
      return (left - right) * direction;
    });
  }, [data, term, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(visibleDishes.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = visibleDishes.slice(start, start + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

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

  const skipped = data.skipped;
  const hasDishes = data.dishes.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Costo y margen por plato</h1>
        <p className="text-sm text-muted-foreground">
          Costo teórico a partir del costo promedio actual de cada ingrediente
          y de la receta vigente del plato.
        </p>
      </header>

      {/* §7.4: the exception carries its own weight and a next step; a fully
        priced catalog says nothing (§+1.13). */}
      {skipped.length > 0 && (
        <Alert variant="warning" data-testid="dish-margins-attention">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>
            {skipped.length} {skipped.length === 1 ? "plato sin costo" : "platos sin costo"}
          </AlertTitle>
          <AlertDescription>
            <ul className="space-y-1">
              {skipped.map((skip) => (
                <li key={skip.productId}>
                  <span className="font-medium text-foreground">
                    {skip.productName}
                  </span>
                  {": "}
                  {skip.reason}
                </li>
              ))}
            </ul>
            <Link
              to="/recipes"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium underline-offset-4 hover:underline"
            >
              <ChefHat className="h-3.5 w-3.5" />
              Ir a Recetas
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {!hasDishes && skipped.length === 0 ? (
        // §29 first-use empty: what belongs here, why it matters, next action.
        <EmptyState
          title="Todavía no hay platos para valuar"
          description="Cada plato con una receta publicada aparece aquí con su costo y su margen."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/recipes">Crear la primera receta</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Platos</CardTitle>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Label
                htmlFor="dish-margins-search"
                className="sr-only"
              >
                Buscar plato o ingrediente
              </Label>
              <Input
                id="dish-margins-search"
                data-testid="dish-margins-search"
                placeholder="Buscar por plato o ingrediente…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="pl-9 pr-8 text-sm"
              />
              {search && (
                <button
                  type="button"
                  data-testid="dish-margins-search-clear"
                  aria-label="Limpiar búsqueda"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {paged.length === 0 ? (
              // §13.2: objects exist, the query returned none — say which, and
              // keep the clear affordance where the query lives (the inline X
              // above), the same contract the purchases list already uses.
              <EmptyState
                title={`No se encontraron platos para “${search}”`}
                description="Pruebe con otro nombre de plato o de ingrediente."
                icon={AlertTriangle}
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {SORTS.map((sort) => (
                        <TableHead
                          key={sort.key}
                          className={sort.key === "name" ? undefined : "text-right"}
                          aria-sort={
                            sort.key === sortKey
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(sort.key)}
                            className="inline-flex items-center gap-1 font-medium hover:text-foreground text-muted-foreground cursor-pointer"
                          >
                            {sort.label}
                            {sort.key === sortKey && (
                              <span aria-hidden="true">
                                {sortDir === "asc" ? "↑" : "↓"}
                              </span>
                            )}
                          </button>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((dish) => {
                      const negative =
                        dish.grossMarginNio != null &&
                        toFiniteNumber(dish.grossMarginNio) < 0;
                      return (
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
                          <TableCell
                            className={`text-right tabular-nums ${negative ? "text-destructive" : ""}`}
                          >
                            {dish.grossMarginNio == null
                              ? "—"
                              : formatCurrency(toFiniteNumber(dish.grossMarginNio))}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${negative ? "text-destructive" : ""}`}
                          >
                            {dish.grossMarginPct == null
                              ? "—"
                              : formatPercent(toFiniteNumber(dish.grossMarginPct))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between gap-3 pt-3">
                  <span className="text-xs text-muted-foreground">
                    Mostrando {start + 1}–{start + paged.length} de{" "}
                    {visibleDishes.length} platos
                  </span>
                  {totalPages > 1 && (
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Siguiente
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
