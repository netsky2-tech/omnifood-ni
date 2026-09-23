import { useState, useRef } from "react";
import { Edit2, Trash2 } from "lucide-react";
import {
  usePaginatedProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeactivateProduct,
} from "./use-product";
import {
  PRODUCT_TYPES,
  type ProductType,
  type Product,
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
}: {
  productType: ProductType;
  product?: Product;
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = !!product;
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const { data: uomValues } = useCatalogValues("UOM" as CatalogType, true);
  const { data: categoryValues } = useCatalogValues(
    "SALES_PRODUCT_CATEGORY" as CatalogType,
    true,
  );

  const [name, setName] = useState(product?.name ?? "");
  const [uom, setUom] = useState(product?.uom ?? "");
  const [categoryCode, setCategoryCode] = useState(
    product?.category_code ?? "",
  );
  const [sellPrice, setSellPrice] = useState(
    product ? toFiniteNumber(product.sellPrice) : 0,
  );
  const [isPerishable, setIsPerishable] = useState(
    product?.is_perishable ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const isDirty = isEdit
    ? name !== (product?.name ?? "") ||
      uom !== (product?.uom ?? "") ||
      categoryCode !== (product?.category_code ?? "") ||
      sellPrice !== (product ? toFiniteNumber(product.sellPrice) : 0) ||
      isPerishable !== (product?.is_perishable ?? false)
    : name.trim() !== "" ||
      uom.trim() !== "" ||
      categoryCode.trim() !== "" ||
      sellPrice !== 0 ||
      isPerishable !== false;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);

    try {
      if (isEdit && product) {
        await updateMutation.mutateAsync({
          id: product.id,
          input: {
            name: name.trim(),
            uom: uom.trim(),
            category_code: categoryCode || undefined,
            sellPrice,
            is_perishable: isPerishable,
          },
        });
        toast({
          variant: "success",
          title: "Producto actualizado",
          description: `"${name.trim()}" se actualizó exitosamente.`,
        });
      } else {
        const input: CreateProductInput = {
          name: name.trim(),
          uom: uom.trim(),
          product_type: productType,
          category_code: categoryCode || undefined,
          sellPrice,
          is_perishable: isPerishable,
        };
        await createMutation.mutateAsync(input);
        toast({
          variant: "success",
          title: "Producto creado",
          description: `"${name.trim()}" se guardó exitosamente en el catálogo.`,
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
              ? "Actualice los precios, UOM o categoría del producto."
              : "Defina los detalles del producto para ventas o compras."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive-50 p-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nombre *
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="Ej: Taza de Capuccino"
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Unidad de Medida *
              </label>
              <select
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                required
                disabled={isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <option value="">Seleccionar UOM</option>
                {uomValues?.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name} ({v.code})
                  </option>
                ))}
              </select>
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

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Precio de Venta (C$)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={sellPrice}
              onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              disabled={isPending}
            />
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
              disabled={isPending}
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
