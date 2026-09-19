import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "@/app/layout/app-layout";
import { ProtectedRoute } from "@/app/protected-route";
import { SuspenseWrapper } from "@/app/layout/page-loader";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

const LoginPage = lazyWithRetry(() =>
  import("@/features/auth/login-page").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazyWithRetry(() =>
  import("@/features/dashboard/dashboard-page").then((m) => ({ default: m.DashboardPage })),
);
const SalesPage = lazyWithRetry(() =>
  import("@/features/sales/sales-page").then((m) => ({ default: m.SalesPage })),
);
const InventoryPage = lazyWithRetry(() =>
  import("@/features/inventory/inventory-page").then((m) => ({ default: m.InventoryPage })),
);
const FiscalPage = lazyWithRetry(() =>
  import("@/features/fiscal/fiscal-page").then((m) => ({ default: m.FiscalPage })),
);
const CatalogPage = lazyWithRetry(() =>
  import("@/features/catalog/catalog-page").then((m) => ({ default: m.CatalogPage })),
);
const ProductPage = lazyWithRetry(() =>
  import("@/features/catalog/product-page").then((m) => ({ default: m.ProductPage })),
);
const PromotionsPage = lazyWithRetry(() =>
  import("@/features/promotions/promotions-page").then((m) => ({ default: m.PromotionsPage })),
);
const RecipesPage = lazyWithRetry(() =>
  import("@/features/recipes/recipes-page").then((m) => ({ default: m.RecipesPage })),
);
const UsersPage = lazyWithRetry(() =>
  import("@/features/users/users-page").then((m) => ({ default: m.UsersPage })),
);
const SettingsPage = lazyWithRetry(() =>
  import("@/features/settings/settings-page").then((m) => ({ default: m.SettingsPage })),
);
const CustomersPage = lazyWithRetry(() =>
  import("@/features/customers/customers-page").then((m) => ({ default: m.CustomersPage })),
);
const LoyaltyPage = lazyWithRetry(() =>
  import("@/features/loyalty/loyalty-page").then((m) => ({ default: m.LoyaltyPage })),
);
const NotFoundPage = lazyWithRetry(() =>
  import("@/app/not-found-page").then((m) => ({ default: m.NotFoundPage })),
);

import { ROUTE_ROLE_PERMISSIONS } from "@/lib/rbac";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <SuspenseWrapper>
        <LoginPage />
      </SuspenseWrapper>
    ),
  },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/"]}>
            <SuspenseWrapper>
              <DashboardPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "sales",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/sales"]}>
            <SuspenseWrapper>
              <SalesPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "inventory",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/inventory"]}>
            <SuspenseWrapper>
              <InventoryPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "fiscal",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/fiscal"]}>
            <SuspenseWrapper>
              <FiscalPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "catalog",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/catalog"]}>
            <SuspenseWrapper>
              <CatalogPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "products",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/products"]}>
            <SuspenseWrapper>
              <ProductPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "promotions",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/promotions"]}>
            <SuspenseWrapper>
              <PromotionsPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "recipes",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/recipes"]}>
            <SuspenseWrapper>
              <RecipesPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/users"]}>
            <SuspenseWrapper>
              <UsersPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "customers",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/customers"]}>
            <SuspenseWrapper>
              <CustomersPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "loyalty",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/loyalty"]}>
            <SuspenseWrapper>
              <LoyaltyPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedRoute requiredRoles={ROUTE_ROLE_PERMISSIONS["/settings"]}>
            <SuspenseWrapper>
              <SettingsPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "*",
        element: (
          <SuspenseWrapper>
            <NotFoundPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
]);
