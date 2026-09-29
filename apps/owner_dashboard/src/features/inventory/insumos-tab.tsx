import { useState, useMemo } from "react";
import { useInsumos, useCreateInsumo, useUpdateInsumo } from "@/features/recipes/use-recipes";
import type { Insumo, CreateInsumoInput } from "@/features/recipes/types";
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

interface InsumoFormState {
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  conversionFactor: number;
  averageCost: number;
  parLevel: number | "";
  minStock: number | "";
  is_perishable: boolean;
  negativeStockPolicy: "ALLOW_TEMPORARY" | "RESTRICT";
}

const DEFAULT_FORM: InsumoFormState = {
  name: "",
  purchaseUom: "UN",
  consumptionUom: "UN",
  conversionFactor: 1,
  averageCost: 0,
  parLevel: "",
  minStock: "",
  is_perishable: false,
  negativeStockPolicy: "RESTRICT",
};

export function InsumosTab() {
  const { data: insumos, isLoading } = useInsumos();
  const createInsumo = useCreateInsumo();
  const updateInsumo = useUpdateInsumo();

  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInsumo, setEditingInsumo] = useState<Insumo | null>(null);
  const [form, setForm] = useState<InsumoFormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

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

  const stats = useMemo(() => {
    if (!insumos) return { total: 0, perishable: 0, lowStock: 0 };
    return {
      total: insumos.length,
      perishable: insumos.filter((i) => i.is_perishable).length,
      lowStock: insumos.filter((i) => i.parLevel && i.stock <= i.parLevel).length,
    };
  }, [insumos]);

  const handleOpenCreate = () => {
    setEditingInsumo(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (insumo: Insumo) => {
    setEditingInsumo(insumo);
    setForm({
      name: insumo.name,
      purchaseUom: insumo.purchaseUom || insumo.consumption_uom || "UN",
      consumptionUom: insumo.consumptionUom || insumo.consumption_uom || "UN",
      conversionFactor: insumo.conversionFactor ?? 1,
      averageCost: insumo.averageCost ?? 0,
      parLevel: insumo.parLevel ?? "",
      minStock: insumo.minStock ?? "",
      is_perishable: insumo.is_perishable ?? false,
      negativeStockPolicy: (insumo.negativeStockPolicy === "ALLOW_TEMPORARY"
        ? "ALLOW_TEMPORARY"
        : "RESTRICT"),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (form.conversionFactor <= 0) {
      setFormError("El factor de conversión debe ser mayor que 0.");
      return;
    }

    const payload: CreateInsumoInput = {
      name,
      purchaseUom: form.purchaseUom.trim().toUpperCase(),
      consumptionUom: form.consumptionUom.trim().toUpperCase(),
      conversionFactor: Number(form.conversionFactor),
      averageCost: Number(form.averageCost) || 0,
      parLevel: form.parLevel === "" ? undefined : Number(form.parLevel),
      minStock: form.minStock === "" ? undefined : Number(form.minStock),
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
      } else {
        await createInsumo.mutateAsync(payload);
        toast({
          title: "Insumo creado",
          description: `El insumo '${name}' ya está disponible para recetas e inventario.`,
        });
      }
      setModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar el insumo";
      setFormError(msg);
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-sm"
          />
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
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`edit-insumo-${ins.id}`}
                          onClick={() => handleOpenEdit(ins)}
                          className="h-8 w-8 p-0"
                          title="Editar insumo"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
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
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-md border border-destructive/20 flex items-start gap-2">
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
                    onChange={(e) =>
                      setForm({ ...form, conversionFactor: parseFloat(e.target.value) || 1 })
                    }
                  />
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
                    onChange={(e) =>
                      setForm({ ...form, averageCost: parseFloat(e.target.value) || 0 })
                    }
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
                    onChange={(e) =>
                      setForm({
                        ...form,
                        parLevel: e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                      })
                    }
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
                    onChange={(e) =>
                      setForm({
                        ...form,
                        minStock: e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                      })
                    }
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
                onClick={() => setModalOpen(false)}
                className="text-xs h-8"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                data-testid="insumo-form-submit"
                disabled={createInsumo.isPending || updateInsumo.isPending}
                className="text-xs h-8"
              >
                {createInsumo.isPending || updateInsumo.isPending
                  ? "Guardando..."
                  : editingInsumo
                  ? "Guardar Cambios"
                  : "Crear Insumo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
