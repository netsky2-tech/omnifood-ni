import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useProducts } from "@/features/catalog/use-product";
import { describeModifierError } from "./modifiers-api";
import {
  useModifierGroups,
  useEffectiveGroups,
  useAttachProduct,
  useDetachProduct,
} from "./use-modifiers";
import { formatSelectionRange } from "./format";
import type { EffectiveModifierGroup } from "./effective-types";

interface EffectiveRowProps {
  entry: EffectiveModifierGroup;
  onRemove?: () => void;
}

function EffectiveRow({ entry, onRemove }: EffectiveRowProps) {
  return (
    <li className="flex items-center justify-between rounded-md border p-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{entry.name}</span>
        <span className="text-sm text-muted-foreground">
          {formatSelectionRange(entry.min_selected, entry.max_selected)}
        </span>
        {entry.allow_quantities && (
          <Badge variant="outline" className="text-xs">
            Con cantidades
          </Badge>
        )}
        <Badge variant="secondary" className="text-xs">
          {entry.source === "category" ? "Heredado" : "De este producto"}
        </Badge>
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
          aria-label={`Quitar ${entry.name} de este producto`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}

/**
 * "Por producto" tab: shows the effective resolution for one product,
 * split into what the category already provides (read-only — removing a
 * category attachment here is impossible and would be a lie) and the
 * product's own exceptions (removable, or overridable per group).
 */
export function ProductExceptions() {
  const { data: products, isLoading: isLoadingProducts } = useProducts();
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [exceptionGroupId, setExceptionGroupId] = useState("");

  const { data: allGroups } = useModifierGroups();
  const { data: effective, isLoading: isLoadingEffective } = useEffectiveGroups(
    productId || undefined,
  );
  const attachProduct = useAttachProduct();
  const detachProduct = useDetachProduct();

  const [removingException, setRemovingException] =
    useState<EffectiveModifierGroup | null>(null);

  const effectiveList = effective ?? [];
  const effectiveIds = new Set(effectiveList.map((entry) => entry.group_id));
  const productSourceCount = effectiveList.filter(
    (entry) => entry.source === "product",
  ).length;

  const filteredProducts = useMemo(
    () =>
      (products ?? []).filter((product) =>
        product.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [products, search],
  );

  const handleAddException = async () => {
    if (!exceptionGroupId) return;
    try {
      // Append at end among the product's own exceptions. Adding a group
      // that the category already provides is deliberate: the product's
      // own attachment wins over the inherited one.
      await attachProduct.mutateAsync({
        groupId: exceptionGroupId,
        productId,
        sortOrder: productSourceCount,
      });
      toast({ variant: "success", title: "Grupo agregado al producto" });
      setExceptionGroupId("");
    } catch (error) {
      toast({
        title: "Error al agregar",
        description: describeModifierError(
          error,
          "No se pudo agregar el grupo",
        ),
        variant: "destructive",
      });
    }
  };

  const handleConfirmRemove = async () => {
    if (!removingException) return;
    try {
      await detachProduct.mutateAsync({
        groupId: removingException.group_id,
        productId,
      });
      toast({ variant: "success", title: "Grupo quitado del producto" });
    } catch (error) {
      toast({
        title: "Error al quitar",
        description: describeModifierError(error, "No se pudo quitar el grupo"),
        variant: "destructive",
      });
    } finally {
      setRemovingException(null);
    }
  };

  const inherited = effectiveList.filter(
    (entry) => entry.source === "category",
  );
  const own = effectiveList.filter((entry) => entry.source === "product");

  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-2">
        <div>
          <Label htmlFor="product-search">Buscar producto</Label>
          <Input
            id="product-search"
            placeholder="Ej: Cerveza, Pan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="product-select">Producto</Label>
          <select
            id="product-select"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Seleccione un producto</option>
            {filteredProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!productId ? (
        <p className="text-sm text-muted-foreground py-4">
          Seleccione un producto para ver sus grupos.
        </p>
      ) : isLoadingProducts || isLoadingEffective ? (
        <p className="text-sm text-muted-foreground py-4">Cargando…</p>
      ) : effectiveList.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          Este producto aún no tiene grupos. Cree grupos en la pestaña «Grupos»
          y luego agréguelos a su categoría o a este producto.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-md border p-4 space-y-2">
            <p className="font-medium">Heredado de la categoría</p>
            <p className="text-sm text-muted-foreground">
              Estos grupos llegan por la categoría del producto; adminístrelos
              en la pestaña «Por categoría».
            </p>
            {inherited.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada heredado desde la categoría.
              </p>
            ) : (
              <ul className="space-y-2">
                {inherited.map((entry) => (
                  <EffectiveRow key={entry.group_id} entry={entry} />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border p-4 space-y-2">
            <p className="font-medium">Excepciones de este producto</p>
            {own.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este producto usa exactamente lo que hereda de su categoría.
              </p>
            ) : (
              <ul className="space-y-2">
                {own.map((entry) => (
                  <EffectiveRow
                    key={entry.group_id}
                    entry={entry}
                    onRemove={() => setRemovingException(entry)}
                  />
                ))}
              </ul>
            )}

            <div className="space-y-1 pt-2">
              <Label htmlFor="exception-group-select">Grupo</Label>
              <div className="flex gap-2">
                <select
                  id="exception-group-select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={exceptionGroupId}
                  onChange={(e) => setExceptionGroupId(e.target.value)}
                >
                  <option value="">Seleccione un grupo</option>
                  {(allGroups ?? []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                      {effectiveIds.has(group.id) ? " (ya presente)" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={handleAddException}
                  disabled={attachProduct.isPending || !exceptionGroupId}
                  aria-label="Agregar como excepción"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar como excepción
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Al agregarlo aquí, este producto usará su propia configuración
                del grupo, aunque su categoría también lo tenga.
              </p>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={!!removingException}
        onOpenChange={(open) => !open && setRemovingException(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quitar grupo del producto</DialogTitle>
            <DialogDescription>
              «{removingException?.name}» dejará de aplicarse a este producto de
              forma propia
              {removingException?.source === "category"
                ? " y volverá a resolverse por su categoría"
                : ""}
              . Podrá volver a agregarlo más adelante.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemovingException(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={detachProduct.isPending}
            >
              Quitar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
