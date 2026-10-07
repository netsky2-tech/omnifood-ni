import { useState } from "react";
import { Plus, Edit, PowerOff, Power } from "lucide-react";
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
import {
  ModifierGroupForm,
} from "./modifier-group-form";
import { CategoryAttachments } from "./category-attachments";
import { ProductExceptions } from "./product-exceptions";
import {
  useModifierGroups,
  useDeactivateModifierGroup,
  useReactivateModifierGroup,
} from "./use-modifiers";
import { describeModifierError, type ModifierGroupStatus } from "./modifiers-api";
import { formatSelectionRange } from "./format";
import { type ModifierGroup } from "./types";
import { toast } from "@/hooks/use-toast";
import { useRbac } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type ModifiersTab = "grupos" | "categoria" | "producto";

const TABS: { id: ModifiersTab; label: string }[] = [
  { id: "grupos", label: "Grupos" },
  { id: "categoria", label: "Por categoría" },
  { id: "producto", label: "Por producto" },
];

const STATUS_FILTERS: { id: ModifierGroupStatus; label: string }[] = [
  { id: "active", label: "Activos" },
  { id: "inactive", label: "Inactivos" },
  { id: "all", label: "Todos" },
];

export function ModifiersPage() {
  const [activeTab, setActiveTab] = useState<ModifiersTab>("grupos");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Modificadores</h1>
        <p className="text-sm text-muted-foreground">
          Defina grupos de opciones como leche, extras o endulzante que sus
          productos comparten al ordenar
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Secciones de modificadores"
        className="flex gap-1 border-b"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "grupos" && <GroupsTab />}
      {activeTab === "categoria" && <CategoryAttachments />}
      {activeTab === "producto" && <ProductExceptions />}
    </div>
  );
}

function GroupsTab() {
  const { canPerformAction } = useRbac();
  const canWrite = canPerformAction("modifiers.write");
  const [statusFilter, setStatusFilter] = useState<ModifierGroupStatus>("active");
  const { data: groups, isLoading, error, refetch } = useModifierGroups(statusFilter);
  const deactivateGroup = useDeactivateModifierGroup();
  const reactivateGroup = useReactivateModifierGroup();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [deactivatingGroup, setDeactivatingGroup] =
    useState<ModifierGroup | null>(null);
  const [reactivatingGroup, setReactivatingGroup] =
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

  const handleConfirmReactivate = async () => {
    if (!reactivatingGroup) return;
    try {
      await reactivateGroup.mutateAsync(reactivatingGroup.id);
      toast({ variant: "success", title: "Grupo activado" });
    } catch (err) {
      toast({
        title: "Error al activar",
        description: describeModifierError(err, "No se pudo activar el grupo"),
        variant: "destructive",
      });
    } finally {
      setReactivatingGroup(null);
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
        <div
          role="group"
          aria-label="Filtrar grupos por estado"
          className="inline-flex rounded-md border p-1 gap-1"
        >
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.id}
              variant={statusFilter === filter.id ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={statusFilter === filter.id}
              onClick={() => setStatusFilter(filter.id)}
            >
              {filter.label}
            </Button>
          ))}
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
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{group.name}</span>
                      {!group.is_active && (
                        <Badge variant="outline">Desactivado</Badge>
                      )}
                    </div>
                  </TableCell>
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
                        {group.is_active && (
                          <>
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
                          </>
                        )}
                        {!group.is_active && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setReactivatingGroup(group)}
                            disabled={reactivateGroup.isPending}
                            aria-label={`Activar grupo ${group.name}`}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        )}
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

      <Dialog
        open={!!reactivatingGroup}
        onOpenChange={(open) => !open && setReactivatingGroup(null)}
      >
        {reactivatingGroup && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Activar grupo</DialogTitle>
              <DialogDescription>
                El grupo «{reactivatingGroup.name}» volverá a mostrarse al
                ordenar y podrá asignarse a productos nuevamente. Sus opciones
                y asignaciones anteriores se conservan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReactivatingGroup(null)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmReactivate}
                disabled={reactivateGroup.isPending}
              >
                Activar grupo
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
