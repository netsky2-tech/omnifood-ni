import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@/features/auth/auth-hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  tenantSlug: z.string().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground mb-3 shadow-sm">
            N
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
              {...register("email")}
              placeholder="admin@negocio.com"
              aria-invalid={!!errors.email}
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
            <Input
              id="password"
              type="password"
              {...register("password")}
              placeholder="••••••"
              aria-invalid={!!errors.password}
            />
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
              Negocio (opcional)
            </label>
            <Input
              id="tenantSlug"
              type="text"
              {...register("tenantSlug")}
              placeholder="mi-negocio"
            />
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
