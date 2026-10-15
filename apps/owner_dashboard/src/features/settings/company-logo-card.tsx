import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImagePlus, Loader2, TriangleAlert } from "lucide-react";
import { useCompanyLogo, useUploadCompanyLogo } from "./use-settings";
import { COMPANY_LOGO_ACCEPTED_TYPES, COMPANY_LOGO_MAX_BYTES } from "./settings-api";

/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5) — the dashboard's logo surface: the cloud owns the company logo's
 * ORIGINAL, this card uploads and previews it. The terminal keeps deriving
 * its own 1-bit raster locally (S5-bis: not two logos, two artifacts of one
 * brand); the PDF embeds the original stored here.
 *
 * Absence is DECLARED, never faked (S3): no stored logo renders the declared
 * empty state, not a placeholder image and not a broken <img>.
 */
export function CompanyLogoCard() {
  const { data: logo, isLoading } = useCompanyLogo();
  const uploadMutation = useUploadCompanyLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    base64: string;
    contentType: string;
    name: string;
  } | null>(null);

  const previewUrl = pendingFile
    ? `data:${pendingFile.contentType};base64,${pendingFile.base64}`
    : logo
      ? `data:${logo.contentType};base64,${logo.base64}`
      : null;

  const handleFileChange = (file: File | undefined) => {
    setLocalError(null);
    setPendingFile(null);
    if (!file) return;
    // Fail fast, client-side; the backend remains authoritative. This check
    // and the backend allowlist say the SAME thing: PNG only (the terminal
    // derives its print raster from the PNG original).
    if (!(COMPANY_LOGO_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      setLocalError(
        "El logo debe ser una imagen PNG: la terminal deriva de él su raster de impresión.",
      );
      return;
    }
    if (file.size > COMPANY_LOGO_MAX_BYTES) {
      setLocalError(
        `El logo supera el límite de ${Math.round(COMPANY_LOGO_MAX_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL yields "data:...;base64,<payload>"; keep only the payload.
      const base64 = (reader.result as string).split(",")[1] ?? "";
      if (!base64) {
        setLocalError("No se pudo leer el archivo seleccionado.");
        return;
      }
      setPendingFile({ base64, contentType: file.type, name: file.name });
    };
    reader.onerror = () => setLocalError("No se pudo leer el archivo seleccionado.");
    reader.readAsDataURL(file);
  };

  const handleUpload = () => {
    if (!pendingFile) return;
    uploadMutation.mutate(
      { content_type: pendingFile.contentType, data: pendingFile.base64 },
      {
        onSuccess: () => {
          setPendingFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
      },
    );
  };

  return (
    <Card data-testid="company-logo-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImagePlus className="h-5 w-5 text-primary" />
          Logo de la empresa
        </CardTitle>
        <CardDescription>
          El logo original vive en la nube: se imprime en los documentos
          formales (como la lista firmable de conteo físico) y la terminal
          deriva de él su raster para tickets. Sólo se acepta PNG, hasta{" "}
          {Math.round(COMPANY_LOGO_MAX_BYTES / (1024 * 1024))} MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(localError || uploadMutation.isError) && (
          <Alert variant="destructive" data-testid="company-logo-error">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>No se pudo aceptar el logo</AlertTitle>
            <AlertDescription>
              {localError ??
                "El archivo fue rechazado. El logo anterior permanece intacto."}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando logo…
          </div>
        ) : previewUrl ? (
          <div className="flex items-center gap-4">
            {/* The stored bytes are a server-validated PNG original. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Logo de la empresa"
              data-testid="company-logo-preview"
              className="h-16 w-16 rounded border border-border object-contain bg-white p-1"
            />
            <div className="text-sm text-muted-foreground">
              {pendingFile ? (
                <span>
                  Listo para reemplazar por{" "}
                  <span className="font-medium text-foreground">
                    {pendingFile.name}
                  </span>
                  .
                </span>
              ) : (
                <span>
                  Logo actual
                  {logo ? (
                    <span className="block font-mono text-xs">
                      sha256: {logo.sha256.slice(0, 16)}… · {logo.byteLength}{" "}
                      bytes
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="company-logo-empty"
          >
            Sin logo registrado. El documento se imprime formalmente sin logo
            hasta que se cargue uno.
          </p>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png"
            className="hidden"
            data-testid="company-logo-input"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            Seleccionar archivo…
          </Button>
          {pendingFile && (
            <>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                data-testid="company-logo-upload"
              >
                {uploadMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Guardar logo
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPendingFile(null);
                  setLocalError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={uploadMutation.isPending}
              >
                Cancelar
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
