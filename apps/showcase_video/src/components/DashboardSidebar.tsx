import React from 'react';
import { staticFile, Img } from 'remotion';
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Package,
  FileText,
  Tag,
  Box,
  Gift,
  SlidersHorizontal,
  Award,
  FlaskConical,
  Calculator,
  QrCode,
  Users,
  History,
  ClipboardCheck,
  Smartphone,
  Settings,
  UserCircle,
  LogOut,
  ChevronLeft,
} from 'lucide-react';

interface DashboardSidebarProps {
  activePath: string;
  compact?: boolean;
  userName?: string;
  userRole?: string;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Mirrors apps/owner_dashboard/src/app/layout/sidebar.tsx.
 * Order, labels, sections and icons are taken verbatim from the real
 * navigation model; no invented destinations, no omitted options.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Ventas', path: '/sales', icon: ShoppingCart },
      { label: 'Inventario', path: '/inventory', icon: Package },
      { label: 'Fiscal', path: '/fiscal', icon: FileText },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { label: 'Sesiones de caja', path: '/cash', icon: Wallet },
      { label: 'Correcciones de inventario', path: '/kardex', icon: ClipboardCheck },
      { label: 'Costo por plato', path: '/dish-margins', icon: Calculator },
      { label: 'Catálogo', path: '/catalog', icon: Tag },
      { label: 'Productos', path: '/products', icon: Box },
      { label: 'Promociones', path: '/promotions', icon: Gift },
      { label: 'Modificadores', path: '/modifiers', icon: SlidersHorizontal },
      { label: 'Fidelización', path: '/loyalty', icon: Award },
      { label: 'Recetas', path: '/recipes', icon: FlaskConical },
      { label: 'QR del menú', path: '/menu-qr', icon: QrCode },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Usuarios', path: '/users', icon: Users },
      { label: 'Dispositivos', path: '/devices', icon: Smartphone },
      { label: 'Auditoría', path: '/audit', icon: History },
      { label: 'Clientes', path: '/customers', icon: UserCircle },
      { label: 'Configuración', path: '/settings', icon: Settings },
    ],
  },
];

const isActivePath = (activePath: string, path: string): boolean =>
  path === '/' ? activePath === '/' : activePath.startsWith(path);

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activePath,
  compact = false,
  userName = 'Roberto Morales',
  userRole = 'Owner',
}) => {
  const navClass = compact ? 'space-y-2 py-2' : 'space-y-3 py-3';
  const sectionClass = 'space-y-0.5';
  const sectionLabelClass = compact
    ? 'text-[9.5px]'
    : 'text-[10.5px]';
  const itemClass = compact
    ? 'gap-2.5 px-3 py-[5px] text-[11.5px]'
    : 'gap-2.5 px-3 py-1.5 text-[13px]';
  const iconClass = compact ? 'h-3 w-3' : 'h-4 w-4';
  const activeBarClass = compact ? 'top-1.5 h-4' : 'top-2 h-6';

  return (
    <aside className="w-[260px] shrink-0 border-r border-white/10 bg-[#011f32] text-white flex flex-col select-none">
      <div
        className={`flex shrink-0 items-center justify-between border-b border-white/10 px-4 ${
          compact ? 'h-14' : 'h-16'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <Img
              src={staticFile('logo.png')}
              alt="NHILOS POS"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold leading-tight tracking-tight text-white">
              NHILOS POS
            </span>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-white/70"
          aria-label="Colapsar barra lateral"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav
        className={`flex-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${navClass}`}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className={sectionClass}>
            <p
              className={`px-3 pb-1 font-semibold uppercase tracking-wider text-white/50 ${sectionLabelClass}`}
            >
              {section.title}
            </p>
            {section.items.map((item) => {
              const active = isActivePath(activePath, item.path);
              const Icon = item.icon;
              return (
                <div
                  key={item.path}
                  className={`relative flex items-center rounded-md font-medium ${itemClass} ${
                    active
                      ? 'bg-white/15 font-semibold text-white shadow-xs'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {active && (
                    <span
                      className={`absolute left-0 w-1 rounded-r-full bg-secondary ${activeBarClass}`}
                    />
                  )}
                  <Icon className={`shrink-0 ${iconClass}`} />
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`shrink-0 border-t border-white/15 ${compact ? 'p-2.5' : 'p-3'}`}>
        <div className={`flex items-center gap-2.5 px-1 ${compact ? '' : 'mb-2'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="text-xs capitalize text-white/50">{userRole.toLowerCase()}</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70">
          <LogOut className="h-5 w-5 shrink-0" />
          <span>Cerrar sesión</span>
        </div>
      </div>
    </aside>
  );
};
