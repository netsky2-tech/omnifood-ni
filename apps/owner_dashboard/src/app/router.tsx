import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/app/layout/app-layout";
import { ProtectedRoute } from "@/app/protected-route";
import { SuspenseWrapper } from "@/app/layout/page-loader";

const LoginPage = lazy(() =>
  import("@/features/auth/login-page").then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import("@/features/dashboard/dashboard-page").then((m) => ({ default: m.DashboardPage })),
);
const SalesPage = lazy(() =>
  import("@/features/sales/sales-page").then((m) => ({ default: m.SalesPage })),
);
const InventoryPage = lazy(() =>
  import("@/features/inventory/inventory-page").then((m) => ({ default: m.InventoryPage })),
);
const FiscalPage = lazy(() =>
  import("@/features/fiscal/fiscal-page").then((m) => ({ default: m.FiscalPage })),
);
const CatalogPage = lazy(() =>
  import("@/features/catalog/catalog-page").then((m) => ({ default: m.CatalogPage })),
);
const ProductPage = lazy(() =>
  import("@/features/catalog/product-page").then((m) => ({ default: m.ProductPage })),
);
const PromotionsPage = lazy(() =>
  import("@/features/promotions/promotions-page").then((m) => ({ default: m.PromotionsPage })),
);
const RecipesPage = lazy(() =>
  import("@/features/recipes/recipes-page").then((m) => ({ default: m.RecipesPage })),
);
const UsersPage = lazy(() =>
  import("@/features/users/users-page").then((m) => ({ default: m.UsersPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/settings-page").then((m) => ({ default: m.SettingsPage })),
);
const CustomersPage = lazy(() =>
  import("@/features/customers/customers-page").then((m) => ({ default: m.CustomersPage })),
);

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
          <SuspenseWrapper>
            <DashboardPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "sales",
        element: (
          <SuspenseWrapper>
            <SalesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "inventory",
        element: (
          <SuspenseWrapper>
            <InventoryPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "fiscal",
        element: (
          <SuspenseWrapper>
            <FiscalPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "catalog",
        element: (
          <SuspenseWrapper>
            <CatalogPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "products",
        element: (
          <SuspenseWrapper>
            <ProductPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "promotions",
        element: (
          <SuspenseWrapper>
            <PromotionsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "recipes",
        element: (
          <SuspenseWrapper>
            <RecipesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute requiredRoles={["OWNER"]}>
            <SuspenseWrapper>
              <UsersPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        ),
      },
      {
        path: "customers",
        element: (
          <SuspenseWrapper>
            <CustomersPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "settings",
        element: (
          <SuspenseWrapper>
            <SettingsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
