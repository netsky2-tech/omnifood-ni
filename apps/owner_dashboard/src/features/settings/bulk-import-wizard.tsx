import { useState } from "react";
import {
  type ImportRowDto,
  type UploadSummaryResponse,
  type CommitSummaryResponse,
  type CommitMode,
  type DuplicateResolution,
  type ImportProgressState,
  MAX_IMPORT_CHUNK_SIZE,
} from "./types";
import { generateOdav32Dataset } from "./odav32-dataset";
import {
  useUploadChunkedImport,
  useCommitImport,
} from "./use-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Database,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";

function parseCsv(text: string): ImportRowDto[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length <= 1 || !lines[0]) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: ImportRowDto[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const values = line.split(",").map((v) => v.trim());
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) {
        rowObj[h] = values[idx] ?? "";
      }
    });

    // Robust column mapping supporting both camelCase and snake_case (e.g. plantilla_productos.csv)
    const nombre =
      rowObj["nombre"] ||
      rowObj["name"] ||
      rowObj["producto"] ||
      rowObj["descripcion"] ||
      values[0] ||
      `Fila #${i}`;

    // Barcode is NOT SKU (AC-51). Do NOT alias codigo_barras / barcode to sku.
    const sku =
      rowObj["sku"] ||
      rowObj["codigo"] ||
      undefined;

    const precioVenta =
      rowObj["precio_venta"] ||
      rowObj["precioventa"] ||
      rowObj["precio"] ||
      rowObj["price"] ||
      values[1] ||
      "0";

    const costoInsumo =
      rowObj["costo_insumo"] ||
      rowObj["costoinsumo"] ||
      rowObj["costo_promedio"] ||
      rowObj["costopromedio"] ||
      rowObj["costo"] ||
      rowObj["cost"] ||
      undefined;

    const categoria =
      rowObj["categoria"] ||
      rowObj["category"] ||
      rowObj["rubro"] ||
      undefined;

    const porcentajeIva =
      rowObj["porcentaje_iva"] ||
      rowObj["porcentajeiva"] ||
      rowObj["iva"] ||
      rowObj["tax"] ||
      undefined;

    const uom =
      rowObj["unidad_venta"] ||
      rowObj["unidadventa"] ||
      rowObj["unidad_consumo"] ||
      rowObj["unidad"] ||
      rowObj["uom"] ||
      "UN";

    const stockInicial =
      rowObj["stock_inicial"] ||
      rowObj["stockinicial"] ||
      rowObj["stock"] ||
      undefined;

    rows.push({
      nombre,
      sku: sku ? String(sku) : undefined,
      precioVenta,
      costoInsumo,
      categoria,
      porcentajeIva,
      uom,
      stockInicial,
    });
  }

  return rows;
}

