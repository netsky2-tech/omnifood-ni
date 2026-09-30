import { useEffect, useMemo, useRef, useState } from "react";
import { useInsumos } from "@/features/recipes/use-recipes";
import {
  useSuppliers,
  useCreateSupplier,
  useCreateManualPurchase,
} from "./use-inventory-reports";
import { fetchPurchasePreview } from "./inventory-api";
import type { ManualPurchaseInput, PurchasePreviewResult } from "./types";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Plus } from "lucide-react";

const todayIso = () => new Date().toISOString().slice(0, 10);

interface PurchaseFormState {
  supplierId: string;
  insumoId: string;
  quantity: string;
  unitCost: string;
  currency: "NIO" | "USD";
  bcnRate: string;
  invoiceDate: string;
  invoiceNumber: string;
  lotCode: string;
  receivedDate: string;
  expirationDate: string;
}

const defaultForm = (): PurchaseFormState => ({
  supplierId: "",
  insumoId: "",
  quantity: "",
  unitCost: "",
  currency: "NIO",
  bcnRate: "",
  invoiceDate: todayIso(),
  invoiceNumber: "",
  lotCode: "",
  receivedDate: "",
  expirationDate: "",
});

/**
 * Manual purchase registration for the Compras tab (SOHO purchases).
 *
 * Human web entry of a received/known purchase — NO purchase-order
 * lifecycle; physical receiving stays on the POS. The submit reuses the
 * backend `POST /inventory/purchases/manual` human route, which delegates to
 * `recordPurchase` (SERIALIZABLE, kardex, batch tracking, CPP).
 *
 * §49 (+1.7 honesty): the live CPP preview (existing human route
 * `POST /inventory/purchase`) gates the submit — the button stays disabled
 * until the preview resolved for the current inputs, or the user explicitly
 * acknowledges registering without a projected cost.
 */
