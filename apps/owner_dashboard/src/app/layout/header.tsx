import { useAuthStore } from "@/features/auth/auth-store";

export function Header() {
  const tenant = useAuthStore((s) => s.tenant);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-white px-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {tenant?.name ?? "OmniCommerce"}
        </h2>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {tenant?.ruc && `RUC: ${tenant.ruc}`}
        </span>
      </div>
    </header>
  );
}
