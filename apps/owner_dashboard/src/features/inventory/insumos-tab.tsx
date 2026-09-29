import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateInsumo, useUpdateInsumo } from "@/features/recipes/use-recipes";
import type { Insumo, CreateInsumoInput } from "@/features/recipes/types";
import { api } from "@/lib/api";
import { useTenantId } from "@/lib/tenant";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Edit2,
  Package,
  Layers,
  AlertTriangle,
  Scale,
  X,
  Power,
  PowerOff,
} from "lucide-react";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 4,
  }).format(n);
}

/**
 * Dashboard catalog query: includes inactive insumos so the lifecycle is
 * visible and controllable (deactivate/reactivate row actions). Child of the
 * shared `insumosQueryKey` prefix, so create/update mutations automatically
 * invalidate it. The recipes editor keeps using the active-only `useInsumos`.
 */
function useDashboardInsumos() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["recipes", tenantId, "insumos", "dashboard-with-inactive"],
    queryFn: ({ signal }) => api.get<Insumo[]>("/insumos?includeInactive=true", { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

interface InsumoFormState {
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  conversionFactor: string;
  averageCost: string;
  parLevel: string;
  minStock: string;
  is_perishable: boolean;
  negativeStockPolicy: "ALLOW_TEMPORARY" | "RESTRICT";
}

const DEFAULT_FORM: InsumoFormState = {
  name: "",
  purchaseUom: "UN",
  consumptionUom: "UN",
  conversionFactor: "1",
  averageCost: "0",
  parLevel: "",
  minStock: "",
  is_perishable: false,
  negativeStockPolicy: "RESTRICT",
};

const FACTOR_ERROR = "El factor de conversión debe ser mayor que 0.";

function formsEqual(a: InsumoFormState, b: InsumoFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function InsumosTab() {
  const { data: insumos, isLoading } = useDashboardInsumos();
  const createInsumo = useCreateInsumo();
  const updateInsumo = useUpdateInsumo();

  const [searchParams, setSearchParams] = useSafeSearchParams();
  const [searchTerm, setSearchTerm] = useState(
    () => searchParams.get("q_insumos") ?? "",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInsumo, setEditingInsumo] = useState<Insumo | null>(null);
  const [form, setForm] = useState<InsumoFormState>(DEFAULT_FORM);
  const [initialForm, setInitialForm] = useState<InsumoFormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [factorError, setFactorError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const allowCloseRef = useRef(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Insumo | null>(null);

  const isDirty = !formsEqual(form, initialForm);
  const saving = createInsumo.isPending || updateInsumo.isPending;

  // Form-level errors are announced (role="alert") and focused so keyboard
  // and screen-reader users land on the explanation (§18.3).
  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.focus();
    }
  }, [formError]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) {
          next.set("q_insumos", value);
        } else {
          next.delete("q_insumos");
        }
        return next;
      },
      { replace: true },
    );
  };

  const filteredInsumos = useMemo(() => {
    if (!insumos) return [];
    if (!searchTerm.trim()) return insumos;
    const term = searchTerm.toLowerCase();
    return insumos.filter(
      (ins) =>
        ins.name.toLowerCase().includes(term) ||
        (ins.purchaseUom || "").toLowerCase().includes(term) ||
        (ins.consumptionUom || ins.consumption_uom || "").toLowerCase().includes(term),
    );
  }, [insumos, searchTerm]);

  // Stats scope the active catalog; inactive rows are lifecycle context, not
  // operating stock.
  const stats = useMemo(() => {
    const active = (insumos ?? []).filter((i) => i.is_active);
    return {
      total: active.length,
      perishable: active.filter((i) => i.is_perishable).length,
      lowStock: active.filter((i) => i.parLevel && i.stock <= i.parLevel).length,
    };
  }, [insumos]);

  const closeDialog = () => {
    allowCloseRef.current = false;
    setDiscardConfirmOpen(false);
    setModalOpen(false);
    setFormError(null);
    setFactorError(null);
  };

  /** Guarded close: prompts before discarding unsaved edits (§20). */
  const requestClose = () => {
    if (isDirty && !allowCloseRef.current) {
      setDiscardConfirmOpen(true);
      return;
    }
    closeDialog();
  };

  const handleOpenCreate = () => {
    setEditingInsumo(null);
    setForm(DEFAULT_FORM);
    setInitialForm(DEFAULT_FORM);
    setFormError(null);
    setFactorError(null);
    allowCloseRef.current = false;
    setDiscardConfirmOpen(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (insumo: Insumo) => {
    setEditingInsumo(insumo);
    const values: InsumoFormState = {
      name: insumo.name,
      purchaseUom: insumo.purchaseUom || insumo.consumption_uom || "UN",
      consumptionUom: insumo.consumptionUom || insumo.consumption_uom || "UN",
      conversionFactor: String(insumo.conversionFactor ?? 1),
      averageCost: String(insumo.averageCost ?? 0),
      parLevel: insumo.parLevel != null ? String(insumo.parLevel) : "",
      minStock: insumo.minStock != null ? String(insumo.minStock) : "",
      is_perishable: insumo.is_perishable ?? false,
      negativeStockPolicy: (insumo.negativeStockPolicy === "ALLOW_TEMPORARY"
        ? "ALLOW_TEMPORARY"
        : "RESTRICT"),
    };
    setForm(values);
    setInitialForm(values);
    setFormError(null);
    setFactorError(null);
    allowCloseRef.current = false;
    setDiscardConfirmOpen(false);
    setModalOpen(true);
  };

  const handleFactorBlur = () => {
    const factor = Number(form.conversionFactor);
    if (!form.conversionFactor.trim() || Number.isNaN(factor) || factor <= 0) {
      setFactorError(FACTOR_ERROR);
    } else {
      setFactorError(null);
    }
  };

  const submitForm = async (mode: "close" | "createAnother") => {
    setFormError(null);

    const name = form.name.trim();
    if (!name) {
      setFormError("El nombre del insumo es obligatorio.");
      return;
    }
    if (!form.purchaseUom.trim() || !form.consumptionUom.trim()) {
      setFormError("Las unidades de medida son obligatorias.");
      return;
    }
    const factor = Number(form.conversionFactor);
    if (!form.conversionFactor.trim() || Number.isNaN(factor) || factor <= 0) {
      // Field-level problem only: announcing it again in the form banner would
      // make screen readers read the same message twice (R1, §18.3). The
      // banner stays reserved for name/UoM/server failures.
      setFactorError(FACTOR_ERROR);
      return;
    }

    const payload: CreateInsumoInput = {
      name,
      purchaseUom: form.purchaseUom.trim().toUpperCase(),
      consumptionUom: form.consumptionUom.trim().toUpperCase(),
      conversionFactor: factor,
      averageCost: Number(form.averageCost) || 0,
      parLevel: form.parLevel.trim() === "" ? undefined : Number(form.parLevel),
      minStock: form.minStock.trim() === "" ? undefined : Number(form.minStock),
      is_perishable: form.is_perishable,
      negativeStockPolicy: form.negativeStockPolicy,
    };

    try {
      if (editingInsumo) {
        await updateInsumo.mutateAsync({
          id: editingInsumo.id,
          input: payload,
        });
        toast({
          title: "Insumo actualizado",
          description: `Se guardaron los cambios de '${name}'.`,
        });
        closeDialog();
      } else {
        await createInsumo.mutateAsync(payload);
        toast({
          title: "Insumo creado",
          description: `El insumo '${name}' ya está disponible para recetas e inventario.`,
        });
        if (mode === "createAnother") {
          // §19.3: reset for the next item but keep the dialog open.
          setForm(DEFAULT_FORM);
          setInitialForm(DEFAULT_FORM);
          setFormError(null);
          setFactorError(null);
        } else {
          closeDialog();
        }
      }
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, "Error al guardar el insumo"));
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget) return;
    try {
      await updateInsumo.mutateAsync({
        id: deactivateTarget.id,
        input: { is_active: false },
      });
      toast({
        title: "Insumo desactivado",
        description: `'${deactivateTarget.name}' ya no está disponible para recetas ni movimientos. Puedes reactivarlo cuando quieras.`,
      });
      setDeactivateTarget(null);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "No se pudo desactivar el insumo",
        description: getApiErrorMessage(
          err,
          "Intenta de nuevo en unos minutos.",
        ),
      });
    }
  };

  const handleReactivate = async (insumo: Insumo) => {
    try {
      await updateInsumo.mutateAsync({ id: insumo.id, input: { is_active: true } });
      toast({
        title: "Insumo reactivado",
        description: `'${insumo.name}' vuelve a estar disponible para recetas e inventario.`,
      });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "No se pudo reactivar el insumo",
        description: getApiErrorMessage(
          err,
          "Intenta de nuevo en unos minutos.",
        ),
      });
    }
  };

  if (isLoading) {
    return <LoadingState message="Cargando catálogo de materia prima e insumos..." />;
  }

  return (
    <div className="space-y-6" data-testid="insumos-tab-container">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Insumos"
          value={formatNumber(stats.total)}
          subtitle="Materia prima registrada"
        />
        <StatCard
          label="Perecederos (FIFO)"
          value={formatNumber(stats.perishable)}
          subtitle="Control de lotes y vencimiento"
        />
        <StatCard
          label="Alerta de Reposición"
          value={formatNumber(stats.lowStock)}
          accent={stats.lowStock > 0}
          subtitle="Bajo nivel PAR sugerido"
        />
      </div>

      {/* Actions and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="insumos-search-input"
            placeholder="Buscar insumo por nombre o unidad de medida..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 pr-8 text-sm"
          />
          {searchTerm && (
            <button
              type="button"
              data-testid="insumos-search-clear"
              aria-label="Limpiar búsqueda"
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          data-testid="add-insumo-btn"
          onClick={handleOpenCreate}
          className="gap-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Insumo
        </Button>
      </div>

      {/* Insumos Table */}
      {filteredInsumos.length === 0 ? (
        <EmptyState
          message={
            searchTerm
              ? `No se encontraron insumos con "${searchTerm}"`
              : "No hay insumos registrados aún. Comience agregando materia prima para sus recetas."
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-muted-foreground uppercase text-xs">
                  <th className="px-4 py-3 text-left font-semibold">Insumo</th>
                  <th className="px-4 py-3 text-left font-semibold">Unidades (Compra → Consumo)</th>
                  <th className="px-4 py-3 text-right font-semibold">Stock Actual</th>
                  <th className="px-4 py-3 text-right font-semibold">Costo Promedio</th>
                  <th className="px-4 py-3 text-right font-semibold">Nivel PAR</th>
                  <th className="px-4 py-3 text-center font-semibold">Propiedades</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInsumos.map((ins) => {
                  const consUom = ins.consumptionUom || ins.consumption_uom || "UN";
                  const purchUom = ins.purchaseUom || consUom;
                  const factor = ins.conversionFactor ?? 1;
                  const isLow = ins.parLevel && ins.stock <= ins.parLevel;

                  return (
                    <tr
                      key={ins.id}
                      data-testid={`insumo-row-${ins.id}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{ins.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-mono">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {purchUom}
                          </Badge>
                          <span>→</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {consUom}
                          </Badge>
                          {factor !== 1 && (
                            <span className="text-[11px] text-muted-foreground/80">
                              (1 {purchUom} = {factor} {consUom})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        <span className={isLow ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>
                          {formatNumber(ins.stock)} {consUom}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(ins.averageCost || 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {ins.parLevel ? `${formatNumber(ins.parLevel)} ${consUom}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {ins.is_perishable && (
                            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                              Perecedero
                            </Badge>
                          )}
                          {!ins.is_active && (
                            <Badge variant="destructive" className="text-[10px]">
                              Inactivo
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`edit-insumo-${ins.id}`}
                            aria-label="Editar insumo"
                            onClick={() => handleOpenEdit(ins)}
                            className="h-8 w-8 p-0"
                            title="Editar insumo"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {ins.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`deactivate-insumo-${ins.id}`}
                              aria-label="Desactivar insumo"
                              title="Desactivar insumo"
                              disabled={saving}
                              onClick={() => setDeactivateTarget(ins)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <PowerOff className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`reactivate-insumo-${ins.id}`}
                              aria-label="Reactivar insumo"
                              title="Reactivar insumo"
                              disabled={saving}
                              onClick={() => handleReactivate(ins)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Insumo Creation / Editing Modal */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) {
            requestClose();
          } else {
            setModalOpen(true);
          }
        }}
      >
        <DialogContent
          className="max-w-md"
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              setDiscardConfirmOpen(true);
            }
          }}
          onInteractOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setDiscardConfirmOpen(true);
            }
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitForm("close");
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                {editingInsumo ? "Editar Insumo" : "Nuevo Insumo de Materia Prima"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Configure la materia prima utilizada en las recetas de producción y ventas.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                data-testid="insumo-form-error"
                className="p-3 text-xs bg-destructive/10 text-destructive rounded-md border border-destructive/20 flex items-start gap-2 focus-visible:outline-none"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label htmlFor="insumo_name" className="text-xs">
                  Nombre del Insumo *
                </Label>
                <Input
                  id="insumo_name"
                  data-testid="insumo-form-name"
                  placeholder="Ej: Café en Grano, Leche Entera, Harina..."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="purchase_uom" className="text-xs">
                    UoM Compra *
                  </Label>
                  <Input
                    id="purchase_uom"
                    data-testid="insumo-form-purchase-uom"
                    placeholder="Ej: LB, L, DOCENA, KG"
                    value={form.purchaseUom}
                    onChange={(e) => setForm({ ...form, purchaseUom: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="consumption_uom" className="text-xs">
                    UoM Consumo *
                  </Label>
                  <Input
                    id="consumption_uom"
                    data-testid="insumo-form-consumption-uom"
                    placeholder="Ej: G, ML, UN"
                    value={form.consumptionUom}
                    onChange={(e) => setForm({ ...form, consumptionUom: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="conversion_factor" className="text-xs flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                    Factor Conversión *
                  </Label>
                  <Input
                    id="conversion_factor"
                    data-testid="insumo-form-conversion-factor"
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="1 Compra = N Consumo"
                    value={form.conversionFactor}
                    onChange={(e) => {
                      // Keep the raw string: no silent coercion while typing.
                      setForm({ ...form, conversionFactor: e.target.value });
                      if (factorError) setFactorError(null);
                    }}
                    onBlur={handleFactorBlur}
                    aria-invalid={factorError ? true : undefined}
                  />
                  {factorError && (
                    <p className="text-[10px] text-destructive" role="alert">
                      {factorError}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Ej: 1 L = 1000 ML (factor 1000)
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="average_cost" className="text-xs">
                    Costo Promedio (C$)
                  </Label>
                  <Input
                    id="average_cost"
                    data-testid="insumo-form-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.averageCost}
                    onChange={(e) => setForm({ ...form, averageCost: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="par_level" className="text-xs">
                    Nivel PAR (Reposición)
                  </Label>
                  <Input
                    id="par_level"
                    data-testid="insumo-form-par-level"
                    type="number"
                    step="any"
                    placeholder="Opcional"
                    value={form.parLevel}
                    onChange={(e) => setForm({ ...form, parLevel: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="min_stock" className="text-xs">
                    Stock Mínimo Alerta
                  </Label>
                  <Input
                    id="min_stock"
                    data-testid="insumo-form-min-stock"
                    type="number"
                    step="any"
                    placeholder="Opcional"
                    value={form.minStock}
                    onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_perishable"
                  data-testid="insumo-form-perishable"
                  checked={form.is_perishable}
                  onChange={(e) => setForm({ ...form, is_perishable: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <Label htmlFor="is_perishable" className="text-xs font-normal cursor-pointer">
                  Materia prima perecedera (gestión estricta por lotes FIFO)
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestClose}
                className="text-xs h-8"
              >
                Cancelar
              </Button>
              {!editingInsumo && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="insumo-form-save-another"
                  disabled={saving}
                  onClick={() => submitForm("createAnother")}
                  className="text-xs h-8"
                >
                  Guardar y crear otro
                </Button>
              )}
              <Button
                type="submit"
                data-testid="insumo-form-submit"
                disabled={saving}
                className="text-xs h-8 min-w-[9rem]"
              >
                {saving
                  ? "Guardando..."
                  : editingInsumo
                  ? "Guardar Cambios"
                  : "Crear Insumo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dirty-state confirm (§20): Escape/overlay/Cancelar with unsaved edits. */}
      <Dialog
        open={discardConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setDiscardConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Descartar los cambios del insumo?</DialogTitle>
            <DialogDescription>
              Hay cambios sin guardar en el formulario. Si sales ahora, se perderán.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="insumo-discard-stay-btn"
              onClick={() => setDiscardConfirmOpen(false)}
              className="text-xs h-8"
            >
              Seguir editando
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="insumo-discard-confirm-btn"
              onClick={() => {
                allowCloseRef.current = true;
                closeDialog();
              }}
              className="text-xs h-8"
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivation confirm (§23.1): object, consequence, reversibility, scope. */}
      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              ¿Desactivar el insumo '{deactivateTarget?.name}'?
            </DialogTitle>
            <DialogDescription>
              El insumo dejará de estar disponible para recetas y movimientos de
              inventario. Puedes reactivarlo en cualquier momento desde esta misma tabla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              className="text-xs h-8"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="insumo-deactivate-confirm-btn"
              disabled={saving}
              onClick={handleDeactivateConfirm}
              className="text-xs h-8"
            >
              Desactivar insumo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
