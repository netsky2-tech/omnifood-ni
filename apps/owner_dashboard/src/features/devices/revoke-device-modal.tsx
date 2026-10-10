import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api-error";
import { useRevokeDevice } from "./use-devices";
import type { TerminalDevice } from "./types";
import { revokeDeviceSchema, type RevokeDeviceFormValues as RevokeDeviceFormData } from "./schema";

interface RevokeDeviceModalProps {
  device: TerminalDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Destructive confirmation dialog for revoking a terminal device credential
 * (B17-04). Requires a non-empty reason and the exact keyword "REVOCAR"
 * before submitting, and surfaces mutation failures through the shared API
 * error mapper instead of raw error text (§30: destructive actions are
 * explicit, reversible-by-admin, and never silent).
 */
export function RevokeDeviceModal({
  device,
  open,
  onOpenChange,
  onSuccess,
}: RevokeDeviceModalProps) {
  const revokeDevice = useRevokeDevice();
  const isPending = revokeDevice.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RevokeDeviceFormData>({
    resolver: zodResolver(revokeDeviceSchema),
    defaultValues: {
      reason: "",
      confirmation: "",
    },
  });

  // Reset the sanitized form whenever the dialog opens or closes so a
  // cancelled attempt never leaks a half-typed reason or confirmation into
  // the next revocation flow (§18.3: destructive forms start clean).
  useEffect(() => {
    if (open) {
      reset({ reason: "", confirmation: "" });
    }
  }, [open, reset]);

  const onSubmit = (values: RevokeDeviceFormData) => {
    if (!device) {
      return;
    }
    revokeDevice.mutate(
      { credentialId: device.credentialId, reason: values.reason.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revocar credencial de terminal</DialogTitle>
          <DialogDescription>
            {device
              ? `Vas a revocar la credencial de la terminal ${device.terminalId}${
                  device.label ? ` (${device.label})` : ""
                }. Esta operación no se puede deshacer desde este panel.`
              : "Vas a revocar la credencial de una terminal."}
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Advertencia operativa crítica</AlertTitle>
          <AlertDescription>
            Esta acción invalidará la credencial de la terminal de inmediato.
            La caja física no podrá realizar cobros ni sincronizar ventas hasta
            que un administrador vuelva a vincularla.
          </AlertDescription>
        </Alert>

        {revokeDevice.error ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              {getApiErrorMessage(revokeDevice.error, "No se pudo revocar la terminal.")}
            </AlertDescription>
          </Alert>
        ) : null}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="revoke-reason">Motivo de revocación</Label>
            <Input
              id="revoke-reason"
              placeholder="Ej: Terminal extraviada, sospecha de compromiso..."
              aria-invalid={Boolean(errors.reason)}
              aria-describedby="reason-error"
              disabled={isPending}
              {...register("reason")}
            />
            <p id="reason-error" className="text-xs text-destructive mt-1">
              {errors.reason?.message}
            </p>
          </div>

          <div>
            <Label htmlFor="revoke-confirmation">Confirmación requerida</Label>
            <p className="text-xs text-muted-foreground">
              Escriba REVOCAR para confirmar la operación:
            </p>
            <Input
              id="revoke-confirmation"
              placeholder="REVOCAR"
              autoComplete="off"
              aria-invalid={Boolean(errors.confirmation)}
              aria-describedby="confirmation-error"
              disabled={isPending}
              {...register("confirmation")}
            />
            <p id="confirmation-error" className="text-xs text-destructive mt-1">
              {errors.confirmation?.message}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Confirmar revocación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
