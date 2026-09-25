import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { useLogin } from "@/features/auth/auth-hooks";
import { resolveTenantSlug } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  tenantSlug: z.string().trim().min(1, "El tenant es requerido"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  // The tenant slug normally comes from the host subdomain (soho.nhilospos.com -> soho);
  // the field stays editable so the owner can correct or enter it manually.
  const initialTenantSlug = resolveTenantSlug(window.location.hostname) ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      tenantSlug: initialTenantSlug,
    },
  });

  const onSubmit = (data: LoginForm) => {
    if (loginMutation.isPending) return;
    loginMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 flex overflow-y-auto overscroll-contain items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 shadow-lg my-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 mb-3 shadow-md border border-border">
            <img
              src="/logo.png"
              alt="NHILOS POS"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">NHILOS POS</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Panel de administración
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Correo electrónico
            </label>
            <Input
              id="email"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...register("email")}
              placeholder="admin@negocio.com"
              aria-invalid={!!errors.email}
              disabled={loginMutation.isPending}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Contraseña
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                {...register("password")}
                placeholder="••••••••"
                className="pr-10"
                aria-invalid={!!errors.password}
                disabled={loginMutation.isPending}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="tenantSlug"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Tenant (slug)
            </label>
            <Input
              id="tenantSlug"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              {...register("tenantSlug")}
              placeholder="mi-negocio"
              aria-invalid={!!errors.tenantSlug}
              disabled={loginMutation.isPending}
            />
            {errors.tenantSlug && (
              <p className="mt-1 text-xs text-destructive">
                {errors.tenantSlug.message}
              </p>
            )}
          </div>

          {loginMutation.isError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3" role="alert">
              <p className="text-sm text-destructive">
                {loginMutation.error.message === "Session expired"
                  ? "Sesión expirada. Inicie sesión nuevamente."
                  : "Credenciales incorrectas. Intente de nuevo."}
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loginMutation.isPending}
            loading={loginMutation.isPending}
            className="w-full mt-2"
          >
            {loginMutation.isPending ? "Ingresando..." : "Iniciar sesión"}
          </Button>
        </form>
      </div>
    </div>
  );
}
