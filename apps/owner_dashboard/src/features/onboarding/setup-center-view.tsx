import { useState } from "react";
import {
  useOnboardingSession,
  useOnboardingCatalogSummary,
} from "./use-onboarding";
import { isVersionConflictError } from "./onboarding-api";
import { OnboardingLifecycleState, type OnboardingStepKey } from "./types";
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
} from "lucide-react";

interface SetupCenterViewProps {
  onNavigateToTab?: (tab: "fiscal" | "templates" | "import") => void;
}

export function SetupCenterView({ onNavigateToTab }: SetupCenterViewProps) {
  const { session, readiness, progress, isLoading, isError, error, refetch, isFetching } =
    useOnboardingSession();
  const { data: catalogSummary } = useOnboardingCatalogSummary();
  const hasActivationPermission = useHasPermission(AppPermission.ONBOARDING_ACTIVATION_MANAGE);

  const [catalogModalOpen, setCatalogModalOpen] = useState(false);

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
              className={`font-semibold uppercase tracking-wider text-xs px-2.5 py-0.5 border ${getLifecycleBadgeVariant(
                progress.currentLifecycle,
              )}`}
            >
              {progress.currentLifecycle}
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
                <span>Hito Histórico: Listo para Venta (SALE_READY)</span>
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
              El negocio alcanzó SALE_READY previamente, pero actualmente existen bloqueadores activos antes de activar el terminal. El hito histórico se conserva intacto.
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
                ¡Listo para Venta (SALE_READY)!
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
                <Button
                  size="sm"
                  variant="default"
                  data-testid="start-pos-terminal-btn"
                  disabled={!progress.isSaleReady || !hasActivationPermission}
                  className={`flex items-center gap-2 font-medium transition-all focus-visible:ring-2 focus-visible:ring-[#013a57] focus-visible:ring-offset-2 ${
                    progress.isSaleReady && hasActivationPermission
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                  }`}
                >
                  <Store className="h-4 w-4" />
                  Iniciar Terminal POS Físico
                  <ArrowRight className="h-4 w-4" />
                </Button>
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

      {/* Readiness Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {progress.steps.map((step) => {
          const isDone = step.status === "COMPLETED";
          const _isBlocked = step.status === "BLOCKED";
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
              Evaluación de Preparación para Venta (SALE_READY)
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
                <span>Identidad de Propietario (OWNER único suficiente, AC-26)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Configuración Fiscal DGI Mínima (AC-04)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Catálogo Vendible Activo con Precio (AC-06)</span>
              </div>
              <div className="p-2 rounded bg-background border flex items-center gap-2 text-muted-foreground">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>BOH (Stock/Recetas/Costos): Opcional no bloqueante (AC-07, AC-08)</span>
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
                      Puede operar con stock en 0; costos se reportan como COST_PENDING / UNKNOWN (AC-07, AC-08).
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
                Enriquecimiento posterior de almacenes, costeo y operaciones. Opcional y no bloqueante para ventas POS (AC-07, AC-08, AC-40, AC-41).
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
                    Stock en 0 no bloquea venta (AC-07, AC-40)
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
                    {readiness.costingReady ? "COSTING_READY" : "COST_PENDING"}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <div>
                    Estado: <span className="font-medium text-foreground">{readiness.costing?.knownCostCount ?? 0} conocido(s)</span>, <span className="font-medium text-foreground">{readiness.costing?.pendingCostCount ?? 0} pendiente(s)</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/90 font-medium">
                    COST_PENDING no bloquea venta
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
                    Enriquecimiento opcional; no revoca ACTIVATED
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
