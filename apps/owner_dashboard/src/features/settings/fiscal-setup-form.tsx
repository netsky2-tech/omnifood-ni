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
import { ShieldCheck, Loader2, Landmark } from "lucide-react";

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
    },
  });

  const selectedRegime = watch("regime");
  const pricesIncludeTax = watch("pricesIncludeTax");

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
      });
    }
  }, [initialData, reset]);

  const onSubmit = (values: FiscalSetupFormValues) => {
    updateMutation.mutate(values);
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
              <Label htmlFor="ruc">RUC (Número RUC)</Label>
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

            {/* Teléfono opcional */}
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono de Contacto</Label>
              <Input
                id="phone"
                placeholder="+505 8888-0000"
                {...register("phone")}
              />
            </div>

            {/* Dirección opcional */}
            <div className="space-y-2">
              <Label htmlFor="address">Dirección Fiscal / Local</Label>
              <Input
                id="address"
                placeholder="Dirección del establecimiento"
                {...register("address")}
              />
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
