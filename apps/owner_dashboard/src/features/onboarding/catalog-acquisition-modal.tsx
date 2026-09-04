import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useIndustryTemplates,
  useApplyIndustryTemplate,
  useCommitImport,
  useUploadImportBatch,
} from "../settings/use-settings";
import { useCreateManualProduct } from "./use-onboarding";
import {
  Sparkles,
  FileSpreadsheet,
  PlusCircle,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Coffee,
  Utensils,
  ShoppingBag,
  Package,
  Download,
  Upload,
  Info,
} from "lucide-react";
import { CANONICAL_PRODUCT_TEMPLATE_CSV } from "../settings/types";

interface CatalogAcquisitionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToTab?: (tab: "fiscal" | "templates" | "import") => void;
}

type AcquisitionMethod = "choice" | "template" | "import" | "manual";

interface ManualProductFormValues {
  name: string;
  sellPrice: number;
  uom: string;
  category_code?: string;
}

function getTemplateIcon(code: string) {
  switch (code) {
    case "CAFETERIA":
      return <Coffee className="h-5 w-5 text-amber-600" />;
    case "BAR_RESTAURANTE":
      return <Utensils className="h-5 w-5 text-emerald-600" />;
    case "RETAIL_MINIMARKET":
      return <ShoppingBag className="h-5 w-5 text-indigo-600" />;
    default:
      return <Package className="h-5 w-5 text-primary" />;
  }
}

