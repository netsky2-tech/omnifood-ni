import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AppPermission,
  ALL_APP_PERMISSIONS,
  PERMISSIONS_CATALOG,
  ROLE_LABELS,
  resolveEffectivePermissions,
} from "./types";
import type { User } from "./types";
import {
  usePermissionsMatrix,
  useUserPermissions,
  useUpdateUserPermissions,
} from "./use-users";

interface UserPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

const CATEGORIES = [
  "Ventas",
  "Caja & Turnos",
  "Inventario",
  "Reportes",
  "Lealtad",
] as const;

interface PermissionsContentProps {
  user: User;
  onClose: () => void;
}

function PermissionsContent({ user, onClose }: PermissionsContentProps) {
  const { data: matrix, isLoading: isMatrixLoading } = usePermissionsMatrix();
  const { data: userPerms, isLoading: isUserPermsLoading } =
    useUserPermissions(user.id);
  const updatePermissions = useUpdateUserPermissions();

  const [selectedCustom, setSelectedCustom] = useState<AppPermission[]>(() => {
    return userPerms?.custom_permissions ?? [];
  });
  const [error, setError] = useState<string | null>(null);

  const roleDefaults: readonly AppPermission[] =
    userPerms?.role_permissions ??
    (matrix?.role_defaults && user.role in matrix.role_defaults
      ? matrix.role_defaults[user.role] ?? []
      : []);

  const effectivePermissions = resolveEffectivePermissions(
    user.role,
    selectedCustom,
  );

  const toggleCustomPermission = (perm: AppPermission) => {
    setSelectedCustom((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleSave = async () => {
    setError(null);
    try {
      await updatePermissions.mutateAsync({
        userId: user.id,
        permissions: selectedCustom,
      });
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error al guardar la configuración de permisos");
      }
    }
  };

  const isLoading = isMatrixLoading || isUserPermsLoading;

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
          <DialogTitle>Matriz de Permisos Granulares</DialogTitle>
          <Badge variant="outline" className="text-xs">
            {ROLE_LABELS[user.role]}
          </Badge>
        </div>
        <DialogDescription>
          Configurá permisos especiales y excepciones de supervisor para{" "}
          <span className="font-semibold text-foreground">{user.name}</span> ({user.email}).
        </DialogDescription>
      </DialogHeader>

      {error && (
        <Alert variant="destructive" className="my-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between rounded-md bg-muted/60 px-4 py-2 text-sm text-muted-foreground">
        <span>Total capacidades activas:</span>
        <Badge variant="secondary" className="font-mono">
          {effectivePermissions.length} de {ALL_APP_PERMISSIONS.length} permisos
        </Badge>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Cargando matriz de permisos...
        </div>
      ) : (
        <div className="space-y-6 py-2">
          {CATEGORIES.map((category) => {
            const categoryPermissions = ALL_APP_PERMISSIONS.filter(
              (p) => PERMISSIONS_CATALOG[p]?.category === category,
            );

            if (categoryPermissions.length === 0) return null;

            return (
              <div key={category} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h3>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {categoryPermissions.map((perm) => {
                    const meta = PERMISSIONS_CATALOG[perm];
                    const isRoleDefault = roleDefaults.includes(perm);
                    const isCustom = selectedCustom.includes(perm);
                    const isChecked = isRoleDefault || isCustom;

                    return (
                      <div
                        key={perm}
                        className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                          isChecked
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card"
                        }`}
                      >
                        <Checkbox
                          id={`perm-${perm}`}
                          checked={isChecked}
                          disabled={isRoleDefault || updatePermissions.isPending}
                          onCheckedChange={() => toggleCustomPermission(perm)}
                          className="mt-0.5"
                        />
                        <div className="space-y-1 leading-none flex-1">
                          <label
                            htmlFor={`perm-${perm}`}
                            className="text-sm font-medium leading-none cursor-pointer flex items-center justify-between"
                          >
                            <span>{meta.label}</span>
                            {isRoleDefault ? (
                              <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                Por rol
                              </span>
                            ) : isCustom ? (
                              <span className="text-[10px] uppercase font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                Custom
                              </span>
                            ) : null}
                          </label>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {meta.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={updatePermissions.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isLoading || updatePermissions.isPending}
        >
          {updatePermissions.isPending ? "Guardando..." : "Guardar Permisos"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function UserPermissionsDialog({
  open,
  onOpenChange,
  user,
}: UserPermissionsDialogProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl overflow-y-auto">
        {open && (
          <PermissionsContent
            key={user.id}
            user={user}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
