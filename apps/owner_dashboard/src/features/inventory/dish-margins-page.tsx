import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChefHat, Search, X } from "lucide-react";
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

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Plato" },
  { key: "cost", label: "Costo unitario" },
  { key: "price", label: "Precio" },
  { key: "margin", label: "Margen" },
  { key: "marginPct", label: "Margen %" },
];

// An unpriced price or margin sorts below every priced one: it is missing,
// never zero (AP-02).
const SORT_VALUE: Record<SortKey, (dish: DishMargin) => number | string> = {
  name: (dish) => dish.productName.toLowerCase(),
  cost: (dish) => toFiniteNumber(dish.unitTheoreticalCostNio),
  price: (dish) => (dish.sellingPriceNio == null ? -1 : toFiniteNumber(dish.sellingPriceNio)),
  margin: (dish) => (dish.grossMarginNio == null ? -1 : toFiniteNumber(dish.grossMarginNio)),
  marginPct: (dish) =>
    dish.grossMarginPct == null ? -1 : toFiniteNumber(dish.grossMarginPct),
};

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
    const value = SORT_VALUE[sortKey];
    const direction = sortDir === "asc" ? 1 : -1;
    return [...dishes].sort((a, b) => {
      const left = value(a);
      const right = value(b);
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
            <p
              className="text-xs text-muted-foreground"
              data-testid="dish-margins-scope"
            >
              {data.dishes.length} {data.dishes.length === 1 ? "plato valuado" : "platos valuados"}
              {skipped.length > 0 &&
                ` · ${skipped.length} ${skipped.length === 1 ? "sin costo" : "sin costo"}`}
            </p>
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
                placeholder="Buscar plato o ingrediente…"
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
                      {SORT_COLUMNS.map((sort) => (
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

{/* §7.4 + §42.1 + §46: the gap is a standing data condition, not a
        transient notification. It follows the Dashboard AttentionBand pattern
        (owner decision on this surface, S14): a quiet card whose severity
        travels as glyph + text in the AA-compliant amber-700, on the card
        surface — never a tinted Alert rectangle, never an assertive live
        region, and never colour as the only signal (AP-12). */}
      {skipped.length > 0 && (
        <Card data-testid="dish-margins-attention">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <span
                data-testid="dish-margins-attention-severity"
                className="font-medium text-amber-700 dark:text-amber-300"
              >
                <span aria-hidden="true" className="mr-1.5">
                  ▲
                </span>
                {skipped.length}{" "}
                {skipped.length === 1 ? "plato sin costo" : "platos sin costo"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* One line per dish: the block must not outgrow the table it
                is warning about (§8: the primary job keeps the fold). */}
            <ul className="space-y-1">
              {skipped.map((skip) => (
                <li
                  key={skip.productId}
                  data-testid={`dish-margins-skip-${skip.reasonCode}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-sm"
                >
                  <span className="font-medium">{skip.productName}</span>
                  <span className="text-xs text-muted-foreground">
                    {skip.reason}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to="/recipes"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <ChefHat className="h-4 w-4" />
              Ir a Recetas
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
