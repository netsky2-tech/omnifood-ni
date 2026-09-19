import { Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMenuQr } from "./use-menu-qr";

const URL_INPUT_ID = "menu-qr-url";
const URL_HINT_ID = "menu-qr-url-hint";
const URL_ERROR_ID = "menu-qr-url-error";

/**
 * Dedicated menu QR workflow page.
 *
 * The whole flow runs in the browser after load: the bundled encoder produces
 * a PNG data URL, so generation and download need no network connection and
 * never produce CSP-incompatible blob URLs.
 */
export function MenuQrPage() {
  const {
    url,
    setUrl,
    qrImage,
    validationError,
    actionError,
    statusMessage,
    generate,
    download,
  } = useMenuQr();

  const describedBy = validationError
    ? `${URL_HINT_ID} ${URL_ERROR_ID}`
    : URL_HINT_ID;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          QR del menú
        </h1>
        <p className="text-sm text-muted-foreground">
          Generá un código QR escaneable para que tus clientes abran el menú
          desde el celular. La generación y la descarga funcionan sin conexión
          una vez cargada la página.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generar código QR</CardTitle>
          <CardDescription>
            Pegá el enlace público de tu menú. Se aceptan URLs http: o https:,
            incluidos los enlaces de Google Drive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={URL_INPUT_ID}>URL del menú</Label>
            <Input
              id={URL_INPUT_ID}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://ejemplo.com/menu"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={describedBy}
            />
            <p id={URL_HINT_ID} className="text-xs text-muted-foreground">
              El QR codifica la URL normalizada tal como la escaneará el
              cliente.
            </p>
            {validationError && (
              <p
                id={URL_ERROR_ID}
                role="alert"
                className="text-sm text-destructive"
              >
                {validationError}
              </p>
            )}
          </div>

          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          <div
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {statusMessage}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={generate} className="gap-2">
              <QrCode className="h-4 w-4" />
              <span>Generar código QR</span>
            </Button>
            <Button
              variant="outline"
              onClick={download}
              disabled={!qrImage}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span>Descargar PNG</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {qrImage && (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              Descargá el PNG e imprimilo cerca del punto de venta.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <img
              src={qrImage.dataUrl}
              alt={`Código QR que abre ${qrImage.payloadUrl}`}
              width={qrImage.pixelSize}
              height={qrImage.pixelSize}
              className="h-48 w-48 rounded-md border border-border bg-white p-2"
            />
            <p className="break-all text-center text-xs text-muted-foreground">
              El código QR abre: {qrImage.payloadUrl}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
