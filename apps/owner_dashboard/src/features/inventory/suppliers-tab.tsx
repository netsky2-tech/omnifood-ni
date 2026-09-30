import { useState, useMemo, useRef, useEffect } from "react";
import { useSafeSearchParams } from "@/lib/safe-search-params";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
} from "./use-inventory-reports";
import type { SupplierItem, CreateSupplierInput, UpdateSupplierInput } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Power,
  PowerOff,
  Phone,
  User,
  CreditCard,
  X,
} from "lucide-react";

interface SupplierFormState {
  name: string;
  phone: string;
  contactPerson: string;
  creditTerms: string;
}

const DEFAULT_FORM: SupplierFormState = {
  name: "",
  phone: "",
  contactPerson: "",
  creditTerms: "",
};

export function SuppliersTab() {
  const [searchParams, setSearchParams] = useSafeSearchParams();
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("q_suppliers") || "",
  );
  const [showInactive, setShowInactive] = useState(
    searchParams.get("show_inactive") === "true",
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [form, setForm] = useState<SupplierFormState>(DEFAULT_FORM);
  const [initialForm, setInitialForm] = useState<SupplierFormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [toggleConfirmSupplier, setToggleConfirmSupplier] =
    useState<SupplierItem | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);

  const {
    data: suppliers,
    isLoading,
    error: queryError,
  } = useSuppliers({ includeInactive: showInactive });

  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();

  useEffect(() => {
    if (formError && errorRef.current) {
      errorRef.current.focus();
    }
  }, [formError]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) {
          next.set("q_suppliers", value);
        } else {
          next.delete("q_suppliers");
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleToggleInactive = (checked: boolean) => {
    setShowInactive(checked);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (checked) {
          next.set("show_inactive", "true");
        } else {
          next.delete("show_inactive");
        }
        return next;
      },
      { replace: true },
    );
  };

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    if (!searchTerm.trim()) return suppliers;
    const term = searchTerm.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.contact_person || "").toLowerCase().includes(term) ||
        (s.phone || "").toLowerCase().includes(term) ||
        (s.credit_terms || "").toLowerCase().includes(term),
    );
  }, [suppliers, searchTerm]);

  const activeCount = useMemo(
    () => (suppliers ? suppliers.filter((s) => s.is_active).length : 0),
    [suppliers],
  );

  const withCreditCount = useMemo(
    () =>
      suppliers
        ? suppliers.filter((s) => s.is_active && s.credit_terms && s.credit_terms.trim() !== "").length
        : 0,
    [suppliers],
  );

  const openCreateModal = () => {
    setEditingSupplier(null);
    setForm(DEFAULT_FORM);
    setInitialForm(DEFAULT_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (supplier: SupplierItem) => {
    const editState: SupplierFormState = {
      name: supplier.name,
      phone: supplier.phone || "",
      contactPerson: supplier.contact_person || "",
      creditTerms: supplier.credit_terms || "",
    };
    setEditingSupplier(supplier);
    setForm(editState);
    setInitialForm(editState);
    setFormError(null);
    setModalOpen(true);
  };

  const isDirty = useMemo(() => {
    return (
      form.name !== initialForm.name ||
      form.phone !== initialForm.phone ||
      form.contactPerson !== initialForm.contactPerson ||
      form.creditTerms !== initialForm.creditTerms
    );
  }, [form, initialForm]);

  const saving = createSupplier.isPending || updateSupplier.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("El nombre del proveedor es obligatorio.");
      return;
    }

    try {
      if (editingSupplier) {
        const payload: UpdateSupplierInput = {
          name: trimmedName,
          phone: form.phone.trim() || undefined,
          contactPerson: form.contactPerson.trim() || undefined,
          creditTerms: form.creditTerms.trim() || undefined,
        };
        await updateSupplier.mutateAsync({
          id: editingSupplier.id,
          input: payload,
        });
        toast({
          title: "Proveedor actualizado",
          description: `Se guardaron los cambios para ${trimmedName}.`,
        });
      } else {
        const payload: CreateSupplierInput = {
          name: trimmedName,
          phone: form.phone.trim() || undefined,
          contactPerson: form.contactPerson.trim() || undefined,
          creditTerms: form.creditTerms.trim() || undefined,
        };
        await createSupplier.mutateAsync(payload);
        toast({
          title: "Proveedor creado",
          description: `Se registró ${trimmedName} exitosamente.`,
        });
      }
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err));
    }
  };

  const handleToggleActiveStatus = async (supplier: SupplierItem) => {
    try {
      const nextActive = !supplier.is_active;
      await updateSupplier.mutateAsync({
        id: supplier.id,
        input: { isActive: nextActive },
      });
      toast({
        title: nextActive ? "Proveedor reactivado" : "Proveedor desactivado",
        description: nextActive
          ? `${supplier.name} está activo y disponible para compras.`
          : `${supplier.name} ha sido desactivado.`,
      });
      setToggleConfirmSupplier(null);
    } catch (err: unknown) {
      toast({
        title: "Error al actualizar estado",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <LoadingState message="Cargando catálogo de proveedores..." />;
  }

  if (queryError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {getApiErrorMessage(queryError)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Proveedores"
          value={String(suppliers?.length || 0)}
          subtitle="En catálogo cloud"
        />
        <StatCard
          label="Proveedores Activos"
          value={String(activeCount)}
          subtitle="Habilitados para compras"
        />
        <StatCard
          label="Con Crédito Comercial"
          value={String(withCreditCount)}
          subtitle="Términos pactados"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, contacto o teléfono..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-8"
              aria-label="Buscar proveedores"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-inactive-suppliers"
              checked={showInactive}
              onCheckedChange={(checked) => handleToggleInactive(Boolean(checked))}
            />
            <Label
              htmlFor="show-inactive-suppliers"
              className="text-sm font-medium cursor-pointer"
            >
              Mostrar inactivos
            </Label>
          </div>
        </div>

        <Button onClick={openCreateModal} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Proveedor
        </Button>
      </div>

      {/* Table / Empty State */}
      {filteredSuppliers.length === 0 ? (
        suppliers && suppliers.length > 0 ? (
          <EmptyState
            title="Sin coincidencias"
            message={`No se encontraron proveedores que coincidan con "${searchTerm}".`}
          />
        ) : (
          <EmptyState
            title="Catálogo de proveedores vacío"
            message="Registra tus proveedores comerciales para asociar compras, controlar costos y plazos de pago."
            action={
              <Button onClick={openCreateModal} className="gap-2">
                <Plus className="h-4 w-4" />
                Registrar primer proveedor
              </Button>
            }
          />
        )
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3">Proveedor</th>
                  <th scope="col" className="px-4 py-3">Contacto</th>
                  <th scope="col" className="px-4 py-3">Teléfono</th>
                  <th scope="col" className="px-4 py-3">Términos de Crédito</th>
                  <th scope="col" className="px-4 py-3 text-center">Estado</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      !supplier.is_active ? "opacity-60 bg-muted/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{supplier.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.contact_person ? (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          <span>{supplier.contact_person}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span>{supplier.phone}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {supplier.credit_terms ? (
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 shrink-0" />
                          <span>{supplier.credit_terms}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">Contado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {supplier.is_active ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(supplier)}
                        aria-label={`Editar proveedor ${supplier.name}`}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (supplier.is_active) {
                            setToggleConfirmSupplier(supplier);
                          } else {
                            handleToggleActiveStatus(supplier);
                          }
                        }}
                        aria-label={
                          supplier.is_active
                            ? `Desactivar proveedor ${supplier.name}`
                            : `Reactivar proveedor ${supplier.name}`
                        }
                        className={`h-8 w-8 p-0 ${
                          supplier.is_active
                            ? "text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
                            : "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {supplier.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Crear / Editar Proveedor */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}
              </DialogTitle>
              <DialogDescription>
                {editingSupplier
                  ? "Actualiza los datos comerciales y de contacto del proveedor."
                  : "Ingresa los datos del nuevo proveedor para habilitar compras manuales."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {formError && (
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  aria-live="polite"
                  className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive focus:outline-none focus:ring-2 focus:ring-destructive"
                >
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="supplier-name" className="text-sm font-medium">
                  Nombre Comercial / Razón Social <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="supplier-name"
                  placeholder="Ej: Distribuidora Central S.A."
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-contact" className="text-sm font-medium">
                  Persona de Contacto
                </Label>
                <Input
                  id="supplier-contact"
                  placeholder="Ej: Juan Pérez (Agente de Ventas)"
                  value={form.contactPerson}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, contactPerson: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-phone" className="text-sm font-medium">
                  Teléfono / WhatsApp
                </Label>
                <Input
                  id="supplier-phone"
                  placeholder="Ej: +505 8888-1234"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-credit" className="text-sm font-medium">
                  Términos de Crédito
                </Label>
                <Input
                  id="supplier-credit"
                  placeholder="Ej: 15 días, 30 días, o Contado"
                  value={form.creditTerms}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, creditTerms: e.target.value }))
                  }
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || (editingSupplier !== null && !isDirty)}>
                {saving
                  ? "Guardando..."
                  : editingSupplier
                  ? "Guardar Cambios"
                  : "Crear Proveedor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Desactivar Proveedor */}
      <Dialog
        open={toggleConfirmSupplier !== null}
        onOpenChange={(open) => {
          if (!open) setToggleConfirmSupplier(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Desactivar proveedor?</DialogTitle>
            <DialogDescription>
              {toggleConfirmSupplier && (
                <>
                  ¿Estás seguro de que deseas desactivar a{" "}
                  <strong>{toggleConfirmSupplier.name}</strong>? El proveedor no
                  aparecerá en el selector de compras hasta que sea reactivado.
                  Los registros y compras históricas no se verán afectados.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setToggleConfirmSupplier(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (toggleConfirmSupplier) {
                  handleToggleActiveStatus(toggleConfirmSupplier);
                }
              }}
            >
              Confirmar Desactivación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
