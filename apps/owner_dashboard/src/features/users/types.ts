import { z } from "zod";

export const UserRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAITER: "WAITER",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES = [
  UserRole.OWNER,
  UserRole.MANAGER,
  UserRole.CASHIER,
  UserRole.WAITER,
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.OWNER]: "Dueño (Owner)",
  [UserRole.MANAGER]: "Gerente (Manager)",
  [UserRole.CASHIER]: "Cajero (Cashier)",
  [UserRole.WAITER]: "Mesero (Waiter)",
};

export const AppPermission = {
  // Core Operational Capabilities
  SALES_VOID_INVOICE: "sales:void_invoice",
  SALES_DISCOUNT_OVERRIDE: "sales:discount_override",
  SALES_ITEM_CANCEL: "sales:item_cancel",
  SALES_PRICE_OVERRIDE: "sales:price_override",
  CASH_MANUAL_DRAWER_OPEN: "cash:manual_drawer_open",
  CASH_REOPEN_SHIFT: "cash:reopen_shift",
  INVENTORY_RECIPE_EDIT: "inventory:recipe_edit",
  REPORTS_VIEW_FISCAL: "reports:view_fiscal",
  // Loyalty Capabilities
  LOYALTY_PROGRAM_READ: "loyalty:program_read",
  LOYALTY_PROGRAM_WRITE: "loyalty:program_write",
  LOYALTY_REWARD_READ: "loyalty:reward_read",
  LOYALTY_REWARD_WRITE: "loyalty:reward_write",
  LOYALTY_CUSTOMER_READ: "loyalty:customer_read",
  LOYALTY_HISTORY_READ: "loyalty:history_read",
  LOYALTY_ADJUST: "loyalty:adjust",
  LOYALTY_REDEEM: "loyalty:redeem",
} as const;

export type AppPermission = (typeof AppPermission)[keyof typeof AppPermission];

export const ALL_APP_PERMISSIONS: AppPermission[] = Object.values(AppPermission);

export interface PermissionMetadata {
  key: AppPermission;
  label: string;
  description: string;
  category: "Ventas" | "Caja & Turnos" | "Inventario" | "Reportes" | "Lealtad";
}

