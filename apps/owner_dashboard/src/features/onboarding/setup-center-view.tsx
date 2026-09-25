import { useState, useEffect } from "react";
import {
  useOnboardingSession,
  useOnboardingCatalogSummary,
  useActiveActivationAttempt,
  useStartActivationAttempt,
  useGenerateLinkingCode,
  useLinkingCodes,
} from "./use-onboarding";
import { isVersionConflictError } from "./onboarding-api";
import { emitOnboardingTelemetry } from "./onboarding-telemetry-client";
import {
  OnboardingLifecycleState,
  ActivationAttemptStatus,
  LinkingCodeStatus,
  type OnboardingStepKey,
  type GenerateLinkingCodeResponse,
  type LinkingCodeResponse,
} from "./types";
import { isApiError } from "@/lib/api";
import { CatalogAcquisitionModal } from "./catalog-acquisition-modal";
import { useHasPermission } from "@/features/users/use-has-permission";
import { AppPermission } from "@/features/users/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Store,
  Sparkles,
  Landmark,
  ShieldCheck,
  Zap,
  Layers,
  History,
  Info,
  Package,
  Boxes,
  DollarSign,
  Users,
  ExternalLink,
  Smartphone,
} from "lucide-react";

interface SetupCenterViewProps {
  onNavigateToTab?: (tab: "fiscal" | "templates" | "import") => void;
}

/**
 * Maps a documented backend failure of POST /onboarding/activation/attempts to
 * a message a business owner understands. The backend message stays available
 * next to it for support diagnostics.
 */
function describeActivationAttemptFailure(error: unknown): string {
  if (isApiError(error)) {
    const backendMessage = typeof error.message === "string" ? error.message : "";
    if (backendMessage.includes("CANNOT_START_ACTIVATION_NOT_SALE_READY")) {
      return "Tu comercio todavía no está Listo para Venta, así que no se puede iniciar la activación de la terminal. Completá los pasos pendientes del Setup Center e intentá de nuevo.";
    }
    if (backendMessage.includes("ACTIVE_ATTEMPT_EXISTS")) {
      return "Ya existe una activación en curso para tu comercio. Continuá el proceso desde la terminal POS; la activación actual debe completarse antes de iniciar otra.";
    }
    if (backendMessage.includes("FISCAL_REVISION_NOT_AVAILABLE")) {
      return "No se pudo registrar la revisión de tu configuración fiscal. Revisá la Configuración Fiscal DGI en el Setup Center e intentá de nuevo.";
    }
    if (backendMessage.toLowerCase().includes("verification product")) {
      return "No hay un producto de verificación válido para activar la terminal. Necesitás al menos un producto activo con precio de venta mayor a cero.";
    }
    if (error.status === 403) {
      return "Tu usuario no tiene permiso para iniciar la activación de la terminal (requiere onboarding:activation:manage). Pedile al dueño del negocio que te asigne el permiso.";
    }
  }
  return "No se pudo iniciar la activación de la terminal. Intentá de nuevo en unos minutos.";
}

/**
 * Maps a documented backend failure of POST /onboarding/activation/linking-codes
 * to a message a business owner understands. The backend message stays
 * available next to it for support diagnostics.
 */
function describeLinkingCodeFailure(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401) {
      return "Tu sesión expiró. Volvé a iniciar sesión como propietario y generá el código de nuevo.";
    }
    if (error.status === 403) {
      return "Tu usuario no tiene permiso para generar códigos de vinculación (requiere onboarding:activation:manage). Pedile al dueño del negocio que te asigne el permiso.";
    }
  }
  return "No se pudo generar el código de vinculación. Intentá de nuevo en unos minutos.";
}

/** Formats a remaining-seconds count as mm:ss. */
function formatLinkingCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Claimed linking codes that are ready for one-click activation (issue #569
 * single linking flow). A code qualifies when the POS claimed it (status
 * CLAIMED) and the claim bound a deviceId — that binding is what replaces the
 * manual terminal id transcription. Defensive Array.isArray: the endpoint is
 * polled every 5s, and malformed or non-array responses must degrade to "no
 * terminals detected" instead of crashing the setup center.
 */
function selectClaimableLinkingCodes(
  linkingCodes: LinkingCodeResponse[] | undefined,
): LinkingCodeResponse[] {
  if (!Array.isArray(linkingCodes)) return [];
  return linkingCodes.filter(
    (code): code is LinkingCodeResponse & { deviceId: string } =>
      code.status === LinkingCodeStatus.CLAIMED && typeof code.deviceId === "string" && code.deviceId !== "",
  );
}

