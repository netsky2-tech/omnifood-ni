import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppPermission } from "@/features/users/types";
import { useHasPermission } from "@/features/users/use-has-permission";
import {
  useSupervisionPolicy,
  useUpdateSupervisionPolicy,
} from "./use-supervision";
import {
  OPERATION_MODE_LABELS,
  SUPERVISION_ROLE_LABELS,
  SUPERVISION_ROLES,
  resolveSupervisionPolicy,
  supervisionPolicySchema,
  validateSupervisionPolicyForm,
  type SupervisionPolicyFormValues,
  type SupervisionRole,
} from "./types";

/**
 * The tenant's supervision policy, in the backoffice.
 *
 * The copy answers the question the owner actually has ("¿puedo dejar que
 * mi cajero cierre su turno?") instead of exposing the implementation
 * ("auto-autorización por flujo"). Every switch says what it MEANS; the
 * card never hides what "sin definir" means, and it never lets the owner
 * save a configuration that would strand a till at the end of the day.
 */
export function SupervisionPolicyCard() {
  const canConfigure = useHasPermission(AppPermission.SUPERVISION_CONFIGURE);
  const { data, isLoading, isError } = useSupervisionPolicy();
  const updateMutation = useUpdateSupervisionPolicy();
  const [resetOpen, setResetOpen] = useState(false);

  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<SupervisionPolicyFormValues, unknown, SupervisionPolicyFormValues>({
    resolver: zodResolver(supervisionPolicySchema),
    defaultValues: {
      authorizingRoles: [],
      selfAuthorizationAllowedCloseBox: true,
      selfAuthorizationAllowedCashDrawer: false,
      selfAuthorizationAllowedManualDiscount: false,
      supervisorRequiredForModifierQuantity: false,
    },
  });

  const values = watch();
  const validation = useMemo(() => validateSupervisionPolicyForm(values), [values]);

  useEffect(() => {
    if (!data) return;
    // A tenant with no policy shows the DEFAULT it is living with — the
    // default is a named value, not a hidden one (the standard's "never
    // hide uncertainty" applied to a configuration).
    const effective = resolveSupervisionPolicy(
      data.policy ?? data.defaultPolicy,
      data.defaultPolicy,
    );
    reset({
      authorizingRoles: effective.authorizingRoles,
      selfAuthorizationAllowedCloseBox: effective.selfAuthorizationAllowedCloseBox,
      selfAuthorizationAllowedCashDrawer: effective.selfAuthorizationAllowedCashDrawer,
      selfAuthorizationAllowedManualDiscount: effective.selfAuthorizationAllowedManualDiscount,
      supervisorRequiredForModifierQuantity:
        effective.supervisorRequiredForModifierQuantity,
    });
  }, [data, reset]);

  if (!canConfigure) return null;

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center p-12 text-muted-foreground"
        data-testid="supervision-loading"
      >
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Cargando la política de supervisión…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" data-testid="supervision-error">
        <AlertTitle>No pudimos cargar la política de supervisión</AlertTitle>
        <AlertDescription>
          Sus terminales siguen funcionando con la política que ya tienen aplicada. Vuelva a
          intentarlo en unos minutos.
        </AlertDescription>
      </Alert>
    );
  }

  const modeLabel = data?.operationMode
    ? OPERATION_MODE_LABELS[data.operationMode] ?? data.operationMode
    : "Food Park / QSR (mostrador, sin mesas)";

  const onSubmit = (formValues: SupervisionPolicyFormValues) => {
    updateMutation.mutate({
      authorizingRoles: formValues.authorizingRoles,
      selfAuthorizationAllowedCloseBox: formValues.selfAuthorizationAllowedCloseBox,
      selfAuthorizationAllowedCashDrawer: formValues.selfAuthorizationAllowedCashDrawer,
      selfAuthorizationAllowedManualDiscount: formValues.selfAuthorizationAllowedManualDiscount,
      supervisorRequiredForModifierQuantity:
        formValues.supervisorRequiredForModifierQuantity,
    });
  };

  const onReset = () => {
    updateMutation.mutate(null, {
      onSuccess: () => setResetOpen(false),
    });
  };

  const toggleRole = (role: SupervisionRole, checked: boolean) => {
    const current = values.authorizingRoles ?? [];
    const next = checked
      ? [...current, role]
      : current.filter((candidate) => candidate !== role);
    setValue("authorizingRoles", next, { shouldDirty: true });
  };

  return (
    <>
      <Card className="border-border" data-testid="supervision-policy-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Supervisión y autorizaciones
              </CardTitle>
              <CardDescription>
                Quién puede firmar las operaciones sensibles en este negocio, y qué pasa
                cuando no hay nadie disponible para firmarlas.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!data?.configured && (
            <Alert className="mb-6 border-blue-500/30 bg-muted/50 text-foreground">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              <AlertTitle className="font-semibold text-sm">
                Sin definir: cada terminal aplica el valor por defecto
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground mt-1">
                Este negocio no ha configurado la política, así que sus terminales usan el
                valor por defecto de su modo de operación ({modeLabel}). Si guarda aquí, la
                regla queda explícita y aplica a todas las terminales.
              </AlertDescription>
            </Alert>
          )}

          {validation.errors.length > 0 && (
            <Alert
              variant="destructive"
              className="mb-6"
              data-testid="supervision-invariant-error"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="font-semibold text-sm">
                Esta configuración dejaría una operación sin salida
              </AlertTitle>
              <AlertDescription className="text-xs mt-1">
                <ul className="list-disc pl-4 space-y-1">
                  {validation.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <Alert
              className="mb-6 border-amber-500/40 bg-amber-500/10 text-foreground"
              data-testid="supervision-invariant-warning"
            >
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="font-semibold text-sm">Téngalo en cuenta</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground mt-1">
                <ul className="list-disc pl-4 space-y-1">
                  {validation.warnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-6"
            data-testid="supervision-policy-form"
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">
                Quién puede autorizar
              </legend>
              <p className="text-xs text-muted-foreground">
                Estas son las personas que pueden firmar en nombre del negocio una gaveta,
                un descuento o el cierre del turno. Si no hay ninguna en el turno, el
                operador puede firmar su propia operación (vea las opciones de abajo).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {SUPERVISION_ROLES.map((role) => {
                  const meta = SUPERVISION_ROLE_LABELS[role];
                  const checked = (values.authorizingRoles ?? []).includes(role);
                  const id = `supervision-role-${role}`;
                  return (
                    <div
                      key={role}
                      className="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(next) => toggleRole(role, next === true)}
                        aria-label={meta.label}
                        className="mt-0.5"
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
                          {meta.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {meta.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {errors.authorizingRoles && (
                <p className="text-xs text-destructive">
                  {errors.authorizingRoles.message}
                </p>
              )}
            </fieldset>

            <fieldset className="space-y-3 border rounded-lg p-4 bg-card">
              <legend className="text-sm font-medium text-foreground px-1">
                Operaciones que aceptan la firma del propio operador
              </legend>
              <p className="text-xs text-muted-foreground">
                Cuando el turno lo opera una sola persona y no hay a quién pedirle la
                firma, el operador puede firmar su propia operación. Queda registrado con su
                credencial y el nombre, para que usted lo revise después.
              </p>

              <div className="flex items-start justify-between gap-4 pt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="selfAuthorizationAllowedCloseBox" className="text-sm font-medium">
                    Cerrar el turno (Corte Z)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    El cierre del turno es una obligación fiscal: si nadie más puede
                    firmarlo, el corte tiene que poder completarse igual.
                  </p>
                </div>
                <Switch
                  id="selfAuthorizationAllowedCloseBox"
                  checked={values.selfAuthorizationAllowedCloseBox}
                  onCheckedChange={(checked) =>
                    setValue("selfAuthorizationAllowedCloseBox", checked, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="selfAuthorizationAllowedCashDrawer" className="text-sm font-medium">
                    Abrir la gaveta a mano
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Aperturas y retiros de dinero sin una venta asociada.
                  </p>
                </div>
                <Switch
                  id="selfAuthorizationAllowedCashDrawer"
                  checked={values.selfAuthorizationAllowedCashDrawer}
                  onCheckedChange={(checked) =>
                    setValue("selfAuthorizationAllowedCashDrawer", checked, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="selfAuthorizationAllowedManualDiscount" className="text-sm font-medium">
                    Aplicar un descuento manual
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Descuentos fuera de las promociones programadas. Si está apagado, el
                    cajero no puede descontar sin la firma de un supervisor.
                  </p>
                </div>
                <Switch
                  id="selfAuthorizationAllowedManualDiscount"
                  checked={values.selfAuthorizationAllowedManualDiscount}
                  onCheckedChange={(checked) =>
                    setValue("selfAuthorizationAllowedManualDiscount", checked, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="supervisorRequiredForModifierQuantity" className="text-sm font-medium">
                    Exigir supervisor para ajustar la cantidad de un extra
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Por defecto, la cantidad que descuenta un extra la define su
                    configuración y el cajero puede ajustarla dejando el motivo. Si lo
                    activa, el ajuste necesita la firma de un supervisor.
                  </p>
                </div>
                <Switch
                  id="supervisorRequiredForModifierQuantity"
                  checked={values.supervisorRequiredForModifierQuantity}
                  onCheckedChange={(checked) =>
                    setValue("supervisorRequiredForModifierQuantity", checked, {
                      shouldDirty: true,
                    })
                  }
                />
              </div>
            </fieldset>

            <div className="flex items-center justify-between gap-3 pt-4 border-t">
              <div className="max-w-md space-y-1">
                <p className="text-xs text-muted-foreground">
                  Las terminales aplican la política en su próxima sincronización. Mientras
                  no haya conexión, siguen con la que ya tenían.
                </p>
                {/* Contextual navigation: the configuration and the review of
                what it produced live one click apart, and the review carries
                the period with it. */}
                <p className="text-xs">
                  <Link
                    to="/audit?view=supervision"
                    className="text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Ver qué se firmó en sus cajas
                  </Link>
                </p>
              </div>
              <div className="flex items-center gap-3">
                {data?.configured && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setResetOpen(true)}
                    disabled={updateMutation.isPending}
                    data-testid="supervision-reset-button"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restablecer
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    updateMutation.isPending ||
                    !isDirty ||
                    validation.errors.length > 0
                  }
                  data-testid="supervision-save-button"
                >
                  {updateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Guardar política
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Restablecer la política?</DialogTitle>
            <DialogDescription>
              Sus terminales volverán a aplicar el valor por defecto de su modo de
              operación ({modeLabel}). La configuración actual deja de estar en vigor en la
              próxima sincronización.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onReset}
              disabled={updateMutation.isPending}
              data-testid="supervision-reset-confirm"
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Restablecer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