export const PERMISSIONS_CATALOG: Record<AppPermission, PermissionMetadata> = {
  [AppPermission.SALES_VOID_INVOICE]: {
    key: AppPermission.SALES_VOID_INVOICE,
    label: "Anular Facturas",
    description: "Permite anular facturas fiscales emitidas según normativa DGI",
    category: "Ventas",
  },
  [AppPermission.SALES_DISCOUNT_OVERRIDE]: {
    key: AppPermission.SALES_DISCOUNT_OVERRIDE,
    label: "Descuento Supervisor",
    description: "Aplicar descuentos manuales fuera de promociones programadas",
    category: "Ventas",
  },
  [AppPermission.SALES_ITEM_CANCEL]: {
    key: AppPermission.SALES_ITEM_CANCEL,
    label: "Cancelar Comanda",
    description: "Cancelar ítems ya enviados a comandera o cocina",
    category: "Ventas",
  },
  [AppPermission.SALES_PRICE_OVERRIDE]: {
    key: AppPermission.SALES_PRICE_OVERRIDE,
    label: "Modificar Precio en Línea",
    description: "Sobrescribir el precio de lista de un producto en el POS",
    category: "Ventas",
  },
  [AppPermission.CASH_MANUAL_DRAWER_OPEN]: {
    key: AppPermission.CASH_MANUAL_DRAWER_OPEN,
    label: "Apertura Manual de Gaveta",
    description: "Abrir gaveta de dinero sin transacción de venta asociada",
    category: "Caja & Turnos",
  },
  [AppPermission.CASH_REOPEN_SHIFT]: {
    key: AppPermission.CASH_REOPEN_SHIFT,
    label: "Reabrir Turno de Caja",
    description: "Reapertura o modificación de arqueo en turnos ya cerrados",
    category: "Caja & Turnos",
  },
  [AppPermission.INVENTORY_RECIPE_EDIT]: {
    key: AppPermission.INVENTORY_RECIPE_EDIT,
    label: "Editar Recetas & Fórmulas",
    description: "Modificar fichas técnicas y BOM de productos compuestos",
    category: "Inventario",
  },
  [AppPermission.REPORTS_VIEW_FISCAL]: {
    key: AppPermission.REPORTS_VIEW_FISCAL,
    label: "Ver Reportes Fiscales",
    description: "Visualizar Cortes Z, libros de ventas y resúmenes DGI",
    category: "Reportes",
  },
  [AppPermission.LOYALTY_PROGRAM_READ]: {
    key: AppPermission.LOYALTY_PROGRAM_READ,
    label: "Consultar Programas de Lealtad",
    description: "Visualizar configuraciones y reglas de acumulación",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_PROGRAM_WRITE]: {
    key: AppPermission.LOYALTY_PROGRAM_WRITE,
    label: "Configurar Programas de Lealtad",
    description: "Crear y modificar programas y factores de puntos",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_REWARD_READ]: {
    key: AppPermission.LOYALTY_REWARD_READ,
    label: "Consultar Recompensas",
    description: "Ver catálogo de premios y costo de puntos",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_REWARD_WRITE]: {
    key: AppPermission.LOYALTY_REWARD_WRITE,
    label: "Modificar Recompensas",
    description: "Crear, activar y pausar premios canjeables",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_CUSTOMER_READ]: {
    key: AppPermission.LOYALTY_CUSTOMER_READ,
    label: "Consultar Clientes y Saldos",
    description: "Buscar perfiles y balances de puntos acumulados",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_HISTORY_READ]: {
    key: AppPermission.LOYALTY_HISTORY_READ,
    label: "Historial de Puntos",
    description: "Auditar transacciones de acumulación y canje",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_ADJUST]: {
    key: AppPermission.LOYALTY_ADJUST,
    label: "Ajuste Manual de Puntos",
    description: "Bonificar o debitar puntos con justificación auditada",
    category: "Lealtad",
  },
  [AppPermission.LOYALTY_REDEEM]: {
    key: AppPermission.LOYALTY_REDEEM,
    label: "Procesar Canje de Puntos",
    description: "Autorizar redenciones en punto de venta",
    category: "Lealtad",
  },
};

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, readonly AppPermission[]> = {
  [UserRole.OWNER]: [
    AppPermission.SALES_VOID_INVOICE,
    AppPermission.SALES_DISCOUNT_OVERRIDE,
    AppPermission.SALES_ITEM_CANCEL,
    AppPermission.SALES_PRICE_OVERRIDE,
    AppPermission.CASH_MANUAL_DRAWER_OPEN,
    AppPermission.CASH_REOPEN_SHIFT,
    AppPermission.INVENTORY_RECIPE_EDIT,
    AppPermission.REPORTS_VIEW_FISCAL,
    AppPermission.LOYALTY_PROGRAM_READ,
    AppPermission.LOYALTY_PROGRAM_WRITE,
    AppPermission.LOYALTY_REWARD_READ,
    AppPermission.LOYALTY_REWARD_WRITE,
    AppPermission.LOYALTY_CUSTOMER_READ,
    AppPermission.LOYALTY_HISTORY_READ,
    AppPermission.LOYALTY_ADJUST,
    AppPermission.LOYALTY_REDEEM,
  ],
  [UserRole.MANAGER]: [
    AppPermission.SALES_VOID_INVOICE,
    AppPermission.SALES_DISCOUNT_OVERRIDE,
    AppPermission.SALES_ITEM_CANCEL,
    AppPermission.SALES_PRICE_OVERRIDE,
    AppPermission.CASH_MANUAL_DRAWER_OPEN,
    AppPermission.CASH_REOPEN_SHIFT,
    AppPermission.REPORTS_VIEW_FISCAL,
    AppPermission.LOYALTY_PROGRAM_READ,
    AppPermission.LOYALTY_REWARD_READ,
    AppPermission.LOYALTY_CUSTOMER_READ,
    AppPermission.LOYALTY_HISTORY_READ,
  ],
  [UserRole.CASHIER]: [],
  [UserRole.WAITER]: [],
};

export function resolveEffectivePermissions(
  role: UserRole | string,
  customPermissions: (AppPermission | string)[] = [],
): AppPermission[] {
  const roleDefaults: AppPermission[] =
    role in DEFAULT_ROLE_PERMISSIONS
      ? [...DEFAULT_ROLE_PERMISSIONS[role as UserRole]]
      : [];

  const validCustom = customPermissions.filter((p): p is AppPermission =>
    ALL_APP_PERMISSIONS.includes(p as AppPermission),
  );

  return Array.from(new Set([...roleDefaults, ...validCustom]));
}

// Data Entities
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PermissionMatrixResponse {
  role_defaults: Record<string, AppPermission[]>;
  all_permissions: AppPermission[];
}

export interface UserEffectivePermissionsResponse {
  user_id: string;
  role: string;
  role_permissions: AppPermission[];
  custom_permissions: AppPermission[];
  effective_permissions: AppPermission[];
}

// Zod Validation Schemas
const pinRegex = /^\d{4,8}$/;

export const createUserSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Debe ser un correo electrónico válido"),
  role: z.enum([UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER], {
    message: "Rol inválido",
  }),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .optional()
    .or(z.literal("")),
  pin: z
    .string()
    .regex(pinRegex, "El PIN debe ser puramente numérico y contener entre 4 y 8 dígitos")
    .optional()
    .or(z.literal("")),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
  role: z
    .enum([UserRole.OWNER, UserRole.MANAGER, UserRole.CASHIER, UserRole.WAITER])
    .optional(),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .optional()
    .or(z.literal("")),
  pin: z
    .string()
    .regex(pinRegex, "El PIN debe ser puramente numérico y contener entre 4 y 8 dígitos")
    .optional()
    .or(z.literal("")),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updatePermissionsSchema = z.object({
  custom_permissions: z
    .array(
      z.enum(
        ALL_APP_PERMISSIONS as [AppPermission, ...AppPermission[]],
        { message: "Permiso inválido" },
      ),
    )
    .refine(
      (items) => new Set(items).size === items.length,
      { message: "La lista de permisos no puede contener duplicados" },
    ),
});

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
