import { useState, useRef } from "react";
import { Edit2, Trash2 } from "lucide-react";
import {
  useCatalogValues,
  useCreateCatalogValue,
  useUpdateCatalogValue,
  useDeactivateCatalogValue,
} from "./use-catalog";
import {
  CATALOG_TYPES,
  type CatalogType,
  type CatalogValue,
  type CreateCatalogValueInput,
} from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getApiErrorMessage } from "@/lib/api-error";
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

type TabId = CatalogType;

const TABS: { id: TabId; label: string }[] = CATALOG_TYPES;

function CatalogTable({
  type,
  onEdit,
  onDeactivate,
}: {
  type: CatalogType;
  onEdit: (value: CatalogValue) => void;
  onDeactivate: (value: CatalogValue) => void;
}) {
  const { data, isLoading, error } = useCatalogValues(type, true);

  if (isLoading) return <LoadingState message="Cargando catálogo..." />;
  if (error) return <EmptyState message="Error al cargar catálogo" />;
  if (!data || data.length === 0)
    return <EmptyState message="Sin valores en este catálogo" />;

  return (
    <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Código
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase text-xs text-muted-foreground">
                Nombre
              </th>
              <th className="px-4 py-3 text-center font-semibold uppercase text-xs text-muted-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Orden
              </th>
              <th className="px-4 py-3 text-right font-semibold uppercase text-xs text-muted-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => (
              <tr
                key={v.id}
                className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{v.code}</td>
                <td className="px-4 py-3 font-medium text-foreground">{v.name}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={v.is_active ? "success" : "secondary"}>
                    {v.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {v.sort_order}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(v)}
                      className="h-8 px-2 text-primary"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                    {v.is_active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeactivate(v)}
                        className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Desactivar
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CatalogDialog({
  type,
  value,
  open,
  onClose,
}: {
  type: CatalogType;
  value?: CatalogValue;
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = !!value;
  const createMutation = useCreateCatalogValue(type);
  const updateMutation = useUpdateCatalogValue(type);

  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [sortOrder, setSortOrder] = useState(value?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const isDirty = isEdit
    ? name !== (value?.name ?? "") || sortOrder !== (value?.sort_order ?? 0)
    : code.trim() !== "" || name.trim() !== "" || sortOrder !== 0;

  const handleAttemptClose = () => {
    if (isPending) return;
    if (isDirty) {
      if (window.confirm("Tiene cambios sin guardar en el formulario. ¿Desea descartarlos?")) {
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
      if (isEdit && value) {
        await updateMutation.mutateAsync({
          id: value.id,
          input: { name: name.trim(), sort_order: sortOrder },
        });
      } else {
        const input: CreateCatalogValueInput = {
          code: code.trim(),
          name: name.trim(),
          sort_order: sortOrder,
        };
        await createMutation.mutateAsync(input);
      }
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Error al guardar valor de catálogo"));
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
          <DialogTitle>{isEdit ? "Editar Valor" : "Nuevo Valor"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifique los detalles del elemento de catálogo seleccionado."
              : "Defina el código y nombre del nuevo elemento."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive-50 p-3 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {!isEdit && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Código *
              </label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                pattern="^[A-Za-z0-9_-]+$"
                maxLength={64}
                placeholder="Ej: kg, LACTEOS"
                disabled={isPending}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Solo letras, números, guiones y guiones bajos
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nombre *
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Ej: Kilogramo, Lácteos"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Orden
            </label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
              disabled={isPending}
            />
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
  type,
  value,
  open,
  onClose,
}: {
  type: CatalogType;
  value: CatalogValue;
  open: boolean;
  onClose: () => void;
}) {
  const deactivateMutation = useDeactivateCatalogValue(type);
  const [error, setError] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  const handleConfirm = async () => {
    if (deactivateMutation.isPending || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError(null);
    try {
      await deactivateMutation.mutateAsync(value.id);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Error al desactivar el valor de catálogo"));
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
          <DialogTitle>Desactivar Valor</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de desactivar{" "}
            <span className="font-semibold text-foreground">{value.name}</span> (
            {value.code})? El valor no aparecerá en listados activos pero se
            mantendrá en el historial para integridad referencial.
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

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<TabId>("UOM");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<CatalogValue | undefined>();
  const [deactivatingValue, setDeactivatingValue] = useState<
    CatalogValue | undefined
  >();

  const handleCreate = () => {
    setEditingValue(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (value: CatalogValue) => {
    setEditingValue(value);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingValue(undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Catálogo</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Tablas maestras de unidades de medida, categorías y clasificaciones
          </p>
        </div>
        <Button onClick={handleCreate} className="shadow-xs">
          + Nuevo Valor
        </Button>
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto pb-1 sm:pb-0" aria-label="Tipos de catálogo">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
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

      <CatalogTable
        type={activeTab}
        onEdit={handleEdit}
        onDeactivate={(val) => setDeactivatingValue(val)}
      />

      {dialogOpen && (
        <CatalogDialog
          key={editingValue?.id ?? "create"}
          type={activeTab}
          value={editingValue}
          open={dialogOpen}
          onClose={handleCloseDialog}
        />
      )}

      {deactivatingValue && (
        <DeactivateDialog
          type={activeTab}
          value={deactivatingValue}
          open={!!deactivatingValue}
          onClose={() => setDeactivatingValue(undefined)}
        />
      )}
    </div>
  );
}
