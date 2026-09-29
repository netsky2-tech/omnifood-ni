/**
 * Menu import from Excel — owner wizard (SOHO go-live readiness).
 *
 * Flow: download template → fill in Excel → upload (.xlsx only) → preview →
 * commit. The backend owns validation and fails closed on any row error, so
 * the confirm button is additionally gated on an error-free preview.
 */
import { useRef, useState } from "react";
import {
  downloadMenuImportTemplate,
  MENU_IMPORT_MAX_FILE_BYTES,
  type MenuImportSummary,
} from "./settings-api";
import { useMenuImportPreview, useMenuImportCommit } from "./use-settings";
import { getApiErrorMessage } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

function CountCell({
  label,
  value,
  testId,
  accent,
}: {
  label: string;
  value: number;
  testId: string;
  accent?: string;
}) {
  return (
    <div className="p-3 border rounded-lg bg-card text-center">
      <span className="text-xs text-muted-foreground block">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${accent ?? "text-foreground"}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export function MenuImportWizard() {
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<MenuImportSummary | null>(null);
  const [committed, setCommitted] = useState<MenuImportSummary | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMenuImportPreview();
  const commitMutation = useMenuImportCommit();

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const blob = await downloadMenuImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_menu.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const handleFileSelected = (file: File | undefined) => {
    setClientError(null);
    setPreview(null);
    setCommitted(null);
    setFileBase64(null);
    setFileName(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setClientError(
        "Solo se admiten archivos .xlsx. Descarga la plantilla y complétala en Excel.",
      );
      return;
    }
    if (file.size > MENU_IMPORT_MAX_FILE_BYTES) {
      setClientError(
        `El archivo supera el límite de ${Math.round(MENU_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL yields "data:...;base64,<payload>"; keep only the payload.
      const result = String(reader.result ?? "");
      const base64 = result.split(",")[1] ?? "";
      setFileBase64(base64);
      setFileName(file.name);
      previewMutation.mutate(base64, {
        onSuccess: (summary) => setPreview(summary),
      });
    };
    reader.onerror = () => {
      setClientError("No se pudo leer el archivo. Intenta de nuevo.");
    };
    reader.readAsDataURL(file);
  };

  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const canConfirm =
    Boolean(fileBase64) &&
    Boolean(preview) &&
    !hasErrors &&
    !commitMutation.isPending;

  const handleConfirm = () => {
    if (!fileBase64 || !preview || hasErrors) return;
    commitMutation.mutate(fileBase64, {
      onSuccess: (summary) => setCommitted(summary),
    });
  };

  const handleReset = () => {
    setFileBase64(null);
    setFileName(null);
    setPreview(null);
    setCommitted(null);
    setClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card className="border-border" data-testid="menu-import-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Importar menú (Excel)
        </CardTitle>
        <CardDescription>
          Descarga la plantilla, complétala con tu menú (una pestaña por categoría) y
          súbelo para revisar e importar categorías, productos, insumos y recetas en un solo paso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: template + upload controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={downloading}
            data-testid="menu-import-download-template-btn"
            className="flex items-center gap-2"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Descargar plantilla
          </Button>

          <label className="flex items-center gap-2 text-sm">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2"
              data-testid="menu-import-upload-btn"
            >
              <Upload className="h-4 w-4" />
              Subir archivo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
              data-testid="menu-import-file-input"
            />
            {fileName && !committed && (
              <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
            )}
          </label>
        </div>

        {clientError && (
          <Alert variant="destructive" data-testid="menu-import-client-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Archivo no válido</AlertTitle>
            <AlertDescription>{clientError}</AlertDescription>
          </Alert>
        )}

        {previewMutation.isPending && (
          <LoadingState message="Procesando el archivo y calculando el plan de importación..." />
        )}

        {previewMutation.isError && (
          <Alert variant="destructive" data-testid="menu-import-preview-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudo procesar el archivo</AlertTitle>
            <AlertDescription>
              {getApiErrorMessage(
                previewMutation.error,
                "El archivo no es un menú válido. Verifica la plantilla e intenta de nuevo.",
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Step 2: preview */}
        {preview && !committed && (
          <div className="space-y-4" data-testid="menu-import-preview-card">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <CountCell label="Categorías" value={preview.categories} testId="menu-import-count-categories" />
              <CountCell
                label="Productos a crear"
                value={preview.productsToCreate}
                testId="menu-import-count-products-create"
                accent="text-emerald-600"
              />
              <CountCell
                label="Productos a actualizar"
                value={preview.productsToUpdate}
                testId="menu-import-count-products-update"
                accent="text-blue-600"
              />
              <CountCell
                label="Recetas a crear"
                value={preview.recipesToCreate}
                testId="menu-import-count-recipes-create"
              />
            </div>

            {preview.recipesSkipped.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-1">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Recetas omitidas ({preview.recipesSkipped.length})
                </h4>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {preview.recipesSkipped.map((skipped) => (
                    <li key={skipped.productName}>
                      <span className="font-medium text-foreground">{skipped.productName}</span>{" "}
                      — {skipped.reason} (estado actual: {skipped.existingState})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.insumosToCreate.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <h4 className="text-sm font-semibold">
                  Insumos a crear ({preview.insumosToCreate.length})
                </h4>
                <p
                  className="text-xs text-amber-700 dark:text-amber-300 font-medium"
                  data-testid="menu-import-insumo-review-note"
                >
                  ⚠ Revisar costo y PAR: estos insumos se crearán con stock 0 y costo promedio 0.
                  Ajusta su costo y nivel PAR después de importar.
                </p>
                <ul className="text-xs space-y-0.5">
                  {preview.insumosToCreate.map((insumo) => (
                    <li key={insumo.name} data-testid="menu-import-insumo-row">
                      <span className="font-medium text-foreground">{insumo.name}</span>{" "}
                      — compra: {insumo.purchaseUom} / consumo: {insumo.consumptionUom}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.errors.length > 0 && (
              <div className="space-y-2 border rounded-lg p-4 bg-destructive/5">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                  <TriangleAlert className="h-4 w-4" />
                  Errores ({preview.errors.length}) — corrígelos en el Excel y vuelve a subir el archivo
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Hoja</TableHead>
                      <TableHead className="w-20">Fila</TableHead>
                      <TableHead>Mensaje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody data-testid="menu-import-errors-table-body">
                    {preview.errors.map((issue, i) => (
                      <TableRow key={`${issue.sheet}-${issue.row}-${i}`}>
                        <TableCell className="font-mono text-xs">{issue.sheet}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{issue.row}</TableCell>
                        <TableCell className="text-xs text-destructive">{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="space-y-2 border rounded-lg p-4 bg-muted/20">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  Advertencias ({preview.warnings.length})
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Hoja</TableHead>
                      <TableHead className="w-20">Fila</TableHead>
                      <TableHead>Mensaje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody data-testid="menu-import-warnings-table-body">
                    {preview.warnings.map((issue, i) => (
                      <TableRow key={`${issue.sheet}-${issue.row}-${i}`}>
                        <TableCell className="font-mono text-xs">{issue.sheet}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{issue.row}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Cancelar
              </Button>
              <div className="flex items-center gap-3">
                {hasErrors && (
                  <span className="text-xs text-destructive">
                    La importación falla cerrada: no se escribirá nada mientras existan errores.
                  </span>
                )}
                <Button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  data-testid="menu-import-confirm-btn"
                  className="flex items-center gap-2"
                >
                  {commitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar importación
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: committed receipt */}
        {committed && (
          <div className="space-y-4" data-testid="menu-import-committed-card">
            <Alert className="bg-emerald-500/5 border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-sm font-semibold">
                ¡Importación de menú completada!
              </AlertTitle>
              <AlertDescription>
                El menú se incorporó al catálogo. Recuerda revisar costo y PAR de los insumos nuevos.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <CountCell label="Categorías" value={committed.categories} testId="menu-import-committed-categories" />
              <CountCell
                label="Productos creados"
                value={committed.productsToCreate}
                testId="menu-import-committed-products-create"
                accent="text-emerald-600"
              />
              <CountCell
                label="Productos actualizados"
                value={committed.productsToUpdate}
                testId="menu-import-committed-products-update"
                accent="text-blue-600"
              />
              <CountCell
                label="Recetas creadas"
                value={committed.recipesToCreate}
                testId="menu-import-committed-recipes-create"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Importar otro archivo
              </Button>
            </div>
          </div>
        )}

        {!preview && !committed && !previewMutation.isPending && !clientError && !previewMutation.isError && (
          <EmptyState
            title="Aún no hay archivo cargado"
            message="Descarga la plantilla, complétala con tu menú y sube el archivo .xlsx para ver la vista previa."
            icon={<FileSpreadsheet className="h-6 w-6 stroke-[1.5]" />}
          />
        )}
      </CardContent>
    </Card>
  );
}
