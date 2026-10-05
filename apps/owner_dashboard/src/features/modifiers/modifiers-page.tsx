import { useState } from "react";
import { Plus, Edit, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ModifierGroupForm } from "./modifier-group-form";
import { useModifierGroups, useDeactivateModifierGroup } from "./use-modifiers";
import { describeModifierError } from "./modifiers-api";
import { type ModifierGroup } from "./types";
import { toast } from "@/hooks/use-toast";
import { useRbac } from "@/lib/rbac";

/**
 * Human-readable selection rule: "Obligatorio 1/1" when at least one
 * selection is required, "Opcional 0/3" when the customer may skip it.
 */
function formatSelectionRange(
  minSelected: number,
  maxSelected: number,
): string {
  return minSelected >= 1
    ? `Obligatorio ${minSelected}/${maxSelected}`
    : `Opcional 0/${maxSelected}`;
}

export function ModifiersPage() {
  const { canPerformAction } = useRbac();
  const canWrite = canPerformAction("modifiers.write");
  const { data: groups, isLoading, error, refetch } = useModifierGroups();
  const deactivateGroup = useDeactivateModifierGroup();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [deactivatingGroup, setDeactivatingGroup] =
    useState<ModifierGroup | null>(null);

  const handleEdit = (group: ModifierGroup) => {
    setEditingGroup(group);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingGroup(null);
    refetch();
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingGroup) return;
    try {
      await deactivateGroup.mutateAsync(deactivatingGroup.id);
      toast({ variant: "success", title: "Grupo desactivado" });
    } catch (err) {
      toast({
        title: "Error al desactivar",
        description: describeModifierError(
          err,
          "No se pudo desactivar el grupo",
        ),
        variant: "destructive",
      });
    } finally {
      setDeactivatingGroup(null);
      refetch();
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-64"
        role="status"
        aria-label="Cargando grupos de modificadores"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>Error al cargar los grupos de modificadores</p>
        <Button
          onClick={() => refetch()}
          className="ml-2 mt-2"
          variant="outline"
          size="sm"
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const groupList = groups ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Modificadores</h1>
          <p className="text-sm text-muted-foreground">
            Defina grupos de opciones como leche, extras o endulzante que sus
            productos comparten al ordenar
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditingGroup(null);
              setIsFormOpen(true);
            }}
            aria-label="Nuevo grupo"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo grupo
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Selección</TableHead>
              <TableHead>Opciones</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead className="w-[100px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-8 text-muted-foreground"
                >
                  <p>Aún no hay grupos de modificadores.</p>
                  <p>
                    Cree el primero con «Nuevo grupo» para definir opciones
                    compartidas entre sus productos.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              groupList.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
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
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {group.options.length > 0
                      ? `${group.options.length} ${group.options.length === 1 ? "opción" : "opciones"}`
                      : "Sin opciones"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {group.sort_order}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(group)}
                          aria-label={`Editar grupo ${group.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeactivatingGroup(group)}
                          disabled={deactivateGroup.isPending}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Desactivar grupo ${group.name}`}
                        >
                          <PowerOff className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGroup
                ? "Editar grupo de modificadores"
                : "Nuevo grupo de modificadores"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? "Modifique los datos del grupo y sus opciones"
                : "Cree un grupo de opciones para compartir entre productos"}
            </DialogDescription>
          </DialogHeader>
          <ModifierGroupForm
            initialData={editingGroup}
            onSuccess={handleFormClose}
            onCancel={handleFormClose}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deactivatingGroup}
        onOpenChange={(open) => !open && setDeactivatingGroup(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Desactivar grupo</DialogTitle>
            <DialogDescription>
              El grupo «{deactivatingGroup?.name}» dejará de mostrarse al
              ordenar y de asignarse a productos. Las ventas anteriores
              conservan su información. Podrá activarlo nuevamente más adelante.
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
              onClick={handleConfirmDeactivate}
              disabled={deactivateGroup.isPending}
            >
              Desactivar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