export function BulkImportWizard() {
  const [step, setStep] = useState<"input" | "uploading" | "staging" | "committed">("input");
  const [rawText, setRawText] = useState("");
  const [parsedRows, setParsedRows] = useState<ImportRowDto[]>([]);
  const [progress, setProgress] = useState<ImportProgressState | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummaryResponse | null>(null);
  const [commitSummary, setCommitSummary] = useState<CommitSummaryResponse | null>(null);

  // Commit configuration
  const [commitMode, setCommitMode] = useState<CommitMode>("VALID_ONLY");
  const [duplicateResolution, setDuplicateResolution] = useState<DuplicateResolution>("REPLACE");

  const chunkedUploadMutation = useUploadChunkedImport();
  const commitMutation = useCommitImport();

  const handleLoadOdav32Fixture = () => {
    const fixture = generateOdav32Dataset();
    setParsedRows(fixture);
    setRawText(`[ODAV-32 Dataset]: 1,500 productos cargados (1,480 válidos, 20 con errores sintácticos)`);
  };

  const handleParseCustomInput = () => {
    const rows = parseCsv(rawText);
    setParsedRows(rows);
  };

  const handleStartUpload = () => {
    if (parsedRows.length === 0) return;
    setStep("uploading");
    setProgress({
      chunkIndex: 0,
      totalChunks: Math.ceil(parsedRows.length / MAX_IMPORT_CHUNK_SIZE),
      percent: 0,
      uploadedRows: 0,
      totalRows: parsedRows.length,
    });

    chunkedUploadMutation.mutate(
      {
        rows: parsedRows,
        options: {
          chunkSize: MAX_IMPORT_CHUNK_SIZE,
          onProgress: (p) => setProgress(p),
        },
      },
      {
        onSuccess: (summary) => {
          setUploadSummary(summary);
          setStep("staging");
        },
        onError: () => {
          setStep("input");
        },
      },
    );
  };

  const handleCommit = () => {
    if (!uploadSummary) return;

    commitMutation.mutate(
      {
        sessionToken: uploadSummary.sessionToken,
        mode: commitMode,
        duplicateResolution,
      },
      {
        onSuccess: (summary) => {
          setCommitSummary(summary);
          setStep("committed");
        },
      },
    );
  };

  const handleReset = () => {
    setStep("input");
    setRawText("");
    setParsedRows([]);
    setProgress(null);
    setUploadSummary(null);
    setCommitSummary(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Carga Masiva de Productos & Staging
        </h2>
        <p className="text-sm text-muted-foreground">
          Importa catálogos completos en lotes con validación previa en staging y diagnóstico de errores fila por fila.
        </p>
      </div>

      {/* ODAV-32 / ODAV-33 Invariants Banner */}
      <Alert className="bg-muted/40 border-blue-500/30">
        <ShieldCheck className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-sm font-semibold">Garantías ODAV-32 & ODAV-33</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground mt-1">
          • Chunk size obligatorio $\le 100$ filas por transacción para resiliencia y baja latencia.
          <br />
          • Las filas inválidas se aíslan en tabla de staging sin corromper el catálogo principal.
          <br />
          • El token de sesión asegura idempotencia estricta ante reintentos de red.
        </AlertDescription>
      </Alert>

      {/* STEP 1: Input Data */}
      {step === "input" && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">1. Cargar Datos del Catálogo</CardTitle>
            <CardDescription>
              Pega tus datos en formato CSV o utiliza el generador de pruebas para verificar el comportamiento con grandes volúmenes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadOdav32Fixture}
                data-testid="load-odav32-dataset-btn"
                className="text-xs flex items-center gap-2"
              >
                <Zap className="h-4 w-4 text-amber-500" />
                Cargar Escenario ODAV-32 (1,500 filas)
              </Button>
            </div>

            <div className="space-y-2">
              <textarea
                className="w-full h-44 p-3 font-mono text-xs rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="nombre,sku,precioVenta,costoInsumo,categoria&#10;Café Latte,LAT-01,60,20,Bebidas&#10;Torta de Chocolate,POST-01,75,30,Postres"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                data-testid="raw-csv-textarea"
              />
            </div>

            {parsedRows.length > 0 ? (
              <div className="p-3 bg-muted/40 rounded-lg flex items-center justify-between text-xs">
                <span>
                  Filas preparadas para validación en staging:{" "}
                  <strong className="text-foreground">{parsedRows.length} productos</strong>
                </span>
                <Badge variant="secondary">
                  {Math.ceil(parsedRows.length / MAX_IMPORT_CHUNK_SIZE)} chunks (máx 100 c/u)
                </Badge>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleParseCustomInput}
                  disabled={!rawText.trim()}
                >
                  Procesar Texto
                </Button>
              </div>
            )}

            <div className="pt-4 border-t flex justify-end">
              <Button
                onClick={handleStartUpload}
                disabled={parsedRows.length === 0 || chunkedUploadMutation.isPending}
                data-testid="start-upload-btn"
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Subir y Validar en Staging
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Uploading & Chunking Progress */}
      {step === "uploading" && progress && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Procesando Carga en Chunks (ODAV-32)
            </CardTitle>
            <CardDescription>
              Subiendo datos en bloques atómicos de hasta {MAX_IMPORT_CHUNK_SIZE} filas por llamada HTTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Bloque {progress.chunkIndex} de {progress.totalChunks} (
                  {progress.uploadedRows} de {progress.totalRows} filas)
                </span>
                <span className="font-semibold text-foreground">{progress.percent}%</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center animate-pulse">
              Validando reglas de negocio, tipos de dato y sintaxis en la base de datos...
            </p>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Staging Diagnostics & Commit Preparation */}
      {step === "staging" && uploadSummary && (
        <Card className="border-border" data-testid="staging-summary-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">2. Diagnóstico de Validación en Staging</CardTitle>
                <CardDescription>
                  Token de Sesión Idempotente: <code className="text-xs bg-muted p-1 rounded font-mono">{uploadSummary.sessionToken}</code>
                </CardDescription>
              </div>
              <Badge variant={uploadSummary.errorRows === 0 ? "default" : "destructive"}>
                {uploadSummary.errorRows === 0 ? "Lote 100% Válido" : `${uploadSummary.errorRows} con Errores`}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* KPI Counters */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 border rounded-lg bg-card">
                <span className="text-xs text-muted-foreground block">Total Filas</span>
                <span className="text-2xl font-bold text-foreground" data-testid="staging-total-rows">
                  {uploadSummary.totalRows}
                </span>
              </div>
              <div className="p-4 border rounded-lg bg-emerald-500/10 border-emerald-500/30">
                <span className="text-xs text-emerald-800 dark:text-emerald-300 block">Válidas para Catálogo</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="staging-valid-rows">
                  {uploadSummary.validRows}
                </span>
              </div>
              <div className="p-4 border rounded-lg bg-destructive/10 border-destructive/30">
                <span className="text-xs text-destructive block">Inválidas / Errores</span>
                <span className="text-2xl font-bold text-destructive" data-testid="staging-error-rows">
                  {uploadSummary.errorRows}
                </span>
              </div>
            </div>

            {/* Error Diagnostics Table */}
            {uploadSummary.errors.length > 0 && (
              <div className="space-y-2 border rounded-lg p-4 bg-muted/20">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Diagnóstico de Errores ({uploadSummary.errors.length} filas rechazadas)
                </h4>
                <div className="max-h-56 overflow-y-auto border rounded bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Fila #</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Motivo del Rechazo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody data-testid="staging-errors-table-body">
                      {uploadSummary.errors.slice(0, 100).map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{err.rowNumber}</TableCell>
                          <TableCell className="text-xs font-medium">{err.rawNombre || "—"}</TableCell>
                          <TableCell className="text-xs text-destructive">{err.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {uploadSummary.errors.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Mostrando primeros 100 errores de {uploadSummary.errors.length}.
                  </p>
                )}
              </div>
            )}

            {/* Commit Configuration Form */}
            <div className="border rounded-lg p-4 space-y-4 bg-card">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Opciones de Inyección al Catálogo de Producción
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Modo de Inserción:</label>
                  <select
                    className="w-full border rounded p-2 bg-background text-foreground"
                    value={commitMode}
                    onChange={(e) => setCommitMode(e.target.value as CommitMode)}
                    data-testid="commit-mode-select"
                  >
                    <option value="VALID_ONLY">
                      VALID_ONLY — Importar solo filas válidas ({uploadSummary.validRows})
                    </option>
                    <option value="ALL_OR_NOTHING">
                      ALL_OR_NOTHING — Requerir 100% de filas válidas
                    </option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-medium text-foreground">Resolución de Duplicados:</label>
                  <select
                    className="w-full border rounded p-2 bg-background text-foreground"
                    value={duplicateResolution}
                    onChange={(e) => setDuplicateResolution(e.target.value as DuplicateResolution)}
                    data-testid="duplicate-resolution-select"
                  >
                    <option value="REPLACE">REPLACE — Actualizar precio y datos del producto existente</option>
                    <option value="SKIP">SKIP — Omitir y conservar producto existente</option>
                    <option value="FAIL">FAIL — Detener importación si existe duplicado</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Cancelar / Subir Otro
              </Button>
              <Button
                onClick={handleCommit}
                disabled={commitMutation.isPending || (commitMode === "ALL_OR_NOTHING" && uploadSummary.errorRows > 0)}
                data-testid="confirm-commit-btn"
                className="flex items-center gap-2"
              >
                {commitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ArrowRight className="h-4 w-4" />
                Confirmar e Importar al Catálogo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Committed Receipt */}
      {step === "committed" && commitSummary && (
        <Card className="border-emerald-500/30 bg-emerald-500/5" data-testid="import-committed-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-600 rounded-full">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg text-emerald-900 dark:text-emerald-300">
                  ¡Importación Completada Exitosamente!
                </CardTitle>
                <CardDescription>
                  Los productos han sido incorporados de manera definitiva al catálogo activo del tenant.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 border rounded bg-card">
                <span className="text-xs text-muted-foreground block">Total Inyectados</span>
                <span className="text-xl font-bold text-foreground" data-testid="committed-total">
                  {commitSummary.totalCommitted}
                </span>
              </div>
              <div className="p-3 border rounded bg-card">
                <span className="text-xs text-muted-foreground block">Nuevos Creados</span>
                <span className="text-xl font-bold text-emerald-600" data-testid="committed-created">
                  {commitSummary.productsCreated}
                </span>
              </div>
              <div className="p-3 border rounded bg-card">
                <span className="text-xs text-muted-foreground block">Actualizados</span>
                <span className="text-xl font-bold text-blue-600" data-testid="committed-updated">
                  {commitSummary.productsUpdated}
                </span>
              </div>
              <div className="p-3 border rounded bg-card">
                <span className="text-xs text-muted-foreground block">Omitidos</span>
                <span className="text-xl font-bold text-muted-foreground" data-testid="committed-skipped">
                  {commitSummary.productsSkipped}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={handleReset} variant="outline" className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Realizar Otra Importación
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
