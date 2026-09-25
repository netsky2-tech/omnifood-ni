import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FiscalRegime,
  fiscalSetupSchema,
  type FiscalSetupFormValues,
} from "./types";
import { useFiscalSetup, useUpdateFiscalSetup } from "./use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  resolveDgiAuthorizationExpiryStatus,
} from "./types";
import { ShieldCheck, Loader2, Landmark, CalendarClock, AlertTriangle } from "lucide-react";

/**
 * D-21 (#554): normalizes a snapshot date (date-only or full ISO-8601) to
 * the YYYY-MM-DD value <input type="date"> can display. Unparseable input
 * yields "" — an absent field, never a corrupted one.
 */
function toDateInputValue(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return (dateOnly?.[1] as string | undefined) ?? "";
}

export function FiscalSetupForm() {
  const { data: initialData, isLoading, isError } = useFiscalSetup();
  const updateMutation = useUpdateFiscalSetup();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FiscalSetupFormValues>({
    resolver: zodResolver(fiscalSetupSchema),
    defaultValues: {
      regime: FiscalRegime.CUOTA_FIJA,
      businessName: "",
      ruc: "",
      commercialFxSpread: 0.5,
      pricesIncludeTax: true,
      phone: "",
      address: "",
      dgiAuthorizationCode: "",
      dgiAuthorizationIssuedAt: "",
      dgiAuthorizationExpiresAt: "",
    },
  });

  const selectedRegime = watch("regime");
  const pricesIncludeTax = watch("pricesIncludeTax");

  // D-21 (#554): expiry warning reads the SAVED snapshot (query data — the
  // GET response, or the POST response after a save). Informational only:
  // it never blocks saving. Absence renders no banner.
  const savedExpiresAt = initialData?.dgiAuthorizationExpiresAt;
  const expiryStatus = resolveDgiAuthorizationExpiryStatus(
    savedExpiresAt ?? null,
    new Date(),
  );
  const expiryDisplayDate = toDateInputValue(savedExpiresAt);

  useEffect(() => {
    if (initialData) {
      reset({
        regime: initialData.regime ?? FiscalRegime.CUOTA_FIJA,
        businessName: initialData.businessName ?? "",
        ruc: initialData.ruc ?? "",
        commercialFxSpread: initialData.commercialFxSpread ?? 0.5,
        pricesIncludeTax: initialData.pricesIncludeTax ?? true,
        phone: "",
        address: "",
        dgiAuthorizationCode: initialData.dgiAuthorizationCode ?? "",
        dgiAuthorizationIssuedAt: toDateInputValue(initialData.dgiAuthorizationIssuedAt),
        dgiAuthorizationExpiresAt: toDateInputValue(initialData.dgiAuthorizationExpiresAt),
      });
    }
  }, [initialData, reset]);

  const onSubmit = (values: FiscalSetupFormValues) => {
    const { dgiAuthorizationIssuedAt, dgiAuthorizationExpiresAt, ...rest } = values;
    updateMutation.mutate({
      ...rest,
      // D-21 (#554) backend contract: the code is ALWAYS sent — '' clears
      // the stored value through a null tombstone — while blank dates are
      // omitted, because an absent field leaves any prior value untouched.
      ...(dgiAuthorizationIssuedAt ? { dgiAuthorizationIssuedAt } : {}),
      ...(dgiAuthorizationExpiresAt ? { dgiAuthorizationExpiresAt } : {}),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground" data-testid="fiscal-loading">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Cargando configuración fiscal...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          No se pudo cargar la configuración fiscal actual del negocio.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Configuración Fiscal & Régimen DGI
            </CardTitle>
            <CardDescription>
              Definición de parámetros fiscales, tasa de IVA y spread cambiario comercial.
            </CardDescription>
          </div>
          <Badge variant={selectedRegime === FiscalRegime.REGIMEN_GENERAL ? "default" : "secondary"}>
            {selectedRegime === FiscalRegime.REGIMEN_GENERAL ? "Régimen General (15% IVA)" : "Cuota Fija (0% IVA)"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* D-21 (#554): DGI authorization expiry warning (fixed 30-day lead).
            Informational only — never blocks saving. Absence = no banner. */}
        {expiryStatus.state === "warning" && (
          <Alert
            className="mb-6 border-amber-500/40 bg-amber-500/10 text-foreground"
            data-testid="dgi-authorization-expiry-warning"
          >
            <CalendarClock className="h-4 w-4 text-amber-500" />
            <AlertTitle className="font-semibold text-sm">
              Autorización DGI próxima a vencer
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-1">
              La autorización DGI registrada vence el {expiryDisplayDate ||
                savedExpiresAt} ({expiryStatus.daysUntilExpiry === 0
                ? "vence hoy"
                : `en ${expiryStatus.daysUntilExpiry} días`}). Renueve su carta de autorización ante la DGI para evitar interrupciones en la facturación.
            </AlertDescription>
          </Alert>
        )}
        {expiryStatus.state === "expired" && (
          <Alert variant="destructive" className="mb-6" data-testid="dgi-authorization-expired-warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="font-semibold text-sm">
              Autorización DGI vencida
            </AlertTitle>
            <AlertDescription className="text-xs mt-1">
              La autorización DGI registrada venció el {expiryDisplayDate ||
                savedExpiresAt}. Gestione su renovación ante la DGI lo antes posible.
            </AlertDescription>
          </Alert>
        )}

        {/* DGI Immutability Invariant Alert (ODAV-31) */}
        <Alert className="mb-6 bg-muted/50 border-blue-500/30 text-foreground">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          <AlertTitle className="font-semibold text-sm">Garantía de Inmutabilidad DGI (DT 09-2007)</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            Cualquier cambio en el régimen o parámetros impositivos aplica únicamente a ventas y facturas emitidas a partir de este momento. Las facturas y comprobantes históricos conservan su desglose e integridad original sin modificación alguna.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" data-testid="fiscal-setup-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nombre Comercial */}
            <div className="space-y-2">
              <Label htmlFor="businessName">Nombre Comercial / Razón Social *</Label>
              <Input
                id="businessName"
                placeholder="Ej. OmniFood Café & Grill"
                {...register("businessName")}
                aria-invalid={Boolean(errors.businessName)}
              />
              {errors.businessName && (
                <p className="text-xs text-destructive">{errors.businessName.message}</p>
              )}
            </div>

            {/* RUC */}
            <div className="space-y-2">
              <Label htmlFor="ruc">RUC (Número RUC) *</Label>
              <Input
                id="ruc"
                placeholder="Ej. J0310000012345"
                {...register("ruc")}
                aria-invalid={Boolean(errors.ruc)}
              />
              {errors.ruc && <p className="text-xs text-destructive">{errors.ruc.message}</p>}
            </div>

            {/* Régimen Fiscal */}
            <div className="space-y-2">
              <Label htmlFor="regime">Régimen Fiscal (DGI Nicaragua) *</Label>
              <select
                id="regime"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                {...register("regime")}
              >
                <option value={FiscalRegime.CUOTA_FIJA}>
                  Cuota Fija (Sin desglose formal de IVA)
                </option>
                <option value={FiscalRegime.REGIMEN_GENERAL}>
                  Régimen General (15% IVA desglosado)
                </option>
              </select>
              <p className="text-xs text-muted-foreground">
                {selectedRegime === FiscalRegime.CUOTA_FIJA
                  ? "Tasa efectiva de IVA 0%. Factura simplificada sin desglose impositivo."
                  : "Tasa efectiva de IVA 15%. Factura formal DGI con desglose de subtotal gravado e IVA."}
              </p>
            </div>

            {/* Commercial FX Spread */}
            <div className="space-y-2">
              <Label htmlFor="commercialFxSpread">Spread Cambiario Comercial (C$) *</Label>
              <div className="relative">
                <Input
                  id="commercialFxSpread"
                  type="number"
                  step="0.05"
                  min="0"
                  placeholder="0.50"
                  {...register("commercialFxSpread", { valueAsNumber: true })}
                  aria-invalid={Boolean(errors.commercialFxSpread)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Margen en Córdobas aplicado sobre la tasa oficial de cambio del BCN en cobros en divisas.
              </p>
              {errors.commercialFxSpread && (
                <p className="text-xs text-destructive">{errors.commercialFxSpread.message}</p>
              )}
            </div>

            {/* Precios Incluyen IVA Switch */}
            <div className="space-y-2 md:col-span-2 border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pricesIncludeTax" className="text-sm font-medium">
                    Precios de Catálogo Incluyen IVA
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cuando está activo, el precio configurado en el producto es el valor final cobrado al cliente.
                  </p>
                </div>
                <Switch
                  id="pricesIncludeTax"
                  checked={pricesIncludeTax}
                  onCheckedChange={(checked) => setValue("pricesIncludeTax", checked, { shouldDirty: true })}
                />
              </div>
            </div>

            {/* D-21 (#554): DGI authorization letter data (optional). No
                structural mask — the operator types what the letter says. */}
            <div className="space-y-2 md:col-span-2 border rounded-lg p-4 bg-card">
              <div className="space-y-0.5">
                <Label htmlFor="dgiAuthorizationCode">Código de Autorización DGI</Label>
                <p className="text-xs text-muted-foreground">
                  El formato exacto es el de la carta de autorización. Solo se validan letras, números, guiones y barras.
                </p>
              </div>
              <Input
                id="dgiAuthorizationCode"
                placeholder="DGI-SFC-2024-00123"
                maxLength={50}
                {...register("dgiAuthorizationCode")}
                aria-invalid={Boolean(errors.dgiAuthorizationCode)}
              />
              {errors.dgiAuthorizationCode && (
                <p className="text-xs text-destructive">{errors.dgiAuthorizationCode.message}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dgiAuthorizationIssuedAt">Fecha de Emisión (carta DGI)</Label>
                  <Input
                    id="dgiAuthorizationIssuedAt"
                    type="date"
                    {...register("dgiAuthorizationIssuedAt")}
                    aria-invalid={Boolean(errors.dgiAuthorizationIssuedAt)}
                  />
                  {errors.dgiAuthorizationIssuedAt && (
                    <p className="text-xs text-destructive">{errors.dgiAuthorizationIssuedAt.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dgiAuthorizationExpiresAt">Fecha de Vencimiento (carta DGI)</Label>
                  <Input
                    id="dgiAuthorizationExpiresAt"
                    type="date"
                    {...register("dgiAuthorizationExpiresAt")}
                    aria-invalid={Boolean(errors.dgiAuthorizationExpiresAt)}
                  />
                  {errors.dgiAuthorizationExpiresAt && (
                    <p className="text-xs text-destructive">{errors.dgiAuthorizationExpiresAt.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Teléfono opcional (AC-05: no persistido) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="phone">Teléfono de Contacto</Label>
                <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid="phone-non-persisted-badge">
                  No persistido fiscalmente
                </Badge>
              </div>
              <Input
                id="phone"
                placeholder="+505 8888-0000"
                {...register("phone")}
              />
              <p className="text-[11px] text-muted-foreground" data-testid="phone-non-persisted-note">
                Campo informativo local. No se almacena en el perfil fiscal DGI oficial.
              </p>
            </div>

            {/* Dirección opcional (AC-05: no persistido) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="address">Dirección Fiscal / Local</Label>
                <Badge variant="outline" className="text-[10px] text-muted-foreground" data-testid="address-non-persisted-badge">
                  No persistido fiscalmente
                </Badge>
              </div>
              <Input
                id="address"
                placeholder="Dirección del establecimiento"
                {...register("address")}
              />
              <p className="text-[11px] text-muted-foreground" data-testid="address-non-persisted-note">
                Campo informativo local. No se almacena en el perfil fiscal DGI oficial.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              type="submit"
              disabled={updateMutation.isPending || !isDirty}
              data-testid="save-fiscal-setup-button"
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Configuración Fiscal
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
