import { useState } from "react";
import {
  useProducts,
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
  const { data, isLoading, error } = useProducts(productType, true);

  if (isLoading) return <LoadingState />;
  if (error) return <EmptyState message="Error al cargar productos" />;
  if (!data || data.length === 0)
    return <EmptyState message="Sin productos en esta categoría" />;

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
              Nombre
            </th>
            <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
              UOM
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Precio
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Stock
            </th>
            <th className="px-4 py-3 text-center font-semibold uppercase text-muted-foreground">
              Estado
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr
              key={p.id}
              className="border-b border-border last:border-0 hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.uom}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                C${p.sellPrice.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {p.stock.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.is_active
                      ? "bg-secondary-50 text-secondary-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.is_active ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(p)}
                    className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary-50"
                  >
                    Editar
                  </button>
                  {p.is_active && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(p)}
                      className="rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive-50"
                    >
                      Desactivar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductDialog({
  productType,
  product,
  onClose,
}: {
  productType: ProductType;
  product?: Product;
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
  const [sellPrice, setSellPrice] = useState(product?.sellPrice ?? 0);
  const [isPerishable, setIsPerishable] = useState(
    product?.is_perishable ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (isEdit && product) {
        await updateMutation.mutateAsync({
          id: product.id,
          input: {
            name,
            uom,
            category_code: categoryCode || undefined,
            sellPrice,
            is_perishable: isPerishable,
          },
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
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al guardar",
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-card-foreground">
          {isEdit ? "Editar Producto" : "Nuevo Producto"}
        </h2>

        {error && (
          <div className="mb-4 rounded border border-destructive bg-destructive-50 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ej: Taza de Capuccino"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Unidad de Medida *
            </label>
            <select
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              required
              className="w-full rounded border border-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
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
            <label className="mb-1 block text-sm font-medium text-foreground">
              Categoría
            </label>
            <select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              className="w-full rounded border border-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sin categoría</option>
              {categoryValues?.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Precio de Venta (C$)
            </label>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(Number(e.target.value))}
              min={0}
              step={0.01}
              className="w-full rounded border border-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPerishable"
              checked={isPerishable}
              onChange={(e) => setIsPerishable(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label
              htmlFor="isPerishable"
              className="text-sm font-medium text-foreground"
            >
              Perecedero
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-400 disabled:opacity-50"
            >
              {isPending ? "Guardando..." : isEdit ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeactivateDialog({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const deactivateMutation = useDeactivateProduct();

  const handleConfirm = async () => {
    try {
      await deactivateMutation.mutateAsync(product.id);
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-2 text-lg font-bold text-card-foreground">
          Desactivar Producto
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          ¿Estás seguro de desactivar{" "}
          <span className="font-medium text-foreground">{product.name}</span>?
          El producto no aparecerá en listados activos pero se mantendrá en el
          historial.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={deactivateMutation.isPending}
            className="rounded px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deactivateMutation.isPending}
            className="rounded bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {deactivateMutation.isPending
              ? "Desactivando..."
              : "Desactivar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Productos</h1>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-400"
        >
          + Nuevo Producto
        </button>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
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
          productType={activeTab}
          product={editingProduct}
          onClose={handleCloseDialog}
        />
      )}

      {deactivatingProduct && (
        <DeactivateDialog
          product={deactivatingProduct}
          onClose={() => setDeactivatingProduct(undefined)}
        />
      )}
    </div>
  );
}
