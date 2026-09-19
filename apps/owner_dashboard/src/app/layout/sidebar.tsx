import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  Tag,
  Box,
  Gift,
  Award,
  FlaskConical,
  Users,
  Settings,
  QrCode,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/features/auth/ui-store";
import { useAuthStore } from "@/features/auth/auth-store";
import { useLogout } from "@/features/auth/auth-hooks";
import { canAccessRoute } from "@/lib/rbac";

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
  { label: "Fidelización", path: "/loyalty", icon: Award, section: "Gestión" },
  { label: "Recetas", path: "/recipes", icon: FlaskConical, section: "Gestión" },
  { label: "QR del menú", path: "/menu-qr", icon: QrCode, section: "Gestión" },
  { label: "Usuarios", path: "/users", icon: Users, section: "Administración", requiredRoles: ["OWNER"] },
  { label: "Clientes", path: "/customers", icon: UserCircle, section: "Administración" },
  { label: "Configuración", path: "/settings", icon: Settings, section: "Administración" },
];

export function Sidebar() {
  const location = useLocation();
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    closeMobileSidebar,
  } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  // Auto-close mobile drawer when navigating
  useEffect(() => {
    closeMobileSidebar();
  }, [location.pathname, closeMobileSidebar]);

  // Lock body scroll on mobile when drawer is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeMobileSidebar();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileSidebarOpen, closeMobileSidebar]);

  // Ensure scroll lock is released and drawer is closed if window is resized to desktop (>= 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && mobileSidebarOpen) {
        closeMobileSidebar();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobileSidebarOpen, closeMobileSidebar]);

  const sections = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const section = item.section ?? "Otro";
    acc[section] = [...(acc[section] ?? []), item];
    return acc;
  }, {});

  const filteredSections = Object.entries(sections).map(([section, items]) => ({
    section,
    items: items.filter((item) => canAccessRoute(user?.role, item.path)),
  }));

  const renderNavLinks = (collapsed: boolean) => (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
      {filteredSections.map(({ section, items }) =>
        items.length > 0 ? (
          <div key={section} className="space-y-1">
            {!collapsed ? (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                {section}
              </p>
            ) : (
              <div className="mx-auto my-2 h-px w-8 bg-white/10" />
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
                    "group relative flex items-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                    collapsed
                      ? "h-10 w-full justify-center px-0"
                      : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-white/15 text-white font-semibold shadow-xs"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                  aria-label={item.label}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && (
                    <span
                      className={cn(
                        "absolute left-0 rounded-r-full bg-secondary transition-all",
                        collapsed ? "h-6 w-1 top-2" : "h-6 w-1 top-2",
                      )}
                    />
                  )}
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-105" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ) : null,
      )}
    </nav>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden transition-opacity animate-in fade-in-0 duration-200"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer Offcanvas */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-primary-700 text-white shadow-2xl transition-transform duration-300 ease-in-out lg:hidden",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navegación móvil"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="NHILOS POS"
              className="h-9 w-9 shrink-0 rounded-lg object-contain bg-white p-0.5 shadow-xs"
            />
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white leading-tight">
                NHILOS POS
              </span>
            </div>
          </div>
          <button
            onClick={closeMobileSidebar}
            className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Cerrar menú móvil"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {renderNavLinks(false)}

        <div className="border-t border-white/15 p-4 shrink-0">
          {user && (
            <div className="mb-3 flex items-center gap-3 px-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-white/50 capitalize">{user.role.toLowerCase()}</p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Desktop Persistent Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col shrink-0 bg-primary-700 text-white transition-all duration-200 ease-in-out border-r border-primary-600/30",
          sidebarCollapsed ? "w-[72px]" : "w-[260px]",
        )}
        aria-label="Navegación principal"
      >
        {/* Brand Header with stable height and isotype alignment */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/logo.png"
                  alt="NHILOS POS"
                  className="h-9 w-9 shrink-0 rounded-lg object-contain bg-white p-0.5 shadow-xs"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-base font-bold tracking-tight text-white leading-tight truncate">
                    NHILOS POS
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
                aria-label="Colapsar barra lateral"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="flex w-full items-center justify-between">
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-0.5 shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40 overflow-hidden"
                onClick={toggleSidebar}
                aria-label="Expandir barra lateral"
                title="NHILOS POS — Expandir"
              >
                <img
                  src="/logo.png"
                  alt="NHILOS POS"
                  className="h-full w-full object-contain"
                />
              </button>
              <button
                type="button"
                onClick={toggleSidebar}
                className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
                aria-label="Expandir barra lateral"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {renderNavLinks(sidebarCollapsed)}

        {/* Footer profile & logout */}
        <div className="border-t border-white/15 p-3 shrink-0">
          {!sidebarCollapsed ? (
            <>
              {user && (
                <div className="mb-2 flex items-center gap-2.5 px-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{user.name}</p>
                    <p className="text-xs text-white/50 capitalize">{user.role.toLowerCase()}</p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>Cerrar sesión</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {user && (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white"
                  role="img"
                  aria-label={`Usuario: ${user.name} (${user.role})`}
                  title={`${user.name} (${user.role})`}
                >
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
              )}
              <button
                type="button"
                onClick={logout}
                className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
