import { useState } from "react";
import {
  useIndustryTemplates,
  useApplyIndustryTemplate,
} from "./use-settings";
import type { IndustryTemplate, ApplyTemplateResult } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Coffee,
  Utensils,
  ShoppingBag,
  Sparkles,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Package,
} from "lucide-react";

function getTemplateIcon(code: string) {
  switch (code) {
    case "CAFETERIA":
      return <Coffee className="h-6 w-6 text-amber-600" />;
    case "BAR_RESTAURANTE":
      return <Utensils className="h-6 w-6 text-emerald-600" />;
    case "RETAIL_MINIMARKET":
      return <ShoppingBag className="h-6 w-6 text-indigo-600" />;
    default:
      return <Package className="h-6 w-6 text-primary" />;
  }
}

export function IndustryTemplatesList() {
  const { data: templates, isLoading, isError } = useIndustryTemplates();
  const applyMutation = useApplyIndustryTemplate();

  const [selectedTemplate, setSelectedTemplate] = useState<IndustryTemplate | null>(null);
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [prefixSku, setPrefixSku] = useState("");
  const [lastResult, setLastResult] = useState<ApplyTemplateResult | null>(null);

  const handleOpenDialog = (template: IndustryTemplate) => {
    setSelectedTemplate(template);
    setOverrideExisting(false);
    setPrefixSku(template.code === "CAFETERIA" ? "CAF-" : template.code === "BAR_RESTAURANTE" ? "BAR-" : "RET-");
    setLastResult(null);
  };

  const handleCloseDialog = () => {
    setSelectedTemplate(null);
    setLastResult(null);
  };

  const handleApply = () => {
    if (!selectedTemplate) return;
    applyMutation.mutate(
      {
        code: selectedTemplate.code,
        dto: {
          overrideExisting,
          prefixSku: prefixSku.trim() || undefined,
        },
      },
      {
        onSuccess: (result) => {
          setLastResult(result);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground" data-testid="templates-loading">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Cargando plantillas de industria...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          No se pudieron cargar las plantillas de industria predeterminadas.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Plantillas de Industria & Pre-BOMs Estructurales
        </h2>
        <p className="text-sm text-muted-foreground">
          Inicializa rápidamente el catálogo, insumos de inventario y recetas base de acuerdo al giro de tu negocio.
        </p>
      </div>

      {/* Two-tenant Blast Radius 0 Invariant Notice (ODAV-34) */}
      <Alert className="bg-muted/40 border-emerald-500/30">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <AlertTitle className="text-sm font-semibold">Aislamiento de Tenant Garantizado (Blast Radius = 0)</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground mt-1">
          La inyección de plantillas opera exclusivamente en la base de datos de tu comercio. No existe riesgo de colisión ni afectación cruzada sobre otros tenants de la plataforma.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="industry-templates-grid">
        {(templates ?? []).map((template) => (
          <Card
            key={template.id || template.code}
            className="flex flex-col justify-between hover:border-primary/50 transition-colors border-border shadow-xs"
            data-testid={`template-card-${template.code}`}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="p-3 bg-muted/60 rounded-lg">
                  {getTemplateIcon(template.code)}
                </div>
                <Badge variant="outline">{template.code}</Badge>
              </div>
              <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
              <CardDescription className="text-xs min-h-[2.5rem]">
                {template.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                <span>Insumos Pre-BOM:</span>
                <span className="font-semibold text-foreground">{template.insumoCount} insumos</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                <span>Productos de Venta:</span>
                <span className="font-semibold text-foreground">{template.productCount} productos</span>
              </div>
            </CardContent>

            <CardFooter className="pt-2 border-t">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleOpenDialog(template)}
                data-testid={`apply-template-btn-${template.code}`}
              >
                Aplicar Plantilla
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Dialog to confirm & apply template */}
      <Dialog open={Boolean(selectedTemplate)} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Aplicar Plantilla: {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Se inyectarán los productos, insumos y recetas predeterminadas en tu catálogo comercial.
            </DialogDescription>
          </DialogHeader>

          {lastResult ? (
            <div className="space-y-4 py-3" data-testid="apply-template-result">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                    ¡Plantilla aplicada exitosamente!
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Los elementos se encuentran disponibles en tu catálogo e inventario.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 border rounded bg-card">
                  <span className="block text-muted-foreground">Productos</span>
                  <span className="font-bold text-base text-foreground">{lastResult.productsCreated}</span>
                </div>
                <div className="p-2 border rounded bg-card">
                  <span className="block text-muted-foreground">Insumos</span>
                  <span className="font-bold text-base text-foreground">{lastResult.insumosCreated}</span>
                </div>
                <div className="p-2 border rounded bg-card">
                  <span className="block text-muted-foreground">Recetas</span>
                  <span className="font-bold text-base text-foreground">{lastResult.recipesCreated}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="prefixSku">Prefijo para códigos SKU (opcional)</Label>
                <Input
                  id="prefixSku"
                  placeholder="Ej. CAF-"
                  value={prefixSku}
                  onChange={(e) => setPrefixSku(e.target.value)}
                  data-testid="prefix-sku-input"
                />
                <p className="text-xs text-muted-foreground">
                  Se antepondrá a los códigos de barra/SKU generados para evitar colisiones.
                </p>
              </div>

              <div className="flex items-center space-x-2 border rounded-lg p-3 bg-muted/20">
                <Checkbox
                  id="overrideExisting"
                  checked={overrideExisting}
                  onCheckedChange={(checked) => setOverrideExisting(Boolean(checked))}
                  data-testid="override-existing-checkbox"
                />
                <Label htmlFor="overrideExisting" className="text-xs cursor-pointer">
                  Actualizar elementos existentes si ya existen con el mismo nombre o SKU
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            {lastResult ? (
              <Button onClick={handleCloseDialog} className="w-full">
                Cerrar
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseDialog} disabled={applyMutation.isPending}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={applyMutation.isPending}
                  data-testid="confirm-apply-template-btn"
                >
                  {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar Inyección
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
