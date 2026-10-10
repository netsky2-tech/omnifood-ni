import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Trash2 } from "lucide-react";
import {
  usePaginatedProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeactivateProduct,
} from "./use-product";
import {
  PRODUCT_TYPES,
  CREATE_TYPE_ANSWERS,
  productFormSchema,
  type ProductType,
  type StoredProductType,
  type Product,
  type ProductFormValues,
  type CreateProductInput,
} from "./product-types";
import { useCatalogValues } from "./use-catalog";
import type { CatalogType } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getApiErrorMessage } from "@/lib/api-error";
import { toFiniteNumber } from "@/lib/numeric";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";

type TabId = ProductType;

const TABS: { id: TabId; label: string }[] = PRODUCT_TYPES;

/** Reuses PRODUCT_TYPES labels; only the legacy stored value needs its own honest label. */
function storedTypeLabel(type: StoredProductType): string {
  return (
    PRODUCT_TYPES.find((t) => t.id === type)?.label ?? "Preparado (tipo heredado)"
  );
}

/**
 * Types whose recipe consumes ingredients and moves stock on sale, mirroring
 * the backend consumption effect set in
 * `apps/admin_backend/src/modules/inventory/sale-inventory-outcome.service.ts`.
 * Editing a product OUT of this set orphans its recipe (it stops consuming
 * ingredients and stops moving stock), so it requires explicit confirmation —
 * regardless of which non-recipe type is selected as the destination.
 */
const RECIPE_BEARING_TYPES = ["COMPOUND", "PREPARED"] as const;
type RecipeBearingType = (typeof RECIPE_BEARING_TYPES)[number];

function isRecipeBearingType(type: StoredProductType): type is RecipeBearingType {
  return (RECIPE_BEARING_TYPES as readonly string[]).includes(type);
}