export function CatalogAcquisitionModal({
  open,
  onOpenChange,
  onNavigateToTab,
}: CatalogAcquisitionModalProps) {
  const [method, setMethod] = useState<AcquisitionMethod>("choice");
  const [selectedTemplateCode, setSelectedTemplateCode] = useState<string | null>(null);

  // Template query & mutation
  const { data: templates, isLoading: isLoadingTemplates } = useIndustryTemplates();
  const applyTemplateMutation = useApplyIndustryTemplate();

  // Manual product mutation
  const createManualMutation = useCreateManualProduct();

  // CSV Import quick form
  const uploadBatchMutation = useUploadImportBatch();
  const commitImportMutation = useCommitImport();
  const [csvText, setCsvText] = useState("");
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset: resetManualForm,
    formState: { errors: manualErrors, isSubmitting: isSubmittingManual },
  } = useForm<ManualProductFormValues>({
    defaultValues: {
      name: "",
      sellPrice: 35.0,
      uom: "UN",
      category_code: "GENERAL",
    },
  });

  const handleClose = () => {
    setMethod("choice");
    setSelectedTemplateCode(null);
    setCsvText("");
    setImportFeedback(null);
    resetManualForm();
    onOpenChange(false);
  };

  const onManualSubmit = (values: ManualProductFormValues) => {
    createManualMutation.mutate(
      {
        name: values.name.trim(),
        sellPrice: Number(values.sellPrice),
        uom: values.uom?.trim() || "UN",
        category_code: values.category_code?.trim() || undefined,
      },
      {
        onSuccess: () => {
          handleClose();
        },
      },
    );
  };

  const handleApplyTemplate = (code: string) => {
    setSelectedTemplateCode(code);
    applyTemplateMutation.mutate(
      { code },
      {
        onSuccess: () => {
          handleClose();
        },
      },
    );
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([CANONICAL_PRODUCT_TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "plantilla_productos_oficial_v1.0.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuickCsvSubmit = async () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length <= 1) return;

    const rows = lines.slice(1).map((line) => {
      const parts = line.split(",").map((s) => s.trim());
      return {
        nombre: parts[0] || "Producto",
        precioVenta: parts[1] || "50",
        uom: parts[2] || "UN",
        categoria: parts[3] || "General",
      };
    });

    try {
      const uploadRes = await uploadBatchMutation.mutateAsync({ rows });
      const commitRes = await commitImportMutation.mutateAsync({
        sessionToken: uploadRes.sessionToken,
        mode: "VALID_ONLY",
        duplicatePolicy: "REPLACE",
      });
      setImportFeedback(`¡Importación exitosa! ${commitRes.productsCreated} productos incorporados.`);
      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err: any) {
      setImportFeedback(`Error: ${err?.message || "No se pudo procesar el archivo"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? handleClose() : onOpenChange(true))}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" data-testid="catalog-acquisition-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5 text-primary" />
            Adquisición de Catálogo Vendible
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Elegí cómo querés inicializar los productos de venta para habilitar la caja registradora POS.
          </DialogDescription>
        </DialogHeader>

        {/* Method Selector Cards */}
        {method === "choice" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4" data-testid="acquisition-choices">
            {/* 1. Industry Templates */}
            <Card
              className="hover:border-primary/60 cursor-pointer transition-all border-border shadow-xs flex flex-col justify-between"
              onClick={() => setMethod("template")}
              data-testid="choose-template-btn"
            >
              <CardHeader className="pb-2">
                <div className="p-2.5 bg-amber-500/10 rounded-md w-fit mb-2">
                  <Sparkles className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle className="text-sm font-semibold">Plantilla de Industria</CardTitle>
                <CardDescription className="text-xs">
                  Carga catálogo sugerido por giro comercial (Cafetería, Restaurante, Retail).
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50">
                  Ruta más rápida
                </Badge>
              </CardContent>
              <CardFooter className="pt-0">
                <Button size="sm" variant="secondary" className="w-full text-xs">
                  Elegir Plantilla
                </Button>
              </CardFooter>
            </Card>

            {/* 2. Manual Product */}
            <Card
              className="hover:border-primary/60 cursor-pointer transition-all border-border shadow-xs flex flex-col justify-between"
              onClick={() => setMethod("manual")}
              data-testid="choose-manual-btn"
            >
              <CardHeader className="pb-2">
                <div className="p-2.5 bg-emerald-500/10 rounded-md w-fit mb-2">
                  <PlusCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-sm font-semibold">Producto Mínimo</CardTitle>
                <CardDescription className="text-xs">
                  Creá tu primer producto manualmente con nombre y precio de venta.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50">
                  Catálogo propio
                </Badge>
              </CardContent>
              <CardFooter className="pt-0">
                <Button size="sm" variant="secondary" className="w-full text-xs">
                  Crear Manual
                </Button>
              </CardFooter>
            </Card>

            {/* 3. Bulk CSV Import */}
            <Card
              className="hover:border-primary/60 cursor-pointer transition-all border-border shadow-xs flex flex-col justify-between"
              onClick={() => setMethod("import")}
              data-testid="choose-import-btn"
            >
              <CardHeader className="pb-2">
                <div className="p-2.5 bg-blue-500/10 rounded-md w-fit mb-2">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-sm font-semibold">Carga Masiva CSV</CardTitle>
                <CardDescription className="text-xs">
                  Importá un archivo seguro (.csv) con tu inventario existente.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50">
                  Para listas grandes
                </Badge>
              </CardContent>
              <CardFooter className="pt-0">
                <Button size="sm" variant="secondary" className="w-full text-xs">
                  Importar CSV
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* METHOD 1: Template Selection View */}
        {method === "template" && (
          <div className="space-y-4 py-2" data-testid="template-selection-view">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Seleccioná una plantilla para tu comercio
              </h4>
              <Button variant="ghost" size="sm" onClick={() => setMethod("choice")} className="text-xs">
                ← Volver
              </Button>
            </div>

            <Alert className="bg-muted/40 border-primary/20 text-xs py-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs text-muted-foreground">
                Las recetas sugeridas se inyectan en estado <strong>DRAFT</strong>. No se genera stock ficticio fuera del Kardex (AC-11, AC-12).
              </AlertDescription>
            </Alert>

            {isLoadingTemplates ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-xs">Cargando plantillas...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(templates ?? []).map((tpl) => (
                  <Card key={tpl.code} className="border-border hover:border-primary/50 flex flex-col justify-between">
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between">
                        {getTemplateIcon(tpl.code)}
                        <Badge variant="outline" className="text-[10px]">{tpl.code}</Badge>
                      </div>
                      <CardTitle className="text-xs font-semibold mt-2">{tpl.name}</CardTitle>
                      <CardDescription className="text-[11px] line-clamp-2">{tpl.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 text-[11px] text-muted-foreground space-y-1">
                      <div>Productos: <strong className="text-foreground">{tpl.productCount}</strong></div>
                      <div>Insumos: <strong className="text-foreground">{tpl.insumoCount}</strong></div>
                    </CardContent>
                    <CardFooter className="p-3 pt-0">
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => handleApplyTemplate(tpl.code)}
                        disabled={applyTemplateMutation.isPending}
                        data-testid={`apply-template-btn-${tpl.code}`}
                      >
                        {applyTemplateMutation.isPending && selectedTemplateCode === tpl.code ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : null}
                        Aplicar
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* METHOD 2: Manual Minimal Product Form */}
        {method === "manual" && (
          <div className="space-y-4 py-2" data-testid="manual-product-view">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-emerald-600" />
                Crear Producto Mínimo de Venta
              </h4>
              <Button variant="ghost" size="sm" onClick={() => setMethod("choice")} className="text-xs">
                ← Volver
              </Button>
            </div>

            <Alert className="bg-muted/40 border-emerald-500/30 text-xs py-2">
              <Info className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-xs text-muted-foreground">
                Un único producto con precio válido mayor a 0 cumple el requisito de catálogo para <strong>SALE_READY</strong> (AC-06). El costo se reporta como <strong>COST_PENDING</strong> hasta que se registre en Kardex (AC-08).
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit(onManualSubmit)} className="space-y-4" data-testid="manual-product-form">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="manual-name" className="text-xs">Nombre del Producto *</Label>
                  <Input
                    id="manual-name"
                    placeholder="Ej. Café Americano 8oz"
                    className="text-xs"
                    data-testid="manual-product-name-input"
                    {...register("name", { required: "El nombre es obligatorio" })}
                  />
                  {manualErrors.name && (
                    <p className="text-[11px] text-destructive">{manualErrors.name.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-price" className="text-xs">Precio de Venta (C$) *</Label>
                  <Input
                    id="manual-price"
                    type="number"
                    step="0.50"
                    min="0.01"
                    placeholder="40.00"
                    className="text-xs"
                    data-testid="manual-product-price-input"
                    {...register("sellPrice", {
                      required: "El precio debe ser mayor a cero",
                      min: { value: 0.01, message: "El precio debe ser mayor a cero" },
                      valueAsNumber: true,
                    })}
                  />
                  {manualErrors.sellPrice && (
                    <p className="text-[11px] text-destructive">{manualErrors.sellPrice.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-uom" className="text-xs">Unidad de Medida</Label>
                  <Input
                    id="manual-uom"
                    placeholder="UN"
                    className="text-xs"
                    data-testid="manual-product-uom-input"
                    {...register("uom")}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="manual-category" className="text-xs">Categoría (Opcional)</Label>
                  <Input
                    id="manual-category"
                    placeholder="Ej. BEBIDAS"
                    className="text-xs"
                    data-testid="manual-product-category-input"
                    {...register("category_code")}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setMethod("choice")}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createManualMutation.isPending || isSubmittingManual}
                  data-testid="submit-manual-product-btn"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {createManualMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Guardar y Habilitar Venta
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* METHOD 3: Quick CSV Import */}
        {method === "import" && (
          <div className="space-y-4 py-2" data-testid="quick-import-view">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                Carga Masiva CSV Seguro (M4)
              </h4>
              <Button variant="ghost" size="sm" onClick={() => setMethod("choice")} className="text-xs">
                ← Volver
              </Button>
            </div>

            <Alert className="bg-muted/40 border-blue-500/30 text-xs py-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs text-muted-foreground">
                Contrato <strong>ImportContractVersion v1.0</strong>. No modifica existencias ni costos promedio Kardex (AC-24, AC-52).
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Pegá el contenido CSV o descargá la plantilla:</p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs flex items-center gap-1.5"
                onClick={handleDownloadTemplate}
                data-testid="download-csv-template-btn"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar Plantilla CSV
              </Button>
            </div>

            <textarea
              className="w-full h-32 p-2.5 font-mono text-xs rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="nombre,precio_venta,unidad_venta,categoria&#10;Café Latte,60,UN,Bebidas&#10;Torta de Chocolate,75,UN,Postres"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              data-testid="quick-csv-textarea"
            />

            {importFeedback && (
              <p className="text-xs font-medium text-primary text-center">{importFeedback}</p>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              {onNavigateToTab && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="text-xs p-0 text-muted-foreground"
                  onClick={() => {
                    handleClose();
                    onNavigateToTab("import");
                  }}
                >
                  Ir al Asistente Avanzado Staging →
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button type="button" variant="outline" size="sm" onClick={() => setMethod("choice")}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleQuickCsvSubmit}
                  disabled={!csvText.trim() || uploadBatchMutation.isPending || commitImportMutation.isPending}
                  data-testid="submit-quick-csv-btn"
                >
                  {(uploadBatchMutation.isPending || commitImportMutation.isPending) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  )}
                  Importar y Habilitar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
