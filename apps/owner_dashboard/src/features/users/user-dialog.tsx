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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  UserRole,
  USER_ROLES,
  ROLE_LABELS,
  createUserSchema,
  updateUserSchema,
} from "./types";
import type { User } from "./types";
import { useCreateUser, useUpdateUser } from "./use-users";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: User | null;
}

interface UserFormProps {
  userToEdit?: User | null;
  onClose: () => void;
}

function UserForm({ userToEdit, onClose }: UserFormProps) {
  const isEdit = Boolean(userToEdit);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [name, setName] = useState(userToEdit?.name ?? "");
  const [email, setEmail] = useState(userToEdit?.email ?? "");
  const [role, setRole] = useState<UserRole>(userToEdit?.role ?? UserRole.CASHIER);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (isEdit && userToEdit) {
        const payload = {
          name,
          role,
          ...(password.trim() ? { password } : {}),
          ...(pin.trim() ? { pin } : {}),
        };
        const validation = updateUserSchema.safeParse(payload);
        if (!validation.success) {
          setError(validation.error.issues[0]?.message ?? "Error de validación");
          return;
        }
        await updateUser.mutateAsync({ id: userToEdit.id, input: payload });
      } else {
        const payload = {
          name,
          email,
          role,
          ...(password.trim() ? { password } : {}),
          ...(pin.trim() ? { pin } : {}),
        };
        const validation = createUserSchema.safeParse(payload);
        if (!validation.success) {
          setError(validation.error.issues[0]?.message ?? "Error de validación");
          return;
        }
        await createUser.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Ocurrió un error inesperado al guardar el usuario");
      }
    }
  };

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Actualizá la información, rol o credenciales del usuario."
            : "Creá un nuevo usuario y asignale su rol de acceso al sistema."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="user-name">Nombre Completo *</Label>
          <Input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Carlos Mendoza"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="user-email">Correo Electrónico *</Label>
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="carlos@omnifood.ni"
            required={!isEdit}
            disabled={isEdit || isPending}
          />
          {isEdit && (
            <p className="text-xs text-muted-foreground">
              El correo electrónico no puede modificarse.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="user-role">Rol de Acceso *</Label>
          <select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-password">
              {isEdit ? "Nueva Contraseña" : "Contraseña"}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "Dejar en blanco para mantener" : "Mín. 6 caracteres"}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-pin">
              {isEdit ? "Nuevo PIN POS" : "PIN POS / Supervisor"}
            </Label>
            <Input
              id="user-pin"
              type="password"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={isEdit ? "Dejar en blanco" : "4 a 8 dígitos"}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : isEdit ? "Guardar Cambios" : "Crear Usuario"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function UserDialog({ open, onOpenChange, userToEdit }: UserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <UserForm
            key={userToEdit?.id ?? "new-user"}
            userToEdit={userToEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
