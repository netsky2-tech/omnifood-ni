import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@/features/auth/auth-hooks";

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
    <div className="flex min-h-screen items-center justify-center bg-primary-50">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">NHILOS POS</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Panel de administración
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="admin@negocio.com"
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
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="••••••"
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
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Negocio (opcional)
            </label>
            <input
              id="tenantSlug"
              type="text"
              {...register("tenantSlug")}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="mi-negocio"
            />
          </div>

          {loginMutation.isError && (
            <div className="rounded-md border border-destructive/20 bg-destructive-50 p-3">
              <p className="text-sm text-destructive">
                {loginMutation.error.message === "Session expired"
                  ? "Sesión expirada. Inicie sesión nuevamente."
                  : "Credenciales incorrectas. Intente de nuevo."}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loginMutation.isPending ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