function ProductTable({
  productType,
  onEdit,
  onDeactivate,
}: {
  productType: ProductType;
  onEdit: (product: Product) => void;
  onDeactivate: (product: Product) => void;
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = usePaginatedProducts({
    productType,
    includeInactive: true,
    page: currentPage,
    pageSize: PAGE_SIZE,
    search: search.trim() ? search.trim() : undefined,
  });

  if (isLoading && !data) return <LoadingState message="Cargando productos..." />;
  if (error) return <EmptyState message="Error al cargar productos" />;
  if (!data || (data.total === 0 && !search.trim()))
    return <EmptyState message="Sin productos en esta categoría" />;

  const paginated = data.data ?? [];
  const total = data.total ?? 0;
  const totalPages = data.totalPages ?? 1;
  const safePage = data.page ?? currentPage;

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 border-b border-border bg-muted/20">
        <Input
          placeholder="Buscar por nombre o UOM..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="max-w-xs h-9 text-xs"
          aria-label="Buscar productos"
        />
        <span className="text-xs text-muted-foreground">
          {search.trim()
            ? `Encontrados: ${total} productos`
            : `Total: ${total} productos`}
        </span>
      </div>

      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Nombre
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                UOM
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Precio
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Stock
              </th>
              <th className="px-4 py-3 text-center font-semibold uppercase text-xs text-muted-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                  No se encontraron productos coincidentes con "{search}"
                </td>
              </tr>
            ) : (
              paginated.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.uom}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                    C${toFiniteNumber(p.sellPrice).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {toFiniteNumber(p.stock).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={p.is_active ? "success" : "secondary"}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(p)}
                        className="h-8 px-2 text-primary"
                      >
                        <Edit2 className="h-3.5 w-3.5 mr-1" />
                        Editar
                      </Button>
                      {p.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeactivate(p)}
                          className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Desactivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
          <span className="text-xs text-muted-foreground">
            Página {safePage} de {totalPages}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 text-xs"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductDialog({
  productType,
  product,
  open,
  onClose,
  onCreated,
}: {
  productType: ProductType;
  product?: Product;
  open: boolean;
  onClose: () => void;
  /** Issue #618 (C2): called with the created type so the page can switch
   * to the tab that shows the new product. Display state only. */
  onCreated?: (type: ProductType) => void;
}) {
  const isEdit = !!product;
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const { data: uomValues } = useCatalogValues("UOM" as CatalogType, true);
  const { data: categoryValues } = useCatalogValues(
    "SALES_PRODUCT_CATEGORY" as CatalogType,
    true,
  );

  // Unit B (form sweep): the app owns validation through the zod schema in
  // product-types.ts (single source of operator feedback). The native HTML
  // constraints this dialog used to rely on (name: required + maxLength;
  // uom: required; sellPrice: step + min) only ran inside the browser's
  // constraint validation: the balloon replaced the app's Spanish inline
  // errors, and any submit not coming from the button (e.g. a programmatic
  // requestSubmit()) bypassed the guard entirely.
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      uom: product?.uom ?? "",
      sellPrice: product ? toFiniteNumber(product.sellPrice) : 0,
    },
  });
  const name = watch("name");
  const uom = watch("uom");
  const sellPrice = watch("sellPrice");

  const [categoryCode, setCategoryCode] = useState(
    product?.category_code ?? "",
  );
  const [isPerishable, setIsPerishable] = useState(
    product?.is_perishable ?? false,
  );
  const [editType, setEditType] = useState<StoredProductType>(
    product?.product_type ?? productType,
  );
  // Issue #618: creation must ask whether the item is prepared with
  // ingredients instead of inheriting the active tab's type. No default:
  // `null` means unanswered, which blocks submit until answered.
  const [createTypeAnswer, setCreateTypeAnswer] = useState<ProductType | null>(
    null,
  );
  const [awaitingTypeChangeConfirm, setAwaitingTypeChangeConfirm] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const isDirty = isEdit
    ? name !== (product?.name ?? "") ||
      uom !== (product?.uom ?? "") ||
      categoryCode !== (product?.category_code ?? "") ||
      sellPrice !== (product ? toFiniteNumber(product.sellPrice) : 0) ||
      isPerishable !== (product?.is_perishable ?? false) ||
      editType !== (product?.product_type ?? productType)
    : name.trim() !== "" ||
      uom.trim() !== "" ||
      categoryCode.trim() !== "" ||
      sellPrice !== 0 ||
      isPerishable !== false ||
      createTypeAnswer !== null;

  const handleAttemptClose = () => {
    if (isPending) return;
    if (isDirty) {
      if (window.confirm("Tiene cambios sin guardar en el producto. ¿Desea descartarlos?")) {
        onClose();
      }
      return;
    }
    onClose();
  };

  const isSubmittingRef = useRef(false);
  // Validated values from the last resolver pass, kept so the destructive
  // type-change confirmation can submit exactly what was validated without
  // re-reading unvalidated inputs.
  const validatedValuesRef = useRef<ProductFormValues | null>(null);

  // Leaving the recipe-bearing set orphans the recipe: it stops consuming
  // ingredients and stops moving stock. Require explicit confirmation before
  // that reaches the backend, for ANY destination outside the set.
  const isDestructiveTypeChange =
    isEdit &&
    !!product &&
    isRecipeBearingType(product.product_type) &&
    !isRecipeBearingType(editType);

  const runSubmit = async (values: ProductFormValues) => {
    if (isPending || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);

    try {
      if (isEdit && product) {
        await updateMutation.mutateAsync({
          id: product.id,
          input: {
            name: values.name.trim(),
            uom: values.uom.trim(),
            product_type: editType,
            category_code: categoryCode || undefined,
            sellPrice: values.sellPrice,
            is_perishable: isPerishable,
          },
        });
        toast({
          variant: "success",
          title: "Producto actualizado",
          description: `"${values.name.trim()}" se actualizó exitosamente.`,
        });
      } else {
        // Handler-level refusal (issue #618): the disabled button is not the
        // boundary — creation without an answer must be impossible from any
        // submit path. The type comes from the answer, never from the tab.
        if (!createTypeAnswer) return;
        const input: CreateProductInput = {
          name: values.name.trim(),
          uom: values.uom.trim(),
          product_type: createTypeAnswer,
          category_code: categoryCode || undefined,
          sellPrice: values.sellPrice,
          is_perishable: isPerishable,
        };
        await createMutation.mutateAsync(input);
        onCreated?.(createTypeAnswer);
        toast({
          variant: "success",
          title: "Producto creado",
          description: `"${values.name.trim()}" se guardó exitosamente en el catálogo.`,
        });
      }
      onClose();
    } catch (err) {
      const msg = getApiErrorMessage(err, "Error al guardar producto");
      setError(msg);
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: msg,
      });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // Resolver-validated entry point: this only runs when the schema accepted
  // every field, so the handler-level guards below keep their exact pre-sweep
  // behavior (issue #618's unanswered-question refusal and the destructive
  // type-change confirmation) with values the schema already vetted.
  const onValid = (values: ProductFormValues) => {
    if (isPending || isSubmittingRef.current) return;
    validatedValuesRef.current = values;
    // Issue #618: refuse creation while the question is unanswered, on any
    // submit path (click is already blocked by the disabled button; this is
    // the second layer, matching #617's discipline).
    if (!isEdit && !createTypeAnswer) return;
    if (isDestructiveTypeChange && !awaitingTypeChangeConfirm) {
      setAwaitingTypeChangeConfirm(true);
      return;
    }
    // While awaiting confirmation the primary submit path is inert: a second
    // click on "Guardar" or an Enter keypress must never apply the destructive
    // change. Only the explicit "Confirmar y guardar" action may submit it.
    if (isDestructiveTypeChange) return;
    void runSubmit(values);
  };

  const confirmTypeChangeAndSubmit = async () => {
    if (isPending || isSubmittingRef.current) return;
    const values = validatedValuesRef.current;
    if (!values) return;
    setAwaitingTypeChangeConfirm(false);
    await runSubmit(values);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleAttemptClose();
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualice el tipo, los precios, la UOM o la categoría del producto."
              : "Defina los detalles del producto para ventas o compras."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive-50 p-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        {/* noValidate: the application's own zod validation (via the RHF
            resolver) is the single source of operator feedback. Native HTML
            constraint validation would otherwise block the submit event
            before the resolver runs, replacing the design system's Spanish
            inline errors with the browser's own validation bubble (browser
            language and styling). */}
        <form
          onSubmit={handleSubmit(onValid)}
          noValidate
          className="space-y-4 pt-1"
        >
          {!isEdit && (
            <fieldset className="space-y-2" disabled={isPending}>
              <legend className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                ¿Este ítem se prepara con ingredientes?
              </legend>
              {CREATE_TYPE_ANSWERS.map((opt) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`create_type_${opt.id}`}
                    name="create_type_question"
                    value={opt.id}
                    checked={createTypeAnswer === opt.id}
                    onChange={() => setCreateTypeAnswer(opt.id)}
                    disabled={isPending}
                    className="h-4 w-4 border-border text-primary focus:ring-primary cursor-pointer disabled:opacity-50"
                  />
                  <label
                    htmlFor={`create_type_${opt.id}`}
                    className="text-xs sm:text-sm text-foreground cursor-pointer"
                  >
                    {opt.answer}
                  </label>
                </div>
              ))}
            </fieldset>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nombre *
            </label>
            <Input
              type="text"
              {...register("name")}
              placeholder="Ej: Taza de Capuccino"
              disabled={isPending}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Unidad de Medida *
              </label>
              <select
                {...register("uom")}
                disabled={isPending}
                aria-invalid={Boolean(errors.uom)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <option value="">Seleccionar UOM</option>
                {uomValues?.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </select>
              {errors.uom && (
                <p className="text-xs text-destructive">
                  {errors.uom.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Categoría
              </label>
              <select
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <option value="">Sin categoría</option>
                {categoryValues?.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isEdit && (
            <div>
              <label
                htmlFor="product_type_edit"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Tipo de Producto
              </label>
              <select
                id="product_type_edit"
                value={editType}
                onChange={(e) => {
                  setEditType(e.target.value as StoredProductType);
                  setAwaitingTypeChangeConfirm(false);
                }}
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
                {editType === "PREPARED" && (
                  <option value="PREPARED">Preparado (tipo heredado)</option>
                )}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Precio de Venta (C$)
            </label>
            <Input
              type="number"
              {...register("sellPrice", {
                // Mirrors the old `parseFloat(...) || 0` state handling: an
                // emptied input submits as 0, a typed value as its number.
                setValueAs: (v) => (v === "" ? 0 : Number(v)),
              })}
              placeholder="0.00"
              disabled={isPending}
              aria-invalid={Boolean(errors.sellPrice)}
            />
            {errors.sellPrice && (
              <p className="text-xs text-destructive">
                {errors.sellPrice.message}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_perishable"
              checked={isPerishable}
              onChange={(e) => setIsPerishable(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer disabled:opacity-50"
            />
            <label
              htmlFor="is_perishable"
              className="text-xs sm:text-sm font-medium text-foreground cursor-pointer"
            >
              Producto perecedero (control de caducidad)
            </label>
          </div>

          {isEdit && awaitingTypeChangeConfirm && isDestructiveTypeChange && product && (
            <div className="rounded-md border border-destructive/20 bg-destructive-50 p-3 space-y-2">
              <p className="text-xs font-medium text-destructive">
                Está cambiando el tipo de "{name.trim()}" de{" "}
                {storedTypeLabel(product.product_type)} a{" "}
                {storedTypeLabel(editType)}. Al guardar, la receta de este
                producto dejará de consumir ingredientes y el producto dejará
                de mover inventario automáticamente.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={confirmTypeChangeAndSubmit}
                  disabled={isPending}
                >
                  Confirmar y guardar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAwaitingTypeChangeConfirm(false)}
                  disabled={isPending}
                >
                  Volver
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleAttemptClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isPending}
              disabled={
                isPending ||
                (!isEdit && createTypeAnswer === null) ||
                (isDestructiveTypeChange && awaitingTypeChangeConfirm)
              }
            >
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  product,
  open,
  onClose,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
}) {
  const deactivateMutation = useDeactivateProduct();
  const [error, setError] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  const handleConfirm = async () => {
    if (deactivateMutation.isPending || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    try {
      await deactivateMutation.mutateAsync(product.id);
      toast({
        variant: "success",
        title: "Producto desactivado",
        description: `"${product.name}" ha sido desactivado del catálogo.`,
      });
      onClose();
    } catch (err) {
      const msg = getApiErrorMessage(err, "Error al desactivar el producto");
      setError(msg);
      toast({
        variant: "destructive",
        title: "Error al desactivar",
        description: msg,
      });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !deactivateMutation.isPending) onClose();
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => {
          if (deactivateMutation.isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (deactivateMutation.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Desactivar Producto</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de desactivar{" "}
            <span className="font-semibold text-foreground">{product.name}</span>?
            El producto no aparecerá en listados de venta activos pero se mantendrá
            en el historial de facturación e inventario.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive-50 p-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        <DialogFooter className="pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={deactivateMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            loading={deactivateMutation.isPending}
            disabled={deactivateMutation.isPending}
          >
            Desactivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductPage() {
  const [activeTab, setActiveTab] = useState<TabId>("SIMPLE");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [deactivatingProduct, setDeactivatingProduct] = useState<
    Product | undefined
  >();

  const handleCreate = () => {
    setEditingProduct(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProduct(undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Productos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Gestión de catálogo de productos simples, compuestos e insumos
          </p>
        </div>
        <Button onClick={handleCreate} className="shadow-xs">
          + Nuevo Producto
        </Button>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0" aria-label="Tipos de producto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        <ProductTable
          key={activeTab}
          productType={activeTab}
          onEdit={handleEdit}
          onDeactivate={setDeactivatingProduct}
        />
      </div>

      {dialogOpen && (
        <ProductDialog
          key={editingProduct?.id ?? "create"}
          productType={activeTab}
          product={editingProduct}
          open={dialogOpen}
          onClose={handleCloseDialog}
          // Issue #618 (C2): the list is filtered by exact product_type per
          // tab, so after creating, land on the tab that shows the new
          // product. Display state only — no extra request.
          onCreated={setActiveTab}
        />
      )}

      {deactivatingProduct && (
        <DeactivateDialog
          product={deactivatingProduct}
          open={!!deactivatingProduct}
          onClose={() => setDeactivatingProduct(undefined)}
        />
      )}
    </div>
  );
}