export function SetupCenterView({ onNavigateToTab }: SetupCenterViewProps) {
  const { session, readiness, progress, isLoading, isError, error, refetch, isFetching } =
    useOnboardingSession();
  const { data: catalogSummary } = useOnboardingCatalogSummary();
  const hasActivationPermission = useHasPermission(AppPermission.ONBOARDING_ACTIVATION_MANAGE);

  const isActivated = progress.currentLifecycle === OnboardingLifecycleState.ACTIVATED;
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const { data: activeAttempt } = useActiveActivationAttempt();
  const startActivationAttempt = useStartActivationAttempt();
  const generateLinkingCode = useGenerateLinkingCode();
  const { data: linkingCodes } = useLinkingCodes();
  const claimableLinkingCodes = selectClaimableLinkingCodes(linkingCodes);

  const [linkingCode, setLinkingCode] = useState<GenerateLinkingCodeResponse | null>(null);
  const [linkingNowMs, setLinkingNowMs] = useState(() => Date.now());

  const linkingExpiresAtMs = linkingCode
    ? new Date(linkingCode.expiresAt).getTime()
    : 0;
  const linkingIsExpired = linkingCode !== null && linkingExpiresAtMs <= linkingNowMs;
  const linkingRemainingSeconds =
    linkingCode && !linkingIsExpired
      ? Math.max(0, Math.ceil((linkingExpiresAtMs - linkingNowMs) / 1000))
      : 0;

  // One-second ticker while a linking code is on screen, so the countdown and
  // the expired state track real time. The code itself never auto-hides: it
  // stays visible (grayed out once expired) until the owner dismisses it.
  useEffect(() => {
    if (!linkingCode) return;
    const intervalId = window.setInterval(() => setLinkingNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [linkingCode]);

  const isAwaitingDeviceChecks =
    activeAttempt?.status === ActivationAttemptStatus.CREATED ||
    activeAttempt?.status === ActivationAttemptStatus.IN_PROGRESS;
  // Finished attempt outcomes the dashboard can observe without fetching any
  // check data: the outcome itself is surfaced honestly, next to the retry
  // path, so the operator never faces a bare form after a finished attempt.
  const hasFailedAttempt = activeAttempt?.status === ActivationAttemptStatus.FAIL;
  const hasPassedWithWarnings =
    activeAttempt?.status === ActivationAttemptStatus.PASS_WITH_WARNING;

  useEffect(() => {
    emitOnboardingTelemetry({
      eventName: "STEP_VIEWED",
      stepId: "SETUP_CENTER",
      properties: {
        lifecycleState: session?.lifecycleState,
      },
    }).catch(() => {
      // Observability only: failures never break UI
    });
  }, [session?.lifecycleState]);

  if (isLoading) {
    return (
      <div
        data-testid="setup-center-loading"
        className="flex flex-col items-center justify-center p-12 space-y-4 text-muted-foreground"
      >
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Cargando estado del Setup Center...</p>
      </div>
    );
  }

  if (isError && isVersionConflictError(error)) {
    return (
      <div className="space-y-6" data-testid="version-conflict-banner">
        <Alert variant="destructive" className="border-amber-500 bg-amber-50/20 text-amber-900">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-bold text-amber-800">
            Conflicto de concurrencia detectado (VERSION_CONFLICT)
          </AlertTitle>
          <AlertDescription className="space-y-3 mt-2 text-sm text-amber-800/90">
            <p>
              La sesión de onboarding fue actualizada concurrentemente desde otra pestaña, dispositivo
              o por soporte asistido.
            </p>
            <div>
              <Button
                variant="outline"
                size="sm"
                data-testid="reconcile-session-button"
                onClick={() => refetch()}
                className="flex items-center gap-2 border-amber-600 text-amber-900 hover:bg-amber-100"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Recargar y reconciliar sesión
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error al consultar sesión de Onboarding</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>{error instanceof Error ? error.message : "Error desconocido"}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!session || !readiness) {
    return null;
  }

  /**
   * Issue #569 single linking flow: the activation attempt is always started
   * with the deviceId bound by a claimed linking code — never with a manually
   * transcribed id. The mutation hook keeps a stable idempotency key per
   * candidate terminal id across retries.
   */
  const handleStartActivationForClaimedDevice = (deviceId: string) => {
    startActivationAttempt.mutate({ candidateTerminalId: deviceId });
  };

  const getLifecycleBadgeVariant = (state: OnboardingLifecycleState) => {
    switch (state) {
      case OnboardingLifecycleState.ACTIVATED:
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case OnboardingLifecycleState.SALE_READY:
        return "bg-blue-100 text-blue-800 border-blue-300";
      case OnboardingLifecycleState.ACTIVATION_IN_PROGRESS:
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      default:
        return "bg-amber-100 text-amber-800 border-amber-300";
    }
  };

  const getLifecycleDisplayLabel = (state: OnboardingLifecycleState): string => {
    switch (state) {
      case OnboardingLifecycleState.PROVISIONED:
        return "Inicial";
      case OnboardingLifecycleState.SETUP_IN_PROGRESS:
        return "En Configuración";
      case OnboardingLifecycleState.SALE_READY:
        return "Listo para Venta";
      case OnboardingLifecycleState.ACTIVATION_IN_PROGRESS:
        return "Activación en Curso";
      case OnboardingLifecycleState.ACTIVATED:
        return "Activado";
      default:
        return state;
    }
  };

  const handleStepAction = (actionKey: OnboardingStepKey) => {
    if (actionKey === "catalog") {
      setCatalogModalOpen(true);
      return;
    }
    if (onNavigateToTab) {
      if (actionKey === "fiscal") onNavigateToTab("fiscal");
    }
  };

  return (
    <div className="space-y-6" data-testid="setup-center-view">
      {/* Header & Lifecycle State */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border rounded-lg p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Store className="h-6 w-6 text-primary" />
              Setup Center & Activación
            </h2>
            <Badge
              variant="outline"
              data-testid="lifecycle-badge"
              className={`font-semibold tracking-wide text-xs px-2.5 py-0.5 border ${getLifecycleBadgeVariant(
                progress.currentLifecycle,
              )}`}
            >
              {getLifecycleDisplayLabel(progress.currentLifecycle)}
            </Badge>
            <Badge variant="secondary" data-testid="optimistic-version-badge" className="font-mono text-xs">
              v{progress.optimisticVersion}
            </Badge>
            {progress.isLegacyBaseline && (
              <Badge
                data-testid="legacy-baseline-badge"
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 text-xs"
              >
                <History className="h-3 w-3" />
                Tenant Histórico (Sin métrica TTFSS)
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Control de preparación operativa de tu negocio para operar en caja registradora POS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold">{progress.percentage}% Completado</div>
            <div className="text-xs text-muted-foreground">
              {progress.completedStepsCount} de {progress.totalStepsCount} pasos listos
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5"
            title="Sincronizar con backend"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Legacy Baseline Notice (ONB1.5D / AC-35, AC-57: no fabricated TTFSS) */}
      {progress.isLegacyBaseline && (
        <div
          data-testid="legacy-baseline-banner"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50/50 text-amber-950 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-amber-700 shrink-0" />
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span>Tenant Histórico — Métrica TTFSS no aplicable</span>
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[11px] font-mono">
                  measurementEligible: false
                </Badge>
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5">
                Comercio provisionado previamente sin ancla temporal de inicio confiable. El setup y activación continúan normalmente sin registrar tiempos TTFSS ficticios para proteger la integridad del benchmark.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Historical Milestone Banner (Milestone write-once / AC-27) */}
      {progress.saleReadyFirstAt && (
        <div
          data-testid="historical-milestone-banner"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50/50 text-blue-950 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span>Hito Histórico: Listo para Venta</span>
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 text-[11px] font-medium">
                  Milestone Registrado
                </Badge>
              </div>
              <p className="text-xs text-blue-800/90 mt-0.5">
                Alcanzado por primera vez el{" "}
                <span className="font-medium">
                  {new Date(progress.saleReadyFirstAt).toLocaleString("es-NI", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Degraded Live State Warning (if historical milestone was met but current readiness is lost) */}
      {progress.saleReadyFirstAt && !progress.isSaleReady && (
        <Alert
          variant="destructive"
          data-testid="degraded-live-state-alert"
          className="border-amber-500 bg-amber-50/60 text-amber-950"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-bold text-amber-900">
            Preparación temporalmente degradada
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800/90 mt-1 space-y-1">
            <p>
              El negocio estuvo listo para venta previamente, pero actualmente existen requisitos pendientes antes de activar la terminal. El registro histórico se conserva intacto.
            </p>
            {progress.blockers.length > 0 && (
              <div className="font-mono text-[11px] bg-amber-100/80 p-2 rounded mt-1">
                Bloqueadores actuales: {progress.blockers.join(", ")}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Next Recommended Action Banner */}
      <Card data-testid="next-recommended-action" className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold text-foreground">
                Próxima Acción Recomendada: {progress.nextRecommendedAction.label}
              </CardTitle>
            </div>
            {progress.isSaleReady && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                ¡Listo para Venta!
              </Badge>
            )}
          </div>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            {progress.nextRecommendedAction.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3">
            {progress.nextRecommendedAction.actionKey === "fiscal" && (
              <Button
                size="sm"
                onClick={() => handleStepAction("fiscal")}
                className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2"
              >
                <Landmark className="h-4 w-4" />
                Ir a Configuración Fiscal
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {progress.nextRecommendedAction.actionKey === "catalog" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setCatalogModalOpen(true)}
                  className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2"
                  data-testid="open-catalog-acquisition-btn"
                >
                  <Sparkles className="h-4 w-4" />
                  Adquirir Catálogo (Plantilla / CSV / Manual)
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {progress.nextRecommendedAction.actionKey === "activation" && (
              <div className="flex flex-col gap-1.5">
                {isAwaitingDeviceChecks ? (
                  <div
                    data-testid="activation-awaiting-device-checks"
                    className="inline-flex flex-col gap-1 px-3 py-2 rounded-md text-sm bg-indigo-50 text-indigo-900 border border-indigo-300"
                  >
                    <span className="font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-indigo-600 shrink-0" />
                      Activación iniciada — esperando a la terminal POS
                    </span>
                    <span className="text-[11px] text-indigo-800/90">
                      La terminal <span className="font-mono font-medium">{activeAttempt?.candidateTerminalId}</span>{" "}
                      todavía no reportó sus verificaciones. El siguiente paso se realiza en la propia terminal:
                      abrí la app POS en esa terminal e iniciá sesión para continuar la activación.
                    </span>
                  </div>
                ) : progress.isSaleReady && hasActivationPermission && !isActivated ? (
                  <>
                    {hasFailedAttempt && (
                      <div
                        data-testid="activation-attempt-failed"
                        role="alert"
                        className="inline-flex flex-col gap-1 px-3 py-2 rounded-md text-sm bg-destructive/10 text-destructive border border-destructive/30"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          El último intento de activación falló.
                        </span>
                        <span className="text-[11px]">
                          La terminal debe ser revisada antes de intentar la activación nuevamente.
                          Cuando esté revisada, podés iniciar un nuevo intento desde acá.
                        </span>
                      </div>
                    )}
                    {hasPassedWithWarnings && (
                      <div
                        data-testid="activation-attempt-passed-with-warning"
                        role="alert"
                        className="inline-flex flex-col gap-1 px-3 py-2 rounded-md text-sm bg-amber-50 text-amber-900 border border-amber-300"
                      >
                        <span className="font-medium flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          El intento de activación pasó con advertencias.
                        </span>
                        <span className="text-[11px] text-amber-800/90">
                          Las advertencias deben ser revisadas antes de continuar con la activación.
                        </span>
                      </div>
                    )}
                    <div
                      data-testid="start-pos-terminal-btn"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-100 text-blue-800 border border-blue-300"
                    >
                      <Store className="h-4 w-4" />
                      Terminal Listo — Activar desde el POS
                    </div>
                  </>
                ) : (
                  <div
                    data-testid="start-pos-terminal-btn"
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium ${
                      progress.isSaleReady && hasActivationPermission
                        ? "bg-blue-100 text-blue-800 border border-blue-300"
                        : "bg-muted text-muted-foreground opacity-60"
                    }`}
                  >
                    <Store className="h-4 w-4" />
                    {isActivated
                      ? "Terminal Activado"
                      : "Terminal Listo — Activar desde el POS"}
                  </div>
                )}
                {progress.isSaleReady && hasActivationPermission && !isActivated && !isAwaitingDeviceChecks && (
                  <span
                    data-testid="activation-hint"
                    className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"
                  >
                    Generá el código de vinculación aquí abajo; cuando la terminal POS lo reclame, la detectamos automáticamente y iniciás la activación con un clic.
                  </span>
                )}
                {progress.isSaleReady && !hasActivationPermission && (
                  <span
                    data-testid="activation-permission-guard-note"
                    className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-0.5"
                    role="alert"
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Requiere permiso de activación (onboarding:activation:manage)
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Issue #556 stage 12c + issue #569 single linking flow — Vincular y
          Activar Terminal: single-use pre-login linking code plus automatic
          detection of the terminal that claimed it, replacing the manual
          terminal-id transcription with a one-click activation. */}
      <Card data-testid="terminal-linking-card" className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Smartphone className="h-5 w-5 text-primary shrink-0" />
              Vincular y Activar Terminal
            </CardTitle>
            {linkingCode && (
              <Badge
                variant="outline"
                data-testid="terminal-linking-status-badge"
                className={`text-[11px] font-mono ${
                  linkingIsExpired
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800"
                }`}
              >
                {linkingIsExpired ? "Expirado" : "Código activo"}
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Generá un código de un solo uso e ingresalo en la terminal POS. Cuando la terminal lo
            reclame, la detectamos automáticamente para activarla con un clic — sin copiar IDs a mano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasActivationPermission && (
            <span
              data-testid="terminal-linking-permission-guard-note"
              role="alert"
              className="text-[11px] text-amber-700 font-medium flex items-center gap-1"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Requiere permiso de activación (onboarding:activation:manage)
            </span>
          )}
          {(!linkingCode || linkingIsExpired) && (
            <Button
              size="sm"
              data-testid="generate-linking-code-btn"
              onClick={() =>
                generateLinkingCode.mutate(undefined, {
                  onSuccess: (data) => {
                    setLinkingCode(data);
                    setLinkingNowMs(Date.now());
                  },
                })
              }
              disabled={generateLinkingCode.isPending || !hasActivationPermission}
              className="flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2"
            >
              <Smartphone className="h-4 w-4" />
              {generateLinkingCode.isPending
                ? "Generando código..."
                : "Generar código de vinculación"}
            </Button>
          )}
          {linkingCode && (
            <div
              data-testid="terminal-linking-code-display"
              className={`p-4 rounded-lg border space-y-2 ${
                linkingIsExpired
                  ? "border-amber-300 bg-amber-50/50"
                  : "border-emerald-300 bg-emerald-50/30"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Código de vinculación
              </p>
              <p
                data-testid="terminal-linking-code-value"
                className={`text-4xl font-mono font-bold tracking-[0.35em] text-foreground ${
                  linkingIsExpired ? "opacity-40 line-through" : ""
                }`}
              >
                {linkingCode.code}
              </p>
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                Este código es de un solo uso y expira en 15 minutos.
              </p>
              {linkingIsExpired ? (
                <p data-testid="terminal-linking-expired" className="text-xs text-amber-800">
                  Este código expiró. Generá uno nuevo para vincular la terminal.
                </p>
              ) : (
                <p
                  data-testid="terminal-linking-expiry"
                  className="text-xs text-muted-foreground flex items-center gap-1.5"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  Expira a las{" "}
                  <span className="font-medium text-foreground">
                    {new Date(linkingCode.expiresAt).toLocaleTimeString("es-NI", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>{" "}
                  — tiempo restante{" "}
                  <span
                    data-testid="terminal-linking-countdown"
                    className="font-mono font-bold text-foreground"
                  >
                    {formatLinkingCountdown(linkingRemainingSeconds)}
                  </span>
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                data-testid="terminal-linking-dismiss-btn"
                onClick={() => setLinkingCode(null)}
              >
                Cerrar
              </Button>
            </div>
          )}
          {/* Issue #569 single linking flow — claimed-code detection. The
              activation attempt is started ONLY from here, with the deviceId
              bound by the claim. Hidden while an attempt awaits device checks;
              a finished (FAIL/PASS_WITH_WARNING) attempt keeps the list
              reachable as the one-click retry path. */}
          {!isAwaitingDeviceChecks && (
            <div className="space-y-2 pt-1" data-testid="terminal-detection-section">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                Terminal detectada
              </div>
              {claimableLinkingCodes.length > 0 ? (
                claimableLinkingCodes.map((code) => (
                  <div
                    key={code.id}
                    data-testid="claimed-terminal-item"
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md border border-emerald-300 bg-emerald-50/30"
                  >
                    <div className="space-y-0.5">
                      <span
                        data-testid="claimed-terminal-device-id"
                        className="text-sm font-mono font-medium text-foreground"
                      >
                        {code.deviceId}
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Reclamó un código de vinculación el{" "}
                        {new Date(code.claimedAt ?? code.createdAt).toLocaleString("es-NI", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      data-testid="start-activation-for-terminal-btn"
                      onClick={() => handleStartActivationForClaimedDevice(code.deviceId)}
                      disabled={startActivationAttempt.isPending || !hasActivationPermission}
                      className="self-start sm:self-auto flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2"
                    >
                      <Store className="h-4 w-4" />
                      {startActivationAttempt.isPending
                        ? "Iniciando activación..."
                        : "Iniciar Activación para esta terminal"}
                    </Button>
                  </div>
                ))
              ) : (
                <p
                  data-testid="terminal-detection-empty"
                  className="text-[11px] text-muted-foreground"
                >
                  Todavía no hay terminales detectadas. Cuando una terminal POS ingrese el código de
                  vinculación, aparecerá acá automáticamente.
                </p>
              )}
              {startActivationAttempt.isError && (
                <div
                  data-testid="activation-attempt-error"
                  role="alert"
                  className="flex flex-col gap-0.5 px-3 py-2 rounded-md text-[11px] bg-destructive/10 border border-destructive/20"
                >
                  <span className="font-medium text-destructive">
                    {describeActivationAttemptFailure(startActivationAttempt.error)}
                  </span>
                  {isApiError(startActivationAttempt.error) && (
                    <span
                      data-testid="activation-attempt-error-backend"
                      className="font-mono text-[10px] text-muted-foreground break-all"
                    >
                      {startActivationAttempt.error.message}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {generateLinkingCode.isError && (
            <div
              data-testid="terminal-linking-error"
              role="alert"
              className="flex flex-col gap-0.5 px-3 py-2 rounded-md text-[11px] bg-destructive/10 border border-destructive/20"
            >
              <span className="font-medium text-destructive">
                {describeLinkingCodeFailure(generateLinkingCode.error)}
              </span>
              {isApiError(generateLinkingCode.error) && (
                <span
                  data-testid="terminal-linking-error-backend"
                  className="font-mono text-[10px] text-muted-foreground break-all"
                >
                  {generateLinkingCode.error.message}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Readiness Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {progress.steps.map((step) => {
          const isDone = step.status === "COMPLETED";
          const inProgress = step.status === "IN_PROGRESS";

          return (
            <Card
              key={step.key}
              data-testid={`step-${step.key}`}
              className={`border transition-all ${
                isDone
                  ? "border-emerald-200 bg-emerald-50/20"
                  : inProgress
                  ? "border-primary/40 bg-card shadow-sm"
                  : "border-border/60 bg-muted/20 opacity-80"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : inProgress ? (
                      <Clock className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                    {step.title}
                  </CardTitle>
                  <Badge
                    variant={isDone ? "outline" : inProgress ? "default" : "secondary"}
                    className={
                      isDone
                        ? "border-emerald-400 text-emerald-700 bg-emerald-50 text-xs font-semibold"
                        : inProgress
                        ? "bg-primary text-primary-foreground text-xs"
                        : "text-muted-foreground text-xs"
                    }
                  >
                    {step.actionLabel}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  {step.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {step.blockers.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {step.blockers.map((b) => (
                      <div
                        key={b}
                        className="text-xs font-mono text-amber-700 bg-amber-50 p-1.5 rounded flex items-center gap-1.5"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                  {/* Step CTA */}
                  <div className="flex items-center justify-between">
                    {step.key === "catalog" && (
                      <span className="text-[11px] text-muted-foreground">
                        {catalogSummary?.sellableProductCount
                          ? `${catalogSummary.sellableProductCount} producto(s) vendible(s)`
                          : "Sin productos aún"}
                      </span>
                    )}
                    <div className="flex justify-end gap-2 ml-auto">
                      {step.key === "fiscal" && !isDone && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStepAction("fiscal")}
                          className="text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2"
                          data-testid="configure-fiscal-btn"
                        >
                          <Landmark className="h-3.5 w-3.5" />
                          Configurar Fiscal
                        </Button>
                      )}
                      {step.key === "catalog" && (
                        <Button
                          size="sm"
                          variant={isDone ? "ghost" : "outline"}
                          onClick={() => setCatalogModalOpen(true)}
                          className="text-xs flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2"
                          data-testid="catalog-step-action-btn"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {isDone ? "+ Agregar Más" : "Adquirir Catálogo"}
                        </Button>
                      )}
                      {step.key === "activation" && isDone && (
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                          Terminal Operativo
                        </Badge>
                      )}
                    </div>
                  </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sale Ready Review & Operational Explainability (ONB1.5C / AC-27, AC-28) */}
      <Card
        className={`border transition-all shadow-sm ${
          progress.isSaleReady
            ? "border-emerald-500/40 bg-emerald-50/20"
            : "border-primary/20 bg-card"
        }`}
        data-testid="sale-ready-review-card"
      >
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle
              className={`text-sm font-semibold flex items-center gap-2 ${
                progress.isSaleReady ? "text-emerald-900" : "text-foreground"
              }`}
            >
              {progress.isSaleReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              )}
              Evaluación de Preparación para Venta
            </CardTitle>
            <Badge
              className={
                progress.isSaleReady
                  ? "bg-emerald-600 text-white text-[10px]"
                  : "bg-amber-600 text-white text-[10px]"
              }
            >
              {progress.isSaleReady ? "Criterios Mínimos Cumplidos" : "Preparación Incompleta"}
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            {progress.isSaleReady
              ? "Tu comercio cumple todos los requisitos normativos para abrir caja y emitir facturas en el terminal POS."
              : "Revisión técnica de requisitos indispensables para habilitar el terminal POS vs configuraciones operativas postergables."}
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2 space-y-4 text-xs">
          {progress.isSaleReady ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Identidad de Propietario (usuario administrador activo)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Configuración Fiscal DGI Mínima (RUC y régimen tributario)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Catálogo Vendible Activo con Precio</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2 text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>Inventario inicial (Stock y Costos): Opcional no bloqueante</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mandatory Blockers */}
              <div data-testid="review-blockers-section" className="space-y-1.5">
                <div className="font-semibold text-destructive flex items-center gap-1.5 text-xs">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  <span>Bloqueadores Obligatorios (Impiden Venta):</span>
                </div>
                <div className="space-y-1">
                  {progress.blockers.length > 0 ? (
                    progress.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="text-[11px] font-mono p-2 rounded bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                        <span>{blocker}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-muted-foreground italic">
                      Sin bloqueadores identificados
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings (if any) */}
              {progress.warnings.length > 0 && (
                <div data-testid="review-warnings-section" className="space-y-1.5">
                  <div className="font-semibold text-amber-800 flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Advertencias Normativas (No Bloqueantes):</span>
                  </div>
                  <div className="space-y-1">
                    {progress.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="text-[11px] p-2 rounded bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-2"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional BOH Postponables (AC-07, AC-08, AC-28) */}
              <div
                data-testid="review-optional-boh-section"
                className="space-y-1.5 pt-2 border-t"
              >
                <div className="font-semibold text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  <span>Enriquecimiento BOH (Opcional / Postergable — No Bloquea Venta):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div className="p-2 rounded bg-muted/30 border flex items-start gap-2">
                    <Package className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-foreground">Stock inicial & Kardex:</span>{" "}
                      Puede comenzar a vender con stock en 0; los costos se calcularán cuando ingrese compras.
                    </div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 border flex items-start gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-foreground">Recetas & Escandallos:</span>{" "}
                      La deducción de insumos puede configurarse con posterioridad sin impedir la emisión de facturas.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ONB1.9G — Activation Sales & First Customer Sale Observation */}
      {session.lifecycleState === OnboardingLifecycleState.ACTIVATED && (
        <Card data-testid="onboarding-activation-sales-card" className="border-border/80 shadow-sm bg-gradient-to-r from-emerald-50/20 via-background to-card">
          <CardHeader className="py-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  Métricas de Activación & Primera Venta Comercial (ONB1.9G)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Observabilidad desacoplada entre el hito técnico de activación (TTFSS) y la primera venta comercial a cliente final.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[11px] font-mono shrink-0">
                ONB1.9G
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-3.5 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                data-testid="onboarding-ttfss-claim"
                className="p-3 rounded-md border bg-card/60 flex flex-col justify-between"
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  TTFSS Consolidado (Venta Técnica M6)
                </span>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {session.firstSuccessfulSaleAt ? (
                    new Date(session.firstSuccessfulSaleAt).toLocaleString("es-NI")
                  ) : (
                    <span className="text-muted-foreground italic">No registrado</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/80 mt-1">
                  Inmutable: Base histórica de Time to First Successful Sale.
                </span>
              </div>
              <div
                data-testid="onboarding-first-customer-sale"
                className="p-3 rounded-md border bg-card/60 flex flex-col justify-between"
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  Primer Ticket Comercial Cliente Final
                </span>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {session.firstCustomerSaleAt ? (
                    new Date(session.firstCustomerSaleAt).toLocaleString("es-NI")
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-normal">
                      Pendiente de primera venta comercial
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/80 mt-1">
                  Observado de forma desacoplada; no altera el TTFSS histórico.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ONB1.9A–D Progressive BOH Checklist & Direct Backoffice Links */}
      <Card data-testid="boh-progressive-checklist" className="border-border/80 shadow-sm">
        <CardHeader className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                <Boxes className="h-5 w-5 text-primary shrink-0" />
                Checklist Progresivo BOH (Backoffice Readiness)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Carga posterior de almacenes, costeo y recetas. Opcional para habilitar ventas en el punto de venta.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-mono">
                ONB1.9A–D
              </Badge>
              {session.lifecycleState === OnboardingLifecycleState.ACTIVATED && (
                <Badge variant="secondary" className="text-[11px] bg-emerald-50 text-emerald-800 border-emerald-300">
                  Activación Intacta
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* ONB1.9A — Inventory Readiness */}
            <div
              data-testid="boh-inventory-card"
              className="p-3.5 rounded-lg border bg-card/60 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                    <Package className="h-4 w-4 text-primary shrink-0" />
                    Inventario & Almacenes
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      readiness.inventoryReady
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-amber-50 text-amber-800 border-amber-300"
                    }`}
                  >
                    {readiness.inventoryReady ? "LISTO" : "PENDIENTE"}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div>
                    Alcance: <span className="font-medium text-foreground">{readiness.inventory?.scope ?? "BÁSICO"}</span>
                  </div>
                  <div>
                    Almacenes: <span className="font-medium text-foreground">{readiness.inventory?.warehouseCount ?? 0}</span> | Ítems rastreados: <span className="font-medium text-foreground">{readiness.inventory?.trackedProductCount ?? 0}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/90 font-medium">
                    Permite operar con inventario en cero temporalmente
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="boh-link-inventory"
                onClick={() => window.open("/inventory", "_blank")}
                className="w-full text-xs h-8 flex items-center justify-center gap-1.5"
              >
                <span>Ir a Inventario BOH</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>

            {/* ONB1.9B — Costing Readiness */}
            <div
              data-testid="boh-costing-card"
              className="p-3.5 rounded-lg border bg-card/60 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                    <DollarSign className="h-4 w-4 text-primary shrink-0" />
                    Costeo & Valorización
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      readiness.costingReady
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-amber-50 text-amber-800 border-amber-300"
                    }`}
                  >
                    {readiness.costingReady ? "Costeo Completo" : "Costeo Inicial Pendiente"}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div>
                    Estado: <span className="font-medium text-foreground">{readiness.costing?.knownCostCount ?? 0} conocido(s)</span>, <span className="font-medium text-foreground">{readiness.costing?.pendingCostCount ?? 0} pendiente(s)</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/90 font-medium">
                    Costeo pendiente no bloquea ventas
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="boh-link-costing"
                onClick={() => window.open("/inventory/kardex", "_blank")}
                className="w-full text-xs h-8 flex items-center justify-center gap-1.5"
              >
                <span>Ir a Costeo & Kardex</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>

            {/* ONB1.9C — Operations Readiness */}
            <div
              data-testid="boh-operations-card"
              className="p-3.5 rounded-lg border bg-card/60 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                    <Users className="h-4 w-4 text-primary shrink-0" />
                    Operaciones & Enriquecimiento
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      readiness.operationsReady
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-slate-100 text-slate-800 border-slate-300"
                    }`}
                  >
                    {readiness.operationsReady ? "ENRIQUECIDO" : "BÁSICO"}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div>
                    Staff adicional: {readiness.operations?.additionalStaffCount ?? 0} | Recetas: {readiness.operations?.publishedRecipeCount ?? 0}
                  </div>
                  <div>
                    Proveedores: {readiness.operations?.supplierCount ?? 0} | Categorías: {readiness.operations?.categoryCount ?? 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground/90 font-medium">
                    Registro opcional; no altera el estado de activación
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="boh-link-operations"
                onClick={() => window.open("/users", "_blank")}
                className="w-full text-xs h-8 flex items-center justify-center gap-1.5"
              >
                <span>Ir a Gestión de Usuarios</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visible Scope Guardrails (ONB1.5E / AC-42, AC-43, AC-44) */}
      <Card data-testid="onboarding-scope-guardrails" className="border-border/70 bg-muted/20">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              Límites de Alcance Normativo (PRD Guardrails)
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] font-mono">
              V1 Scope
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Ruta corta y directa hacia venta en POS (V1) sin burocracia de configuración.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2 space-y-2 text-xs text-muted-foreground">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-2 rounded bg-background/80 border flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Sin dependencias de almacenamiento en la nube externo</span>
            </div>
            <div className="p-2 rounded bg-background/80 border flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Sin mapeadores complejos de columnas (formato CSV canónico directo)</span>
            </div>
            <div className="p-2 rounded bg-background/80 border flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Sin obligatoriedad de insumos, recetas ni 4 CSVs complejos para operar</span>
            </div>
            <div className="p-2 rounded bg-background/80 border flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Enriquecimiento de inventario y Kardex postergable a operación regular BOH</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unified Catalog Acquisition Modal */}
      <CatalogAcquisitionModal
        open={catalogModalOpen}
        onOpenChange={setCatalogModalOpen}
        onNavigateToTab={onNavigateToTab}
      />
    </div>
  );
}
