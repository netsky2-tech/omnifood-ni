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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ROLE_LABELS } from "./types";
import type { User } from "./types";
import { useDeactivateUser } from "./use-users";

interface DeactivateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function DeactivateUserDialog({
  open,
  onOpenChange,
  user,
}: DeactivateUserDialogProps) {
  const deactivate = useDeactivateUser();
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleDeactivate = async () => {
    setError(null);
    try {
      await deactivate.mutateAsync(user.id);
      onOpenChange(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error al desactivar al usuario");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Desactivar Usuario</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseás dar de baja al usuario{" "}
            <span className="font-semibold text-foreground">{user.name}</span> ({ROLE_LABELS[user.role]})?
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          Esta acción deshabilitará el acceso de este usuario al POS y al panel de administración. Todas sus sesiones activas serán revocadas inmediatamente.
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deactivate.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={deactivate.isPending}
          >
            {deactivate.isPending ? "Desactivando..." : "Confirmar Desactivación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
