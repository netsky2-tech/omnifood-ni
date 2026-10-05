import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useCatalogValues } from "@/features/catalog/use-catalog";
import { describeModifierError } from "./modifiers-api";
import {
  useModifierGroups,
  useGroupsByCategory,
  useAttachCategory,
  useDetachCategory,
} from "./use-modifiers";
import { formatSelectionRange } from "./format";
import { type ModifierGroup } from "./types";

/**
 * "Por categoría" tab: attach groups to a product category. Every product
 * in the category inherits the attached groups; per-product exceptions
 * live in the "Por producto" tab.
 */
export function CategoryAttachments() {
  // Inactive categories are included and marked so a stored-but-inactive
  // category never silently looks like "no category selected".
  const { data: catalogCategories } = useCatalogValues(
    "SALES_PRODUCT_CATEGORY",
    true,
  );
  const [categoryId, setCategoryId] = useState("");
  const { data: allGroups } = useModifierGroups();
  const { data: attachedGroups, isLoading: isLoadingAttached } =
    useGroupsByCategory(categoryId || undefined);
  const attachCategory = useAttachCategory();
  const detachCategory = useDetachCategory();

  const [deactivatingGroup, setDeactivatingGroup] =
    useState<ModifierGroup | null>(null);

  const attached = attachedGroups ?? [];
  const attachedIds = new Set(attached.map((group) => group.id));
  const available = (allGroups ?? []).filter(
    (group) => !attachedIds.has(group.id),
  );

  const handleAttach = async (group: ModifierGroup) => {
    try {
      // Append at end: the API has no reorder operation, so the new
      // attachment goes after everything already attached.
      await attachCategory.mutateAsync({
        groupId: group.id,
        catalogValueId: categoryId,
        sortOrder: attached.length,
      });
      toast({ variant: "success", title: "Grupo agregado a la categoría" });
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

  const handleConfirmDetach = async () => {
    if (!deactivatingGroup) return;
    try {
      await detachCategory.mutateAsync({
        groupId: deactivatingGroup.id,
        catalogValueId: categoryId,
      });
      toast({ variant: "success", title: "Grupo quitado de la categoría" });
    } catch (error) {
      toast({
        title: "Error al quitar",
        description: describeModifierError(error, "No se pudo quitar el grupo"),
        variant: "destructive",
      });
    } finally {
      setDeactivatingGroup(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Label htmlFor="category-select">Categoría</Label>
        {/* Native select on purpose (same choice as the promotions form):
            inactive categories stay visible, marked as such. */}
        <select
          id="category-select"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Seleccione una categoría</option>
          {(catalogCategories ?? []).map((value) => (
            <option key={value.id} value={value.id}>
              {value.is_active ? value.name : `${value.name} (inactiva)`}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground mt-1">
          Los productos de la categoría heredan estos grupos al ordenar.
        </p>
      </div>

      {!categoryId ? (
        <p className="text-sm text-muted-foreground py-4">
          Seleccione una categoría para ver y administrar sus grupos.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-md border p-4 space-y-2">
            <p className="font-medium">Grupos de la categoría</p>
            {isLoadingAttached ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : attached.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esta categoría todavía no tiene grupos.
              </p>
            ) : (
              <ul className="space-y-2">
                {attached.map((group) => (
                  <li
                    key={group.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{group.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatSelectionRange(
                          group.min_selected,
                          group.max_selected,
                        )}
                      </span>
                      {group.allow_quantities && (
                        <Badge variant="outline" className="text-xs">
                          Con cantidades
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeactivatingGroup(group)}
                      disabled={detachCategory.isPending}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Quitar ${group.name} de la categoría`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border p-4 space-y-2">
            <p className="font-medium">Grupos disponibles</p>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos los grupos ya están en esta categoría.
              </p>
            ) : (
              <ul className="space-y-2">
                {available.map((group) => (
                  <li
                    key={group.id}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{group.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatSelectionRange(
                          group.min_selected,
                          group.max_selected,
                        )}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAttach(group)}
                      disabled={attachCategory.isPending}
                      aria-label={`Agregar grupo ${group.name}`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={!!deactivatingGroup}
        onOpenChange={(open) => !open && setDeactivatingGroup(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quitar grupo de la categoría</DialogTitle>
            <DialogDescription>
              Los productos de la categoría dejarán de recibir el grupo «
              {deactivatingGroup?.name}» por herencia. Podrá volver a agregarlo
              más adelante.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivatingGroup(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDetach}
              disabled={detachCategory.isPending}
            >
              Quitar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
