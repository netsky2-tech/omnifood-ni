import { useState } from "react";
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

  if (isLoading) return <LoadingState />;
  if (error) return <EmptyState message="Error al cargar catálogo" />;
  if (!data || data.length === 0)
    return <EmptyState message="Sin valores en este catálogo" />;

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
              Código
            </th>
            <th className="px-4 py-3 text-left font-semibold uppercase text-muted-foreground">
              Nombre
            </th>
            <th className="px-4 py-3 text-center font-semibold uppercase text-muted-foreground">
              Estado
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Orden
            </th>
            <th className="px-4 py-3 text-right font-semibold uppercase text-muted-foreground">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((v) => (
            <tr
              key={v.id}
              className="border-b border-border last:border-0 hover:bg-muted/50"
            >
              <td className="px-4 py-3 font-mono text-xs">{v.code}</td>
              <td className="px-4 py-3 font-medium">{v.name}</td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    v.is_active
                      ? "bg-secondary-50 text-secondary-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {v.is_active ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {v.sort_order}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(v)}
                    className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary-50"
                  >
                    Editar
                  </button>
                  {v.is_active && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(v)}
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

function CatalogDialog({
  type,
  value,
  onClose,
}: {
  type: CatalogType;
  value?: CatalogValue;
  onClose: () => void;
}) {
  const isEdit = !!value;
  const createMutation = useCreateCatalogValue(type);
  const updateMutation = useUpdateCatalogValue(type);

  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [sortOrder, setSortOrder] = useState(value?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (isEdit && value) {
        await updateMutation.mutateAsync({
          id: value.id,
          input: { name, sort_order: sortOrder },
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
          {isEdit ? "Editar Valor" : "Nuevo Valor"}
        </h2>

        {error && (
          <div className="mb-4 rounded border border-destructive bg-destructive-50 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Código *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                pattern="^[A-Za-z0-9_-]+$"
                maxLength={64}
                className="w-full rounded border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ej: kg, LACTEOS"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Solo letras, números, guiones y guiones bajos
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Nombre *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ej: Kilogramo, Lácteos"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Orden
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
              className="w-full rounded border border-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
  type,
  value,
  onClose,
}: {
  type: CatalogType;
  value: CatalogValue;
  onClose: () => void;
}) {
  const deactivateMutation = useDeactivateCatalogValue(type);

  const handleConfirm = async () => {
    try {
      await deactivateMutation.mutateAsync(value.id);
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg">
        <h2 className="mb-2 text-lg font-bold text-card-foreground">
          Desactivar Valor
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          ¿Estás seguro de desactivar{" "}
          <span className="font-medium text-foreground">{value.name}</span> (
          {value.code})? El valor no aparecerá en listados activos pero se
          mantendrá en el historial.
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Catálogo</h1>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-400"
        >
          + Nuevo Valor
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
        <CatalogTable
          key={activeTab}
          type={activeTab}
          onEdit={handleEdit}
          onDeactivate={setDeactivatingValue}
        />
      </div>

      {dialogOpen && (
        <CatalogDialog
          type={activeTab}
          value={editingValue}
          onClose={handleCloseDialog}
        />
      )}

      {deactivatingValue && (
        <DeactivateDialog
          type={activeTab}
          value={deactivatingValue}
          onClose={() => setDeactivatingValue(undefined)}
        />
      )}
    </div>
  );
}
