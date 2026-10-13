import React, { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_IMAGE_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MIN_IMAGE_DIMENSION_PX = 100;
export const MAX_IMAGE_DIMENSION_PX = 2048;
export const TARGET_IMAGE_DIMENSION_PX = 300;

export interface ProcessImageResult {
  dataUrl: string;
  width: number;
  height: number;
  format: "webp" | "jpeg";
}

/**
 * Validates and compresses an image in the browser canvas:
 * 1. Checks MIME type against ALLOWED_IMAGE_TYPES.
 * 2. Checks raw byte size <= 2MB.
 * 3. Inspects natural dimensions (>= 100x100, <= 2048x2048).
 * 4. Center-crops to 1:1 square and resizes to 300x300 px WebP (82% quality)
 *    ensuring bounded data size (~15-30 KB) and 100% offline-first rendering.
 */
export async function validateAndCompressProductImage(
  file: File,
): Promise<ProcessImageResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    throw new Error(
      "Formato no permitido. Solo se aceptan imágenes JPG, PNG o WebP.",
    );
  }

  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new Error(
      "El archivo es muy pesado. El tamaño máximo permitido es 2 MB.",
    );
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      if (
        img.width < MIN_IMAGE_DIMENSION_PX ||
        img.height < MIN_IMAGE_DIMENSION_PX
      ) {
        reject(
          new Error(
            `La imagen es muy pequeña (${img.width}×${img.height} px). Las dimensiones mínimas son ${MIN_IMAGE_DIMENSION_PX}×${MIN_IMAGE_DIMENSION_PX} px.`,
          ),
        );
        return;
      }

      if (
        img.width > MAX_IMAGE_DIMENSION_PX ||
        img.height > MAX_IMAGE_DIMENSION_PX
      ) {
        reject(
          new Error(
            `La imagen excede el tamaño máximo permitido (${MAX_IMAGE_DIMENSION_PX}×${MAX_IMAGE_DIMENSION_PX} px).`,
          ),
        );
        return;
      }

      try {
        const canvas = document.createElement("canvas");
        canvas.width = TARGET_IMAGE_DIMENSION_PX;
        canvas.height = TARGET_IMAGE_DIMENSION_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo inicializar el procesador de imágenes."));
          return;
        }

        // Center crop to 1:1 square aspect ratio
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(
          img,
          sx,
          sy,
          minDim,
          minDim,
          0,
          0,
          TARGET_IMAGE_DIMENSION_PX,
          TARGET_IMAGE_DIMENSION_PX,
        );

        let dataUrl = canvas.toDataURL("image/webp", 0.82);
        let format: "webp" | "jpeg" = "webp";

        // Fallback for browsers that do not support WebP canvas export
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          format = "jpeg";
        }

        resolve({
          dataUrl,
          width: TARGET_IMAGE_DIMENSION_PX,
          height: TARGET_IMAGE_DIMENSION_PX,
          format,
        });
      } catch (err) {
        reject(new Error("Error al procesar y optimizar la imagen."));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer el archivo de imagen."));
    };

    img.src = objectUrl;
  });
}

export interface ProductImageFieldProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function ProductImageField({
  value,
  onChange,
  disabled = false,
}: ProductImageFieldProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessing(true);

    try {
      const result = await validateAndCompressProductImage(file);
      onChange(result.dataUrl);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar la imagen";
      setError(msg);
    } finally {
      setIsProcessing(false);
      // Reset input value so re-selecting same file triggers change
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = () => {
    setError(null);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Imagen del Producto
      </label>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Preview box */}
        <div
          data-testid="product-image-preview-container"
          className={cn(
            "relative flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 overflow-hidden shadow-2xs",
            !value && "border-dashed",
          )}
        >
          {value ? (
            <img
              src={value}
              alt="Vista previa del producto"
              data-testid="product-image-preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon
              className="h-8 w-8 text-muted-foreground/40"
              aria-hidden="true"
            />
          )}

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <span className="text-[10px] font-medium text-primary animate-pulse">
                Procesando...
              </span>
            </div>
          )}
        </div>

        {/* Action buttons & helper copy */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={disabled || isProcessing}
              className="hidden"
              data-testid="product-image-file-input"
              aria-label="Seleccionar imagen de producto"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isProcessing}
              className="h-8 text-xs gap-1.5 shadow-2xs"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {value ? "Cambiar foto" : "Subir foto"}
            </Button>

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || isProcessing}
                className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2"
                data-testid="remove-product-image-button"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Quitar
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-normal">
            JPG, PNG o WebP hasta 2 MB. Se optimizará a 300×300 px para las cards del POS.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="product-image-error"
          className="flex items-center gap-1.5 text-xs text-destructive mt-1 font-medium"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
