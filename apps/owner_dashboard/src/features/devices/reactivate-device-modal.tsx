import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Info,
  KeyRound,
  Loader2,
  QrCode,
  RotateCw,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { getApiErrorMessage } from "@/lib/api-error";
import { generateMenuQrDataUrl } from "@/features/menu-qr/qr-encode";
import { buildInstallKitUrl } from "@/features/onboarding/onboarding-api";
import {
  ReactivationReason,
  type InitiateTerminalReactivationResponse,
  type ReactivationInitiationMode,
  type RecoveryCodeResponse,
} from "@/features/onboarding/types";
import {
  useCreateInstallToken,
  useInitiateTerminalReactivation,
  useRotateTerminalRecoveryCode,
} from "@/features/onboarding/use-onboarding";
import type { TerminalDevice } from "./types";

export interface ReactivateDeviceModalProps {
  device: TerminalDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatExpirationTime(expiresAt: string): string {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Modal for reactivating an existing ACTIVE or RETIRED terminal (issue #566).
 * Preserves the canonical `terminalId` and DGI fiscal sequence while retiring
 * the previous credential (`RETIRED`) and issuing version `v+1`.
 */
export function ReactivateDeviceModal({
  device,
  open,
  onOpenChange,
  onSuccess,
}: ReactivateDeviceModalProps) {
  const [selectedMode, setSelectedMode] =
    useState<ReactivationInitiationMode>("challenge");
  const [result, setResult] =
    useState<InitiateTerminalReactivationResponse | null>(null);
  const [kitToken, setKitToken] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<RecoveryCodeResponse | null>(
    null,
  );
  const [copiedTarget, setCopiedTarget] = useState<
    "code" | "url" | "recovery" | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const initiateMutation = useInitiateTerminalReactivation();
  const createInstallTokenMutation = useCreateInstallToken();
  const rotateRecoveryCodeMutation = useRotateTerminalRecoveryCode();

  const isBusy =
    initiateMutation.isPending || createInstallTokenMutation.isPending;

  // Reset modal state whenever opened or switched to a different terminal.
  useEffect(() => {
    if (open) {
      setSelectedMode("challenge");
      setResult(null);
      setKitToken(null);
      setRecoveryCode(null);
      setCopiedTarget(null);
      setSubmitError(null);
      setRecoveryError(null);
    }
  }, [open, device?.terminalId]);

  useEffect(() => {
    if (!copiedTarget) return;
    const timeoutId = window.setTimeout(() => setCopiedTarget(null), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copiedTarget]);

  const currentVersion = device?.credentialVersion ?? 0;
  const nextVersion = currentVersion + 1;

  const factoryResetLinkingCode =
    result?.mode === "factory_reset" ? result.linkingCode : null;

  const kitUrl = useMemo(() => {
    if (!kitToken || !factoryResetLinkingCode) return null;
    return buildInstallKitUrl(
      getApiBaseUrl(),
      kitToken,
      factoryResetLinkingCode,
    );
  }, [kitToken, factoryResetLinkingCode]);

  const qrImage = useMemo(() => {
    if (!kitUrl) return null;
    try {
      return generateMenuQrDataUrl(kitUrl, { scale: 5, quietZoneModules: 4 });
    } catch {
      return null;
    }
  }, [kitUrl]);

  const handleCopy = useCallback(
    async (text: string, target: "code" | "url" | "recovery") => {
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(text);
        }
        setCopiedTarget(target);
        toast({
          title:
            target === "url"
              ? "Enlace copiado"
              : target === "recovery"
                ? "Código de recuperación copiado"
                : "Código de re-vinculación copiado",
          description:
            target === "url"
              ? "Abrilo en el nuevo equipo para descargar NHILOS POS con el código precargado."
              : "Ingresalo en NHILOS POS para completar la reactivación.",
        });
      } catch {
        toast({
          variant: "destructive",
          title: "No se pudo copiar",
          description: "Copiá el valor manualmente desde la pantalla.",
        });
      }
    },
    [],
  );

  const handleConfirm = async () => {
    if (!device) return;
    setSubmitError(null);

    const reason =
      selectedMode === "challenge"
        ? ReactivationReason.REINSTALL
        : ReactivationReason.REPLACED;

    try {
      const response = await initiateMutation.mutateAsync({
        terminalId: device.terminalId,
        payload: {
          mode: selectedMode,
          reason,
        },
      });
      setResult(response);

      if (response.mode === "factory_reset") {
        // Best-effort install kit token so the owner gets a QR + install URL
        // preloaded with the 6-character re-linking code. If token creation
        // fails, the 6-character code still works manually on the POS.
        try {
          const created = await createInstallTokenMutation.mutateAsync({
            label: `Re-vinculación ${device.terminalId}`,
            revokePrevious: false,
          });
          setKitToken(created.token);
        } catch {
          setKitToken(null);
        }
      }

      onSuccess?.();
    } catch (err) {
      setSubmitError(
        getApiErrorMessage(
          err,
          "No se pudo iniciar la reactivación de la terminal. Intentá de nuevo.",
        ),
      );
    }
  };

  const handleGenerateRecoveryCode = async () => {
    if (!device) return;
    setRecoveryError(null);
    try {
      const generated = await rotateRecoveryCodeMutation.mutateAsync(
        device.terminalId,
      );
      setRecoveryCode(generated);
      toast({
        title: "Código de recuperación generado",
        description:
          "Guardalo en un lugar seguro. Se muestra una sola vez y permite reactivar sin abrir el panel.",
      });
    } catch (err) {
      setRecoveryError(
        getApiErrorMessage(
          err,
          "No se pudo generar el código de recuperación de 6 dígitos.",
        ),
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isBusy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto"
        data-testid="reactivate-device-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw
              className="h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            Reactivar terminal
          </DialogTitle>
          <DialogDescription>
            {device
              ? `Rotá la credencial de la terminal ${device.terminalId}${
                  device.label && device.label !== device.terminalId
                    ? ` (${device.label})`
                    : ""
                } para reinstalación o reemplazo de equipo.`
              : "Rotá la credencial de una terminal existente."}
          </DialogDescription>
        </DialogHeader>

        {/* Mandatory consequence disclosure before confirming */}
        <Alert
          data-testid="reactivate-consequences-alert"
          className="border-blue-200 bg-blue-50/50 text-blue-950"
        >
          <Info className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <AlertTitle className="text-sm font-semibold text-blue-950">
            Qué ocurre al reactivar esta terminal
          </AlertTitle>
          <AlertDescription className="mt-1 space-y-1 text-xs text-blue-900/90">
            <ul className="list-disc list-inside space-y-1">
              <li>
                Conserva el mismo{" "}
                <span className="font-mono font-semibold">
                  {device?.terminalId ?? "terminalId"}
                </span>{" "}
                y el consecutivo fiscal (no reinicia folios ni crea un terminal
                nuevo).
              </li>
              <li>
                Retira la credencial anterior (estado{" "}
                <span className="font-semibold">Reemplazada / RETIRED</span>) y
                emite la versión{" "}
                <span className="font-mono font-semibold">v{nextVersion}</span>.
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        {submitError && (
          <Alert variant="destructive" data-testid="reactivate-submit-error">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        {/* Mode selection (before confirmation) */}
        {!result ? (
          <div
            role="radiogroup"
            aria-label="Tipo de reactivación"
            className="space-y-2.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedMode === "challenge"}
              data-testid="reactivate-mode-challenge"
              disabled={isBusy}
              onClick={() => setSelectedMode("challenge")}
              className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                selectedMode === "challenge"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Smartphone
                      className="h-4 w-4 text-primary shrink-0"
                      aria-hidden="true"
                    />
                    Mismo equipo (reinstalación)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Aprueba la reactivación del equipo actual. Al abrir NHILOS
                    POS en este equipo, detectará la aprobación y rotará su
                    credencial automáticamente.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[11px] font-mono"
                >
                  reinstall
                </Badge>
              </div>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={selectedMode === "factory_reset"}
              data-testid="reactivate-mode-factory-reset"
              disabled={isBusy}
              onClick={() => setSelectedMode("factory_reset")}
              className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                selectedMode === "factory_reset"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <QrCode
                      className="h-4 w-4 text-primary shrink-0"
                      aria-hidden="true"
                    />
                    Equipo reemplazado / factory reset
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Genera un código de re-vinculación de 6 caracteres (y QR del
                    kit) ligado a{" "}
                    <span className="font-mono">
                      {device?.terminalId ?? "esta terminal"}
                    </span>{" "}
                    para escanear o digitar en el nuevo equipo.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[11px] font-mono"
                >
                  replaced
                </Badge>
              </div>
            </button>
          </div>
        ) : result.mode === "challenge" ? (
          <div
            data-testid="reactivate-challenge-success"
            className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
              <CheckCircle2
                className="h-4 w-4 text-emerald-600 shrink-0"
                aria-hidden="true"
              />
              Reactivación aprobada para el mismo equipo
            </div>
            <p className="text-xs text-emerald-900/90">
              Abrí NHILOS POS en la terminal{" "}
              <span className="font-mono font-semibold">
                {result.terminalId}
              </span>
              . El equipo completará la rotación a{" "}
              <span className="font-mono font-semibold">v{nextVersion}</span>{" "}
              automáticamente.
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Válido hasta las {formatExpirationTime(result.challenge.expiresAt)}
            </p>
          </div>
        ) : (
          <div
            data-testid="reactivate-factory-reset-success"
            className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-4 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600 shrink-0"
                  aria-hidden="true"
                />
                Código de re-vinculación listo
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Expira a las {formatExpirationTime(result.expiresAt)}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {qrImage && (
                <div className="shrink-0 rounded-md border border-border bg-white p-2 shadow-xs">
                  <img
                    src={qrImage.dataUrl}
                    alt={`Código QR de re-vinculación para ${result.terminalId}`}
                    data-testid="reactivate-kit-qr-image"
                    className="h-36 w-36 object-contain"
                  />
                </div>
              )}

              <div className="flex-1 w-full space-y-3">
                <div className="rounded-md border border-border bg-card px-3 py-2.5 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Código de re-vinculación (6 caracteres)
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      data-testid="reactivate-linking-code"
                      className="text-2xl font-mono font-bold tracking-[0.25em] text-foreground"
                    >
                      {result.linkingCode}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid="reactivate-copy-code-btn"
                      onClick={() =>
                        void handleCopy(result.linkingCode, "code")
                      }
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      {copiedTarget === "code" ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copiedTarget === "code" ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </div>

                {kitUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="reactivate-copy-url-btn"
                    onClick={() => void handleCopy(kitUrl, "url")}
                    className="gap-1.5"
                  >
                    {copiedTarget === "url" ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copiedTarget === "url"
                      ? "Enlace copiado"
                      : "Copiar enlace del kit"}
                  </Button>
                )}

                <p className="text-xs text-muted-foreground">
                  Escaneá el QR o ingresá este código en el nuevo equipo. Quedará
                  vinculado a{" "}
                  <span className="font-mono font-medium text-foreground">
                    {result.terminalId}
                  </span>{" "}
                  manteniendo su consecutivo fiscal.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Backup 6-digit one-time recovery code section */}
        <section
          aria-label="Código de recuperación de respaldo"
          className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                Código de recuperación de respaldo (6 dígitos)
              </p>
              <p className="text-[11px] text-muted-foreground">
                Permite aprobar una reinstalación directamente desde la terminal
                si no tenés acceso al panel web en ese momento.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="generate-recovery-code-btn"
              disabled={!device || rotateRecoveryCodeMutation.isPending}
              onClick={() => void handleGenerateRecoveryCode()}
              className="gap-1.5 shrink-0"
            >
              {rotateRecoveryCodeMutation.isPending ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {recoveryCode
                ? "Rotar código de recuperación"
                : "Emitir código de respaldo"}
            </Button>
          </div>

          {recoveryError && (
            <p
              role="alert"
              data-testid="recovery-code-error"
              className="text-xs text-destructive"
            >
              {recoveryError}
            </p>
          )}

          {recoveryCode && (
            <div
              data-testid="recovery-code-display"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2"
            >
              <div className="space-y-0.5">
                <span className="font-mono text-lg font-bold tracking-[0.25em] text-foreground">
                  {recoveryCode.recoveryCode}
                </span>
                <p className="text-[11px] text-amber-900">
                  De un solo uso — se muestra una sola vez.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="copy-recovery-code-btn"
                onClick={() =>
                  void handleCopy(recoveryCode.recoveryCode, "recovery")
                }
                className="h-7 gap-1 px-2 text-xs"
              >
                {copiedTarget === "recovery" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copiedTarget === "recovery" ? "Copiado" : "Copiar"}
              </Button>
            </div>
          )}
        </section>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          {!result && (
            <Button
              type="button"
              data-testid="confirm-reactivate-btn"
              onClick={() => void handleConfirm()}
              disabled={!device || isBusy}
              className="gap-1.5"
            >
              {isBusy ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RotateCw className="h-4 w-4" aria-hidden="true" />
              )}
              {selectedMode === "challenge"
                ? "Aprobar reactivación"
                : "Generar código de re-vinculación"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