export function PurchasesForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: insumos, isLoading: insumosLoading } = useInsumos();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const createPurchase = useCreateManualPurchase();

  const [form, setForm] = useState<PurchaseFormState>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [supplierCreateOpen, setSupplierCreateOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [preview, setPreview] = useState<PurchasePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAcked, setPreviewAcked] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const previewSeqRef = useRef(0);

  const supplierList = suppliers ?? [];
  const insumoList = insumos ?? [];
  const selectedInsumo = insumoList.find((i) => i.id === form.insumoId);
  const isPerishable = Boolean(selectedInsumo?.is_perishable);
  const isUsd = form.currency === "USD";

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.focus();
    }
  }, [formError]);

  // Auto-open the inline supplier creation when the catalog comes back empty:
  // the purchase cannot be saved without a supplier.
  useEffect(() => {
    if (!suppliersLoading && open && supplierList.length === 0) {
      setSupplierCreateOpen(true);
    }
  }, [suppliersLoading, open, supplierList.length]);

  const quantity = Number(form.quantity);
  const unitCost = Number(form.unitCost);
  const bcnRate = Number(form.bcnRate);

  /** Client-side validation mirror of the backend ManualPurchaseDto rules. */
  const validationError = useMemo((): string | null => {
    if (!form.supplierId) return "Selecciona el proveedor de la compra.";
    if (!form.insumoId) return "Selecciona el insumo comprado.";
    if (!form.quantity.trim() || Number.isNaN(quantity) || quantity <= 0)
      return "La cantidad debe ser mayor que 0.";
    if (!form.unitCost.trim() || Number.isNaN(unitCost) || unitCost <= 0)
      return "El costo unitario debe ser mayor que 0.";
    if (!form.invoiceNumber.trim())
      return "Ingresa el número de factura de la compra.";
    if (!form.invoiceDate) return "Ingresa la fecha de la factura.";
    if (isUsd && (!form.bcnRate.trim() || Number.isNaN(bcnRate) || bcnRate <= 0))
      return "Las compras en USD requieren la tasa de cambio del BCN.";
    if (isPerishable) {
      if (!form.lotCode.trim()) return "Los insumos perecederos requieren el código de lote.";
      if (!form.receivedDate)
        return "Los insumos perecederos requieren la fecha de recepción.";
      if (!form.expirationDate)
        return "Los insumos perecederos requieren la fecha de vencimiento.";
    }
    return null;
  }, [form, quantity, unitCost, bcnRate, isUsd, isPerishable]);

  /** Payload for the live CPP preview (no batch fields needed for preview). */
  const previewPayload = useMemo((): ManualPurchaseInput | null => {
    if (!form.supplierId || !form.insumoId) return null;
    if (!form.quantity.trim() || Number.isNaN(quantity) || quantity <= 0)
      return null;
    if (!form.unitCost.trim() || Number.isNaN(unitCost) || unitCost <= 0)
      return null;
    if (!form.invoiceNumber.trim() || !form.invoiceDate) return null;
    if (
      isUsd &&
      (!form.bcnRate.trim() || Number.isNaN(bcnRate) || bcnRate <= 0)
    )
      return null;

    return {
      insumoId: form.insumoId,
      supplierId: form.supplierId,
      invoiceNumber: form.invoiceNumber.trim(),
      quantity,
      unitCost,
      currency: form.currency,
      invoiceDate: form.invoiceDate,
      entryTimestamp: new Date().toISOString(),
      fxRateMode: isUsd ? "explicit" : undefined,
      bcnRate: isUsd ? bcnRate : undefined,
    };
  }, [form, quantity, unitCost, bcnRate, isUsd]);

  const previewKey = previewPayload
    ? JSON.stringify([
        previewPayload.insumoId,
        previewPayload.supplierId,
        previewPayload.invoiceNumber,
        previewPayload.quantity,
        previewPayload.unitCost,
        previewPayload.currency,
        previewPayload.invoiceDate,
        previewPayload.bcnRate,
      ])
    : null;

  // Live CPP preview: whenever the previewable inputs settle into a valid
  // payload, fetch the projection. Any change to a PREVIEW-RELEVANT input
  // invalidates the previous result and the explicit "register without
  // preview" acknowledgement.
  //
  // Contract note (§49 +1.7 honesty): the backend preview DTO
  // (`POST /inventory/purchase` → `buildPreview`) consumes ONLY insumoId,
  // quantity, unitCost, currency, invoiceDate and the BCN rate inputs — the
  // cost math never reads the batch fields (lotCode, receivedDate,
  // expirationDate). `previewKey` therefore intentionally excludes them:
  // toggling a batch field must NOT refetch the preview and must NOT clear a
  // resolved preview or `previewAcked` (pinned by test).
  useEffect(() => {
    setPreviewAcked(false);
    if (!previewPayload) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    const seq = ++previewSeqRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    fetchPurchasePreview(previewPayload)
      .then((result) => {
        if (previewSeqRef.current !== seq) return;
        setPreview(result);
        setPreviewLoading(false);
      })
      .catch((err: unknown) => {
        if (previewSeqRef.current !== seq) return;
        setPreview(null);
        setPreviewLoading(false);
        setPreviewError(
          getApiErrorMessage(
            err,
            "No se pudo calcular el costo proyectado. Verifica los datos e intenta de nuevo.",
          ),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  /** §49 gate: submit only with a resolved preview for the CURRENT inputs,
   *  or an explicit acknowledgement when the preview is unavailable. */
  const canSubmit = !validationError && !previewLoading && (preview !== null || previewAcked);

  const handleSubmit = async () => {
    setFormError(null);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (!previewPayload) return;

    try {
      await createPurchase.mutateAsync({
        ...previewPayload,
        lotCode: isPerishable ? form.lotCode.trim() : undefined,
        receivedDate: isPerishable ? form.receivedDate : undefined,
        expirationDate: isPerishable ? form.expirationDate : undefined,
      });
      toast({
        title: "Compra registrada",
        description: "La compra aparece en el historial con su costo proyectado.",
      });
      // §19.3: multiple purchases are common — reset for the next one but
      // keep the panel open.
      setForm(defaultForm());
      setPreview(null);
      setPreviewError(null);
      setPreviewAcked(false);
    } catch (err: unknown) {
      setFormError(
        getApiErrorMessage(err, "No se pudo registrar la compra. Intenta de nuevo."),
      );
    }
  };

  const handleCreateSupplier = async () => {
    setFormError(null);
    if (!newSupplierName.trim()) {
      setFormError("Ingresa el nombre del nuevo proveedor.");
      return;
    }
    try {
      const created = await createSupplier.mutateAsync({
        name: newSupplierName.trim(),
      });
      toast({
        title: "Proveedor creado",
        description: `'${created.name}' ya está disponible para registrar compras.`,
      });
      setNewSupplierName("");
      setSupplierCreateOpen(false);
      setForm((prev) => ({ ...prev, supplierId: created.id }));
    } catch (err: unknown) {
      setFormError(
        getApiErrorMessage(err, "No se pudo crear el proveedor. Intenta de nuevo."),
      );
    }
  };

  const closeDialog = (next: boolean) => {
    if (!next) {
      setFormError(null);
      setForm(defaultForm());
      setPreview(null);
      setPreviewError(null);
      setPreviewAcked(false);
      setSupplierCreateOpen(false);
      setNewSupplierName("");
    }
    onOpenChange(next);
  };

  const submitting = createPurchase.isPending;

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Registrar compra</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registra una compra ya recibida con su factura: actualiza el
              stock y el costo promedio (CPP) del insumo. La recepción física
              sigue gestionándose en el POS.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              data-testid="purchases-form-error"
              className="p-3 text-xs bg-destructive/10 text-destructive rounded-md border border-destructive/20 flex items-start gap-2 focus-visible:outline-none"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-3 text-sm">
            {/* Proveedor */}
            <div className="space-y-1">
              <Label htmlFor="purchase_supplier" className="text-xs">
                Proveedor *
              </Label>
              <Select
                // Always controlled: Radix renders the placeholder for an
                // empty-string value, so the reset path never flips the root
                // into uncontrolled mode (which would keep the last item).
                value={form.supplierId}
                onValueChange={(value) => {
                  // Radix's hidden form-control mirror synthesizes a change
                  // event on programmatic value changes; with a never-opened
                  // dropdown it cannot represent the new value and reports
                  // "" — never a real option (Radix forbids empty item
                  // values), so ignore it. Functional update avoids stale
                  // closure clobbers from that synthetic event.
                  if (!value) return;
                  setForm((prev) => ({ ...prev, supplierId: value }));
                }}
              >
                <SelectTrigger
                  id="purchase_supplier"
                  data-testid="purchases-form-supplier"
                  className="text-xs h-9"
                  aria-label="Proveedor de la compra"
                >
                  <SelectValue
                    placeholder={
                      suppliersLoading
                        ? "Cargando proveedores..."
                        : "Seleccione proveedor"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {supplierList.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplierCreateOpen ? (
                <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-2">
                  <Label htmlFor="purchase_supplier_new" className="text-xs">
                    Nuevo proveedor (solo el nombre es obligatorio)
                  </Label>
                  <Input
                    id="purchase_supplier_new"
                    data-testid="purchases-supplier-create-name"
                    placeholder="Ej: Distribuidora Nica"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid="purchases-supplier-create-btn"
                      disabled={createSupplier.isPending}
                      onClick={() => void handleCreateSupplier()}
                      className="h-7 text-xs"
                    >
                      {createSupplier.isPending ? "Creando..." : "Crear proveedor"}
                    </Button>
                    {supplierList.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSupplierCreateOpen(false)}
                        className="h-7 text-xs"
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="purchases-supplier-create-toggle"
                  onClick={() => setSupplierCreateOpen(true)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  Crear proveedor nuevo
                </button>
              )}
            </div>

            {/* Insumo */}
            <div className="space-y-1">
              <Label htmlFor="purchase_insumo" className="text-xs">
                Insumo *
              </Label>
              <Select
                value={form.insumoId}
                onValueChange={(value) => {
                  // See the supplier select: ignore Radix's synthetic "".
                  if (!value) return;
                  setForm((prev) => ({ ...prev, insumoId: value }));
                }}
              >
                <SelectTrigger
                  id="purchase_insumo"
                  data-testid="purchases-form-insumo"
                  className="text-xs h-9"
                  aria-label="Insumo comprado"
                >
                  <SelectValue
                    placeholder={
                      insumosLoading
                        ? "Cargando insumos..."
                        : "Seleccione insumo"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {insumoList.map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-xs">
                      {i.name}
                      {i.is_perishable ? " (perecedero)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="purchase_quantity" className="text-xs">
                  Cantidad *
                </Label>
                <Input
                  id="purchase_quantity"
                  data-testid="purchases-form-quantity"
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="0.00"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="purchase_unit_cost" className="text-xs">
                  Costo unitario *
                </Label>
                <Input
                  id="purchase_unit_cost"
                  data-testid="purchases-form-unit-cost"
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="0.00"
                  value={form.unitCost}
                  onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="purchase_currency" className="text-xs">
                  Moneda *
                </Label>
                <Select
                  value={form.currency}
                  onValueChange={(value) => {
                    // See the supplier select: ignore Radix's synthetic "".
                    if (!value) return;
                    setForm((prev) => ({
                      ...prev,
                      currency: value === "USD" ? "USD" : "NIO",
                    }));
                  }}
                >
                  <SelectTrigger
                    id="purchase_currency"
                    data-testid="purchases-form-currency"
                    className="text-xs h-9"
                    aria-label="Moneda de la compra"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NIO" className="text-xs">
                      NIO (Córdobas)
                    </SelectItem>
                    <SelectItem value="USD" className="text-xs">
                      USD (Dólares)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isUsd && (
                <div className="space-y-1">
                  <Label htmlFor="purchase_bcn_rate" className="text-xs">
                    Tasa BCN (C$ por US$) *
                  </Label>
                  <Input
                    id="purchase_bcn_rate"
                    data-testid="purchases-form-bcn-rate"
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="Ej: 36.80"
                    value={form.bcnRate}
                    onChange={(e) => setForm({ ...form, bcnRate: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="purchase_invoice_date" className="text-xs">
                  Fecha de factura *
                </Label>
                <Input
                  id="purchase_invoice_date"
                  data-testid="purchases-form-invoice-date"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) =>
                    setForm({ ...form, invoiceDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="purchase_invoice_number" className="text-xs">
                  Número de factura *
                </Label>
                <Input
                  id="purchase_invoice_number"
                  data-testid="purchases-form-invoice-number"
                  placeholder="Ej: F-00123"
                  value={form.invoiceNumber}
                  onChange={(e) =>
                    setForm({ ...form, invoiceNumber: e.target.value })
                  }
                />
              </div>
            </div>

            {isPerishable && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Insumo perecedero: el backend exige lote y vencimiento para
                  el control FIFO.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="purchase_lot" className="text-xs">
                    Lote *
                  </Label>
                  <Input
                    id="purchase_lot"
                    data-testid="purchases-form-lot"
                    placeholder="Ej: L-2026-01"
                    value={form.lotCode}
                    onChange={(e) =>
                      setForm({ ...form, lotCode: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="purchase_received" className="text-xs">
                      Fecha de recepción *
                    </Label>
                    <Input
                      id="purchase_received"
                      data-testid="purchases-form-received"
                      type="date"
                      value={form.receivedDate}
                      onChange={(e) =>
                        setForm({ ...form, receivedDate: e.target.value })
                      }
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="purchase_expiration" className="text-xs">
                      Fecha de vencimiento *
                    </Label>
                    <Input
                      id="purchase_expiration"
                      data-testid="purchases-form-expiration"
                      type="date"
                      value={form.expirationDate}
                      onChange={(e) =>
                        setForm({ ...form, expirationDate: e.target.value })
                      }
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Live CPP preview (§49 +1.7): never submit blind. */}
            <div
              data-testid="purchases-form-preview"
              className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1"
            >
              <p className="font-medium">Costo proyectado (CPP)</p>
              {previewLoading && (
                <p className="text-muted-foreground">
                  Calculando el costo proyectado...
                </p>
              )}
              {!previewLoading && preview && (
                <div className="space-y-0.5">
                  <p data-testid="purchases-preview-cpp">
                    Costo promedio:{" "}
                    <span className="tabular-nums">
                      C${preview.previousCppNio.toFixed(2)}
                    </span>{" "}
                    →{" "}
                    <span
                      className="tabular-nums font-semibold"
                      data-testid="purchases-preview-projected"
                    >
                      C${preview.projectedCppNio.toFixed(2)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Stock: {preview.previousStock} → {preview.projectedStock} ·
                    Tasa BCN: {preview.bcnRate} ({preview.bcnRateSource})
                  </p>
                </div>
              )}
              {!previewLoading && previewError && (
                <div className="space-y-2">
                  <p role="alert" className="text-destructive">
                    {previewError}
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="purchases-form-ack"
                      checked={previewAcked}
                      onChange={(e) => setPreviewAcked(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>
                      Registrar la compra sin verificación de costo proyectado
                    </span>
                  </label>
                </div>
              )}
              {!previewPayload && !previewLoading && !previewError && (
                <p className="text-muted-foreground">
                  Completa proveedor, insumo, cantidad, costo y factura para
                  calcular el costo proyectado.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => closeDialog(false)}
              className="text-xs h-8"
            >
              Cerrar
            </Button>
            <Button
              type="submit"
              data-testid="purchases-form-submit"
              disabled={!canSubmit || submitting}
              className="text-xs h-8 min-w-[10rem]"
            >
              {submitting
                ? "Registrando..."
                : previewLoading
                  ? "Calculando preview..."
                  : "Registrar compra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
