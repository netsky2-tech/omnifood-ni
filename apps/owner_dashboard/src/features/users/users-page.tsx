import { useState } from "react";
import { UserPlus, Shield, Edit, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserRole, ROLE_LABELS } from "./types";
import type { User } from "./types";
import { useUsers } from "./use-users";
import { UserDialog } from "./user-dialog";
import { UserPermissionsDialog } from "./user-permissions-dialog";
import { DeactivateUserDialog } from "./deactivate-user-dialog";

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers();

  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

  const filteredUsers = (users ?? []).filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      ROLE_LABELS[u.role].toLowerCase().includes(q)
    );
  });

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case UserRole.OWNER:
        return "default";
      case UserRole.MANAGER:
        return "secondary";
      case UserRole.CASHIER:
        return "outline";
      case UserRole.WAITER:
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Gestión de Usuarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Administrá roles, credenciales y matriz de permisos granulares de supervisor.
          </p>
        </div>

        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          <span>+ Nuevo Usuario</span>
        </Button>
      </div>

      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error
              ? error.message
              : "Error al cargar el listado de usuarios"}
          </AlertDescription>
        </Alert>
      )}

      {/* Search Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, correo o rol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Users Data Table */}
      <div className="rounded-md border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha de Alta</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  Cargando usuarios...
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {search ? "No se encontraron usuarios que coincidan con la búsqueda" : "No hay usuarios registrados"}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{u.name}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(u.role)}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={u.is_active ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {u.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(u)}
                        title="Editar usuario"
                        className="h-8 px-2"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        <span className="text-xs">Editar</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPermissionsUser(u)}
                        title="Permisos granulares"
                        className="h-8 px-2"
                      >
                        <Shield className="h-3.5 w-3.5 mr-1" />
                        <span className="text-xs">Permisos</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeactivatingUser(u)}
                        title="Desactivar usuario"
                        className="h-8 px-2 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        <span className="text-xs">Baja</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <UserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <UserDialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
        userToEdit={editingUser}
      />

      <UserPermissionsDialog
        open={Boolean(permissionsUser)}
        onOpenChange={(open) => !open && setPermissionsUser(null)}
        user={permissionsUser}
      />

      <DeactivateUserDialog
        open={Boolean(deactivatingUser)}
        onOpenChange={(open) => !open && setDeactivatingUser(null)}
        user={deactivatingUser}
      />
    </div>
  );
}
