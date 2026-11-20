import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  ReactivationChallengeStatus,
  ReactivationReason,
  type ReactivationChallenge,
} from "./types";
import {
  useApproveReactivationChallenge,
  useCancelReactivationChallenge,
  useReactivationChallenges,
} from "./use-onboarding";

const REASON_LABELS: Record<ReactivationReason, string> = {
  [ReactivationReason.REINSTALL]: "Reinstalación",
  [ReactivationReason.REPLACED]: "Reemplazo",
};

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatExpirationTime(expiresAt: string): string {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ReactivationChallengesCardProps {
  /** Whether the current user has permission to approve/cancel challenges. */
  canManage?: boolean;
  /** Whether polling is enabled (defaults to true). */
  enabled?: boolean;
}

/**
 * Sober NHILOS card surfacing pending and approved terminal reactivation
 * challenges (issue #566). Rendered in both Setup Center and Dispositivos when
 * at least one challenge is awaiting human approval or POS completion.
 */
export function ReactivationChallengesCard({
  canManage = true,
  enabled = true,
}: ReactivationChallengesCardProps) {
  const { data } = useReactivationChallenges({ enabled });
  const approveMutation = useApproveReactivationChallenge();
  const cancelMutation = useCancelReactivationChallenge();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeAction, setActiveAction] = useState<{
    id: string;
    kind: "approve" | "cancel";
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeChallenges: ReactivationChallenge[] = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item) =>
        item.status === ReactivationChallengeStatus.PENDING ||
        item.status === ReactivationChallengeStatus.APPROVED,
    );
  }, [data]);

  useEffect(() => {
    if (activeChallenges.length === 0) return;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeChallenges.length]);

  if (activeChallenges.length === 0) {
    return null;
  }

  const pendingCount = activeChallenges.filter(
    (c) => c.status === ReactivationChallengeStatus.PENDING,
  ).length;

  const handleApprove = (challenge: ReactivationChallenge) => {
    setActionError(null);
    setActiveAction({ id: challenge.id, kind: "approve" });
    approveMutation.mutate(challenge.id, {
      onSuccess: () => {
        toast({
          title: "Reactivación aprobada",
          description: `La terminal ${challenge.terminalLabel || challenge.terminalId} completará la rotación de credencial automáticamente.`,
        });
      },
      onError: (err) => {
        setActionError(
          getApiErrorMessage(
            err,
            "No pudimos aprobar la reactivación. Intentá de nuevo en unos momentos.",
          ),
        );
      },
      onSettled: () => {
        setActiveAction(null);
      },
    });
  };

  const handleCancel = (challenge: ReactivationChallenge) => {
    setActionError(null);
    setActiveAction({ id: challenge.id, kind: "cancel" });
    cancelMutation.mutate(challenge.id, {
      onSuccess: () => {
        toast({
          title: "Solicitud rechazada",
          description: `Se canceló la solicitud de reactivación para ${challenge.terminalLabel || challenge.terminalId}.`,
        });
      },
      onError: (err) => {
        setActionError(
          getApiErrorMessage(
            err,
            "No pudimos rechazar la solicitud. Intentá de nuevo en unos momentos.",
          ),
        );
      },
      onSettled: () => {
        setActiveAction(null);
      },
    });
  };

  return (
    <Card
      data-testid="reactivation-challenges-card"
      className="border-amber-300/90 bg-amber-50/30 shadow-sm"
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <RotateCw className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            Reactivar terminal
          </CardTitle>
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-100/80 text-amber-900"
          >
            {pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? "pendiente" : "pendientes"}`
              : "En proceso"}
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Una terminal existente solicitó rotar su credencial conservando su identidad
          y consecutivo fiscal. Verificá que la solicitud sea legítima antes de aprobarla.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {actionError && (
          <Alert variant="destructive" data-testid="reactivation-challenge-error">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {!canManage && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-amber-800"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Requiere permiso de activación (onboarding:activation:manage) para aprobar o rechazar solicitudes.
          </p>
        )}

        <ul className="space-y-2.5">
          {activeChallenges.map((challenge) => {
            const expiresAtMs = new Date(challenge.expiresAt).getTime();
            const isExpired = !Number.isNaN(expiresAtMs) && expiresAtMs <= nowMs;
            const remainingSeconds =
              !Number.isNaN(expiresAtMs) && !isExpired
                ? Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000))
                : 0;
            const reasonLabel = REASON_LABELS[challenge.reason] ?? challenge.reason;
            const isPending =
              challenge.status === ReactivationChallengeStatus.PENDING;
            const isApproved =
              challenge.status === ReactivationChallengeStatus.APPROVED;
            const isApprovingThis =
              activeAction?.id === challenge.id && activeAction.kind === "approve";
            const isCancellingThis =
              activeAction?.id === challenge.id && activeAction.kind === "cancel";
            const isRowBusy = activeAction?.id === challenge.id;

            const currentVersion = challenge.latestCredentialVersion;
            const nextVersion =
              currentVersion !== null ? currentVersion + 1 : null;

            return (
              <li
                key={challenge.id}
                data-testid={`reactivation-challenge-item-${challenge.id}`}
                className="rounded-md border border-border bg-card p-3.5 shadow-xs"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {challenge.terminalLabel || challenge.terminalId}
                      </span>
                      {challenge.terminalLabel &&
                        challenge.terminalLabel !== challenge.terminalId && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {challenge.terminalId}
                          </span>
                        )}
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-50 text-slate-700 text-[11px]"
                      >
                        {reasonLabel}
                      </Badge>
                      {currentVersion !== null && nextVersion !== null && (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-800 font-mono text-[11px]"
                        >
                          v{currentVersion} → v{nextVersion}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {isExpired ? (
                          <span className="font-medium text-amber-800">Expirada</span>
                        ) : (
                          <>
                            Expira a las {formatExpirationTime(challenge.expiresAt)} (
                            <span className="font-mono font-medium text-foreground">
                              {formatCountdown(remainingSeconds)}
                            </span>
                            )
                          </>
                        )}
                      </span>
                    </div>

                    {isApproved && (
                      <div
                        data-testid={`reactivation-approved-status-${challenge.id}`}
                        className="mt-1 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-medium text-emerald-900"
                      >
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                        <span>
                          Aprobada — el terminal completará la rotación de credencial
                          automáticamente.
                        </span>
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        data-testid={`approve-reactivation-btn-${challenge.id}`}
                        disabled={!canManage || isRowBusy || isExpired}
                        onClick={() => handleApprove(challenge)}
                        className="gap-1.5"
                      >
                        {isApprovingThis ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {isApprovingThis ? "Aprobando..." : "Aprobar reactivación"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid={`reject-reactivation-btn-${challenge.id}`}
                        disabled={!canManage || isRowBusy}
                        onClick={() => handleCancel(challenge)}
                        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {isCancellingThis ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {isCancellingThis ? "Rechazando..." : "Rechazar"}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
