import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Tag,
  Box,
  Gift,
  FlaskConical,
  Users,
  Settings,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/features/auth/ui-store";
import { useAuthStore } from "@/features/auth/auth-store";
import { useLogout } from "@/features/auth/auth-hooks";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: string;
  requiredRoles?: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, section: "Principal" },
  { label: "Ventas", path: "/sales", icon: ShoppingCart, section: "Principal" },
  { label: "Inventario", path: "/inventory", icon: Package, section: "Principal" },
  { label: "Fiscal", path: "/fiscal", icon: FileText, section: "Principal" },
  { label: "Catálogo", path: "/catalog", icon: Tag, section: "Gestión" },
  { label: "Productos", path: "/products", icon: Box, section: "Gestión" },
  { label: "Promociones", path: "/promotions", icon: Gift, section: "Gestión" },
  { label: "Recetas", path: "/recipes", icon: FlaskConical, section: "Gestión" },
  { label: "Usuarios", path: "/users", icon: Users, section: "Administración", requiredRoles: ["OWNER"] },
  { label: "Clientes", path: "/customers", icon: UserCircle, section: "Administración" },
  { label: "Configuración", path: "/settings", icon: Settings, section: "Administración" },
];

export function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  const sections = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const section = item.section ?? "Otro";
    acc[section] = [...(acc[section] ?? []), item];
    return acc;
  }, {});

  const filteredSections = Object.entries(sections).map(([section, items]) => ({
    section,
    items: items.filter(
      (item) => !item.requiredRoles || item.requiredRoles.includes(user?.role ?? ""),
    ),
  }));

  return (
    <aside
      className={cn(
        "flex flex-col bg-primary-700 text-white transition-all duration-200",
        sidebarCollapsed ? "w-[72px]" : "w-[260px]",
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        {!sidebarCollapsed && (
          <span className="text-lg font-bold tracking-tight">NHILOS POS</span>
        )}
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {filteredSections.map(({ section, items }) =>
          items.length > 0 ? (
            <div key={section}>
              {!sidebarCollapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  {section}
                </p>
              )}
              {items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-l-[3px] border-secondary bg-white/10 pl-[9px] text-white"
                        : "text-white/70 hover:bg-white/10 hover:text-white",
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ) : null,
        )}
      </nav>

      <div className="border-t border-white/15 p-3">
        {!sidebarCollapsed && user && (
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-xs text-white/50">{user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          title={sidebarCollapsed ? "Cerrar sesión" : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!sidebarCollapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
