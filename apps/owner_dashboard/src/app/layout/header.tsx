import { Menu, Store, User, LogOut } from "lucide-react";
import { useAuthStore } from "@/features/auth/auth-store";
import { useUiStore } from "@/features/auth/ui-store";
import { useLogout } from "@/features/auth/auth-hooks";
import { useTenantContext } from "@/lib/tenant";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const authTenant = useAuthStore((s) => s.tenant);
  const contextTenant = useTenantContext((s) => s.tenant);
  const tenant = authTenant ?? contextTenant;
  const user = useAuthStore((s) => s.user);
  const toggleMobileSidebar = useUiStore((s) => s.toggleMobileSidebar);
  const logout = useLogout();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6 lg:px-8 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-initial">
        <button
          onClick={toggleMobileSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 lg:hidden cursor-pointer"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <Store className="h-5 w-5 text-primary shrink-0 hidden sm:block" />
          <div className="flex flex-col min-w-0">
            <h2
              className="text-base sm:text-lg font-semibold text-foreground truncate max-w-[180px] xs:max-w-[220px] sm:max-w-xs md:max-w-md"
              title={tenant?.name ?? "OmniCommerce"}
            >
              {tenant?.name ?? "OmniCommerce"}
            </h2>
            {tenant?.ruc && (
              <span
                className="text-[11px] text-muted-foreground hidden sm:inline truncate max-w-[180px] sm:max-w-xs"
                title={`RUC: ${tenant.ruc}`}
              >
                RUC: {tenant.ruc}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2.5 rounded-full p-1 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer transition-colors"
                aria-label="Menú de usuario"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-xs">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="hidden text-left md:block">
                  <p className="text-xs font-semibold text-foreground leading-none">{user.name}</p>
                  <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{user.role.toLowerCase()}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-muted-foreground cursor-default">
                <User className="mr-2 h-4 w-4" />
                Rol: <span className="font-semibold text-foreground ml-1">{user.role}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-destructive focus:bg-destructive-50 focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
